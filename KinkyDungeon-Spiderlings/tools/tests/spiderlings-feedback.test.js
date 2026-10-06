"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadLifecycleRuntime, modRoot } = require("./helpers/lifecycle-runtime.js");
const { runtime } = require("./helpers/spinner-native-runtime.js");
const { loadWebbingRuntime } = require("./helpers/model-runtime.js");
const load = (c, file) => vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), c, { filename: file });

test("settings pages preserve custom values, defaults and native field pairing across reload", () => {
    const { context: c } = loadLifecycleRuntime({ KDModPage: 1, addTextKey: () => {} });
    c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight = "73";
    load(c, "SpiderlingsSettings.js");
    const panel = c.Spiderlings.SettingsPanel;
    for (const page of ["general", "floors", "nests", "general"]) {
        panel.select(page);
        assert.ok(c.KDModConfigs.Spiderlings.length <= 16);
        assert.equal(c.KDModPage, 0);
        for (const [index, entry] of c.KDModConfigs.Spiderlings.entries()) {
            if (entry.type !== "string") continue;
            assert.equal(c.KDModConfigs.Spiderlings[index - 1].refvar, entry.refvar);
            assert.equal(c.KDModConfigs.Spiderlings[index - 1].type, "text");
            assert.notEqual(index % 8, 0, "native columns must not separate an input from its label");
        }
        c.Spiderlings.ensureModSettings();
        assert.equal(panel.current(), page);
        assert.equal(c.Spiderlings.getSetting("spiderlingsHuntingGroundsWeight"), "73");
        assert.equal(c.Spiderlings.getSetting("spiderlingsInfestationWeight"), "200");
    }
    assert.equal(panel.catalogue().filter((entry) => entry.default !== undefined).length, 15);
});

test("nest settings keep weights in the first column and paired limits in the second", () => {
    const { context: c } = loadLifecycleRuntime({ KDModPage: 0, addTextKey: () => {} });
    load(c, "SpiderlingsSettings.js");
    c.Spiderlings.SettingsPanel.select("nests");
    const controls = c.KDModConfigs.Spiderlings;
    assert.ok(controls.slice(0, 8).filter((entry) => entry.type === "range").length === 5);
    for (const key of ["spiderlingsNestReinforcementCap", "spiderlingsNestTunnelerCap"]) {
        const index = controls.findIndex((entry) => entry.type === "string" && entry.refvar === key);
        assert.ok(index > 8, `${key} belongs with the other reinforcement limits`);
        assert.equal(controls[index - 1].refvar, key);
    }
    assert.ok(controls.findIndex((entry) => entry.refvar === "spiderlingsNestReinforcementInterval") >= 8);
});

test("native note pools offer undiscovered Spiderlings while their journal uses a single category", () => {
    const { context: c } = loadLifecycleRuntime({ addTextKey: () => {} });
    const discovered = { Cover: 1 },
        registered = [];
    c.localStorage = { getItem: () => JSON.stringify(discovered) };
    c.KDLore = { Default: { Cover: {} }, grv: {}, cat: {}, Enemy: {} };
    c.KDNewLore = (...args) => registered.push(args);
    load(c, "SpiderlingsBestiary.js");
    assert.equal(registered.length, 6);
    for (const [tabs, id, label, title, text, condition, image, hidden, enemy] of registered) {
        assert.equal(tabs[0], "Spiderlings");
        assert.ok(tabs.includes("grv") && tabs.includes("cat") && tabs.includes("Default"));
        assert.ok(!tabs.includes("Enemy"));
        assert.deepEqual(Array.from(hidden), ["Default", "grv", "cat"]);
        assert.equal(image, `Enemies/${enemy}.png`);
        assert.ok(label && title && text);
        assert.equal(condition(), true);
        discovered[id] = 1;
        assert.equal(condition(), false, "collected entries must not crowd the future note pool");
        assert.ok(fs.existsSync(path.join(modRoot, image)));
    }
});

test("blindfold artwork covers foreground hair and brows without removing the hairstyle", () => {
    const { context: c } = loadWebbingRuntime();
    const definitions = [
        ...c.Spiderlings.WebbingModels.definitions,
        ...c.Spiderlings.WebbingModels.lv3Definitions,
    ].filter((entry) => entry.family === "Blindfold");
    assert.equal(definitions.length, 2);
    for (const definition of definitions) {
        const model = definition.create(),
            layer = model.Layers.Blindfold;
        assert.equal(layer.Layer, "Blindfold");
        assert.equal(layer.SwapLayerPose.XrayFace, "Blindfold");
        assert.equal(Object.keys(layer.SwapLayerPose)[0], "XrayFace");
        const category = model.Categories.find((name) => /^SpiderlingsWebbingLv[13]$/.test(name));
        assert.equal(layer.SwapLayerPose[category], "Brows");
        assert.ok(layer.Pri > 0);
        assert.equal(layer.NoOverride, true);
        assert.equal(layer.HideOverrideLayer, "Blindfold");
        assert.ok(!model.HideLayers?.some((name) => name.startsWith("Hair")));
        assert.ok(layer.HidePoses.FullHood);
    }
});

test("arming alone does not activate prepared silk, but paid gate work changes native admission", () => {
    const { context: c } = runtime({ KDCanPassEnemy: () => false, KinkyDungeonCalculateSlowLevel: () => {} });
    const native = c.Spiderlings.SpinnerNativeField,
        topology = c.Spiderlings.SpinnerTopology;
    const encounter = native.initializeEnclosure({
        compositeId: "prepared",
        owners: [1],
        built: true,
        layers: [
            {
                id: "ring",
                vertices: [
                    { x: 4, y: 4 },
                    { x: 8, y: 4 },
                    { x: 8, y: 8 },
                    { x: 4, y: 8 },
                ],
                gate: { x: 6, y: 4 },
            },
        ],
    });
    topology.updateTarget(encounter.topology, { x: 1, y: 1 });
    const apply = (type) => {
        const field = encounter.topology.fields.ring;
        const link = encounter.topology.links.find((entry) =>
            entry.plannedCells.some((cell) => cell.x === 6 && cell.y === 4),
        );
        const result = topology.applyAction(
            encounter.topology,
            { type, ownerId: 1, fieldId: field.id, linkId: link.id, cell: field.gateCell },
            { inBounds: true, floor: true, protected: false, occupied: false },
        );
        assert.equal(result.outcome.legal, true, type);
        encounter.topology = result.state;
        native.reconcile();
    };
    apply("reopenGate");
    const proxy = c.KDMapData.Entities.find(
        (entity) => native.isOwnedProxy(entity) && entity.x === 5 && entity.y === 4,
    );
    assert.ok(proxy);
    assert.equal(c.KDCanPassEnemy(c.KinkyDungeonPlayerEntity, proxy), true);
    topology.updateTarget(encounter.topology, { id: "player", x: 6, y: 6 });
    assert.equal(
        c.KDCanPassEnemy(c.KinkyDungeonPlayerEntity, proxy),
        true,
        "intent cannot replace a paid gate operation",
    );
    c.KDEventMapGeneric.beforeMove.SpiderlingsSpinnerPreparedSilk(null, proxy);
    assert.equal(c.KinkyDungeonPlayerEntity.buffs.SpiderlingsSpinnerPreparedSilk.power, 2);
    apply("closeGate");
    assert.equal(c.KDCanPassEnemy(c.KinkyDungeonPlayerEntity, proxy), false);
    assert.equal(c.KDCanPassEnemy(c.KinkyDungeonPlayerEntity, { Enemy: { name: "Bandit" } }), false);
});

test("owned journal portraits stay on the Journal and survive throwing Titles draws", () => {
    let seen;
    const { context: c } = loadLifecycleRuntime({ addTextKey: () => {} });
    c.KDLore = { Default: {} };
    c.KDNewLore = () => {};
    c.KDLoreImg = { "spiderlings.Jumper": "Enemies/Jumper.png", Cover: "Cover.png" };
    c.KinkyDungeonCurrentLore = "spiderlings.Jumper";
    c.KinkyDungeonDrawTitles = () => {
        seen = c.KDLoreImg[c.KinkyDungeonCurrentLore];
        throw Error("draw");
    };
    load(c, "SpiderlingsBestiary.js");
    assert.throws(() => c.KinkyDungeonDrawTitles(), /draw/);
    assert.equal(seen, undefined);
    assert.equal(c.KDLoreImg["spiderlings.Jumper"], "Enemies/Jumper.png");
    c.KinkyDungeonCurrentLore = "Cover";
    assert.throws(() => c.KinkyDungeonDrawTitles(), /draw/);
    assert.equal(seen, "Cover.png");
});
