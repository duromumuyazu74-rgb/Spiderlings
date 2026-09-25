"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { gamePath } = require("../reference-inputs.js");

const modRoot = path.join(__dirname, "../..");
const nativeSource = fs.readFileSync(gamePath("Game/src/enemy/KinkyDungeonEnemies.ts"), "utf8");
const start = nativeSource.indexOf("function KinkyDungeonEnemyTryMove (");
const end = nativeSource.indexOf("function KinkyDungeonEnemyTryAttack (", start);
assert.ok(start >= 0 && end > start, "pinned native movement seam");

test("pinned KD 5.5.0 TryMove pays fractional web steps through live proxies without action acceleration", () => {
    const web = new Set(),
        proxy = (x, y) => ({ x, y, hp: 2, Enemy: { pathcondition: "SpiderlingsWebTraversal", tags: {} } }),
        context = {
            console,
            KDMapData: { Entities: [] },
            KDGameData: { SleepTurns: 0 },
            KinkyDungeonPlayerEntity: { x: 40, y: 40 },
            KinkyDungeonLastAction: "",
            KinkyDungeonGetBuffedStat: () => 0,
            KinkyDungeonMultiplicativeStat: () => 1,
            KDBoundEffects: () => 0,
            KDEnemyCanSprint: () => false,
            KinkyDungeonLeashingEnemy: () => undefined,
            KinkyDungeonMapGet: () => ".",
            KinkyDungeonSetEnemyFlag() {},
            KinkyDungeonEnemyAt(x, y) {
                return web.has(`${x},${y}`) ? proxy(x, y) : undefined;
            },
            KinkyDungeonEntityAt(x, y) {
                return context.KinkyDungeonPlayerEntity.x === x && context.KinkyDungeonPlayerEntity.y === y
                    ? context.KinkyDungeonPlayerEntity
                    : undefined;
            },
            KinkyDungeonCanSwapWith(webCell, actor) {
                return context.KDPathConditions[webCell.Enemy.pathcondition]?.query(actor, webCell) || false;
            },
            KDMoveEntity(actor, x, y) {
                actor.x = x;
                actor.y = y;
                return true;
            },
            KDPathConditions: {
                SpiderlingsWebTraversal: {
                    query: (actor) => actor.Enemy.tags.spiderlings === true,
                    doPassthrough(actor, webCell) {
                        if (
                            context.KDMapData.Entities.some(
                                (other) => other !== actor && other.x === webCell.x && other.y === webCell.y,
                            )
                        )
                            return 0;
                        actor.x = webCell.x;
                        actor.y = webCell.y;
                        return 2;
                    },
                },
            },
        };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(stripTypeScriptTypes(nativeSource.slice(start, end)), context);
    for (const file of ["SpiderlingsCore.js", "SpiderlingsWebMobility.js"])
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    context.Spiderlings.SpinnerNativeField = {
        state: () => ({ topology: {} }),
        isSpiderlingsWebCell: (cell) => web.has(`${cell.x},${cell.y}`),
        isOwnedProxy: () => false,
    };
    const spider = {
            id: 1,
            x: 1,
            y: 3,
            hp: 10,
            movePoints: 0,
            attackPoints: 0,
            spellCooldown: 3,
            SpinnerConstructionPoints: 0,
            SpinnerWrapPoints: 0,
            Enemy: { tags: { spiderlings: true }, movePoints: 2 },
        },
        control = { ...spider, id: 2, y: 4, movePoints: 0 };
    context.KDMapData.Entities.push(spider, control);
    for (let x = 2; x < 30; x++) web.add(`${x},3`);
    for (let turn = 0; turn < 12; turn++)
        for (const actor of [spider, control])
            context.KinkyDungeonEnemyTryMove(actor, { x: 1, y: 0, delta: 1 }, 1, actor.x + 1, actor.y, false);
    assert.equal(spider.x - 1, 9);
    assert.equal(control.x - 1, 6);
    assert.equal(spider.attackPoints, control.attackPoints);
    assert.equal(spider.spellCooldown, control.spellCooldown);
    assert.equal(spider.SpinnerConstructionPoints, control.SpinnerConstructionPoints);
    assert.equal(spider.SpinnerWrapPoints, control.SpinnerWrapPoints);
    web.delete(`${spider.x + 1},3`);
    const prior = spider.movePoints;
    context.KinkyDungeonEnemyTryMove(spider, { x: 1, y: 0, delta: 1 }, 1, spider.x + 1, 3, false);
    assert.equal(spider.movePoints, prior + 1);

    const pending = { id: 3, x: 1, y: 5, hp: 10, movePoints: 0, Enemy: { tags: { spiderlings: true }, movePoints: 2 } };
    context.KDMapData.Entities.push(pending);
    web.add("2,5");
    assert.equal(context.KinkyDungeonEnemyTryMove(pending, { x: 1, y: 0, delta: 1 }, 1, 2, 5, false), false);
    assert.equal(pending.movePoints, 1.5);
    assert.equal(context.KinkyDungeonEnemyTryMove(pending, { x: 0, y: 1, delta: 1 }, 0.5, 1, 6, false), false);
    assert.equal(pending.movePoints, 1.5);
    web.add("2,6");
    const broken = { id: 4, x: 1, y: 6, hp: 10, movePoints: 0, Enemy: { tags: { spiderlings: true }, movePoints: 2 } };
    context.KDMapData.Entities.push(broken);
    context.KinkyDungeonEnemyTryMove(broken, { x: 1, y: 0, delta: 1 }, 1, 2, 6, false);
    assert.equal(broken.movePoints, 1.5);
    web.delete("2,6");
    context.Spiderlings.WebMobility.invalidateNavigation(true);
    assert.equal(broken.movePoints, 1);
});
