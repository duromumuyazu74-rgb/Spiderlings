"use strict";

// NPC Capture owns temporary source relationships only. Native KD remains the
// authority for binding, struggle progress, attacks, spells, and forced movement.
(() => {
    const api = globalThis.Spiderlings;
    const STATE = "SpiderlingsSpinnerNPCCaptures";
    const HOLD = "SpiderlingsSpinnerStunTurns";
    const VERSION = 1;
    const MAX_SOURCES = 8;
    const BIND_PER_SOURCE = 1.5;
    const HOLD_TURNS = 6;
    let acted = new Set();
    let struggleReduction = new Map();
    let mapLines;

    const entities = () => (typeof KDMapData !== "undefined" ? KDMapData.Entities || [] : []);
    const entity = (id) => entities().find((candidate) => candidate.id === id);
    const state = () => (typeof KDGameData !== "undefined" ? KDGameData[STATE] : undefined);
    const records = () => state()?.records || {};
    const recordKey = (targetId) => String(targetId);
    const recordForTarget = (target) => records()[recordKey(target?.id)];

    function ensureState() {
        if (!KDGameData[STATE] || KDGameData[STATE].version !== VERSION)
            KDGameData[STATE] = { version: VERSION, records: {} };
        return KDGameData[STATE];
    }

    function playerCaptureUses(id) {
        return api.SpinnerCapture?.state()?.sourceIds?.includes(id) === true;
    }

    function recoveryUsesSource(id, target) {
        return !!(
            api.SpinnerRecovery?.sourceIds?.().some((sourceId) => String(sourceId) === String(id)) ||
            api.SpinnerNPCRecovery?.conflictsWithCapture?.(id, target?.id)
        );
    }

    function usesSource(id) {
        return Object.values(records()).some((record) =>
            record.sourceIds?.some((sourceId) => String(sourceId) === String(id)),
        );
    }

    function belongsToCapture(id, exceptTargetId) {
        for (const record of Object.values(records())) {
            if (record.targetId === exceptTargetId) continue;
            if (record.targetId === id || record.sourceIds?.includes(id)) return true;
        }
        return false;
    }

    function targetEligible(source, target, helpless = KDHelpless(target)) {
        return !!(
            target &&
            !target.player &&
            target.Enemy?.bound &&
            target.hp > 0 &&
            !helpless &&
            !KDIsImmobile(target) &&
            KDHostile(source, target)
        );
    }

    function targetStillValid(target) {
        return !!(target && !target.player && target.Enemy?.bound && target.hp > 0 && !KDIsImmobile(target));
    }

    function sourceEligible(source, target, record) {
        if (
            !source ||
            source.Enemy?.name !== "Spinner" ||
            !(source.hp > 0) ||
            source.Enemy.noAttack ||
            !source.Enemy.attack?.includes("Melee") ||
            [source.stun, source.freeze, source.disarm, source.channel, source.teleporting].some(
                (value) => value > 0,
            ) ||
            source[HOLD] > 0 ||
            KDHelpless(source) ||
            KinkyDungeonIsDisabled(source) ||
            !KDHostile(source, target) ||
            playerCaptureUses(source.id) ||
            recoveryUsesSource(source.id, target) ||
            belongsToCapture(source.id, record?.targetId)
        )
            return false;
        const distance = Math.hypot(source.x - target.x, source.y - target.y);
        const range = source.Enemy.attackRange === 1 ? 1.5 : source.Enemy.attackRange;
        return distance <= range && KinkyDungeonCheckPath(source.x, source.y, target.x, target.y, false, false);
    }

    function deleteRecord(record) {
        const container = state();
        if (!container?.records) return;
        delete container.records[recordKey(record.targetId)];
        if (!Object.keys(container.records).length) delete KDGameData[STATE];
    }

    function holdSources(sources) {
        for (const source of sources) {
            source.stun = Math.max(source.stun || 0, HOLD_TURNS);
            source[HOLD] = HOLD_TURNS;
        }
    }

    function resolveEscape(record, sources) {
        holdSources(sources);
        deleteRecord(record);
    }

    function auditRecord(record, quiet = false) {
        const target = entity(record.targetId);
        if (!targetStillValid(target)) {
            deleteRecord(record);
            return undefined;
        }
        const seen = new Set();
        const sources = [];
        for (const id of Array.isArray(record.sourceIds) ? record.sourceIds : []) {
            const source = entity(id);
            if (seen.has(id) || !sourceEligible(source, target, record)) continue;
            seen.add(id);
            sources.push(source);
            if (sources.length === MAX_SOURCES) break;
        }
        record.sourceIds = sources.map((source) => source.id);
        if (!sources.length) {
            if (quiet) deleteRecord(record);
            else resolveEscape(record, []);
            return undefined;
        }
        return { record, target, sources };
    }

    function auditSources(options = {}) {
        const result = [];
        for (const record of Object.values(records())) {
            const audited = auditRecord(record, options.quiet === true);
            if (audited) result.push(audited);
        }
        return result;
    }

    function completionTarget(target) {
        return target.Enemy.maxhp * (KDNPCStruggleThreshMult(target) + 1);
    }

    function onSuccessfulNativeSpinnerHit(source, target, actualBind, admission = {}) {
        if (!(actualBind > 0) || recordForTarget(target) || belongsToCapture(target?.id)) return false;
        if (playerCaptureUses(target?.id)) return false;
        const helplessBefore = admission.helplessBefore ?? KDHelpless(target);
        if (!targetEligible(source, target, helplessBefore) || !sourceEligible(source, target)) return false;
        const composite = api.SpinnerNativeField?.containingComposite(target);
        if (
            !composite ||
            api.SpinnerNPCRecovery?.compositeClaimed?.(composite.id, target.id) ||
            !api.SpinnerNativeField.captureGeometryReady(target)
        )
            return false;
        const legalSources = entities().filter(
            (candidate) => !belongsToCapture(candidate.id) && sourceEligible(candidate, target),
        );
        if (legalSources.length < 2) return false;
        const container = ensureState();
        container.records[recordKey(target.id)] = {
            version: VERSION,
            targetId: target.id,
            admittedCompositeId: composite.id,
            anchor: { x: target.x, y: target.y },
            sourceIds: [source.id],
            strandDebt: actualBind,
            completionTarget: completionTarget(target),
        };
        return true;
    }

    function handleEnemyTurn(source, nativeTarget, delta) {
        if (!(delta > 0) || source?.Enemy?.name !== "Spinner") return undefined;
        const active = auditSources();
        const participant = active.find(({ record }) => record.sourceIds.includes(source.id));
        if (participant) {
            acted.add(source.id);
            return { idle: false, defeat: false, defeatEnemy: source };
        }
        if (belongsToCapture(source.id) || playerCaptureUses(source.id)) return undefined;
        const targeted = active.find(({ target }) => target === nativeTarget);
        if (!targeted) return undefined;
        if (targeted.record.sourceIds.length < MAX_SOURCES && sourceEligible(source, targeted.target, targeted.record))
            targeted.record.sourceIds.push(source.id);
        return { idle: false, defeat: false, defeatEnemy: source };
    }

    function observeNativeStruggle(target, removed) {
        if (!(removed > 0) || !recordForTarget(target)) return;
        struggleReduction.set(target.id, (struggleReduction.get(target.id) || 0) + removed);
    }

    function prepareTurn(delta) {
        if (!(delta > 0)) return;
        auditSources();
        acted = new Set();
        struggleReduction = new Map();
    }

    function settleTurn(delta) {
        if (!(delta > 0)) return;
        for (const { record, target, sources } of auditSources()) {
            const removed = struggleReduction.get(target.id) || 0;
            record.strandDebt = Math.max(0, Number(record.strandDebt || 0) - removed);
            if (!(record.strandDebt > 0)) {
                resolveEscape(record, sources);
                continue;
            }
            if ((target.boundLevel || 0) >= record.completionTarget) {
                deleteRecord(record);
                continue;
            }
            const contributors = sources.filter((source) => acted.has(source.id));
            if (contributors.length) {
                const result = api.Combat.applySilkBinding(
                    contributors[0],
                    target,
                    BIND_PER_SOURCE * contributors.length,
                    { contact: false, attack: "capture", contributors: contributors.map((source) => source.id) },
                );
                record.strandDebt += result.slimeAdded;
            }
            if ((target.boundLevel || 0) >= record.completionTarget) deleteRecord(record);
        }
        struggleReduction = new Map();
    }

    function blocksVoluntaryMove(target) {
        return !!recordForTarget(target);
    }

    function clearLines() {
        if (mapLines && !mapLines.destroyed) {
            mapLines.parent?.removeChild(mapLines);
            mapLines.destroy();
        }
        mapLines = undefined;
    }

    function draw(data) {
        const views = Object.values(records()).map((record) => ({
            target: entity(record.targetId),
            sources: (record.sourceIds || []).map(entity).filter(Boolean),
        }));
        if (!views.some((view) => view.target && view.sources.length)) {
            if (mapLines) mapLines.visible = false;
            return;
        }
        if (!mapLines || mapLines.destroyed) {
            mapLines = new PIXI.Graphics();
            kdgameboard.addChild(mapLines);
        }
        mapLines.clear().lineStyle(2, 0xffffff, 1);
        mapLines.visible = true;
        const boardPans = typeof StandalonePatched !== "undefined" && StandalonePatched;
        const point = (subject) => [
            (subject.x - data.CamX - (boardPans ? 0 : data.CamX_offset) + 0.5) * KinkyDungeonGridSizeDisplay,
            (subject.y - data.CamY - (boardPans ? 0 : data.CamY_offset) + 0.5) * KinkyDungeonGridSizeDisplay,
        ];
        for (const view of views) {
            if (!view.target) continue;
            const targetPoint = point(view.target);
            for (const source of view.sources) mapLines.moveTo(...point(source)).lineTo(...targetPoint);
        }
    }

    function clearTemporary() {
        if (typeof KDGameData !== "undefined") delete KDGameData[STATE];
        acted = new Set();
        struggleReduction = new Map();
        clearLines();
    }

    function afterLoad() {
        acted = new Set();
        struggleReduction = new Map();
        clearLines();
        if (!state()) return;
        if (state().version !== VERSION || !state().records || typeof state().records !== "object") {
            clearTemporary();
            return;
        }
        for (const record of Object.values(records())) {
            if (
                record?.version !== VERSION ||
                !Array.isArray(record.sourceIds) ||
                record.targetId === undefined ||
                !Number.isFinite(record.strandDebt) ||
                !(record.strandDebt > 0) ||
                !Number.isFinite(record.completionTarget) ||
                !(record.completionTarget > 0)
            )
                deleteRecord(record);
        }
        auditSources({ quiet: true });
    }

    if (typeof KinkyDungeonEnemyTryMove === "function")
        KinkyDungeonEnemyTryMove = api.Hooks.wrap(
            "SpinnerNPCCapture.move",
            KinkyDungeonEnemyTryMove,
            (native) =>
                function (target) {
                    if (blocksVoluntaryMove(target)) return false;
                    return native.apply(this, arguments);
                },
        );

    if (typeof KDEnemyStruggleTurn === "function")
        KDEnemyStruggleTurn = api.Hooks.wrap(
            "SpinnerNPCCapture.struggle",
            KDEnemyStruggleTurn,
            (native) =>
                function (target) {
                    const before = target?.boundLevel || 0;
                    const result = native.apply(this, arguments);
                    if (arguments[3] !== true)
                        observeNativeStruggle(target, Math.max(0, before - (target?.boundLevel || 0)));
                    return result;
                },
        );

    api.SpinnerNPCCapture = {
        STATE,
        VERSION,
        MAX_SOURCES,
        BIND_PER_SOURCE,
        HOLD_TURNS,
        state,
        records,
        usesSource,
        targetEligible,
        sourceEligible,
        onSuccessfulNativeSpinnerHit,
        handleEnemyTurn,
        auditSources,
        observeNativeStruggle,
        prepareTurn,
        settleTurn,
        blocksVoluntaryMove,
        draw,
        clearTemporary,
        afterLoad,
    };
})();
