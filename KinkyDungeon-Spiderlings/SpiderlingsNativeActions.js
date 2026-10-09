"use strict";

// Native phase order and action admission are shared; behavior stays with its owner.
(() => {
    const api = globalThis.Spiderlings;
    if (api.NativeActions) return;
    const behaviors = new Map();
    let nativeObserver;

    function nativeMove(native, receiver, args, aiType) {
        const [enemy, target, data] = args;
        for (const behavior of behaviors.values()) {
            if (behavior.aiTypes && !behavior.aiTypes.includes(aiType)) continue;
            const outcome = behavior.beforeNativeMove?.(enemy, target, data);
            if (outcome !== undefined) return outcome;
        }
        const outcome = native.apply(receiver, args);
        for (const behavior of behaviors.values()) {
            if (behavior.aiTypes && !behavior.aiTypes.includes(aiType)) continue;
            behavior.afterNativeMove?.(enemy, target, data, outcome);
        }
        return outcome;
    }

    function installPhases() {
        if (typeof KDAIType === "undefined") return;
        for (const [name, ai] of Object.entries(KDAIType)) {
            ai.beforemove = api.Hooks.wrap(
                `NativeActions.beforemove.${name}`,
                ai.beforemove || (() => false),
                (native) =>
                    function (enemy, target, aiData) {
                        api.SpinnerAI?.reportPlayerContact(enemy, target, aiData, enemy.SpiderlingsSpinnerRuntimeDelta);
                        if (api.SpinnerDuties?.current(enemy)) {
                            const handled = api.SpinnerDuties.beforeMove(enemy, target, aiData);
                            api.SpinnerDuties.admitNative?.(enemy, target, aiData);
                            if (handled || !api.SpinnerDuties.allowsBeforeMove(enemy)) return handled;
                            return nativeMove(native, this, arguments, name);
                        }
                        if (api.FieldCommand?.handleMove(enemy, enemy.SpiderlingsSpinnerRuntimeDelta)) {
                            aiData.idle = false;
                            return true;
                        }
                        const result = nativeMove(native, this, arguments, name);
                        api.SpinnerAI?.reportPlayerContact(enemy, target, aiData, enemy.SpiderlingsSpinnerRuntimeDelta);
                        if (result || name !== "hunt") return result;
                        const handled = api.HuntingGrounds?.handleCrewMove?.(enemy, target, aiData) || false;
                        if (handled) aiData.idle = false;
                        return handled;
                    },
            );
            ai.aftermove = api.Hooks.wrap(
                `NativeActions.aftermove.${name}`,
                ai.aftermove || (() => false),
                (native) =>
                    function (enemy, target, aiData) {
                        const result = native.apply(this, arguments);
                        if (result) return result;
                        if (api.FieldCustody?.targetFor(enemy)) return result;
                        for (const behavior of behaviors.values()) {
                            if (behavior.aiTypes && !behavior.aiTypes.includes(name)) continue;
                            const outcome = behavior.afterMove?.(enemy, target, aiData);
                            if (outcome !== undefined) return outcome;
                        }
                        return result;
                    },
            );
            for (const phase of ["attack", "spell"])
                ai[phase] = api.Hooks.wrap(
                    `NativeActions.${phase}.${name}`,
                    ai[phase] || (() => true),
                    (native) =>
                        function (enemy) {
                            if (api.SpinnerDuties?.gate(enemy) === false) return false;
                            return native.apply(this, arguments);
                        },
                );
        }
    }

    function installDirection() {
        if (typeof KDGetDir !== "function") return;
        KDGetDir = api.Hooks.wrap(
            "NativeActions.direction",
            KDGetDir,
            (native) =>
                function (enemy, target) {
                    let result = native.apply(this, arguments);
                    const data = typeof AIData === "undefined" ? undefined : AIData;
                    for (const behavior of behaviors.values())
                        if (behavior.preferDirection) result = behavior.preferDirection(enemy, target, result, data);
                    return result;
                },
        );
    }

    function reportExecution(enemy, result) {
        api.SpinnerDuties?.recordResult?.(enemy, result);
        return result;
    }

    function handleControl(enemy, target, delta, duty, controls) {
        for (const [role, controller] of controls) {
            if (duty && !api.SpinnerDuties.allows(enemy, role)) continue;
            const result = controller?.handleEnemyTurn(enemy, target, delta);
            if (result) return reportExecution(enemy, result);
        }
        return undefined;
    }

    function install() {
        installPhases();
        installDirection();
        if (typeof globalThis.KinkyDungeonTrackSneak === "function")
            globalThis.KinkyDungeonTrackSneak = api.Hooks.wrap(
                "NativeActions.playerContact",
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
                                { recognized: true, canSensePlayer: true, hostile: KDHostile(enemy, target) },
                                nativeObserver.delta,
                            );
                        return result;
                    },
            );
        if (typeof KinkyDungeonEnemyLoop !== "function") return;
        KinkyDungeonEnemyLoop = api.Hooks.wrap(
            "NativeActions.enemyLoop",
            KinkyDungeonEnemyLoop,
            (native) =>
                function (enemy, target, delta) {
                    target = api.SpinnerScenarios?.resolveTarget?.(enemy, target) || target;
                    target = api.HuntingGrounds?.resolveNestDefenderTarget?.(enemy, target, delta) || target;
                    target = api.SpinnerAI?.recoveryTarget?.(enemy, target, delta) || target;
                    target = api.SpinnerAI?.constructionTarget?.(enemy, target, delta) || target;
                    if (delta > 0) target = api.FieldCustody?.targetFor(enemy) || target;
                    arguments[1] = target;
                    if (api.SpinnerNativeField?.isOwnedProxy(enemy))
                        return { idle: true, defeat: false, defeatEnemy: enemy };
                    const duty = api.SpinnerDuties?.beginAction(enemy, target, delta);
                    const playerControl = handleControl(enemy, target, delta, duty, [
                        ["recovery", api.SpinnerRecovery],
                        ["capture", api.SpinnerCapture],
                    ]);
                    if (playerControl) return playerControl;
                    if (delta > 0) api.NPCWrapping?.preemptNativeCapture?.();
                    const npcControl = handleControl(enemy, target, delta, duty, [
                        ["npcCapture", api.SpinnerNPCCapture],
                        ["npcRecovery", api.SpinnerNPCRecovery],
                    ]);
                    if (npcControl) return npcControl;
                    const nativeField = !duty && api.SpinnerNativeField?.handleEnemyTurn(enemy, target, delta);
                    if (nativeField) return nativeField;
                    const legacyField = !duty && api.SpinnerField?.handleEnemyTurn(enemy, target, delta);
                    if (legacyField) return legacyField;
                    enemy.SpiderlingsSpinnerRuntimeDelta = delta;
                    const previousObserver = nativeObserver;
                    nativeObserver = { enemy, delta };
                    // KD checks the player's leash even for spells targeting an
                    // NPC. Override that autonomous policy only for this order.
                    const definition = enemy.Enemy;
                    const actionDefinition =
                        duty?.role === "intercept" && !target.player
                            ? { ...definition, followLeashedOnly: false }
                            : definition;
                    const hadModified = Object.hasOwn(enemy, "modified"),
                        modified = enemy.modified;
                    enemy.Enemy = actionDefinition;
                    // KDUnPackEnemy is also called by detection/helplessness checks.
                    // Protect this action template from being reloaded mid-action.
                    if (actionDefinition !== definition) enemy.modified = true;
                    try {
                        return native.apply(this, arguments);
                    } finally {
                        if (enemy.Enemy === actionDefinition) enemy.Enemy = definition;
                        if (actionDefinition !== definition) {
                            if (hadModified) enemy.modified = modified;
                            else delete enemy.modified;
                        }
                        nativeObserver = previousObserver;
                        delete enemy.SpiderlingsSpinnerRuntimeDelta;
                    }
                },
        );
    }

    function registerBehavior(owner, behavior) {
        behaviors.set(owner, behavior);
        // Domain registration is usable in native phase probes before the late
        // enemy-loop installer. Named wrappers retain their position on reinstall.
        installPhases();
        installDirection();
    }

    api.NativeActions = Object.freeze({ registerBehavior, install });
})();
