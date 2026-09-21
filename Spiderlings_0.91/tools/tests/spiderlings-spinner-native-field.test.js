"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./helpers/lifecycle-runtime.js");

const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });

function runtime() {
    let nextId = 100;
    const tiles = new Map(),
        buffs = [],
        context = {
            console,
            Spiderlings: {},
            KinkyDungeonEnemies: [
                {
                    name: "IceWall",
                    tags: {},
                    dropTable: [],
                    events: [],
                },
            ],
            KDMapData: { GridWidth: 20, GridHeight: 20, Entities: [] },
            KDGameData: { SleepTurns: 0 },
            KinkyDungeonPlayerEntity: { player: true, x: 1, y: 1 },
            KinkyDungeonMovableTilesEnemy: ".0",
            KinkyDungeonMovableTilesSmartEnemy: ".0",
            KinkyDungeonCurrentTick: 5,
            KinkyDungeonRootDirectory: "Game/",
            KinkyDungeonFlags: new Map(),
            KDModFiles: { "Bullets/WebSprayTrail.png": {} },
            KDPathConditions: {},
            KDInputTypes: {},
            KDEventMapGeneric: {},
            KDPathCache: new Map([["old", []]]),
            KDPathCacheIgnoreLocks: new Map([["old", []]]),
            KDUpdateEnemyCache: false,
            KDMapInit: (values) => Object.fromEntries(values.map((value) => [value, true])),
            KinkyDungeonMapGet: (x, y) => (x === 9 && y === 9 ? "1" : "."),
            KinkyDungeonTilesGet: (key) => tiles.get(key),
            KinkyDungeonEntityAt(x, y) {
                if (context.KinkyDungeonPlayerEntity.x === x && context.KinkyDungeonPlayerEntity.y === y)
                    return context.KinkyDungeonPlayerEntity;
                return context.KDMapData.Entities.find((entity) => entity.x === x && entity.y === y);
            },
            DialogueCreateEnemy(x, y, name) {
                if (context.KinkyDungeonEntityAt(x, y)) return undefined;
                const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === name);
                if (!definition) return undefined;
                const entity = { id: nextId++, x, y, hp: definition.maxhp, Enemy: definition };
                context.KDMapData.Entities.push(entity);
                return entity;
            },
            KinkyDungeonGetBuffedStat: () => 0,
            KinkyDungeonMultiplicativeStat: () => 1,
            KDBoundEffects: () => 0,
            KinkyDungeonIsDisabled: () => false,
            KinkyDungeonCheckPath: () => true,
            KDHelpless: () => false,
            KDHostile: () => true,
            KinkyDungeonApplyBuffToEntity(entity, buff) {
                entity.buffs = entity.buffs || {};
                entity.buffs[buff.id] = buff;
                buffs.push({ entity, buff });
            },
            KDMoveEntity(entity, x, y) {
                if (context.KinkyDungeonEntityAt(x, y)) return false;
                entity.x = x;
                entity.y = y;
                return true;
            },
            KDAddEvent(map, trigger, name, handler) {
                map[trigger] = map[trigger] || {};
                map[trigger][name] = handler;
            },
        };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    load(context, "SpiderlingsCore.js");
    load(context, "SpiderlingsSpinnerTopology.js");
    load(context, "SpiderlingsSpinnerNativeField.js");
    load(context, "SpiderlingsSpinnerScenarios.js");
    context.Spiderlings.SpinnerField = { handleEnemyTurn: () => undefined };
    context.Spiderlings.SpinnerCapture = { handleEnemyTurn: () => undefined };
    load(context, "SpiderlingsSpinnerRuntime.js");
    return { context, tiles, buffs };
}

function buildAll(
    r,
    anchors = [
        { x: 5, y: 3 },
        { x: 5, y: 7 },
    ],
) {
    const c = r.context,
        owners = [
            { id: 1, x: 3, y: 3, hp: 10, Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } } },
            { id: 2, x: 3, y: 7, hp: 10, Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } } },
        ];
    c.KDMapData.Entities.push(...owners);
    const started = c.Spiderlings.SpinnerScenarios.setupDoorway({
        fieldId: "doorway",
        ownerIds: owners.map((owner) => owner.id),
        anchors,
    });
    assert.equal(started.started, true);
    let handled = 0;
    while (Object.values(started.encounter.builders).some((builder) => builder.actions.length)) {
        for (const owner of owners) {
            const before = { x: owner.x, y: owner.y };
            if (started.encounter.builders[owner.id].actions.length) {
                assert.ok(c.Spiderlings.SpinnerNativeField.handleEnemyTurn(owner, c.KinkyDungeonPlayerEntity, 1));
                handled++;
                assert.deepEqual({ x: owner.x, y: owner.y }, before);
            }
        }
    }
    return { owners, encounter: started.encounter, handled };
}

test("pure topology requires paid anchor and connection operations and rejects action-boundary blockers", () => {
    const c = runtime().context,
        rules = c.Spiderlings.SpinnerTopology,
        initial = rules.createLine({
            fieldId: "line",
            owners: [1, 2],
            anchors: [
                { x: 3, y: 3 },
                { x: 3, y: 4 },
            ],
        }),
        clear = (cell) => ({ cell, inBounds: true, floor: true, protected: false, occupied: false });
    let result = rules.applyAction(
        initial,
        { type: "placeAnchor", ownerId: 1, anchorId: initial.anchors[0].id },
        clear(initial.anchors[0]),
    );
    result = rules.applyAction(
        result.state,
        { type: "placeAnchor", ownerId: 2, anchorId: initial.anchors[1].id },
        clear(initial.anchors[1]),
    );
    assert.equal(result.state.links[0].connected, false);
    result = rules.applyAction(
        result.state,
        { type: "extendLink", ownerId: 1, linkId: initial.links[0].id },
        clear({ x: -1, y: -1 }),
    );
    assert.equal(result.state.links[0].connected, true);
    assert.equal(rules.solidCells(result.state).length, 2);

    for (const snapshot of [
        { inBounds: true, floor: false, protected: false, occupied: false },
        { inBounds: true, floor: true, protected: true, occupied: false },
        { inBounds: true, floor: true, protected: false, occupied: true },
    ]) {
        const rejected = rules.applyAction(
            initial,
            { type: "placeAnchor", ownerId: 1, anchorId: initial.anchors[0].id },
            { ...snapshot, cell: { x: 3, y: 3 } },
        );
        assert.equal(rejected.outcome.legal, false);
        assert.equal(rejected.state.anchors[0].built, false);
    }
});

test("two supplied Spinners construct one cell per paid action without moving", () => {
    const r = runtime(),
        built = buildAll(r),
        solids = r.context.Spiderlings.SpinnerTopology.solidCells(built.encounter.topology),
        proxies = r.context.KDMapData.Entities.filter(r.context.Spiderlings.SpinnerNativeField.isOwnedProxy);
    assert.equal(built.handled, 5);
    assert.equal(solids.length, 5);
    assert.equal(proxies.length, 5);
    assert.equal(new Set(proxies.map((proxy) => `${proxy.x},${proxy.y}`)).size, 5);
    assert.ok(proxies.every((proxy) => proxy.targetedForAttack && proxy.Enemy.immobile === false));
});

test("native pathcondition lets only Spiderlings cross without moving or duplicating the proxy", () => {
    const r = runtime();
    buildAll(r, [
        { x: 5, y: 4 },
        { x: 5, y: 6 },
    ]);
    const c = r.context,
        proxy = c.KDMapData.Entities.find(
            (entity) => c.Spiderlings.SpinnerNativeField.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5,
        ),
        spiderling = { id: 9, x: 4, y: 5, hp: 5, Enemy: { tags: { spiderlings: true } } },
        bandit = { id: 10, x: 4, y: 4, hp: 5, Enemy: { tags: {} } };
    c.KDMapData.Entities.push(spiderling, bandit);
    assert.equal(c.KDPathConditions.SpiderlingsWebTraversal.query(spiderling, proxy), true);
    assert.equal(c.KDPathConditions.SpiderlingsWebTraversal.query(bandit, proxy), false);
    assert.equal(c.KDPathConditions.SpiderlingsWebTraversal.doPassthrough(spiderling, proxy, c.KDMapData), 2);
    assert.deepEqual({ x: spiderling.x, y: spiderling.y }, { x: 6, y: 5 });
    assert.deepEqual({ x: proxy.x, y: proxy.y }, { x: 5, y: 5 });
    assert.equal(c.KDMapData.Entities.filter((entity) => entity.x === 5 && entity.y === 5).length, 1);
});

test("final native damage updates shared durability once and invalidates both path caches", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        field = c.Spiderlings.SpinnerNativeField,
        encounter = field.state(),
        middle = c.KDMapData.Entities.find((entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5),
        before = encounter.topology.links[0].hp;
    c.KDPathCache.set("seed", []);
    c.KDPathCacheIgnoreLocks.set("seed", []);
    assert.equal(field.onNativeDamage({ enemy: middle, dmgDealt: 1, dmg: 99 }), true);
    assert.equal(encounter.topology.links[0].hp, before - 0.7);
    assert.equal(c.KDPathCache.size, 0);
    assert.equal(c.KDPathCacheIgnoreLocks.size, 0);
    assert.equal(c.KDUpdateEnemyCache, true);

    const anchor = c.KDMapData.Entities.find(
            (entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 3,
        ),
        linkBeforeAnchor = encounter.topology.links[0].hp;
    field.onNativeDamage({ enemy: anchor, dmgDealt: 0.5 });
    assert.equal(encounter.topology.anchors[0].hp, 1.5);
    assert.equal(encounter.topology.links[0].hp, linkBeforeAnchor - 0.5);
});

test("native area hits contribute once per covered proxy and a middle-cell breach reopens the route", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        field = c.Spiderlings.SpinnerNativeField,
        encounter = field.state(),
        proxies = c.KDMapData.Entities.filter((entity) => field.isOwnedProxy(entity) && entity.y > 3 && entity.y < 7),
        before = encounter.topology.links[0].hp;
    field.onNativeDamage({ enemy: proxies[0], dmgDealt: 0.5, bullet: { aoe: 3 } });
    field.onNativeDamage({ enemy: proxies[1], dmgDealt: 0.5, bullet: { aoe: 3 } });
    assert.equal(encounter.topology.links[0].hp, before - 0.775);

    const middle = c.KDMapData.Entities.find(
        (entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5,
    );
    field.onNativeDamage({ enemy: middle, dmgDealt: 99 });
    assert.equal(encounter.topology.links[0].hp, 0);
    assert.equal(
        c.KDMapData.Entities.some((entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5),
        false,
    );
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, 2);
});

test("anchor snare is once per target and never creates capture or restraint state", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        target = { id: 44, x: 5, y: 3, hp: 5, Enemy: { tags: {} } };
    assert.equal(c.Spiderlings.SpinnerNativeField.onEntry(target, 5, 3), true);
    assert.equal(c.Spiderlings.SpinnerNativeField.onEntry(target, 5, 3), false);
    assert.equal(r.buffs.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(r.buffs[0].buff)), {
        id: "SpiderlingsSpinnerSnaringSilk",
        type: "MoveSpeed",
        power: -1,
        duration: 2,
    });
    assert.equal(c.KDGameData.SpiderlingsSpinnerCapture, undefined);
});

test("runtime movement events apply Snaring on voluntary, forced, and NPC anchor entry", () => {
    for (const entry of [
        { event: "playerMove", willing: true, npc: false },
        { event: "playerMove", willing: false, npc: false },
        { event: "enemyMove", willing: true, npc: true },
    ]) {
        const r = runtime();
        buildAll(r);
        const c = r.context,
            target = entry.npc ? { id: 71, x: 5, y: 3, hp: 2, Enemy: { tags: {} } } : c.KinkyDungeonPlayerEntity,
            data = { enemy: target, moveX: 5, moveY: 3, willing: entry.willing, cancelmove: false };
        c.KDEventMapGeneric[entry.event].SpiderlingsSpinnerRuntime({}, data);
        assert.equal(r.buffs.length, 1);
        assert.equal(r.buffs[0].entity, target);
    }
});

test("JSON save roundtrip reconciles one proxy per solid cell and preserves owners, HP, and snare IDs", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        field = c.Spiderlings.SpinnerNativeField,
        encounter = field.state();
    field.onEntry({ id: 55, Enemy: {} }, 5, 3);
    encounter.topology.links[0].hp -= 0.25;
    encounter.topology.ownerlessAge = 7;
    const saved = JSON.parse(JSON.stringify(encounter));
    c.KDMapData.SpiderlingsSpinnerEncounter = saved;
    const proxies = c.KDMapData.Entities.filter(field.isOwnedProxy),
        proxy = proxies[0];
    c.KDMapData.Entities.push({ ...proxy, id: 999 });
    c.KDMapData.Entities.splice(c.KDMapData.Entities.indexOf(proxies[1]), 1);
    c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
    const reconciled = field.reconcile();
    const solids = c.Spiderlings.SpinnerTopology.solidCells(saved.topology);
    assert.equal(reconciled.created, 0);
    assert.equal(reconciled.removed, 0);
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, solids.length);
    assert.deepEqual(Array.from(saved.topology.owners), [1, 2]);
    assert.deepEqual(Array.from(saved.topology.anchors[0].snaredTargetIds), [55]);
    assert.equal(saved.topology.ownerlessAge, 7);
});

test("one surviving owner retains the line and final-owner collapse occurs on active turn twenty", () => {
    const r = runtime(),
        built = buildAll(r),
        c = r.context,
        field = c.Spiderlings.SpinnerNativeField;
    built.owners[0].hp = 0;
    field.tick(30);
    assert.equal(built.encounter.topology.ownerlessAge, 0);
    assert.equal(built.encounter.topology.collapsed, false);
    built.owners[1].hp = 0;
    field.tick(19);
    assert.equal(built.encounter.topology.ownerlessAge, 19);
    assert.equal(built.encounter.topology.collapsed, false);
    field.tick(1);
    assert.equal(built.encounter.topology.collapsed, true);
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, 0);
});
