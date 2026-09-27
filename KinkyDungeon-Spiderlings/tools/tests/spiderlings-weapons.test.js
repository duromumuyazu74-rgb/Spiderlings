"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsWeapons.js"), "utf8");
const TOME = "SpiderlingsSilkenBindingTome",
    STAFF = "SpiderlingsSilkweaverStaff";
const CONVERGENCE = "SpiderlingsCocoonConvergence",
    SNARE = "SpiderlingsSilkenSnare";

function fixture() {
    const events = {},
        hits = [],
        inventory = new Set();
    let random = 0,
        mana = 20,
        wall = false,
        visible = true;
    const c = {
        Spiderlings: {
            registerNamed: (array, entry) => array.push(entry),
            MageSpells: {
                collapseDistance: (x, y, target) => {
                    const dx = Math.abs(x - target.x),
                        dy = Math.abs(y - target.y);
                    return dx > 2 || dy > 2 || (dx === 2 && dy === 2) ? -1 : Math.max(dx, dy);
                },
            },
        },
        KDGameData: {},
        KDMapData: { Entities: [], GroundItems: [] },
        KinkyDungeonWeapons: {},
        KDPrereqs: {},
        KinkyDungeonSpellSpecials: {},
        KinkyDungeonSpellListEnemies: [],
        KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
        KDEventMapGeneric: {},
        KDAddEvent: (_map, name, _key, handler) => {
            events[name] = handler;
        },
        KDHostile: (target) => target.hostile,
        KDAllied: (target) => target.allied,
        KinkyDungeonHasMana: (cost) => mana >= cost,
        KinkyDungeonGetManaCost: (spell) => spell.manacost,
        KinkyDungeonTransparentObjects: "0",
        KinkyDungeonMapGet: () => "0",
        KinkyDungeonCheckPath: () => !wall,
        KinkyDungeonVisionGet: () => Number(visible),
        KinkyDungeonUpdateSingleBulletVisual() {},
        KinkyDungeonCastSpell: (x, y, spell) => {
            c.KinkyDungeonSpellSpecials[spell.special]?.(spell, {}, x, y, x, y);
            mana -= spell.manacost;
            return { result: "Cast", data: { bulletfired: { bullet: { spell } } } };
        },
        KDBulletCanHitEntity: () => true,
        KDBulletAoECanHitEntity: () => true,
        KinkyDungeonDamageEnemy: (target, damage, _ranged, _nomsg, spell, _bullet, attacker) =>
            hits.push({ target, damage, spell, attacker }),
        KinkyDungeonGetImmunity: (tags, _profile, type, kind) => tags[type + kind],
        KinkyDungeonSendEvent() {},
        addTextKey() {},
        KDRandom: () => random,
        KinkyDungeonInventoryGetWeapon: (name) => inventory.has(name),
        KDDropItems: (enemy) => {
            if (!enemy.noDrop && (enemy.playerdmg || !enemy.summoned) && !enemy.droppedItems) enemy.droppedItems = true;
        },
    };
    vm.createContext(c);
    vm.runInContext(source, c);
    const enemy = (x = 7, y = 7, extra = {}) => ({
        x,
        y,
        hp: 100,
        hostile: true,
        Enemy: { name: "Maidforce", tags: {} },
        ...extra,
    });
    const cast = (name = CONVERGENCE, x = 7, y = 7) =>
        c.KinkyDungeonCastSpell(
            x,
            y,
            c.KinkyDungeonSpellListEnemies.find((s) => s.name === name),
            undefined,
            c.KinkyDungeonPlayerEntity,
        );
    return {
        c,
        events,
        hits,
        inventory,
        enemy,
        cast,
        tick: () => events.tickAfter(null, { delta: 1 }),
        mana: () => mana,
        setMana: (value) => (mana = value),
        random: (value) => (random = value),
        wall: (value) => (wall = value),
        visible: (value) => (visible = value),
    };
}

test("Convergence pays 4 mana once, waits two subsequent actions and survives a state round trip", () => {
    const r = fixture();
    r.c.KDMapData.Entities.push(r.enemy());
    assert.equal(r.cast().result, "Cast");
    assert.equal(r.mana(), 16);
    r.tick(); // casting action
    r.c.KDGameData = JSON.parse(JSON.stringify(r.c.KDGameData));
    r.c.KDMapData = JSON.parse(JSON.stringify(r.c.KDMapData));
    r.c.KinkyDungeonPlayerEntity.x = 12;
    r.c.KinkyDungeonPlayerWeapon = STAFF;
    r.tick();
    assert.equal(r.hits.length, 0);
    r.tick();
    assert.equal(r.hits.length, 1);
    assert.equal(r.hits[0].damage.bind, 24);
    assert.equal(r.hits[0].attacker, r.c.KinkyDungeonPlayerEntity);
    r.tick();
    assert.equal(r.hits.length, 1);
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 4);
});

test("Convergence resolves precisely 21 tiles, with 12/8/1 ring strengths, excluding allies and player", () => {
    const r = fixture();
    for (let y = 4; y <= 10; y++) for (let x = 4; x <= 10; x++) r.c.KDMapData.Entities.push(r.enemy(x, y));
    r.c.KDMapData.Entities.push(
        r.enemy(7, 7, { allied: true }),
        r.enemy(7, 7, { hostile: false }),
        r.c.KinkyDungeonPlayerEntity,
    );
    r.cast();
    r.tick();
    r.tick();
    r.tick();
    assert.equal(r.hits.length, 21);
    for (const [damage, bind, count] of [
        [2, 8, 12],
        [4, 16, 8],
        [6, 24, 1],
    ])
        assert.equal(r.hits.filter((h) => h.damage.damage === damage && h.damage.bind === bind).length, count);
});

test("Invalid casts cost nothing; walls block propagation and map changes clear pending casts only", () => {
    const r = fixture();
    assert.equal(r.cast(CONVERGENCE, 12, 5).result, "Fail");
    r.visible(false);
    assert.equal(r.cast().result, "Fail");
    r.visible(true);
    r.wall(true);
    assert.equal(r.cast().result, "Fail");
    r.wall(false);
    r.setMana(3);
    assert.equal(r.cast().result, "Fail");
    r.setMana(20);
    r.c.KDMapData.Entities.push(r.enemy());
    r.cast();
    assert.equal(r.cast().result, "Fail");
    assert.equal(r.mana(), 16);
    r.wall(true);
    r.tick();
    r.tick();
    r.tick();
    assert.equal(r.hits.length, 0);
    r.events.postMapgen();
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 5);
    assert.equal(r.c.Spiderlings.Weapons.visualState().collapses.length, 0);
    for (let i = 0; i < 5; i++) r.tick();
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 0);
});

test("Snare pays 2 mana, reuses Mage art and excludes nonhostile collision targets", () => {
    const r = fixture();
    const result = r.cast(SNARE);
    assert.equal(r.mana(), 18);
    assert.equal(result.data.bulletfired.bullet.name, "SpiderlingsMageBolt");
    assert.equal(r.cast(SNARE).result, "Fail");
    for (const predicate of [r.c.KDBulletCanHitEntity, r.c.KDBulletAoECanHitEntity]) {
        assert.equal(predicate(result.data.bulletfired, r.enemy()), true);
        for (const target of [
            r.enemy(7, 7, { allied: true }),
            r.enemy(7, 7, { hostile: false }),
            r.c.KinkyDungeonPlayerEntity,
        ])
            assert.equal(predicate(result.data.bulletfired, target), false);
    }
    r.tick();
    r.tick();
    r.tick();
    assert.equal(r.cast(SNARE).result, "Cast");
});

test("Snare applies post-damage slow with native shield and resistance rules", () => {
    const r = fixture();
    for (const [tags, extra, expected] of [
        [{}, {}, 2],
        [{ slowresist: true }, {}, 1],
        [{ glueresist: true }, {}, 1],
        [{ glueimmune: true }, {}, 0],
        [{ unslowable: true }, {}, 0],
        [{}, { shield: 5 }, 0],
    ]) {
        const target = r.enemy(7, 7, { Enemy: { tags }, ...extra });
        r.events.afterDamageEnemy(null, { spell: { name: SNARE }, type: "glue", enemy: target });
        assert.equal(target.slow || 0, expected);
    }
    const target = r.enemy();
    r.events.afterDamageEnemy(null, { spell: { name: SNARE }, type: "glue", enemy: target, blocked: true });
    assert.equal(target.slow, undefined);
});

test("Mage loot has a strict 15% gate and uses the native once-only eligibility", () => {
    for (const roll of [0, 0.149999, 0.15, 0.999]) {
        const r = fixture();
        r.random(roll);
        const mage = r.enemy(7, 7, { Enemy: { name: "MageSpiderlings" } });
        r.c.KDDropItems(mage, r.c.KDMapData);
        r.c.KDDropItems(mage, r.c.KDMapData);
        assert.equal(r.c.KDMapData.GroundItems.length, roll < 0.15 ? 1 : 0);
    }
    for (const props of [{ noDrop: true }, { summoned: true }, { Enemy: { name: "Maidforce" } }]) {
        const r = fixture();
        r.c.KDDropItems(r.enemy(7, 7, { Enemy: { name: "MageSpiderlings" }, ...props }), r.c.KDMapData);
        assert.equal(r.c.KDMapData.GroundItems.length, 0);
    }
});

test("Mage loot selects the missing weapon, and stops when both are owned", () => {
    for (const owned of [[], [TOME], [STAFF], [TOME, STAFF]]) {
        const r = fixture();
        owned.forEach((name) => r.inventory.add(name));
        r.c.KDDropItems(r.enemy(7, 7, { Enemy: { name: "MageSpiderlings" } }), r.c.KDMapData);
        const drop = r.c.KDMapData.GroundItems[0];
        if (owned.length === 2) assert.equal(drop, undefined);
        else assert.equal(drop.name, owned.includes(TOME) ? STAFF : TOME);
    }
});
