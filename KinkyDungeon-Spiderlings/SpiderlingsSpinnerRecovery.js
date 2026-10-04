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
        VERSION = 3,
        TETHER_REASON = "SpiderlingsRecovery",
        ESCAPE_EVENT = "SpiderlingsRecoveryEscape";
    const CONFIG = Object.freeze({ maxSources: Infinity, escapePenaltyPerExtraSource: 0.05 }),
        MAX_SOURCES = CONFIG.maxSources,
        ESCAPE_PENALTY = CONFIG.escapePenaltyPerExtraSource;
    const strandVisuals = new Map();

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

    function relayEligible(source, recovery) {
        return (
            allowedSource(recovery, source) &&
            sourceActionable(source, false) &&
            !npcCaptureUsesSource(source.id) &&
            !api.SpinnerNPCRecovery?.usesEntity?.(source.id) &&
            !Object.values(api.NPCWrapping?.records?.() || {}).some((record) =>
                record.sourceIds?.some((id) => sameId(id, source.id)),
            )
        );
    }

    function relayContact(left, right) {
        const range = Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
        return range <= MAX_RANGE && KinkyDungeonCheckLOS(left, right, range, MAX_RANGE, false, false);
    }

    function allowedSource(record, source) {
        return !!source && (record?.eligibleSourceIds || []).some((id) => sameId(id, source.id));
    }

    function hasAnchor() {
        return allItems().some(
            (item) =>
                usableLeash(item) ||
                item.name === "SpiderlingsSpinnerLegbinder" ||
                definition(item)?.shrine?.includes("Collars"),
        );
    }

    function ownsNativeTether() {
        return player().leash?.reason === TETHER_REASON;
    }

    function bindNativeTether(recovery) {
        const owner = sourceById(recovery.executorId),
            carrier = carrierById(recovery.carrierId);
        if (!owner || !carrier || typeof KinkyDungeonAttachTetherToEntity !== "function") return false;
        if (player().leash && !ownsNativeTether()) return false;
        if (
            ownsNativeTether() &&
            sameId(player().leash.entity, owner.id) &&
            sameId(player().leash.restraintID, carrier.id)
        )
            return true;
        if (ownsNativeTether()) KDBreakTether(player());
        const leash = KinkyDungeonAttachTetherToEntity(2.9, owner, player(), TETHER_REASON, "#C4A1EF", 5, carrier);
        if (!leash) return false;
        KDGameData.KinkyDungeonLeashingEnemy = owner.id;
        KDGameData.KinkyDungeonLeashedPlayer = Math.max(5, KDGameData.KinkyDungeonLeashedPlayer || 0);
        return true;
    }

    function releaseNativeTether() {
        if (player().leash && !ownsNativeTether()) return;
        const owner = player().leash?.entity ?? state()?.executorId;
        if (ownsNativeTether()) KDBreakTether(player());
        if (sameId(KDGameData.KinkyDungeonLeashingEnemy, owner)) {
            KDGameData.KinkyDungeonLeashingEnemy = 0;
            KDGameData.KinkyDungeonLeashedPlayer = 0;
        }
    }

    // Eligibility only: native perception must supply the target before AI pursues it.
    function wantsPursuit(source, target) {
        const eligibility = departure() || state();
        if (
            target !== player() ||
            !core.pendingSource(eligibility, source?.id) ||
            (!state() && !hasAnchor()) ||
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
            const parent = sourceById(sourceRecords()[sourceKey(id)]?.relayParentId);
            const to = parent || player();
            const from = point(source),
                target = point(to);
            let visible = false;
            entry.mask.beginFill(0xffffff);
            // Per-cell pixel masking keeps the continuous silk inside visible
            // tiles, including a partly hidden source-to-player segment.
            for (
                let y = Math.max(0, Math.min(source.y, to.y));
                y <= Math.min(KDMapData.GridHeight - 1, Math.max(source.y, to.y));
                y++
            )
                for (
                    let x = Math.max(0, Math.min(source.x, to.x));
                    x <= Math.min(KDMapData.GridWidth - 1, Math.max(source.x, to.x));
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
            if (entry.sprite) {
                entry.sprite.mask = entry.mask;
                entry.sprite.alpha = 0.8;
            } else {
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
        releaseNativeTether();
        delete KDGameData[STATE];
        delete KDGameData[DEPARTURE];
    }

    function clearRecoveryForCarrierLoss(recovery) {
        releaseNativeTether();
        rememberDeparture(departureFromRecovery(recovery));
        delete KDGameData[STATE];
    }

    function migrate(recovery) {
        if (recovery?.version === 2) {
            recovery.version = VERSION;
            delete recovery.pendingCrossing;
            delete recovery.sourceRemovalWork;
            delete recovery.resisted;
            delete recovery.severedSourceIds;
            return recovery;
        }
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
            executorId: recovery.executorId,
        };
        return KDGameData[STATE];
    }

    function chooseExecutor(recovery) {
        return core.chooseExecutor(recovery, (_previous, next) => {
            const source = sourceById(next);
            if (source) source.SpinnerConstructionPoints = 0;
        });
    }

    function audit() {
        let recovery = state();
        if (!recovery) return false;
        if (player().leash && !ownsNativeTether()) {
            clearControl();
            return false;
        }
        recovery = migrate(recovery);
        if (recovery.version !== VERSION || !recovery.sources || typeof recovery.sources !== "object") {
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
        const links = core.relayLinks(
            recovery,
            sourceById,
            (source) => relayEligible(source, recovery),
            (source) => sourceActionable(source),
            relayContact,
        );
        core.auditSources(recovery, sourceById, (source) => links.has(sourceKey(source.id)));
        for (const saved of Object.values(sourceRecords(recovery)))
            saved.relayParentId = links.get(sourceKey(saved.id));
        if (!sourceIds(recovery).length) {
            releaseNativeTether();
            recovery.executorId = undefined;
            return true;
        }
        chooseExecutor(recovery);
        bindNativeTether(recovery);
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
        if (player().leash && !ownsNativeTether()) return false;
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
            executorId: source.id,
        };
        if (!bindNativeTether(state())) {
            delete KDGameData[STATE];
            return false;
        }
        delete KDGameData[DEPARTURE];
        return true;
    }

    if (typeof addTextKey === "function") {
        addTextKey(
            "SpiderlingsRecoveryAttached",
            "A Spinner attaches a silk strand ({count}). The taut silk can pull you back.",
        );
        addTextKey(
            "SpiderlingsRecoveryAttachBlocked",
            "The silk leash cannot attach. It needs a compatible collar or silken leg bag, with no other equipment blocking it.",
        );
    }

    function feedback(attached) {
        if (typeof KinkyDungeonSendTextMessage !== "function") return;
        const key = attached ? "SpiderlingsRecoveryAttached" : "SpiderlingsRecoveryAttachBlocked",
            fallback = attached
                ? "A Spinner attaches a silk strand ({count}). The taut silk can pull you back."
                : "The silk leash cannot attach. It needs a compatible collar or silken leg bag, with no other equipment blocking it.",
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
            if (finishReturn(recovery)) return false;
            if (!allowedSource(recovery, source) || !sourceActionable(source)) return false;
            const key = sourceKey(source.id),
                existing = recovery.sources[key],
                association = sourceAssociation(source, existing || departure() || departureFromRecovery(recovery)),
                upserted = core.upsertSource(recovery, source, association, turn(), MAX_SOURCES);
            if (upserted.added) {
                chooseExecutor(recovery);
                feedback(true);
            }
            bindNativeTether(recovery);
            return true;
        }
        const eligibility = departure();
        if (!eligibility || !allowedSource(eligibility, source) || !sourceActionable(source)) return false;
        const attached = attach(source, eligibility);
        feedback(attached);
        return attached;
    }

    function onPlayerMove(data) {
        if (!data || data.cancelmove) return false;
        if (api.SpinnerCapture?.isControllingPlayer?.() || state()) return false;
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

    // Only an enemy's paid native movement changes the tether endpoint. Native
    // KinkyDungeonUpdateTether owns the player's displacement and leash feedback.
    function escort(recovery, source, delta) {
        const goal = destination(recovery);
        if (!goal || !(delta > 0)) return false;
        const leading = sameId(source.id, recovery.executorId);
        if (!leading && Math.max(Math.abs(source.x - player().x), Math.abs(source.y - player().y)) <= 2) return false;
        let endpoint = leading ? goal : player();
        if (leading && source.x === goal.x && source.y === goal.y)
            endpoint = { x: goal.x + Math.sign(goal.x - player().x), y: goal.y + Math.sign(goal.y - player().y) };
        const path = KinkyDungeonFindPath(
            source.x,
            source.y,
            endpoint.x,
            endpoint.y,
            true,
            false,
            false,
            KinkyDungeonMovableTilesEnemy,
            undefined,
            undefined,
            undefined,
            source,
        );
        const next = path?.find((cell) => cell.x !== source.x || cell.y !== source.y);
        let moved = false;
        if (
            next &&
            !(next.x === player().x && next.y === player().y) &&
            (!KinkyDungeonEntityAt(next.x, next.y) ||
                api.SpinnerNativeField?.isOwnedProxy?.(KinkyDungeonEntityAt(next.x, next.y)))
        )
            moved = KinkyDungeonEnemyTryMove(
                source,
                { x: next.x - source.x, y: next.y - source.y },
                delta,
                next.x,
                next.y,
                false,
            );
        if (leading && bindNativeTether(recovery)) {
            const ownerDistance = Math.max(Math.abs(source.x - goal.x), Math.abs(source.y - goal.y)),
                playerDistance = Math.max(Math.abs(player().x - goal.x), Math.abs(player().y - goal.y));
            if (ownerDistance < playerDistance && (moved || !next)) player().leash.length = 1.5;
            KinkyDungeonUpdateTether(delta, true, player());
        }
        return moved;
    }

    function finishReturn(recovery) {
        const goal = destination(recovery);
        if (!goal?.compositeId) return false;
        const graph = api.SpinnerNativeField?.state?.()?.topology;
        if (!(graph && api.SpinnerTopology.isInsideCommonCore(graph, goal.compositeId, player()))) return false;
        clearControl();
        return true;
    }

    function handleEnemyTurn(enemy, _target, delta) {
        if (!audit()) return undefined;
        const recovery = state();
        if (finishReturn(recovery)) return undefined;
        if (!sourceRecords(recovery)[sourceKey(enemy?.id)]) {
            if (!relayEligible(enemy, recovery)) return undefined;
            const donor = Object.values(sourceRecords(recovery))
                .map((saved) => sourceById(saved.id))
                .find((source) => source && relayContact(source, enemy));
            if (!donor) return undefined;
            if (api.SpinnerNativeField.accrueConstructionAction(enemy, delta)) {
                const added = core.upsertSource(
                    recovery,
                    enemy,
                    sourceAssociation(enemy, recovery),
                    turn(),
                    MAX_SOURCES,
                );
                if (added.added) {
                    added.source.relayParentId = donor.id;
                    feedback(true);
                }
            }
            return result(enemy);
        }
        if (!api.SpinnerCapture?.isControllingPlayer?.()) escort(recovery, enemy, delta);
        return result(enemy);
    }

    function strength(recovery = state()) {
        return sourceIds(recovery).length;
    }

    function beforeStruggle(_event, item, data) {
        const recovery = state();
        if (
            sameId(item?.id, recovery?.carrierId) &&
            item === data?.restraint &&
            recovery.ownedCarrier &&
            ["Cut", "Remove", "Struggle"].includes(data.struggleType)
        )
            data.escapePenalty = Number(data.escapePenalty || 0) + ESCAPE_PENALTY * Math.max(0, strength(recovery) - 1);
    }

    if (typeof KDLeashReason !== "undefined")
        KDLeashReason[TETHER_REASON] = () => {
            const recovery = state();
            return (
                !!recovery &&
                !!carrierById(recovery.carrierId) &&
                sourceActionable(sourceById(recovery.executorId), false)
            );
        };
    if (typeof KinkyDungeonMoveTo === "function")
        KinkyDungeonMoveTo = api.Hooks.wrap(
            "Spinner.recoveryMoveCost",
            KinkyDungeonMoveTo,
            (native) =>
                function () {
                    const before = { x: player().x, y: player().y },
                        count = ownsNativeTether() ? strength() : 0;
                    const cost = native.apply(this, arguments);
                    if (count > 1 && cost > 0 && (player().x !== before.x || player().y !== before.y)) {
                        // Use native movement debt, not a second input/action system. Native
                        // MoveTo's returned slow cost is capped by its caller at nine; the
                        // accumulator itself has no such cap and is saved by KD.
                        KDGameData.MovePoints = Math.min(
                            KDGameData.MovePoints || 0,
                            1 - Math.max(1, cost) - (count - 1),
                        );
                    }
                    return cost;
                },
        );

    function afterLoad() {
        clearStrandVisuals(true);

        // Native saves retain each item's event list, including the old collar-only guard.
        for (const item of allItems()) {
            if (item.name !== LEASH || !Array.isArray(item.events)) continue;
            const priorEvents = item.events.length;
            item.events = item.events.filter(
                (savedEvent) => savedEvent.type !== ESCAPE_EVENT || savedEvent.trigger !== "struggle",
            );
            if (item.events.length !== priorEvents && typeof KDUpdateItemEventCache !== "undefined")
                KDUpdateItemEventCache = true;
            for (const savedEvent of item.events) {
                if (savedEvent.trigger !== "postRemoval" || savedEvent.type !== "RequireCollar") continue;
                savedEvent.type = "SpiderlingsRecoveryAnchor";
                if (typeof KDUpdateItemEventCache !== "undefined") KDUpdateItemEventCache = true;
            }
        }
        const pending = departure();
        if (pending?.version !== 1) delete KDGameData[DEPARTURE];
        if (!audit()) return;
        bindNativeTether(state());
    }

    if (typeof KDEventMapGeneric !== "undefined") {
        event(KDEventMapGeneric, "canSprint", STATE, (_event, data) => {
            if (ownsNativeTether() && strength() > 1 && KDGameData.MovePoints < 1) data.canSprint = false;
        });
    }
    if (typeof KDEventMapGeneric !== "undefined")
        event(KDEventMapGeneric, "draw", STATE, (_event, data) => {
            drawStrands(data);
        });

    if (typeof KDEventMapInventory !== "undefined") {
        event(KDEventMapInventory, "postRemoval", "SpiderlingsRecoveryAnchor", (_event, item, data) => {
            if (data.Character !== KinkyDungeonPlayer || data.add || data.item === item) return;
            const anchored = allItems().some(
                (candidate) =>
                    candidate.name === "SpiderlingsSpinnerLegbinder" ||
                    definition(candidate)?.shrine?.includes("Collars"),
            );
            if (!anchored) KinkyDungeonRemoveRestraintSpecific(item, false, false, false);
        });
        event(KDEventMapInventory, "beforeStruggleCalc", ESCAPE_EVENT, beforeStruggle);
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
                requireSingleTagToEquip: ["Collars", "SpiderlingsLegbinderAnchor"],
                events: [
                    { trigger: "postRemoval", type: "SpiderlingsRecoveryAnchor" },
                    { inheritLinked: true, trigger: "beforeStruggleCalc", type: ESCAPE_EVENT },
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
                "Fine silk threads gather into a light cord with a soft sheen.",
                "Its fine threads draw gently taut when the cord is stretched, then settle into a soft curve as it slackens.",
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
        TETHER_REASON,
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
        sourceIds,
        destination,
        sourceActionable,
        wantsPursuit,
        usableLeash,
    });
})();
