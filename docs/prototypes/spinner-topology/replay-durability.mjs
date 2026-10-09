// Focused replays for the settled shared physical-segment graph.
// Damage is injected directly; these cases do not claim native attack behavior.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import "./engine.js";

const T = globalThis.SpinnerTopology;
const clone = (value) => JSON.parse(JSON.stringify(value));
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const output = new URL(process.argv[2] || "evidence/durability/", import.meta.url);

function apply(state, action) {
    switch (action.type) {
        case "attack":
            return T.attack(state, action.cell, action.damage, action.aoe);
        case "owner-active":
            state.groups
                .find((group) => group.id === action.group)
                .actors.forEach((actor) => {
                    actor.active = action.value;
                });
            return;
        case "step":
            return T.step(state);
        default:
            throw Error(`Unknown durability replay action: ${action.type}`);
    }
}

function observation(state) {
    const view = T.inspect(state);
    return {
        turn: state.turn,
        anchors: Object.values(state.anchors).map((anchor) => [
            anchor.k,
            anchor.placed,
            anchor.hp,
            [...anchor.owners],
            anchor.ownerless || 0,
        ]),
        junctions: Object.values(state.junctions || {}).map((junction) => [
            junction.k,
            junction.kind,
            [...junction.links],
            [...junction.owners],
        ]),
        links: Object.values(state.links).map((link) => [
            link.id,
            link.hp,
            link.max,
            [...link.owners],
            [...link.built],
            link.ownerless || 0,
        ]),
        fields: state.fields.map((field) => [field.id, field.phase, field.retired]),
        physicalCells: view.physicalCells,
        geometryReady: view.geometryReady,
        damage: clone(state.lastDamage),
    };
}

if (process.argv[2] === "--replay") {
    const replay = JSON.parse(await readFile(process.argv[3], "utf8")),
        state = clone(replay.initial);
    for (const action of replay.actions) apply(state, action);
    assert.equal(hash(state), replay.finalHash, "Replay diverged from its recorded final state");
    console.log(`${replay.id}: ${replay.actions.length} actions replayed; final state matches.`);
    process.exit(0);
}

await mkdir(output, { recursive: true });
const runs = [];
function start(id, fixture, note) {
    const run = { id, note, initial: clone(fixture), actions: [], observations: [], outcome: null },
        state = clone(fixture);
    const act = (action) => {
        apply(state, action);
        run.actions.push(clone(action));
        run.observations.push(observation(state));
    };
    const finish = (outcome) => {
        run.outcome = outcome;
        run.finalHash = hash(state);
        const replay = clone(run.initial);
        for (let i = 0; i < run.actions.length; i++) {
            apply(replay, run.actions[i]);
            assert.deepEqual(observation(replay), run.observations[i], `${id}: observation ${i}`);
        }
        assert.equal(hash(replay), run.finalHash, `${id}: final state`);
        runs.push(run);
        return state;
    };
    return { state, act, finish };
}

const targets = {
    identical: { anchor: "9,5", cell: "13,5", area: "13,5" },
    partial: { anchor: "13,10", cell: "15,10", area: "15,10" },
    crossing: { anchor: "9,10", cell: "15,10", area: "15,10" },
    nested: { anchor: "12,8", cell: "15,8", area: "15,8" },
};
for (const topology of Object.keys(targets)) {
    for (const mode of ["direct-anchor", "single-cell", "area"]) {
        const fixture = T.durabilityFixture(topology),
            target = targets[topology][mode === "direct-anchor" ? "anchor" : mode === "single-cell" ? "cell" : "area"],
            run = start(
                `${topology}-${mode}`,
                fixture,
                "One injected damage unit. Area mode covers each cell in a 3x3 square; direct-anchor mode uses a real original endpoint.",
            );
        run.act({ type: "attack", cell: target, damage: 1, aoe: mode === "area" });
        const damagedLinks = run.state.lastDamage.map((entry) => entry.id),
            targetAnchor = run.state.anchors[target];
        if (mode === "direct-anchor") {
            assert.equal(targetAnchor.hp, 1, `${topology}: direct anchor HP`);
            assert.deepEqual(
                damagedLinks.sort(),
                Object.values(run.state.links)
                    .filter((link) => link.a === target || link.b === target)
                    .map((link) => link.id)
                    .sort(),
                `${topology}: direct anchor propagation`,
            );
        }
        if (topology === "partial" && mode === "single-cell") {
            assert.equal(damagedLinks.length, 1, "Shared collinear span took duplicate owner damage");
            assert.deepEqual(run.state.links[damagedLinks[0]].owners, ["f1", "f2"]);
        }
        if (topology === "crossing" && mode === "single-cell") {
            assert.equal(targetAnchor, undefined, "The crossing gained an invented anchor");
            assert.equal(damagedLinks.length, 4, "The crossing cell did not damage each incident physical segment");
            assert.equal(T.inspect(run.state).geometryReady, false, "Crossing lines created a capture field");
        }
        run.finish({
            topology,
            mode,
            target,
            damagedLinks: clone(run.state.lastDamage),
            anchorHP: targetAnchor?.hp ?? null,
            physicalSegments: Object.keys(run.state.links).length,
            physicalAnchors: Object.keys(run.state.anchors).length,
            graphJunctions: Object.keys(run.state.junctions).length,
        });
    }
}

{
    const run = start(
        "partial-boundary-breach",
        T.durabilityFixture("partial"),
        "The target starts inside the first closed boundary. Breaking the one shared physical span opens an outside-boundary route for both owners.",
    );
    assert.equal(T.inspect(run.state).fields.find((field) => field.id === "f1").escapePath.length, 0);
    run.act({ type: "attack", cell: targets.partial.cell, damage: 100, aoe: false });
    const fields = T.inspect(run.state).fields;
    assert.equal(fields.find((field) => field.id === "f1").escapePath.length > 0, true);
    run.finish({
        sharedSegmentDestroyed: run.state.lastDamage.length === 1,
        firstOwnerEscapeSteps: fields.find((field) => field.id === "f1").escapePath.length - 1,
        floorExitStillBlocked: T.inspect(run.state).exitPath.length === 0,
    });
}

{
    const run = start(
        "partial-owner-collapse",
        T.durabilityFixture("partial"),
        "Owner loss is staggered. The shared middle span remains through one owner's collapse and survives for 19 turns after final-owner loss.",
    );
    const sharedId = Object.values(run.state.links).find((link) => link.owners.length === 2).id,
        firstOnlyId = Object.values(run.state.links).find(
            (link) => link.owners.length === 1 && link.owners[0] === "f1",
        ).id,
        initialCells = T.inspect(run.state).physicalCells;
    run.act({ type: "owner-active", group: "g1", value: false });
    assert.equal(run.state.links[sharedId].hp > 0, true, "First owner loss deleted the shared span immediately");
    for (let i = 0; i < 19; i++) run.act({ type: "step" });
    assert.equal(run.state.links[firstOnlyId].hp > 0, true, "Exclusive span collapsed before 20 turns");
    assert.equal(run.state.links[sharedId].ownerless || 0, 0, "Shared span counted down while one owner survived");
    run.act({ type: "step" });
    assert.equal(run.state.links[firstOnlyId].hp, 0, "Exclusive span survived its ownerless deadline");
    assert.equal(run.state.links[sharedId].hp > 0, true, "One owner's collapse deleted the survivor's shared span");
    run.act({ type: "owner-active", group: "g2", value: false });
    for (let i = 0; i < 19; i++) run.act({ type: "step" });
    assert.equal(run.state.links[sharedId].hp > 0, true, "Shared span collapsed before 20 final-ownerless turns");
    run.act({ type: "step" });
    assert.equal(run.state.links[sharedId].hp, 0, "Shared span survived the final-owner collapse deadline");
    run.finish({
        initialCells,
        sharedId,
        firstOnlyId,
        firstOwnerExclusiveCollapsedAt: 20,
        sharedCollapsedAfterFinalOwnerLoss: 20,
        finalCells: T.inspect(run.state).physicalCells,
    });
}

const fixtures = Object.fromEntries(
    Object.keys(targets).map((kind) => {
        const state = T.durabilityFixture(kind);
        return [
            kind,
            {
                anchors: Object.keys(state.anchors).length,
                junctions: Object.keys(state.junctions).length,
                segments: Object.values(state.links).map((link) => ({
                    id: link.id,
                    endpoints: [link.a, link.b],
                    owners: link.owners,
                    cells: link.cells.length,
                    maxHP: link.max,
                })),
                captureEligible: T.inspect(state).geometryReady,
            },
        ];
    }),
);
assert.equal(fixtures.partial.segments.filter((segment) => segment.owners.length === 2).length, 1);
assert.equal(fixtures.crossing.anchors, 4);
assert.equal(fixtures.crossing.junctions, 1);
assert.equal(fixtures.crossing.captureEligible, false);
assert.equal(fixtures.nested.captureEligible, true);

const summary = {
    scope: "Settled physical-segment durability model only. Damage is injected; native attacks, resources and balance are not tested.",
    immutableBaselineCommit: "cf9d152ecf986296ba6815a15b2f0c0cefcb93e9",
    engineSHA256: createHash("sha256")
        .update(await readFile(new URL("engine.js", import.meta.url)))
        .digest("hex"),
    rule: {
        graph: "Coalesce consecutive collinear unit edges only while their owner sets match.",
        anchors: "Only original field endpoints have anchor HP and full incident-segment propagation.",
        junctions: "Overlap splits and crossings are graph nodes; non-anchor nodes use ordinary per-cell damage.",
        segmentHP: "Each coalesced physical segment uses max HP 2 + 0.5 * (occupied cells - 1).",
        distance: "Ordinary cell damage uses graph distance to the nearest placed real anchor.",
        ownership:
            "Each physical segment and real anchor remains while any recorded owner is live; the 20-turn clock starts after final-owner loss.",
    },
    fixtures,
    checks: [
        { id: "twelve-damage-replays", passed: runs.filter((run) => run.outcome?.mode).length === 12 },
        {
            id: "partial-one-shared-segment",
            passed: fixtures.partial.segments.filter((segment) => segment.owners.length === 2).length === 1,
        },
        {
            id: "partial-breach-opens-boundary-route",
            passed: runs.find((run) => run.id === "partial-boundary-breach").outcome.firstOwnerEscapeSteps > 0,
        },
        {
            id: "crossing-no-invented-anchor",
            passed: fixtures.crossing.anchors === 4 && fixtures.crossing.junctions === 1,
        },
        { id: "crossing-no-capture", passed: !fixtures.crossing.captureEligible },
        { id: "nested-remains-capture-eligible", passed: fixtures.nested.captureEligible },
        {
            id: "final-owner-collapse-boundary",
            passed:
                runs.find((run) => run.id === "partial-owner-collapse").outcome.sharedCollapsedAfterFinalOwnerLoss ===
                20,
        },
    ],
    cases: runs.map((run) => ({
        id: run.id,
        note: run.note,
        outcome: run.outcome,
        replay: `${run.id}.json`,
        finalHash: run.finalHash,
    })),
};

for (const run of runs) await writeFile(new URL(`${run.id}.json`, output), JSON.stringify(run, null, 2) + "\n");
await writeFile(new URL("summary.json", output), JSON.stringify(summary, null, 2) + "\n");
console.log(JSON.stringify({ cases: runs.length, checks: summary.checks }, null, 2));
