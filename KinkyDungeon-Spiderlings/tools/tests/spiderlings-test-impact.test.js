"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync, spawnSync } = require("node:child_process");
const { selectAffected, symbolChanges, validateMappings, collectChanges } = require("../test-impact.js");
const suites = require("../test-suites.json");
const manifest = require("../../mod.json");
const mapping = require("../test-impact.json");
const root = path.resolve(__dirname, "../..");
const projectFile = "SpiderlingsFieldProjects.js";
const before = fs.readFileSync(path.join(root, projectFile), "utf8");
const change = (after) => [{ path: projectFile, before, after }];

test("every runtime script has explicit coverage and every referenced test and scene exists", () => {
    assert.deepEqual(validateMappings(suites, manifest), []);
    for (const file of manifest.fileorder.filter((f) => f.endsWith(".js"))) {
        const selected = selectAffected([file], suites);
        assert.equal(selected.status, "ready", file);
        assert.ok(selected.tests.length, file);
        assert.ok(selected.scenarios.length, file);
    }
});

test("Mage behavior no longer selects unrelated field, renderer or delivery tests", () => {
    const s = selectAffected(["KinkyDungeon-Spiderlings/SpiderlingsMage.js"], suites);
    assert.deepEqual(s.unknown, []);
    assert.ok(s.tests.includes("spiderlings-mage-combat.test.js"));
    assert.ok(s.localTests.includes("spiderlings-mage-spells-native.test.js"));
    for (const name of [
        "spiderlings-spinner-ai.test.js",
        "spiderlings-mage-visuals.test.js",
        "spiderlings-publication.test.js",
    ])
        assert.ok(!s.tests.includes(name));
    assert.ok(!s.scenarios.includes("field-command"));
    assert.equal(s.nativeScope, "focused");
});

test("actual runtime consumers remain selected across species and field seams", () => {
    const shared = selectAffected(["SpiderlingsCore.js"], suites);
    assert.equal(shared.nativeScope, "full");
    assert.ok(!shared.tests.includes("spiderlings-publication.test.js"));
    assert.ok(!shared.tests.includes("spiderlings-worktree-safety.test.js"));
    for (const [file, scope, names] of [
        ["SpiderlingsNPCAdhesion.js", "tests", ["mage-combat"]],
        ["SpiderlingsJumperDash.js", "localTests", ["combat"]],
        ["SpiderlingsSpinnerAI.js", "tests", ["spinner-capture", "spinner-recovery"]],
        ["SpiderlingsSpinnerNPCCapture.js", "tests", ["spinner-npc-recovery"]],
        ["SpiderlingsSpinnerTopology.js", "tests", ["spinner-passage-planner"]],
    ]) {
        const selected = selectAffected([file], suites);
        for (const name of names)
            assert.ok(selected[scope].includes(`spiderlings-${name}.test.js`), `${file}: ${name}`);
    }
});

test("a real permit formula edit selects permits and its consumers without all field behavior", () => {
    const after = before.replace("spinnerCount() / 4", "spinnerCount() / 6");
    assert.notEqual(after, before);
    const s = selectAffected(change(after), suites);
    assert.deepEqual(s.areas, ["field-permits"]);
    assert.deepEqual(s.scenarios, ["field-permits"]);
    assert.ok(s.tests.includes("spiderlings-field-permits.test.js"));
    assert.ok(!s.tests.includes("spiderlings-spinner-work-obstruction.test.js"));
    assert.equal(s.reasons[0].kind, "symbols");
    assert.deepEqual(s.reasons[0].symbols, ["permits"]);
});

test("mixed edits select the union and exported or unknown changes retain owning-file coverage", () => {
    const mixed = before
        .replace("spinnerCount() / 4", "spinnerCount() / 6")
        .replace("function beginWork(enemy) {", "function beginWork(enemy) {\n if (!enemy) return undefined;");
    const s = selectAffected(change(mixed), suites);
    assert.ok(s.areas.includes("field-permits") && s.areas.includes("field-work"));
    assert.ok(s.scenarios.includes("spinner-maintenance"));
    const exported = before.replace("api.FieldProjects = {", "api.FieldProjects = { newSurface: true,");
    const full = selectAffected(change(exported), suites);
    assert.deepEqual(full.areas, ["field-lifecycle", "field-permits", "field-staffing", "field-work"]);
    assert.equal(full.reasons[0].kind, "file");
    const renamed = before.replaceAll("function permits()", "function otherPermits()");
    assert.equal(selectAffected(change(renamed), suites).reasons[0].kind, "file");
    assert.equal(selectAffected([{ path: projectFile, status: "D", before }], suites).reasons[0].kind, "file");
    assert.equal(selectAffected(change("invalid JavaScript {"), suites).reasons[0].kind, "file");
});

test("symbol comparison ignores comments and whitespace but retains strings, operators and outer code", () => {
    assert.equal(symbolChanges("function f(){return 1;}", "//comment\n function f() { return 1; }").unchanged, true);
    assert.deepEqual(symbolChanges("function f(){return 1;}", "function f(){return 2;}"), {
        complete: true,
        names: ["f"],
    });
    assert.equal(symbolChanges("function f(){return 1;} f();", "function f(){return 1;} g();").complete, false);
    assert.deepEqual(symbolChanges("const a = 'a b';", "const a = 'ab';").names, ["a"]);
    assert.equal(
        symbolChanges("function f(){} function f(){}", "function f(){} function f(){return 1;}").complete,
        false,
    );
    assert.notEqual(symbolChanges("const n=1;", "let n=1;").unchanged, true);
    assert.notEqual(symbolChanges("function f(){return -n;}", "function f(){return +n;}").unchanged, true);
});

test("shared work helpers and path renames retain file coverage instead of a misleading narrow or empty plan", () => {
    const helper = before.replace(
        "function workCells(target, snapshot, member) {",
        "function workCells(target, snapshot, member) {\n if (!target) return [];",
    );
    const selected = selectAffected(change(helper), suites);
    assert.equal(selected.reasons[0].kind, "file");
    assert.ok(selected.scenarios.includes("field-reinforcement"));
    assert.ok(selected.scenarios.includes("field-project-lifecycle"));
    const renamed = selectAffected(
        [{ path: projectFile, previousPath: "OldFieldProjects.js", status: "R100", before, after: before }],
        suites,
    );
    assert.equal(renamed.reasons[0].kind, "file");
    assert.ok(renamed.tests.length && renamed.scenarios.length);
});

test("native scene edits expand real state continuations and shared helpers only", () => {
    const scene = selectAffected(["tools/compatibility/browser/02-target-overlay.js"], suites);
    assert.deepEqual(scene.scenarios, ["rune-hit", "target-overlay"]);
    assert.equal(scene.nativeScope, "focused");
    assert.deepEqual(selectAffected(["tools/compatibility/browser/01-rune-hit.js"], suites).scenarios, [
        "rune-hit",
        "target-overlay",
    ]);
    const spinner = selectAffected(["tools/compatibility/browser/spinner.js"], suites);
    assert.deepEqual(spinner.scenarios, ["spinner-outside", "spinner-inside", "capture-reload", "spinner-art"]);
    const helper = selectAffected(["tools/compatibility/browser/normal-helpers.js"], suites);
    assert.ok(helper.scenarios.includes("webcaster") && helper.scenarios.includes("field-command"));
    assert.ok(!helper.scenarios.includes("rune-hit"));
    const runner = selectAffected(["tools/verify-kd-compatibility.js"], suites);
    assert.equal(runner.nativeScope, "full");
    assert.equal(runner.scenarios.length, 59);
});

test("direct local test edits and renamed tests are retained and unmapped/deleted tests do not trigger everything", () => {
    const local = selectAffected(["tools/tests/spiderlings-jumper-dash.test.js"], suites);
    assert.deepEqual(local.tests, []);
    assert.deepEqual(local.localTests, ["spiderlings-jumper-dash.test.js"]);
    const renamed = selectAffected(
        [
            {
                path: "tools/tests/spiderlings-mage-combat.test.js",
                status: "R100",
                previousPath: "tools/tests/old.test.js",
            },
        ],
        suites,
    );
    assert.deepEqual(renamed.tests, ["spiderlings-mage-combat.test.js"]);
    const missing = selectAffected(
        [{ path: "tools/tests/removed.test.js", status: "D" }, "SpiderlingsUnknown.js"],
        suites,
    );
    assert.equal(missing.status, "needs-mapping");
    assert.deepEqual(missing.tests, []);
    assert.equal(missing.nativeScope, "none");
});

test("shared test helpers select their transitive registered consumers", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spider-impact-helper-"));
    fs.mkdirSync(path.join(dir, "tools/tests/helpers"), { recursive: true });
    fs.writeFileSync(path.join(dir, "tools/tests/helpers/leaf.js"), "module.exports = {};\n");
    fs.writeFileSync(path.join(dir, "tools/tests/helpers/shared.js"), "require('./leaf.js');\n");
    fs.writeFileSync(path.join(dir, "tools/tests/a.test.js"), "require('./helpers/shared.js');\n");
    fs.writeFileSync(path.join(dir, "tools/tests/b.test.js"), "require('./helpers/leaf.js');\n");
    fs.writeFileSync(path.join(dir, "tools/tests/unrelated.test.js"), "module.exports = {};\n");
    const s = selectAffected(
        ["tools/tests/helpers/leaf.js"],
        { public: ["a.test.js", "unrelated.test.js"], local: ["b.test.js"] },
        { root: dir },
    );
    assert.deepEqual(s.tests, ["a.test.js"]);
    assert.deepEqual(s.localTests, ["b.test.js"]);
    assert.equal(s.nativeScope, "none");
});

test("mapping validation rejects missing runtime coverage, stale symbols and incorrect test/scenario references", () => {
    const bad = structuredClone(mapping);
    delete bad.files["SpiderlingsMage.js"];
    bad.profiles["mage-combat"].tests.push("missing.test.js");
    bad.profiles["mage-combat"].scenarios.push("missing-scene");
    bad.symbols[projectFile]["field-permits"].push("nonexistentFunction");
    const errors = validateMappings(suites, manifest, bad);
    for (const text of ["SpiderlingsMage.js", "missing.test.js", "missing-scene", "nonexistentFunction"])
        assert.ok(
            errors.some((e) => e.includes(text)),
            text,
        );
});

test("Git change collection includes staged, unstaged, renamed, deleted and untracked paths with real source pairs", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "spider-impact-git-"));
    const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" });
    git("init", "-q");
    git("config", "core.autocrlf", "false");
    git("config", "user.name", "Test");
    git("config", "user.email", "test@example.invalid");
    fs.mkdirSync(path.join(dir, "KinkyDungeon-Spiderlings"));
    fs.writeFileSync(path.join(dir, "KinkyDungeon-Spiderlings", projectFile), before);
    for (const f of ["old.test.js", "deleted.txt", "staged.txt"])
        fs.writeFileSync(path.join(dir, f), f + " original content\n");
    git("add", ".");
    git("commit", "-qm", "baseline");
    fs.renameSync(path.join(dir, "old.test.js"), path.join(dir, "new.test.js"));
    fs.unlinkSync(path.join(dir, "deleted.txt"));
    fs.writeFileSync(path.join(dir, "staged.txt"), "changed\n");
    git("add", "-A");
    fs.writeFileSync(
        path.join(dir, "KinkyDungeon-Spiderlings", projectFile),
        before.replace("spinnerCount() / 4", "spinnerCount() / 6"),
    );
    fs.writeFileSync(path.join(dir, "untracked.txt"), "new\n");
    const changes = collectChanges(dir);
    assert.ok(
        changes.some((c) => c.path === "new.test.js" && c.previousPath === "old.test.js" && c.status.startsWith("R")),
    );
    assert.ok(changes.some((c) => c.path === "deleted.txt" && c.status === "D"));
    assert.ok(changes.some((c) => c.path === "staged.txt"));
    assert.ok(changes.some((c) => c.path === "untracked.txt" && c.status === "A"));
    const edit = changes.find((c) => c.path.endsWith(projectFile));
    assert.equal(edit.before, before);
    assert.notEqual(edit.after, before);
    assert.deepEqual(selectAffected([edit], suites).areas, ["field-permits"]);
});

test("plan-only runner emits selection without executing a game or test process", () => {
    const result = spawnSync(
        process.execPath,
        [path.join(__dirname, "../run-spiderlings-tests.js"), "affected", "--plan", "--base", "HEAD"],
        { cwd: path.resolve(root, ".."), encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const plan = JSON.parse(result.stdout);
    assert.ok(Array.isArray(plan.reasons));
    assert.equal(plan.localExecution, "reported");
    assert.ok(!result.stdout.includes("TAP version"));
});
