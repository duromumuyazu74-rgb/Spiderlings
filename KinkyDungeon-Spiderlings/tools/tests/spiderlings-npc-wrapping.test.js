"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsNPCWrapping.js"), "utf8");
const nativeField = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsSpinnerNativeField.js"), "utf8");
const oldCapture = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsSpinnerNPCCapture.js"), "utf8");

function fixture() {
    const calls = { native: 0, removed: [], colors: [], labels: [], lines: 0 };
    const target = {
        id: 10,
        x: 4,
        y: 4,
        hp: 10,
        faction: "Maidforce",
        full: true,
        silk: true,
        silkFaction: "Enemy",
        silkSufficient: true,
        specialBoundLevel: { Slime: 7 },
        Enemy: { name: "Maidforce", bound: "Maidforce", tags: {} },
    };
    const spiders = [1, 2, 3].map((id) => ({
        id,
        x: 3 + (id === 2 ? 1 : 0),
        y: 3 + (id === 3 ? 1 : 0),
        hp: 4,
        faction: "Enemy",
        Enemy: { name: id === 1 ? "Spinner" : "Jumper", movePoints: 1, tags: {} },
    }));
    const map = { Entities: [...spiders, target] };
    const blockedTiles = new Set();
    const context = {
        Spiderlings: {
            Hooks: { wrap: (_id, native, wrapper) => wrapper(native) },
            NPCAdhesion: {
                status: (entity) => (entity.full ? "full" : entity.helpless ? "native-helpless" : "free"),
                hasAttributedSilk: (entity) => !!entity.silk,
                hasSpiderHelplessness: (entity) => !!entity.helpless && !!entity.silkSufficient,
                silkSource: (entity) =>
                    entity.silk
                        ? { id: -1, hp: 1, faction: entity.silkFaction, Enemy: { name: "WebCaster" } }
                        : undefined,
            },
            getSetting: () => context.pink === true,
        },
        KDMapData: map,
        KDEventMapGeneric: {},
        KDAddEvent: (map, event, id, handler) => {
            (map[event] ||= {})[id] = handler;
        },
        KDCanSeeEnemy: (entity) => !entity.hidden,
        KinkyDungeonVisionGet: () => 1,
        KDGameData: { Collection: {}, SleepTurns: 0 },
        KinkyDungeonGetBuffedStat: () => 0,
        KinkyDungeonMultiplicativeStat: () => 1,
        KDBoundEffects: () => 0,
        KDHostile: (sourceEntity, prey) => sourceEntity.faction !== prey.faction && !prey.peaceful,
        KDHelpless: (entity) => !!entity.helpless,
        KDCapturable: (entity) =>
            !!entity?.Enemy?.bound &&
            !entity.Enemy.allied &&
            !["skeleton", "construct", "nobrain", "nocapture"].some((tag) => entity.Enemy.tags?.[tag]),
        KDIsInParty: (entity) => !!entity.party,
        KinkyDungeonIsDisabled: (entity) => !!entity.disabled,
        KinkyDungeonCheckPath: (x, y) => !map.Entities.find((entity) => entity.x === x && entity.y === y)?.blocked,
        KinkyDungeonTransparentMovableObjects: "0",
        KinkyDungeonMapGet: (x, y) => (blockedTiles.has(`${x},${y}`) ? "1" : "0"),
        KDRemoveEntity(entity, kill, capture) {
            calls.removed.push({ entity, kill, capture });
            if (entity.cancelRemoval) return false;
            map.Entities.splice(map.Entities.indexOf(entity), 1);
            return true;
        },
        KDEnemyStruggleTurn(entity) {
            entity.specialBoundLevel.Slime -= entity.struggle || 0;
        },
        PIXI: {
            Graphics: class {
                clear() {
                    return this;
                }
                lineStyle(_width, color) {
                    calls.colors.push(color);
                    return this;
                }
                moveTo() {
                    return this;
                }
                lineTo() {
                    calls.lines++;
                    return this;
                }
            },
        },
        kdgameboard: { addChild: () => {} },
        kdenemystatusboard: {},
        KinkyDungeonGridSizeDisplay: 72,
        TextGet: (key) => key,
        DrawTextFitKDTo: (_board, label) => calls.labels.push(label),
    };
    vm.createContext(context);
    vm.runInContext(nativeField, context);
    vm.runInContext(oldCapture, context);
    vm.runInContext(source, context);
    const wrap = context.Spiderlings.NPCWrapping;
    const damage = (amount, prey = target) => {
        const data = { enemy: prey, dmgDealt: amount };
        context.KDEventMapGeneric.duringDamageEnemy.SpiderlingsNPCWrapping(null, data);
        return data.dmgDealt;
    };
    return { calls, context, map, target, spiders, wrap, damage, blockedTiles };
}

test("full owned silk multiplies effective native damage without creating a countdown", () => {
    const r = fixture();
    assert.equal(r.damage(2), 8);
    assert.equal(r.damage(0), 0);
    assert.equal(r.damage(-1), -1);
    assert.equal(r.wrap.DAMAGE_MULTIPLIER, 4);
    for (let i = 0; i < 8; i++) r.wrap.preemptNativeCapture();
    assert.equal(r.calls.removed.length, 0);
    assert.ok(r.map.Entities.includes(r.target));
    assert.equal(r.wrap.handleEnemyTurn, undefined);
    assert.equal(r.map.SpiderlingsNPCWrapping, undefined);
});
test("partial or foreign silk does not create exposure; sufficient owned helplessness does", () => {
    const r = fixture();
    r.target.full = false;
    assert.equal(r.damage(2), 2);
    r.target.helpless = true;
    assert.equal(r.damage(2), 8);
    r.target.silkSufficient = false;
    assert.equal(r.damage(2), 2);
    r.target.full = true;
    r.target.silk = false;
    assert.equal(r.damage(2), 2);
});
test("removal, old-map aliases, players and protected prey do not receive owned vulnerability", () => {
    const r = fixture();
    assert.equal(r.damage(2, { ...r.target }), 2);
    for (const property of ["player", "shop", "party"]) {
        r.target[property] = true;
        assert.equal(r.damage(2), 2);
        delete r.target[property];
    }
    r.target.Enemy.tags.nocapture = true;
    assert.equal(r.damage(2), 2);
    delete r.target.Enemy.tags.nocapture;
    r.map.Entities = r.spiders;
    assert.equal(r.damage(2), 2);
});
test("removing or recovering from silk immediately removes exposure", () => {
    const r = fixture();
    assert.equal(r.damage(1), 4);
    r.target.full = false;
    assert.equal(r.damage(1), 1);
    r.target.full = true;
    assert.equal(r.damage(1), 4);
    r.target.hp = 0;
    assert.equal(r.damage(1), 1);
});
test("legacy wrapping progress is discarded on reload without moving, killing or untying prey", () => {
    const r = fixture();
    r.map.SpiderlingsNPCWrapping = {
        version: 1,
        records: { 10: { targetId: 10, progress: 3, helplessTurns: 3, sourceIds: [1] } },
        paidSourceIds: [1],
    };
    const before = JSON.stringify(r.target);
    r.wrap.afterLoad();
    assert.equal(r.map.SpiderlingsNPCWrapping, undefined);
    assert.equal(JSON.stringify(r.target), before);
    assert.equal(r.calls.removed.length, 0);
    assert.equal(r.damage(1), 4);
});
test("exposure label follows real visibility without a three-step progress or strands", () => {
    const r = fixture();
    const draw = () => {
        r.calls.labels.length = 0;
        r.wrap.draw({ CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
        return [...r.calls.labels];
    };
    assert.deepEqual(draw(), ["SpiderlingsNPCWrapping"]);
    assert.equal(r.calls.lines, 0);
    r.target.hidden = true;
    assert.deepEqual(draw(), []);
    r.target.hidden = false;
    r.context.KinkyDungeonVisionGet = () => 0;
    assert.deepEqual(draw(), []);
    assert.equal(r.damage(1), 4);
});
test("native capture strands yield to exposure without removing their living target", () => {
    const r = fixture(),
        released = [];
    r.context.Spiderlings.SpinnerNPCCapture = {
        records: () => ({ 10: { targetId: 10 } }),
        releaseForWrapping: (t) => released.push(t.id),
    };
    r.wrap.preemptNativeCapture();
    assert.deepEqual(released, [10]);
    assert.equal(r.calls.removed.length, 0);
});

test("exposure checks consume no spider attack, movement or construction operation", () => {
    const r = fixture();
    for (const spider of r.spiders)
        Object.assign(spider, { attackPoints: 2, movePoints: 3, SpinnerConstructionPoints: 4 });
    const before = JSON.stringify(r.spiders);
    for (let turn = 0; turn < 10; turn++) {
        assert.equal(r.damage(1), 4);
        r.wrap.preemptNativeCapture();
    }
    assert.equal(JSON.stringify(r.spiders), before);
    assert.equal(r.calls.removed.length, 0);
});
