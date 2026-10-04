"use strict";

(() => {
    const api = globalThis.Spiderlings;
    if (api.FloorSelection?.canBypassObjective) return;
    // Keep the native modifier with weight 800. Spider floors replace that one
    // modifier after its primary faction is known; they never replace the faction.
    const KEEP_WEIGHT = 800;
    const settings = {
        SpiderlingsInfestation: { refvar: "spiderlingsInfestationWeight", default: 200 },
        SpiderlingsHuntingGrounds: { refvar: "spiderlingsHuntingGroundsWeight", default: 1500 },
    };

    function weight(name) {
        const setting = settings[name];
        const value = String(api.getSetting?.(setting.refvar) ?? setting.default).trim();
        const numeric = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(numeric) ? numeric : setting.default;
    }

    const UPGRADE = "spiderlingsFloorWeights90";
    const JOURNEY_UPGRADE = "SpiderlingsFloorWeights90";
    function upgradeSettings() {
        if (typeof KDModSettings === "undefined" || !KDModSettings?.Spiderlings) return;
        const config = KDModSettings.Spiderlings;
        if (config[UPGRADE]) return;
        const changed = [];
        for (const [name, previous] of Object.entries({
            SpiderlingsInfestation: 50,
            SpiderlingsHuntingGrounds: 1000,
        })) {
            const setting = settings[name];
            if (String(config[setting.refvar]).trim() !== String(previous)) continue;
            config[setting.refvar] = String(setting.default);
            changed.push(name);
        }
        // Persist the marker as well: a later deliberate return to 50/1000 must survive reload.
        config[UPGRADE] = { changed };
        if (typeof localStorage !== "undefined") localStorage.setItem("KDModSettings", JSON.stringify(KDModSettings));
    }

    function upgradeJourney() {
        upgradeSettings();
        if (typeof KDGameData === "undefined" || !KDGameData.JourneyMap || KDGameData[JOURNEY_UPGRADE]) return;
        const changed = typeof KDModSettings !== "undefined" && KDModSettings?.Spiderlings?.[UPGRADE]?.changed;
        if (!changed?.some((name) => weight(name) === settings[name].default)) return;
        const entered = new Set(
            typeof KDWorldMap === "undefined"
                ? []
                : Object.values(KDWorldMap).map((world) => `${world.jx},${world.jy}`),
        );
        for (const slot of Object.values(KDGameData.JourneyMap)) {
            // KD 5.4.92 leaves visited=false even for entered maps. Protect the world cache and current depth too.
            if (
                slot.visited ||
                slot.y <= KDGameData.JourneyY ||
                entered.has(`${slot.x},${slot.y}`) ||
                settings[slot.MapMod]
            )
                continue;
            const previous = slot.MapMod;
            select(slot);
            if (slot.MapMod === previous) continue;
            // Side-room filters depend on the newly selected escape method, just as on native creation.
            slot.SideRooms = [];
            slot.HiddenRooms = {};
            for (const top of [true, false]) {
                const side = KDGetSideRoom(slot, top, slot.SideRooms);
                if (!side) continue;
                slot.SideRooms.push(side.name);
                if (side.hidden) slot.HiddenRooms[side.name] = true;
            }
        }
        KDGameData[JOURNEY_UPGRADE] = true;
    }

    function select(slot) {
        // Both supported native journeys place the first Boss on floor four.
        if (slot.type !== "basic" || slot.protected || slot.y < 5 || slot.RoomType || KDIsHellFloor(slot.y)) return;
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

    const DEBUG_BYPASS = "SpiderlingsDebugStairBypass";
    const grants = new Set();
    const grantSession = `${Date.now().toString(36)}:${Math.random().toString(36)}`;
    let grantOrdinal = 0;
    const bypassText = () => {
        const translated = typeof TextGet === "function" ? TextGet(DEBUG_BYPASS) : DEBUG_BYPASS;
        return translated !== DEBUG_BYPASS && !translated.startsWith("[NotFound]")
            ? translated
            : "Debug stair bypass is on. Marked nests are unchanged.";
    };
    const canBypassObjective = () =>
        typeof KDMapData !== "undefined" && !!settings[KDMapData.MapMod] && grants.has(KDMapData[DEBUG_BYPASS]);
    api.FloorSelection = { weight, canBypassObjective, bypassText };
    if (typeof addTextKey === "function")
        addTextKey(DEBUG_BYPASS, "Debug stair bypass is on. Marked nests are unchanged.");
    function grantDebugPass(map, result) {
        if (
            result === true &&
            map === KDMapData &&
            settings[map.MapMod] &&
            (api.Infestation?.activeState() || api.HuntingGrounds?.activeState()) &&
            KinkyDungeonPlayerEntity.x === map.EndPosition?.x &&
            KinkyDungeonPlayerEntity.y === map.EndPosition?.y
        ) {
            grants.delete(map[DEBUG_BYPASS]);
            map[DEBUG_BYPASS] = `${grantSession}:${++grantOrdinal}`;
            grants.add(map[DEBUG_BYPASS]);
        }
    }
    // 5.5.3 has a named callback; preserve the native action and only grant after success.
    if (typeof DrawButtonKDEx === "function" && !DrawButtonKDEx.SpiderlingsDebugStairsWrapped) {
        const nativeDrawButton = DrawButtonKDEx;
        DrawButtonKDEx = function (name, callback, ...args) {
            if (name !== "debugtelestairs") return nativeDrawButton.call(this, name, callback, ...args);
            return nativeDrawButton.call(
                this,
                name,
                function (...input) {
                    const map = KDMapData,
                        result = callback.apply(this, input);
                    grantDebugPass(map, result);
                    return result;
                },
                ...args,
            );
        };
        DrawButtonKDEx.SpiderlingsDebugStairsWrapped = true;
    }
    // 5.4.92 renders an unnamed button and handles this exact debug rectangle in
    // HUD. Verify that legacy branch exists, then preserve its actual mouse action.
    if (
        typeof KinkyDungeonHandleHUD === "function" &&
        /MouseIn\(\s*1100,\s*300,\s*300,\s*64\s*\)/.test(KinkyDungeonHandleHUD.toString())
    ) {
        const nativeHUD = KinkyDungeonHandleHUD;
        KinkyDungeonHandleHUD = function (...args) {
            const requested =
                    KinkyDungeonDrawState === "Restart" && TestMode && KDDebugMode && MouseIn(1100, 300, 300, 64),
                map = KDMapData;
            const result = nativeHUD.apply(this, args);
            if (requested) grantDebugPass(map, result);
            return result;
        };
    }
    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "beforeHandleStairs", "SpiderlingsDebugStairs", (_event, data) => {
            if (data.AdvanceAmount !== 0 && typeof KDMapData !== "undefined") {
                grants.delete(KDMapData[DEBUG_BYPASS]);
                delete KDMapData[DEBUG_BYPASS];
            }
        });
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", "SpiderlingsDebugStairs", () => {
            grants.clear();
            if (typeof KDMapData !== "undefined") delete KDMapData[DEBUG_BYPASS];
        });
    }
    if (
        typeof KDJourneySlotTypes === "undefined" ||
        typeof KDJourneySlotTypes.basic !== "function" ||
        typeof KDGetSideRoom !== "function" ||
        KDJourneySlotTypes.basic.SpiderlingsFloorSelectionWrapped
    )
        return;

    // Native KD reads persisted settings only after executing every Mod script.
    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "afterModSettingsLoad", JOURNEY_UPGRADE, upgradeSettings);
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", JOURNEY_UPGRADE, upgradeJourney);
        KDAddEvent(KDEventMapGeneric, "afterNewGame", JOURNEY_UPGRADE, () => {
            KDGameData[JOURNEY_UPGRADE] = true;
        });
    }

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
