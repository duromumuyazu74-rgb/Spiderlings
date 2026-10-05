"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime } = require("./helpers/spinner-native-runtime.js");
const plain = (value) => JSON.parse(JSON.stringify(value));
const key = ({ x, y }) => `${x},${y}`;

function fixture({ width = 1, tee = false, overrides = {} } = {}) {
    const floor = new Set();
    for (let x = 1; x < 30; x++) for (let y = 10; y < 10 + width; y++) floor.add(`${x},${y}`);
    if (tee) for (let y = 1; y < 20; y++) floor.add(`14,${y}`);
    const r = runtime({ KinkyDungeonMapGet: (x, y) => (floor.has(`${x},${y}`) ? "." : "1"), ...overrides }),
        c = r.context,
        api = c.Spiderlings.SpinnerNativeField,
        topology = c.Spiderlings.SpinnerTopology,
        interior = [],
        owners = [1, 2].map((id) => ({
            id,
            x: 12 + id,
            y: 10,
            hp: 2,
            Enemy: { name: "Spinner", movePoints: 1.5, tags: { spiderlings: true } },
        }));
    c.KDMapData.Entities.push(...owners);
    for (let x = 13; x <= 15; x++) for (let y = 10; y < 10 + width; y++) interior.push({ x, y });
    const gates = [
        { id: "west", cells: Array.from({ length: width }, (_, i) => ({ x: 12, y: 10 + i })) },
        { id: "east", cells: Array.from({ length: width }, (_, i) => ({ x: 16, y: 10 + i })) },
    ];
    if (tee) {
        gates.push({ id: "north", cells: [{ x: 14, y: 9 }] });
        floor.delete("14,11");
        for (let y = 12; y < 20; y++) floor.delete(`14,${y}`);
    }
    const inside = new Set(interior.map(key)),
        gateKeys = new Set(gates.flatMap((gate) => gate.cells).map(key)),
        walls = new Map();
    for (const cell of interior)
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                const next = { x: cell.x + dx, y: cell.y + dy };
                if (!inside.has(key(next)) && !gateKeys.has(key(next))) walls.set(key(next), next);
            }
    const input = {
        compositeId: "passage",
        fieldId: "passage:inner",
        owners: owners.map((owner) => owner.id),
        interiorCells: interior,
        core: { x: 14, y: 10 },
        gates,
        nativeWallCells: [...walls.values()],
    };
    const added = api.addPassage(input);
    assert.equal(added.added, true, added.reason);
    const graph = () => api.state().topology,
        field = () => graph().fields[input.fieldId],
        action = (reserved = []) => topology.nextWorkAction(graph(), owners[0].id, owners[0], reserved),
        work = () => {
            const next = action();
            assert.ok(next, "Expected a pending paid action");
            const result = api.applyPaidAction(owners[0], { ...next, ownerId: owners[0].id });
            assert.equal(result.applied, true, `${next.type}: ${result.reason}`);
            return next;
        },
        drain = () => {
            const actions = [];
            for (let n = 0; n < 100 && action(); n++) actions.push(work());
            assert.equal(action(), undefined, "Passage work did not settle");
            return actions;
        },
        enter = (x = 14, y = 10) => {
            c.KinkyDungeonPlayerEntity.x = x;
            c.KinkyDungeonPlayerEntity.y = y;
            api.onEntry(c.KinkyDungeonPlayerEntity);
        };
    return { ...r, c, api, topology, floor, input, owners, graph, field, action, work, drain, enter };
}

test("passage validates complete native-wall boundaries and preserves protected doorway cells", () => {
    const r = fixture(),
        input = { ...r.input, map: r.api.mapSnapshot() };
    assert.equal(r.topology.validatePassage(input).valid, true);
    assert.equal(
        r.topology.validatePassage({ ...input, nativeWallCells: input.nativeWallCells.slice(1) }).reason,
        "open-boundary",
    );
    const map = { ...input.map, walls: input.map.walls.filter((cell) => cell !== key(input.nativeWallCells[0])) };
    assert.equal(r.topology.validatePassage({ ...input, map }).reason, "native-wall");
    assert.equal(
        r.topology.validatePassage({ ...input, map: { ...input.map, protected: ["12,10"] } }).reason,
        "protected",
    );
    assert.equal(
        r.topology.validatePassage({ ...input, map: { ...input.map, occupied: ["12,10"] } }).reason,
        "occupied",
    );
    r.c.KinkyDungeonMapGet = (x, y) => (x === 12 && y === 10 ? "D" : r.floor.has(`${x},${y}`) ? "." : "1");
    assert.equal(r.api.snapshot({ x: 12, y: 10 }).protected, true);
    assert.equal(r.api.snapshot({ x: 12, y: 10 }).wall, false);
});

test("paid passage preparation leaves every travel gate open and zero-time refresh builds nothing", () => {
    const r = fixture(),
        graph = r.graph();
    r.api.state().builders[1] = { auto: true };
    const before = JSON.stringify(graph);
    r.api.handleEnemyTurn(r.owners[0], r.c.KinkyDungeonPlayerEntity, 0);
    assert.equal(JSON.stringify(r.graph()), before);
    assert.equal(r.owners[0].SpinnerConstructionPoints, undefined);
    for (let n = 0; n < 3; n++) r.api.handleEnemyTurn(r.owners[0], r.c.KinkyDungeonPlayerEntity, 1);
    assert.equal(r.field().phase, "ready");
    assert.equal(r.graph().actionLog.length, 2);
    assert.ok(r.graph().actionLog.every((action) => action.type === "prepareGate"));
    assert.deepEqual(plain(r.topology.solidCells(r.graph())), []);
    assert.equal(r.api.nativeReachability("passage", { x: 14, y: 10 }).floorExit, true);
});

test("prey entry requires paid closure of both full-width gates before native capture admission", () => {
    const r = fixture({ width: 2 });
    assert.equal(r.drain().length, 2);
    r.enter();
    assert.equal(r.api.captureGeometryReady(r.c.KinkyDungeonPlayerEntity), false);
    const actions = [];
    while (r.action()) {
        actions.push(r.work());
        if (actions.length < 6) assert.equal(r.api.captureGeometryReady(r.c.KinkyDungeonPlayerEntity), false);
    }
    assert.equal(actions.filter((action) => action.type === "closeGate").length, 4);
    assert.equal(actions.filter((action) => action.type === "connectGate").length, 2);
    assert.equal(r.field().phase, "sealed");
    assert.equal(r.api.captureGeometryReady(r.c.KinkyDungeonPlayerEntity), true);
    assert.equal(r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).length, 4);
    assert.ok(r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).every((proxy) => r.floor.has(key(proxy))));
    r.enter(11, 10);
    assert.equal(r.drain().filter((action) => action.type === "reopenGate").length, 4);
    assert.equal(r.field().phase, "ready");
    assert.equal(r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).length, 0);
});

test("occupied gate closure waits without a projection or a free capture", () => {
    const r = fixture();
    r.drain();
    r.enter();
    r.c.KDMapData.Entities.push({ id: 80, x: 12, y: 10, hp: 5, Enemy: { name: "Maidforce" } });
    const next = r.action(),
        before = JSON.stringify(r.graph());
    const result = r.api.applyPaidAction(r.owners[0], { ...next, ownerId: 1 });
    assert.equal(result.reason, "occupied");
    assert.equal(result.applied, false);
    assert.equal(JSON.stringify(r.graph()), before);
    assert.equal(r.api.captureGeometryReady(r.c.KinkyDungeonPlayerEntity), false);
});

test("old line actions cannot fill a designated open passage gate", () => {
    const r = fixture();
    r.drain();
    const gate = r.field().gates[0],
        before = JSON.stringify(r.graph());
    const result = r.api.applyPaidAction(r.owners[0], {
        type: "extendLink",
        fieldId: r.input.fieldId,
        linkId: gate.linkId,
        ownerId: 1,
        cell: gate.cells[0],
    });
    assert.equal(result.applied, false);
    assert.equal(result.reason, "gate-prepare");
    assert.equal(JSON.stringify(r.graph()), before);
    assert.equal(r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).length, 0);
});

test("a new passage can prepare after the previous graph lost every owner", () => {
    const r = fixture();
    r.drain();
    const collapsed = r.topology.tickOwnerless(r.graph(), { activeOwnerIds: [], delta: 20 }).state;
    assert.equal(collapsed.collapsed, true);
    const added = r.topology.addPassage(collapsed, {
        ...r.input,
        compositeId: "new",
        fieldId: "new:inner",
        map: r.api.mapSnapshot(),
    });
    assert.equal(added.added, true);
    assert.equal(added.state.collapsed, false);
    const next = r.topology.nextWorkAction(added.state, 1, r.owners[0]);
    assert.equal(next.type, "prepareGate");
    assert.equal(next.fieldId, "new:inner");
});

test("three-way entrance changes pay to open the new route before closing the old route", () => {
    const r = fixture({ tee: true });
    r.drain();
    assert.equal(r.api.setPassageOpenGates(r.input.fieldId, ["west"]).reason, "gates");
    assert.equal(r.api.setPassageOpenGates(r.input.fieldId, ["west", "east"]).changed, true);
    assert.deepEqual(
        r.drain().map((action) => action.type),
        ["closeGate", "connectGate"],
    );
    const damaged = r.graph().links.find((link) => link.passageGate === "north");
    damaged.hp = 1;
    assert.equal(r.api.setPassageOpenGates(r.input.fieldId, ["west", "north"]).changed, true);
    const first = r.action();
    assert.equal(first.type, "reopenGate");
    assert.equal(first.gateId, "north");
    assert.equal(r.action([r.topology.workKey(first)]), undefined, "Closing must wait while new opening is reserved");
    r.work();
    assert.equal(r.graph().links.find((link) => link.passageGate === "north").hp, 1);
    const closed = r.work();
    assert.equal(closed.type, "closeGate");
    assert.equal(closed.gateId, "east");
    r.drain();
    assert.equal(r.field().phase, "ready");
    r.enter();
    assert.equal(r.api.setPassageOpenGates(r.input.fieldId, ["east", "north"]).reason, "engaged");
});

test("a damaged passage retains its breach through reload and route changes until paid cooldown recovery", () => {
    const r = fixture();
    r.drain();
    r.enter();
    r.drain();
    const proxy = r.c.KDMapData.Entities.find((entity) => r.api.isOwnedProxy(entity) && entity.x === 12);
    r.api.onNativeDamage({ enemy: proxy, dmgDealt: 100 });
    assert.equal(r.field().phase, "breached");
    assert.equal(r.api.captureGeometryReady(r.c.KinkyDungeonPlayerEntity), false);
    const saved = JSON.stringify(r.graph());
    r.api.state().topology = r.topology.restore(JSON.parse(saved));
    r.api.reconcile();
    assert.equal(JSON.stringify(r.graph()), saved);
    r.enter(11, 10);
    r.drain();
    assert.equal(r.graph().links.find((link) => link.passageGate === "west").hp, 0);
    assert.equal(r.action(), undefined);
    for (let n = 0; n < 4; n++) r.api.tick(1);
    const rebuilt = r.work();
    assert.equal(rebuilt.type, "prepareGate");
    const link = r.graph().links.find((candidate) => candidate.passageGate === "west");
    assert.equal(link.hp, link.maxHp * 0.1);
    assert.equal(link.builtCells.length, 0);
    assert.equal(r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).length, 0);
});

test("changing a borrowed native wall invalidates capture without manufacturing a replacement wall", () => {
    const r = fixture();
    r.drain();
    r.enter();
    r.drain();
    const wall = r.input.nativeWallCells[0],
        count = r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).length;
    r.floor.add(key(wall));
    assert.equal(r.api.captureGeometryReady(r.c.KinkyDungeonPlayerEntity), false);
    assert.equal(r.field().nativeTerrainValid, false);
    assert.equal(r.field().phase, "breached");
    r.api.reconcile();
    assert.equal(r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).length, count);
    assert.ok(!r.c.KDMapData.Entities.some((entity) => r.api.isOwnedProxy(entity) && key(entity) === key(wall)));
});

test("passage proxies draw only gate silk and preserve partial/save topology", () => {
    const draws = [],
        r = fixture({
            overrides: {
                KinkyDungeonGridSizeDisplay: 72,
                kdpixisprites: new Map(),
                KDDraw: (...args) => draws.push(args),
                KDDrawEnemySprite: () => "native",
            },
        });
    r.drain();
    r.enter();
    r.work();
    const saved = JSON.stringify(r.graph()),
        proxy = r.c.KDMapData.Entities.find(r.api.isOwnedProxy);
    r.c.KDDrawEnemySprite({}, proxy, proxy.x, proxy.y, 0, 0, false);
    assert.ok(draws.some((call) => call[3] === "Game/Bullets/SpiderlingsSpinnerTrapSide.png"));
    assert.equal(JSON.stringify(r.graph()), saved);
    r.api.state().topology = r.topology.restore(JSON.parse(saved));
    r.api.reconcile();
    assert.equal(JSON.stringify(r.graph()), saved);
    assert.equal(r.c.KDMapData.Entities.filter(r.api.isOwnedProxy).length, 1);
});

test("prepared open gates draw visible colored hints without creating entities or changing topology", () => {
    const draws = [],
        r = fixture({
            overrides: {
                KinkyDungeonGridSizeDisplay: 72,
                kdpixisprites: new Map(),
                kdgameboard: {},
                KDDraw: (...args) => draws.push(args),
                KinkyDungeonVisionGet: () => 1,
            },
        }),
        draw = r.c.KDEventMapGeneric.draw.SpiderlingsSpinnerNativeFieldOpenGates,
        frame = { CamX: 10, CamY: 8, CamX_offset: 0.25, CamY_offset: 0.5 };
    draw(null, frame);
    assert.equal(draws.length, 0, "Unprepared gates have no finished-silk hint");
    r.drain();
    r.c.Spiderlings.getSetting = () => true;
    const saved = JSON.stringify(r.graph()),
        entities = JSON.stringify(r.c.KDMapData.Entities);
    draw(null, frame);
    assert.equal(draws.length, 2);
    assert.ok(
        draws.every((call) => call[3] === "Game/Bullets/SpiderlingsSpinnerTrapSidePink.png" && call[9].alpha === 0.28),
    );
    assert.equal(draws[0][4], (12 - 10.25 + 0.5) * 72);
    assert.equal(draws[0][5], (10 - 8.5 + 0.5) * 72);
    assert.equal(JSON.stringify(r.graph()), saved);
    assert.equal(JSON.stringify(r.c.KDMapData.Entities), entities);
    draws.length = 0;
    r.c.KinkyDungeonVisionGet = (x) => (x === 12 ? 0 : 1);
    draw(null, frame);
    assert.equal(draws.length, 1);
    draws.length = 0;
    r.c.StandalonePatched = true;
    draw(null, frame);
    assert.equal(draws[0][4], (16 - 10 + 0.5) * 72);
    draws.length = 0;
    r.graph().links.find((link) => link.passageGate === "east").hp = 0;
    draw(null, frame);
    assert.equal(draws.length, 0, "Broken gates must not advertise intact preparation");
    r.c.KinkyDungeonVisionGet = () => 1;
    r.api.retireField(r.input.fieldId);
    draw(null, frame);
    assert.equal(draws.length, 0, "Retired field hints disappear");
});

test("Topology rejects retained gate closure when a passage changes its opening", () => {
    const r = fixture({ tee: true });
    r.drain();
    r.enter();
    const action = { ...r.action(), ownerId: r.owners[0].id },
        before = JSON.stringify(r.graph()),
        status = r.topology.inspectWorkAction(r.graph(), action);
    assert.equal(status.pending, true);
    assert.equal(status.gateWork, true);
    assert.equal(status.allowsOccupiedTarget, false);
    assert.equal(JSON.stringify(r.graph()), before);
    r.graph().composites.passage.closureArmed = false;
    const gate = r.field().gates.find((entry) => entry.linkId === action.linkId);
    r.field().openGateIds = [gate.id];
    assert.equal(r.topology.inspectWorkAction(r.graph(), action).pending, false);
    assert.equal(r.topology.applyAction(r.graph(), action, r.api.snapshot(action.cell)).outcome.legal, false);
});
