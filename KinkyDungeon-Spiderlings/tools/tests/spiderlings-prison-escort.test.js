"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "..", "SpiderlingsPrisonEscort.js"), "utf8");

function scenario(roll = 0, leashTurns = 1) {
    const cocoon = {
        id: 7,
        name: "SpiderlingsWebbingCocoon",
        data: { SpiderlingsCocoonOuterWebs: { anchored: true } },
    };
    const player = { x: 10, y: 10, player: true };
    const nest = { id: 2, x: 14, y: 10, hp: 12, Enemy: { name: "NestEntrance", immobile: true } };
    const spinner = { id: 3, x: 11, y: 10, hp: 2, Enemy: { name: "Spinner", movePoints: 1, attackPoints: 1 } };
    const map = {
        RoomType: "ordinary",
        mapX: 1,
        mapY: 2,
        GridWidth: 24,
        GridHeight: 24,
        StartPosition: { x: 2, y: 2 },
        EndPosition: { x: 21, y: 21 },
        Entities: [nest, spinner],
    };
    let nextId = 4;
    let leashed = false;
    let leashCalls = 0;
    let entryCount = 0;
    const events = {};
    const messages = [];
    const context = {
        Spiderlings: {
            WebbingData: { COCOON_ID: cocoon.name, COCOON_OUTER_STATE: "SpiderlingsCocoonOuterWebs" },
            Prison: {
                isPrison: () => false,
                enter: () => {
                    entryCount += 1;
                    return true;
                },
            },
            getMapPopulationCap: () => 25,
            availableSpiderlingSlots: () =>
                Math.max(
                    0,
                    context.Spiderlings.getMapPopulationCap() -
                        map.Entities.filter((actor) => actor.hp > 0 && actor.Enemy.name !== "NestEntrance").length,
                ),
        },
        KDGameData: {},
        KDMapData: map,
        KDCurrentWorldSlot: { x: 0, y: 0 },
        KinkyDungeonCurrentTick: 100,
        KinkyDungeonPlayerEntity: player,
        KinkyDungeonMovableTilesEnemy: "0",
        KinkyDungeonMovableTilesSmartEnemy: "0",
        KinkyDungeonAllRestraintDynamic: () => [{ item: cocoon }],
        KinkyDungeonMapGet: () => "0",
        KinkyDungeonTilesGet: () => undefined,
        KinkyDungeonEntityAt: (x, y) =>
            (player.x === x && player.y === y ? player : undefined) ||
            map.Entities.find((entity) => entity.hp > 0 && entity.x === x && entity.y === y),
        KinkyDungeonFindPath: (x, y, targetX, targetY) => {
            const route = [];
            while (x !== targetX || y !== targetY) {
                x += Math.sign(targetX - x);
                y += Math.sign(targetY - y);
                route.push({ x, y });
            }
            return route;
        },
        KinkyDungeonSummonEnemy: (x, y, name) => {
            const entity = {
                id: nextId++,
                x,
                y,
                hp: 2,
                Enemy: { name, movePoints: 1, attackPoints: 1, immobile: name === "NestEntrance" },
            };
            map.Entities.push(entity);
            return [entity];
        },
        KDRemoveEntity: (entity) => map.Entities.splice(map.Entities.indexOf(entity), 1),
        KDHostile: () => true,
        KDAllied: () => false,
        KDIsImprisoned: () => false,
        KDHelpless: () => false,
        KinkyDungeonIsDisabled: () => false,
        KinkyDungeonEnemyCanMove: () => true,
        KinkyDungeonEnemyTryMove: (enemy, direction, delta) => {
            enemy.movePoints = (enemy.movePoints || 0) + delta;
            if (enemy.movePoints < enemy.Enemy.movePoints) return false;
            enemy.movePoints -= enemy.Enemy.movePoints;
            enemy.x += direction.x;
            enemy.y += direction.y;
            return true;
        },
        KinkyDungeonLeashingEnemy: () => map.Entities.find((entity) => entity.id === player.leash?.entity),
        KDLeashReason: {},
        KDPlayerLeashed: () => leashed,
        KDTryToLeash: () => {
            leashCalls += 1;
            leashed = leashCalls >= leashTurns;
        },
        KinkyDungeonAttachTetherToEntity: (_length, enemy) => {
            player.leash = { entity: enemy.id };
        },
        KinkyDungeonGetRestraintItem: () => ({ id: 10 }),
        KDBreakTether: () => {
            delete player.leash;
        },
        KDRandom: () => roll,
        KinkyDungeonSendActionMessage: (_priority, message) => messages.push(message),
        TextGet: (key) => key,
        addTextKey: () => {},
        KDEventMapGeneric: {},
        KDAddEvent: (_map, trigger, type, handler) => {
            events[`${trigger}:${type}`] = handler;
        },
    };
    context.globalThis = context;
    vm.runInNewContext(source, context, { filename: "SpiderlingsPrisonEscort.js" });
    const escort = context.Spiderlings.PrisonEscort;
    return {
        context,
        map,
        player,
        cocoon,
        nest,
        spinner,
        escort,
        events,
        messages,
        entryCount: () => entryCount,
        turn(count = 1) {
            for (let i = 0; i < count; i += 1) {
                context.KinkyDungeonCurrentTick += 1;
                escort.tickAfter(null, { delta: 1 });
            }
        },
    };
}

test("only anchored Cocoon starts one saved 30–50 turn dispatch", () => {
    const ordinary = scenario();
    ordinary.cocoon.data.SpiderlingsCocoonOuterWebs.anchored = false;
    ordinary.escort.onAnchored(ordinary.cocoon);
    ordinary.turn(50);
    assert.equal(ordinary.escort.state(), undefined);

    const early = scenario(0);
    early.escort.onAnchored(early.cocoon);
    assert.equal(early.escort.state().deadline, 30);
    early.turn();
    assert.equal(early.escort.state().elapsed, 0);
    early.turn(29);
    assert.equal(early.escort.state().phase, "pending");
    early.turn();
    assert.equal(early.escort.state().elapsed, 30);
    assert.equal(early.escort.state().phase, "approach");
    assert.equal(early.escort.state().escortId, early.spinner.id);
    assert.equal(early.escort.state().entranceId, early.nest.id);
    assert.equal(early.messages.length, 1);

    const late = scenario(0.999999);
    late.escort.onAnchored(late.cocoon);
    assert.equal(late.escort.state().deadline, 50);
    late.turn();
    late.turn(49);
    assert.equal(late.escort.state().phase, "pending");
    late.turn();
    assert.equal(late.escort.state().phase, "approach");
});

test("save/load keeps deadline and escort identity without rerolling", () => {
    const current = scenario(0.5);
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(31);
    const saved = JSON.parse(JSON.stringify(current.context.KDGameData));
    const restored = scenario(0);
    restored.context.KDGameData = saved;
    restored.context.KinkyDungeonCurrentTick = current.context.KinkyDungeonCurrentTick;
    restored.events["afterLoadGame:SpiderlingsPrisonEscort"]();
    assert.equal(restored.escort.state().deadline, 40);
    assert.equal(restored.escort.state().elapsed, 31);
    restored.turn(9);
    assert.equal(restored.escort.state().phase, "approach");
});

test("escort keeps another NPC's tether and leaves the source map on interruption", () => {
    const current = scenario();
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.map.Entities.push({ id: 999, x: 9, y: 10, hp: 3, Enemy: { name: "Rival" } });
    current.player.leash = { entity: 999 };
    assert.equal(current.escort.handleEnemyTurn(current.spinner, current.player, 1), undefined);
    assert.equal(current.player.leash.entity, 999);
    delete current.player.leash;
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.player.leash.entity, current.spinner.id);
    assert.equal(current.context.KDLeashReason.SpiderlingsPrisonEscort(current.player), true);
    current.cocoon.data.SpiderlingsCocoonOuterWebs.anchored = false;
    assert.equal(current.context.KDLeashReason.SpiderlingsPrisonEscort(current.player), false);
    current.events["postRemoval:SpiderlingsPrisonEscort"]();
    assert.equal(current.player.leash, undefined);
    assert.equal(current.escort.state(), undefined);
    assert.equal(current.entryCount(), 0);
});

test("only the selected entrance admits the player after physical arrival", () => {
    const current = scenario();
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.entryCount(), 0);
    current.player.x = 13;
    current.player.y = 10;
    current.spinner.x = 13;
    current.spinner.y = 9;
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.entryCount(), 0);
    current.turn();
    assert.equal(current.entryCount(), 1);
    assert.equal(current.escort.state(), undefined);
});

test("escort approaches an occupied entrance without walking onto the player", () => {
    const current = scenario();
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    current.player.x = 13;
    current.spinner.x = 11;
    current.spinner.y = 10;
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.spinner.x, 12);
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.notDeepEqual({ x: current.spinner.x, y: current.spinner.y }, { x: current.player.x, y: current.player.y });
    assert.equal(
        Math.max(Math.abs(current.spinner.x - current.nest.x), Math.abs(current.spinner.y - current.nest.y)),
        1,
    );
    current.turn();
    assert.equal(current.entryCount(), 1);
});

test("a full population waits without replacing real Tunneler construction with a nest spawn", () => {
    const current = scenario();
    current.map.Entities.splice(current.map.Entities.indexOf(current.nest), 1);
    current.context.Spiderlings.getMapPopulationCap = () => 1;
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    const record = current.escort.state();
    assert.equal(record.phase, "pending");
    assert.equal(
        current.map.Entities.some((entity) => entity.Enemy.name === "NestEntrance"),
        false,
    );
    assert.equal(current.map.Entities.filter((entity) => entity.Enemy.name === "Spinner").length, 1);
});

test("fallback reuses a living Tunneler at capacity and survives interrupted paid travel", () => {
    const current = scenario();
    current.map.Entities.splice(current.map.Entities.indexOf(current.nest), 1);
    current.spinner.Enemy.name = "Tunneler";
    current.context.Spiderlings.getMapPopulationCap = () => 1;
    current.escort.onAnchored(current.cocoon);
    current.turn(31);
    assert.equal(current.escort.state().phase, "building");
    assert.equal(current.escort.state().builderId, current.spinner.id);
    assert.equal(current.map.Entities.length, 1);
    const initial = { x: current.spinner.x, y: current.spinner.y };
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.notDeepEqual({ x: current.spinner.x, y: current.spinner.y }, initial);
    const deadline = current.escort.state().deadline;
    current.spinner.hp = 0;
    current.turn();
    assert.equal(current.escort.state().deadline, deadline);
    assert.equal(
        current.map.Entities.some((actor) => actor.Enemy.name === "NestEntrance"),
        false,
    );
    current.cocoon.data.SpiderlingsCocoonOuterWebs.anchored = false;
    current.turn();
    assert.equal(current.escort.state(), undefined);
});

test("destroying the selected entrance makes the escort choose a new physical destination", () => {
    const current = scenario();
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.nest.hp = 0;
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.notEqual(current.escort.state().entranceId, current.nest.id);
    assert.equal(current.entryCount(), 0);
});

test("the escort pays native movement points on its route to the entrance", () => {
    const current = scenario();
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    current.spinner.Enemy.movePoints = 2;
    const start = { x: current.spinner.x, y: current.spinner.y };
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.deepEqual({ x: current.spinner.x, y: current.spinner.y }, start);
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.notDeepEqual({ x: current.spinner.x, y: current.spinner.y }, start);
    assert.equal(current.entryCount(), 0);
});

test("a leashed escort uses native-approved swaps through a crowded corridor", () => {
    const current = scenario();
    const c = current.context;
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    const blocker = { id: 50, x: 12, y: 10, hp: 1, Enemy: { name: "WebCaster" } };
    current.map.Entities.push(blocker);
    const findPath = c.KinkyDungeonFindPath;
    c.KinkyDungeonFindPath = (x, y, gx, gy, ...args) =>
        x === 11 && y === 10 && gx > 12
            ? [{ x: 12, y: 10 }, ...findPath(12, 10, gx, gy, ...args)]
            : findPath(x, y, gx, gy, ...args);
    const tryMove = c.KinkyDungeonEnemyTryMove;
    c.KinkyDungeonEnemyTryMove = (enemy, direction, delta) => {
        const previous = { x: enemy.x, y: enemy.y };
        const moved = tryMove(enemy, direction, delta);
        if (moved) Object.assign(blocker, previous);
        return moved;
    };
    c.KinkyDungeonEnemyCanMove = () => false;
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.spinner.x, 11);
    c.KinkyDungeonEnemyCanMove = () => true;
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.spinner.x, 12);
    assert.equal(blocker.x, 11);
    assert.equal(current.player.leash.entity, current.spinner.id);
});

test("native leash warning can advance on consecutive world turns", () => {
    const current = scenario(0, 6);
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    for (let i = 0; i < 5; i += 1) {
        current.escort.handleEnemyTurn(current.spinner, current.player, 1);
        assert.equal(current.player.leash, undefined);
    }
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.player.leash.entity, current.spinner.id);
    assert.equal(current.escort.state().phase, "escort");
});

test("carrier moves beyond tether range when a returned-floor entrance is two cells from the player", () => {
    const current = scenario();
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.nest.x = 4;
    current.nest.y = 5;
    current.spinner.x = 3;
    current.spinner.y = 5;
    current.player.x = 4;
    current.player.y = 7;
    current.player.leash = { entity: current.spinner.id, length: 2.5 };
    current.escort.state().phase = "escort";
    const move = current.context.KinkyDungeonEnemyTryMove;
    current.context.KinkyDungeonEnemyTryMove = (enemy, direction, delta) => {
        const moved = move(enemy, direction, delta);
        if (
            moved &&
            current.context.KinkyDungeonFindPath(current.player.x, current.player.y, enemy.x, enemy.y).length >
                current.player.leash.length
        ) {
            current.player.x += Math.sign(enemy.x - current.player.x);
            current.player.y += Math.sign(enemy.y - current.player.y);
        }
        return moved;
    };
    for (let i = 0; i < 5 && !current.entryCount(); i += 1) {
        current.escort.handleEnemyTurn(current.spinner, current.player, 1);
        current.turn();
    }
    assert.equal(current.entryCount(), 1);
    assert.equal(current.escort.state(), undefined);
});

test("carrier does not spawn a replacement nest after a partial native tug", () => {
    const current = scenario();
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(30);
    current.nest.x = 4;
    current.nest.y = 5;
    current.spinner.x = 3;
    current.spinner.y = 5;
    current.player.x = 4;
    current.player.y = 7;
    current.player.leash = { entity: current.spinner.id, length: 2.5 };
    current.escort.state().phase = "escort";
    current.context.KinkyDungeonMapGet = (x, y) => (x >= 3 && x <= 5 && y >= 5 ? "0" : "1");
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.escort.state().entranceId, current.nest.id);
    assert.equal(
        current.map.Entities.find((entity) => entity.id === current.escort.state().entranceId)?.SpiderlingsPrisonEntry,
        true,
    );
    assert.equal(current.player.leash.entity, current.spinner.id);
    assert.equal(current.entryCount(), 0);
});

function prisonScenario() {
    const current = scenario();
    const c = current.context;
    c.KDUpdateEnemyCache = false;
    c.KDGameData.RoomType = current.map.RoomType = "prison";
    current.map.SpiderlingsPrison = {
        version: 1,
        chamber: { x: 3, y: 3 },
        chamberBounds: { left: 2, top: 2, right: 4, bottom: 4 },
    };
    c.Spiderlings.SpinnerNativeField = { compositeById: () => undefined };
    c.KDGameData.SpiderlingsPrisonIdentity = { room: "prison", previous: "" };
    for (const file of ["SpiderlingsPrison.js", "SpiderlingsPrisonConstruction.js"])
        vm.runInContext(fs.readFileSync(path.join(__dirname, "../..", file), "utf8"), c, { filename: file });
    return current;
}

test("a prison corridor recapture waits for an interruptible escort and preserves the changed map", () => {
    const current = prisonScenario();
    const c = current.context;
    const construction = c.Spiderlings.PrisonConstruction;
    construction.onPlaced();
    construction.state().stay.phase = "left";
    current.map.SpiderlingsSpinnerEncounter = { topology: { retainedField: { hp: 2 } } };
    const existingField = current.map.SpiderlingsSpinnerEncounter;
    const destroyedNest = { id: 99, hp: 0, Enemy: { name: "NestEntrance" } };
    current.map.Entities.push(destroyedNest);
    current.escort.onAnchored(current.cocoon);
    current.turn();
    current.turn(29);
    assert.equal(current.escort.state()?.phase, "pending");
    assert.deepEqual([current.player.x, current.player.y], [10, 10]);
    current.turn();
    assert.equal(current.escort.state().phase, "approach");
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.player.leash.entity, current.spinner.id);
    assert.deepEqual([current.player.x, current.player.y], [10, 10]);

    // Native tether movement has brought both participants alongside the selected entrance.
    Object.assign(current.player, { x: 13, y: 10 });
    Object.assign(current.spinner, { x: 13, y: 9 });
    current.turn();
    assert.deepEqual([current.player.x, current.player.y], [3, 3]);
    assert.equal(current.player.leash, undefined);
    assert.equal(current.escort.state(), undefined);
    assert.equal(c.KDMapData, current.map);
    assert.equal(current.map.SpiderlingsSpinnerEncounter, existingField);
    assert.equal(current.map.Entities.includes(destroyedNest), true);
    assert.equal(destroyedNest.hp, 0);
    assert.equal(construction.state().placementOrdinal, 2);
    assert.equal(construction.state().stay.elapsed, 0);
    assert.equal(construction.state().stay.phase, "counting");
    current.turn(60);
    assert.equal(current.escort.state(), undefined, "remaining in the chamber must not dispatch another escort");
    assert.equal(construction.state().placementOrdinal, 2);
});

test("saved prison escorts keep their deadline and stop when anchoring is removed", () => {
    const current = prisonScenario();
    const c = current.context;
    current.escort.onAnchored(current.cocoon);
    current.turn(21);
    c.KDGameData = JSON.parse(JSON.stringify(c.KDGameData));
    current.events["afterLoadGame:SpiderlingsPrisonEscort"]();
    assert.equal(current.escort.state().deadline, 30);
    assert.equal(current.escort.state().elapsed, 20);
    current.turn(10);
    current.escort.handleEnemyTurn(current.spinner, current.player, 1);
    assert.equal(current.player.leash.entity, current.spinner.id);
    current.cocoon.data.SpiderlingsCocoonOuterWebs.anchored = false;
    current.turn();
    assert.equal(current.player.leash, undefined);
    assert.equal(current.escort.state(), undefined);
    assert.deepEqual([current.player.x, current.player.y], [10, 10]);
    assert.equal(c.KDMapData.SpiderlingsPrison.chamberConstruction, undefined);
});
