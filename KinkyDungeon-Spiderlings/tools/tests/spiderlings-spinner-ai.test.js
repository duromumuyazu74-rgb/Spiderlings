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
            },
            KDMapInit: (values) => Object.fromEntries(values.map((value) => [value, true])),
            KinkyDungeonMapGet: (x, y) => (x > 0 && y > 0 && x < 17 && y < 11 ? "." : "1"),
            KinkyDungeonTilesGet: (key) => tiles.get(key),
            KinkyDungeonEntityAt(x, y) {
                if (context.KinkyDungeonPlayerEntity.x === x && context.KinkyDungeonPlayerEntity.y === y)
                    return context.KinkyDungeonPlayerEntity;
                return context.KDMapData.Entities.findLast(
                    (entity) => entity.hp > 0 && entity.x === x && entity.y === y,
                );
            },
            DialogueCreateEnemy(x, y, name) {
                if (context.KinkyDungeonEntityAt(x, y)) return undefined;
                const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === name);
                const entity = { id: nextId++, x, y, hp: definition.maxhp, Enemy: definition };
                context.KDMapData.Entities.push(entity);
                return entity;
            },
            DialogueGetEnemy(name) {
                const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === name);
                return { id: nextId++, x: 1, y: 1, hp: definition.maxhp, Enemy: definition };
            },
            KDAddNewEntity(entity) {
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
            KinkyDungeonTrackSneak: (enemy) => enemy.vp ?? (enemy.aware ? 1 : 0),
            KinkyDungeonMultiplicativeStat: () => 1,
            KDBoundEffects: () => 0,
            KinkyDungeonApplyBuffToEntity() {},
            KDMoveEntity(entity, x, y, _willing, _dash, _forceHitBullets, ignoreBlocked) {
                if (!ignoreBlocked && context.KinkyDungeonEntityAt(x, y)) return false;
                entity.x = x;
                entity.y = y;
                return true;
            },
            KinkyDungeonFindPath(fromX, fromY, toX, toY, blockEnemy) {
                const blocked = new Set(
                    blockEnemy
                        ? context.KDMapData.Entities.filter(
                              (entity) =>
                                  entity.hp > 0 &&
                                  !context.Spiderlings.SpinnerNativeField.isOwnedProxy(entity) &&
                                  (entity.x !== fromX || entity.y !== fromY),
                          ).map((entity) => `${entity.x},${entity.y}`)
                        : [],
                );
                return context.Spiderlings.SpinnerAI.routeOnSnapshot(
                    mapSnapshot(),
                    { x: fromX, y: fromY },
                    { x: toX, y: toY },
                    blocked,
                ).slice(1);
            },
            KinkyDungeonEnemyTryMove(enemy, direction, _delta, x, y) {
                if (!(_delta > 0)) return false;
                const occupant = context.KinkyDungeonEntityAt(x, y);
                if (occupant) {
                    const condition = context.KDPathConditions[occupant.Enemy?.pathcondition];
                    if (!condition?.query(enemy, occupant)) return false;
                    return condition.doPassthrough(enemy, occupant, context.KDMapData) === 2;
                }
                movement.push({ id: enemy.id, direction: plain(direction), x, y });
                enemy.x = x;
                enemy.y = y;
                return true;
            },
            KinkyDungeonEnemyLoop(enemy, target, _delta) {
                nativeCalls.push(enemy.id);
                context.lastNativeTarget = target;
                const aiData = {
                        canSensePlayer: !!enemy.testSense,
                        canSeePlayer: !!enemy.testSense,
                        hostile: true,
                        aggressive: true,
                        ...(enemy.testAIData || {}),
                    },
                    handled = context.KDAIType.hunt.beforemove(enemy, target, aiData),
                    attacked = context.KDAIType.hunt.attack(enemy, target, aiData),
                    cast = context.KDAIType.hunt.spell(enemy, target, aiData);
                return { idle: !handled, attacked, cast, defeat: false, defeatEnemy: enemy };
            },
            KinkyDungeonSetEnemyFlag(enemy, flag, duration) {
                (enemy.flags ||= {})[flag] = duration;
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
    load(context, "SpiderlingsSpinnerPassagePlanner.js");
    load(context, "SpiderlingsSpinnerAI.js");
    load(context, "SpiderlingsSpinnerScenarios.js");
    context.Spiderlings.SpinnerField = { handleEnemyTurn: () => undefined };
    context.Spiderlings.SpinnerCapture = { handleEnemyTurn: () => undefined };
    load(context, "SpiderlingsSpinnerRuntime.js");
    return { context, tiles, movement, nativeCalls, phaseCalls };
}

function start(r, snapshot = mapSnapshot()) {
    return r.context.Spiderlings.SpinnerAI.beginTurn({ activate: true, mapSnapshot: snapshot });
}

function remotePlayerReporter(context) {
    const player = context.KinkyDungeonPlayerEntity,
        reporter = {
            id: 90,
            hp: 2,
            x: player.x + 1,
            y: player.y,
            vp: 1,
            buffs: {},
            Enemy: { name: "Jumper", visionRadius: 9 },
        };
    context.KDMapData.Entities.push(reporter);
    context.KinkyDungeonNearestPlayer = (observer) => (observer.id === reporter.id ? player : undefined);
    context.KDEnemyVisionRadius = (observer) => observer.Enemy.visionRadius;
    context.KinkyDungeonStatsChoice = new Map();
    return reporter;
}

test("a remote player report leaves the sole enclosure builder doing paid construction", () => {
    const worker = spinner(1, 8, 6),
        r = runtime([worker]),
        c = r.context,
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    remotePlayerReporter(c);
    for (let turn = 0; turn < 12; turn++) {
        const ai = start(r, snapshot);
        if (turn === 0) {
            // Emulate a Test.75 save whose broadcast has no origin marker.
            const group = Object.values(ai.groups)[0];
            delete group.engagement.sharedOnly;
            group.engagement.lureId = worker.id;
            c.Spiderlings.SpinnerAI.restoreAfterLoad();
        }
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.Spiderlings.SpinnerAI.completePositiveTurn(1);
        c.KinkyDungeonCurrentTick++;
    }
    const encounter = c.Spiderlings.SpinnerNativeField.state(),
        group = Object.values(encounter.ai.groups)[0];
    assert.equal(encounter.ai.plans[group.planId].kind, "enclosure");
    assert.ok(c.Spiderlings.SpinnerAI.playerObservation(), "The remote contact must remain available");
    assert.ok(encounter.topology.actionLog.length > 0, "Shared knowledge must not starve real paid work");
    assert.equal(group.engagement.lureId, undefined, "The only builder remains available until the body is ready");
    worker.aware = true;
    worker.vp = 1;
    worker.testSense = true;
    c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
    assert.equal(group.engagement.lureId, worker.id, "Personal recognized contact retains native combat priority");
});

test("a remote player report still lets unpaid separated groups staff one passage", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9), spinner(3, 20, 5), spinner(4, 20, 9)],
        r = largePassageRuntime(workers),
        c = r.context;
    remotePlayerReporter(c);
    const ai = r.begin(),
        groups = Object.values(ai.groups);
    assert.ok(c.Spiderlings.SpinnerAI.playerObservation());
    assert.equal(groups.length, 1, "A shared report is knowledge, not a native engagement blocking recruitment");
    assert.deepEqual(plain(groups[0].memberIds).sort(), [1, 2, 3, 4]);
    assert.equal(ai.plans[groups[0].planId].kind, "passage");
    assert.equal(Object.values(ai.plans).filter((plan) => !["invalid", "abandoned"].includes(plan.status)).length, 1);
});

test("native zero-time load refresh preserves partial work, position and saved construction credit", () => {
    const worker = spinner(1, 8, 6),
        r = runtime([worker]),
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    for (let turn = 0; turn < 20; turn++) {
        start(r, snapshot);
        r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
    const read = () =>
        plain({
            topology: r.context.Spiderlings.SpinnerNativeField.state().topology,
            x: worker.x,
            y: worker.y,
            credit: worker.SpinnerConstructionPoints,
        });
    const before = read();
    for (let n = 0; n < 3; n++) r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 0);
    assert.deepEqual(read(), before);
});

test("a lone Spinner builds one-entry rings and pays to seal them after prey enters", () => {
    const worker = spinner(1, 8, 6),
        r = runtime([worker]),
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    assert.ok(ai.plannerWorkLast.candidateCells <= snapshot.cells.length);
    assert.equal(plan.kind, "enclosure");
    assert.equal(plan.radius, 4);
    assert.equal(plan.constructionOrder, "outer-first");
    assert.equal(plan.fieldIds.length, 3, "All legal layers are declared before any paid work");
    assert.equal(group.assignments[worker.id].fieldId, plan.fieldIds[2]);
    assert.equal(
        r.context.Spiderlings.SpinnerNativeField.state().topology.fields[plan.fieldId].boundaryCells.length,
        16,
    );
    assert.equal(r.context.Spiderlings.SpinnerNativeField.state().topology.fields[plan.fieldId].phase, "preparing");
    for (let turn = 0; turn < 240; turn++) {
        start(r, snapshot);
        r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    const graph = r.context.Spiderlings.SpinnerNativeField.state().topology;
    assert.equal(ai.plannerWorkLast.candidateCells, 0);
    assert.ok(ai.plannerWorkPeak.expansionCells <= 24);
    assert.equal(graph.fields[plan.fieldId].phase, "ready", JSON.stringify(group.metrics));
    assert.equal(graph.composites[plan.compositeId].layerIds.length, 3, JSON.stringify(group.metrics));
    assert.ok(graph.composites[plan.compositeId].layerIds.every((id) => graph.fields[id].phase === "ready"));
    const bodyOrder = graph.actionLog
        .filter((action) => plan.fieldIds.includes(action.fieldId))
        .map((action) => graph.fields[action.fieldId].layer);
    assert.deepEqual([...new Set(bodyOrder)], [2, 1, 0]);
    assert.ok(
        bodyOrder.every((layer, index) => !index || layer <= bodyOrder[index - 1]),
        "Every body action is paid outer-to-inner",
    );
    const solids = new Set(r.context.Spiderlings.SpinnerTopology.solidCells(graph).map(cellKeyForTest));
    for (const id of graph.composites[plan.compositeId].layerIds) {
        const field = graph.fields[id];
        assert.deepEqual(
            plain(field.boundaryCells.filter((cell) => !solids.has(cellKeyForTest(cell)))),
            plain([field.gateCell]),
        );
    }
    const player = r.context.KinkyDungeonPlayerEntity;
    player.x = plan.center.x;
    player.y = plan.center.y;
    worker.aware = true;
    worker.testSense = true;
    r.context.Spiderlings.SpinnerNativeField.onEntry(player, player.x, player.y);
    r.context.Spiderlings.SpinnerNativeField.onEntry(worker, worker.x, worker.y);
    assert.equal(
        r.context.Spiderlings.SpinnerNativeField.state().topology.composites[plan.compositeId].closureArmed,
        true,
    );
    for (let turn = 0; turn < 100; turn++) {
        start(r, snapshot);
        r.context.KinkyDungeonEnemyLoop(worker, player, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    const sealed = r.context.Spiderlings.SpinnerNativeField.state().topology;
    assert.ok(sealed.composites[plan.compositeId].layerIds.every((id) => sealed.fields[id].phase === "sealed"));
    r.context.KinkyDungeonCurrentTick++;
    r.phaseCalls.length = 0;
    r.context.KinkyDungeonEnemyLoop(worker, player, 1);
    assert.deepEqual(
        plain(r.phaseCalls),
        [
            { phase: "attack", id: worker.id },
            { phase: "spell", id: worker.id },
        ],
        "the Spinner must resume native pursuit and attacks after sealing prey inside",
    );
    player.x = 16;
    player.y = 10;
    r.context.Spiderlings.SpinnerNativeField.onEntry(player, player.x, player.y);
    for (let turn = 0; turn < 80; turn++) {
        start(r, snapshot);
        r.context.KinkyDungeonEnemyLoop(worker, player, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    const reopened = r.context.Spiderlings.SpinnerNativeField.state().topology;
    assert.ok(reopened.composites[plan.compositeId].layerIds.every((id) => reopened.fields[id].phase === "ready"));
    assert.ok(reopened.actionLog.some((action) => action.type === "reopenGate"));
});

test("loaded autonomous roadblocks are replaced with a reachable enclosure without moving existing actors", () => {
    const actors = [spinner(1, 5, 4), spinner(2, 5, 8)],
        r = runtime(actors),
        snapshot = mapSnapshot(),
        ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        oldPlan = ai.plans[group.planId];
    assert.equal(oldPlan.kind, "line");
    const positions = actors.map((actor) => [actor.x, actor.y]);
    delete snapshot.candidateLines;
    start(r, snapshot);
    assert.equal(ai.plans[group.planId].kind, "enclosure");
    assert.equal(oldPlan.status, "invalid");
    assert.deepEqual(
        actors.map((actor) => [actor.x, actor.y]),
        positions,
    );
});

test("ordinary Spinner construction searches beyond the corridor instead of building an isolated roadblock", () => {
    const actors = [spinner(1, 2, 6), spinner(2, 3, 6), spinner(3, 4, 6)],
        r = runtime(actors),
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    for (const cell of snapshot.cells)
        cell.floor = cell.y === 6 || (cell.x >= 11 && cell.x <= 15 && cell.y >= 3 && cell.y <= 9);
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    assert.equal(plan?.kind, "enclosure");
    assert.ok(plan.center.x >= 12);
    assert.equal(Object.keys(r.context.Spiderlings.SpinnerNativeField.state().topology.lineFields).length, 0);
});

test("assigned builders route around a live coworker instead of waiting on its occupied cell", () => {
    const actors = [spinner(1, 2, 4), spinner(2, 3, 4)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        field = r.context.Spiderlings.SpinnerNativeField.fieldById(
            r.context.Spiderlings.SpinnerNativeField.state(),
            plan.fieldId,
        );
    group.assignments[1] = {
        type: "placeAnchor",
        anchorId: field.anchors[0].id,
        target: { x: field.anchors[0].x, y: field.anchors[0].y },
        workCell: { x: 4, y: 4 },
        fieldId: plan.fieldId,
    };
    r.context.KinkyDungeonEnemyLoop(actors[0], r.context.KinkyDungeonPlayerEntity, 1);
    assert.notDeepEqual({ x: actors[0].x, y: actors[0].y }, { x: 2, y: 4 });
    assert.notDeepEqual({ x: actors[0].x, y: actors[0].y }, { x: 3, y: 4 });
    assert.equal(group.lastAction, "travel");
});

test("builders detour when native faction path returns a live occupied first step", () => {
    const actors = [spinner(1, 2, 4), spinner(2, 3, 4)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        field = r.context.Spiderlings.SpinnerNativeField.fieldById(
            r.context.Spiderlings.SpinnerNativeField.state(),
            plan.fieldId,
        );
    group.assignments[1] = {
        type: "placeAnchor",
        anchorId: field.anchors[0].id,
        target: { x: field.anchors[0].x, y: field.anchors[0].y },
        workCell: { x: 4, y: 4 },
        fieldId: plan.fieldId,
    };
    r.context.KinkyDungeonFindPath = () => [
        { x: 3, y: 4 },
        { x: 4, y: 4 },
    ];
    r.context.KinkyDungeonEnemyLoop(actors[0], r.context.KinkyDungeonPlayerEntity, 1);
    assert.notDeepEqual({ x: actors[0].x, y: actors[0].y }, { x: 2, y: 4 });
    assert.notDeepEqual({ x: actors[0].x, y: actors[0].y }, { x: 3, y: 4 });
    assert.equal(group.lastAction, "travel");
});

test("separate Spinner groups perform paid work on their own enclosures", () => {
    const workers = [spinner(1, 3, 3), spinner(2, 15, 8)],
        r = runtime(workers),
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    const ai = start(r, snapshot),
        groups = Object.values(ai.groups);
    assert.equal(groups.length, 2);
    const fieldByWorker = new Map(groups.map((group) => [group.memberIds[0], ai.plans[group.planId].fieldId]));
    const wrongAssignment = Object.values(groups[0].assignments)[0];
    assert.ok(wrongAssignment);
    groups[1].assignments[workers[1].id] = plain(wrongAssignment);
    start(r, snapshot);
    assert.ok(ai.plans[groups[1].planId].fieldIds.includes(groups[1].assignments[workers[1].id]?.fieldId));
    for (let turn = 0; turn < 30; turn++) {
        start(r, snapshot);
        for (const group of groups)
            for (const assignment of Object.values(group.assignments))
                assert.ok(ai.plans[group.planId].fieldIds.includes(assignment.fieldId));
        for (const worker of workers) r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    const graph = r.context.Spiderlings.SpinnerNativeField.state().topology;
    for (const [workerId, fieldId] of fieldByWorker) {
        const ownedFields = ai.plans[groups.find((group) => group.memberIds.includes(workerId)).planId].fieldIds;
        assert.ok(
            graph.actionLog.some((action) => ownedFields.includes(action.fieldId)),
            `${workerId}: ${fieldId}`,
        );
        assert.ok(
            graph.actionLog.every(
                (action) => action.fieldId !== fieldId || graph.fieldOwners[fieldId].includes(workerId),
            ),
        );
    }
});

test("an unavailable site is retried after geometry changes without idle rerolls", () => {
    const worker = spinner(1, 8, 6),
        r = runtime([worker]),
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    for (const cell of snapshot.cells) cell.protected = true;
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0];
    assert.equal(group.planId, null);
    assert.equal(ai.plannerWorkLast.candidateCells, snapshot.cells.length);
    start(r, snapshot);
    assert.equal(ai.plannerWorkLast.candidateCells, 0);
    for (const cell of snapshot.cells)
        if (Math.max(Math.abs(cell.x - 8), Math.abs(cell.y - 6)) <= 1 || (cell.x === 6 && cell.y === 6))
            cell.protected = false;
    start(r, snapshot);
    assert.equal(ai.plans[group.planId].kind, "enclosure");
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
    assert.deepEqual(plain(state.groups[savedId].memberIds), [1, 2]);
    assert.equal(actors.at(-1).SpiderlingsNestParentID, 90);
});

test("nest guards form their own construction group and natural Spinners remain free", () => {
    const actors = [
            spinner(1, 4, 4, { SpiderlingsNestParentID: 90 }),
            spinner(2, 5, 4, { SpiderlingsNestParentID: 90 }),
            spinner(3, 6, 4),
        ],
        r = runtime(actors),
        ai = start(r);
    assert.deepEqual(
        Object.values(ai.groups).map((group) => plain(group.memberIds)),
        [[1, 2]],
    );
    assert.deepEqual(plain(Object.values(ai.groups)[0].source), { type: "nest", nestId: 90 });
    assert.equal(
        r.context.Spiderlings.SpinnerAI.handleBeforeMove(actors[2], r.context.KinkyDungeonPlayerEntity),
        false,
    );
});

test("construction wait preserves native movement credit and unassigned guards use native AI", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        worker = actors.find((actor) => group.assignments[actor.id]),
        aiData = { idle: true, hostile: true, canSensePlayer: false };
    assert.equal(r.context.KDAIType.hunt.beforemove(worker, r.context.KinkyDungeonPlayerEntity, aiData), true);
    assert.equal(aiData.idle, false, "a paid movement attempt must keep accrued native move points");
    group.assignments = {};
    assert.equal(
        r.context.KDAIType.hunt.beforemove(worker, r.context.KinkyDungeonPlayerEntity, aiData),
        false,
        "a guard with no work should be free to fight or roam",
    );
});

test("a reported nest attacker interrupts Spinner construction and becomes the native target", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        maid = { id: 99, x: 6, y: 3, hp: 4, Enemy: { name: "Maidforce" } },
        r = runtime([...actors, maid]),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        worker = actors.find((actor) => group.assignments[actor.id]);
    r.context.Spiderlings.HuntingGrounds = {
        resolveNestDefenderTarget: () => maid,
        isNestAttacker: (_enemy, target) => target === maid,
    };
    r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
    assert.equal(r.context.lastNativeTarget, maid);
    assert.equal(group.lastAction, undefined, "defenders delegate the strike instead of recording construction");
    assert.equal(r.phaseCalls.filter((entry) => entry.id === worker.id).length, 2);
});

test("nest guards keep building when a distant maid is sensed but has not hit the nest", () => {
    const actors = [
            spinner(1, 5, 3, { SpiderlingsNestParentID: 90 }),
            spinner(2, 5, 9, { SpiderlingsNestParentID: 90 }),
        ],
        maid = { id: 99, x: 8, y: 3, hp: 4, Enemy: { name: "Maidforce" } },
        r = runtime([...actors, maid]),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        worker = actors.find((actor) => group.assignments[actor.id]);
    worker.aware = true;
    worker.testSense = true;
    r.context.KinkyDungeonEnemyLoop(worker, maid, 1);
    assert.equal(group.engagement, undefined);
    assert.ok(["travel", "wait", "construction"].includes(group.lastAction));
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

test("nest groups shortlist buildable lines close to their own nest", () => {
    const actors = [
            spinner(1, 3, 3, { SpiderlingsNestParentID: 90 }),
            spinner(2, 4, 3, { SpiderlingsNestParentID: 90 }),
        ],
        r = runtime(actors),
        snapshot = mapSnapshot([
            [
                { x: 3, y: 2 },
                { x: 3, y: 5 },
            ],
            [
                { x: 13, y: 4 },
                { x: 13, y: 8 },
            ],
        ]),
        group = { source: { type: "nest", nestId: 90 }, members: actors },
        candidates = r.context.Spiderlings.SpinnerAI.analyzeLineCandidates(snapshot, group);
    assert.ok(candidates.length > 0);
    assert.ok(candidates.every((candidate) => candidate.anchors.every((anchor) => anchor.x < 8)));
});

test("candidate distances match independent routes through open, blocked, and disconnected maps", () => {
    const api = runtime().context.Spiderlings.SpinnerAI,
        origin = { x: 2, y: 2 },
        layouts = [
            [],
            [
                { x: 9, y: 2 },
                { x: 9, y: 3 },
                { x: 9, y: 4 },
                { x: 9, y: 6 },
            ],
            Array.from({ length: 10 }, (_, index) => ({ x: 9, y: index + 1 })),
        ];
    for (const walls of layouts) {
        const snapshot = { ...mapSnapshot(), candidateLines: [] },
            wallKeys = new Set(walls.map(cellKeyForTest));
        for (const cell of snapshot.cells) if (wallKeys.has(cellKeyForTest(cell))) cell.floor = false;
        const candidates = api.analyzeLineCandidates(snapshot, {
            source: { type: "ordinary" },
            members: [origin],
        });
        assert.ok(candidates.length > 0);
        for (const candidate of candidates) {
            const center = candidate.cells[Math.floor(candidate.cells.length / 2)],
                route = api.routeOnSnapshot(snapshot, origin, center);
            assert.equal(candidate.travelDistance, route.length - 1, candidate.id);
        }
        if (walls.length === 10)
            assert.ok(candidates.every((candidate) => candidate.cells.every((cell) => cell.x < 9)));
    }
});

test("duplicate supplied lines keep the first candidate", () => {
    const api = runtime().context.Spiderlings.SpinnerAI,
        line = [
            { x: 3, y: 2 },
            { x: 3, y: 5 },
        ],
        snapshot = mapSnapshot([line, line]);
    const candidates = api.analyzeLineCandidates(snapshot, { members: [{ x: 2, y: 2 }] });
    assert.equal(candidates.length, 1);
    assert.equal(candidates[0].id, "line:3,2;3,5");
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

test("one positive turn scans candidate line geometry once for multiple groups", () => {
    const r = runtime([spinner(1, 1, 2), spinner(2, 2, 2), spinner(3, 15, 9), spinner(4, 16, 9)]),
        snapshot = mapSnapshot(),
        lines = snapshot.candidateLines;
    let scans = 0;
    Object.defineProperty(snapshot, "candidateLines", {
        get() {
            scans++;
            return lines;
        },
    });
    const ai = start(r, snapshot);
    assert.equal(Object.keys(ai.groups).length, 2);
    assert.equal(scans, 1);
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

test("a fighting group retains its field plan while construction approach is blocked", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        snapshot = mapSnapshot(),
        ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        blocked = plain(snapshot);
    group.engagement = {
        target: { kind: "player", id: 0 },
        lureId: actors[0].id,
        mode: "lure",
        noSightTurns: 0,
        lureNoContactTurns: 0,
    };
    for (const actor of actors)
        for (const cell of blocked.cells)
            if (Math.max(Math.abs(actor.x - cell.x), Math.abs(actor.y - cell.y)) <= 1) cell.floor = false;
    start(r, blocked);
    assert.equal(group.planId, plan.id);
    assert.equal(plan.status, "traveling");
});

function cellKeyForTest(cell) {
    return `${cell.x},${cell.y}`;
}

for (const outside of [false, true])
    test(`recognized prey ${outside ? "outside" : "inside"} an unfinished core leaves assigned builders paying for its enclosure`, () => {
        const actors = [spinner(1, 5, 3), spinner(2, 5, 9), spinner(3, 11, 6)],
            r = runtime([...actors]),
            c = r.context,
            { SpinnerAI: planner, SpinnerNativeField: native } = c.Spiderlings,
            placed = planner.initializeMapgenField({ preferredSites: [{ x: 8, y: 6 }] }),
            encounter = native.state(),
            group = encounter.ai.groups[placed.groupId],
            originalMembers = [...group.memberIds],
            composite = encounter.topology.composites[placed.compositeId],
            snapshot = mapSnapshot();
        delete snapshot.candidateLines;
        Object.assign(c.KinkyDungeonPlayerEntity, { x: outside ? 16 : composite.core.x + 1, y: composite.core.y });
        native.onEntry(c.KinkyDungeonPlayerEntity, c.KinkyDungeonPlayerEntity.x, c.KinkyDungeonPlayerEntity.y);
        for (const actor of actors) actor.aware = actor.testSense = true;
        const constructionReady = () =>
            outside
                ? composite.layerIds.every((id) =>
                      ["ready", "sealed"].includes(native.state().topology.fields[id].phase),
                  )
                : native.captureGeometryReady(composite.core);
        for (let turn = 0; turn < 200 && !constructionReady(); turn++) {
            start(r, snapshot);
            for (const actor of actors) c.KinkyDungeonEnemyLoop(actor, c.KinkyDungeonPlayerEntity, 1);
            planner.completePositiveTurn(1);
            c.KinkyDungeonCurrentTick++;
        }
        assert.ok(constructionReady(), `Observed prey cannot starve paid inner work: ${JSON.stringify(group)}`);
        assert.deepEqual([...group.memberIds], originalMembers, "The original crew must retain its enclosure");
        assert.ok(native.state().topology.actionLog.length > 20, "The inner rings must use real paid construction");
        assert.ok(
            r.phaseCalls.some((entry) => entry.phase === "attack"),
            "The lure retains native melee pressure",
        );
    });

test("unfinished-core role allocation hands body work away from an active lure without erasing progress", () => {
    for (const variant of [
        "available",
        "single",
        "disabled",
        "off-map",
        "separated-work",
        "expired",
        "unrecognized",
        "changed-lure",
    ]) {
        const actors = [spinner(1, 5, 3), spinner(2, 5, 9), spinner(3, 11, 6)],
            r = runtime([...actors]),
            c = r.context,
            { SpinnerAI: planner, SpinnerNativeField: native, SpinnerTopology: topology } = c.Spiderlings,
            placed = planner.initializeMapgenField({ preferredSites: [{ x: 8, y: 6 }] }),
            encounter = native.state(),
            group = encounter.ai.groups[placed.groupId],
            composite = encounter.topology.composites[placed.compositeId],
            snapshot = mapSnapshot(),
            target = { x: composite.core.x + 1, y: composite.core.y };
        Object.assign(c.KinkyDungeonPlayerEntity, target);
        native.onEntry(c.KinkyDungeonPlayerEntity, target.x, target.y);
        // Fixture setup closes the already authored outer gate. The pending
        // body, paid graph and construction credit then survive role changes.
        for (let n = 0; n < 8; n++) {
            const action = topology.nextWorkAction(encounter.topology, actors[0].id, actors[0]);
            if (action.role === "body") break;
            const result = topology.applyAction(
                encounter.topology,
                { ...action, ownerId: actors[0].id },
                native.snapshot(action.cell),
            );
            assert.ok(result.outcome.legal);
            encounter.topology = result.state;
        }
        group.engagement = {
            target: { kind: "player", id: 0 },
            lureId: actors[0].id,
            lastKnown: { ...target, source: "native", age: 4 },
        };
        planner.reserveActions(encounter, snapshot);
        assert.equal(group.assignments[actors[0].id]?.role, "body", variant);
        actors[0].SpinnerConstructionPoints = 0.75;
        if (variant === "single") group.memberIds = [actors[0].id];
        if (variant === "disabled") for (const actor of actors.slice(1)) actor.disabled = true;
        if (variant === "off-map") for (const actor of actors.slice(1)) actor.x = 99;
        if (variant === "separated-work") {
            actors[1].x = 11;
            for (const cell of snapshot.cells) if (cell.x === 7) cell.floor = false;
            assert.ok(planner.routeOnSnapshot(snapshot, actors[1], target).length > 0);
            assert.equal(
                planner.routeOnSnapshot(snapshot, actors[1], group.assignments[actors[0].id].workCell).length,
                0,
            );
        }
        group.engagement.lastKnown.age = variant === "expired" ? 4 : 0;
        if (variant === "unrecognized") group.engagement.lastKnown.source = "guessed";
        if (variant === "changed-lure") group.engagement.lureId = actors[1].id;
        const before = plain(encounter.topology);
        planner.reserveActions(encounter, snapshot);
        const lure = group.engagement.lureId;
        if (["available", "changed-lure"].includes(variant)) {
            assert.notEqual(group.assignments[lure]?.role, "body", variant);
            assert.ok(
                Object.entries(group.assignments).some(([id, action]) => Number(id) !== lure && action.role === "body"),
            );
        } else assert.equal(group.assignments[lure]?.role, "body", variant);
        assert.deepEqual(plain(encounter.topology), before, variant);
        assert.equal(actors[0].SpinnerConstructionPoints, 0.75, variant);
    }
});

test("one mapgen outer body retains a real crew, leaves paid inner work and survives reload without replenishment", () => {
    const actors = [
            spinner(1, 5, 3, { SpiderlingsNestParentID: 90 }),
            spinner(2, 5, 9, { SpiderlingsNestParentID: 90 }),
        ],
        r = runtime(actors),
        { SpinnerAI: planner, SpinnerNativeField: native, SpinnerTopology: topology } = r.context.Spiderlings,
        placed = planner.initializeMapgenField({ preferredSites: [{ x: 8, y: 6 }] });
    assert.equal(placed.status, "placed");
    const encounter = native.state(),
        composite = encounter.topology.composites[placed.compositeId],
        group = encounter.ai.groups[placed.groupId],
        plan = encounter.ai.plans[group.planId],
        outer = encounter.topology.fields[composite.layerIds.at(-1)];
    assert.equal(plan.provenance, "mapgen");
    assert.deepEqual([...group.memberIds].sort(), [1, 2]);
    assert.equal(group.source.nestId, 90);
    assert.equal(outer.bounds.right - outer.bounds.left, 8);
    assert.equal(outer.phase, "ready");
    assert.equal(composite.closureArmed, false);
    assert.equal(encounter.topology.actionLog.length, 0, "Authored terrain grants no paid construction actions");
    assert.equal(r.context.KDMapData.Entities.filter(native.isOwnedProxy).length, 31);
    assert.equal(native.isSpiderlingsWebCell(outer.gateCell), false, "The original opening is navigable");
    for (const fieldId of composite.layerIds.slice(0, -1)) {
        const field = encounter.topology.fields[fieldId];
        assert.equal(field.phase, "preparing");
        assert.ok(
            encounter.topology.anchors
                .filter((anchor) => anchor.owners.includes(fieldId))
                .every((anchor) => !anchor.built),
        );
        assert.ok(
            encounter.topology.links
                .filter((link) => link.owners.includes(fieldId))
                .every((link) => !link.connected && link.builtCells.length === 0),
        );
    }
    assert.equal(topology.nextWorkAction(encounter.topology, actors[0].id, actors[0]).fieldId, composite.layerIds[1]);
    for (const fieldId of composite.layerIds)
        assert.deepEqual([...encounter.topology.fieldOwners[fieldId]].sort(), [1, 2]);
    const before = plain(encounter),
        count = r.context.KDMapData.Entities.length;
    assert.equal(planner.initializeMapgenField().reason, "existing-field");
    r.context.KDMapData.SpiderlingsSpinnerEncounter = plain(encounter);
    planner.restoreAfterLoad();
    native.reconcile();
    assert.deepEqual(plain(native.state()), before);
    assert.equal(r.context.KDMapData.Entities.length, count);
    assert.equal(
        actors.some((actor) => actor.SpinnerConstructionPoints > 0),
        false,
    );
});

test("authored hunting sites receive their own fresh crews before nearby substitute enclosures", () => {
    const sites = [
            { x: 10, y: 10, radius: 4 },
            { x: 26, y: 10, radius: 4 },
        ],
        actors = [
            spinner(1, 2, 10, { SpiderlingsPresetFieldCenter: sites[0] }),
            spinner(2, 3, 10, { SpiderlingsPresetFieldCenter: sites[0] }),
            spinner(3, 25, 10, { SpiderlingsPresetFieldCenter: sites[1] }),
            spinner(4, 27, 10, { SpiderlingsPresetFieldCenter: sites[1] }),
            spinner(5, 5, 5, { SpiderlingsNestParentID: 90 }),
            spinner(6, 6, 5, { SpiderlingsNestParentID: 90 }),
        ],
        r = runtime(actors),
        c = r.context;
    Object.assign(c.KDMapData, {
        GridWidth: 38,
        GridHeight: 24,
        StartPosition: { x: 1, y: 12 },
        EndPosition: { x: 36, y: 12 },
    });
    c.KinkyDungeonMapGet = (x, y) => (x > 0 && y > 0 && x < 37 && y < 23 ? "." : "1");
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 1, y: 12 });
    const before = actors.map(({ id, x, y }) => ({ id, x, y })),
        result = c.Spiderlings.SpinnerAI.initializeMapgenField({ maxFields: 2, preferredSites: sites });
    assert.equal(result.status, "placed");
    const fields = [...result.fields].sort((a, b) => a.center.x - b.center.x);
    assert.deepEqual(
        plain(fields.map(({ center }) => center)),
        sites.map(({ x, y }) => ({ x, y })),
    );
    assert.ok(result.fields.every((field) => field.radius === 4));
    const encounter = c.Spiderlings.SpinnerNativeField.state();
    for (let index = 0; index < sites.length; index++) {
        const field = fields[index],
            members = encounter.ai.groups[field.groupId].memberIds;
        assert.deepEqual([...members].sort(), index === 0 ? [1, 2] : [3, 4]);
    }
    assert.deepEqual(
        actors.filter((actor) => actor.id < 1000).map(({ id, x, y }) => ({ id, x, y })),
        before,
    );
    assert.equal(encounter.topology.actionLog.length, 0);
});

test("mapgen field rejects solo crews and downgrades protected large sites without occupying protected terrain", () => {
    for (const variant of ["solo", "protected"]) {
        const r = runtime(variant === "solo" ? [spinner(1, 5, 3)] : [spinner(1, 5, 3), spinner(2, 5, 9)]);
        if (variant === "protected")
            for (let x = 1; x < 17; x++) r.tiles.set(`${x},6`, { Type: "Quest", Protected: true });
        const result = r.context.Spiderlings.SpinnerAI.initializeMapgenField();
        assert.equal(result.status, variant === "solo" ? "skipped" : "placed", variant);
        const proxies = r.context.KDMapData.Entities.filter(r.context.Spiderlings.SpinnerNativeField.isOwnedProxy);
        assert.equal(proxies.length > 0, variant === "protected");
        assert.equal(
            proxies.some((entity) => r.tiles.get(`${entity.x},${entity.y}`)?.Protected),
            false,
        );
        if (variant === "protected") assert.equal(result.radius, 2);
    }
});

test("field placement does not delay first-contact pursuit or adjacent combat, including old ambush saves", () => {
    for (const savedMode of [undefined, "lure", "search", "pressure", "pursuit"]) {
        const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
            r = runtime(actors),
            ai = start(r),
            group = Object.values(ai.groups)[0],
            worker = actors[0],
            target = r.context.KinkyDungeonPlayerEntity;
        Object.assign(worker, { x: 5, y: 6, aware: true, testSense: true });
        Object.assign(target, { x: 9, y: 6 });
        group.assignments = {};
        if (savedMode) {
            group.engagement = {
                target: { kind: "player", id: 0 },
                lureId: worker.id,
                mode: savedMode,
                progress: { waits: 0, approach: 4, route: 0 },
                lastKnown: { x: target.x, y: target.y, age: 0, source: "native" },
            };
            r.context.Spiderlings.SpinnerAI.restoreAfterLoad();
        }
        r.context.KinkyDungeonEnemyLoop(worker, target, 1);
        assert.equal(Math.max(Math.abs(worker.x - target.x), Math.abs(worker.y - target.y)), 3, savedMode);
        assert.equal(r.phaseCalls.length, 0, "A paid approach cannot also attack");
        assert.equal(group.engagement.progress, undefined, "Old ambush timers cannot postpone contact");
        Object.assign(target, { x: worker.x + 1, y: worker.y });
        const position = { x: worker.x, y: worker.y };
        r.context.KinkyDungeonCurrentTick++;
        r.context.KinkyDungeonEnemyLoop(worker, target, 1);
        assert.deepEqual({ x: worker.x, y: worker.y }, position, "Do not retreat from adjacent prey");
        assert.equal(r.phaseCalls.length, 2, "Native attack and spell phases open immediately");
    }
});

test("pending recovery pursues native observations before gate work without discovering an unseen target", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        worker = actors.find((actor) => group.assignments[actor.id]),
        target = r.context.KinkyDungeonPlayerEntity;
    target.x = worker.x + 3;
    target.y = worker.y;
    worker.aware = true;
    worker.testSense = true;
    r.context.Spiderlings.SpinnerRecovery = {
        wantsPursuit: (source, prey) => source === worker && prey === target,
        handleEnemyTurn: () => undefined,
        sourceIds: () => [],
    };
    const construction = group.metrics.construction;
    r.context.KinkyDungeonEnemyLoop(worker, target, 1);
    assert.equal(Math.max(Math.abs(worker.x - target.x), Math.abs(worker.y - target.y)), 2);
    assert.equal(group.metrics.construction, construction);
    assert.equal(r.phaseCalls.length, 0);
    worker.testSense = false;
    delete r.context.Spiderlings.SpinnerNativeField.state().ai.playerObservation;
    group.engagement = {
        target: { kind: "player", id: 0 },
        lureId: worker.id,
        mode: "lure",
        lastKnown: { x: worker.x + 2, y: worker.y, age: 0, source: "native" },
    };
    target.x = 16;
    target.y = 10;
    const known = plain(group.engagement.lastKnown);
    r.context.KinkyDungeonCurrentTick++;
    r.context.KinkyDungeonEnemyLoop(worker, target, 1);
    assert.equal(Math.max(Math.abs(worker.x - known.x), Math.abs(worker.y - known.y)), 1);
    assert.deepEqual(plain(group.engagement.lastKnown), known);
    group.engagement.lastKnown.age = 4;
    const moveCount = r.movement.length;
    r.context.KinkyDungeonCurrentTick++;
    r.context.KinkyDungeonEnemyLoop(worker, target, 1);
    assert.equal(group.engagement.lastKnown, undefined);
    assert.equal(r.movement.length, moveCount, "Expired knowledge cannot pursue the target's new coordinate");
});

test("approaching prey and remote construction never restart an ambush wait", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        worker = actors[0],
        target = r.context.KinkyDungeonPlayerEntity;
    Object.assign(worker, { x: 5, y: 6, aware: true, testSense: true });
    Object.assign(target, { x: 10, y: 6 });
    group.assignments = {};
    for (let turn = 0; turn < 2; turn++) {
        const before = Math.max(Math.abs(worker.x - target.x), Math.abs(worker.y - target.y));
        r.context.KinkyDungeonCurrentTick++;
        r.context.KinkyDungeonEnemyLoop(worker, target, 1);
        r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
        assert.equal(Math.max(Math.abs(worker.x - target.x), Math.abs(worker.y - target.y)), before - 1);
        group.metrics.construction++;
        target.x--;
    }
    r.context.KinkyDungeonCurrentTick++;
    r.context.KinkyDungeonEnemyLoop(worker, target, 1);
    assert.equal(r.phaseCalls.length, 2);
});

test("contact pursuit routes around a wall to prey without returning to a field waiting point", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        worker = actors[0],
        target = r.context.KinkyDungeonPlayerEntity,
        snapshot = mapSnapshot();
    plan.anchors = [
        { x: 8, y: 6 },
        { x: 8, y: 6 },
    ];
    for (const cell of snapshot.cells) if (cell.x === 10 && cell.y >= 3) cell.floor = false;
    r.context.KinkyDungeonMapGet = (x, y) =>
        snapshot.cells.find((cell) => cell.x === x && cell.y === y)?.floor ? "." : "1";
    r.context.KinkyDungeonFindPath = (fromX, fromY, toX, toY) =>
        r.context.Spiderlings.SpinnerAI.routeOnSnapshot(snapshot, { x: fromX, y: fromY }, { x: toX, y: toY }).slice(1);
    Object.assign(worker, { x: 8, y: 6, aware: true, testSense: true });
    Object.assign(target, { x: 12, y: 6 });
    group.assignments = {};
    for (let turn = 0; turn < 20 && !r.phaseCalls.length; turn++) {
        r.context.KinkyDungeonCurrentTick++;
        r.context.KinkyDungeonEnemyLoop(worker, target, 1);
        r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
        assert.equal(r.context.KinkyDungeonMapGet(worker.x, worker.y), ".");
    }
    assert.ok(
        r.movement.some((step) => step.y <= 2),
        "The route must go around the wall's end",
    );
    assert.equal(r.phaseCalls.length, 2, "Reaching prey opens native combat");
});

test("continuous remote hearing still guides investigation after personal sight has been absent for eight turns", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0],
        target = r.context.KinkyDungeonPlayerEntity,
        reporter = { ...spinner(90, 12, 3), Enemy: { name: "Jumper" } };
    target.x = 12;
    target.y = 3;
    for (let tick = 0; tick < 9; tick++) {
        r.context.Spiderlings.SpinnerAI.reportPlayerContact(
            reporter,
            target,
            { recognized: true, hostile: true, canSensePlayer: true },
            1,
        );
        r.context.Spiderlings.SpinnerAI.completePositiveTurn(1);
    }
    assert.equal(group.engagement.mode, "pursuit");
    const lure = actors.find((actor) => actor.id === group.engagement.lureId),
        before = Math.max(Math.abs(lure.x - target.x), Math.abs(lure.y - target.y));
    r.context.KinkyDungeonEnemyLoop(lure, target, 1);
    assert.equal(Math.max(Math.abs(lure.x - target.x), Math.abs(lure.y - target.y)), before - 1);
    assert.equal(lure.aware, undefined);
    assert.equal(r.phaseCalls.length, 0, "investigation cannot spend the same turn on native attack");
});

test("a Spinner without a field plan leaves movement and attacks to native AI", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        ai = start(r),
        group = Object.values(ai.groups)[0];
    group.planId = null;
    group.assignments = {};
    actors[0].aware = true;
    actors[0].testSense = true;
    r.context.KinkyDungeonEnemyLoop(actors[0], r.context.KinkyDungeonPlayerEntity, 1);
    assert.equal(group.engagement, undefined);
    assert.equal(r.movement.length, 0, "no aimless custom lure step");
    assert.equal(r.phaseCalls.length, 2);
});

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
    assert.equal(group.engagement.mode, "pressure");
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

test("a cramped map selects its largest reachable legal ring without inventing space", () => {
    for (const side of [5, 7]) {
        const worker = spinner(1, 7, 6),
            r = runtime([worker]),
            snapshot = mapSnapshot();
        delete snapshot.candidateLines;
        snapshot.cells = snapshot.cells.filter(
            (cell) => cell.x >= 5 && cell.x < 5 + side && cell.y >= 2 && cell.y < 2 + side,
        );
        snapshot.entrances = [{ x: 5, y: 2 + Math.floor(side / 2) }];
        snapshot.exits = [{ x: 4 + side, y: 2 + Math.floor(side / 2) }];
        const ai = start(r, snapshot),
            group = Object.values(ai.groups)[0],
            plan = ai.plans[group.planId];
        assert.equal(plan.kind, "enclosure");
        assert.equal(
            plan.radius,
            side === 5 ? 1 : 2,
            "A usable outside approach is required as well as a fitting perimeter",
        );
        assert.equal(plan.fieldIds.length, Math.max(1, plan.radius - 1));
        assert.ok(plan.cells.every((key) => snapshot.cells.some((cell) => cellKeyForTest(cell) === key)));
    }
});

test("enclosure proposals keep mobile prey off every ring and stationary actors out of the usable core", () => {
    for (const immobile of [false, true]) {
        const worker = spinner(1, 7, 6),
            obstacle = { id: 70, x: 9, y: 6, hp: 10, Enemy: { name: "FixturePrey", immobile } },
            r = runtime([worker, obstacle]),
            snapshot = mapSnapshot();
        delete snapshot.candidateLines;
        const ai = start(r, snapshot),
            plan = ai.plans[Object.values(ai.groups)[0].planId],
            fields = plan.fieldIds.map((id) => r.context.Spiderlings.SpinnerNativeField.state().topology.fields[id]);
        assert.equal(plan.kind, "enclosure");
        for (const field of fields) {
            assert.ok(!field.boundaryCells.some((cell) => cell.x === obstacle.x && cell.y === obstacle.y));
            if (immobile)
                assert.ok(!field.interiorCells.some((cell) => cell.x === obstacle.x && cell.y === obstacle.y));
        }
    }
});

test("expanding a radius-two core adds the next geometric ring instead of duplicating the first", () => {
    const worker = spinner(1, 7, 6),
        r = runtime([worker]),
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    snapshot.cells = snapshot.cells.filter((cell) => cell.x >= 5 && cell.x < 12 && cell.y >= 2 && cell.y < 9);
    snapshot.entrances = [{ x: 5, y: 5 }];
    snapshot.exits = [{ x: 11, y: 5 }];
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    assert.equal(plan.radius, 2);
    const larger = mapSnapshot();
    delete larger.candidateLines;
    r.context.KinkyDungeonCurrentTick++;
    start(r, larger);
    const graph = r.context.Spiderlings.SpinnerNativeField.state().topology,
        fields = graph.composites[plan.compositeId].layerIds.map((id) => graph.fields[id]);
    assert.ok(fields.length > 1);
    assert.equal(fields[1].bounds.width, fields[0].bounds.width + 2);
});

test("an empty saved crew restores only actors proven by its field ownership", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9)],
        r = passageRuntime(workers),
        c = r.context,
        ai = r.begin();
    const group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    group.memberIds = [];
    r.begin();
    assert.deepEqual(plain(group.memberIds).sort(), [1, 2]);
    assert.equal(group.planId, plan.id);
    assert.deepEqual(plain(c.Spiderlings.SpinnerNativeField.fieldOwners(plan.fieldId)).sort(), [1, 2]);
    assert.equal(Object.keys(ai.groups).length, 1);
});

test("groups meeting after paid passage work keep both maintenance fields owned", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 50, 9)],
        r = passageRuntime(workers, 1, 55),
        c = r.context,
        ai = r.begin();
    const groups = Object.values(ai.groups),
        native = c.Spiderlings.SpinnerNativeField;
    assert.equal(groups.length, 2);
    for (const group of groups) {
        const worker = workers.find((entry) => group.memberIds.includes(entry.id)),
            graph = native.state().topology,
            action = c.Spiderlings.SpinnerTopology.nextWorkAction(graph, worker.id, worker);
        assert.ok(action);
        const paid = c.Spiderlings.SpinnerTopology.applyAction(
            graph,
            { ...action, ownerId: worker.id },
            { inBounds: true, floor: true, cell: action.cell, protected: false, occupied: false },
        );
        assert.equal(paid.outcome.legal, true);
        native.state().topology = paid.state;
    }
    // Stage a later native meeting; no plan or ownership changes accompany it.
    workers[1].x = workers[0].x + 1;
    workers[1].y = workers[0].y;
    r.begin();
    assert.equal(Object.keys(ai.groups).length, 2);
    for (const group of groups) {
        const plan = ai.plans[group.planId];
        assert.notEqual(plan.status, "abandoned");
        for (const fieldId of plan.fieldIds)
            assert.deepEqual(plain(native.fieldOwners(fieldId)), plain(group.memberIds));
    }
});

test("fresh native approach redirects an unpaid plan while hidden coordinates and paid fields stay stable", () => {
    const worker = spinner(1, 4, 4),
        r = runtime([worker]),
        c = r.context,
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        first = ai.plans[group.planId];
    const player = c.KinkyDungeonPlayerEntity;
    player.x = 15;
    player.y = 7;
    start(r, snapshot);
    assert.equal(group.planId, first.id, "Moving an unseen global player is not a report");
    group.engagement = {
        target: { kind: "player" },
        lureId: worker.id,
        lastKnown: { x: 15, y: 7, dx: -1, dy: 0, age: 0, source: "native" },
    };
    ai.coordinationTurn = 4;
    start(r, snapshot);
    const redirected = ai.plans[group.planId];
    assert.notEqual(redirected.id, first.id);
    assert.equal(first.invalidReason, "observed-approach");
    assert.ok(Math.max(Math.abs(redirected.center.x - 15), Math.abs(redirected.center.y - 7)) <= 6);
    assert.ok(redirected.cells.length > 0);
    start(r, snapshot);
    assert.equal(group.planId, redirected.id, "The same report cannot repeatedly reroll an unpaid approach");
    group.engagement.lastKnown = { x: 2, y: 7, dx: 1, dy: 0, age: 0, source: "native" };
    ai.coordinationTurn = 8;
    start(r, snapshot);
    assert.equal(group.planId, redirected.id, "A moving prey gives assigned workers time to reach their first task");
    // Pay a real topology operation, then change both target location and approach.
    const native = c.Spiderlings.SpinnerNativeField,
        graph = native.state().topology;
    const action = c.Spiderlings.SpinnerTopology.nextWorkAction(graph, worker.id, worker);
    const paid = c.Spiderlings.SpinnerTopology.applyAction(
        graph,
        { ...action, ownerId: worker.id },
        { inBounds: true, floor: true, cell: action.cell, protected: false, occupied: false },
    );
    assert.equal(paid.outcome.legal, true);
    native.state().topology = paid.state;
    group.engagement.lastKnown = { x: 2, y: 7, dx: 1, dy: 0, age: 0, source: "native" };
    ai.coordinationTurn = 8;
    start(r, snapshot);
    assert.equal(
        group.planId,
        redirected.id,
        "Paid construction keeps its maintenance owners after prey changes sides",
    );
    assert.deepEqual(plain(native.fieldOwners(redirected.fieldIds[2])), [worker.id]);
});

test("terrain replacement and a new native report in the same audit leave every active field attributed", () => {
    const worker = spinner(1, 4, 4),
        r = runtime([worker]),
        c = r.context,
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        original = ai.plans[group.planId];
    const key = original.initialCells[0];
    snapshot.cells.find((cell) => cellKeyForTest(cell) === key).protected = true;
    group.engagement = {
        target: { kind: "player" },
        lureId: worker.id,
        lastKnown: { x: 15, y: 7, dx: -1, dy: 0, age: 0, source: "native" },
    };
    ai.coordinationTurn = 4;
    start(r, snapshot);
    const active = Object.values(ai.plans).filter((plan) => !["invalid", "abandoned"].includes(plan.status));
    assert.equal(active.length, 1);
    assert.equal(group.planId, active[0].id);
    assert.notEqual(group.planId, original.id);
    assert.equal(original.invalidReason, "terrain");
    const native = c.Spiderlings.SpinnerNativeField;
    for (const plan of Object.values(ai.plans))
        for (const fieldId of plan.fieldIds) {
            const field = native.state().topology.fields[fieldId];
            assert.ok(
                field.retired || fieldId === active[0].fieldId || active[0].fieldIds.includes(fieldId),
                "An intermediate replacement cannot be left live without a group plan",
            );
        }
});

test("a spacious enclosure retains its entire maintenance crew without changing nest provenance", () => {
    const actors = Array.from({ length: 12 }, (_, index) =>
        spinner(index + 1, 2 + (index % 4), 3 + Math.floor(index / 4)),
    );
    for (const actor of actors) actor.SpiderlingsNestParentID = 90;
    const r = runtime(actors),
        map = {
            width: 18,
            height: 12,
            floor: mapSnapshot().cells.map(cellKeyForTest),
            protected: [],
            occupied: [],
            exit: { x: 16, y: 6 },
        },
        result = r.context.Spiderlings.SpinnerScenarios.setupCooperative({
            ownerIds: actors.map((actor) => actor.id),
            compositeId: "spacious",
            layers: [
                {
                    id: "large",
                    vertices: [
                        { x: 7, y: 1 },
                        { x: 15, y: 1 },
                        { x: 15, y: 10 },
                        { x: 7, y: 10 },
                    ],
                    gate: { x: 7, y: 6 },
                },
            ],
            map,
            mapSnapshot: mapSnapshot(),
        }),
        group = Object.values(result.ai.groups)[0];
    assert.equal(result.started, true);
    assert.equal(group.memberIds.length, 12);
    assert.deepEqual(
        plain(r.context.Spiderlings.SpinnerNativeField.fieldOwners("large")).sort((a, b) => a - b),
        actors.map((actor) => actor.id),
    );
    assert.ok(actors.every((actor) => actor.SpiderlingsNestParentID === 90 && actor.hp > 0));
    assert.deepEqual(plain(group.source), { type: "nest", nestId: 90 });
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

test("an adjacent recognized player does not divert a line maintenance worker into melee", () => {
    const actors = [spinner(1, 5, 3), spinner(2, 5, 9)],
        r = runtime(actors),
        c = r.context,
        snapshot = mapSnapshot(),
        ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        native = c.Spiderlings.SpinnerNativeField,
        field = native.fieldById(native.state(), ai.plans[group.planId].fieldId);
    field.anchors[0].built = true;
    field.anchors[0].hp = 1;
    start(r, snapshot);
    const [id, assignment] = Object.entries(group.assignments).find(([, action]) => action.type === "repairAnchor"),
        worker = actors.find((actor) => String(actor.id) === id);
    Object.assign(worker, assignment.workCell, { aware: true, testSense: true });
    Object.assign(c.KinkyDungeonPlayerEntity, { x: worker.x - 1, y: worker.y });
    const colleague = actors.find((actor) => actor !== worker);
    c.Spiderlings.SpinnerCapture.state = () => ({ sourceIds: [colleague.id] });
    group.engagement = {
        target: { kind: "player" },
        lureId: colleague.id,
        mode: "pressure",
        noSightTurns: 0,
        lureNoContactTurns: 0,
    };
    const hp = field.anchors[0].hp;
    for (let operation = 0; operation < 3; operation++) {
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
        if (native.fieldById(native.state(), ai.plans[group.planId].fieldId).anchors[0].hp > hp) break;
    }
    assert.ok(
        native.fieldById(native.state(), ai.plans[group.planId].fieldId).anchors[0].hp > hp,
        "The reserved line repair must actually pay and restore durability",
    );
    assert.ok(!r.phaseCalls.some((entry) => entry.id === worker.id), "Repair cannot double as native attack or spell");
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
        { count: 2, travel: 22, construction: 5, wait: 5, yield: 0, repair: 3 },
        { count: 4, travel: 22, construction: 5, wait: 5, yield: 0, repair: 3 },
        { count: 8, travel: 22, construction: 5, wait: 5, yield: 0, repair: 3 },
    ]);
});

function passageRuntime(actors, corridorWidth = 1, mapWidth = 35) {
    const r = runtime(actors),
        c = r.context,
        width = mapWidth,
        height = 15;
    const rows = Array.from({ length: height }, (_, y) =>
        Array.from({ length: width }, (_, x) => {
            const room = ((x >= 2 && x <= 7) || (x >= width - 8 && x <= width - 3)) && y >= 4 && y <= 10;
            const corridor = x >= 7 && x <= width - 8 && y >= 7 && y < 7 + corridorWidth;
            return room || corridor ? "0" : "1";
        }),
    );
    c.KDMapData.GridWidth = width;
    c.KDMapData.GridHeight = height;
    c.KDMapData.StartPosition = { x: 3, y: 7 };
    c.KDMapData.EndPosition = { x: width - 4, y: 7 };
    c.KDMapData.Tiles = {};
    c.KinkyDungeonPlayerEntity.x = 3;
    c.KinkyDungeonPlayerEntity.y = 10;
    c.KinkyDungeonWallTiles = "1";
    const writeGrid = () => {
        c.KDMapData.Grid = rows.map((row) => row.join("")).join("\n") + "\n";
    };
    writeGrid();
    c.KinkyDungeonMapGet = (x, y) => rows[y]?.[x] || "1";
    const snapshot = () => ({
        width,
        height,
        cells: rows.flatMap((row, y) =>
            row.map((tile, x) => ({
                x,
                y,
                tile,
                floor: tile === "0",
                walkable: tile === "0",
                wall: tile === "1",
                locked: false,
                protected: false,
            })),
        ),
        entrances: [c.KDMapData.StartPosition],
        exits: [c.KDMapData.EndPosition],
        nests: [],
    });
    c.KinkyDungeonFindPath = (fromX, fromY, toX, toY, blockEnemy) => {
        const blocked = new Set(
            blockEnemy
                ? c.KDMapData.Entities.filter(
                      (entity) =>
                          entity.hp > 0 &&
                          !c.Spiderlings.SpinnerNativeField.isOwnedProxy(entity) &&
                          (entity.x !== fromX || entity.y !== fromY),
                  ).map(cellKeyForTest)
                : [],
        );
        return c.Spiderlings.SpinnerAI.routeOnSnapshot(
            snapshot(),
            { x: fromX, y: fromY },
            { x: toX, y: toY },
            blocked,
        ).slice(1);
    };
    return {
        ...r,
        snapshot,
        begin: () => c.Spiderlings.SpinnerAI.beginTurn({ activate: true }),
        setTile(x, y, tile) {
            rows[y][x] = tile;
            writeGrid();
        },
        setMetadata(x, y, value) {
            r.tiles.set(`${x},${y}`, value);
            c.KDMapData.Tiles[`${x},${y}`] = value;
        },
    };
}

function largePassageRuntime(workers) {
    const r = passageRuntime(workers, 3, 25),
        planner = r.context.Spiderlings.SpinnerPassagePlanner,
        candidates = planner.candidates;
    // Keep this route/coordination fixture on an actually validated 3x3 interior.
    planner.candidates = (index, options) => {
        const candidate = candidates(index, { ...options, focus: undefined, maxCandidates: 24 }).find(
            (entry) => entry.interiorCells.length === 9,
        );
        return candidate ? [candidate] : [];
    };
    return r;
}

test("passage AI selects a proved capture interior on one- and two-cell native corridors", () => {
    for (const width of [1, 2]) {
        const r = passageRuntime([spinner(1, 5, 5)], width),
            c = r.context,
            ai = r.begin();
        const group = Object.values(ai.groups)[0],
            plan = ai.plans[group.planId];
        assert.equal(plan.kind, "passage");
        assert.equal(plan.proof.kind, "mandatory");
        assert.equal(plan.proof.interiorBypassDistance, null);
        assert.equal(plan.proof.blockedGateDistance, null);
        const graph = c.Spiderlings.SpinnerNativeField.state().topology,
            field = graph.fields[plan.fieldId];
        assert.ok(field);
        assert.equal(field.gates.length, 2);
        assert.ok(field.gates.every((gate) => gate.cells.length === width));
        assert.ok(field.nativeWallCells.every((cell) => c.KinkyDungeonMapGet(cell.x, cell.y) === "1"));
        assert.ok(
            field.gates.every((gate) => gate.cells.every((cell) => c.KinkyDungeonMapGet(cell.x, cell.y) === "0")),
        );
        assert.equal(
            c.Spiderlings.SpinnerTopology.solidCells(graph).length,
            0,
            "Choosing a passage must not grant completed webs",
        );
    }
});

test("small passages retain their original crew and field ownership across audits", () => {
    for (const width of [1, 2]) {
        const workers = Array.from({ length: 12 }, (_, index) =>
                spinner(index + 1, 3 + (index % 4), 4 + Math.floor(index / 4)),
            ),
            r = passageRuntime(workers, width),
            before = workers.map((worker) => ({ id: worker.id, x: worker.x, y: worker.y })),
            ai = r.begin(),
            staffed = Object.values(ai.groups).filter((group) => group.planId);
        assert.ok(staffed.length > 0);
        assert.equal(staffed.length, 1);
        assert.equal(staffed[0].memberIds.length, 12);
        assert.equal(workers.length, 12);
        assert.deepEqual(
            workers.map((worker) => ({ id: worker.id, x: worker.x, y: worker.y })),
            before,
        );
        for (let turn = 0; turn < 3; turn++) {
            r.begin();
            assert.ok(
                Object.values(ai.groups)
                    .filter((group) => group.planId)
                    .every((group) => group.memberIds.length === 12),
                "A small field retains its maintenance owners",
            );
            assert.deepEqual(
                plain(r.context.Spiderlings.SpinnerNativeField.fieldOwners(ai.plans[staffed[0].planId].fieldId)).sort(
                    (a, b) => a - b,
                ),
                workers.map((worker) => worker.id),
            );
        }
    }
});

test("passage AI recruits initially separated worker groups into one planned field", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9), spinner(3, 20, 5), spinner(4, 20, 9)];
    const r = largePassageRuntime(workers),
        c = r.context,
        ai = r.begin(),
        groups = Object.values(ai.groups);
    assert.ok(
        Math.abs(workers[0].x - workers[2].x) > c.Spiderlings.SpinnerAI.GROUP_RADIUS,
        "The fixture must start outside ordinary local grouping range",
    );
    assert.equal(groups.length, 1, "Independent groups should staff one reachable passage");
    const group = groups[0],
        plan = ai.plans[group.planId];
    assert.equal(plan.kind, "passage");
    assert.deepEqual(plain(group.memberIds).sort(), [1, 2, 3, 4]);
    const graph = c.Spiderlings.SpinnerNativeField.state().topology;
    assert.deepEqual(plain(graph.fieldOwners[plan.fieldId]).sort(), [1, 2, 3, 4]);
    assert.equal(Object.values(ai.plans).filter((entry) => !["invalid", "abandoned"].includes(entry.status)).length, 1);
    assert.equal(ai.passageMetrics.analysisBuilds, 1, "Both groups share a single map analysis");
    assert.ok(ai.passageMetrics.candidateCacheHits >= 1, "The second group reuses route-interception proofs");
});

test("a saved oversized field retains idle maintenance owners and active Capture and Recovery sources", () => {
    const workers = Array.from({ length: 8 }, (_, index) =>
            spinner(index + 1, 3 + (index % 4), 4 + Math.floor(index / 4)),
        ),
        r = passageRuntime(workers),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups).find((entry) => entry.planId),
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField;
    // Model a pre-capacity save with all actors attributed to the existing field.
    group.memberIds = workers.map((worker) => worker.id);
    native.setOwners(plan.fieldId, group.memberIds);
    c.Spiderlings.SpinnerCapture.state = () => ({ sourceIds: [6] });
    c.Spiderlings.SpinnerRecovery = { sourceIds: () => [7] };
    c.Spiderlings.SpinnerNPCRecovery = { usesEntity: (id) => id === 8 };
    const fieldBefore = JSON.stringify(native.state().topology.fields[plan.fieldId]),
        before = workers.map((worker) => ({ id: worker.id, x: worker.x, y: worker.y, hp: worker.hp }));
    c.Spiderlings.SpinnerAI.restoreAfterLoad();
    assert.equal(group.memberIds.length, 8, "A zero-time load audits state without dispatching excess workers");
    r.begin();
    assert.deepEqual(plain(group.memberIds), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.deepEqual(plain(native.fieldOwners(plan.fieldId)), [1, 2, 3, 4, 5, 6, 7, 8]);
    assert.equal(JSON.stringify(native.state().topology.fields[plan.fieldId]), fieldBefore);
    assert.deepEqual(
        workers.map((worker) => ({ id: worker.id, x: worker.x, y: worker.y, hp: worker.hp })),
        before,
    );
    r.begin();
    assert.ok([6, 7, 8].every((id) => group.memberIds.includes(id)));
    assert.equal(group.memberIds.length, 8);
    const otherPlans = Object.values(ai.plans).filter(
        (entry) => entry !== plan && !["invalid", "abandoned"].includes(entry.status),
    );
    assert.ok(otherPlans.every((other) => !other.cells.some((key) => plan.cells.includes(key))));
});

test("protected waiting stations retain crew ownership and leave the narrow mouth free", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9)],
        r = passageRuntime(workers),
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        gate = plan.gates.reduce((a, b) => (a.cells[0].x < b.cells[0].x ? a : b)),
        mouth = { x: gate.cells[0].x - 1, y: gate.cells[0].y },
        station = { x: mouth.x - 1, y: mouth.y };
    r.setMetadata(station.x, station.y, { OL: true });
    r.begin();
    assert.equal(group.planId, plan.id, "Protecting an outer station does not erase the valid field");
    assert.equal(group.memberIds.length, 2);
    assert.ok(
        Object.values(group.assignments)
            .filter((entry) => entry.type === "rally")
            .every(
                (entry) => ![cellKeyForTest(mouth), cellKeyForTest(station)].includes(cellKeyForTest(entry.workCell)),
            ),
    );
});

test("passage AI gives distant support a movement assignment without paying construction on that move", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9), spinner(3, 20, 5), spinner(4, 20, 9)],
        r = largePassageRuntime(workers),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0];
    const entry = Object.entries(group.assignments).find(
        ([id, assignment]) =>
            assignment.type === "rally" &&
            Math.max(
                Math.abs(workers.find((worker) => String(worker.id) === id).x - assignment.workCell.x),
                Math.abs(workers.find((worker) => String(worker.id) === id).y - assignment.workCell.y),
            ) > 3,
    );
    assert.ok(entry, "A distant unassigned helper needs an explicit rally movement task");
    const [id, assignment] = entry,
        worker = workers.find((actor) => String(actor.id) === id),
        before = { x: worker.x, y: worker.y, credit: worker.SpinnerConstructionPoints || 0 },
        graphBefore = JSON.stringify(c.Spiderlings.SpinnerNativeField.state().topology);
    const result = c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
    assert.ok(
        r.movement.some((move) => move.id === worker.id),
        "Rally work must call the native move entrance",
    );
    assert.equal(
        Math.max(Math.abs(worker.x - before.x), Math.abs(worker.y - before.y)),
        1,
        "Rally does not teleport to its station",
    );
    assert.ok(
        Math.max(Math.abs(worker.x - assignment.workCell.x), Math.abs(worker.y - assignment.workCell.y)) <
            Math.max(Math.abs(before.x - assignment.workCell.x), Math.abs(before.y - assignment.workCell.y)),
    );
    assert.equal(worker.SpinnerConstructionPoints || 0, before.credit);
    assert.equal(JSON.stringify(c.Spiderlings.SpinnerNativeField.state().topology), graphBefore);
    assert.equal(result.attacked, false);
    assert.equal(result.cast, false);
});

test("passage AI retains one static analysis through actor movement and invalidates changed wall geometry", () => {
    const worker = spinner(1, 5, 5),
        r = passageRuntime([worker]),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        oldPlan = ai.plans[group.planId],
        initial = plain(ai.passageMetrics);
    for (let tick = 0; tick < 20; tick++) {
        worker.y = 5 + (tick % 2);
        c.KinkyDungeonCurrentTick++;
        r.begin();
    }
    assert.equal(ai.passageMetrics.analysisBuilds, initial.analysisBuilds);
    assert.equal(ai.passageMetrics.visited, initial.visited, "Moving actors must not repeat the full graph analysis");
    assert.equal(
        ai.passageMetrics.routeChecks,
        initial.routeChecks,
        "A committed site reuses its proven traffic route",
    );
    const wall = oldPlan.nativeWallCells[0];
    r.setTile(wall.x, wall.y, "0");
    c.KinkyDungeonCurrentTick++;
    r.begin();
    assert.equal(ai.passageMetrics.analysisBuilds, initial.analysisBuilds + 1);
    assert.equal(oldPlan.status, "invalid");
    assert.equal(oldPlan.invalidReason, "terrain");
    assert.equal(c.Spiderlings.SpinnerNativeField.state().topology.fields[oldPlan.fieldId].retired, true);
    r.begin();
    assert.equal(
        ai.passageMetrics.analysisBuilds,
        initial.analysisBuilds + 1,
        "Unchanged edited terrain is then reused",
    );
});

test("passage AI invalidates a reserved gate when native protected metadata changes", () => {
    const r = passageRuntime([spinner(1, 5, 5)]),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        oldPlan = ai.plans[group.planId],
        gate = oldPlan.gates[0].cells[0],
        builds = ai.passageMetrics.analysisBuilds;
    r.setMetadata(gate.x, gate.y, { Protected: true });
    c.KinkyDungeonCurrentTick++;
    r.begin();
    assert.equal(ai.passageMetrics.analysisBuilds, builds + 1);
    assert.equal(oldPlan.status, "invalid");
    const replacement = ai.plans[group.planId];
    if (replacement)
        assert.ok(
            replacement.gates.every((mouth) => mouth.cells.every((cell) => cell.x !== gate.x || cell.y !== gate.y)),
        );
});

test("passage AI cancels an unpaid gate closure after its target leaves the capture interior", () => {
    const worker = spinner(1, 5, 5),
        r = passageRuntime([worker]),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField,
        field = () => native.state().topology.fields[plan.fieldId];
    for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) {
        r.begin();
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.equal(field().phase, "ready", "The fixture prepares both entrances through paid worker actions");
    const player = c.KinkyDungeonPlayerEntity;
    player.x = plan.center.x;
    player.y = plan.center.y;
    native.onEntry(player, player.x, player.y);
    r.begin();
    assert.ok(
        Object.values(group.assignments).some((assignment) => assignment.type === "closeGate"),
        "Entering the actual capture interior must reserve an unpaid closure",
    );
    const before = plain(native.state().topology.actionLog);
    player.x = 3;
    player.y = 10;
    native.onEntry(player, player.x, player.y);
    c.KinkyDungeonCurrentTick++;
    r.begin();
    assert.equal(native.state().topology.composites[plan.compositeId].closureArmed, false);
    assert.ok(
        Object.values(group.assignments).every((assignment) => assignment.type !== "closeGate"),
        "An open entrance must not keep a stale closure assignment after the prey leaves",
    );
    c.KinkyDungeonEnemyLoop(worker, player, 1);
    assert.deepEqual(
        plain(native.state().topology.actionLog),
        before,
        "The canceled seal must not spend construction work",
    );
});

test("passage AI excludes the player's occupied gate and never saves a field that was rejected", () => {
    const reference = passageRuntime([spinner(1, 5, 5)]),
        referenceAI = reference.begin(),
        referenceGroup = Object.values(referenceAI.groups)[0],
        gate = referenceAI.plans[referenceGroup.planId].gates[0].cells[0];
    const r = passageRuntime([spinner(1, 5, 5)]),
        c = r.context;
    c.KinkyDungeonPlayerEntity.x = gate.x;
    c.KinkyDungeonPlayerEntity.y = gate.y;
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    if (plan) {
        assert.ok(
            c.Spiderlings.SpinnerNativeField.state().topology.fields[plan.fieldId],
            "A saved active passage must correspond to an accepted topology field",
        );
        assert.ok(
            plan.gates.every((mouth) => mouth.cells.every((cell) => cell.x !== gate.x || cell.y !== gate.y)),
            "The live player cannot occupy a newly reserved gate",
        );
    }
});

test("passage AI keeps remote workers independent even when their future candidate sites are nearby", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 100, 5)],
        r = passageRuntime(workers, 1, 105),
        c = r.context,
        originalCandidates = c.Spiderlings.SpinnerPassagePlanner.candidates;
    // Keep the authored nearby-site catalogue to reproduce the former false
    // recruitment trigger; current production ranking uses each crew's local origin.
    c.Spiderlings.SpinnerPassagePlanner.candidates = (index, options) =>
        originalCandidates(index, { ...options, focus: undefined });
    const ai = r.begin(),
        groups = Object.values(ai.groups);
    assert.equal(
        groups.length,
        2,
        "Candidate centers must not substitute for the workers' actual recruitment distance",
    );
    for (const group of groups) {
        assert.equal(group.memberIds.length, 1);
        const plan = ai.plans[group.planId];
        assert.equal(plan.kind, "passage");
        assert.deepEqual(
            plain(c.Spiderlings.SpinnerNativeField.state().topology.fieldOwners[plan.fieldId]),
            plain(group.memberIds),
        );
    }
    const planner = c.Spiderlings.SpinnerPassagePlanner,
        index = planner.buildIndex(r.snapshot()),
        plans = groups.map((group) => ai.plans[group.planId]);
    assert.ok(
        planner.distance(index, plans[0].center, plans[1].center) <= c.Spiderlings.SpinnerAI.GROUP_RADIUS,
        "The nearby planned centers reproduce the misleading distance while the actual workers remain far apart",
    );
    assert.ok(planner.distance(index, plans[0].center, workers[1]) > c.Spiderlings.SpinnerAI.GROUP_RADIUS * 2);
});

test("passage AI discards a rejected activation and retries once the temporary failure clears", () => {
    const r = passageRuntime([spinner(1, 5, 5)]),
        c = r.context,
        native = c.Spiderlings.SpinnerNativeField,
        addPassage = native.addPassage;
    native.addPassage = () => ({ added: false, reason: "occupied" });
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        rejected = Object.values(ai.plans)[0];
    assert.equal(group.planId, null, "Rejected topology must not leave a permanently active empty plan");
    assert.equal(rejected.status, "invalid");
    assert.equal(Object.keys(native.state().topology?.fields || {}).length, 0);
    native.addPassage = addPassage;
    c.KinkyDungeonCurrentTick++;
    r.begin();
    const accepted = ai.plans[group.planId];
    assert.equal(accepted?.kind, "passage", "Temporary activation failure must not suppress a later retry");
    assert.ok(native.state().topology.fields[accepted.fieldId]);
});

test("a planless saved crew pauses when its last worker disappears and resumes with its owner", () => {
    const worker = spinner(1, 5, 5),
        r = passageRuntime([worker]),
        c = r.context,
        native = c.Spiderlings.SpinnerNativeField,
        addPassage = native.addPassage;
    native.addPassage = () => ({ added: false, reason: "occupied" });
    const ai = r.begin(),
        group = Object.values(ai.groups)[0];
    native.addPassage = addPassage;
    c.KDMapData.Entities = [];
    c.KinkyDungeonCurrentTick++;
    assert.doesNotThrow(() => r.begin());
    assert.equal(group.planId, null);
    assert.deepEqual(plain(group.memberIds), []);
    c.KDMapData.Entities = [worker];
    c.KinkyDungeonCurrentTick++;
    r.begin();
    const assigned = Object.values(ai.groups).find((entry) => entry.memberIds.includes(worker.id));
    assert.equal(ai.plans[assigned.planId]?.kind, "passage");
});

test("terrain invalidation with only disabled owners pauses replanning until recovery", () => {
    const worker = spinner(1, 5, 5),
        r = passageRuntime([worker]),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    c.KinkyDungeonIsDisabled = () => true;
    const cell = plan.interiorCells[0];
    r.setTile(cell.x, cell.y, "1");
    c.KinkyDungeonCurrentTick++;
    assert.doesNotThrow(() => r.begin());
    assert.equal(group.planId, null);
    c.KinkyDungeonIsDisabled = () => false;
    r.setTile(cell.x, cell.y, "0");
    c.KinkyDungeonCurrentTick++;
    r.begin();
    assert.ok(ai.plans[group.planId]);
});

test("a native gate lock invalidates a plan after repeated cached-snapshot checks", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9)],
        r = passageRuntime(workers),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        gate = plan.gates[0].cells[0];
    for (let turn = 0; turn < 3; turn++) {
        c.KinkyDungeonCurrentTick++;
        r.begin();
    }
    assert.equal(group.planId, plan.id);
    r.setMetadata(gate.x, gate.y, { Lock: "Red" });
    c.KinkyDungeonCurrentTick++;
    r.begin();
    assert.equal(plan.status, "invalid");
    assert.equal(plan.invalidReason, "terrain");
    assert.notEqual(group.planId, plan.id);
    const replacement = ai.plans[group.planId];
    if (replacement)
        assert.ok(
            !(replacement.initialCells || replacement.cells).includes(cellKeyForTest(gate)),
            "The refreshed cell index must exclude the newly locked gate from replacement work",
        );
});

test("passage AI keeps its analysis and active field when paid gate work creates native collision proxies", () => {
    const worker = spinner(1, 5, 5),
        r = passageRuntime([worker]),
        c = r.context,
        planner = c.Spiderlings.SpinnerPassagePlanner,
        candidates = planner.candidates;
    // A one-cell interior isolates collision-proxy caching from a lone worker's
    // inability to cross a wider corridor occupied by prey.
    planner.candidates = (index, options) => candidates(index, { ...options, focus: undefined, preferLarge: false });
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField,
        field = () => native.state().topology.fields[plan.fieldId],
        builds = ai.passageMetrics.analysisBuilds;
    for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) {
        r.begin();
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.equal(field().phase, "ready");
    const player = c.KinkyDungeonPlayerEntity;
    player.x = plan.center.x;
    player.y = plan.center.y;
    native.onEntry(player, player.x, player.y);
    for (let turn = 0; turn < 100 && field().phase !== "sealed"; turn++) {
        r.begin();
        c.KinkyDungeonEnemyLoop(worker, player, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.equal(field().phase, "sealed", "Both mouths close through paid work while the prey stays in the core");
    assert.ok(
        c.KDMapData.Entities.some(native.isOwnedProxy),
        "The completed gates must exercise real native proxy occupancy",
    );
    r.begin();
    assert.equal(group.planId, plan.id);
    assert.notEqual(plan.status, "invalid");
    assert.equal(!!field().retired, false);
    assert.equal(
        ai.passageMetrics.analysisBuilds,
        builds,
        "The field's own collision proxies must not become protected static terrain or trigger graph rebuilds",
    );
});

test("ready staffing keeps a core worker opposite a remote colleague instead of sending them through each other", () => {
    const workers = [spinner(1, 10, 7), spinner(2, 19, 7)],
        r = passageRuntime(workers),
        c = r.context,
        planner = c.Spiderlings.SpinnerPassagePlanner,
        candidates = planner.candidates;
    planner.candidates = (index, options) =>
        candidates(index, { ...options, focus: undefined, preferLarge: false, maxCandidates: 24 }).filter(
            (entry) => entry.id === "passage:10,7:1x1",
        );
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        field = () => c.Spiderlings.SpinnerNativeField.state().topology.fields[plan.fieldId];
    for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) {
        r.begin();
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.equal(field().phase, "ready");
    for (let turn = 0; turn < 30; turn++) {
        r.begin();
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.ok(
        workers.every((worker) => cellKeyForTest(worker) === cellKeyForTest(group.assignments[worker.id].workCell)),
    );
    assert.ok(workers.some((worker) => worker.x < plan.center.x));
    assert.ok(workers.some((worker) => worker.x > plan.center.x));
    const stationed = plain(group.rallyGates);
    for (let turn = 0; turn < 3; turn++) {
        r.begin();
        assert.deepEqual(plain(group.rallyGates), stationed, "A settled partition must remain stable");
    }
    // A legacy save can contain the crossed partition emitted by older code.
    // Keep both physical actors present and let their ordinary movement recover it.
    workers[0].x = 13;
    workers[0].y = 7;
    workers[1].x = 14;
    workers[1].y = 7;
    group.rallyGates[workers[0].id] = field().gates.find((gate) => gate.cells[0].x > plan.center.x).id;
    group.rallyGates[workers[1].id] = field().gates.find((gate) => gate.cells[0].x < plan.center.x).id;
    c.Spiderlings.SpinnerAI.restoreAfterLoad();
    for (let turn = 0; turn < 30; turn++) {
        r.begin();
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.ok(
        workers.every((worker) => cellKeyForTest(worker) === cellKeyForTest(group.assignments[worker.id].workCell)),
    );
    assert.ok(workers.some((worker) => worker.x < plan.center.x));
    assert.ok(workers.some((worker) => worker.x > plan.center.x));
});

test("passage AI stations same-side helpers at both mouths after preparing a one-cell corridor", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9)],
        r = passageRuntime(workers),
        c = r.context,
        originalCandidates = c.Spiderlings.SpinnerPassagePlanner.candidates;
    c.Spiderlings.SpinnerPassagePlanner.candidates = (index, options) =>
        originalCandidates(index, { ...options, focus: undefined });
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField,
        field = () => native.state().topology.fields[plan.fieldId];
    assert.ok(
        workers.every(
            (worker) => worker.x < Math.min(...plan.gates.flatMap((gate) => gate.cells.map((cell) => cell.x))),
        ),
    );
    const initialMouths = plain(group.rallyGates);
    for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) {
        r.begin();
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.equal(field().phase, "ready");
    const farMouth = field().gates.reduce((a, b) => (a.cells[0].x > b.cells[0].x ? a : b)),
        formerFarWorker = workers.find((worker) => initialMouths[worker.id] === farMouth.id),
        frontWorker = workers.find((worker) => worker !== formerFarWorker);
    const walk = (worker, destination) => {
        for (let step = 0; step < 80 && cellKeyForTest(worker) !== cellKeyForTest(destination); step++) {
            const next = c.KinkyDungeonFindPath(worker.x, worker.y, destination.x, destination.y, true)[0];
            assert.ok(next, "The controlled preparation-order change must follow an unoccupied floor route");
            assert.equal(
                c.KinkyDungeonEnemyTryMove(worker, { x: next.x - worker.x, y: next.y - worker.y }, 1, next.x, next.y),
                true,
            );
        }
        assert.equal(cellKeyForTest(worker), cellKeyForTest(destination));
    };
    // Model the changed arrival order at the preparation/ready transition with
    // legal movement: the original far-mouth worker now stands behind its peer.
    walk(frontWorker, { x: 5, y: 6 });
    walk(formerFarWorker, { x: 4, y: 7 });
    walk(frontWorker, { x: 6, y: 7 });
    r.begin();
    assert.equal(
        group.rallyGates[frontWorker.id],
        farMouth.id,
        "The worker currently in front must pass through to the far mouth when preparation becomes ready",
    );
    assert.notEqual(group.rallyGates[formerFarWorker.id], farMouth.id);
    const readyMouths = plain(group.rallyGates);
    for (let turn = 0; turn < 80; turn++) {
        r.begin();
        assert.deepEqual(
            plain(group.rallyGates),
            readyMouths,
            "Ready staffing must retain its chosen mouths instead of reordering every frame",
        );
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.KinkyDungeonCurrentTick++;
    }
    assert.deepEqual(
        [...new Set(Object.values(group.rallyGates))].sort(),
        plain(field().gates.map((gate) => gate.id)).sort(),
    );
    const assignments = Object.values(group.assignments);
    assert.equal(assignments.length, 2);
    assert.ok(assignments.every((assignment) => assignment.type === "rally"));
    assert.deepEqual(
        assignments.map((assignment) => assignment.gateId).sort(),
        plain(field().gates.map((gate) => gate.id)).sort(),
        "The waiting workers must cover opposite mouths instead of parking together on their arrival side",
    );
    for (const worker of workers) {
        const assignment = group.assignments[worker.id];
        assert.equal(worker.x, assignment.workCell.x);
        assert.equal(worker.y, assignment.workCell.y);
    }
    assert.ok(workers.some((worker) => worker.x < plan.center.x));
    assert.ok(workers.some((worker) => worker.x > plan.center.x));
});

test("passage AI reuses a bounded distance working set while stable helpers wait for construction", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9), spinner(3, 20, 5), spinner(4, 20, 9)],
        r = largePassageRuntime(workers),
        c = r.context,
        ai = r.begin();
    c.KinkyDungeonCurrentTick++;
    r.begin();
    const settled = plain(ai.passageMetrics);
    assert.ok(
        settled.distanceFieldBuilds > 0 && settled.distanceFieldBuilds <= 16,
        "This fixed fixture must fit the documented origin cache bound",
    );
    assert.ok(
        Object.values(ai.groups).some((group) =>
            Object.values(group.assignments).some((assignment) => assignment.type === "rally"),
        ),
        "The fixture must actually evaluate support stations in addition to construction work",
    );
    for (let turn = 0; turn < 20; turn++) {
        c.KinkyDungeonCurrentTick++;
        r.begin();
    }
    assert.equal(ai.passageMetrics.analysisBuilds, settled.analysisBuilds);
    assert.equal(
        ai.passageMetrics.distanceFieldBuilds,
        settled.distanceFieldBuilds,
        "Unchanged members and work stations must reuse the same distances instead of rebuilding BFS fields each turn",
    );
    assert.equal(ai.passageMetrics.routeSearches, settled.routeSearches);
});

test("passage AI releases a lure after twelve turns without contact but retains native sensing", () => {
    for (const keepSensing of [false, true]) {
        const worker = spinner(1, 5, 5),
            r = passageRuntime([worker]),
            c = r.context,
            ai = r.begin(),
            group = Object.values(ai.groups)[0],
            plan = ai.plans[group.planId],
            native = c.Spiderlings.SpinnerNativeField,
            field = () => native.state().topology.fields[plan.fieldId],
            target = c.KinkyDungeonPlayerEntity;
        for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) {
            r.begin();
            c.KinkyDungeonEnemyLoop(worker, target, 1);
            c.KinkyDungeonCurrentTick++;
        }
        assert.equal(field().phase, "ready");
        worker.aware = true;
        worker.testSense = true;
        c.KinkyDungeonEnemyLoop(worker, target, 1);
        c.Spiderlings.SpinnerAI.completePositiveTurn(1);
        assert.equal(group.engagement.lureId, worker.id);
        worker.testSense = false;
        worker.testAIData = { canSensePlayer: keepSensing, canSeePlayer: false };
        for (let turn = 1; turn <= 12; turn++) {
            c.KinkyDungeonCurrentTick++;
            r.begin();
            c.KinkyDungeonEnemyLoop(worker, target, 1);
            c.Spiderlings.SpinnerAI.completePositiveTurn(1);
            if (turn === 8)
                assert.equal(
                    group.engagement.mode,
                    "pursuit",
                    "Native pursuit retains its existing eight-turn transition",
                );
            if (turn < 12) assert.ok(group.engagement, "The lure must not expire before twelve unseen turns");
        }
        if (keepSensing) {
            assert.equal(
                group.engagement.lureId,
                worker.id,
                "Native sensing must retain the engagement even without line of sight",
            );
            assert.equal(group.engagement.noSightTurns, 12);
        } else {
            assert.equal(
                group.engagement,
                undefined,
                "A lost target must release the worker from permanent pursuit duty",
            );
            c.KinkyDungeonCurrentTick++;
            r.begin();
            assert.equal(
                group.assignments[worker.id]?.type,
                "rally",
                "The released worker returns to field staffing on the next turn",
            );
        }
    }
});

test("pressure keeps paid passage closure ahead of pursuit and brings the stationed lure beside sealed prey", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9)],
        r = passageRuntime(workers, 3),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField,
        field = () => native.state().topology.fields[plan.fieldId],
        player = c.KinkyDungeonPlayerEntity;
    const advance = () => {
        r.begin();
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, player, 1);
        c.KinkyDungeonCurrentTick++;
    };
    for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) advance();
    assert.equal(field().phase, "ready");
    Object.assign(player, plan.center);
    native.onEntry(player, player.x, player.y);
    const lure = workers[0];
    lure.aware = lure.testSense = true;
    r.begin();
    c.KinkyDungeonEnemyLoop(lure, player, 1);
    group.engagement.mode = "pressure";
    group.engagement.lureId = lure.id;
    c.KinkyDungeonCurrentTick++;
    r.begin();
    const pending = plain(group.assignments[lure.id]);
    assert.ok(["closeGate", "connectGate"].includes(pending.type));
    lure.x = pending.workCell.x;
    lure.y = pending.workCell.y;
    lure.SpinnerConstructionPoints = 1.5;
    lure.testSense = false;
    const paid = native.state().topology.actionLog.length;
    c.KinkyDungeonEnemyLoop(lure, player, 1);
    assert.equal(
        native.state().topology.actionLog.length,
        paid + 1,
        "Pressure must finish its reserved paid gate action",
    );
    assert.equal(group.lastAction, "construction");
    for (let turn = 0; turn < 100 && field().phase !== "sealed"; turn++) advance();
    assert.equal(field().phase, "sealed");
    const gate = field().gates.find((mouth) => mouth.cells[0].x > plan.center.x);
    Object.assign(lure, { x: gate.cells[0].x + 1, y: player.y, testSense: true, aware: true });
    lure.flags = { CMDR_stationed: 999, dontChase: 999 };
    lure.testAIData = { dontChase: true };
    group.engagement.lureId = lure.id;
    group.engagement.mode = "pressure";
    const beforeDistance = Math.hypot(lure.x - player.x, lure.y - player.y);
    c.KinkyDungeonCurrentTick++;
    r.begin();
    const result = c.KinkyDungeonEnemyLoop(lure, player, 1);
    assert.ok(Math.hypot(lure.x - player.x, lure.y - player.y) < beforeDistance);
    assert.equal(
        result.idle,
        false,
        "Stationed native commands must not leave the admitted prey without a second source",
    );
    assert.equal(result.attacked, false, "Approaching spends the movement turn before native melee");
});

test("passage AI moves support beside sealed prey using fresh observations before delegating adjacent melee", () => {
    for (const mode of ["fresh", "expired", "moved-unseen", "sensed-stationary"]) {
        const expireObservation = mode === "expired",
            movedUnseen = mode === "moved-unseen",
            sensedStationary = mode === "sensed-stationary",
            workers = [spinner(1, 5, 5), spinner(2, 5, 9)],
            r = passageRuntime(workers, movedUnseen ? 3 : 1),
            c = r.context,
            planner = c.Spiderlings.SpinnerPassagePlanner,
            candidates = planner.candidates;
        // Fix the horizontal interior at one cell so the post-closure support
        // positions remain two steps from prey; the wide case allows an unseen y move.
        planner.candidates = (index, options) =>
            candidates(index, { ...options, focus: undefined, preferLarge: false });
        const ai = r.begin(),
            group = Object.values(ai.groups)[0],
            plan = ai.plans[group.planId],
            native = c.Spiderlings.SpinnerNativeField,
            field = () => native.state().topology.fields[plan.fieldId],
            player = c.KinkyDungeonPlayerEntity;
        const advanceWorkers = () => {
            r.begin();
            for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, player, 1);
            c.KinkyDungeonCurrentTick++;
        };
        for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) advanceWorkers();
        assert.equal(field().phase, "ready");
        player.x = plan.center.x;
        player.y = Math.min(...field().interiorCells.map((cell) => cell.y));
        native.onEntry(player, player.x, player.y);
        for (let turn = 0; turn < 100 && field().phase !== "sealed"; turn++) advanceWorkers();
        assert.equal(field().phase, "sealed", "Preparation and closure must use actual paid worker actions");

        const [lure, helper] = workers,
            helperGate = field().gates.find((gate) => gate.id === group.rallyGates[helper.id]),
            lureGate = field().gates.find((gate) => gate.id !== helperGate.id),
            gateCell = helperGate.cells[0];
        // Stage the reported post-closure positions: one source on the opposite
        // mouth, the helper immediately outside its assigned mouth.
        lure.x = lureGate.cells[0].x + Math.sign(lureGate.cells[0].x - plan.center.x);
        lure.y = player.y;
        helper.x = gateCell.x + Math.sign(gateCell.x - plan.center.x);
        helper.y = player.y;
        lure.aware = true;
        lure.testSense = true;
        helper.aware = sensedStationary;
        helper.testSense = sensedStationary;
        if (sensedStationary) {
            helper.flags = { CMDR_stationed: 999 };
            helper.testAIData = { canSensePlayer: true, canSeePlayer: true, dontChase: true };
        }
        c.KinkyDungeonCurrentTick++;
        c.KinkyDungeonEnemyLoop(lure, player, 1);
        assert.equal(group.engagement.lureId, lure.id);
        lure.x = lureGate.cells[0].x;
        lure.y = player.y;
        const observed = plain(group.engagement.lastKnown);
        assert.equal(observed.source, "native");
        assert.equal(Math.max(Math.abs(helper.x - player.x), Math.abs(helper.y - player.y)), 2);
        if (movedUnseen) {
            const destination = field().interiorCells.find((cell) => Math.abs(cell.y - observed.y) >= 2);
            assert.ok(destination, "The wide passage must allow an unobserved move within its sealed interior");
            c.KDMoveEntity(player, destination.x, destination.y, true);
            assert.equal(field().phase, "sealed");
        }
        if (expireObservation) for (let turn = 0; turn < 4; turn++) c.Spiderlings.SpinnerAI.completePositiveTurn(1);
        c.KinkyDungeonCurrentTick++;
        r.begin();
        const assignment = group.assignments[helper.id],
            moves = [],
            originalMove = c.KinkyDungeonEnemyTryMove;
        c.KinkyDungeonEnemyTryMove = (...args) => {
            moves.push({ id: args[0].id, delta: args[2], x: args[3], y: args[4] });
            return originalMove(...args);
        };
        const before = { x: helper.x, y: helper.y };
        const result = c.KinkyDungeonEnemyLoop(helper, player, 1);
        if (expireObservation) {
            assert.equal(group.engagement.lastKnown, undefined);
            assert.ok(
                !field().gates.some((gate) =>
                    gate.cells.some((cell) => cellKeyForTest(cell) === cellKeyForTest(assignment.workCell)),
                ),
                "Expired knowledge must not reserve a gate approach to the old target coordinate",
            );
            assert.ok(
                Math.max(Math.abs(helper.x - observed.x), Math.abs(helper.y - observed.y)) >= 2,
                "The helper must not approach the old coordinate using an expired team observation",
            );
        } else {
            assert.equal(assignment.type, "rally");
            assert.ok(
                moves.some((move) => move.id === helper.id && move.delta > 0),
                "Support must use the native movement entrance",
            );
            assert.equal(Math.max(Math.abs(helper.x - before.x), Math.abs(helper.y - before.y)), 1);
            assert.equal(
                Math.max(Math.abs(helper.x - observed.x), Math.abs(helper.y - observed.y)),
                1,
                "The helper crosses its own web mouth toward the team's last native observation",
            );
            if (movedUnseen)
                assert.equal(
                    Math.max(Math.abs(helper.x - player.x), Math.abs(helper.y - player.y)),
                    2,
                    "An unobserved target move must not grant the helper the target's new position",
                );
            else
                assert.equal(
                    Math.max(Math.abs(helper.x - player.x), Math.abs(helper.y - player.y)),
                    1,
                    "Fresh team sight lets the helper reach physical supporting range",
                );
            if (sensedStationary) {
                assert.equal(
                    result.idle,
                    false,
                    "A sensing but stationed helper must perform its support move at distance two",
                );
                assert.equal(result.attacked, false);
                assert.equal(result.cast, false, "Moving support must not also use the native attack or spell phase");
                c.Spiderlings.SpinnerAI.completePositiveTurn(1);
                c.KinkyDungeonCurrentTick++;
                r.begin();
                const moveCount = moves.length,
                    adjacent = c.KinkyDungeonEnemyLoop(helper, player, 1);
                assert.equal(
                    adjacent.idle,
                    true,
                    "Only after reaching an adjacent cell does support delegate to native melee",
                );
                assert.equal(adjacent.attacked, true);
                assert.equal(adjacent.cast, true);
                assert.equal(
                    moves.length,
                    moveCount,
                    "Adjacent support must not spend another rally move before native combat",
                );
            } else
                assert.deepEqual(
                    plain(group.engagement.lastKnown),
                    observed,
                    "A helper without individual sensing must not invent or refresh a target observation",
                );
        }
    }
});

test("passage AI lets sealed-field support cross its waiting-mouth partition in a three-cell interior", () => {
    const workers = [spinner(1, 5, 5), spinner(2, 5, 9)],
        r = passageRuntime(workers, 1, 25),
        c = r.context,
        planner = c.Spiderlings.SpinnerPassagePlanner,
        candidates = planner.candidates;
    // Select one real, validated longer candidate to isolate support movement
    // from the autonomous ranking preference for smaller passage interiors.
    planner.candidates = (index, options) => {
        const candidate = candidates(index, { ...options, maxCandidates: 24 }).find(
            (entry) =>
                entry.interiorCells.length === 3 && new Set(entry.interiorCells.map((cell) => cell.y)).size === 1,
        );
        assert.ok(candidate, "The corridor must offer a validated horizontal three-cell capture interior");
        return [candidate];
    };
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField,
        field = () => native.state().topology.fields[plan.fieldId],
        player = c.KinkyDungeonPlayerEntity;
    planner.candidates = candidates;
    const advanceWorkers = () => {
        r.begin();
        for (const worker of workers) c.KinkyDungeonEnemyLoop(worker, player, 1);
        c.KinkyDungeonCurrentTick++;
    };
    for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) advanceWorkers();
    assert.equal(field().phase, "ready");
    player.x = Math.max(...field().interiorCells.map((cell) => cell.x));
    player.y = plan.center.y;
    native.onEntry(player, player.x, player.y);
    for (let turn = 0; turn < 100 && field().phase !== "sealed"; turn++) advanceWorkers();
    assert.equal(field().phase, "sealed");
    const west = field().gates.reduce((a, b) => (a.cells[0].x < b.cells[0].x ? a : b)),
        helper = workers.find((worker) => group.rallyGates[worker.id] === west.id),
        lure = workers.find((worker) => worker !== helper),
        east = field().gates.find((gate) => gate !== west);
    assert.ok(helper, "One worker must retain the original west-mouth waiting assignment");
    helper.x = Math.min(...field().interiorCells.map((cell) => cell.x));
    helper.y = player.y;
    lure.x = east.cells[0].x + 1;
    lure.y = player.y;
    lure.aware = true;
    lure.testSense = true;
    c.KinkyDungeonCurrentTick++;
    c.KinkyDungeonEnemyLoop(lure, player, 1);
    assert.equal(group.engagement.lureId, lure.id);
    c.KinkyDungeonCurrentTick++;
    r.begin();
    const before = { x: helper.x, y: helper.y },
        assignment = group.assignments[helper.id];
    assert.equal(Math.max(Math.abs(before.x - player.x), Math.abs(before.y - player.y)), 2);
    assert.equal(
        assignment.workCell.x,
        plan.center.x,
        "A sealed-field helper may use the middle cell even when it belongs to the other mouth's waiting region",
    );
    c.KinkyDungeonEnemyLoop(helper, player, 1);
    assert.ok(r.movement.some((move) => move.id === helper.id && move.x === assignment.workCell.x));
    assert.equal(Math.max(Math.abs(helper.x - before.x), Math.abs(helper.y - before.y)), 1);
    assert.equal(Math.max(Math.abs(helper.x - player.x), Math.abs(helper.y - player.y)), 1);
});

test("passage AI replaces a reserved gate connection after native damage and cooldown", () => {
    const worker = spinner(1, 5, 5),
        r = passageRuntime([worker]),
        c = r.context,
        ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField,
        field = () => native.state().topology.fields[plan.fieldId],
        player = c.KinkyDungeonPlayerEntity;
    const advanceWorker = () => {
        c.KinkyDungeonEnemyLoop(worker, player, 1);
        c.KinkyDungeonCurrentTick++;
    };
    for (let turn = 0; turn < 100 && field().phase !== "ready"; turn++) {
        r.begin();
        advanceWorker();
    }
    assert.equal(field().phase, "ready");
    player.x = plan.center.x;
    player.y = plan.center.y;
    native.onEntry(player, player.x, player.y);
    let connection;
    for (let turn = 0; turn < 100; turn++) {
        r.begin();
        connection = group.assignments[worker.id];
        if (connection?.type === "connectGate") break;
        advanceWorker();
    }
    assert.equal(
        connection?.type,
        "connectGate",
        "The fixture must stop after paid web placement but before its reserved connection",
    );
    const proxy = c.KDMapData.Entities.find(
        (entity) => native.isOwnedProxy(entity) && cellKeyForTest(entity) === cellKeyForTest(connection.target),
    );
    assert.ok(proxy);
    assert.equal(native.onNativeDamage({ enemy: proxy, dmgDealt: 100 }), true);
    const link = () => native.state().topology.links.find((entry) => entry.id === connection.linkId),
        actionsBeforeRepair = native.state().topology.actionLog.length;
    assert.equal(link().hp, 0);
    c.KinkyDungeonCurrentTick++;
    r.begin();
    assert.ok(
        group.assignments[worker.id]?.type !== "connectGate" ||
            group.assignments[worker.id]?.linkId !== connection.linkId,
        "A broken unprepared mouth must discard the old connection task immediately",
    );
    for (let turn = 0; turn < 100 && !(link().connected && link().hp > 0); turn++) {
        native.tick(1);
        r.begin();
        advanceWorker();
    }
    assert.ok(
        link().prepared && link().connected && link().hp > 0,
        "After the normal cooldown, the worker must prepare, close and connect the broken mouth again",
    );
    assert.equal(link().builtCells.length, link().plannedCells.length);
    const repairActions = native
        .state()
        .topology.actionLog.slice(actionsBeforeRepair)
        .filter((action) => cellKeyForTest(action.cell) === cellKeyForTest(connection.target));
    assert.ok(repairActions.some((action) => action.type === "prepareGate"));
    assert.ok(repairActions.some((action) => action.type === "closeGate"));
    assert.ok(repairActions.some((action) => action.type === "connectGate"));
});

test("passage AI approaches a blocked rally route only while its next step remains empty", () => {
    for (const blockNextStep of [false, true]) {
        const workers = [spinner(1, 5, 5), spinner(2, 5, 9), spinner(3, 20, 5), spinner(4, 20, 9)],
            r = largePassageRuntime(workers),
            c = r.context,
            ai = r.begin();
        c.Spiderlings.SpinnerAI.preparePositiveTurn(1);
        const group = Object.values(ai.groups)[0],
            entry = Object.entries(group.assignments).find(([id, assignment]) => {
                const actor = workers.find((worker) => String(worker.id) === id);
                return (
                    assignment.type === "rally" &&
                    Math.max(Math.abs(actor.x - assignment.workCell.x), Math.abs(actor.y - assignment.workCell.y)) > 3
                );
            });
        assert.ok(entry, "The fixture needs a distant recruited helper with an actual rally assignment");
        const [id, assignment] = entry,
            helper = workers.find((worker) => String(worker.id) === id),
            findPath = c.KinkyDungeonFindPath,
            route = findPath(helper.x, helper.y, assignment.workCell.x, assignment.workCell.y, false),
            next = route[0],
            blocker = workers.find((worker) => worker !== helper),
            occupied = route[blockNextStep ? 0 : 2],
            requests = [];
        assert.ok(next && occupied);
        blocker.x = occupied.x;
        blocker.y = occupied.y;
        c.KinkyDungeonFindPath = (...args) => {
            requests.push({ blockEnemy: args[4] });
            return args[4] ? [] : findPath(...args);
        };
        const before = { x: helper.x, y: helper.y, credit: helper.SpinnerConstructionPoints || 0 },
            graph = JSON.stringify(c.Spiderlings.SpinnerNativeField.state().topology),
            moves = r.movement.length;
        c.KinkyDungeonEnemyLoop(helper, c.KinkyDungeonPlayerEntity, 1);
        assert.deepEqual(
            requests.map((request) => request.blockEnemy),
            [true, false],
            "Only a failed actor-blocking path permits the rally fallback route query",
        );
        if (blockNextStep) {
            assert.equal(helper.x, before.x);
            assert.equal(helper.y, before.y);
            assert.equal(
                r.movement.length,
                moves,
                "A fallback path must not move through the coworker in its next cell",
            );
        } else {
            assert.equal(helper.x, next.x);
            assert.equal(helper.y, next.y);
            assert.equal(
                Math.max(Math.abs(helper.x - before.x), Math.abs(helper.y - before.y)),
                1,
                "The recruit approaches along one legal free step instead of waiting for the entire route to clear",
            );
            assert.ok(r.movement.slice(moves).some((move) => move.id === helper.id));
            assert.ok(helper.x !== blocker.x || helper.y !== blocker.y);
        }
        assert.equal(helper.SpinnerConstructionPoints || 0, before.credit);
        assert.equal(
            JSON.stringify(c.Spiderlings.SpinnerNativeField.state().topology),
            graph,
            "Rally movement or waiting must not pay for or alter construction",
        );
    }
});

test("occupied top-eight passages do not hide later legal route sites", () => {
    const r = passageRuntime([spinner(1, 5, 5)], 2, 65),
        c = r.context,
        planner = c.Spiderlings.SpinnerPassagePlanner,
        index = planner.buildIndex(r.snapshot()),
        blocked = new Map(
            planner
                .candidates(index)
                .flatMap((candidate) => candidate.gates.flatMap((gate) => gate.cells.filter((cell) => cell.y === 7)))
                .map((cell) => [cellKeyForTest(cell), cell]),
        );
    c.KDMapData.Entities.push(
        ...[...blocked.values()].map((cell, ordinal) => ({
            id: 100 + ordinal,
            ...cell,
            hp: 10,
            Enemy: { name: "Bandit", movePoints: 1, tags: {} },
        })),
    );
    assert.ok(planner.candidates(index, { blockedKeys: [...blocked.keys()] }).length);
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    assert.equal(plan.kind, "passage", "A legal route site must be reconsidered before off-route enclosure fallback");
    assert.ok(plan.gates.every((gate) => gate.cells.every((cell) => !blocked.has(cellKeyForTest(cell)))));
    assert.equal(plan.proof.kind, "mandatory");
});

test("an occupied corridor is not a reachable approach to a new passage", () => {
    const r = passageRuntime([spinner(1, 5, 5)], 1, 65),
        c = r.context;
    c.KDMapData.Entities.push({ id: 99, x: 8, y: 7, hp: 10, Enemy: { name: "Bandit", movePoints: 1, tags: {} } });
    const ai = r.begin(),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    assert.equal(plan.kind, "enclosure", "Do not send builders through a currently impassable occupied mouth");
});

test("unreachable passages do not hide reachable sites beyond either shortlist limit", () => {
    for (const blockerX of [20, 40]) {
        const r = passageRuntime([spinner(1, 60, 7)], 1, 65),
            c = r.context;
        c.KDMapData.Entities.push({ id: 99, x: blockerX, y: 7, hp: 10, Enemy: { name: "Bandit", tags: {} } });
        const ai = r.begin(),
            group = Object.values(ai.groups)[0],
            plan = ai.plans[group.planId];
        assert.equal(plan.kind, "passage", `Reachable passages past the blocker at ${blockerX} must remain eligible`);
        assert.equal(plan.proof.kind, "mandatory");
        assert.ok(plan.gates.every((gate) => gate.cells.every((cell) => cell.x > blockerX)));
    }
});

test("enclosure gates follow fresh player reports through paid work and keep unseen positions private", () => {
    const worker = spinner(1, 8, 6),
        r = runtime([worker]),
        c = r.context,
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId],
        native = c.Spiderlings.SpinnerNativeField;
    for (let tick = 0; tick < 240; tick++) {
        start(r, snapshot);
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        c.Spiderlings.SpinnerAI.completePositiveTurn(1);
        c.KinkyDungeonCurrentTick++;
    }
    const player = c.KinkyDungeonPlayerEntity,
        reporter = remotePlayerReporter(c);
    for (const x of [16, 1]) {
        Object.assign(player, { x, y: plan.center.y });
        Object.assign(reporter, { x, y: plan.center.y + 1 });
        group.engagement = { ...group.engagement, mode: "pressure", progress: { distance: 0, turn: -100 } };
        const physical = JSON.stringify(c.Spiderlings.SpinnerTopology.solidCells(native.state().topology));
        start(r, snapshot);
        assert.equal(
            JSON.stringify(c.Spiderlings.SpinnerTopology.solidCells(native.state().topology)),
            physical,
            "Choosing a new opening cannot cut silk for free",
        );
        const gates = plan.fieldIds.map((id) => plain(native.state().topology.fields[id].gateCell));
        assert.ok(
            gates.every((g) => (x > plan.center.x ? g.x > plan.center.x : g.x < plan.center.x)),
            JSON.stringify(gates),
        );
        assert.notEqual(group.engagement?.mode, "lure", "Changing field entrances must not restart waiting");
        assert.equal(group.engagement?.progress, undefined);
        for (let tick = 0; tick < 120; tick++) {
            start(r, snapshot);
            c.KinkyDungeonEnemyLoop(worker, player, 1);
            c.Spiderlings.SpinnerAI.completePositiveTurn(1);
            c.KinkyDungeonCurrentTick++;
        }
        const graph = native.state().topology,
            solid = new Set(c.Spiderlings.SpinnerTopology.solidCells(graph).map(cellKeyForTest));
        for (const id of plan.fieldIds) {
            const field = graph.fields[id];
            assert.deepEqual(
                plain(field.boundaryCells.filter((cell) => !solid.has(cellKeyForTest(cell)))),
                plain([field.gateCell]),
                "Paid work must open the new entrance and rebuild the former entrance",
            );
        }
    }
    reporter.hp = 0;
    for (let i = 0; i < 9; i++) {
        c.Spiderlings.SpinnerAI.completePositiveTurn(1);
        c.KinkyDungeonCurrentTick++;
        start(r, snapshot);
    }
    const gates = plan.fieldIds.map((id) => plain(native.state().topology.fields[id].gateCell));
    player.x = 16;
    start(r, snapshot);
    assert.deepEqual(
        plan.fieldIds.map((id) => plain(native.state().topology.fields[id].gateCell)),
        gates,
        "Unseen movement must not reorient the field",
    );
});

for (const obstruction of ["target", "workstations"])
    test(`enclosure crew finds another same-layer paid job when its nearest ${obstruction} is occupied`, () => {
        const actors = [spinner(1, 5, 3), spinner(2, 5, 9), spinner(3, 11, 6)],
            r = runtime([...actors]),
            c = r.context,
            { SpinnerAI: planner, SpinnerNativeField: native } = c.Spiderlings,
            placed = planner.initializeMapgenField({ preferredSites: [{ x: 8, y: 6 }] }),
            encounter = native.state(),
            group = encounter.ai.groups[placed.groupId],
            snapshot = mapSnapshot();
        delete snapshot.candidateLines;
        start(r, snapshot);
        const worker = actors.find((actor) => group.assignments[actor.id]?.role === "body"),
            original = plain(group.assignments[worker.id]),
            blockedCells =
                obstruction === "target"
                    ? [original.target]
                    : [-1, 0, 1].flatMap((dy) =>
                          [-1, 0, 1].flatMap((dx) =>
                              dx || dy ? [{ x: original.target.x + dx, y: original.target.y + dy }] : [],
                          ),
                      );
        // Keep the selected worker outside the occupied ring so none of its
        // current cells can legitimately serve as a retained workstation.
        if (blockedCells.some((cell) => cell.x === worker.x && cell.y === worker.y)) {
            worker.x = 15;
            worker.y = 9;
        }
        for (const [index, cell] of blockedCells.entries())
            c.KDMapData.Entities.push({ id: 700 + index, ...cell, hp: 3, Enemy: { name: "Bandit" } });
        const before = plain(encounter.topology.actionLog || []);
        start(r, snapshot);
        const replacement = group.assignments[worker.id];
        assert.ok(replacement, "An occupied nearest job must not remove the worker's entire construction duty");
        assert.notEqual(cellKeyForTest(replacement.target), cellKeyForTest(original.target));
        assert.equal(replacement.fieldId, original.fieldId, "Do not skip the unfinished outer layer");
        assert.deepEqual(plain(encounter.topology.actionLog || []), before, "Assignment itself cannot build");
        // Execute the assigned alternative through the same movement and paid-work interface.
        worker.x = replacement.workCell.x;
        worker.y = replacement.workCell.y;
        worker.SpinnerConstructionPoints = 0;
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        assert.deepEqual(plain(encounter.topology.actionLog || []), before, "The first credit is not free work");
        c.KinkyDungeonCurrentTick++;
        c.KinkyDungeonEnemyLoop(worker, c.KinkyDungeonPlayerEntity, 1);
        assert.ok(encounter.topology.actionLog.length > before.length);
        assert.equal(encounter.ai.plans[group.planId].compositeId, placed.compositeId);
    });

for (const damage of [0.5, 100]) {
    test(`real Runtime preserves Capture while paid maintenance heals ${damage} damage`, () => {
        const actors = [spinner(1, 7, 6), spinner(2, 9, 6)],
            r = runtime(actors),
            c = r.context,
            native = c.Spiderlings.SpinnerNativeField;
        load(c, "SpiderlingsWebbingData.js");
        c.Spiderlings.Webbing = { COCOON_ID: "SpiderlingsWebbingCocoon", FINAL_ESCAPE_EVENT: "finalEscape" };
        c.KinkyDungeonAllRestraintDynamic = () => [];
        c.KinkyDungeonRestraints = [];
        c.KinkyDungeonEnemyAt = (x, y) =>
            c.KDMapData.Entities.findLast((actor) => actor.hp > 0 && actor.x === x && actor.y === y);
        c.KinkyDungeonEnemyCanMove = (actor, direction) =>
            !c.KinkyDungeonEntityAt(actor.x + direction.x, actor.y + direction.y);
        for (const actor of actors) {
            actor.Enemy = { ...actor.Enemy, attack: "Melee", attackRange: 1 };
        }
        // The fixture supplies native equipment queries, never a Capture handler.
        load(c, "SpiderlingsSpinnerCapture.js");
        const capture = c.Spiderlings.SpinnerCapture;
        Object.assign(c.KinkyDungeonPlayerEntity, { x: 8, y: 6 });
        native.initializeEnclosure({
            compositeId: "maintenance-runtime",
            owners: actors.map((actor) => actor.id),
            built: true,
            autoSeal: true,
            layers: [
                {
                    id: "runtime-ring",
                    vertices: [
                        { x: 4, y: 2 },
                        { x: 12, y: 2 },
                        { x: 12, y: 10 },
                        { x: 4, y: 10 },
                    ],
                    gate: { x: 12, y: 6 },
                },
            ],
        });
        native.state().builders = {};
        c.Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
        assert.equal(capture.hit(actors[0]), true);
        c.KinkyDungeonEnemyLoop(actors[1], c.KinkyDungeonPlayerEntity, 1);
        assert.deepEqual(plain(capture.state().sourceIds), [1, 2]);
        capture.state().weaveProgress = 10;
        capture.state().escapeProgress = 7;
        const proxy = c.KDMapData.Entities.find(
            (actor) => native.isOwnedProxy(actor) && actor.x === 12 && actor.y === 5,
        );
        assert.ok(proxy);
        native.onNativeDamage({ enemy: proxy, dmgDealt: damage });
        const damagedId = native.state().topology.links.find((link) => link.hp < link.maxHp).id,
            apply = native.applyPaidAction,
            operations = [];
        native.applyPaidAction = function (actor, action) {
            const result = apply.apply(this, arguments);
            if (result.applied)
                operations.push({ type: action.type, sources: plain(capture.state()?.sourceIds || []) });
            return result;
        };
        for (let tick = 0; tick < 100; tick++) {
            c.Spiderlings.SpinnerAI.beginTurn({ activate: true });
            for (const actor of actors) c.KinkyDungeonEnemyLoop(actor, c.KinkyDungeonPlayerEntity, 1);
            c.KDEventMapGeneric.tickAfter.SpiderlingsSpinnerRuntime({}, { delta: 1 });
            c.KinkyDungeonCurrentTick++;
            const link = native.state().topology.links.find((entry) => entry.id === damagedId);
            if (link.hp === link.maxHp && native.captureGeometryReady(c.KinkyDungeonPlayerEntity)) break;
        }
        const link = native.state().topology.links.find((entry) => entry.id === damagedId);
        assert.equal(link.hp, link.maxHp, JSON.stringify(operations));
        assert.equal(native.captureGeometryReady(c.KinkyDungeonPlayerEntity), true);
        assert.ok(operations.length > 0);
        assert.ok(operations.every((operation) => operation.sources.length >= 1));
        if (damage === 100) assert.ok(operations.some((operation) => operation.type === "extendLink"));
        assert.equal(capture.state().weaveProgress, 10);
        assert.equal(capture.state().escapeProgress, 7);
        native.applyPaidAction = apply;
        capture.cancel();
    });
}

test("a retained leg bag with no field makes the real dispatcher build around a fresh player observation", () => {
    const actors = [spinner(1, 7, 6), spinner(2, 9, 6)],
        r = runtime(actors),
        c = r.context,
        snapshot = mapSnapshot(),
        bag = { id: 1001, name: "SpiderlingsSpinnerLegbinder", data: { wrapProgress: 1 } };
    delete snapshot.candidateLines;
    c.KinkyDungeonAllRestraintDynamic = () => [{ item: bag }];
    c.KinkyDungeonRestraints = [];
    load(c, "SpiderlingsSpinnerRecoveryCore.js");
    load(c, "SpiderlingsSpinnerRecovery.js");
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 8, y: 6 });
    const native = c.Spiderlings.SpinnerNativeField;
    native.ensureMap({ scenario: "recovery-around" });
    c.Spiderlings.SpinnerAI.beginTurn({ activate: true, mapSnapshot: snapshot });
    const initial = native.state().ai,
        group = Object.values(initial.groups)[0];
    // Remove its old field, then deliver a fresh native observation of the bag wearer.
    for (const id of initial.plans[group.planId].fieldIds) native.retireField(id);
    group.engagement = {
        target: { kind: "player" },
        lureId: actors[0].id,
        lastKnown: { x: 8, y: 6, age: 0, source: "native" },
        mode: "pressure",
        noSightTurns: 0,
        lureNoContactTurns: 0,
    };
    assert.equal(c.Spiderlings.SpinnerRecovery.needsField(), true);
    c.Spiderlings.SpinnerAI.beginTurn({ activate: true, mapSnapshot: snapshot });
    const plan = native.state().ai.plans[group.planId];
    assert.equal(plan.kind, "enclosure");
    assert.equal(
        c.Spiderlings.SpinnerTopology.isInsideCommonCore(
            native.state().topology,
            plan.compositeId,
            c.KinkyDungeonPlayerEntity,
        ),
        true,
    );
    assert.equal(native.state().topology.actionLog.length, 0, "Planning must not grant free construction");
    for (let turn = 0; turn < 15; turn++) {
        c.Spiderlings.SpinnerAI.beginTurn({ activate: true, mapSnapshot: snapshot });
        for (const actor of actors) c.KinkyDungeonEnemyLoop(actor, c.KinkyDungeonPlayerEntity, 1);
        c.KDEventMapGeneric.tickAfter.SpiderlingsSpinnerRuntime({}, { delta: 1 });
        c.KinkyDungeonCurrentTick++;
    }
    assert.ok(native.state().topology.actionLog.length > 0, "Replacement needs actual paid construction");
});
