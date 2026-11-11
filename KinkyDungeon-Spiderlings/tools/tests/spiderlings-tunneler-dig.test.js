"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { nativeEvents } = require("./helpers/native-events.js");

// Values created inside the VM realm compare by shape only.
const plain = (value) => JSON.parse(JSON.stringify(value));

const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsTunnelerDig.js"), "utf8");

function fixture() {
    const removed = [],
        summoned = [],
        messages = [],
        danger = [];
    const tunneler = {
        id: 7,
        x: 5,
        y: 6,
        hp: 1,
        faction: "Enemy",
        Enemy: { name: "Tunneler", color: "#FF00FF" },
    };
    const c = {
        ...nativeEvents(),
        Spiderlings: { SpellVisuals: { nativeDanger: (cells) => danger.push(cells) } },
        KDMapData: { Entities: [tunneler] },
        KinkyDungeonSpellSpecials: {},
        KDBaseWhite: "#ffffff",
        KinkyDungeonIsDisabled: (enemy) => enemy.stun > 0 || enemy.freeze > 0 || enemy.bound,
        KDHelpless: () => false,
        KDHostile: (enemy) => enemy.faction !== "Player",
        KDGetFaction: (enemy) => enemy.faction,
        KDRemoveEntity(enemy, kill, capture) {
            removed.push({ id: enemy.id, kill, capture });
            c.KDMapData.Entities = c.KDMapData.Entities.filter((entity) => entity !== enemy);
            return true;
        },
        KinkyDungeonSummonEnemy(x, y, name, count, rad, strict, _lifetime, _hidden, _goToTarget, faction, hostile) {
            summoned.push({ x, y, name, count, rad, strict, faction, hostile });
            const nest = { id: 50 + summoned.length, x, y, hp: 10, Enemy: { name } };
            c.KDMapData.Entities.push(nest);
            return [nest];
        },
        TextGet: (key) => `text:${key}`,
        KinkyDungeonSendTextMessage: (...args) => messages.push(args),
    };
    c.globalThis = c;
    vm.createContext(c);
    vm.runInContext(source, c);
    const handlers = (event) => Object.values(c.KDEventMapGeneric[event] || {});
    // The native AI sets the spell channel before KinkyDungeonCastSpell runs the special handler.
    const cast = (caster = tunneler, channel = 2) => {
        caster.channel = channel;
        const special = c.KinkyDungeonSpellSpecials.SpiderlingsNestDig;
        return special({}, {}, caster.x, caster.y, caster.x, caster.y, caster, caster);
    };
    const tickAfter = () => {
        for (const handler of handlers("tickAfter")) handler({}, { delta: 1 });
    };
    // One world turn in native order: each enemy's stun, then channel, is spent before tickAfter.
    const worldTurn = () => {
        for (const enemy of [...c.KDMapData.Entities]) {
            if (enemy.stun > 0) {
                if (enemy.stun <= 1)
                    for (const handler of handlers("enemyStatusEnd")) handler({}, { enemy, status: "stun" });
                enemy.stun = Math.max(0, enemy.stun - 1);
            }
            if (enemy.channel > 0) enemy.channel -= 1;
        }
        tickAfter();
    };
    const nests = () => c.KDMapData.Entities.filter((entity) => entity.Enemy.name === "NestEntrance");
    return { c, tunneler, cast, tickAfter, worldTurn, nests, removed, summoned, messages, danger };
}

test("a native dig keeps the Tunneler on its tile for two turns, then opens one nest exactly there", () => {
    const r = fixture();
    assert.equal(r.cast(), "Cast");
    // The cast turn's tickAfter still sees the whole channel; the following turn is the last.
    for (const remaining of [2, 1]) {
        if (remaining === 2) r.tickAfter();
        else r.worldTurn();
        assert.deepEqual(r.nests(), []);
        assert.ok(r.c.KDMapData.Entities.includes(r.tunneler));
        assert.deepEqual(plain(r.c.Spiderlings.TunnelerDig.pending()), [
            { id: 7, x: 5, y: 6, remaining, color: "#FF00FF" },
        ]);
        assert.deepEqual(plain(r.danger.at(-1)), [{ x: 5, y: 6 }]);
    }
    r.worldTurn();
    assert.deepEqual(r.removed, [{ id: 7, kill: false, capture: false }]);
    assert.deepEqual(r.summoned, [
        { x: 5, y: 6, name: "NestEntrance", count: 1, rad: 0, strict: true, faction: "Enemy", hostile: true },
    ]);
    assert.equal(r.nests().length, 1);
    assert.deepEqual(plain(r.c.Spiderlings.TunnelerDig.pending()), []);
    assert.equal(r.messages.length, 1);
    assert.equal(r.messages[0][1], "text:KinkyDungeonSummonSingleNestEntrance");
    assert.equal(r.messages[0][6], r.nests()[0], "the arrival message uses the nest's visibility");
    r.worldTurn();
    assert.equal(r.summoned.length, 1, "a finished dig never opens a second nest");
});

test("stuns, freezes, bindings and displacement cancel the dig and keep the Tunneler", () => {
    const interruptions = {
        "a one-turn stun spent within the enemy update": (t) => (t.stun = 1),
        "a lasting stun": (t) => (t.stun = 3),
        freeze: (t) => (t.freeze = 2),
        binding: (t) => (t.bound = true),
        knockback: (t) => (t.x += 1),
    };
    for (const [name, interrupt] of Object.entries(interruptions)) {
        const r = fixture();
        r.cast();
        interrupt(r.tunneler);
        r.worldTurn();
        assert.deepEqual(plain(r.c.Spiderlings.TunnelerDig.pending()), [], name);
        assert.equal(r.tunneler.channel, 0, `${name} releases the native channel`);
        for (let turn = 0; turn < 4; turn++) r.worldTurn();
        assert.deepEqual(r.summoned, [], name);
        assert.deepEqual(r.removed, [], name);
        assert.ok(r.c.KDMapData.Entities.includes(r.tunneler), name);
    }
});

test("a Tunneler knocked out mid-dig opens nothing", () => {
    const r = fixture();
    r.cast();
    r.worldTurn();
    r.tunneler.hp = 0;
    r.worldTurn();
    r.worldTurn();
    assert.deepEqual(r.summoned, []);
    assert.deepEqual(r.removed, [], "native death handling, not the dig, removes the Tunneler");
    assert.deepEqual(plain(r.c.Spiderlings.TunnelerDig.pending()), []);
});

test("a dig in progress survives a native save round trip", () => {
    const r = fixture();
    r.cast();
    r.worldTurn();
    const restored = JSON.parse(JSON.stringify(r.tunneler));
    r.c.KDMapData.Entities = [restored];
    r.worldTurn();
    assert.equal(r.nests().length, 1);
    assert.deepEqual([r.nests()[0].x, r.nests()[0].y], [5, 6]);
});

test("an allied Tunneler's dig opens a nest on its own side", () => {
    const r = fixture();
    r.tunneler.faction = "Player";
    r.cast();
    r.tickAfter();
    r.worldTurn();
    r.worldTurn();
    assert.equal(r.summoned.length, 1);
    assert.equal(r.summoned[0].faction, "Player");
    assert.equal(r.summoned[0].hostile, false, "an allied nest is not forced hostile");
});
