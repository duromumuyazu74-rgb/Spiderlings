"use strict";

(() => {
    const api = globalThis.Spiderlings,
        FIELD = "SpiderlingsSpinnerRollout",
        VERSION = 1;

    function eligibility(input = {}) {
        const room = input.room || {},
            map = input.map || {},
            roomType = String(map.RoomType || room.RoomType || ""),
            lower = roomType.toLowerCase();
        if (room.bossroom === true || map.bossroom === true)
            return { enabled: false, kind: "excluded", reason: "boss" };
        if (room.isPrison === true || map.isPrison === true)
            return { enabled: false, kind: "excluded", reason: "jail" };
        if (lower === "tutorial" || String(room.name || "").toLowerCase() === "tutorial")
            return { enabled: false, kind: "excluded", reason: "tutorial" };
        if (roomType) return { enabled: false, kind: "excluded", reason: "scripted" };
        if (room.enemies === false || room.spawns === false)
            return { enabled: false, kind: "excluded", reason: "noncombat" };
        const kind = map.MapMod === "SpiderlingsInfestation" ? "infestation" : "ordinary";
        if (input.settingEnabled !== true) return { enabled: false, kind, reason: "setting" };
        return { enabled: true, kind, reason: "eligible" };
    }

    function currentRoom() {
        if (typeof KDGetAltType !== "function" || typeof MiniGameKinkyDungeonLevel === "undefined") return {};
        return KDGetAltType(MiniGameKinkyDungeonLevel) || {};
    }

    function activate(snapshot) {
        if (!snapshot?.enabled) return false;
        const encounter = api.SpinnerNativeField.ensureMap({ scenario: "ordinary-rollout" });
        encounter.autonomous = true;
        encounter.rolloutKind = snapshot.kind;
        return true;
    }

    function snapshotMap(map = KDMapData, room = currentRoom()) {
        if (map?.[FIELD]) return map[FIELD];
        const settingEnabled = api.getSetting?.("spiderlingsSpinnerEncounters") === true,
            decision = eligibility({ room, map, settingEnabled });
        map[FIELD] = { version: VERSION, settingEnabled, ...decision };
        activate(map[FIELD]);
        return map[FIELD];
    }

    function restore() {
        const snapshot = typeof KDMapData !== "undefined" ? KDMapData?.[FIELD] : undefined;
        if (snapshot?.version !== VERSION || !snapshot.enabled) return false;
        if (api.SpinnerNativeField.state()) {
            api.SpinnerNativeField.state().autonomous = true;
            api.SpinnerNativeField.reconcile();
            return true;
        }
        return false;
    }

    function preparePositiveTurn() {
        const snapshot = KDMapData?.[FIELD],
            encounter = api.SpinnerNativeField.state(),
            ai = encounter?.ai;
        if (!snapshot?.enabled || !ai) return snapshot?.enclosureDecisions;
        if (snapshot.enclosureDecisions) {
            for (const group of Object.values(ai.groups || {})) {
                if (snapshot.enclosureDecisions[group.id]) continue;
                const plan = ai.plans?.[group.planId];
                if (!plan) continue;
                plan.kind = "line";
                plan.fieldIds = [plan.fieldId];
                snapshot.enclosureDecisions[group.id] = {
                    groupId: group.id,
                    planId: plan.id,
                    kind: "late-line-fallback",
                };
            }
            return snapshot.enclosureDecisions;
        }
        const group = Object.values(ai.groups || {})
            .filter((candidate) => candidate.memberIds?.length >= 2 && ai.plans?.[candidate.planId])
            .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
        if (!group) return undefined;
        const plan = ai.plans[group.planId],
            center = plan.anchors?.length
                ? {
                      x: Math.round((plan.anchors[0].x + plan.anchors.at(-1).x) / 2),
                      y: Math.round((plan.anchors[0].y + plan.anchors.at(-1).y) / 2),
                  }
                : undefined;
        if (!center) return undefined;
        const vertices = [
                { x: center.x - 3, y: center.y - 3 },
                { x: center.x + 3, y: center.y - 3 },
                { x: center.x + 3, y: center.y + 3 },
                { x: center.x - 3, y: center.y + 3 },
            ],
            compositeId = `rollout-${group.id}`,
            priorAI = ai,
            next = api.SpinnerNativeField.initializeEnclosure({
                compositeId,
                groupId: group.id,
                owners: group.memberIds,
                layers: [
                    { id: `${compositeId}-inner`, vertices, core: center, gate: { x: center.x - 3, y: center.y } },
                ],
                fallbackLine: { fieldId: plan.fieldId, anchors: plan.anchors },
                scenario: "ordinary-rollout",
                map: api.SpinnerNativeField.mapSnapshot(),
            });
        next.autonomous = true;
        next.rolloutKind = snapshot.kind;
        next.ai = priorAI;
        const enclosure = next.topology.kind === "enclosure";
        plan.kind = enclosure ? "enclosure" : "line";
        plan.fieldIds = enclosure ? [...(next.topology.composites?.[compositeId]?.layerIds || [])] : [plan.fieldId];
        if (enclosure) plan.compositeId = compositeId;
        const decisions = {
            [group.id]: {
                groupId: group.id,
                planId: plan.id,
                kind: enclosure ? "enclosure" : "line-fallback",
                core: center,
                vertices,
            },
        };
        for (const otherGroup of Object.values(priorAI.groups || {})) {
            if (otherGroup.id === group.id) continue;
            const otherPlan = priorAI.plans?.[otherGroup.planId];
            if (!otherPlan?.anchors?.length) continue;
            const otherCenter = {
                    x: Math.round((otherPlan.anchors[0].x + otherPlan.anchors.at(-1).x) / 2),
                    y: Math.round((otherPlan.anchors[0].y + otherPlan.anchors.at(-1).y) / 2),
                },
                otherComposite = `rollout-${otherGroup.id}`,
                otherVertices = [
                    { x: otherCenter.x - 3, y: otherCenter.y - 3 },
                    { x: otherCenter.x + 3, y: otherCenter.y - 3 },
                    { x: otherCenter.x + 3, y: otherCenter.y + 3 },
                    { x: otherCenter.x - 3, y: otherCenter.y + 3 },
                ],
                partial = api.SpinnerTopology.createEnclosure({
                    compositeId: otherComposite,
                    owners: otherGroup.memberIds,
                    layers: [
                        {
                            id: `${otherComposite}-inner`,
                            vertices: otherVertices,
                            core: otherCenter,
                            gate: { x: otherCenter.x - 3, y: otherCenter.y },
                        },
                    ],
                    fallbackLine: { fieldId: otherPlan.fieldId, anchors: otherPlan.anchors },
                    map: api.SpinnerNativeField.mapSnapshot(),
                });
            if (partial.kind === "enclosure") {
                const existing = next.topology,
                    fields = [
                        ...Object.values(existing.fields || {}),
                        ...Object.values(existing.lineFields || {}),
                        ...Object.values(partial.fields || {}),
                        ...Object.values(partial.lineFields || {}),
                    ].map((field) => ({ id: field.id, type: field.type || "line", vertices: field.vertices })),
                    combined = api.SpinnerTopology.createPhysicalGraph({
                        fields,
                        owners: [...existing.owners, ...partial.owners],
                    });
                Object.assign(combined, {
                    kind: "graph",
                    fields: { ...(existing.fields || {}), ...(partial.fields || {}) },
                    composites: { ...(existing.composites || {}), ...(partial.composites || {}) },
                    fieldOwners: { ...(existing.fieldOwners || {}), ...(partial.fieldOwners || {}) },
                    lineFields: { ...(existing.lineFields || {}), ...(partial.lineFields || {}) },
                });
                next.topology = combined;
                otherPlan.kind = "enclosure";
                otherPlan.compositeId = otherComposite;
                otherPlan.fieldIds = [...(partial.composites?.[otherComposite]?.layerIds || [])];
            } else {
                api.SpinnerNativeField.addLine({
                    fieldId: otherPlan.fieldId,
                    owners: otherGroup.memberIds,
                    anchors: otherPlan.anchors,
                    scenario: "ordinary-rollout",
                });
                otherPlan.kind = "line";
                otherPlan.fieldIds = [otherPlan.fieldId];
            }
            decisions[otherGroup.id] = {
                groupId: otherGroup.id,
                planId: otherPlan.id,
                kind: partial.kind === "enclosure" ? "enclosure" : "line-fallback",
                core: otherCenter,
                vertices: otherVertices,
            };
        }
        api.SpinnerNativeField.reconcile();
        snapshot.enclosureDecisions = decisions;
        return decisions;
    }

    if (typeof KDEventMapGeneric !== "undefined" && typeof KDAddEvent === "function") {
        KDAddEvent(KDEventMapGeneric, "postMapgen", FIELD, () => snapshotMap());
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", FIELD, restore);
    }

    api.SpinnerRollout = Object.freeze({
        FIELD,
        VERSION,
        eligibility,
        snapshotMap,
        activate,
        restore,
        preparePositiveTurn,
    });
})();
