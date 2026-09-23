"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const mageFile = path.join(__dirname, "../..", "SpiderlingsMage.js");
const ITEM = "SpiderlingsMageArmSigil";

function fixture() {
    const restraints = [];
    const equipment = [];
    const calls = { playerDamage: [], npcDamage: [], added: 0, nativeHits: 0 };
    let blockers = [];
    let compatible = true;
    const source = { id: 10, hp: 3, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    const player = { player: true };
    const c = {
        Spiderlings: { restraintCatalog: { register: (definition) => restraints.push(definition) } },
        KDMapData: { Entities: [source] },
        KDPlayerEffects: {},
        KinkyDungeonPlayerEntity: player,
        KDGetFaction: (entity) => entity.faction,
        KDHostile: (a, b) => a.faction !== b.faction && !b.allied,
        KDBulletCanHitEntity: (bullet, target) =>
            bullet.bullet.spell.friendlyfire === true || target.faction !== "Maidforce",
        KDBulletAoECanHitEntity: (bullet, target) =>
            bullet.bullet.spell.friendlyfire === true || target.faction !== "Maidforce",
        KinkyDungeonDamageEnemy: (target, damage) => {
            calls.npcDamage.push({ target, damage });
            const dealt = target.immune
                ? 0
                : Math.max(0, damage.damage * (target.resistance ?? 1) - (target.shield ?? 0));
            target.hp -= dealt;
            return dealt;
        },
        KDBulletHitEnemy: (bullet, target) => {
            calls.nativeHits++;
            if (bullet.bullet.playerEffect || bullet.bullet.spell.playerEffect) target.equipment = true;
            return c.KinkyDungeonDamageEnemy(target, bullet.bullet.damage);
        },
        KinkyDungeonDealDamage: (damage) => {
            calls.playerDamage.push(damage);
            return damage.damage;
        },
        KinkyDungeonGetRestraintByName: (name) => restraints[0].restraint.name === name && restraints[0].restraint,
        KinkyDungeonAllRestraintDynamic: () => equipment.map((item) => ({ item })),
        KDGetBlockersToAddRestraint: () => blockers,
        KDCanAddRestraint: () => compatible,
        KinkyDungeonGetRestraintItem: () => equipment[0],
        KinkyDungeonAddRestraint: (restraint) => {
            calls.added++;
            equipment.push({ name: restraint.name });
            return 1;
        },
    };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(mageFile, "utf8"), c);
    const bullet = () => ({
        bullet: {
            source: source.id,
            spell: { name: "SpiderlingsMageBolt" },
            damage: { damage: 0.5, type: "glue" },
            playerEffect: { name: "SpiderlingsMageArmHit" },
        },
    });
    return {
        c,
        source,
        player,
        restraints,
        equipment,
        calls,
        bullet,
        block: (items) => (blockers = items),
        allow: (value) => (compatible = value),
    };
}

test("Mage projectile reaches hostile Maidforce and uses native HP resistance and shields", () => {
    const r = fixture();
    const maid = { id: 11, faction: "Maidforce", Enemy: { name: "Maidforce" }, hp: 8, shield: 0 };
    const shot = r.bullet();
    assert.equal(r.c.KDBulletCanHitEntity(shot, maid), true);
    assert.equal(r.c.KDBulletAoECanHitEntity(shot, maid), true);
    assert.equal(shot.bullet.spell.friendlyfire, undefined, "temporary collision override is restored");
    r.c.KDBulletHitEnemy(shot, maid);
    assert.equal(maid.hp, 4);
    r.c.KDBulletHitEnemy(shot, maid);
    assert.equal(maid.hp, 0);
    assert.equal(maid.equipment, undefined);
    assert.equal(shot.bullet.damage.damage, 0.5, "temporary damage override is restored");
    const resistant = { ...maid, hp: 8, resistance: 0.5, shield: 1 };
    r.c.KDBulletHitEnemy(r.bullet(), resistant);
    assert.equal(resistant.hp, 7);
    const immune = { ...maid, hp: 8, immune: true };
    r.c.KDBulletHitEnemy(r.bullet(), immune);
    assert.equal(immune.hp, 8);
});

test("Mage bonus does not affect allies or unrelated NPC targets", () => {
    const r = fixture();
    const ally = { id: 12, faction: "Maidforce", allied: true, Enemy: { name: "Maidforce" }, hp: 8 };
    const other = { id: 13, faction: "Bandit", Enemy: { name: "Bandit" }, hp: 8 };
    assert.equal(r.c.KDBulletCanHitEntity(r.bullet(), ally), false);
    r.c.KDBulletHitEnemy(r.bullet(), ally);
    r.c.KDBulletHitEnemy(r.bullet(), other);
    assert.equal(ally.hp, 7.5);
    assert.equal(other.hp, 7.5);
    assert.equal(ally.equipment, undefined);
    assert.equal(other.equipment, undefined);
    assert.equal(
        r.calls.npcDamage.every(({ damage }) => damage.damage === 0.5),
        true,
    );
});

test("player hit equips one owned arm item and leaves incompatible equipment alone", () => {
    const r = fixture();
    const effect = r.c.KDPlayerEffects.SpiderlingsMageArmHit;
    assert.equal(typeof r.c.Spiderlings.Mage.equipArms, "function");
    assert.equal(r.restraints[0].restraint.Group, "ItemArms");
    assert.equal(r.restraints[0].restraint.weight, 0);
    assert.deepEqual(Object.keys(r.restraints[0].restraint.enemyTags), []);
    assert.equal(effect(r.player, "glue", {}, {}, "Enemy", r.bullet(), r.source).effect, true);
    assert.equal(r.equipment.length, 1);
    assert.equal(r.equipment[0].name, ITEM);
    effect(r.player, "glue", {}, {}, "Enemy", r.bullet(), r.source);
    assert.equal(r.calls.added, 1, "repeat hits cannot add another copy");
    assert.equal(r.calls.playerDamage.length, 2);
    const occupied = fixture();
    const existing = { name: "ExternalArmbinder", data: { sentinel: true } };
    occupied.equipment.push(existing);
    occupied.allow(false);
    occupied.c.KDPlayerEffects.SpiderlingsMageArmHit(
        occupied.player,
        "glue",
        {},
        {},
        "Enemy",
        occupied.bullet(),
        occupied.source,
    );
    assert.equal(occupied.equipment[0], existing);
    assert.equal(occupied.calls.added, 0);
    occupied.allow(true);
    occupied.block([existing]);
    occupied.c.KDPlayerEffects.SpiderlingsMageArmHit(
        occupied.player,
        "glue",
        {},
        {},
        "Enemy",
        occupied.bullet(),
        occupied.source,
    );
    assert.equal(occupied.calls.added, 0);
});
