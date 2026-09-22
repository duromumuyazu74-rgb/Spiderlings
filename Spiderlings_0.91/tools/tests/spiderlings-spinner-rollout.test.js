"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modRoot = path.resolve(__dirname, "../..");
const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });

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

test("rollout deterministically promotes a saved group to an enclosure or its line fallback", () => {
    for (const kind of ["enclosure", "line", "mixed"]) {
        const ai = {
                groups: {
                    g1: { id: "g1", memberIds: [1, 2], planId: "p1" },
                    g2: { id: "g2", memberIds: [3, 4], planId: "p2" },
                },
                plans: {
                    p1: {
                        id: "p1",
                        fieldId: "line-1",
                        anchors: [
                            { x: 8, y: 4 },
                            { x: 8, y: 8 },
                        ],
                    },
                    p2: {
                        id: "p2",
                        fieldId: "line-2",
                        anchors: [
                            { x: 3, y: 2 },
                            { x: 3, y: 5 },
                        ],
                    },
                },
            },
            oldEncounter = { ai, autonomous: true },
            context = {
                Spiderlings: {
                    getSetting: () => true,
                    SpinnerTopology: {
                        createEnclosure(input) {
                            if (kind === "line") return { kind: "line", owners: input.owners };
                            const fieldId = input.layers[0].id;
                            return {
                                kind: "enclosure",
                                owners: input.owners,
                                fields: {
                                    [fieldId]: { id: fieldId, type: "enclosure", vertices: input.layers[0].vertices },
                                },
                                composites: { [input.compositeId]: { id: input.compositeId, layerIds: [fieldId] } },
                                fieldOwners: { [fieldId]: input.owners },
                            };
                        },
                        createPhysicalGraph: ({ fields, owners }) => ({
                            fields: Object.fromEntries(fields.map((field) => [field.id, field])),
                            owners,
                            anchors: fields.flatMap((field) =>
                                field.vertices.map((point, index) => ({
                                    ...point,
                                    id: `${field.id}:a${index}`,
                                    owners: [field.id],
                                })),
                            ),
                            links: fields.map((field) => ({ id: `${field.id}:link`, owners: [field.id] })),
                            junctions: [],
                        }),
                    },
                    SpinnerNativeField: {
                        state: () => context.KDMapData.Encounter,
                        ensureMap: () => (context.KDMapData.Encounter ||= oldEncounter),
                        mapSnapshot: () => ({ width: 18, height: 12, floor: [], protected: [], occupied: [] }),
                        initializeEnclosure(input) {
                            context.lastInput = input;
                            const fieldId = input.layers[0].id;
                            return (context.KDMapData.Encounter = {
                                topology:
                                    kind === "enclosure"
                                        ? {
                                              kind,
                                              owners: input.owners,
                                              fields: {
                                                  [fieldId]: {
                                                      id: fieldId,
                                                      type: "enclosure",
                                                      vertices: input.layers[0].vertices,
                                                  },
                                              },
                                              composites: {
                                                  [input.compositeId]: { id: input.compositeId, layerIds: [fieldId] },
                                              },
                                              fieldOwners: { [fieldId]: input.owners },
                                          }
                                        : {
                                              kind: "line",
                                              owners: input.owners,
                                              fields: {},
                                              composites: {},
                                              fieldOwners: { "line-1": input.owners },
                                              lineFields: {
                                                  "line-1": {
                                                      id: "line-1",
                                                      type: "line",
                                                      vertices: input.fallbackLine.anchors,
                                                  },
                                              },
                                          },
                                builders: {},
                            });
                        },
                        addLine(input) {
                            (context.lines ||= []).push(input);
                        },
                        setOwners() {},
                        reconcile() {},
                    },
                },
                KDMapData: {
                    Encounter: oldEncounter,
                    SpiderlingsSpinnerRollout: { version: 1, enabled: true, kind: "ordinary" },
                },
                KDEventMapGeneric: {},
                KDAddEvent(map, trigger, id, handler) {
                    (map[trigger] ||= {})[id] = handler;
                },
            };
        context.globalThis = context;
        vm.createContext(context);
        load(context, "SpiderlingsSpinnerRollout.js");
        const decision = context.Spiderlings.SpinnerRollout.preparePositiveTurn();
        assert.equal(decision.g1.kind, kind === "enclosure" ? "enclosure" : "line-fallback");
        assert.equal(decision.g2.kind, kind === "line" ? "line-fallback" : "enclosure");
        assert.equal(context.KDMapData.Encounter.ai, ai);
        assert.deepEqual(context.KDMapData.Encounter.builders, {});
        assert.equal(context.lastInput.layers[0].core.x, 8);
        assert.equal(context.lastInput.fallbackLine.fieldId, "line-1");
        if (kind === "line") {
            assert.equal(context.lines[0].fieldId, "line-2");
            assert.deepEqual(Array.from(context.lines[0].owners), [3, 4]);
        } else {
            assert.equal(context.KDMapData.Encounter.topology.composites["rollout-g2"].layerIds.length, 1);
            if (kind === "mixed") {
                assert.ok(context.KDMapData.Encounter.topology.fields["line-1"]);
                assert.deepEqual(Array.from(context.KDMapData.Encounter.topology.fieldOwners["line-1"]), [1, 2]);
                assert.ok(
                    context.KDMapData.Encounter.topology.anchors.some((anchor) => anchor.owners.includes("line-1")),
                );
                assert.ok(context.KDMapData.Encounter.topology.links.some((link) => link.owners.includes("line-1")));
            }
        }
    }
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
});
