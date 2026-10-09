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
        context.KDEventMapGeneric.duringDamageEnemy?.SpiderlingsNPCWrapping?.(null, data);
        return data.dmgDealt;
    };
    return { calls, context, map, target, spiders, wrap, damage, blockedTiles };
}

test("owned silk never amplifies native damage or immediately removes its prey", () => {
    const r = fixture();
    assert.equal(r.damage(2), 2);
    assert.equal(r.damage(0), 0);
    assert.equal(r.damage(-1), -1);
    assert.equal(r.wrap.DAMAGE_MULTIPLIER, 1);
    r.wrap.tick(0);
    r.wrap.preemptNativeCapture();
    assert.equal(r.calls.removed.length, 0);
    assert.equal(r.target.hp, 10);
    assert.equal(r.target.SpiderlingsNPCWrapping, undefined);
});

test("six consecutive owned full-pin turns release space without killing or collecting prey", () => {
    const r = fixture(),
        before = r.target.hp;
    for (let i = 0; i < 5; i++) r.wrap.tick(1);
    assert.ok(r.map.Entities.includes(r.target));
    assert.equal(r.target.hp, before);
    r.wrap.tick(1);
    assert.ok(!r.map.Entities.includes(r.target));
    assert.equal(r.target.hp, before);
    assert.equal(r.calls.removed.length, 1);
    assert.equal(r.calls.removed[0].kill, false);
    assert.equal(r.calls.removed[0].capture, undefined);
    r.wrap.tick(1);
    assert.equal(r.calls.removed.length, 1);
});

test("native zero-time load and duplicate ticks preserve saved departure progress", () => {
    const r = fixture();
    for (let tick = 1; tick <= 3; tick++) {
        r.context.KinkyDungeonCurrentTick = tick;
        r.wrap.tick(1);
        r.wrap.tick(1);
    }
    assert.equal(r.target.SpiderlingsNPCWrapping.remaining, 3);
    const before = JSON.stringify(r.target);
    r.wrap.tick(0);
    r.wrap.draw({});
    r.map.SpiderlingsNPCWrapping = { version: 1, records: { 10: { progress: 3 } } };
    r.wrap.afterLoad();
    assert.equal(JSON.stringify(r.target), before);
    assert.equal(r.map.SpiderlingsNPCWrapping, undefined);
    for (let tick = 4; tick <= 5; tick++) {
        r.context.KinkyDungeonCurrentTick = tick;
        r.wrap.tick(1);
    }
    assert.ok(r.map.Entities.includes(r.target));
    r.context.KinkyDungeonCurrentTick = 6;
    r.wrap.tick(1);
    assert.ok(!r.map.Entities.includes(r.target));
});

test("native struggle or rescue resets the departure window", () => {
    const r = fixture();
    for (let i = 0; i < 5; i++) r.wrap.tick(1);
    r.target.full = false;
    r.wrap.tick(1);
    assert.equal(r.target.SpiderlingsNPCWrapping, undefined);
    r.target.full = true;
    for (let i = 0; i < 5; i++) r.wrap.tick(1);
    assert.ok(r.map.Entities.includes(r.target));
    r.wrap.tick(1);
    assert.ok(!r.map.Entities.includes(r.target));
});

test("foreign silk, protected roles and stale map objects never acquire a departure timer", () => {
    for (const property of ["player", "shop", "party", "foreign", "nocapture", "stale"]) {
        const r = fixture();
        if (property === "foreign") r.target.silk = false;
        else if (property === "nocapture") r.target.Enemy.tags.nocapture = true;
        else if (property === "stale") r.map.Entities = r.spiders;
        else r.target[property] = true;
        for (let i = 0; i < 10; i++) r.wrap.tick(1);
        assert.equal(r.calls.removed.length, 0, property);
        assert.equal(r.target.SpiderlingsNPCWrapping, undefined, property);
    }
});

test("sufficient owned native helplessness qualifies after recent pin pressure expires", () => {
    const r = fixture();
    r.target.full = false;
    r.target.helpless = true;
    r.target.silkSufficient = false;
    r.wrap.tick(1);
    assert.equal(r.target.SpiderlingsNPCWrapping, undefined);
    r.target.silkSufficient = true;
    r.wrap.tick(1);
    assert.equal(r.target.SpiderlingsNPCWrapping.remaining, 5);
});

test("native removal cancellation retains the living prey and retries only on another positive tick", () => {
    const r = fixture();
    r.target.cancelRemoval = true;
    for (let i = 0; i < 6; i++) r.wrap.tick(1);
    assert.ok(r.map.Entities.includes(r.target));
    assert.equal(r.target.hp, 10);
    assert.equal(r.calls.removed.length, 1);
    r.wrap.tick(0);
    assert.equal(r.calls.removed.length, 1);
    delete r.target.cancelRemoval;
    r.wrap.tick(1);
    assert.ok(!r.map.Entities.includes(r.target));
});

test("silk mechanics draw no design-policy labels and reserve no spider actions", () => {
    const r = fixture();
    for (const spider of r.spiders)
        Object.assign(spider, { attackPoints: 2, movePoints: 3, SpinnerConstructionPoints: 4 });
    const before = JSON.stringify(r.spiders);
    r.wrap.draw({ CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
    r.wrap.tick(1);
    assert.deepEqual(r.calls.labels, []);
    assert.equal(JSON.stringify(r.spiders), before);
});

test("native capture strands release when sustained owned pin starts", () => {
    const r = fixture(),
        released = [];
    r.context.Spiderlings.SpinnerNPCCapture = {
        records: () => ({ 10: { targetId: 10 } }),
        releaseForWrapping: (target) => released.push(target.id),
    };
    r.wrap.preemptNativeCapture();
    assert.deepEqual(released, [10]);
    assert.equal(r.calls.removed.length, 0);
});
