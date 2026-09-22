"use strict";

// Player recovery control is saved separately from both field geometry and the real leash item.
(() => {
    const api = globalThis.Spiderlings,
        STATE = "SpiderlingsSpinnerRecovery",
        DEPARTURE = "SpiderlingsSpinnerRecoveryDeparture",
        LEASH = "SpiderlingsSilkLeash",
        GROUP = "ItemNeckRestraints",
        MAX_RANGE = 3,
        VERSION = 2,
        ESCAPE_EVENT = "SpiderlingsRecoveryEscape";
    const CONFIG = Object.freeze({
            maxSources: 8,
            escapePenaltyPerExtraSource: 0.05,
            standBase: 5,
            standPerExtraSource: 2,
            crossingActionsPerCell: 2,
        }),
        MAX_SOURCES = CONFIG.maxSources,
        ESCAPE_PENALTY = CONFIG.escapePenaltyPerExtraSource;
    let ownedMovement = false;
    let nativeMoveTick;
    let selectedSourceId;
    const armedRemoval = new WeakMap();

    const player = () => KinkyDungeonPlayerEntity;
    const entities = () => KDMapData?.Entities || [];
    const state = () => KDGameData?.[STATE];
    const departure = () => KDGameData?.[DEPARTURE];
    const turn = () => (typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0);
    const sameId = (left, right) => left !== undefined && right !== undefined && String(left) === String(right);
    const result = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });
    const sourceKey = (id) => String(id);

    function event(map, trigger, type, handler) {
        if (typeof KDAddEvent === "function") KDAddEvent(map, trigger, type, handler);
        else {
            map[trigger] ||= {};
            map[trigger][type] = handler;
        }
    }

    function definition(item) {
        if (!item) return undefined;
        if (typeof KDRestraint === "function") return KDRestraint(item);
        return (
            item.restraint ||
            (typeof KinkyDungeonGetRestraintByName === "function"
                ? KinkyDungeonGetRestraintByName(item.name)
                : undefined)
        );
    }

    function allItems() {
        if (typeof KinkyDungeonAllRestraintDynamic !== "function") return [];
        return KinkyDungeonAllRestraintDynamic()
            .map((entry) => entry.item)
            .filter(Boolean);
    }

    function carrierById(id) {
        return allItems().find((item) => sameId(item.id, id));
    }

    function usableLeash(item) {
        const restraint = definition(item);
        return !!item && restraint?.Group === GROUP && restraint.leash === true && restraint.tether > 0;
    }

    function sourceById(id) {
        return entities().find((entity) => sameId(entity.id, id));
    }

    function sourceActionable(source) {
        if (
            !source ||
            source.Enemy?.name !== "Spinner" ||
            !(source.hp > 0) ||
            !KDHostile(source) ||
            source.Enemy.noAttack ||
            [source.stun, source.freeze, source.disarm, source.channel, source.teleporting].some(
                (value) => value > 0,
            ) ||
            KDHelpless(source) ||
            KinkyDungeonIsDisabled(source)
        )
            return false;
        const distance = Math.max(Math.abs(source.x - player().x), Math.abs(source.y - player().y));
        return (
            distance <= MAX_RANGE &&
            typeof KinkyDungeonCheckLOS === "function" &&
            KinkyDungeonCheckLOS(source, player(), distance, MAX_RANGE, false, false)
        );
    }

    function allowedSource(record, source) {
        return !!source && (record?.eligibleSourceIds || []).some((id) => sameId(id, source.id));
    }

    function sourceRecords(recovery = state()) {
        return recovery?.sources && typeof recovery.sources === "object" ? recovery.sources : {};
    }

    function sourceIds(recovery = state()) {
        return Object.values(sourceRecords(recovery)).map((record) => record.id);
    }

    function npcCaptureUsesSource(id) {
        return api.SpinnerNPCCapture?.usesSource?.(id) === true;
    }

    function sourceAssociation(source, fallback) {
        const field = api.SpinnerNativeField,
            graph = field?.state?.()?.topology,
            candidates = Object.values(graph?.composites || {})
                .filter((composite) => field.fieldOwners?.(composite.id)?.some((id) => sameId(id, source.id)))
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
        return (
            candidates[0] || {
                compositeId: fallback?.compositeId,
                groupId: fallback?.groupId,
            }
        );
    }

    function makeSourceRecord(source, fallback) {
        const association = sourceAssociation(source, fallback);
        return {
            id: source.id,
            groupId: association.groupId,
            compositeId: association.compositeId,
            lastHitTick: turn(),
        };
    }

    function rememberDeparture(record) {
        if (!record) return false;
        KDGameData[DEPARTURE] = {
            version: 1,
            compositeId: record.compositeId,
            groupId: record.groupId,
            eligibleSourceIds: [...new Set(record.eligibleSourceIds || [])],
        };
        return true;
    }

    function departureFromRecovery(recovery) {
        const first = Object.values(sourceRecords(recovery))[0];
        return {
            compositeId: first?.compositeId || recovery.compositeId,
            groupId: first?.groupId || recovery.groupId,
            eligibleSourceIds: recovery.eligibleSourceIds,
        };
    }

    function clearControl() {
        delete KDGameData[STATE];
        delete KDGameData[DEPARTURE];
        ownedMovement = false;
        nativeMoveTick = undefined;
        selectedSourceId = undefined;
    }

    function clearRecoveryForCarrierLoss(recovery) {
        rememberDeparture(departureFromRecovery(recovery));
        delete KDGameData[STATE];
    }

    function migrate(recovery) {
        if (recovery?.version !== 1) return recovery;
        const sources = {};
        for (const id of recovery.sourceIds || []) {
            const source = sourceById(id);
            if (source)
                sources[sourceKey(source.id)] = makeSourceRecord(source, {
                    compositeId: recovery.compositeId,
                    groupId: recovery.groupId,
                });
        }
        KDGameData[STATE] = {
            version: VERSION,
            carrierId: recovery.carrierId,
            ownedCarrier: recovery.ownedCarrier === true,
            eligibleSourceIds: [...new Set(recovery.eligibleSourceIds || [])],
            sources,
            sourceRemovalWork: {},
            executorId: recovery.executorId,
            resisted: false,
            pendingCrossing: undefined,
            lastPullTick: recovery.lastPullTick,
        };
        return KDGameData[STATE];
    }

    function chooseExecutor(recovery) {
        const ids = sourceIds(recovery).sort((left, right) => String(left).localeCompare(String(right)));
        if (ids.some((id) => sameId(id, recovery.executorId))) return recovery.executorId;
        const next = ids[0];
        if (next !== undefined) {
            const source = sourceById(next);
            if (source) source.SpinnerConstructionPoints = 0;
        }
        recovery.executorId = next;
        return next;
    }

    function reconcilePendingCrossing(recovery) {
        if (!recovery?.pendingCrossing) return;
        const goal = destination(recovery);
        if (!crossingValid(recovery.pendingCrossing, goal?.key)) recovery.pendingCrossing = undefined;
    }

    function audit() {
        let recovery = state();
        if (!recovery) return false;
        recovery = migrate(recovery);
        if (
            recovery.version !== VERSION ||
            !recovery.sources ||
            typeof recovery.sources !== "object" ||
            !recovery.sourceRemovalWork ||
            typeof recovery.sourceRemovalWork !== "object"
        ) {
            delete KDGameData[STATE];
            return false;
        }
        const carrier = carrierById(recovery.carrierId);
        if (!carrier || !usableLeash(carrier) || (recovery.ownedCarrier && carrier.name !== LEASH)) {
            clearRecoveryForCarrierLoss(recovery);
            return false;
        }
        for (const [key, record] of Object.entries(sourceRecords(recovery))) {
            const source = sourceById(record?.id);
            if (!allowedSource(recovery, source) || !sourceActionable(source)) {
                delete recovery.sources[key];
                delete recovery.sourceRemovalWork[key];
            }
        }
        if (!sourceIds(recovery).length) {
            recovery.executorId = undefined;
            recovery.resisted = false;
            recovery.pendingCrossing = undefined;
            recovery.sourceRemovalWork = {};
            return true;
        }
        chooseExecutor(recovery);
        reconcilePendingCrossing(recovery);
        return true;
    }

    function addOwnedCarrier(source) {
        const restraint =
            typeof KinkyDungeonGetRestraintByName === "function" ? KinkyDungeonGetRestraintByName(LEASH) : undefined;
        if (!restraint || typeof KinkyDungeonAddRestraint !== "function") return undefined;
        const blockers =
            typeof KDGetBlockersToAddRestraint === "function"
                ? KDGetBlockersToAddRestraint(restraint, player(), restraint.bypass === true) || []
                : ["missing-preflight"];
        const current =
            typeof KinkyDungeonGetRestraintItem === "function" ? KinkyDungeonGetRestraintItem(GROUP) : undefined;
        if (
            blockers.length ||
            typeof KDCanAddRestraint !== "function" ||
            KDCanAddRestraint(restraint, false, "", false, current, true, true, source) !== true
        )
            return undefined;
        const before = new Set(allItems().filter((item) => item.name === LEASH));
        const added = KinkyDungeonAddRestraint(
            restraint,
            0,
            false,
            "",
            false,
            false,
            false,
            undefined,
            "Enemy",
            false,
            undefined,
            undefined,
            true,
            source,
        );
        if (!(Number(added) > 0)) return undefined;
        return allItems().find((item) => item.name === LEASH && !before.has(item));
    }

    function acquireCarrier(source) {
        const owned = allItems().find((item) => item.name === LEASH);
        if (owned && usableLeash(owned)) return { item: owned, owned: true };
        const top =
            typeof KinkyDungeonGetRestraintItem === "function" ? KinkyDungeonGetRestraintItem(GROUP) : undefined;
        if (usableLeash(top)) return { item: top, owned: false };
        const added = addOwnedCarrier(source);
        return added && usableLeash(added) ? { item: added, owned: true } : undefined;
    }

    function attach(source, eligibility) {
        const carrier = acquireCarrier(source);
        if (!carrier?.item || carrier.item.id === undefined) return false;
        KDGameData[STATE] = {
            version: VERSION,
            carrierId: carrier.item.id,
            ownedCarrier: carrier.owned,
            eligibleSourceIds: [...eligibility.eligibleSourceIds],
            sources: {
                [sourceKey(source.id)]: makeSourceRecord(source, eligibility),
            },
            sourceRemovalWork: {},
            executorId: source.id,
            resisted: false,
            pendingCrossing: undefined,
            lastPullTick: undefined,
        };
        delete KDGameData[DEPARTURE];
        return true;
    }

    // This is called only by the successful native Spinner player-effect entrance.
    function hit(source) {
        if (api.SpinnerCapture?.isControllingPlayer?.() || npcCaptureUsesSource(source?.id)) return false;
        audit();
        const recovery = state();
        if (recovery) {
            if (!allowedSource(recovery, source) || !sourceActionable(source)) return false;
            const key = sourceKey(source.id),
                existing = recovery.sources[key];
            if (existing) {
                const refreshed = makeSourceRecord(source, existing);
                existing.groupId = refreshed.groupId;
                existing.compositeId = refreshed.compositeId;
                existing.lastHitTick = turn();
            } else if (sourceIds(recovery).length < MAX_SOURCES) {
                recovery.sources[key] = makeSourceRecord(source, departure() || departureFromRecovery(recovery));
                delete recovery.sourceRemovalWork[key];
                chooseExecutor(recovery);
            }
            reconcilePendingCrossing(recovery);
            return true;
        }
        const eligibility = departure();
        if (!eligibility || !allowedSource(eligibility, source) || !sourceActionable(source)) return false;
        attach(source, eligibility);
        // A legal recovery hit is consumed even when native equipment rules reject the carrier.
        return true;
    }

    function onPlayerMove(data) {
        if (!data || data.cancelmove) return false;
        if (!data.willing && !ownedMovement) nativeMoveTick = turn();
        if (data.willing && state()?.pendingCrossing) state().pendingCrossing = undefined;
        if (ownedMovement || api.SpinnerCapture?.isControllingPlayer?.() || state()) return false;
        const from = { x: data.lastX, y: data.lastY },
            to = { x: data.moveX, y: data.moveY },
            breached = api.SpinnerNativeField?.breachedDeparture(from, to);
        return rememberDeparture(breached);
    }

    function nativePath(goal, source) {
        if (!goal || typeof KinkyDungeonFindPath !== "function") return undefined;
        if (goal.x === player().x && goal.y === player().y) return [];
        return KinkyDungeonFindPath(
            player().x,
            player().y,
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

    function destination(recovery) {
        const field = api.SpinnerNativeField,
            executor = sourceById(recovery.executorId),
            choices = new Map();
        for (const record of Object.values(sourceRecords(recovery))) {
            if (!record.compositeId) continue;
            if (typeof field?.compositeById === "function" && !field.compositeById(record.compositeId)) continue;
            const core = field.commonCore?.(record.compositeId);
            if (!core) continue;
            const path = nativePath(core, executor);
            if (!Array.isArray(path)) continue;
            const key = String(record.compositeId),
                current = choices.get(key) || {
                    key: `field:${key}`,
                    compositeId: record.compositeId,
                    x: core.x,
                    y: core.y,
                    count: 0,
                    distance: path.length,
                };
            current.count += 1;
            current.distance = Math.min(current.distance, path.length);
            choices.set(key, current);
        }
        const selected = [...choices.values()].sort(
            (left, right) =>
                right.count - left.count ||
                left.distance - right.distance ||
                String(left.compositeId).localeCompare(String(right.compositeId)),
        )[0];
        if (selected) return selected;
        return (
            executor && {
                key: `source:${executor.id}`,
                x: executor.x,
                y: executor.y,
                count: 0,
                distance: Math.max(Math.abs(executor.x - player().x), Math.abs(executor.y - player().y)),
            }
        );
    }

    function landingLegal(cell) {
        if (!cell || (cell.x === player().x && cell.y === player().y)) return false;
        if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y))) return false;
        if (KinkyDungeonTilesGet(`${cell.x},${cell.y}`)?.Lock) return false;
        return !KinkyDungeonEntityAt(cell.x, cell.y);
    }

    function sameCell(left, right) {
        return !!left && !!right && left.x === right.x && left.y === right.y;
    }

    function webCellLegal(cell) {
        if (!api.SpinnerNativeField?.isSpiderlingsWebCell?.(cell)) return false;
        if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y))) return false;
        if (KinkyDungeonTilesGet(`${cell.x},${cell.y}`)?.Lock) return false;
        const occupant = KinkyDungeonEntityAt(cell.x, cell.y);
        return !occupant || api.SpinnerNativeField?.isOwnedProxy?.(occupant);
    }

    function crossingCandidate(goal) {
        if (!goal) return undefined;
        const currentDistance = Math.max(Math.abs(goal.x - player().x), Math.abs(goal.y - player().y));
        const directions = [];
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if ((!dx && !dy) || (dx && dy)) continue;
                const distance = Math.max(Math.abs(goal.x - (player().x + dx)), Math.abs(goal.y - (player().y + dy)));
                if (distance < currentDistance) directions.push({ dx, dy, distance });
            }
        directions.sort((left, right) => left.distance - right.distance || left.dy - right.dy || left.dx - right.dx);
        for (const { dx, dy } of directions) {
            const webCells = [];
            let x = player().x + dx,
                y = player().y + dy;
            while (api.SpinnerNativeField?.isSpiderlingsWebCell?.({ x, y })) {
                const cell = { x, y };
                if (!webCellLegal(cell)) return undefined;
                webCells.push(cell);
                x += dx;
                y += dy;
            }
            const far = { x, y };
            if (webCells.length && landingLegal(far)) return { near: { x: player().x, y: player().y }, webCells, far };
        }
        return undefined;
    }

    function crossingValid(crossing, destinationKey) {
        return !!(
            crossing &&
            crossing.destinationKey === destinationKey &&
            sameCell(crossing.near, player()) &&
            Array.isArray(crossing.webCells) &&
            crossing.webCells.length > 0 &&
            crossing.webCells.every(webCellLegal) &&
            landingLegal(crossing.far)
        );
    }

    function alreadyMovedThisTurn(recovery) {
        if (recovery.lastPullTick === turn() || nativeMoveTick === turn()) return true;
        if (typeof KinkyDungeonFlags !== "undefined" && KinkyDungeonFlags?.get) {
            return !!(KinkyDungeonFlags.get("forceMoved") || KinkyDungeonFlags.get("pulled"));
        }
        return false;
    }

    function movePlayer(cell) {
        const before = { x: player().x, y: player().y };
        ownedMovement = true;
        try {
            globalThis.KDMovePlayer(cell.x, cell.y, false);
        } finally {
            ownedMovement = false;
        }
        const moved = player().x !== before.x || player().y !== before.y;
        if (moved && typeof globalThis.KinkyDungeonSetFlag === "function") globalThis.KinkyDungeonSetFlag("pulled", 1);
        return moved;
    }

    function pull(recovery, source) {
        if (alreadyMovedThisTurn(recovery)) return false;
        recovery.lastPullTick = turn();
        const goal = destination(recovery);
        if (!goal) return false;
        if (recovery.pendingCrossing) {
            if (!crossingValid(recovery.pendingCrossing, goal.key)) {
                recovery.pendingCrossing = undefined;
                return false;
            }
            if (recovery.resisted) {
                recovery.resisted = false;
                return true;
            }
            recovery.pendingCrossing.paidActions += 1;
            if (
                recovery.pendingCrossing.paidActions <
                CONFIG.crossingActionsPerCell * recovery.pendingCrossing.webCells.length
            )
                return true;
            const far = recovery.pendingCrossing.far;
            recovery.pendingCrossing = undefined;
            return movePlayer(far);
        }
        const path = nativePath(goal, source),
            step = path?.[0];
        if (landingLegal(step) && Math.max(Math.abs(step.x - player().x), Math.abs(step.y - player().y)) <= 1) {
            if (recovery.resisted) {
                recovery.resisted = false;
                return true;
            }
            return movePlayer(step);
        }
        const crossing = crossingCandidate(goal);
        if (!crossing) return false;
        if (recovery.resisted) {
            recovery.resisted = false;
            return true;
        }
        recovery.pendingCrossing = { ...crossing, paidActions: 1, destinationKey: goal.key };
        return true;
    }

    function handleEnemyTurn(enemy, _target, delta) {
        if (!audit()) return undefined;
        const recovery = state();
        if (!sourceRecords(recovery)[sourceKey(enemy?.id)]) return undefined;
        if (api.SpinnerCapture?.isControllingPlayer?.()) return result(enemy);
        if (!sameId(recovery.executorId, enemy?.id)) return result(enemy);
        if (api.SpinnerNativeField.accrueConstructionAction(enemy, delta) && !alreadyMovedThisTurn(recovery)) {
            pull(recovery, enemy);
        }
        return result(enemy);
    }

    function strength(recovery = state()) {
        return Math.max(0, Math.min(MAX_SOURCES, sourceIds(recovery).length));
    }

    function standFirmCost(recovery = state()) {
        const count = strength(recovery);
        return count > 0 ? CONFIG.standBase + CONFIG.standPerExtraSource * (count - 1) : 0;
    }

    function standFirm() {
        if (!audit() || !strength()) return "Blocked";
        const displayed = standFirmCost(),
            cost = displayed / 10;
        if (typeof KinkyDungeonHasStamina === "function" && !KinkyDungeonHasStamina(cost, true)) return "NoStamina";
        if (typeof KDChangeStamina === "function")
            KDChangeStamina("struggle", "binding", "spiderlingsRecoveryStand", -cost);
        state().resisted = true;
        if (typeof KinkyDungeonLastAction !== "undefined") KinkyDungeonLastAction = "Struggle";
        if (typeof KinkyDungeonAdvanceTime === "function") KinkyDungeonAdvanceTime(1);
        return "Stand";
    }

    function itemProgressSnapshot(item) {
        const fields = ["cutProgress", "struggleProgress", "pickProgress", "unlockProgress"];
        return Object.fromEntries(fields.map((field) => [field, { present: field in item, value: item[field] }]));
    }

    function restoreItemProgress(item, snapshot) {
        for (const [field, saved] of Object.entries(snapshot || {})) {
            if (saved.present) item[field] = saved.value;
            else delete item[field];
        }
    }

    function legalRemovalAttempt(data) {
        if (
            !data ||
            data.query ||
            !["Cut", "Remove", "Struggle"].includes(data.struggleType) ||
            (data.struggleType === "Cut" && data.canCut === false && !data.hasAffinity) ||
            (data.struggleGroup && typeof KDGroupBlocked === "function" && KDGroupBlocked(data.struggleGroup))
        )
            return false;
        const cost = Number(data.cost || 0);
        return typeof KinkyDungeonHasStamina !== "function" || KinkyDungeonHasStamina(-cost, true);
    }

    function removeSource(recovery, id) {
        const key = sourceKey(id);
        if (!recovery.sources[key]) return false;
        const wasExecutor = sameId(recovery.executorId, id);
        delete recovery.sources[key];
        delete recovery.sourceRemovalWork[key];
        if (wasExecutor) recovery.executorId = undefined;
        if (!sourceIds(recovery).length) {
            recovery.resisted = false;
            recovery.pendingCrossing = undefined;
            recovery.sourceRemovalWork = {};
        }
        chooseExecutor(recovery);
        reconcilePendingCrossing(recovery);
        return true;
    }

    function beforeStruggle(_event, item, data) {
        armedRemoval.delete(item);
        if (!audit()) return;
        const recovery = state();
        if (!sameId(item?.id, recovery.carrierId) || item !== data?.restraint) return;
        if (recovery.ownedCarrier && ["Cut", "Remove", "Struggle"].includes(data.struggleType))
            data.escapePenalty = Number(data.escapePenalty || 0) + ESCAPE_PENALTY * Math.max(0, strength() - 1);
        if (selectedSourceId === undefined || !sourceRecords(recovery)[sourceKey(selectedSourceId)]) return;
        if (!legalRemovalAttempt(data)) return;
        armedRemoval.set(item, {
            sourceId: selectedSourceId,
            method: data.struggleType,
            progress: itemProgressSnapshot(item),
        });
        data.escapeSpeed = 0;
        data.cutSpeed = 0;
        data.minSpeed = 1e-6;
        data.limitChance = 0;
        data.escapeChance = 0;
        data.escapePenalty = Math.max(100, Number(data.escapePenalty || 0));
    }

    function afterStruggle(_event, item, data) {
        const armed = armedRemoval.get(item);
        armedRemoval.delete(item);
        if (!armed) return;
        restoreItemProgress(item, armed.progress);
        if (data?.result !== "Fail" || data.struggleType !== armed.method || !audit()) return;
        const recovery = state(),
            key = sourceKey(armed.sourceId);
        if (!recovery.sources[key]) return;
        if (armed.method === "Cut") {
            removeSource(recovery, armed.sourceId);
            return;
        }
        const work = recovery.sourceRemovalWork[key] || { removeOrStruggle: 0 };
        work.removeOrStruggle += 1;
        if (work.removeOrStruggle >= 2) removeSource(recovery, armed.sourceId);
        else recovery.sourceRemovalWork[key] = work;
    }

    function sourceRemovalInput(data = {}) {
        if (!audit() || !sourceRecords()[sourceKey(data.sourceId)]) return "Blocked";
        if (typeof KDInputTypes === "undefined" || typeof KDInputTypes.struggle !== "function") return "Blocked";
        const recovery = state(),
            carrier = carrierById(recovery.carrierId),
            root = typeof KinkyDungeonGetRestraintItem === "function" ? KinkyDungeonGetRestraintItem(GROUP) : undefined,
            carrierIndex =
                data.index ??
                (typeof KDDynamicLinkListSurface === "function"
                    ? KDDynamicLinkListSurface(root).findIndex((item) => item === carrier)
                    : undefined),
            originalEvents = carrier?.events,
            needsEvents =
                !recovery.ownedCarrier && carrier && !carrier.events?.some((entry) => entry.type === ESCAPE_EVENT);
        if (needsEvents) {
            carrier.events = [
                ...(carrier.events || []),
                { inheritLinked: true, trigger: "beforeStruggleCalc", type: ESCAPE_EVENT },
                { inheritLinked: true, trigger: "struggle", type: ESCAPE_EVENT },
            ];
            if (typeof KDUpdateItemEventCache !== "undefined") KDUpdateItemEventCache = true;
        }
        selectedSourceId = data.sourceId;
        try {
            return KDInputTypes.struggle({
                group: GROUP,
                type: data.type || "Struggle",
                index: carrierIndex >= 0 ? carrierIndex : undefined,
            });
        } finally {
            selectedSourceId = undefined;
            if (needsEvents) {
                if (originalEvents === undefined) delete carrier.events;
                else carrier.events = originalEvents;
                if (typeof KDUpdateItemEventCache !== "undefined") KDUpdateItemEventCache = true;
            }
        }
    }

    function afterLoad() {
        ownedMovement = false;
        nativeMoveTick = undefined;
        selectedSourceId = undefined;
        const pending = departure();
        if (pending?.version !== 1) delete KDGameData[DEPARTURE];
        if (!audit()) return;
        reconcilePendingCrossing(state());
    }

    if (typeof KDEventMapInventory !== "undefined") {
        event(KDEventMapInventory, "beforeStruggleCalc", ESCAPE_EVENT, beforeStruggle);
        event(KDEventMapInventory, "struggle", ESCAPE_EVENT, afterStruggle);
    }
    if (typeof KDInputTypes !== "undefined") {
        KDInputTypes.spiderlingsRecoveryStand = standFirm;
        KDInputTypes.spiderlingsRecoveryRemoveSource = sourceRemovalInput;
    }

    if (api.restraintCatalog?.register) {
        api.restraintCatalog.register({
            id: LEASH,
            module: "SpinnerRecovery",
            stage: "Recovery",
            model: "Leash",
            restraint: {
                inventory: true,
                removePrison: true,
                name: LEASH,
                tether: 2.9,
                Asset: "CollarLeash",
                Color: "Default",
                Group: GROUP,
                leash: true,
                power: 1,
                weight: -99,
                harness: true,
                Model: "Leash",
                unlimited: true,
                sfxGroup: "Ropes",
                struggleBreak: true,
                cutVulnerability: 2,
                affinity: {
                    Cut: ["SharpTug", "SharpHookOrFoot"],
                    Struggle: ["Tug", "HookOrFoot"],
                },
                requireAllTagsToEquip: ["Collars"],
                events: [
                    { trigger: "postRemoval", type: "RequireCollar" },
                    { inheritLinked: true, trigger: "beforeStruggleCalc", type: ESCAPE_EVENT },
                    { inheritLinked: true, trigger: "struggle", type: ESCAPE_EVENT },
                ],
                struggleMinSpeed: { Cut: 0.05 },
                limitChance: { Struggle: 0.3 },
                escapeChance: { Struggle: 0, Cut: 0.2, Remove: 0.5, Pick: 1.25 },
                enemyTags: { leashing: 1 },
                playerTags: { ItemNeckRestraintsFull: -2, ItemNeckFull: 99 },
                minLevel: 0,
                allFloors: true,
                shrine: ["Leashes", "Leashable"],
            },
            text: [
                "Spiderling Silk Leash",
                "A real silk leash used by a Spinner to pull an escaped target back toward its web field.",
                "The silk line trails slack when no Spinner controls it.",
            ],
        });
        if (typeof KinkyDungeonRefreshRestraintsCache === "function") KinkyDungeonRefreshRestraintsCache();
    }

    api.SpinnerRecovery = Object.freeze({
        STATE,
        DEPARTURE,
        LEASH,
        GROUP,
        VERSION,
        MAX_SOURCES,
        ESCAPE_PENALTY,
        CONFIG,
        state,
        departure,
        hit,
        audit,
        onPlayerMove,
        handleEnemyTurn,
        clearControl,
        afterLoad,
        strength,
        standFirmCost,
        standFirm,
        sourceIds,
        destination,
        pull,
        sourceRemovalInput,
        removeSource,
        sourceActionable,
        usableLeash,
    });
})();
