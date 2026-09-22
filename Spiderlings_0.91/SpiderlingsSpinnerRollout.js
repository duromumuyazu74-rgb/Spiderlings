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
        if (!snapshot?.enabled || snapshot.enclosureDecision || !ai) return snapshot?.enclosureDecision;
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
        if (enclosure) plan.compositeId = compositeId;
        snapshot.enclosureDecision = {
            groupId: group.id,
            planId: plan.id,
            kind: enclosure ? "enclosure" : "line-fallback",
            core: center,
            vertices,
        };
        return snapshot.enclosureDecision;
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
