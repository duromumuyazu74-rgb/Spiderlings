"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { git, gameVersion, syncUpstream } = require("../compatibility/prepare.js");
const vm = require("node:vm");
const { selectScenarios, parseArguments } = require("../compatibility/scenarios.js");
const { createDiagnostics, browserDiagnostics } = require("../compatibility/diagnostics.js");

test("selected scenes include their actual dependencies and preserve full-run ordering", () => {
    const escape = selectScenarios(["native-escape"]);
    assert.equal(escape.mode, "partial");
    assert.deepEqual(escape.executed, ["normal-helpers", "native-escape"]);
    assert.deepEqual(selectScenarios(["spinner-art"]).executed, ["spinner-inside", "spinner-art"]);
    assert.deepEqual(selectScenarios(["target-overlay"]).executed, ["rune-hit", "target-overlay"]);
    const combined = selectScenarios(["native-escape", "player-recovery", "native-escape"]);
    assert.equal(combined.executed.filter((name) => name === "normal-helpers").length, 1);
    const full = selectScenarios();
    assert.equal(full.mode, "full");
    assert.equal(full.total, full.executed.length);
    for (const scenario of full.checks) {
        const source = fs.readFileSync(path.join(__dirname, "../compatibility/browser", scenario.file), "utf8");
        if (scenario.name !== "normal-helpers" && source.includes("globalThis.normalAcceptance"))
            assert.ok(scenario.dependencies.includes("normal-helpers"));
        for (const dependency of scenario.dependencies)
            assert.ok(full.executed.indexOf(dependency) < full.executed.indexOf(scenario.name));
    }
});

test("scenario argument errors fail before preparation and explicit full selection remains partial", () => {
    assert.throws(() => parseArguments(["--scenario", "typo"]), /Unknown scenario/);
    assert.throws(() => parseArguments(["--scenario", "--package", "file.zip"]), /incomplete/);
    assert.throws(() => parseArguments(["--scenario", "native-escape,"]), /Unknown scenario/);
    assert.throws(() => parseArguments(["--prepare-only", "--scenario", "basic"]), /cannot run/);
    assert.deepEqual(parseArguments(["--scenario", "native-escape,spinner-work"]).scenarios, [
        "native-escape",
        "spinner-work",
    ]);
    assert.equal(selectScenarios(selectScenarios().executed).mode, "partial");
    assert.equal(parseArguments(["--list-scenarios"]).list, true);
});

test("late resource failures keep the initiating scene and seed and await response-body completion", () => {
    const diagnostics = createDiagnostics(),
        request = {};
    diagnostics.setContext({ scenario: "hunting-grounds", seed: "hunt-2" });
    diagnostics.startRequest(request, "http://localhost/Models/Gothic/HemLowerBack.png", "image");
    diagnostics.setContext({ scenario: "debug-stairs", seed: "stairs-1" });
    diagnostics.response(request, 404);
    assert.equal(diagnostics.pendingAssets().length, 1);
    assert.equal(diagnostics.events[0].scenario, "hunting-grounds");
    assert.equal(diagnostics.events[0].seed, "hunt-2");
    assert.equal(diagnostics.events[0].status, 404);
    diagnostics.finishRequest(request);
    assert.equal(diagnostics.pendingAssets().length, 0);
    const failed = {};
    diagnostics.startRequest(failed, "http://localhost/asset.png", "image");
    diagnostics.finishRequest(failed, { error: "net::ERR_FAILED" });
    assert.equal(diagnostics.events[1].error, "net::ERR_FAILED");
});

test("browser rejection diagnostics retain Event resource URLs and seed changes", () => {
    const handlers = {},
        messages = [],
        seeds = [];
    const context = vm.createContext({
        window: {
            addEventListener: (name, callback) => {
                handlers[name] = callback;
            },
        },
        localStorage: { setItem() {} },
        console: { debug: (message) => messages.push(message) },
        KDsetSeed: (seed) => seeds.push(seed),
    });
    vm.runInContext(`(${browserDiagnostics.toString()})()`, context);
    context.compatibilityContext = { scenario: "hunting-grounds", seed: null };
    context.compatibilitySetSeed("hunt-7");
    handlers.unhandledrejection({
        reason: { target: { currentSrc: "http://localhost/missing.png" }, toString: () => "[object Event]" },
    });
    const entry = context.compatibilityDiagnostics[0];
    assert.equal(entry.scenario, "hunting-grounds");
    assert.equal(entry.seed, "hunt-7");
    assert.equal(entry.url, "http://localhost/missing.png");
    assert.equal(entry.message, "[object Event]");
    assert.deepEqual(seeds, ["hunt-7"]);
    assert.ok(messages[0].startsWith("SpiderlingsCompatibilityContext:"));
});

test("upstream sync follows new commits even when the gameplay version does not change, preserving local edits", () => {
    const parent = path.resolve(__dirname, "../../../.scratch/compatibility-tests");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "sync-"));
    const source = path.join(root, "official"),
        cache = path.join(root, "cache");
    fs.mkdirSync(source);
    git(source, "init", "-b", "5.5");
    const writeVersion = () => {
        const file = path.join(source, "Screens/MiniGame/KinkyDungeon/Text_KinkyDungeon.csv");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'KDVersionStr,"5.5.3"\n');
    };
    const commit = () => {
        git(source, "add", ".");
        git(
            source,
            "-c",
            "user.name=Compatibility test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-m",
            "fixture",
        );
        return git(source, "rev-parse", "HEAD");
    };
    writeVersion();
    fs.writeFileSync(path.join(source, "behavior.txt"), "first\n");
    const first = commit();
    const initial = syncUpstream(cache, source);
    assert.equal(initial.commit, first);
    assert.equal(gameVersion(initial.root), "5.5.3");
    assert.equal(syncUpstream(cache, source).updated, false);
    fs.writeFileSync(path.join(source, "behavior.txt"), "second\n");
    const second = commit();
    const updated = syncUpstream(cache, source);
    assert.equal(updated.commit, second);
    assert.equal(updated.previousCommit, first);
    assert.equal(updated.updated, true);
    assert.equal(fs.readFileSync(path.join(updated.root, "behavior.txt"), "utf8").trim(), "second");
    fs.writeFileSync(path.join(updated.root, "behavior.txt"), "local work\n");
    assert.throws(() => syncUpstream(cache, source), /local changes/);
    assert.equal(fs.readFileSync(path.join(updated.root, "behavior.txt"), "utf8"), "local work\n");
    assert.throws(() => syncUpstream(cache, source + "-different"), /different origin/);
});
