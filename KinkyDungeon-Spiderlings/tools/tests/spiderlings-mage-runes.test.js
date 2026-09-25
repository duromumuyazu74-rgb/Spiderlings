"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "SpiderlingsMageRunes.js"), "utf8");

function fixture() {
    const events = {};
    const calls = { casts: [], binds: [], npcHits: [], visuals: [] };
    const mage = { id: 10, x: 5, y: 5, hp: 3, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    const player = { player: true, x: 9, y: 5 };
    const map = { Entities: [mage], Bullets: [] };
    let random = 0;
    const c = {
        Spiderlings: { Webbing: { applyEnemyProgression: (...args) => calls.binds.push(args) } },
        KDMapData: map,
        KinkyDungeonPlayerEntity: player,
        KinkyDungeonMovableTilesEnemy: ["0"],
        KinkyDungeonMapGet: (x, y) => (x >= 3 && x <= 8 && y >= 3 && y <= 8 ? "0" : "1"),
        KinkyDungeonCheckLOS: () => true,
        KDRandom: () => random,
        KDPlayerEffects: {},
        KinkyDungeonUpdateSingleBulletVisual: (bullet, end) => calls.visuals.push({ name: bullet.bullet.name, end }),
        KDEventMapGeneric: {},
        KDAddEvent: (_map, name, _id, callback) => (events[name] = callback),
        KDGetFaction: (entity) => entity.faction,
        KDHostile: (a, b) => a.faction !== b.faction && !b.allied,
        KDBulletCanHitEntity: (bullet, target) =>
            bullet.x === target.x &&
            bullet.y === target.y &&
            (target.player || bullet.bullet.spell.friendlyfire || target.faction !== "Maidforce"),
        KDCheckCollideableBullets: (target, force) => {
            for (const bullet of [...map.Bullets]) {
                if (bullet.x !== target.x || bullet.y !== target.y || !bullet.bullet.damage) continue;
                if (force || c.KDBulletCanHitEntity(bullet, target)) map.Bullets.splice(map.Bullets.indexOf(bullet), 1);
            }
        },
        KDBulletHitEnemy: (bullet, target) => {
            calls.npcHits.push({ bullet, target, playerEffect: bullet.bullet.spell.playerEffect });
            const amount = bullet.bullet.damage.bind;
            if (!target.shield && !target.immune)
                target.slime = (target.slime || 0) + amount * (target.resistance ?? 1);
            return amount;
        },
        KinkyDungeonCastSpell: (x, y, spell, owner) => {
            calls.casts.push({ x, y, spell, owner });
            map.Bullets.push({
                x,
                y,
                time: spell.delay,
                bullet: {
                    source: owner.id,
                    faction: owner.faction,
                    spell,
                    damage: { damage: spell.power, bind: spell.bind, bindType: spell.bindType, type: spell.damage },
                },
            });
            return { result: "Cast" };
        },
    };
    vm.createContext(c);
    vm.runInContext(source, c);
    const spell = {
        name: "SpiderlingsMageRune",
        tags: ["rune", "trap"],
        delay: 300,
        power: 0,
        bind: 6,
        bindType: "Slime",
        damage: "glue",
    };
    const choose = () => {
        const data = { enemy: mage, spellOptions: ["SpiderlingsMageBolt", spell.name], spellPriority: [] };
        events.enumerateSpellOpts(null, data);
        return data.spellOptions[0];
    };
    const cast = () => c.KinkyDungeonCastSpell(player.x, player.y, spell, mage);
    const tick = () => events.tickAfter(null, { delta: 1 });
    return { c, mage, player, map, calls, spell, choose, cast, tick, random: (value) => (random = value) };
}

test("rune replaces one native Mage cast, chooses an empty nearby tile and stops at three active runes", () => {
    const r = fixture();
    r.random(0.2);
    assert.equal(r.choose(), r.spell.name);
    assert.equal(r.cast().result, "Cast");
    assert.equal(r.calls.casts.length, 1);
    assert.notDeepEqual([r.calls.casts[0].x, r.calls.casts[0].y], [r.player.x, r.player.y]);
    assert.ok(Math.max(Math.abs(r.calls.casts[0].x - r.mage.x), Math.abs(r.calls.casts[0].y - r.mage.y)) <= 3);
    assert.equal(r.map.Bullets[0].time, 300);
    assert.equal(r.map.Bullets[0].bullet.source, r.mage.id);
    assert.equal(r.map.Bullets[0].bullet.spell.tags.includes("rune"), true);
    r.random(0.25);
    assert.equal(r.choose(), "SpiderlingsMageBolt", "one quarter is an exclusive probability bound");
    r.random(0);
    r.cast();
    r.cast();
    assert.equal(r.map.Bullets.length, 3);
    assert.equal(r.choose(), "SpiderlingsMageBolt");
    assert.equal(r.cast().result, "Fail");
    assert.equal(r.calls.casts.length, 3);
    r.map.Bullets[0].time = 0;
    assert.equal(r.choose(), r.spell.name, "expired runes free capacity");
});

test("rune icon places for one turn, then the triggered rune warns 3x3 and binds after one turn", () => {
    const r = fixture();
    r.cast();
    const bullet = r.map.Bullets[0];
    assert.equal(bullet.bullet.name, "SpiderlingsMageRuneIcon");
    assert.equal(bullet.bullet.bulletLight, 4);
    r.tick();
    assert.equal(bullet.bullet.name, "SpiderlingsMageRuneIcon");
    r.tick();
    assert.equal(bullet.bullet.name, "SpiderlingsMageRune");
    const maid = { x: bullet.x, y: bullet.y, hp: 8, faction: "Maidforce", Enemy: { name: "Maid" } };
    const ally = { ...maid, allied: true };
    const spider = { ...maid, faction: "Enemy", Enemy: { name: "Spinner" } };
    assert.equal(r.c.KDBulletCanHitEntity(bullet, ally), false);
    assert.equal(r.c.KDBulletCanHitEntity(bullet, spider), false);
    assert.equal(r.c.KDBulletCanHitEntity(bullet, { ...maid, x: bullet.x + 1 }), false);
    r.map.Entities.push(ally, spider);
    r.tick();
    assert.equal(bullet.SpiderlingsRunePhase, "armed");
    r.map.Entities.push(maid);
    r.tick();
    assert.equal(bullet.SpiderlingsRunePhase, "triggered");
    assert.equal(bullet.bullet.aoe, 1);
    assert.equal(bullet.bullet.aoetype, "box");
    assert.equal(bullet.bullet.bulletLight, 6);
    assert.equal(maid.slime, undefined);
    maid.x += 1;
    r.tick();
    assert.equal(maid.slime, 6);
    assert.equal(r.calls.npcHits.length, 1);
    assert.equal(r.calls.npcHits[0].playerEffect, undefined);
    assert.equal(r.map.Bullets.length, 0);
    const protectedMaid = { ...maid, slime: 0, shield: 1 };
    r.cast();
    protectedMaid.x = r.map.Bullets[0].x;
    protectedMaid.y = r.map.Bullets[0].y;
    r.map.Entities.push(protectedMaid);
    r.tick();
    r.tick();
    r.tick();
    r.tick();
    assert.equal(protectedMaid.slime, 0, "native shield still controls binding");
});

test("saved delayed rune survives caster death, player receives normal Webbing, and dispel frees capacity", () => {
    const r = fixture();
    r.cast();
    r.tick();
    r.tick();
    const saved = JSON.parse(JSON.stringify(r.map.Bullets));
    r.map.Entities.length = 0;
    r.map.Bullets = saved;
    const maid = { x: saved[0].x, y: saved[0].y, hp: 8, faction: "Maidforce", Enemy: { name: "Maid" } };
    r.map.Entities.push(maid);
    r.tick();
    r.tick();
    assert.equal(maid.slime, 6, "the saved rune outlives its caster");
    r.map.Entities.push(r.mage);
    r.cast();
    const bullet = r.map.Bullets[0];
    r.player.x = bullet.x;
    r.player.y = bullet.y;
    r.tick();
    r.tick();
    r.tick();
    r.player.x += 1;
    r.tick();
    assert.equal(r.calls.binds.length, 1);
    assert.equal(r.calls.binds[0][0], "WebCaster");
    assert.equal(r.map.Bullets.length, 0);
    r.cast();
    const dispelled = r.map.Bullets[0];
    if (dispelled.bullet.spell.tags.includes("rune")) dispelled.time = 0;
    assert.equal(r.choose(), r.spell.name, "dispelled runes no longer consume an active slot");
});

test("forced movement onto the center leaves the rune for its delayed trigger", () => {
    const r = fixture();
    r.cast();
    r.tick();
    r.tick();
    const bullet = r.map.Bullets[0];
    r.player.x = bullet.x;
    r.player.y = bullet.y;
    r.c.KDCheckCollideableBullets(r.player, true);
    assert.equal(r.map.Bullets.includes(bullet), true);
    r.tick();
    assert.equal(bullet.SpiderlingsRunePhase, "triggered");
});
