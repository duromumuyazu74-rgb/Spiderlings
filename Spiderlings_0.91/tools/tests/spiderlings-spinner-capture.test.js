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

test("drawing observes membership without changing saved progress, migration fields or participants", () => {
    const r = contestRuntime();
    r.start();
    r.pull();
    r.add();
    const s = r.api.state();
    delete s.weaveProgress;
    delete s.escapeProgress;
    s.remaining = 2;
    s.successes = 1;
    const before = JSON.stringify(r.c.KDGameData);
    drawCapture(r);
    drawCapture(r);
    assert.equal(JSON.stringify(r.c.KDGameData), before);
    r.send("afterLoadGame");
    assert.equal(r.api.state().weaveProgress, 50);
    assert.equal(r.api.state().escapeProgress, 25);
    assert.equal(r.api.state().ids.length, 3);
    assert.equal(r.api.state().remaining, undefined);
});

test("drawing an invalid capture cannot cancel it or assign retry state before the native audit event", () => {
    const r = contestRuntime();
    r.start();
    r.c.KDMapData.Entities[0].hp = 0;
    const before = JSON.stringify(r.c.KDGameData);
    drawCapture(r);
    assert.equal(JSON.stringify(r.c.KDGameData), before);
    r.send("afterEnemyTick");
    assert.equal(r.api.state(), undefined);
});

// Reuse the equipment/event fixture; native AI and field geometry have separate browser probes.
function contestRuntime(count = 2) {
    let stamina = 10,
        ready = true;
    const r = loadLifecycleRuntime(
        {
            KDGameData: {},
            KDMapData: { Entities: [] },
            KinkyDungeonLastAction: "",
            KinkyDungeonPlayerEntity: { x: 6, y: 6, player: true },
            KDGetBlockersToAddRestraint: () => [],
            KDHostile: (e) => !e.friendly,
            KDHelpless: (e) => !!e.helpless,
            KinkyDungeonIsDisabled: (e) => !!e.disabled,
            KinkyDungeonCheckLOS: (e, p, d, range) => d <= range,
            KinkyDungeonEnemyLoop: () => ({}),
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
    };
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
        start: () => api.hit(c.KDMapData.Entities[0]),
        wait: () => c.KinkyDungeonAdvanceTime(1),
        pull: () => c.KDInputTypes.spiderlingsSpinnerPull(),
        stamina: () => stamina,
    };
}

test("Spinner contest requires a ready field and at least two legal participants", () => {
    const r = contestRuntime(1);
    assert.equal(r.start(), false);
    r.add();
    r.ready(false);
    assert.equal(r.start(), false);
    assert.equal(r.api.item(), undefined);
    r.ready(true);
    r.c.KDMapData.Entities[1].stun = 2;
    assert.equal(r.start(), false);
    r.c.KDMapData.Entities[1].stun = 0;
    assert.equal(r.start(), true);
    r.ready(false);
    r.send("afterEnemyTick");
    assert.equal(r.api.state(), undefined);
});

test("additional Spinners accelerate weaving and require more paid escape work", () => {
    const two = contestRuntime(2),
        three = contestRuntime(3);
    two.start();
    three.start();
    for (let n = 0; n < 2; n++) {
        two.pull();
        three.pull();
    }
    assert.equal(two.api.state().weaveProgress, 25);
    assert.equal(three.api.state().weaveProgress, 33);
    assert.equal(two.api.state().escapeProgress, 50);
    assert.equal(three.api.state().escapeGoal, 100);
    two.pull();
    three.pull();
    assert.equal(two.api.state(), undefined);
    assert.ok(three.api.state());
    three.pull();
    assert.equal(three.api.state(), undefined);
    assert.equal(three.stamina(), 6);
    assert.equal(three.api.item(), undefined);
});

test("mid-contest arrivals preserve earned work and do not advance on a zero-time audit", () => {
    const r = contestRuntime();
    r.start();
    r.pull();
    const e = r.add();
    r.send("afterEnemyTick");
    assert.ok(r.api.state().ids.includes(e.id));
    assert.equal(r.api.state().escapeProgress, 25);
    assert.equal(r.api.state().escapeGoal, 100);
    assert.equal(r.api.state().weaveProgress, 12.5);
    r.wait();
    assert.equal(r.api.state().weaveProgress, 29);
    assert.equal(r.api.item(), undefined);
    e.hp = 0;
    r.send("afterEnemyTick");
    assert.equal(r.api.state().escapeGoal, 75);
    assert.equal(r.api.state().escapeProgress, 25);
    r.c.KDMapData.Entities[0].hp = 0;
    r.send("afterEnemyTick");
    assert.equal(r.api.state(), undefined);
});

test("weaving completion keeps the contest visual-only and deposits silk only on the following world turn", () => {
    const r = contestRuntime(4);
    r.start();
    r.wait();
    for (let n = 0; n < 4; n++) r.pull();
    assert.equal(r.api.state().phase, "wrap");
    assert.equal(r.api.state().escapeProgress, 100);
    assert.equal(r.api.item(), undefined);
    r.wait();
    assert.equal(r.api.item().data.wrapProgress, 0.2);
});

test("loading a legacy contest converts both progress counters without granting progress", () => {
    const r = contestRuntime();
    r.start();
    const s = r.api.state();
    delete s.weaveProgress;
    delete s.escapeProgress;
    s.remaining = 2;
    s.successes = 1;
    r.send("afterLoadGame");
    assert.equal(r.api.state().weaveProgress, 50);
    assert.equal(r.api.state().escapeProgress, 25);
    assert.equal(r.api.state().remaining, undefined);
    assert.equal(r.api.item(), undefined);
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

test("two Spinners need eight world turns and a simultaneous escape wins", () => {
    const r = contestRuntime();
    r.start();
    for (let n = 0; n < 7; n++) r.wait();
    assert.equal(r.api.state().weaveProgress, 87.5);
    assert.equal(r.api.state().phase, "contest");
    r.wait();
    assert.equal(r.api.state().phase, "wrap");
    assert.equal(r.api.item(), undefined);
    const tie = contestRuntime();
    tie.start();
    for (let n = 0; n < 5; n++) tie.wait();
    for (let n = 0; n < 3; n++) tie.pull();
    assert.equal(tie.api.state(), undefined);
    assert.equal(tie.api.item(), undefined);
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
    for (let n = 0; n < 8; n++) r.wait();
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
