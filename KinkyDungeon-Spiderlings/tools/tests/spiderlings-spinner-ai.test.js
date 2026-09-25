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
            KinkyDungeonMultiplicativeStat: () => 1,
            KDBoundEffects: () => 0,
            KinkyDungeonApplyBuffToEntity() {},
            KDMoveEntity(entity, x, y, _willing, _dash, _forceHitBullets, ignoreBlocked) {
                if (!ignoreBlocked && context.KinkyDungeonEntityAt(x, y)) return false;
                entity.x = x;
                entity.y = y;
                return true;
            },
            KinkyDungeonFindPath(fromX, fromY, toX, toY) {
                return context.Spiderlings.SpinnerAI.routeOnSnapshot(
                    mapSnapshot(),
                    { x: fromX, y: fromY },
                    { x: toX, y: toY },
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
    return { context, tiles, movement, nativeCalls, phaseCalls };
}

function start(r, snapshot = mapSnapshot()) {
    return r.context.Spiderlings.SpinnerAI.beginTurn({ activate: true, mapSnapshot: snapshot });
}

test("a lone Spinner plans and pays for a 3x3 outer field before expanding", () => {
    const worker = spinner(1, 8, 6),
        r = runtime([worker]),
        snapshot = mapSnapshot();
    delete snapshot.candidateLines;
    const ai = start(r, snapshot),
        group = Object.values(ai.groups)[0],
        plan = ai.plans[group.planId];
    assert.ok(ai.plannerWorkLast.candidateCells <= snapshot.cells.length);
    assert.equal(plan.kind, "enclosure");
    assert.equal(
        r.context.Spiderlings.SpinnerNativeField.state().topology.fields[plan.fieldId].boundaryCells.length,
        8,
    );
    assert.equal(r.context.Spiderlings.SpinnerNativeField.state().topology.fields[plan.fieldId].phase, "preparing");
    for (let turn = 0; turn < 160; turn++) {
        start(r, snapshot);
        r.context.KinkyDungeonEnemyLoop(worker, r.context.KinkyDungeonPlayerEntity, 1);
        r.context.KinkyDungeonCurrentTick++;
    }
    const graph = r.context.Spiderlings.SpinnerNativeField.state().topology;
    assert.equal(ai.plannerWorkLast.candidateCells, 0);
    assert.ok(ai.plannerWorkPeak.expansionCells <= 24);
    assert.equal(graph.fields[plan.fieldId].phase, "sealed", JSON.stringify(group.metrics));
    assert.equal(graph.composites[plan.compositeId].layerIds.length, 3, JSON.stringify(group.metrics));
    assert.ok(graph.composites[plan.compositeId].layerIds.every((id) => graph.fields[id].phase === "sealed"));
    assert.ok(graph.actionLog.filter((action) => action.fieldId === plan.fieldId).length >= 9);
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
    assert.equal(groups[1].assignments[workers[1].id]?.fieldId, fieldByWorker.get(workers[1].id));
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
        assert.ok(
            graph.actionLog.some((action) => action.fieldId === fieldId),
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
    assert.equal(
        ai.plannerWorkLast.candidateCells,
        snapshot.cells.filter((cell) => Math.max(Math.abs(cell.x - worker.x), Math.abs(cell.y - worker.y)) <= 6).length,
    );
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
    r.context.Spiderlings.Infestation = {
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
        { count: 2, travel: 22, construction: 5, wait: 5, yield: 0, repair: 3 },
        { count: 4, travel: 22, construction: 5, wait: 5, yield: 0, repair: 3 },
        { count: 8, travel: 22, construction: 5, wait: 5, yield: 0, repair: 3 },
    ]);
});
