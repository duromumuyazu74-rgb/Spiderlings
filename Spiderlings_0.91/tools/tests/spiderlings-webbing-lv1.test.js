"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modRoot = path.join(__dirname, "..", "..");
const referenceRoot = path.join(modRoot, "..", "KinkiestDungeon-5.5");
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
const translationFiles = [
    "SpiderlingsCN.csv",
    "SpiderlingsDE.csv",
    "SpiderlingsES.csv",
    "SpiderlingsJP.csv",
    "SpiderlingsKR.csv",
    "SpiderlingsPL.csv",
    "SpiderlingsRU.csv",
];

function parseTranslations(file) {
    return new Map(
        fs
            .readFileSync(path.join(modRoot, file), "utf8")
            .replace(/^\uFEFF/, "")
            .split(/\r?\n/)
            .map((line) => {
                const comma = line.indexOf(",");
                return comma > 0 ? [line.slice(0, comma), line.slice(comma + 1)] : undefined;
            })
            .filter(Boolean),
    );
}

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

function kd55DrawsLayer(layer, poses, highestPriority) {
    const overrideLayer = layer.HideOverrideLayer || layer.Layer;
    if (layer.HideWhenOverridden && highestPriority[overrideLayer] > layer.Pri) return false;
    if (layer.RequirePoses && Object.keys(layer.RequirePoses).some((pose) => !poses[pose])) return false;
    return true;
}

function loadNativeSensoryRuntime() {
    const runtime = loadWebbingRuntime();
    const context = runtime.context;
    Object.assign(context, {
        KinkyDungeonAllRestraint: () => [...runtime.equipped.values()],
        KDRestraint: (item) => context.KinkyDungeonGetRestraintByName(item.name),
        KinkyDungeonStatsChoice: new Map(),
        KinkyDungeonPlayerEntity: { x: 0, y: 0 },
        KinkyDungeonSendEvent: () => {},
        KinkyDungeonBlindLevel: 0,
        KinkyDungeonDeaf: false,
        KinkyDungeonStatBlind: 0,
        KDMapData: { MapBrightness: 8 },
        KDGameData: {},
    });
    for (const [file, signatures] of [
        [
            "item/KinkyDungeonInventory.ts",
            {
                KinkyDungeonAllRestraintDynamic: "function KinkyDungeonAllRestraintDynamic()",
            },
        ],
        [
            "player/KinkyDungeonStats.ts",
            {
                KinkyDungeonGetBlindLevel: "function KinkyDungeonGetBlindLevel()",
                KinkyDungeonGetVisionRadius: "function KinkyDungeonGetVisionRadius()",
                KinkyDungeonGagTotal: "function KinkyDungeonGagTotal(AllowFlags, gagMult = 1)",
                KinkyDungeonCanTalk: "function KinkyDungeonCanTalk(Loose)",
            },
        ],
    ]) {
        const source = fs.readFileSync(path.join(referenceRoot, "Game/src", file), "utf8");
        for (const [name, signature] of Object.entries(signatures)) {
            const original = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
            assert.ok(original, `pinned native ${name}`);
            const body = original.slice(original.indexOf("\n") + 1);
            vm.runInContext(`${signature} {\n${body}`, context);
        }
    }
    return runtime;
}

test("native vision decreases through worn Lv1, Lv3 and Hood layers and recovers on removal", () => {
    const runtime = loadNativeSensoryRuntime();
    const context = runtime.context;
    const vision = () => {
        context.KinkyDungeonBlindLevel = context.KinkyDungeonGetBlindLevel();
        return context.KinkyDungeonGetVisionRadius();
    };
    assert.equal(vision(), 8);
    for (const [id, radius] of [
        ["SpiderlingsWebbingLv1Blindfold", 7],
        ["SpiderlingsWebbingLv3Blindfold", 4],
        ["SpiderlingsWebbingLv3Hood", 2],
    ]) {
        assert.equal(context.Spiderlings.Webbing.equipForDebug(id).applied, true);
        assert.equal(vision(), radius, id);
    }
    for (const radius of [4, 7, 8]) {
        context.KinkyDungeonRemoveRestraintSpecific(runtime.equipped.get("ItemHead"));
        assert.equal(vision(), radius);
    }
    for (const [id, radius] of [
        ["SpiderlingsWebbingLv3Blindfold", 5],
        ["SpiderlingsWebbingLv3Hood", 2],
    ]) {
        assert.equal(context.Spiderlings.Webbing.equipForDebug(id).applied, true);
        assert.equal(vision(), radius, `${id} alone`);
        context.KinkyDungeonRemoveRestraintSpecific(runtime.equipped.get("ItemHead"));
    }
});

test("native speech and verbal casting remain partial through mouth layers and reach full restriction at Hood", () => {
    const runtime = loadNativeSensoryRuntime();
    const context = runtime.context;
    context.KinkyDungeonPlayerBuffs = {};
    context.KinkyDungeonGetBuffedStat = () => 0;
    const magic = fs.readFileSync(path.join(referenceRoot, "Game/src/magic/KinkyDungeonMagic.ts"), "utf8");
    const start = magic.indexOf('\t"Verbal": {');
    const end = magic.indexOf('\t"Arms": {', start);
    assert.ok(start >= 0 && end > start, "pinned native verbal component");
    vm.runInContext(`globalThis.nativeVerbal = {${magic.slice(start, end)}}.Verbal;`, context);
    assert.equal(context.KinkyDungeonGagTotal(), 0);
    for (const [id, gag, canSpeak] of [
        ["SpiderlingsWebbingLv1Stuffing", 0.1, true],
        ["SpiderlingsWebbingLv1Gag", 0.25, true],
        ["SpiderlingsWebbingLv3Gag", 0.75, true],
        ["SpiderlingsWebbingLv3Hood", 1.75, false],
    ]) {
        assert.equal(context.Spiderlings.Webbing.equipForDebug(id).applied, true);
        assert.equal(context.KinkyDungeonGagTotal(), gag, id);
        assert.equal(context.KinkyDungeonCanTalk(true), canSpeak, `${id} loose speech`);
        assert.equal(context.nativeVerbal.check(), canSpeak, `${id} verbal component`);
        assert.equal(context.nativeVerbal.partialMiscastChance(), Math.min(1, gag));
    }
    context.KinkyDungeonRemoveRestraintSpecific(runtime.equipped.get("ItemHead"));
    assert.equal(context.KinkyDungeonCanTalk(true), true, "removing Hood restores partial speech");
    for (const gag of [0.25, 0.1, 0]) {
        context.KinkyDungeonRemoveRestraintSpecific(runtime.equipped.get("ItemMouth"));
        assert.equal(context.KinkyDungeonGagTotal(), gag);
    }
    for (const [id, gag] of [
        ["SpiderlingsWebbingLv1Gag", 0.15],
        ["SpiderlingsWebbingLv3Gag", 0.5],
        ["SpiderlingsWebbingLv3Hood", 1],
    ]) {
        assert.equal(context.Spiderlings.Webbing.equipForDebug(id).applied, true);
        assert.equal(context.KinkyDungeonGagTotal(), gag, `${id} alone`);
        assert.equal(context.nativeVerbal.check(), gag < 0.99);
        context.KinkyDungeonRemoveRestraintSpecific([...runtime.equipped.values()][0]);
    }
});

test("all models use delivered art while left and right mittens remain independent Free-hand restraints", () => {
    const runtime = loadWebbingRuntime();
    const restraints = new Map(runtime.context.KinkyDungeonRestraints.map((entry) => [entry.name, entry]));
    const models = new Map(runtime.models.map((entry) => [entry.Name, entry]));

    assert.equal(restraints.has("SpiderlingsWebbingLv1Mittens"), false);
    assert.equal(restraints.has("SpiderlingsWebbingLv2MittenLeft"), false);
    assert.equal(restraints.has("SpiderlingsWebbingLv2MittenRight"), false);
    assert.equal(restraints.has("SpiderlingsWebbingLv1Stuffing"), true);
    assert.equal(restraints.has("SpiderlingsWebbingLv1Gag"), true);

    for (const side of ["Left", "Right"]) {
        const id = `SpiderlingsWebbingLv1Mitten${side}`;
        const restraint = restraints.get(id);
        const model = models.get(`${id}Model`);
        assert.ok(restraint, `${id} must be registered`);
        assert.ok(model, `${id}Model must be registered`);
        assert.equal(restraint.Group, "ItemHands");
        assert.equal(restraint.bindhands, 0.5);
        assert.deepEqual(Array.from(restraint.LinkableBy), ["SpiderlingsWebbingMittensLayer"]);
        const layers = Object.values(model.Layers);
        assert.equal(layers.length, 1);
        assert.equal(layers[0].Sprite, `Mitten${side}`);
        assert.equal(layers[0].Layer, `Mitten${side}`);
        assert.deepEqual(Object.keys(layers[0].RequirePoses), ["Free"]);
    }

    const testModels = runtime.models.filter((model) =>
        Object.values(model.Layers || {}).some(
            (layer) => layer.Folder === "SpiderlingsWebbingDebug" && layer.Sprite === "TestPlaceholder",
        ),
    );
    assert.deepEqual(
        testModels.map((model) => model.Name),
        [],
    );
});

test("an isolated left or right mitten draws over the hand without erasing an existing glove", () => {
    const runtime = loadWebbingRuntime();
    const models = new Map(runtime.models.map((entry) => [entry.Name, entry]));
    const poses = { Free: true, Spread: true };
    const failures = [];

    for (const side of ["Left", "Right"]) {
        const model = models.get(`SpiderlingsWebbingLv1Mitten${side}Model`);
        const layer = Object.values(model.Layers)[0];
        assert.equal("EraseSprite" in layer, false, `Mitten${side} must preserve existing gloves`);
        assert.equal("EraseLayers" in layer, false, `Mitten${side} must preserve existing glove layers`);
        assert.equal("EraseMorph" in layer, false, `Mitten${side} must not select an erase mask`);
        if (!kd55DrawsLayer(layer, poses, { [`Mitten${side}`]: 100 }))
            failures.push(`${side}: hidden without Closed legs`);
    }
    assert.deepEqual(
        failures,
        [],
        "each isolated mitten must cover a bare hand or existing glove without another Webbing item",
    );
});

test("Arm Webbing registers a direct Wristtie-only ItemArms tracer", () => {
    assert.equal(fs.existsSync(path.join(modRoot, armAsset)), true, `${armAsset} must exist`);

    const runtime = loadWebbingRuntime();
    const restraint = runtime.context.KinkyDungeonRestraints.find((entry) => entry.name === armId);
    const model = runtime.models.find((entry) => entry.Name === armModelId);

    assert.ok(restraint);
    assert.equal(restraint.Model, armModelId);
    assert.equal(restraint.Group, "ItemArms");
    assert.equal(restraint.bindarms, true);
    assert.equal("bindhands" in restraint, false);
    assert.equal("restricthands" in restraint, false);
    assert.equal(restraint.inventory, true);
    assert.equal(restraint.weight, 0);
    assert.deepEqual(Object.keys(restraint.enemyTags), []);
    assert.deepEqual(
        {
            Cut: restraint.escapeChance.Cut,
            Remove: restraint.escapeChance.Remove,
            Struggle: restraint.escapeChance.Struggle,
        },
        { Cut: 100, Remove: 100, Struggle: 100 },
    );

    assert.ok(model);
    assert.equal(model.Folder, "SpiderlingsWebbingLv1");
    assert.ok(model.AddPose.includes("Wristties"));
    for (const pose of [
        "EncaseArmLeft",
        "EncaseArmRight",
        "EncaseTorsoUpper",
        "EncaseChest",
        "FlattenedUnderbust",
        "WrapArms",
    ]) {
        assert.equal(model.AddPose.includes(pose), false, `Arm model must preserve clothing instead of adding ${pose}`);
    }
    const layers = Object.values(model.Layers);
    assert.equal(layers.length, 1);
    assert.equal(layers[0].Sprite, "ArmWebbing");
    assert.deepEqual(Object.keys(layers[0].Poses), ["Wristtie"]);
    assert.equal(layers[0].Invariant, true);
    assert.equal(layers[0].NoColorize, true);
    assert.equal(layers[0].MorphPoses, undefined);
    assert.deepEqual(Array.from(model.RemovePoses), ["Spread", "Kneel", "KneelClosed", "Hogtie"]);
});

test("the complete runtime registers ten Lv1, five Lv2, eight Lv3 restraints, and Cocoon exactly once", () => {
    const runtime = loadWebbingRuntime();
    const expectedRestraints = [
        ...families.map((entry) => entry.id),
        ...lv2Families.map((entry) => entry.id),
        ...lv3Families.map((family) => `SpiderlingsWebbingLv3${family}`),
        "SpiderlingsWebbingCocoon",
    ].sort();
    const expectedModels = [
        ...families.map((entry) => entry.model),
        ...lv2Families.map((entry) => entry.model),
        ...lv3Families.map((family) => `SpiderlingsWebbingLv3${family}Model`),
        "SpiderlingsWebbingCocoonModel",
    ].sort();

    assert.deepEqual(runtime.context.KinkyDungeonRestraints.map((entry) => entry.name).sort(), expectedRestraints);
    assert.deepEqual(runtime.models.map((entry) => entry.Name).sort(), expectedModels);
    assert.deepEqual(
        Array.from(runtime.context.Spiderlings.restraintCatalog.list(), (entry) => entry.id).sort(),
        expectedRestraints,
    );
    assert.equal(runtime.context.Spiderlings.SilkProgression, undefined);
    assert.equal(runtime.context.Spiderlings.LooseWebbing, undefined);
});

test("all five real Lv2 items render their delivered art and require two effective actions", () => {
    const modJson = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    const firstScript = modJson.fileorder.findIndex((file) => file.endsWith(".js"));
    for (const family of lv2Families) {
        const runtime = loadWebbingRuntime();
        const restraint = runtime.context.KinkyDungeonRestraints.find((entry) => entry.name === family.id);
        const model = runtime.models.find((entry) => entry.Name === family.model);
        const catalogEntry = runtime.context.Spiderlings.restraintCatalog
            .list()
            .find((entry) => entry.id === family.id);
        assert.ok(restraint, `${family.id} must be registered`);
        assert.ok(model, `${family.model} must be registered`);
        assert.equal(restraint.Group, family.group);
        assert.equal(restraint.Model, family.model);
        assert.equal(restraint.weight, 0);
        assert.deepEqual(Object.keys(restraint.enemyTags), []);
        assert.equal(catalogEntry.stage, "Lv2");
        const layers = Object.values(model.Layers);
        assert.equal(layers.length, 1);
        assert.equal(model.Folder, "SpiderlingsWebbingLv2");
        assert.equal(layers[0].Sprite, family.asset.replace(/\.png$/, ""));
        assert.notEqual(layers[0].Sprite, "TestPlaceholder");
        assert.equal(layers[0].Pri, 51);
        assert.equal(layers[0].NoOverride, true);
        assert.equal(
            fs.existsSync(path.join(modRoot, "..", "T‘s NEW Webbing LV2", family.source)),
            true,
            `${family.source} must be present in the authoritative Lv2 source directory`,
        );
        assert.equal(fs.existsSync(path.join(modRoot, family.runtimeAsset)), true, `${family.runtimeAsset} must exist`);
        assert.ok(
            modJson.fileorder.indexOf(family.runtimeAsset) >= 0 &&
                modJson.fileorder.indexOf(family.runtimeAsset) < firstScript,
            `${family.runtimeAsset} must preload before scripts`,
        );

        assert.equal(runtime.context.Spiderlings.Webbing.equipForDebug(family.id).applied, true);
        const first = runtime.context.Spiderlings.Webbing.completeEffectiveEscape(family.id, "Struggle", {
            legal: true,
        });
        assert.equal(first.progressed, true);
        assert.equal(first.completed, false);
        const second = runtime.context.Spiderlings.Webbing.completeEffectiveEscape(family.id, "Remove", {
            legal: true,
        });
        assert.equal(second.completed, true);
    }
});

test("all eight Lv3 restraints equip independently with delivered models, complete translations, and two-action escape", () => {
    const runtime = loadWebbingRuntime();
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    const csv = translationFiles.map((file) => ({ file, values: parseTranslations(file) }));
    for (const family of lv3Families) {
        const id = `SpiderlingsWebbingLv3${family}`;
        const restraint = runtime.context.KinkyDungeonGetRestraintByName(id);
        const model = runtime.models.find((entry) => entry.Name === `${id}Model`);
        assert.ok(restraint, id);
        assert.ok(model, `${id}Model`);
        assert.equal(restraint.Model, model.Name);
        assert.equal(restraint.power, 3);
        assert.equal(restraint.weight, 0);
        assert.deepEqual(Object.keys(restraint.enemyTags), []);
        assert.equal(model.Folder, "SpiderlingsWebbingLv3");
        const layer = Object.values(model.Layers)[0];
        assert.equal(layer.Pri, 52);
        const asset = `Models/${model.Folder}/${layer.Sprite}.png`;
        assert.equal(fs.existsSync(path.join(modRoot, asset)), true, asset);
        assert.ok(
            manifest.fileorder.indexOf(asset) >= 0 &&
                manifest.fileorder.indexOf(asset) < manifest.fileorder.indexOf("SpiderlingsCore.js"),
        );
        for (const suffix of ["", "Desc", "Desc2"]) {
            const key = `Restraint${id}${suffix}`;
            assert.ok(runtime.texts[key], key);
            for (const translation of csv) assert.ok(translation.values.get(key), `${translation.file}: ${key}`);
        }
        assert.equal(runtime.context.Spiderlings.Webbing.equipForDebug(id).applied, true);
        for (const [index, method] of ["Cut", "Remove"].entries()) {
            const result = runtime.context.Spiderlings.Webbing.completeEffectiveEscape(id, method, { legal: true });
            assert.equal(result.requiredActions, 2);
            assert.equal(result.effectiveActions, index + 1);
            assert.equal(result.completed, index === 1);
        }
    }
    assert.equal(runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv3Hood").Group, "ItemHead");
    assert.equal(runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv3Blindfold").Group, "ItemHead");
    assert.equal(runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv3Gag").Group, "ItemMouth");
    for (const family of ["Stuffing", "Mittens", "MittenLeft", "MittenRight"]) {
        assert.equal(runtime.context.KinkyDungeonGetRestraintByName(`SpiderlingsWebbingLv3${family}`), undefined);
    }
});

test("native KD priority collection keeps the base chest visible whenever the full Lv3 Arm art is hidden", () => {
    const runtime = loadWebbingRuntime();
    const source = fs.readFileSync(path.join(referenceRoot, "Data", "Models.ts"), "utf8");
    const context = vm.createContext({ LayerGroups: { ChestBinding: { Chest: true } } });
    const signatures = {
        LayerLayer: "function LayerLayer(MC, l, m, Mods)",
        LayerPri: "function LayerPri(MC, l, m, Mods)",
        KDLayerPropName: "function KDLayerPropName(l, Poses, props)",
        LayerIsHidden: "function LayerIsHidden(MC, l, m, Mods)",
        ModelDrawLayer: "function ModelDrawLayer(MC, Model, Layer, Poses)",
    };
    for (const [name, signature] of Object.entries(signatures)) {
        const original = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
        assert.ok(original, `pinned native ${name}`);
        const executable = original
            .replace(new RegExp(`function ${name}[^]*?\\{\\r?\\n`), `${signature} {\n`)
            .replace(/let prop: LayerPropertiesType/g, "let prop")
            .replace(/let Properties: LayerPropertiesType/g, "let Properties")
            .replace(/let poses: Record<string, boolean>/g, "let poses");
        vm.runInContext(executable, context);
    }
    const start = source.indexOf("\tMC.HighestPriority = {};");
    const end = source.indexOf("\t// TODO hide, filtering based on pose", start);
    assert.ok(start >= 0 && end > start, "pinned native highest-priority prepass");
    const nativePrepass = source.slice(start, end).replace(/let prop: LayerPropertiesType/g, "let prop");
    vm.runInContext(
        `function nativePriority(MC, Models, StartMods = [], EndMods = []) {\n${nativePrepass}\n}`,
        context,
    );
    const model = runtime.models.find((entry) => entry.Name === "SpiderlingsWebbingLv3ArmModel");
    const wrap = Object.values(model.Layers)[0];
    const chest = { Name: "Chest", Layer: "Chest", Pri: 0, HideWhenOverridden: true };
    const body = { Name: "Body", Layers: { Chest: chest } };
    const scene = (poses) => {
        const Poses = Object.fromEntries(["Closed", ...poses, ...model.AddPose].map((pose) => [pose, true]));
        const MC = { Poses, TempPoses: {} };
        context.nativePriority(
            MC,
            new Map([
                [model.Name, model],
                [body.Name, body],
            ]),
        );
        return {
            chestPriority: MC.HighestPriority.Chest,
            chestVisible: context.ModelDrawLayer(MC, body, chest, Poses),
            wrapVisible: !context.LayerIsHidden(MC, wrap, model, []) && context.ModelDrawLayer(MC, model, wrap, Poses),
        };
    };
    for (const pose of ["Free", "Boxtie", "Yoked", "Front", "Up", "Crossed"]) {
        const state = scene([pose]);
        assert.ok(state.chestPriority <= 0, `${pose} must not let hidden wrap override Chest`);
        assert.equal(state.chestVisible, true, `${pose} retains base chest`);
        assert.equal(state.wrapVisible, false, `${pose} hides unsupported arm artwork`);
    }
    const cocoon = scene(["Wristtie", "SpiderlingsWebbingCocoonCover"]);
    assert.ok(cocoon.chestPriority <= 0);
    assert.equal(cocoon.chestVisible, true);
    assert.equal(cocoon.wrapVisible, false);
    const wristtie = scene(["Wristtie"]);
    assert.equal(wristtie.chestPriority, 52);
    assert.equal(wristtie.chestVisible, false);
    assert.equal(wristtie.wrapVisible, true);
});

test("native KD hiding covers animal ears with Hood and tails with Lv3 Legs or Cocoon, then restores them on removal", () => {
    const runtime = loadWebbingRuntime();
    const nativeModels = new Map();
    const context = vm.createContext({
        LayerGroups: {},
        LEGPOSES: ["Closed", "Spread", "Kneel", "KneelClosed", "Hogtie"],
        ToMap: (values) => Object.fromEntries(values.map((value) => [value, true])),
        ToMapSubtract: (values, excluded) =>
            Object.fromEntries(values.filter((value) => !excluded.includes(value)).map((value) => [value, true])),
        AddModel: (model) => nativeModels.set(model.Name, model),
        ToLayerMap: (layers) => Object.fromEntries(layers.map((layer) => [layer.Name, layer])),
    });
    vm.runInContext(fs.readFileSync(path.join(referenceRoot, "Data", "ModelList_Cosplay.ts"), "utf8"), context);
    const { stripTypeScriptTypes } = require("node:module");
    const source = fs.readFileSync(path.join(referenceRoot, "Data", "Models.ts"), "utf8");
    for (const name of ["LayerLayer", "KDLayerPropName", "LayerIsHidden"]) {
        const original = source.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
        assert.ok(original, `pinned native ${name}`);
        vm.runInContext(stripTypeScriptTypes(original), context);
    }
    const start = source.indexOf("\tMC.HiddenLayers = {};");
    const end = source.indexOf("\n\tfor (let m of Models.values()) {", start + "\tMC.HiddenLayers = {};".length);
    const secondLoop = source.indexOf("\n\tfor (let m of Models.values()) {", end + 1);
    assert.ok(start >= 0 && secondLoop > end, "native hidden-layer collection");
    vm.runInContext(`function collectHidden(MC, Models) {${source.slice(start, secondLoop)}}`, context);
    const byName = new Map(runtime.models.map((model) => [model.Name, model]));
    const hood = byName.get("SpiderlingsWebbingLv3HoodModel");
    const legs = byName.get("SpiderlingsWebbingLv3LegsModel");
    const cocoon = byName.get("SpiderlingsWebbingCocoonModel");
    const ears = ["FoxEars", "WolfEars", "BunnyEars", "MouseEars"].map((name) => nativeModels.get(name));
    const tails = ["FoxTail", "Fox7Tail", "WolfTail", "MouseTail"].map((name) => nativeModels.get(name));
    const accessories = [...ears, ...tails];
    const before = JSON.stringify(accessories);
    const mc = { Poses: { Closed: true }, TempPoses: {} };
    const assertScene = (covering, earsHidden, tailsHidden) => {
        context.collectHidden(mc, new Map([...accessories, ...covering].map((model) => [model.Name, model])));
        for (const [models, hidden] of [
            [ears, earsHidden],
            [tails, tailsHidden],
        ]) {
            for (const model of models)
                for (const layer of Object.values(model.Layers)) {
                    assert.equal(context.LayerIsHidden(mc, layer, model, []), hidden, `${model.Name}/${layer.Name}`);
                }
        }
    };
    assertScene([], false, false);
    assertScene([hood], true, false);
    assertScene([hood, legs], true, true);
    assertScene([hood, legs, cocoon], true, true);
    assertScene([legs, cocoon], false, true);
    assertScene([cocoon], false, true);
    assertScene([], false, false);
    assert.equal(JSON.stringify(accessories), before, "accessory models remain equipped and unmodified");
});

test("all standing skirt layers sit above Lv1 Legs/Ankles and below their Lv2/Lv3 layers", () => {
    const runtime = loadWebbingRuntime();
    const defs = fs.readFileSync(path.join(referenceRoot, "Data/Defs.ts"), "utf8");
    const names = [...defs.match(/let LAYERS_BASE = \[([^]*?)\];/)[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    const increment = Number(defs.match(/let LAYER_INCREMENT = (\d+)/)[1]);
    const z = (layer) => -names.indexOf(layer.Layer) * increment + layer.Pri;
    const skirts = ["OverSkirtDeco", "OverSkirt", "SkirtOverDeco", "SkirtOver", "SkirtDeco", "Skirt"];
    for (const family of ["Legs", "Ankles"])
        for (const stage of [1, 2, 3]) {
            const layer = runtime.models.find((m) => m.Name === `SpiderlingsWebbingLv${stage}${family}Model`).Layers[
                family
            ];
            assert.ok(names.includes(layer.Layer));
            for (const skirt of skirts) {
                // Standalone decoration slots use Pri 0; native main skirts include
                // BlouseSkirt at 100, so checking only the webbing's local Pri is wrong.
                const priority = skirt.endsWith("Deco") ? 0 : 100;
                assert.equal(
                    z(layer) > z({ Layer: skirt, Pri: priority }),
                    stage > 1,
                    `${family} Lv${stage} vs ${skirt}`,
                );
            }
            if (stage > 1) assert.equal(layer.NoOverride, true, "drawing over skirts must not suppress their layers");
        }
});

test("Lv2 stays above every visible Lv1 pair while Lv1 Legs/Ankles remain behind skirts", () => {
    const runtime = loadWebbingRuntime();
    const models = new Map(runtime.models.map((entry) => [entry.Name, entry]));
    for (const family of lv2Families) {
        const lv1Layer = Object.values(models.get(`SpiderlingsWebbingLv1${family.family}Model`).Layers)[0];
        const lv2Layer = Object.values(models.get(family.model).Layers)[0];
        const innerLayer = { Legs: "WrappingLegsOver", Ankles: "WrappingAnklesOver" }[family.family];
        assert.equal(lv1Layer.Layer, innerLayer || lv2Layer.Layer);
        if (innerLayer) assert.equal(lv2Layer.Layer, "OverSkirtDeco");
        assert.equal(lv1Layer.Pri, 50);
        assert.equal(lv2Layer.Pri, 51);
        assert.equal(lv2Layer.NoOverride, true, `${family.family} Lv2 must not hide its Lv1 layer`);
        const highestPriority = { [lv1Layer.Layer]: lv1Layer.Pri };
        assert.equal(kd55DrawsLayer(lv1Layer, { Closed: true, Wristtie: true }, highestPriority), true);
        assert.equal(kd55DrawsLayer(lv2Layer, { Closed: true, Wristtie: true }, highestPriority), true);
    }
});

test("the real Lv2 inventory event makes the first native action spend-and-fail and the second succeed", () => {
    const runtime = loadWebbingRuntime();
    const id = "SpiderlingsWebbingLv2Arm";
    assert.equal(runtime.context.Spiderlings.Webbing.equipForDebug(id).applied, true);
    const item = runtime.equipped.get("ItemArms");
    const eventType = runtime.context.Spiderlings.Webbing.LV2_ESCAPE_EVENT;
    const before = runtime.context.KDEventMapInventory.beforeStruggleCalc[eventType];
    const after = runtime.context.KDEventMapInventory.struggle[eventType];
    const rejectedCut = {
        restraint: item,
        query: false,
        struggleType: "Cut",
        struggleGroup: "ItemArms",
        canCut: false,
        cost: -0.2,
        escapeSpeed: 1,
        minSpeed: 0.4,
        escapeChance: 100,
        escapePenalty: 0,
        limitChance: 0,
    };
    before({}, item, rejectedCut);
    after({}, item, { restraint: item, struggleType: "Cut", result: "Fail" });
    assert.equal(
        item.data.SpiderlingsEscapeActions,
        undefined,
        "an unarmed Cut must not be counted when KD later reports Fail",
    );

    const blockedRuntime = loadWebbingRuntime({ KDGroupBlocked: () => true });
    assert.equal(blockedRuntime.context.Spiderlings.Webbing.equipForDebug(id).applied, true);
    const blockedItem = blockedRuntime.equipped.get("ItemArms");
    const blockedBefore = blockedRuntime.context.KDEventMapInventory.beforeStruggleCalc[eventType];
    const blockedAfter = blockedRuntime.context.KDEventMapInventory.struggle[eventType];
    const blockedAttempt = {
        restraint: blockedItem,
        query: false,
        struggleType: "Struggle",
        struggleGroup: "ItemArms",
        cost: -3,
        escapeSpeed: 1,
        minSpeed: 0.4,
        escapeChance: 100,
        escapePenalty: 0,
        limitChance: 0,
    };
    blockedBefore({}, blockedItem, blockedAttempt);
    blockedAfter({}, blockedItem, { restraint: blockedItem, struggleType: "Struggle", result: "Fail" });
    assert.equal(
        blockedItem.data.SpiderlingsEscapeActions,
        undefined,
        "a group-blocked attempt must not be counted when KD later reports Fail",
    );

    const first = {
        restraint: item,
        query: false,
        struggleType: "Struggle",
        struggleGroup: "ItemArms",
        cost: -3,
        escapeSpeed: 1,
        minSpeed: 0.4,
        escapeChance: 100,
        escapePenalty: 0,
        limitChance: 0,
    };
    before({}, item, first);
    assert.equal(first.escapeSpeed, 0);
    assert.ok(first.minSpeed > 0);
    assert.equal(item.data.SpiderlingsEscapeActions, undefined);
    after({}, item, { restraint: item, struggleType: "Struggle", result: "Fail" });
    assert.equal(item.data.SpiderlingsEscapeActions, 1);

    const second = { ...first, escapeSpeed: 1, escapeChance: 100, escapePenalty: 0 };
    before({}, item, second);
    assert.equal(item.cutProgress, 1);
    assert.equal(second.escapeChance, 1);
    assert.ok(second.escapePenalty < 0);
});

test("the model runtime caches all atlas frames under their direct model aliases before preload", async () => {
    const atlasData = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
    const fetches = [];
    const kdTextures = [];
    const assetLoads = [];
    const textureCache = new Map();
    const addedAliases = [];
    let spritesheetInput;
    const runtime = loadWebbingRuntime({
        KDModFiles: {
            [webbingAtlas]: "blob:spiderlings-webbing-atlas-json",
            [webbingAtlasImage]: "blob:spiderlings-webbing-atlas-png",
            [armAsset]: "blob:arm-fallback",
        },
        kdpixitex: textureCache,
        KDTex(texturePath) {
            kdTextures.push(texturePath);
            return { texturePath };
        },
        PIXI: {
            settings: {
                ADAPTER: {
                    async fetch(url) {
                        fetches.push(url);
                        return {
                            ok: true,
                            async json() {
                                return atlasData;
                            },
                        };
                    },
                },
            },
            Assets: {
                load(asset) {
                    const texturePath = typeof asset === "string" ? asset : asset.src;
                    assetLoads.push(texturePath);
                    return Promise.resolve({ baseTexture: { texturePath } });
                },
            },
            SCALE_MODES: { LINEAR: "linear" },
            Spritesheet: class {
                constructor(baseTexture, data, resolutionFilename) {
                    spritesheetInput = { baseTexture, data, resolutionFilename };
                    this.textures = Object.fromEntries(
                        Object.keys(data.frames).map((key) => [key, { atlasFrame: key, baseTexture }]),
                    );
                }
                async parse() {}
            },
            Texture: {
                addToCache(texture, alias) {
                    addedAliases.push([texture, alias]);
                },
            },
            utils: { TextureCache: {} },
        },
    });

    assert.deepEqual(Array.from(runtime.context.Spiderlings.ModelRuntime.TEXTURE_ATLASES), [webbingAtlas, pinkAtlas]);
    assert.deepEqual(Array.from(runtime.context.Spiderlings.ModelRuntime.DISPLACEMENT_ASSETS), [...displacementAssets]);
    assert.equal(typeof runtime.context.Spiderlings.preloadSpiderlingsTextures, "function");
    assert.equal(typeof runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels, "function");
    await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
    await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, false);
    assert.deepEqual(fetches, ["blob:spiderlings-webbing-atlas-json"]);
    assert.deepEqual(assetLoads, [...displacementAssets, webbingAtlasImage]);
    assert.equal(spritesheetInput.resolutionFilename, webbingAtlas);
    assert.equal(spritesheetInput.baseTexture.texturePath, webbingAtlasImage);
    assert.deepEqual(kdTextures, displacementAssets);
    assert.deepEqual([...textureCache.keys()], [...displacementAssets, ...Object.keys(atlasData.frames)]);
    assert.equal(
        addedAliases.some(([, alias]) => alias === armAsset),
        true,
    );
});

test("pink settings switch all native layer paths and saved model copies without changing restraints or rendering metadata", async () => {
    const player = { Appearance: [] };
    const container = { Models: new Map() };
    const refreshes = [];
    const runtime = loadWebbingRuntime({
        KinkyDungeonPlayer: player,
        KDCurrentModels: new Map([[player, container]]),
        ForceRefreshModels: (character) => refreshes.push(character),
    });
    const { context, models } = runtime;
    const original = JSON.parse(JSON.stringify(models));
    const restraints = JSON.stringify(context.KinkyDungeonRestraints);
    const config = context.KDModConfigs.Spiderlings.find((entry) => entry.refvar === "spiderlingsPinkWebbing");
    assert.equal(config.type, "boolean");
    assert.equal(config.default, false);
    assert.equal(context.KDModSettings.Spiderlings.spiderlingsPinkWebbing, false);
    player.Appearance = original.map((model) => ({ Model: JSON.parse(JSON.stringify(model)) }));
    container.Models = new Map(original.map((model) => [model.Name, JSON.parse(JSON.stringify(model))]));
    const unrelated = { Name: "OtherMod", Folder: "OtherMod", Categories: ["Restraints"], Layers: {} };
    player.Appearance.push({ Model: unrelated });
    const { stripTypeScriptTypes } = require("node:module");
    const native = fs.readFileSync(path.join(referenceRoot, "Data/Models.ts"), "utf8");
    for (const name of ["ModelLayerString", "LayerSprite", "LayerSpriteCustom"]) {
        const source = native.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))?.[0];
        assert.ok(source, name);
        vm.runInContext(stripTypeScriptTypes(source), context);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    for (const pink of [true, false, true]) {
        context.KDModSettings = { Spiderlings: { spiderlingsPinkWebbing: pink } };
        context.KDEventMapGeneric[pink ? "afterModSettingsLoad" : "afterModConfig"].Spiderlings();
        await context.Spiderlings.applyWebbingColor(true);
        for (const group of [
            models,
            player.Appearance.slice(0, models.length).map((item) => item.Model),
            [...container.Models.values()],
        ]) {
            for (let i = 0; i < group.length; i++) {
                const model = group[i];
                assert.equal(model.Folder, original[i].Folder + (pink ? "Pink" : ""));
                assert.deepEqual(JSON.parse(JSON.stringify({ ...model, Folder: original[i].Folder })), original[i]);
                for (const layer of Object.values(model.Layers)) {
                    const texturePath = context.ModelLayerString(model, layer, { Closed: true, Wristtie: true });
                    assert.equal(manifest.fileorder.includes(texturePath), true, texturePath);
                    assert.equal(fs.existsSync(path.join(modRoot, texturePath)), true, texturePath);
                }
            }
        }
        assert.equal(JSON.stringify(context.KinkyDungeonRestraints), restraints);
        assert.equal(unrelated.Folder, "OtherMod");
    }
    assert.ok(refreshes.length > 0);
    // Saved appearance/container copies may retain the old color after redress.
    player.Appearance[0].Model.Folder = original[0].Folder;
    container.Models.get(original[0].Name).Folder = original[0].Folder;
    context.KDEventMapInventory.afterDress.SpiderlingsRefreshModels({ trigger: "afterDress" });
    assert.equal(player.Appearance[0].Model.Folder, original[0].Folder + "Pink");
    assert.equal(container.Models.get(original[0].Name).Folder, original[0].Folder + "Pink");
    const stableRefreshes = refreshes.length;
    for (let i = 0; i < 24; i++)
        context.KDEventMapInventory.afterDress.SpiderlingsRefreshModels({ trigger: "afterDress" });
    assert.equal(
        refreshes.length,
        stableRefreshes,
        "unchanged owned colors must retain the native model cache after dressing",
    );
    const restored = loadWebbingRuntime({ KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: true } } });
    assert.equal(
        restored.models.every((model) => model.Folder.endsWith("Pink")),
        true,
    );
});

test("delivered bullet colors follow settings without changing spell identities or draw geometry", () => {
    const calls = [];
    const receiver = {};
    const result = {};
    const { context } = loadWebbingRuntime({
        KinkyDungeonRootDirectory: "Game/",
        KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: true } },
        KDDraw(...args) {
            calls.push({ receiver: this, args });
            return result;
        },
    });
    const spells = JSON.stringify(context.KinkyDungeonSpellListEnemies);
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    for (const pink of [true, false, true]) {
        context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        context.KDEventMapGeneric.afterModConfig.Spiderlings();
        for (const name of ["SpiderWeb", "SpiderWebHit", "WebSpray", "WebSprayTrail", "Fireball"]) {
            const args = [
                {},
                new Map(),
                "existing-bullet",
                `Game/Bullets/${name}.png`,
                10,
                20,
                72,
                72,
                0.5,
                { alpha: 0.8 },
                true,
            ];
            const expected = name !== "Fireball" && pink ? `Game/Bullets/${name}Pink.png` : args[3];
            assert.equal(context.KDDraw.apply(receiver, args), result);
            assert.equal(calls.at(-1).receiver, receiver);
            assert.deepEqual(
                calls.at(-1).args,
                args.map((arg, i) => (i === 3 ? expected : arg)),
            );
            if (name !== "Fireball") assert.ok(manifest.fileorder.includes(expected.slice(5)), expected);
        }
        const unrelated = [{}, new Map(), "other", "Models/Other/WebSpray.png"];
        context.KDDraw(...unrelated);
        assert.deepEqual(calls.at(-1).args, unrelated);
        assert.equal(JSON.stringify(context.KinkyDungeonSpellListEnemies), spells);
    }
});

test("enemy artwork follows restored settings and repeated toggles without changing enemy identities", () => {
    const calls = [];
    const receiver = {};
    const result = {};
    for (const savedPink of [false, true]) {
        const { context } = loadWebbingRuntime({
            KinkyDungeonRootDirectory: "Game/",
            KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: savedPink } },
            KDDraw(...args) {
                calls.push({ receiver: this, args });
                return result;
            },
        });
        const enemies = JSON.stringify(context.KinkyDungeonEnemies);
        const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
        for (const pink of [savedPink, !savedPink, savedPink]) {
            context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            context.KDEventMapGeneric.afterModConfig.Spiderlings();
            for (const name of ["Spinner", "Tunneler", "WebCaster", "NestEntrance", "Jumper", "Maidforce"]) {
                const args = [
                    {},
                    new Map(),
                    `existing-${name}`,
                    `Game/Enemies/${name}.png`,
                    10,
                    20,
                    72,
                    72,
                    0.5,
                    { alpha: 0.8 },
                    true,
                ];
                const colored = !["Jumper", "Maidforce"].includes(name);
                const expected = colored && pink ? `Game/Enemies/${name}Pink.png` : args[3];
                assert.equal(context.KDDraw.apply(receiver, args), result);
                assert.equal(calls.at(-1).receiver, receiver);
                assert.deepEqual(
                    calls.at(-1).args,
                    args.map((arg, i) => (i === 3 ? expected : arg)),
                );
                if (name !== "Maidforce") {
                    const index = manifest.fileorder.indexOf(expected.slice(5));
                    assert.ok(index >= 0 && index < manifest.fileorder.indexOf("SpiderlingsModelRuntime.js"), expected);
                }
            }
            for (const path of [
                "Game/EnemiesBound/Spinner.png",
                "Game/Enemies/Other/Spinner.png",
                "Models/Other/Spinner.png",
            ]) {
                const args = [{}, new Map(), "unrelated", path];
                context.KDDraw(...args);
                assert.deepEqual(calls.at(-1).args, args);
            }
            assert.equal(JSON.stringify(context.KinkyDungeonEnemies), enemies);
        }
    }
});

test("both color atlases preload before equipment, reuse textures on switching, and fail independently", async () => {
    const original = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
    const pink = JSON.parse(fs.readFileSync(path.join(modRoot, pinkAtlas), "utf8"));
    for (const broken of [null, webbingAtlas, pinkAtlas]) {
        const loads = [];
        const fetches = [];
        const destroyed = [];
        const cache = new Map();
        const runtime = loadWebbingRuntime({
            console: { ...console, warn() {} },
            KDModFiles: Object.fromEntries(
                [webbingAtlas, webbingAtlasImage, pinkAtlas, pinkAtlasImage].map((path) => [path, `blob:${path}`]),
            ),
            kdpixitex: cache,
            PIXI: {
                settings: {
                    ADAPTER: {
                        async fetch(url) {
                            fetches.push(url);
                            return {
                                async json() {
                                    return url === `blob:${pinkAtlas}` ? pink : original;
                                },
                            };
                        },
                    },
                },
                Assets: {
                    async load(asset) {
                        const path = typeof asset === "string" ? asset : asset.src;
                        loads.push(path);
                        return { valid: true, baseTexture: { valid: true, path } };
                    },
                },
                Spritesheet: class {
                    constructor(baseTexture, data, path) {
                        this.path = path;
                        this.textures = Object.fromEntries(
                            Object.keys(data.frames)
                                .filter((_, index) => path !== broken || index !== 24)
                                .map((name) => [name, { valid: true, baseTexture }]),
                        );
                    }
                    async parse() {}
                    destroy() {
                        destroyed.push(this.path);
                    }
                },
            },
        });
        // Eager loading is independent of the current color and worn items.
        await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
        assert.deepEqual(fetches, [`blob:${webbingAtlas}`, `blob:${pinkAtlas}`]);
        for (const [atlasPath, data] of [
            [webbingAtlas, original],
            [pinkAtlas, pink],
        ]) {
            assert.equal(
                Object.keys(data.frames).filter((name) => cache.has(name)).length,
                atlasPath === broken ? 0 : 25,
                "an incomplete sheet must publish no partial aliases",
            );
        }
        assert.deepEqual(destroyed, broken ? [broken] : []);
        const atlasTextures = new Map(cache);
        for (const isPink of [true, false, true]) {
            runtime.context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = isPink;
            await runtime.context.Spiderlings.applyWebbingColor();
            await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, true);
            const path = isPink ? "Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png" : armAsset;
            if (broken !== (isPink ? pinkAtlas : webbingAtlas)) {
                assert.equal(cache.get(path), atlasTextures.get(path), "color switching reuses its atlas frame");
            }
        }
        assert.deepEqual(
            loads.filter((path) => path.startsWith("Models/")),
            broken === pinkAtlas
                ? ["Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png"]
                : broken === webbingAtlas
                  ? [armAsset]
                  : [],
            "healthy atlases avoid all first-hit and color-switch direct PNG requests",
        );
    }
});

test("pink fallback preloads are independent of original texture caches and a late atlas completion", async () => {
    const atlasData = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
    const cache = new Map();
    const loads = [];
    let finishAtlas;
    const gate = new Promise((resolve) => {
        finishAtlas = resolve;
    });
    const runtime = loadWebbingRuntime({
        KDModFiles: { [webbingAtlas]: "blob:atlas-json", [webbingAtlasImage]: "blob:atlas-png" },
        kdpixitex: cache,
        PIXI: {
            settings: {
                ADAPTER: {
                    async fetch() {
                        await gate;
                        return {
                            async json() {
                                return atlasData;
                            },
                        };
                    },
                },
            },
            Assets: {
                async load(asset) {
                    const key = typeof asset === "string" ? asset : asset.src;
                    loads.push(key);
                    return { baseTexture: { key } };
                },
            },
            Spritesheet: class {
                constructor(baseTexture, data) {
                    this.textures = Object.fromEntries(Object.keys(data.frames).map((key) => [key, { baseTexture }]));
                }
                async parse() {}
            },
        },
    });
    runtime.context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = true;
    await runtime.context.Spiderlings.applyWebbingColor();
    const preload = runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, true);
    finishAtlas();
    await preload;
    assert.equal(loads.includes("Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png"), true);
    assert.equal(runtime.models[0].Folder, "SpiderlingsWebbingLv1Pink");
    assert.equal(cache.has(armAsset), true, "original atlas aliases remain original");
    runtime.context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    await runtime.context.Spiderlings.applyWebbingColor();
    await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, true);
    assert.equal(loads.includes(armAsset), false, "switching back reuses the original atlas");
});

test("the model runtime falls back to the unchanged direct PNG when atlas loading fails", async () => {
    const kdTextures = [];
    const assetLoads = [];
    const runtime = loadWebbingRuntime({
        console: { ...console, warn() {} },
        KDModFiles: { [webbingAtlas]: "blob:broken-atlas-json" },
        kdpixitex: new Map(),
        KDTex(texturePath) {
            kdTextures.push(texturePath);
        },
        PIXI: {
            settings: {
                ADAPTER: {
                    async fetch() {
                        throw new Error("atlas unavailable");
                    },
                },
            },
            Assets: {
                load(texturePath) {
                    assetLoads.push(texturePath);
                    return Promise.resolve({ texturePath });
                },
            },
            Texture: { addToCache() {} },
            utils: { TextureCache: {} },
        },
    });

    await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
    await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, false);
    assert.deepEqual(kdTextures, [...displacementAssets, armAsset]);
    assert.deepEqual(assetLoads, [...displacementAssets, armAsset]);
});

test("an incomplete parsed atlas is discarded atomically before direct fallback", async () => {
    const atlasData = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
    const directLoads = [];
    const textureCache = new Map();
    let destroyed = false;
    const runtime = loadWebbingRuntime({
        console: { ...console, warn() {} },
        KDModFiles: {
            [webbingAtlas]: "blob:atlas-json",
            [webbingAtlasImage]: "blob:atlas-png",
        },
        kdpixitex: textureCache,
        KDTex() {},
        PIXI: {
            settings: {
                ADAPTER: {
                    async fetch() {
                        return {
                            ok: true,
                            async json() {
                                return atlasData;
                            },
                        };
                    },
                },
            },
            Assets: {
                async load(texturePath) {
                    if (typeof texturePath !== "string") return { baseTexture: { atlas: true } };
                    directLoads.push(texturePath);
                    return { texturePath };
                },
            },
            SCALE_MODES: { LINEAR: "linear" },
            Spritesheet: class {
                constructor() {
                    this.textures = Object.fromEntries(
                        Object.keys(atlasData.frames)
                            .filter((key) => key !== armAsset)
                            .map((key) => [key, { baseTexture: { atlas: true } }]),
                    );
                }
                async parse() {}
                destroy() {
                    destroyed = true;
                }
            },
            Texture: { addToCache() {} },
            utils: { TextureCache: {} },
        },
    });

    await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
    await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, false);
    assert.equal(destroyed, true);
    assert.deepEqual([...textureCache.keys()], []);
    assert.deepEqual(directLoads, [...displacementAssets, armAsset]);
});

test("first pink enemy application waits for decoding and replaces KD's pending texture before redress", async () => {
    for (const alreadyCached of [false, true]) {
        const pinkPath = "Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png";
        const pending = { valid: false, baseTexture: { valid: false } };
        const decoded = { valid: true, baseTexture: { valid: true } };
        const cache = new Map(alreadyCached ? [[pinkPath, pending]] : []);
        const pixiCache = alreadyCached ? { [pinkPath]: pending } : {};
        const redresses = [];
        let finish;
        const loading = new Promise((resolve) => {
            finish = resolve;
        });
        let directRequests = 0;
        const runtime = loadWebbingRuntime({
            KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: true } },
            KDModFiles: { [pinkPath]: "blob:pink-without-extension" },
            KinkyDungeonPlayer: {},
            kdpixitex: cache,
            KDTex(texturePath) {
                if (texturePath === pinkPath) cache.set(texturePath, pending);
            },
            KinkyDungeonDressPlayer() {
                redresses.push(cache.get(pinkPath));
            },
            PIXI: {
                Assets: {
                    // Pixi's background promise acknowledges scheduling, not decoding.
                    async backgroundLoad() {},
                    load(asset) {
                        const texturePath = typeof asset === "string" ? asset : asset.src;
                        if (texturePath !== pinkPath) return Promise.resolve(decoded);
                        assert.equal(asset.format, "png");
                        assert.equal(
                            asset.loadParser,
                            "modTextureLoader",
                            "KD 5.4 blob URLs need explicit PNG parsing",
                        );
                        directRequests += 1;
                        return loading;
                    },
                },
                utils: { TextureCache: pixiCache },
                Texture: {
                    addToCache(texture, key) {
                        pixiCache[key] = texture;
                    },
                },
            },
        });
        runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels(
            { trigger: "postApply" },
            { name: armId },
        );
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(redresses.length, 0, "do not bake an unready texture into the character");
        assert.equal(directRequests, 1, "cached pending textures still need an awaited load");
        finish(decoded);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(redresses, [decoded], "redress without another player action, using the decoded texture");
        assert.equal(pixiCache[pinkPath], decoded);
    }
});

test("concurrent distinct model preloads redress after every pending texture has settled", async () => {
    const resolvers = new Map();
    let redresses = 0;
    const runtime = loadWebbingRuntime({
        KinkyDungeonPlayer: {},
        ForceRefreshModels() {},
        KinkyDungeonDressPlayer() {
            redresses += 1;
        },
        setTimeout() {},
        KDTex() {},
        PIXI: {
            Assets: {
                load(texturePath) {
                    return new Promise((resolve) => resolvers.set(texturePath, resolve));
                },
            },
        },
    });
    const refresh = runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels;
    refresh({ trigger: "postApply" }, { name: "SpiderlingsWebbingLv2Arm" });
    refresh({ trigger: "postApply" }, { name: families[1].id });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();

    assert.deepEqual(
        [...resolvers.keys()].sort(),
        ["Models/SpiderlingsWebbingLv2/ArmWebbing.png", ...displacementAssets, families[1].runtimeAsset].sort(),
    );
    resolvers.get("Models/SpiderlingsWebbingLv2/ArmWebbing.png")({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 0);
    resolvers.get(families[1].runtimeAsset)({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 0);
    resolvers.get(lv2ArmDisplacement)({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 1);
});

test("a displacement texture finishes decoding before the post-apply redress", async () => {
    const resolvers = new Map();
    const timers = [];
    let redresses = 0;
    const runtime = loadWebbingRuntime({
        KinkyDungeonPlayer: {},
        ForceRefreshModels() {},
        KinkyDungeonDressPlayer() {
            redresses += 1;
        },
        setTimeout(callback) {
            timers.push(callback);
        },
        kdpixitex: new Map(),
        KDTex() {},
        PIXI: {
            Assets: {
                load(texturePath) {
                    return new Promise((resolve) => resolvers.set(texturePath, resolve));
                },
            },
        },
    });
    const refresh = runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels;
    refresh({ trigger: "postApply" }, { name: "SpiderlingsWebbingLv2Arm" });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();

    assert.deepEqual(
        [...resolvers.keys()].sort(),
        ["Models/SpiderlingsWebbingLv2/ArmWebbing.png", ...displacementAssets].sort(),
    );
    assert.equal(timers.length, 0, "a mapped item must not schedule a redress ahead of texture decoding");
    resolvers.get("Models/SpiderlingsWebbingLv2/ArmWebbing.png")({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 0);
    resolvers.get(lv2ArmDisplacement)({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 1);
});

test("an equipped save waits for eager displacement decoding before its one corrective redress", async () => {
    const resolvers = new Map();
    let redresses = 0;
    const runtime = loadWebbingRuntime({
        KinkyDungeonPlayer: {},
        ForceRefreshModels() {},
        KinkyDungeonDressPlayer() {
            redresses += 1;
        },
        setTimeout() {},
        kdpixitex: new Map(),
        KDTex() {},
        PIXI: {
            Assets: {
                load(texturePath) {
                    return new Promise((resolve) => resolvers.set(texturePath, resolve));
                },
            },
        },
    });
    const afterDress = runtime.context.KDEventMapInventory.afterDress.SpiderlingsRefreshModels;
    afterDress({ trigger: "afterDress" }, { name: "SpiderlingsWebbingLv2Arm" });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    assert.equal(redresses, 0);

    for (const texturePath of displacementAssets) {
        resolvers.get(texturePath)({});
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 1);
});

test("debug equipment uses zero tightness and no lock, then one legal Lv1 action removes Arm Webbing", () => {
    for (const method of ["Cut", "Struggle", "Remove"]) {
        const runtime = loadWebbingRuntime();
        const equipped = runtime.context.Spiderlings.Webbing.equipForDebug(armId);

        assert.equal(equipped.applied, true);
        assert.equal(runtime.addCalls.length, 1);
        assert.equal(runtime.addCalls[0].tightness, 0);
        assert.equal(runtime.addCalls[0].lock, "");
        assert.equal(runtime.equipped.get("ItemArms").name, armId);

        const escaped = runtime.context.Spiderlings.Webbing.completeEffectiveEscape(armId, method, { legal: true });
        assert.equal(escaped.completed, true);
        assert.equal(escaped.method, method);
        assert.equal(runtime.removeCalls.length, 1);
        assert.equal(runtime.equipped.has("ItemArms"), false);
    }
});

test("blocked escape attempts do not remove Arm Webbing", () => {
    const runtime = loadWebbingRuntime();
    runtime.context.Spiderlings.Webbing.equipForDebug(armId);

    const result = runtime.context.Spiderlings.Webbing.completeEffectiveEscape(armId, "Cut", { legal: false });

    assert.equal(result.completed, false);
    assert.equal(runtime.removeCalls.length, 0);
    assert.equal(runtime.equipped.get("ItemArms").name, armId);
});

test("the canonical ten-family Lv1 catalogue resolves ten direct runtime assets and localized text", () => {
    const runtime = loadWebbingRuntime();
    const registered = runtime.context.Spiderlings.Webbing.FAMILIES;
    const catalog = runtime.context.Spiderlings.restraintCatalog.list();
    const lv1Restraints = runtime.context.KinkyDungeonRestraints.filter((entry) =>
        /^SpiderlingsWebbingLv1/.test(entry.name),
    );
    const lv1Models = runtime.models.filter((entry) => /^SpiderlingsWebbingLv1/.test(entry.Name));
    const lv1Catalog = catalog.filter((entry) => /^SpiderlingsWebbingLv1/.test(entry.id));
    const modJson = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    const firstScript = modJson.fileorder.findIndex((file) => file.endsWith(".js"));

    assert.deepEqual(
        Array.from(registered),
        families.map((entry) => entry.family),
    );
    assert.equal(lv1Restraints.length, 10);
    assert.equal(lv1Models.length, 10);
    assert.equal(lv1Catalog.length, 10);
    assert.deepEqual(
        Array.from(lv1Catalog, (entry) => entry.id),
        families.map((entry) => entry.id),
    );

    for (const family of families) {
        assert.equal(
            fs.existsSync(path.join(modRoot, "..", "T‘s NEW Webbing LV1", family.source)),
            true,
            `${family.source} must be present in the authoritative source directory`,
        );
        assert.equal(fs.existsSync(path.join(modRoot, family.runtimeAsset)), true, `${family.runtimeAsset} must exist`);
        const assetIndex = modJson.fileorder.indexOf(family.runtimeAsset);
        assert.ok(assetIndex >= 0 && assetIndex < firstScript, `${family.runtimeAsset} must preload before scripts`);
        assert.ok(
            runtime.context.KinkyDungeonRestraints.some((entry) => entry.name === family.id),
            `${family.id} must register`,
        );
        assert.ok(
            runtime.models.some((entry) => entry.Name === family.model),
            `${family.model} must register`,
        );
        for (const suffix of ["", "Desc", "Desc2"]) {
            assert.ok(
                String(runtime.texts[`Restraint${family.id}${suffix}`] || "").trim(),
                `${family.id}${suffix} needs English fallback text`,
            );
        }
    }

    for (const file of translationFiles) {
        const translations = parseTranslations(file);
        for (const family of families) {
            for (const suffix of ["", "Desc", "Desc2"]) {
                assert.ok(
                    String(translations.get(`Restraint${family.id}${suffix}`) || "").trim(),
                    `${file} needs ${family.id}${suffix}`,
                );
            }
        }
    }
});

test("all ten Lv1 items stay out of random pools and expose only their delivered mechanics", () => {
    const runtime = loadWebbingRuntime();
    const byId = new Map(runtime.context.KinkyDungeonRestraints.map((entry) => [entry.name, entry]));

    for (const family of families) {
        const restraint = byId.get(family.id);
        assert.equal(restraint.Group, family.group);
        assert.equal(restraint.weight, 0);
        assert.deepEqual(Object.keys(restraint.enemyTags), []);
        assert.equal("DefaultLock" in restraint, false);
        assert.equal("removePrison" in restraint, false);
        assert.deepEqual(
            {
                Cut: restraint.escapeChance.Cut,
                Remove: restraint.escapeChance.Remove,
                Struggle: restraint.escapeChance.Struggle,
            },
            { Cut: 100, Remove: 100, Struggle: 100 },
        );
    }

    const arm = byId.get("SpiderlingsWebbingLv1Arm");
    const mittenLeft = byId.get("SpiderlingsWebbingLv1MittenLeft");
    const mittenRight = byId.get("SpiderlingsWebbingLv1MittenRight");
    const belly = byId.get("SpiderlingsWebbingLv1Belly");
    const legs = byId.get("SpiderlingsWebbingLv1Legs");
    const ankles = byId.get("SpiderlingsWebbingLv1Ankles");
    const foot = byId.get("SpiderlingsWebbingLv1Foot");
    const blindfold = byId.get("SpiderlingsWebbingLv1Blindfold");
    assert.equal(arm.bindarms, true);
    assert.equal("bindhands" in arm, false);
    assert.equal(mittenLeft.bindhands, 0.5);
    assert.equal(mittenRight.bindhands, 0.5);
    assert.equal("bindarms" in mittenLeft, false);
    assert.equal("bindarms" in mittenRight, false);
    for (const field of [
        "harness",
        "strictness",
        "strictnessZones",
        "restriction",
        "hobble",
        "blockfeet",
        "bindarms",
        "bindhands",
        "restricthands",
        "remove",
    ]) {
        assert.equal(field in belly, false, `Belly must not declare ${field}`);
    }
    assert.deepEqual(Array.from(belly.addTag), []);
    for (const restraint of [legs, ankles, foot]) {
        assert.equal("hobble" in restraint, false, `${restraint.name} must not add a movement slowdown`);
        assert.equal("blockfeet" in restraint, false, `${restraint.name} must not add KD's blockfeet slowdown`);
        for (const tag of ["FeetLinked", "BlockKneel", "BlockHogtie"]) {
            assert.ok(restraint.addTag.includes(tag), `${restraint.name} must add ${tag}`);
        }
    }
    assert.equal(blindfold.Group, "ItemHead");
    assert.equal(blindfold.blindfold, 1);
});

test("the ten Lv1 models use delivered pose coverage without hiding existing clothing", () => {
    const runtime = loadWebbingRuntime();
    const models = new Map(runtime.models.map((entry) => [entry.Name, entry]));
    for (const family of families) {
        const model = models.get(family.model);
        const layers = Object.values(model.Layers);
        assert.equal(layers.length, 1);
        for (const layer of layers) {
            assert.equal(layer.Invariant, true);
            assert.equal(layer.NoColorize, true);
        }
        assert.equal(
            model.AddPose.some((pose) => /^Encase/.test(pose) || pose === "FlattenedUnderbust" || pose === "WrapArms"),
            false,
        );
        assert.equal(
            layers.some((layer) => "EraseSprite" in layer || "EraseLayers" in layer || "EraseMorph" in layer),
            false,
        );
        const serialized = JSON.stringify(model);
        const forbiddenAdaptation = ["MittenLeft", "MittenRight"].includes(family.family)
            ? /Displace|Displacement|MorphPoses/
            : /Displace|Displacement|Erase|MorphPoses/;
        assert.doesNotMatch(serialized, forbiddenAdaptation);
    }

    const displacementAsset = "DisplacementMaps/SpiderlingsWebbingLv1BellySquish.png";
    assert.equal(fs.existsSync(path.join(modRoot, displacementAsset)), false);

    const displacementContracts = [
        ["SpiderlingsWebbingLv2ArmModel", "SpiderlingsWebbingLv2ArmSquish", "Rope1", 1200, 650, 749],
        ["SpiderlingsWebbingLv2BellyModel", "SpiderlingsWebbingLv2BellySquish", "CorsetTorso", 1200, 459, 1280],
        ["SpiderlingsWebbingLv2LegsModel", "SpiderlingsWebbingLv2LegsSquish", "Skirts", 2000, 110, 1657],
        ["SpiderlingsWebbingLv2AnklesModel", "SpiderlingsWebbingLv2AnklesSquish", "Skirts", 2000, 383, 2085],
        ["SpiderlingsWebbingLv2FootModel", "SpiderlingsWebbingLv2FootSquish", "Shoes", 100, 741, 2928],
        ["SpiderlingsWebbingLv3ArmModel", "SpiderlingsWebbingLv2ArmSquish", "Rope1", 1200, 650, 749],
        ["SpiderlingsWebbingLv3BellyModel", "SpiderlingsWebbingLv2BellySquish", "CorsetTorso", 1200, 459, 1280],
        ["SpiderlingsWebbingLv3LegsModel", "SpiderlingsWebbingLv2LegsSquish", "Skirts", 2000, 110, 1657],
        ["SpiderlingsWebbingLv3AnklesModel", "SpiderlingsWebbingLv2AnklesSquish", "Skirts", 2000, 383, 2085],
        ["SpiderlingsWebbingLv3FootModel", "SpiderlingsWebbingLv2FootSquish", "Shoes", 100, 741, 2928],
    ];
    for (const [modelName, sprite, targetLayer, amount, xPad, yPad] of displacementContracts) {
        const layer = Object.values(models.get(modelName).Layers)[0];
        const runtimeAsset = `DisplacementMaps/${sprite}.png`;
        assert.equal(layer.DisplacementSprite, sprite);
        assert.equal(layer.DisplacementInvariant, true);
        assert.deepEqual(Object.keys(layer.DisplaceLayers), [targetLayer]);
        assert.equal(layer.DisplaceAmount, amount);
        assert.equal(layer.DisplaceLayerGroups, undefined);
        assert.deepEqual(JSON.parse(JSON.stringify(runtime.context.KDOptimizeDisplacementMapInfo[runtimeAsset])), {
            xPad,
            yPad,
        });
        assert.equal(fs.existsSync(path.join(modRoot, runtimeAsset)), true);
    }

    const lv1LegsLayer = Object.values(models.get("SpiderlingsWebbingLv1LegsModel").Layers)[0];
    const lv2LegsLayer = Object.values(models.get("SpiderlingsWebbingLv2LegsModel").Layers)[0];
    assert.equal(lv1LegsLayer.Layer, "WrappingLegsOver");
    assert.equal(lv2LegsLayer.Layer, "OverSkirtDeco");
    const layerOrder = fs.readFileSync(path.join(referenceRoot, "Data", "Defs.ts"), "utf8");
    for (const skirtLayer of ["OverSkirt", "SkirtOver", "Skirt"]) {
        assert.ok(
            layerOrder.indexOf(`"${skirtLayer}"`) < layerOrder.indexOf('"WrappingLegsOver"'),
            `${skirtLayer} must draw above Lv1 Legs`,
        );
    }

    assert.deepEqual(Object.keys(Object.values(models.get("SpiderlingsWebbingLv1ArmModel").Layers)[0].Poses), [
        "Wristtie",
    ]);
    const layerVisible = (layer, activePoses) => {
        const active = new Set(activePoses);
        if (layer.HidePoses && Object.keys(layer.HidePoses).some((pose) => active.has(pose))) return false;
        if (layer.Poses && !Object.keys(layer.Poses).some((pose) => active.has(pose))) return false;
        if (layer.RequirePoses && Object.keys(layer.RequirePoses).some((pose) => !active.has(pose))) return false;
        return true;
    };
    for (const side of ["Left", "Right"]) {
        const mittenModel = models.get(`SpiderlingsWebbingLv1Mitten${side}Model`);
        const mittenLayer = Object.values(mittenModel.Layers)[0];
        assert.equal(mittenLayer.Sprite, `Mitten${side}`);
        assert.equal(mittenLayer.Layer, `Mitten${side}`);
        assert.deepEqual(Object.keys(mittenLayer.RequirePoses), ["Free"]);
        assert.equal(!!mittenLayer.HidePoses?.Wristtie, false, `Mitten ${side} must not special-case Wristtie`);
        for (const armPose of ["Free", "Boxtie", "Wristtie", "Yoked", "Front", "Up", "Crossed"]) {
            for (const legPose of ["Spread", "Closed", "Kneel", "KneelClosed", "Hogtie"]) {
                const deliveredExpected = armPose === "Free";
                assert.equal(
                    layerVisible(mittenLayer, [armPose, legPose]),
                    deliveredExpected,
                    `delivered Mitten ${side} visibility changed for ${armPose}+${legPose}`,
                );
            }
        }
        assert.deepEqual(Array.from(mittenModel.RemovePoses), []);
        assert.equal(mittenModel.AddPose.includes("Wristties"), false);
        assert.equal(mittenModel.AddPose.includes("Front"), false);
    }
    assert.deepEqual(Object.keys(Object.values(models.get("SpiderlingsWebbingLv1BellyModel").Layers)[0].Poses), [
        "Closed",
    ]);
    assert.deepEqual(Array.from(models.get("SpiderlingsWebbingLv1BellyModel").RemovePoses), [
        "Spread",
        "Kneel",
        "KneelClosed",
        "Hogtie",
    ]);
    for (const family of ["Legs", "Ankles", "Foot"]) {
        const model = models.get(`SpiderlingsWebbingLv1${family}Model`);
        assert.deepEqual(Object.keys(Object.values(model.Layers)[0].Poses), ["Closed"]);
        assert.deepEqual(Array.from(model.RemovePoses), ["Spread", "Kneel", "KneelClosed", "Hogtie"]);
    }
    const blindfoldModel = models.get("SpiderlingsWebbingLv1BlindfoldModel");
    assert.equal(
        blindfoldModel.AddPose.some((pose) => pose.startsWith("Encase")),
        false,
    );
    assert.equal("Poses" in Object.values(blindfoldModel.Layers)[0], false);
    assert.equal(Object.values(blindfoldModel.Layers)[0].Layer, "Blindfold");
});

test("Lv1 Stuffing and Gag form an independently removable inner/outer mouth chain totaling 0.25 gag", () => {
    for (const removeFamily of ["Stuffing", "Gag"]) {
        const runtime = loadWebbingRuntime();
        const api = runtime.context.Spiderlings.Webbing;
        assert.equal(api.equipForDebug("SpiderlingsWebbingLv1Stuffing").applied, true);
        assert.equal(api.equipForDebug("SpiderlingsWebbingLv1Gag").applied, true);

        const root = runtime.equipped.get("ItemMouth");
        assert.equal(root.name, "SpiderlingsWebbingLv1Gag");
        assert.equal(root.dynamicLink.name, "SpiderlingsWebbingLv1Stuffing");
        assert.equal(root.restraint.gag + root.dynamicLink.restraint.gag, 0.25);

        assert.equal(
            api.completeEffectiveEscape(`SpiderlingsWebbingLv1${removeFamily}`, "Remove", { legal: true }).completed,
            true,
        );
        const survivor = removeFamily === "Stuffing" ? "SpiderlingsWebbingLv1Gag" : "SpiderlingsWebbingLv1Stuffing";
        assert.equal(runtime.equipped.get("ItemMouth").name, survivor);
    }
});

test("each Lv1 family can be equipped at zero tightness and removed independently", () => {
    for (const family of families) {
        const runtime = loadWebbingRuntime();
        const api = runtime.context.Spiderlings.Webbing;
        const equipped = api.equipForDebug(family.id);
        assert.equal(equipped.applied, true, `${family.id} should equip`);
        assert.equal(runtime.addCalls[0].tightness, 0);
        assert.equal(runtime.addCalls[0].lock, "");
        assert.equal(api.completeEffectiveEscape(family.id, "Struggle", { legal: true }).completed, true);
        assert.equal(runtime.equipped.has(family.group), false);
    }
});
