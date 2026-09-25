"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./helpers/lifecycle-runtime.js");

function rules() {
    const context = { Spiderlings: {} };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerTopology.js"), "utf8"), context);
    return context.Spiderlings.SpinnerTopology;
}

const floorMap = (width = 31, height = 21) => ({
    width,
    height,
    floor: Array.from({ length: height - 2 }, (_, y) =>
        Array.from({ length: width - 2 }, (_value, x) => `${x + 1},${y + 1}`),
    ).flat(),
    protected: ["2,10", "28,10"],
    occupied: [],
    exit: { x: 28, y: 10 },
});
const rectangle = (left, top, right, bottom) => [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
];

test("declared regular and concave enclosures preserve a free 3x3 core", () => {
    const topology = rules(),
        regular = topology.createEnclosure({
            compositeId: "regular",
            groupId: "g",
            owners: [1, 2],
            map: floorMap(),
            layers: [{ id: "inner", vertices: rectangle(20, 5, 24, 13), gate: { x: 20, y: 9 } }],
        }),
        concave = topology.createEnclosure({
            compositeId: "concave",
            groupId: "g",
            owners: [1, 2],
            map: floorMap(),
            layers: [
                {
                    id: "inner",
                    vertices: [
                        { x: 15, y: 5 },
                        { x: 22, y: 5 },
                        { x: 22, y: 12 },
                        { x: 20, y: 12 },
                        { x: 20, y: 10 },
                        { x: 15, y: 10 },
                    ],
                    gate: { x: 15, y: 7 },
                    core: { x: 18, y: 8 },
                },
            ],
        });
    assert.equal(regular.kind, "enclosure");
    assert.deepEqual(JSON.parse(JSON.stringify(regular.composites.regular.core)), { x: 22, y: 9 });
    assert.equal(regular.fields.inner.interiorCells.length, 21);
    assert.equal(concave.kind, "enclosure");
    assert.equal(topology.containsDeclaredField(concave, "inner", { x: 18, y: 8 }), true);
    assert.equal(topology.containsDeclaredField(concave, "inner", { x: 18, y: 11 }), false);
});

test("one owner may build concentric 3x3, 5x5 and 7x7 outer rings", () => {
    const topology = rules(),
        one = topology.createEnclosure({
            compositeId: "one",
            groupId: "g",
            owners: [1],
            map: floorMap(),
            layers: [
                { id: "inner", vertices: rectangle(12, 8, 14, 10), gate: { x: 12, y: 9 } },
                { id: "middle", vertices: rectangle(11, 7, 15, 11), gate: { x: 11, y: 9 } },
                { id: "outer", vertices: rectangle(10, 6, 16, 12), gate: { x: 10, y: 9 } },
            ],
        });
    assert.deepEqual(Object.keys(one.fields), ["inner", "middle", "outer"]);
    assert.equal(one.fields.inner.interiorCells.length, 1);
    assert.deepEqual(one.fields.inner.core, one.fields.outer.core);
    assert.deepEqual(
        Object.values(one.fields).map((field) => field.bounds.width),
        [3, 5, 7],
    );
    assert.equal(one.fields.outer.spacing, 1);
});

test("a boundary actor blocks a site while an interior prey actor does not", () => {
    const topology = rules(),
        input = {
            compositeId: "occupancy",
            owners: [1],
            layers: [{ id: "inner", vertices: rectangle(12, 9, 14, 11), gate: { x: 12, y: 10 } }],
        };
    assert.equal(topology.createEnclosure({ ...input, map: { ...floorMap(), occupied: ["12,9"] } }).reason, "occupied");
    assert.equal(topology.createEnclosure({ ...input, map: { ...floorMap(), occupied: ["13,10"] } }).kind, "enclosure");
});

test("a lone builder pays for a sealed 3x3 ring before adding an independent 5x5 ring", () => {
    const topology = rules(),
        map = floorMap(),
        clear = (cell) => ({ cell, inBounds: true, floor: true, protected: false, occupied: false }),
        layer = { id: "outer", vertices: rectangle(11, 8, 15, 12), gate: { x: 11, y: 10 } };
    let state = topology.createEnclosure({
        compositeId: "lone",
        owners: [1],
        map,
        autoSeal: true,
        layers: [{ id: "inner", vertices: rectangle(12, 9, 14, 11), gate: { x: 12, y: 10 } }],
    });
    assert.equal(topology.addEnclosureLayer(state, { compositeId: "lone", layer, map }).reason, "inner");
    let action;
    let work = 0;
    while ((action = topology.nextWorkAction(state, 1, { x: 13, y: 10 })) && work++ < 20) {
        const applied = topology.applyAction(state, { ...action, ownerId: 1 }, clear(action.cell));
        assert.equal(applied.outcome.legal, true);
        state = applied.state;
    }
    assert.equal(work, 9);
    assert.equal(state.fields.inner.phase, "sealed");
    assert.equal(topology.solidCells(state).length, 8);
    const addition = topology.addEnclosureLayer(state, { compositeId: "lone", layer, map });
    assert.equal(addition.added, true);
    state = addition.state;
    assert.equal(state.fields.inner.phase, "sealed");
    assert.equal(state.fields.outer.phase, "preparing");
    assert.equal(topology.captureGeometryReady(state, "lone", { x: 13, y: 10 }), true);
    assert.equal(topology.captureGeometryReady(state, "lone", { x: 12, y: 10 }), false);
    action = topology.nextWorkAction(state, 1, { x: 13, y: 10 });
    assert.equal(action.fieldId, "outer");
    state = topology.applyAction(state, { ...action, ownerId: 1 }, clear(action.cell)).state;
    const restored = topology.restore(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.fields.inner.phase, "sealed");
    assert.equal(restored.fields.outer.phase, "preparing");
    assert.equal(topology.tickOwnerless(restored, { activeOwnerIds: [], delta: 20 }).state.collapsed, true);
});

test("an intact corner cannot be crossed diagonally into a 3x3 interior", () => {
    const topology = rules(),
        map = floorMap(),
        state = topology.createEnclosure({
            compositeId: "corner",
            owners: [1],
            built: true,
            map,
            layers: [{ id: "inner", vertices: rectangle(12, 9, 14, 11), gate: { x: 12, y: 10 } }],
        });
    assert.equal(topology.pathOutsideField(state, "inner", { x: 13, y: 10 }, map).length, 0);
    state.anchors.find((anchor) => anchor.x === 12 && anchor.y === 9).hp = 0;
    assert.equal(topology.pathOutsideField(state, "inner", { x: 13, y: 10 }, map).length, 0);
});

test("a destroyed 3x3 corner and its links can be rebuilt with paid work", () => {
    const topology = rules(),
        map = floorMap(),
        clear = (cell) => ({ cell, inBounds: true, floor: true, protected: false, occupied: false });
    let state = topology.createEnclosure({
        compositeId: "repair",
        owners: [1],
        built: true,
        autoSeal: true,
        map,
        layers: [{ id: "inner", vertices: rectangle(12, 9, 14, 11), gate: { x: 12, y: 10 } }],
    });
    state = topology.damageAt(state, { cell: { x: 12, y: 9 }, damage: 3 }).state;
    assert.equal(state.fields.inner.phase, "breached");
    state = topology.tickOwnerless(state, { activeOwnerIds: [1], delta: 4 }).state;
    let work = 0;
    let action;
    while ((action = topology.nextWorkAction(state, 1, { x: 12, y: 9 })) && work++ < 20) {
        const applied = topology.applyAction(state, { ...action, ownerId: 1 }, clear(action.cell));
        assert.equal(applied.outcome.legal, true, `${JSON.stringify(action)}: ${applied.outcome.reason}`);
        state = applied.state;
    }
    assert.ok(work >= 3);
    assert.equal(state.fields.inner.phase, "sealed");
});

test("an undersized enclosure falls back to the declared line or is saved as abandoned", () => {
    const topology = rules(),
        input = {
            compositeId: "small",
            groupId: "g",
            owners: [1, 2],
            map: floorMap(),
            layers: [{ id: "inner", vertices: rectangle(4, 4, 5, 5), gate: { x: 4, y: 5 } }],
        },
        abandoned = topology.createEnclosure(input),
        fallback = topology.createEnclosure({
            ...input,
            fallbackLine: {
                fieldId: "small-line",
                anchors: [
                    { x: 8, y: 8 },
                    { x: 8, y: 12 },
                ],
            },
        });
    assert.equal(abandoned.kind, "abandoned");
    assert.equal(abandoned.reason, "dimensions");
    assert.equal(JSON.stringify(abandoned.anchors), "[]");
    assert.equal(JSON.stringify(abandoned.links), "[]");
    assert.equal(JSON.stringify(abandoned.workCreditByMember), "{}");
    assert.equal(topology.nextWorkAction(abandoned, 1, { x: 4, y: 4 }), undefined);
    assert.equal(fallback.kind, "line");
    assert.equal(fallback.fallbackReason, "dimensions");
});

test("body construction is inner-first and core entry closes gates inner-to-outer", () => {
    const topology = rules(),
        clear = (cell) => ({ cell, inBounds: true, floor: true, protected: false, occupied: false });
    let state = topology.createEnclosure({
        compositeId: "nested",
        groupId: "g",
        owners: [1],
        map: floorMap(),
        layers: [
            { id: "inner", vertices: rectangle(12, 9, 14, 11), gate: { x: 12, y: 10 } },
            { id: "outer", vertices: rectangle(11, 8, 15, 12), gate: { x: 11, y: 10 } },
        ],
    });
    topology.updateTarget(state, { id: "player", x: 13, y: 10 });
    let action = topology.nextWorkAction(state, 1, { x: 11, y: 9 });
    assert.equal(action.fieldId, "inner");
    let guard = 0;
    while (action && guard++ < 200) {
        const applied = topology.applyAction(state, { ...action, ownerId: 1 }, clear(action.cell));
        assert.equal(applied.outcome.legal, true, `${action.type}: ${applied.outcome.reason}`);
        state = applied.state;
        action = topology.nextWorkAction(state, 1, { x: action.cell.x, y: action.cell.y });
    }
    assert.ok(guard < 200);
    assert.equal(state.fields.inner.phase, "sealed");
    assert.equal(state.fields.outer.phase, "sealed");
    const gateOrder = state.actionLog.filter((entry) => entry.role === "gate").map((entry) => entry.fieldId);
    assert.deepEqual(JSON.parse(JSON.stringify(gateOrder)), ["inner", "inner", "outer", "outer"]);
    const firstOuter = state.actionLog.findIndex((entry) => entry.fieldId === "outer"),
        lastInnerBody = state.actionLog.map((entry) => `${entry.fieldId}:${entry.role}`).lastIndexOf("inner:body");
    assert.ok(firstOuter > lastInnerBody);
});

test("withdrawal reopens an unsealed gate through one paid operation", () => {
    const topology = rules(),
        clear = (cell) => ({ cell, inBounds: true, floor: true, protected: false, occupied: false });
    let state = topology.createEnclosure({
        compositeId: "withdraw",
        groupId: "g",
        owners: [1, 2],
        map: floorMap(),
        layers: [{ id: "inner", vertices: rectangle(20, 5, 24, 13), gate: { x: 20, y: 9 } }],
    });
    while (state.fields.inner.phase === "preparing") {
        const action = topology.nextWorkAction(state, 1, { x: 20, y: 9 });
        state = topology.applyAction(state, { ...action, ownerId: 1 }, clear(action.cell)).state;
    }
    topology.updateTarget(state, { id: "player", x: 22, y: 9 });
    const close = topology.nextWorkAction(state, 1, { x: 20, y: 9 });
    state = topology.applyAction(state, { ...close, ownerId: 1 }, clear(close.cell)).state;
    topology.updateTarget(state, { id: "player", x: 18, y: 9 });
    const reopen = topology.nextWorkAction(state, 1, { x: 20, y: 9 });
    assert.equal(reopen.type, "reopenGate");
    state = topology.applyAction(state, { ...reopen, ownerId: 1 }, clear(reopen.cell)).state;
    assert.equal(topology.isLayerClosed(state, "inner"), false);
    assert.equal(state.fields.inner.phase, "ready");
});

test("normalized overlaps share HP and crossings do not become declared fields", () => {
    const topology = rules(),
        graph = topology.createPhysicalGraph({
            owners: [1, 2],
            fields: [
                {
                    id: "a",
                    type: "line",
                    vertices: [
                        { x: 2, y: 5 },
                        { x: 8, y: 5 },
                    ],
                },
                {
                    id: "b",
                    type: "line",
                    vertices: [
                        { x: 5, y: 5 },
                        { x: 11, y: 5 },
                    ],
                },
                {
                    id: "cross",
                    type: "line",
                    vertices: [
                        { x: 6, y: 2 },
                        { x: 6, y: 8 },
                    ],
                },
            ],
            built: true,
        }),
        shared = graph.links.find((link) => link.owners.includes("a") && link.owners.includes("b")),
        crossing = graph.junctions.find((junction) => junction.x === 6 && junction.y === 5);
    assert.ok(shared);
    assert.equal(graph.links.filter((link) => link.owners.includes("a") && link.owners.includes("b")).length, 2);
    assert.ok(crossing);
    assert.equal(
        graph.anchors.some((anchor) => anchor.x === 6 && anchor.y === 5),
        false,
    );
    const damaged = topology.damageAt(graph, { cell: { x: 6, y: 5 }, damage: 1 }).state;
    assert.ok(damaged.links.find((link) => link.id === shared.id).hp < shared.hp);
    assert.equal(Object.keys(damaged.fields).length, 0);
});

test("declared containment, outside reachability, and exit reachability are independent", () => {
    const topology = rules(),
        map = floorMap(),
        state = topology.createEnclosure({
            compositeId: "routes",
            groupId: "g",
            owners: [1, 2, 3, 4],
            map,
            built: true,
            layers: [
                { id: "inner", vertices: rectangle(12, 9, 14, 11), gate: { x: 12, y: 10 } },
                { id: "outer", vertices: rectangle(11, 8, 15, 12), gate: { x: 11, y: 10 } },
            ],
        }),
        point = { x: 13, y: 10 },
        innerLink = state.links.find((link) => link.owners.includes("inner"));
    state.links.find((link) => link.id === innerLink.id).hp = 0;
    topology.refresh(state);
    const query = topology.inspectReachability(state, "routes", point, map);
    assert.equal(query.declared.inner, true);
    assert.equal(query.outsideFields.inner, true);
    assert.equal(query.outsideComposite, false);
    assert.equal(query.floorExit, false);
});

test("live owners repair ten percent, broken links wait four turns, and retired work is ignored", () => {
    const topology = rules(),
        map = floorMap(),
        clear = (cell) => ({ cell, inBounds: true, floor: true, protected: false, occupied: false });
    let state = topology.createEnclosure({
        compositeId: "repair",
        groupId: "g",
        owners: [1, 2],
        map,
        built: true,
        layers: [{ id: "inner", vertices: rectangle(20, 5, 24, 13), gate: { x: 20, y: 9 } }],
    });
    const link = state.links.find((candidate) => candidate.plannedCells.length > 0),
        hitCell = link.builtCells[0];
    state = topology.damageAt(state, { cell: hitCell, damage: 0.5 }).state;
    const before = state.links.find((candidate) => candidate.id === link.id).hp,
        repair = topology.nextWorkAction(state, 1, hitCell);
    assert.equal(repair.type, "repair");
    state = topology.applyAction(state, { ...repair, ownerId: 1 }, clear(repair.cell)).state;
    assert.equal(state.links.find((candidate) => candidate.id === link.id).hp, before + link.maxHp * 0.1);

    state = topology.damageAt(state, { cell: hitCell, damage: 99 }).state;
    for (let turn = 1; turn <= 3; turn++) {
        state = topology.tickOwnerless(state, { activeOwnerIds: [1], delta: 1 }).state;
        assert.equal(topology.nextWorkAction(state, 1, hitCell), undefined);
    }
    state = topology.tickOwnerless(state, { activeOwnerIds: [1], delta: 1 }).state;
    const rebuild = topology.nextWorkAction(state, 1, hitCell);
    assert.equal(rebuild.type, "rebuildLink");
    state = topology.applyAction(state, { ...rebuild, ownerId: 1 }, clear(rebuild.cell)).state;
    assert.ok(state.links.find((candidate) => candidate.id === link.id).hp > 0);

    state.fields.inner.retired = true;
    topology.refresh(state);
    state.links.find((candidate) => candidate.id === link.id).hp -= 0.1;
    assert.equal(topology.nextWorkAction(state, 1, hitCell), undefined);
});

test("partial, sealed, and breached states survive JSON roundtrip", () => {
    const topology = rules(),
        map = floorMap(),
        base = () =>
            topology.createEnclosure({
                compositeId: "save",
                groupId: "g",
                owners: [1, 2, 3, 4],
                map,
                layers: [
                    { id: "inner", vertices: rectangle(10, 7, 16, 13), gate: { x: 10, y: 10 } },
                    { id: "outer", vertices: rectangle(7, 4, 19, 16), gate: { x: 7, y: 10 } },
                ],
            });
    const partial = base(),
        first = topology.nextWorkAction(partial, 1, { x: 10, y: 7 });
    partial.workCreditByMember[1] = 0.5;
    partial.assignmentByMember[1] = first;
    const sealed = topology.createEnclosure({
            compositeId: "save",
            groupId: "g",
            owners: [1, 2, 3, 4],
            map,
            built: true,
            layers: [
                { id: "inner", vertices: rectangle(10, 7, 16, 13), gate: { x: 10, y: 10 } },
                { id: "outer", vertices: rectangle(7, 4, 19, 16), gate: { x: 7, y: 10 } },
            ],
        }),
        breached = JSON.parse(JSON.stringify(sealed));
    breached.links[0].hp = 0;
    breached.links[0].cooldown = 3;
    topology.refresh(breached);
    for (const state of [partial, sealed, breached]) {
        const restored = topology.restore(JSON.parse(JSON.stringify(state)));
        assert.equal(JSON.stringify(restored), JSON.stringify(state));
    }
});
