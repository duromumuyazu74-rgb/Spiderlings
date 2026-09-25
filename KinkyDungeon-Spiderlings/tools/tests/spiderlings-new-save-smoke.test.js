"use strict";

// This is a headless new-save smoke, not a visual or image-content test.
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
const lv3Families = ["Arm", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Gag", "Hood"];
const lv2Families = ["Arm", "Belly", "Legs", "Ankles", "Foot"];
const groups = Object.freeze({
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
});
const scripts = [
    "SpiderlingsCore.js",
    "SpiderlingsEncounters.js",
    "SpiderlingsWebCaster.js",
    "SpiderlingsModelRuntime.js",
    "Spiderlings.js",
    "SpiderlingsInfestation.js",
    "SpiderlingsCombat.js",
    "SpiderlingsNPCAdhesion.js",
    "SpiderlingsNPCWrapping.js",
    "SpiderlingsMage.js",
    "SpiderlingsMageRunes.js",
    "SpiderlingsJumperDash.js",
    "SpiderlingsWebbingModels.js",
    "SpiderlingsWebbingData.js",
    "SpiderlingsWebbingRules.js",
    "SpiderlingsWebbing.js",
    "SpiderlingsMageSpells.js",
    "SpiderlingsSpinnerTopology.js",
    "SpiderlingsSpinnerArt.js",
    "SpiderlingsSpinnerCapture.js",
    "SpiderlingsSpinnerRecoveryCore.js",
    "SpiderlingsSpinnerNPCCapture.js",
    "SpiderlingsSpinnerField.js",
    "SpiderlingsSpinnerNativeField.js",
    "SpiderlingsSpinnerRecovery.js",
    "SpiderlingsSpinnerNPCRecovery.js",
    "SpiderlingsSpinnerAI.js",
    "SpiderlingsSpinnerScenarios.js",
    "SpiderlingsSpinnerRollout.js",
    "SpiderlingsSpinnerRuntime.js",
];
const lv1Id = (family) => `SpiderlingsWebbingLv1${family}`;
const lv2Id = (family) => `SpiderlingsWebbingLv2${family}`;
const cocoonId = "SpiderlingsWebbingCocoon";

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function freshNewSaveRuntime() {
    const models = [];
    const equipment = new Map();
    const loose = new Map();
    const refresh = { force: 0, dress: 0 };
    const context = {
        console,
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
        KinkyDungeonStatsPresets: {},
        KDPerkStart: {},
        KinkyDungeonPlayer: { player: true },
        KinkyDungeonPlayerEntity: { player: true },
        KinkyDungeonPlayerBuffs: {},
        KDGameData: { PrisonerState: "" },
        KDMapData: { Entities: [] },
        KDCurrentModels: new Map(),
        KDTapeLink: ["Wrapping"],
        KDTapeRender: ["Wrapping"],
        KDBindable: "Bindable",
        KDDevices: "Devices",
        KDCorsetLink: "Corsets",
        KDHarnessLink: "Harnesses",
        KDElbowBind: "ElbowBind",
        KDWrappable: "Wrappable",
        ModelDefs: {},
        KDModelDefs: {},
        KDMapInit(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToMap(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToLayerMap(values) {
            return Object.fromEntries((values || []).map((value) => [value.Name, value]));
        },
        KDAddEvent(map, trigger, type, handler) {
            map[trigger] = map[trigger] || {};
            map[trigger][type] = handler;
        },
        AddModel(model) {
            models.push(model);
            context.ModelDefs[model.Name] = model;
            context.KDModelDefs[model.Name] = model;
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
        KinkyDungeonInventoryGetLoose(name) {
            return loose.get(name);
        },
        KinkyDungeonInventoryRemove(entry) {
            loose.delete(entry.name);
        },
        KinkyDungeonAllRestraintDynamic() {
            const result = [];
            for (const root of equipment.values()) {
                for (let item = root; item; item = item.dynamicLink) result.push({ item });
            }
            return result;
        },
        KDCanAddRestraint() {
            return true;
        },
        KDGetBlockersToAddRestraint() {
            return [];
        },
        KinkyDungeonAddRestraint(restraint, tightness, _bypass, lock) {
            equipment.set(restraint.Group, {
                name: restraint.name,
                group: restraint.Group,
                restraint,
                tightness,
                lock,
                data: {},
                dynamicLink: equipment.get(restraint.Group),
            });
            return 1;
        },
        KinkyDungeonRemoveRestraintSpecific(item, keep) {
            const root = equipment.get(item && item.group);
            if (root !== item) return false;
            if (item.dynamicLink) equipment.set(item.group, item.dynamicLink);
            else equipment.delete(item.group);
            if (keep) {
                const retained = loose.get(item.name);
                if (retained) retained.quantity += 1;
                else loose.set(item.name, { name: item.name, type: "LooseRestraint", quantity: 1 });
            }
            return [item];
        },
        KinkyDungeonApplyBuffToEntity(_entity, buff) {
            context.KinkyDungeonPlayerBuffs[buff.id] = { ...buff };
        },
        KinkyDungeonExpireBuff(_entity, id) {
            delete context.KinkyDungeonPlayerBuffs[id];
        },
        KinkyDungeonCalculateSlowLevel() {},
        ForceRefreshModels() {
            refresh.force += 1;
        },
        KinkyDungeonDressPlayer() {
            refresh.dress += 1;
        },
        setTimeout(callback) {
            callback();
            return 1;
        },
        queueMicrotask(callback) {
            callback();
        },
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);

    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    assert.deepEqual(
        manifest.fileorder.filter((entry) => entry.endsWith(".js")),
        scripts,
        "new-save runtime follows the manifest script order",
    );
    for (const script of scripts)
        vm.runInContext(fs.readFileSync(path.join(modRoot, script), "utf8"), context, { filename: script });
    return { context, models, equipment, loose, refresh };
}

test("native perk initialization equips all 24 physical layers only when selected", () => {
    const { context, equipment } = freshNewSaveRuntime();
    const source = fs.readFileSync(
        require("../reference-inputs.js").gamePath("Game/src/player/KinkyDungeonPerks.ts"),
        "utf8",
    );
    const start = source.indexOf("function KDInitPerks() {");
    const end = source.indexOf("let KDPerkStart =", start);
    assert.ok(start >= 0 && end > start);
    Object.assign(context, {
        KinkyDungeonStatsChoice: new Map(),
        KinkyDungeonUpdateRestraints() {
            return {};
        },
        KDEntityRestraintMetadata: new Map(),
        KDUpdateRestraintMetadata() {
            return {};
        },
    });
    vm.runInContext(source.slice(start, end), context);
    const id = "SpiderlingsCocoonStart";
    assert.equal(context.KinkyDungeonStatsPresets[id].category, "Start");
    assert.equal(context.KinkyDungeonStatsPresets[id].cost, -1);
    const costStart = source.indexOf("function KDGetPerkCost(");
    const costEnd = source.indexOf("function KDCanPickPerk(", costStart);
    assert.ok(costStart >= 0 && costEnd > costStart);
    const costFunctions = source
        .slice(costStart, costEnd)
        .replace("perk: KDPerk): number", "perk)")
        .replace("Stats: Map<any, any>): number", "Stats)");
    vm.runInContext(costFunctions, context);
    const displayMultiplier = Number(source.match(/let KDPERKCOSTMULT = (\d+);/)[1]);
    assert.equal(context.KinkyDungeonGetStatPoints(context.KinkyDungeonStatsChoice), 0);
    context.KinkyDungeonStatsChoice.set(id, true);
    assert.equal(
        displayMultiplier * context.KinkyDungeonGetStatPoints(context.KinkyDungeonStatsChoice),
        2,
        "selecting Silken Awakening grants two displayed points through native accounting",
    );
    context.KinkyDungeonStatsChoice.delete(id);
    context.KDInitPerks();
    assert.equal(equipment.size, 0);
    context.KinkyDungeonStatsChoice.set(id, false);
    context.KDInitPerks();
    assert.equal(equipment.size, 0);
    context.KinkyDungeonStatsChoice.set(id, true);
    context.KDInitPerks();
    const items = context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item);
    const expected = [
        ...families.map(lv1Id),
        ...lv2Families.map(lv2Id),
        ...lv3Families.map((family) => `SpiderlingsWebbingLv3${family}`),
        cocoonId,
    ];
    assert.deepEqual(items.map((item) => item.name).sort(), expected.sort());
    for (const item of items) {
        assert.equal(item.lock, "");
        assert.equal(item.tightness, 0);
        assert.equal(item.data.SpiderlingsCocoonOuterWebs?.anchored ?? false, false);
    }
    assert.equal(context.KinkyDungeonStatsChoice.has("MagicHands"), false);
    context.KDPerkStart[id]();
    assert.equal(context.KinkyDungeonAllRestraintDynamic().length, 24, "existing layers are not duplicated");
});

test("Spiderlings Hood toggle and native NoHood each skip the start Hood; disabling removes only an owned Hood", () => {
    const disabled = freshNewSaveRuntime();
    disabled.context.KinkyDungeonStatsChoice = new Map();
    const setting = disabled.context.KDModConfigs.Spiderlings.find((entry) => entry.refvar === "spiderlingsEnableHood");
    assert.equal(setting.default, true);
    disabled.context.KDModSettings.Spiderlings.spiderlingsEnableHood = false;
    disabled.context.KDPerkStart.SpiderlingsCocoonStart();
    const disabledNames = disabled.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name);
    assert.equal(disabledNames.length, 23);
    assert.equal(disabledNames.includes("SpiderlingsWebbingLv3Hood"), false);
    assert.equal(disabledNames.includes(cocoonId), true);

    const perk = freshNewSaveRuntime();
    perk.context.KinkyDungeonStatsChoice = new Map([["NoHood", true]]);
    perk.context.KDPerkStart.SpiderlingsCocoonStart();
    assert.equal(
        perk.context.KinkyDungeonAllRestraintDynamic().some(({ item }) => item.name === "SpiderlingsWebbingLv3Hood"),
        false,
    );

    const changed = freshNewSaveRuntime();
    changed.context.KinkyDungeonStatsChoice = new Map();
    changed.context.KDPerkStart.SpiderlingsCocoonStart();
    assert.equal(changed.context.KinkyDungeonAllRestraintDynamic().length, 24);
    changed.context.KDModSettings.Spiderlings.spiderlingsEnableHood = false;
    changed.context.KDEventMapGeneric.tickAfter.SpiderlingsHoodPreference({}, { delta: 1 });
    const names = changed.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name);
    assert.equal(names.length, 23);
    assert.equal(names.includes("SpiderlingsWebbingLv3Hood"), false);
    assert.equal(names.includes("SpiderlingsWebbingLv3Blindfold"), true);
    assert.equal(names.includes(cocoonId), true);
});

function syntheticCatalog(stages = [1, 2, 3]) {
    return stages.flatMap((stage) =>
        (stage === 3 ? lv3Families : stage === 2 ? lv2Families : families).map((family) => ({
            id: `SpiderlingsWebbingLv${stage}${family}`,
            family,
            group: groups[family],
            stage: `Lv${stage}`,
            requiredActions: stage,
        })),
    );
}

function item(stage, family) {
    return { name: `SpiderlingsWebbingLv${stage}${family}`, group: groups[family], data: {} };
}

function snapshot(items = [], stacks = 0) {
    const all = syntheticCatalog();
    const grouped = {};
    for (const entry of items) (grouped[entry.group] ||= []).push(entry);
    return {
        items,
        groups: grouped,
        registered: Object.fromEntries(all.map((entry) => [entry.id, true])),
        poseCompatible: Object.fromEntries(all.map((entry) => [entry.id, true])),
        addCompatible: Object.fromEntries(all.map((entry) => [entry.id, true])),
        webSpray: { stacks, inactiveTurns: 0, lastTriggerTurn: stacks ? 1 : null, lastTrailTurn: null },
    };
}

function resolve(runtime, state, action, catalog) {
    const request = { snapshot: state, action };
    if (catalog) request.catalog = catalog;
    return runtime.context.Spiderlings.Webbing.resolveWebbingAction(request);
}

test("fresh manifest VM exposes active restraints and a damage-only Mage bolt", async () => {
    const runtime = freshNewSaveRuntime();
    const restraintIds = runtime.context.KinkyDungeonRestraints.map((entry) => entry.name).sort();
    const modelIds = runtime.models.map((entry) => entry.Name).sort();
    const bolt = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "SpiderlingsMageBolt");
    assert.equal(bolt?.playerEffect?.name, "Damage");
    assert.equal(bolt.playerEffect.power, 0.5);
    assert.deepEqual(
        restraintIds,
        [
            ...families.map(lv1Id),
            ...lv2Families.map(lv2Id),
            ...lv3Families.map((family) => `SpiderlingsWebbingLv3${family}`),
            cocoonId,
            "SpiderlingsSpinnerLegbinder",
            "SpiderlingsSilkLeash",
        ].sort(),
    );
    assert.deepEqual(
        modelIds,
        [
            ...families.map((family) => `${lv1Id(family)}Model`),
            ...lv2Families.map((family) => `${lv2Id(family)}Model`),
            ...lv3Families.map((family) => `SpiderlingsWebbingLv3${family}Model`),
            "SpiderlingsWebbingCocoonModel",
            "SpiderlingsSpinnerLegbinderModel",
        ].sort(),
    );
    assert.equal(runtime.context.Spiderlings.LooseWebbing, undefined);
    assert.equal(runtime.context.Spiderlings.SilkProgression, undefined);
    assert.equal(
        runtime.context.KinkyDungeonRestraints.filter((entry) => /^SpiderlingsWebbingLv2/.test(entry.name)).length,
        5,
    );

    const byId = new Map(runtime.context.KinkyDungeonRestraints.map((entry) => [entry.name, entry]));
    const arm = byId.get(lv1Id("Arm"));
    const mittenLeft = byId.get(lv1Id("MittenLeft"));
    const mittenRight = byId.get(lv1Id("MittenRight"));
    const belly = byId.get(lv1Id("Belly"));
    assert.equal(arm.Group, "ItemArms");
    assert.equal(arm.bindarms, true);
    assert.equal("bindhands" in arm, false);
    assert.equal(mittenLeft.Group, "ItemHands");
    assert.equal(mittenRight.Group, "ItemHands");
    assert.equal(mittenLeft.bindhands, 0.5);
    assert.equal(mittenRight.bindhands, 0.5);
    for (const family of families) {
        const restraint = byId.get(lv1Id(family));
        assert.equal("remove" in restraint, false, `${family} does not use the retired remove shortcut`);
        assert.equal(
            restraint.events.some(
                (event) =>
                    event.trigger === "postApply" &&
                    event.type === runtime.context.Spiderlings.Webbing.MANUAL_NORMALIZE_EVENT,
            ),
            true,
            `${family} retains the shared post-apply refresh contract`,
        );
    }
    for (const field of ["bindarms", "bindhands", "hobble", "blockfeet", "remove", "harness", "strictness"]) {
        assert.equal(field in belly, false, `Belly does not add ${field}`);
    }

    const byModel = new Map(runtime.models.map((entry) => [entry.Name, entry]));
    for (const family of ["Arm", "MittenLeft", "MittenRight", "Belly", "Legs", "Ankles", "Foot"]) {
        const model = byModel.get(`${lv1Id(family)}Model`);
        assert.equal(
            model.AddPose.some((pose) => /^Encase/.test(pose) || pose === "FlattenedUnderbust" || pose === "WrapArms"),
            false,
            `${family} preserves existing clothing`,
        );
        assert.equal(
            Object.values(model.Layers).some((layer) => "EraseSprite" in layer || "EraseLayers" in layer),
            false,
            `${family} does not erase existing clothing`,
        );
    }
    const bellyModel = byModel.get(`${lv1Id("Belly")}Model`);
    const bellyLayer = Object.values(bellyModel.Layers)[0];
    assert.equal(bellyModel.AddPose.includes("EncaseTorsoLower"), false);
    assert.doesNotMatch(JSON.stringify(bellyLayer), /Displace|Displacement/);
    assert.equal(Object.values(byModel.get(`${lv1Id("Legs")}Model`).Layers)[0].Layer, "WrappingLegsOver");
    assert.equal(Object.values(byModel.get("SpiderlingsWebbingLv2LegsModel").Layers)[0].Layer, "OverSkirtDeco");
    assert.deepEqual(Object.keys(Object.values(byModel.get(`${lv1Id("Arm")}Model`).Layers)[0].Poses), ["Wristtie"]);
    for (const family of ["Belly", "Legs", "Ankles", "Foot"]) {
        const model = byModel.get(`${lv1Id(family)}Model`);
        assert.deepEqual(Array.from(model.RemovePoses), ["Spread", "Kneel", "KneelClosed", "Hogtie"]);
        assert.equal(Object.values(model.Layers)[0].NoColorize, true);
    }
    for (const family of ["Stuffing", "Gag"])
        assert.equal(
            byModel.get(`${lv1Id(family)}Model`).AddPose.some((pose) => pose.startsWith("Encase")),
            false,
        );
    assert.equal(typeof runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels, "function");
    assert.equal(typeof runtime.context.KDEventMapInventory.postApply.SpiderlingsNormalizeManualChain, "function");

    const combined = freshNewSaveRuntime();
    assert.equal(combined.context.Spiderlings.Webbing.equipForDebug(lv1Id("Stuffing")).applied, true);
    assert.equal(combined.context.Spiderlings.Webbing.equipForDebug(lv1Id("Gag")).applied, true);
    const mouthRoot = combined.equipment.get("ItemMouth");
    assert.equal(mouthRoot.name, lv1Id("Gag"));
    assert.equal(mouthRoot.dynamicLink.name, lv1Id("Stuffing"));
    const inventoryEvents = combined.context.KDEventMapInventory;
    inventoryEvents.postApply.SpiderlingsRefreshModels({ trigger: "postApply" }, mouthRoot);
    const afterApplyRefreshes = combined.refresh.force;
    inventoryEvents.afterDress.SpiderlingsRefreshModels({ trigger: "afterDress" }, mouthRoot);
    assert.equal(combined.refresh.force, afterApplyRefreshes, "unchanged mouth colors retain the native dress cache");
    inventoryEvents.postRemoval.SpiderlingsRefreshModels({ trigger: "postRemoval" }, mouthRoot.dynamicLink);
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(combined.refresh.force >= 3, "mouth apply/removal and completed preload request model refreshes");
    assert.ok(
        combined.refresh.dress >= 1,
        "post-apply and post-removal coalesce one redress after texture preloads settle",
    );

    for (const family of families) {
        const isolated = freshNewSaveRuntime();
        const equipped = isolated.context.Spiderlings.Webbing.equipForDebug(lv1Id(family));
        assert.equal(equipped.applied, true, `${family} can be equipped independently`);
        assert.equal(isolated.equipment.get(groups[family]).tightness, 0);
        assert.equal(isolated.equipment.get(groups[family]).lock, "");
        assert.equal(
            isolated.context.Spiderlings.Webbing.completeEffectiveEscape(lv1Id(family), "Remove", { legal: true })
                .completed,
            true,
        );
        assert.equal(isolated.equipment.has(groups[family]), false, `${family} can be removed independently`);
    }
});

test("new-save resolver keeps profiles, no-op, WebSpray provenance, cap, and timeout deterministic", () => {
    const runtime = freshNewSaveRuntime();
    const api = runtime.context.Spiderlings.Webbing;
    assert.deepEqual(plain(api.ENEMY_PROFILES), {
        Spinner: [0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0],
        Jumper: [1, 1, 1, 2, 3, 3, 3, 1, 1, 1, 1],
        WebCaster: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    });
    assert.equal(api.ENEMY_PROFILES.Tunneler, undefined);
    assert.equal(api.ENEMY_PROFILES.NestEntrance, undefined);

    const saturated = resolve(
        runtime,
        snapshot(families.map((family) => item(1, family))),
        {
            type: "enemyBind",
            profile: "Spinner",
            source: { kind: "enemy", name: "Spinner" },
            random: () => 0,
        },
        syntheticCatalog([1]),
    );
    assert.deepEqual(plain(saturated.outcome), {
        progressed: false,
        reason: "no-eligible-candidate",
        profile: "Spinner",
        source: { kind: "enemy", name: "Spinner" },
    });

    const generic = resolve(runtime, snapshot(), {
        type: "webSprayTrigger",
        provenance: "SpiderWeb",
        triggerSource: "trail",
        profile: "WebCaster",
        turn: 1,
        random: () => 0,
    });
    assert.equal(generic.outcome.accepted, false);
    assert.equal(generic.nextSnapshot.webSpray.stacks, 0);

    let state = snapshot();
    for (let turn = 0; turn < 5; turn += 1) {
        state = resolve(runtime, state, {
            type: "webSprayTrigger",
            provenance: "WebCaster.WebSpray",
            triggerSource: "direct",
            profile: "WebCaster",
            turn,
            random: () => 0,
        }).nextSnapshot;
    }
    assert.equal(state.webSpray.stacks, 5);
    for (let turn = 5; turn < 12; turn += 1)
        state = resolve(runtime, state, { type: "webSprayTurnElapsed", turn, delta: 1 }).nextSnapshot;
    assert.deepEqual(plain(state.webSpray), {
        stacks: 0,
        inactiveTurns: 0,
        lastTriggerTurn: null,
        lastTrailTurn: null,
    });
});

test("developer Cocoon scenario keeps gates, twenty-fourth layer, repair, escape, reuse, and prison contracts", () => {
    const runtime = freshNewSaveRuntime();
    const api = runtime.context.Spiderlings.Webbing;
    const lv1 = families.map((family) => item(1, family));
    const allPhysical = [
        ...families.map((family) => item(1, family)),
        ...lv2Families.map((family) => item(2, family)),
        ...lv3Families.map((family) => item(3, family)),
    ];
    const bind = (name, testOnlyLv2Complete = false) => ({
        type: "enemyBind",
        profile: name,
        source: { kind: "enemy", name },
        random: () => 0,
        testOnlyLv2Complete,
    });
    assert.notEqual(resolve(runtime, snapshot(lv1, 5), bind("Spinner")).outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, snapshot(lv1, 5), bind("Spinner", true)).outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, snapshot(allPhysical, 4), bind("Spinner")).outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, snapshot(allPhysical, 5), bind("Spinner")).outcome.selectedId, cocoonId);
    assert.equal(resolve(runtime, snapshot(allPhysical, 5), bind("Jumper")).outcome.selectedId, cocoonId);
    assert.equal(
        allPhysical.length + 1,
        24,
        "Cocoon is the twenty-fourth outer restraint after the twenty-three physical layers",
    );
    assert.notEqual(resolve(runtime, snapshot(allPhysical, 5), bind("Tunneler")).outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, snapshot(allPhysical, 5), bind("NestEntrance")).outcome.selectedId, cocoonId);

    const fifth = resolve(runtime, snapshot(allPhysical, 4), {
        type: "webSprayTrigger",
        provenance: "WebCaster.WebSpray",
        triggerSource: "direct",
        profile: "WebCaster",
        turn: 4,
        random: () => 0,
    });
    assert.equal(fifth.nextSnapshot.webSpray.stacks, 5);
    assert.notEqual(
        fifth.outcome.selectedId,
        cocoonId,
        "the fifth slow hit establishes, rather than consumes, the gate",
    );
    assert.notEqual(
        resolve(runtime, snapshot(allPhysical, 5), {
            type: "webSprayTrigger",
            provenance: "WebCaster.WebSpray",
            triggerSource: "trail",
            profile: "WebCaster",
            turn: 5,
            random: () => 0,
        }).outcome.selectedId,
        cocoonId,
    );

    const cocoon = runtime.context.KinkyDungeonGetRestraintByName(cocoonId);
    assert.equal(cocoon.Group, "ItemDevices");
    assert.notEqual(cocoon.immobile, true);
    assert.equal(cocoon.hobble, 3);
    assert.deepEqual(plain(cocoon.escapeChance), { Cut: 0.025, Struggle: 0.02, Remove: 0.02 });
    assert.deepEqual(plain(api.COCOON_ESCAPE_ACTIONS), { Cut: 40, Struggle: 50, Remove: 50 });
    assert.equal(api.COCOON_REPAIR_AMOUNT, 0.1);
    assert.equal(cocoon.inventory, true);
    for (const field of ["removePrison", "forceRemovePrison", "removeOnDefeat", "removeOnCapture"])
        assert.equal(field in cocoon, false);

    const repaired = resolve(
        runtime,
        {
            ...snapshot([{ name: cocoonId, group: "ItemDevices", cutProgress: 0.3, struggleProgress: 0.2 }], 0),
        },
        bind("WebCaster"),
    );
    assert.equal(repaired.outcome.cocoonRepair.repairAmount, 0.1);
    assert.ok(Math.abs(repaired.outcome.cocoonRepair.cutProgress - 0.24) < 1e-9);
    assert.ok(Math.abs(repaired.outcome.cocoonRepair.struggleProgress - 0.16) < 1e-9);
    assert.equal(
        resolve(
            runtime,
            snapshot([{ name: cocoonId, group: "ItemDevices", cutProgress: 0, struggleProgress: 0 }], 0),
            bind("Jumper"),
        ).outcome.progressed,
        false,
    );

    for (const [method, retained] of [
        ["Cut", false],
        ["Remove", true],
    ]) {
        const lifecycle = freshNewSaveRuntime();
        const restraint = lifecycle.context.KinkyDungeonGetRestraintByName(cocoonId);
        lifecycle.context.KinkyDungeonAddRestraint(restraint, 7, true, "StaleLock");
        const worn = lifecycle.equipment.get("ItemDevices");
        worn.data = { stale: true };
        worn.cutProgress = 0.9;
        worn.struggleProgress = 0.8;
        const finalRemoval = { restraint: worn, struggleType: method, destroyChance: -1 };
        lifecycle.context.KDEventMapInventory.beforeSuccessRemove[api.FINAL_ESCAPE_EVENT]({}, worn, finalRemoval);
        assert.equal(finalRemoval.destroyChance < 1, retained, `${method} final method determines inventory fate`);
        lifecycle.context.KinkyDungeonRemoveRestraintSpecific(worn, finalRemoval.destroyChance < 1);
        assert.equal(lifecycle.equipment.has("ItemDevices"), false);
        assert.equal(lifecycle.loose.has(cocoonId), retained);
        if (retained) {
            const kept = lifecycle.loose.get(cocoonId);
            assert.deepEqual(plain(kept), { name: cocoonId, type: "LooseRestraint", quantity: 1 });
            lifecycle.context.KinkyDungeonInventoryRemove(kept);
            lifecycle.context.KinkyDungeonAddRestraint(restraint, 0, true, "");
            const reequipped = lifecycle.equipment.get("ItemDevices");
            assert.notEqual(reequipped, worn);
            assert.deepEqual(plain(reequipped.data), {});
            assert.equal(reequipped.cutProgress, undefined);
            assert.equal(reequipped.struggleProgress, undefined);
            assert.equal(reequipped.tightness, 0);
            assert.equal(reequipped.lock, "");
        }
    }

    const prison = freshNewSaveRuntime();
    const prisonApi = prison.context.Spiderlings.Webbing;
    assert.equal(prisonApi.equipForDebug(lv1Id("Arm")).applied, true);
    const spell = prison.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const hit = prison.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 1 };
    hit(prison.context.KinkyDungeonPlayerEntity, "inert", spell.playerEffect, spell, "Enemy", { x: 1, y: 1 }, caster);
    assert.equal(prison.context.KinkyDungeonPlayerBuffs.SpiderlingsWebSpraySlow.power, 1);
    const physical = prison.equipment.get("ItemArms");
    prison.context.KDGameData.PrisonerState = "jail";
    prison.context.KDEventMapGeneric.tick.SpiderlingsWebSprayPrisonClear({}, {});
    assert.equal(prison.context.KinkyDungeonPlayerBuffs.SpiderlingsWebSpraySlow, undefined);
    assert.equal(prison.equipment.get("ItemArms"), physical, "prison clear keeps physical Spiderlings equipment");
    hit(prison.context.KinkyDungeonPlayerEntity, "inert", spell.playerEffect, spell, "Enemy", { x: 1, y: 1 }, caster);
    assert.equal(prison.context.KinkyDungeonPlayerBuffs.SpiderlingsWebSpraySlow.power, 1);
    // This second hit may legitimately upgrade the arm layer. The prison hook
    // must preserve equipment as it stands immediately before that hook.
    const physicalAfterHit = prison.equipment.get("ItemArms");
    prison.context.KDEventMapGeneric.postPrisonIntro.SpiderlingsWebSprayClear({}, {});
    assert.equal(prison.context.KinkyDungeonPlayerBuffs.SpiderlingsWebSpraySlow, undefined);
    assert.equal(
        prison.equipment.get("ItemArms"),
        physicalAfterHit,
        "post-prison clear keeps physical Spiderlings equipment",
    );
});
