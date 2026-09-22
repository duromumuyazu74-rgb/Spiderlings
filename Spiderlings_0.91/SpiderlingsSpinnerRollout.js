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

    if (typeof KDEventMapGeneric !== "undefined" && typeof KDAddEvent === "function") {
        KDAddEvent(KDEventMapGeneric, "postMapgen", FIELD, () => snapshotMap());
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", FIELD, restore);
    }

    api.SpinnerRollout = Object.freeze({ FIELD, VERSION, eligibility, snapshotMap, activate, restore });
})();
