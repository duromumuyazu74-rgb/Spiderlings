"use strict";

// Native damage owns HP, shields and defeat. Silk exposure never consumes an
// attacker operation or removes a living NPC after a fixed number of turns.
(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsNPCWrapping";
    const DAMAGE_MULTIPLIER = 4;
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

    function afterLoad() {
        // Old progress was a nonlethal exit countdown, not physical binding.
        // Discard it while retaining the NPC's native silk and HP.
        clearTemporary();
        preemptNativeCapture();
    }

    function draw(data) {
        if (!data || typeof DrawTextFitKDTo !== "function" || typeof kdenemystatusboard === "undefined") return;
        const size = KinkyDungeonGridSizeDisplay;
        const pans = typeof StandalonePatched !== "undefined" && StandalonePatched;
        for (const target of entities()) {
            if (
                !vulnerable(target) ||
                (typeof KDCanSeeEnemy === "function" && !KDCanSeeEnemy(target)) ||
                (typeof KinkyDungeonVisionGet === "function" && !(KinkyDungeonVisionGet(target.x, target.y) > 0))
            )
                continue;
            DrawTextFitKDTo(
                kdenemystatusboard,
                TextGet("SpiderlingsNPCWrapping"),
                (target.x - data.CamX - (pans ? 0 : data.CamX_offset) + 0.5) * size,
                (target.y - data.CamY - (pans ? 0 : data.CamY_offset) + 0.15) * size,
                size * 1.5,
                "#ffd7ed",
                "#231527",
                13,
            );
        }
    }

    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined")
        KDAddEvent(KDEventMapGeneric, "duringDamageEnemy", KEY, (_event, data) => {
            // KD has resolved resistance and the contact cap, but not shield/HP
            // payment. Zero-damage binding and immunities remain zero.
            if (data.dmgDealt > 0 && vulnerable(data.enemy)) data.dmgDealt *= DAMAGE_MULTIPLIER;
        });

    api.NPCWrapping = Object.freeze({
        DAMAGE_MULTIPLIER,
        targetEligible,
        vulnerable,
        preemptNativeCapture,
        afterLoad,
        draw,
        clearTemporary,
    });
})();
