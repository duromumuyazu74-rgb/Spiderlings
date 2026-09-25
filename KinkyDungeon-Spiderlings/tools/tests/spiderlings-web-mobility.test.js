"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modRoot = path.join(__dirname, "..", "..");

function fixture() {
    const web = new Set(),
        blocked = new Set(),
        context = {
            console,
            KDMapData: { Entities: [], Traffic: [] },
            KDGameData: { SleepTurns: 0 },
            KinkyDungeonPlayerEntity: { x: 40, y: 40, player: true },
            KinkyDungeonGetBuffedStat: () => 0,
            KinkyDungeonMultiplicativeStat: () => 1,
            KDBoundEffects: () => 0,
            KDEnemyCanSprint: () => false,
            KDDefaultEnemySprint: 2,
            KinkyDungeonLeashingEnemy: () => undefined,
            KinkyDungeonLastAction: "",
            KinkyDungeonMovableTilesEnemy: ".",
            KDGetDir: () => ({ x: 1, y: 0, delta: 1 }),
            KinkyDungeonMapGet: (x, y) =>
                x >= 0 && x < 40 && y >= 0 && y < 8 && !blocked.has(`${x},${y}`) ? "." : "1",
            KinkyDungeonTilesGet: () => undefined,
            KinkyDungeonEnemyAt(x, y) {
                return context.KDMapData.Entities.find((actor) => actor.x === x && actor.y === y);
            },
            KinkyDungeonEnemyTryMove(actor, _direction, delta, x, y) {
                actor.movePoints += delta;
                if (actor.movePoints < actor.Enemy.movePoints) return false;
                actor.movePoints -= actor.Enemy.movePoints;
                if (
                    blocked.has(`${x},${y}`) ||
                    context.KDMapData.Entities.some((other) => other !== actor && other.x === x && other.y === y)
                )
                    return false;
                actor.x = x;
                actor.y = y;
                return true;
            },
            KinkyDungeonFindPath() {
                return [{ native: true }];
            },
        };
    context.globalThis = context;
    vm.createContext(context);
    for (const file of ["SpiderlingsCore.js", "SpiderlingsWebMobility.js"])
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    context.Spiderlings.SpinnerNativeField = {
        state: () => ({ topology: {} }),
        isSpiderlingsWebCell: (cell) => web.has(`${cell.x},${cell.y}`),
        isOwnedProxy: (actor) => !!actor.proxy,
    };
    return { context, web, blocked };
}

function actor(id, tags, x = 1, y = 3) {
    return {
        id,
        x,
        y,
        hp: 10,
        movePoints: 0,
        attackPoints: 0,
        spellCooldown: 3,
        SpinnerConstructionPoints: 0,
        SpinnerWrapPoints: 0,
        Enemy: { tags, movePoints: 2 },
    };
}

function route(context, spider, start, end, taxicab = false) {
    return context.KinkyDungeonFindPath(
        start.x,
        start.y,
        end.x,
        end.y,
        true,
        true,
        false,
        ".",
        undefined,
        undefined,
        undefined,
        spider,
        false,
        undefined,
        taxicab,
    );
}

test("owned-web destinations yield 1.5x movement credit only to mobile tagged spiders", () => {
    const { context, web } = fixture(),
        spider = actor(1, { spiderlings: true }),
        nativeSpider = actor(2, { spider: true }, 1, 4),
        maid = actor(3, {}, 1, 5);
    for (let x = 2; x < 35; x++) for (const y of [3, 4, 5]) web.add(`${x},${y}`);
    for (let turn = 0; turn < 12; turn++)
        for (const moving of [spider, nativeSpider, maid]) {
            const x = moving.x + 1;
            context.KinkyDungeonEnemyTryMove(moving, { x: 1, y: 0, delta: 1 }, 1, x, moving.y, false);
        }
    assert.equal(spider.x - 1, 9);
    assert.equal(nativeSpider.x - 1, 9);
    assert.equal(maid.x - 1, 6);
    for (const moving of [spider, nativeSpider, maid]) {
        assert.equal(moving.attackPoints, 0);
        assert.equal(moving.spellCooldown, 3);
        assert.equal(moving.SpinnerConstructionPoints, 0);
        assert.equal(moving.SpinnerWrapPoints, 0);
    }
    const still = spider.movePoints;
    context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 0, spider.x + 1, spider.y, false);
    assert.equal(spider.movePoints, still);
});

test("blocked web steps earn no discount and ordinary departure pays ordinary cost", () => {
    const { context, web } = fixture(),
        spider = actor(1, { spiderlings: true });
    web.add("2,3");
    context.KDMapData.Entities.push(actor(2, {}, 2, 3));
    context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, 2, 3, false);
    assert.equal(spider.movePoints, 1);
    context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, 2, 3, false);
    assert.equal(spider.movePoints, 0);
    assert.equal(spider.x, 1);
    context.KDMapData.Entities = [];
    for (let turn = 0; turn < 2; turn++)
        context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, 2, 3, false);
    assert.equal(spider.x, 2);
    context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, 3, 3, false);
    assert.equal(spider.x, 2);
    assert.equal(spider.movePoints, 1);
    context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, 3, 3, false);
    assert.equal(spider.x, 3);
    assert.equal(spider.movePoints, 0);
});

test("unfinished web credit cannot pay a later ordinary destination", () => {
    const { context, web } = fixture(),
        spider = actor(1, { spiderlings: true });
    web.add("2,3");
    assert.equal(context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, 2, 3, false), false);
    assert.equal(spider.movePoints, 1.5);
    assert.equal(context.KinkyDungeonEnemyTryMove(spider, { x: 0, y: 1, delta: 1 }, 0.5, 1, 4, false), false);
    assert.equal(spider.movePoints, 1.5);
    assert.deepEqual({ x: spider.x, y: spider.y }, { x: 1, y: 3 });
});

test("breaking a pending web destination removes its credit immediately, including after reload", () => {
    const { context, web } = fixture(),
        spider = actor(1, { spiderlings: true });
    web.add("2,3");
    context.KDMapData.Entities.push(spider);
    context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, 2, 3, false);
    assert.equal(spider.movePoints, 1.5);
    const restored = JSON.parse(JSON.stringify(spider));
    context.KDMapData = { Entities: [restored], Traffic: [] };
    web.delete("2,3");
    context.Spiderlings.WebMobility.invalidateNavigation(true);
    assert.equal(restored.movePoints, 1);
    assert.equal(context.KinkyDungeonEnemyTryMove(restored, { x: 1, y: 0, delta: 1 }, 0.5, 2, 3, false), false);
    assert.equal(restored.movePoints, 1.5);
});

test("weighted spider path prefers a longer web route and invalidates on breakage, occupancy and reload", () => {
    const { context, web } = fixture(),
        hostile = actor(1, { spiderlings: true }),
        friendly = actor(2, { spider: true }, 1, 4),
        start = { x: 1, y: 3 },
        end = { x: 7, y: 3 };
    for (let x = 1; x <= 7; x++) web.add(`${x},2`);
    const preferred = route(context, hostile, start, end, true);
    assert.equal(preferred.length, 8);
    assert.ok(preferred.some((cell) => cell.y === 2));
    assert.equal(context.KDGetDir(hostile, end).y, -1);
    assert.deepEqual(Array.from(route(context, friendly, start, end, true)), Array.from(preferred));
    assert.deepEqual(Array.from(route(context, actor(3, {}), start, end, true)), [{ native: true }]);
    context.KDMapData.Entities.push(actor(4, {}, 4, 2));
    context.Spiderlings.WebMobility.invalidateNavigation();
    assert.ok(!route(context, hostile, start, end, true).some((cell) => cell.x === 4 && cell.y === 2));
    context.KDMapData.Entities = [];
    web.clear();
    context.KDMapData = { Entities: [], Traffic: [] };
    assert.equal(route(context, hostile, start, end, true).length, 6);
});

test("weighted spider routing does not cut between blocked diagonal corners", () => {
    const { context, web, blocked } = fixture(),
        spider = actor(1, { spiderlings: true }, 1, 1);
    web.add("2,2");
    blocked.add("2,1");
    blocked.add("1,2");
    const path = route(context, spider, spider, { x: 2, y: 2 });
    assert.ok(path?.length > 1);
    assert.notDeepEqual({ ...path[0] }, { x: 2, y: 2 });
});
