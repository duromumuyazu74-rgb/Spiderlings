"use strict";

// Native damage owns HP, shields and defeat. Sustained owned silk permits a
// nonlethal departure, with time for native struggle or another actor to untie it.
(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsNPCWrapping";
    const DAMAGE_MULTIPLIER = 1;
    const DEPARTURE_TURNS = 6;
    const SPIDERS = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]);
    const entities = () => (typeof KDMapData === "undefined" ? [] : KDMapData.Entities || []);
    function protectedTarget(target) {
        const tags = target?.Enemy?.tags || {};
        const persistent =
            typeof globalThis.KDIsNPCPersistent === "function" && globalThis.KDIsNPCPersistent(target?.id)
                ? globalThis.KDGetPersistentNPC(target.id)
                : undefined;
        if (api.HuntingGrounds?.active?.()) {
            const capturable =
                typeof KDCapturable === "function"
                    ? KDCapturable(target)
                    : target?.Enemy?.bound &&
                      !target.Enemy.allied &&
                      !["skeleton", "construct", "nobrain", "nocapture"].some((tag) => tags[tag]);
            return !!(
                !target ||
                target.player ||
                !(target.hp > 0) ||
                !capturable ||
                persistent?.alwaysEscape ||
                api.SpinnerNativeField?.isOwnedProxy?.(target)
            );
        }
        return !!(
            !target ||
            target.player ||
            !target.Enemy?.bound ||
            !(target.hp > 0) ||
            tags.nocapture ||
            tags.scenery ||
            tags.structure ||
            tags.quest ||
            target.Enemy.immobile ||
            target.runSpawnAI ||
            api.SpinnerNativeField?.isOwnedProxy?.(target) ||
            target.Enemy.specialdialogue ||
            target.Enemy.data?.shop ||
            target.data?.shop ||
            target.shop ||
            persistent?.alwaysEscape ||
            (typeof KDIsInParty === "function" && KDIsInParty(target)) ||
            (typeof KDIsServant === "function" && KDIsServant(KDGameData?.Collection?.[String(target.id)])) ||
            (typeof KDEnemyHasFlag === "function" &&
                ["Shop", "shop", "questtarget"].some((flag) => KDEnemyHasFlag(target, flag)))
        );
    }

    function targetEligible(target) {
        if (!entities().includes(target) || protectedTarget(target)) return false;
        const rivals = entities().filter((candidate) => SPIDERS.has(candidate.Enemy?.name));
        const silkSource = api.NPCAdhesion?.silkSource?.(target);
        return rivals.length
            ? rivals.some((rival) => KDHostile(rival, target))
            : !!silkSource && KDHostile(silkSource, target);
    }

    function vulnerable(target) {
        return (
            targetEligible(target) &&
            ((api.NPCAdhesion?.status(target) === "full" && api.NPCAdhesion.hasAttributedSilk(target)) ||
                (typeof KDHelpless === "function" &&
                    KDHelpless(target) &&
                    api.NPCAdhesion?.hasSpiderHelplessness(target)))
        );
    }

    function preemptNativeCapture() {
        for (const old of Object.values(api.SpinnerNPCCapture?.records?.() || {})) {
            const target = entities().find((candidate) => String(candidate.id) === String(old.targetId));
            if (vulnerable(target)) api.SpinnerNPCCapture.releaseForWrapping(target);
        }
    }

    function clearTemporary() {
        if (typeof KDMapData !== "undefined") delete KDMapData[KEY];
    }

    function auditDeparture(target) {
        if (!vulnerable(target)) {
            delete target[KEY];
            return undefined;
        }
        return target[KEY]?.version === 2 ? target[KEY] : undefined;
    }

    function afterLoad() {
        // Retire the old three-contribution map ledger without affecting native
        // binding or HP. The current entity timer survives native zero-time load.
        clearTemporary();
        for (const target of entities()) auditDeparture(target);
        preemptNativeCapture();
    }

    function tick(delta) {
        if (!(delta > 0)) return;
        const nativeTick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : undefined;
        for (const target of [...entities()]) {
            let progress = auditDeparture(target);
            if (!vulnerable(target)) continue;
            if (!progress) target[KEY] = progress = { version: 2, remaining: DEPARTURE_TURNS };
            if (nativeTick !== undefined && progress.lastNativeTick === nativeTick) continue;
            progress.lastNativeTick = nativeTick;
            progress.remaining = Math.max(0, progress.remaining - delta);
            if (progress.remaining > 0) continue;
            // No death bursts, kill credit or permanent collection. Native hooks
            // can veto removal; a veto leaves HP, binding and stolen items intact.
            if (KDRemoveEntity(target, false) && !entities().includes(target)) {
                if (typeof KDDropStolenItems === "function") KDDropStolenItems(target, KDMapData);
                delete target[KEY];
            }
        }
    }

    // Retain the runtime facade for old callers. Physical silk artwork supplies
    // the visible feedback; no design-policy labels are drawn over NPCs.
    function draw() {}

    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined")
        KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => tick(data?.delta));

    api.NPCWrapping = Object.freeze({
        DAMAGE_MULTIPLIER,
        DEPARTURE_TURNS,
        targetEligible,
        vulnerable,
        preemptNativeCapture,
        afterLoad,
        tick,
        draw,
        clearTemporary,
    });
})();
