"use strict";

// One Spinner enemy-loop owner delegates to construction, legacy training capture, then the native loop.
(() => {
    const api = globalThis.Spiderlings,
        KEY = "SpiderlingsSpinnerRuntime";

    if (typeof KinkyDungeonEnemyLoop === "function")
        KinkyDungeonEnemyLoop = api.Hooks.wrap(
            "Spinner.runtime",
            KinkyDungeonEnemyLoop,
            (native) =>
                function (enemy, target, delta) {
                    if (api.SpinnerNativeField.isOwnedProxy(enemy))
                        return { idle: true, defeat: false, defeatEnemy: enemy };
                    const nativeField = api.SpinnerNativeField.handleEnemyTurn(enemy, target, delta);
                    if (nativeField) return nativeField;
                    const legacyField = api.SpinnerField.handleEnemyTurn(enemy, target, delta);
                    if (legacyField) return legacyField;
                    const capture = api.SpinnerCapture.handleEnemyTurn(enemy, target, delta);
                    if (capture) return capture;
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
                    return api.SpinnerAI?.handleBeforeMove(enemy, target, aiData) || false;
                },
        );
    }

    if (typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "tick", KEY, (_event, data) => api.SpinnerAI?.preparePositiveTurn(data?.delta));
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) =>
            api.SpinnerNativeField.onNativeDamage(data),
        );
        KDAddEvent(KDEventMapGeneric, "playerMove", KEY, (_event, data) => {
            if (!data?.cancelmove) api.SpinnerNativeField.onEntry(KinkyDungeonPlayerEntity, data.moveX, data.moveY);
        });
        KDAddEvent(KDEventMapGeneric, "enemyMove", KEY, (_event, data) => {
            if (!data?.cancelmove) api.SpinnerNativeField.onEntry(data.enemy, data.moveX, data.moveY);
        });
        KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => api.SpinnerNativeField.tick(data?.delta));
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
            api.SpinnerAI?.restoreAfterLoad();
            api.SpinnerNativeField.reconcile();
        });
    }

    api.SpinnerRuntime = { KEY };
})();
