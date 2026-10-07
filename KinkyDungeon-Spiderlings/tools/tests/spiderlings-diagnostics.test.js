"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { runSteps, readJson, writeJson, writeText } = require("../task-runner.js");
const { saveSlots, inventorySave, selectMap, inspectSaves } = require("../save-diagnostics.js");
const { summarizeEvidence } = require("../evidence-summary.js");
const { parseReplayArguments } = require("../replay-spiderlings-save.js");

test("save inventory includes cached floors when the current slot has moved on", () => {
    const map = {
        MapMod: "SpiderlingsHuntingGrounds",
        Entities: [
            { id: 1, hp: 2, AI: "guard", Enemy: { name: "Spinner", AI: "hunt" } },
            { id: 2, hp: 5, Enemy: "NestEntrance" },
        ],
        SpiderlingsHuntingGrounds: { status: "active", target: 3, targetIds: [2], destroyedIds: [], complete: false },
        SpiderlingsSpinnerEncounter: {
            ai: { plans: { a: { id: "a", center: { x: 4, y: 5 }, fieldIds: ["b"] } } },
            topology: { fields: { b: { phase: "sealing" } } },
        },
    };
    const save = {
        level: 7,
        KDMapData: { Entities: [] },
        KDCurrentWorldSlot: "0,7",
        KDWorldMap: { "0,6": { data: { "": map, sideRoom: { Entities: [] } } } },
    };
    const before = JSON.stringify(save);
    const slots = saveSlots({ slots: [{ content: save }, { content: "" }] });
    assert.equal(slots.length, 2);
    assert.ok(slots[1].error);
    const summary = inventorySave(slots[0].save);
    assert.equal(summary.maps.length, 3);
    const cached = summary.maps.find((row) => row.location === "0,6" && row.room === "");
    assert.equal(cached.spinners, 1);
    assert.deepEqual(cached.spinnerAI, { guard: 1 });
    assert.deepEqual(cached.projects[0].phases, ["sealing"]);
    assert.equal(cached.objective.liveTargets, 1);
    assert.equal(selectMap(save, "0,6"), map);
    assert.equal(JSON.stringify(save), before);
    assert.throws(() => selectMap(save, "0,8"), /No visited map/);
});

test("encoded slots use the supplied native codec without changing their content", () => {
    const input = { slots: [{ content: "native-base64" }] };
    const codec = {
        decompressFromBase64: (value) => {
            assert.equal(value, "native-base64");
            return '{"level":6}';
        },
    };
    assert.equal(saveSlots(input, codec)[0].save.level, 6);
    assert.equal(input.slots[0].content, "native-base64");
    assert.match(saveSlots(input)[0].error, /need --codec/);
});

test("save inspection distinguishes empty/error-only inputs from partly usable slot inventories", () => {
    assert.equal(inspectSaves({ slots: [] }).status, "failed");
    assert.equal(inspectSaves({ slots: [{ content: "encoded-without-codec" }] }).status, "failed");
    assert.equal(
        inspectSaves({ slots: [{ content: { level: 6, KDMapData: { Entities: [] } } }, { content: "" }] }).status,
        "partial",
    );
});

test("UTF-8 task files retain Chinese content and commands preserve literal arguments", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spiderlings-diagnostics-"));
    try {
        const file = path.join(directory, "plan.json");
        const plan = { steps: [{ id: "中文正文", command: "node", args: ["body.js", "`literal`", "$(literal)"] }] };
        writeJson(file, plan);
        assert.deepEqual(readJson(file), plan);
        let received;
        assert.equal(
            runSteps(directory, readJson(file), (_root, command, args) => {
                received = { command, args };
            }).status,
            "passed",
        );
        assert.deepEqual(received.args, plan.steps[0].args);
    } finally {
        assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("spiderlings-diagnostics-"));
        fs.rmSync(directory, { recursive: true });
    }
});

test("replay selects an explicit visited map without accepting malformed coordinates or turn budgets", () => {
    const base = ["--save", "save.json", "--runtime", "result.json", "--package", "mod.zip"];
    const selected = parseReplayArguments([
        ...base,
        "--slot",
        "7",
        "--location",
        "0,6",
        "--center",
        "23,29",
        "--turns",
        "80",
    ]);
    assert.equal(selected.slot, 7);
    assert.equal(selected.turns, 80);
    assert.equal(selected.location, "0,6");
    assert.throws(() => parseReplayArguments([...base, "--turns", "-1"]), /nonnegative/);
    assert.throws(() => parseReplayArguments([...base, "--location", "current"]), /Location/);
});

test("failed commands stop the task before any following command", () => {
    const called = [];
    const plan = { steps: ["first", "second"].map((id) => ({ id, command: "node", args: [] })) };
    assert.throws(
        () =>
            runSteps(".", plan, () => {
                called.push("command");
                throw Error("exit 1");
            }),
        (error) => error.code === "command-failed" && error.step === "first",
    );
    assert.equal(called.length, 1);
});

test("preparation checks all script syntax before executing a generator or publication", () => {
    const calls = [];
    const plan = {
        prepare: [
            { id: "body", script: "body.cjs" },
            { id: "later", script: "broken.cjs" },
        ],
        steps: [{ id: "publish", command: "gh", args: [] }],
    };
    assert.throws(
        () =>
            runSteps(".", plan, (_root, _command, args) => {
                calls.push(args);
                if (args.includes(path.resolve("broken.cjs"))) throw Error("Syntax error");
            }),
        (error) => error.code === "preparation-syntax-failed" && error.step === "later",
    );
    assert.equal(calls.length, 2);
    assert.ok(calls.every((args) => args[0] === "--check"));
});

test("file preparation runs before commands and its failures prevent publication", () => {
    const calls = [];
    const plan = {
        prepare: [{ id: "body", script: "body.cjs", args: ["正文"] }],
        steps: [{ id: "publish", command: "gh", args: [] }],
    };
    assert.throws(
        () =>
            runSteps(".", plan, (_root, _command, args) => {
                calls.push(args);
                if (args[0] !== "--check") throw Error("Generator failed");
            }),
        (error) => error.code === "preparation-failed",
    );
    assert.equal(calls.length, 2);
    assert.equal(calls[1].at(-1), "正文");
});

test("real nonzero child exits preserve literal UTF-8 arguments and prevent the following write", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spiderlings-diagnostics-"));
    try {
        const script = path.join(directory, "child.js"),
            first = path.join(directory, "first.txt"),
            next = path.join(directory, "next.txt");
        writeText(
            script,
            'require("node:fs").writeFileSync(process.argv[2], process.argv[3], "utf8"); process.exit(5);',
        );
        const literal = "中文正文 `literal` $(literal)";
        assert.throws(
            () =>
                runSteps(directory, {
                    steps: [
                        { id: "first", command: process.execPath, args: [script, first, literal] },
                        { id: "next", command: process.execPath, args: [script, next, "must not run"] },
                    ],
                }),
            (error) => error.code === "command-failed" && error.cause.status === 5,
        );
        assert.equal(fs.readFileSync(first, "utf8"), literal);
        assert.equal(fs.existsSync(next), false);
    } finally {
        assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("spiderlings-diagnostics-"));
        fs.rmSync(directory, { recursive: true });
    }
});

test("real preparation preflights every file and loads generated readback expectations", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spiderlings-diagnostics-"));
    try {
        writeText(
            path.join(directory, "prepare.cjs"),
            'require("node:fs").writeFileSync("expected.json", JSON.stringify({body: process.argv[2]}));',
        );
        writeText(path.join(directory, "broken.cjs"), "const = ;");
        const plan = {
            prepare: [{ id: "body", script: "prepare.cjs", args: ["正文 `literal` $(literal)"] }],
            steps: [
                {
                    id: "readback",
                    command: process.execPath,
                    args: ["-e", "process.stdout.write('ok')"],
                    verify: {
                        command: process.execPath,
                        args: ["-e", "process.stdout.write(require('node:fs').readFileSync('expected.json'))"],
                        expectedFile: "expected.json",
                    },
                },
            ],
        };
        assert.throws(
            () => runSteps(directory, { ...plan, prepare: [...plan.prepare, { id: "broken", script: "broken.cjs" }] }),
            (error) => error.code === "preparation-syntax-failed",
        );
        assert.equal(fs.existsSync(path.join(directory, "expected.json")), false);
        assert.equal(runSteps(directory, plan).status, "passed");
        assert.equal(readJson(path.join(directory, "expected.json")).body, plan.prepare[0].args[0]);
    } finally {
        assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("spiderlings-diagnostics-"));
        fs.rmSync(directory, { recursive: true });
    }
});

test("GitHub identity read failures and account mismatches are distinct and do not execute writes", () => {
    const plan = {
        steps: [
            {
                id: "write",
                command: "gh",
                args: ["issue", "edit"],
                githubAccount: "owner",
                verify: { command: "gh", args: ["api"], expected: { state: "open" } },
            },
        ],
    };
    for (const [code, execute] of [
        [
            "identity-read-failed",
            () => {
                throw Error("EOF");
            },
        ],
        ["identity-mismatch", () => "other-account"],
    ]) {
        let calls = 0;
        assert.throws(
            () =>
                runSteps(".", plan, (...args) => {
                    calls++;
                    return execute(...args);
                }),
            (error) => error.code === code,
        );
        assert.equal(calls, 1);
    }
});

test("readback must match before the next task can run", () => {
    const plan = {
        steps: [
            {
                id: "write",
                command: "gh",
                args: [],
                githubAccount: "owner",
                verify: { command: "gh", args: [], expected: { "object.sha": "expected" } },
            },
            { id: "next", command: "node", args: [] },
        ],
    };
    const responses = ["owner", "written", '{"object":{"sha":"wrong"}}'];
    let calls = 0;
    assert.throws(
        () => runSteps(".", plan, () => responses[calls++]),
        (error) => error.code === "readback-mismatch",
    );
    assert.equal(calls, 3);
});

test("invalid later readback plans are rejected before any command runs", () => {
    let calls = 0;
    const plan = {
        steps: [
            { id: "first", command: "node", args: [] },
            { id: "later", command: "gh", args: [], verify: { command: "gh", args: [], expected: "wrong shape" } },
        ],
    };
    assert.throws(
        () =>
            runSteps(".", plan, () => {
                calls++;
            }),
        /expected JSON fields/,
    );
    assert.equal(calls, 0);
    plan.steps[1].verify.expected = {};
    assert.throws(
        () =>
            runSteps(".", plan, () => {
                calls++;
            }),
        /expected JSON fields/,
    );
    assert.equal(calls, 0);
});

test("scene summaries omit oversized translations, image data and actors", () => {
    const large = "private-image-or-translation".repeat(100000);
    const input = {
        status: "passed",
        game: { version: "5.4.92" },
        checks: [
            { name: "field-command", status: "passed", result: { paidActions: 36, actors: large, images: large } },
            { name: "native-locales", status: "passed", result: { entries: large } },
        ],
    };
    const result = summarizeEvidence(input, "field-command");
    assert.equal(result.scenes[0].paidActions, 36);
    assert.equal(result.scenes.length, 1);
    assert.ok(JSON.stringify(result).length < 1000);
    assert.ok(!JSON.stringify(result).includes("private-image"));
    assert.throws(() => summarizeEvidence(input, "missing"), /No scene/);
});

test("paid-turn evidence exposes phase changes without dumping dispatch state", () => {
    const result = summarizeEvidence({
        turns: [
            { i: 0, phases: ["sealing"], command: { private: true } },
            { i: 1, phases: ["sealing"] },
            { i: 2, phases: ["sealed"], capture: "contest" },
        ],
    }).result;
    assert.equal(result.paidTurns, 3);
    assert.equal(result.phaseChanges.length, 2);
    assert.equal(result.last.capture, "contest");
    assert.ok(!JSON.stringify(result).includes("private"));
    const objective = summarizeEvidence({
        gameVersion: "5.4.92",
        before: {
            method: "SpiderlingsHuntingGrounds",
            objective: { status: "cancelled", reason: "insufficient-space", private: "omitted" },
        },
        after: { method: "Key", canEscape: true },
    });
    assert.equal(objective.gameVersion, "5.4.92");
    assert.equal(objective.result.before.objective.status, "cancelled");
    assert.equal(objective.result.after.method, "Key");
    assert.ok(!JSON.stringify(objective).includes("omitted"));
});
