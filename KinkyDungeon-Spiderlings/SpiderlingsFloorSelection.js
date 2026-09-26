"use strict";

(() => {
    const api = globalThis.Spiderlings;
    // Keep the native modifier with weight 800. Spider floors replace that one
    // modifier after its primary faction is known; they never replace the faction.
    const KEEP_WEIGHT = 800;
    const settings = {
        SpiderlingsInfestation: { refvar: "spiderlingsInfestationWeight", default: 50 },
        SpiderlingsHuntingGrounds: { refvar: "spiderlingsHuntingGroundsWeight", default: 1000 },
    };

    function weight(name) {
        const setting = settings[name];
        const value = String(api.getSetting?.(setting.refvar) ?? setting.default).trim();
        const numeric = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(numeric) ? numeric : setting.default;
    }

    function select(slot) {
        if (slot.type !== "basic" || slot.protected || slot.y < 3 || slot.RoomType || KDIsHellFloor(slot.y)) return;
        const candidates = Object.keys(settings)
            .map((name) => KDMapMods[name])
            .filter((mod) => mod && mod.weight > 0 && mod.filter(slot) > 0);
        if (!candidates.length) return;
        let roll = KDRandom() * (KEEP_WEIGHT + candidates.reduce((sum, mod) => sum + mod.weight, 0));
        for (const mod of candidates) {
            if (roll < mod.weight) {
                slot.MapMod = mod.name;
                slot.EscapeMethod = mod.escapeMethod;
                return;
            }
            roll -= mod.weight;
        }
    }

    api.FloorSelection = { weight };
    if (
        typeof KDJourneySlotTypes === "undefined" ||
        typeof KDJourneySlotTypes.basic !== "function" ||
        typeof KDGetSideRoom !== "function" ||
        KDJourneySlotTypes.basic.SpiderlingsFloorSelectionWrapped
    )
        return;

    let pending = false;
    const nativeBasic = KDJourneySlotTypes.basic;
    KDJourneySlotTypes.basic = function (...args) {
        // A cached pre-update spider candidate must not bypass faction selection.
        KDMapModRefreshList = KDMapModRefreshList.filter((mod) => !Object.hasOwn(settings, mod.name));
        const previous = pending;
        pending = true;
        try {
            return nativeBasic.apply(this, args);
        } finally {
            pending = previous;
        }
    };
    KDJourneySlotTypes.basic.SpiderlingsFloorSelectionWrapped = true;

    // KD 5.4.92 / 5.5.3 first call this after resolving the primary faction and
    // escape method. Select once before either side-room filter sees the slot.
    const nativeSideRoom = KDGetSideRoom;
    KDGetSideRoom = function (slot, ...args) {
        if (pending) {
            pending = false;
            select(slot);
        }
        return nativeSideRoom.call(this, slot, ...args);
    };
})();
