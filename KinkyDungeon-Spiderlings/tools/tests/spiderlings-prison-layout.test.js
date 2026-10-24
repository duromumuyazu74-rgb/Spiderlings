"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./helpers/lifecycle-runtime.js");
const pointKey = (point) => `${point.x},${point.y}`;
const movable = "023wW][?/HB@l;SsRrdzTgLcNVvt5";

function generatedPrison() {
    const messages = [];
    const context = {
        Spiderlings: {},
        alts: {},
        KinkyDungeonCreateMapGenType: {},
        KDGameData: { RoomType: "layout-fixture" },
        KDPersonalAlt: {
            "layout-fixture": { data: { SpiderlingsPrisonSource: { room: "source", mapMod: "", faction: "Enemy" } } },
        },
        KDMapData: { RoomType: "layout-fixture", Labels: {}, Tiles: {}, TilesSkin: {}, Entities: [] },
        KinkyDungeonPlayerEntity: { x: 14, y: 32 },
        KDRandom: () => 0.3,
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
        TextGet: (key) => key,
        KinkyDungeonSendTextMessage(_priority, message) {
            messages.push(message);
        },
    };
    context.globalThis = context;
    vm.createContext(context);
    for (const file of [
        "SpiderlingsPrisonLayout.js",
        "SpiderlingsSpinnerTopology.js",
        "SpiderlingsPrison.js",
        "SpiderlingsPrisonAlerts.js",
    ])
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    context.KinkyDungeonCreateMapGenType.SpiderlingsNestPrison([], [{ x: 0, y: 0 }]);
    const map = context.KDMapData;
    const floor = [],
        protectedCells = [];
    for (let y = 0; y < map.GridHeight; y++)
        for (let x = 0; x < map.GridWidth; x++) {
            const key = `${x},${y}`;
            if (movable.includes(context.KinkyDungeonMapGet(x, y))) floor.push(key);
            if (map.Tiles[key]?.Type === "Chest") protectedCells.push(key);
        }
    protectedCells.push(pointKey(map.StartPosition), pointKey(map.EndPosition));
    return {
        context,
        map,
        floor,
        messages,
        topology: context.Spiderlings.SpinnerTopology,
        snapshot: {
            width: map.GridWidth,
            height: map.GridHeight,
            floor,
            protected: protectedCells,
            occupied: [],
            exit: map.EndPosition,
        },
    };
}

function pathExists(floor, from, to, blocked = new Set()) {
    const allowed = new Set(floor);
    if (!allowed.has(pointKey(from)) || !allowed.has(pointKey(to))) return false;
    const queue = [from],
        seen = new Set([pointKey(from)]);
    for (let n = 0; n < queue.length; n++) {
        const point = queue[n];
        if (pointKey(point) === pointKey(to)) return true;
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const next = { x: point.x + dx, y: point.y + dy },
                    key = pointKey(next);
                if (!allowed.has(key) || blocked.has(key) || seen.has(key)) continue;
                seen.add(key);
                queue.push(next);
            }
    }
    return false;
}

test("the fixed native prison keeps three approaches, protected chamber work and a mandatory dangerous exit", () => {
    const r = generatedPrison(),
        prison = r.map.SpiderlingsPrison;
    assert.equal(r.map.GridWidth, 81);
    assert.equal(r.map.GridHeight, 63);
    assert.equal(prison.layoutVersion, 2);
    assert.equal(pathExists(r.floor, prison.chamber, prison.exit), true);
    for (let y = 22; y <= 42; y++)
        for (let x = 5; x <= 23; x++)
            assert.equal(r.context.KinkyDungeonMapGet(x, y), "0", `Construction reserve ${x},${y}`);
    for (const point of [
        { x: 39, y: 12 },
        { x: 34, y: 32 },
        { x: 40, y: 52 },
    ]) {
        assert.equal(pathExists(r.floor, prison.chamber, point), true);
        assert.equal(pathExists(r.floor, point, prison.exit), true);
    }
    const hub = new Set();
    for (let y = 30; y <= 34; y++) for (let x = 68; x <= 72; x++) hub.add(`${x},${y}`);
    assert.equal(pathExists(r.floor, prison.chamber, prison.exit, hub), false);
    assert.equal(r.map.Tiles[pointKey(prison.exit)].RoomType, "source");
});

test("all six authored fields pass the actual topology validator and close every arm through paid work", () => {
    const r = generatedPrison();
    assert.equal(r.map.SpiderlingsPrison.fieldSites.length, 6);
    for (const site of r.map.SpiderlingsPrison.fieldSites) {
        const { left, top, right, bottom } = site.bounds;
        const vertices = [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom },
        ];
        const gate = { x: right, y: site.center.y };
        let state = r.topology.createEnclosure({
            compositeId: site.id,
            owners: [1, 2],
            map: r.snapshot,
            layers: [{ id: site.id, vertices, core: site.center, gate }],
            autoSeal: true,
        });
        assert.equal(state.kind, "enclosure", `${site.id}: ${state.reason}`);
        assert.equal(r.topology.captureGeometryReady(state, site.id, site.center), false);
        let actions = 0;
        for (; actions < 512; actions++) {
            const ownerId = (actions % 2) + 1;
            const action = r.topology.nextWorkAction(state, ownerId, site.center);
            if (!action) break;
            state = r.topology.applyAction(
                state,
                { ...action, ownerId },
                {
                    cell: action.cell,
                    inBounds: true,
                    floor: r.floor.includes(pointKey(action.cell)),
                    protected: false,
                    occupied: false,
                },
            ).state;
        }
        assert.ok(actions > 0 && actions < 512, site.id);
        assert.equal(r.topology.captureGeometryReady(state, site.id, site.center), true, site.id);
        const blocked = new Set(r.topology.solidCells(state).map(pointKey));
        const outside = [
            { x: left - 1, y: site.center.y },
            { x: right + 1, y: site.center.y },
        ];
        if (site.id !== "storage") outside.push({ x: site.center.x, y: top - 1 }, { x: site.center.x, y: bottom + 1 });
        for (const point of outside) {
            assert.equal(pathExists(r.floor, site.center, point), true, `${site.id}: open arm`);
            assert.equal(pathExists(r.floor, site.center, point, blocked), false, `${site.id}: sealed arm`);
        }
    }
});

test("native barrels, empty storage props and reachable chests leave field geometry intact", () => {
    const r = generatedPrison(),
        prison = r.map.SpiderlingsPrison;
    assert.ok(r.map.Grid.includes("L"));
    assert.ok(r.map.Grid.includes("c"));
    const chests = Object.entries(r.map.Tiles).filter(([, tile]) => tile.Type === "Chest");
    assert.ok(chests.length >= 5);
    for (const [key, tile] of chests) {
        const [x, y] = key.split(",").map(Number);
        assert.equal(tile.Loot, "storage");
        assert.equal(tile.NoTrap, true);
        assert.equal(
            [
                [-1, 0],
                [1, 0],
                [0, -1],
                [0, 1],
            ].some(([dx, dy]) => pathExists(r.floor, prison.chamber, { x: x + dx, y: y + dy })),
            true,
            key,
        );
        assert.equal(
            prison.fieldSites.some(({ bounds: b }) => x >= b.left && x <= b.right && y >= b.top && y <= b.bottom),
            false,
            key,
        );
    }
});

test("every generated walkable cell retains regional command, including both western approach connectors", () => {
    const r = generatedPrison();
    const allowed = new Set(["chamber", "upper", "lower", "crossroads", "main-nest", "outer-exit"]);
    for (const key of r.floor) {
        const [x, y] = key.split(",").map(Number);
        assert.equal(allowed.has(r.context.Spiderlings.PrisonAlerts.regionAt({ x, y })), true, key);
    }
    assert.equal(r.context.Spiderlings.PrisonAlerts.regionAt({ x: 22, y: 12 }), "chamber");
    assert.equal(r.context.Spiderlings.PrisonAlerts.regionAt({ x: 22, y: 51 }), "chamber");
});
