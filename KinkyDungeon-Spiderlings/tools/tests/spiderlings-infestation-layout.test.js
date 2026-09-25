"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const layout = require("../../SpiderlingsInfestationLayout.js");

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
    const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsInfestationLayout.js"), "utf8");
    const calls = [];
    const context = {
        Spiderlings: {},
        KDMapData: {
            MapMod: "SpiderlingsInfestation",
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
    const originalLayout = context.Spiderlings.InfestationLayout;
    vm.runInContext(source, context);
    assert.equal(context.Spiderlings.InfestationLayout, originalLayout);
    context.Spiderlings.InfestationLayout.register();
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
    assert.ok(context.Spiderlings.InfestationLayout.earlyPlan(context.KDMapData));
    assert.ok(Object.keys(context.KDMapData.Tiles).length > 0);
    context.Spiderlings.InfestationLayout.release(context.KDMapData);
    assert.equal(Object.keys(context.KDMapData.Tiles).length, 0);
    assert.equal(calls.at(-1), "nav");
    context.KDMapData = { ...context.KDMapData, MapMod: "None" };
    context.KinkyDungeonCreateMapGenType.TileMaze();
    assert.equal(context.Spiderlings.InfestationLayout.earlyPlan(context.KDMapData), undefined);
});
