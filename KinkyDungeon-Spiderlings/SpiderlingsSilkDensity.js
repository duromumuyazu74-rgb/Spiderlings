"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsSilkDensity";
    const species = new Set([
        "Spinner",
        "Jumper",
        "WebCaster",
        "Tunneler",
        "MageSpiderlings",
        "NestEntrance",
        "SpiderlingsMatriarch",
    ]);
    let trailTick;
    const trailSources = new Set();

    function state() {
        if (typeof KDGameData === "undefined" || !KDGameData) return undefined;
        return (KDGameData[KEY] ||= { version: 1, value: 0, bareTurns: 0 });
    }

    const owns = (item) => typeof item?.name === "string" && item.name.startsWith("Spiderlings");

    function syncHud() {
        const current = state();
        if (!(current?.value > 0) || typeof KinkyDungeonApplyBuffToEntity !== "function") {
            if (typeof KinkyDungeonExpireBuff === "function" && typeof KinkyDungeonPlayerEntity !== "undefined")
                KinkyDungeonExpireBuff(KinkyDungeonPlayerEntity, KEY);
            return;
        }
        KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
            id: KEY,
            type: KEY,
            power: 1,
            duration: 2,
            aura: "#d6c4e8",
            auraSprite: "Null",
            text: String(Math.floor(current.value)),
        });
    }

    function contact(source, kind = "direct") {
        if (!species.has(source?.Enemy?.name) || source.allied || source.Enemy.allied || source.ceasefire > 0)
            return false;
        if (typeof KDHostile === "function" && !KDHostile(source, KinkyDungeonPlayerEntity)) return false;
        const current = state();
        if (!current) return false;
        if (kind === "trail") {
            const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
            if (trailTick !== tick) {
                trailTick = tick;
                trailSources.clear();
            }
            if (trailSources.has(source.id)) return false;
            trailSources.add(source.id);
        }
        current.value += kind === "trail" ? 2 : 10;
        current.bareTurns = 0;
        current.contacted = true;
        syncHud();
        return true;
    }

    function advance(delta) {
        const current = state();
        if (!current || !(delta > 0)) return;
        // Retain the saved field name; it now counts quiet turns with or without restraints.
        if (current.contacted) current.bareTurns = 0;
        else {
            const before = Math.max(0, current.bareTurns - 10);
            current.bareTurns += delta;
            const after = Math.max(0, current.bareTurns - 10);
            current.value *= 2 ** (-(after ** 2 - before ** 2) / 144);
            if (current.value < 0.5) current.value = 0;
        }
        current.contacted = false;
        syncHud();
    }

    function escapeMultiplier() {
        return 1 + (state()?.value || 0) / 100;
    }

    function installEscape() {
        if (typeof KDAddDelayedAction !== "function") return;
        KDAddDelayedAction = api.Hooks.wrap(
            "SilkDensity.escapeWork",
            KDAddDelayedAction,
            (native) =>
                function (action) {
                    const item = action?.data?.escapeData?.restraint;
                    if (action?.commit === "Struggle" && owns(item) && action.data.amount > 0)
                        action = {
                            ...action,
                            data: { ...action.data, amount: action.data.amount / escapeMultiplier() },
                        };
                    return native.call(this, action);
                },
        );
    }

    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => advance(Number(data?.delta || 0)));
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
            trailSources.clear();
            trailTick = undefined;
            syncHud();
        });
        KDAddEvent(KDEventMapGeneric, "afterNewGame", KEY, () => {
            if (typeof KDGameData !== "undefined") delete KDGameData[KEY];
            syncHud();
        });
    }
    if (typeof addTextKey === "function") {
        addTextKey("KDBuffName_" + KEY, "Silk density");
        addTextKey(
            "KDBuffDesc_" + KEY,
            "Accumulated spider silk increases the escape work of Spiderlings restraints. It begins to disperse after ten world turns without a qualifying silk hit, even while restrained.",
        );
    }
    function refresh() {
        const current = state();
        if (!current) return false;
        current.bareTurns = 0;
        current.contacted = true;
        return true;
    }
    api.SilkDensity = Object.freeze({ state, contact, advance, escapeMultiplier, refresh });
    installEscape();
})();
