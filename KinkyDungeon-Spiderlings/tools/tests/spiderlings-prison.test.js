"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const gameRoot = require("../reference-inputs.js").gamePath();
const modRoot = path.resolve(__dirname, "../..");
const native = (name) => fs.readFileSync(path.join(gameRoot, "Game/src/map", name), "utf8");

function floor(room = "") {
    const width = 35;
    const height = 29;
    return {
        RoomType: room,
        MapMod: "SpiderlingsInfestation",
        MapFaction: "Maidforce",
        mapX: 0,
        mapY: 3,
        GridWidth: width,
        GridHeight: height,
        Grid: Array.from({ length: height }, () => "1" + "0".repeat(width - 2) + "1\n").join(""),
        Tiles: {},
        TilesSkin: {},
        Entities: [],
        PotentialEntrances: [],
        SpecialAreas: [],
        ShortcutPositions: {},
        UsedEntrances: {},
        Labels: {},
    };
}

function runtime() {
    const source = floor();
    const cocoon = { name: "SpiderlingsCocoon", outerWebs: true };
    const slot = { x: 0, y: 3, jx: 0, jy: 3, main: "", data: { "": source } };
    const world = { "0,3": slot };
    const journey = { "0,3": { SideRooms: [], RoomType: "", Checkpoint: "grv" } };
    const messages = [];
    const context = {
        console,
        Spiderlings: {},
        alts: {},
        KinkyDungeonCreateMapGenType: {},
        KDEventMapGeneric: {},
        KDGameData: { RoomType: "", JourneyMap: journey, JourneyX: 0, JourneyY: 3 },
        KDMapData: source,
        KinkyDungeonPlayerEntity: { x: 14, y: 15 },
        KDCurrentWorldSlot: { x: 0, y: 3 },
        KDUpdateEnemyCache: false,
        KinkyDungeonGroundTiles: "023wW][?/",
        cocoon,
        KDRandom: () => 0.35,
        KDGetWorldMapLocation(point) {
            return world[`${point.x},${point.y}`];
        },
        KinkyDungeonMapGet(x, y) {
            return context.KDMapData.Grid.split("\n")[y]?.[x] || "1";
        },
        KinkyDungeonMapSet(x, y, tile) {
            const rows = context.KDMapData.Grid.split("\n");
            rows[y] = rows[y].slice(0, x) + tile + rows[y].slice(x + 1);
            context.KDMapData.Grid = rows.join("\n");
        },
        KinkyDungeonTilesGet(key) {
            return context.KDMapData.Tiles[key];
        },
        KinkyDungeonTilesSet(key, tile) {
            context.KDMapData.Tiles[key] = tile;
        },
        KDRemoveAoEEffectTiles() {},
        KDAddEvent(events, trigger, name, callback) {
            (events[trigger] ||= {})[name] = callback;
        },
        addTextKey() {},
        TextGet: (key) => key,
        KinkyDungeonSendTextMessage(_priority, message) {
            messages.push(message);
        },
        KDGoThruTile(x, y) {
            const tile = context.KinkyDungeonTilesGet(`${x},${y}`);
            const target = tile?.RoomType;
            if (target === undefined) throw new Error("The native stair has no target room.");
            slot.data[context.KDGameData.RoomType] = JSON.parse(JSON.stringify(context.KDMapData));
            if (!slot.data[target]) {
                context.KDMapData = {
                    ...floor(target),
                    mapX: 0,
                    mapY: 3,
                    MapMod: "",
                    MapFaction: "Enemy",
                    GridWidth: 55,
                    GridHeight: 45,
                    Grid: "",
                    Entities: [],
                };
                context.KDGameData.RoomType = target;
                context.KinkyDungeonCreateMapGenType.SpiderlingsNestPrison([], [{ x: 0, y: 0 }]);
                context.KinkyDungeonMapSet(51, 22, "s");
                slot.data[target] = JSON.parse(JSON.stringify(context.KDMapData));
            } else {
                context.KDMapData = JSON.parse(JSON.stringify(slot.data[target]));
                context.KDGameData.RoomType = target;
            }
            const start = target
                ? context.KDMapData.StartPosition
                : slot.data[""].ShortcutPositions[context.lastPrison];
            context.KinkyDungeonPlayerEntity.x = start.x;
            context.KinkyDungeonPlayerEntity.y = start.y;
            context.KDEventMapGeneric.AfterAdvance.SpiderlingsNestPrison();
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    for (const sourceText of [native("KDLairs.ts"), native("KDLairEntrances.ts")])
        vm.runInContext(stripTypeScriptTypes(sourceText), context);
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsPrison.js"), "utf8"), context);
    return { context, slot, source, cocoon, messages, lairs: vm.runInContext("KDPersonalAlt", context) };
}

function reachable(map, blocked = () => false) {
    const start = map.StartPosition;
    const seen = new Set([`${start.x},${start.y}`]);
    const pending = [start];
    for (let index = 0; index < pending.length; index += 1) {
        const point = pending[index];
        for (const [dx, dy] of [
            [0, 1],
            [0, -1],
            [1, 0],
            [-1, 0],
        ]) {
            const next = { x: point.x + dx, y: point.y + dy };
            const key = `${next.x},${next.y}`;
            if (
                next.x < 0 ||
                next.y < 0 ||
                next.x >= map.GridWidth ||
                next.y >= map.GridHeight ||
                seen.has(key) ||
                blocked(next) ||
                map.Grid.split("\n")[next.y][next.x] === "1"
            )
                continue;
            seen.add(key);
            pending.push(next);
        }
    }
    return seen;
}

function nestRuntime() {
    const r = runtime();
    const kd = r.context;
    let nextId = 100;
    const moves = [];
    const field = { reconciles: 0 };
    kd.KinkyDungeonMovableTilesEnemy = ["0", "s"];
    kd.KinkyDungeonEntityAt = (x, y) =>
        kd.KDMapData.Entities.find((enemy) => enemy.hp > 0 && enemy.x === x && enemy.y === y);
    kd.KinkyDungeonIsDisabled = () => false;
    kd.KDHelpless = () => false;
    kd.KDRemoveEntity = (enemy) => {
        kd.KDMapData.Entities.splice(kd.KDMapData.Entities.indexOf(enemy), 1);
    };
    kd.KinkyDungeonSummonEnemy = (x, y, name) => {
        if (kd.KinkyDungeonMapGet(x, y) !== "0" || kd.KinkyDungeonEntityAt(x, y)) return [];
        const enemy = { id: nextId++, x, y, hp: 5, Enemy: { name, movePoints: 1 } };
        kd.KDMapData.Entities.push(enemy);
        return [enemy];
    };
    kd.KinkyDungeonFindPath = (x, y, gx, gy) => {
        const queue = [{ x, y }];
        const seen = new Set([`${x},${y}`]);
        const parent = new Map();
        for (let index = 0; index < queue.length; index += 1) {
            const at = queue[index];
            if (at.x === gx && at.y === gy) {
                const path = [];
                let point = at;
                while (point.x !== x || point.y !== y) {
                    path.unshift(point);
                    point = parent.get(`${point.x},${point.y}`);
                }
                return path;
            }
            for (const [dx, dy] of [
                [1, 0],
                [0, 1],
                [-1, 0],
                [0, -1],
            ]) {
                const point = { x: at.x + dx, y: at.y + dy };
                const key = `${point.x},${point.y}`;
                if (
                    seen.has(key) ||
                    kd.KinkyDungeonMapGet(point.x, point.y) !== "0" ||
                    kd.KinkyDungeonEntityAt(point.x, point.y)
                )
                    continue;
                seen.add(key);
                parent.set(key, at);
                queue.push(point);
            }
        }
        return undefined;
    };
    kd.KinkyDungeonEnemyTryMove = (enemy, direction) => {
        enemy.x += direction.x;
        enemy.y += direction.y;
        moves.push([enemy.id, enemy.x, enemy.y]);
        return true;
    };
    kd.KDAIType = {
        hunt: { beforemove: () => false },
        wander: { beforemove: () => false },
    };
    kd.Spiderlings.SpinnerNativeField = {
        ensureMap() {
            return (kd.KDMapData.SpiderlingsSpinnerNativeField ||= { ...field });
        },
        reconcile() {
            kd.KDMapData.SpiderlingsSpinnerNativeField.reconciles += 1;
        },
    };
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsPrisonNest.js"), "utf8"), kd);
    const entrance = { id: 14, x: 15, y: 15, hp: 5, Enemy: { name: "NestEntrance" } };
    r.source.Entities.push(entrance);
    assert.equal(kd.Spiderlings.Prison.enter({ entrance }), true);
    kd.KDEventMapGeneric.postMapgen.SpiderlingsPrisonNest();
    return { ...r, moves };
}

test("the native prison floor gets ten reachable mutually supporting nests and active builders", () => {
    const r = nestRuntime();
    const map = r.context.KDMapData;
    const state = map.SpiderlingsPrison;
    const nests = map.Entities.filter((enemy) => enemy.Enemy.name === "NestEntrance");
    assert.equal(nests.length, 10);
    assert.equal(state.mainNestIds.length, 10);
    for (const nest of nests) {
        assert.equal(nest.hp > 0, true);
        assert.equal(nest.x >= state.mainNestBounds.left && nest.x <= state.mainNestBounds.right, true);
        assert.equal(nest.y >= state.mainNestBounds.top && nest.y <= state.mainNestBounds.bottom, true);
        for (const other of nests) assert.equal(Math.hypot(nest.x - other.x, nest.y - other.y) <= 5, true);
    }
    const blocked = new Set(nests.map((nest) => `${nest.x},${nest.y}`));
    const walkable = reachable(map, (point) => blocked.has(`${point.x},${point.y}`));
    assert.equal(walkable.has("51,22"), true);
    for (const nest of nests) {
        assert.equal(
            [
                [1, 0],
                [-1, 0],
                [0, 1],
                [0, -1],
            ].some(([dx, dy]) => walkable.has(`${nest.x + dx},${nest.y + dy}`)),
            true,
        );
    }
    assert.equal(map.Entities.filter((enemy) => enemy.Enemy.name === "Jumper").length, 2);
    assert.equal(map.Entities.filter((enemy) => enemy.Enemy.name === "Spinner").length, 2);
    assert.equal(map.SpiderlingsSpinnerNativeField.autonomous, true);
    assert.equal(map.SpiderlingsSpinnerNativeField.reconciles, 1);
    assert.equal(r.context.Spiderlings.PrisonNest.ordinaryConstructionAllowed({ x: 11, y: 22 }), false);
    assert.equal(r.context.Spiderlings.PrisonNest.ordinaryConstructionAllowed({ x: 20, y: 32 }), false);
    assert.equal(r.context.Spiderlings.PrisonNest.ordinaryConstructionAllowed({ x: 21, y: 22 }), true);
});

test("nest losses, extra nest vacancies and patrol routes persist across exit and return", () => {
    const r = nestRuntime();
    const kd = r.context;
    const first = kd.KDMapData;
    const state = first.SpiderlingsPrison;
    const destroyed = state.mainNestIds[0];
    first.Entities.find((enemy) => enemy.id === destroyed).hp = 0;
    for (let index = 0; index < 6; index += 1)
        first.Entities.push({
            id: 500 + index,
            x: 20 + index,
            y: 20,
            hp: 5,
            Enemy: { name: "NestEntrance" },
        });
    assert.equal(kd.Spiderlings.PrisonNest.livingExtraEntrances(), 6);
    assert.equal(kd.Spiderlings.PrisonNest.allowEntranceSummon(), false);
    first.Entities.find((enemy) => enemy.id === 500).hp = 0;
    assert.equal(kd.Spiderlings.PrisonNest.allowEntranceSummon(), true);
    const patrolId = Number(Object.keys(state.patrols)[0]);
    const patrol = first.Entities.find((enemy) => enemy.id === patrolId);
    const oldPosition = [patrol.x, patrol.y];
    kd.KDAIType.hunt.beforemove(patrol, {}, { canSensePlayer: false });
    assert.notDeepEqual([patrol.x, patrol.y], oldPosition);
    const moved = [patrol.x, patrol.y];
    patrol.aware = true;
    assert.equal(kd.KDAIType.hunt.beforemove(patrol, {}, { canSensePlayer: true }), false);
    assert.deepEqual([patrol.x, patrol.y], moved);
    const originalPrison = kd.KDGameData.RoomType;
    kd.lastPrison = originalPrison;
    kd.KDGoThruTile(51, 22);
    const sourceNest = kd.KDMapData.Entities.find((enemy) => enemy.id === 14);
    assert.equal(kd.Spiderlings.Prison.enter({ entrance: sourceNest }), true);
    assert.equal(kd.KDGameData.RoomType, originalPrison);
    kd.KDEventMapGeneric.afterLoadGame.SpiderlingsPrisonNest();
    assert.equal(kd.KDMapData.Entities.find((enemy) => enemy.id === destroyed).hp, 0);
    assert.equal(kd.KDMapData.SpiderlingsPrison.mainNestIds.length, 10);
    assert.equal(kd.KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "NestEntrance").length, 16);
    assert.equal(kd.Spiderlings.PrisonNest.livingExtraEntrances(), 5);
    assert.equal(Object.keys(kd.KDMapData.SpiderlingsPrison.patrols).length, 2);
    assert.equal(kd.KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "Spinner").length, 2);
});

test("both patrol routes keep moving through their shared central crossing before detection", () => {
    const r = nestRuntime();
    const kd = r.context;
    const patrolIds = Object.keys(kd.KDMapData.SpiderlingsPrison.patrols).map(Number);
    const reached = new Set();
    for (let turn = 0; turn < 180; turn += 1) {
        for (const id of patrolIds) {
            const actor = kd.KDMapData.Entities.find((enemy) => enemy.id === id);
            kd.KDAIType.hunt.beforemove(actor, {}, { canSensePlayer: false });
            if (actor.x === 36 && actor.y === 22) reached.add(id);
        }
    }
    assert.equal(reached.size, 2);
    assert.equal(r.moves.length > 80, true);
});

test("native lair admission keeps the Cocoon and creates a connected prison with bypasses", () => {
    const r = runtime();
    const nest = { id: 14, x: 15, y: 15, hp: 5, Enemy: { name: "NestEntrance" } };
    r.source.Entities.push(nest);
    assert.equal(r.context.Spiderlings.Prison.enter({ entrance: nest }), true);
    const map = r.context.KDMapData;
    const state = map.SpiderlingsPrison;
    assert.equal(r.context.Spiderlings.Prison.isPrison(), true);
    assert.equal(r.context.cocoon, r.cocoon);
    assert.deepEqual(
        { ...state.source },
        { room: "", mapMod: "SpiderlingsInfestation", faction: "Maidforce", mapX: 0, mapY: 3 },
    );
    assert.equal(map.Grid.split("\n")[22][51], "s");
    assert.equal(map.Tiles["51,22"].RoomType, "");
    const noNest = (point) => point.x >= 31 && point.x <= 41 && point.y >= 17 && point.y <= 27;
    assert.equal(reachable(map, noNest).has("51,22"), true, "main nest can be bypassed");
    assert.equal(
        reachable(map, (point) => noNest(point) || point.y <= 12).has("51,22"),
        true,
        "lower route remains open without the upper route",
    );
    assert.equal(
        reachable(map, (point) => noNest(point) || point.y >= 32).has("51,22"),
        true,
        "upper route remains open without the lower route",
    );
    assert.equal(reachable(map).has("36,22"), true);
    assert.equal(r.messages.includes("SpiderlingsPrisonArrival"), true);
});

test("native shortcut reuses the same prison after exit, save and recapture", () => {
    const r = runtime();
    const nest = { id: 14, x: 15, y: 15, hp: 5, Enemy: { name: "NestEntrance" } };
    r.source.Entities.push(nest);
    assert.equal(r.context.Spiderlings.Prison.enter({ entrance: nest }), true);
    const prisonId = r.context.KDGameData.RoomType;
    r.context.lastPrison = prisonId;
    const map = r.context.KDMapData;
    map.Entities.push({ id: 88, hp: 0, Enemy: { name: "NestEntrance" } });
    map.Tiles["35,22"] = { built: true };
    r.context.KinkyDungeonPlayerEntity.x = 46;
    r.context.KinkyDungeonPlayerEntity.y = 8;
    assert.equal(r.context.Spiderlings.Prison.recapture(), true);
    assert.equal(r.context.KinkyDungeonPlayerEntity.x, 11);
    assert.equal(r.context.KinkyDungeonPlayerEntity.y, 22);
    assert.equal(map.Entities.length, 1);
    assert.equal(map.Tiles["35,22"].built, true);
    r.context.KDGoThruTile(51, 22);
    assert.equal(r.context.KDGameData.RoomType, "");
    assert.equal(r.context.KDMapData.MapMod, "SpiderlingsInfestation");
    assert.equal(r.context.KinkyDungeonPlayerEntity.x, 14);
    const returnedNest = r.context.KDMapData.Entities.find((entity) => entity.id === 14);
    assert.equal(r.context.Spiderlings.Prison.enter({ entrance: returnedNest }), true);
    assert.equal(r.context.KDGameData.RoomType, prisonId);
    assert.equal(r.context.KDMapData.Entities.length, 1);
    assert.equal(r.context.KDMapData.Tiles["35,22"].built, true);
    assert.equal(r.slot.data[prisonId].Grid, r.context.KDMapData.Grid);
    r.context.KDMapData.Entities.push({ id: 99, x: 11, y: 22, hp: 5, Enemy: { name: "Spinner" } });
    r.context.KinkyDungeonPlayerEntity.x = 46;
    r.context.KinkyDungeonPlayerEntity.y = 8;
    assert.equal(r.context.Spiderlings.Prison.recapture(), true);
    assert.equal(r.context.KinkyDungeonPlayerEntity.x >= 8 && r.context.KinkyDungeonPlayerEntity.x <= 14, true);
    assert.equal(r.context.KinkyDungeonPlayerEntity.y >= 19 && r.context.KinkyDungeonPlayerEntity.y <= 25, true);
    assert.notDeepEqual([r.context.KinkyDungeonPlayerEntity.x, r.context.KinkyDungeonPlayerEntity.y], [11, 22]);
});

test("admission does not create a lair for a missing or blocked nest", () => {
    const r = runtime();
    const nest = { id: 14, x: 15, y: 15, hp: 5, Enemy: { name: "NestEntrance" } };
    assert.equal(r.context.Spiderlings.Prison.enter({ entrance: nest }), false);
    r.source.Entities.push(nest);
    for (let y = 12; y <= 18; y += 1) {
        for (let x = 12; x <= 18; x += 1) {
            if (x === nest.x && y === nest.y) continue;
            r.source.Tiles[`${x},${y}`] = { Type: "Protected" };
        }
    }
    assert.equal(r.context.Spiderlings.Prison.enter({ entrance: nest }), false);
    assert.deepEqual(Object.keys(r.slot.lairs || {}), []);
    assert.equal(r.source.PotentialEntrances.length, 0);
});
