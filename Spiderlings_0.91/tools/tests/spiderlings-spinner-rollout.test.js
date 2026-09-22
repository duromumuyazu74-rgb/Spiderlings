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

test("scenario registry exposes all ten same-runtime classes and real controls", () => {
    const sent = [],
        encounter = { topology: { kind: "enclosure" }, builders: {} },
        context = {
            Spiderlings: {
                SpinnerTopology: {
                    createLine: () => ({ anchors: [{ id: "a" }, { id: "b" }], links: [{ id: "l", plannedCells: [] }] }),
                },
                SpinnerNativeField: {
                    initializeMap: () => encounter,
                    initializeEnclosure: () => encounter,
                    ensureMap: () => encounter,
                    state: () => encounter,
                    onNativeDamage(data) {
                        sent.push(["damage", data]);
                    },
                    addLine(data) {
                        sent.push(["line", data]);
                        return encounter;
                    },
                },
                SpinnerAI: { beginTurn: () => ({ groups: { g: {} } }) },
                SpinnerCapture: { state: () => undefined },
                SpinnerNPCCapture: { state: () => undefined },
                SpinnerRecovery: { state: () => undefined },
                SpinnerNPCRecovery: { state: () => undefined },
            },
            KDMapData: { Entities: [], RandomPathablePointsSeed: 123 },
            KDGameData: {},
            KinkyDungeonPlayerEntity: { x: 1, y: 1 },
            KinkyDungeonCurrentTick: 5,
            KDHostile: () => true,
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
            awareness: "engaged",
        });
        assert.equal(result.sceneId, id);
        assert.equal(result.targetKind, "npc");
    }
    const snapshots = ["two-cell-corridor", "t-junction", "cross-junction", "exit-vicinity"].map((id) =>
        api.sceneMapSnapshot(id),
    );
    assert.equal(new Set(snapshots.map((snapshot) => JSON.stringify(snapshot.candidateLines))).size, 4);
    assert.equal(snapshots[3].cells.find((cell) => cell.x === 16 && cell.y === 6).protected, true);
    assert.equal(sent.filter(([type]) => type === "line").length, 2, "overlap creates two live field plans");
    assert.equal(api.stepScene(), "Tick");
    assert.equal(api.damageStructure({ amount: 2 }).debugInjected, true);
    const exported = JSON.parse(api.exportScene());
    assert.equal(exported.gameVersion, "5.5.0");
    assert.ok(exported.state.encounter);
});
