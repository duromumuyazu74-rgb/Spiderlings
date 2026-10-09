"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const ts = require("typescript");
const policy = require("./test-impact.json");
const { selectScenarios } = require("./compatibility/scenarios.js");
const modRoot = path.resolve(__dirname, "..");
const normalize = (file) => file.replaceAll("\\", "/").replace(/^KinkyDungeon-Spiderlings\//, "");
const sorted = (set) => [...set].sort();

function parse(text) {
    const tree = ts.createSourceFile("change.js", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (tree.parseDiagnostics.length) return undefined;
    return tree;
}

function fingerprint(node, masks = new Map()) {
    if (masks.has(node)) return ["owned-symbol", masks.get(node)];
    // Syntax children include const/let and unary operator tokens that are not
    // exposed as semantic children by forEachChild.
    const children = node.getChildren().map((child) => fingerprint(child, masks));
    return children.length ? [node.kind, children] : [node.kind, node.getText()];
}

function symbolChanges(before, after) {
    if (typeof before !== "string" || typeof after !== "string") return { complete: false, names: [] };
    const old = parse(before),
        current = parse(after);
    if (!old || !current) return { complete: false, names: [] };
    if (JSON.stringify(fingerprint(old)) === JSON.stringify(fingerprint(current)))
        return { complete: true, names: [], unchanged: true };
    const inventory = (tree) => {
        const symbols = new Map(),
            masks = new Map();
        let duplicate = false;
        const visit = (node) => {
            if (
                (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
                node.name &&
                ts.isIdentifier(node.name)
            ) {
                const name = node.name.text;
                duplicate ||= symbols.has(name);
                symbols.set(name, JSON.stringify(fingerprint(node)));
                masks.set(node, name);
                return;
            }
            ts.forEachChild(node, visit);
        };
        visit(tree);
        return { symbols, shape: JSON.stringify(fingerprint(tree, masks)), duplicate };
    };
    const a = inventory(old),
        b = inventory(current);
    const names = [...new Set([...a.symbols.keys(), ...b.symbols.keys()])].filter(
        (name) => a.symbols.get(name) !== b.symbols.get(name),
    );
    return { complete: !a.duplicate && !b.duplicate && a.shape === b.shape, names };
}

function fileProfiles(file, mapping = policy) {
    if (mapping.files[file]) return mapping.files[file];
    const prefix = Object.keys(mapping.prefixes)
        .filter((p) => file.startsWith(p))
        .sort((a, b) => b.length - a.length)[0];
    if (prefix) return mapping.prefixes[prefix];
    return mapping.patterns.find((rule) => new RegExp(rule.pattern).test(file))?.profiles || [];
}

function testConsumers(file, suites, root) {
    const target = path.resolve(root, file),
        cache = new Map();
    const reaches = (current, seen) => {
        if (current === target) return true;
        if (seen.has(current) || !fs.existsSync(current)) return false;
        seen.add(current);
        if (!cache.has(current)) {
            const tree = parse(fs.readFileSync(current, "utf8")),
                references = [];
            const visit = (node) => {
                if (ts.isStringLiteralLike(node) && /\.(?:js|json|mjs|ps1|py)$/.test(node.text)) {
                    const resolved = path.resolve(path.dirname(current), node.text);
                    if (resolved.startsWith(path.resolve(root) + path.sep)) references.push(resolved);
                }
                ts.forEachChild(node, visit);
            };
            if (tree) visit(tree);
            cache.set(current, references);
        }
        return cache.get(current).some((next) => reaches(next, seen));
    };
    return [...suites.public, ...suites.local].filter((name) =>
        reaches(path.join(root, "tools/tests", name), new Set()),
    );
}

function selectAffected(inputs, suites, options = {}) {
    const mapping = options.policy || policy,
        root = options.root || modRoot;
    const tests = new Set(),
        localTests = new Set(),
        scenarios = new Set(),
        areas = new Set();
    const reasons = [],
        unknown = [],
        publicSet = new Set(suites.public),
        localSet = new Set(suites.local);
    let nativeScope = "none";
    let policyTests = false;
    const addTests = (names) => {
        for (const name of names) {
            if (publicSet.has(name)) tests.add(name);
            else if (localSet.has(name)) localTests.add(name);
            else throw new Error(`Unregistered mapped test: ${name}`);
        }
    };
    const addProfile = (id, native = true) => {
        const group = mapping.profiles[id];
        if (!group) throw new Error(`Unknown test profile: ${id}`);
        areas.add(id);
        policyTests ||= !!group.policyTests;
        addTests(group.tests === "*" ? suites.public : group.tests);
        addTests(group.localTests === "*" ? suites.local : group.localTests);
        if (native && group.scenarios === "*") nativeScope = "full";
        else if (native) group.scenarios.forEach((name) => scenarios.add(name));
    };
    const catalog = selectScenarios().checks;
    for (const input of inputs) {
        const change = typeof input === "string" ? { path: input } : input;
        const file = normalize(change.path),
            ownTest = path.posix.basename(file);
        if (/\.md$/.test(file) || file.startsWith(".agents/")) {
            reasons.push({ file, kind: "documentation", profiles: [] });
            continue;
        }
        if (file.startsWith("tools/tests/") && (publicSet.has(ownTest) || localSet.has(ownTest))) {
            addTests([ownTest]);
            reasons.push({ file, kind: "changed-test", profiles: [] });
            continue;
        }
        if (file.startsWith("tools/compatibility/browser/")) {
            const matches = catalog.filter((check) => check.file === ownTest || check.helpers.includes(ownTest));
            if (matches.length) {
                addProfile("compatibility-tools", false);
                matches.forEach((check) => scenarios.add(check.name));
                reasons.push({
                    file,
                    kind: "scene-consumers",
                    profiles: ["compatibility-tools"],
                    scenarios: matches.map((c) => c.name),
                });
                continue;
            }
            unknown.push(change.path);
            reasons.push({ file, kind: "unregistered-scene", profiles: [] });
            continue;
        }
        let ids = fileProfiles(file, mapping),
            kind = "file",
            changed;
        const samePathEdit =
            (!change.status || change.status === "M") &&
            (!change.previousPath || normalize(change.previousPath) === file);
        if (mapping.symbols[file] && samePathEdit) {
            changed = symbolChanges(change.before, change.after);
            if (changed.unchanged) {
                reasons.push({ file, kind: "nonsemantic", profiles: [] });
                continue;
            }
            const symbolRules = mapping.symbols[file];
            if (
                changed.complete &&
                changed.names.length &&
                changed.names.every((name) => Object.values(symbolRules).some((names) => names.includes(name)))
            ) {
                ids = Object.keys(symbolRules).filter((id) =>
                    changed.names.some((name) => symbolRules[id].includes(name)),
                );
                kind = "symbols";
            }
        }
        if (ids.length) {
            if (change.previousPath && normalize(change.previousPath) !== file)
                ids = [...new Set([...ids, ...fileProfiles(normalize(change.previousPath), mapping)])];
            ids.forEach((id) => addProfile(id));
            if (/^Spiderlings.*\.js$/.test(file)) {
                addTests(mapping.runtimeCommon.tests);
                addTests(mapping.runtimeCommon.localTests);
            }
            reasons.push({ file, kind, profiles: ids, symbols: changed?.names });
            continue;
        }
        if (file.startsWith("tools/")) {
            const consumers = [
                ...new Set([
                    ...testConsumers(file, suites, root),
                    ...(change.previousPath && normalize(change.previousPath) !== file
                        ? testConsumers(normalize(change.previousPath), suites, root)
                        : []),
                ]),
            ];
            if (consumers.length) {
                addTests(consumers);
                reasons.push({ file, kind: "test-consumers", profiles: [], tests: consumers });
                continue;
            }
        }
        unknown.push(change.path);
        reasons.push({ file, kind: "needs-mapping", profiles: [] });
    }
    if (nativeScope !== "full" && scenarios.size) nativeScope = "focused";
    // Expand consumers of changed scene state before adding prerequisites.
    let expandedConsumers;
    do {
        expandedConsumers = false;
        for (const check of catalog) {
            if (!scenarios.has(check.name) && check.continues.some((name) => scenarios.has(name))) {
                scenarios.add(check.name);
                expandedConsumers = true;
            }
        }
    } while (expandedConsumers);
    const expanded =
        nativeScope === "full"
            ? catalog.map((c) => c.name)
            : scenarios.size
              ? selectScenarios([...scenarios]).executed
              : [];
    return {
        status: unknown.length ? "needs-mapping" : "ready",
        tests: sorted(tests),
        localTests: sorted(localTests),
        scenarios: expanded,
        areas: sorted(areas),
        unknown,
        nativeScope,
        policyTests,
        reasons,
    };
}

function validateMappings(suites, manifest, mapping = policy, root = modRoot) {
    const errors = [],
        publicSet = new Set(suites.public),
        localSet = new Set(suites.local);
    const names = new Set(selectScenarios().executed);
    for (const [id, group] of Object.entries(mapping.profiles)) {
        for (const [field, allowed] of [
            ["tests", publicSet],
            ["localTests", localSet],
            ["scenarios", names],
        ])
            if (group[field] !== "*")
                for (const name of group[field])
                    if (!allowed.has(name)) errors.push(`${id}: unknown ${field} reference ${name}`);
        if (!group.reason) errors.push(`${id}: explain the affected consumers`);
    }
    for (const file of manifest.fileorder.filter((f) => f.endsWith(".js")))
        if (!mapping.files[file]?.length) errors.push(`${file}: runtime module needs an explicit test mapping`);
    const entries = [
        ...Object.values(mapping.files),
        ...Object.values(mapping.prefixes),
        ...mapping.patterns.map((r) => r.profiles),
    ];
    for (const ids of entries)
        for (const id of ids) if (!mapping.profiles[id]) errors.push(`Unknown test profile: ${id}`);
    for (const [file, groups] of Object.entries(mapping.symbols)) {
        const text = fs.readFileSync(path.join(root, file), "utf8"),
            tree = parse(text),
            declared = new Set();
        const visit = (node) => {
            if (
                (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) &&
                node.name &&
                ts.isIdentifier(node.name)
            )
                declared.add(node.name.text);
            ts.forEachChild(node, visit);
        };
        if (tree) visit(tree);
        for (const [id, symbols] of Object.entries(groups)) {
            if (!mapping.files[file]?.includes(id))
                errors.push(`${file}: symbol profile ${id} must be in file coverage`);
            for (const name of symbols) if (!declared.has(name)) errors.push(`${file}: stale mapped symbol ${name}`);
        }
    }
    for (const [field, allowed] of [
        ["tests", publicSet],
        ["localTests", localSet],
    ])
        for (const name of mapping.runtimeCommon[field])
            if (!allowed.has(name)) errors.push(`runtimeCommon: unknown ${field} ${name}`);
    return [...new Set(errors)];
}

function collectChanges(root, base = "HEAD") {
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    git("rev-parse", "--verify", `${base}^{commit}`);
    const parts = git("diff", "--name-status", "-z", "-M", base, "--").split("\0").filter(Boolean),
        changes = [];
    for (let i = 0; i < parts.length;) {
        const status = parts[i++],
            previousPath = parts[i++],
            file = status.startsWith("R") || status.startsWith("C") ? parts[i++] : previousPath;
        changes.push({ path: file, previousPath, status });
    }
    for (const file of git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean))
        changes.push({ path: file, status: "A" });
    for (const change of changes) {
        if (!policy.symbols[normalize(change.path)]) continue;
        if (change.status !== "A") change.before = git("show", `${base}:${change.previousPath}`);
        if (change.status !== "D") change.after = fs.readFileSync(path.join(root, change.path), "utf8");
    }
    return changes;
}

module.exports = { selectAffected, symbolChanges, validateMappings, collectChanges };
