"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadLifecycleRuntime, modRoot } = require("./helpers/lifecycle-runtime.js");

function scenario() {
    const moves = [];
    const patrol = { id: 1, x: 36, y: 16, hp: 2, Enemy: { name: "Jumper", tags: { spiderlings: true } } };
    const builders = [2, 3].map((id) => ({
        id,
        x: 32 + id,
        y: 18,
        hp: 2,
        buffs: {},
        Enemy: { name: "Spinner", tags: { spiderlings: true }, movePoints: 1.5 },
    }));
    const fixture = loadLifecycleRuntime({
        KDGameData: { RoomType: "prison", SleepTurns: 0 },
        KDMapData: {
            RoomType: "prison",
            GridWidth: 55,
            GridHeight: 45,
            StartPosition: { x: 11, y: 22 },
            EndPosition: { x: 51, y: 22 },
            ShortcutPositions: {},
            Entities: [patrol, ...builders],
            SpiderlingsPrison: { version: 1, patrols: { 1: { route: 0, waypoint: 0 } } },
        },
        KinkyDungeonPlayerEntity: { id: -1, player: true, x: 11, y: 22 },
        KinkyDungeonCurrentTick: 0,
        KinkyDungeonLastAction: "Wait",
        KinkyDungeonMovableTilesEnemy: "0",
        KinkyDungeonMovableTilesSmartEnemy: "0",
        KinkyDungeonMapGet: () => "0",
        KinkyDungeonTilesGet: () => undefined,
        KinkyDungeonCheckPath: () => true,
        KinkyDungeonGetBuffedStat: () => 0,
        KinkyDungeonMultiplicativeStat: () => 1,
        KDBoundEffects: () => 0,
        KDHostile: () => true,
        KDAllied: () => false,
        KDIsInParty: () => false,
        KDIsImprisoned: () => false,
        KDIsImmobile: () => false,
        KDEnemyHasFlag: () => false,
        KinkyDungeonIsDisabled: () => false,
        KinkyDungeonEnemyCanMove: () => true,
        KDHelpless: () => false,
        KDAIType: {
            hunt: { beforemove: () => false, attack: () => true, spell: () => true },
            wander: { beforemove: () => false },
        },
        KinkyDungeonFindPath: (x, y, gx, gy) => [{ x: x + Math.sign(gx - x), y: y + Math.sign(gy - y) }],
        KinkyDungeonEnemyTryMove(enemy, _direction, delta, x, y) {
            moves.push({ id: enemy.id, delta });
            enemy.x = x;
            enemy.y = y;
            return true;
        },
    });
    const c = fixture.context;
    c.KinkyDungeonEntityAt = (x, y) =>
        (c.KinkyDungeonPlayerEntity.x === x && c.KinkyDungeonPlayerEntity.y === y
            ? c.KinkyDungeonPlayerEntity
            : null) || c.KDMapData.Entities.find((enemy) => enemy.x === x && enemy.y === y);
    c.Spiderlings.Prison = { isPrison: () => true };
    for (const file of [
        "SpiderlingsSpinnerTopology.js",
        "SpiderlingsSpinnerNativeField.js",
        "SpiderlingsSpinnerAI.js",
        "SpiderlingsFieldCommand.js",
        "SpiderlingsFieldProjects.js",
        "SpiderlingsFieldCustody.js",
        "SpiderlingsSpinnerDuties.js",
        "SpiderlingsPrisonAlerts.js",
        "SpiderlingsPrisonNest.js",
        "SpiderlingsSpinnerRuntime.js",
    ])
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), c, { filename: file });
    c.Spiderlings.Webbing.equipForDebug("SpiderlingsWebbingCocoon");
    for (let turn = 0; turn < 25; turn++) {
        c.KinkyDungeonCurrentTick++;
        c.KDEventMapGeneric.tick.SpiderlingsCocoonVigil(null, { delta: 1 });
    }
    return { c, patrol, builders, moves };
}

test("prison patrols continue after 25 idle Cocoon turns without attacking the player", () => {
    const { c, patrol, moves } = scenario();
    patrol.SpiderlingsSpinnerRuntimeDelta = 1;
    const data = { idle: true, canSensePlayer: true, hostile: true, wantsToAttack: true };
    assert.equal(c.KDAIType.hunt.beforemove(patrol, c.KinkyDungeonPlayerEntity, data), true);
    assert.equal(moves.length, 1);
    assert.equal(moves[0].id, patrol.id);
    assert.equal(data.idle, false);
    assert.equal(data.wantsToAttack, false);
});

test("zero-time native phases cannot move a prison patrol or advance its waypoint", () => {
    const { c, patrol, moves } = scenario();
    const before = { x: patrol.x, y: patrol.y, tick: c.KinkyDungeonCurrentTick };
    const patrolState = JSON.stringify(c.KDMapData.SpiderlingsPrison.patrols);
    for (const delta of [0, undefined]) {
        patrol.SpiderlingsSpinnerRuntimeDelta = delta;
        c.KDAIType.hunt.beforemove(patrol, c.KinkyDungeonPlayerEntity, { canSensePlayer: false });
    }
    assert.equal(moves.length, 0);
    assert.deepEqual({ x: patrol.x, y: patrol.y, tick: c.KinkyDungeonCurrentTick }, before);
    assert.equal(JSON.stringify(c.KDMapData.SpiderlingsPrison.patrols), patrolState);
    patrol.SpiderlingsSpinnerRuntimeDelta = 0.5;
    c.KDAIType.hunt.beforemove(patrol, c.KinkyDungeonPlayerEntity, { canSensePlayer: false });
    assert.equal(moves.length, 1);
    assert.equal(moves[0].delta, 0.5);
});

test("prison spiders without patrol or builder work still disperse from a quiet Cocoon", () => {
    const { c } = scenario();
    const enemy = { id: 4, x: 12, y: 22, hp: 1, Enemy: { name: "WebCaster" } };
    const data = { wantsToAttack: true, MovableTiles: "0", AvoidTiles: "" };
    assert.equal(c.KDAIType.hunt.beforemove(enemy, c.KinkyDungeonPlayerEntity, data), false);
    assert.ok(Math.hypot(enemy.gx - 11, enemy.gy - 22) > 1);
    assert.equal(data.wantsToAttack, false);
    Object.assign(enemy, { x: 17, y: 22 });
    assert.equal(c.KDAIType.hunt.beforemove(enemy, c.KinkyDungeonPlayerEntity, data), true);
});

test("Cocoon vigil cannot take the native spell phase from a dispatched Tunneler", () => {
    const { c } = scenario();
    const builder = { id: 4, x: 14, y: 7, hp: 1, Enemy: { name: "Tunneler", tags: { spiderlings: true } } };
    c.KDMapData.Entities.push(builder);
    c.Spiderlings.Prison.isPrison = () => false;
    c.Spiderlings.PrisonEscort = { ownsActor: (enemy) => enemy === builder };
    assert.equal(c.Spiderlings.Webbing.isCocoonDispersing(builder, c.KinkyDungeonPlayerEntity), true);
    assert.equal(c.Spiderlings.SpinnerDuties.beginAction(builder, c.KinkyDungeonPlayerEntity, 1), undefined);
    assert.equal(c.Spiderlings.SpinnerDuties.gate(builder), true);
});

test("ordinary prison builders resume paid work after the Cocoon vigil ends a player engagement", () => {
    const { c, builders, moves } = scenario();
    c.KDMapData.Entities.push(
        ...[5, 6].map((id) => ({
            id,
            x: 40,
            y: 18 + id,
            hp: 2,
            buffs: {},
            Enemy: { name: "Spinner", tags: { spiderlings: true }, movePoints: 1.5 },
        })),
    );
    const cells = [];
    for (let y = 1; y < 44; y++)
        for (let x = 1; x < 54; x++) cells.push({ x, y, floor: true, protected: false, locked: false });
    const snapshot = {
        width: 55,
        height: 45,
        cells,
        entrances: [{ x: 11, y: 22 }],
        exits: [{ x: 51, y: 22 }],
        nests: [],
        candidateLines: [
            [
                { x: 36, y: 20 },
                { x: 36, y: 24 },
            ],
        ],
    };
    const ai = c.Spiderlings.SpinnerAI.beginTurn({ activate: true, mapSnapshot: snapshot });
    const group = Object.values(ai.groups)[0];
    group.engagement = { target: { kind: "player", id: -1 }, lureId: builders[0].id, mode: "pursuit" };
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 36, y: 17 });
    for (const builder of builders) {
        builder.aware = true;
        builder.SpiderlingsSpinnerRuntimeDelta = 1;
        c.Spiderlings.SpinnerDuties.beginAction(builder, c.KinkyDungeonPlayerEntity, 1);
        const data = { idle: true, canSensePlayer: true, canSeePlayer: true, hostile: true, wantsToAttack: true };
        c.KDAIType.hunt.beforemove(builder, c.KinkyDungeonPlayerEntity, data);
        assert.equal(c.KDAIType.hunt.attack(builder), false);
        assert.equal(c.KDAIType.hunt.spell(builder), false);
    }
    assert.equal(group.engagement, undefined);
    assert.ok(
        moves.some((move) => builders.some((builder) => builder.id === move.id) && move.delta > 0) ||
            group.metrics.construction > 0,
        JSON.stringify(group),
    );
});

test("a prison field member with no work retreats instead of holding beside a quiet Cocoon", () => {
    const { c, builders } = scenario();
    const enemy = builders[0];
    Object.assign(enemy, { x: 12, y: 22, aware: true, SpiderlingsSpinnerRuntimeDelta: 1 });
    c.Spiderlings.SpinnerNativeField.initializeMap({
        fieldId: "quiet-field",
        owners: [enemy.id],
        anchors: [
            { x: 30, y: 20 },
            { x: 30, y: 24 },
        ],
    });
    const encounter = c.Spiderlings.SpinnerNativeField.state();
    encounter.ai ||= { groups: {}, plans: {} };
    encounter.ai.groups.quietField = { id: "quietField", memberIds: [enemy.id], planId: "quietPlan" };
    encounter.ai.plans.quietPlan = { id: "quietPlan", status: "ready", fieldIds: [], cells: [] };
    c.Spiderlings.FieldCommand.ensure(encounter).members[enemy.id] = {
        home: "quietField",
        commander: "quietField",
        phase: "home",
    };
    // Projects and AI supply the supported idle-field facts; Duties owns the
    // decision that must reach the real shared movement and attack phases.
    c.Spiderlings.FieldProjects = { ...c.Spiderlings.FieldProjects, beginWork: () => undefined };
    c.Spiderlings.SpinnerAI = {
        ...c.Spiderlings.SpinnerAI,
        dutyFacts: () => ({ validPlan: true, nestAttacker: false }),
    };
    c.Spiderlings.SpinnerDuties.beginAction(enemy, c.KinkyDungeonPlayerEntity, 1);
    const data = { canSensePlayer: true, hostile: true, wantsToAttack: true, MovableTiles: "0", AvoidTiles: "" };
    c.KDAIType.hunt.beforemove(enemy, c.KinkyDungeonPlayerEntity, data);
    assert.equal(c.Spiderlings.SpinnerDuties.current(enemy).role, "disperse");
    assert.ok(Math.hypot(enemy.gx - 11, enemy.gy - 22) > 1);
    assert.equal(data.wantsToAttack, false);
    assert.equal(c.KDAIType.hunt.attack(enemy), false);
    assert.equal(c.KDAIType.hunt.spell(enemy), false);
});

test("quiet Cocoon dispersal can take a closer first step to get around a wall", () => {
    const { c } = scenario();
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 16, y: 8 });
    const enemy = { id: 9, x: 13, y: 6, hp: 2, Enemy: { name: "Spinner" } };
    c.KDMapData.Entities.push(enemy);
    const floor = new Set(["16,8", "13,6", "13,7", "13,8", "13,9", "13,10", "13,11"]);
    c.KinkyDungeonMapGet = (x, y) => (floor.has(`${x},${y}`) ? "0" : "1");
    c.KinkyDungeonEnemyCanMove = (actor, direction) => floor.has(`${actor.x + direction.x},${actor.y + direction.y}`);
    const data = { wantsToAttack: true, MovableTiles: "0", AvoidTiles: "" };
    const result = c.Spiderlings.Webbing.disperseCocoonEnemy(enemy, c.KinkyDungeonPlayerEntity, data);
    assert.equal(result, false);
    assert.deepEqual({ x: enemy.gx, y: enemy.gy }, { x: 13, y: 7 });
    assert.equal(data.ignore, true);
    assert.equal(data.wantsToAttack, false);
});
