"use strict";

// Spinner map, capture and recovery events; NativeActions owns shared enemy phases.
(() => {
    const api = globalThis.Spiderlings,
        KEY = "SpiderlingsSpinnerRuntime";
    api.NativeActions.install();

    if (typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "tick", KEY, (_event, data) => {
            api.FieldCustody?.observe();
            api.SpinnerAI?.preparePositiveTurn(data?.delta);
            if (data?.delta > 0) api.FieldCustody?.prepare();
            if (data?.delta > 0) api.SpinnerRollout?.preparePositiveTurn();
            api.SpinnerNPCCapture?.prepareTurn(data?.delta);
            if (data?.delta > 0) api.NPCWrapping?.preemptNativeCapture();
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
            api.FieldCustody?.observe();
            api.SpinnerRecovery?.audit();
            api.SpinnerNPCCapture?.settleTurn(data?.delta);
            if (data?.delta > 0) api.SpinnerNPCRecovery?.audit();
        });
        KDAddEvent(KDEventMapGeneric, "postRemoval", KEY, () => {
            api.SpinnerRecovery?.audit();
            api.SpinnerNPCCapture?.auditSources();
            api.SpinnerNPCRecovery?.audit();
        });
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
            api.WebMobility?.invalidateNavigation(true);
            api.SpinnerAI?.restoreAfterLoad();
            api.SpinnerDuties?.restore();
            api.SpinnerNativeField.afterLoad?.();
            api.SpinnerNativeField.reconcile();
            api.SpinnerRecovery?.afterLoad();
            api.SpinnerNPCCapture?.afterLoad();
            api.SpinnerNPCRecovery?.afterLoad();
            api.NPCWrapping?.afterLoad();
            api.FieldCustody?.observe();
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
