"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const layout = require("../../SpiderlingsHuntingGroundsLayout.js");

function fixture(size = 30, seed = 0.5, blocked = new Set()) {
    const grid = Array.from({ length: size }, () => Array(size).fill("1"));
    const start = { x: 1, y: 1 };
    const end = { x: size - 2, y: size - 2 };
    grid[start.y][start.x] = "0";
    grid[end.y][end.x] = "0";
    const get = (x, y) => grid[y]?.[x];
    const meta = (x, y) => (blocked.has(`${x},${y}`) ? { Type: "Quest" } : undefined);
    let writes = 0;
    const shaped = layout.shapeTerrain({
        width: size,
        height: size,
        tile: get,
        meta,
        set: (x, y, value) => {
            assert.equal(get(x, y), "1");
            grid[y][x] = value;
            writes += 1;
        },
        random: () => seed,
        start,
        end,
    });
    const plan =
        shaped &&
        layout.planEncounter({
            width: size,
            height: size,
            tile: get,
            meta,
            start,
            exits: [end],
            entities: [],
            spawnPoints: [],
            movable: "0",
            anchors: shaped.anchors,
            huntingSites: shaped.huntingSites,
            largeHuntingSite: shaped.largeHuntingSite,
        });
    return { grid, get, meta, start, end, shaped, plan, writes };
}

function footprint(center, radius) {
    const cells = [];
    for (let y = center.y - radius; y <= center.y + radius; y += 1)
        for (let x = center.x - radius; x <= center.x + radius; x += 1) cells.push(`${x},${y}`);
    return cells;
}

test("fixed seeds create a connected whole-floor hunting layout with three nest and three remote field sites", () => {
    for (const seed of [0, 0.5, 0.99]) {
        const map = fixture(30, seed);
        assert.ok(map.shaped, `seed ${seed}`);
        assert.ok(map.plan, `seed ${seed}`);
        assert.equal(map.writes, map.shaped.opened);
        assert.equal(map.plan.nests.length, 3);
        assert.equal(map.plan.sites.length, 3);
        assert.ok(map.plan.metrics.open > 200 && map.plan.metrics.open < 600);
        assert.equal(map.plan.metrics.reachable, map.plan.metrics.passable - 3);
        assert.ok(
            footprint(map.shaped.huntingSites[0], 4).every((name) => {
                const [x, y] = name.split(",").map(Number);
                return map.get(x, y) === "0";
            }),
            "One authored site opens enough natural terrain for a large outer ring",
        );
        for (const nest of map.plan.nests) {
            assert.ok(
                footprint(nest, 3).every((name) => {
                    const [x, y] = name.split(",").map(Number);
                    return map.get(x, y) === "0";
                }),
            );
            assert.ok(
                map.plan.nests.every(
                    (other) => other === nest || Math.max(Math.abs(other.x - nest.x), Math.abs(other.y - nest.y)) >= 9,
                ),
            );
        }
        for (const site of map.plan.sites) {
            assert.ok(
                map.plan.nests.every((nest) => Math.max(Math.abs(site.x - nest.x), Math.abs(site.y - nest.y)) > 5),
            );
            assert.ok(
                footprint(site, 1).every((name) => {
                    const [x, y] = name.split(",").map(Number);
                    return map.get(x, y) === "0";
                }),
            );
        }
        const cross = map.shaped.crossroad;
        assert.ok(
            footprint(cross, 1).every((name) => {
                const [x, y] = name.split(",").map(Number);
                return map.get(x, y) === "0";
            }),
        );
        const narrow = map.grid
            .slice(2, -2)
            .flatMap((row, y) => row.slice(2, -2).map((value, x) => ({ value, x: x + 2, y: y + 2 })))
            .filter(
                ({ value, x, y }) =>
                    value === "0" &&
                    [map.get(x - 1, y), map.get(x + 1, y), map.get(x, y - 1), map.get(x, y + 1)].filter(
                        (tile) => tile === "0",
                    ).length === 2,
            );
        assert.ok(narrow.length >= 3, `seed ${seed}: ${narrow.length} narrow cells`);
    }
});

test("the smallest supported fixture keeps three nests and distinct construction space", () => {
    const map = fixture(23);
    assert.ok(map.plan);
    assert.ok(map.plan.metrics.nestCandidates >= 3);
    assert.equal(map.plan.sites.length, 3);
    assert.equal(map.plan.metrics.reachable, map.plan.metrics.passable - 3);
});

test("the authored large field retains its complete footprint and identity through nest planning", () => {
    for (const size of [23, 28, 30, 44]) {
        const map = fixture(size),
            site = map.shaped.largeHuntingSite;
        assert.ok(site, `size ${size} retains a large site`);
        assert.deepEqual(map.plan.largeHuntingSite, site);
        assert.deepEqual(map.plan.sites[0], site);
        assert.ok(map.plan.nests.every((nest) => Math.max(Math.abs(nest.x - site.x), Math.abs(nest.y - site.y)) >= 9));
        assert.ok(
            footprint(site, 4).every((name) => {
                const [x, y] = name.split(",").map(Number);
                return map.get(x, y) === "0";
            }),
        );
    }
});

test("an unavailable large footprint retries without partial terrain and keeps the final safe fallback", () => {
    const size = 44,
        grid = Array.from({ length: size }, () => Array(size).fill("1")),
        planned = [];
    for (let y = 4; y < size - 4; y += 8)
        for (let x = 4; x < size - 4; x += 8) {
            planned.push({ x, y });
            grid[y][x] = "0";
        }
    grid[1][1] = grid[size - 2][size - 2] = "0";
    let writes = 0;
    const input = {
        width: size,
        height: size,
        tile: (x, y) => grid[y]?.[x],
        meta: () => undefined,
        set: (x, y, value) => {
            grid[y][x] = value;
            writes++;
        },
        random: () => 0.5,
        start: { x: 1, y: 1 },
        end: { x: size - 2, y: size - 2 },
        planned,
    };
    const diagnostics = {};
    assert.equal(layout.shapeTerrain({ ...input, diagnostics }), null);
    assert.equal(diagnostics.failure, "large-field-site");
    assert.equal(writes, 0);
    const fallback = layout.shapeTerrain({ ...input, fallback: true });
    assert.ok(fallback && fallback.anchors.length >= 3);
    assert.equal(fallback.largeHuntingSite, undefined);
    assert.ok(writes > 0);
});

test("an unavailable large preset preserves existing NPCs and the safe three-nest objective", () => {
    const map = fixture(30),
        site = map.shaped.largeHuntingSite,
        blocker = { x: site.x + 3, y: site.y, hp: 10, Enemy: { name: "Maidforce" } };
    for (const kind of ["npc", "preset"]) {
        const diagnostics = {},
            original = JSON.stringify(blocker);
        const plan = layout.planEncounter({
            width: 30,
            height: 30,
            tile: map.get,
            meta: map.meta,
            start: map.start,
            exits: [map.end],
            movable: "0",
            entities: kind === "npc" ? [blocker] : [],
            spawnPoints: kind === "preset" ? [blocker] : [],
            anchors: map.shaped.anchors,
            huntingSites: map.shaped.huntingSites,
            largeHuntingSite: site,
            diagnostics,
        });
        assert.ok(plan, kind);
        assert.equal(plan.presetSkipReason, "large-field-site");
        assert.equal(plan.largeHuntingSite, undefined);
        assert.equal(plan.nests.length, 3);
        assert.equal(plan.metrics.reachable, plan.metrics.passable - 3);
        assert.equal(JSON.stringify(blocker), original);
    }
});

test("optional large-site spacing cannot cancel an otherwise valid native nest plan", () => {
    const map = fixture(30),
        nativeNests = new Set(map.plan.nests.map((point) => `${point.x},${point.y}`)),
        site = map.plan.nests[0];
    const plan = layout.planEncounter({
        width: 30,
        height: 30,
        tile: map.get,
        meta: map.meta,
        start: map.start,
        exits: [map.end],
        movable: "0",
        entities: [],
        spawnPoints: [],
        anchors: map.shaped.anchors,
        huntingSites: map.shaped.huntingSites,
        largeHuntingSite: site,
        acceptNest: (point) => nativeNests.has(`${point.x},${point.y}`),
    });
    assert.ok(plan);
    assert.equal(plan.presetSkipReason, "large-field-site");
    assert.deepEqual(plan.nests, map.plan.nests);
    assert.equal(plan.metrics.reachable, plan.metrics.passable - 3);
});

test("a protected wall band leaves deliberate cardinal choke passages", () => {
    const blocked = new Set();
    for (let y = 1; y < 33; y += 1) if (y !== 10 && y !== 25) blocked.add(`17,${y}`);
    const map = fixture(34, 0.5, blocked);
    assert.ok(map.shaped);
    assert.ok(map.plan);
    for (const name of blocked) {
        const [x, y] = name.split(",").map(Number);
        assert.equal(map.get(x, y), "1", name);
    }
    assert.equal(map.get(17, 10), "0");
    assert.equal(map.get(17, 25), "0");
    assert.equal(map.plan.metrics.reachable, map.plan.metrics.passable - 3);
});

test("protected native metadata remains untouched and an alternate region hosts the third nest", () => {
    const marker = "7,8";
    const map = fixture(30, 0.5, new Set([marker]));
    assert.ok(map.plan);
    assert.equal(map.get(7, 8), "1");
    assert.ok(map.plan.nests.every((nest) => `${nest.x},${nest.y}` !== marker));
    const occupied = [
        ...map.shaped.anchors.map((anchor) => ({ x: anchor.x, y: anchor.y, hp: 10, Enemy: { immobile: true } })),
    ];
    const rejected = layout.planEncounter({
        width: 30,
        height: 30,
        tile: map.get,
        meta: map.meta,
        start: map.start,
        exits: [map.end],
        entities: occupied,
        spawnPoints: [],
        movable: "0",
        anchors: map.shaped.anchors,
    });
    assert.equal(rejected, null);
});

test("failed supported and undersized layouts publish no partial terrain", () => {
    const blocked = new Set();
    for (let y = 1; y < 29; y += 1) for (let x = 5; x < 29; x += 5) blocked.add(`${x},${y}`);
    const failed = fixture(30, 0.5, blocked);
    assert.equal(failed.shaped, null);
    assert.equal(failed.writes, 0);
    const small = fixture(22);
    assert.equal(small.shaped, null);
    assert.equal(small.writes, 0);
});

test("native TileMaze wrapper runs after terrain creation and only on new Infestation maps", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsHuntingGroundsLayout.js"), "utf8");
    const calls = [];
    const context = {
        Spiderlings: {},
        KDMapData: {
            MapMod: "SpiderlingsHuntingGrounds",
            RoomType: "",
            GridWidth: 30,
            GridHeight: 30,
            Tiles: {},
            StartPosition: { x: 1, y: 1 },
            EndPosition: { x: 28, y: 28 },
        },
        KinkyDungeonCreateMapGenType: {
            TileMaze() {
                calls.push("native");
            },
        },
        KinkyDungeonPlaceShrines() {},
        KinkyDungeonPlaceChargers() {},
        KinkyDungeonPlaceSetPieces() {},
        KinkyDungeonMapGet: () => "0",
        KinkyDungeonTilesGet(name) {
            return context.KDMapData.Tiles[name];
        },
        KinkyDungeonTilesSet(name, data) {
            context.KDMapData.Tiles[name] = data;
        },
        KinkyDungeonMapSet: () => calls.push("layout"),
        KinkyDungeonGenNavMap: () => calls.push("nav"),
        KDRandom: () => 0.5,
    };
    vm.createContext(context);
    vm.runInContext(source, context);
    const wrapped = [
        context.KinkyDungeonCreateMapGenType.TileMaze,
        context.KinkyDungeonPlaceShrines,
        context.KinkyDungeonPlaceChargers,
        context.KinkyDungeonPlaceSetPieces,
    ];
    const originalLayout = context.Spiderlings.HuntingGroundsLayout;
    vm.runInContext(source, context);
    assert.equal(context.Spiderlings.HuntingGroundsLayout, originalLayout);
    context.Spiderlings.HuntingGroundsLayout.register();
    assert.deepEqual(
        [
            context.KinkyDungeonCreateMapGenType.TileMaze,
            context.KinkyDungeonPlaceShrines,
            context.KinkyDungeonPlaceChargers,
            context.KinkyDungeonPlaceSetPieces,
        ],
        wrapped,
        "re-registering must not wrap native placement passes twice",
    );
    context.KinkyDungeonCreateMapGenType.TileMaze();
    assert.equal(calls[0], "native");
    assert.ok(context.Spiderlings.HuntingGroundsLayout.earlyPlan(context.KDMapData));
    assert.ok(Object.keys(context.KDMapData.Tiles).length > 0);
    context.Spiderlings.HuntingGroundsLayout.release(context.KDMapData);
    assert.equal(Object.keys(context.KDMapData.Tiles).length, 0);
    assert.equal(calls.at(-1), "nav");
    context.KDMapData = { ...context.KDMapData, MapMod: "None" };
    context.KinkyDungeonCreateMapGenType.TileMaze();
    assert.equal(context.Spiderlings.HuntingGroundsLayout.earlyPlan(context.KDMapData), undefined);
});

test("only new Hunting random births reserve future rings, preserving authored actors and restoring metadata", () => {
    const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsHuntingGroundsLayout.js"), "utf8"),
        authored = { id: 1, x: 13, y: 10, Enemy: { name: "QuestNPC" } },
        map = {
            MapMod: "SpiderlingsHuntingGrounds",
            Entities: [authored],
            Tiles: { "12,10": { Skin: "Brick" }, "12,11": { Type: "Quest" }, "10,13": { OL: true, Type: "Shrine" } },
        },
        context = {
            Spiderlings: {},
            KDMapData: map,
            KinkyDungeonMapGet: () => "0",
            KinkyDungeonTilesGet: (name) => map.Tiles[name],
            KinkyDungeonTilesSet: (name, value) => (map.Tiles[name] = value),
            KinkyDungeonGenNavMap() {},
        };
    vm.createContext(context);
    vm.runInContext(source, context);
    const api = context.Spiderlings.HuntingGroundsLayout,
        before = JSON.stringify(authored);
    assert.equal(api.reservePopulationBoundary(map, { x: 10, y: 10 }), 70);
    assert.equal(map.Tiles["12,10"].OL, true);
    assert.equal(map.Tiles["12,10"].Skin, "Brick");
    assert.equal(map.Tiles["10,10"], undefined, "the common core remains available to population");
    assert.equal(map.Tiles["12,11"].SpiderlingsLayoutReserve, undefined, "authored terrain is never claimed");
    assert.equal(JSON.stringify(authored), before, "native preset actors are never moved or removed");
    api.release(map);
    assert.deepEqual(JSON.parse(JSON.stringify(map.Tiles)), {
        "12,10": { Skin: "Brick" },
        "12,11": { Type: "Quest" },
        "10,13": { OL: true, Type: "Shrine" },
    });
    assert.equal(
        api.reservePopulationBoundary({ ...map }, { x: 10, y: 10 }),
        0,
        "saved or other maps are not rewritten",
    );
    map.MapMod = "SpiderlingsInfestation";
    assert.equal(api.reservePopulationBoundary(map, { x: 10, y: 10 }), 0);
});
