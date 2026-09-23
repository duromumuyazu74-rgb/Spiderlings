"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime } = require("./helpers/spinner-native-runtime.js");

function buildAll(
    r,
    anchors = [
        { x: 5, y: 3 },
        { x: 5, y: 7 },
    ],
) {
    const c = r.context,
        owners = [
            { id: 1, x: 3, y: 3, hp: 10, Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } } },
            { id: 2, x: 3, y: 7, hp: 10, Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } } },
        ];
    c.KDMapData.Entities.push(...owners);
    const started = c.Spiderlings.SpinnerScenarios.setupDoorway({
        fieldId: "doorway",
        ownerIds: owners.map((owner) => owner.id),
        anchors,
    });
    assert.equal(started.started, true);
    let handled = 0;
    while (Object.values(started.encounter.builders).some((builder) => builder.actions.length)) {
        for (const owner of owners) {
            const before = { x: owner.x, y: owner.y };
            if (started.encounter.builders[owner.id].actions.length) {
                assert.ok(c.Spiderlings.SpinnerNativeField.handleEnemyTurn(owner, c.KinkyDungeonPlayerEntity, 1));
                handled++;
                assert.deepEqual({ x: owner.x, y: owner.y }, before);
            }
        }
    }
    return { owners, encounter: started.encounter, handled };
}

test("pure topology requires paid anchor and connection operations and rejects action-boundary blockers", () => {
    const c = runtime().context,
        rules = c.Spiderlings.SpinnerTopology,
        initial = rules.createLine({
            fieldId: "line",
            owners: [1, 2],
            anchors: [
                { x: 3, y: 3 },
                { x: 3, y: 4 },
            ],
        }),
        clear = (cell) => ({ cell, inBounds: true, floor: true, protected: false, occupied: false });
    let result = rules.applyAction(
        initial,
        { type: "placeAnchor", ownerId: 1, anchorId: initial.anchors[0].id },
        clear(initial.anchors[0]),
    );
    result = rules.applyAction(
        result.state,
        { type: "placeAnchor", ownerId: 2, anchorId: initial.anchors[1].id },
        clear(initial.anchors[1]),
    );
    assert.equal(result.state.links[0].connected, false);
    result = rules.applyAction(
        result.state,
        { type: "extendLink", ownerId: 1, linkId: initial.links[0].id },
        clear({ x: -1, y: -1 }),
    );
    assert.equal(result.state.links[0].connected, true);
    assert.equal(rules.solidCells(result.state).length, 2);

    for (const snapshot of [
        { inBounds: true, floor: false, protected: false, occupied: false },
        { inBounds: true, floor: true, protected: true, occupied: false },
        { inBounds: true, floor: true, protected: false, occupied: true },
    ]) {
        const rejected = rules.applyAction(
            initial,
            { type: "placeAnchor", ownerId: 1, anchorId: initial.anchors[0].id },
            { ...snapshot, cell: { x: 3, y: 3 } },
        );
        assert.equal(rejected.outcome.legal, false);
        assert.equal(rejected.state.anchors[0].built, false);
    }
});

test("two supplied Spinners construct one cell per paid action without moving", () => {
    const r = runtime(),
        built = buildAll(r),
        solids = r.context.Spiderlings.SpinnerTopology.solidCells(built.encounter.topology),
        proxies = r.context.KDMapData.Entities.filter(r.context.Spiderlings.SpinnerNativeField.isOwnedProxy);
    assert.equal(built.handled, 5);
    assert.equal(solids.length, 5);
    assert.equal(proxies.length, 5);
    assert.equal(new Set(proxies.map((proxy) => `${proxy.x},${proxy.y}`)).size, 5);
    assert.ok(proxies.every((proxy) => proxy.targetedForAttack && proxy.Enemy.immobile === false));
});

test("native pathcondition lets only Spiderlings cross without moving or duplicating the proxy", () => {
    const r = runtime();
    buildAll(r, [
        { x: 5, y: 4 },
        { x: 5, y: 6 },
    ]);
    const c = r.context,
        proxy = c.KDMapData.Entities.find(
            (entity) => c.Spiderlings.SpinnerNativeField.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5,
        ),
        spiderling = { id: 9, x: 4, y: 5, hp: 5, Enemy: { tags: { spiderlings: true } } },
        bandit = { id: 10, x: 4, y: 4, hp: 5, Enemy: { tags: {} } };
    c.KDMapData.Entities.push(spiderling, bandit);
    assert.equal(c.KDPathConditions.SpiderlingsWebTraversal.query(spiderling, proxy), true);
    assert.equal(c.KDPathConditions.SpiderlingsWebTraversal.query(bandit, proxy), false);
    assert.equal(c.KDPathConditions.SpiderlingsWebTraversal.doPassthrough(spiderling, proxy, c.KDMapData), 2);
    assert.deepEqual({ x: spiderling.x, y: spiderling.y }, { x: 6, y: 5 });
    assert.deepEqual({ x: proxy.x, y: proxy.y }, { x: 5, y: 5 });
    assert.equal(c.KDMapData.Entities.filter((entity) => entity.x === 5 && entity.y === 5).length, 1);
});

test("native planning snapshot protects object shortcuts, jail points, and required interaction tiles", () => {
    const r = runtime(),
        c = r.context;
    c.KDMapData.ShortcutPositions = { side: { x: 7, y: 8 } };
    c.KDMapData.JailPoints = [{ x: 8, y: 8, type: "jail", radius: 1 }];
    r.tiles.set("10,8", { Type: "Shrine" });
    r.tiles.set("11,8", { Type: "Door", Priority: true });
    const snapshot = c.Spiderlings.SpinnerNativeField.mapSnapshot();
    for (const cell of ["2,10", "28,10", "7,8", "8,8", "10,8", "11,8"])
        assert.ok(snapshot.protected.includes(cell), cell);
});

test("final native damage updates shared durability once and invalidates both path caches", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        field = c.Spiderlings.SpinnerNativeField,
        encounter = field.state(),
        middle = c.KDMapData.Entities.find((entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5),
        before = encounter.topology.links[0].hp;
    c.KDPathCache.set("seed", []);
    c.KDPathCacheIgnoreLocks.set("seed", []);
    assert.equal(field.onNativeDamage({ enemy: middle, dmgDealt: 1, dmg: 99 }), true);
    assert.equal(encounter.topology.links[0].hp, before - 0.7);
    assert.equal(c.KDPathCache.size, 0);
    assert.equal(c.KDPathCacheIgnoreLocks.size, 0);
    assert.equal(c.KDUpdateEnemyCache, true);

    const anchor = c.KDMapData.Entities.find(
            (entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 3,
        ),
        linkBeforeAnchor = encounter.topology.links[0].hp;
    field.onNativeDamage({ enemy: anchor, dmgDealt: 0.5 });
    assert.equal(encounter.topology.anchors[0].hp, 1.5);
    assert.equal(encounter.topology.links[0].hp, linkBeforeAnchor - 0.5);
});

test("native area hits contribute once per covered proxy and a middle-cell breach reopens the route", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        field = c.Spiderlings.SpinnerNativeField,
        encounter = field.state(),
        proxies = c.KDMapData.Entities.filter((entity) => field.isOwnedProxy(entity) && entity.y > 3 && entity.y < 7),
        before = encounter.topology.links[0].hp;
    field.onNativeDamage({ enemy: proxies[0], dmgDealt: 0.5, bullet: { aoe: 3 } });
    field.onNativeDamage({ enemy: proxies[1], dmgDealt: 0.5, bullet: { aoe: 3 } });
    assert.equal(encounter.topology.links[0].hp, before - 0.775);

    const middle = c.KDMapData.Entities.find(
        (entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5,
    );
    field.onNativeDamage({ enemy: middle, dmgDealt: 99 });
    assert.equal(encounter.topology.links[0].hp, 0);
    assert.equal(
        c.KDMapData.Entities.some((entity) => field.isOwnedProxy(entity) && entity.x === 5 && entity.y === 5),
        false,
    );
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, 2);
});

test("anchor snare is once per target and never creates capture or restraint state", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        target = { id: 44, x: 5, y: 3, hp: 5, Enemy: { tags: {} } };
    assert.equal(c.Spiderlings.SpinnerNativeField.onEntry(target, 5, 3), true);
    assert.equal(c.Spiderlings.SpinnerNativeField.onEntry(target, 5, 3), false);
    assert.equal(r.buffs.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(r.buffs[0].buff)), {
        id: "SpiderlingsSpinnerSnaringSilk",
        type: "MoveSpeed",
        power: -1,
        duration: 2,
    });
    assert.equal(c.KDGameData.SpiderlingsSpinnerCapture, undefined);
});

test("runtime movement events apply Snaring on voluntary, forced, and NPC anchor entry", () => {
    for (const entry of [
        { event: "playerMove", willing: true, npc: false },
        { event: "playerMove", willing: false, npc: false },
        { event: "enemyMove", willing: true, npc: true },
    ]) {
        const r = runtime();
        buildAll(r);
        const c = r.context,
            target = entry.npc ? { id: 71, x: 5, y: 3, hp: 2, Enemy: { tags: {} } } : c.KinkyDungeonPlayerEntity,
            data = { enemy: target, moveX: 5, moveY: 3, willing: entry.willing, cancelmove: false };
        c.KDEventMapGeneric[entry.event].SpiderlingsSpinnerRuntime({}, data);
        assert.equal(r.buffs.length, 1);
        assert.equal(r.buffs[0].entity, target);
    }
});

test("JSON save roundtrip reconciles one proxy per solid cell and preserves owners, HP, and snare IDs", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context,
        field = c.Spiderlings.SpinnerNativeField,
        encounter = field.state();
    field.onEntry({ id: 55, Enemy: {} }, 5, 3);
    encounter.topology.links[0].hp -= 0.25;
    encounter.topology.ownerlessAge = 7;
    const saved = JSON.parse(JSON.stringify(encounter));
    c.KDMapData.SpiderlingsSpinnerEncounter = saved;
    const proxies = c.KDMapData.Entities.filter(field.isOwnedProxy),
        proxy = proxies[0];
    c.KDMapData.Entities.push({ ...proxy, id: 999 });
    c.KDMapData.Entities.splice(c.KDMapData.Entities.indexOf(proxies[1]), 1);
    c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
    const reconciled = field.reconcile();
    const solids = c.Spiderlings.SpinnerTopology.solidCells(saved.topology);
    assert.equal(reconciled.created, 0);
    assert.equal(reconciled.removed, 0);
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, solids.length);
    assert.deepEqual(Array.from(saved.topology.owners), [1, 2]);
    assert.deepEqual(Array.from(saved.topology.anchors[0].snaredTargetIds), [55]);
    assert.equal(saved.topology.ownerlessAge, 7);
});

test("one surviving owner retains the line and final-owner collapse occurs on active turn twenty", () => {
    const r = runtime(),
        built = buildAll(r),
        c = r.context,
        field = c.Spiderlings.SpinnerNativeField;
    built.owners[0].hp = 0;
    field.tick(30);
    assert.equal(built.encounter.topology.ownerlessAge, 0);
    assert.equal(built.encounter.topology.collapsed, false);
    built.owners[1].hp = 0;
    field.tick(19);
    assert.equal(built.encounter.topology.ownerlessAge, 19);
    assert.equal(built.encounter.topology.collapsed, false);
    field.tick(1);
    assert.equal(built.encounter.topology.collapsed, true);
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, 0);
});

function regularTiming(workerCount, onSite = false) {
    const r = runtime(),
        c = r.context,
        starts = onSite
            ? [
                  [19, 6],
                  [25, 12],
                  [25, 6],
                  [19, 12],
                  [22, 4],
                  [22, 14],
                  [18, 9],
                  [26, 9],
              ]
            : [
                  [11, 9],
                  [12, 11],
                  [11, 11],
                  [12, 9],
                  [10, 8],
                  [10, 12],
                  [13, 8],
                  [13, 12],
              ],
        workers = starts.slice(0, workerCount).map(([x, y], index) => ({
            id: index + 1,
            x,
            y,
            hp: 10,
            buffs: {},
            Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
        }));
    c.KDMapData.Entities.push(...workers);
    const started = c.Spiderlings.SpinnerScenarios.setupRegular({ ownerIds: workers.map((worker) => worker.id) });
    assert.equal(started.started, true);
    let turn = 0;
    while (turn < 60 && started.encounter.topology.fields.inner.phase === "preparing") {
        turn++;
        c.KinkyDungeonCurrentTick = turn;
        for (const worker of workers)
            c.Spiderlings.SpinnerNativeField.handleEnemyTurn(worker, c.KinkyDungeonPlayerEntity, 1);
        c.Spiderlings.SpinnerNativeField.tick(1);
    }
    return { turn, ...started.encounter.timing, phase: started.encounter.topology.fields.inner.phase };
}

test("pinned regular room meets the two-worker native target and keeps useful scaling", () => {
    const arrival = [2, 4, 8].map((count) => regularTiming(count)),
        onSite = [2, 4, 8].map((count) => regularTiming(count, true));
    assert.ok(arrival.every((measurement) => measurement.phase === "ready"));
    assert.ok(onSite.every((measurement) => measurement.phase === "ready"));
    assert.ok(arrival[0].turn <= 30);
    assert.ok(arrival[1].turn < arrival[0].turn);
    assert.ok(arrival[2].turn <= arrival[1].turn);
    assert.ok(onSite[1].turn < onSite[0].turn);
    assert.ok(onSite[2].turn <= onSite[1].turn);
    assert.deepEqual(
        arrival.map((measurement) => measurement.turn),
        [25, 19, 15],
    );
    assert.deepEqual(
        onSite.map((measurement) => measurement.turn),
        [15, 6, 4],
    );
    assert.ok(arrival.every((measurement) => measurement.blocked.length === 0));
});

test("native enclosure reload deduplicates partial, sealed, and breached projections", () => {
    const r = runtime(),
        c = r.context,
        workers = [
            {
                id: 1,
                x: 11,
                y: 9,
                hp: 10,
                buffs: {},
                Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
            },
            {
                id: 2,
                x: 12,
                y: 11,
                hp: 10,
                buffs: {},
                Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
            },
            {
                id: 3,
                x: 11,
                y: 11,
                hp: 10,
                buffs: {},
                Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
            },
            {
                id: 4,
                x: 12,
                y: 9,
                hp: 10,
                buffs: {},
                Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
            },
        ];
    c.KDMapData.Entities.push(...workers);
    const encounter = c.Spiderlings.SpinnerScenarios.setupNested({
        ownerIds: workers.map((worker) => worker.id),
    }).encounter;
    for (const worker of workers)
        c.Spiderlings.SpinnerNativeField.handleEnemyTurn(worker, c.KinkyDungeonPlayerEntity, 1);
    const partial = JSON.parse(JSON.stringify(encounter.topology));
    assert.equal(partial.fields.inner.phase, "preparing");

    for (const anchor of encounter.topology.anchors) anchor.built = true;
    for (const link of encounter.topology.links) {
        link.builtCells = JSON.parse(JSON.stringify(link.plannedCells));
        link.connected = true;
    }
    c.Spiderlings.SpinnerTopology.refresh(encounter.topology);
    const sealed = JSON.parse(JSON.stringify(encounter.topology));
    assert.ok(Object.values(sealed.fields).every((field) => field.phase === "sealed"));
    encounter.topology.links[0].hp = 0;
    encounter.topology.links[0].builtCells = [];
    encounter.topology.links[0].connected = false;
    encounter.topology.links[0].cooldown = 3;
    c.Spiderlings.SpinnerTopology.refresh(encounter.topology);
    const breached = JSON.parse(JSON.stringify(encounter.topology));
    assert.ok(Object.values(breached.fields).some((field) => field.phase === "breached"));

    for (const saved of [partial, sealed, breached]) {
        encounter.topology = JSON.parse(JSON.stringify(saved));
        c.Spiderlings.SpinnerNativeField.reconcile();
        const proxy = c.KDMapData.Entities.find(c.Spiderlings.SpinnerNativeField.isOwnedProxy);
        if (proxy) c.KDMapData.Entities.push({ ...proxy, id: 9999 });
        c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
        c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
        const solids = c.Spiderlings.SpinnerTopology.solidCells(encounter.topology);
        assert.equal(c.KDMapData.Entities.filter(c.Spiderlings.SpinnerNativeField.isOwnedProxy).length, solids.length);
        assert.equal(JSON.stringify(encounter.topology), JSON.stringify(saved));
    }
});

test("native Spinner builder actions close four outward layers and restore their physical field", () => {
    const r = runtime(),
        c = r.context,
        field = c.Spiderlings.SpinnerNativeField,
        topology = c.Spiderlings.SpinnerTopology,
        workers = [
            [18, 18],
            [26, 18],
            [18, 26],
            [26, 26],
        ].map(([x, y], index) => ({
            id: index + 1,
            x,
            y,
            hp: 10,
            buffs: {},
            Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
        })),
        layer = (index) => ({
            id: `native-layer-${index}`,
            vertices: [
                { x: 19 - 3 * index, y: 19 - 3 * index },
                { x: 25 + 3 * index, y: 19 - 3 * index },
                { x: 25 + 3 * index, y: 25 + 3 * index },
                { x: 19 - 3 * index, y: 25 + 3 * index },
            ],
            gate: { x: 19 - 3 * index, y: 22 },
        });
    c.KDMapData.GridWidth = 45;
    c.KDMapData.GridHeight = 45;
    c.KDMapData.StartPosition = { x: 2, y: 2 };
    c.KDMapData.EndPosition = { x: 42, y: 42 };
    c.KinkyDungeonPlayerEntity.x = 22;
    c.KinkyDungeonPlayerEntity.y = 22;
    c.KDMapData.Entities.push(...workers);
    const encounter = field.initializeEnclosure({
        compositeId: "native-growing",
        owners: workers.map((worker) => worker.id),
        layers: [layer(0)],
    });
    field.onEntry(c.KinkyDungeonPlayerEntity, 22, 22);
    for (let index = 0; index < 4; index++) {
        if (index) {
            const extension = field.extendEnclosure({ compositeId: "native-growing", layer: layer(index) });
            assert.equal(extension.added, true, extension.reason);
        }
        let paidOperations = 0;
        while (encounter.topology.fields[`native-layer-${index}`].phase !== "sealed" && paidOperations < 150) {
            const worker = workers[paidOperations % workers.length],
                action = topology.nextWorkAction(encounter.topology, worker.id, worker);
            assert.ok(action?.cell, `layer ${index} needs a physical work action`);
            // The native adapter charges the action; the fixture positions each builder at its assigned work site.
            worker.x = action.cell.x + 1;
            worker.y = action.cell.y + 1;
            const result = field.applyPaidAction(worker, { ...action, ownerId: worker.id });
            assert.equal(result.paid, true);
            assert.equal(result.applied, true, result.reason);
            paidOperations++;
        }
        assert.ok(paidOperations < 150, `layer ${index} must close through paid builder actions`);
        assert.ok(paidOperations >= layer(index).vertices.length);
        assert.equal(
            topology.captureGeometryReady(encounter.topology, "native-growing", c.KinkyDungeonPlayerEntity),
            true,
        );
    }
    assert.equal(encounter.topology.fields["native-layer-3"].bounds.width, 25);
    const outerProxy = c.KDMapData.Entities.find(
        (entity) => field.isOwnedProxy(entity) && entity.x === 10 && entity.y === 15,
    );
    assert.ok(outerProxy);
    assert.equal(field.onNativeDamage({ enemy: outerProxy, dmgDealt: 99 }), true);
    assert.equal(encounter.topology.fields["native-layer-3"].phase, "breached");
    assert.equal(
        topology.captureGeometryReady(encounter.topology, "native-growing", c.KinkyDungeonPlayerEntity),
        false,
    );
    field.tick(4);
    let repairOperations = 0;
    while (encounter.topology.fields["native-layer-3"].phase !== "sealed" && repairOperations++ < 150) {
        const worker = workers[repairOperations % workers.length],
            action = topology.nextWorkAction(encounter.topology, worker.id, worker);
        assert.ok(action?.cell);
        worker.x = action.cell.x + 1;
        worker.y = action.cell.y + 1;
        assert.equal(field.applyPaidAction(worker, { ...action, ownerId: worker.id }).applied, true);
    }
    assert.ok(repairOperations < 150, "damaged outer layer must repair through the same field work");

    const saved = JSON.parse(JSON.stringify(encounter.topology));
    c.KDMapData.Entities.push({ ...c.KDMapData.Entities.find(field.isOwnedProxy), id: 9999 });
    c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
    c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
    assert.equal(JSON.stringify(encounter.topology), JSON.stringify(saved));
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, topology.solidCells(saved).length);

    const retainedMap = JSON.parse(JSON.stringify(c.KDMapData));
    c.KDMapData = { ...retainedMap, Entities: [], SpiderlingsSpinnerEncounter: undefined };
    assert.equal(field.state(), undefined);
    c.KDMapData = retainedMap;
    c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
    c.KDEventMapGeneric.afterLoadGame.SpiderlingsSpinnerRuntime({}, {});
    assert.equal(JSON.stringify(field.state().topology), JSON.stringify(saved));
    assert.equal(c.KDMapData.Entities.filter(field.isOwnedProxy).length, topology.solidCells(saved).length);
});
