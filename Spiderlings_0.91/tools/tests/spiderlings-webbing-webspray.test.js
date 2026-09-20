"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const modRoot = path.join(__dirname, "..", "..");
const families = [
    "Arm",
    "MittenLeft",
    "MittenRight",
    "Belly",
    "Legs",
    "Ankles",
    "Foot",
    "Blindfold",
    "Stuffing",
    "Gag",
];
const lv2Families = ["Arm", "Belly", "Legs", "Ankles", "Foot"];
const lv3Families = ["Arm", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Gag", "Hood"];
const groups = {
    Arm: "ItemArms",
    MittenLeft: "ItemHands",
    MittenRight: "ItemHands",
    Belly: "ItemTorso",
    Legs: "ItemLegs",
    Ankles: "ItemFeet",
    Foot: "ItemBoots",
    Blindfold: "ItemHead",
    Stuffing: "ItemMouth",
    Gag: "ItemMouth",
};
const provenance = "WebCaster.WebSpray";

function crossfireRuntime(globals = {}, nativeSources = []) {
    const casters = [1, 2, 3].map((id) => ({ id, hp: 1, aware: true, x: 8, y: 5 + id, Enemy: { name: "WebCaster" } }));
    const messages = [];
    const runtime = loadRuntime({
        nativeSources,
        globals: {
            KDMapData: { Entities: casters },
            KDHostile: () => true,
            KDHelpless: () => false,
            KinkyDungeonCheckPath: () => true,
            KinkyDungeonSendActionMessage: (...args) => messages.push(args),
            ...globals,
        },
    });
    Object.assign(runtime.context.KinkyDungeonPlayerEntity, { x: 5, y: 5 });
    return {
        ...runtime,
        casters,
        messages,
        hit(index, source = "direct") {
            return runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit(
                null,
                "glue",
                { provenance, triggerSource: source },
                null,
                "Enemy",
                { bullet: { source: casters[index].id } },
                casters[index],
            );
        },
        worn() {
            return runtime.context.KinkyDungeonAllRestraintDynamic().length;
        },
    };
}

test("different living WebCasters weave one bonus restraint per player turn without extra slow", () => {
    const damage = [];
    const r = crossfireRuntime({ KinkyDungeonDealDamage: (d) => damage.push(plain(d)) });
    r.hit(0);
    assert.equal(r.worn(), 1);
    r.hit(1);
    assert.equal(r.worn(), 3);
    assert.equal(r.buffs.SpiderlingsWebSpraySlow.power, 2);
    r.hit(2);
    assert.equal(r.worn(), 4);
    assert.equal(r.messages.length, 1);
    assert.deepEqual(
        damage.map((d) => d.damage),
        [0.05, 0.05, 0.05],
        "bonus binding does not add another contact",
    );
    r.event("tickAfter", { delta: 1 });
    r.hit(0);
    assert.equal(r.worn(), 6);
    assert.deepEqual(
        r.casters.map((e) => e.hp),
        [1, 1, 1],
    );
});

test("crossfire expires, breaks on lost partners, ignores trails and cannot skip Cocoon prerequisites", () => {
    for (const invalidate of [
        (r) => {
            r.casters[0].hp = 0;
        },
        (r) => {
            r.casters[0].stun = 1;
        },
        (r) => {
            r.casters[0].freeze = 1;
        },
        (r) => {
            r.casters[0].silence = 1;
        },
        (r) => {
            r.context.KinkyDungeonCheckPath = () => false;
        },
        (r) => {
            r.casters.splice(0, 1);
        },
        (r) => {
            r.event("tickAfter", { delta: 3 });
        },
        (r) => {
            r.event("postMapgen");
        },
    ]) {
        const r = crossfireRuntime();
        r.hit(0);
        invalidate(r);
        r.hit(1);
        assert.equal(r.worn(), 2);
    }
    const r = crossfireRuntime();
    r.hit(0);
    r.hit(0);
    r.hit(1, "trail");
    assert.equal(r.worn(), 3);
    assert.equal(r.messages.length, 0);
    r.event("tickAfter", { delta: 2 });
    r.hit(1);
    assert.equal(r.worn(), 5, "the two-turn boundary is still eligible");
    const full = crossfireRuntime();
    full.seed(families);
    full.seed(lv2Families, 2);
    full.seed(
        lv3Families.filter((f) => f !== "Hood"),
        3,
    );
    full.hit(0);
    full.hit(1);
    assert.equal(full.worn(), 23);
    assert.equal(full.equipment.has("ItemDevices"), false);
    full.hit(0);
    full.hit(1);
    full.hit(0);
    assert.equal(full.equipment.has("ItemDevices"), false, "five pre-existing slow stacks required");
    full.hit(1);
    assert.equal(full.worn(), 24);
});

test("WebCasters prefer separated firing directions through the native direction seam", () => {
    const r = crossfireRuntime({
        AIData: { kite: true, MovableTiles: "0", AvoidTiles: "", ignoreLocks: false },
        KDGetDir: () => ({ x: 1, y: 0, delta: 1 }),
        KDEnemyHasFlag: () => false,
        KDIsImmobile: () => false,
        KinkyDungeonEnemyCanMove: () => true,
    });
    const e = r.casters[0];
    Object.assign(e, { x: 8, y: 5 });
    Object.assign(r.casters[1], { x: 9, y: 5 });
    r.casters[2].hp = 0;
    const dir = r.context.KDGetDir(e, r.context.KinkyDungeonPlayerEntity);
    assert.notEqual(dir.y, 0, "choose a side step to spread firing angles");
    assert.equal(e.x, 8, "direction preference does not spend a move or teleport");
    r.context.KinkyDungeonEnemyCanMove = (_e, dir) => dir.x === 1 && dir.y === -1;
    assert.deepEqual(
        plain(r.context.KDGetDir(e, r.context.KinkyDungeonPlayerEntity)),
        { x: 1, y: -1, delta: 1.5 },
        "diagonal movement retains native cost",
    );
    r.context.KinkyDungeonEnemyCanMove = () => false;
    assert.deepEqual(plain(r.context.KDGetDir(e, r.context.KinkyDungeonPlayerEntity)), { x: 1, y: 0, delta: 1 });
    r.context.KinkyDungeonEnemyCanMove = () => true;
    r.casters[1].stun = 1;
    assert.deepEqual(plain(r.context.KDGetDir(e, r.context.KinkyDungeonPlayerEntity)), { x: 1, y: 0, delta: 1 });
    r.casters[1].stun = 0;
    for (const state of ["immobile", "StayHere", "overrideMove", "solo", "noKite"]) {
        r.context.KDIsImmobile = () => state === "immobile";
        r.context.KDEnemyHasFlag = (_e, flag) => flag === state;
        r.casters[1].hp = state === "solo" ? 0 : 1;
        r.context.AIData.kite = state !== "noKite";
        assert.deepEqual(
            plain(r.context.KDGetDir(e, r.context.KinkyDungeonPlayerEntity)),
            { x: 1, y: 0, delta: 1 },
            state,
        );
    }
});

test("WebCaster angle preference preserves native retreat from NPC rivals and path goals", () => {
    const source = fs.readFileSync(
        path.join(modRoot, "../KinkiestDungeon-5.5/Game/src/enemy/KinkyDungeonEnemies.ts"),
        "utf8",
    );
    const start = source.indexOf("function KDGetDir(");
    const end = source.indexOf("function KDPullResistance(", start);
    assert.ok(start >= 0 && end > start);
    const direction = (x, y) => ({ x: Math.sign(x), y: Math.sign(y), delta: x && y ? 1.5 : 1 });
    const r = crossfireRuntime(
        {
            AIData: { kite: true, MovableTiles: "0", AvoidTiles: "", ignoreLocks: false },
            KinkyDungeonGetDirectionRandom: direction,
            KDEnemyHasFlag: () => false,
            KDIsImmobile: () => false,
            KinkyDungeonEnemyCanMove: () => true,
        },
        [source.slice(start, end)],
    );
    const e = r.casters[0];
    Object.assign(e, { x: 8, y: 5 });
    Object.assign(r.casters[1], { x: 9, y: 5 });
    r.casters[2].hp = 0;
    const maid = { x: 7, y: 5, hp: 10, Enemy: { name: "Maid", faction: "Maidforce" } };
    for (const target of [maid, { x: 7, y: 5 }, { x: 5, y: 5 }]) {
        assert.deepEqual(
            plain(r.context.KDGetDir(e, target)),
            direction(e.x - target.x, e.y - target.y),
            "NPC and coordinate targets keep their native direction even with a nearby player and partner",
        );
    }
    assert.notEqual(
        r.context.KDGetDir(e, r.context.KinkyDungeonPlayerEntity).y,
        0,
        "direct player targeting still spreads firing angles",
    );
});

test("crossfire rechecks native equipment eligibility after the primary hit and retries on a later hit", () => {
    const r = crossfireRuntime();
    r.hit(0);
    r.context.KDCanAddRestraint = () => r.worn() < 2;
    r.hit(1);
    assert.equal(r.worn(), 2, "the bonus cannot force a now-blocked item");
    assert.equal(r.messages.length, 0);
    r.context.KDCanAddRestraint = () => true;
    r.hit(0);
    assert.equal(r.worn(), 4, "an unsuccessful bonus did not consume the turn allowance");
});

test("losing sight for a player action discards the old mark even after sight returns", () => {
    const r = crossfireRuntime();
    r.hit(0);
    r.context.KinkyDungeonCheckPath = () => false;
    r.event("tick", { delta: 1 });
    r.context.KinkyDungeonCheckPath = () => true;
    r.hit(1);
    assert.equal(r.worn(), 2);
});

test("KD 5.5 native player effects preserve projectile source identity for crossfire", () => {
    const source = fs.readFileSync(
        path.join(modRoot, "../KinkiestDungeon-5.5/Game/src/magic/KinkyDungeonPlayerEffects.ts"),
        "utf8",
    );
    const start = source.indexOf("function KinkyDungeonPlayerEffect(");
    const end = source.indexOf("function KDTripleBuffKill", start);
    assert.ok(start >= 0 && end > start);
    const r = crossfireRuntime(
        { KinkyDungeonRootDirectory: "", KinkyDungeonPlaySound() {}, KinkyDungeonInterruptSleep() {} },
        [source.slice(start, end)],
    );
    const spell = r.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    for (const caster of r.casters.slice(0, 2))
        r.context.KinkyDungeonPlayerEffect(
            r.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { bullet: { source: caster.id } },
        );
    assert.equal(r.worn(), 3, "the entity argument can be absent while bullet.source still identifies the caster");
});

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function restraintId(family) {
    return `SpiderlingsWebbingLv1${family}`;
}

function catalog() {
    return families.map((family) => ({
        id: restraintId(family),
        family,
        group: groups[family],
        stage: "Lv1",
        requiredActions: 1,
    }));
}

function blankSlow() {
    return { stacks: 0, inactiveTurns: 0, lastTriggerTurn: null, lastTrailTurn: null };
}

function resolverSnapshot(items = [], slow = blankSlow()) {
    const grouped = {};
    for (const item of items) {
        grouped[item.group] = grouped[item.group] || [];
        grouped[item.group].push(item);
    }
    const compatibility = Object.fromEntries(catalog().map((entry) => [entry.id, true]));
    return {
        items,
        groups: grouped,
        registered: { ...compatibility },
        poseCompatible: { ...compatibility },
        addCompatible: { ...compatibility },
        webSpray: slow,
    };
}

function loadRuntime(options = {}) {
    const equipment = new Map();
    const addCalls = [];
    const buffs = {};
    const player = { player: true, id: -1 };
    const context = {
        console,
        globalThis: null,
        window: null,
        KinkyDungeonEnemies: [],
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDEventMapInventory: {},
        KDEventMapSpell: {},
        KDPlayerEffects: { TrapBindings: () => ({ effect: true }) },
        KDModConfigs: {},
        KDModSettings: {},
        KinkyDungeonFlags: new Map(),
        KinkyDungeonPlayer: player,
        KinkyDungeonPlayerEntity: player,
        KinkyDungeonPlayerBuffs: buffs,
        KDGameData: { PrisonerState: "" },
        KDCurrentModels: new Map([[player, { Poses: { Closed: true, Wristtie: true } }]]),
        KDTapeLink: ["Wrapping"],
        KDTapeRender: ["Wrapping"],
        KDBindable: "Bindable",
        KDDevices: "Devices",
        KDCorsetLink: "Corsets",
        KDHarnessLink: "Harnesses",
        KDElbowBind: "ElbowBind",
        KDWrappable: "Wrappable",
        KDRandom: options.random || (() => 0),
        KDMapInit(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        KDAddEvent(map, trigger, type, handler) {
            map[trigger] = map[trigger] || {};
            map[trigger][type] = handler;
        },
        KinkyDungeonAddRestraintText() {},
        addTextKey() {},
        KinkyDungeonRefreshRestraintsCache() {},
        KinkyDungeonRefreshEnemiesCache() {},
        KinkyDungeonGetRestraintByName(name) {
            return context.KinkyDungeonRestraints.find((restraint) => restraint.name === name);
        },
        KinkyDungeonGetRestraintItem(group) {
            return equipment.get(group);
        },
        KinkyDungeonAllRestraintDynamic() {
            const entries = [];
            for (const root of equipment.values()) {
                const seen = new Set();
                let item = root;
                while (item && !seen.has(item)) {
                    seen.add(item);
                    entries.push({ item });
                    item = item.dynamicLink;
                }
            }
            return entries;
        },
        KDCanAddRestraint() {
            return true;
        },
        KDGetBlockersToAddRestraint() {
            return [];
        },
        KinkyDungeonAddRestraint(...args) {
            addCalls.push(args);
            const [restraint, tightness, , lock] = args;
            if (options.addResult === 0) return 0;
            const item = {
                name: restraint.name,
                group: restraint.Group,
                restraint,
                tightness,
                lock,
                data: {},
                dynamicLink: equipment.get(restraint.Group),
            };
            equipment.set(restraint.Group, item);
            return 1;
        },
        KinkyDungeonApplyBuffToEntity(_target, buff) {
            buffs[buff.id] = { ...buff };
        },
        KinkyDungeonExpireBuff(_target, id) {
            delete buffs[id];
        },
        KinkyDungeonCalculateSlowLevel() {},
        queueMicrotask(callback) {
            callback();
        },
        ...options.globals,
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    for (const source of options.nativeSources || []) vm.runInContext(stripTypeScriptTypes(source), context);
    for (const file of [
        "SpiderlingsCore.js",
        "SpiderlingsEncounters.js",
        "SpiderlingsWebCaster.js",
        "Spiderlings.js",
        "SpiderlingsCombat.js",
        "SpiderlingsWebbingData.js",
        "SpiderlingsWebbingRules.js",
        "SpiderlingsWebbing.js",
    ]) {
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    }

    function seed(familyList, stage = 1) {
        for (const family of familyList) {
            const restraint = context.KinkyDungeonGetRestraintByName(`SpiderlingsWebbingLv${stage}${family}`);
            const item = {
                name: restraint.name,
                group: restraint.Group,
                restraint,
                data: { seeded: family },
                dynamicLink: equipment.get(restraint.Group),
            };
            equipment.set(restraint.Group, item);
        }
    }

    function event(trigger, data = {}) {
        const handlers = context.KDEventMapGeneric[trigger] || {};
        for (const [name, handler] of Object.entries(handlers)) handler(name, data);
    }

    return { context, equipment, addCalls, buffs, seed, event };
}

function resolve(context, snapshot, action) {
    return context.Spiderlings.Webbing.resolveWebbingAction({ catalog: catalog(), snapshot, action });
}

function trigger(source, turn, extra = {}) {
    return {
        type: "webSprayTrigger",
        provenance,
        triggerSource: source,
        profile: "WebCaster",
        turn,
        random: () => 0,
        ...extra,
    };
}

test("WebSpray passes KD 5.5's native minimum range gates at adjacent and ranged distances", () => {
    const { context } = loadRuntime();
    const enemy = { Enemy: context.KinkyDungeonEnemies.find((entry) => entry.name === "WebCaster") };
    const spray = context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const source = fs.readFileSync(
        path.join(modRoot, "..", "KinkiestDungeon-5.5/Game/src/enemy/KinkyDungeonEnemies.ts"),
        "utf8",
    );
    const start = source.indexOf("let minSpellRange = enemy.Enemy.minSpellRange");
    const end = source.indexOf("if (spell) break;", start);
    assert.ok(start >= 0 && end > start, "pinned native spell selection must be discoverable");
    const choose = Function(
        "enemy",
        "spell",
        "AIData",
        "KDGetSpellRange",
        `
    for (let attempt = 0; attempt < 1; attempt++) {
      ${source.slice(start, end)}
      return spell;
    }
    return null;
  `,
    );
    for (const distance of [1, Math.SQRT2, 2, 3, 6]) {
        assert.equal(
            choose(enemy, spray, { playerDist: distance }, (spell) => spell.range),
            spray,
            `WebSpray must remain usable at distance ${distance}`,
        );
    }
});

test("WebCaster's hunt hook restores a usable retreat goal only when native kiting is active", () => {
    let originalCalls = 0;
    const nativeBeforeMove = () => {
        originalCalls++;
        return false;
    };
    const { context } = loadRuntime({
        globals: {
            KDAIType: { hunt: { beforemove: nativeBeforeMove } },
            KDEnemyHasFlag: (enemy, flag) => !!enemy.flags?.[flag],
        },
    });
    const beforemove = context.KDAIType.hunt.beforemove;
    const player = { x: 7, y: 7, player: true };
    const makeEnemy = () => ({ Enemy: { name: "WebCaster" }, x: 8, y: 7, gx: 8, gy: 7 });
    const enemy = makeEnemy();
    assert.equal(beforemove(enemy, player, { kite: true }), false);
    assert.notDeepEqual(
        [enemy.gx, enemy.gy],
        [enemy.x, enemy.y],
        "native movement rejects a stationary goal even when kite is true",
    );
    assert.notDeepEqual(
        [enemy.gx, enemy.gy],
        [player.x, player.y],
        "do not activate the native player-goal shortcut that bypasses mobility checks",
    );
    for (const overrides of [{ kite: false }, { name: "ElfRanger" }, { flag: "StayHere" }, { flag: "overrideMove" }]) {
        const held = makeEnemy();
        if (overrides.name) held.Enemy.name = overrides.name;
        if (overrides.flag) held.flags = { [overrides.flag]: true };
        beforemove(held, player, { kite: overrides.kite ?? true });
        assert.deepEqual([held.gx, held.gy], [held.x, held.y]);
    }
    assert.equal(originalCalls, 5);
});

test("WebCaster preserves an existing hunt hook's movement override", () => {
    const { context } = loadRuntime({
        globals: {
            KDAIType: { hunt: { beforemove: () => true } },
            KDEnemyHasFlag: () => false,
        },
    });
    const enemy = { Enemy: { name: "WebCaster" }, x: 8, y: 7, gx: 8, gy: 7 };
    assert.equal(context.KDAIType.hunt.beforemove(enemy, { x: 7, y: 7 }, { kite: true }), true);
    assert.deepEqual([enemy.gx, enemy.gy], [8, 7]);
});

test("WebSpray declares separate marked direct and native lingering trail effects", () => {
    const runtime = loadRuntime();
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const generic = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "SpiderWeb");
    assert.deepEqual(plain(spell.playerEffect), {
        name: "SpiderlingsWebSprayHit",
        provenance,
        triggerSource: "direct",
        profile: "WebCaster",
        allowInert: true,
    });
    assert.deepEqual(plain(spell.trailPlayerEffect), {
        name: "SpiderlingsWebSprayHit",
        provenance,
        triggerSource: "trail",
        profile: "WebCaster",
        allowInert: true,
    });
    assert.equal(spell.trail, "lingering");
    assert.equal(spell.noTrailOnPlayer, true);
    assert.equal(spell.trailcast, undefined);
    assert.notEqual(generic.playerEffect.name, "SpiderlingsWebSprayHit");
    assert.equal(generic.playerEffect.provenance, undefined);

    const trailAsset = "Bullets/WebSprayTrail.png";
    assert.equal(fs.existsSync(path.join(modRoot, trailAsset)), true);
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    assert.ok(manifest.fileorder.indexOf(trailAsset) >= 0);
    assert.ok(manifest.fileorder.indexOf(trailAsset) < manifest.fileorder.indexOf("SpiderlingsCore.js"));
});

test("pure WebSpray resolution keeps direct hits independent and terrain once per turn", () => {
    const runtime = loadRuntime();
    let state = resolverSnapshot();
    let result = resolve(runtime.context, state, trigger("direct", 10));
    assert.equal(result.outcome.accepted, true);
    assert.equal(result.outcome.selectedId, restraintId("Arm"));
    assert.equal(result.nextSnapshot.webSpray.stacks, 1);
    state = result.nextSnapshot;

    result = resolve(runtime.context, state, trigger("trail", 10));
    assert.equal(result.outcome.accepted, true, "an existing trail may trigger after a direct hit in the same turn");
    assert.equal(result.nextSnapshot.webSpray.stacks, 2);
    state = result.nextSnapshot;
    const duplicateTrail = resolve(runtime.context, state, trigger("trail", 10));
    assert.equal(duplicateTrail.outcome.accepted, false);
    assert.equal(duplicateTrail.outcome.reason, "trail-rate-limited");
    assert.deepEqual(plain(duplicateTrail.nextSnapshot.webSpray), plain(state.webSpray));

    const laterDirect = resolve(runtime.context, state, trigger("direct", 10));
    assert.equal(laterDirect.outcome.accepted, true);
    assert.equal(laterDirect.nextSnapshot.webSpray.stacks, 3);
    const nextTurnTrail = resolve(runtime.context, laterDirect.nextSnapshot, trigger("trail", 11));
    assert.equal(nextTurnTrail.outcome.accepted, true);
    assert.equal(nextTurnTrail.nextSnapshot.webSpray.stacks, 4);
});

test("unmarked or generic terrain cannot roll, slow, progress, repair, or cocoon", () => {
    const runtime = loadRuntime();
    const initial = resolverSnapshot();
    for (const action of [
        trigger("trail", 1, { provenance: "SpiderWeb" }),
        trigger("trail", 1, { provenance: "TrapBindings" }),
        trigger("generic", 1),
        { ...trigger("trail", 1), provenance: undefined },
    ]) {
        let randomCalls = 0;
        action.random = () => {
            randomCalls += 1;
            return 0;
        };
        const result = resolve(runtime.context, initial, action);
        assert.equal(result.outcome.accepted, false);
        assert.equal(result.outcome.selectedId, undefined);
        assert.equal(result.outcome.cocoon, undefined);
        assert.equal(result.outcome.repair, undefined);
        assert.deepEqual(plain(result.nextSnapshot.webSpray), blankSlow());
        assert.equal(randomCalls, 0);
    }
});

test("one shared seven-turn inactivity timer caps and atomically clears all slow", () => {
    const runtime = loadRuntime();
    assert.equal(runtime.context.Spiderlings.Webbing.WEBSPRAY_INACTIVITY_TURNS, 7);
    let snapshot = resolverSnapshot();
    for (let turn = 0; turn < 5; turn += 1) {
        snapshot = resolve(runtime.context, snapshot, trigger("direct", turn)).nextSnapshot;
        assert.equal(snapshot.webSpray.stacks, turn + 1);
        snapshot = resolve(runtime.context, snapshot, { type: "webSprayTurnElapsed", turn, delta: 1 }).nextSnapshot;
        assert.equal(snapshot.webSpray.inactiveTurns, 0);
    }
    snapshot = resolve(runtime.context, snapshot, trigger("direct", 5)).nextSnapshot;
    assert.equal(snapshot.webSpray.stacks, 5);
    snapshot = resolve(runtime.context, snapshot, { type: "webSprayTurnElapsed", turn: 5, delta: 1 }).nextSnapshot;
    for (let turn = 6; turn <= 11; turn += 1) {
        snapshot = resolve(runtime.context, snapshot, { type: "webSprayTurnElapsed", turn, delta: 1 }).nextSnapshot;
        assert.equal(snapshot.webSpray.stacks, 5);
        assert.equal(snapshot.webSpray.inactiveTurns, turn - 5);
    }
    snapshot = resolve(runtime.context, snapshot, { type: "webSprayTurnElapsed", turn: 12, delta: 1 }).nextSnapshot;
    assert.deepEqual(plain(snapshot.webSpray), blankSlow());

    const refreshed = resolve(
        runtime.context,
        resolverSnapshot([], { stacks: 5, inactiveTurns: 6, lastTriggerTurn: 1, lastTrailTurn: null }),
        trigger("direct", 20),
    );
    assert.equal(refreshed.nextSnapshot.webSpray.stacks, 5);
    assert.equal(refreshed.nextSnapshot.webSpray.inactiveTurns, 0);
});

test("runtime direct/trail hits add one exact item and update one SlowLevel buff", () => {
    const damage = [];
    const runtime = loadRuntime({ globals: { KinkyDungeonDealDamage: (d) => damage.push(plain(d)) } });
    runtime.seed(families.filter((family) => !["Arm", "MittenLeft", "MittenRight", "Belly"].includes(family)));
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const handler = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 40 };

    const direct = handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "inert",
        spell.playerEffect,
        spell,
        "Enemy",
        { x: 3, y: 4 },
        caster,
    );
    assert.equal(direct.effect, true);
    assert.equal(runtime.addCalls.length, 1);
    assert.equal(runtime.addCalls[0][0].name, restraintId("Arm"));
    assert.equal(runtime.addCalls[0][1], 0);
    assert.equal(runtime.addCalls[0][3], "");
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.type, "SlowLevel");
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 1);

    const trail = handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "inert",
        spell.trailPlayerEffect,
        spell,
        "Enemy",
        { x: 4, y: 4 },
        undefined,
    );
    assert.equal(trail.effect, true);
    assert.equal(runtime.addCalls.length, 2);
    assert.equal(runtime.addCalls[1][0].name, "SpiderlingsWebbingLv2Arm");
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 2);
    const duplicate = handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "inert",
        spell.trailPlayerEffect,
        spell,
        "Enemy",
        { x: 5, y: 4 },
        undefined,
    );
    assert.equal(duplicate.effect, false);
    assert.equal(runtime.addCalls.length, 2);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 2);
    assert.deepEqual(damage, [
        { damage: 0.05, type: "tickle" },
        { damage: 0.01, type: "tickle" },
    ]);

    const secondDirect = handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "inert",
        spell.playerEffect,
        spell,
        "Enemy",
        { x: 3, y: 4 },
        caster,
    );
    assert.equal(secondDirect.effect, true);
    assert.equal(runtime.addCalls.length, 3);
    assert.equal(runtime.addCalls[2][0].name, "SpiderlingsWebbingLv3Arm");
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 3);

    for (const expectedPower of [4, 5, 5]) {
        const capped = handler(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 3, y: 4 },
            caster,
        );
        assert.equal(capped.effect, true);
        assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, expectedPower);
    }
    assert.equal(runtime.addCalls.length, 6, "same-turn hits re-read equipment and advance each family independently");
    assert.deepEqual(
        runtime.addCalls.slice(3).map((args) => args[0].name),
        ["SpiderlingsWebbingLv1MittenLeft", "SpiderlingsWebbingLv1MittenRight", "SpiderlingsWebbingLv1Belly"],
    );
});

test("a native add failure still slows once without rerolling or equipping a fallback", () => {
    let randomCalls = 0;
    const damage = [];
    const runtime = loadRuntime({
        addResult: 0,
        globals: { KinkyDungeonDealDamage: (d) => damage.push(plain(d)) },
        random: () => {
            randomCalls += 1;
            return 0;
        },
    });
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const handler = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 42 };

    const result = handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "inert",
        spell.playerEffect,
        spell,
        "Enemy",
        { x: 2, y: 2 },
        caster,
    );
    assert.equal(result.effect, true);
    assert.equal(randomCalls, 1);
    assert.equal(runtime.addCalls.length, 1);
    assert.equal(runtime.addCalls[0][0].name, restraintId("Arm"));
    assert.equal(runtime.equipment.has("ItemArms"), false);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 1);
    assert.deepEqual(damage, [{ damage: 0.05, type: "tickle" }]);
});

test("runtime saturation still slows, then timeout and transition hooks clear only transient state", () => {
    const damage = [];
    const runtime = loadRuntime({ globals: { KinkyDungeonDealDamage: (d) => damage.push(plain(d)) } });
    runtime.seed(families);
    runtime.seed(lv2Families, 2);
    runtime.seed(lv3Families, 3);
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const handler = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 41 };
    const physicalBefore = [...runtime.equipment.values()];

    assert.equal(
        handler(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 1, y: 1 },
            caster,
        ).effect,
        true,
    );
    assert.equal(runtime.addCalls.length, 0);
    assert.deepEqual(damage, [{ damage: 0.05, type: "tickle" }], "saturation retains contact damage");
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 1);
    runtime.event("tickAfter", { delta: 1 });
    for (let turn = 0; turn < 6; turn += 1) runtime.event("tickAfter", { delta: 1 });
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 1);
    runtime.event("tickAfter", { delta: 1 });
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
    assert.deepEqual([...runtime.equipment.values()], physicalBefore);

    for (const clearEvent of ["defeat", "passout", "postMapgen", "postPrisonIntro"]) {
        handler(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 1, y: 1 },
            caster,
        );
        assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 1);
        const beforeClear = [...runtime.equipment.values()];
        runtime.event(clearEvent, {});
        assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
        assert.deepEqual([...runtime.equipment.values()], beforeClear);
    }

    handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "inert",
        spell.playerEffect,
        spell,
        "Enemy",
        { x: 1, y: 1 },
        caster,
    );
    runtime.context.KDGameData.PrisonerState = "jail";
    runtime.event("tick", { delta: 1 });
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
    assert.deepEqual([...runtime.equipment.values()], physicalBefore);
});

test("removing a physical Lv1 item does not clear or refresh the WebSpray timer", () => {
    const runtime = loadRuntime();
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const handler = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 43 };

    handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "inert",
        spell.playerEffect,
        spell,
        "Enemy",
        { x: 1, y: 1 },
        caster,
    );
    assert.equal(runtime.equipment.delete("ItemArms"), true);
    runtime.event("tickAfter", { delta: 1 });
    runtime.event("tickAfter", { delta: 1 });
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 1);
});
