"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const modRoot = path.resolve(__dirname, "../../..");

const families = [
    { family: "Arm", asset: "ArmWebbing.png", source: "T's NEW Webbing LV1 Arm Webbing.png", group: "ItemArms" },
    {
        family: "MittenLeft",
        asset: "MittenLeft.png",
        source: "T's NEW Webbing LV1 Web Mittens.png",
        group: "ItemHands",
    },
    {
        family: "MittenRight",
        asset: "MittenRight.png",
        source: "T's NEW Webbing LV1 Web Mittens.png",
        group: "ItemHands",
    },
    { family: "Belly", asset: "Belly.png", source: "T's NEW Webbing LV1 Belly Wrapping.png", group: "ItemTorso" },
    { family: "Legs", asset: "Legs.png", source: "T's NEW Webbing LV1 Leg Webbing.png", group: "ItemLegs" },
    { family: "Ankles", asset: "Ankles.png", source: "T's NEW Webbing LV1 Ankle Webbing.png", group: "ItemFeet" },
    { family: "Foot", asset: "Foot.png", source: "T's NEW Webbing LV1 Foot Webbing.png", group: "ItemBoots" },
    {
        family: "Blindfold",
        asset: "Blindfold.png",
        source: "T's NEW Webbing LV1 Blindfold Webbing.png",
        group: "ItemHead",
    },
    {
        family: "Stuffing",
        asset: "Stuffing.png",
        source: "T's NEW Webbing LV1 Mouth Filling Webbing.png",
        group: "ItemMouth",
    },
    { family: "Gag", asset: "Gag.png", source: "T's NEW Webbing LV1 Gag Webbing.png", group: "ItemMouth" },
].map((entry) => ({
    ...entry,
    id: `SpiderlingsWebbingLv1${entry.family}`,
    model: `SpiderlingsWebbingLv1${entry.family}Model`,
    runtimeAsset: `Models/SpiderlingsWebbingLv1/${entry.asset}`,
}));
const lv2Families = [
    { family: "Arm", asset: "ArmWebbing.png", source: "T's NEW Webbing LV2 Arm Webbing.png", group: "ItemArms" },
    { family: "Belly", asset: "Belly.png", source: "T's NEW Webbing LV2 Belly Webbing.png", group: "ItemTorso" },
    { family: "Legs", asset: "Legs.png", source: "T's NEW Webbing LV2 Leg Webbing.png", group: "ItemLegs" },
    { family: "Ankles", asset: "Ankles.png", source: "T's NEW Webbing LV2 Ankle Webbing.png", group: "ItemFeet" },
    { family: "Foot", asset: "Foot.png", source: "T's NEW Webbing LV2 Foot Webbing.png", group: "ItemBoots" },
].map((entry) => ({
    ...entry,
    id: `SpiderlingsWebbingLv2${entry.family}`,
    model: `SpiderlingsWebbingLv2${entry.family}Model`,
    runtimeAsset: `Models/SpiderlingsWebbingLv2/${entry.asset}`,
}));
const armId = families[0].id;
const lv3Families = ["Arm", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Gag", "Hood"];
const armModelId = families[0].model;
const armAsset = families[0].runtimeAsset;
const lv2ArmDisplacement = "DisplacementMaps/SpiderlingsWebbingLv2ArmSquish.png";
const displacementAssets = [
    "DisplacementMaps/SpiderlingsWebbingLv2ArmSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2BellySquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2LegsSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2AnklesSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2FootSquish.png",
];
const webbingAtlas = "TextureAtlas/spiderlings-webbing-0.json";
const webbingAtlasImage = "TextureAtlas/spiderlings-webbing-0.png";
const pinkAtlas = "TextureAtlas/spiderlings-webbing-pink-0.json";
const pinkAtlasImage = "TextureAtlas/spiderlings-webbing-pink-0.png";

function loadWebbingRuntime(overrides = {}) {
    const models = [];
    const texts = {};
    const equipped = new Map();
    const addCalls = [];
    const removeCalls = [];
    const context = {
        console,
        KinkyDungeonEnemies: [],
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDEventMapInventory: {},
        KDEventMapSpell: {},
        KDPlayerEffects: { TrapBindings: () => ({ effect: true }) },
        KDModConfigs: {},
        KDModSettings: {},
        KDTapeLink: ["Wrapping"],
        KDTapeRender: ["Wrapping"],
        KDBindable: "Bindable",
        KDDevices: "Devices",
        KDCorsetLink: "Corsets",
        KDHarnessLink: "Harnesses",
        KDElbowBind: "ElbowBind",
        KDWrappable: "Wrappable",
        ModelDefs: {},
        KDOptimizeDisplacementMapInfo: {},
        KDModelDefs: {},
        KDMapInit(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToMap(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToLayerMap(layers) {
            return Object.fromEntries((layers || []).map((layer) => [layer.Name, layer]));
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
        KinkyDungeonAddRestraintText(name, displayName, description, flavorText) {
            texts[`Restraint${name}`] = displayName;
            texts[`Restraint${name}Desc`] = description;
            texts[`Restraint${name}Desc2`] = flavorText;
        },
        KinkyDungeonRefreshRestraintsCache() {},
        KinkyDungeonRefreshEnemiesCache() {},
        KinkyDungeonGetRestraintByName(name) {
            return context.KinkyDungeonRestraints.find((restraint) => restraint.name === name);
        },
        KinkyDungeonGetRestraintItem(group) {
            return equipped.get(group);
        },
        KDCanAddRestraint() {
            return true;
        },
        KinkyDungeonAddRestraint(restraint, tightness, bypass, lock) {
            addCalls.push({ restraint, tightness, bypass, lock });
            const previous = equipped.get(restraint.Group);
            const item = {
                name: restraint.name,
                group: restraint.Group,
                tightness,
                lock,
                data: {},
            };
            if (
                previous &&
                Array.isArray(previous.restraint.LinkableBy) &&
                previous.restraint.LinkableBy.some((tag) => (restraint.shrine || []).includes(tag))
            ) {
                item.dynamicLink = previous;
            }
            item.restraint = restraint;
            equipped.set(restraint.Group, item);
            return 1;
        },
        KinkyDungeonRemoveRestraintSpecific(item) {
            removeCalls.push(item);
            if (!item) return false;
            const root = equipped.get(item.group);
            if (root === item) {
                if (item.dynamicLink) equipped.set(item.group, item.dynamicLink);
                else equipped.delete(item.group);
                return true;
            }
            let parent = root;
            while (parent && parent.dynamicLink !== item) parent = parent.dynamicLink;
            if (!parent) return false;
            parent.dynamicLink = item.dynamicLink;
            return true;
        },
        addTextKey(key, value) {
            texts[key] = value;
        },
        ...overrides,
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);

    for (const file of [
        "SpiderlingsCore.js",
        "SpiderlingsModelRuntime.js",
        "Spiderlings.js",
        "SpiderlingsWebbingModels.js",
        "SpiderlingsCombat.js",
        "SpiderlingsWebbing.js",
    ]) {
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    }

    return { context, models, texts, equipped, addCalls, removeCalls };
}

module.exports = {
    loadWebbingRuntime,
    modRoot,
    families,
    lv2Families,
    lv3Families,
    armId,
    armModelId,
    armAsset,
    lv2ArmDisplacement,
    displacementAssets,
    webbingAtlas,
    webbingAtlasImage,
    pinkAtlas,
    pinkAtlasImage,
};
