"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const { gamePath } = require("../reference-inputs.js");

function fixture(overrides = {}) {
    const c = { Spiderlings: {}, KDEventMapGeneric: {}, KDMapData: { Entities: [] } };
    const events = (name, data) => Object.values(c.KDEventMapGeneric[name] || {}).forEach((f) => f({}, data));
    c.KDAddEvent = (map, trigger, id, fn) => ((map[trigger] ||= {})[id] = fn);
    c.KDHostile = (a, b) => a.faction !== b.faction;
    c.KDFactionFavorable = () => true;
    c.KDFactionHostile = () => false;
    c.KDEntityHasFlag = () => false;
    c.KDHelpless = (e) => e.boundLevel > 8;
    c.KDEnemyCanTalk = (e) => !(e.silence > 0);
    c.KDEnemyCanSignal = (e) => !e.Enemy.tags?.nosignal;
    c.KinkyDungeonMakeNoiseSignal = (e) => [e];
    c.KDUniqueBulletHits = new Map();
    c.KDBulletID = (b, target) => b.bullet.name + target.id;
    c.AOECondition = (x, y, tx, ty, radius) => Math.hypot(tx - x, ty - y) <= radius;
    c.KDBulletAoEMod = () => undefined;
    c.KinkyDungeonDamageEnemy = (target, damage, ranged, noMsg, spell, bullet, attacker) => {
        const d = {
            enemy: target,
            incomingDamage: damage,
            dmg: damage.damage,
            attacker,
            dmgDealt:
                damage.damage +
                (target.weak && damage.type === "glue" ? 1 : 0) +
                (target.tickleWeak && damage.type === "tickle" ? 0.5 : 0),
        };
        events("beforeDamageEnemy", d);
        events("duringDamageEnemy", d);
        if (target.shield) {
            const absorbed = Math.min(target.shield, d.dmgDealt);
            target.shield -= absorbed;
            d.dmgShieldDealt = absorbed;
            d.dmgDealt -= absorbed;
        }
        target.hp -= d.dmgDealt;
        if (!target.immune && !target.shield && damage.bind) {
            target.boundLevel += damage.bind;
            (target.specialBoundLevel ||= {})[damage.bindType] =
                (target.specialBoundLevel[damage.bindType] || 0) + damage.bind;
        }
        events("afterDamageEnemy", d);
        return d.dmgDealt + (d.dmgShieldDealt || 0);
    };
    c.KinkyDungeonEnemyLoop = (source, target) => {
        events("beforeNPCDamageNPC", { enemy: source });
        const result = c.KinkyDungeonDamageEnemy(
            target,
            { damage: 2, type: "tickle" },
            false,
            true,
            undefined,
            undefined,
            source,
        );
        source.failed = !(result > 0);
        return result;
    };
    c.KDBulletHitEnemy = (b, target) => {
        b.alreadyHit ||= [];
        if (b.alreadyHit.includes(target.id)) return;
        b.alreadyHit.push(target.id);
        if (b.bullet.spell.playerEffect || b.bullet.playerEffect) target.equipment++;
        if (target.throw) throw Error("native hit failed");
        if (b.bullet.damage.type !== "inert") c.KinkyDungeonDamageEnemy(target, b.bullet.damage);
    };
    Object.assign(c, overrides);
    vm.createContext(c);
    // Exercise KD's actual predicates, including the geometry and unique-hit
    // gates that the scoped entity-hostility adapter must retain.
    const fight = fs.readFileSync(gamePath("Game/src/fight/KinkyDungeonFight.ts"), "utf8");
    for (const name of ["KDBulletCanHitEntity", "KDBulletAoECanHitEntity"]) {
        const start = fight.indexOf(`function ${name}(`);
        const end = fight.indexOf("\nfunction ", start + 1);
        const body = fight
            .slice(start, end)
            .replace(/function [^{]+\{/, `function ${name}(bullet, enemy, inWarningOnly, overrideCollide) {`);
        vm.runInContext(body, c);
    }
    for (const file of ["SpiderlingsCombat.js", "SpiderlingsJumperDash.js"])
        vm.runInContext(fs.readFileSync(path.join(__dirname, "../..", file), "utf8"), c);
    const spawn = (id, name, faction) => {
        const e = { id, Enemy: { name }, faction, hp: 8, boundLevel: 0, equipment: 0, x: 0, y: 0 };
        c.KDMapData.Entities.push(e);
        return e;
    };
    return { c, events, spawn };
}

test("native alarm recipients refresh entity goals on KD 5.5.3 while silk-gagged callers remain silent", () => {
    const { stripTypeScriptTypes } = require("node:module");
    const source = fs.readFileSync(gamePath("Game/src/magic/KinkyDungeonMagic.ts"), "utf8");
    const start = source.indexOf("function KinkyDungeonMakeNoiseSignal(");
    // The pinned 5.5.0 function predates goal tracking. Reproduce the exact
    // 5.5.3 addition (Magic.ts:703) that mistakenly updates the sender.
    const native = stripTypeScriptTypes(source.slice(start, source.indexOf("\nfunction ", start + 1))).replace(
        "e.gy = enemy.y;",
        "e.gy = enemy.y; KDUpdateMoveToEntity(enemy);",
    );
    const globals = {
        KDEnemyAction: { investigatesignal: { filter: () => true } },
        KinkyDungeonSendEvent() {},
        KDFactionAllied: () => true,
        KDGetFaction: () => "Maidforce",
        KDAmbushAI: () => false,
        KDCanHearSound: () => true,
        KinkyDungeonSetEnemyFlag() {},
        KDAddThought() {},
        KDistEuclidean: Math.hypot,
        KinkyDungeonMakeNoise() {},
    };
    const nativeContext = vm.createContext(globals);
    vm.runInContext(native, nativeContext);
    const updates = [];
    const update = (e) => {
        updates.push(e);
        e.gx_ent = e.gx;
        e.gy_ent = e.gy;
        e.g_ent_id = 1;
    };
    globals.KDUpdateMoveToEntity = update;
    const { c, spawn } = fixture({
        KDUpdateMoveToEntity: update,
        KinkyDungeonMakeNoiseSignal: globals.KinkyDungeonMakeNoiseSignal,
    });
    const sender = spawn(1, "Maidforce", "Maidforce"),
        receiver = spawn(2, "Maidforce", "Maidforce");
    sender.x = 10;
    sender.y = 10;
    receiver.x = 4;
    receiver.y = 4;
    sender.Enemy.tags = {};
    receiver.Enemy.tags = {};
    globals.KDNearbyEnemies = () => [sender, receiver];
    assert.deepEqual(Array.from(c.KinkyDungeonMakeNoiseSignal(sender)), [receiver]);
    assert.equal(receiver.gx_ent, 10);
    assert.equal(receiver.gy_ent, 10);
    assert.equal(receiver.g_ent_id, sender.id);
    assert.ok(updates.includes(receiver));
    updates.length = 0;
    sender.SpiderlingsNPCSilkGag = true;
    sender.boundLevel = 20;
    sender.specialBoundLevel = { Slime: 20 };
    assert.equal(c.KinkyDungeonMakeNoiseSignal(sender).length, 0);
    assert.equal(updates.length, 0);
});

test("signal goal compatibility preserves redirected listeners and old runtimes", () => {
    const receiver = { gx: 9, gy: 9 };
    const heard = [receiver];
    const calls = [];
    const r = fixture({ KinkyDungeonMakeNoiseSignal: () => heard, KDUpdateMoveToEntity: (e) => calls.push(e) });
    assert.equal(r.c.KinkyDungeonMakeNoiseSignal({ x: 1, y: 1 }), heard);
    assert.equal(calls.length, 0, "another handler's redirected goal is retained");
    const legacy = fixture({ KinkyDungeonMakeNoiseSignal: () => heard });
    assert.equal(legacy.c.KinkyDungeonMakeNoiseSignal({ x: 9, y: 9 }), heard);
    assert.equal(legacy.c.KDUpdateMoveToEntity, undefined);
});

test("armed Spinner melee keeps the source alive while converting native NPC binding", () => {
    const { c, spawn } = fixture();
    const source = spawn(1, "Spinner", "Enemy"),
        target = spawn(2, "Maidforce", "Maidforce");
    target.weak = true;
    assert.equal(c.KinkyDungeonEnemyLoop(source, target), 1.5);
    assert.equal(target.hp, 7.95);
    assert.equal(target.boundLevel, 1.5);
    assert.equal(source.hp, 8);
    assert.equal(source.failed, false);
    assert.equal(c.KinkyDungeonEnemyLoop(source, target), 1.5);
    assert.equal(source.hp, 8);
    assert.equal(target.boundLevel, 3);
    c.KinkyDungeonDamageEnemy(target, { damage: 2, type: "fire" }, false, true, undefined, undefined, source);
    assert.ok(Math.abs(target.hp - 5.9) < 1e-8, "unrelated damage retains native return semantics");
});

test("spider silk blocks helpless NPC speech and signals, and releases on recovery or silk removal", () => {
    const { c, spawn, events } = fixture();
    const source = spawn(1, "WebCaster", "Enemy"),
        target = spawn(2, "Maidforce", "Maidforce");
    const hit = () => c.Spiderlings.Combat.hitNPC(source, target, "direct");
    hit();
    assert.equal(c.KDEnemyCanTalk(target), true);
    hit();
    hit();
    assert.equal(c.KDEnemyCanTalk(target), false);
    assert.equal(c.KDEnemyCanSignal(target), false);
    assert.equal(c.KinkyDungeonMakeNoiseSignal(target).length, 0);
    const loaded = JSON.parse(JSON.stringify(target));
    events("afterLoadGame", {});
    assert.equal(c.KDEnemyCanTalk(loaded), false, "save retains the silk attribution");
    loaded.boundLevel = 8;
    assert.equal(c.KDEnemyCanTalk(loaded), true);
    loaded.boundLevel = 9;
    loaded.specialBoundLevel = { Leather: 9 };
    assert.equal(c.KDEnemyCanTalk(loaded), true, "other bindings do not retain a silk gag");
    loaded.specialBoundLevel = { Slime: 9 };
    assert.equal(c.KDEnemyCanTalk(loaded), true, "cleared attribution cannot silence new unrelated slime");
    target.boundLevel = 0;
    target.specialBoundLevel = {};
    events("tickAfter", { delta: 1 });
    target.boundLevel = 20;
    target.specialBoundLevel = { Slime: 20 };
    assert.equal(c.KDEnemyCanTalk(target), true);
});

test("unrelated slime, resisted silk and native silence keep their own speech rules", () => {
    for (const reason of ["unrelated", "immune", "shield"]) {
        const { c, spawn } = fixture();
        const source = spawn(1, "WebCaster", "Enemy"),
            target = spawn(2, "Maidforce", "Maidforce");
        target.boundLevel = 20;
        target.specialBoundLevel = { Slime: 20 };
        if (reason !== "unrelated") {
            target[reason] = reason === "shield" ? 5 : true;
            c.Spiderlings.Combat.hitNPC(source, target, "direct");
        }
        assert.equal(c.KDEnemyCanTalk(target), true, reason);
        assert.equal(c.KDEnemyCanSignal(target), true, reason);
        assert.equal(c.KinkyDungeonMakeNoiseSignal(target)[0], target, reason);
        target.silence = 5;
        assert.equal(c.KDEnemyCanTalk(target), false);
    }
});

test("native spray collision honors entity hostility without bypassing positions, noEnemyCollision or unique hits", () => {
    const { c, spawn } = fixture();
    const _source = spawn(1, "WebCaster", "Enemy"),
        target = spawn(2, "Maidforce", "Maidforce");
    const b = {
        x: 0,
        y: 0,
        bullet: {
            name: "WebSpray",
            source: 1,
            faction: "Enemy",
            damage: { type: "inert" },
            spell: { noUniqueHits: true, playerEffect: { provenance: "WebCaster.WebSpray", triggerSource: "direct" } },
        },
    };
    const original = b.bullet;
    assert.equal(c.KDBulletCanHitEntity(b, target), true);
    assert.equal(c.KDBulletAoECanHitEntity(b, target), true);
    assert.equal(b.bullet, original);
    assert.equal(original.spell.friendlyfire, undefined);
    target.x = 3;
    assert.equal(c.KDBulletCanHitEntity(b, target), false);
    assert.equal(c.KDBulletAoECanHitEntity(b, target), false);
    target.x = 0;
    b.bullet.noEnemyCollision = true;
    assert.ok(!c.KDBulletCanHitEntity(b, target));
    delete b.bullet.noEnemyCollision;
    c.KDUniqueBulletHits.set(c.KDBulletID(b, target), true);
    assert.equal(c.KDBulletCanHitEntity(b, target), false);
    assert.equal(c.KDBulletAoECanHitEntity(b, target), false);
    c.KDUniqueBulletHits.clear();
    target.faction = "Enemy";
    assert.equal(c.KDBulletCanHitEntity(b, target), false);
});

test("failed and unrelated NPC melee retain their native outcomes", () => {
    for (const reason of ["immune", "shield"]) {
        const { c, spawn } = fixture();
        const source = spawn(1, "Jumper", "Enemy"),
            target = spawn(2, "Maidforce", "Maidforce");
        target[reason] = reason === "shield" ? 5 : true;
        assert.equal(c.KinkyDungeonEnemyLoop(source, target), 0.05);
        assert.equal(source.hp, 8);
        assert.equal(source.failed, false);
        assert.equal(target.hp, reason === "shield" ? 8 : 7.95);
    }
    const { c, spawn } = fixture();
    const source = spawn(1, "Maidforce", "Maidforce"),
        target = spawn(2, "Spinner", "Enemy");
    assert.equal(c.KinkyDungeonEnemyLoop(source, target), 2);
    assert.equal(target.hp, 6);
});

test("spray preserves the real bullet bookkeeping and shared player effects without creating NPC equipment", () => {
    const { c, spawn, events } = fixture();
    const source = spawn(1, "WebCaster", "Enemy"),
        target = spawn(2, "Maidforce", "Maidforce");
    const spell = { name: "WebSpray", playerEffect: { provenance: "WebCaster.WebSpray", triggerSource: "direct" } };
    const make = (kind) => ({
        bullet: {
            source: source.id,
            spell,
            damage: { type: "inert", damage: 3 },
            playerEffect: { ...spell.playerEffect, triggerSource: kind },
        },
    });
    const direct = make("direct"),
        original = direct.bullet;
    const attackers = [];
    c.KDAddEvent(c.KDEventMapGeneric, "afterDamageEnemy", "ObserveContact", (_e, d) => {
        if (d.incomingDamage.type === "tickle") attackers.push(d.attacker);
    });
    c.KDBulletHitEnemy(direct, target);
    c.KDBulletHitEnemy(direct, target);
    assert.deepEqual(attackers, [source], "the secondary component retains the actual caster");
    assert.equal(target.boundLevel, 3);
    assert.equal(target.equipment, 0);
    assert.equal(target.hp, 7.95);
    assert.equal(direct.bullet, original);
    assert.equal(direct.bullet.spell, spell);
    c.KDBulletHitEnemy(make("trail"), target);
    c.KDBulletHitEnemy(make("trail"), target);
    assert.equal(target.boundLevel, 3.5);
    events("tickAfter", { delta: 0 });
    c.KDBulletHitEnemy(make("trail"), target);
    assert.equal(target.boundLevel, 3.5, "a zero-time update must not reopen the trail allowance");
    events("tickAfter", { delta: 1 });
    c.KDBulletHitEnemy(make("trail"), target);
    assert.equal(target.boundLevel, 4);
    events("afterLoadGame", {});
    c.KDBulletHitEnemy(make("trail"), target);
    assert.equal(target.boundLevel, 4.5);
    const bad = make("direct"),
        saved = bad.bullet;
    target.throw = true;
    assert.throws(() => c.KDBulletHitEnemy(bad, target), /native hit failed/);
    assert.equal(bad.bullet, saved);
});

test("NPC Dash locks identity and tile, binds once, and cancels invalid targets", () => {
    for (const change of ["none", "move", "dead", "friendly", "replacement"]) {
        const { c, spawn } = fixture();
        const source = spawn(1, "Jumper", "Enemy"),
            target = spawn(2, "Maidforce", "Maidforce");
        target.x = 4;
        let playerDamage = 0;
        const controller = c.Spiderlings.JumperDash.createController({
            findSource: (id) => c.KDMapData.Entities.find((e) => e.id === id),
            isSuppressed: (_source, recipient) => !recipient?.Enemy,
            validNPC: c.Spiderlings.Combat.eligible,
            routeClear: () => true,
            landingCandidates: () => [{ x: 3, y: 0 }],
            moveSource: (s, p) => Object.assign(s, p),
            bindNPC: (s, t) => c.Spiderlings.Combat.hitNPC(s, t, "dash"),
            consumeSource: (s) => {
                s.hp = 0;
            },
            damagePlayer: () => playerDamage++,
        });
        assert.equal(controller.begin(source, target).started, true);
        controller.advancePlayerAction();
        controller.advancePlayerAction();
        if (change === "move") target.x++;
        if (change === "dead") target.hp = 0;
        if (change === "friendly") target.faction = source.faction;
        if (change === "replacement") {
            target.x++;
            spawn(3, "Maidforce", "Maidforce").x = 4;
        }
        controller.advancePlayerAction();
        assert.equal(target.boundLevel, change === "none" ? 3 : 0, change);
        assert.equal(source.hp, change === "none" ? 0 : 8, change);
        assert.equal(playerDamage, 0);
        assert.equal(controller.snapshot().length, 0);
    }
});

test("light NPC contacts cap flat weakness amplification and do not repeat resisted trail damage", () => {
    const { c, spawn, events } = fixture();
    const source = spawn(1, "WebCaster", "Enemy"),
        target = spawn(2, "Maidforce", "Maidforce");
    target.tickleWeak = true;
    target.immune = true;
    const hit = () =>
        c.KDBulletHitEnemy(
            {
                bullet: {
                    source: source.id,
                    damage: { type: "inert" },
                    spell: { playerEffect: { provenance: "WebCaster.WebSpray", triggerSource: "trail" } },
                },
            },
            target,
        );
    hit();
    assert.equal(target.hp, 7.98);
    assert.equal(target.boundLevel, 0);
    hit();
    assert.equal(target.hp, 7.98);
    events("tickAfter", { delta: 1 });
    hit();
    assert.ok(Math.abs(target.hp - 7.96) < 1e-10);
    c.KinkyDungeonDamageEnemy(target, { damage: 0.01, type: "tickle" });
    assert.ok(Math.abs(target.hp - 7.45) < 1e-10, "other tickle attacks retain the native weakness bonus");
});

function cooperationFixture() {
    const r = fixture(),
        { c, spawn } = r;
    const a = spawn(11, "WebCaster", "Enemy"),
        b = spawn(12, "WebCaster", "Enemy"),
        target = spawn(13, "Maidforce", "Maidforce");
    c.Spiderlings.activeWebCasters = (t) =>
        c.KDMapData.Entities.filter(
            (e) =>
                e.Enemy.name === "WebCaster" &&
                e.hp > 0 &&
                !e.stun &&
                c.KDHostile(e, t) &&
                Math.hypot(e.x - t.x, e.y - t.y) <= 6,
        );
    const shot = (source, recipient = target, kind = "direct") => {
        const bullet = {
            bullet: {
                source: source.id,
                damage: { type: "inert" },
                spell: { playerEffect: { provenance: "WebCaster.WebSpray", triggerSource: kind } },
            },
        };
        c.KDBulletHitEnemy(bullet, recipient);
        return bullet;
    };
    return { ...r, a, b, target, shot };
}

test("two successful NPC direct sources add binding only, at most once per target in four turns", () => {
    const { c, events, a, b, target, shot } = cooperationFixture();
    shot(a);
    shot(b);
    assert.equal(target.boundLevel, 8);
    assert.ok(Math.abs(target.hp - 7.9) < 1e-9);
    shot(a);
    shot(b);
    assert.equal(target.boundLevel, 14);
    events("tickAfter", { delta: 3 });
    shot(a);
    shot(b);
    assert.equal(target.boundLevel, 20);
    events("tickAfter", { delta: 1 });
    shot(a);
    shot(b);
    assert.equal(target.boundLevel, 28);
    assert.equal(target.equipment, 0);
    const other = c.KDMapData.Entities[2];
    assert.equal(other, target);
});

test("NPC cooperation excludes repeats, trails, stale or disabled partners, blocked hits and reused bullets", () => {
    for (const reason of [
        "same",
        "trail",
        "stale",
        "dead",
        "stun",
        "far",
        "friendly",
        "immune",
        "shield",
        "duplicate",
    ]) {
        const { c, events, a, b, target, shot } = cooperationFixture();
        const bullet = shot(a);
        if (reason === "stale") events("tickAfter", { delta: 3 });
        if (reason === "dead") a.hp = 0;
        if (reason === "stun") a.stun = 1;
        if (reason === "far") a.x = 7;
        if (reason === "friendly") a.faction = "Maidforce";
        if (reason === "immune") target.immune = true;
        if (reason === "shield") target.shield = 5;
        if (reason === "duplicate") c.KDBulletHitEnemy(bullet, target);
        else shot(reason === "same" ? a : b, target, reason === "trail" ? "trail" : "direct");
        assert.equal(
            target.boundLevel,
            reason === "duplicate" || reason === "immune" || reason === "shield" ? 3 : reason === "trail" ? 3.5 : 6,
            reason,
        );
    }
});

test("NPC cooperation uses the inclusive two-turn window and preserves target cooldown on load", () => {
    const { events, a, b, target, shot, spawn } = cooperationFixture();
    shot(a);
    events("tickAfter", { delta: 2 });
    shot(b);
    assert.equal(target.boundLevel, 8);
    const other = spawn(20, "Maidforce", "Maidforce");
    shot(a, other);
    shot(b, other);
    assert.equal(other.boundLevel, 8);
    events("afterLoadGame", {});
    shot(a);
    shot(b);
    assert.equal(target.boundLevel, 14);
    events("tickAfter", { delta: 4 });
    shot(a);
    events("afterLoadGame", {});
    shot(b);
    assert.equal(target.boundLevel, 20, "loading clears a pending pair but does not bypass a saved cooldown");
});
