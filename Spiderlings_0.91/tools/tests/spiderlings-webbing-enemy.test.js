"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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
    Hood: "ItemHead",
};

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function id(stage, family) {
    return `SpiderlingsWebbingLv${stage}${family}`;
}

function syntheticCatalog(stages = [1]) {
    return stages.flatMap((stage) =>
        (stage === 3 ? lv3Families : stage === 2 ? lv2Families : families).map((family) => ({
            id: id(stage, family),
            family,
            group: groups[family],
            stage: `Lv${stage}`,
            requiredActions: stage,
        })),
    );
}

function ownedItem(stage, family) {
    return { name: id(stage, family), group: groups[family], data: { marker: `${stage}:${family}` } };
}

function snapshotFor(items = [], overrides = {}) {
    const groupsByName = {};
    for (const item of items) {
        const group = item.group || groups[item.name.replace(/^.*Lv[123]/, "")];
        groupsByName[group] = groupsByName[group] || [];
        groupsByName[group].push(item);
    }
    const compatibility = Object.fromEntries(syntheticCatalog([1, 2, 3]).map((entry) => [entry.id, true]));
    return {
        items,
        groups: groupsByName,
        registered: { ...compatibility },
        poseCompatible: { ...compatibility },
        addCompatible: { ...compatibility },
        ...overrides,
    };
}

function loadRuntime(options = {}) {
    const equipment = new Map();
    const addCalls = [];
    const canAddCalls = [];
    const blockerCalls = [];
    const scheduled = [];
    const player = { player: true, id: 1 };
    const state = {
        addResult: options.addResult === undefined ? 1 : options.addResult,
        canAdd: options.canAdd === undefined ? true : options.canAdd,
        blockers: options.blockers || [],
    };
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
        KDPlayerEffects: {},
        KDModConfigs: {},
        KDModSettings: {},
        KinkyDungeonFlags: new Map(),
        KDRandom: () => 0,
        KinkyDungeonPlayer: player,
        KinkyDungeonPlayerEntity: player,
        KDCurrentModels: new Map([[player, { Poses: { Closed: true, Wristtie: true } }]]),
        KDTapeLink: ["Wrapping"],
        KDTapeRender: ["Wrapping"],
        KDBindable: "Bindable",
        KDDevices: "Devices",
        KDCorsetLink: "Corsets",
        KDHarnessLink: "Harnesses",
        KDElbowBind: "ElbowBind",
        KDWrappable: "Wrappable",
        queueMicrotask(callback) {
            scheduled.push(callback);
        },
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
        KinkyDungeonReplaceRestraintRoot(group, previous, next) {
            if (equipment.get(group) !== previous) return false;
            equipment.set(group, next);
            return true;
        },
        KinkyDungeonAllRestraintDynamic() {
            const entries = [];
            for (const root of equipment.values()) {
                let item = root;
                const seen = new Set();
                while (item && !seen.has(item)) {
                    seen.add(item);
                    entries.push({ item });
                    item = item.dynamicLink;
                }
            }
            return entries;
        },
        KDCanAddRestraint(...args) {
            canAddCalls.push(args);
            return typeof state.canAdd === "function" ? state.canAdd(...args) : state.canAdd;
        },
        KDGetBlockersToAddRestraint(...args) {
            blockerCalls.push(args);
            return typeof state.blockers === "function" ? state.blockers(...args) : state.blockers;
        },
        KinkyDungeonAddRestraint(...args) {
            addCalls.push(args);
            const [restraint, tightness, , lock] = args;
            const result = typeof state.addResult === "function" ? state.addResult(...args) : state.addResult;
            if (Number(result) > 0) {
                const previous = equipment.get(restraint.Group);
                equipment.set(restraint.Group, {
                    name: restraint.name,
                    group: restraint.Group,
                    restraint,
                    tightness,
                    lock,
                    data: {},
                    dynamicLink: previous,
                });
            }
            return result;
        },
        KinkyDungeonAddRestraintIfWeaker() {
            throw new Error("enemy Webbing must not use the broad/retightening AddRestraintIfWeaker path");
        },
        KDUpdateLinkCaches() {},
        KinkyDungeonUpdateRestraints() {
            return {};
        },
        KinkyDungeonCalculateSlowLevel() {},
        KinkyDungeonUpdateStruggleGroups() {},
        ...options.globals,
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
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
            const restraint = context.KinkyDungeonGetRestraintByName(id(stage, family));
            const item = { name: restraint.name, group: restraint.Group, restraint, data: { seeded: family } };
            const previous = equipment.get(restraint.Group);
            item.dynamicLink = previous;
            equipment.set(restraint.Group, item);
        }
    }

    function beforeDamage(enemy, damage = 0) {
        const data = { enemy, attacker: enemy, damage, target: player, attack: "MeleeEffectSuicide" };
        const handler =
            context.KDEventMapGeneric.beforeDamage &&
            context.KDEventMapGeneric.beforeDamage.SpiderlingsWebbingPlayerHitDamage;
        assert.equal(typeof handler, "function");
        handler({}, data);
        return data.damage;
    }

    return { context, equipment, addCalls, canAddCalls, blockerCalls, scheduled, state, seed, beforeDamage };
}

function select(
    runtime,
    { profile = "WebCaster", random = 0, items = [], snapshot, catalog = syntheticCatalog() } = {},
) {
    return plain(
        runtime.context.Spiderlings.Webbing.resolveWebbingAction({
            catalog,
            snapshot: snapshot || snapshotFor(items),
            action: {
                type: "enemyBind",
                source: { kind: "enemy", name: profile },
                profile,
                random: typeof random === "function" ? random : () => random,
            },
        }).outcome,
    );
}

test("enemy profiles preserve canonical family weights and exclude Tunneler/Nest", () => {
    const runtime = loadRuntime();
    const profiles = plain(runtime.context.Spiderlings.Webbing.ENEMY_PROFILES);
    assert.deepEqual(profiles, {
        Spinner: [0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0],
        Jumper: [1, 1, 1, 2, 3, 3, 3, 1, 1, 1, 1],
        WebCaster: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    });
    assert.equal(profiles.Tunneler, undefined);
    assert.equal(profiles.NestEntrance, undefined);
});

test("Spinner player bindings stop at the three lower families and never create Cocoon", () => {
    const r = loadRuntime(),
        catalog = syntheticCatalog([1, 2, 3]);
    for (const random of [0, 0.499, 0.5, 0.749, 0.75, 1]) {
        const result = select(r, { profile: "Spinner", catalog, random });
        assert.ok(["Legs", "Ankles", "Foot"].includes(result.family));
    }
    const items = catalog.filter((e) => e.stage !== "Cocoon").map((e) => ({ name: e.id, group: e.group }));
    const snapshot = snapshotFor(items);
    snapshot.webSpray = { stacks: 5 };
    assert.notEqual(select(r, { profile: "Spinner", catalog, snapshot }).selectedId, "SpiderlingsWebbingCocoon");
});

test("resolver filters first, renormalizes weights, and uses right-open random boundaries", () => {
    const runtime = loadRuntime();
    const items = [];
    const expected = [
        [0, "Arm"],
        [2.1 / 18, "MittenLeft"],
        [4.1 / 18, "MittenRight"],
        [6.1 / 18, "Belly"],
        [8.1 / 18, "Legs"],
        [10.1 / 18, "Ankles"],
        [12.1 / 18, "Foot"],
        [14.1 / 18, "Blindfold"],
        [16.1 / 18, "Stuffing"],
        [1, "Stuffing"],
    ];
    for (const [random, family] of expected) {
        assert.equal(select(runtime, { items, random }).selectedId, id(1, family));
    }
    const jumperExpected = [
        [0, "Arm"],
        [1.1 / 16, "MittenLeft"],
        [2.1 / 16, "MittenRight"],
        [3.1 / 16, "Belly"],
        [5.1 / 16, "Legs"],
        [8.1 / 16, "Ankles"],
        [11.1 / 16, "Foot"],
        [14.1 / 16, "Blindfold"],
        [15.1 / 16, "Stuffing"],
        [1, "Stuffing"],
    ];
    for (const [random, family] of jumperExpected) {
        assert.equal(select(runtime, { profile: "Jumper", items, random }).selectedId, id(1, family));
    }

    const externalHands = { name: "ExternalGloves", group: "ItemHands" };
    const compatibility = snapshotFor([externalHands]);
    for (const entry of syntheticCatalog([1, 2])) {
        compatibility.poseCompatible[entry.id] = entry.family === "Belly";
        compatibility.addCompatible[entry.id] = entry.family !== "Arm";
    }
    assert.equal(select(runtime, { random: 0.999, snapshot: compatibility }).selectedId, id(1, "Belly"));
});

test("mouth ordering prevents premature Gag and broken-chain Stuffing reinsertion", () => {
    const runtime = loadRuntime();
    const lv1 = families
        .filter((family) => !["Stuffing", "Gag"].includes(family))
        .map((family) => ownedItem(1, family));
    const onlyMouth = (items) => {
        const snapshot = snapshotFor([...lv1, ...items]);
        for (const entry of syntheticCatalog([1, 2])) {
            const mouth = entry.family === "Stuffing" || entry.family === "Gag";
            snapshot.poseCompatible[entry.id] = mouth;
            snapshot.addCompatible[entry.id] = mouth;
        }
        return snapshot;
    };

    const catalog = syntheticCatalog([1, 2]);
    assert.equal(select(runtime, { snapshot: onlyMouth([]), catalog }).selectedId, id(1, "Stuffing"));
    assert.equal(
        select(runtime, { snapshot: onlyMouth([ownedItem(1, "Stuffing")]), catalog }).selectedId,
        id(1, "Gag"),
    );
    assert.deepEqual(select(runtime, { snapshot: onlyMouth([ownedItem(1, "Gag")]), catalog }), {
        progressed: false,
        reason: "no-eligible-candidate",
        profile: "WebCaster",
        source: { kind: "enemy", name: "WebCaster" },
    });
    assert.equal(select(runtime, { snapshot: onlyMouth([]), catalog }).selectedId, id(1, "Stuffing"));
});

test("independent families mix upgrades with empty parts and exclude saturated parts before drawing", () => {
    const runtime = loadRuntime();
    const catalog = syntheticCatalog([1, 2, 3]);
    const items = [ownedItem(1, "Arm")];
    assert.equal(select(runtime, { catalog, items, random: 0 }).selectedId, id(2, "Arm"));
    assert.equal(select(runtime, { catalog, items, random: 0.2 }).selectedId, id(1, "MittenLeft"));
    items.push(ownedItem(2, "Arm"));
    assert.equal(select(runtime, { catalog, items }).selectedId, id(3, "Arm"));
    items.push(ownedItem(3, "Arm"));
    assert.equal(select(runtime, { catalog, items }).selectedId, id(1, "MittenLeft"));
    // A manually equipped outer layer must not cause redundant lower layers on that part.
    assert.equal(select(runtime, { catalog, items: [ownedItem(3, "Arm")] }).selectedId, id(1, "MittenLeft"));
    const blocked = snapshotFor([ownedItem(1, "Arm")]);
    blocked.addCompatible[id(2, "Arm")] = false;
    assert.equal(select(runtime, { catalog, snapshot: blocked }).selectedId, id(1, "MittenLeft"));
});

test("consecutive direct hits without ticks can upgrade one family to full then fill another", () => {
    const runtime = loadRuntime({ globals: { KDRandom: () => 0, KinkyDungeonCurrentTick: 100 } });
    runtime.context.KDCurrentModels.set(runtime.context.KinkyDungeonPlayer, {
        Poses: { Closed: true, Wristtie: true, Free: true },
    });
    for (let n = 0; n < 5; n++) assert.equal(bindWebCaster(runtime).effect, true);
    assert.deepEqual(
        runtime.addCalls.map((args) => args[0].name),
        [id(1, "Arm"), id(2, "Arm"), id(3, "Arm"), id(1, "MittenLeft"), id(1, "MittenRight")],
    );
    assert.equal(runtime.context.KinkyDungeonCurrentTick, 100);
});

test("missing stage catalogs cannot create fallback or partial layers", () => {
    const runtime = loadRuntime();
    const lv1 = families.map((family) => ownedItem(1, family));
    let randomCalls = 0;
    const saturated = select(runtime, {
        items: lv1,
        random: () => {
            randomCalls += 1;
            return 0;
        },
    });
    assert.equal(saturated.progressed, false);
    assert.equal(saturated.reason, "no-eligible-candidate");
    assert.equal(saturated.selectedId, undefined);
    assert.equal(randomCalls, 0);

    const partialLv2 = [...syntheticCatalog(), { id: id(2, "Arm"), family: "Arm", group: groups.Arm, stage: "Lv2" }];
    assert.equal(select(runtime, { items: lv1, catalog: partialLv2 }).reason, "no-eligible-candidate");

    const allStages = syntheticCatalog([1, 2]);
    const lv2Choice = select(runtime, { items: lv1, catalog: allStages, random: 0 });
    assert.equal(lv2Choice.selectedId, id(2, "Arm"));
    assert.equal(lv2Choice.stage, "Lv2");

    const missingLv1Arm = lv1.filter((item) => item.name !== id(1, "Arm"));
    const lv1Choice = select(runtime, { items: missingLv1Arm, catalog: allStages, random: 0 });
    assert.equal(lv1Choice.selectedId, id(1, "Arm"));
});

test("Lv3 preserves each source's body and head preferences with complete inner layers", () => {
    const runtime = loadRuntime();
    const catalog = syntheticCatalog([1, 2, 3]);
    const inner = [
        ...families.map((family) => ownedItem(1, family)),
        ...lv2Families.map((family) => ownedItem(2, family)),
    ];
    for (const [profile, weights] of Object.entries({
        Spinner: [0, 0, 2, 1, 1, 0, 0],
        Jumper: [1, 2, 3, 3, 3, 1, 1],
        WebCaster: [2, 2, 2, 2, 2, 2, 2],
    })) {
        const total = weights.reduce((sum, weight) => sum + weight, 0);
        let start = 0;
        for (let index = 0; index < weights.length; index += 1) {
            if (!weights[index]) continue;
            const result = select(runtime, {
                profile,
                catalog,
                items: inner,
                random: (start + weights[index] / 2) / total,
            });
            assert.equal(result.selectedId, id(3, lv3Families[index]));
            assert.equal(result.stage, "Lv3");
            start += weights[index];
        }
    }
    assert.equal(select(runtime, { catalog: syntheticCatalog([1, 2]), items: inner }).reason, "no-eligible-candidate");
    assert.equal(
        select(runtime, { catalog: catalog.filter((entry) => entry.id !== id(3, "Hood")), items: inner }).reason,
        "no-eligible-candidate",
    );
});

test("Lv3 Hood waits for both Lv3 eye and mouth layers, then uses its source weight", () => {
    const runtime = loadRuntime();
    const catalog = syntheticCatalog([1, 2, 3]);
    const inner = [
        ...families.map((family) => ownedItem(1, family)),
        ...lv2Families.map((family) => ownedItem(2, family)),
    ];
    for (const head of [[], ["Blindfold"], ["Gag"]]) {
        const items = [...inner, ...head.map((family) => ownedItem(3, family))];
        assert.notEqual(select(runtime, { catalog, items, random: 1 }).selectedId, id(3, "Hood"));
    }
    const items = [...inner, ...["Blindfold", "Gag"].map((family) => ownedItem(3, family))];
    for (const [profile, total, hoodWeight] of [
        ["Jumper", 13, 1],
        ["WebCaster", 12, 2],
    ]) {
        assert.equal(
            select(runtime, { profile, catalog, items, random: (total - hoodWeight - 0.1) / total }).selectedId,
            id(3, "Foot"),
        );
        assert.equal(
            select(runtime, { profile, catalog, items, random: (total - hoodWeight + 0.1) / total }).selectedId,
            id(3, "Hood"),
        );
    }
});

test("WebCaster, Jumper melee and Jumper landing payloads can each add the full Lv3 set one item per hit", () => {
    for (const [profile, consumeOnProgress] of [
        ["WebCaster", false],
        ["Jumper", false],
        ["Jumper", true],
    ]) {
        const runtime = loadRuntime({ globals: { KDRandom: () => 1 } });
        runtime.seed(families);
        runtime.seed(lv2Families, 2);
        const definition = runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === profile);
        for (let index = 0; index < 8; index += 1) {
            const entity = { Enemy: definition, hp: 3, id: 90 + index };
            const before = runtime.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item);
            const result = runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
                runtime.context.KinkyDungeonPlayerEntity,
                "tickle",
                { profile, consumeOnProgress },
                undefined,
                "Enemy",
                undefined,
                entity,
            );
            assert.equal(result.effect, true);
            assert.equal(runtime.addCalls.length, index + 1);
            const after = runtime.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item);
            assert.equal(after.length, before.length + 1);
            for (const item of before) assert.ok(after.includes(item));
            if (consumeOnProgress) assert.equal(entity.hp, 0);
        }
        assert.equal(runtime.context.KinkyDungeonAllRestraintDynamic().length, 23);
        assert.equal(runtime.equipment.has("ItemDevices"), false);
    }
});

test("Lv3 filters native rejection, poses and external restraints before drawing and never rerolls a failed add", () => {
    const runtime = loadRuntime({ globals: { KDRandom: () => 0 } });
    runtime.seed(families);
    runtime.seed(lv2Families, 2);
    runtime.state.canAdd = (restraint) => restraint.name !== id(3, "Arm");
    assert.equal(bindWebCaster(runtime).effect, true);
    assert.equal(runtime.addCalls[0][0].name, id(3, "Belly"));
    runtime.state.addResult = 0;
    assert.equal(bindWebCaster(runtime).effect, false);
    assert.equal(runtime.addCalls.length, 2);
    assert.equal(runtime.addCalls[1][0].name, id(3, "Legs"));
    runtime.state.addResult = 1;
    assert.equal(bindWebCaster(runtime).effect, true);
    assert.equal(runtime.addCalls[2][0].name, id(3, "Legs"));

    const catalog = syntheticCatalog([1, 2, 3]);
    const inner = [
        ...families.map((family) => ownedItem(1, family)),
        ...lv2Families.map((family) => ownedItem(2, family)),
    ];
    const snapshot = snapshotFor([...inner, { name: "ExternalCuffs", group: "ItemArms" }]);
    snapshot.poseCompatible[id(3, "Belly")] = false;
    snapshot.addCompatible[id(3, "Legs")] = false;
    assert.equal(select(runtime, { catalog, snapshot }).selectedId, id(3, "Ankles"));
});

test("Spinner/Jumper definitions use exact effect progression and leave summon-only enemies alone", () => {
    const runtime = loadRuntime();
    const enemy = (name) => runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === name);
    for (const [name, bonus] of [
        ["Spinner", 0],
        ["Jumper", 0],
    ]) {
        const definition = enemy(name);
        assert.equal(definition.attack.includes("Melee"), true);
        assert.equal(definition.attack.includes("Effect"), true);
        assert.equal(definition.attack.includes("Suicide"), name === "Jumper");
        assert.equal(definition.attack.includes("Spell"), name === "Jumper");
        assert.equal(definition.suicideOnEffect, name === "Jumper");
        assert.equal(Object.prototype.hasOwnProperty.call(definition, "suicideOnAdd"), false);
        assert.equal(definition.fullBoundBonus, bonus);
        assert.deepEqual(plain(definition.effect), {
            damage: "tickle",
            effect: { name: "SpiderlingsWebbingEnemyBind", profile: name },
        });
    }

    const spinner = enemy("Spinner");
    const jumper = enemy("Jumper");
    assert.equal(jumper.attackRange, 2);
    assert.equal(jumper.movePoints, 1.25);
    assert.ok(jumper.movePoints < spinner.movePoints, "Jumper must accumulate a move sooner than Spinner");
    assert.equal(jumper.specialAttack, undefined, "Jumper must not use KD's immediate built-in Dash path");
    assert.deepEqual(plain(jumper.spells), ["SpiderlingsJumperDash"]);
    const dash = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "SpiderlingsJumperDash");
    assert.ok(dash, "the Spiderlings-owned Dash spell must be registered");
    assert.equal(dash.type, "inert", "Dash uses the KD cast event only as its lifecycle transport");
    assert.equal(dash.castRange, 4);
    assert.equal(dash.range, 4);
    assert.equal(dash.minRange, 2);
    assert.equal(dash.castCondition, "SpiderlingsJumperDash");
    assert.equal(dash.noCastMsg, true);
    assert.equal(dash.specialCD, 5);
    assert.deepEqual(plain(dash.playerEffect), {}, "native inert resolution must not apply remote Webbing");

    const tunneler = enemy("Tunneler");
    const nest = enemy("NestEntrance");
    const summonNestEntrance = runtime.context.KinkyDungeonSpellListEnemies.find(
        (entry) => entry.name === "SummonNestEntrance",
    );
    assert.equal(tunneler.attack, "Spell");
    assert.deepEqual(plain(tunneler.spells), ["SummonNestEntrance"]);
    assert.equal(tunneler.effect, undefined);
    assert.ok(summonNestEntrance, "Tunneler's NestEntrance summon spell must be registered");
    assert.equal(summonNestEntrance.selfcast, true, "NestEntrance summons must be centered on the Tunneler");
    assert.equal(summonNestEntrance.castRange, 50, "self-casting must not change when the Tunneler may cast");
    assert.equal(summonNestEntrance.aoe, 1.5, "self-casting must retain the local free-tile search radius");
    assert.equal(nest.attack, "Spell");
    assert.equal(nest.effect, undefined);
});

test("Spinner survives repeated player binding even when an old payload requests consumption", () => {
    const runtime = loadRuntime();
    const definition = runtime.context.KinkyDungeonEnemies.find((e) => e.name === "Spinner");
    const source = { Enemy: definition, hp: 3, id: 301 };
    for (let n = 0; n < 3; n++) {
        const result = runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
            runtime.context.KinkyDungeonPlayerEntity,
            "tickle",
            { profile: "Spinner", consumeOnProgress: true },
            undefined,
            "Enemy",
            undefined,
            source,
        );
        assert.equal(result.effect, true);
        assert.equal(source.hp, 3);
    }
    assert.equal(runtime.addCalls.length, 3);
});

test("successful enemy hit adds one exact unlocked Lv1 at zero tightness and drives departure", () => {
    const runtime = loadRuntime();
    runtime.seed(families.filter((family) => family !== "Arm"));
    const spinnerDefinition = runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === "Jumper");
    const spinner = { Enemy: spinnerDefinition, hp: 3, id: 10 };
    const handler = runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind;
    assert.equal(typeof handler, "function");

    const result = handler(
        runtime.context.KinkyDungeonPlayerEntity,
        "tickle",
        spinnerDefinition.effect.effect,
        undefined,
        "Enemy",
        undefined,
        spinner,
    );
    if (result.effect && spinner.Enemy.suicideOnEffect) spinner.hp = 0;

    assert.equal(result.effect, true);
    assert.equal(spinner.hp, 0);
    assert.equal(runtime.addCalls.length, 1);
    assert.equal(runtime.addCalls[0][0].name, id(1, "Arm"));
    assert.equal(runtime.addCalls[0][1], 0);
    assert.equal(runtime.addCalls[0][2], false);
    assert.equal(runtime.addCalls[0][3], "");
    assert.equal(runtime.equipment.get("ItemArms").name, id(1, "Arm"));
    assert.equal(runtime.beforeDamage(spinner), 0.05);
});

test("runtime pose, blocker, and native add checks reject before the weighted draw", () => {
    for (const configure of [
        (runtime) => {
            runtime.context.KDCurrentModels.set(runtime.context.KinkyDungeonPlayer, { Poses: { Kneel: true } });
        },
        (runtime) => {
            runtime.state.blockers = (restraint) =>
                restraint.name === id(1, "Arm") ? [{ name: "ExternalBlocker" }] : [];
        },
        (runtime) => {
            runtime.state.canAdd = (restraint) => restraint.name !== id(1, "Arm");
        },
    ]) {
        const runtime = loadRuntime();
        runtime.seed(families.filter((family) => family !== "Arm"));
        runtime.seed(
            lv2Families.filter((f) => f !== "Arm"),
            2,
        );
        runtime.seed(
            lv3Families.filter((f) => f !== "Arm"),
            3,
        );
        configure(runtime);
        const definition = runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === "Spinner");
        const spinner = { Enemy: definition, hp: 3, id: 20 };
        const result = runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
            runtime.context.KinkyDungeonPlayerEntity,
            "tickle",
            definition.effect.effect,
            undefined,
            "Enemy",
            undefined,
            spinner,
        );
        assert.equal(result.effect, false);
        assert.equal(runtime.addCalls.length, 0);
        assert.equal(runtime.beforeDamage(spinner), 0.05);
    }

    const nativeCheck = loadRuntime();
    nativeCheck.seed(families.filter((family) => family !== "Arm"));
    const definition = nativeCheck.context.KinkyDungeonEnemies.find((entry) => entry.name === "Spinner");
    const spinner = { Enemy: definition, hp: 3, id: 21 };
    nativeCheck.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        nativeCheck.context.KinkyDungeonPlayerEntity,
        "tickle",
        definition.effect.effect,
        undefined,
        "Enemy",
        undefined,
        spinner,
    );
    const armCheck = nativeCheck.canAddCalls.find((args) => args[0].name === id(1, "Arm"));
    assert.ok(armCheck);
    assert.equal(armCheck[1], false);
    assert.equal(armCheck[2], "");
    assert.equal(armCheck[3], false);
    assert.equal(armCheck[5], true);
    assert.equal(armCheck[6], true);
    assert.equal(armCheck[7], spinner);
});

test("left and right mittens are applied as independent linked ItemHands restraints", () => {
    const runtime = loadRuntime();
    runtime.seed(families.filter((family) => !["MittenLeft", "MittenRight"].includes(family)));
    runtime.context.KDCurrentModels.set(runtime.context.KinkyDungeonPlayer, { Poses: { Closed: true, Free: true } });
    runtime.state.canAdd = (restraint) => restraint.Group === "ItemHands";
    const definition = runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === "Jumper");
    const spinner = { Enemy: definition, hp: 3, id: 22 };
    const bind = () =>
        runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
            runtime.context.KinkyDungeonPlayerEntity,
            "tickle",
            definition.effect.effect,
            undefined,
            "Enemy",
            undefined,
            spinner,
        );
    assert.equal(bind().effect, true);
    assert.equal(bind().effect, true);
    assert.deepEqual(
        runtime.addCalls.map((args) => args[0].name).sort(),
        [id(1, "MittenLeft"), id(1, "MittenRight")].sort(),
    );
    const root = runtime.equipment.get("ItemHands");
    assert.deepEqual([root.name, root.dynamicLink.name].sort(), [id(1, "MittenLeft"), id(1, "MittenRight")].sort());
    assert.equal(root.restraint.bindhands + root.dynamicLink.restraint.bindhands, 1);
});

test("mitten application bypasses inaccessible arms while preserving native linking and other blockers", () => {
    const runtime = loadRuntime();
    const arms = { name: "LatexArmbinder", lock: "Red", cutProgress: 0.3 };
    runtime.equipment.set("ItemArms", arms);
    runtime.state.blockers = (restraint, player, bypass) => (bypass ? [] : [arms]);
    runtime.state.canAdd = (restraint, bypass, lock, noStack, current, deep, noOverpower) =>
        restraint.Group === "ItemHands" && restraint.bypass === true && noOverpower === true;
    const definition = runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === "Jumper");
    const spinner = { Enemy: definition, hp: 3, id: 24 };
    const bind = () =>
        runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
            runtime.context.KinkyDungeonPlayerEntity,
            "tickle",
            definition.effect.effect,
            undefined,
            "Enemy",
            undefined,
            spinner,
        );
    assert.equal(bind().effect, true);
    assert.equal(bind().effect, true);
    assert.deepEqual(
        runtime.addCalls.map((args) => args[0].name).sort(),
        [id(1, "MittenLeft"), id(1, "MittenRight")].sort(),
    );
    assert.equal(runtime.equipment.get("ItemArms"), arms);
    assert.equal(arms.lock, "Red");
    assert.equal(arms.cutProgress, 0.3);
    assert.ok(runtime.blockerCalls.filter((args) => args[0].Group !== "ItemHands").every((args) => args[2] === false));
    const rejected = loadRuntime({ canAdd: false, blockers: () => [] });
    const denied = rejected.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        rejected.context.KinkyDungeonPlayerEntity,
        "tickle",
        definition.effect.effect,
        undefined,
        "Enemy",
        undefined,
        spinner,
    );
    assert.equal(denied.effect, false);
    assert.equal(rejected.addCalls.length, 0);
});

test("enemy Lv2 progression contains five body families without mittens, eyes, or mouth layers", () => {
    const runtime = loadRuntime();
    runtime.seed(families, 1);
    runtime.state.canAdd = (restraint) => restraint.name.includes("Lv2");
    const definition = runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === "Jumper");
    const spinner = { Enemy: definition, hp: 3, id: 23 };
    const bind = () =>
        runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
            runtime.context.KinkyDungeonPlayerEntity,
            "tickle",
            definition.effect.effect,
            undefined,
            "Enemy",
            undefined,
            spinner,
        );
    for (let index = 0; index < lv2Families.length; index += 1) assert.equal(bind().effect, true);
    assert.deepEqual(
        runtime.addCalls
            .slice(-lv2Families.length)
            .map((args) => args[0].name)
            .sort(),
        lv2Families.map((family) => id(2, family)).sort(),
    );
    assert.equal(
        runtime.addCalls.some((args) => [id(2, "Stuffing"), id(2, "Gag")].includes(args[0].name)),
        false,
    );
    assert.equal(
        runtime.addCalls.some((args) => [id(2, "MittenLeft"), id(2, "MittenRight")].includes(args[0].name)),
        false,
    );
});

function equipExternal(runtime, name, group, armour = true) {
    const restraint = { name, Group: group, armor: armour };
    runtime.context.KinkyDungeonRestraints.push(restraint);
    const item = {
        name,
        group,
        id: 801 + runtime.equipment.size,
        lock: "Blue",
        tightness: 7,
        data: { external: true },
        cutProgress: 0.3,
        dynamicLink: runtime.equipment.get(group),
    };
    runtime.equipment.set(group, item);
    return item;
}

function bindWebCaster(runtime) {
    const definition = runtime.context.KinkyDungeonEnemies.find((entry) => entry.name === "WebCaster");
    return runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        runtime.context.KinkyDungeonPlayerEntity,
        "tickle",
        { profile: "WebCaster" },
        undefined,
        "Enemy",
        undefined,
        { Enemy: definition, hp: 3, id: 80 },
    );
}

test("native-compatible ordinary and mixed external chains permit every inner group and Cocoon without losing items", () => {
    const runtime = loadRuntime();
    const foreign = [];
    for (const group of [...new Set(Object.values(groups)), "ItemDevices"]) {
        foreign.push(equipExternal(runtime, `Armour-${group}`, group));
        foreign.push(equipExternal(runtime, `Restraint-${group}`, group, false));
    }
    const original = foreign.map(plain);
    const api = runtime.context.Spiderlings.Webbing;
    for (let n = 0; n < 24; n++) {
        const before = runtime.context.KinkyDungeonAllRestraintDynamic().length;
        runtime.context.KDPlayerEffects[api.WEBSPRAY_EFFECT](
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            { provenance: api.WEBSPRAY_PROVENANCE, triggerSource: "direct" },
            undefined,
            "Enemy",
        );
        while (runtime.scheduled.length) runtime.scheduled.shift()();
        const worn = runtime.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item);
        assert.equal(worn.length, before + 1, `hit ${n + 1} must add one item`);
        assert(
            foreign.every((item) => worn.includes(item)),
            "foreign instances remain equipped",
        );
        assert.deepEqual(foreign.map(plain), original, "locks, progress, data and foreign links remain unchanged");
    }
    assert.equal(runtime.equipment.get("ItemDevices").name, api.COCOON_ID);
    assert(
        runtime.canAddCalls.every((args) => args[6] === true),
        "native noOverpower is required",
    );
});

test("a natively incompatible device still blocks Cocoon with full layers and five spray stacks", () => {
    const runtime = loadRuntime();
    runtime.seed(families);
    runtime.seed(lv2Families, 2);
    runtime.seed(lv3Families, 3);
    const device = equipExternal(runtime, "IncompatibleDevice", "ItemDevices", false);
    runtime.state.canAdd = (restraint) => restraint.name !== "SpiderlingsWebbingCocoon";
    const api = runtime.context.Spiderlings.Webbing;
    for (let n = 0; n < 6; n++)
        runtime.context.KDPlayerEffects[api.WEBSPRAY_EFFECT](
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            { provenance: api.WEBSPRAY_PROVENANCE, triggerSource: "direct" },
            undefined,
            "Enemy",
        );
    assert.equal(runtime.equipment.get("ItemDevices"), device);
    assert.equal(runtime.addCalls.length, 0);
});

test("armour links complete ten Lv1, five Lv2 and eight Lv3 through independent families and preserve foreign instances", () => {
    const runtime = loadRuntime({ globals: { KDRandom: () => 0 } });
    const tunic = equipExternal(runtime, "ChainTunic", "ItemTorso");
    const boots = equipExternal(runtime, "SteelBoots", "ItemBoots");
    const original = [plain(tunic), plain(boots)];
    runtime.seed(families.filter((family) => !["Belly", "Foot"].includes(family)));
    const names = () => runtime.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name);
    for (let hit = 0; hit < 15; hit += 1) {
        const before = names().length;
        assert.equal(bindWebCaster(runtime).effect, true);
        while (runtime.scheduled.length) runtime.scheduled.shift()();
        assert.equal(names().length, before + 1, "one physical item per successful hit");
        const equipped = runtime.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item);
        assert.ok(equipped.includes(tunic) && equipped.includes(boots));
        assert.deepEqual([plain(tunic), plain(boots)], original);
    }
    assert.equal(bindWebCaster(runtime).effect, false, "full layers alone cannot trigger Cocoon");
    assert.equal(runtime.addCalls.length, 15);
    for (const entry of syntheticCatalog([1, 2, 3])) assert.ok(names().includes(entry.id));
    for (const args of runtime.canAddCalls) assert.equal(args[6], true, "native noOverpower remains enabled");
});

test("external linking rejects native incompatibility, blockers and missing native checks", () => {
    for (const configure of [
        (runtime) => {
            runtime.state.canAdd = (restraint) => restraint.name !== id(1, "Belly");
        },
        (runtime) => {
            runtime.state.blockers = (restraint) =>
                restraint.name === id(1, "Belly") ? [{ name: "NativeBlocker" }] : [];
        },
        (runtime) => {
            delete runtime.context.KDCanAddRestraint;
        },
        (runtime) => {
            delete runtime.context.KDGetBlockersToAddRestraint;
        },
    ]) {
        const runtime = loadRuntime();
        const tunic = equipExternal(runtime, "ChainTunic", "ItemTorso");
        const original = plain(tunic);
        runtime.seed(families.filter((family) => family !== "Belly"));
        runtime.seed(
            lv2Families.filter((f) => f !== "Belly"),
            2,
        );
        runtime.seed(
            lv3Families.filter((f) => f !== "Belly"),
            3,
        );
        configure(runtime);
        assert.equal(bindWebCaster(runtime).effect, false);
        assert.equal(runtime.addCalls.length, 0);
        assert.deepEqual(plain(tunic), original);
    }
});

test("failed native armour add does not reroll, remove armour, or advance; next hit can retry", () => {
    const runtime = loadRuntime({ addResult: 0 });
    runtime.state.canAdd = (restraint) => restraint.Group === "ItemTorso";
    const tunic = equipExternal(runtime, "ChainTunic", "ItemTorso");
    runtime.seed(families.filter((family) => family !== "Belly"));
    assert.equal(bindWebCaster(runtime).effect, false);
    assert.equal(runtime.addCalls.length, 1);
    assert.equal(runtime.equipment.get("ItemTorso"), tunic);
    runtime.state.addResult = 1;
    assert.equal(bindWebCaster(runtime).effect, true);
    assert.equal(runtime.addCalls.length, 2);
    assert.equal(runtime.equipment.get("ItemTorso").dynamicLink, tunic);
    assert.equal(runtime.equipment.get("ItemTorso").name, id(1, "Belly"));
});

test("failed add and saturated no-op retain enemies and apply the same light damage as successful hits", () => {
    const failed = loadRuntime({ addResult: 0 });
    failed.seed(families.filter((family) => family !== "Arm"));
    const spinnerDefinition = failed.context.KinkyDungeonEnemies.find((entry) => entry.name === "Spinner");
    const spinner = { Enemy: spinnerDefinition, hp: 3, id: 11 };
    const failedResult = failed.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        failed.context.KinkyDungeonPlayerEntity,
        "tickle",
        spinnerDefinition.effect.effect,
        undefined,
        "Enemy",
        undefined,
        spinner,
    );
    if (failedResult.effect && spinner.Enemy.suicideOnEffect) spinner.hp = 0;
    assert.equal(failedResult.effect, false);
    assert.equal(spinner.hp, 3);
    assert.equal(failed.addCalls.length, 1);
    assert.equal(failed.equipment.has("ItemArms"), false);
    assert.equal(failed.beforeDamage(spinner), 0.05);
    assert.equal(failed.beforeDamage(spinner), 0.05, "each later contact uses the same fixed damage");

    const saturated = loadRuntime();
    saturated.seed(families);
    saturated.seed(lv2Families, 2);
    saturated.seed(lv3Families, 3);
    const jumperDefinition = saturated.context.KinkyDungeonEnemies.find((entry) => entry.name === "Jumper");
    const jumper = { Enemy: jumperDefinition, hp: 2, id: 12 };
    const saturatedResult = saturated.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        saturated.context.KinkyDungeonPlayerEntity,
        "tickle",
        jumperDefinition.effect.effect,
        undefined,
        "Enemy",
        undefined,
        jumper,
    );
    assert.equal(saturatedResult.effect, false);
    assert.equal(saturated.addCalls.length, 0);
    assert.equal(saturated.beforeDamage(jumper), 0.05);

    const dashSaturated = loadRuntime();
    dashSaturated.seed(families);
    dashSaturated.seed(lv2Families, 2);
    dashSaturated.seed(lv3Families, 3);
    const dashJumperDefinition = dashSaturated.context.KinkyDungeonEnemies.find((entry) => entry.name === "Jumper");
    const dashJumper = { Enemy: dashJumperDefinition, hp: 2, id: 13 };
    const dashResult = dashSaturated.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        dashSaturated.context.KinkyDungeonPlayerEntity,
        "tickle",
        { name: "SpiderlingsWebbingEnemyBind", profile: "Jumper", consumeOnProgress: true },
        undefined,
        "Enemy",
        undefined,
        dashJumper,
    );
    assert.equal(dashResult.effect, false);
    assert.equal(dashJumper.hp, 2);
    assert.equal(dashSaturated.beforeDamage(dashJumper), 0.05, "later ordinary contact does not inherit a Dash bonus");
});
