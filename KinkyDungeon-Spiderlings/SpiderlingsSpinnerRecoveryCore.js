"use strict";

// Item-independent source, destination, and crossing rules shared by player and NPC recovery.
(() => {
    const api = globalThis.Spiderlings;
    const MAX_SOURCES = 8;
    const CROSSING_ACTIONS_PER_CELL = 2;
    const sameId = (left, right) => left !== undefined && right !== undefined && String(left) === String(right);
    const sourceKey = (id) => String(id);
    const sourceRecords = (record) => (record?.sources && typeof record.sources === "object" ? record.sources : {});
    const sourceIds = (record) => Object.values(sourceRecords(record)).map((source) => source.id);

    function upsertSource(record, source, association, tick, maxSources = MAX_SOURCES) {
        record.sources ||= {};
        const key = sourceKey(source.id),
            existing = record.sources[key];
        if (!existing && sourceIds(record).length >= maxSources) return { added: false, refreshed: false };
        const next = existing || { id: source.id };
        next.groupId = association?.groupId;
        next.compositeId = association?.compositeId;
        next.lastHitTick = tick;
        record.sources[key] = next;
        return { added: !existing, refreshed: !!existing, source: next };
    }

    function auditSources(record, resolveSource, isActionable) {
        const removed = [];
        for (const [key, saved] of Object.entries(sourceRecords(record))) {
            const source = resolveSource(saved.id);
            if (!source || !isActionable(source, saved)) {
                delete record.sources[key];
                removed.push(saved.id);
            }
        }
        return removed;
    }

    function chooseExecutor(record, onExecutorChange) {
        const ids = sourceIds(record).sort((left, right) => String(left).localeCompare(String(right)));
        if (ids.some((id) => sameId(id, record.executorId))) return record.executorId;
        const previous = record.executorId,
            next = ids[0];
        record.executorId = next;
        if (!sameId(previous, next)) onExecutorChange?.(previous, next);
        return next;
    }

    function destination(record, resolveCore, routeLength, resolveExecutor) {
        const choices = new Map();
        for (const source of Object.values(sourceRecords(record))) {
            if (!source.compositeId) continue;
            const core = resolveCore(source.compositeId);
            if (!core) continue;
            const distance = routeLength(core);
            if (!Number.isFinite(distance)) continue;
            const key = String(source.compositeId),
                current = choices.get(key) || {
                    key: `field:${key}`,
                    compositeId: source.compositeId,
                    x: core.x,
                    y: core.y,
                    count: 0,
                    distance,
                };
            current.count += 1;
            current.distance = Math.min(current.distance, distance);
            choices.set(key, current);
        }
        const selected = [...choices.values()].sort(
            (left, right) =>
                right.count - left.count ||
                left.distance - right.distance ||
                String(left.compositeId).localeCompare(String(right.compositeId)),
        )[0];
        if (selected) return selected;
        const executor = resolveExecutor(record.executorId);
        return (
            executor && {
                key: `source:${executor.id}`,
                x: executor.x,
                y: executor.y,
                count: 0,
                distance: Number(routeLength(executor)) || 0,
            }
        );
    }

    function sameCell(left, right) {
        return !!left && !!right && left.x === right.x && left.y === right.y;
    }

    function crossingValid(crossing, target, destinationKey, adapters) {
        return !!(
            crossing &&
            crossing.destinationKey === destinationKey &&
            sameCell(crossing.near, adapters.position(target)) &&
            Array.isArray(crossing.webCells) &&
            crossing.webCells.length > 0 &&
            crossing.webCells.every(adapters.webCellLegal) &&
            adapters.landingLegal(crossing.far, target)
        );
    }

    function crossingCandidate(target, goal, adapters) {
        if (!goal) return undefined;
        const position = adapters.position(target),
            currentDistance = Math.max(Math.abs(goal.x - position.x), Math.abs(goal.y - position.y)),
            directions = [];
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if ((!dx && !dy) || (dx && dy)) continue;
                const distance = Math.max(Math.abs(goal.x - (position.x + dx)), Math.abs(goal.y - (position.y + dy)));
                if (distance < currentDistance) directions.push({ dx, dy, distance });
            }
        directions.sort((left, right) => left.distance - right.distance || left.dy - right.dy || left.dx - right.dx);
        for (const { dx, dy } of directions) {
            const webCells = [];
            let x = position.x + dx,
                y = position.y + dy;
            while (adapters.isWebCell({ x, y })) {
                const cell = { x, y };
                if (!adapters.webCellLegal(cell)) return undefined;
                webCells.push(cell);
                x += dx;
                y += dy;
            }
            const far = { x, y };
            if (webCells.length && adapters.landingLegal(far, target)) return { near: position, webCells, far };
        }
        return undefined;
    }

    function reconcileCrossing(record, target, destinationKey, adapters) {
        if (record.pendingCrossing && !crossingValid(record.pendingCrossing, target, destinationKey, adapters))
            record.pendingCrossing = undefined;
        return record.pendingCrossing;
    }

    function advancePull(record, target, source, adapters) {
        if (adapters.alreadyMoved(record, target)) return { paid: false, moved: false, reason: "moved" };
        record.lastPullTick = adapters.turn();
        const goal = adapters.destination(record);
        if (!goal) return { paid: true, moved: false, reason: "destination" };
        if (record.pendingCrossing) {
            if (!crossingValid(record.pendingCrossing, target, goal.key, adapters)) {
                record.pendingCrossing = undefined;
                return { paid: true, moved: false, reason: "crossing-invalid" };
            }
            if (adapters.resist?.(record)) return { paid: true, moved: false, reason: "resisted" };
            record.pendingCrossing.paidActions += 1;
            if (record.pendingCrossing.paidActions < CROSSING_ACTIONS_PER_CELL * record.pendingCrossing.webCells.length)
                return { paid: true, moved: false, reason: "crossing-progress" };
            const far = record.pendingCrossing.far;
            record.pendingCrossing = undefined;
            return { paid: true, moved: adapters.move(target, far), reason: "crossing-complete" };
        }
        const step = adapters.path(goal, source, target)?.[0],
            position = adapters.position(target);
        if (
            adapters.landingLegal(step, target) &&
            Math.max(Math.abs(step.x - position.x), Math.abs(step.y - position.y)) <= 1
        ) {
            if (adapters.resist?.(record)) return { paid: true, moved: false, reason: "resisted" };
            return { paid: true, moved: adapters.move(target, step), reason: "step" };
        }
        const crossing = crossingCandidate(target, goal, adapters);
        if (!crossing) return { paid: true, moved: false, reason: "route" };
        if (adapters.resist?.(record)) return { paid: true, moved: false, reason: "resisted" };
        record.pendingCrossing = { ...crossing, paidActions: 1, destinationKey: goal.key };
        return { paid: true, moved: false, reason: "crossing-start" };
    }

    api.SpinnerRecoveryCore = Object.freeze({
        VERSION: 1,
        MAX_SOURCES,
        CROSSING_ACTIONS_PER_CELL,
        sameId,
        sourceKey,
        sourceRecords,
        sourceIds,
        upsertSource,
        auditSources,
        chooseExecutor,
        destination,
        crossingValid,
        crossingCandidate,
        reconcileCrossing,
        advancePull,
    });
})();
