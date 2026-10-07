"use strict";

// One Spinner enemy-loop owner delegates to capture, construction, then the native loop.
(() => {
    const api = globalThis.Spiderlings,
        KEY = "SpiderlingsSpinnerRuntime";
    let nativeObserver;

    if (typeof globalThis.KinkyDungeonTrackSneak === "function")
        globalThis.KinkyDungeonTrackSneak = api.Hooks.wrap(
            "Spinner.playerContact",
            globalThis.KinkyDungeonTrackSneak,
            (native) =>
                function (enemy, delta, target) {
                    const result = native.apply(this, arguments);
                    if (
                        delta > 0 &&
                        nativeObserver?.enemy === enemy &&
                        nativeObserver.delta > 0 &&
                        target === KinkyDungeonPlayerEntity &&
                        result >= 0.5
                    )
                        api.SpinnerAI?.reportPlayerContact(
                            enemy,
                            target,
                            {
                                recognized: true,
                                canSensePlayer: true,
                                hostile: KDHostile(enemy, target),
                            },
                            nativeObserver.delta,
                        );
                    return result;
                },
        );

    if (typeof KinkyDungeonEnemyLoop === "function")
        KinkyDungeonEnemyLoop = api.Hooks.wrap(
            "Spinner.runtime",
            KinkyDungeonEnemyLoop,
            (native) =>
                function (enemy, target, delta) {
                    target = api.SpinnerScenarios?.resolveTarget?.(enemy, target) || target;
                    target = api.HuntingGrounds?.resolveNestDefenderTarget?.(enemy, target, delta) || target;
                    target = api.SpinnerAI?.recoveryTarget?.(enemy, target, delta) || target;
                    arguments[1] = target;
                    if (api.SpinnerNativeField.isOwnedProxy(enemy))
                        return { idle: true, defeat: false, defeatEnemy: enemy };
                    const duty = api.SpinnerDuties?.beginAction(enemy, target, delta);
                    const allowed = (handler) => !duty || api.SpinnerDuties.allows(enemy, handler);
                    const recovery = allowed("recovery") && api.SpinnerRecovery?.handleEnemyTurn(enemy, target, delta);
                    if (recovery) {
                        api.SpinnerDuties?.recordResult?.(enemy, recovery);
                        return recovery;
                    }
                    const capture = allowed("capture") && api.SpinnerCapture.handleEnemyTurn(enemy, target, delta);
                    if (capture) {
                        api.SpinnerDuties?.recordResult?.(enemy, capture);
                        return capture;
                    }
                    if (delta > 0) api.NPCWrapping?.preemptNativeCapture?.();
                    const npcCapture =
                        allowed("npcCapture") && api.SpinnerNPCCapture?.handleEnemyTurn(enemy, target, delta);
                    if (npcCapture) {
                        api.SpinnerDuties?.recordResult?.(enemy, npcCapture);
                        return npcCapture;
                    }
                    const npcRecovery =
                        allowed("npcRecovery") && api.SpinnerNPCRecovery?.handleEnemyTurn(enemy, target, delta);
                    if (npcRecovery) {
                        api.SpinnerDuties?.recordResult?.(enemy, npcRecovery);
                        return npcRecovery;
                    }
                    const nativeField = !duty && api.SpinnerNativeField.handleEnemyTurn(enemy, target, delta);
                    if (nativeField) return nativeField;
                    const legacyField = !duty && api.SpinnerField.handleEnemyTurn(enemy, target, delta);
                    if (legacyField) return legacyField;
                    enemy.SpiderlingsSpinnerRuntimeDelta = delta;
                    const previousObserver = nativeObserver;
                    nativeObserver = { enemy, delta };
                    try {
                        return native.apply(this, arguments);
                    } finally {
                        nativeObserver = previousObserver;
                        delete enemy.SpiderlingsSpinnerRuntimeDelta;
                    }
                },
        );

    // Native spawns may give a Spinner guard or another per-entity AI.
    // Commanded duties must intercept that selected AI, including absent native phases.
    if (typeof KDAIType !== "undefined")
        for (const [name, ai] of Object.entries(KDAIType)) {
            const moveOwner =
                name === "hunt"
                    ? "Spinner.beforemove"
                    : name === "wander"
                      ? "Spinner.wanderContact"
                      : `Spinner.beforemove.${name}`;
            ai.beforemove = api.Hooks.wrap(
                moveOwner,
                ai.beforemove || (() => false),
                (native) =>
                    function (enemy, target, aiData) {
                        api.SpinnerAI?.reportPlayerContact(enemy, target, aiData, enemy.SpiderlingsSpinnerRuntimeDelta);
                        if (api.SpinnerDuties?.current(enemy)) {
                            const handled = api.SpinnerDuties.beforeMove(enemy, target, aiData);
                            if (handled || !api.SpinnerDuties.allowsBeforeMove(enemy)) return handled;
                            return native.apply(this, arguments);
                        }
                        if (api.FieldCommand?.handleMove(enemy, enemy.SpiderlingsSpinnerRuntimeDelta)) {
                            aiData.idle = false;
                            return true;
                        }
                        const result = native.apply(this, arguments);
                        api.SpinnerAI?.reportPlayerContact(enemy, target, aiData, enemy.SpiderlingsSpinnerRuntimeDelta);
                        if (result || name !== "hunt") return result;
                        const handled = api.HuntingGrounds?.handleCrewMove?.(enemy, target, aiData) || false;
                        if (handled) aiData.idle = false;
                        return handled;
                    },
            );
            for (const phase of ["attack", "spell"])
                ai[phase] = api.Hooks.wrap(
                    name === "hunt" ? `Spinner.${phase}` : `Spinner.${phase}.${name}`,
                    ai[phase] || (() => true),
                    (native) =>
                        function (enemy) {
                            if (api.SpinnerDuties?.gate(enemy) === false) return false;
                            return native.apply(this, arguments);
                        },
                );
        }

    if (typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "tick", KEY, (_event, data) => {
            api.SpinnerAI?.preparePositiveTurn(data?.delta);
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
