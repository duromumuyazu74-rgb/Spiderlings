"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { inspectLineEndings, inspectTextFile, auditTextChanges } = require("../audit-spiderlings-text.js");

test("text-only review recognizes registered text while preserving IDs, assets and events", () => {
    const file = "KinkyDungeon-Spiderlings/Spiderlings.js";
    const before = 'const id = "SpiderlingsMageBolt"; const asset = "Bolt.png"; addTextKey("Cast", "Old silk.");';
    const after = before.replace("Old silk.", "Silk gathers inward.");
    const report = inspectTextFile({ file, before, after });
    assert.equal(report.codeChanged, false);
    assert.deepEqual(
        report.textChanges.map(({ key, language }) => ({ key, language })),
        [{ key: "Cast", language: "EN" }],
    );
    for (const value of [
        after.replace("SpiderlingsMageBolt", "OtherSpell"),
        after.replace("Bolt.png", "Other.png"),
        after.replace('"Cast"', '"OtherEvent"'),
    ]) {
        assert.equal(inspectTextFile({ file, before, after: value }).codeChanged, true);
    }
    assert.equal(
        inspectTextFile({ file, before: 'const text = "Old silk.";', after: 'const text = "New silk.";' }).codeChanged,
        true,
        "unproven string catalogs require review",
    );
    for (const assignment of ["addTextKey", "globalThis.addTextKey"]) {
        const custom = `${assignment} = (key, path) => loadTexture(path); addTextKey("X", "Old.png");`;
        assert.equal(
            inspectTextFile({ file, before: custom, after: custom.replace("Old.png", "New.png") }).codeChanged,
            true,
        );
    }
    const shared = 'const label = "Old.png"; addTextKey("X", label); loadTexture(label);';
    assert.equal(
        inspectTextFile({ file, before: shared, after: shared.replace("Old.png", "New.png") }).codeChanged,
        true,
    );
});

test("static computed global assignments cannot masquerade as native text sinks", () => {
    const file = "KinkyDungeon-Spiderlings/Spiderlings.js";
    for (const receiver of ["globalThis", "window"])
        for (const sink of ["addTextKey", "KinkyDungeonAddRestraintText"]) {
            const before = `${receiver}["${sink}"] = (key, path) => loadTexture(path); ${sink}("Sprite", "Old.png");`;
            const report = inspectTextFile({ file, before, after: before.replace("Old.png", "New.png") });
            assert.equal(report.codeChanged, true);
            assert.equal(report.reviewRequired, true);
        }
});

test("the native debug bypass const resolves while uncertain keys explicitly require review", () => {
    const file = "KinkyDungeon-Spiderlings/SpiderlingsFloorSelection.js";
    const before = fs.readFileSync(path.join(__dirname, "../../SpiderlingsFloorSelection.js"), "utf8");
    const after = before.replace(
        'addTextKey(DEBUG_BYPASS, "Debug stair bypass is on. Marked nests are unchanged.")',
        'addTextKey(DEBUG_BYPASS, "Debug stair bypass is enabled. Marked nests are unchanged.")',
    );
    assert.notEqual(after, before, "the current native debug registration is exercised");
    const report = inspectTextFile({ file, before, after });
    assert.equal(report.codeChanged, false);
    assert.equal(report.textChanges[0].key, "SpiderlingsDebugStairBypass");
    for (const consumer of ["debug-stairs", "hunting-grounds", "infestation", "webbing-cutover"])
        assert.ok(
            fs
                .readFileSync(path.join(__dirname, `spiderlings-${consumer}.test.js`), "utf8")
                .includes(report.textChanges[0].key),
        );
    for (const source of ['addTextKey(nextKey(), "Old silk.");', 'let KEY = "Cast"; addTextKey(KEY, "Old silk.");']) {
        const uncertain = inspectTextFile({ file, before: source, after: source.replace("Old silk.", "New silk.") });
        assert.equal(uncertain.textChanges[0].key, null);
        assert.ok(uncertain.textChanges[0].keyExpression);
        assert.equal(uncertain.textChanges[0].consumerStatus, "unknown");
        assert.equal(uncertain.reviewRequired, true);
    }
});

test("every registration occurrence retains its text and placeholder changes", () => {
    const before = 'if(mode) addTextKey("Cast","Old {phase}."); else addTextKey("Cast","Other {phase}.");';
    const report = inspectTextFile({
        file: "KinkyDungeon-Spiderlings/Spiderlings.js",
        before,
        after: before.replace("Old {phase}.", "New silk."),
    });
    assert.equal(report.textChanges.length, 1);
    assert.equal(report.textChanges[0].key, "Cast");
    assert.equal(report.textChanges[0].occurrence, 1);
    assert.equal(report.textChanges[0].placeholdersChanged, true);
    assert.equal(report.reviewRequired, true);
});

test("line-ending review aligns insertions and checks rewritten lines after wrapping", () => {
    assert.deepEqual(inspectLineEndings("a\r\nb\nc\r\n", "new\na\r\nb\nc\r\n"), []);
    assert.deepEqual(inspectLineEndings("a\r\nb\nc\r\n", "a\nb\nc\r\n"), [
        { beforeLine: 1, afterLine: 1, before: "\r\n", after: "\n" },
    ]);
    assert.ok(inspectLineEndings("old text\r\n", "new\ntext\n").length > 0);
    assert.ok(
        inspectLineEndings('addTextKey("X","Old");\r\n', 'addTextKey(\r\n"X",\r\n"New"\r\n);').some(
            (row) => row.after === "",
        ),
    );
});

test("CSV audit follows native paired quotes and manifests only exempt string descriptions", () => {
    const csv = "KinkyDungeon-Spiderlings/SpiderlingsCN.csv";
    const report = inspectTextFile({ file: csv, before: 'Label,"hello"\n', after: 'Label,hello"\n' });
    assert.equal(report.textChanges[0].before, "hello");
    assert.equal(report.textChanges[0].after, 'hello"');
    assert.equal(inspectTextFile({ file: csv, before: "Label,'silk'\n", after: "Label,silk\n" }).textChanges.length, 0);
    assert.equal(
        inspectTextFile({ file: csv, before: 'Label,"silk ""layers"""\n', after: 'Label,"silk layers"\n' })
            .textChanges[0].before,
        'silk ""layers""',
    );
    const file = "KinkyDungeon-Spiderlings/mod.json";
    for (const description of [12, { title: "Silk" }]) {
        assert.equal(
            inspectTextFile({ file, before: '{"moddesc":"Silk"}', after: JSON.stringify({ moddesc: description }) })
                .codeChanged,
            true,
        );
    }
});

test("staged and committed audits use the explicit base and report consumer tests", () => {
    const scratch = path.resolve(__dirname, "../../../.scratch/text-audit-tests");
    fs.mkdirSync(scratch, { recursive: true });
    const repositoryRoot = fs.mkdtempSync(path.join(scratch, "repo-"));
    const git = (...args) =>
        execFileSync("git", args, { cwd: repositoryRoot, encoding: "utf8", windowsHide: true }).trim();
    git("init", "--quiet");
    git("config", "core.autocrlf", "false");
    git("config", "user.name", "Text audit test");
    git("config", "user.email", "text-audit@example.invalid");
    const mod = path.join(repositoryRoot, "KinkyDungeon-Spiderlings");
    fs.mkdirSync(path.join(mod, "tools/tests"), { recursive: true });
    const file = path.join(mod, "Spiderlings.js");
    fs.writeFileSync(file, 'const CAST_KEY = "Cast"; addTextKey(CAST_KEY, "Old silk.");\r\n');
    fs.writeFileSync(path.join(mod, "tools/tests/cast.test.js"), "assert.ok(texts.Cast); // native key consumer\n");
    fs.mkdirSync(path.join(mod, "Bullets"));
    fs.writeFileSync(path.join(mod, "Bullets/WebSpray.png"), "old native payload");
    fs.writeFileSync(path.join(mod, "custom.js"), "const runtimeValue = 1;\n");
    fs.writeFileSync(
        path.join(mod, "mod.json"),
        JSON.stringify({ moddesc: "Fixture", fileorder: ["Spiderlings.js", "Bullets/WebSpray.png", "custom.js"] }),
    );
    for (const helper of ["audit-spiderlings-text.js", "translation-contract.js"])
        fs.copyFileSync(path.join(__dirname, "..", helper), path.join(mod, "tools", helper));
    git("add", ".");
    git("commit", "--quiet", "-m", "baseline");
    const base = git("rev-parse", "HEAD");
    assert.throws(() => auditTextChanges({ repositoryRoot }), /explicit --base/);
    fs.writeFileSync(file, 'const CAST_KEY = "Cast"; addTextKey(CAST_KEY, "Staged silk.");\r\n');
    git("add", ".");
    fs.writeFileSync(file, 'const CAST_KEY = "Cast"; addTextKey(CAST_KEY, "Working silk.");\r\n');
    fs.writeFileSync(path.join(mod, "tools/tests/cast.test.js"), "// unrelated working-tree test\n");
    const staged = auditTextChanges({ repositoryRoot, base, target: "staged" });
    assert.equal(staged.baseCommit, base);
    assert.equal(staged.files[0].textChanges[0].after, "Staged silk.");
    assert.deepEqual(staged.files[0].textChanges[0].testReferences, [
        "KinkyDungeon-Spiderlings/tools/tests/cast.test.js",
    ]);
    assert.equal(staged.reviewRequired, false);
    assert.equal(auditTextChanges({ repositoryRoot, base }).files[0].textChanges[0].after, "Working silk.");
    git("commit", "--quiet", "-m", "staged copy");
    const committed = auditTextChanges({ repositoryRoot, base, target: "HEAD" });
    assert.equal(committed.targetCommit, git("rev-parse", "HEAD"));
    assert.equal(committed.files[0].textChanges[0].before, "Old silk.");
    assert.equal(committed.files[0].textChanges[0].after, "Staged silk.");
    const auditFile = path.join(mod, "tools/audit-spiderlings-text.js");
    const help = spawnSync(process.execPath, [auditFile, "--help"], {
        cwd: repositoryRoot,
        encoding: "utf8",
        windowsHide: true,
    });
    assert.equal(help.status, 0);
    assert.match(help.stdout, /--base.*--target/);
    for (const args of [
        ["--base"],
        ["--base", base, "--target"],
        ["--base", base, "--targte", "staged"],
        ["--base", base, "--base", base],
    ]) {
        const rejected = spawnSync(process.execPath, [auditFile, ...args], {
            cwd: repositoryRoot,
            encoding: "utf8",
            windowsHide: true,
        });
        assert.equal(rejected.status, 1);
        assert.match(rejected.stderr, /Unknown or incomplete|Duplicate option/);
    }
    for (const payload of ["Bullets/WebSpray.png", "custom.js"]) {
        fs.writeFileSync(path.join(mod, payload), "changed native payload");
        const report = auditTextChanges({ repositoryRoot, base });
        assert.ok(report.runtimePayloadChanges.includes(`KinkyDungeon-Spiderlings/${payload}`));
        assert.equal(report.reviewRequired, true);
        const cli = spawnSync(process.execPath, [auditFile, "--base", base, "--text-only"], {
            cwd: repositoryRoot,
            encoding: "utf8",
            windowsHide: true,
        });
        assert.equal(cli.status, 1, cli.stderr);
    }
});
