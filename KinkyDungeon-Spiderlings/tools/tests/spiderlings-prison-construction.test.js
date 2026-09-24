"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, load } = require("./helpers/spinner-native-runtime.js");

function setup() {
    const fixture = runtime();
    const c = fixture.context;
    const moves = [];
    c.KDMapData.GridWidth = 55;
    c.KDMapData.GridHeight = 45;
    c.KDMapData.StartPosition = { x: 11, y: 22 };
    c.KDMapData.EndPosition = { x: 51, y: 22 };
    c.KDMapData.ShortcutPositions = {};
    c.KDMapData.SpiderlingsPrison = {
        chamber: { x: 11, y: 22 },
        chamberBounds: { left: 8, right: 14, top: 19, bottom: 25 },
        workBounds: { left: 2, right: 20, top: 12, bottom: 32 },
        mainNest: { x: 36, y: 22 },
        mainNestIds: [81],
    };
    c.KDMapData.Entities.push(
        ...[1, 2, 3, 4].map((id) => ({
            id,
            x: 32 + id * 2,
            y: 18,
            hp: 10,
            buffs: {},
            Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
        })),
    );
    c.KinkyDungeonPlayerEntity.x = 11;
    c.KinkyDungeonPlayerEntity.y = 22;
    c.KinkyDungeonMapGet = (x, y) => (x > 0 && y > 0 && x < 54 && y < 44 ? "." : "1");
    c.KinkyDungeonFindPath = (x, y, tx, ty) =>
        x === tx && y === ty ? [] : [{ x: x + Math.sign(tx - x), y: y + Math.sign(ty - y) }];
    c.KinkyDungeonEnemyTryMove = (enemy, direction, delta, x, y) => {
        moves.push({ id: enemy.id, from: { x: enemy.x, y: enemy.y }, to: { x, y }, delta, direction });
        return c.KDMoveEntity(enemy, x, y);
    };
    c.Spiderlings.Prison = { isPrison: () => true };
    c.Spiderlings.getMapPopulationCap = () => 4;
    load(c, "SpiderlingsPrisonConstruction.js");
    const construction = c.Spiderlings.PrisonConstruction;
    const turn = (count = 1) => {
        for (let i = 0; i < count; i++) {
            c.KinkyDungeonCurrentTick++;
            construction.afterTurn(1);
        }
    };
    return { c, moves, construction, turn };
}

test("chamber placement counts 50 complete world turns and persists across save/load", () => {
    const { c, construction, turn } = setup();
    construction.onPlaced();
    construction.afterTurn(1);
    assert.equal(construction.state().stay.elapsed, 0);
    turn(49);
    assert.equal(construction.state().stay.phase, "counting");
    const saved = JSON.parse(JSON.stringify(c.KDMapData));
    c.KDMapData = saved;
    turn();
    assert.equal(construction.state().stay.elapsed, 50);
    assert.equal(construction.state().stay.phase, "triggered");
    assert.equal(construction.state().dispatches.length, 1);
    assert.equal(construction.state().dispatches[0].memberIds.length, 4);
    assert.ok(c.Spiderlings.SpinnerNativeField.compositeById(construction.COMPOSITE));
    construction.afterTurn(1);
    assert.equal(construction.state().dispatches.length, 1);
});

test("a Mage occupies the shared population slot before chamber builders are summoned", () => {
    const { c, construction, turn } = setup();
    c.KDMapData.Entities = c.KDMapData.Entities.filter((enemy) => enemy.id !== 4);
    c.KDMapData.Entities.push({ id: 5, x: 40, y: 18, hp: 10, Enemy: { name: "MageSpiderlings" } });
    construction.onPlaced();
    turn(50);
    assert.equal(construction.state().dispatches[0].memberIds.length, 0);
    assert.equal(c.KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "Spinner").length, 3);
});

test("leaving before threshold cancels that stay; recapture starts a fresh stay and retains fields", () => {
    const { c, construction, turn } = setup();
    construction.onPlaced();
    turn(49);
    c.KinkyDungeonPlayerEntity.x = 22;
    turn();
    assert.equal(construction.state().stay.phase, "left");
    c.KinkyDungeonPlayerEntity.x = 11;
    turn(60);
    assert.equal(construction.state().dispatches.length, 0);
    construction.onPlaced();
    turn(50);
    const field = c.Spiderlings.SpinnerNativeField.state().topology;
    assert.equal(field.composites[construction.COMPOSITE].layerIds.length, 1);
    c.KinkyDungeonPlayerEntity.x = 22;
    turn();
    assert.equal(construction.state().stay.phase, "left");
    const previous = JSON.stringify(field.composites[construction.COMPOSITE]);
    c.KinkyDungeonPlayerEntity.x = 11;
    construction.onPlaced();
    assert.equal(construction.state().stay.elapsed, 0);
    assert.equal(JSON.stringify(field.composites[construction.COMPOSITE]), previous);
});

test("chamber composite joins existing ordinary line graph and builders travel through paid native moves", () => {
    const { c, moves, construction, turn } = setup();
    const native = c.Spiderlings.SpinnerNativeField;
    native.addLine({
        fieldId: "ordinary-line",
        owners: [20, 21],
        anchors: [
            { x: 46, y: 5 },
            { x: 46, y: 7 },
        ],
    });
    construction.onPlaced();
    turn(50);
    const graph = native.state().topology;
    assert.ok(graph.lineFields["ordinary-line"]);
    assert.ok(graph.composites[construction.COMPOSITE]);
    assert.equal(graph.fieldId, "ordinary-line");
    const builder = c.KDMapData.Entities.find((enemy) => enemy.id === 1);
    const before = { x: builder.x, y: builder.y };
    const handled = construction.handleEnemyTurn(builder, c.KinkyDungeonPlayerEntity, 1);
    assert.ok(handled);
    assert.notDeepEqual({ x: builder.x, y: builder.y }, before);
    assert.ok(moves.some((move) => move.id === 1 && move.delta === 1));
    assert.equal(graph.actionLog.length, 0);
});

test("a live enemy on the native next step makes a chamber builder take another paid route", () => {
    const { c, moves, construction, turn } = setup();
    construction.onPlaced();
    turn(50);
    const worker = c.KDMapData.Entities.find((enemy) => enemy.id === 1);
    const action = c.Spiderlings.SpinnerTopology.nextWorkAction(
        c.Spiderlings.SpinnerNativeField.state().topology,
        worker.id,
        worker,
        [],
        construction.COMPOSITE,
    );
    const direct = {
        x: worker.x + Math.sign(action.cell.x - worker.x),
        y: worker.y + Math.sign(action.cell.y - worker.y),
    };
    c.KDMapData.Entities.push({ id: 90, ...direct, hp: 10, Enemy: { name: "WebCaster" } });
    c.KinkyDungeonFindPath = () => [direct];
    assert.ok(construction.handleEnemyTurn(worker, c.KinkyDungeonPlayerEntity, 1));
    assert.notDeepEqual({ x: worker.x, y: worker.y }, direct);
    assert.ok(moves.some((move) => move.id === worker.id));
});

test("a chamber builder pays for native passage through its sealed web", () => {
    const { c, moves, construction, turn } = setup();
    construction.onPlaced();
    turn(50);
    const worker = c.KDMapData.Entities.find((enemy) => enemy.id === 1);
    worker.x = 20;
    worker.y = 18;
    const graph = c.Spiderlings.SpinnerNativeField.state().topology;
    c.KDMapData.Entities.push({
        id: 90,
        x: 19,
        y: 18,
        hp: 2,
        Enemy: { name: c.Spiderlings.SpinnerNativeField.PROXY },
        SpiderlingsSpinnerProxy: { fieldId: graph.fieldId, cell: "19,18" },
    });
    c.KinkyDungeonMapGet = (x, y) => (y === 18 && x >= 15 && x <= 20 ? "." : "1");
    c.KinkyDungeonEnemyTryMove = (enemy, direction, delta, x, y) => {
        moves.push({ id: enemy.id, from: { x: enemy.x, y: enemy.y }, to: { x, y }, delta, direction });
        const proxy = c.KinkyDungeonEntityAt(x, y);
        if (proxy) {
            const crossed = c.Spiderlings.SpinnerNativeField.passThrough(enemy, proxy, c.KDMapData);
            if (crossed === 2) c.KDMoveEntity(enemy, enemy.x + direction.x, enemy.y + direction.y);
            return crossed;
        }
        return c.KDMoveEntity(enemy, x, y);
    };
    assert.ok(construction.handleEnemyTurn(worker, c.KinkyDungeonPlayerEntity, 1));
    assert.deepEqual({ x: worker.x, y: worker.y }, { x: 17, y: 18 });
    assert.deepEqual(moves.at(-1).to, { x: 19, y: 18 });
    assert.equal(moves.at(-1).delta, 1);
    worker.x = 20;
    c.KDMapData.Entities.push({ id: 91, x: 17, y: 18, hp: 10, Enemy: { name: "WebCaster" } });
    const proxy = c.KDMapData.Entities.find((enemy) => enemy.id === 90);
    assert.equal(c.Spiderlings.SpinnerNativeField.passThrough(worker, proxy, c.KDMapData), 0);
    assert.equal(worker.x, 20);
});

test("outer layers require closed previous work, preserve ordinary work, and have no artificial count limit", () => {
    const { c, construction, turn } = setup();
    const native = c.Spiderlings.SpinnerNativeField;
    construction.onPlaced();
    turn(50);
    const encounter = native.state();
    const first = encounter.topology.composites[construction.COMPOSITE].layerIds[0];
    assert.equal(construction.layer(3).vertices[0].x, -1);
    assert.equal(encounter.topology.fields[first].phase, "preparing");
    turn(10);
    assert.equal(encounter.topology.composites[construction.COMPOSITE].layerIds.length, 1);
    const state = c.Spiderlings.SpinnerTopology;
    c.KDMapData.SpiderlingsPrison.chamber = { x: 22, y: 22 };
    const map = { width: 55, height: 45, floor: [], protected: [], occupied: [] };
    for (let y = 1; y < 44; y++) for (let x = 1; x < 54; x++) map.floor.push(`${x},${y}`);
    const third = state.createEnclosure({
        compositeId: "larger-map",
        owners: [1, 2, 3, 4],
        layers: [construction.layer(0), construction.layer(1), construction.layer(2), construction.layer(3)],
        map,
        built: true,
    });
    assert.equal(third.composites["larger-map"].layerIds.length, 4);
});

test("paid chamber work closes three layers; the departed team repairs without extending", () => {
    const { c, construction, turn } = setup();
    const native = c.Spiderlings.SpinnerNativeField;
    const topology = c.Spiderlings.SpinnerTopology;
    construction.onPlaced();
    turn(50);
    const worker = c.KDMapData.Entities.find((enemy) => enemy.id === 1);
    for (let index = 0; index < 3; index++) {
        const fieldId = native.compositeById(construction.COMPOSITE).layerIds[index];
        let operations = 0;
        while (!topology.isLayerClosed(native.state().topology, fieldId) && operations < 200) {
            const action = topology.nextWorkAction(
                native.state().topology,
                worker.id,
                worker,
                [],
                construction.COMPOSITE,
            );
            assert.ok(action?.cell, `layer ${index} has pending work`);
            worker.x = action.cell.x + 1;
            worker.y = action.cell.y + 1;
            assert.equal(native.applyPaidAction(worker, { ...action, ownerId: worker.id }).applied, true);
            operations++;
        }
        assert.ok(operations > 0 && operations < 200, `layer ${index} needs paid work`);
        if (index < 2) {
            turn();
            assert.equal(native.compositeById(construction.COMPOSITE).layerIds.length, index + 2);
        }
    }
    c.KinkyDungeonPlayerEntity.x = 22;
    turn();
    assert.equal(construction.state().stay.phase, "left");
    turn(5);
    assert.equal(native.compositeById(construction.COMPOSITE).layerIds.length, 3);
    assert.equal(native.state().topology.actionLog.length > 100, true);
    const graph = native.state().topology;
    const damagedLink = graph.links.find(
        (link) =>
            link.owners.includes(graph.composites[construction.COMPOSITE].layerIds[0]) && link.builtCells.length > 1,
    );
    const cell = damagedLink.builtCells[0];
    const proxy = c.KDMapData.Entities.find(
        (enemy) => native.isOwnedProxy(enemy) && enemy.x === cell.x && enemy.y === cell.y,
    );
    assert.ok(proxy);
    assert.equal(native.onNativeDamage({ enemy: proxy, dmgDealt: 0.5 }), true);
    const repair = topology.nextWorkAction(native.state().topology, worker.id, worker, [], construction.COMPOSITE);
    assert.equal(repair.type, "repair");
    worker.x = repair.cell.x + 1;
    worker.y = repair.cell.y + 1;
    assert.ok(construction.handleEnemyTurn(worker, c.KinkyDungeonPlayerEntity, 1));
    assert.equal(native.state().topology.actionLog.at(-1).type, "repair");
    assert.equal(native.compositeById(construction.COMPOSITE).layerIds.length, 3);
});
