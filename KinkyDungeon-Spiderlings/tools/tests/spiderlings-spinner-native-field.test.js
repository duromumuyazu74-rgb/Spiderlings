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

test("a hostile shielded NPC touching an owned ground trap receives shield pressure", () => {
    const r = runtime();
    buildAll(r);
    const c = r.context;
    const pressured = [];
    c.Spiderlings.Combat = { pressureNPCShield: (enemy) => pressured.push(enemy.id) };
    const maid = { id: 71, x: 5, y: 3, hp: 8, shield: 8, Enemy: { name: "MaidforceMini", tags: {} } };
    c.KDMapData.Entities.push(maid);
    assert.equal(c.Spiderlings.SpinnerNativeField.onEntry(maid, 5, 3), true);
    assert.deepEqual(pressured, [71]);
    c.Spiderlings.SpinnerNativeField.onEntry(maid, 5, 3);
    assert.deepEqual(pressured, [71]);
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

test("a sealed owned web field keeps pressure on a shielded NPC inside", () => {
    const r = runtime(),
        c = r.context;
    const workers = [1, 2].map((id) => ({
        id,
        x: 10 + id,
        y: 9 + id,
        hp: 10,
        Enemy: { name: "Spinner", movePoints: 1, tags: { spiderlings: true } },
    }));
    c.KDMapData.Entities.push(...workers);
    const encounter = c.Spiderlings.SpinnerScenarios.setupNested({ ownerIds: workers.map((e) => e.id) }).encounter;
    for (const anchor of encounter.topology.anchors) anchor.built = true;
    for (const link of encounter.topology.links) {
        link.builtCells = JSON.parse(JSON.stringify(link.plannedCells));
        link.connected = true;
    }
    c.Spiderlings.SpinnerTopology.refresh(encounter.topology);
    const core = Object.values(encounter.topology.composites)[0].core;
    const maid = { id: 70, x: core.x, y: core.y, hp: 8, shield: 8, Enemy: { name: "MaidforceMini", tags: {} } };
    c.KDMapData.Entities.push(maid);
    const pressured = [];
    c.Spiderlings.Combat = { pressureNPCShield: (enemy) => pressured.push(enemy.id) };
    c.Spiderlings.SpinnerNativeField.tick(1);
    assert.deepEqual(pressured, [70]);
    maid.shield = 0;
    c.Spiderlings.SpinnerNativeField.tick(1);
    assert.deepEqual(pressured, [70]);
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
