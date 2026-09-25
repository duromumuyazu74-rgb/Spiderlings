"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadLifecycleRuntime, item, modRoot } = require("./helpers/lifecycle-runtime.js");

function drawCapture(runtime) {
    const c = runtime.c;
    const rendered = [];
    const container = { Mesh: { parent: {}, visible: true }, Container: { destroyed: false }, Zoom: 1 };
    c.KinkyDungeonPlayer = {};
    c.MODEL_SCALE = 1;
    c.KDCurrentModels = new Map([[c.KinkyDungeonPlayer, { Containers: new Map([["Body", container]]) }]]);
    c.Spiderlings.SpinnerArt = { render: (_container, data) => rendered.push(data.amount), clear() {} };
    c.PIXI = {
        Graphics: class {
            clear() {
                return this;
            }
            lineStyle() {
                return this;
            }
            moveTo() {
                return this;
            }
            lineTo() {
                return this;
            }
            destroy() {}
        },
    };
    c.kdgameboard = { addChild() {} };
    c.KinkyDungeonGridSizeDisplay = 72;
    c.DrawTextKD = c.FillRectKD = c.DrawButtonKDEx = () => {};
    c.kdcanvas = c.kdpixisprites = {};
    runtime.send("draw", { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
    return rendered;
}

test("drawing observes schema-3 membership without mutating capture authority", () => {
    const r = contestRuntime();
    r.start();
    r.operate(r.c.KDMapData.Entities[1]);
    const before = JSON.stringify(r.c.KDGameData);
    drawCapture(r);
    drawCapture(r);
    assert.equal(JSON.stringify(r.c.KDGameData), before);
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1, 2]);
});

test("capture strands use the selected tether art", () => {
    const r = contestRuntime();
    r.start();
    const paths = [];
    r.c.KDDraw = (_board, _sprites, _id, image) => {
        paths.push(image);
        return {};
    };
    r.c.KinkyDungeonRootDirectory = "Game/";
    r.c.Spiderlings.getSetting = () => false;
    drawCapture(r);
    assert.deepEqual(paths, ["Game/Bullets/SpiderlingsPlayerTether.png"]);
    paths.length = 0;
    r.c.Spiderlings.getSetting = () => true;
    drawCapture(r);
    assert.deepEqual(paths, ["Game/Bullets/SpiderlingsPlayerTetherPink.png"]);
});

test("the Spinner training boundary uses both art colors and correctly oriented corners", () => {
    const r = contestRuntime();
    r.c.KDModFiles = {
        "Bullets/WebSprayTrail.png": { color: "normal" },
        "Bullets/WebSprayTrailPink.png": { color: "pink" },
    };
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerField.js"), "utf8"), r.c);
    for (const prefix of ["", "Game/"])
        for (const color of ["", "Pink"])
            assert.equal(
                r.c.KDModFiles[`${prefix}Enemies/SpiderlingsSilkAnchor${color}.png`],
                r.c.KDModFiles[`Bullets/WebSprayTrail${color}.png`],
            );
    const traps = [
        { x: 3, y: 3, placed: true },
        { x: 9, y: 3, placed: true },
        { x: 9, y: 9, placed: true },
        { x: 3, y: 9, placed: true },
    ];
    r.c.KDMapData.RoomType = r.c.Spiderlings.SpinnerField.ROOM;
    r.c.KDMapData.SpiderlingsSpinnerField = {
        phase: "ready",
        traps,
        links: traps.map((_trap, index) => ({ a: index, b: (index + 1) % traps.length, built: true })),
        nodes: [],
    };
    const draws = [];
    r.c.KDDraw = (_board, _sprites, id, image, _x, _y, _w, _h, rotation) => {
        draws.push({ id, image, rotation });
        return {};
    };
    r.c.KinkyDungeonRootDirectory = "Game/";
    r.c.Spiderlings.getSetting = () => false;
    drawCapture(r);
    r.c.KDEventMapGeneric.draw.SpiderlingsSpinnerField({}, { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
    assert.deepEqual(
        new Set(draws.map((draw) => draw.image)),
        new Set([
            "Game/Bullets/SpiderlingsSpinnerTrapSide.png",
            "Game/Bullets/SpiderlingsSpinnerTrapCorner.png",
            "Game/Bullets/SpiderlingsSpinnerTrapTop.png",
        ]),
    );
    assert.deepEqual(
        draws.filter((draw) => draw.image.endsWith("TrapCorner.png")).map((draw) => draw.rotation),
        [Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI],
    );
    draws.length = 0;
    r.c.Spiderlings.getSetting = () => true;
    drawCapture(r);
    r.c.KDEventMapGeneric.draw.SpiderlingsSpinnerField({}, { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
    assert.deepEqual(
        new Set(draws.map((draw) => draw.image)),
        new Set([
            "Game/Bullets/SpiderlingsSpinnerTrapSidePink.png",
            "Game/Bullets/SpiderlingsSpinnerTrapCornerPink.png",
            "Game/Bullets/SpiderlingsSpinnerTrapTopPink.png",
        ]),
    );
    assert.deepEqual(
        draws.filter((draw) => draw.image.endsWith("TrapCornerPink.png")).map((draw) => draw.rotation),
        [Math.PI / 2, Math.PI, (3 * Math.PI) / 2, 2 * Math.PI],
    );
});

test("drawing an invalid source cannot mutate capture before a native audit", () => {
    const r = contestRuntime();
    r.start();
    r.c.KDMapData.Entities[0].hp = 0;
    const before = JSON.stringify(r.c.KDGameData);
    drawCapture(r);
    assert.equal(JSON.stringify(r.c.KDGameData), before);
    r.send("afterEnemyTick");
    assert.equal(r.api.state(), undefined);
    assert.equal(r.c.KDGameData.SpiderlingsSpinnerRetries, undefined);
});

// Reuse the equipment/event fixture; native AI and field geometry have separate browser probes.
function contestRuntime(count = 2, overrides = {}) {
    let stamina = 10,
        ready = true,
        physicalPath = true;
    const nativeCalls = new Map();
    const actionCalls = [];
    const r = loadLifecycleRuntime(
        {
            KDGameData: {},
            KDMapData: { Entities: [] },
            KDPlayerEffects: {},
            KDInputTypes: {
                doattack() {
                    actionCalls.push("attack");
                    return "NativeAttack";
                },
                tryCastSpell() {
                    actionCalls.push("spell");
                    return "NativeSpell";
                },
                consumable() {
                    actionCalls.push("item");
                    return "NativeItem";
                },
            },
            KinkyDungeonLastAction: "",
            KinkyDungeonPlayerEntity: { x: 6, y: 6, player: true },
            KDGetBlockersToAddRestraint: () => [],
            KDHostile: (e) => !e.friendly,
            KDHelpless: (e) => !!e.helpless,
            KinkyDungeonIsDisabled: (e) => !!e.disabled,
            KinkyDungeonCheckPath: () => physicalPath,
            KinkyDungeonEnemyLoop: (enemy) => {
                nativeCalls.set(enemy.id, (nativeCalls.get(enemy.id) || 0) + 1);
                return {};
            },
            KinkyDungeonEnemyAt: () => true,
            KinkyDungeonHasStamina: () => stamina >= 1,
            KDChangeStamina: (_a, _b, _c, n) => {
                stamina += n;
            },
            ...overrides,
        },
        undefined,
        true,
    );
    const c = r.context,
        api = c.Spiderlings.SpinnerCapture;
    c.Spiderlings.SpinnerField = {
        captureReady: () => ready,
        contains: () => true,
        holdsAttack: () => false,
        onCaptureEnd: () => {},
        handleEnemyTurn: () => undefined,
    };
    c.Spiderlings.SpinnerNativeField = {
        isOwnedProxy: () => false,
        handleEnemyTurn: () => undefined,
        onNativeDamage() {},
        onEntry() {},
        tick() {},
        reconcile() {},
        containingComposite: () => (ready ? { id: "composite-1" } : undefined),
        captureGeometryReady: () => ready,
    };
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerRuntime.js"), "utf8"), c, {
        filename: "SpiderlingsSpinnerRuntime.js",
    });
    const send = (event, data = {}) => c.KDEventMapGeneric[event]?.SpiderlingsSpinnerCapture?.({}, data);
    const add = () => {
        const id = c.KDMapData.Entities.length + 1;
        const e = {
            id,
            x: 6 + (id % 2 ? 1 : -1),
            y: 6,
            hp: 2,
            Enemy: { name: "Spinner", attack: "MeleeEffect", attackRange: 1 },
        };
        c.KDMapData.Entities.push(e);
        return e;
    };
    for (let n = 0; n < count; n++) add();
    c.KinkyDungeonAdvanceTime = (delta) => {
        send("tick", { delta });
        for (const e of c.KDMapData.Entities) c.KinkyDungeonEnemyLoop(e, c.KinkyDungeonPlayerEntity, delta);
        send("tickAfter", { delta });
    };
    return {
        c,
        api,
        add,
        send,
        ready: (v) => {
            ready = v;
        },
        path: (v) => {
            physicalPath = v;
        },
        start: () => api.hit(c.KDMapData.Entities[0]),
        operate: (enemy) => c.KinkyDungeonEnemyLoop(enemy, c.KinkyDungeonPlayerEntity, 1),
        wait: () => c.KinkyDungeonAdvanceTime(1),
        pull: () => c.KDInputTypes.spiderlingsSpinnerPull(),
        stamina: () => stamina,
        setStamina: (value) => {
            stamina = value;
        },
        nativeCalls,
        actionCalls,
        equipment: r.equipment,
        inventoryEvents: r.inventoryEvents,
        refreshCalls: r.refreshCalls,
    };
}

function loseContest(runtime) {
    runtime.api.state().weaveProgress = 100;
    runtime.wait();
    assert.equal(runtime.api.state()?.phase, "wrap");
}

test("native admission requires a closed containing composite and two legal sources", () => {
    const r = contestRuntime(1);
    assert.equal(r.start(), false);
    r.add();
    r.ready(false);
    assert.equal(r.start(), false);
    assert.equal(r.api.item(), undefined);
    r.ready(true);
    r.path(false);
    assert.equal(r.start(), false);
    r.path(true);
    r.c.KDMapData.Entities[1].x = 20;
    assert.equal(r.start(), false);
    r.c.KDMapData.Entities[1].x = 5;
    r.c.KDMapData.Entities[1].stun = 2;
    assert.equal(r.start(), false);
    r.c.KDMapData.Entities[1].stun = 0;
    assert.equal(r.start(), true);
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1]);
    assert.equal(r.api.state().admittedCompositeId, "composite-1");
    r.ready(false);
    r.send("afterEnemyTick");
    assert.ok(r.api.state(), "field breach after admission must not cancel strands");
});

test("only the native Spinner bind-effect callback admits capture", () => {
    const r = contestRuntime();
    assert.equal(r.api.state(), undefined, "a miss or block never reaches the effect callback");
    const outcome = r.c.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        r.c.KinkyDungeonPlayerEntity,
        0,
        { profile: "Spinner" },
        undefined,
        "Enemy",
        undefined,
        r.c.KDMapData.Entities[0],
    );
    assert.equal(outcome.effect, false);
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1]);
});

test("sources join through paid enemy operations and never weave on the join operation", () => {
    const r = contestRuntime(9);
    r.start();
    const second = r.c.KDMapData.Entities[1];
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1]);
    r.operate(second);
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1, 2]);
    assert.equal(r.api.state().weaveProgress, 0);
    assert.equal(r.api.joinSource(second), false, "duplicate joins are rejected");
    for (const enemy of r.c.KDMapData.Entities.slice(2, 8)) r.operate(enemy);
    assert.equal(r.api.state().sourceIds.length, 8);
    assert.equal(r.api.joinSource(r.c.KDMapData.Entities[8]), false, "a ninth source is rejected");
});

test("formula table covers zero through eight effective sources", () => {
    const r = contestRuntime();
    const rates = [0, 6.25, 12.5, 16.5, 20.5, 24.5, 28.5, 32.5, 36.5];
    const goals = [0, 50, 75, 100, 125, 150, 175, 200, 225];
    for (let count = 0; count <= 8; count++) {
        assert.equal(r.api.weaveRate(count), rates[count]);
        assert.equal(r.api.escapeGoal(count), goals[count]);
    }
});

test("paid pull costs ten displayed stamina, advances one turn and escape wins ties", () => {
    const r = contestRuntime(2);
    r.start();
    r.wait();
    assert.equal(r.api.state().weaveProgress, 6.25, "only the hitter acted while source two joined");
    for (let n = 0; n < 2; n++) r.pull();
    assert.equal(r.api.state().escapeProgress, 50);
    assert.equal(r.stamina(), 8);
    r.api.state().weaveProgress = 87.5;
    r.pull();
    assert.equal(r.api.state(), undefined, "escape settles before simultaneous weave completion");
    assert.equal(r.api.item(), undefined);
});

test("temporary strands pin translation but delegate attacks, spells and items to native inputs", () => {
    const r = contestRuntime();
    r.start();
    r.c.KinkyDungeonNoMoveFlag = false;
    r.send("beforeMove");
    assert.equal(r.c.KinkyDungeonNoMoveFlag, true);
    assert.equal(r.c.KDInputTypes.doattack({}), "NativeAttack");
    assert.equal(r.c.KDInputTypes.tryCastSpell({}), "NativeSpell");
    assert.equal(r.c.KDInputTypes.consumable({}), "NativeItem");
    assert.deepEqual(r.actionCalls, ["attack", "spell", "item"]);
    r.setStamina(0);
    const before = JSON.stringify(r.api.state());
    assert.equal(r.pull(), "NoStamina");
    assert.equal(JSON.stringify(r.api.state()), before);
    assert.equal(r.stamina(), 0);
});

test("source audits preserve counters, lower goals and resolve at one or zero sources", () => {
    const r = contestRuntime(3);
    r.start();
    r.wait();
    const s = r.api.state();
    s.weaveProgress = 40;
    s.escapeProgress = 49;
    r.c.KDMapData.Entities[2].hp = 0;
    r.send("afterEnemyTick");
    assert.equal(s.sourceIds.length, 2);
    assert.equal(s.weaveProgress, 40);
    r.c.KDMapData.Entities[1].hp = 0;
    r.send("afterEnemyTick");
    assert.equal(s.sourceIds.length, 1);
    assert.equal(r.api.escapeGoal(1), 50);
    r.c.KDMapData.Entities[0].hp = 0;
    r.send("afterEnemyTick");
    assert.equal(r.api.state(), undefined);

    const reduced = contestRuntime(3);
    reduced.start();
    reduced.wait();
    reduced.api.state().escapeProgress = 60;
    reduced.c.KDMapData.Entities[1].hp = 0;
    reduced.c.KDMapData.Entities[2].hp = 0;
    reduced.send("afterEnemyTick");
    assert.equal(reduced.api.state(), undefined, "an already-satisfied reduced goal resolves immediately");
});

test("same-map load audits saved IDs without free work and transitions clear only capture state", () => {
    const r = contestRuntime(3);
    r.start();
    r.operate(r.c.KDMapData.Entities[1]);
    r.api.state().weaveProgress = 18.75;
    r.api.state().escapeProgress = 25;
    r.api.state().sourceIds.push(2);
    r.c.KDGameData.SpiderlingsSpinnerCapture = JSON.parse(JSON.stringify(r.api.state()));
    r.send("afterLoadGame");
    assert.equal(r.api.state().weaveProgress, 18.75);
    assert.equal(r.api.state().escapeProgress, 25);
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1, 2]);
    const stable = JSON.stringify(r.c.KDGameData);
    r.send("afterLoadGame");
    drawCapture(r);
    assert.equal(JSON.stringify(r.c.KDGameData), stable);
    r.send("postMapgen");
    assert.equal(r.api.state(), undefined);
    assert.equal(r.c.KDMapData.Entities.length, 3);
});

test("successful escape holds only effective sources for six later hostile operations", () => {
    const r = contestRuntime(2);
    r.start();
    r.wait();
    r.api.state().escapeProgress = 50;
    r.pull();
    assert.equal(r.api.state(), undefined);
    assert.equal(r.c.KDMapData.Entities[0].SpiderlingsSpinnerStunTurns, 6);
    for (let turn = 0; turn < 6; turn++) r.wait();
    assert.equal(r.nativeCalls.get(1) || 0, 0);
    r.wait();
    assert.equal(r.nativeCalls.get(1), 1, "the held source acts on the seventh later turn");
    assert.equal(r.c.KDGameData.SpiderlingsSpinnerRetries, undefined);

    const third = r.add();
    const fourth = r.add();
    assert.equal(r.api.hit(third), true, "a nonparticipant may start another legal capture immediately");
    assert.deepEqual(Array.from(r.api.state().sourceIds), [third.id]);
    assert.ok(fourth);
});

test("field admission rejects unfinished, untriggered, damaged and outside geometry", () => {
    const r = contestRuntime(),
        c = r.c;
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerField.js"), "utf8"), c);
    const f = c.Spiderlings.SpinnerField,
        nodes = [];
    c.KDMapData.Entities = [];
    c.KDMapData.RoomType = f.ROOM;
    for (let y = 3; y <= 9; y++)
        for (let x = 3; x <= 9; x++)
            if (x === 3 || x === 9 || y === 3 || y === 9) {
                const id = nodes.length + 1;
                nodes.push({ x, y, id });
                c.KDMapData.Entities.push({ id, x, y, hp: 2, Enemy: { name: f.WALL } });
            }
    const traps = [
        { x: 3, y: 3, placed: true },
        { x: 9, y: 3, placed: true },
        { x: 9, y: 9, placed: true },
        { x: 3, y: 9, placed: true },
    ];
    c.KinkyDungeonTilesGet = () => ({ SpinnerTrap: "SpiderlingsSpinnerField" });
    c.KDMapData.SpiderlingsSpinnerField = {
        phase: "preparing",
        x: 6,
        y: 6,
        nodes,
        ids: [],
        traps,
        links: traps.map((_t, i) => ({ a: i, b: (i + 1) % 4, built: true })),
    };
    assert.equal(f.captureReady(), false);
    f.field().phase = "ready";
    assert.equal(f.captureReady(), false);
    f.field().phase = "sprung";
    assert.equal(f.captureReady(), true);
    f.field().links[0].built = false;
    assert.equal(f.captureReady(), false);
    f.field().links[0].built = true;
    c.KDMapData.Entities[0].hp = 0;
    assert.equal(f.captureReady(), false);
    c.KDMapData.Entities[0].hp = 2;
    c.KinkyDungeonPlayerEntity.x = 3;
    assert.equal(f.captureReady(), false);
    c.KinkyDungeonPlayerEntity.x = 6;
    // A naturally arriving Spinner also waits for the contest instead of adding physical leg webs.
    assert.equal(f.suppressesBinding({ id: 100, x: 7, y: 6, Enemy: { name: "Spinner" } }), true);
    c.KDMapData.RoomType = "JourneyFloor";
    assert.equal(f.captureReady(), false);
});

test("the paid second-source join delays full two-source weaving until the next world turn", () => {
    const r = contestRuntime();
    r.start();
    for (let n = 0; n < 8; n++) r.wait();
    assert.equal(r.api.state().weaveProgress, 93.75);
    assert.equal(r.api.state().phase, "contest");
    r.wait();
    assert.equal(r.api.state().phase, "wrap");
    assert.equal(r.api.item(), undefined);
});

test("a lost contest creates no item and five paid wrap turns deposit one fifth each", () => {
    const r = contestRuntime(3);
    r.start();
    assert.equal(r.api.item(), undefined);
    loseContest(r);
    assert.equal(r.api.item(), undefined);
    assert.equal("wrapProgress" in r.api.state(), false, "temporary state cannot own deposited progress");

    for (const expected of [0.2, 0.4, 0.6, 0.8, 1]) {
        r.wait();
        assert.equal(r.api.item().data.wrapProgress, expected);
        assert.equal(r.c.KinkyDungeonAllRestraintDynamic().filter((entry) => entry.item.name === r.api.ID).length, 1);
    }
    assert.equal(r.api.state(), undefined);
    assert.equal(r.api.item().data.wrapProgress, 1);
});

test("wrapping waits for a paid source operation and zero sources interrupt before the first deposit", () => {
    const r = contestRuntime();
    r.start();
    loseContest(r);
    r.send("tick", { delta: 1 });
    r.send("tickAfter", { delta: 1 });
    assert.equal(r.api.state().phase, "wrap");
    assert.equal(r.api.item(), undefined, "an idle tick deposits no silk but keeps wrapping pending");

    for (const enemy of r.c.KDMapData.Entities) enemy.hp = 0;
    r.send("afterEnemyTick");
    assert.equal(r.api.state(), undefined);
    assert.equal(r.api.item(), undefined);
});

test("source loss preserves the exact partial bag and a later contest resumes its deposited progress", () => {
    const r = contestRuntime();
    r.start();
    loseContest(r);
    r.wait();
    r.wait();
    const bag = r.api.item();
    bag.lock = "Purple";
    bag.cutProgress = 0.31;
    bag.struggleProgress = 0.27;
    bag.events = [{ trigger: "sentinel" }];
    bag.data.SpiderlingsLegbinderEscapeProgress = 0.25;
    bag.data.sentinel = "keep";
    const snapshot = JSON.stringify(bag);

    for (const enemy of r.c.KDMapData.Entities) enemy.hp = 0;
    r.send("afterEnemyTick");
    assert.equal(r.api.state(), undefined);
    assert.equal(r.api.item(), bag);
    assert.equal(JSON.stringify(bag), snapshot);

    for (const enemy of r.c.KDMapData.Entities) enemy.hp = 2;
    assert.equal(r.start(), true);
    loseContest(r);
    assert.equal(r.api.state().itemId, bag.id);
    assert.equal(bag.data.wrapProgress, 0.4);
    for (const expected of [0.6, 0.8, 1]) {
        r.wait();
        assert.equal(bag.data.wrapProgress, expected);
    }
    assert.equal(r.api.item(), bag);
    assert.equal(bag.lock, "Purple");
    assert.equal(bag.cutProgress, 0.31);
    assert.equal(bag.struggleProgress, 0.27);
    assert.equal(bag.data.SpiderlingsLegbinderEscapeProgress, 0.25);
    assert.equal(bag.data.sentinel, "keep");
});

test("one surviving source completes wrapping and field loss does not interrupt it", () => {
    const r = contestRuntime();
    r.start();
    loseContest(r);
    r.ready(false);
    r.send("afterEnemyTick");
    assert.equal(r.api.state().phase, "wrap");
    r.c.KDMapData.Entities[1].hp = 0;
    r.send("afterEnemyTick");
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1]);
    for (let turn = 0; turn < 5; turn++) r.wait();
    assert.equal(r.api.item().data.wrapProgress, 1);
    assert.equal(r.api.state(), undefined);
});

test("death, incapacity, range, and physical LOS each interrupt wrapping at zero effective sources", () => {
    for (const invalidate of [
        (r) => {
            for (const enemy of r.c.KDMapData.Entities) enemy.hp = 0;
        },
        (r) => {
            for (const enemy of r.c.KDMapData.Entities) enemy.helpless = true;
        },
        (r) => {
            for (const enemy of r.c.KDMapData.Entities) enemy.x = 20;
        },
        (r) => r.path(false),
    ]) {
        const r = contestRuntime();
        r.start();
        loseContest(r);
        r.wait();
        const bag = r.api.item();
        invalidate(r);
        r.send("afterEnemyTick");
        assert.equal(r.api.state(), undefined);
        assert.equal(r.api.item(), bag);
        assert.equal(bag.data.wrapProgress, 0.2);
    }
});

test("native-compatible ItemLegs linking preserves an external instance and normal unlink restores it", () => {
    const r = contestRuntime();
    const external = item("ExternalLegCuffs", {
        id: 7001,
        group: "ItemLegs",
        lock: "Gold",
        cutProgress: 0.33,
        struggleProgress: 0.44,
        data: { sentinel: "external" },
        events: [{ trigger: "external" }],
        dynamicLink: item("ExternalLegRope", { id: 7002, group: "ItemLegs", data: { inner: true } }),
    });
    r.equipment.set("ItemLegs", external);
    const snapshot = JSON.stringify(external);
    r.start();
    loseContest(r);
    for (let turn = 0; turn < 5; turn++) r.wait();
    const bag = r.api.item();
    assert.equal(bag.dynamicLink, external);
    assert.equal(JSON.stringify(external), snapshot);
    assert.deepEqual(r.c.KinkyDungeonRemoveRestraintSpecific(bag, true), [bag]);
    assert.equal(r.equipment.get("ItemLegs"), external);
    assert.equal(JSON.stringify(external), snapshot);
});

test("blockers and a zero native-add result stop wrapping without fake equipment or mutation", () => {
    let addCalls = 0;
    const blocked = contestRuntime(2, {
        KDGetBlockersToAddRestraint: () => [blockedItem],
        KinkyDungeonAddRestraint: () => {
            addCalls += 1;
            return 1;
        },
    });
    const blockedItem = item("ExternalRigidLegs", {
        id: 7100,
        group: "ItemLegs",
        lock: "Blue",
        data: { sentinel: true },
    });
    blocked.equipment.set("ItemLegs", blockedItem);
    const blockedSnapshot = JSON.stringify(blockedItem);
    blocked.start();
    loseContest(blocked);
    blocked.wait();
    assert.equal(addCalls, 0);
    assert.equal(blocked.api.state(), undefined);
    assert.equal(blocked.equipment.get("ItemLegs"), blockedItem);
    assert.equal(JSON.stringify(blockedItem), blockedSnapshot);

    let preflightCalls = 0;
    const rejected = contestRuntime(2, {
        KDCanAddRestraint: () => {
            preflightCalls += 1;
            return true;
        },
        KinkyDungeonAddRestraint: () => 0,
    });
    rejected.start();
    loseContest(rejected);
    rejected.wait();
    assert.equal(preflightCalls, 1);
    assert.equal(rejected.api.state(), undefined);
    assert.equal(rejected.api.item(), undefined);
});

test("the first deposit uses deep no-overpower preflight and the same acting source for native addition", () => {
    let equipment;
    let checked;
    let addedSource;
    const r = contestRuntime(2, {
        KDCanAddRestraint(...args) {
            checked = args;
            return true;
        },
        KinkyDungeonAddRestraint(...args) {
            addedSource = args[13];
            equipment.set("ItemLegs", {
                name: args[0].name,
                id: 7150,
                group: "ItemLegs",
                restraint: args[0],
                data: {},
            });
            return 1;
        },
    });
    equipment = r.equipment;
    r.start();
    loseContest(r);
    r.wait();
    assert.equal(checked[4], undefined, "the empty ItemLegs root is checked");
    assert.equal(checked[5], true, "deep native linking is enabled");
    assert.equal(checked[6], true, "native overpower replacement is disabled");
    assert.equal(checked[7], r.c.KDMapData.Entities[0]);
    assert.equal(addedSource, checked[7]);
    assert.equal(r.api.item().data.wrapProgress, 0.2);
});

test("wrapping never mutates arms, leash carrier, tether ownership, or leash controller state", () => {
    const r = contestRuntime();
    const arms = item("ExternalArmbinder", { id: 7200, group: "ItemArms", data: { sentinel: "arms" } });
    const leash = item("ExternalSilkLeash", {
        id: 7201,
        group: "ItemNeckRestraints",
        lock: "Red",
        data: { sentinel: "leash" },
    });
    r.equipment.set("ItemArms", arms);
    r.equipment.set("ItemNeckRestraints", leash);
    r.c.KinkyDungeonPlayerEntity.leash = { entity: 999, reason: "external" };
    r.c.KDGameData.SpiderlingsSilkLeash = { sourceIds: [999], pullerId: 999, sentinel: true };
    const before = JSON.stringify({
        arms,
        leash,
        tether: r.c.KinkyDungeonPlayerEntity.leash,
        control: r.c.KDGameData.SpiderlingsSilkLeash,
    });
    r.start();
    assert.equal(r.api.isControllingPlayer(), true);
    assert.equal(r.api.phase(), "contest");
    loseContest(r);
    assert.equal(r.api.phase(), "wrap");
    for (let turn = 0; turn < 5; turn++) r.wait();
    assert.equal(r.api.isControllingPlayer(), false);
    assert.equal(
        JSON.stringify({
            arms,
            leash,
            tether: r.c.KinkyDungeonPlayerEntity.leash,
            control: r.c.KDGameData.SpiderlingsSilkLeash,
        }),
        before,
    );
});

test("active partial wrapping survives JSON load without a free deposit and transition cleanup leaves the item intact", () => {
    const r = contestRuntime();
    r.start();
    loseContest(r);
    r.wait();
    r.wait();
    const savedId = r.api.item().id;
    r.equipment.set("ItemLegs", JSON.parse(JSON.stringify(r.api.item())));
    r.c.KDGameData = JSON.parse(JSON.stringify(r.c.KDGameData));
    r.send("afterLoadGame");
    assert.equal(r.api.item().id, savedId);
    assert.equal(r.api.item().data.wrapProgress, 0.4);
    assert.equal(r.api.state().itemId, savedId);
    const loaded = JSON.stringify({ state: r.api.state(), item: r.api.item() });
    r.send("afterLoadGame");
    drawCapture(r);
    assert.equal(JSON.stringify({ state: r.api.state(), item: r.api.item() }), loaded);

    for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterNewGame"]) {
        const branch = contestRuntime();
        branch.start();
        loseContest(branch);
        branch.wait();
        const bag = branch.api.item();
        bag.data.sentinel = trigger;
        const snapshot = JSON.stringify(bag);
        branch.send(trigger);
        assert.equal(branch.api.state(), undefined, trigger);
        assert.equal(branch.api.item(), bag, trigger);
        assert.equal(JSON.stringify(bag), snapshot, trigger);
    }
});

test("load rejects a missing or replaced active bag and keeps complete and interrupted items stable", () => {
    for (const replacement of [undefined, item("SpiderlingsSpinnerLegbinder", { id: 9999, group: "ItemLegs" })]) {
        const active = contestRuntime();
        active.start();
        loseContest(active);
        active.wait();
        if (replacement) active.equipment.set("ItemLegs", replacement);
        else active.equipment.delete("ItemLegs");
        const snapshot = replacement && JSON.stringify(replacement);
        active.send("afterLoadGame");
        assert.equal(active.api.state(), undefined);
        assert.equal(active.api.item(), replacement);
        if (replacement) assert.equal(JSON.stringify(replacement), snapshot);
    }

    const complete = contestRuntime();
    complete.start();
    loseContest(complete);
    for (let turn = 0; turn < 5; turn++) complete.wait();
    complete.equipment.set("ItemLegs", JSON.parse(JSON.stringify(complete.api.item())));
    const completed = complete.api.item();
    complete.send("afterLoadGame");
    complete.send("afterLoadGame");
    assert.equal(complete.api.state(), undefined);
    assert.equal(complete.api.item(), completed);
    assert.equal(completed.data.wrapProgress, 1);
    assert.equal(complete.start(), false, "a complete bag blocks another contest");

    const interrupted = contestRuntime();
    interrupted.start();
    loseContest(interrupted);
    interrupted.wait();
    for (const enemy of interrupted.c.KDMapData.Entities) enemy.hp = 0;
    interrupted.send("afterEnemyTick");
    interrupted.equipment.set("ItemLegs", JSON.parse(JSON.stringify(interrupted.api.item())));
    interrupted.c.KDGameData = JSON.parse(JSON.stringify(interrupted.c.KDGameData));
    interrupted.send("afterLoadGame");
    assert.equal(interrupted.api.state(), undefined);
    assert.equal(interrupted.api.item().data.wrapProgress, 0.2);
    for (const enemy of interrupted.c.KDMapData.Entities) enemy.hp = 2;
    interrupted.start();
    loseContest(interrupted);
    assert.equal(interrupted.api.state().itemId, interrupted.api.item().id);
    for (let turn = 0; turn < 4; turn++) interrupted.wait();
    assert.equal(interrupted.api.item().data.wrapProgress, 1);
});

test("rendering a resumed contest reads the deposited item and never changes saved authority", () => {
    const r = contestRuntime();
    const bag = item("SpiderlingsSpinnerLegbinder", {
        id: 7300,
        group: "ItemLegs",
        data: { wrapProgress: 0.4, sentinel: true },
    });
    r.equipment.set("ItemLegs", bag);
    r.start();
    r.api.state().weaveProgress = 90;
    const before = JSON.stringify({ state: r.api.state(), item: bag });
    const amounts = [...drawCapture(r), ...drawCapture(r)];
    assert.ok(amounts.length > 0);
    assert.ok(amounts.every((amount) => amount >= 0.4));
    assert.equal(JSON.stringify({ state: r.api.state(), item: bag }), before);
});

test("capture holds hostile spider attacks on the player through wrapping and releases on interruption", () => {
    const r = contestRuntime(),
        p = r.c.KinkyDungeonPlayerEntity;
    const spider = {
        id: 30,
        x: 8,
        y: 6,
        hp: 1,
        attackPoints: 3,
        warningTiles: [{ x: 6, y: 6 }],
        Enemy: { name: "WebCaster", tags: { spiderlings: true } },
    };
    let audits = 0;
    r.c.Spiderlings.JumperDash = { runtimeController: { auditSources: () => audits++ } };
    r.start();
    assert.equal(audits, 1, "cancel already winding player dashes at capture entry");
    assert.equal(r.api.holdsSpiderAttack(spider, p), true);
    assert.equal(r.api.holdsSpiderAttack(spider, { Enemy: { name: "Bandit" } }), false);
    assert.equal(r.api.holdsSpiderAttack({ ...spider, friendly: true }, p), false);
    assert.equal(r.api.holdsSpiderAttack({ ...spider, Enemy: { name: "Bandit" } }, p), false);
    r.c.KinkyDungeonEnemyLoop(spider, p, 1);
    assert.equal(spider.attackPoints, 0);
    assert.equal(spider.warningTiles.length, 0);
    for (let n = 0; n < 9; n++) r.wait();
    assert.equal(r.api.state().phase, "wrap");
    assert.equal(r.api.holdsSpiderAttack(spider, p), true);
    r.api.cancel();
    assert.equal(r.api.holdsSpiderAttack(spider, p), false);
});

test("a leg bag gates only its own covered lower layers and preserves external and upper-body operations", () => {
    const r = loadLifecycleRuntime({}, undefined, true),
        api = r.context.Spiderlings.Webbing;
    const bag = item("SpiderlingsSpinnerLegbinder", { group: "ItemLegs", data: { wrapProgress: 0.5 } });
    r.equipment.set("ItemLegs", bag);
    for (const family of ["Legs", "Ankles", "Foot"])
        assert.equal(api.pairedOuterLayerFor(item("SpiderlingsWebbingLv1" + family)), bag);
    assert.equal(api.pairedOuterLayerFor(item("SpiderlingsWebbingLv1Arm")), undefined);
    assert.equal(api.pairedOuterLayerFor(item("ExternalLegCuffs")), undefined);
    r.equipment.delete("ItemLegs");
    assert.equal(api.pairedOuterLayerFor(item("SpiderlingsWebbingLv1Legs")), undefined);
});

test("leg-bag escape counts a legal cutting affinity even when the weapon canCut flag is false", () => {
    const r = loadLifecycleRuntime(
        { KDGroupBlocked: () => false, KinkyDungeonHasStamina: () => true },
        undefined,
        true,
    );
    const target = item("SpiderlingsSpinnerLegbinder", { group: "ItemLegs", data: { wrapProgress: 1 } });
    r.equipment.set("ItemLegs", target);
    const before = r.inventoryEvents["beforeStruggleCalc:SpiderlingsLegbinderEscape"];
    const after = r.inventoryEvents["struggle:SpiderlingsLegbinderEscape"];
    const attempt = (method) => ({
        restraint: target,
        struggleType: method,
        struggleGroup: "ItemLegs",
        cost: -0.2,
        canCut: false,
        hasAffinity: true,
    });
    const query = { ...attempt("Cut"), query: true };
    before({}, target, query);
    after({}, target, { ...query, result: "Fail" });
    assert.equal(target.data.SpiderlingsLegbinderEscapeProgress, undefined);
    for (const method of ["Cut", "Remove", "Cut", "Struggle"]) {
        const data = attempt(method);
        before({}, target, data);
        assert.equal(data.escapeSpeed, 0);
        after({}, target, { ...data, result: "Fail" });
        after({}, target, { ...data, result: "Fail" });
    }
    const final = attempt("Remove");
    before({}, target, final);
    assert.equal(target.cutProgress, 1);
    const finish = r.inventoryEvents["beforeSuccessRemove:SpiderlingsFinalEscapeOutcome"];
    finish({}, target, final);
    assert.equal(final.destroyChance, 0);
    finish({}, target, { ...final, struggleType: "Cut" });
});

test("full and incomplete bags require the specified effective Cut, Remove, and Struggle counts", () => {
    for (const [wrapProgress, method, steps] of [
        [1, "Cut", 4],
        [1, "Remove", 6],
        [1, "Struggle", 6],
        [0.8, "Cut", 2],
        [0.8, "Remove", 3],
        [0.8, "Struggle", 3],
    ]) {
        let stamina = true;
        let blocked = false;
        const r = loadLifecycleRuntime(
            {
                KDGroupBlocked: () => blocked,
                KinkyDungeonHasStamina: () => stamina,
            },
            undefined,
            true,
        );
        const target = item("SpiderlingsSpinnerLegbinder", {
            id: 7400,
            group: "ItemLegs",
            data: { wrapProgress },
        });
        r.equipment.set("ItemLegs", target);
        const before = r.inventoryEvents["beforeStruggleCalc:SpiderlingsLegbinderEscape"];
        const after = r.inventoryEvents["struggle:SpiderlingsLegbinderEscape"];
        const attempt = (extra = {}) => ({
            restraint: target,
            struggleType: method,
            struggleGroup: "ItemLegs",
            cost: -0.2,
            canCut: true,
            escapeChance: 100,
            ...extra,
        });

        for (const invalid of [{ query: true }, ...(method === "Cut" ? [{ canCut: false, hasAffinity: false }] : [])]) {
            const data = attempt(invalid);
            before({}, target, data);
            after({}, target, { ...data, result: "Fail" });
        }
        stamina = false;
        let data = attempt();
        before({}, target, data);
        after({}, target, { ...data, result: "Fail" });
        stamina = true;
        blocked = true;
        data = attempt();
        before({}, target, data);
        after({}, target, { ...data, result: "Fail" });
        blocked = false;
        assert.equal(target.data.SpiderlingsLegbinderEscapeProgress, undefined);

        for (let action = 1; action < steps; action++) {
            data = attempt();
            before({}, target, data);
            after({}, target, { ...data, result: "Fail" });
            after({}, target, { ...data, result: "Fail" });
            assert.ok(Math.abs(target.data.SpiderlingsLegbinderEscapeProgress - action / steps) < 1e-8);
        }
        data = attempt();
        before({}, target, data);
        assert.equal(data.escapeChance, 1, `${wrapProgress}:${method}`);
        assert.equal(data.escapePenalty, -100, `${wrapProgress}:${method}`);
    }
});
