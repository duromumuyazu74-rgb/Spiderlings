"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./helpers/lifecycle-runtime.js");

const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
const plain = (value) => JSON.parse(JSON.stringify(value));

function mapSnapshot(candidateLines) {
    const cells = [];
    for (let y = 1; y < 11; y++)
        for (let x = 1; x < 17; x++) cells.push({ x, y, floor: true, protected: false, locked: false });
    return {
        width: 18,
        height: 12,
        cells,
        entrances: [{ x: 1, y: 6 }],
        exits: [{ x: 16, y: 6 }],
        chokes: [{ x: 8, y: 6 }],
        nests: [{ id: 90, x: 3, y: 3 }],
        candidateLines: candidateLines || [
            [
                { x: 8, y: 4 },
                { x: 8, y: 8 },
            ],
            [
                { x: 13, y: 4 },
                { x: 13, y: 8 },
            ],
            [
                { x: 3, y: 2 },
                { x: 3, y: 5 },
            ],
        ],
    };
}

function spinner(id, x, y, extra = {}) {
    return {
        id,
        x,
        y,
        hp: 2,
        Enemy: { name: "Spinner", movePoints: 1.5, tags: { spiderlings: true } },
        ...extra,
    };
}

function runtime(entities = []) {
    let nextId = 1000;
    const tiles = new Map(),
        movement = [],
        nativeCalls = [],
        phaseCalls = [],
        context = {
            console,
            Spiderlings: {},
            KinkyDungeonEnemies: [{ name: "IceWall", tags: {}, dropTable: [], events: [] }],
            KDMapData: {
                GridWidth: 18,
                GridHeight: 12,
                Entities: entities,
                StartPosition: { x: 1, y: 6 },
                EndPosition: { x: 16, y: 6 },
                ShortcutPositions: {},
                RoomType: "SpinnerAITest",
            },
            KDGameData: { SleepTurns: 0, LastMapSeed: "ai-seed" },
            KinkyDungeonPlayerEntity: { id: 0, player: true, x: 16, y: 10 },
            KinkyDungeonMovableTilesEnemy: ".0",
            KinkyDungeonMovableTilesSmartEnemy: ".0",
            KinkyDungeonCurrentTick: 1,
            KinkyDungeonRootDirectory: "Game/",
            KinkyDungeonFlags: new Map(),
            KDModFiles: { "Bullets/WebSprayTrail.png": {} },
            KDPathConditions: {},
            KDInputTypes: {},
            KDEventMapGeneric: {},
            KDPathCache: new Map(),
            KDPathCacheIgnoreLocks: new Map(),
            KDUpdateEnemyCache: false,
            KDAIType: {
                hunt: {
                    beforemove: () => false,
                    attack(enemy) {
                        phaseCalls.push({ phase: "attack", id: enemy.id });
                        return true;
                    },
                    spell(enemy) {
                        phaseCalls.push({ phase: "spell", id: enemy.id });
                        return true;
                    },
                },
                wander: { beforemove: () => false },
            },
            KDMapInit: (values) => Object.fromEntries(values.map((value) => [value, true])),
            KinkyDungeonMapGet: (x, y) =>
                x > 0 && y > 0 && x < context.KDMapData.GridWidth - 1 && y < context.KDMapData.GridHeight - 1
                    ? "."
                    : "1",
            KinkyDungeonTilesGet: (key) => tiles.get(key),
            KinkyDungeonEntityAt(x, y) {
                if (context.KinkyDungeonPlayerEntity.x === x && context.KinkyDungeonPlayerEntity.y === y)
                    return context.KinkyDungeonPlayerEntity;
                return context.KDMapData.Entities.find((entity) => entity.hp > 0 && entity.x === x && entity.y === y);
            },
            DialogueCreateEnemy(x, y, name) {
                if (context.KinkyDungeonEntityAt(x, y)) return undefined;
                const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === name);
                const entity = { id: nextId++, x, y, hp: definition.maxhp, Enemy: definition };
                context.KDMapData.Entities.push(entity);
                return entity;
            },
            KDHostile: (entity, target) =>
                target ? target.hostileToSpinner !== false : !entity.allied && !entity.party && !entity.imprisoned,
            KDAllied: (entity) => !!entity.allied,
            KDIsInParty: (entity) => !!entity.party,
            KDIsImprisoned: (entity) => !!entity.imprisoned,
            KinkyDungeonIsDisabled: (entity) => !!entity.disabled,
            KDHelpless: (entity) => !!entity.helpless,
            KinkyDungeonCheckPath: () => true,
            KinkyDungeonCheckLOS: () => true,
            KinkyDungeonGetBuffedStat: () => 0,
            KinkyDungeonMultiplicativeStat: () => 1,
            KDBoundEffects: () => 0,
            KinkyDungeonApplyBuffToEntity() {},
            KDMoveEntity(entity, x, y) {
                if (context.KinkyDungeonEntityAt(x, y)) return false;
                entity.x = x;
                entity.y = y;
                return true;
            },
            KinkyDungeonFindPath(fromX, fromY, toX, toY) {
                return context.Spiderlings.SpinnerAI.routeOnSnapshot(
                    context.testSnapshot || mapSnapshot(),
                    { x: fromX, y: fromY },
                    { x: toX, y: toY },
                ).slice(1);
            },
            KinkyDungeonEnemyTryMove(enemy, direction, _delta, x, y) {
                if (!(_delta > 0) || context.KinkyDungeonEntityAt(x, y)) return false;
                movement.push({ id: enemy.id, direction: plain(direction), x, y });
                enemy.x = x;
                enemy.y = y;
                return true;
            },
            KinkyDungeonEnemyLoop(enemy, target, _delta) {
                nativeCalls.push(enemy.id);
                const aiData = {
                        canSensePlayer: !!enemy.testSense,
                        canSeePlayer: !!enemy.testSense,
                        hostile: true,
                        aggressive: true,
                        idle: true,
                        ...(enemy.testAIData || {}),
                    },
                    handled = context.KDAIType[enemy.Enemy.AI || "hunt"].beforemove(enemy, target, aiData),
                    attacked = context.KDAIType.hunt.attack(enemy, target, aiData),
                    cast = context.KDAIType.hunt.spell(enemy, target, aiData);
                if (aiData.idle) enemy.movePoints = 0;
                enemy.testIdle = aiData.idle;
                return { idle: aiData.idle, handled, attacked, cast, defeat: false, defeatEnemy: enemy };
            },
            KDAddEvent(map, trigger, name, handler) {
                map[trigger] ||= {};
                map[trigger][name] = handler;
            },
        };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    load(context, "SpiderlingsCore.js");
    load(context, "SpiderlingsSpinnerTopology.js");
    load(context, "SpiderlingsSpinnerNativeField.js");
    load(context, "SpiderlingsSpinnerAI.js");
    load(context, "SpiderlingsSpinnerScenarios.js");
    context.Spiderlings.SpinnerField = { handleEnemyTurn: () => undefined };
    context.Spiderlings.SpinnerCapture = { handleEnemyTurn: () => undefined };
    load(context, "SpiderlingsSpinnerRuntime.js");
    context.Spiderlings.Prison = {
        isPrison: () => context.KDMapData.RoomType === "SpiderlingsNestPrison" && !!context.KDMapData.SpiderlingsPrison,
    };
    load(context, "SpiderlingsPrisonAlerts.js");
    return { context, tiles, movement, nativeCalls, phaseCalls };
}

function start(r, snapshot = mapSnapshot()) {
    r.context.testSnapshot = snapshot;
    return r.context.Spiderlings.SpinnerAI.beginTurn({ activate: true, mapSnapshot: snapshot });
}

function prisonSnapshot() {
    const cells = [];
    for (let y = 1; y < 44; y++)
        for (let x = 1; x < 54; x++) cells.push({ x, y, floor: true, protected: false, locked: false });
    return {
        width: 55,
        height: 45,
        cells,
        entrances: [{ x: 11, y: 22 }],
        exits: [{ x: 51, y: 22 }],
        chokes: [],
        nests: [],
        candidateLines: [
            [
                { x: 10, y: 20 },
                { x: 10, y: 24 },
            ],
            [
                { x: 25, y: 20 },
                { x: 25, y: 24 },
            ],
            [
                { x: 35, y: 20 },
                { x: 35, y: 24 },
            ],
            [
                { x: 39, y: 20 },
                { x: 39, y: 24 },
            ],
        ],
    };
}

function prisonRuntime(entities) {
    const r = runtime(entities);
    r.context.KDMapData.GridWidth = 55;
    r.context.KDMapData.GridHeight = 45;
    r.context.KDMapData.RoomType = "SpiderlingsNestPrison";
    r.context.KDMapData.StartPosition = { x: 11, y: 22 };
    r.context.KDMapData.EndPosition = { x: 51, y: 22 };
    r.context.KDMapData.SpiderlingsPrison = { version: 1 };
    r.context.KinkyDungeonPlayerEntity.x = 11;
    r.context.KinkyDungeonPlayerEntity.y = 22;
    return r;
}

test("prison report requires real sight and alerts only nearby placement-capable Spiderlings", () => {
    const observer = { id: 1, x: 9, y: 22, hp: 2, Enemy: { name: "Jumper", tags: { spiderlings: true } } },
        local = spinner(2, 12, 22),
        remote = spinner(3, 35, 22),
        localBuilder = spinner(4, 13, 22),
        r = prisonRuntime([observer, local, remote, localBuilder]),
        alert = r.context.Spiderlings.PrisonAlerts,
        player = r.context.KinkyDungeonPlayerEntity;
    observer.testSense = true;
    observer.testAIData = { canSeePlayer: false, canSeePlayerChase: true };
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    assert.equal(alert.currentReport(), undefined, "hearing and chase perception do not report a sighting");
    observer.aware = true;
    observer.testAIData = { canSeePlayer: false };
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    assert.equal(alert.currentReport(), undefined, "awareness alone does not report a sighting");
    observer.testAIData = { canSeePlayer: true };
    r.context.KinkyDungeonEnemyLoop(observer, { id: 99, hp: 2, x: 11, y: 22 }, 1);
    assert.equal(alert.currentReport(), undefined, "an NPC target is not a player sighting");
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    assert.deepEqual(plain(alert.currentReport()), {
        x: 11,
        y: 22,
        region: "chamber",
        serial: 1,
        age: 0,
        tick: 1,
    });
    assert.equal(local.aware, true);
    assert.deepEqual([local.gx, local.gy], [11, 22]);
    assert.equal(remote.aware, undefined);
    assert.equal(remote.gx, undefined);
    start(r, prisonSnapshot());
    r.phaseCalls.length = 0;
    r.context.KinkyDungeonEnemyLoop(local, player, 1);
    assert.equal(r.phaseCalls.length, 2, "alerted local Spinner delegates its response to native movement and combat");
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    assert.equal(alert.currentReport().serial, 1, "two observations in one tick do not duplicate a report");
    r.context.KinkyDungeonCurrentTick++;
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    assert.equal(
        alert.currentReport().serial,
        1,
        "a renewed sighting of the same tile refreshes age without rerolling jobs",
    );
});

test("prison groups keep stable home regions and distant plans use only the saved report", () => {
    const observer = { id: 1, x: 9, y: 22, hp: 2, Enemy: { name: "Jumper", tags: { spiderlings: true } } },
        actors = [
            spinner(2, 19, 22),
            spinner(3, 20, 22),
            spinner(4, 21, 22),
            spinner(5, 22, 22),
            spinner(6, 34, 22),
            spinner(7, 35, 22),
        ],
        r = prisonRuntime([observer, ...actors]),
        snapshot = prisonSnapshot(),
        player = r.context.KinkyDungeonPlayerEntity;
    r.context.Spiderlings.PrisonNest = { ordinaryConstructionAllowed: (cell) => cell.x > 20 };
    observer.testSense = true;
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    const ai = start(r, snapshot),
        groups = Object.values(ai.groups),
        main = groups.find((group) => group.homeRegion === "main-nest");
    assert.deepEqual(
        groups.map((group) => group.homeRegion).sort(),
        ["chamber", "crossroads", "main-nest"],
        "one-step neighbors across the boundary do not merge",
    );
    assert.deepEqual(plain(main.remoteSighting), { x: 11, y: 22, region: "chamber", serial: 1 });
    assert.equal(groups.find((group) => group.homeRegion === "chamber").planId, null);
    assert.equal(main.engagement, undefined);
    assert.equal(ai.plans[main.planId].reportSerial, 1);
    assert.ok(
        ai.plans[main.planId].anchors.every(
            (cell) => r.context.Spiderlings.PrisonAlerts.regionAt(cell) === "main-nest",
        ),
    );
    player.x = 14;
    player.y = 24;
    start(r, snapshot);
    assert.deepEqual(plain(main.remoteSighting), { x: 11, y: 22, region: "chamber", serial: 1 });
    assert.equal(main.engagement, undefined, "no sight leaves distant builders out of native pursuit");
    r.context.KinkyDungeonCurrentTick++;
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    start(r, snapshot);
    assert.deepEqual(plain(main.remoteSighting), { x: 14, y: 24, region: "chamber", serial: 2 });
    assert.equal(ai.plans[main.planId].reportSerial, 1, "an assigned line keeps its physical job while reports update");
});

test("remote ambush builders travel and construct with paid actions; stale saved reports do not duplicate jobs", () => {
    const observer = { id: 1, x: 9, y: 22, hp: 2, Enemy: { name: "Jumper", tags: { spiderlings: true } } },
        actors = [spinner(2, 32, 19), spinner(3, 33, 19)],
        r = prisonRuntime([observer, ...actors]),
        snapshot = prisonSnapshot(),
        player = r.context.KinkyDungeonPlayerEntity;
    observer.testSense = true;
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    let ai = start(r, snapshot),
        group = Object.values(ai.groups)[0];
    assert.equal(group.homeRegion, "main-nest");
    for (let turn = 0; turn < 20; turn++) {
        start(r, snapshot);
        for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, player, 1);
        r.context.Spiderlings.PrisonAlerts.advance(1);
        r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
        r.context.KinkyDungeonCurrentTick++;
    }
    assert.ok(group.metrics.travel > 0, "builders walk to an in-region work cell");
    assert.ok(group.metrics.construction > 0, "the ordinary field uses paid topology actions");
    assert.ok(r.movement.every((move) => r.context.Spiderlings.PrisonAlerts.regionAt(move) === "main-nest"));
    assert.equal(
        r.context.Spiderlings.PrisonAlerts.currentReport(),
        undefined,
        "the report expires after twelve turns",
    );
    const plans = Object.keys(ai.plans).length,
        topology = plain(r.context.Spiderlings.SpinnerNativeField.state().topology);
    r.context.KDMapData = plain(r.context.KDMapData);
    r.context.Spiderlings.PrisonAlerts.audit();
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    r.context.Spiderlings.SpinnerNativeField.reconcile();
    r.context.Spiderlings.PrisonAlerts.audit();
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    ai = start(r, snapshot);
    group = Object.values(ai.groups)[0];
    assert.equal(group.remoteSighting, undefined);
    assert.equal(Object.keys(ai.plans).length, plans);
    assert.deepEqual(plain(r.context.Spiderlings.SpinnerNativeField.state().topology), topology);
    assert.ok(
        Object.values(group.assignments).every(
            (assignment) => r.context.Spiderlings.PrisonAlerts.regionAt(assignment.workCell) === "main-nest",
        ),
    );
});

test("remote prison ambush anchors flank the reported route when crossing lines exist", () => {
    const actors = [spinner(2, 34, 18), spinner(3, 38, 18)],
        r = prisonRuntime(actors),
        snapshot = prisonSnapshot(),
        group = {
            id: "remote",
            homeRegion: "main-nest",
            source: { type: "nest", nestId: 90 },
            members: actors,
            remoteSighting: { x: 11, y: 22, region: "chamber", serial: 1 },
        };
    snapshot.candidateLines = [
        [
            { x: 39, y: 22 },
            { x: 41, y: 22 },
        ],
        [
            { x: 40, y: 20 },
            { x: 40, y: 24 },
        ],
    ];
    const candidates = r.context.Spiderlings.SpinnerAI.analyzeLineCandidates(snapshot, group);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every((candidate) => candidate.anchors.every((anchor) => anchor.y !== 22)));
    assert.ok(candidates.every((candidate) => candidate.cells.some((cell) => cell.y === 22)));
});

test("living prison nests disqualify line cells and replace an unpaid blocked plan", () => {
    const observer = { id: 1, x: 9, y: 22, hp: 2, Enemy: { name: "Jumper", tags: { spiderlings: true } } },
        actors = [spinner(2, 34, 18), spinner(3, 38, 18)],
        r = prisonRuntime([observer, ...actors]),
        snapshot = prisonSnapshot(),
        blocked = [
            { x: 34, y: 22 },
            { x: 38, y: 22 },
        ],
        available = [
            { x: 33, y: 24 },
            { x: 37, y: 24 },
        ],
        player = r.context.KinkyDungeonPlayerEntity;
    observer.testSense = true;
    r.context.KinkyDungeonEnemyLoop(observer, player, 1);
    snapshot.candidateLines = [blocked];
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        oldPlan = ai.plans[group.planId];
    assert.deepEqual(plain(oldPlan.anchors), blocked);

    r.context.KDMapData.Entities.push(
        ...blocked.map((point, index) => ({ id: 90 + index, ...point, hp: 5, Enemy: { name: "NestEntrance" } })),
    );
    snapshot.nests = blocked.map((point, index) => ({ id: 90 + index, ...point }));
    snapshot.candidateLines.push(available);
    start(r, snapshot);
    const replacement = ai.plans[group.planId];
    assert.notEqual(replacement.id, oldPlan.id);
    assert.equal(oldPlan.status, "invalid");
    assert.deepEqual(plain(replacement.anchors), available);
    assert.ok(
        Object.values(group.assignments).every(
            (assignment) => r.context.Spiderlings.PrisonAlerts.regionAt(assignment.workCell) === group.homeRegion,
        ),
    );

    for (let turn = 0; turn < 20; turn++) {
        start(r, snapshot);
        for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, player, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    assert.ok(group.metrics.travel > 0);
    assert.ok(group.metrics.construction > 0);
});

test("a prison builder reassigns a work cell occupied by a living nest", () => {
    const actors = [spinner(2, 34, 18), spinner(3, 38, 18)],
        r = prisonRuntime(actors),
        snapshot = prisonSnapshot(),
        player = r.context.KinkyDungeonPlayerEntity;
    snapshot.candidateLines = [
        [
            { x: 35, y: 20 },
            { x: 35, y: 24 },
        ],
    ];
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        originalPlan = group.planId,
        oldWork = plain(group.assignments[actors[0].id].workCell);
    r.context.KDMapData.Entities.push({
        id: 90,
        ...oldWork,
        hp: 5,
        Enemy: { name: "NestEntrance" },
    });
    snapshot.nests.push({ id: 90, ...oldWork });
    start(r, snapshot);
    assert.equal(group.planId, originalPlan, "the legal line remains selected");
    assert.ok(
        Object.values(group.assignments).every(
            (assignment) => `${assignment.workCell.x},${assignment.workCell.y}` !== `${oldWork.x},${oldWork.y}`,
        ),
        "a saved assignment cannot retain a permanent nest obstruction",
    );
    for (let turn = 0; turn < 20; turn++) {
        start(r, snapshot);
        for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, player, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    assert.ok(group.metrics.construction > 0);
});

test("a prison builder prefers a free work cell when another spiderling blocks its saved approach", () => {
    const actors = [spinner(2, 34, 18), spinner(3, 38, 18)],
        r = prisonRuntime(actors),
        snapshot = prisonSnapshot(),
        player = r.context.KinkyDungeonPlayerEntity;
    snapshot.candidateLines = [
        [
            { x: 35, y: 20 },
            { x: 35, y: 24 },
        ],
    ];
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        originalPlan = group.planId,
        oldWork = plain(group.assignments[actors[0].id].workCell);
    r.context.KDMapData.Entities.push({
        id: 90,
        ...oldWork,
        hp: 5,
        Enemy: { name: "Tunneler" },
    });
    start(r, snapshot);
    assert.equal(group.planId, originalPlan);
    assert.notDeepEqual(plain(group.assignments[actors[0].id].workCell), oldWork);
    for (let turn = 0; turn < 20; turn++) {
        start(r, snapshot);
        for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, player, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    assert.ok(group.metrics.construction > 0);
});

test("a paid builder attempt stays non-idle while native movement points accumulate", () => {
    const actors = [spinner(2, 34, 18), spinner(3, 38, 18)],
        r = prisonRuntime(actors),
        snapshot = prisonSnapshot(),
        player = r.context.KinkyDungeonPlayerEntity,
        nativeMove = r.context.KinkyDungeonEnemyTryMove;
    snapshot.candidateLines = [
        [
            { x: 35, y: 20 },
            { x: 35, y: 24 },
        ],
    ];
    r.context.KinkyDungeonEnemyTryMove = (enemy, direction, delta, x, y) => {
        enemy.movePoints = (enemy.movePoints || 0) + delta;
        if (enemy.movePoints < 1.5) return false;
        enemy.movePoints -= 1.5;
        return nativeMove(enemy, direction, delta, x, y);
    };
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0];
    r.context.KinkyDungeonEnemyLoop(actors[0], player, 1);
    assert.equal(actors[0].testIdle, false, "KD must retain the unpaid movement-point balance");
    assert.equal(actors[0].movePoints, 1);
    assert.equal(group.metrics.travel, 0);
    r.context.KinkyDungeonCurrentTick++;
    start(r, snapshot);
    r.context.KinkyDungeonEnemyLoop(actors[0], player, 1);
    assert.ok(group.metrics.travel > 0, "the next paid native attempt reaches its threshold");
    assert.ok(r.movement.length > 0);
});

test("groups require eligible hostile Spinners within ten path steps and keep stable identity", () => {
    const actors = [
            spinner(1, 1, 2, { SpiderlingsSquadProvenance: "guaranteed" }),
            spinner(2, 11, 2, { SpiderlingsSquadProvenance: "natural" }),
            spinner(3, 16, 10, { allied: true }),
            spinner(4, 16, 9, { party: true }),
            spinner(5, 16, 8, { imprisoned: true }),
            spinner(6, 16, 7, { helpless: true }),
            { id: 7, x: 2, y: 2, hp: 2, Enemy: { name: "Jumper" } },
        ],
        provenance = actors.slice(0, 2).map((actor) => actor.SpiderlingsSquadProvenance),
        r = runtime(actors),
        state = start(r);
    assert.deepEqual(Object.keys(plain(state.groups)), ["spinner-group-1"]);
    assert.deepEqual(plain(state.groups["spinner-group-1"].memberIds), [1, 2]);
    assert.deepEqual(
        actors.slice(0, 2).map((actor) => actor.SpiderlingsSquadProvenance),
        provenance,
    );

    const savedId = state.groups["spinner-group-1"].id;
    actors[0].x = 6;
    actors.push(spinner(8, 12, 3, { SpiderlingsNestParentID: 90 }));
    start(r);
    assert.equal(state.groups[savedId].id, savedId);
    assert.deepEqual(plain(state.groups[savedId].memberIds), [1, 2, 8]);
    assert.equal(actors.at(-1).SpiderlingsNestParentID, 90);
});

test("saved deterministic selection uses topology and provenance without target position", () => {
    const r = runtime([spinner(1, 2, 2), spinner(2, 3, 2)]),
        api = r.context.Spiderlings.SpinnerAI,
        ordinary = { id: "g1", source: { type: "ordinary" }, members: [{ x: 2, y: 2 }] },
        nest = { id: "g2", source: { type: "nest", nestId: 90 }, members: [{ x: 2, y: 2 }] },
        firstSnapshot = { ...mapSnapshot(), hiddenTarget: { x: 2, y: 9 } },
        secondSnapshot = { ...mapSnapshot(), hiddenTarget: { x: 15, y: 2 } },
        first = api.analyzeLineCandidates(firstSnapshot, ordinary),
        second = api.analyzeLineCandidates(secondSnapshot, ordinary),
        nearNest = api.analyzeLineCandidates(firstSnapshot, nest);
    assert.deepEqual(plain(first), plain(second));
    assert.ok(first[0].anchors[0].x >= 8, "ordinary groups prefer route, choke, and exit lines");
    assert.equal(nearNest[0].anchors[0].x, 3, "nest groups rank the nest-defense line first");

    const encounter = r.context.Spiderlings.SpinnerNativeField.ensureMap(),
        state = api.ensureAI(encounter, { mapSeed: "fixed", mapIdentity: "room" }),
        group = { id: "saved", selectionOrdinal: 0, planId: null };
    state.groups.saved = group;
    const chosen = api.selectSavedPlan(state, group, first),
        restored = plain(state),
        again = api.selectSavedPlan(restored, restored.groups.saved, first);
    assert.equal(again.id, chosen.id);
    assert.equal(again.candidateId, chosen.candidateId);
    assert.equal(restored.groups.saved.selectionOrdinal, 0);
});

test("corridor, T, cross, and exit fixtures use the same legal line analyzer", () => {
    const r = runtime([spinner(1, 2, 2), spinner(2, 3, 2)]),
        api = r.context.Spiderlings.SpinnerAI,
        group = { id: "fixture", source: { type: "ordinary" }, members: [{ x: 2, y: 2 }] },
        fixtures = [
            { name: "corridor", chokes: [{ x: 8, y: 6 }], exits: [{ x: 16, y: 6 }], expectedX: 8 },
            { name: "T", chokes: [{ x: 3, y: 4 }], exits: [{ x: 16, y: 6 }], expectedX: 3 },
            { name: "cross", chokes: [{ x: 8, y: 6 }], exits: [{ x: 16, y: 6 }], expectedX: 8 },
            { name: "exit", chokes: [], exits: [{ x: 16, y: 6 }], expectedX: 13 },
        ];
    for (const fixture of fixtures) {
        const snapshot = { ...mapSnapshot(), chokes: fixture.chokes, exits: fixture.exits },
            candidates = api.analyzeLineCandidates(snapshot, group);
        assert.ok(candidates.length > 0, `${fixture.name} has a legal line`);
        assert.equal(candidates[0].anchors[0].x, fixture.expectedX, `${fixture.name} priority`);
        assert.ok(
            candidates[0].cells.every(
                (cell) => !snapshot.entrances.some((point) => cellKeyForTest(point) === cellKeyForTest(cell)),
            ),
            `${fixture.name} preserves entrances`,
        );
    }
});

test("separate groups activate separate saved lines and never merge after meeting", () => {
    const actors = [spinner(1, 1, 2), spinner(2, 2, 2), spinner(3, 15, 9), spinner(4, 16, 9)],
        r = runtime(actors),
        ai = start(r),
        encounter = r.context.Spiderlings.SpinnerNativeField.state();
    assert.equal(Object.keys(ai.groups).length, 2);
    assert.equal(Object.keys(ai.plans).length, 2);
    assert.equal(encounter.topology.version, 2);
    assert.equal(
        Object.values(encounter.topology.lineFields).filter((field) => !field.retired).length,
        2,
        "both plans share one schema-2 physical graph",
    );
    actors[2].x = 3;
    actors[2].y = 2;
    actors[3].x = 4;
    actors[3].y = 2;
    start(r);
    assert.equal(Object.keys(ai.groups).length, 2, "saved groups do not merge when their members meet");
});

test("the schema-2 graph accepts independently owned lines without a global field cap", () => {
    const r = runtime(),
        nativeField = r.context.Spiderlings.SpinnerNativeField,
        encounter = nativeField.ensureMap();
    for (let index = 0; index < 6; index++)
        nativeField.addLine({
            fieldId: `uncapped-${index}`,
            owners: [index * 2 + 1, index * 2 + 2],
            anchors: [
                { x: 2, y: index + 2 },
                { x: 4, y: index + 2 },
            ],
        });
    assert.equal(encounter.topology.version, 2);
    assert.equal(Object.values(encounter.topology.lineFields).filter((field) => !field.retired).length, 6);
    assert.equal(encounter.topology.anchors.length, 12);
});

test("dynamic occupancy waits without reroll while static invalidation saves one replacement", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        snapshot = mapSnapshot(),
        ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        originalPlan = ai.plans[group.planId],
        assignment = group.assignments[1] || group.assignments[2],
        blocker = { id: 70, x: assignment.target.x, y: assignment.target.y, hp: 3, Enemy: { name: "Bandit" } };
    r.context.KDMapData.Entities.push(blocker);
    const worker = actors.find((actor) => group.assignments[actor.id]);
    r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
    assert.equal(group.lastAction, "wait");
    assert.equal(group.planId, originalPlan.id);
    r.context.KDMapData.Entities.splice(r.context.KDMapData.Entities.indexOf(blocker), 1);
    r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
    assert.notEqual(group.lastAction, undefined);
    assert.equal(group.planId, originalPlan.id);

    const invalid = plain(snapshot),
        invalidCell = invalid.cells.find((cell) => cellKeyForTest(cell) === originalPlan.cells[0]);
    invalidCell.protected = true;
    start(r, invalid);
    assert.notEqual(group.planId, originalPlan.id);
    assert.equal(group.selectionOrdinal, 1);
    assert.equal(ai.plans[originalPlan.id].status, "invalid");
});

test("a statically blocked approach abandons instead of waiting forever", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        snapshot = mapSnapshot(),
        ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        blocked = plain(snapshot);
    for (const actor of actors)
        for (const direction of [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: -1, y: -1 },
        ]) {
            const cell = blocked.cells.find(
                (candidate) => candidate.x === actor.x + direction.x && candidate.y === actor.y + direction.y,
            );
            if (cell) cell.floor = false;
        }
    start(r, blocked);
    assert.equal(ai.plans[plan.id].status, "invalid");
    assert.equal(ai.plans[plan.id].invalidReason, "approach");
    assert.equal(group.planId, null);
});

function cellKeyForTest(cell) {
    return `${cell.x},${cell.y}`;
}

test("live native perception establishes one lure without a construction action", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        worker = actors.find((actor) => group.assignments[actor.id]);
    worker.testSense = true;
    worker.aware = true;
    const before = plain(group.metrics);
    r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
    assert.equal(group.engagement.target.kind, "player");
    assert.equal(group.engagement.lureId, worker.id);
    assert.equal(group.metrics.construction, before.construction);
    assert.equal(group.metrics.repair, before.repair);
    assert.equal(
        r.phaseCalls.some((entry) => entry.id === worker.id),
        false,
    );
    assert.deepEqual(r.nativeCalls, [worker.id]);
});

test("native player and hostile NPC targets establish one stable target without player priority", () => {
    const actors = [spinner(1, 4, 4), spinner(2, 4, 8)],
        npc = { id: 50, x: 6, y: 4, hp: 4, hostileToSpinner: true, Enemy: { name: "Escort" } },
        r = runtime([...actors, npc]),
        ai = start(r),
        group = Object.values(ai.groups)[0];
    actors[0].aware = true;
    actors[0].testSense = true;
    r.context.KinkyDungeonEnemyLoop(actors[0], npc, 1);
    assert.deepEqual(plain(group.engagement.target), { kind: "npc", id: 50 });
    assert.equal(group.engagement.lureId, actors[0].id);

    actors[1].aware = true;
    actors[1].testSense = true;
    r.context.KinkyDungeonEnemyLoop(actors[1], r.context.KinkyDungeonPlayerEntity, 1);
    assert.deepEqual(
        plain(group.engagement.target),
        { kind: "npc", id: 50 },
        "native retargeting does not rotate the saved target",
    );

    const unseen = runtime([spinner(3, 4, 4), spinner(4, 4, 8)]),
        unseenAI = start(unseen),
        unseenGroup = Object.values(unseenAI.groups)[0];
    unseen.context.KDMapData.Entities[0].aware = true;
    unseen.context.KinkyDungeonEnemyLoop(
        unseen.context.KDMapData.Entities[0],
        unseen.context.KinkyDungeonPlayerEntity,
        1,
    );
    assert.equal(unseenGroup.engagement, undefined, "awareness without computed sensing is not an observation");
});

test("last-known data expires at age four and native pursuit resumes after eight turns without sight", () => {
    const actors = [spinner(1, 4, 4), spinner(2, 4, 8)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        target = r.context.KinkyDungeonPlayerEntity;
    actors[0].aware = true;
    actors[0].testSense = true;
    target.x = 10;
    target.y = 5;
    r.context.KinkyDungeonEnemyLoop(actors[0], target, 1);
    assert.deepEqual(plain(group.engagement.lastKnown), { x: 10, y: 5, dx: 0, dy: 0, age: 0, source: "native" });
    r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
    assert.equal(group.engagement.lastKnown.age, 1);

    actors[0].testSense = false;
    target.x = 15;
    target.y = 9;
    for (let turn = 0; turn < 3; turn++) r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
    assert.equal(group.engagement.lastKnown, undefined, "age four clears the saved coordinate and direction");
    assert.equal(group.engagement.noSightTurns, 3);
    for (let turn = 0; turn < 4; turn++) r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
    assert.equal(group.engagement.noSightTurns, 7);
    assert.equal(group.engagement.mode, "search");
    r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
    assert.equal(group.engagement.noSightTurns, 8);
    assert.equal(group.engagement.mode, "pursuit");

    r.context.KinkyDungeonCurrentTick++;
    const phases = r.phaseCalls.length,
        result = r.context.KinkyDungeonEnemyLoop(actors[0], target, 1);
    assert.equal(result.idle, true, "pursuit delegates movement to the native AI");
    assert.equal(r.phaseCalls.length, phases + 2, "native attack and spell gates reopen for delegated pursuit");
});

test("a builder uses native adjacent defense and resumes its retained assignment", () => {
    const actors = [spinner(1, 4, 4), spinner(2, 6, 6)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        target = r.context.KinkyDungeonPlayerEntity;
    actors[0].aware = true;
    actors[0].testSense = true;
    target.x = 10;
    target.y = 4;
    r.context.KinkyDungeonEnemyLoop(actors[0], target, 1);
    const assignment = plain(group.assignments[actors[1].id]);
    assert.ok(assignment);

    actors[1].x = 9;
    actors[1].y = 4;
    actors[1].aware = true;
    actors[1].testSense = true;
    r.phaseCalls.length = 0;
    const construction = group.metrics.construction;
    r.context.KinkyDungeonEnemyLoop(actors[1], target, 1);
    assert.deepEqual(plain(r.phaseCalls), [
        { phase: "attack", id: actors[1].id },
        { phase: "spell", id: actors[1].id },
    ]);
    assert.equal(group.metrics.construction, construction);
    assert.deepEqual(plain(group.assignments[actors[1].id]), assignment, "defense retains the builder job");

    r.context.KinkyDungeonCurrentTick++;
    target.x = 15;
    target.y = 9;
    actors[1].testSense = false;
    r.phaseCalls.length = 0;
    r.context.KinkyDungeonEnemyLoop(actors[1], target, 1);
    assert.equal(r.phaseCalls.length, 0, "resumed work gates later native attack and spell phases");
});

test("load audit replaces an invalid lure and removes stale or duplicate saved assignments", () => {
    const actors = [spinner(1, 4, 4), spinner(2, 4, 8)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        assignments = Object.values(group.assignments);
    group.engagement = {
        target: { kind: "player", id: 0 },
        lureId: 999,
        mode: "search",
        lastKnown: { x: 12, y: 8, dx: 1, dy: 0, age: 4, source: "native" },
        noSightTurns: 4,
        lureNoContactTurns: 4,
        compositeId: null,
    };
    if (assignments[0]) {
        group.assignments[actors[0].id] = plain(assignments[0]);
        group.assignments[actors[1].id] = plain(assignments[0]);
    }
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    const once = plain(group);
    assert.ok(group.memberIds.includes(group.engagement.lureId));
    assert.equal(group.engagement.lastKnown, undefined);
    assert.ok(Object.keys(group.assignments).length <= 1);
    assert.equal(group.assignments[group.engagement.lureId], undefined);
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    assert.deepEqual(plain(group), once, "repeated audit is idempotent");
    r.context.Spiderlings.SpinnerAI.completePositiveTurn(0);
    assert.deepEqual(plain(group), once, "a zero-time load update advances no engagement state");

    r.context.KDMapData.Entities.push({
        id: 77,
        x: 12,
        y: 8,
        hp: 2,
        hostileToSpinner: false,
        Enemy: { name: "FormerEnemy" },
    });
    group.engagement.target = { kind: "npc", id: 77 };
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    assert.equal(group.engagement, undefined, "changed native hostility invalidates the saved target");
});

test("stable lure survives JSON restore and is replaced after death, incapacity, or lost contact", () => {
    const actors = [spinner(1, 3, 3), spinner(2, 3, 6), spinner(3, 3, 9)],
        r = runtime(actors),
        ai = start(r),
        initialGroup = Object.values(ai.groups)[0],
        target = r.context.KinkyDungeonPlayerEntity;
    actors[0].aware = true;
    actors[0].testSense = true;
    target.x = 10;
    target.y = 5;
    r.context.KinkyDungeonEnemyLoop(actors[0], target, 1);
    const stableLure = initialGroup.engagement.lureId;

    r.context.KDMapData = plain(r.context.KDMapData);
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    let group = Object.values(r.context.KDMapData.SpiderlingsSpinnerEncounter.ai.groups)[0];
    assert.equal(group.engagement.lureId, stableLure);

    let entities = r.context.KDMapData.Entities;
    entities.find((entity) => entity.id === stableLure).hp = 0;
    start(r);
    group = Object.values(r.context.KDMapData.SpiderlingsSpinnerEncounter.ai.groups)[0];
    const deathReplacement = group.engagement.lureId;
    assert.notEqual(deathReplacement, stableLure);

    entities = r.context.KDMapData.Entities;
    entities.find((entity) => entity.id === deathReplacement).disabled = true;
    start(r);
    const incapacityReplacement = group.engagement.lureId;
    assert.notEqual(incapacityReplacement, deathReplacement);

    const observingBuilder = entities.find((entity) => entity.id === deathReplacement);
    if (observingBuilder) {
        observingBuilder.disabled = false;
        group.engagement.lureNoContactTurns = 8;
        observingBuilder.aware = true;
        observingBuilder.testSense = true;
        r.context.KinkyDungeonCurrentTick++;
        r.context.KinkyDungeonEnemyLoop(observingBuilder, target, 1);
        assert.equal(group.engagement.lureId, observingBuilder.id);
    }
});

test("cooperative enclosure reuses the saved group and topology work scheduler", () => {
    const actors = [spinner(1, 5, 4), spinner(2, 5, 8)],
        r = runtime(actors),
        map = {
            width: 18,
            height: 12,
            floor: mapSnapshot().cells.map(cellKeyForTest),
            protected: [],
            occupied: [],
            exit: { x: 16, y: 6 },
        },
        setup = r.context.Spiderlings.SpinnerScenarios.setupCooperative({
            ownerIds: actors.map((actor) => actor.id),
            compositeId: "cooperative",
            layers: [
                {
                    id: "inner",
                    vertices: [
                        { x: 8, y: 2 },
                        { x: 12, y: 2 },
                        { x: 12, y: 10 },
                        { x: 8, y: 10 },
                    ],
                    core: { x: 10, y: 6 },
                    gate: { x: 8, y: 6 },
                },
            ],
            map,
            mapSnapshot: mapSnapshot(),
        }),
        group = Object.values(setup.ai.groups)[0],
        plan = setup.ai.plans[group.planId];
    assert.equal(setup.started, true);
    assert.equal(plan.kind, "enclosure");
    assert.equal(plan.compositeId, "cooperative");
    assert.equal(Object.keys(group.assignments).length, 2);
    assert.ok(Object.values(group.assignments).every((assignment) => assignment.fieldId === "inner"));
    const before = setup.encounter.topology.actionLog.length;
    for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, r.context.KinkyDungeonPlayerEntity, 1);
    assert.ok(
        setup.encounter.topology.actionLog.length >= before,
        "the production paid-action path owns enclosure work",
    );
});

test("one survivor keeps repair work but receives no new construction or replacement plan", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        snapshot = mapSnapshot(),
        ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        field = r.context.Spiderlings.SpinnerNativeField.fieldById(
            r.context.Spiderlings.SpinnerNativeField.state(),
            plan.fieldId,
        );
    field.anchors[0].built = true;
    field.anchors[0].hp = 1;
    actors[1].hp = 0;
    start(r, snapshot);
    assert.deepEqual(
        Object.values(plain(group.assignments)).map((assignment) => assignment.type),
        ["repairAnchor"],
    );

    const invalid = plain(snapshot),
        invalidCell = invalid.cells.find((cell) => cellKeyForTest(cell) === plan.cells[0]);
    invalidCell.locked = true;
    start(r, invalid);
    assert.equal(group.planId, null, "a lone survivor cannot select a replacement plan");
});

test("save/load and revisit retain groups, choices, progress, and unique proxies", () => {
    const actors = [spinner(1, 7, 3), spinner(2, 9, 9)],
        r = runtime(actors),
        snapshot = mapSnapshot(),
        ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        planId = group.planId;
    for (let turn = 0; turn < 8; turn++) {
        start(r, snapshot);
        for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, r.context.KinkyDungeonPlayerEntity, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    const before = plain(r.context.KDMapData),
        progress = {
            lineFields: plain(r.context.Spiderlings.SpinnerNativeField.state().topology.lineFields),
            solidCells: plain(
                r.context.Spiderlings.SpinnerTopology.solidCells(
                    r.context.Spiderlings.SpinnerNativeField.state().topology,
                ),
            ),
        };
    r.context.KDMapData = plain(before);
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    r.context.Spiderlings.SpinnerNativeField.reconcile();
    start(r, snapshot);
    const restored = r.context.Spiderlings.SpinnerAI.inspect(),
        proxies = r.context.KDMapData.Entities.filter(r.context.Spiderlings.SpinnerNativeField.isOwnedProxy);
    assert.equal(restored.groups[group.id].planId, planId);
    assert.deepEqual(plain(r.context.Spiderlings.SpinnerNativeField.state().topology.lineFields), progress.lineFields);
    assert.deepEqual(
        plain(
            r.context.Spiderlings.SpinnerTopology.solidCells(r.context.Spiderlings.SpinnerNativeField.state().topology),
        ),
        progress.solidCells,
    );
    assert.equal(
        new Set(proxies.map((proxy) => `${proxy.SpiderlingsSpinnerProxy.fieldId}|${proxy.x},${proxy.y}`)).size,
        proxies.length,
    );
});

test("paired 2/4/8 traces separate travel, construction, wait, and repair accounting", () => {
    const observations = [];
    for (const count of [2, 4, 8]) {
        const starts = [
                { x: 2, y: 4 },
                { x: 2, y: 8 },
                { x: 1, y: 1 },
                { x: 1, y: 10 },
                { x: 3, y: 1 },
                { x: 3, y: 10 },
                { x: 4, y: 1 },
                { x: 4, y: 10 },
            ],
            actors = starts.slice(0, count).map((position, index) => spinner(index + 1, position.x, position.y)),
            r = runtime(actors),
            snapshot = mapSnapshot([
                [
                    { x: 12, y: 4 },
                    { x: 12, y: 8 },
                ],
            ]),
            ai = start(r, snapshot),
            group = Object.values(ai.groups)[0];
        for (let turn = 0; turn < 30; turn++) {
            start(r, snapshot);
            for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, r.context.KinkyDungeonPlayerEntity, 1);
            r.context.KinkyDungeonCurrentTick++;
        }
        const field = r.context.Spiderlings.SpinnerNativeField.fieldById(
            r.context.Spiderlings.SpinnerNativeField.state(),
            ai.plans[group.planId].fieldId,
        );
        if (field.anchors[0].built) field.anchors[0].hp = Math.max(0.5, field.anchors[0].hp - 0.5);
        for (let turn = 0; turn < 8; turn++) {
            start(r, snapshot);
            for (const actor of actors) r.context.KinkyDungeonEnemyLoop(actor, r.context.KinkyDungeonPlayerEntity, 1);
            r.context.KinkyDungeonCurrentTick++;
        }
        observations.push({ count, ...plain(group.metrics) });
    }
    for (const observation of observations) {
        assert.ok(observation.travel > 0);
        assert.ok(observation.construction > 0, JSON.stringify(observations));
        assert.ok(observation.wait >= 0);
        assert.ok(observation.repair > 0, JSON.stringify(observations));
    }
    assert.deepEqual(
        observations.map(({ count }) => count),
        [2, 4, 8],
    );
    assert.deepEqual(observations, [
        { count: 2, travel: 22, construction: 5, wait: 46, yield: 0, repair: 3 },
        { count: 4, travel: 22, construction: 5, wait: 122, yield: 0, repair: 3 },
        { count: 8, travel: 22, construction: 5, wait: 274, yield: 0, repair: 3 },
    ]);
});
