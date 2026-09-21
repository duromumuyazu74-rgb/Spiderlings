"use strict";

// Player recovery control is saved separately from both field geometry and the real leash item.
(() => {
    const api = globalThis.Spiderlings,
        STATE = "SpiderlingsSpinnerRecovery",
        DEPARTURE = "SpiderlingsSpinnerRecoveryDeparture",
        LEASH = "SpiderlingsSilkLeash",
        GROUP = "ItemNeckRestraints",
        MAX_RANGE = 3;
    let ownedMovement = false;
    let nativeMoveTick;

    const player = () => KinkyDungeonPlayerEntity;
    const entities = () => KDMapData?.Entities || [];
    const state = () => KDGameData?.[STATE];
    const departure = () => KDGameData?.[DEPARTURE];
    const turn = () => (typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0);
    const sameId = (left, right) => left !== undefined && right !== undefined && String(left) === String(right);
    const result = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });

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
        return {
            compositeId: recovery.compositeId,
            groupId: recovery.groupId,
            eligibleSourceIds: recovery.eligibleSourceIds,
        };
    }

    function clearControl() {
        delete KDGameData[STATE];
        delete KDGameData[DEPARTURE];
        ownedMovement = false;
        nativeMoveTick = undefined;
    }

    function clearRecoveryForCarrierLoss(recovery) {
        rememberDeparture(departureFromRecovery(recovery));
        delete KDGameData[STATE];
    }

    function audit() {
        const recovery = state();
        if (!recovery) return false;
        if (recovery.version !== 1) {
            delete KDGameData[STATE];
            return false;
        }
        const carrier = carrierById(recovery.carrierId);
        if (!carrier || !usableLeash(carrier) || (recovery.ownedCarrier && carrier.name !== LEASH)) {
            clearRecoveryForCarrierLoss(recovery);
            return false;
        }
        const source = sourceById(recovery.sourceIds?.[0]);
        if (!allowedSource(recovery, source) || !sourceActionable(source)) {
            recovery.sourceIds = [];
            recovery.executorId = undefined;
            return true;
        }
        recovery.sourceIds = [source.id];
        recovery.executorId = source.id;
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
            version: 1,
            carrierId: carrier.item.id,
            ownedCarrier: carrier.owned,
            compositeId: eligibility.compositeId,
            groupId: eligibility.groupId,
            eligibleSourceIds: [...eligibility.eligibleSourceIds],
            sourceIds: [source.id],
            executorId: source.id,
            lastPullTick: undefined,
        };
        delete KDGameData[DEPARTURE];
        return true;
    }

    // This is called only by the successful native Spinner player-effect entrance.
    function hit(source) {
        if (api.SpinnerCapture?.isControllingPlayer?.()) return false;
        audit();
        const recovery = state();
        if (recovery) {
            if (!allowedSource(recovery, source) || !sourceActionable(source)) return false;
            if (!recovery.sourceIds.length) {
                recovery.sourceIds = [source.id];
                recovery.executorId = source.id;
            }
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
        if (ownedMovement || api.SpinnerCapture?.isControllingPlayer?.() || state()) return false;
        const from = { x: data.lastX, y: data.lastY },
            to = { x: data.moveX, y: data.moveY },
            breached = api.SpinnerNativeField?.breachedDeparture(from, to);
        return rememberDeparture(breached);
    }

    function destination(recovery, source) {
        return api.SpinnerNativeField?.commonCore(recovery.compositeId) || { x: source.x, y: source.y };
    }

    function landingLegal(cell) {
        if (!cell || (cell.x === player().x && cell.y === player().y)) return false;
        if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y))) return false;
        if (KinkyDungeonTilesGet(`${cell.x},${cell.y}`)?.Lock) return false;
        return !KinkyDungeonEntityAt(cell.x, cell.y);
    }

    function alreadyMovedThisTurn(recovery) {
        if (recovery.lastPullTick === turn() || nativeMoveTick === turn()) return true;
        if (typeof KinkyDungeonFlags !== "undefined" && KinkyDungeonFlags?.get) {
            return !!(KinkyDungeonFlags.get("forceMoved") || KinkyDungeonFlags.get("pulled"));
        }
        return false;
    }

    function pull(recovery, source) {
        recovery.lastPullTick = turn();
        if (alreadyMovedThisTurn({ ...recovery, lastPullTick: undefined })) return false;
        const goal = destination(recovery, source),
            path = KinkyDungeonFindPath(
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
            ),
            step = path?.[0];
        if (!landingLegal(step) || Math.max(Math.abs(step.x - player().x), Math.abs(step.y - player().y)) > 1)
            return false;
        const before = { x: player().x, y: player().y };
        ownedMovement = true;
        try {
            globalThis.KDMovePlayer(step.x, step.y, false);
        } finally {
            ownedMovement = false;
        }
        const moved = player().x !== before.x || player().y !== before.y;
        if (moved && typeof globalThis.KinkyDungeonSetFlag === "function") globalThis.KinkyDungeonSetFlag("pulled", 1);
        return moved;
    }

    function handleEnemyTurn(enemy, _target, delta) {
        if (!audit()) return undefined;
        const recovery = state();
        if (
            !recovery?.sourceIds.length ||
            !sameId(recovery.executorId, enemy?.id) ||
            api.SpinnerCapture?.isControllingPlayer?.()
        )
            return undefined;
        if (api.SpinnerNativeField.accrueConstructionAction(enemy, delta) && !alreadyMovedThisTurn(recovery)) {
            pull(recovery, enemy);
        }
        return result(enemy);
    }

    function afterLoad() {
        ownedMovement = false;
        nativeMoveTick = undefined;
        const pending = departure();
        if (pending?.version !== 1) delete KDGameData[DEPARTURE];
        audit();
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
                events: [{ trigger: "postRemoval", type: "RequireCollar" }],
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
        state,
        departure,
        hit,
        audit,
        onPlayerMove,
        handleEnemyTurn,
        clearControl,
        afterLoad,
        sourceActionable,
        usableLeash,
    });
})();
