"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const contracts = require("./module-contracts.json");
const { selectScenarios } = require("./compatibility/scenarios.js");

function auditModule(text, filename, policy = contracts) {
    const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (source.parseDiagnostics.length) throw new Error(`${filename}: module audit requires valid JavaScript`);
    const bindings = new Map(),
        errors = [];
    const scope = (node) => {
        while (
            node.parent &&
            !ts.isSourceFile(node) &&
            !ts.isFunctionLike(node) &&
            !ts.isBlock(node) &&
            !ts.isForOfStatement(node)
        )
            node = node.parent;
        return node;
    };
    const bind = (node, name, value) => {
        const owner = scope(node.parent);
        if (!bindings.has(owner)) bindings.set(owner, new Map());
        bindings.get(owner).set(name, value);
    };
    const collect = (node) => {
        ts.forEachChild(node, collect);
        if (ts.isVariableDeclaration(node)) {
            if (ts.isIdentifier(node.name)) bind(node, node.name.text, { expression: node.initializer });
            else if (ts.isObjectBindingPattern(node.name))
                for (const item of node.name.elements)
                    if (ts.isIdentifier(item.name))
                        bind(node, item.name.text, {
                            expression: node.initializer,
                            suffix: [item.propertyName?.text || item.name.text],
                        });
        }
        if (ts.isParameter(node) && ts.isIdentifier(node.name)) bind(node, node.name.text, {});
        if (
            ts.isForOfStatement(node) &&
            ts.isCallExpression(node.expression) &&
            ["Object.entries", "Object.values"].includes(node.expression.expression.getText(source)) &&
            ts.isVariableDeclarationList(node.initializer)
        ) {
            const declaration = node.initializer.declarations[0],
                names = declaration.name;
            const value =
                node.expression.expression.getText(source) === "Object.values"
                    ? names
                    : ts.isArrayBindingPattern(names) && names.elements[1]?.name;
            if (value && ts.isIdentifier(value))
                bind(declaration, value.text, { expression: node.expression.arguments[0], suffix: ["*"] });
        }
    };
    collect(source);
    const lookup = (node, name) => {
        for (let cursor = node.parent; cursor; cursor = cursor.parent)
            if (bindings.get(cursor)?.has(name)) return bindings.get(cursor).get(name);
        return undefined;
    };
    const chain = (node, seen = new Set()) => {
        if (!node) return [];
        if (ts.isArrayLiteralExpression(node)) return ["<local-array>"];
        if (ts.isParenthesizedExpression(node)) return chain(node.expression, seen);
        if (ts.isIdentifier(node)) {
            const binding = lookup(node, node.text);
            if (binding?.expression && !seen.has(binding)) {
                const resolved = chain(binding.expression, new Set([...seen, binding]));
                if (resolved.length) return [...resolved, ...(binding.suffix || [])];
            }
            return [node.text];
        }
        if (ts.isPropertyAccessExpression(node)) return [...chain(node.expression, seen), node.name.text];
        if (ts.isElementAccessExpression(node)) {
            const arg = node.argumentExpression;
            return [...chain(node.expression, seen), arg && ts.isStringLiteralLike(arg) ? arg.text : "*"];
        }
        return [];
    };
    const matches = (field, patterns) =>
        patterns.some(
            (pattern) =>
                pattern === "*" ||
                (pattern.endsWith("*") ? field?.startsWith(pattern.slice(0, -1)) : field === pattern),
        );
    const recordField = (parts, rule) => {
        const collection = parts.findIndex((part, index) => index > 0 && rule.collections.includes(part));
        if (collection >= 0) return parts[collection + 2] || "*";
        if (rule.records.includes(parts[0])) return parts[1] || "*";
        return undefined;
    };
    const report = (node, id, owners, parts) => {
        if (owners.includes(path.basename(filename))) return;
        const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
        const error = `${filename}:${line}: ${id} writes ${parts.join(".")}; owner: ${owners.join(", ")}`;
        if (!errors.includes(error)) errors.push(error);
    };
    const inspect = (node, parts, wholeRecord = false) => {
        if (!parts.length) return;
        if (["globalThis", "window"].includes(parts[0])) parts = parts.slice(1);
        for (const rule of policy.nativeOwners)
            if (parts[0] === rule.root) report(node, "native-adapter", rule.owners, parts);
        for (const rule of policy.stateOwners) {
            const field = recordField(parts, rule);
            if (field !== undefined && (matches(field, rule.fields) || (wholeRecord && field === "*")))
                report(node, rule.id, rule.owners, parts);
        }
    };
    const mutations = new Set([
        "push",
        "pop",
        "shift",
        "unshift",
        "splice",
        "sort",
        "reverse",
        "fill",
        "copyWithin",
        "set",
        "delete",
        "clear",
    ]);
    const visit = (node) => {
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
            node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        )
            inspect(node, ts.isIdentifier(node.left) && lookup(node.left, node.left.text) ? [] : chain(node.left));
        else if (ts.isDeleteExpression(node)) inspect(node, chain(node.expression));
        else if (
            (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
            [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)
        )
            inspect(node, chain(node.operand));
        else if (ts.isCallExpression(node)) {
            const callee = chain(node.expression);
            if (mutations.has(callee.at(-1))) inspect(node, callee.slice(0, -1), true);
            if (callee.join(".") === "Object.assign") {
                const target = chain(node.arguments[0]);
                for (const value of node.arguments.slice(1)) {
                    if (ts.isObjectLiteralExpression(value))
                        for (const property of value.properties)
                            inspect(node, [...target, property.name?.text || "*"], true);
                    else inspect(node, target, true);
                }
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    return errors;
}

function auditRepository(root = path.resolve(__dirname, "..")) {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "mod.json"), "utf8").replace(/^\uFEFF/, ""));
    return manifest.fileorder
        .filter((file) => file.endsWith(".js"))
        .flatMap((file) => auditModule(fs.readFileSync(path.join(root, file), "utf8"), file));
}

function selectAffected(files, suites, policy = contracts) {
    const tests = new Set(),
        scenarios = new Set(),
        areas = new Set(),
        unknown = [];
    const catalog = selectScenarios().checks;
    let nativeScope = "focused";
    for (const raw of files) {
        const file = raw.replaceAll("\\", "/").replace(/^KinkyDungeon-Spiderlings\//, "");
        if (/\.md$/.test(file) || file.startsWith(".agents/")) continue;
        if (file.startsWith("tools/tests/") && suites.public.includes(path.posix.basename(file))) {
            tests.add(path.posix.basename(file));
            continue;
        }
        const matched = Object.entries(policy.areas).filter(([, area]) =>
            area.files.some((entry) => (entry.endsWith("/") ? file.startsWith(entry) : file === entry)),
        );
        if (!matched.length) unknown.push(raw);
        for (const [name, area] of matched) {
            areas.add(name);
            area.tests.forEach((test) => tests.add(test));
            area.scenarios.forEach((scene) => scenarios.add(scene));
        }
        if (file.startsWith("tools/compatibility/browser/") && file.endsWith(".js")) {
            const script = path.posix.basename(file);
            catalog
                .filter((check) => check.file === script || check.helpers?.includes(script))
                .forEach((check) => scenarios.add(check.name));
        } else if (matched.some(([name]) => name === "scenarios")) nativeScope = "full";
    }
    if (unknown.length) {
        suites.public.forEach((test) => tests.add(test));
        nativeScope = "full";
    }
    if (tests.size) tests.add("spiderlings-module-contracts.test.js");
    return {
        tests: [...tests].sort(),
        scenarios: [...scenarios].sort(),
        areas: [...areas].sort(),
        unknown,
        nativeScope,
    };
}

module.exports = { auditModule, auditRepository, selectAffected };
if (require.main === module) {
    try {
        const errors = auditRepository();
        if (errors.length) throw new Error(errors.join("\n"));
        console.log("Module ownership checks passed.");
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
