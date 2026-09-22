"use strict";

// NPC Recovery shares recovery rules without creating or mutating restraint items.
(() => {
    const api = globalThis.Spiderlings,
        core = api.SpinnerRecoveryCore,
        STATE = "SpiderlingsSpinnerNPCRecoveries",
        VERSION = 1,
        MAX_RANGE = 3;
    let ownedMoveTargetId;
    let nativeMoveTickByTarget = new Map();
    let mapLines;

    const turn = () => (typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0);
    const entities = () => (typeof KDMapData !== "undefined" ? KDMapData.Entities || [] : []);
    const entity = (id) => entities().find((candidate) => core.sameId(candidate.id, id));
    const state = () => (typeof KDGameData !== "undefined" ? KDGameData[STATE] : undefined);
    const records = () => state()?.records || {};
    const departures = () => state()?.departures || {};
    const targetKey = (target) => core.sourceKey(target?.id ?? target);
    const recordForTarget = (target) => records()[targetKey(target)];
    const departureForTarget = (target) => departures()[targetKey(target)];
    const result = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });

    function ensureState() {
        if (!state() || state().version !== VERSION)
            KDGameData[STATE] = { version: VERSION, records: {}, departures: {} };
        return state();
    }

    function sourceById(id) {
        return entity(id);
    }

    function targetValid(target) {
        return !!(target && !target.player && target.hp > 0 && target.Enemy?.bound && !KDIsImmobile(target));
    }

    function sourceActionable(source, target, departure) {
        if (
            !source ||
            source.Enemy?.name !== "Spinner" ||
            !(source.hp > 0) ||
            source.Enemy.noAttack ||
            [source.stun, source.freeze, source.disarm, source.channel, source.teleporting].some(
                (value) => value > 0,
            ) ||
            KDHelpless(source) ||
            KinkyDungeonIsDisabled(source) ||
            !KDHostile(source, target) ||
            !(departure?.eligibleSourceIds || []).some((id) => core.sameId(id, source.id))
        )
            return false;
        const distance = Math.max(Math.abs(source.x - target.x), Math.abs(source.y - target.y));
        return (
            distance <= MAX_RANGE &&
            typeof KinkyDungeonCheckLOS === "function" &&
            KinkyDungeonCheckLOS(source, target, distance, MAX_RANGE, false, false)
        );
    }

    function usesEntity(id, exceptTargetId) {
        if (id === undefined) return false;
        return Object.values(records()).some(
            (record) =>
                !core.sameId(record.targetId, exceptTargetId) &&
                (core.sameId(record.targetId, id) ||
                    core.sourceIds(record).some((sourceId) => core.sameId(sourceId, id))),
        );
    }

    function conflictsWithCapture(id, targetId) {
        return usesEntity(id, targetId);
    }

    function sourceAvailable(source, targetId) {
        return !!(
            source &&
            !usesEntity(source.id, targetId) &&
            !api.SpinnerNPCCapture?.usesSource?.(source.id) &&
            !api.SpinnerRecovery?.sourceIds?.().some((id) => core.sameId(id, source.id))
        );
    }

    function stableCompositeAvailable(compositeId, targetId) {
        for (const departure of Object.values(departures()))
            if (departure.compositeId === compositeId && !core.sameId(departure.targetId, targetId)) return false;
        for (const record of Object.values(records()))
            if (
                Object.values(core.sourceRecords(record)).some((source) => source.compositeId === compositeId) &&
                !core.sameId(record.targetId, targetId)
            )
                return false;
        return !Object.values(api.SpinnerNPCCapture?.records?.() || {}).some(
            (record) => record.admittedCompositeId === compositeId && !core.sameId(record.targetId, targetId),
        );
    }

    function compositeClaimed(compositeId, targetId) {
        return !stableCompositeAvailable(compositeId, targetId);
    }

    function sourceAssociation(source, fallback) {
        const field = api.SpinnerNativeField,
            graph = field?.state?.()?.topology,
            candidates = Object.values(graph?.composites || {})
                .filter((composite) => field.fieldOwners?.(composite.id)?.some((id) => core.sameId(id, source.id)))
                .map((composite) => ({
                    compositeId: composite.id,
                    groupId: composite.groupId,
                    core: field.commonCore?.(composite.id),
                }))
                .filter((candidate) => candidate.core)
                .sort(
                    (left, right) =>
                        Math.hypot(source.x - left.core.x, source.y - left.core.y) -
                            Math.hypot(source.x - right.core.x, source.y - right.core.y) ||
                        String(left.compositeId).localeCompare(String(right.compositeId)),
                );
        return candidates[0] || { compositeId: fallback?.compositeId, groupId: fallback?.groupId };
    }

    function onEnemyMove(data) {
        const target = data?.enemy;
        if (!target || data.cancelmove) return false;
        if (!data.willing && !core.sameId(ownedMoveTargetId, target.id)) nativeMoveTickByTarget.set(target.id, turn());
        const existing = recordForTarget(target);
        if (existing?.pendingCrossing && !core.sameId(ownedMoveTargetId, target.id))
            existing.pendingCrossing = undefined;
        if (core.sameId(ownedMoveTargetId, target.id) || !targetValid(target)) return false;
        const breached = api.SpinnerNativeField?.breachedDeparture(
            { x: data.lastX, y: data.lastY },
            { x: data.moveX, y: data.moveY },
        );
        if (!breached || !stableCompositeAvailable(breached.compositeId, target.id)) return false;
        const container = ensureState();
        container.departures[targetKey(target)] = {
            version: VERSION,
            targetId: target.id,
            compositeId: breached.compositeId,
            groupId: breached.groupId,
            eligibleSourceIds: [...new Set(breached.eligibleSourceIds || [])],
        };
        return true;
    }

    function onSuccessfulNativeSpinnerHit(source, target, actualBind) {
        if (!(actualBind > 0) || !targetValid(target) || !sourceAvailable(source, target.id)) return false;
        const departure = departureForTarget(target);
        if (!departure || !sourceActionable(source, target, departure)) return false;
        if (api.SpinnerNativeField?.containsComposite?.(departure.compositeId, target)) return false;
        const container = ensureState(),
            key = targetKey(target),
            record = (container.records[key] ||= {
                targetId: target.id,
                eligibleSourceIds: [...departure.eligibleSourceIds],
                sources: {},
                executorId: undefined,
                pendingCrossing: undefined,
                lastPullTick: undefined,
            }),
            association = sourceAssociation(source, departure),
            upserted = core.upsertSource(record, source, association, turn());
        if (upserted.added)
            core.chooseExecutor(record, (_previous, next) => {
                const executor = sourceById(next);
                if (executor) executor.SpinnerConstructionPoints = 0;
            });
        reconcileRecord(record, target);
        return true;
    }

    function nativePath(target, goal, source) {
        if (!goal || typeof KinkyDungeonFindPath !== "function") return undefined;
        if (goal.x === target.x && goal.y === target.y) return [];
        return KinkyDungeonFindPath(
            target.x,
            target.y,
            goal.x,
            goal.y,
            true,
            false,
            false,
            KinkyDungeonMovableTilesEnemy,
            undefined,
            undefined,
            undefined,
            source,
        );
    }

    function destination(record, target) {
        const executor = sourceById(record.executorId);
        return core.destination(
            record,
            (compositeId) => {
                if (
                    typeof api.SpinnerNativeField?.compositeById === "function" &&
                    !api.SpinnerNativeField.compositeById(compositeId)
                )
                    return undefined;
                return api.SpinnerNativeField?.commonCore?.(compositeId);
            },
            (goal) => {
                const path = nativePath(target, goal, executor);
                return Array.isArray(path) ? path.length : Number.POSITIVE_INFINITY;
            },
            sourceById,
        );
    }

    function landingLegal(cell, target) {
        if (!cell || (cell.x === target.x && cell.y === target.y)) return false;
        if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y))) return false;
        if (KinkyDungeonTilesGet(`${cell.x},${cell.y}`)?.Lock) return false;
        return !KinkyDungeonEntityAt(cell.x, cell.y);
    }

    function webCellLegal(cell) {
        if (!api.SpinnerNativeField?.isSpiderlingsWebCell?.(cell)) return false;
        if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y))) return false;
        if (KinkyDungeonTilesGet(`${cell.x},${cell.y}`)?.Lock) return false;
        const occupant = KinkyDungeonEntityAt(cell.x, cell.y);
        return !occupant || api.SpinnerNativeField?.isOwnedProxy?.(occupant);
    }

    function alreadyMoved(record, target) {
        return !!(
            record.lastPullTick === turn() ||
            nativeMoveTickByTarget.get(target.id) === turn() ||
            (typeof KDEnemyHasFlag === "function" && KDEnemyHasFlag(target, "pulled"))
        );
    }

    function moveTarget(target, cell) {
        const before = { x: target.x, y: target.y };
        ownedMoveTargetId = target.id;
        try {
            KDMoveEntity(target, cell.x, cell.y, false);
        } finally {
            ownedMoveTargetId = undefined;
        }
        const moved = target.x !== before.x || target.y !== before.y;
        if (moved && typeof KinkyDungeonSetEnemyFlag === "function") KinkyDungeonSetEnemyFlag(target, "pulled", 1);
        return moved;
    }

    function adapters(record, target) {
        return {
            position: (subject) => ({ x: subject.x, y: subject.y }),
            turn,
            destination: () => destination(record, target),
            path: (goal, source) => nativePath(target, goal, source),
            landingLegal,
            isWebCell: (cell) => api.SpinnerNativeField?.isSpiderlingsWebCell?.(cell) === true,
            webCellLegal,
            alreadyMoved,
            move: moveTarget,
        };
    }

    function reconcileRecord(record, target) {
        const goal = destination(record, target);
        core.reconcileCrossing(record, target, goal?.key, adapters(record, target));
    }

    function deleteTarget(target) {
        const container = state();
        if (!container) return;
        delete container.records[targetKey(target)];
        delete container.departures[targetKey(target)];
        nativeMoveTickByTarget.delete(target?.id ?? target);
        if (!Object.keys(container.records).length && !Object.keys(container.departures).length)
            delete KDGameData[STATE];
    }

    function auditRecord(record) {
        const target = entity(record.targetId),
            departure = departureForTarget(record.targetId);
        if (!targetValid(target) || !departure) {
            deleteTarget(record.targetId);
            return undefined;
        }
        core.auditSources(
            record,
            sourceById,
            (source) => sourceAvailable(source, target.id) && sourceActionable(source, target, departure),
        );
        if (!core.sourceIds(record).length) {
            delete records()[targetKey(target)];
            return undefined;
        }
        core.chooseExecutor(record, (_previous, next) => {
            const executor = sourceById(next);
            if (executor) executor.SpinnerConstructionPoints = 0;
        });
        const containing = api.SpinnerNativeField?.containingComposite?.(target);
        if (containing?.id === departure.compositeId && api.SpinnerNativeField?.captureGeometryReady?.(target)) {
            deleteTarget(target);
            return undefined;
        }
        reconcileRecord(record, target);
        return { record, target };
    }

    function audit() {
        const container = state();
        if (!container) return [];
        if (
            container.version !== VERSION ||
            typeof container.records !== "object" ||
            typeof container.departures !== "object"
        ) {
            clearTemporary();
            return [];
        }
        for (const departure of Object.values(departures()))
            if (!targetValid(entity(departure.targetId))) deleteTarget(departure.targetId);
        const active = [];
        for (const record of Object.values(records())) {
            const audited = auditRecord(record);
            if (audited) active.push(audited);
        }
        return active;
    }

    function handleEnemyTurn(source, _nativeTarget, delta) {
        const active = audit();
        const owned = active.find(({ record }) => core.sourceRecords(record)[core.sourceKey(source?.id)]);
        if (!owned) return undefined;
        if (api.SpinnerNPCCapture?.blocksVoluntaryMove?.(owned.target)) return result(source);
        if (!core.sameId(owned.record.executorId, source.id)) return result(source);
        if (api.SpinnerNativeField.accrueConstructionAction(source, delta) && !alreadyMoved(owned.record, owned.target))
            core.advancePull(owned.record, owned.target, source, adapters(owned.record, owned.target));
        return result(source);
    }

    function clearForCapture(target) {
        deleteTarget(target);
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
            sources: core.sourceIds(record).map(entity).filter(Boolean),
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
        ownedMoveTargetId = undefined;
        nativeMoveTickByTarget = new Map();
        clearLines();
    }

    function afterLoad() {
        ownedMoveTargetId = undefined;
        nativeMoveTickByTarget = new Map();
        clearLines();
        audit();
    }

    api.SpinnerNPCRecovery = Object.freeze({
        STATE,
        VERSION,
        state,
        records,
        departures,
        usesEntity,
        conflictsWithCapture,
        compositeClaimed,
        recordForTarget,
        departureForTarget,
        onEnemyMove,
        onSuccessfulNativeSpinnerHit,
        handleEnemyTurn,
        destination,
        audit,
        clearForCapture,
        draw,
        clearTemporary,
        afterLoad,
    });
})();
