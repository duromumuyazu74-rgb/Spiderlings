"use strict";

// Player recovery control is saved separately from both field geometry and the real leash item.
(() => {
    const api = globalThis.Spiderlings,
        core = api.SpinnerRecoveryCore,
        STATE = "SpiderlingsSpinnerRecovery",
        DEPARTURE = "SpiderlingsSpinnerRecoveryDeparture",
        LEASH = "SpiderlingsSilkLeash",
        GROUP = "ItemNeckRestraints",
        MAX_RANGE = 3,
        VERSION = 2,
        ESCAPE_EVENT = "SpiderlingsRecoveryEscape";
    const CONFIG = Object.freeze({
            maxSources: core.MAX_SOURCES,
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
    const armedRemoval = new WeakMap(),
        strandVisuals = new Map();

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

    function sourceActionable(source, requireContact = true) {
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
        if (!requireContact) return true;
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

    // Eligibility only: native perception must supply the target before AI pursues it.
    function wantsPursuit(source, target) {
        const eligibility = departure() || state();
        if (
            target !== player() ||
            !core.pendingSource(eligibility, source?.id) ||
            !sourceActionable(source, false) ||
            api.SpinnerCapture?.isControllingPlayer?.() ||
            npcCaptureUsesSource(source.id) ||
            api.SpinnerNPCRecovery?.usesEntity?.(source.id) ||
            Object.values(api.NPCWrapping?.records?.() || {}).some((record) =>
                record.sourceIds?.some((id) => sameId(id, source.id)),
            )
        )
            return false;
        const compositeId = eligibility.compositeId || sourceAssociation(source, eligibility)?.compositeId;
        return !!(
            compositeId &&
            api.SpinnerNativeField?.compositeById?.(compositeId) &&
            !api.SpinnerNativeField?.containsComposite?.(compositeId, target)
        );
    }

    function sourceRecords(recovery = state()) {
        return core.sourceRecords(recovery);
    }

    function sourceIds(recovery = state()) {
        return core.sourceIds(recovery);
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

    function clearStrandVisuals(dispose = false) {
        for (const entry of strandVisuals.values()) {
            if (entry.sprite && !entry.sprite.destroyed) entry.sprite.visible = false;
            if (entry.fallback && !entry.fallback.destroyed) entry.fallback.visible = false;
            if (entry.mask && !entry.mask.destroyed) {
                entry.mask.clear();
                entry.mask.visible = false;
            }
            if (dispose) {
                if (entry.sprite && !entry.sprite.destroyed) entry.sprite.mask = null;
                if (!entry.mask?.destroyed) entry.mask?.destroy();
                if (!entry.fallback?.destroyed) entry.fallback?.destroy();
            }
        }
        if (dispose) strandVisuals.clear();
    }

    // Read-only rendering: the recovery controller retains movement ownership.
    function drawStrands(data) {
        clearStrandVisuals();
        for (const [id, entry] of strandVisuals) {
            if (sourceRecords()[id] && sourceById(id)?.hp > 0) continue;
            if (entry.sprite && !entry.sprite.destroyed) entry.sprite.mask = null;
            if (!entry.mask.destroyed) entry.mask.destroy();
            if (entry.fallback && !entry.fallback.destroyed) entry.fallback.destroy();
            strandVisuals.delete(id);
        }
        if (!state() || api.SpinnerCapture?.isControllingPlayer?.() || !carrierById(state().carrierId)) return;
        if (typeof PIXI === "undefined" || typeof kdgameboard === "undefined") return;
        const size = KinkyDungeonGridSizeDisplay,
            pans = typeof StandalonePatched !== "undefined" && StandalonePatched,
            point = (entity) => [
                (entity.x - data.CamX - (pans ? 0 : data.CamX_offset) + 0.5) * size,
                (entity.y - data.CamY - (pans ? 0 : data.CamY_offset) + 0.5) * size,
            ],
            target = point(player()),
            color = api.getSetting?.("spiderlingsPinkWebbing") === true ? "Pink" : "",
            root = typeof KinkyDungeonRootDirectory === "string" ? KinkyDungeonRootDirectory : "";
        for (const id of sourceIds()) {
            const source = sourceById(id);
            if (!source || !(source.hp > 0)) continue;
            let entry = strandVisuals.get(String(id));
            if (!entry || entry.mask.destroyed) {
                entry = { mask: new PIXI.Graphics() };
                kdgameboard.addChild(entry.mask);
                strandVisuals.set(String(id), entry);
            }
            const from = point(source);
            let visible = false;
            entry.mask.beginFill(0xffffff);
            // Per-cell pixel masking keeps the continuous silk inside visible
            // tiles, including a partly hidden source-to-player segment.
            for (
                let y = Math.max(0, Math.min(source.y, player().y));
                y <= Math.min(KDMapData.GridHeight - 1, Math.max(source.y, player().y));
                y++
            )
                for (
                    let x = Math.max(0, Math.min(source.x, player().x));
                    x <= Math.min(KDMapData.GridWidth - 1, Math.max(source.x, player().x));
                    x++
                ) {
                    if (!(KinkyDungeonVisionGet(x, y) > 0)) continue;
                    const xy = point({ x, y });
                    entry.mask.drawRect(xy[0] - size / 2, xy[1] - size / 2, size, size);
                    visible = true;
                }
            entry.mask.endFill();
            if (!visible) continue;
            entry.mask.visible = true;
            const dx = target[0] - from[0],
                dy = target[1] - from[1];
            entry.sprite =
                typeof KDDraw === "function" &&
                typeof kdpixisprites !== "undefined" &&
                KDDraw(
                    kdgameboard,
                    kdpixisprites,
                    `SpiderlingsRecoveryTether_${id}`,
                    root + `Bullets/SpiderlingsPlayerTether${color}.png`,
                    (from[0] + target[0]) / 2,
                    (from[1] + target[1]) / 2,
                    size,
                    Math.hypot(dx, dy),
                    Math.atan2(dy, dx) - Math.PI / 2,
                    undefined,
                    true,
                );
            if (entry.sprite) entry.sprite.mask = entry.mask;
            else {
                if (!entry.fallback || entry.fallback.destroyed) {
                    entry.fallback = new PIXI.Graphics();
                    kdgameboard.addChild(entry.fallback);
                }
                entry.fallback
                    .clear()
                    .lineStyle(2, color ? 0xff8bc5 : 0xb896ef, 1)
                    .moveTo(...from)
                    .lineTo(...target);
                entry.fallback.mask = entry.mask;
                entry.fallback.visible = true;
            }
        }
    }

    function clearControl() {
        clearStrandVisuals(true);
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
            compositeId: recovery.compositeId,
            groupId: recovery.groupId,
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
        return core.chooseExecutor(recovery, (_previous, next) => {
            const source = sourceById(next);
            if (source) source.SpinnerConstructionPoints = 0;
        });
    }

    function reconcilePendingCrossing(recovery) {
        if (!recovery?.pendingCrossing) return;
        const goal = destination(recovery);
        core.reconcileCrossing(recovery, player(), goal?.key, recoveryAdapters());
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
        const originalSource = Object.values(sourceRecords(recovery))[0];
        recovery.compositeId ||= originalSource?.compositeId;
        recovery.groupId ||= originalSource?.groupId;
        for (const id of core.auditSources(
            recovery,
            sourceById,
            (source) => allowedSource(recovery, source) && sourceActionable(source),
        ))
            delete recovery.sourceRemovalWork[core.sourceKey(id)];
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
            compositeId: eligibility.compositeId,
            groupId: eligibility.groupId,
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

    if (typeof addTextKey === "function") {
        addTextKey(
            "SpiderlingsRecoveryAttached",
            "Spinner attaches a recovery silk strand ({count}/8). Its next available action can pull you back.",
        );
        addTextKey(
            "SpiderlingsRecoveryAttachBlocked",
            "The recovery strand hits but cannot attach to compatible neck gear. A new silk leash needs a collar and normal equipment access; no pull is established.",
        );
    }

    function feedback(attached) {
        if (typeof KinkyDungeonSendTextMessage !== "function") return;
        const key = attached ? "SpiderlingsRecoveryAttached" : "SpiderlingsRecoveryAttachBlocked",
            fallback = attached
                ? "Spinner attaches a recovery silk strand ({count}/8). Its next available action can pull you back."
                : "The recovery strand hits but cannot attach to compatible neck gear. A new silk leash needs a collar and normal equipment access; no pull is established.",
            localized = typeof TextGet === "function" ? TextGet(key) : key;
        KinkyDungeonSendTextMessage(
            8,
            (localized !== key && !localized.startsWith("[NotFound]") ? localized : fallback).replace(
                "{count}",
                sourceIds().length,
            ),
            attached ? "#C4A1EF" : "#FFCC88",
            3,
        );
    }

    // This is called only by the successful native Spinner player-effect entrance.
    function hit(source) {
        if (api.SpinnerCapture?.isControllingPlayer?.() || npcCaptureUsesSource(source?.id)) return false;
        audit();
        const recovery = state();
        if (recovery) {
            if (!allowedSource(recovery, source) || !sourceActionable(source)) return false;
            const key = sourceKey(source.id),
                existing = recovery.sources[key],
                association = sourceAssociation(source, existing || departure() || departureFromRecovery(recovery)),
                upserted = core.upsertSource(recovery, source, association, turn(), MAX_SOURCES);
            if (upserted.added) {
                delete recovery.sourceRemovalWork[key];
                chooseExecutor(recovery);
                feedback(true);
            }
            reconcilePendingCrossing(recovery);
            return true;
        }
        const eligibility = departure();
        if (!eligibility || !allowedSource(eligibility, source) || !sourceActionable(source)) return false;
        feedback(attach(source, eligibility));
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
        const route = (actor, taxicab) =>
            KinkyDungeonFindPath(
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
                actor,
                undefined,
                undefined,
                taxicab,
            );
        // Pull the player through an open breach before considering paid web
        // crossings. Spider movement discounts otherwise prefer a blocked corner
        // over the open cell; recovery can cross webs only along a cardinal run.
        return route(undefined, false) || route(source, true);
    }

    function destination(recovery) {
        const executor = sourceById(recovery.executorId);
        return core.destination(
            recovery,
            (compositeId) => {
                if (
                    typeof api.SpinnerNativeField?.compositeById === "function" &&
                    !api.SpinnerNativeField.compositeById(compositeId)
                )
                    return undefined;
                return api.SpinnerNativeField?.commonCore?.(compositeId);
            },
            (goal) => {
                const path = nativePath(goal, executor);
                return Array.isArray(path) ? path.length : Number.POSITIVE_INFINITY;
            },
            sourceById,
        );
    }

    function landingLegal(cell) {
        if (!cell || (cell.x === player().x && cell.y === player().y)) return false;
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

    function recoveryAdapters() {
        return {
            position: (target) => ({ x: target.x, y: target.y }),
            turn,
            destination,
            path: nativePath,
            landingLegal,
            isWebCell: (cell) => api.SpinnerNativeField?.isSpiderlingsWebCell?.(cell) === true,
            webCellLegal,
            alreadyMoved: alreadyMovedThisTurn,
            resist: (recovery) => {
                if (!recovery.resisted) return false;
                recovery.resisted = false;
                return true;
            },
            move: (_target, cell) => movePlayer(cell),
        };
    }

    function pull(recovery, source) {
        return core.advancePull(recovery, player(), source, recoveryAdapters()).moved;
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
        clearStrandVisuals(true);
        ownedMovement = false;
        nativeMoveTick = undefined;
        selectedSourceId = undefined;
        const pending = departure();
        if (pending?.version !== 1) delete KDGameData[DEPARTURE];
        if (!audit()) return;
        reconcilePendingCrossing(state());
    }

    if (typeof KDEventMapGeneric !== "undefined")
        event(KDEventMapGeneric, "draw", STATE, (_event, data) => drawStrands(data));

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
                // Recovery equips this carrier by exact ID; generic leashing must not select it.
                enemyTags: {},
                playerTags: { ItemNeckRestraintsFull: -2, ItemNeckFull: 99 },
                minLevel: 0,
                allFloors: true,
                shrine: ["Leashes", "Leashable"],
            },
            text: [
                "Spiderling Silk Leash",
                "After leaving a breached field, a fresh eligible Spinner hit can attach this collar-mounted silk leash. An available Spinner action then pulls you back.",
                "A compatible collar and native equipment access are needed for a new leash. Active sources show silk strands; no sources leaves the leash slack.",
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
        wantsPursuit,
        usableLeash,
    });
})();
