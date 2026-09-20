"use strict";

// Spiderlings-owned models for the atomic Webbing catalogue.
(() => {
    const api = globalThis.Spiderlings = globalThis.Spiderlings || {};
    const FOLDER = "SpiderlingsWebbingLv1";
    const LV2_FOLDER = "SpiderlingsWebbingLv2";
    const LV3_FOLDER = "SpiderlingsWebbingLv3";
    const ARM_MODEL_ID = "SpiderlingsWebbingLv1ArmModel";
    const ARM_ASSET = "Models/SpiderlingsWebbingLv1/ArmWebbing.png";
    const COCOON_FOLDER = "SpiderlingsWebbingCocoon";
    const COCOON_ASSET = `Models/${COCOON_FOLDER}/Cocoon.png`;
    const COCOON_MODEL_ID = "SpiderlingsWebbingCocoonModel";
    const COMMON_CATEGORIES = Object.freeze(["Restraints", "Wrapping", "Latex", "SpiderlingsWebbingLv1"]);
    const LV2_CATEGORIES = Object.freeze(["Restraints", "Wrapping", "Latex", "SpiderlingsWebbingLv2"]);
    const LV3_CATEGORIES = Object.freeze(["Restraints", "Wrapping", "Latex", "SpiderlingsWebbingLv3"]);
    const COCOON_COVER_POSE = "SpiderlingsWebbingCocoonCover";
    const CLOSED_ONLY = Object.freeze(["Spread", "Kneel", "KneelClosed", "Hogtie"]);
    const LV1_PRIORITY = 50;
    const LV2_PRIORITY = 51;
    const LV3_PRIORITY = 52;
    // Adopted from DSmap exports. Lv2 and Lv3 share the same cropped PNG,
    // native canvas translation, targets and strength for each body region.
    const BODY_DISPLACEMENTS = Object.freeze(Object.fromEntries([
        ["Arm", "Rope1", 1200, 650, 749],
        ["Belly", "CorsetTorso", 1200, 459, 1280],
        ["Legs", "Skirts", 2000, 110, 1657],
        ["Ankles", "Skirts", 2000, 383, 2085],
        ["Foot", "Shoes", 100, 741, 2928],
    ].map(([family, target, amount, xPad, yPad]) => {
        const sprite = `SpiderlingsWebbingLv2${family}Squish`;
        if (typeof KDOptimizeDisplacementMapInfo != "undefined") {
            KDOptimizeDisplacementMapInfo[`DisplacementMaps/${sprite}.png`] = {xPad, yPad};
        }
        return [family, Object.freeze({
            DisplacementSprite: sprite,
            DisplacementInvariant: true,
            DisplaceLayers: ToMap([target]),
            DisplaceAmount: amount,
        })];
    })));

    function directModel(name, folder, categories, sprite, layer, poses, addPose = [], removePoses = [], pri = LV1_PRIORITY,
        extraLayerFields = {}) {
        const layerDefinition = {
            Name: sprite,
            Sprite: sprite,
            Layer: layer,
            Pri: pri,
            Invariant: true,
            NoColorize: true,
            HideWhenOverridden: true,
            ...extraLayerFields,
        };
        // Full artwork replaces only the visible inner region. The physical
        // linked restraints remain equipped and return when its cover is removed.
        if (folder === FOLDER || folder === LV2_FOLDER) {
            const family = sprite === "ArmWebbing" ? "Arm" : sprite;
            const head = ["Blindfold", "Stuffing", "Gag"].includes(family);
            layerDefinition.HidePoses = ToMap([
                ...(head ? ["FullHood"] : [COCOON_COVER_POSE]),
                `SpiderlingsWebbingLv3${family}Cover`,
            ]);
        }
        if (poses.length) layerDefinition.Poses = ToMap(poses);
        return {
            Name: name,
            Folder: folder,
            TopLevel: true,
            Restraint: true,
            Categories: [...categories],
            AddPose: [...addPose],
            RemovePoses: [...removePoses],
            Layers: ToLayerMap([layerDefinition]),
        };
    }

    const definitions = Object.freeze([
        Object.freeze({
            family: "Arm",
            id: ARM_MODEL_ID,
            asset: ARM_ASSET,
            create() {
                return directModel(
                    ARM_MODEL_ID,
                    FOLDER,
                    COMMON_CATEGORIES,
                    "ArmWebbing",
                    "WrapArms",
                    ["Wristtie"],
                    ["Wristties"],
                    CLOSED_ONLY,
                    LV1_PRIORITY,
                );
            },
        }),
        Object.freeze({
            family: "MittenLeft",
            id: "SpiderlingsWebbingLv1MittenLeftModel",
            asset: "Models/SpiderlingsWebbingLv1/MittenLeft.png",
            create() {
                return {
                    Name: this.id,
                    Folder: FOLDER,
                    TopLevel: true,
                    Restraint: true,
                    Categories: [...COMMON_CATEGORIES],
                    AddPose: [],
                    RemovePoses: [],
                    Layers: ToLayerMap([{
                        Name: "MittenLeft",
                        Sprite: "MittenLeft",
                        Layer: "MittenLeft",
                        Pri: 50,
                        Invariant: true,
                        NoColorize: true,
                        RequirePoses: ToMap(["Free"]),
                        HidePoses: ToMap([COCOON_COVER_POSE]),
                    }]),
                };
            },
        }),
        Object.freeze({
            family: "MittenRight",
            id: "SpiderlingsWebbingLv1MittenRightModel",
            asset: "Models/SpiderlingsWebbingLv1/MittenRight.png",
            create() {
                return {
                    Name: this.id,
                    Folder: FOLDER,
                    TopLevel: true,
                    Restraint: true,
                    Categories: [...COMMON_CATEGORIES],
                    AddPose: [],
                    RemovePoses: [],
                    Layers: ToLayerMap([{
                        Name: "MittenRight",
                        Sprite: "MittenRight",
                        Layer: "MittenRight",
                        Pri: 50,
                        Invariant: true,
                        NoColorize: true,
                        RequirePoses: ToMap(["Free"]),
                        HidePoses: ToMap([COCOON_COVER_POSE]),
                    }]),
                };
            },
        }),
        Object.freeze({
            family: "Belly",
            id: "SpiderlingsWebbingLv1BellyModel",
            asset: "Models/SpiderlingsWebbingLv1/Belly.png",
            create() {
                return directModel(this.id, FOLDER, COMMON_CATEGORIES, "Belly", "WrappingTorsoLower", ["Closed"], [], CLOSED_ONLY);
            },
        }),
        Object.freeze({
            family: "Legs",
            id: "SpiderlingsWebbingLv1LegsModel",
            asset: "Models/SpiderlingsWebbingLv1/Legs.png",
            create() {
                return directModel(this.id, FOLDER, COMMON_CATEGORIES, "Legs", "WrappingLegsOver", ["Closed"], ["FeetLinked"], CLOSED_ONLY);
            },
        }),
        Object.freeze({
            family: "Ankles",
            id: "SpiderlingsWebbingLv1AnklesModel",
            asset: "Models/SpiderlingsWebbingLv1/Ankles.png",
            create() {
                return directModel(this.id, FOLDER, COMMON_CATEGORIES, "Ankles", "WrappingAnklesOver", ["Closed"], ["FeetLinked"], CLOSED_ONLY);
            },
        }),
        Object.freeze({
            family: "Foot",
            id: "SpiderlingsWebbingLv1FootModel",
            asset: "Models/SpiderlingsWebbingLv1/Foot.png",
            create() {
                return directModel(this.id, FOLDER, COMMON_CATEGORIES, "Foot", "WrappingLegs", ["Closed"], ["FeetLinked"], CLOSED_ONLY);
            },
        }),
        Object.freeze({
            family: "Blindfold",
            id: "SpiderlingsWebbingLv1BlindfoldModel",
            asset: "Models/SpiderlingsWebbingLv1/Blindfold.png",
            create() {
                return directModel(this.id, FOLDER, COMMON_CATEGORIES, "Blindfold", "Blindfold", [], [], [], -1);
            },
        }),
        Object.freeze({
            family: "Stuffing",
            id: "SpiderlingsWebbingLv1StuffingModel",
            asset: "Models/SpiderlingsWebbingLv1/Stuffing.png",
            create() {
                return directModel(this.id, FOLDER, COMMON_CATEGORIES, "Stuffing", "GagUnder", [], ["StuffMouth"], [], -100);
            },
        }),
        Object.freeze({
            family: "Gag",
            id: "SpiderlingsWebbingLv1GagModel",
            asset: "Models/SpiderlingsWebbingLv1/Gag.png",
            create() {
                return directModel(this.id, FOLDER, COMMON_CATEGORIES, "Gag", "GagMuzzle", [], ["FaceCoverGag"], [], -50);
            },
        }),
    ]);

    const cocoonDefinition = Object.freeze({
        family: "Cocoon",
        id: COCOON_MODEL_ID,
        asset: COCOON_ASSET,
        create() {
            const model = directModel(COCOON_MODEL_ID, COCOON_FOLDER,
                ["Restraints", "Wrapping", "Latex", "SpiderlingsWebbingCocoon"],
                "Cocoon", "FurnitureFront", ["Closed"],
                ["Wristties", "FeetLinked", "EncaseArmLeft", "EncaseArmRight", "WrapArms",
                    "EncaseChest", "EncaseTorsoUpper", "EncaseTorsoLower", "EncaseHandLeft", "EncaseHandRight",
                    "EncaseLegs", "EncaseAnkles", "EncaseFeet", COCOON_COVER_POSE],
                CLOSED_ONLY, 100);
            model.HideLayers = ["Tail", "TailNoRot", "TailFront"];
            model.Layers.OuterWebs = {
                Name: "OuterWebs", Sprite: "OuterWebs", Layer: "FurnitureBack", Pri: 100,
                Invariant: true, NoColorize: true, NoOverride: true,
                RequirePoses: ToMap(["SpiderlingsCocoonAnchored"]),
            };
            return model;
        },
    });

    const lv2Definitions = Object.freeze([
        Object.freeze({
            family: "Arm",
            id: "SpiderlingsWebbingLv2ArmModel",
            asset: "Models/SpiderlingsWebbingLv2/ArmWebbing.png",
            create() {
                return directModel(this.id, LV2_FOLDER, LV2_CATEGORIES, "ArmWebbing", "WrapArms", ["Wristtie"],
                    ["Wristties"], CLOSED_ONLY,
                    LV2_PRIORITY, {...BODY_DISPLACEMENTS.Arm, NoOverride: true});
            },
        }),
        Object.freeze({
            family: "Belly",
            id: "SpiderlingsWebbingLv2BellyModel",
            asset: "Models/SpiderlingsWebbingLv2/Belly.png",
            create() {
                return directModel(this.id, LV2_FOLDER, LV2_CATEGORIES, "Belly", "WrappingTorsoLower", ["Closed"], [], CLOSED_ONLY,
                    LV2_PRIORITY, {...BODY_DISPLACEMENTS.Belly, NoOverride: true});
            },
        }),
        Object.freeze({
            family: "Legs",
            id: "SpiderlingsWebbingLv2LegsModel",
            asset: "Models/SpiderlingsWebbingLv2/Legs.png",
            create() {
                return directModel(this.id, LV2_FOLDER, LV2_CATEGORIES, "Legs", "OverSkirtDeco", ["Closed"], ["FeetLinked"], CLOSED_ONLY,
                    LV2_PRIORITY, {...BODY_DISPLACEMENTS.Legs, NoOverride: true});
            },
        }),
        Object.freeze({
            family: "Ankles",
            id: "SpiderlingsWebbingLv2AnklesModel",
            asset: "Models/SpiderlingsWebbingLv2/Ankles.png",
            create() {
                return directModel(this.id, LV2_FOLDER, LV2_CATEGORIES, "Ankles", "OverSkirtDeco", ["Closed"], ["FeetLinked"], CLOSED_ONLY,
                    LV2_PRIORITY, {...BODY_DISPLACEMENTS.Ankles, NoOverride: true});
            },
        }),
        Object.freeze({
            family: "Foot",
            id: "SpiderlingsWebbingLv2FootModel",
            asset: "Models/SpiderlingsWebbingLv2/Foot.png",
            create() {
                return directModel(this.id, LV2_FOLDER, LV2_CATEGORIES, "Foot", "WrappingLegs", ["Closed"], ["FeetLinked"], CLOSED_ONLY,
                    LV2_PRIORITY, {...BODY_DISPLACEMENTS.Foot, NoOverride: true});
            },
        }),
    ]);

    const lv3Definitions = Object.freeze([
        {family: "Arm", sprite: "ArmWebbing", layer: "WrappingChest", poses: ["Wristtie"],
            addPose: ["Wristties", "EncaseArmLeft", "EncaseArmRight", "EncaseTorsoUpper", "EncaseChest", "WrapArms"],
            extra: {CrossHideOverride: true, HideOverrideLayerMulti: ["ChestBinding"], ForceSingleOverride: true,
                // Native priority collection checks this field before it checks
                // drawable poses. An invisible wrap must not suppress the chest.
                HidePoseConditional: ["Free", "Boxtie", "Yoked", "Front", "Up", "Crossed", COCOON_COVER_POSE]
                    .map((pose) => [pose])}},
        {family: "Belly", sprite: "Belly", layer: "WrappingTorsoLower", poses: ["Closed"], addPose: ["EncaseTorsoLower"]},
        // The uppermost standing skirt slot keeps the outer webbing above
        // OverSkirt as well as SkirtOver/Skirt, without hiding the skirt itself.
        {family: "Legs", sprite: "Legs", layer: "OverSkirtDeco", poses: ["Closed"], addPose: ["FeetLinked", "EncaseLegs"],
            extra: {NoOverride: true}},
        {family: "Ankles", sprite: "Ankles", layer: "OverSkirtDeco", poses: ["Closed"], addPose: ["FeetLinked", "EncaseAnkles"],
            extra: {NoOverride: true}},
        {family: "Foot", sprite: "Foot", layer: "WrappingLegs", poses: ["Closed"], addPose: ["FeetLinked", "EncaseFeet"]},
        {family: "Blindfold", sprite: "Blindfold", layer: "Blindfold", poses: [], addPose: ["EncaseEyes"]},
        {family: "Gag", sprite: "Gag", layer: "GagMuzzle", poses: [], addPose: ["FaceCoverGag", "EncaseMouth"]},
        {family: "Hood", sprite: "Hood", layer: "Hood", poses: [],
            addPose: ["HideEars", "FaceCoverGag", "Hooded", "FullHood", "EncaseHead"]},
    ].map((entry) => Object.freeze({
        family: entry.family,
        id: `SpiderlingsWebbingLv3${entry.family}Model`,
        asset: `Models/${LV3_FOLDER}/${entry.sprite}.png`,
        create() {
            const head = ["Blindfold", "Gag", "Hood"].includes(entry.family);
            const model = directModel(this.id, LV3_FOLDER, LV3_CATEGORIES, entry.sprite, entry.layer, entry.poses,
                [...entry.addPose, `SpiderlingsWebbingLv3${entry.family}Cover`], head ? [] : CLOSED_ONLY,
                LV3_PRIORITY, {
                    ...BODY_DISPLACEMENTS[entry.family],
                    ...entry.extra,
                    HidePoses: ToMap(head ? (entry.family === "Hood" ? [] : ["FullHood"]) : [COCOON_COVER_POSE]),
                });
            if (entry.family === "Hood") {
                model.HideLayers = ["HairFront", "HairOver", "Hair", "HairMid", "HairBack", "HairPonytail", "Ahoge", "Brows", "Ears",
                    "AnimalEars", "AnimalEarsFront", "AnimalEarsMid"];
            } else if (entry.family === "Legs") {
                model.HideLayers = ["Tail", "TailNoRot", "TailFront"];
            }
            return model;
        },
    })));

    function registerModels() {
        if (typeof AddModel != "function" || typeof ToLayerMap != "function" || typeof ToMap != "function") return false;
        for (const definition of definitions) AddModel(definition.create());
        for (const definition of lv2Definitions) AddModel(definition.create());
        for (const definition of lv3Definitions) AddModel(definition.create());
        AddModel(cocoonDefinition.create());
        if (api.applyWebbingColor) api.applyWebbingColor();
        return true;
    }

    api.WebbingModels = Object.freeze({
        ARM_ASSET,
        ARM_MODEL_ID,
        COCOON_ASSET,
        COCOON_FOLDER,
        COCOON_MODEL_ID,
        FOLDER,
        LV2_FOLDER,
        LV3_FOLDER,
        cocoonDefinition,
        definitions,
        lv2Definitions,
        lv3Definitions,
        registerModels,
    });

    registerModels();
})();
