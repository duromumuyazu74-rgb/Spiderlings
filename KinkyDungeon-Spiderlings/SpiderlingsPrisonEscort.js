"use strict";

// A saved dispatch and one physical escort. The entrance is an enemy destination, not a general portal.
(() => {
    const api = globalThis.Spiderlings;
    const STATE = "SpiderlingsPrisonEscort";
    const ENTRY = "SpiderlingsPrisonEntry";
    const NAMES = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler"]);
    const MIN_TURNS = 30;
    const MAX_TURNS = 50;
    const NEARBY_ENTRANCE = 12;
    const MESSAGE_KEY = "KinkyDungeonSpiderlingsNestEscort";
    const MESSAGE = "A spiderling moves in to take your cocoon to a nest entrance.";

    const player = () => KinkyDungeonPlayerEntity;
    const entities = () => KDMapData?.Entities || [];
    const state = () => KDGameData?.[STATE];
    const tick = () => (typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0);
    const sameId = (a, b) => a !== undefined && b !== undefined && String(a) === String(b);
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const adjacent = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1;
    const pointKey = (point) => `${point.x},${point.y}`;
    const result = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });

    function cocoon() {
        if (typeof KinkyDungeonAllRestraintDynamic !== "function") return undefined;
        return KinkyDungeonAllRestraintDynamic()
            .map((entry) => entry.item)
            .find((item) => item?.name === api.WebbingData.COCOON_ID);
    }

    function anchoredItem() {
        const item = cocoon();
        return item?.data?.[api.WebbingData.COCOON_OUTER_STATE]?.anchored ? item : undefined;
    }

    function locationKey() {
        return [
            KDCurrentWorldSlot?.x,
            KDCurrentWorldSlot?.y,
            KDMapData?.RoomType,
            KDMapData?.mapX,
            KDMapData?.mapY,
        ].join("|");
    }

    function currentEscort(record = state()) {
        return entities().find((entity) => sameId(entity.id, record?.escortId));
    }

    function currentEntrance(record = state()) {
        return entities().find((entity) => sameId(entity.id, record?.entranceId));
    }

    function ownsTether(record = state()) {
        return sameId(player()?.leash?.entity, record?.escortId);
    }

    function clear() {
        const record = state();
        if (record && ownsTether(record) && typeof KDBreakTether === "function") KDBreakTether(player());
        if (KDGameData) delete KDGameData[STATE];
    }

    function start(item = anchoredItem(), skipNextTick = false) {
        if (!item || api.Prison?.isPrison?.()) return undefined;
        const roll = typeof KDRandom === "function" ? KDRandom() : Math.random();
        const deadline =
            MIN_TURNS + Math.floor(Math.min(Math.max(roll, 0), 1 - Number.EPSILON) * (MAX_TURNS - MIN_TURNS + 1));
        return (KDGameData[STATE] = {
            version: 1,
            cocoonId: item.id,
            source: locationKey(),
            deadline,
            elapsed: 0,
            lastTick: tick(),
            skipNextTick,
            phase: "pending",
        });
    }

    function onAnchored(item) {
        if (item && anchoredItem() === item && !state()) start(item, true);
    }

    function walkable(point) {
        if (
            !Number.isInteger(point.x) ||
            !Number.isInteger(point.y) ||
            point.x <= 0 ||
            point.y <= 0 ||
            point.x >= KDMapData.GridWidth - 1 ||
            point.y >= KDMapData.GridHeight - 1 ||
            !KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(point.x, point.y))
        )
            return false;
        const tile = KinkyDungeonTilesGet(pointKey(point));
        return !tile?.Lock && !tile?.OffLimits && !tile?.Jail && !tile?.Type;
    }

    function legalCell(point) {
        return walkable(point) && !KinkyDungeonEntityAt(point.x, point.y);
    }

    function path(from, to, actor) {
        if (from.x === to.x && from.y === to.y) return [];
        return KinkyDungeonFindPath(
            from.x,
            from.y,
            to.x,
            to.y,
            false,
            false,
            false,
            KinkyDungeonMovableTilesSmartEnemy,
            undefined,
            undefined,
            undefined,
            actor,
        );
    }

    function nearbyCells(center, minRadius, maxRadius) {
        const cells = [];
        for (let y = Math.ceil(center.y - maxRadius); y <= Math.floor(center.y + maxRadius); y += 1)
            for (let x = Math.ceil(center.x - maxRadius); x <= Math.floor(center.x + maxRadius); x += 1) {
                const point = { x, y };
                if (distance(center, point) >= minRadius && distance(center, point) <= maxRadius) cells.push(point);
            }
        cells.sort((a, b) => distance(center, a) - distance(center, b) || a.y - b.y || a.x - b.x);
        return cells;
    }

    function entranceLanding(entrance, actor) {
        const approach = nearbyCells(entrance, 1, Math.SQRT2)
            .filter(
                (point) =>
                    (legalCell(point) || (point.x === player().x && point.y === player().y && walkable(point))) &&
                    path(player(), point, undefined),
            )
            .sort((a, b) => path(player(), a, undefined).length - path(player(), b, undefined).length)[0];
        if (!approach) return undefined;
        let best;
        for (const point of nearbyCells(entrance, 1, Math.SQRT2)) {
            const occupiedByActor = actor && point.x === actor.x && point.y === actor.y;
            if (!legalCell(point) && !(occupiedByActor && walkable(point))) continue;
            const actorRoute = actor ? path(actor, point, actor) : [];
            if (!actorRoute) continue;
            const steps = path(player(), approach, undefined).length + actorRoute.length;
            if (!best || steps < best.steps) best = { point, steps };
        }
        return best;
    }

    function selectEntrance(escort) {
        const candidates = entities()
            .filter(
                (entity) =>
                    entity.Enemy?.name === "NestEntrance" &&
                    entity.hp > 0 &&
                    KDHostile(entity) &&
                    distance(entity, player()) <= NEARBY_ENTRANCE,
            )
            .map((entity) => ({ entity, landing: entranceLanding(entity, escort) }))
            .filter((candidate) => candidate.landing)
            .sort((a, b) => a.landing.steps - b.landing.steps);
        return candidates[0]?.entity;
    }

    function createEntrance(escort) {
        if (typeof KinkyDungeonSummonEnemy !== "function") return undefined;
        for (const point of nearbyCells(player(), 3, 8)) {
            if (!legalCell(point)) continue;
            if (KDMapData.StartPosition && distance(point, KDMapData.StartPosition) < 3) continue;
            if (KDMapData.EndPosition && distance(point, KDMapData.EndPosition) < 3) continue;
            const landing = nearbyCells(point, 1, Math.SQRT2).find(
                (cell) => legalCell(cell) && path(player(), cell) && (!escort || path(escort, cell, escort)),
            );
            if (!landing) continue;
            const created = KinkyDungeonSummonEnemy(
                point.x,
                point.y,
                "NestEntrance",
                1,
                0,
                false,
                undefined,
                false,
                false,
                undefined,
                true,
                undefined,
                false,
                true,
            );
            if (created?.length !== 1 || created[0].x !== point.x || created[0].y !== point.y) {
                for (const entity of created || []) KDRemoveEntity(entity, false, false, true);
                continue;
            }
            created[0][ENTRY] = true;
            return created[0];
        }
        return undefined;
    }

    function availableSlot() {
        const cap = api.getMapPopulationCap();
        return cap === 0 || entities().filter((entity) => entity.hp > 0 && NAMES.has(entity.Enemy?.name)).length < cap;
    }

    function selectableEscort(entity) {
        return (
            entity?.hp > 0 &&
            NAMES.has(entity.Enemy?.name) &&
            KDHostile(entity) &&
            !entity.Enemy.immobile &&
            !KinkyDungeonIsDisabled(entity) &&
            !KDHelpless(entity) &&
            nearbyCells(player(), 1, Math.SQRT2).some(
                (cell) =>
                    (legalCell(cell) || (cell.x === entity.x && cell.y === entity.y && walkable(cell))) &&
                    path(entity, cell, entity),
            )
        );
    }

    function selectEscort() {
        const existing = entities()
            .filter(selectableEscort)
            .sort((a, b) => distance(a, player()) - distance(b, player()));
        if (existing.length) return existing[0];
        if (!availableSlot() || typeof KinkyDungeonSummonEnemy !== "function") return undefined;
        for (const point of nearbyCells(player(), 1, 3)) {
            if (!legalCell(point)) continue;
            const created = KinkyDungeonSummonEnemy(
                point.x,
                point.y,
                "Spinner",
                1,
                0,
                false,
                undefined,
                false,
                false,
                undefined,
                true,
                undefined,
                false,
                true,
            );
            if (created?.length === 1 && created[0].x === point.x && created[0].y === point.y) return created[0];
            for (const entity of created || []) KDRemoveEntity(entity, false, false, true);
        }
        return undefined;
    }

    function dispatch(record) {
        const escort = selectEscort();
        if (!escort) return false;
        const entrance = selectEntrance(escort) || createEntrance(escort);
        if (!entrance) return false;
        entrance[ENTRY] = true;
        record.escortId = escort.id;
        record.entranceId = entrance.id;
        record.phase = "approach";
        escort.aware = true;
        escort.gx = player().x;
        escort.gy = player().y;
        if (typeof KinkyDungeonSendActionMessage === "function") {
            const translated = typeof TextGet === "function" ? TextGet(MESSAGE_KEY) : MESSAGE;
            KinkyDungeonSendActionMessage(8, translated === MESSAGE_KEY ? MESSAGE : translated, "orange", 4, true);
        }
        return true;
    }

    function actionPaid(enemy, delta) {
        if (!(delta > 0)) return false;
        enemy.SpiderlingsNestEscortPoints = (enemy.SpiderlingsNestEscortPoints || 0) + delta;
        const cost = enemy.Enemy.attackPoints || enemy.Enemy.movePoints || 1;
        if (enemy.SpiderlingsNestEscortPoints < cost) return false;
        enemy.SpiderlingsNestEscortPoints -= cost;
        return true;
    }

    function moveToward(enemy, goal, delta) {
        const route = path(enemy, goal, enemy);
        const next = route?.[0];
        if (!next) return false;
        const direction = { x: next.x - enemy.x, y: next.y - enemy.y, delta };
        if (
            !KinkyDungeonEnemyCanMove(enemy, direction, KinkyDungeonMovableTilesSmartEnemy, "", false, 0) ||
            KinkyDungeonEntityAt(next.x, next.y)
        )
            return false;
        KinkyDungeonEnemyTryMove(enemy, direction, delta, next.x, next.y, false);
        return enemy.x === next.x && enemy.y === next.y;
    }

    function enterIfArrived(record) {
        const escort = currentEscort(record);
        const entrance = currentEntrance(record);
        if (
            !escort ||
            !entrance ||
            entrance.hp <= 0 ||
            !entrance[ENTRY] ||
            !ownsTether(record) ||
            !adjacent(escort, entrance) ||
            !adjacent(player(), entrance)
        )
            return false;
        if (api.Prison?.enter?.({ entrance, escort }) !== true) return false;
        delete KDGameData[STATE];
        return true;
    }

    function handleEnemyTurn(enemy, _target, delta) {
        const record = state();
        if (!record || !sameId(record.escortId, enemy?.id) || record.phase === "pending") return undefined;
        if (player()?.leash && !ownsTether(record)) return undefined;
        if (KinkyDungeonLeashingEnemy()?.id !== undefined && KinkyDungeonLeashingEnemy() !== enemy) return undefined;
        if (!anchoredItem() || !sameId(record.cocoonId, anchoredItem().id)) {
            clear();
            return undefined;
        }
        const entrance = currentEntrance(record);
        if (!entrance || entrance.hp <= 0) {
            const replacement = selectEntrance(enemy) || createEntrance(enemy);
            if (!replacement) return result(enemy);
            replacement[ENTRY] = true;
            record.entranceId = replacement.id;
        }
        if (KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy)) return result(enemy);
        if (!ownsTether(record)) {
            if (!adjacent(enemy, player())) {
                const goal = nearbyCells(player(), 1, Math.SQRT2).find(
                    (cell) =>
                        (legalCell(cell) || (cell.x === enemy.x && cell.y === enemy.y)) && path(enemy, cell, enemy),
                );
                if (goal) moveToward(enemy, goal, delta);
            } else if (actionPaid(enemy, delta)) {
                if (!KDPlayerLeashed(player())) KDTryToLeash(enemy, player(), delta, false);
                if (KDPlayerLeashed(player()) && !player().leash) {
                    const carrier = KinkyDungeonGetRestraintItem("ItemNeckRestraints");
                    KinkyDungeonAttachTetherToEntity(2.5, enemy, player(), STATE, undefined, 6, carrier);
                }
                if (ownsTether(record)) record.phase = "escort";
            }
            return result(enemy);
        }
        record.phase = "escort";
        const destination = entranceLanding(currentEntrance(record), enemy)?.point;
        if (destination) moveToward(enemy, destination, delta);
        return result(enemy);
    }

    function tickAfter(_event, data) {
        if (!(Number(data?.delta) > 0)) return;
        const item = anchoredItem();
        if (!item || api.Prison?.isPrison?.()) {
            clear();
            return;
        }
        let record = state();
        if (!record || !sameId(record.cocoonId, item.id) || record.source !== locationKey()) {
            clear();
            record = start(item);
        }
        if (record.skipNextTick) {
            record.skipNextTick = false;
            record.lastTick = tick();
            return;
        }
        if (record.lastTick === tick()) return;
        record.lastTick = tick();
        record.elapsed += Number(data.delta);
        if (record.phase !== "pending") {
            if (!currentEscort(record)?.hp) {
                if (ownsTether(record) && typeof KDBreakTether === "function") KDBreakTether(player());
                record.phase = "pending";
                delete record.escortId;
            } else enterIfArrived(record);
        }
        if (record.phase === "pending" && record.elapsed >= record.deadline) dispatch(record);
    }

    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "tickAfter", STATE, tickAfter);
        KDAddEvent(KDEventMapGeneric, "postRemoval", STATE, () => {
            if (!anchoredItem()) clear();
        });
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", STATE, () => {
            if (!anchoredItem()) clear();
        });
    }

    if (typeof KDLeashReason !== "undefined")
        KDLeashReason[STATE] = (entity) => {
            const record = state();
            return (
                entity?.player === true &&
                sameId(entity.leash?.entity, record?.escortId) &&
                sameId(anchoredItem()?.id, record?.cocoonId) &&
                record.source === locationKey() &&
                currentEscort(record)?.hp > 0
            );
        };

    if (typeof addTextKey === "function") addTextKey(MESSAGE_KEY, MESSAGE);

    api.PrisonEscort = { STATE, ENTRY, state, onAnchored, tickAfter, handleEnemyTurn, clear };
})();
