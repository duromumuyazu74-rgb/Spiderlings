"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { rolloutFixture: nativeRollout } = require("../measure-spinner-rollout.js");

const modRoot = path.resolve(__dirname, "../..");
const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });

test("rollout records saved AI decisions without replacing fields or scanning the map", () => {
    for (const count of [1, 2, 4]) {
        const fixture = nativeRollout(count),
            c = fixture.context;
        const ai = JSON.parse(JSON.stringify(c.KDMapData.SpiderlingsSpinnerEncounter.ai));
        const first = c.Spiderlings.SpinnerRollout.preparePositiveTurn();
        assert.equal(Object.keys(first).length, count);
        assert.equal(fixture.snapshotCalls(), 0);
        assert.ok(Object.values(first).every((decision) => decision.kind === "line-fallback"));
        const saved = JSON.stringify(c.KDMapData.SpiderlingsSpinnerEncounter);
        assert.equal(c.Spiderlings.SpinnerRollout.preparePositiveTurn(), first);
        assert.equal(fixture.snapshotCalls(), 0);
        assert.equal(JSON.stringify(c.KDMapData.SpiderlingsSpinnerEncounter), saved);
        c.KDMapData = {
            ...c.KDMapData,
            Entities: [],
            SpiderlingsSpinnerEncounter: { ai },
            SpiderlingsSpinnerRollout: { version: 1, enabled: true, kind: "ordinary" },
        };
        c.KinkyDungeonMapGet = () => "1";
        const second = c.Spiderlings.SpinnerRollout.preparePositiveTurn();
        assert.equal(fixture.snapshotCalls(), 0);
        assert.ok(Object.values(second).every((decision) => decision.kind === "line-fallback"));
    }
});

function rolloutFixture(setting = true) {
    let ensureCalls = 0,
        reconcileCalls = 0;
    const context = {
        Spiderlings: {
            getSetting: () => setting,
            SpinnerNativeField: {
                ensureMap() {
                    ensureCalls++;
                    return (context.KDMapData.SpiderlingsSpinnerEncounter ||= {});
                },
                state: () => context.KDMapData.SpiderlingsSpinnerEncounter,
                reconcile: () => reconcileCalls++,
            },
        },
        KDMapData: { Entities: [], MapMod: "None", RoomType: "" },
        KDEventMapGeneric: {},
        KDAddEvent(map, trigger, id, handler) {
            (map[trigger] ||= {})[id] = handler;
        },
        KDGetAltType: () => ({ enemies: true, spawns: true }),
        MiniGameKinkyDungeonLevel: 1,
    };
    context.globalThis = context;
    vm.createContext(context);
    load(context, "SpiderlingsSpinnerRollout.js");
    return {
        context,
        api: context.Spiderlings.SpinnerRollout,
        ensureCalls: () => ensureCalls,
        reconcileCalls: () => reconcileCalls,
    };
}

test("rollout eligibility records every exclusion reason and keeps infestation eligible", () => {
    const r = rolloutFixture();
    const decide = (room = {}, map = {}, settingEnabled = true) => r.api.eligibility({ room, map, settingEnabled });
    assert.deepEqual({ ...decide() }, { enabled: true, kind: "ordinary", reason: "eligible" });
    assert.deepEqual(
        { ...decide({}, { MapMod: "SpiderlingsInfestation" }) },
        { enabled: true, kind: "infestation", reason: "eligible" },
    );
    for (const [reason, room, map] of [
        ["boss", { bossroom: true }, {}],
        ["jail", { isPrison: true }, {}],
        ["tutorial", {}, { RoomType: "Tutorial" }],
        ["scripted", {}, { RoomType: "DragonLair" }],
        ["noncombat", { enemies: false }, {}],
    ])
        assert.equal(decide(room, map).reason, reason);
    assert.equal(decide({}, {}, false).reason, "setting");
});

test("postMapgen snapshots once, does not spawn, and setting changes apply only to the next map", () => {
    const r = rolloutFixture(false),
        event = r.context.KDEventMapGeneric.postMapgen.SpiderlingsSpinnerRollout;
    event();
    const first = JSON.stringify(r.context.KDMapData.SpiderlingsSpinnerRollout);
    assert.equal(r.ensureCalls(), 0);
    r.context.Spiderlings.getSetting = () => true;
    event();
    assert.equal(JSON.stringify(r.context.KDMapData.SpiderlingsSpinnerRollout), first);
    r.context.KDMapData = { Entities: [], MapMod: "None", RoomType: "" };
    event();
    assert.equal(r.context.KDMapData.SpiderlingsSpinnerRollout.enabled, true);
    assert.equal(r.context.KDMapData.SpiderlingsSpinnerEncounter.autonomous, true);
    assert.equal(r.ensureCalls(), 1);
});

test("load restores enabled snapshots only and never activates absent or disabled maps", () => {
    const r = rolloutFixture(true),
        loadEvent = r.context.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRollout;
    loadEvent();
    assert.equal(r.ensureCalls(), 0);
    r.context.KDMapData.SpiderlingsSpinnerRollout = { version: 1, enabled: false };
    loadEvent();
    assert.equal(r.reconcileCalls(), 0);
    r.context.KDMapData.SpiderlingsSpinnerRollout.enabled = true;
    r.context.KDMapData.SpiderlingsSpinnerEncounter = { autonomous: false };
    loadEvent();
    assert.equal(r.context.KDMapData.SpiderlingsSpinnerEncounter.autonomous, true);
    assert.equal(r.reconcileCalls(), 1);
});

test("rollout preserves a 3x3 enclosure plan and records later groups without resetting topology", () => {
    const r = rolloutFixture(),
        map = r.context.KDMapData,
        topology = { fieldId: "minimum", fields: { minimum: { bounds: { width: 3, height: 3 } } } },
        first = {
            id: "p1",
            kind: "enclosure",
            fieldId: "minimum",
            center: { x: 8, y: 6 },
            anchors: [
                { x: 7, y: 5 },
                { x: 9, y: 5 },
                { x: 9, y: 7 },
                { x: 7, y: 7 },
            ],
        };
    map.SpiderlingsSpinnerRollout = { version: 1, enabled: true, kind: "ordinary" };
    map.SpiderlingsSpinnerEncounter = {
        topology,
        ai: { groups: { g1: { id: "g1", memberIds: [1], planId: "p1" } }, plans: { p1: first } },
    };
    const decisions = r.api.preparePositiveTurn();
    assert.equal(decisions.g1.kind, "enclosure");
    assert.deepEqual({ ...decisions.g1.core }, { x: 8, y: 6 });
    assert.equal(map.SpiderlingsSpinnerEncounter.topology, topology);
    assert.equal(map.SpiderlingsSpinnerEncounter.ai.plans.p1, first);
    map.SpiderlingsSpinnerEncounter.ai.groups.g2 = { id: "g2", memberIds: [2, 3], planId: "p2" };
    map.SpiderlingsSpinnerEncounter.ai.plans.p2 = {
        id: "p2",
        kind: "line",
        anchors: [
            { x: 3, y: 4 },
            { x: 3, y: 7 },
        ],
    };
    assert.equal(r.api.preparePositiveTurn(), decisions);
    assert.equal(decisions.g2.kind, "line-fallback");
    assert.equal(map.SpiderlingsSpinnerEncounter.topology, topology);
    map.SpiderlingsSpinnerEncounter.ai.groups.g1.planId = "p2";
    assert.equal(r.api.preparePositiveTurn(), decisions);
    assert.equal(decisions.g1.planId, "p2");
    assert.equal(decisions.g1.kind, "line-fallback");
});

test("scenario registry exposes all ten same-runtime classes and real controls", () => {
    const sent = [],
        encounter = { topology: { kind: "enclosure" }, builders: {} },
        actors = Array.from({ length: 8 }, (_, index) => ({
            id: index + 1,
            hp: 10,
            aware: false,
            vp: 0,
            Enemy: { name: "Spinner" },
        })),
        npcTarget = { id: 90, hp: 10, Enemy: { name: "Maid" } },
        prior = { topology: { kind: "line", fieldId: "prior" }, builders: {} },
        priorProxy = { id: 700, x: 2, y: 2, hp: 2, ownedProxy: true, Enemy: { name: "Web" } },
        grid = new Map(),
        tileData = new Map(),
        context = {
            Spiderlings: {
                SpinnerTopology: {
                    createLine: () => ({ anchors: [{ id: "a" }, { id: "b" }], links: [{ id: "l", plannedCells: [] }] }),
                },
                SpinnerNativeField: {
                    KEY: "Encounter",
                    initializeMap: () => (context.KDMapData.Encounter = encounter),
                    initializeEnclosure: () => (context.KDMapData.Encounter = encounter),
                    ensureMap: () => (context.KDMapData.Encounter = encounter),
                    state: () => context.KDMapData.Encounter,
                    reconcile() {},
                    isOwnedProxy: (entity) => entity?.ownedProxy === true,
                    onNativeDamage(data) {
                        sent.push(["damage", data]);
                    },
                    addLine(data) {
                        sent.push(["line", data]);
                        return encounter;
                    },
                },
                SpinnerAI: {
                    beginTurn: (input) => ({ groups: { g: { memberIds: [...(input.ownerIds || [])] } } }),
                },
                SpinnerCapture: { state: () => undefined },
                SpinnerNPCCapture: { state: () => undefined },
                SpinnerRecovery: { state: () => undefined },
                SpinnerNPCRecovery: { state: () => undefined },
            },
            KDMapData: {
                Entities: [...actors, npcTarget, priorProxy],
                RandomPathablePointsSeed: 123,
                Encounter: prior,
            },
            KDGameData: {},
            KDEventMapGeneric: {},
            KDAddEvent(map, trigger, id, handler) {
                (map[trigger] ||= {})[id] = handler;
            },
            KinkyDungeonPlayerEntity: { x: 1, y: 1 },
            KinkyDungeonCurrentTick: 5,
            KDHostile: () => true,
            KinkyDungeonMapGet: (x, y) => grid.get(`${x},${y}`) || "x",
            KinkyDungeonMapSet: (x, y, value) => grid.set(`${x},${y}`, value),
            KinkyDungeonTilesGet: (key) => tileData.get(key),
            KinkyDungeonTilesSet: (key, value) => tileData.set(key, value),
            KinkyDungeonTilesDelete: (key) => tileData.delete(key),
            KDRemoveEntity(entity) {
                context.KDMapData.Entities = context.KDMapData.Entities.filter((candidate) => candidate !== entity);
            },
            KDSendInput(type, data) {
                sent.push([type, data]);
                return "Tick";
            },
            TextGet: () => "5.5.0",
        };
    context.globalThis = context;
    vm.createContext(context);
    load(context, "SpiderlingsSpinnerScenarios.js");
    const api = context.Spiderlings.SpinnerScenarios,
        ids = Object.keys(api.REGISTRY);
    assert.deepEqual(ids, [
        "single-door",
        "two-cell-corridor",
        "t-junction",
        "cross-junction",
        "regular-room",
        "irregular-concave-room",
        "exit-vicinity",
        "insufficient-space",
        "overlapping-groups",
        "nested-fields",
    ]);
    for (const id of ids) {
        const result = api.setupScene(id, {
            ownerIds: [1, 2, 3, 4, 5, 6, 7, 8],
            actorCount: 8,
            targetKind: "npc",
            targetId: 90,
            awareness: "engaged",
        });
        assert.equal(result.sceneId, id);
        assert.equal(result.targetKind, "npc");
        assert.equal(result.started, true);
        assert.equal(api.inspectScene().scene.targetId, 90);
        assert.equal(api.inspectScene().scene.ownerIds.length, result.actorCount);
        assert.equal(api.resolveTarget(actors[0], { id: "native" }), npcTarget);
        assert.equal(api.resolveTarget({ id: 999 }, { id: "native" }).id, "native");
        if (api.REGISTRY[id].setup === "autonomous") {
            const group = Object.values(result.ai.groups)[0];
            assert.equal(group.engagement.target.id, 90);
            assert.equal(group.memberIds.length, result.actorCount);
        }
        if (id === "regular-room") assert.equal(grid.get("20,5"), ".");
        if (id === "nested-fields") assert.equal(grid.get("10,7"), ".");
        if (id === "single-door") {
            assert.equal(grid.get("5,3"), ".");
            assert.equal(grid.get("5,2"), "1");
        }
        if (["regular-room", "nested-fields"].includes(id)) {
            const group = Object.values(result.ai.groups)[0];
            assert.equal(group.engagement.target.id, 90);
            assert.equal(group.memberIds.length, result.actorCount);
        }
        assert.equal(api.teardownScene(), true);
        assert.equal(JSON.stringify(context.KDMapData.Encounter), JSON.stringify(prior));
        assert.equal(context.KDMapData.Entities.includes(priorProxy), true);
        if (id === "regular-room") assert.equal(grid.get("20,5"), "x");
        if (id === "nested-fields") assert.equal(grid.get("10,7"), "x");
    }
    const snapshots = ["two-cell-corridor", "t-junction", "cross-junction", "exit-vicinity"].map((id) =>
        api.sceneMapSnapshot(id),
    );
    assert.equal(new Set(snapshots.map((snapshot) => JSON.stringify(snapshot.candidateLines))).size, 4);
    assert.equal(snapshots[3].cells.find((cell) => cell.x === 16 && cell.y === 6).protected, true);
    assert.equal(sent.filter(([type]) => type === "line").length, 2, "overlap creates two live field plans");
    api.setupScene("regular-room", { ownerIds: actors.map((actor) => actor.id), actorCount: 2 });
    assert.equal(api.setupScene("missing-scene", {}).reason, "unknown-scene");
    assert.equal(api.inspectScene().scene.sceneId, "regular-room");
    assert.equal(api.stepScene(), "Tick");
    assert.equal(api.damageStructure({ amount: 2 }).debugInjected, true);
    const exported = JSON.parse(api.exportScene());
    assert.equal(exported.gameVersion, "5.5.0");
    assert.ok(exported.state.encounter);
    const savedControl = JSON.stringify(context.KDGameData.SpiderlingsSpinnerScenarioControl);
    load(context, "SpiderlingsSpinnerScenarios.js");
    context.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerScenarioControl({}, {});
    assert.equal(JSON.stringify(context.KDGameData.SpiderlingsSpinnerScenarioControl), savedControl);
    assert.equal(JSON.parse(context.Spiderlings.SpinnerScenarios.exportScene()).scene.sceneId, "regular-room");
    assert.equal(context.Spiderlings.SpinnerScenarios.teardownScene(), true);
    assert.equal(JSON.stringify(context.KDMapData.Encounter), JSON.stringify(prior));
    assert.equal(grid.get("8,4"), "x", "scenario terrain restores exactly");
    assert.equal(
        context.Spiderlings.SpinnerScenarios.setupScene("nested-fields", {
            ownerIds: [1, 2],
            actorCount: 4,
        }).reason,
        "actors",
    );
    assert.equal(JSON.stringify(context.KDMapData.Encounter), JSON.stringify(prior));
    const originalInitialize = context.Spiderlings.SpinnerNativeField.initializeEnclosure;
    context.Spiderlings.SpinnerNativeField.initializeEnclosure = () => {
        const failedProxy = { id: 999, x: 4, y: 4, hp: 2, ownedProxy: true, Enemy: { name: "Web" } };
        context.KDMapData.Entities.push(failedProxy);
        return (context.KDMapData.Encounter = { topology: { kind: "abandoned", reason: "blocked" } });
    };
    const beforeIds = context.KDMapData.Entities.map((entity) => entity.id);
    const failed = context.Spiderlings.SpinnerScenarios.setupScene("regular-room", {
        ownerIds: [1, 2],
        actorCount: 2,
    });
    assert.equal(failed.started, false);
    assert.deepEqual(
        context.KDMapData.Entities.map((entity) => entity.id),
        beforeIds,
    );
    assert.equal(JSON.stringify(context.KDMapData.Encounter), JSON.stringify(prior));
    context.Spiderlings.SpinnerNativeField.initializeEnclosure = originalInitialize;
    context.KDMapData.GridWidth = 8;
    context.KDMapData.GridHeight = 8;
    const beforeSmall = JSON.stringify({ ids: context.KDMapData.Entities.map((entity) => entity.id), grid: [...grid] });
    assert.equal(
        context.Spiderlings.SpinnerScenarios.setupScene("regular-room", { ownerIds: [1, 2], actorCount: 2 }).reason,
        "map-size",
    );
    assert.equal(
        JSON.stringify({ ids: context.KDMapData.Entities.map((entity) => entity.id), grid: [...grid] }),
        beforeSmall,
    );
    context.KDMapData.GridWidth = 31;
    context.KDMapData.GridHeight = 21;
    context.Spiderlings.SpinnerScenarios.setupScene("single-door", { ownerIds: [1, 2], actorCount: 2 });
    assert.equal(context.KDEventMapGeneric.beforeStairCancel?.SpiderlingsSpinnerScenarioControl, undefined);
    context.KDEventMapGeneric.beforeHandleStairs.SpiderlingsSpinnerScenarioControl({}, {});
    assert.equal(context.Spiderlings.SpinnerScenarios.inspectScene().scene, undefined);
    for (const [sceneId, width, height, count] of [
        ["irregular-concave-room", 24, 14, 2],
        ["insufficient-space", 10, 14, 2],
        ["overlapping-groups", 14, 10, 4],
    ]) {
        context.KDMapData.GridWidth = width;
        context.KDMapData.GridHeight = height;
        const exact = context.Spiderlings.SpinnerScenarios.setupScene(sceneId, {
            ownerIds: actors.map((actor) => actor.id),
            actorCount: count,
        });
        assert.equal(exact.started, true, `${sceneId}: exact minimum`);
        context.Spiderlings.SpinnerScenarios.teardownScene();
        const before = JSON.stringify({ encounter: context.KDMapData.Encounter, grid: [...grid] });
        context.KDMapData.GridWidth = width - 1;
        assert.equal(
            context.Spiderlings.SpinnerScenarios.setupScene(sceneId, {
                ownerIds: actors.map((actor) => actor.id),
                actorCount: count,
            }).reason,
            "map-size",
        );
        context.KDMapData.GridWidth = width;
        context.KDMapData.GridHeight = height - 1;
        assert.equal(
            context.Spiderlings.SpinnerScenarios.setupScene(sceneId, {
                ownerIds: actors.map((actor) => actor.id),
                actorCount: count,
            }).reason,
            "map-size",
        );
        assert.equal(JSON.stringify({ encounter: context.KDMapData.Encounter, grid: [...grid] }), before);
    }
});
