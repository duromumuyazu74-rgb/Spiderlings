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
                    return native.apply(this, arguments);
                },
        );

    if (typeof KDEventMapGeneric !== "undefined") {
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
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => api.SpinnerNativeField.reconcile());
    }

    api.SpinnerRuntime = { KEY };
})();
