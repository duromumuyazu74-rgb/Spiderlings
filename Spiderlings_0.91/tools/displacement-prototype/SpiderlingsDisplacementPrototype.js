"use strict";

/*
 * Throwaway visual prototype. It deliberately reuses KD 5.5's YukataWaist,
 * CorsetSquish, and Catsuit art so that it tests rendering behavior rather
 * than Spiderlings artwork. Nothing here is part of the production mod.
 */
(() => {
  const PREFIX = "SpiderlingsDisplacementPrototype";
  // Keep the 0.1.0 item ID so an existing prototype save can reuse it safely.
  const TARGET_ID = `${PREFIX}TargetSkirt`;
  const TARGET_MODEL = `${PREFIX}TargetCatsuitModel`;
  const LEVELS = {
    1: {
      id: `${PREFIX}Lv1`,
      model: `${PREFIX}Lv1Model`,
      amount: 300,
      poses: [],
      label: "[TEST] Compression Lv1",
      expected: "The tight catsuit remains visible with an exaggerated but clear waist indentation.",
    },
    2: {
      id: `${PREFIX}Lv2`,
      model: `${PREFIX}Lv2Model`,
      amount: 600,
      poses: [],
      label: "[TEST] Compression Lv2",
      expected: "The tight catsuit remains visible with a deliberately extreme waist indentation.",
    },
    3: {
      id: `${PREFIX}Lv3`,
      model: `${PREFIX}Lv3Model`,
      amount: 600,
      poses: ["EncaseTorsoUpper", "EncaseTorsoLower"],
      label: "[TEST] Cover Lv3",
      expected: "Encase poses hide torso clothing; this belt-only prototype does not supply final covering artwork.",
    },
  };
  const PROTOTYPE_IDS = new Set(Object.values(LEVELS).map((level) => level.id));

  function cloneModel(sourceName, newName) {
    const source = ModelDefs[sourceName];
    if (!source) throw new Error(`[${PREFIX}] Missing KD 5.5 model: ${sourceName}`);
    const model = JSON.parse(JSON.stringify(source));
    model.Name = newName;
    model.Group = newName;
    model.TopLevel = true;
    model.Restraint = true;
    model.Categories = ["Restraints", "Prototype"];
    return model;
  }

  function registerModel(model) {
    if (!ModelDefs[model.Name]) AddModel(model);
  }

  function makeCompressionModel(level) {
    const model = cloneModel("YukataWaist", level.model);
    delete model.Layers.Waist;
    for (const layer of Object.values(model.Layers)) {
      if (layer.DisplacementSprite === "CorsetSquish") {
        layer.DisplaceAmount = level.amount;
      }
    }
    registerModel(model);
  }

  function registerRestraint(props, displayName, flavorText, functionText) {
    if (!KinkyDungeonGetRestraintByName(props.name)) {
      KinkyDungeonCreateRestraint(props, displayName, flavorText, functionText);
    }
  }

  function register() {
    const target = cloneModel("Catsuit", TARGET_MODEL);
    for (const layer of Object.values(target.Layers)) {
      layer.HidePoses = {
        ...(layer.HidePoses || {}),
        EncaseTorsoUpper: true,
        EncaseTorsoLower: true,
      };
    }
    registerModel(target);

    registerRestraint({
      name: TARGET_ID,
      Group: "ItemPelvis",
      Asset: "LeatherChastityBelt",
      AssetGroup: TARGET_ID,
      Model: TARGET_MODEL,
      inventory: true,
      unlimited: true,
      accessible: true,
      power: 0,
      weight: 0,
      allFloors: true,
      escapeChance: { Struggle: 10, Cut: 10, Remove: 10 },
      enemyTags: {},
      playerTags: {},
      shrine: [],
      events: [],
    }, "[TEST] Compression Target Catsuit",
    "A tight Catsuit clone used to expose changes to the body silhouette.",
    "Wear this together with one prototype level.");

    for (const level of Object.values(LEVELS)) {
      makeCompressionModel(level);
      registerRestraint({
        name: level.id,
        Group: "ItemTorso",
        Asset: "LeatherCorsetTop1",
        AssetGroup: level.id,
        Model: level.model,
        inventory: true,
        unlimited: true,
        accessible: true,
        power: Number(level.id.slice(-1)),
        weight: 0,
        allFloors: true,
        addPose: level.poses,
        escapeChance: { Struggle: 10, Cut: 10, Remove: 10 },
        enemyTags: {},
        playerTags: {},
        shrine: [],
        events: [],
      }, level.label,
      "A temporary KD 5.5 displacement rendering test.", level.expected);
    }

    KinkyDungeonRefreshRestraintsCache();
  }

  function give() {
    for (const name of [TARGET_ID, ...PROTOTYPE_IDS]) {
      if (!KinkyDungeonInventoryGetLoose(name)) KinkyDungeonInventoryAddLoose(name);
    }
    console.info(`[${PREFIX}] Added the target catsuit and Lv1/Lv2/Lv3 to loose inventory.`);
    return state();
  }

  function worn(group) {
    return KinkyDungeonGetRestraintItem(group);
  }

  function removeIfPrototype(group, validNames) {
    const item = worn(group);
    if (!item) return true;
    if (!validNames.has(item.name)) {
      console.warn(`[${PREFIX}] ${group} is occupied by ${item.name}; refusing to remove a non-prototype item.`);
      return false;
    }
    KinkyDungeonRemoveRestraint(group, true, false, false);
    return true;
  }

  function equip(name) {
    return KinkyDungeonAddRestraintIfWeaker(name, 0, true, "", true) > 0;
  }

  function prepare() {
    give();
    const current = worn("ItemPelvis");
    if (current && current.name !== TARGET_ID) {
      console.warn(`[${PREFIX}] ItemPelvis is occupied by ${current.name}; use a clean test save or remove it yourself.`);
      return false;
    }
    if (!current && !equip(TARGET_ID)) {
      console.warn(`[${PREFIX}] Could not equip the target catsuit.`);
      return false;
    }
    console.info(`[${PREFIX}] Target catsuit equipped. Run KDDisplacementPrototype.wear(1), wear(2), or wear(3).`);
    return state();
  }

  function wear(levelNumber) {
    const level = LEVELS[Number(levelNumber)];
    if (!level) {
      console.warn(`[${PREFIX}] Level must be 1, 2, or 3.`);
      return false;
    }
    if (!worn("ItemPelvis") || worn("ItemPelvis").name !== TARGET_ID) {
      console.warn(`[${PREFIX}] Target catsuit is not equipped. Run KDDisplacementPrototype.prepare() first.`);
      return false;
    }
    if (!removeIfPrototype("ItemTorso", PROTOTYPE_IDS)) return false;
    if (!equip(level.id)) {
      console.warn(`[${PREFIX}] Could not equip Lv${levelNumber}.`);
      return false;
    }
    console.info(`[${PREFIX}] Lv${levelNumber}: ${level.expected}`);
    return state();
  }

  function clear() {
    const removed = removeIfPrototype("ItemTorso", PROTOTYPE_IDS);
    if (removed) console.info(`[${PREFIX}] Prototype level removed; target catsuit remains as the baseline.`);
    return removed && state();
  }

  function reset() {
    if (!removeIfPrototype("ItemTorso", PROTOTYPE_IDS)) return false;
    if (!removeIfPrototype("ItemPelvis", new Set([TARGET_ID]))) return false;
    console.info(`[${PREFIX}] Prototype wearables removed. Loose inventory copies were kept.`);
    return state();
  }

  function state() {
    const snapshot = {
      target: worn("ItemPelvis")?.name || null,
      level: worn("ItemTorso")?.name || null,
      levels: Object.fromEntries(Object.entries(LEVELS).map(([number, level]) => [number, {
        item: level.id,
        displacementAmount: level.amount,
        addPose: level.poses,
        expected: level.expected,
      }])),
    };
    console.table(snapshot.levels);
    console.info(`[${PREFIX}] State`, snapshot);
    return snapshot;
  }

  register();
  globalThis.KDDisplacementPrototype = Object.freeze({
    give,
    prepare,
    wear,
    clear,
    reset,
    state,
  });
  console.info(`[${PREFIX}] Ready. Run KDDisplacementPrototype.prepare().`);
})();
