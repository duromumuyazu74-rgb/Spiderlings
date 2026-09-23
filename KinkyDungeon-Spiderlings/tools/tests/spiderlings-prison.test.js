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
