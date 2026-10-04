"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const LV1_FAMILIES = Object.freeze([
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
    ]);
    const LV2_FAMILIES = Object.freeze(["Arm", "Belly", "Legs", "Ankles", "Foot"]);
    const LV3_FAMILIES = Object.freeze(["Arm", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Gag", "Hood"]);
    const PROFILE_FAMILIES = Object.freeze([
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
        "Hood",
    ]);
    const ARM_ID = "SpiderlingsWebbingLv1Arm";
    const COCOON_ID = "SpiderlingsWebbingCocoon";
    const COCOON_MODEL_ID = "SpiderlingsWebbingCocoonModel";
    const COCOON_APPLY_EVENT = "SpiderlingsCocoonPostApply";
    const COCOON_ESCAPE_EVENT = "SpiderlingsCocoonEscape";
    const COCOON_OUTER_STATE = "SpiderlingsCocoonOuterWebs";
    const COCOON_OUTER_POSE = "SpiderlingsCocoonAnchored";
    // KD 5.5 spends four turns on an ordinary struggle, including delayed ticks.
    const COCOON_STRUGGLE_WINDOW = 12;
    const COCOON_STRUGGLE_THRESHOLD = 3;
    const VIGIL_STATE = "SpiderlingsCocoonVigil";
    const VIGIL_IDLE_TURNS = 25;
    const COCOON_ANCHORED_MESSAGE = "KinkyDungeonSpiderlingsCocoonAnchored";
    const COCOON_ANCHORED_FALLBACK =
        "Spiderlings weave fresh threads around your cocoon and anchor it to the floor. You cannot move.";
    const COCOON_REPAIR_AMOUNT = 0.1;
    // Native chance and speed, never a fixed number of successful inputs.
    const ESCAPE_PROFILES = Object.freeze({
        Lv1: Object.freeze({
            escapeChance: Object.freeze({ Cut: 4, Remove: 4, Struggle: 4 }),
            speedMult: Object.freeze({ Cut: 1, Remove: 1, Struggle: 1 }),
        }),
        Lv2: Object.freeze({
            escapeChance: Object.freeze({ Cut: 0.18, Remove: 0.3, Struggle: 0.12 }),
            speedMult: Object.freeze({ Cut: 1, Remove: 1, Struggle: 1 }),
        }),
        Lv3: Object.freeze({
            escapeChance: Object.freeze({ Cut: 0.1, Remove: 0.14, Struggle: 0.04 }),
            speedMult: Object.freeze({ Cut: 0.75, Remove: 0.65, Struggle: 0.65 }),
        }),
        Legbinder: Object.freeze({
            escapeChance: Object.freeze({ Cut: 0.1, Remove: 0.1, Struggle: 0.05 }),
            speedMult: Object.freeze({ Cut: 0.55, Remove: 0.5, Struggle: 0.55 }),
        }),
        Lv2Arm: Object.freeze({
            escapeChance: Object.freeze({ Cut: 0.18, Remove: 0.7, Struggle: 0.2 }),
            speedMult: Object.freeze({ Cut: 1, Remove: 1, Struggle: 1 }),
        }),
        Lv3Arm: Object.freeze({
            escapeChance: Object.freeze({ Cut: 0.18, Remove: 0.5, Struggle: 0.15 }),
            speedMult: Object.freeze({ Cut: 0.75, Remove: 0.65, Struggle: 0.65 }),
        }),
        Cocoon: Object.freeze({
            escapeChance: Object.freeze({ Cut: 0.5, Remove: 0.04, Struggle: 0.03 }),
            speedMult: Object.freeze({ Cut: 0.1, Remove: 0.2, Struggle: 0.24 }),
        }),
    });
    const COCOON_COST_MULT = Object.freeze({ Cut: 2, Remove: 3, Struggle: 1.5 });
    const ESCAPE_METHODS = Object.freeze(["Cut", "Struggle", "Remove"]);
    const ESCAPE_TEXT = {
        SpiderlingsWebbing: {
            Cut: [
                "You work the blade along a seam in TargetRestraint.",
                "You cut through the last threads of TargetRestraint. Scraps of silk fall away.",
                "You cannot cut TargetRestraint in your current condition.",
                "Your bindings keep you from holding the blade steady enough to cut TargetRestraint.",
            ],
            Struggle: [
                "You pull against TargetRestraint. The weave creases around your movements.",
                "You pull free of TargetRestraint and gather the loose silk.",
                "You cannot pull free of TargetRestraint in your current condition.",
                "Your other bindings prevent you from struggling against TargetRestraint.",
            ],
            Remove: [
                "You pick at the edge of TargetRestraint, trying to lift the clinging threads.",
                "You peel away TargetRestraint and gather its threads.",
                "You cannot loosen TargetRestraint in your current condition.",
                "Your other bindings keep you from working on TargetRestraint.",
            ],
        },
        SpiderlingsCocoon: {
            Cut: [
                "You work the blade along a seam in TargetRestraint, pressing against its woven layers.",
                "You cut through the last seam of TargetRestraint. The outer cocoon falls open.",
            ],
            Struggle: [
                "You press against TargetRestraint. Shallow folds rise along the cocoon.",
                "You pull open the outer shell of TargetRestraint and gather the loose silk.",
            ],
            Remove: [
                "You pick at the edge of TargetRestraint, trying to separate its clinging layers.",
                "You peel open the outer shell of TargetRestraint and gather the loosened cocoon.",
            ],
        },
    };
    const OUTER_GAG_TAG = "SpiderlingsWebbingLv2OuterGag";
    const INNER_STUFFING_TAG = "SpiderlingsWebbingLv2InnerStuffing";
    const MANUAL_NORMALIZE_EVENT = "SpiderlingsNormalizeManualChain";
    const FINAL_ESCAPE_EVENT = "SpiderlingsFinalEscapeOutcome";
    const ESCAPE_SOUND_EVENT = "SpiderlingsWebbingEscapeSound";
    const PAIRED_OUTER_GATE_MESSAGE_KEY = "KinkyDungeonSpiderlingsWebbingLv1Covered";
    const PAIRED_OUTER_GATE_MESSAGE_FALLBACK = "To reach TargetLv1, first remove TargetLv2.";
    const PAIRED_OUTER_GATE_MARKER = "SpiderlingsPairedOuterLayerGate";
    const EXTERNAL_UNLINK_MARKER = "SpiderlingsPreserveUnlinkedExternal";
    const ESCAPE_SOUNDS = Object.freeze([
        "Sounds/webs-sweep-away-by-hand-001_01.ogg",
        "Sounds/webs-sweep-away-by-hand-002_01.ogg",
        "Sounds/webs-sweep-away-by-hand-003_01.ogg",
        "Sounds/webs-sweep-away-by-hand-004_01.ogg",
    ]);
    const ENEMY_BIND_EFFECT = "SpiderlingsWebbingEnemyBind";
    const PLAYER_HIT_DAMAGE_EVENT = "SpiderlingsWebbingPlayerHitDamage";
    const WEBSPRAY_EFFECT = "SpiderlingsWebSprayHit";
    const WEBSPRAY_PROVENANCE = "WebCaster.WebSpray";
    const WEBSPRAY_SLOW_BUFF = "SpiderlingsWebSpraySlow";
    const WEBSPRAY_MAX_STACKS = 5;
    const WEBSPRAY_INACTIVITY_TURNS = 7;
    const CLOSED_TAGS = Object.freeze(["FeetLinked", "BlockKneel", "BlockHogtie"]);
    const ENEMY_PROFILES = Object.freeze({
        Spinner: Object.freeze([0.25, 0.25, 0.25, 0.25, 2, 1, 1, 0.25, 0.25, 0.25, 0.25]),
        Jumper: Object.freeze([1, 1, 1, 2, 3, 3, 3, 1, 1, 1, 1]),
        WebCaster: Object.freeze([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
        MageSpiderlings: Object.freeze([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
    });
    const FAMILY_GROUPS = Object.freeze({
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
    const FAMILY_DATA = Object.freeze([
        Object.freeze({
            family: "Arm",
            group: "ItemArms",
            mechanics: Object.freeze({ bindarms: true }),
            shrine: Object.freeze(["Wristties"]),
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Arm Bonds",
                    "A few silk strands hold your wrists together behind your back.",
                    "When you turn a wrist, the loose threads draw across your skin.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Arm Bonds",
                    "Interwoven silk forms snug bands around your wrists and arms.",
                    "Overlapping strands follow your arms and pull together when you shift.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Arm Bonds",
                    "Dense silk wraps your arms together behind your back. Its layers cover the knots at your wrists.",
                    "The gaps have closed. Small folds rise along the silk when you twist.",
                ]),
            }),
        }),
        Object.freeze({
            family: "MittenLeft",
            group: "ItemHands",
            linkFamily: "Mittens",
            mechanics: Object.freeze({ bindhands: 0.5, bypass: true }),
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Mitten · Left",
                    "A thin silk mitten gathers the fingers of your left hand together.",
                    "Soft fibers brush your fingertips. A few threads hang from the cuff.",
                ]),
            }),
        }),
        Object.freeze({
            family: "MittenRight",
            group: "ItemHands",
            linkFamily: "Mittens",
            mechanics: Object.freeze({ bindhands: 0.5, bypass: true }),
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Mitten · Right",
                    "A thin silk mitten wraps the fingers of your right hand together.",
                    "Threads run across your knuckles and crease when you try to bend your fingers.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Belly",
            group: "ItemTorso",
            // 5.4.92's Harness slot predates the separate WaistBelts tag in 5.5.
            shrine: ["Harnesses", "WaistBelts"],
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Belly Wrap",
                    "A narrow silk band rests against your lower belly.",
                    "Loose fibers fringe the band and stir with your breath.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Belly Wrap",
                    "Overlapping silk bands cover your lower belly in a soft wrap.",
                    "Each band lies against the next, with loose threads along your waist.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Belly Wrap",
                    "Dense layers of silk cover the curve of your belly.",
                    "The separate bands have joined. Shallow folds follow each bend of your body.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Legs",
            group: "ItemLegs",
            addTag: CLOSED_TAGS,
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Leg Bindings",
                    "Sparse silk strands cross your joined legs.",
                    "Your legs show through the open mesh. The strands quiver when you shift.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Leg Bindings",
                    "Silk bands overlap along your legs and weave across the space between them.",
                    "Small folds gather where the bands cross your knees.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Leg Bindings",
                    "Dense silk encloses your joined legs, covering the gaps in the mesh.",
                    "The silk forms one outline around both legs. Its surface wrinkles when you try to move them.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Ankles",
            group: "ItemFeet",
            addTag: CLOSED_TAGS,
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Ankle Bonds",
                    "A few silk strands circle your ankles and cross between your feet.",
                    "Each shift of your ankles tugs at the threads between them.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Ankle Bonds",
                    "Overlapping silk bands wrap your ankles and fill the open mesh.",
                    "Soft fibers fringe the bands where they curve around your ankles.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Ankle Bonds",
                    "Dense silk wraps both ankles in one covering. The gaps between the bands have closed.",
                    "The silk creases at the sides of your ankles when you move.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Foot",
            group: "ItemBoots",
            addTag: CLOSED_TAGS,
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Foot Wrap",
                    "Thin silk wraps your joined feet.",
                    "Your toes show beneath the mesh stretched across your insteps.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Foot Wrap",
                    "Layers of silk cover your insteps and wrap around both feet.",
                    "Overlapping threads make small ridges above your toes.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Foot Wrap",
                    "Dense silk encloses both feet, filling the gaps over your insteps.",
                    "The woven surface follows the shape of your feet, held together beneath it.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Blindfold",
            group: "ItemHead",
            stageMechanics: Object.freeze({
                Lv1: Object.freeze({ blindfold: 1 }),
                Lv3: Object.freeze({ blindfold: 2 }),
            }),
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Blindfold",
                    "A thin silk veil covers your eyes. Light filters through, but distant shapes blur.",
                    "Stray threads brush your cheeks when you turn your head.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Blindfold",
                    "Dense silk covers your eyes and joins the blindfold's edges.",
                    "The silk rests against your brow and cheeks, shifting with your head.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Stuffing",
            group: "ItemMouth",
            mechanics: Object.freeze({ gag: 0.1, alwaysRender: true, alwaysAccessible: true }),
            shrine: Object.freeze([INNER_STUFFING_TAG]),
            linkableBy: Object.freeze([OUTER_GAG_TAG]),
            renderWhenLinked: Object.freeze([OUTER_GAG_TAG]),
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Mouth Stuffing",
                    "A soft wad of silk fills your mouth and muffles your words.",
                    "Loose fibers tremble behind your lips when you try to speak.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Gag",
            group: "ItemMouth",
            stageMechanics: Object.freeze({
                Lv1: Object.freeze({ gag: 0.15 }),
                Lv3: Object.freeze({ gag: 0.5 }),
            }),
            shrine: Object.freeze([OUTER_GAG_TAG]),
            linkableBy: Object.freeze([INNER_STUFFING_TAG]),
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Gag",
                    "A silk band covers your mouth and muffles your speech.",
                    "Threads extend from the corners of your mouth across your cheeks.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Gag",
                    "Overlapping silk layers cover your mouth.",
                    "The seams beside your lips have closed. Muffled sounds stir the silk.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Hood",
            group: "ItemHead",
            mechanics: Object.freeze({ blindfold: 4, gag: 1 }),
            text: Object.freeze({
                Lv3: Object.freeze([
                    "Dense Silken Hood",
                    "Opaque silk wraps your whole head in a snug hood.",
                    "The silk covers your hair and face. Small folds shift when you turn your head.",
                ]),
            }),
        }),
    ]);

    api.WebbingData = Object.freeze({
        LV1_FAMILIES,
        LV2_FAMILIES,
        LV3_FAMILIES,
        PROFILE_FAMILIES,
        ARM_ID,
        COCOON_ID,
        COCOON_MODEL_ID,
        COCOON_APPLY_EVENT,
        COCOON_ESCAPE_EVENT,
        COCOON_OUTER_STATE,
        COCOON_OUTER_POSE,
        COCOON_STRUGGLE_WINDOW,
        COCOON_STRUGGLE_THRESHOLD,
        VIGIL_STATE,
        VIGIL_IDLE_TURNS,
        COCOON_ANCHORED_MESSAGE,
        COCOON_ANCHORED_FALLBACK,
        COCOON_REPAIR_AMOUNT,
        ESCAPE_PROFILES,
        COCOON_COST_MULT,
        ESCAPE_METHODS,
        ESCAPE_TEXT,
        OUTER_GAG_TAG,
        INNER_STUFFING_TAG,
        MANUAL_NORMALIZE_EVENT,
        FINAL_ESCAPE_EVENT,
        ESCAPE_SOUND_EVENT,
        PAIRED_OUTER_GATE_MESSAGE_KEY,
        PAIRED_OUTER_GATE_MESSAGE_FALLBACK,
        PAIRED_OUTER_GATE_MARKER,
        EXTERNAL_UNLINK_MARKER,
        ESCAPE_SOUNDS,
        ENEMY_BIND_EFFECT,
        PLAYER_HIT_DAMAGE_EVENT,
        WEBSPRAY_EFFECT,
        WEBSPRAY_PROVENANCE,
        WEBSPRAY_SLOW_BUFF,
        WEBSPRAY_MAX_STACKS,
        WEBSPRAY_INACTIVITY_TURNS,
        CLOSED_TAGS,
        ENEMY_PROFILES,
        FAMILY_GROUPS,
        FAMILY_DATA,
    });
})();
