"use strict";
/* global KinkyDungeonTransparentMovableObjects */

// Wrapping spends native enemy-loop opportunities. KD owns the actual nonlethal
// removal, including stolen items and persistent NPC state.
(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsNPCWrapping";
    const VERSION = 1;
    const ACTIONS = 3;
    const SPIDERS = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]);
    let acted = new Set();
    let exiting = new Set();
    let lines;

    const entities = () => (typeof KDMapData === "undefined" ? [] : KDMapData.Entities || []);
    const entity = (id) => entities().find((candidate) => String(candidate.id) === String(id));
    const state = () => (typeof KDMapData === "undefined" ? undefined : KDMapData[KEY]);
    const records = () => state()?.records || {};
    const record = (target) => records()[String(target?.id ?? target)];
    const result = (source) => ({ idle: false, defeat: false, defeatEnemy: source });
    const slime = (target) => Math.max(0, Number(target?.specialBoundLevel?.Slime || 0));

    function ensureState() {
        if (!state() || state().version !== VERSION)
            KDMapData[KEY] = { version: VERSION, records: {}, paidSourceIds: [] };
        return state();
    }

    function clear(target) {
        if (!state()) return;
        delete state().records[String(target?.id ?? target)];
        if (!Object.keys(state().records).length && !state().paidSourceIds?.length) delete KDMapData[KEY];
    }

    function protectedTarget(target) {
        const tags = target?.Enemy?.tags || {};
        const persistent =
            typeof globalThis.KDIsNPCPersistent === "function" && globalThis.KDIsNPCPersistent(target?.id)
                ? globalThis.KDGetPersistentNPC(target.id)
                : undefined;
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
        const rivals = entities().filter((candidate) => SPIDERS.has(candidate.Enemy?.name));
        return (
            entity(target?.id) === target &&
            !protectedTarget(target) &&
            (!rivals.length || rivals.some((rival) => KDHostile(rival, target)))
        );
    }

    function sourceEligible(source, target) {
        if (
            !source ||
            entity(source.id) !== source ||
            !SPIDERS.has(source.Enemy?.name) ||
            !(source.hp > 0) ||
            source.Enemy.noAttack ||
            source.Enemy.immobile ||
            [source.stun, source.freeze, source.disarm, source.channel, source.teleporting].some((n) => n > 0) ||
            (typeof KinkyDungeonIsDisabled === "function" && KinkyDungeonIsDisabled(source)) ||
            (typeof KDHelpless === "function" && KDHelpless(source)) ||
            api.SpinnerNPCCapture?.usesSource?.(source.id) ||
            api.SpinnerRecovery?.sourceIds?.().some((id) => String(id) === String(source.id)) ||
            !KDHostile(source, target)
        )
            return false;
        const dx = Math.abs(source.x - target.x);
        const dy = Math.abs(source.y - target.y);
        if (
            dx === 1 &&
            dy === 1 &&
            typeof KinkyDungeonMapGet === "function" &&
            (typeof KinkyDungeonTransparentMovableObjects === "string" ||
                Array.isArray(KinkyDungeonTransparentMovableObjects)) &&
            !KinkyDungeonTransparentMovableObjects.includes(KinkyDungeonMapGet(source.x, target.y)) &&
            !KinkyDungeonTransparentMovableObjects.includes(KinkyDungeonMapGet(target.x, source.y))
        )
            return false;
        return (
            Math.max(dx, dy) === 1 &&
            (typeof KinkyDungeonCheckPath !== "function" ||
                KinkyDungeonCheckPath(source.x, source.y, target.x, target.y, false, false))
        );
    }

    function fullPin(target) {
        return api.NPCAdhesion?.status(target) === "full" && api.NPCAdhesion.hasAttributedSilk(target);
    }

    function helpless(target) {
        return typeof KDHelpless === "function" && KDHelpless(target) && api.NPCAdhesion?.hasAttributedSilk(target);
    }

    function preemptNativeCapture() {
        for (const old of Object.values(api.SpinnerNPCCapture?.records?.() || {})) {
            const target = entity(old.targetId);
            if (targetEligible(target) && fullPin(target)) api.SpinnerNPCCapture.releaseForWrapping(target);
        }
    }

    function audit() {
        for (const value of Object.values(records())) {
            const target = entity(value.targetId);
            if (!targetEligible(target) || target.x !== value.x || target.y !== value.y) {
                clear(value.targetId);
                continue;
            }
            if (value.progress > 0) {
                if (!fullPin(target) && !helpless(target)) value.progress = 0;
                if (slime(target) < value.lastSlime) {
                    value.progress = 0;
                    value.helplessTurns = 0;
                }
                value.sourceIds = (value.sourceIds || []).filter((id) => sourceEligible(entity(id), target));
                if (!value.sourceIds.length) value.progress = 0;
                if (!value.progress) value.sourceIds = [];
            }
            if (slime(target) < value.lastSlime) value.helplessTurns = 0;
            value.lastSlime = slime(target);
            if (!value.progress && !helpless(target)) clear(value.targetId);
        }
    }

    function tryExit(target) {
        if (!targetEligible(target) || exiting.has(target.id)) return false;
        exiting.add(target.id);
        try {
            // KD sends removeEnemy before mutating the entity. A cancelled event
            // leaves the completed record to retry without charging another action.
            const removed = KDRemoveEntity(target, false, true);
            if (removed) {
                clear(target);
                api.SpinnerNPCCapture?.auditSources?.();
                api.SpinnerNPCRecovery?.audit?.();
            }
            return removed;
        } finally {
            exiting.delete(target.id);
        }
    }

    function handleEnemyTurn(source, nativeTarget, delta) {
        if (!(delta > 0) || !SPIDERS.has(source?.Enemy?.name) || acted.has(source.id)) return undefined;
        audit();
        const candidates = [];
        const wrappable = (target) => fullPin(target) || helpless(target);
        if (nativeTarget && wrappable(nativeTarget) && targetEligible(nativeTarget)) candidates.push(nativeTarget);
        for (const target of entities())
            if (target !== nativeTarget && wrappable(target) && targetEligible(target)) candidates.push(target);
        candidates.sort((a, b) => {
            if (a === nativeTarget) return -1;
            if (b === nativeTarget) return 1;
            return (
                Math.max(Math.abs(source.x - a.x), Math.abs(source.y - a.y)) -
                Math.max(Math.abs(source.x - b.x), Math.abs(source.y - b.y))
            );
        });
        const target = candidates.find((candidate) => sourceEligible(source, candidate));
        if (!target) return undefined;
        let value = record(target);
        if (!value) {
            value = {
                version: VERSION,
                targetId: target.id,
                x: target.x,
                y: target.y,
                progress: 0,
                sourceIds: [],
                lastSlime: slime(target),
                helplessTurns: 0,
            };
            ensureState().records[String(target.id)] = value;
        }
        // Construction uses this same native movement credit. Waiting for the
        // threshold still occupies this loop opportunity, so no second action
        // can spend the accrued credit in the same world turn.
        if (!api.SpinnerNativeField?.accrueConstructionAction?.(source, delta)) {
            acted.add(source.id);
            ensureState().paidSourceIds.push(source.id);
            return result(source);
        }
        if (value.progress < ACTIONS) {
            value.progress++;
            if (!value.sourceIds.some((id) => String(id) === String(source.id))) value.sourceIds.push(source.id);
        }
        value.lastSlime = slime(target);
        acted.add(source.id);
        ensureState().paidSourceIds.push(source.id);
        if (value.progress >= ACTIONS) tryExit(target);
        return result(source);
    }

    function tickAfter(delta) {
        if (!(delta > 0)) return;
        audit();
        for (const target of [...entities()]) {
            if (!targetEligible(target) || !helpless(target)) continue;
            let value = record(target);
            if (!value) {
                value = {
                    version: VERSION,
                    targetId: target.id,
                    x: target.x,
                    y: target.y,
                    progress: 0,
                    sourceIds: [],
                    lastSlime: slime(target),
                    helplessTurns: 0,
                };
                ensureState().records[String(target.id)] = value;
            }
            if (value.progress >= ACTIONS || ++value.helplessTurns >= ACTIONS) tryExit(target);
        }
        for (const value of Object.values(records())) if (!helpless(entity(value.targetId))) value.helplessTurns = 0;
    }

    function prepareTurn(delta) {
        if (!(delta > 0)) return;
        acted = new Set();
        if (state()) {
            state().paidSourceIds = [];
            if (!Object.keys(records()).length) delete KDMapData[KEY];
        }
        preemptNativeCapture();
        audit();
    }

    function onDisplacement(target) {
        clear(target);
    }

    function afterLoad() {
        acted = new Set(Array.isArray(state()?.paidSourceIds) ? state().paidSourceIds : []);
        exiting = new Set();
        clearLines();
        if (!state()) return;
        if (
            state().version !== VERSION ||
            !state().records ||
            typeof state().records !== "object" ||
            !Array.isArray(state().paidSourceIds)
        ) {
            delete KDMapData[KEY];
            return;
        }
        for (const value of Object.values(records()))
            if (
                value?.version !== VERSION ||
                value.targetId === undefined ||
                !Number.isInteger(value.progress) ||
                value.progress < 0 ||
                value.progress > ACTIONS ||
                !Number.isInteger(value.helplessTurns) ||
                value.helplessTurns < 0 ||
                !Array.isArray(value.sourceIds)
            )
                clear(value?.targetId);
        audit();
    }

    function clearLines() {
        if (lines && !lines.destroyed) {
            lines.parent?.removeChild(lines);
            lines.destroy();
        }
        lines = undefined;
    }

    function draw(data) {
        if (!data || typeof PIXI === "undefined" || typeof kdgameboard === "undefined") return;
        const active = Object.values(records()).filter(
            (value) => (value.progress > 0 || value.helplessTurns > 0) && entity(value.targetId),
        );
        if (!active.length) {
            if (lines) lines.visible = false;
            return;
        }
        if (!lines || lines.destroyed) {
            lines = new PIXI.Graphics();
            kdgameboard.addChild(lines);
        }
        const pink = api.getSetting?.("spiderlingsPinkWebbing") === true;
        lines.clear().lineStyle(2, pink ? 0xffc2df : 0xffffff, 1);
        lines.visible = true;
        const boardPans = typeof StandalonePatched !== "undefined" && StandalonePatched;
        const point = (subject) => [
            (subject.x - data.CamX - (boardPans ? 0 : data.CamX_offset) + 0.5) * KinkyDungeonGridSizeDisplay,
            (subject.y - data.CamY - (boardPans ? 0 : data.CamY_offset) + 0.5) * KinkyDungeonGridSizeDisplay,
        ];
        for (const value of active) {
            const target = entity(value.targetId);
            for (const id of value.sourceIds) {
                const source = entity(id);
                if (source) lines.moveTo(...point(source)).lineTo(...point(target));
            }
            if (typeof DrawTextFitKDTo === "function" && typeof kdenemystatusboard !== "undefined") {
                const [x, y] = point(target);
                DrawTextFitKDTo(
                    kdenemystatusboard,
                    `${TextGet("SpiderlingsNPCWrapping")} ${Math.max(value.progress, value.helplessTurns)}/${ACTIONS}`,
                    x,
                    y - KinkyDungeonGridSizeDisplay * 0.4,
                    KinkyDungeonGridSizeDisplay * 1.5,
                    pink ? "#ffc2df" : "#ffffff",
                    "#231527",
                    13,
                );
            }
        }
    }

    if (typeof KDEnemyStruggleTurn === "function")
        KDEnemyStruggleTurn = api.Hooks.wrap(
            "NPCWrapping.struggle",
            KDEnemyStruggleTurn,
            (native) =>
                function (target) {
                    const before = slime(target);
                    const nativeResult = native.apply(this, arguments);
                    if (slime(target) < before) {
                        const value = record(target);
                        if (value) {
                            value.progress = 0;
                            value.helplessTurns = 0;
                            value.sourceIds = [];
                            value.lastSlime = slime(target);
                        }
                    }
                    return nativeResult;
                },
        );

    api.NPCWrapping = Object.freeze({
        KEY,
        ACTIONS,
        records,
        record,
        targetEligible,
        sourceEligible,
        preemptNativeCapture,
        handleEnemyTurn,
        prepareTurn,
        tickAfter,
        onDisplacement,
        afterLoad,
        audit,
        draw,
        clearTemporary: () => {
            if (typeof KDMapData !== "undefined") delete KDMapData[KEY];
            acted = new Set();
            clearLines();
        },
    });
})();
