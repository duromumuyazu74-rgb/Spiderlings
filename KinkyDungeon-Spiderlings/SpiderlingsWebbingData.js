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
        "The spiderlings lay webs around the cocoon, securing it in place. You cannot move while they hold it there.";
    const LV2_ESCAPE_EVENT = "SpiderlingsLv2Escape";
    const LV3_ESCAPE_EVENT = "SpiderlingsLv3Escape";
    const COCOON_REPAIR_AMOUNT = 0.1;
    const COCOON_ESCAPE_ACTIONS = Object.freeze({ Cut: 40, Struggle: 50, Remove: 50 });
    const COCOON_ESCAPE_CHANCE = Object.freeze({ Cut: 0.025, Struggle: 0.02, Remove: 0.02 });
    const COCOON_ESCAPE_GATE_PENALTY = 100;
    const LV1_ESCAPE_CHANCE = 100;
    const ESCAPE_METHODS = Object.freeze(["Cut", "Struggle", "Remove"]);
    const ESCAPE_TEXT = {
        SpiderlingsWebbing: {
            Cut: [
                "You cut carefully along a seam in TargetRestraint. A few threads part, extending the opening a little further.",
                "You cut the last connecting threads of TargetRestraint, letting the fragments of silk fall gently away.",
            ],
            Struggle: [
                "You push against TargetRestraint. The strands ease apart with your movements, widening the gaps in the weave.",
                "You pull free of the last clinging threads of TargetRestraint and gather the loosened silk.",
            ],
            Remove: [
                "You tease apart the clinging threads of TargetRestraint, slowly lifting a small patch of the weave.",
                "You peel away TargetRestraint, gathering the loosened threads together.",
            ],
        },
        SpiderlingsCocoon: {
            Cut: [
                "You continue cutting along a seam in TargetRestraint. Threads part in the cocoon wall, and the soft edges fall back.",
                "You cut through the last seam of TargetRestraint, and the severed cocoon layers slowly fall away.",
            ],
            Struggle: [
                "You press outward against TargetRestraint. Shallow folds form in the cocoon as more strands loosen inside.",
                "You widen the opening in TargetRestraint and slip out of the softened layers, gathering the loose silk.",
            ],
            Remove: [
                "You slowly peel back the edge of TargetRestraint, parting the clinging layers a little further.",
                "You peel open TargetRestraint and slip out of the loosened silk, gathering up the freed cocoon.",
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
    const ESCAPE_PROGRESS_KEY = "SpiderlingsEscapeActions";
    const ENEMY_BIND_EFFECT = "SpiderlingsWebbingEnemyBind";
    const PLAYER_HIT_DAMAGE_EVENT = "SpiderlingsWebbingPlayerHitDamage";
    const WEBSPRAY_EFFECT = "SpiderlingsWebSprayHit";
    const WEBSPRAY_PROVENANCE = "WebCaster.WebSpray";
    const WEBSPRAY_SLOW_BUFF = "SpiderlingsWebSpraySlow";
    const WEBSPRAY_MAX_STACKS = 5;
    const WEBSPRAY_INACTIVITY_TURNS = 7;
    const CLOSED_TAGS = Object.freeze(["FeetLinked", "BlockKneel", "BlockHogtie"]);
    const ENEMY_PROFILES = Object.freeze({
        Spinner: Object.freeze([0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0]),
        Jumper: Object.freeze([1, 1, 1, 2, 3, 3, 3, 1, 1, 1, 1]),
        WebCaster: Object.freeze([2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2]),
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
                    "A few pliant strands wind around your wrists, holding your arms together behind you.",
                    "Small gaps remain between the strands; a turn of your wrist gently draws the threads along with it.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Arm Bonds",
                    "Silk interweaves around your wrists and arms, turning the scattered strands into close-fitting bands.",
                    "The bands follow the curves of your arms, their overlapping threads moving together as you shift.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Arm Bonds",
                    "Densely woven silk wraps your arms together behind you, gathering the knots at your wrists into a smooth layer.",
                    "The silk follows your arms, forming shallow folds as you twist; the earlier gaps are woven closed.",
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
                    "A thin layer of silk settles over your left hand, gathering its fingers into a soft covering.",
                    "Your fingertips rest against fluffy fibers, while a few fine threads hang from the cuff.",
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
                    "Thin silk follows the outline of your right hand, wrapping its fingers together.",
                    "Threads curve from the back of your hand toward your palm, rising in small folds as your knuckles move.",
                ]),
            }),
        }),
        Object.freeze({
            family: "Belly",
            group: "ItemTorso",
            text: Object.freeze({
                Lv1: Object.freeze([
                    "Silken Belly Wrap",
                    "A narrow band of pliant silk rests against your lower belly.",
                    "Soft fibers fringe the band, stirring gently with the rise and fall of your body.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Belly Wrap",
                    "Silk lies in layers over your lower belly, weaving the narrow band into a thick, soft wrap.",
                    "Fresh threads follow the existing weave, their soft edges reaching toward your waist.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Belly Wrap",
                    "Fine silk lies in dense layers, following the curve of your belly in a continuous covering.",
                    "The weave blends into a smooth surface, forming soft, shallow folds as your body moves.",
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
                    "Sparse strands cross your joined legs, forming a delicate mesh between them.",
                    "The outlines of your legs show through the open weave; nearby strands quiver together as you shift.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Leg Bindings",
                    "Layers of silk settle over your legs, weaving the space between them into a continuous mesh.",
                    "The weave grows finer, and the overlapping bands form soft folds as your legs shift.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Leg Bindings",
                    "Densely woven silk fully wraps your joined legs, closing each opening in the mesh between them.",
                    "Both legs share a single silken outline, the close layers rising and falling slightly with your movements.",
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
                    "A few soft strands cross around your ankles, forming an open mesh between your feet.",
                    "A small shift of your ankles gently draws the fine threads with it.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Ankle Bonds",
                    "Silk circles your ankles in layers, weaving the open mesh into close-fitting bands.",
                    "Overlapping strands follow the curves of your ankles, with soft fibers fringing their edges.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Ankle Bonds",
                    "Densely woven silk wraps both ankles in one covering, neatly closing the gaps between the bands.",
                    "The silk lies smoothly against your ankles, forming shallow folds as they move.",
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
                    "Thin silk wraps your joined feet, settling into a single covering along their edges.",
                    "Fine strands lie across your insteps, leaving the outline of your toes visible beneath the weave.",
                ]),
                Lv2: Object.freeze([
                    "Woven Silken Foot Wrap",
                    "Silk lies in layers around your feet, wrapping their insteps and edges in a thick, soft weave.",
                    "The outlines of your toes soften beneath the silk, whose surface carries delicate overlapping ridges.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Foot Wrap",
                    "Layers of silk follow both feet, wrapping their insteps and edges in a dense weave.",
                    "Fine strands form a smooth covering, softly tracing the shape of your feet held together.",
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
                    "A thin veil of silk lies over your eyes, softening the light and blurring distant shapes.",
                    "The edges rest beside your eyes, and stray threads brush your cheeks as you turn your head.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Blindfold",
                    "Thick, soft silk covers your eyes, weaving the edges of the blindfold into a single layer.",
                    "Fine threads lie smoothly beside your eyes and cheeks, the covering moving with each turn of your head.",
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
                    "A soft wad of silk rests in your mouth, making your words quiet and indistinct.",
                    "Fluffy fibers rest behind your lips, trembling softly with each muffled word.",
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
                    "A pliant band of silk covers your mouth, muffling your speech into quiet sounds.",
                    "Threads follow the corners of your mouth onto your cheeks, their neatly layered edges still showing the weave.",
                ]),
                Lv3: Object.freeze([
                    "Dense Silken Gag",
                    "Layers of silk settle over your mouth, weaving the overlapping mesh into a thick, soft covering.",
                    "The seams beside your lips are woven closed; muffled sounds pass through the silk, gently stirring its surface.",
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
                    "Dense, opaque silk follows the outline of your head from the crown down, wrapping it fully in a close-fitting hood.",
                    "Hair and features lie beneath the smooth silk, whose soft folds shift as you turn your head.",
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
        LV2_ESCAPE_EVENT,
        LV3_ESCAPE_EVENT,
        COCOON_REPAIR_AMOUNT,
        COCOON_ESCAPE_ACTIONS,
        COCOON_ESCAPE_CHANCE,
        COCOON_ESCAPE_GATE_PENALTY,
        LV1_ESCAPE_CHANCE,
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
        ESCAPE_PROGRESS_KEY,
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
