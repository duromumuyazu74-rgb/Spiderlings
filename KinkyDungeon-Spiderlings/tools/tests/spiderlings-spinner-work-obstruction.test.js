"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, load } = require("./helpers/spinner-native-runtime.js");

function scene() {
    const nativeCalls = [],
        moves = [],
        c = runtime({
            KDAIType: { hunt: {}, guard: {} },
            KDAllied: () => false,
            KDIsInParty: () => false,
            KDIsImprisoned: () => false,
            KinkyDungeonStatsChoice: new Map(),
            KDEnemyVisionRadius: (enemy) => enemy.Enemy.visionRadius,
            KinkyDungeonCheckLOS: () => true,
            KDHostile: (enemy, target) =>
                !target ||
                target.player ||
                (enemy.Enemy.name !== target.Enemy.name && target.Enemy.name === "Poltergeist"),
            KinkyDungeonEnemyLoop(enemy, target, delta) {
                const aiData = { canSensePlayer: true, canSeePlayer: true, hostile: true, idle: true };
                const ai = c.KDAIType[enemy.AI || "hunt"];
                const handled = ai.beforemove(enemy, target, aiData);
                const attack = ai.attack(enemy, target, aiData);
                const spell = ai.spell(enemy, target, aiData);
                nativeCalls.push({ id: enemy.id, target: target.id, handled, attack, spell, delta });
                return { idle: !handled, attack, spell };
            },
        }).context;
    c.KDMapData.GridWidth = 13;
    c.KDMapData.GridHeight = 13;
    c.KinkyDungeonMapGet = (x, y) => (x > 0 && y > 0 && x < 12 && y < 12 ? "." : "1");
    const snapshot = { width: 13, height: 13, cells: [], entrances: [], exits: [], nests: [] };
    for (let y = 1; y < 12; y++)
        for (let x = 1; x < 12; x++)
            snapshot.cells.push({ x, y, floor: true, walkable: true, protected: false, locked: false });
    Object.assign(c.KinkyDungeonPlayerEntity, { id: 0, x: 10, y: 10 });
    const actor = (id, name, x, y) => ({
        id,
        x,
        y,
        hp: 2,
        aware: true,
        Enemy: { name, movePoints: 1.5, visionRadius: 8 },
    });
    const workers = [actor(1, "Spinner", 4, 4), actor(2, "Spinner", 5, 4)];
    const jumper = actor(3, "Jumper", 3, 4),
        hostile = actor(4, "Poltergeist", 4, 3);
    c.KDMapData.Entities.push(...workers);
    c.KinkyDungeonEnemyTryMove = (enemy, _direction, delta, x, y) => {
        if (!(delta > 0) || c.KinkyDungeonEntityAt(x, y)) return false;
        moves.push({ id: enemy.id, x, y, delta });
        enemy.x = x;
        enemy.y = y;
        return true;
    };
    c.KinkyDungeonFindPath = (x, y, toX, toY) =>
        c.Spiderlings.SpinnerAI.routeOnSnapshot(snapshot, { x, y }, { x: toX, y: toY }).slice(1);
    for (const file of [
        "SpiderlingsSpinnerPassagePlanner.js",
        "SpiderlingsSpinnerAI.js",
        "SpiderlingsFieldCommand.js",
        "SpiderlingsFieldProjects.js",
        "SpiderlingsSpinnerDuties.js",
        "SpiderlingsSpinnerRuntime.js",
    ])
        load(c, file);
    const native = c.Spiderlings.SpinnerNativeField;
    native.initializeEnclosure({
        compositeId: "blocked",
        owners: [1, 2],
        built: true,
        autoSeal: false,
        layers: [
            {
                id: "blocked-inner",
                vertices: [
                    { x: 3, y: 3 },
                    { x: 7, y: 3 },
                    { x: 7, y: 7 },
                    { x: 3, y: 7 },
                ],
                gate: { x: 3, y: 5 },
            },
        ],
    });
    const graph = native.state().topology;
    for (const link of graph.links)
        link.builtCells = link.builtCells.filter(
            (cell) => !(cell.x === jumper.x && cell.y === jumper.y) && !(cell.x === hostile.x && cell.y === hostile.y),
        );
    c.Spiderlings.SpinnerTopology.refresh(graph);
    native.reconcile();
    c.KDMapData.Entities.push(jumper, hostile);
    native.state().builders = {};
    const begin = () =>
        c.Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true, mapSnapshot: snapshot });
    const ai = begin(),
        group = Object.values(ai.groups).find((entry) => entry.planId);
    return { c, native, begin, group, workers, jumper, hostile, moves, nativeCalls };
}

test("a friendly Spiderling on the last unfinished body cell yields through one paid native operation", () => {
    const { c, native, begin, group, workers, jumper, hostile, moves, nativeCalls } = scene();
    const before = native.state().topology.actionLog.length;
    c.KinkyDungeonEnemyLoop(jumper, c.KinkyDungeonPlayerEntity, 0);
    assert.equal(moves.length, 0, "Zero-time entry cannot move a blocker");
    c.KinkyDungeonEnemyLoop(jumper, c.KinkyDungeonPlayerEntity, 1);
    assert.equal(
        moves.filter((move) => move.id === jumper.id).length,
        1,
        "The friendly blocker must clear the work target",
    );
    assert.equal(nativeCalls.at(-1).attack, false, "Yielding occupies the action's attack phase");
    assert.equal(nativeCalls.at(-1).spell, false, "Yielding occupies the action's spell phase");
    assert.equal(native.state().topology.actionLog.length, before, "Yielding cannot build");
    begin();
    assert.ok(
        Object.values(group.assignments).some((assignment) => assignment.type !== "rally"),
        "Workers resume available construction after the friend moves",
    );
    const worker = workers.find(
        (entry) => group.assignments[entry.id]?.type !== "rally" && group.assignments[entry.id],
    );
    for (let turn = 0; turn < 10 && native.state().topology.actionLog.length === before; turn++) {
        begin();
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.ok(native.state().topology.actionLog.length > before, "The cleared task must gain real paid work");
    assert.equal(hostile.x, 4, "Friendly yield cannot move the hostile blocker");
    assert.equal(hostile.y, 3);
});

test("unassigned builders delegate visible hostile work blockers to native combat and resume when cleared", () => {
    const { c, native, begin, group, workers, jumper, hostile, nativeCalls } = scene();
    assert.equal(Object.values(group.assignments).filter((assignment) => assignment.type !== "rally").length, 0);
    c.KinkyDungeonEnemyLoop(workers[0], c.KinkyDungeonPlayerEntity, 1);
    assert.equal(
        nativeCalls.at(-1).target,
        hostile.id,
        "Native target selection should resolve the hostile work obstruction",
    );
    assert.equal(nativeCalls.at(-1).attack, true, "Native attack cadence remains responsible for the hit");
    assert.equal(hostile.hp, 2, "Target selection cannot inflict free damage");
    hostile.hp = 0;
    jumper.x = 9;
    jumper.y = 9;
    c.KinkyDungeonCurrentTick++;
    begin();
    assert.ok(Object.values(group.assignments).some((assignment) => assignment.type !== "rally"));
    const before = native.state().topology.actionLog.length;
    for (let turn = 0; turn < 15 && native.state().topology.actionLog.length === before; turn++) {
        begin();
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.ok(native.state().topology.actionLog.length > before);
});

test("yield preserves real control sources and already committed species actions", () => {
    for (const busy of ["source", "dash", "channel"]) {
        const { c, jumper, moves } = scene();
        if (busy === "source")
            c.Spiderlings.SpinnerNPCRecovery = {
                usesEntity: (id) => id === jumper.id,
                handleEnemyTurn: () => undefined,
            };
        if (busy === "dash")
            c.Spiderlings.JumperDash = { runtimeController: { snapshot: () => [{ sourceId: jumper.id }] } };
        if (busy === "channel") jumper.channel = 2;
        c.KinkyDungeonEnemyLoop(jumper, c.KinkyDungeonPlayerEntity, 1);
        assert.equal(moves.length, 0, `${busy} must keep its actual commitment`);
        assert.equal(jumper.x, 3);
        assert.equal(jumper.y, 4);
    }
});

test("a paid yield waiting for native movement credit does not also attack or cast", () => {
    const { c, jumper, nativeCalls } = scene();
    let attempts = 0;
    c.KinkyDungeonEnemyTryMove = (enemy, _direction, delta) => {
        attempts++;
        enemy.movePoints = (enemy.movePoints || 0) + delta;
        return false;
    };
    c.KinkyDungeonEnemyLoop(jumper, c.KinkyDungeonPlayerEntity, 1);
    assert.equal(attempts, 1);
    assert.equal(jumper.movePoints, 1);
    assert.equal(jumper.x, 3);
    assert.equal(jumper.y, 4);
    assert.equal(nativeCalls.at(-1).attack, false);
    assert.equal(nativeCalls.at(-1).spell, false);
});

test("hidden hostile occupants do not become native combat targets", () => {
    const { c, workers, nativeCalls } = scene();
    c.KinkyDungeonCheckLOS = () => false;
    c.KinkyDungeonEnemyLoop(workers[0], c.KinkyDungeonPlayerEntity, 1);
    assert.equal(nativeCalls.at(-1).target, c.KinkyDungeonPlayerEntity.id);
});

test("an executable alternative job keeps construction instead of targeting a blocker", () => {
    const { c, begin, group, workers, jumper, nativeCalls } = scene();
    jumper.x = 9;
    jumper.y = 9;
    begin();
    const worker = workers.find(
        (entry) => group.assignments[entry.id]?.type !== "rally" && group.assignments[entry.id],
    );
    assert.ok(worker);
    c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
    assert.equal(nativeCalls.at(-1).target, c.KinkyDungeonPlayerEntity.id);
    assert.equal(nativeCalls.at(-1).attack, false);
});

test("changing the same field's request invalidates an earlier action decision", () => {
    const { c, native, workers } = scene();
    const worker = workers[0],
        duties = c.Spiderlings.SpinnerDuties;
    const duty = duties.prepare(worker, c.KinkyDungeonPlayerEntity, 1);
    const member = native.state().command.members[worker.id];
    member.requestId = `${member.commander}:capture`;
    native.state().command.requests[member.requestId] = { closed: false };
    assert.equal(duties.current(worker), duty);
    assert.equal(duty.role, "wait");
    assert.equal(duties.gate(worker), false);
});

test("an inner-ring blocker can pay to yield into free core space inside the complete enclosure footprint", () => {
    const { c, native, begin, workers, jumper, moves, nativeCalls } = scene();
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 1, y: 1 });
    Object.assign(workers[0], { x: 7, y: 6 });
    Object.assign(workers[1], { x: 7, y: 7 });
    c.KDMapData.Entities = [...workers];
    native.initializeEnclosure({
        compositeId: "nested",
        owners: workers.map((worker) => worker.id),
        built: true,
        autoSeal: false,
        layers: [2, 3, 4].map((radius, index) => ({
            id: `nested-${index}`,
            vertices: [
                { x: 7 - radius, y: 7 - radius },
                { x: 7 + radius, y: 7 - radius },
                { x: 7 + radius, y: 7 + radius },
                { x: 7 - radius, y: 7 + radius },
            ],
            gate: { x: 7 - radius, y: 7 },
        })),
    });
    const graph = native.state().topology;
    for (const link of graph.links.filter((entry) => entry.owners.includes("nested-0")))
        link.builtCells = link.builtCells.filter((cell) => cell.x !== 5 || cell.y !== 6);
    c.Spiderlings.SpinnerTopology.refresh(graph);
    native.reconcile();
    Object.assign(jumper, { x: 5, y: 6 });
    c.KDMapData.Entities.push(jumper);
    native.state().builders = {};
    const ai = begin(),
        group = Object.values(ai.groups).find((entry) => entry.planId),
        plan = ai.plans[group.planId];
    // The production enclosure planner reserves its entire site footprint for
    // other projects, including the free core. It is not a list of work cells.
    plan.cells = [];
    for (let y = 3; y <= 11; y++) for (let x = 3; x <= 11; x++) plan.cells.push(`${x},${y}`);
    plan.initialCells = [...plan.cells];
    const pending = c.Spiderlings.SpinnerTopology.nextWorkAction(graph, workers[0].id, workers[0], [], plan.fieldIds);
    assert.deepEqual({ x: pending.cell.x, y: pending.cell.y }, { x: 5, y: 6 });
    assert.equal(native.snapshot({ x: 6, y: 6 }).actorOccupied, false);
    assert.ok(plan.cells.includes("6,6"));
    const offer = c.Spiderlings.SpinnerAI.constructionYield(jumper);
    assert.deepEqual({ x: offer.destination.x, y: offer.destination.y }, { x: 6, y: 6 });
    const paid = native.state().topology.actionLog.length;
    c.KinkyDungeonEnemyLoop(jumper, c.KinkyDungeonPlayerEntity, 0);
    assert.equal(moves.length, 0);
    c.KinkyDungeonEnemyLoop(jumper, c.KinkyDungeonPlayerEntity, 1);
    assert.equal(moves.length, 1);
    assert.deepEqual({ x: jumper.x, y: jumper.y }, { x: 6, y: 6 });
    assert.equal(nativeCalls.at(-1).attack, false);
    assert.equal(nativeCalls.at(-1).spell, false);
    assert.equal(native.state().topology.actionLog.length, paid);
});
