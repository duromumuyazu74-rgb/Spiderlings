"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const ts = require("typescript");
const { placeholderMultiset } = require("./translation-contract.js");

function lines(text) {
    return [...text.matchAll(/([^\r\n]*)(\r\n|\n|\r|$)/g)]
        .filter((match) => match[0])
        .map((match) => ({ text: match[1], ending: match[2] }));
}

function inspectLineEndings(before, after) {
    const old = lines(before),
        current = lines(after),
        width = current.length + 1;
    // LCS aligns retained lines so an inserted translation does not shift every EOL comparison.
    const counts = new Uint32Array((old.length + 1) * width);
    for (let i = old.length - 1; i >= 0; i--)
        for (let j = current.length - 1; j >= 0; j--)
            counts[i * width + j] =
                old[i].text === current[j].text
                    ? counts[(i + 1) * width + j + 1] + 1
                    : Math.max(counts[(i + 1) * width + j], counts[i * width + j + 1]);
    const pairs = [];
    let i = 0,
        j = 0;
    while (i < old.length && j < current.length) {
        if (old[i].text === current[j].text) pairs.push([i++, j++]);
        else if (counts[(i + 1) * width + j] >= counts[i * width + j + 1]) i++;
        else j++;
    }
    pairs.push([old.length, current.length]);
    const changes = [];
    const compare = (oldIndex, newIndex) => {
        if (
            old[oldIndex].ending !== current[newIndex].ending &&
            !changes.some((row) => row.beforeLine === oldIndex + 1 && row.afterLine === newIndex + 1)
        )
            changes.push({
                beforeLine: oldIndex + 1,
                afterLine: newIndex + 1,
                before: old[oldIndex].ending,
                after: current[newIndex].ending,
            });
    };
    let previousOld = -1,
        previousNew = -1;
    for (const [oldIndex, newIndex] of pairs) {
        const oldGap = oldIndex - previousOld - 1,
            newGap = newIndex - previousNew - 1;
        if (oldGap === newGap) for (let n = 1; n <= oldGap; n++) compare(previousOld + n, previousNew + n);
        else if (oldGap && newGap) {
            const endings = new Set(
                old
                    .slice(previousOld + 1, oldIndex)
                    .map((line) => line.ending)
                    .filter(Boolean),
            );
            for (let n = previousNew + 1; n < newIndex; n++) {
                if (!current[n].ending || (endings.size === 1 && endings.has(current[n].ending))) continue;
                changes.push({
                    beforeLine: previousOld + 2,
                    afterLine: n + 1,
                    before: [...endings],
                    after: current[n].ending,
                    note:
                        endings.size === 1
                            ? "rewrapped line changed its ending"
                            : "rewrapped mixed endings need review",
                });
            }
        }
        if (oldIndex < old.length) compare(oldIndex, newIndex);
        previousOld = oldIndex;
        previousNew = newIndex;
    }
    if (old.length && current.length) compare(old.length - 1, current.length - 1);
    return changes;
}

function registeredJavascript(text, file) {
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    if (source.parseDiagnostics.length) throw new Error(`${file}: cannot audit invalid JavaScript`);
    const values = new Map(),
        records = [],
        bindings = new Map();
    const literal = (node) => node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node));
    const shadowed = new Set();
    const findBindings = (node) => {
        if (
            (ts.isVariableDeclaration(node) ||
                ts.isFunctionDeclaration(node) ||
                ts.isParameter(node) ||
                ts.isBindingElement(node)) &&
            node.name
        ) {
            if (ts.isIdentifier(node.name)) {
                const candidates = bindings.get(node.name.text) || [];
                candidates.push(
                    ts.isVariableDeclaration(node) &&
                        (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
                        literal(node.initializer)
                        ? node.initializer.text
                        : undefined,
                );
                bindings.set(node.name.text, candidates);
            }
            for (const name of ["addTextKey", "KinkyDungeonAddRestraintText"])
                if (node.name.getText(source).includes(name)) shadowed.add(name);
        }
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
            node.operatorToken.kind <= ts.SyntaxKind.LastAssignment
        ) {
            const left = node.left;
            const name = ts.isIdentifier(left)
                ? left.text
                : ts.isPropertyAccessExpression(left) &&
                    ["globalThis", "window"].includes(left.expression.getText(source))
                  ? left.name.text
                  : ts.isElementAccessExpression(left) &&
                      ["globalThis", "window"].includes(left.expression.getText(source)) &&
                      literal(left.argumentExpression)
                    ? left.argumentExpression.text
                    : undefined;
            if (name) shadowed.add(name);
        }
        ts.forEachChild(node, findBindings);
    };
    findBindings(source);
    const visit = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
            const name = node.expression.text,
                first = node.arguments[0];
            const candidates = first && ts.isIdentifier(first) ? bindings.get(first.text) : undefined;
            const key = literal(first)
                ? first.text
                : candidates?.length === 1 && candidates[0] !== undefined && !shadowed.has(first.text)
                  ? candidates[0]
                  : null;
            const keyExpression = literal(first) ? undefined : first?.getText(source) || "<missing argument>";
            const slots = shadowed.has(name)
                ? []
                : name === "addTextKey"
                  ? [1]
                  : name === "KinkyDungeonAddRestraintText"
                    ? [1, 2, 3]
                    : [];
            for (const slot of slots) {
                const value = node.arguments[slot];
                if (!literal(value)) continue;
                const textKey =
                    key === null
                        ? null
                        : name === "addTextKey"
                          ? key
                          : `Restraint${key}${["", "", "Desc", "Desc2"][slot]}`;
                values.set(value, true);
                records.push({
                    key: textKey,
                    keyExpression,
                    value: value.text,
                    line: source.getLineAndCharacterOfPosition(value.getStart(source)).line + 1,
                });
            }
        }
        ts.forEachChild(node, visit);
    };
    visit(source);
    const shape = (node) => {
        // Commas delimit already-separated AST children; binary comma operators remain significant.
        if (node.kind === ts.SyntaxKind.CommaToken && node.parent?.kind !== ts.SyntaxKind.BinaryExpression)
            return undefined;
        if (literal(node)) return [node.kind, values.has(node) ? "<registered text>" : node.text];
        const children = node
            .getChildren(source)
            .map(shape)
            .filter((child) => child !== undefined);
        return [node.kind, children.length ? children : node.getText(source)];
    };
    return { records, shape: JSON.stringify(shape(source)) };
}

function csvRecords(text) {
    return lines(text).flatMap(({ text: row }, index) => {
        const comma = row.indexOf(",");
        if (comma <= 0 || row.startsWith("#")) return [];
        let value = row.slice(comma + 1);
        // KDLoadTranslations strips one paired outer quote, preserving inner doubled quotes.
        if (value.length >= 2 && ['"', "'"].includes(value[0]) && value.at(-1) === value[0]) value = value.slice(1, -1);
        return [{ key: row.slice(0, comma), value, line: index + 1 }];
    });
}

function inspectTextFile({ file, before, after }) {
    const language = file.match(/Spiderlings([A-Z]{2})\.csv$/)?.[1] || "EN";
    let oldRecords = [],
        newRecords = [],
        codeChanged = false;
    if (file.endsWith(".js")) {
        const old = registeredJavascript(before, file),
            current = registeredJavascript(after, file);
        oldRecords = old.records;
        newRecords = current.records;
        codeChanged = old.shape !== current.shape;
    } else if (file.endsWith(".csv")) {
        oldRecords = csvRecords(before);
        newRecords = csvRecords(after);
        codeChanged =
            JSON.stringify(oldRecords.map((row) => row.key)) !== JSON.stringify(newRecords.map((row) => row.key));
    } else if (file.endsWith("mod.json")) {
        const old = before ? JSON.parse(before) : {},
            current = after ? JSON.parse(after) : {};
        oldRecords = typeof old.moddesc === "string" ? [{ key: "moddesc", value: old.moddesc }] : [];
        newRecords = typeof current.moddesc === "string" ? [{ key: "moddesc", value: current.moddesc }] : [];
        if (typeof old.moddesc === "string" && typeof current.moddesc === "string") old.moddesc = current.moddesc;
        codeChanged = JSON.stringify(old) !== JSON.stringify(current);
    }
    const occurrences = (records) => {
        const counts = new Map();
        return new Map(
            records.map((record) => {
                const identity = record.key ?? `expression:${record.keyExpression}`;
                const occurrence = (counts.get(identity) || 0) + 1;
                counts.set(identity, occurrence);
                return [`${identity}\0${occurrence}`, { ...record, occurrence }];
            }),
        );
    };
    const oldTexts = occurrences(oldRecords),
        newTexts = occurrences(newRecords);
    const textChanges = [];
    for (const id of new Set([...oldTexts.keys(), ...newTexts.keys()])) {
        const old = oldTexts.get(id),
            current = newTexts.get(id);
        if (old?.value === current?.value) continue;
        const beforePlaceholders = placeholderMultiset(old?.value || ""),
            afterPlaceholders = placeholderMultiset(current?.value || "");
        textChanges.push({
            key: (current || old).key,
            keyExpression: (current || old).keyExpression,
            consumerStatus: (current || old).key === null ? "unknown" : "resolved",
            occurrence: (current || old).occurrence,
            language,
            before: old?.value,
            after: current?.value,
            beforeLine: old?.line,
            afterLine: current?.line,
            beforePlaceholders,
            afterPlaceholders,
            placeholdersChanged: JSON.stringify(beforePlaceholders) !== JSON.stringify(afterPlaceholders),
        });
    }
    const eolChanges = inspectLineEndings(before, after);
    return {
        file,
        codeChanged,
        textChanges,
        eolChanges,
        reviewRequired:
            codeChanged ||
            eolChanges.length > 0 ||
            textChanges.some((row) => row.placeholdersChanged || row.consumerStatus === "unknown"),
    };
}

function git(repositoryRoot, args, allowMissing = false) {
    const result = spawnSync("git", args, {
        cwd: repositoryRoot,
        encoding: "utf8",
        windowsHide: true,
        maxBuffer: 32 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        if (allowMissing && result.status === 128) return "";
        throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
    }
    return result.stdout;
}

function auditTextChanges({ repositoryRoot, base, target = "working-tree" }) {
    if (!base || base.startsWith("-")) throw new Error("An explicit --base commit/ref is required");
    if (!target || target.startsWith("-")) throw new Error("--target needs working-tree, staged or a commit/ref");
    const baseCommit = git(repositoryRoot, ["rev-parse", "--verify", `${base}^{commit}`]).trim();
    const targetCommit = ["staged", "working-tree"].includes(target)
        ? null
        : git(repositoryRoot, ["rev-parse", "--verify", `${target}^{commit}`]).trim();
    const diffArgs =
        target === "staged"
            ? ["diff", "--cached", baseCommit]
            : ["diff", baseCommit, ...(targetCommit ? [targetCommit] : [])];
    const changed = git(repositoryRoot, [...diffArgs, "--name-only", "-z", "--"])
        .split("\0")
        .filter(Boolean);
    if (target === "working-tree")
        changed.push(
            ...git(repositoryRoot, ["ls-files", "--others", "--exclude-standard", "-z"]).split("\0").filter(Boolean),
        );
    const scoped = [...new Set(changed)].filter((file) =>
        /^KinkyDungeon-Spiderlings\/(Spiderlings[^/]*\.js|Spiderlings[A-Z]{2}\.csv|mod\.json)$/.test(file),
    );
    const testRoot = path.join(repositoryRoot, "KinkyDungeon-Spiderlings/tools/tests");
    const testPrefix = "KinkyDungeon-Spiderlings/tools/tests/";
    const tests =
        target === "working-tree"
            ? fs.existsSync(testRoot)
                ? fs.readdirSync(testRoot).map((file) => testPrefix + file)
                : []
            : git(
                  repositoryRoot,
                  target === "staged"
                      ? ["ls-files", "-z", "--", testPrefix]
                      : ["ls-tree", "-r", "--name-only", "-z", targetCommit, "--", testPrefix],
              )
                  .split("\0")
                  .filter(Boolean);
    const readTarget = (file) =>
        target === "working-tree"
            ? fs.existsSync(path.join(repositoryRoot, file))
                ? fs.readFileSync(path.join(repositoryRoot, file), "utf8")
                : ""
            : git(repositoryRoot, ["show", target === "staged" ? `:${file}` : `${targetCommit}:${file}`], true);
    const manifestFile = "KinkyDungeon-Spiderlings/mod.json";
    const runtimeFiles = new Set();
    for (const manifest of [
        git(repositoryRoot, ["show", `${baseCommit}:${manifestFile}`], true),
        readTarget(manifestFile),
    ])
        for (const file of JSON.parse(manifest || "{}").fileorder || [])
            runtimeFiles.add(`KinkyDungeon-Spiderlings/${file}`);
    const runtimePayloadChanges = [...new Set(changed)].filter(
        (file) => runtimeFiles.has(file) && !scoped.includes(file),
    );
    const testSources = new Map(
        tests.filter((file) => file.endsWith(".test.js")).map((file) => [file, readTarget(file)]),
    );
    const files = scoped.map((file) => {
        const before = git(repositoryRoot, ["show", `${baseCommit}:${file}`], true);
        const after = readTarget(file);
        const report = inspectTextFile({ file, before, after });
        for (const row of report.textChanges) {
            if (row.consumerStatus === "unknown") {
                row.testReferences = null;
                continue;
            }
            row.testReferences = [...testSources]
                .filter(([, source]) => source.includes(row.key) || (row.before && source.includes(row.before)))
                .map(([file]) => file);
        }
        return report;
    });
    return {
        scope: "Spiderlings runtime text files and other manifest payloads; maintenance/docs are listed separately",
        base,
        baseCommit,
        target,
        targetCommit,
        testReferenceSnapshot: targetCommit || target,
        files,
        runtimePayloadChanges,
        otherChangedFiles: [...new Set(changed)].filter(
            (file) => !scoped.includes(file) && !runtimePayloadChanges.includes(file),
        ),
        reviewRequired: files.some((file) => file.reviewRequired) || runtimePayloadChanges.length > 0,
    };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2),
            options = {};
        if (args.length === 1 && args[0] === "--help") {
            console.log(
                "Usage: npm run audit:text -- --base <commit/ref> [--target working-tree|staged|<commit/ref>] [--text-only]",
            );
            console.log(
                "Reports text keys, placeholders, line endings and test references against an explicit Git base.",
            );
            console.log("--text-only fails when scoped changes need review; it does not prove gameplay semantics.");
        } else {
            const seen = new Set();
            for (let n = 0; n < args.length; n++) {
                const name = args[n];
                if (seen.has(name)) throw new Error(`Duplicate option: ${name}`);
                seen.add(name);
                if (name === "--text-only") options.textOnly = true;
                else if (["--base", "--target"].includes(name) && args[n + 1] && !args[n + 1].startsWith("-"))
                    options[name.slice(2)] = args[++n];
                else throw new Error(`Unknown or incomplete option: ${name}`);
            }
            const report = auditTextChanges({
                repositoryRoot: path.resolve(__dirname, "../.."),
                base: options.base,
                target: options.target,
            });
            console.log(JSON.stringify(report, null, 2));
            if (options.textOnly && report.reviewRequired) process.exitCode = 1;
        }
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { inspectLineEndings, inspectTextFile, auditTextChanges };
