// Bounded, replayable experiments. Debug target placement and damage are not native combat.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import "./engine.js";

const T = globalThis.SpinnerTopology;
const clone = (v) => JSON.parse(JSON.stringify(v));
const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
if (process.argv[2] === "--replay") {
    const run = JSON.parse(await readFile(process.argv[3], "utf8"));
    const s = clone(run.initial);
    for (const action of run.actions) apply(s, action);
    assert.equal(hash(s), run.finalHash, "Replay diverged. Use the engine revision recorded by the matching summary.");
    console.log(`${run.id}: ${run.actions.length} actions replayed; final state matches.`);
    process.exit(0);
}
const output = new URL(process.argv[2] || "evidence/pacing/", import.meta.url);
await mkdir(output, { recursive: true });
const categories = {
    "Awaiting budget": "budget-delay",
    "Lure duty (stationary model)": "lure",
    "Move to worksite": "movement",
    "Place anchor": "placement",
    "Extend one cell": "extension",
    "Repair anchor 10%": "repair-anchor",
    "Repair link 10%": "repair-link",
    "Reopen gate": "reopen",
    "Waiting for a free work position": "occupancy-delay",
    Idle: "idle",
};
const maps = T.fixedMaps();
const cases = [];
function fresh(id, count, candidate) {
    const s = T.create(
        maps.find((m) => m.id === id),
        "spinner-01",
        count,
    );
    if (candidate) {
        s.analysis.candidates = [clone(candidate)];
        s.analysis.selected = clone(candidate);
    }
    T.plan(s);
    s.analysis.candidates = s.analysis.candidates.filter((c) => c.id === s.candidate);
    return s;
}
function apply(s, action) {
    switch (action.type) {
        case "step":
            return T.step(s);
        case "enter":
            return T.enterCore(s);
        case "target":
            s.target.pos = [...action.pos];
            return;
        case "attack":
            return T.attack(s, action.cell, action.damage, action.aoe);
        case "active": {
            const a = s.groups.flatMap((g) => g.actors).find((a) => a.id === action.id);
            a.active = action.value;
            return;
        }
        case "actor-position": {
            s.groups.flatMap((g) => g.actors).find((a) => a.id === action.id).pos = [...action.pos];
            return;
        }
        case "occupy":
            s.map.occupied.push(action.cell);
            return;
        case "unoccupy":
            s.map.occupied = s.map.occupied.filter((k) => k !== action.cell);
            return;
        case "retire":
            s.fields.forEach((f) => {
                f.retired = true;
            });
            return;
        case "overlap":
            return T.overlap(s);
        default:
            throw Error(`Unknown replay action: ${action.type}`);
    }
}
function observation(s) {
    const v = T.inspect(s);
    return {
        turn: s.turn,
        target: s.target.pos,
        fields: s.fields.map((f) => ({
            id: f.id,
            layer: f.layer,
            phase: f.phase,
            triggered: f.triggered,
            retired: f.retired,
        })),
        actors: s.groups.flatMap((g) =>
            g.actors.map((a) => ({
                id: a.id,
                active: a.active,
                pos: a.pos,
                budget: a.budget,
                category: a.active ? categories[a.last] || a.last : "inactive",
                task: a.task || null,
            })),
        ),
        anchors: Object.values(s.anchors).map((a) => [a.k, a.placed, a.hp, a.cooldown]),
        links: Object.values(s.links).map((l) => [l.id, l.hp, l.cooldown, [...l.built]]),
        ownerless: s.groups.map((g) => [g.id, g.ownerless || 0]),
        physicalCells: v.physicalCells,
        exitReachable: !!v.exitPath.length,
        geometryReady: v.geometryReady,
        violations: v.violations,
        damage: s.lastDamage,
    };
}
function start(id, state, note) {
    const run = { id, note, initial: clone(state), actions: [], trace: [], outcome: null };
    const s = clone(state);
    const act = (action) => {
        apply(s, action);
        run.actions.push(clone(action));
        run.trace.push(clone(observation(s)));
    };
    const ticks = (count) => {
        for (let i = 0; i < count; i++) act({ type: "step" });
    };
    const until = (predicate, limit = 450) => {
        let turns = 0;
        while (!predicate(s) && turns < limit) {
            ticks(1);
            turns++;
        }
        return { completed: !!predicate(s), turns, limit };
    };
    const finish = (outcome) => {
        run.outcome = outcome;
        run.finalHash = hash(s);
        const replay = clone(run.initial);
        for (let i = 0; i < run.actions.length; i++) {
            apply(replay, run.actions[i]);
            assert.deepEqual(observation(replay), run.trace[i], `${id}: replay step ${i}`);
        }
        assert.equal(hash(replay), run.finalHash, `${id}: final replay`);
        const totals = {};
        for (let i = 0; i < run.actions.length; i++)
            if (run.actions[i].type === "step") {
                for (const a of run.trace[i].actors) totals[a.category] = (totals[a.category] || 0) + 1;
            }
        run.costs = totals;
        cases.push(run);
        return s;
    };
    return { s, run, act, ticks, until, finish };
}
const ready = (s) => s.fields.length > 0 && s.fields.every((f) => ["ready", "barrier"].includes(f.phase));
const sealed = (s) => s.fields.length > 0 && s.fields.every((f) => f.phase === "sealed");
const baseline = {};
for (const [id, count] of [
    ["room", 3],
    ["nested", 4],
]) {
    const e = start(
        `baseline-${id}`,
        fresh(id, count),
        "Original fixture actor count and selected geometry; one paid action per actor per world turn.",
    );
    const result = e.until(ready);
    baseline[id] = e.finish(result);
}
const roomCandidate = clone(baseline.room.analysis.selected);
const nestedCandidate = clone(baseline.nested.analysis.selected);
for (const id of ["room", "nested", "corridor"])
    for (const count of [2, 4, 8]) {
        const e = start(
            `${id}-${count}-prebuild`,
            fresh(id, count, id === "room" ? roomCandidate : id === "nested" ? nestedCandidate : undefined),
            "Same candidate across counts. All unaware actors build; alerting assigns one lure. Two actors cannot add the outer layer. Includes travel from original spawn positions.",
        );
        e.finish({ ...e.until(ready), layers: e.s.fields.length });
    }
for (const count of [2, 4, 8]) {
    const s = fresh("room", count, roomCandidate);
    for (const actor of s.groups[0].actors) {
        actor.pos = [...actor.worksite];
        actor.worksiteReached = true;
    }
    const e = start(
        `room-${count}-onsite`,
        s,
        "Separate initial-position fixture: actors start at distinct legal worksites. No gameplay teleport or travel time is included.",
    );
    e.finish({ ...e.until(ready), layers: e.s.fields.length });
}
for (const id of ["room", "nested"])
    for (const timing of ["early", "late", "withdraw"]) {
        const e = start(
            `${id}-${timing}`,
            fresh(id, 4, id === "room" ? roomCandidate : nestedCandidate),
            "Debug target placement, not lure AI. Withdrawal returns target to map start after one closure tick.",
        );
        const prep = timing === "early" ? (e.ticks(5), null) : e.until(ready);
        e.act({ type: "enter" });
        const entryTurn = e.s.turn;
        if (timing === "withdraw") {
            e.ticks(1);
            e.act({ type: "target", pos: e.s.map.start });
        }
        const result = e.until(timing === "withdraw" ? ready : sealed, 450);
        const firstAction = (layer) =>
            e.run.trace.find((t) =>
                t.actors.some(
                    (a) =>
                        ["placement", "extension"].includes(a.category) &&
                        e.s.fields.find((f) => f.id === a.task?.f)?.layer === layer,
                ),
            )?.turn;
        e.finish({ ...result, prep, entryTurn, firstInnerAction: firstAction(0), firstOuterAction: firstAction(1) });
    }
// The same physical shared links receive one owner-independent HP calculation per covered cell.
function damageFixture(length) {
    const s = fresh("overlap", 4);
    const y = 6,
        x = 8;
    const a = `${x},${y}`,
        b = `${x + length - 1},${y}`,
        c = `${x},${y + 4}`;
    s.fields = ["g1", "g2"].map((group, i) => ({
        id: `f${i + 1}`,
        group,
        layer: 0,
        type: "line",
        core: [x, y],
        interior: [],
        bounds: [x, y, x + length - 1, y + 4],
        anchors: [a, b, c],
        links: ["horizontal", "vertical"],
        phase: "barrier",
        triggered: false,
        retired: false,
    }));
    s.groups = [
        { id: "g1", actors: [], fieldIds: ["f1"], active: true },
        { id: "g2", actors: [], fieldIds: ["f2"], active: true },
    ];
    s.anchors = Object.fromEntries(
        [a, b, c].map((k) => [k, { k, placed: true, hp: 2, max: 2, owners: ["f1", "f2"], cooldown: 0 }]),
    );
    s.links = {};
    for (const [id, end] of [
        ["horizontal", b],
        ["vertical", c],
    ]) {
        const cells = T.segment(T.point(a), T.point(end));
        const max = 2 + 0.5 * (cells.length - 1);
        s.links[id] = { id, a, b: end, cells, built: [...cells], hp: max, max, owners: ["f1", "f2"], cooldown: 0 };
    }
    return s;
}
for (const length of [3, 9])
    for (const mode of ["single", "anchor", "aoe", "anchor-aoe"]) {
        const e = start(
            `shared-${length}-${mode}`,
            damageFixture(length),
            "Injected one damage unit per attack; attacks do not advance world turns.",
        );
        const link = e.s.links.horizontal;
        const cell = mode.includes("anchor") ? link.a : link.cells[Math.floor(length / 2)];
        let attacks = 0;
        while (link.hp > 0 && attacks < 40) {
            e.act({ type: "attack", cell, damage: 1, aoe: mode.includes("aoe") });
            attacks++;
        }
        e.finish({ completed: link.hp === 0, attacks, firstHit: e.run.trace[0].damage, owners: link.owners });
    }
// Paired damage pressure uses exactly the same target link, damage and attacker schedule.
for (const repairer of [false, true]) {
    const s = clone(baseline.room),
        edge = Object.values(s.links).find((l) => !l.cells.includes(s.fields[0].gate));
    const cell = edge.cells[Math.floor(edge.cells.length / 2)];
    const e = start(
        `repair-pressure-${repairer}`,
        s,
        "One debug damage unit each world turn. Only one survivor remains; lure duties cease with one actor.",
    );
    for (const a of e.s.groups[0].actors) e.act({ type: "active", id: a.id, value: repairer && a.id === "s2" });
    if (repairer) e.act({ type: "actor-position", id: "s2", pos: [T.point(cell)[0] - 1, T.point(cell)[1]] });
    let attacks = 0;
    while (e.s.links[edge.id].hp > 0 && attacks < 60) {
        e.act({ type: "attack", cell, damage: 1, aoe: false });
        attacks++;
        if (e.s.links[edge.id].hp > 0) e.ticks(1);
    }
    e.finish({ completed: e.s.links[edge.id].hp === 0, attacks, worldTurns: e.s.turn - s.turn });
}
{
    const e = start(
        "broken-link-rebuild",
        baseline.room,
        "Four-turn link cooldown is construction recovery, not capture cooldown.",
    );
    const l = Object.values(e.s.links).find((l) => !l.cells.includes(e.s.fields[0].gate));
    e.act({ type: "attack", cell: l.cells[Math.floor(l.cells.length / 2)], damage: 100, aoe: false });
    const brokenAt = e.s.turn;
    const result = e.until(ready, 120);
    const rebuilt = e.run.trace.find((t) => t.links.some(([id, , , cells]) => id === l.id && cells.length > 0));
    e.finish({ ...result, brokenAt, firstRebuildAfter: rebuilt ? rebuilt.turn - brokenAt : null });
}
{
    const e = start(
        "occupied-target-cell-stall",
        fresh("room", 2, roomCandidate),
        "Target occupies an unbuilt anchor. Static target never evades workers; keep this stall in comparisons.",
    );
    e.act({ type: "target", pos: T.point(e.s.fields[0].anchors[0]) });
    const blocked = e.until(ready, 120);
    e.act({ type: "target", pos: e.s.map.start });
    const recovered = e.until(ready, 150);
    e.finish({ blocked, recovered });
}
{
    const e = start(
        "external-occupant-replan",
        fresh("room", 4, roomCandidate),
        "Static obstacle injected on an unbuilt construction cell; engine must revalidate before building.",
    );
    e.ticks(5);
    e.act({ type: "occupy", cell: e.s.fields[0].anchors[0] });
    const result = e.until(
        (s) =>
            s.fields.some((f) => f.retired) &&
            s.fields.filter((f) => !f.retired).every((f) => ["ready", "barrier"].includes(f.phase)),
        150,
    );
    e.finish(result);
}
{
    const e = start(
        "participant-removal-stall",
        fresh("room", 4, roomCandidate),
        "One surviving Spinner may repair but cannot extend an unfinished structure.",
    );
    e.ticks(12);
    for (const a of e.s.groups[0].actors.slice(1)) e.act({ type: "active", id: a.id, value: false });
    const result = e.until(ready, 120);
    e.finish(result);
}
{
    const e = start(
        "retired-roadblock",
        baseline.room,
        "Explicit retirement fixture, no capture simulation. Surviving owners remain on map.",
    );
    e.act({ type: "retire" });
    const edge = Object.values(e.s.links)[0];
    const cell = edge.cells[Math.floor(edge.cells.length / 2)];
    for (const a of e.s.groups[0].actors) e.act({ type: "active", id: a.id, value: a.id === "s2" });
    e.act({ type: "actor-position", id: "s2", pos: [T.point(cell)[0] - 1, T.point(cell)[1]] });
    e.act({ type: "attack", cell, damage: 0.5, aoe: false });
    const damagedHP = e.s.links[edge.id].hp;
    e.ticks(20);
    e.finish({ retained: T.inspect(e.s).physicalCells > 0, damagedHP, finalHP: e.s.links[edge.id].hp });
}
for (const shared of [false, true]) {
    const e = start(
        `ownerless-${shared ? "shared" : "single"}`,
        baseline.room,
        "Observe 19/20 active-map turns; stagger shared-owner loss by ten turns.",
    );
    if (shared) e.act({ type: "overlap" });
    for (const a of e.s.groups[0].actors) e.act({ type: "active", id: a.id, value: false });
    if (shared) {
        e.ticks(10);
        for (const a of e.s.groups[1].actors) e.act({ type: "active", id: a.id, value: false });
    }
    const lastOwnerLostAt = e.s.turn;
    e.ticks(19);
    const cellsAt19 = T.inspect(e.s).physicalCells;
    e.ticks(1);
    e.finish({ lastOwnerLostAt, cellsAt19, cellsAt20: T.inspect(e.s).physicalCells });
}
const summary = {
    scope: "Abstract geometry and paid construction actions only. No native combat, lure AI, capture, NPC binding or leash simulation.",
    baselineCommit: "27dca6dce33310c016a4f36037ee3a47936233fe",
    engineSHA256: createHash("sha256")
        .update(await readFile(new URL("engine.js", import.meta.url)))
        .digest("hex"),
    assumptions: {
        seed: "spinner-01",
        budgetPerWorldTurn: 1,
        costPerPaidAction: 1,
        movementAndRepairCost: 1.5,
        membership: "fixture",
        movement: "eight-way prototype flood",
        target: "explicit debug placement",
        damage: "injected, no hit/range/tool checks",
        boundedRuns: "Unfinished and stalled runs are retained",
    },
    cases: cases.map((r) => ({
        id: r.id,
        note: r.note,
        outcome: r.outcome,
        costs: r.costs,
        replay: `${r.id}.json`,
        finalHash: r.finalHash,
    })),
};
const result = (id) => cases.find((r) => r.id === id);
const early = result("nested-early");
const firstInnerReady = early.trace.find((t) =>
    t.fields.some((f) => f.layer === 0 && ["ready", "sealed"].includes(f.phase)),
)?.turn;
const nested = result("baseline-nested").initial.fields;
summary.contractChecks = [
    {
        id: "two-spinner-room-within-30",
        passed: result("room-2-prebuild").outcome.completed && result("room-2-prebuild").outcome.turns <= 30,
    },
    {
        id: "four-spinner-onsite-scales",
        passed:
            result("room-4-onsite").outcome.completed &&
            result("room-4-onsite").outcome.turns <= result("room-2-onsite").outcome.turns * 0.65,
    },
    {
        id: "eight-spinner-onsite-scales",
        passed:
            result("room-8-onsite").outcome.completed &&
            result("room-8-onsite").outcome.turns <= result("room-4-onsite").outcome.turns * 0.75,
    },
    {
        id: "arrival-inclusive-more-workers-faster",
        passed:
            result("room-8-prebuild").outcome.turns < result("room-4-prebuild").outcome.turns &&
            result("room-4-prebuild").outcome.turns < result("room-2-prebuild").outcome.turns,
    },
    {
        id: "early-inner-before-outer",
        passed: early.outcome.firstOuterAction >= firstInnerReady,
        actual: { firstInnerReady, firstOuterAction: early.outcome.firstOuterAction },
    },
    { id: "common-core", passed: nested.length === 2 && hash(nested[0].core) === hash(nested[1].core) },
    {
        id: "two-layer-spacing",
        passed: nested.length === 2 && nested[0].bounds.every((v, i) => Math.abs(v - nested[1].bounds[i]) >= 3),
    },
    { id: "two-actors-single-layer", passed: result("nested-2-prebuild").outcome.layers === 1 },
    {
        id: "retired-only-no-repair",
        passed: result("retired-roadblock").outcome.damagedHP === result("retired-roadblock").outcome.finalHP,
    },
    ...["single", "shared"].map((name) => {
        const r = result(`ownerless-${name}`).outcome;
        return { id: `${name}-ownerless-19-20`, passed: r.cellsAt19 > 0 && r.cellsAt20 === 0, actual: r };
    }),
    { id: "broken-link-four-turn-minimum", passed: result("broken-link-rebuild").outcome.firstRebuildAfter >= 4 },
];
function traceDeltas(trace) {
    let previous = {};
    return trace.map((current) => {
        const delta = { turn: current.turn };
        for (const [key, value] of Object.entries(current)) {
            if (hash(value) === hash(previous[key] ?? null)) continue;
            if (["actors", "fields"].includes(key)) {
                delta[key] = value
                    .map((entry) => {
                        const old = previous[key]?.find((v) => v.id === entry.id) || {};
                        return Object.fromEntries(
                            Object.entries(entry).filter(([k, v]) => k === "id" || hash(v) !== hash(old[k] ?? null)),
                        );
                    })
                    .filter((entry) => Object.keys(entry).length > 1);
            } else if (["anchors", "links"].includes(key)) {
                delta[key] = value.filter(
                    (entry) => hash(entry) !== hash(previous[key]?.find((v) => v[0] === entry[0]) ?? null),
                );
            } else delta[key] = value;
        }
        previous = current;
        return delta;
    });
}
for (const r of cases) {
    const serialized = {
        ...r,
        traceFormat:
            "Per-action deltas; actor/field records merge by id, anchor/link tuples replace by first element. Initial observation is complete.",
        trace: traceDeltas(r.trace),
    };
    await writeFile(new URL(`${r.id}.json`, output), JSON.stringify(serialized, null, 2) + "\n");
}
await writeFile(new URL("summary.json", output), JSON.stringify(summary, null, 2) + "\n");
console.log(
    JSON.stringify(
        {
            cases: cases.length,
            contractChecks: summary.contractChecks,
            outcomes: summary.cases.map(({ id, outcome }) => ({ id, outcome })),
        },
        null,
        2,
    ),
);
