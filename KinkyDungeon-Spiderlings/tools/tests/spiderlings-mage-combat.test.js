"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const mageFile = path.join(__dirname, "../..", "SpiderlingsMage.js");

function fixture() {
    const calls = { npcDamage: [], nativeHits: 0, playerDamage: [], binds: [], visuals: [] };
    const playerResult = { effect: true };
    const source = { id: 10, hp: 3, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    const player = { id: 1, player: true, faction: "Player" };
    const c = {
        Spiderlings: {
            Webbing: {
                applyEnemyProgression: (...args) => {
                    calls.binds.push(args);
                    return { progressed: true };
                },
            },
            SpellVisuals: { hit: (target) => calls.visuals.push(target) },
        },
        KDMapData: { Entities: [source] },
        KDPlayerEffects: {
            Damage: (...args) => {
                calls.playerDamage.push(args);
                return playerResult;
            },
        },
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
    };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(mageFile, "utf8"), c);
    const bullet = () => ({
        bullet: {
            source: source.id,
            faction: "Enemy",
            spell: { name: "SpiderlingsMageBolt", power: 0.5, damage: "glue" },
            damage: { damage: 0.5, type: "glue" },
            playerEffect: { name: "Damage", power: 0.5 },
        },
    });
    return {
        c,
        source,
        calls,
        bullet,
        playerResult,
        player,
        hitPlayer(shot = bullet(), target = player, entity = source) {
            return c.KDPlayerEffects.Damage(
                target,
                "glue",
                shot.bullet.playerEffect,
                shot.bullet.spell,
                shot.bullet.faction,
                shot,
                entity,
            );
        },
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

test("Hunting Grounds Mage bolts try to subdue allied neutral NPCs", () => {
    const r = fixture();
    r.c.Spiderlings = { HuntingGrounds: { isPrey: (_source, target) => target.Enemy?.name === "Neutral" } };
    r.c.KDHostile = () => true;
    const neutral = { id: 14, faction: "Enemy", allied: true, Enemy: { name: "Neutral" }, hp: 8 };
    r.c.KDBulletHitEnemy(r.bullet(), neutral);
    assert.equal(neutral.hp, 4);
});

test("Mage bolt keeps native Damage and advances one Mage Webbing hit after native success", () => {
    const r = fixture();
    const shot = r.bullet();
    assert.equal(r.hitPlayer(shot), r.playerResult);
    assert.equal(r.calls.playerDamage.length, 1);
    assert.equal(r.calls.playerDamage[0][2].power, 0.5);
    assert.equal(r.calls.playerDamage[0][5], shot, "native damage receives the real bullet for hit bookkeeping");
    assert.deepEqual(r.calls.binds, [["MageSpiderlings", r.source, "Enemy"]]);
    assert.deepEqual(r.calls.visuals, [r.player]);
    assert.equal(shot.bullet.playerEffect.name, "Damage");
    assert.equal(r.c.KDPlayerEffects.SpiderlingsMageArmHit, undefined);
});

test("native rejection and unrelated damage effects never advance Mage Webbing", () => {
    const r = fixture();
    r.playerResult.effect = false;
    r.playerResult.sfx = "Shield";
    assert.equal(r.hitPlayer(), r.playerResult);
    assert.equal(r.calls.binds.length, 0);
    r.playerResult.effect = true;
    const other = r.bullet();
    other.bullet.spell.name = "OtherSpell";
    r.hitPlayer(other);
    r.hitPlayer(r.bullet(), { Enemy: { name: "Maidforce" } });
    assert.equal(r.calls.binds.length, 0);
    assert.equal(r.calls.visuals.length, 0);
    assert.equal(r.calls.playerDamage.length, 3);
});

test("departed Mage bolts retain their Mage profile without borrowing a WebCaster source", () => {
    const r = fixture();
    const shot = r.bullet();
    r.c.KDMapData.Entities = [];
    r.hitPlayer(shot, r.player, null);
    assert.deepEqual(r.calls.binds, [["MageSpiderlings", undefined, "Enemy"]]);
    r.calls.binds.length = 0;
    r.hitPlayer(shot, r.player, { Enemy: { name: "WebCaster" } });
    assert.deepEqual(r.calls.binds, [["MageSpiderlings", undefined, "Enemy"]]);
});
