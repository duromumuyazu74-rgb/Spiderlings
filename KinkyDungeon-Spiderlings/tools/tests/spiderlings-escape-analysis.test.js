"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { expandPlan, summarize, parseArguments } = require("../analyze-spiderlings-escape.js");

const plan = () => ({
    seeds: ["paired-1", "paired-2"],
    maxTurns: 100,
    cases: [
        { label: "cut", id: "SpiderlingsWebbingCocoon", method: "Cut", equipment: "full", density: 300 },
        {
            label: "remove",
            id: "SpiderlingsWebbingCocoon",
            method: "Remove",
            equipment: "full",
            density: 300,
            quietTurns: 22,
            overrides: { speedMult: { Remove: 0.4 } },
        },
    ],
});

test("the checked-in native plan is runnable and the supplied historical files keep their original bytes", () => {
    const directory = path.resolve(__dirname, "../../../docs/research/escape-model");
    const nativePlan = JSON.parse(fs.readFileSync(path.join(directory, "quiet-cocoon.json"), "utf8"));
    assert.equal(expandPlan(nativePlan).length, 24);
    for (const [name, expected] of [
        ["escape-model-5.5.4.ipynb", "7d601e8f1b8a309c22087012b9c0ccb7de97ba6e15f4a0de76e438c1973f6a97"],
        ["escape-model-5.5.4.html", "610775965ed874fc115df81b9ec257d4ee15be9d244846dca916e2fc71929763"],
    ])
        assert.equal(
            createHash("sha256")
                .update(fs.readFileSync(path.join(directory, "original", name)))
                .digest("hex"),
            expected,
        );
});

test("paired experiments retain common seeds and explicit native candidate parameters", () => {
    const source = plan(),
        before = JSON.stringify(source),
        rows = expandPlan(source);
    assert.deepEqual(
        rows.map((row) => row.seed),
        ["paired-1", "paired-2", "paired-1", "paired-2"],
    );
    assert.equal(rows[2].quietTurns, 22);
    assert.equal(rows[2].overrides.speedMult.Remove, 0.4);
    assert.equal(JSON.stringify(source), before);
});

test("saved trials preserve their actual equipment, density and tools", () => {
    assert.throws(() => expandPlan(plan(), true), /retain their own equipment/);
    const source = plan();
    for (const entry of source.cases) {
        delete entry.equipment;
        delete entry.density;
    }
    assert.equal(expandPlan(source, true).length, 4);
    source.cases[0].knife = false;
    assert.throws(() => expandPlan(source, true), /retain their own equipment/);
});

test("the mature prison plan uses one real prepared save and a finite total route budget", () => {
    const file = path.resolve(__dirname, "../../../docs/research/escape-model/mature-prison.json");
    const source = JSON.parse(fs.readFileSync(file, "utf8"));
    const rows = expandPlan(source);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((row) => row.route === true && row.maxTurns === 360));
    assert.ok(rows.every((row) => row.equipment === undefined && row.density === undefined));
    source.cases[0].density = 0;
    assert.throws(() => expandPlan(source), /retain their own equipment/);
    delete source.cases[0].density;
    delete source.preparation;
    assert.throws(() => expandPlan(source), /need mature-prison preparation/);
});

test("removing Cocoon does not count as completing a failed prison route", () => {
    const rows = [
        {
            label: "prison",
            seed: "a",
            outcome: "escaped",
            turns: 40,
            actions: 10,
            costs: { stamina: 4, will: 0 },
            route: { outcome: "no-route", turns: 12 },
        },
        {
            label: "prison",
            seed: "b",
            outcome: "escaped",
            turns: 40,
            actions: 10,
            costs: { stamina: 4, will: 0 },
            route: { outcome: "returned-to-source", turns: 50 },
        },
    ];
    const result = summarize(rows)[0];
    assert.equal(result.escaped, 2);
    assert.equal(result.returnedToSource, 1);
    assert.deepEqual(
        result.routes.map((row) => row.outcome),
        ["no-route", "returned-to-source"],
    );
});

test("invalid timing and candidate values are rejected before a native session starts", () => {
    const source = plan();
    source.cases[0].quietTurns = 100;
    assert.throws(() => expandPlan(source), /exhausts the turn budget/);
    source.cases[0].quietTurns = 0;
    source.cases[0].overrides = { speedMult: { Cut: NaN } };
    assert.throws(() => expandPlan(source), /Invalid candidate value/);
    source.cases[0].overrides = { events: [] };
    assert.throws(() => expandPlan(source), /Unsupported candidate parameter/);
    assert.throws(() => parseArguments(["--runtime", "runtime.json"]), /needs --runtime/);
});

test("summary retains censored and blocked samples instead of reporting successful runs alone", () => {
    const rows = [
        { label: "cut", seed: "a", outcome: "escaped", turns: 20, actions: 5, costs: { stamina: 4, will: 1 } },
        { label: "cut", seed: "b", outcome: "turn-budget", turns: 100, actions: 12, costs: { stamina: 8, will: 2 } },
        { label: "cut", seed: "c", outcome: "missing-tool", turns: 0, actions: 0, costs: { stamina: 0, will: 0 } },
    ];
    const summary = summarize(rows)[0];
    assert.equal(summary.samples, 3);
    assert.equal(summary.escaped, 1);
    assert.deepEqual(summary.observedTurns, [0, 100]);
    assert.deepEqual(
        summary.outcomes.map((row) => row.outcome),
        ["escaped", "turn-budget", "missing-tool"],
    );
    assert.deepEqual(summary.staminaSpent, [4, 8, 0]);
});
