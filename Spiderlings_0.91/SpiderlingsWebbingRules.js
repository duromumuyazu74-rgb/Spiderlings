"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const {
        LV1_FAMILIES,
        LV2_FAMILIES,
        LV3_FAMILIES,
        PROFILE_FAMILIES,
        COCOON_ID,
        COCOON_REPAIR_AMOUNT,
        COCOON_ESCAPE_ACTIONS,
        ESCAPE_METHODS,
        WEBSPRAY_PROVENANCE,
        WEBSPRAY_MAX_STACKS,
        WEBSPRAY_INACTIVITY_TURNS,
        ENEMY_PROFILES,
        FAMILY_GROUPS,
        FAMILY_DATA,
    } = api.WebbingData;
    function emptyWebSprayState() {
        return { stacks: 0, inactiveTurns: 0, lastTriggerTurn: null, lastTrailTurn: null };
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
        return [
            ...lv1,
            ...lv2,
            ...lv3,
            {
                id: COCOON_ID,
                family: "Cocoon",
                group: "ItemDevices",
                stage: "Cocoon",
                requiredActionsByMethod: COCOON_ESCAPE_ACTIONS,
            },
        ];
    }

    function catalogDescriptorMap(catalog) {
        return new Map(
            (catalog || [])
                .map((entry) => {
                    const restraint = entry && entry.restraint;
                    const id = entry && (entry.id || (restraint && restraint.name));
                    const family = entry && (entry.family || entry.module);
                    const group = entry && (entry.group || (restraint && restraint.Group) || FAMILY_GROUPS[family]);
                    return [id, { ...entry, id, family, group }];
                })
                .filter(([id]) => id),
        );
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

    function stageNumber(stage) {
        if (stage === 1 || stage === "Lv1") return 1;
        if (stage === 2 || stage === "Lv2") return 2;
        if (stage === 3 || stage === "Lv3") return 3;
        return undefined;
    }

    function innerRank(descriptor, group) {
        const stage = descriptor && stageNumber(descriptor.stage);
        if (!descriptor || !stage || descriptor.group !== group) return undefined;
        if (group === "ItemMouth") {
            const ranks = { "1:Stuffing": 0, "1:Gag": 1, "3:Gag": 2 };
            return ranks[`${stage}:${descriptor.family}`];
        }
        if (group === "ItemHead") {
            const ranks = { "1:Blindfold": 0, "3:Blindfold": 1, "3:Hood": 2 };
            return ranks[`${stage}:${descriptor.family}`];
        }
        if (group === "ItemHands") {
            const ranks = { "1:MittenLeft": 0, "1:MittenRight": 1 };
            return ranks[`${stage}:${descriptor.family}`];
        }
        return stage - 1;
    }

    function stageFamilies(stage) {
        return stageNumber(stage) === 3 ? LV3_FAMILIES : stageNumber(stage) === 2 ? LV2_FAMILIES : LV1_FAMILIES;
    }

    function completeStageCatalog(descriptors, stage) {
        const requiredFamilies = stageFamilies(stage);
        const byFamily = new Map();
        for (const descriptor of descriptors.values()) {
            if (stageNumber(descriptor.stage) === stage && requiredFamilies.includes(descriptor.family)) {
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
        return { names, lv1Complete: complete(1), lv2Complete: complete(2), lv3Complete: complete(3) };
    }

    function sourceAllowsDirectCocoon(source) {
        if (!source) return false;
        if (source.kind === "enemy") return ["Spinner", "Jumper", "WebCaster"].includes(source.name);
        return (
            source.kind === "webSpray" && source.provenance === WEBSPRAY_PROVENANCE && source.triggerSource === "direct"
        );
    }

    function cocoonRepairDecision(item, source) {
        const cutProgress = Math.max(0, Number((item && item.cutProgress) || 0));
        const struggleProgress = Math.max(0, Number((item && item.struggleProgress) || 0));
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
        const source = action.source || { kind: "enemy", name: profileName };
        if (!weights || weights.length !== PROFILE_FAMILIES.length) {
            return { progressed: false, reason: "unknown-profile", profile: profileName, source };
        }

        const completion = physicalCompletion(descriptors, snapshot);
        const names = completion.names;
        const cocoonItem = (snapshot.items || []).find((item) => item && item.name === COCOON_ID);
        if (cocoonItem) {
            if (!sourceAllowsDirectCocoon(source)) {
                return { progressed: false, reason: "cocoon-source-rejected", profile: profileName, source };
            }
            return { ...cocoonRepairDecision(cocoonItem, source), profile: profileName };
        }

        const cocoonDescriptor = descriptors.get(COCOON_ID);
        const preHitSlow = normalizedWebSprayState(snapshot.webSpray).stacks;
        const cocoonGroup = (snapshot.groups && snapshot.groups.ItemDevices) || [];
        const cocoonCompatible =
            cocoonDescriptor &&
            (!cocoonGroup.some((item) => item && !descriptors.has(item.name)) ||
                snapshot.externalLinkCompatible?.[COCOON_ID] === true) &&
            snapshotFlag(snapshot.registered, COCOON_ID) &&
            snapshotFlag(snapshot.poseCompatible, COCOON_ID) &&
            snapshotFlag(snapshot.addCompatible, COCOON_ID);
        if (
            profileName !== "Spinner" &&
            sourceAllowsDirectCocoon(source) &&
            completion.lv3Complete &&
            preHitSlow >= WEBSPRAY_MAX_STACKS &&
            cocoonCompatible
        ) {
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
        if (!lv1Catalog) return { progressed: false, reason: "incomplete-lv1-catalog", profile: profileName, source };
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
            if (
                stage > 1 &&
                LV2_FAMILIES.includes(family) &&
                (!names.has(lv1Catalog.get(family).id) || (stage === 3 && !names.has(catalogs[1]?.get(family)?.id)))
            )
                continue;
            const index = PROFILE_FAMILIES.indexOf(family);
            const weight = Number(weights[index] || 0);
            if (!descriptor || !(weight > 0) || names.has(descriptor.id)) continue;
            const groupItems = (snapshot.groups && snapshot.groups[descriptor.group]) || [];
            if (
                groupItems.some((item) => item && !descriptors.has(item.name)) &&
                snapshot.externalLinkCompatible?.[descriptor.id] !== true
            )
                continue;
            if (
                !snapshotFlag(snapshot.registered, descriptor.id) ||
                !snapshotFlag(snapshot.poseCompatible, descriptor.id) ||
                !snapshotFlag(snapshot.addCompatible, descriptor.id)
            )
                continue;

            if (stage === 3 && family === "Hood") {
                if (!["Blindfold", "Gag"].every((inner) => names.has(catalogs[2].get(inner).id))) continue;
            } else if (stage === 1 && family === "Gag") {
                const stuffing = lv1Catalog.get("Stuffing");
                if (!stuffing || !names.has(stuffing.id)) continue;
            } else if (stage === 1 && family === "Stuffing") {
                const gag = lv1Catalog.get("Gag");
                if (gag && names.has(gag.id)) continue;
            }
            eligible.push({ descriptor, weight });
        }

        if (!eligible.length)
            return { progressed: false, reason: "no-eligible-candidate", profile: profileName, source };
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
        if (action.provenance !== WEBSPRAY_PROVENANCE || !["direct", "trail"].includes(triggerSource)) {
            return {
                nextSnapshot: snapshot,
                outcome: {
                    accepted: false,
                    reason: "invalid-webspray-source",
                    triggerSource,
                    provenance: action.provenance,
                },
            };
        }
        if (triggerSource === "trail" && current.lastTrailTurn === action.turn) {
            return {
                nextSnapshot: snapshot,
                outcome: {
                    accepted: false,
                    reason: "trail-rate-limited",
                    triggerSource,
                    provenance: action.provenance,
                },
            };
        }

        const cocoonItem = (snapshot.items || []).find((item) => item && item.name === COCOON_ID);
        if (cocoonItem) {
            if (triggerSource !== "direct") {
                return {
                    nextSnapshot: { ...snapshot, webSpray: emptyWebSprayState() },
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
                source: { kind: "webSpray", provenance: WEBSPRAY_PROVENANCE, triggerSource },
                random: action.random,
            });
            return {
                nextSnapshot: { ...snapshot, webSpray: emptyWebSprayState() },
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
            source: { kind: "webSpray", provenance: WEBSPRAY_PROVENANCE, triggerSource },
            random: action.random,
        });
        const selectedCocoon = progression.selectedId === COCOON_ID;
        const nextWebSpray = {
            stacks: selectedCocoon ? current.stacks : Math.min(WEBSPRAY_MAX_STACKS, current.stacks + 1),
            inactiveTurns: 0,
            lastTriggerTurn: action.turn,
            lastTrailTurn: triggerSource === "trail" ? action.turn : current.lastTrailTurn,
        };
        return {
            nextSnapshot: { ...snapshot, webSpray: nextWebSpray },
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
            return { nextSnapshot: snapshot, outcome: { advanced: false, cleared: false, slowStacks: current.stacks } };
        }
        if (current.lastTriggerTurn === action.turn) {
            const nextWebSpray = { ...current, inactiveTurns: 0 };
            return {
                nextSnapshot: { ...snapshot, webSpray: nextWebSpray },
                outcome: { advanced: true, cleared: false, slowStacks: current.stacks, inactiveTurns: 0 },
            };
        }
        const inactiveTurns = current.inactiveTurns + delta;
        if (inactiveTurns >= WEBSPRAY_INACTIVITY_TURNS) {
            return {
                nextSnapshot: { ...snapshot, webSpray: emptyWebSprayState() },
                outcome: { advanced: true, cleared: true, slowStacks: 0, inactiveTurns: 0 },
            };
        }
        const nextWebSpray = { ...current, inactiveTurns };
        return {
            nextSnapshot: { ...snapshot, webSpray: nextWebSpray },
            outcome: { advanced: true, cleared: false, slowStacks: current.stacks, inactiveTurns },
        };
    }

    function resolveWebbingAction(request = {}) {
        const catalog = request.catalog || defaultLifecycleCatalog();
        const descriptors = descriptorMapFor(catalog);
        const snapshot = request.snapshot || {};
        const action = request.action || {};

        if (action.type === "webSprayTrigger") return resolveWebSprayTrigger(descriptors, snapshot, action);
        if (action.type === "webSprayTurnElapsed") return resolveWebSprayTurn(snapshot, action);
        if (action.type === "clearWebSpray") {
            return {
                nextSnapshot: { ...snapshot, webSpray: emptyWebSprayState() },
                outcome: { cleared: true, slowStacks: 0, reason: action.reason || "explicit-clear" },
            };
        }

        if (action.type === "enemyBind") {
            return { nextSnapshot: snapshot, outcome: enemyBindResolution(descriptors, snapshot, action) };
        }

        if (action.type === "inspectPhysical") {
            const names = new Set((snapshot.items || []).map((item) => item && item.name).filter(Boolean));
            const present = [...descriptors.values()].filter((descriptor) => names.has(descriptor.id));
            const lv1Families = new Set(
                present
                    .filter(
                        (descriptor) => stageNumber(descriptor.stage) === 1 && LV1_FAMILIES.includes(descriptor.family),
                    )
                    .map((descriptor) => descriptor.family),
            );
            const lv2Families = new Set(
                present
                    .filter(
                        (descriptor) => stageNumber(descriptor.stage) === 2 && LV2_FAMILIES.includes(descriptor.family),
                    )
                    .map((descriptor) => descriptor.family),
            );
            const lv3Families = new Set(
                present
                    .filter(
                        (descriptor) => stageNumber(descriptor.stage) === 3 && LV3_FAMILIES.includes(descriptor.family),
                    )
                    .map((descriptor) => descriptor.family),
            );
            const lv1Count = lv1Families.size;
            const lv2Count = lv2Families.size;
            const lv3Count = lv3Families.size;
            const cocoonPresent = present.some(
                (descriptor) => descriptor.stage === "Cocoon" || descriptor.family === "Cocoon",
            );
            return {
                nextSnapshot: snapshot,
                outcome: {
                    lv1Count,
                    lv2Count,
                    lv3Count,
                    physicalInnerCount: lv1Count + lv2Count + lv3Count,
                    cocoonPresent,
                    lv1Complete: lv1Count === LV1_FAMILIES.length,
                    lv2Complete: lv2Count === LV2_FAMILIES.length,
                    lv3Complete: lv3Count === LV3_FAMILIES.length,
                    terminalLayerCount: lv1Count + lv2Count + lv3Count + (cocoonPresent ? 1 : 0),
                },
            };
        }

        if (action.type === "manualEquipResult") {
            if (action.accepted !== true) {
                return {
                    nextSnapshot: snapshot,
                    outcome: { normalized: false, changed: false, reason: "native-rejected" },
                };
            }
            const group = action.group;
            const current = (snapshot.groups && snapshot.groups[group]) || [];
            const ranked = current.map((item) => {
                const descriptor = descriptors.get(item && item.name);
                return { item, rank: innerRank(descriptor, group) };
            });
            if (ranked.some((entry) => entry.rank === undefined)) {
                return {
                    nextSnapshot: snapshot,
                    outcome: { normalized: false, changed: false, group, reason: "external-item" },
                };
            }
            const ordered = ranked
                .slice()
                .sort((left, right) => left.rank - right.rank)
                .map((entry) => entry.item);
            const changed = ordered.some((item, index) => item !== current[index]);
            const nextSnapshot = {
                ...snapshot,
                groups: { ...(snapshot.groups || {}), [group]: ordered },
            };
            return { nextSnapshot, outcome: { normalized: true, changed, group, orderedInnerToOuter: ordered } };
        }

        if (action.type === "escapeAttempt") {
            const item = action.item;
            const descriptor = descriptors.get(item && item.name);
            if (!descriptor)
                return {
                    nextSnapshot: snapshot,
                    outcome: { completed: false, progressed: false, reason: "not-owned" },
                };
            if (!ESCAPE_METHODS.includes(action.method)) {
                return {
                    nextSnapshot: snapshot,
                    outcome: { completed: false, progressed: false, reason: "unsupported-method" },
                };
            }
            if (action.effective !== true) {
                return { nextSnapshot: snapshot, outcome: { completed: false, progressed: false, reason: "blocked" } };
            }
            const stage = stageNumber(descriptor.stage);
            const configuredActions =
                descriptor.requiredActionsByMethod && descriptor.requiredActionsByMethod[action.method] != null
                    ? descriptor.requiredActionsByMethod[action.method]
                    : descriptor.requiredActions && typeof descriptor.requiredActions == "object"
                      ? descriptor.requiredActions[action.method]
                      : descriptor.requiredActions;
            const requiredActions = Number(configuredActions || stage || 0);
            if (!(requiredActions > 0)) {
                return {
                    nextSnapshot: snapshot,
                    outcome: { completed: false, progressed: false, reason: "unsupported-stage" },
                };
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
                    keep: completed ? action.method !== "Cut" : undefined,
                },
            };
        }

        return { nextSnapshot: snapshot, outcome: { reason: "unsupported-action" } };
    }

    api.WebbingRules = Object.freeze({
        emptyWebSprayState,
        normalizedWebSprayState,
        defaultLifecycleCatalog,
        stageNumber,
        innerRank,
        stageFamilies,
        sourceAllowsDirectCocoon,
        resolveWebbingAction,
        descriptorFor: (id) => DEFAULT_DESCRIPTOR_MAP.get(id),
        owns: (id) => DEFAULT_DESCRIPTOR_MAP.has(id),
    });
})();
