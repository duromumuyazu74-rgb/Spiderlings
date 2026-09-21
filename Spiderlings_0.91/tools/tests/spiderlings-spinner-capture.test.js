"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadLifecycleRuntime, item, modRoot } = require("./helpers/lifecycle-runtime.js");

function drawCapture(runtime) {
    const c = runtime.c;
    c.KDCurrentModels = new Map();
    c.KinkyDungeonPlayer = {};
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
}

test("drawing observes schema-2 membership without mutating capture authority", () => {
    const r = contestRuntime();
    r.start();
    r.operate(r.c.KDMapData.Entities[1]);
    const before = JSON.stringify(r.c.KDGameData);
    drawCapture(r);
    drawCapture(r);
    assert.equal(JSON.stringify(r.c.KDGameData), before);
    assert.deepEqual(Array.from(r.api.state().sourceIds), [1, 2]);
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
function contestRuntime(count = 2) {
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
    };
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
