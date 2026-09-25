"use strict";

// One Spinner enemy-loop owner delegates to capture, construction, then the native loop.
(() => {
    const api = globalThis.Spiderlings,
        KEY = "SpiderlingsSpinnerRuntime";

    if (typeof KinkyDungeonEnemyLoop === "function")
        KinkyDungeonEnemyLoop = api.Hooks.wrap(
            "Spinner.runtime",
            KinkyDungeonEnemyLoop,
            (native) =>
                function (enemy, target, delta) {
                    target = api.SpinnerScenarios?.resolveTarget?.(enemy, target) || target;
                    target = api.Infestation?.resolveNestDefenderTarget?.(enemy, target) || target;
                    arguments[1] = target;
                    if (api.SpinnerNativeField.isOwnedProxy(enemy))
                        return { idle: true, defeat: false, defeatEnemy: enemy };
                    const recovery = api.SpinnerRecovery?.handleEnemyTurn(enemy, target, delta);
                    if (recovery) return recovery;
                    const capture = api.SpinnerCapture.handleEnemyTurn(enemy, target, delta);
                    if (capture) return capture;
                    if (delta > 0) api.NPCWrapping?.preemptNativeCapture?.();
                    const npcCapture = api.SpinnerNPCCapture?.handleEnemyTurn(enemy, target, delta);
                    if (npcCapture) return npcCapture;
                    const npcRecovery = api.SpinnerNPCRecovery?.handleEnemyTurn(enemy, target, delta);
                    if (npcRecovery) return npcRecovery;
                    const npcWrapping = api.NPCWrapping?.handleEnemyTurn(enemy, target, delta);
                    if (npcWrapping) return npcWrapping;
                    const nativeField = api.SpinnerNativeField.handleEnemyTurn(enemy, target, delta);
                    if (nativeField) return nativeField;
                    const legacyField = api.SpinnerField.handleEnemyTurn(enemy, target, delta);
                    if (legacyField) return legacyField;
                    enemy.SpiderlingsSpinnerRuntimeDelta = delta;
                    try {
                        return native.apply(this, arguments);
                    } finally {
                        delete enemy.SpiderlingsSpinnerRuntimeDelta;
                    }
                },
        );

    if (typeof KDAIType !== "undefined" && KDAIType.hunt?.beforemove) {
        KDAIType.hunt.beforemove = api.Hooks.wrap(
            "Spinner.beforemove",
            KDAIType.hunt.beforemove,
            (native) =>
                function (enemy, target, aiData) {
                    const nativeResult = native.apply(this, arguments);
                    if (nativeResult) return nativeResult;
                    const handled = api.SpinnerAI?.handleBeforeMove(enemy, target, aiData) || false;
                    // KD clears movement credit for idle enemies after the loop.
                    // Construction and lure turns must retain credit across ticks.
                    if (handled) aiData.idle = false;
                    return handled;
                },
        );
    }

    for (const phase of ["attack", "spell"])
        if (typeof KDAIType !== "undefined" && KDAIType.hunt?.[phase])
            KDAIType.hunt[phase] = api.Hooks.wrap(
                `Spinner.${phase}`,
                KDAIType.hunt[phase],
                (native) =>
                    function (enemy) {
                        if (api.SpinnerAI && !api.SpinnerAI.gateNativePhase(enemy, phase)) return false;
                        return native.apply(this, arguments);
                    },
            );

    if (typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "tick", KEY, (_event, data) => {
            api.SpinnerAI?.preparePositiveTurn(data?.delta);
            if (data?.delta > 0) api.SpinnerRollout?.preparePositiveTurn();
            api.SpinnerNPCCapture?.prepareTurn(data?.delta);
            api.NPCWrapping?.prepareTurn(data?.delta);
        });
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) =>
            api.SpinnerNativeField.onNativeDamage(data),
        );
        KDAddEvent(KDEventMapGeneric, "playerMove", KEY, (_event, data) => {
            if (!data?.cancelmove) {
                api.WebMobility?.invalidateNavigation();
                api.SpinnerRecovery?.onPlayerMove(data);
                api.SpinnerNativeField.onEntry(KinkyDungeonPlayerEntity, data.moveX, data.moveY);
            }
        });
        KDAddEvent(KDEventMapGeneric, "enemyMove", KEY, (_event, data) => {
            if (!data?.cancelmove) {
                api.WebMobility?.invalidateNavigation();
                api.SpinnerNPCRecovery?.onEnemyMove(data);
                api.SpinnerNativeField.onEntry(data.enemy, data.moveX, data.moveY);
            }
        });
        KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => {
            api.SpinnerAI?.completePositiveTurn(data?.delta);
            api.SpinnerNativeField.tick(data?.delta);
            api.SpinnerRecovery?.audit();
            api.SpinnerNPCCapture?.settleTurn(data?.delta);
            if (data?.delta > 0) api.SpinnerNPCRecovery?.audit();
            api.NPCWrapping?.tickAfter(data?.delta);
        });
        KDAddEvent(KDEventMapGeneric, "postRemoval", KEY, () => {
            api.SpinnerRecovery?.audit();
            api.SpinnerNPCCapture?.auditSources();
            api.SpinnerNPCRecovery?.audit();
            api.NPCWrapping?.audit();
        });
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
            api.WebMobility?.invalidateNavigation();
            api.SpinnerAI?.restoreAfterLoad();
            api.SpinnerNativeField.reconcile();
            api.SpinnerRecovery?.afterLoad();
            api.SpinnerNPCCapture?.afterLoad();
            api.SpinnerNPCRecovery?.afterLoad();
            api.NPCWrapping?.afterLoad();
        });
        KDAddEvent(KDEventMapGeneric, "draw", KEY, (_event, data) => {
            api.SpinnerNPCCapture?.draw(data);
            api.SpinnerNPCRecovery?.draw(data);
            api.NPCWrapping?.draw(data);
        });
        for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterNewGame"])
            KDAddEvent(KDEventMapGeneric, trigger, KEY, () => {
                api.SpinnerRecovery?.clearControl();
                api.SpinnerNPCCapture?.clearTemporary();
                api.SpinnerNPCRecovery?.clearTemporary();
                api.NPCWrapping?.clearTemporary();
            });
    }

    api.SpinnerRuntime = { KEY };
})();
