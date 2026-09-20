"use strict";

// Shared Spiderlings Webbing action resolver with narrow KD registration/debug effects.
(() => {
    const api = globalThis.Spiderlings = globalThis.Spiderlings || {};
    const LV1_FAMILIES = Object.freeze(["Arm", "MittenLeft", "MittenRight", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Stuffing", "Gag"]);
    const LV2_FAMILIES = Object.freeze(["Arm", "Belly", "Legs", "Ankles", "Foot"]);
    const LV3_FAMILIES = Object.freeze(["Arm", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Gag", "Hood"]);
    const PROFILE_FAMILIES = Object.freeze(["Arm", "MittenLeft", "MittenRight", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Stuffing", "Gag", "Hood"]);
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
    const COCOON_ANCHORED_FALLBACK = "The spiderlings lay webs around the cocoon, securing it in place. You cannot move while they hold it there.";
    const LV2_ESCAPE_EVENT = "SpiderlingsLv2Escape";
    const LV3_ESCAPE_EVENT = "SpiderlingsLv3Escape";
    const COCOON_REPAIR_AMOUNT = 0.10;
    const COCOON_ESCAPE_ACTIONS = Object.freeze({Cut: 40, Struggle: 50, Remove: 50});
    const COCOON_ESCAPE_CHANCE = Object.freeze({Cut: 0.025, Struggle: 0.02, Remove: 0.02});
    const COCOON_ESCAPE_GATE_PENALTY = 100;
    const LV1_ESCAPE_CHANCE = 100;
    const ESCAPE_METHODS = Object.freeze(["Cut", "Struggle", "Remove"]);
    const ESCAPE_TEXT = {
        SpiderlingsWebbing: {
            Cut: ["You cut carefully along a seam in TargetRestraint. A few threads part, extending the opening a little further.",
                "You cut the last connecting threads of TargetRestraint, letting the fragments of silk fall gently away."],
            Struggle: ["You push against TargetRestraint. The strands ease apart with your movements, widening the gaps in the weave.",
                "You pull free of the last clinging threads of TargetRestraint and gather the loosened silk."],
            Remove: ["You tease apart the clinging threads of TargetRestraint, slowly lifting a small patch of the weave.",
                "You peel away TargetRestraint, gathering the loosened threads together."],
        },
        SpiderlingsCocoon: {
            Cut: ["You continue cutting along a seam in TargetRestraint. Threads part in the cocoon wall, and the soft edges fall back.",
                "You cut through the last seam of TargetRestraint, and the severed cocoon layers slowly fall away."],
            Struggle: ["You press outward against TargetRestraint. Shallow folds form in the cocoon as more strands loosen inside.",
                "You widen the opening in TargetRestraint and slip out of the softened layers, gathering the loose silk."],
            Remove: ["You slowly peel back the edge of TargetRestraint, parting the clinging layers a little further.",
                "You peel open TargetRestraint and slip out of the loosened silk, gathering up the freed cocoon."],
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
        Spinner: Object.freeze([3, 3, 3, 3, 2, 1, 1, 3, 3, 3, 3]),
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
            mechanics: Object.freeze({bindarms: true}),
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
            mechanics: Object.freeze({bindhands: 0.5, bypass: true}),
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
            mechanics: Object.freeze({bindhands: 0.5, bypass: true}),
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
                Lv1: Object.freeze({blindfold: 1}),
                Lv3: Object.freeze({blindfold: 2}),
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
            mechanics: Object.freeze({gag: 0.1, alwaysRender: true, alwaysAccessible: true}),
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
                Lv1: Object.freeze({gag: 0.15}),
                Lv3: Object.freeze({gag: 0.5}),
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
            mechanics: Object.freeze({blindfold: 4, gag: 1}),
            text: Object.freeze({
                Lv3: Object.freeze([
                    "Dense Silken Hood",
                    "Dense, opaque silk follows the outline of your head from the crown down, wrapping it fully in a close-fitting hood.",
                    "Hair and features lie beneath the smooth silk, whose soft folds shift as you turn your head.",
                ]),
            }),
        }),
    ]);
    const pendingManualNormalizationGroups = new Set();
    const pendingCountedEscapes = new WeakMap();
    let manualNormalizationQueued = false;
    let runtimeWebSprayState = emptyWebSprayState();
    let runtimeWebSprayTurn = 0;
    let crossfireMark = null;
    let crossfireBonusTurn = null;
    const CROSS_FIRE_MESSAGE = "KinkyDungeonSpiderlingsWebbingInterwoven";
    const CROSS_FIRE_FALLBACK = "Two strands interweave against your body, binding another part of it.";

    function emptyWebSprayState() {
        return {stacks: 0, inactiveTurns: 0, lastTriggerTurn: null, lastTrailTurn: null};
    }

    function normalizedWebSprayState(state) {
        const source = state || {};
        return {
            stacks: Math.max(0, Math.min(WEBSPRAY_MAX_STACKS, Math.floor(Number(source.stacks) || 0))),
            inactiveTurns: Math.max(0, Number(source.inactiveTurns) || 0),
            lastTriggerTurn: source.lastTriggerTurn == null ? null : source.lastTriggerTurn,
            lastTrailTurn: source.lastTrailTurn == null ? null : source.lastTrailTurn,
        };
    }

    function restraintById(id) {
        if (typeof KinkyDungeonGetRestraintByName == "function") return KinkyDungeonGetRestraintByName(id);
        return Array.isArray(globalThis.KinkyDungeonRestraints)
            ? KinkyDungeonRestraints.find((restraint) => restraint.name == id)
            : undefined;
    }

    function equippedItem(id) {
        if (typeof KinkyDungeonAllRestraintDynamic == "function") {
            try {
                for (const entry of KinkyDungeonAllRestraintDynamic()) {
                    const item = entry && (entry.item || entry);
                    if (item && item.name == id) return item;
                }
            } catch (_error) {
                // The group lookup below is the KD 5.5-compatible fallback.
            }
        }
        const restraint = restraintById(id);
        if (!restraint || typeof KinkyDungeonGetRestraintItem != "function") return undefined;
        let item = KinkyDungeonGetRestraintItem(restraint.Group);
        while (item) {
            if (item.name == id) return item;
            item = item.dynamicLink;
        }
        return undefined;
    }

    function chainFrom(root) {
        const result = [];
        const seen = new Set();
        let item = root;
        while (item && !seen.has(item)) {
            seen.add(item);
            result.push(item);
            item = item.dynamicLink;
        }
        return result;
    }

    // Pure resolver data is immutable at runtime; injected test catalogs still receive independent indexes.
    function buildDefaultLifecycleCatalog() {
        const lv1 = FAMILY_DATA.filter((definition) => LV1_FAMILIES.includes(definition.family)).map((definition) => ({
            id: `SpiderlingsWebbingLv1${definition.family}`,
            family: definition.family,
            group: definition.group,
            stage: "Lv1",
            requiredActions: 1,
        }));
        const lv2 = FAMILY_DATA.filter((definition) => LV2_FAMILIES.includes(definition.family)).map((definition) => ({
            id: `SpiderlingsWebbingLv2${definition.family}`,
            family: definition.family,
            group: definition.group,
            stage: "Lv2",
            requiredActions: 2,
        }));
        const lv3 = FAMILY_DATA.filter((definition) => LV3_FAMILIES.includes(definition.family)).map((definition) => ({
            id: `SpiderlingsWebbingLv3${definition.family}`,
            family: definition.family,
            group: definition.group,
            stage: "Lv3",
            requiredActions: 2,
        }));
        return [...lv1, ...lv2, ...lv3, {
            id: COCOON_ID,
            family: "Cocoon",
            group: "ItemDevices",
            stage: "Cocoon",
            requiredActionsByMethod: COCOON_ESCAPE_ACTIONS,
        }];
    }

    function catalogDescriptorMap(catalog) {
        return new Map((catalog || []).map((entry) => {
            const restraint = entry && entry.restraint;
            const id = entry && (entry.id || (restraint && restraint.name));
            const family = entry && (entry.family || entry.module);
            const group = entry && (entry.group || (restraint && restraint.Group) || FAMILY_GROUPS[family]);
            return [id, {...entry, id, family, group}];
        }).filter(([id]) => id));
    }

    const DEFAULT_LIFECYCLE_CATALOG = Object.freeze(buildDefaultLifecycleCatalog().map(Object.freeze));
    const DEFAULT_DESCRIPTOR_MAP = catalogDescriptorMap(DEFAULT_LIFECYCLE_CATALOG);

    function defaultLifecycleCatalog() {
        return DEFAULT_LIFECYCLE_CATALOG;
    }

    function descriptorMapFor(catalog) {
        return !catalog || catalog === DEFAULT_LIFECYCLE_CATALOG
            ? DEFAULT_DESCRIPTOR_MAP
            : catalogDescriptorMap(catalog);
    }

    function pairedOuterLayerFor(item) {
        const descriptor = DEFAULT_DESCRIPTOR_MAP.get(item && item.name);
        if (!descriptor || !stageNumber(descriptor.stage)
            || typeof KinkyDungeonGetRestraintItem != "function") return undefined;
        // Cocoon is the outermost action gate across all Webbing groups.
        const cocoon = chainFrom(KinkyDungeonGetRestraintItem("ItemDevices")).find(candidate => candidate.name == COCOON_ID);
        if (cocoon) return cocoon;
        const rank = innerRank(descriptor, descriptor.group);
        return chainFrom(KinkyDungeonGetRestraintItem(descriptor.group)).find((candidate) => {
            const outer = DEFAULT_DESCRIPTOR_MAP.get(candidate && candidate.name);
            return outer && outer.group == descriptor.group
                && innerRank(outer, descriptor.group) > rank
                && (outer.family == descriptor.family || outer.stage == "Lv3");
        });
    }

    function isSpiderlingsRestraint(item) {
        return !!(item && DEFAULT_DESCRIPTOR_MAP.has(item.name));
    }

    function stageNumber(stage) {
        if (stage === 1 || stage == "Lv1") return 1;
        if (stage === 2 || stage == "Lv2") return 2;
        if (stage === 3 || stage == "Lv3") return 3;
        return undefined;
    }

    function innerRank(descriptor, group) {
        const stage = descriptor && stageNumber(descriptor.stage);
        if (!descriptor || !stage || descriptor.group != group) return undefined;
        if (group == "ItemMouth") {
            const ranks = {"1:Stuffing": 0, "1:Gag": 1, "3:Gag": 2};
            return ranks[`${stage}:${descriptor.family}`];
        }
        if (group == "ItemHead") {
            const ranks = {"1:Blindfold": 0, "3:Blindfold": 1, "3:Hood": 2};
            return ranks[`${stage}:${descriptor.family}`];
        }
        if (group == "ItemHands") {
            const ranks = {"1:MittenLeft": 0, "1:MittenRight": 1};
            return ranks[`${stage}:${descriptor.family}`];
        }
        return stage - 1;
    }

    function stageFamilies(stage) {
        return stageNumber(stage) == 3 ? LV3_FAMILIES : stageNumber(stage) == 2 ? LV2_FAMILIES : LV1_FAMILIES;
    }

    function completeStageCatalog(descriptors, stage) {
        const requiredFamilies = stageFamilies(stage);
        const byFamily = new Map();
        for (const descriptor of descriptors.values()) {
            if (stageNumber(descriptor.stage) == stage && requiredFamilies.includes(descriptor.family)) {
                byFamily.set(descriptor.family, descriptor);
            }
        }
        return requiredFamilies.every((family) => byFamily.has(family)) ? byFamily : undefined;
    }

    function snapshotFlag(flags, id) {
        if (!flags) return true;
        if (typeof flags.get == "function") return flags.get(id) !== false;
        return flags[id] !== false;
    }

    function physicalCompletion(descriptors, snapshot) {
        const names = new Set((snapshot.items || []).map((item) => item && item.name).filter(Boolean));
        const complete = (stage) => {
            const catalog = completeStageCatalog(descriptors, stage);
            return !!catalog && stageFamilies(stage).every((family) => names.has(catalog.get(family).id));
        };
        return {names, lv1Complete: complete(1), lv2Complete: complete(2), lv3Complete: complete(3)};
    }

    function sourceAllowsDirectCocoon(source) {
        if (!source) return false;
        if (source.kind == "enemy") return ["Spinner", "Jumper", "WebCaster"].includes(source.name);
        return source.kind == "webSpray"
            && source.provenance == WEBSPRAY_PROVENANCE
            && source.triggerSource == "direct";
    }

    function cocoonRepairDecision(item, source) {
        const cutProgress = Math.max(0, Number(item && item.cutProgress || 0));
        const struggleProgress = Math.max(0, Number(item && item.struggleProgress || 0));
        const totalProgress = cutProgress + struggleProgress;
        const repairAmount = Math.min(COCOON_REPAIR_AMOUNT, totalProgress);
        const remaining = Math.max(0, totalProgress - repairAmount);
        const factor = totalProgress > 0 ? remaining / totalProgress : 0;
        return {
            progressed: repairAmount > 0,
            reason: repairAmount > 0 ? "cocoon-repaired" : "cocoon-intact",
            source,
            cocoonRepair: {
                repairAmount,
                cutProgress: cutProgress * factor,
                struggleProgress: struggleProgress * factor,
            },
        };
    }

    function enemyBindResolution(descriptors, snapshot, action) {
        const profileName = typeof action.profile == "string" ? action.profile : action.source && action.source.name;
        const weights = Array.isArray(action.profile) ? action.profile : ENEMY_PROFILES[profileName];
        const source = action.source || {kind: "enemy", name: profileName};
        if (!weights || weights.length != PROFILE_FAMILIES.length) {
            return {progressed: false, reason: "unknown-profile", profile: profileName, source};
        }

        const completion = physicalCompletion(descriptors, snapshot);
        const names = completion.names;
        const cocoonItem = (snapshot.items || []).find((item) => item && item.name == COCOON_ID);
        if (cocoonItem) {
            if (!sourceAllowsDirectCocoon(source)) {
                return {progressed: false, reason: "cocoon-source-rejected", profile: profileName, source};
            }
            return {...cocoonRepairDecision(cocoonItem, source), profile: profileName};
        }

        const cocoonDescriptor = descriptors.get(COCOON_ID);
        const preHitSlow = normalizedWebSprayState(snapshot.webSpray).stacks;
        const cocoonGroup = snapshot.groups && snapshot.groups.ItemDevices || [];
        const cocoonCompatible = cocoonDescriptor
            && (!cocoonGroup.some((item) => item && !descriptors.has(item.name))
                || snapshot.externalLinkCompatible?.[COCOON_ID] === true)
            && snapshotFlag(snapshot.registered, COCOON_ID)
            && snapshotFlag(snapshot.poseCompatible, COCOON_ID)
            && snapshotFlag(snapshot.addCompatible, COCOON_ID);
        if (sourceAllowsDirectCocoon(source) && completion.lv3Complete
            && preHitSlow >= WEBSPRAY_MAX_STACKS && cocoonCompatible) {
            return {
                progressed: false,
                reason: "cocoon-selected",
                profile: profileName,
                source,
                selectedId: COCOON_ID,
                family: "Cocoon",
                group: "ItemDevices",
                stage: "Cocoon",
                clearSlowOnApply: true,
            };
        }

        const lv1Catalog = completeStageCatalog(descriptors, 1);
        if (!lv1Catalog) return {progressed: false, reason: "incomplete-lv1-catalog", profile: profileName, source};
        const catalogs = [lv1Catalog, completeStageCatalog(descriptors, 2), completeStageCatalog(descriptors, 3)];

        const eligible = [];
        for (const family of PROFILE_FAMILIES) {
            // Each family contributes only its next layer, with its original weight.
            // Re-read equipment on every hit, including multiple hits in one turn.
            const chain = catalogs.map((catalog) => catalog?.get(family)).filter(Boolean);
            const descriptor = chain.find((entry) => !names.has(entry.id));
            if (!descriptor) continue;
            const stage = stageNumber(descriptor.stage);
            if (chain.some((entry) => stageNumber(entry.stage) > stage && names.has(entry.id))) continue;
            if (stage > 1 && LV2_FAMILIES.includes(family)
                && (!names.has(lv1Catalog.get(family).id)
                    || (stage == 3 && !names.has(catalogs[1]?.get(family)?.id)))) continue;
            const index = PROFILE_FAMILIES.indexOf(family);
            const weight = Number(weights[index] || 0);
            if (!descriptor || !(weight > 0) || names.has(descriptor.id)) continue;
            const groupItems = snapshot.groups && snapshot.groups[descriptor.group] || [];
            if (groupItems.some((item) => item && !descriptors.has(item.name))
                && snapshot.externalLinkCompatible?.[descriptor.id] !== true) continue;
            if (!snapshotFlag(snapshot.registered, descriptor.id)
                || !snapshotFlag(snapshot.poseCompatible, descriptor.id)
                || !snapshotFlag(snapshot.addCompatible, descriptor.id)) continue;

            if (stage == 3 && family == "Hood") {
                if (!["Blindfold", "Gag"].every((inner) => names.has(catalogs[2].get(inner).id))) continue;
            } else if (stage == 1 && family == "Gag") {
                const stuffing = lv1Catalog.get("Stuffing");
                if (!stuffing || !names.has(stuffing.id)) continue;
            } else if (stage == 1 && family == "Stuffing") {
                const gag = lv1Catalog.get("Gag");
                if (gag && names.has(gag.id)) continue;
            }
            eligible.push({descriptor, weight});
        }

        if (!eligible.length) return {progressed: false, reason: "no-eligible-candidate", profile: profileName, source};
        const totalWeight = eligible.reduce((sum, entry) => sum + entry.weight, 0);
        const randomSource = typeof action.random == "function" ? action.random : () => action.random;
        const sampled = Number(randomSource());
        const normalized = Number.isFinite(sampled) ? Math.max(0, Math.min(1, sampled)) : 0;
        const target = normalized >= 1 ? totalWeight : normalized * totalWeight;
        let selected = eligible[eligible.length - 1];
        let cumulative = 0;
        for (const entry of eligible) {
            cumulative += entry.weight;
            if (target < cumulative) {
                selected = entry;
                break;
            }
        }
        return {
            progressed: false,
            reason: "selected",
            profile: profileName,
            source,
            selectedId: selected.descriptor.id,
            family: selected.descriptor.family,
            group: selected.descriptor.group,
            stage: selected.descriptor.stage,
        };
    }

    function resolveWebSprayTrigger(descriptors, snapshot, action) {
        const current = normalizedWebSprayState(snapshot.webSpray);
        const triggerSource = action.triggerSource;
        if (action.provenance != WEBSPRAY_PROVENANCE || !["direct", "trail"].includes(triggerSource)) {
            return {
                nextSnapshot: snapshot,
                outcome: {accepted: false, reason: "invalid-webspray-source", triggerSource, provenance: action.provenance},
            };
        }
        if (triggerSource == "trail" && current.lastTrailTurn === action.turn) {
            return {
                nextSnapshot: snapshot,
                outcome: {accepted: false, reason: "trail-rate-limited", triggerSource, provenance: action.provenance},
            };
        }

        const cocoonItem = (snapshot.items || []).find((item) => item && item.name == COCOON_ID);
        if (cocoonItem) {
            if (triggerSource != "direct") {
                return {
                    nextSnapshot: {...snapshot, webSpray: emptyWebSprayState()},
                    outcome: {
                        accepted: false,
                        reason: "cocoon-trail-rejected",
                        triggerSource,
                        provenance: WEBSPRAY_PROVENANCE,
                        clearSlow: true,
                    },
                };
            }
            const repair = enemyBindResolution(descriptors, snapshot, {
                type: "enemyBind",
                profile: "WebCaster",
                source: {kind: "webSpray", provenance: WEBSPRAY_PROVENANCE, triggerSource},
                random: action.random,
            });
            return {
                nextSnapshot: {...snapshot, webSpray: emptyWebSprayState()},
                outcome: {
                    ...repair,
                    accepted: true,
                    triggerSource,
                    provenance: WEBSPRAY_PROVENANCE,
                    clearSlow: true,
                },
            };
        }

        const progression = enemyBindResolution(descriptors, snapshot, {
            type: "enemyBind",
            profile: "WebCaster",
            source: {kind: "webSpray", provenance: WEBSPRAY_PROVENANCE, triggerSource},
            random: action.random,
        });
        const selectedCocoon = progression.selectedId == COCOON_ID;
        const nextWebSpray = {
            stacks: selectedCocoon ? current.stacks : Math.min(WEBSPRAY_MAX_STACKS, current.stacks + 1),
            inactiveTurns: 0,
            lastTriggerTurn: action.turn,
            lastTrailTurn: triggerSource == "trail" ? action.turn : current.lastTrailTurn,
        };
        return {
            nextSnapshot: {...snapshot, webSpray: nextWebSpray},
            outcome: {
                accepted: true,
                reason: "webspray-triggered",
                triggerSource,
                provenance: WEBSPRAY_PROVENANCE,
                slowStacks: nextWebSpray.stacks,
                progressionReason: progression.reason,
                selectedId: progression.selectedId,
                family: progression.family,
                group: progression.group,
                stage: progression.stage,
                clearSlowOnApply: progression.clearSlowOnApply === true,
            },
        };
    }

    function resolveWebSprayTurn(snapshot, action) {
        const current = normalizedWebSprayState(snapshot.webSpray);
        const delta = Number(action.delta || 0);
        if (!(delta > 0) || current.stacks < 1) {
            return {nextSnapshot: snapshot, outcome: {advanced: false, cleared: false, slowStacks: current.stacks}};
        }
        if (current.lastTriggerTurn === action.turn) {
            const nextWebSpray = {...current, inactiveTurns: 0};
            return {
                nextSnapshot: {...snapshot, webSpray: nextWebSpray},
                outcome: {advanced: true, cleared: false, slowStacks: current.stacks, inactiveTurns: 0},
            };
        }
        const inactiveTurns = current.inactiveTurns + delta;
        if (inactiveTurns >= WEBSPRAY_INACTIVITY_TURNS) {
            return {
                nextSnapshot: {...snapshot, webSpray: emptyWebSprayState()},
                outcome: {advanced: true, cleared: true, slowStacks: 0, inactiveTurns: 0},
            };
        }
        const nextWebSpray = {...current, inactiveTurns};
        return {
            nextSnapshot: {...snapshot, webSpray: nextWebSpray},
            outcome: {advanced: true, cleared: false, slowStacks: current.stacks, inactiveTurns},
        };
    }

    function resolveWebbingAction(request = {}) {
        const catalog = request.catalog || defaultLifecycleCatalog();
        const descriptors = descriptorMapFor(catalog);
        const snapshot = request.snapshot || {};
        const action = request.action || {};

        if (action.type == "webSprayTrigger") return resolveWebSprayTrigger(descriptors, snapshot, action);
        if (action.type == "webSprayTurnElapsed") return resolveWebSprayTurn(snapshot, action);
        if (action.type == "clearWebSpray") {
            return {
                nextSnapshot: {...snapshot, webSpray: emptyWebSprayState()},
                outcome: {cleared: true, slowStacks: 0, reason: action.reason || "explicit-clear"},
            };
        }

        if (action.type == "enemyBind") {
            return {nextSnapshot: snapshot, outcome: enemyBindResolution(descriptors, snapshot, action)};
        }

        if (action.type == "inspectPhysical") {
            const names = new Set((snapshot.items || []).map((item) => item && item.name).filter(Boolean));
            const present = [...descriptors.values()].filter((descriptor) => names.has(descriptor.id));
            const lv1Families = new Set(present
                .filter((descriptor) => stageNumber(descriptor.stage) == 1 && LV1_FAMILIES.includes(descriptor.family))
                .map((descriptor) => descriptor.family));
            const lv2Families = new Set(present
                .filter((descriptor) => stageNumber(descriptor.stage) == 2 && LV2_FAMILIES.includes(descriptor.family))
                .map((descriptor) => descriptor.family));
            const lv3Families = new Set(present
                .filter((descriptor) => stageNumber(descriptor.stage) == 3 && LV3_FAMILIES.includes(descriptor.family))
                .map((descriptor) => descriptor.family));
            const lv1Count = lv1Families.size;
            const lv2Count = lv2Families.size;
            const lv3Count = lv3Families.size;
            const cocoonPresent = present.some((descriptor) => descriptor.stage == "Cocoon" || descriptor.family == "Cocoon");
            return {
                nextSnapshot: snapshot,
                outcome: {
                    lv1Count,
                    lv2Count,
                    lv3Count,
                    physicalInnerCount: lv1Count + lv2Count + lv3Count,
                    cocoonPresent,
                    lv1Complete: lv1Count == LV1_FAMILIES.length,
                    lv2Complete: lv2Count == LV2_FAMILIES.length,
                    lv3Complete: lv3Count == LV3_FAMILIES.length,
                    terminalLayerCount: lv1Count + lv2Count + lv3Count + (cocoonPresent ? 1 : 0),
                },
            };
        }

        if (action.type == "manualEquipResult") {
            if (action.accepted !== true) {
                return {nextSnapshot: snapshot, outcome: {normalized: false, changed: false, reason: "native-rejected"}};
            }
            const group = action.group;
            const current = (snapshot.groups && snapshot.groups[group]) || [];
            const ranked = current.map((item) => {
                const descriptor = descriptors.get(item && item.name);
                return {item, rank: innerRank(descriptor, group)};
            });
            if (ranked.some((entry) => entry.rank === undefined)) {
                return {nextSnapshot: snapshot, outcome: {normalized: false, changed: false, group, reason: "external-item"}};
            }
            const ordered = ranked.slice().sort((left, right) => left.rank - right.rank).map((entry) => entry.item);
            const changed = ordered.some((item, index) => item != current[index]);
            const nextSnapshot = {
                ...snapshot,
                groups: {...(snapshot.groups || {}), [group]: ordered},
            };
            return {nextSnapshot, outcome: {normalized: true, changed, group, orderedInnerToOuter: ordered}};
        }

        if (action.type == "escapeAttempt") {
            const item = action.item;
            const descriptor = descriptors.get(item && item.name);
            if (!descriptor) return {nextSnapshot: snapshot, outcome: {completed: false, progressed: false, reason: "not-owned"}};
            if (!ESCAPE_METHODS.includes(action.method)) {
                return {nextSnapshot: snapshot, outcome: {completed: false, progressed: false, reason: "unsupported-method"}};
            }
            if (action.effective !== true) {
                return {nextSnapshot: snapshot, outcome: {completed: false, progressed: false, reason: "blocked"}};
            }
            const stage = stageNumber(descriptor.stage);
            const configuredActions = descriptor.requiredActionsByMethod
                && descriptor.requiredActionsByMethod[action.method] != null
                ? descriptor.requiredActionsByMethod[action.method]
                : descriptor.requiredActions && typeof descriptor.requiredActions == "object"
                    ? descriptor.requiredActions[action.method]
                    : descriptor.requiredActions;
            const requiredActions = Number(configuredActions || stage || 0);
            if (!(requiredActions > 0)) {
                return {nextSnapshot: snapshot, outcome: {completed: false, progressed: false, reason: "unsupported-stage"}};
            }
            const previousActions = Number(action.progress || 0);
            const effectiveActions = Math.min(requiredActions, previousActions + 1);
            const completed = effectiveActions >= requiredActions;
            return {
                nextSnapshot: snapshot,
                outcome: {
                    completed,
                    progressed: true,
                    effectiveActions,
                    requiredActions,
                    method: action.method,
                    keep: completed ? action.method != "Cut" : undefined,
                },
            };
        }

        return {nextSnapshot: snapshot, outcome: {reason: "unsupported-action"}};
    }

    // KD adapter: preserve native item instances while normalizing Spiderlings-owned link order.
    function replaceGroupRoot(group, previousRoot, nextRoot) {
        if (previousRoot == nextRoot) return true;
        if (typeof KinkyDungeonReplaceRestraintRoot == "function") {
            return KinkyDungeonReplaceRestraintRoot(group, previousRoot, nextRoot) !== false;
        }
        if (typeof KinkyDungeonInventory != "undefined" && KinkyDungeonInventory
            && typeof KinkyDungeonInventory.get == "function" && typeof Restraint != "undefined") {
            const equipped = KinkyDungeonInventory.get(Restraint);
            if (equipped && equipped.get(previousRoot.name) == previousRoot) {
                equipped.delete(previousRoot.name);
                equipped.set(nextRoot.name, nextRoot);
                return true;
            }
        }
        return false;
    }

    function refreshNormalizedGroup(root) {
        if (typeof KDUpdateLinkCaches == "function") KDUpdateLinkCaches(root);
        if (typeof KDUpdateItemEventCache != "undefined") KDUpdateItemEventCache = true;
        if (typeof KinkyDungeonUpdateRestraints == "function") {
            const tags = KinkyDungeonUpdateRestraints();
            if (typeof KinkyDungeonPlayerTags != "undefined") KinkyDungeonPlayerTags = tags;
        }
        if (typeof KinkyDungeonCalculateSlowLevel == "function") KinkyDungeonCalculateSlowLevel();
        if (typeof KinkyDungeonUpdateStruggleGroups == "function") KinkyDungeonUpdateStruggleGroups();
        if (api.refreshSpiderlingsPlayerModelSoon) api.refreshSpiderlingsPlayerModelSoon(root);
    }

    function normalizeManualGroup(group) {
        if (typeof KinkyDungeonGetRestraintItem != "function") return {normalized: false, group, reason: "missing-runtime"};
        const previousRoot = KinkyDungeonGetRestraintItem(group);
        if (!previousRoot) return {normalized: true, changed: false, group, root: undefined};
        const currentOuterToInner = chainFrom(previousRoot);
        const currentInnerToOuter = [...currentOuterToInner].reverse();
        const resolution = resolveWebbingAction({
            snapshot: {groups: {[group]: currentInnerToOuter}},
            action: {type: "manualEquipResult", accepted: true, group},
        });
        if (!resolution.outcome.normalized) return {...resolution.outcome, root: previousRoot};
        const ordered = [...resolution.outcome.orderedInnerToOuter].reverse();
        const changed = resolution.outcome.changed;
        if (!changed) return {normalized: true, changed: false, group, root: previousRoot};
        const nextRoot = ordered[0];
        if (!replaceGroupRoot(group, previousRoot, nextRoot)) {
            return {normalized: false, changed: false, group, root: previousRoot, reason: "root-replacement-failed"};
        }
        for (let index = 0; index < ordered.length; index++) ordered[index].dynamicLink = ordered[index + 1];
        refreshNormalizedGroup(nextRoot);
        return {normalized: true, changed: true, group, root: nextRoot};
    }

    function scheduleManualNormalization(group) {
        if (!group) return false;
        pendingManualNormalizationGroups.add(group);
        if (manualNormalizationQueued) return true;
        const flush = () => {
            manualNormalizationQueued = false;
            const groups = [...pendingManualNormalizationGroups];
            pendingManualNormalizationGroups.clear();
            for (const pendingGroup of groups) normalizeManualGroup(pendingGroup);
        };
        manualNormalizationQueued = true;
        if (typeof queueMicrotask == "function") queueMicrotask(flush);
        else if (typeof Promise == "function") Promise.resolve().then(flush);
        else if (typeof setTimeout == "function") setTimeout(flush, 0);
        else {
            manualNormalizationQueued = false;
            pendingManualNormalizationGroups.delete(group);
            return false;
        }
        return true;
    }

    function registerExternalUnlinkPreservation() {
        if (typeof KinkyDungeonUnLinkItem != "function" || typeof KinkyDungeonGetRestraintItem != "function") return false;
        const nativeUnlink = KinkyDungeonUnLinkItem;
        if (nativeUnlink[EXTERNAL_UNLINK_MARKER]) return true;
        const unlinkPreservingExternal = function(item, ...args) {
            const descriptor = DEFAULT_DESCRIPTOR_MAP.get(item && item.name);
            const external = descriptor && item.dynamicLink;
            const definition = external && (typeof KDRestraint == "function" ? KDRestraint(external) : restraintById(external.name));
            const preserve = definition && !DEFAULT_DESCRIPTOR_MAP.has(external.name)
                && KinkyDungeonGetRestraintItem(descriptor.group) === item;
            const result = nativeUnlink.call(this, item, ...args);
            if (preserve && Array.isArray(result) && result.includes(item)) {
                const restored = KinkyDungeonGetRestraintItem(descriptor.group);
                // KD recreates the newly exposed root on unlink, losing its ID and progress.
                // Keep native removal events/item fate, then restore this retained external item.
                if (restored && restored !== external && restored.name === external.name
                    && restored.dynamicLink === external.dynamicLink
                    && replaceGroupRoot(descriptor.group, restored, external)) refreshNormalizedGroup(external);
            }
            return result;
        };
        unlinkPreservingExternal[EXTERNAL_UNLINK_MARKER] = true;
        KinkyDungeonUnLinkItem = unlinkPreservingExternal;
        return true;
    }

    const kdAdapter = Object.freeze({
        equip(id, options = {}) {
            const restraint = restraintById(id);
            if (!restraint || typeof KinkyDungeonAddRestraint != "function") {
                return {applied: false, id, reason: "missing-runtime"};
            }
            if (typeof KDCanAddRestraint == "function"
                && !KDCanAddRestraint(restraint, false, "", false)) {
                return {applied: false, id, reason: "incompatible"};
            }
            const result = KinkyDungeonAddRestraint(
                restraint,
                0,
                false,
                "",
                false,
                false,
                false,
                undefined,
                options.faction,
            );
            const applied = Number(result) > 0 && !!equippedItem(id);
            if (applied) scheduleManualNormalization(restraint.Group);
            if (applied && id == COCOON_ID) clearRuntimeWebSpray("cocoon-equipped");
            return {applied, id, lock: "", tightness: 0};
        },
        remove(item, method) {
            if (!item || typeof KinkyDungeonRemoveRestraintSpecific != "function") return false;
            const keep = method != "Cut";
            const remover = typeof KinkyDungeonPlayerEntity != "undefined" ? KinkyDungeonPlayerEntity : undefined;
            const removed = KinkyDungeonRemoveRestraintSpecific(item, keep, false, false, false, false, remover, false);
            return Array.isArray(removed) ? removed.length > 0 : removed !== false;
        },
    });

    function currentPoseNames() {
        if (typeof KDCurrentModels == "undefined" || !KDCurrentModels || typeof KDCurrentModels.get != "function") return new Set();
        const player = typeof KinkyDungeonPlayer != "undefined" ? KinkyDungeonPlayer
            : typeof KinkyDungeonPlayerEntity != "undefined" ? KinkyDungeonPlayerEntity : undefined;
        const model = player && KDCurrentModels.get(player);
        const poses = model && model.Poses;
        if (!poses) return new Set();
        if (typeof poses.keys == "function") return new Set(poses.keys());
        if (Array.isArray(poses)) return new Set(poses);
        return new Set(Object.keys(poses).filter((pose) => poses[pose]));
    }

    function runtimePoseCompatible(family, poses) {
        if (family == "Stuffing" || family == "Gag" || family == "Blindfold" || family == "Cocoon" || !poses.size) return true;
        if (["Kneel", "KneelClosed", "Hogtie"].some((pose) => poses.has(pose))) return false;
        if (family == "Arm") return poses.has("Closed");
        if (family == "MittenLeft" || family == "MittenRight") return true;
        if (family == "Belly") return poses.has("Closed");
        return poses.has("Closed") || poses.has("Spread");
    }

    function runtimeEquipmentSnapshot() {
        const groups = {};
        const items = [];
        const seen = new Set();
        if (typeof KinkyDungeonGetRestraintItem != "function") return {items, groups};
        for (const group of new Set([...Object.values(FAMILY_GROUPS), "ItemDevices"])) {
            const outerToInner = chainFrom(KinkyDungeonGetRestraintItem(group));
            groups[group] = [...outerToInner].reverse();
            for (const item of outerToInner) {
                if (item && !seen.has(item)) {
                    seen.add(item);
                    items.push(item);
                }
            }
        }
        return {items, groups};
    }

    function runtimeEnemyCatalog() {
        return defaultLifecycleCatalog().map((descriptor) => ({
            ...descriptor,
            restraint: restraintById(descriptor.id),
        }));
    }

    function runtimeEnemySnapshot(catalog, entity) {
        const snapshot = runtimeEquipmentSnapshot();
        const poses = currentPoseNames();
        snapshot.registered = {};
        snapshot.poseCompatible = {};
        snapshot.addCompatible = {};
        snapshot.externalLinkCompatible = {};
        const ownedIds = new Set(catalog.map((descriptor) => descriptor.id));
        for (const descriptor of catalog) {
            const restraint = descriptor.restraint;
            snapshot.registered[descriptor.id] = !!restraint;
            snapshot.poseCompatible[descriptor.id] = runtimePoseCompatible(descriptor.family, poses);
            let compatible = !!restraint;
            if (compatible && typeof KDGetBlockersToAddRestraint == "function") {
                const player = typeof KinkyDungeonPlayerEntity != "undefined" ? KinkyDungeonPlayerEntity : undefined;
                compatible = !(KDGetBlockersToAddRestraint(restraint, player, restraint.bypass === true) || []).length;
            }
            if (compatible && typeof KDCanAddRestraint == "function") {
                const current = typeof KinkyDungeonGetRestraintItem == "function"
                    ? KinkyDungeonGetRestraintItem(restraint.Group) : undefined;
                compatible = KDCanAddRestraint(restraint, false, "", false, current, true, true, entity) === true;
            }
            snapshot.addCompatible[descriptor.id] = compatible;
            // Native no-overpower linking applies to both armour and ordinary restraints.
            // An occupied group is eligible only when no blocker must be removed.
            const externalItems = (snapshot.groups[descriptor.group] || []).filter((item) => item && !ownedIds.has(item.name));
            snapshot.externalLinkCompatible[descriptor.id] = compatible
                && typeof KDGetBlockersToAddRestraint == "function"
                && typeof KDCanAddRestraint == "function"
                && externalItems.length > 0;
        }
        return snapshot;
    }

    function applySelectedRestraint(selectedId, entity, faction) {
        const restraint = selectedId && restraintById(selectedId);
        if (!restraint || typeof KinkyDungeonAddRestraint != "function") return false;
        const added = KinkyDungeonAddRestraint(
            restraint,
            0,
            false,
            "",
            false,
            false,
            false,
            undefined,
            faction,
            false,
            undefined,
            undefined,
            true,
            entity,
        );
        const applied = Number(added) > 0 && !!equippedItem(selectedId);
        if (applied) scheduleManualNormalization(restraint.Group);
        return applied;
    }

    function applyCocoonRepair(outcome, item = equippedItem(COCOON_ID)) {
        const repair = outcome && outcome.cocoonRepair;
        if (!item || !repair) return false;
        const state = item.data && item.data[COCOON_OUTER_STATE];
        const anchored = !state?.anchored && sourceAllowsDirectCocoon(outcome.source)
            && (outcome.source.kind == "webSpray" || outcome.source.name == "WebCaster")
            && (state?.reinforcementPending
                || (state?.attemptAges || []).filter((age) => age >= 0 && age < COCOON_STRUGGLE_WINDOW).length >= COCOON_STRUGGLE_THRESHOLD);
        if (anchored) {
            state.anchored = true;
            delete state.reinforcementPending;
            state.attemptAges = [];
            syncCocoonOuterPose();
            if (api.refreshSpiderlingsPlayerModelSoon) api.refreshSpiderlingsPlayerModelSoon(item);
            const localized = typeof TextGet == "function" ? TextGet(COCOON_ANCHORED_MESSAGE) : COCOON_ANCHORED_MESSAGE;
            if (typeof KinkyDungeonSendActionMessage == "function") KinkyDungeonSendActionMessage(10,
                localized && localized != COCOON_ANCHORED_MESSAGE ? localized : COCOON_ANCHORED_FALLBACK, "orange", 3, true);
        }
        const repaired = Number(repair.repairAmount) > 0;
        if (repaired) {
            item.cutProgress = Math.max(0, Number(repair.cutProgress || 0));
            item.struggleProgress = Math.max(0, Number(repair.struggleProgress || 0));
        }
        return anchored || repaired;
    }

    function syncCocoonOuterPose(character) {
        if (typeof KinkyDungeonPlayer == "undefined" || (character && character !== KinkyDungeonPlayer)
            || typeof KDCurrentModels == "undefined") return;
        const poses = KDCurrentModels.get(KinkyDungeonPlayer)?.Poses;
        if (!poses) return;
        if (equippedItem(COCOON_ID)?.data?.[COCOON_OUTER_STATE]?.anchored) poses[COCOON_OUTER_POSE] = true;
        else delete poses[COCOON_OUTER_POSE];
    }

    function cocoonVigil() {
        if (typeof KDMapData == "undefined") return undefined;
        if (!equippedItem(COCOON_ID)) {
            delete KDMapData[VIGIL_STATE];
            return undefined;
        }
        return KDMapData[VIGIL_STATE] ||= {idleTurns: 0, activityPending: false};
    }

    function needsCocoonReinforcement() {
        const state = equippedItem(COCOON_ID)?.data?.[COCOON_OUTER_STATE];
        return !!state?.reinforcementPending && !state.anchored;
    }

    // Garrison peace counts waiting in a Cocoon independently of the 25-turn
    // movement vigil. tick samples before our vigil handler, while tickAfter
    // samples after KD clears LastAction: recognize both sides of a paid turn.
    function isCocoonPassive() {
        const state = cocoonVigil();
        if (!state || state.activityPending || state.attackSpellPending || needsCocoonReinforcement()) return false;
        const action = typeof KinkyDungeonLastAction == "string" ? KinkyDungeonLastAction : "";
        return action ? action == "Wait" : state.idleTurns > 0;
    }

    function recordCocoonResistance(item = equippedItem(COCOON_ID)) {
        if (!item) return;
        item.data ||= {};
        const state = item.data[COCOON_OUTER_STATE] ||= {anchored: false, attemptAges: []};
        if (state.anchored) return;
        state.attemptAges = [...(state.attemptAges || []).filter((age) => age >= 0 && age < COCOON_STRUGGLE_WINDOW), 0]
            .slice(-COCOON_STRUGGLE_THRESHOLD);
        if (state.attemptAges.length >= COCOON_STRUGGLE_THRESHOLD) state.reinforcementPending = true;
    }

    function vigilEnemy(enemy, player) {
        return player?.player && ["Spinner", "Jumper", "WebCaster", "Tunneler"].includes(enemy?.Enemy?.name)
            && enemy.hp > 0 && typeof KDHostile == "function" && KDHostile(enemy, player)
            && (typeof KinkyDungeonAggressive != "function" || KinkyDungeonAggressive(enemy, player));
    }

    function isCocoonDispersing(enemy, player) {
        return vigilEnemy(enemy, player) && !(enemy.Enemy.name == "WebCaster" && needsCocoonReinforcement())
            && (cocoonVigil()?.idleTurns || 0) >= VIGIL_IDLE_TURNS;
    }

    function registerCocoonVigil() {
        if (typeof KDEventMapGeneric == "undefined") return;
        addRuntimeEvent(KDEventMapGeneric, "beforeMove", VIGIL_STATE, (_event, data) => {
            if (!data || (!data.x && !data.y)) return;
            const state = cocoonVigil();
            if (state) { state.idleTurns = 0; state.activityPending = true; }
        });
        // tick runs once before both enemy passes; tickAfter has already lost LastAction.
        addRuntimeEvent(KDEventMapGeneric, "tick", VIGIL_STATE, (_event, data) => {
            if (!(data?.delta > 0)) return;
            const state = cocoonVigil();
            if (!state) return;
            const action = typeof KinkyDungeonLastAction == "string" ? KinkyDungeonLastAction : "";
            // Native LastAction is read once per paid turn, before enemy AI.
            // Multi-hit weapons and missed attacks still represent one intent.
            if (action == "Attack" || state.attackSpellPending) recordCocoonResistance();
            delete state.attackSpellPending;
            state.idleTurns = state.activityPending || (action && action != "Wait")
                ? 0 : Math.min(VIGIL_IDLE_TURNS, state.idleTurns + data.delta);
            state.activityPending = false;
        });
        addRuntimeEvent(KDEventMapGeneric, "afterPlayerCast", VIGIL_STATE, (_event, data) => {
            if (!data?.spell || data.spell.type == "buff" || !data.spell.damage
                || ["heal", "inert"].includes(data.spell.damage)) return;
            const state = cocoonVigil();
            if (state) state.attackSpellPending = true;
        });
        for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro"]) {
            addRuntimeEvent(KDEventMapGeneric, trigger, VIGIL_STATE, () => {
                if (typeof KDMapData != "undefined") delete KDMapData[VIGIL_STATE];
            });
        }
        if (typeof KDOverrideIgnore == "function") {
            const nativeOverride = KDOverrideIgnore;
            KDOverrideIgnore = function(enemy, player) {
                const original = nativeOverride.apply(this, arguments);
                if (vigilEnemy(enemy, player) && (cocoonVigil()?.idleTurns < VIGIL_IDLE_TURNS
                    || (enemy.Enemy.name == "WebCaster" && needsCocoonReinforcement()))) return true;
                return original;
            };
        }
        if (typeof KDAIType == "undefined") return;
        for (const name of ["hunt", "wander"]) {
            const ai = KDAIType[name];
            if (!ai) continue;
            const beforemove = ai.beforemove;
            ai.beforemove = function(enemy, player, aiData) {
                if (!isCocoonDispersing(enemy, player)) return beforemove.apply(this, arguments);
                aiData.ignore = true;
                aiData.wantsToAttack = false;
                aiData.holdStillWhenNear = false;
                aiData.kite = false;
                enemy.attackPoints = 0;
                enemy.warningTiles = [];
                // Give KD a legal outward goal; native movement still pays its normal cost.
                const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
                if (distance >= 4 || KDIsImmobile(enemy)
                    || KDEnemyHasFlag(enemy, "StayHere") || KDEnemyHasFlag(enemy, "overrideMove")) return true;
                let goal;
                let farthest = distance;
                for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                    if (!dx && !dy) continue;
                    const dir = {x: dx, y: dy, delta: Math.round(Math.hypot(dx, dy) * 2) / 2};
                    const range = Math.hypot(enemy.x + dx - player.x, enemy.y + dy - player.y);
                    if (range > farthest && KinkyDungeonEnemyCanMove(enemy, dir,
                        aiData.MovableTiles, aiData.AvoidTiles, aiData.ignoreLocks, 0)) {
                        goal = {x: enemy.x + dx, y: enemy.y + dy};
                        farthest = range;
                    }
                }
                if (!goal) return true;
                enemy.gx = goal.x;
                enemy.gy = goal.y;
                enemy.path = null;
                return false;
            };
        }
    }

    function registerCocoonOuterEvents() {
        if (typeof KDEventMapGeneric == "undefined") return false;
        addRuntimeEvent(KDEventMapGeneric, "tickAfter", COCOON_OUTER_STATE, (_event, data) => {
            const delta = Number(data && data.delta || 0);
            if (!(delta > 0)) return;
            const state = equippedItem(COCOON_ID)?.data?.[COCOON_OUTER_STATE];
            if (state && !state.anchored) state.attemptAges = (state.attemptAges || [])
                .map((age) => age + delta).filter((age) => age < COCOON_STRUGGLE_WINDOW);
        });
        addRuntimeEvent(KDEventMapGeneric, "beforeMove", COCOON_OUTER_STATE, () => {
            if (equippedItem(COCOON_ID)?.data?.[COCOON_OUTER_STATE]?.anchored
                && typeof KinkyDungeonNoMoveFlag != "undefined") KinkyDungeonNoMoveFlag = true;
        });
        addRuntimeEvent(KDEventMapGeneric, "afterDress", COCOON_OUTER_STATE, (_event, data) => syncCocoonOuterPose(data?.Character));
        addRuntimeEvent(KDEventMapGeneric, "postRemoval", COCOON_OUTER_STATE, () => syncCocoonOuterPose());
        if (typeof addTextKey == "function") addTextKey(COCOON_ANCHORED_MESSAGE, COCOON_ANCHORED_FALLBACK);
        return true;
    }

    function applyEnemyProgression(profile, entity, faction) {
        const catalog = runtimeEnemyCatalog();
        const snapshot = runtimeEnemySnapshot(catalog, entity);
        snapshot.webSpray = runtimeWebSprayState;
        const resolution = resolveWebbingAction({
            catalog,
            snapshot,
            action: {
                type: "enemyBind",
                source: {kind: "enemy", name: entity && entity.Enemy && entity.Enemy.name || profile},
                profile,
                random: () => typeof KDRandom == "function" ? KDRandom() : Math.random(),
            },
        });
        if (resolution.outcome.cocoonRepair) {
            clearRuntimeWebSpray("cocoon-reinforced");
            const progressed = applyCocoonRepair(resolution.outcome, snapshot.items.find((item) => item && item.name == COCOON_ID));
            return {...resolution.outcome, progressed};
        }
        if (!resolution.outcome.selectedId) {
            return {...resolution.outcome, progressed: false};
        }
        const progressed = applySelectedRestraint(resolution.outcome.selectedId, entity, faction);
        if (progressed && resolution.outcome.selectedId == COCOON_ID) clearRuntimeWebSpray("enemy-cocoon-applied");
        return {...resolution.outcome, progressed, reason: progressed ? "applied" : "native-add-failed"};
    }

    function registerEnemyBindEffect() {
        if (typeof KDPlayerEffects == "undefined" || !KDPlayerEffects) return false;
        KDPlayerEffects[ENEMY_BIND_EFFECT] = (_target, _damage, playerEffect, _spell, faction, _bullet, entity) => {
            const profile = playerEffect && playerEffect.profile;
            const outcome = applyEnemyProgression(profile, entity, faction);
            if (outcome.progressed && entity && playerEffect?.consumeOnProgress === true) entity.hp = 0;
            return {effect: outcome.progressed === true};
        };
        return true;
    }

    function expireWebSpraySlow() {
        const player = typeof KinkyDungeonPlayerEntity != "undefined" ? KinkyDungeonPlayerEntity : undefined;
        if (player && typeof KinkyDungeonExpireBuff == "function") {
            try {
                KinkyDungeonExpireBuff(player, WEBSPRAY_SLOW_BUFF);
            } catch (_error) {
                // The direct buff-map fallback keeps checker and older runtime contexts safe.
            }
        }
        if (typeof KinkyDungeonPlayerBuffs != "undefined" && KinkyDungeonPlayerBuffs) {
            delete KinkyDungeonPlayerBuffs[WEBSPRAY_SLOW_BUFF];
        }
        if (typeof KinkyDungeonCalculateSlowLevel == "function") KinkyDungeonCalculateSlowLevel(0);
    }

    function syncWebSpraySlow() {
        if (runtimeWebSprayState.stacks < 1) {
            expireWebSpraySlow();
            return;
        }
        if (typeof KinkyDungeonApplyBuffToEntity == "function" && typeof KinkyDungeonPlayerEntity != "undefined") {
            KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
                id: WEBSPRAY_SLOW_BUFF,
                type: "SlowLevel",
                power: runtimeWebSprayState.stacks,
                duration: 9999,
                infinite: true,
                player: true,
                tags: ["SpiderlingsWebSprayTransient"],
            });
        }
        if (typeof KinkyDungeonCalculateSlowLevel == "function") KinkyDungeonCalculateSlowLevel(0);
    }

    function clearRuntimeWebSpray(reason) {
        crossfireMark = null;
        const resolution = resolveWebbingAction({
            snapshot: {webSpray: runtimeWebSprayState},
            action: {type: "clearWebSpray", reason},
        });
        runtimeWebSprayState = normalizedWebSprayState(resolution.nextSnapshot.webSpray);
        expireWebSpraySlow();
        return resolution.outcome;
    }

    function addRuntimeEvent(eventMap, trigger, type, handler) {
        if (typeof KDAddEvent == "function") KDAddEvent(eventMap, trigger, type, handler);
        else {
            eventMap[trigger] = eventMap[trigger] || {};
            eventMap[trigger][type] = handler;
        }
    }

    function pruneCrossfireMark() {
        const player = typeof KinkyDungeonPlayerEntity != "undefined" ? KinkyDungeonPlayerEntity : undefined;
        const casters = api.activeWebCasters(player);
        if (crossfireMark && (runtimeWebSprayTurn - crossfireMark.turn > 2
            || !casters.includes(crossfireMark.caster))) crossfireMark = null;
        return casters;
    }

    function applyCrossfireBonus(playerEffect, bullet, entity, faction, primaryApplied) {
        if (playerEffect.triggerSource != "direct") return;
        const casters = pruneCrossfireMark();
        // Native projectile effects may carry only bullet.source, not the entity argument.
        const sourceId = bullet?.bullet?.source ?? entity?.id;
        const caster = casters.find((entry) => entry.id === sourceId);
        if (!caster) return;
        const partner = crossfireMark && crossfireMark.caster !== caster;
        crossfireMark = {caster, turn: runtimeWebSprayTurn};
        if (!partner || !primaryApplied || crossfireBonusTurn === runtimeWebSprayTurn) return;
        const catalog = runtimeEnemyCatalog();
        const snapshot = runtimeEnemySnapshot(catalog, caster);
        if (snapshot.items.some((item) => item.name == COCOON_ID)) return;
        // Re-read physical equipment after the ordinary hit; zero slow excludes Cocoon.
        snapshot.webSpray = emptyWebSprayState();
        const resolution = resolveWebbingAction({catalog, snapshot, action: {
            type: "enemyBind", profile: "WebCaster", source: {kind: "enemy", name: "WebCaster"},
            random: () => typeof KDRandom == "function" ? KDRandom() : Math.random(),
        }});
        const id = resolution.outcome.selectedId;
        if (!id || id == COCOON_ID || !applySelectedRestraint(id, caster, faction)) return;
        crossfireBonusTurn = runtimeWebSprayTurn;
        const localized = typeof TextGet == "function" ? TextGet(CROSS_FIRE_MESSAGE) : CROSS_FIRE_MESSAGE;
        if (typeof KinkyDungeonSendActionMessage == "function") KinkyDungeonSendActionMessage(8,
            localized && localized != CROSS_FIRE_MESSAGE ? localized : CROSS_FIRE_FALLBACK, "orange", 3, true);
    }

    // Runtime integration stays below the pure resolver so KD event quirks cannot leak into state rules.
    function registerWebSprayRuntime() {
        if (typeof addTextKey == "function") addTextKey(CROSS_FIRE_MESSAGE, CROSS_FIRE_FALLBACK);
        if (typeof KDPlayerEffects != "undefined" && KDPlayerEffects) {
            KDPlayerEffects[WEBSPRAY_EFFECT] = (_target, _damage, playerEffect, _spell, faction, bullet, entity) => {
                const catalog = runtimeEnemyCatalog();
                const snapshot = runtimeEnemySnapshot(catalog, entity);
                snapshot.webSpray = runtimeWebSprayState;
                const resolution = resolveWebbingAction({
                    catalog,
                    snapshot,
                    action: {
                        type: "webSprayTrigger",
                        provenance: playerEffect && playerEffect.provenance,
                        triggerSource: playerEffect && playerEffect.triggerSource,
                        profile: "WebCaster",
                        turn: runtimeWebSprayTurn,
                        random: () => typeof KDRandom == "function" ? KDRandom() : Math.random(),
                        position: bullet ? {x: bullet.x, y: bullet.y} : undefined,
                    },
                });
                runtimeWebSprayState = normalizedWebSprayState(resolution.nextSnapshot.webSpray);
                if (resolution.outcome.clearSlow) expireWebSpraySlow();
                if (!resolution.outcome.accepted) return {sfx: "Null", effect: false};
                api.Combat.damagePlayer(playerEffect.triggerSource);
                if (resolution.outcome.cocoonRepair) {
                    const repaired = applyCocoonRepair(resolution.outcome, snapshot.items.find((item) => item && item.name == COCOON_ID));
                    expireWebSpraySlow();
                    return {sfx: "Null", effect: repaired};
                }
                syncWebSpraySlow();
                if (resolution.outcome.selectedId) {
                    const applied = applySelectedRestraint(resolution.outcome.selectedId, entity, faction);
                    if (applied && resolution.outcome.selectedId == COCOON_ID) clearRuntimeWebSpray("webspray-cocoon-applied");
                    else applyCrossfireBonus(playerEffect, bullet, entity, faction, applied);
                }
                return {sfx: "Null", effect: true};
            };
        }
        if (typeof KDEventMapGeneric == "undefined") return false;
        addRuntimeEvent(KDEventMapGeneric, "tick", "SpiderlingsWebSprayPrisonClear", (_event, _data) => {
            pruneCrossfireMark();
            if (typeof KDGameData != "undefined" && KDGameData && KDGameData.PrisonerState == "jail") {
                clearRuntimeWebSpray("prison");
            }
        });
        addRuntimeEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsWebSprayInactivity", (_event, data) => {
            const delta = Number(data && data.delta || 0);
            if (!(delta > 0)) return;
            const resolution = resolveWebbingAction({
                snapshot: {webSpray: runtimeWebSprayState},
                action: {type: "webSprayTurnElapsed", turn: runtimeWebSprayTurn, delta},
            });
            runtimeWebSprayState = normalizedWebSprayState(resolution.nextSnapshot.webSpray);
            runtimeWebSprayTurn += delta;
            pruneCrossfireMark();
            syncWebSpraySlow();
        });
        for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro"]) {
            addRuntimeEvent(KDEventMapGeneric, trigger, "SpiderlingsWebSprayClear", () => clearRuntimeWebSpray(trigger));
        }
        return true;
    }

    function registerPlayerHitDamageEvent() {
        if (typeof KDEventMapGeneric == "undefined") return false;
        addRuntimeEvent(KDEventMapGeneric, "beforeDamage", PLAYER_HIT_DAMAGE_EVENT, (_event, data) => {
            const source = data?.attacker || data?.enemy;
            if (!["Spinner", "Jumper"].includes(source?.Enemy?.name)
                || !data.target?.player || !data.attack?.includes("Effect")) return;
            data.damage = api.Combat.damageInfo("melee").damage;
        });
        return true;
    }

    function registerRestraints() {
        if (!api.restraintCatalog || typeof api.restraintCatalog.register != "function") return false;
        for (const stage of ["Lv1", "Lv2", "Lv3"]) {
          for (const definition of FAMILY_DATA.filter((entry) => stageFamilies(stage).includes(entry.family))) {
            const id = `SpiderlingsWebbing${stage}${definition.family}`;
            const model = `${id}Model`;
            const familyLayerTag = `SpiderlingsWebbing${definition.linkFamily || definition.family}Layer`;
            const text = [...definition.text[stage]];
            api.restraintCatalog.register({
                id,
                module: definition.family,
                stage,
                model,
                restraint: {
                name: id,
                inventory: true,
                unlimited: true,
                accessible: true,
                Asset: "DuctTape",
                Model: model,
                Color: "#ffffff",
                Group: definition.group,
                ...(definition.mechanics || {}),
                ...(definition.stageMechanics && definition.stageMechanics[stage] || {}),
                power: stageNumber(stage),
                weight: 0,
                escapeChance: {Cut: LV1_ESCAPE_CHANCE, Remove: LV1_ESCAPE_CHANCE, Struggle: LV1_ESCAPE_CHANCE},
                affinity: {},
                helpChance: {},
                failSuffix: {},
                customEscapeSucc: "SpiderlingsWebbing",
                alwaysEscapable: [...ESCAPE_METHODS],
                enemyTags: {},
                playerTags: {},
                minLevel: 0,
                allFloors: true,
                shrine: ["Wrapping", "Latex", `SpiderlingsWebbing${stage}`, familyLayerTag, ...(definition.shrine || [])],
                addTag: [...(definition.addTag || [])],
                LinkableBy: [familyLayerTag, ...(definition.linkableBy || []),
                    ...(definition.family == "Blindfold" ? ["SpiderlingsWebbingHoodLayer"] : []),
                    ...(definition.family == "Hood" ? ["SpiderlingsWebbingBlindfoldLayer"] : [])],
                renderWhenLinked: [...(definition.renderWhenLinked || [])],
                events: [
                    {inheritLinked: true, trigger: "postApply", type: MANUAL_NORMALIZE_EVENT},
                    {inheritLinked: true, trigger: "struggle", type: ESCAPE_SOUND_EVENT},
                    {inheritLinked: true, trigger: "beforeSuccessRemove", type: ESCAPE_SOUND_EVENT},
                    ...(stage != "Lv1" ? [
                        {inheritLinked: true, trigger: "beforeStruggleCalc", type: stage == "Lv2" ? LV2_ESCAPE_EVENT : LV3_ESCAPE_EVENT},
                        {inheritLinked: true, trigger: "struggle", type: stage == "Lv2" ? LV2_ESCAPE_EVENT : LV3_ESCAPE_EVENT},
                    ] : []),
                    {inheritLinked: true, trigger: "beforeSuccessRemove", type: FINAL_ESCAPE_EVENT},
                ],
                },
                text,
            });
          }
        }
        api.restraintCatalog.register({
            id: COCOON_ID,
            module: "Cocoon",
            stage: "Cocoon",
            model: COCOON_MODEL_ID,
            restraint: {
                name: COCOON_ID,
                inventory: true,
                unlimited: true,
                accessible: true,
                alwaysStruggleable: true,
                hobble: 3,
                Asset: "Web",
                Model: COCOON_MODEL_ID,
                Type: "Cocooned",
                Color: "#ffffff",
                Group: "ItemDevices",
                power: 10,
                weight: 0,
                escapeChance: {...COCOON_ESCAPE_CHANCE},
                limitChance: {Cut: 0, Struggle: 0, Remove: 0},
                affinity: {},
                helpChance: {},
                failSuffix: {},
                customEscapeSucc: "SpiderlingsCocoon",
                alwaysEscapable: [...ESCAPE_METHODS],
                enemyTags: {},
                playerTags: {},
                minLevel: 0,
                allFloors: true,
                shrine: ["Wrapping", "Latex", "SpiderlingsWebbingCocoon"],
                addTag: [...CLOSED_TAGS],
                LinkableBy: [],
                renderWhenLinked: [],
                events: [
                    {inheritLinked: true, trigger: "postApply", type: COCOON_APPLY_EVENT},
                    {inheritLinked: true, trigger: "struggle", type: ESCAPE_SOUND_EVENT},
                    {inheritLinked: true, trigger: "beforeSuccessRemove", type: ESCAPE_SOUND_EVENT},
                    {inheritLinked: true, trigger: "beforeStruggleCalc", type: COCOON_ESCAPE_EVENT},
                    {inheritLinked: true, trigger: "struggle", type: COCOON_ESCAPE_EVENT},
                    {inheritLinked: true, trigger: "beforeSuccessRemove", type: FINAL_ESCAPE_EVENT},
                ],
            },
            text: [
                "Spiderling Silk Cocoon",
                "Layers of silk follow your body into a thick, soft cocoon. Its rim rests beneath your mouth, leaving the upper part of your head outside.",
                "The cocoon forms shallow folds as you move, its trailing threads brushing the floor with a soft rustle.",
            ],
        });
        return true;
    }

    function registerManualNormalizeEvent() {
        if (typeof KDEventMapInventory == "undefined") return false;
        const handler = (_event, item, data) => {
            if (typeof KinkyDungeonFlags == "undefined" || !KinkyDungeonFlags
                || typeof KinkyDungeonFlags.get != "function" || !KinkyDungeonFlags.get("SelfBondage")) return;
            const added = data && data.item ? data.item : item;
            const descriptor = DEFAULT_DESCRIPTOR_MAP.get(added && added.name);
            if (descriptor && stageNumber(descriptor.stage)) scheduleManualNormalization(descriptor.group);
        };
        addRuntimeEvent(KDEventMapInventory, "postApply", MANUAL_NORMALIZE_EVENT, handler);
        return true;
    }

    function registerCocoonApplyEvent() {
        if (typeof KDEventMapInventory == "undefined") return false;
        const handler = (_event, item, data) => {
            const target = data && data.item ? data.item : item;
            if (!target || target.name != COCOON_ID || !equippedItem(COCOON_ID)) return;
            target.data = target.data || {};
            delete target.data[COCOON_OUTER_STATE];
            if (typeof KDMapData != "undefined") delete KDMapData[VIGIL_STATE];
            syncCocoonOuterPose();
            clearRuntimeWebSpray("cocoon-post-apply");
        };
        addRuntimeEvent(KDEventMapInventory, "postApply", COCOON_APPLY_EVENT, handler);
        return true;
    }

    function registerCocoonEscapeEvent() {
        if (typeof KDEventMapInventory == "undefined") return false;
        const beforeHandler = (_event, item, data) => {
            if (item) pendingCountedEscapes.delete(item);
            if (!data || item !== data.restraint || item.name != COCOON_ID || data.query
                || !ESCAPE_METHODS.includes(data.struggleType)) return;
            if (data.struggleType == "Cut" && data.canCut === false) return;
            const definition = typeof KDRestraint == "function" ? KDRestraint(item) : item.restraint;
            if (data.struggleGroup && typeof KDGroupBlocked == "function"
                && KDGroupBlocked(data.struggleGroup) && !(definition && definition.alwaysStruggleable)) return;
            const cost = Number(data.cost || 0);
            const hasStamina = typeof KinkyDungeonHasStamina != "function"
                || KinkyDungeonHasStamina(-cost, true);
            if (!hasStamina) return;

            const requiredActions = COCOON_ESCAPE_ACTIONS[data.struggleType];
            const increment = 1 / requiredActions;
            const cutProgress = Math.max(0, Number(item.cutProgress || 0));
            const struggleProgress = Math.max(0, Number(item.struggleProgress || 0));
            const totalProgress = cutProgress + struggleProgress;
            if (totalProgress + increment >= 1 - Number.EPSILON) {
                // KD 5.5's immediate completion check reads cutProgress even for
                // Struggle/Remove. Mirror the combined progress only for this
                // final action; beforeSuccessRemove still owns the item fate.
                item.cutProgress = Math.max(cutProgress, totalProgress);
                data.escapeChance = 1;
                data.escapePenalty = -COCOON_ESCAPE_GATE_PENALTY;
                return;
            }
            data.escapeSpeed = 0;
            data.minSpeed = 1e-6;
            data.limitChance = 0;
            data.escapeChance = 0;
            data.escapePenalty = COCOON_ESCAPE_GATE_PENALTY;
            pendingCountedEscapes.set(item, data.struggleType);
            data.failSuffix = "SpiderlingsCocoon";
        };
        const afterHandler = (_event, item, data) => {
            const armedMethod = item && pendingCountedEscapes.get(item);
            if (item) pendingCountedEscapes.delete(item);
            if (!data || item !== data.restraint || item.name != COCOON_ID || data.result != "Fail"
                || armedMethod != data.struggleType
                || !ESCAPE_METHODS.includes(data.struggleType)) return;
            const increment = 1 / COCOON_ESCAPE_ACTIONS[data.struggleType];
            if (data.struggleType == "Cut") item.cutProgress = Math.max(0, Number(item.cutProgress || 0)) + increment;
            else item.struggleProgress = Math.max(0, Number(item.struggleProgress || 0)) + increment;
            recordCocoonResistance(item);
        };
        addRuntimeEvent(KDEventMapInventory, "beforeStruggleCalc", COCOON_ESCAPE_EVENT, beforeHandler);
        addRuntimeEvent(KDEventMapInventory, "struggle", COCOON_ESCAPE_EVENT, afterHandler);
        return true;
    }

    function registerLayerEscapeEvent(stage, eventType) {
        if (typeof KDEventMapInventory == "undefined") return false;
        const isStage = (item) => {
            const descriptor = DEFAULT_DESCRIPTOR_MAP.get(item && item.name);
            return descriptor && descriptor.stage == stage;
        };
        const beforeHandler = (_event, item, data) => {
            if (item) pendingCountedEscapes.delete(item);
            if (!data || item !== data.restraint || !isStage(item) || data.query
                || !ESCAPE_METHODS.includes(data.struggleType)) return;
            if (data.struggleType == "Cut" && data.canCut === false) return;
            const definition = typeof KDRestraint == "function" ? KDRestraint(item) : item.restraint;
            if (data.struggleGroup && typeof KDGroupBlocked == "function"
                && KDGroupBlocked(data.struggleGroup) && !(definition && definition.alwaysStruggleable)) return;
            const cost = Number(data.cost || 0);
            if (typeof KinkyDungeonHasStamina == "function" && !KinkyDungeonHasStamina(-cost, true)) return;
            const progress = Math.max(0, Number(item.data && item.data[ESCAPE_PROGRESS_KEY] || 0));
            if (progress >= DEFAULT_DESCRIPTOR_MAP.get(item.name).requiredActions - 1) {
                item.cutProgress = 1;
                data.escapeChance = 1;
                data.escapePenalty = -COCOON_ESCAPE_GATE_PENALTY;
                return;
            }
            data.escapeSpeed = 0;
            data.minSpeed = 1e-6;
            data.limitChance = 0;
            data.escapeChance = 0;
            data.escapePenalty = COCOON_ESCAPE_GATE_PENALTY;
            pendingCountedEscapes.set(item, data.struggleType);
            data.failSuffix = "SpiderlingsWebbing";
        };
        const afterHandler = (_event, item, data) => {
            const armedMethod = item && pendingCountedEscapes.get(item);
            if (item) pendingCountedEscapes.delete(item);
            if (!data || item !== data.restraint || !isStage(item) || data.result != "Fail"
                || armedMethod != data.struggleType
                || !ESCAPE_METHODS.includes(data.struggleType)) return;
            item.data = item.data || {};
            item.data[ESCAPE_PROGRESS_KEY] = Math.max(0, Number(item.data[ESCAPE_PROGRESS_KEY] || 0)) + 1;
        };
        addRuntimeEvent(KDEventMapInventory, "beforeStruggleCalc", eventType, beforeHandler);
        addRuntimeEvent(KDEventMapInventory, "struggle", eventType, afterHandler);
        return true;
    }

    function registerEscapeText() {
        if (typeof addTextKey != "function") return;
        for (const [suffix, methods] of Object.entries(ESCAPE_TEXT)) {
            for (const [method, [progress, success]] of Object.entries(methods)) {
                const prefix = "KinkyDungeonStruggle" + method;
                addTextKey(prefix + "Fail" + suffix, progress);
                // KD appends Aroused to an incomplete action even with a custom suffix.
                addTextKey(prefix + "Fail" + suffix + "Aroused", progress);
                addTextKey(prefix + "Success" + suffix, success);
            }
        }
        // KD's assistance branch selects Fail2/Fail3 before consulting failSuffix.
        // Redirect only that lookup during this item's armed, real struggle call.
        if (typeof KinkyDungeonStruggle != "function" || typeof TextGet != "function") return;
        let currentAttempt;
        const nativeStruggle = KinkyDungeonStruggle;
        KinkyDungeonStruggle = function(group, method, index, query) {
            const previous = currentAttempt;
            const item = playerStruggleTarget({group, index});
            currentAttempt = !query && isSpiderlingsRestraint(item) && ESCAPE_METHODS.includes(method)
                ? {item, method} : undefined;
            try { return nativeStruggle.apply(this, arguments); }
            finally { currentAttempt = previous; }
        };
        const nativeText = TextGet;
        TextGet = function(key) {
            const attempt = currentAttempt;
            if (attempt && pendingCountedEscapes.get(attempt.item) === attempt.method) {
                const prefix = "KinkyDungeonStruggle" + attempt.method + "Fail";
                if ([prefix + "2", prefix + "3"].includes(key)) {
                    const suffix = attempt.item.name === COCOON_ID ? "SpiderlingsCocoon" : "SpiderlingsWebbing";
                    return nativeText.call(this, prefix + suffix);
                }
            }
            return nativeText.apply(this, arguments);
        };
    }

    function registerFinalEscapeEvent() {
        if (typeof KDEventMapInventory == "undefined") return false;
        const handler = (_event, item, data) => {
            const target = data && (data.restraint || data.item) ? (data.restraint || data.item) : item;
            if (!isSpiderlingsRestraint(target) || !data) return;
            data.destroyChance = data.struggleType == "Cut" ? 1 : 0;
        };
        addRuntimeEvent(KDEventMapInventory, "beforeSuccessRemove", FINAL_ESCAPE_EVENT, handler);
        return true;
    }

    function registerEscapeSoundEvent() {
        if (typeof KDEventMapInventory == "undefined") return false;
        const handler = (_event, item, data) => {
            if (!data || item !== data.restraint || !["Remove", "Struggle"].includes(data.struggleType)
                || !isSpiderlingsRestraint(item)) return;
            const sound = ESCAPE_SOUNDS[Math.floor(Math.random() * ESCAPE_SOUNDS.length)];
            KinkyDungeonPlaySound(KinkyDungeonRootDirectory + sound);
        };
        for (const trigger of ["struggle", "beforeSuccessRemove"]) {
            addRuntimeEvent(KDEventMapInventory, trigger, ESCAPE_SOUND_EVENT, handler);
        }
        return true;
    }

    function playerStruggleTarget(data) {
        if (!data || typeof KinkyDungeonGetRestraintItem != "function") return undefined;
        const root = KinkyDungeonGetRestraintItem(data.group);
        if (!root || !data.index) return root;
        const surface = typeof KDDynamicLinkListSurface == "function"
            ? KDDynamicLinkListSurface(root)
            : chainFrom(root);
        return surface[data.index] || root;
    }

    function restraintDisplayName(item) {
        const key = `Restraint${item.name}`;
        const localized = typeof TextGet == "function" ? TextGet(key) : key;
        return localized && localized != key ? localized : item.name;
    }

    function showPairedOuterGateMessage(inner, outer) {
        const localized = typeof TextGet == "function" ? TextGet(PAIRED_OUTER_GATE_MESSAGE_KEY) : PAIRED_OUTER_GATE_MESSAGE_KEY;
        const template = localized && localized != PAIRED_OUTER_GATE_MESSAGE_KEY
            ? localized
            : PAIRED_OUTER_GATE_MESSAGE_FALLBACK;
        const message = template
            .replace("TargetLv1", restraintDisplayName(inner))
            .replace("TargetLv2", restraintDisplayName(outer));
        if (typeof KinkyDungeonSendActionMessage == "function") {
            KinkyDungeonSendActionMessage(10, message, "orange", 2, true);
        }
        if ((typeof KDSoundEnabled != "function" || KDSoundEnabled()) && typeof AudioPlayInstantSoundKD == "function") {
            const root = typeof KinkyDungeonRootDirectory == "string" ? KinkyDungeonRootDirectory : "";
            AudioPlayInstantSoundKD(root + "Audio/ClickError.ogg");
        }
    }

    function registerPairedOuterLayerGate() {
        if (typeof addTextKey == "function") addTextKey(PAIRED_OUTER_GATE_MESSAGE_KEY, PAIRED_OUTER_GATE_MESSAGE_FALLBACK);
        // Keep native link indices intact: hide actions, not the linked items.
        // Both HUD layouts and the player restraint context menu use these lists.
        if (typeof KDGetStruggleButtons == "function" && !KDGetStruggleButtons[PAIRED_OUTER_GATE_MARKER]) {
            const nativeButtons = KDGetStruggleButtons;
            KDGetStruggleButtons = function(data) {
                return pairedOuterLayerFor(data && data.item) ? [] : nativeButtons.apply(this, arguments);
            };
            KDGetStruggleButtons[PAIRED_OUTER_GATE_MARKER] = true;
        }
        if (typeof KDGetStruggleContextMenu == "function" && !KDGetStruggleContextMenu[PAIRED_OUTER_GATE_MARKER]) {
            const nativeMenu = KDGetStruggleContextMenu;
            KDGetStruggleContextMenu = function(item, sg, target, entity) {
                return target && target.player && pairedOuterLayerFor(item) ? [] : nativeMenu.apply(this, arguments);
            };
            KDGetStruggleContextMenu[PAIRED_OUTER_GATE_MARKER] = true;
        }
        if (typeof KDInputTypes == "undefined" || !KDInputTypes || typeof KDInputTypes.struggle != "function") return false;
        const nativeStruggleInput = KDInputTypes.struggle;
        if (nativeStruggleInput[PAIRED_OUTER_GATE_MARKER]) return true;
        const guardedStruggleInput = (data) => {
            const target = playerStruggleTarget(data);
            const outer = target && ESCAPE_METHODS.includes(data && data.type) ? pairedOuterLayerFor(target) : undefined;
            if (!outer) return nativeStruggleInput(data);
            showPairedOuterGateMessage(target, outer);
            return "Blocked";
        };
        guardedStruggleInput[PAIRED_OUTER_GATE_MARKER] = true;
        KDInputTypes.struggle = guardedStruggleInput;
        return true;
    }

    function equipForDebug(id = ARM_ID, options = {}) {
        return kdAdapter.equip(id, options);
    }

    function registerCocoonStart() {
        const id = "SpiderlingsCocoonStart";
        if (typeof addTextKey == "function") {
            addTextKey("KinkyDungeonStat" + id, "Silken Awakening");
            addTextKey("KinkyDungeonStatDesc" + id, "You awaken in a soft cocoon, completely wrapped from head to toe in close-woven layers of spider silk. Each small movement tugs at the threads nestled against you.");
        }
        if (typeof KinkyDungeonStatsPresets == "undefined" || typeof KDPerkStart == "undefined") return;
        // Native KD displays twice the internal cost: -1 grants two perk points.
        KinkyDungeonStatsPresets[id] = {id, category: "Start", cost: -1, startPriority: 1100, tags: ["start"]};
        KDPerkStart[id] = () => {
            // Native KDInitPerks invokes this only for a selected new-game perk.
            // Equip from the innermost layer outward so every physical item remains linked.
            const ids = [
                ...LV1_FAMILIES.map((family) => "SpiderlingsWebbingLv1" + family),
                ...LV2_FAMILIES.map((family) => "SpiderlingsWebbingLv2" + family),
                ...LV3_FAMILIES.map((family) => "SpiderlingsWebbingLv3" + family),
                COCOON_ID,
            ];
            for (const restraintId of ids) {
                if (!equippedItem(restraintId)) kdAdapter.equip(restraintId);
            }
        };
    }

    function completeEffectiveEscape(id, method, options = {}) {
        const catalog = options.catalog || defaultLifecycleCatalog();
        const item = options.item || equippedItem(id);
        if (!item) return {completed: false, id, method, reason: "not-equipped"};
        const progress = Number(item.data && item.data[ESCAPE_PROGRESS_KEY] || 0);
        const resolution = resolveWebbingAction({
            catalog,
            snapshot: {items: [item]},
            action: {type: "escapeAttempt", item, method, effective: options.legal === true, progress},
        });
        const outcome = resolution.outcome;
        if (!outcome.progressed) return {id, method, ...outcome};
        item.data = item.data || {};
        item.data[ESCAPE_PROGRESS_KEY] = outcome.effectiveActions;
        if (!outcome.completed) return {id, method, ...outcome};
        const completed = kdAdapter.remove(item, method);
        return {id, method, ...outcome, completed};
    }

    const webbing = api.Webbing = Object.freeze({
        ARM_ID,
        COCOON_APPLY_EVENT,
        COCOON_ESCAPE_ACTIONS,
        COCOON_ESCAPE_CHANCE,
        COCOON_ESCAPE_EVENT,
        COCOON_ID,
        isCocoonPassive,
        isCocoonDispersing,
        needsCocoonReinforcement,
        COCOON_MODEL_ID,
        COCOON_REPAIR_AMOUNT,
        ENEMY_BIND_EFFECT,
        ENEMY_PROFILES,
        ESCAPE_METHODS,
        ESCAPE_SOUND_EVENT,
        ESCAPE_SOUNDS,
        FAMILIES: LV1_FAMILIES,
        FAMILY_DATA,
        FAMILY_GROUPS,
        FINAL_ESCAPE_EVENT,
        INNER_STUFFING_TAG,
        LV1_ESCAPE_CHANCE,
        LV1_FAMILIES,
        LV2_FAMILIES,
        LV2_ESCAPE_EVENT,
        LV3_FAMILIES,
        LV3_ESCAPE_EVENT,
        PAIRED_OUTER_GATE_MESSAGE_FALLBACK,
        PAIRED_OUTER_GATE_MESSAGE_KEY,
        PROFILE_FAMILIES,
        MANUAL_NORMALIZE_EVENT,
        PLAYER_HIT_DAMAGE_EVENT,
        OUTER_GAG_TAG,
        WEBSPRAY_EFFECT,
        WEBSPRAY_INACTIVITY_TURNS,
        WEBSPRAY_MAX_STACKS,
        WEBSPRAY_PROVENANCE,
        WEBSPRAY_SLOW_BUFF,
        completeEffectiveEscape,
        equipForDebug,
        pairedOuterLayerFor,
        resolveWebbingAction,
    });

    registerRestraints();
    registerCocoonStart();
    registerEscapeText();
    if (typeof KinkyDungeonRefreshRestraintsCache == "function") KinkyDungeonRefreshRestraintsCache();
    registerManualNormalizeEvent();
    registerCocoonApplyEvent();
    registerCocoonEscapeEvent();
    registerCocoonOuterEvents();
    registerCocoonVigil();
    registerLayerEscapeEvent("Lv2", LV2_ESCAPE_EVENT);
    registerLayerEscapeEvent("Lv3", LV3_ESCAPE_EVENT);
    registerFinalEscapeEvent();
    registerEscapeSoundEvent();
    registerPairedOuterLayerGate();
    registerExternalUnlinkPreservation();
    registerEnemyBindEffect();
    registerPlayerHitDamageEvent();
    registerWebSprayRuntime();
})();
