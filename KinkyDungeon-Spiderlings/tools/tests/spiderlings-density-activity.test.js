"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "../..");

function runtime() {
    const inventory = [],
        queued = [],
        buffs = {};
    let prison = false;
    const c = {
        console,
        Math,
        KDGameData: {},
        KinkyDungeonCurrentTick: 1,
        KinkyDungeonPlayerEntity: { id: -1, x: 0, y: 0, player: true, sound: 0 },
        KDMapData: { Entities: [], SpiderlingsPrison: { patrols: {}, builderIds: [] } },
        KDEventMapGeneric: {},
        KDInputTypes: {},
        KDAddEvent(map, trigger, name, fn) {
            (map[trigger] ||= {})[name] = fn;
        },
        KDHostile: () => true,
        KDHelpless: () => false,
        KinkyDungeonIsDisabled: () => false,
        KDAllied: () => false,
        KDIsInParty: () => false,
        KDCanDetect: () => false,
        KDEnemyVisionRadius: () => 8,
        KinkyDungeonCheckLOS: () => false,
        KDCanHearEnemy: (enemy, player) =>
            player.sound > 0 && Math.hypot(enemy.x - player.x, enemy.y - player.y) <= player.sound,
        KDCanHearSound: (enemy, radius, x, y) => Math.hypot(enemy.x - x, enemy.y - y) <= radius,
        KinkyDungeonAllRestraintDynamic: () => inventory.map((item) => ({ item })),
        KinkyDungeonApplyBuffToEntity: (_entity, buff) => {
            buffs[buff.id] = buff;
        },
        KinkyDungeonExpireBuff: (_entity, id) => {
            delete buffs[id];
        },
        KDAddDelayedAction: (action) => queued.push(action),
        addTextKey() {},
        Spiderlings: {
            Hooks: { wrap: (_id, native, factory) => factory(native) },
            Prison: { isPrison: () => prison },
            PrisonConstruction: { COMPOSITE: "chamber" },
            PrisonEscort: { ownsActor: () => false },
            SpinnerNativeField: { state: () => ({ topology: { composites: {} }, command: { members: {} } }) },
            SpinnerTopology: { fieldWorkNeeds: () => ({}) },
            FieldCommand: { sourceRole: () => undefined },
        },
    };
    const noise = (x = 0, y = 0, radius = 4) =>
        c.KDEventMapGeneric.afterNoise.SpiderlingsPrisonActivity(null, { x, y, radius });
    c.KinkyDungeonCastSpell = (x, y) => noise(x, y);
    c.KinkyDungeonBulletHit = (bullet) => noise(bullet.x, bullet.y);
    c.KinkyDungeonAdvanceTime = () => noise(30, 0);
    c.KinkyDungeonStruggle = () => {
        noise();
        c.KinkyDungeonAdvanceTime(1);
    };
    c.KDInputTypes.noise = () => noise();
    c.KDProcessInput = () => {
        noise();
        c.KinkyDungeonAdvanceTime(1);
    };
    vm.createContext(c);
    for (const file of ["SpiderlingsSilkDensity.js", "SpiderlingsPrisonActivity.js"])
        vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), c, { filename: file });
    return {
        c,
        inventory,
        queued,
        buffs,
        density: c.Spiderlings.SilkDensity,
        activity: c.Spiderlings.PrisonActivity,
        setPrison: (value) => {
            prison = value;
        },
    };
}
const spider = (id = 1, x = 0) => ({ id, x, y: 0, hp: 2, Enemy: { name: "Spinner" } });

test("hostile contacts grow density beyond the Cocoon threshold without a cap", () => {
    const r = runtime();
    for (let i = 0; i < 35; i++) r.density.contact(spider());
    assert.equal(r.density.state().value, 350);
    assert.equal(r.density.escapeMultiplier(), 4.5);
    assert.equal(r.buffs.SpiderlingsSilkDensity.text, "350");
    assert.equal(r.buffs.SpiderlingsSilkDensity.type, "SpiderlingsSilkDensity");
});

test("foreign, allied and duplicate same-source trail contacts do not add density", () => {
    const r = runtime();
    assert.equal(r.density.contact({ ...spider(), allied: true }), false);
    assert.equal(r.density.contact({ Enemy: { name: "Maidforce" } }), false);
    r.density.contact(spider(), "trail");
    r.density.contact(spider(), "trail");
    assert.equal(r.density.state().value, 2);
    r.c.KinkyDungeonCurrentTick++;
    r.density.contact(spider(), "trail");
    assert.equal(r.density.state().value, 4);
});

test("quiet decay continues while ordinary restraints, Cocoon, leg bags and leashes stay equipped", () => {
    for (const name of [
        "SpiderlingsWebbingLv1Arm",
        "SpiderlingsWebbingCocoon",
        "SpiderlingsSpinnerLegbinder",
        "SpiderlingsSilkLeash",
        "SpiderlingsMageRuneArms",
    ]) {
        const r = runtime();
        r.density.state().value = 300;
        r.inventory.push({ name });
        r.density.advance(10);
        assert.equal(r.density.state().value, 300);
        r.density.advance(12);
        assert.equal(r.density.state().value, 150);
        assert.equal(r.density.state().bareTurns, 22);
        assert.equal(r.inventory[0].name, name);
    }
});

test("quiet grace is ten world turns, then accelerated decay is delta-invariant", () => {
    const a = runtime(),
        b = runtime();
    a.density.state().value = b.density.state().value = 200;
    a.density.advance(10);
    assert.equal(a.density.state().value, 200);
    a.density.advance(12);
    b.density.advance(22);
    assert.equal(a.density.state().value, 100);
    assert.ok(Math.abs(a.density.state().value - b.density.state().value) < 1e-10);
    a.density.advance(0);
    assert.equal(a.density.state().bareTurns, 22);
});

test("save/load and re-equipping retain density without converting it to a slow buff", () => {
    const r = runtime();
    r.density.state().value = 250;
    r.density.advance(13);
    const saved = JSON.stringify(r.c.KDGameData);
    r.c.KDGameData = JSON.parse(saved);
    r.c.KDEventMapGeneric.afterLoadGame.SpiderlingsSilkDensity();
    assert.equal(r.buffs.SpiderlingsSilkDensity.text, String(Math.floor(r.density.state().value)));
    r.inventory.push({ name: "SpiderlingsWebbingLv1Arm" });
    r.density.advance(1);
    assert.equal(r.density.state().bareTurns, 14);
});

test("a fresh hostile hit restarts quiet grace, while player effort and equipment changes do not", () => {
    const r = runtime();
    r.density.state().value = 300;
    r.inventory.push({ name: "SpiderlingsWebbingCocoon" });
    r.density.advance(22);
    assert.equal(r.density.state().value, 150);
    r.density.contact(spider());
    r.density.advance(1);
    assert.equal(r.density.state().value, 160);
    assert.equal(r.density.state().bareTurns, 0);
    r.c.KinkyDungeonStruggle();
    r.inventory.push({ name: "SpiderlingsSilkLeash" });
    r.density.advance(10);
    assert.equal(r.density.state().value, 160);
    r.density.advance(12);
    assert.equal(r.density.state().value, 80);
    r.density.advance(100);
    assert.equal(r.density.state().value, 0);
    assert.equal(r.density.escapeMultiplier(), 1);
});

test("density scales native queued escape work after its minimum and preserves prior progress", () => {
    const r = runtime();
    r.density.state().value = 300;
    const item = { name: "SpiderlingsWebbingLv3Arm", struggleProgress: 0.6 };
    r.c.KDAddDelayedAction({ commit: "Struggle", data: { escapeData: { restraint: item }, amount: 0.04 } });
    assert.equal(r.queued[0].data.amount, 0.01);
    assert.equal(item.struggleProgress, 0.6);
    r.c.KDAddDelayedAction({ commit: "Struggle", data: { escapeData: { restraint: { name: "Rope" } }, amount: 0.04 } });
    assert.equal(r.queued[1].data.amount, 0.04);
    r.density.state().value = 9900;
    r.c.KDAddDelayedAction({ commit: "Struggle", data: { escapeData: { restraint: item }, amount: 0.04 } });
    assert.equal(r.queued[2].data.amount, 0.0004);
});

test("saving a hit retains the same quiet grace origin as uninterrupted play", () => {
    const a = runtime(),
        b = runtime();
    a.density.contact(spider());
    b.c.KDGameData = JSON.parse(JSON.stringify(a.c.KDGameData));
    b.c.KDEventMapGeneric.afterLoadGame.SpiderlingsSilkDensity();
    a.density.advance(1);
    b.density.advance(1);
    assert.equal(a.density.state().bareTurns, b.density.state().bareTurns);
    a.density.advance(10);
    b.density.advance(10);
    assert.equal(a.density.state().value, b.density.state().value);
});

test("most idle prison spiders rest while existing patrols and initial construction stay awake", () => {
    const r = runtime();
    r.setPrison(true);
    r.c.KDMapData.Entities = Array.from({ length: 20 }, (_, i) => spider(i + 1, 30));
    r.c.KDMapData.SpiderlingsPrison.patrols = { 1: {}, 2: {} };
    r.c.KDMapData.SpiderlingsPrison.builderIds = [3, 4];
    r.activity.prepare(1);
    assert.equal(r.c.KDMapData.Entities.filter(r.activity.isResting).length, 16);
    r.setPrison(false);
    assert.equal(r.c.KDMapData.Entities.some(r.activity.isResting), false);
});

test("player hearing wakes only nearby reserves and quiet expiry restores rest", () => {
    const r = runtime();
    r.setPrison(true);
    const near = spider(1, 3),
        far = spider(2, 30);
    r.c.KDMapData.Entities = [near, far];
    r.c.KinkyDungeonPlayerEntity.sound = 4;
    r.activity.prepare(1);
    assert.equal(r.activity.isResting(near), false);
    assert.equal(r.activity.isResting(far), true);
    r.c.KinkyDungeonPlayerEntity.sound = 0;
    r.activity.prepare(10);
    assert.equal(r.activity.isResting(near), true);
});

test("positive damage wakes a sleeping spider for defense without changing its HP", () => {
    const r = runtime();
    r.setPrison(true);
    const actor = spider(1, 30);
    r.c.KDMapData.Entities = [actor];
    r.activity.prepare(1);
    r.c.KDEventMapGeneric.afterDamageEnemy.SpiderlingsPrisonActivity(null, { enemy: actor, dmgDealt: 1 });
    assert.equal(r.activity.isResting(actor), false);
    assert.equal(actor.hp, 2);
});

test("a real repair request wakes bounded field staff rather than leaving all owners asleep", () => {
    const r = runtime();
    r.setPrison(true);
    r.c.KDMapData.Entities = Array.from({ length: 8 }, (_, i) => spider(i + 1, 30));
    r.c.Spiderlings.SpinnerNativeField.state = () => ({
        topology: { composites: {} },
        command: { members: {} },
        ai: {
            groups: { field: { memberIds: [1, 2, 3, 4, 5, 6, 7, 8], planId: "plan" } },
            plans: { plan: { fieldId: "wall" } },
        },
    });
    r.c.Spiderlings.SpinnerTopology.fieldWorkNeeds = () => ({ repair: true });
    r.activity.prepare(1);
    assert.equal(r.c.KDMapData.Entities.filter(r.activity.isResting).length, 7);
});

test("regional intelligence explicitly assigns four reserves within the available project budget", () => {
    const r = runtime();
    r.setPrison(true);
    r.c.KDMapData.Entities = Array.from({ length: 12 }, (_, i) => ({ ...spider(i + 1, 30 + i), y: 38 }));
    r.c.KDMapData.SpiderlingsPrison.alerts = {
        version: 1,
        serial: 1,
        report: { x: 24, y: 10, region: "upper", serial: 1, age: 0, tick: 1 },
        regions: {},
        lastAgedTick: null,
    };
    r.c.Spiderlings.PrisonNest = { ordinaryConstructionAllowed: () => true };
    r.c.Spiderlings.FieldCommand.protectedMember = () => false;
    r.c.Spiderlings.SpinnerNativeField.state = () => ({
        topology: { composites: {} },
        command: { members: {} },
        ai: { groups: {}, plans: {}, projects: { maximum: 1 } },
    });
    vm.runInContext(fs.readFileSync(path.join(root, "SpiderlingsPrisonAlerts.js"), "utf8"), r.c);
    assert.equal(r.c.Spiderlings.PrisonAlerts.assignedWorkers().length, 4);
    r.c.KDMapData.Entities.push(...Array.from({ length: 4 }, (_, i) => ({ ...spider(i + 13, 45 + i), y: 22 })));
    for (let turn = 0; turn < 3; turn++) {
        const assigned = r.c.Spiderlings.PrisonAlerts.assignedWorkers();
        assert.equal(assigned.length, 4, "pending orders consume the one-project budget on every prepare");
        assert.equal(
            assigned.every((id) => id <= 12),
            true,
            "the second region cannot acquire another team",
        );
    }
    r.activity.prepare(1);
    assert.equal(r.c.KDMapData.Entities.filter(r.activity.isResting).length, 12);
    r.c.KDMapData.Entities = r.c.KDMapData.Entities.filter((actor) => actor.id <= 12);
    r.c.KinkyDungeonCurrentTick++;
    r.c.Spiderlings.PrisonAlerts.advance(12);
    assert.equal(
        r.c.Spiderlings.PrisonAlerts.assignedWorkers().length,
        0,
        "unstarted stale work does not wake forever",
    );
});

test("player-origin noise covers struggle, spells, delayed bullets and shouting without enemy turn leakage", () => {
    const r = runtime();
    r.setPrison(true);
    const near = spider(1, 3),
        far = spider(2, 30);
    r.c.KDMapData.Entities = [near, far];
    r.activity.prepare(1);
    r.c.KinkyDungeonStruggle("ItemArms", "Struggle", 0, false);
    assert.equal(r.activity.isResting(near), false);
    assert.equal(r.activity.isResting(far), true, "enemy noise during AdvanceTime is not player-origin");
    r.activity.prepare(10);
    r.c.KinkyDungeonCastSpell(0, 0, {}, { id: 5 }, r.c.KinkyDungeonPlayerEntity);
    assert.equal(r.activity.isResting(near), true, "a spell targeting the player is not a player cast");
    r.c.KinkyDungeonCastSpell(0, 0, {}, null, r.c.KinkyDungeonPlayerEntity);
    assert.equal(r.activity.isResting(near), false);
    r.activity.prepare(10);
    r.c.KinkyDungeonBulletHit({ x: 0, y: 0, bullet: { source: 5 } });
    assert.equal(r.activity.isResting(near), true);
    r.c.KinkyDungeonBulletHit({ x: 0, y: 0, bullet: { source: -1 } });
    assert.equal(r.activity.isResting(near), false);
    r.activity.prepare(10);
    r.c.KDInputTypes.noise();
    assert.equal(r.activity.isResting(near), false);
    r.activity.prepare(10);
    r.c.KDProcessInput("door", {});
    assert.equal(r.activity.isResting(near), false, "ordinary player inputs can emit unattached noise");
    assert.equal(r.activity.isResting(far), true);
});
