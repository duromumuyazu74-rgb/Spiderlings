"use strict";

// Movement credit and routes for mobile spiders on Spiderlings-owned physical webs.
(() => {
    const api = globalThis.Spiderlings,
        SPEED = 1.5,
        WEB_COST = 1 / SPEED;
    let routes = new Map(),
        routeMap,
        webKeys;

    const key = (cell) => `${cell.x},${cell.y}`;
    const same = (a, b) => a.x === b.x && a.y === b.y;
    const web = (cell, keys) =>
        keys ? keys.has(key(cell)) : api.SpinnerNativeField?.isSpiderlingsWebCell(cell) === true;

    function isMobileSpider(actor) {
        const tags = actor?.Enemy?.tags;
        return !!(
            actor &&
            !actor.player &&
            actor.hp > 0 &&
            !actor.Enemy?.immobile &&
            !api.SpinnerNativeField?.isOwnedProxy(actor) &&
            (tags?.spiderlings === true || tags?.spider === true)
        );
    }

    function discardWebCredit(actor) {
        const credit = Math.min(actor?.SpiderlingsWebMoveCredit || 0, Math.max(0, actor?.movePoints || 0));
        if (credit > 0) actor.movePoints -= credit;
        if (actor) {
            delete actor.SpiderlingsWebMoveCredit;
            delete actor.SpiderlingsWebMoveDestination;
        }
    }

    function recordWebCredit(actor, credit, destination) {
        const retained = Math.min(credit, Math.max(0, actor.movePoints || 0));
        if (!(retained > 0)) return discardWebCredit(actor);
        actor.SpiderlingsWebMoveCredit = retained;
        actor.SpiderlingsWebMoveDestination = destination;
    }

    function invalidateNavigation(webChanged = false) {
        routes = new Map();
        routeMap = typeof KDMapData === "undefined" ? undefined : KDMapData;
        webKeys = undefined;
        if (!webChanged || !routeMap) return;
        const graph = api.SpinnerNativeField?.state()?.topology;
        if (api.SpinnerTopology) webKeys = new Set(graph ? api.SpinnerTopology.solidCells(graph).map(key) : []);
        for (const actor of routeMap.Entities || []) {
            if (!(actor.SpiderlingsWebMoveCredit > 0)) continue;
            const [x, y] = String(actor.SpiderlingsWebMoveDestination || "")
                .split(",")
                .map(Number);
            if (!web({ x, y }, webKeys)) discardWebCredit(actor);
        }
    }

    function ownedWebKeys() {
        if (routeMap !== KDMapData) invalidateNavigation();
        if (webKeys === undefined && api.SpinnerTopology) {
            const graph = api.SpinnerNativeField?.state()?.topology;
            webKeys = new Set(graph ? api.SpinnerTopology.solidCells(graph).map(key) : []);
        }
        return webKeys;
    }

    function hasOwnedWeb() {
        const keys = ownedWebKeys();
        return keys ? keys.size > 0 : !!api.SpinnerNativeField?.state()?.topology;
    }

    function movementCredit(actor, delta, canSprint) {
        let speed = KinkyDungeonGetBuffedStat(actor.buffs, "MoveSpeed")
            ? KinkyDungeonMultiplicativeStat(-KinkyDungeonGetBuffedStat(actor.buffs, "MoveSpeed"))
            : 1;
        if (canSprint && typeof KDEnemyCanSprint === "function" && KDEnemyCanSprint(actor))
            speed *= actor.Enemy.sprintspeed || KDDefaultEnemySprint;
        const condition = actor.bind > 0 ? 0.1 : actor.slow > 0 ? 0.5 : KDGameData.SleepTurns > 0 ? 4 : 1;
        return delta * speed * condition;
    }

    function moveWithWebCredit(native, actor, direction, delta, x, y, canSprint) {
        const webDestination = isMobileSpider(actor) && web({ x, y }, ownedWebKeys()),
            occupied =
                webDestination &&
                (actorAt(x, y, actor) || (KinkyDungeonPlayerEntity.x === x && KinkyDungeonPlayerEntity.y === y));
        if (!webDestination || occupied) discardWebCredit(actor);
        if (!webDestination || occupied || !(delta > 0))
            return native.call(this, actor, direction, delta, x, y, canSprint);
        const before = { x: actor.x, y: actor.y },
            previousCredit = Math.min(actor.SpiderlingsWebMoveCredit || 0, Math.max(0, actor.movePoints || 0)),
            ordinary = movementCredit(actor, delta, canSprint),
            bonus = ordinary * (SPEED - 1),
            boundCost = KDBoundEffects(actor) * 0.5,
            threshold =
                actor === KinkyDungeonLeashingEnemy() &&
                (KinkyDungeonLastAction === "Move" || KinkyDungeonLastAction === "Wait")
                    ? 1 + boundCost
                    : actor.Enemy.movePoints + boundCost,
            paid = (actor.movePoints || 0) + ordinary + bonus >= threshold;
        actor.movePoints = (actor.movePoints || 0) + bonus;
        const moved = native.call(this, actor, direction, delta, x, y, canSprint);
        const blocked = paid && (!moved || same(actor, before));
        if (blocked) actor.movePoints = Math.max(0, actor.movePoints - bonus);
        recordWebCredit(actor, previousCredit + (blocked ? 0 : bonus), `${x},${y}`);
        return moved;
    }

    function actorAt(x, y, self) {
        return KDMapData.Entities.some(
            (entity) =>
                entity !== self &&
                entity.hp > 0 &&
                !api.SpinnerNativeField.isOwnedProxy(entity) &&
                entity.x === x &&
                entity.y === y,
        );
    }

    function passable(actor, x, y, input, goal = false) {
        const tile = KinkyDungeonMapGet(x, y),
            cell = { x, y },
            mapTile = KinkyDungeonTilesGet(`${x},${y}`);
        if (!input.tiles.includes(tile) || (input.noDoors && tile === "D")) return false;
        if (!input.ignoreLocks && mapTile?.Lock) {
            const lock = typeof KDLocks !== "undefined" && KDLocks[mapTile.Lock];
            if (!lock?.canNPCPass?.(x, y, mapTile, actor)) return false;
        }
        if (input.requireLight && KinkyDungeonVisionGet(x, y) <= 0) return false;
        if (input.needDoorMemory && tile === "d" && !KDOpenDoorTiles.includes(KDMapData.TilesMemory?.[`${x},${y}`]))
            return false;
        if (input.blockPlayer && KinkyDungeonPlayerEntity.x === x && KinkyDungeonPlayerEntity.y === y && !goal)
            return false;
        if (web(cell, input.webKeys)) {
            if (input.occupiedKeys.has(key(cell))) return false;
            return true;
        }
        if (input.blockEnemy && input.occupiedKeys.has(key(cell)) && !goal) return false;
        const occupant = typeof KinkyDungeonEnemyAt === "function" && KinkyDungeonEnemyAt(x, y);
        return !occupant?.Enemy?.immobile || goal;
    }

    function trafficCost(x, y, tile, ignoreTrafficLaws, ignoreAllWeighting) {
        const mapTile = KinkyDungeonTilesGet(`${x},${y}`);
        let cost = 0;
        if (!ignoreTrafficLaws) {
            const traffic = { V: 14, N: 30, D: 3, d: -2, g: 9, L: 9, T: 4 };
            cost =
                typeof KDEffectTileTagsLoc === "function" && KDEffectTileTagsLoc(`${x},${y}`)?.danger
                    ? 30
                    : traffic[tile] || 0;
            if (tile === "V" && mapTile?.Sfty) cost = 0;
            cost += (mapTile?.Lock ? 2 : 0) + (mapTile?.OL ? 12 : 0);
            cost += KDMapData.Traffic?.[y]?.[x] || 0;
        } else if (!ignoreAllWeighting) {
            cost = { V: mapTile?.Sfty ? 0 : 3, N: 8, L: 2 }[tile] || 0;
        }
        return Math.max(0, cost);
    }

    function push(heap, item) {
        let index = heap.length;
        heap.push(item);
        while (index > 0) {
            const parent = (index - 1) >> 1;
            if (heap[parent].f <= item.f) break;
            heap[index] = heap[parent];
            index = parent;
        }
        heap[index] = item;
    }

    function pop(heap) {
        const first = heap[0],
            last = heap.pop();
        if (!heap.length) return first;
        let index = 0;
        while (index * 2 + 1 < heap.length) {
            let child = index * 2 + 1;
            if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child++;
            if (last.f <= heap[child].f) break;
            heap[index] = heap[child];
            index = child;
        }
        heap[index] = last;
        return first;
    }

    function weightedPath(actor, start, end, input) {
        if (routeMap !== KDMapData) invalidateNavigation();
        const cacheKey = [
            actor.id,
            key(start),
            key(end),
            input.tiles,
            +input.blockEnemy,
            +input.blockPlayer,
            +input.ignoreLocks,
            +input.noDoors,
            +input.requireLight,
            +input.needDoorMemory,
            +input.ignoreTrafficLaws,
            +input.ignoreAllWeighting,
            +input.taxicab,
            typeof KinkyDungeonCurrentTick === "undefined" ? 0 : KinkyDungeonCurrentTick,
        ].join("|");
        if (routes.has(cacheKey)) return routes.get(cacheKey)?.map((cell) => ({ ...cell }));
        input = {
            ...input,
            webKeys: ownedWebKeys(),
            occupiedKeys: new Set(
                KDMapData.Entities.filter(
                    (entity) => entity !== actor && entity.hp > 0 && !api.SpinnerNativeField.isOwnedProxy(entity),
                ).map(key),
            ),
        };
        const heuristic = (x, y) => Math.max(Math.abs(end.x - x), Math.abs(end.y - y)) * WEB_COST,
            heap = [],
            best = new Map([[key(start), 0]]),
            parent = new Map(),
            limit = input.trimLongDistance && typeof KDPFTrim === "number" ? KDPFTrim : 10000;
        push(heap, { ...start, g: 0, f: heuristic(start.x, start.y) });
        let visited = 0;
        while (heap.length && visited++ < limit) {
            const current = pop(heap),
                currentKey = key(current);
            if (current.g !== best.get(currentKey)) continue;
            if (same(current, end)) {
                const path = [];
                let cursor = currentKey;
                while (cursor !== key(start)) {
                    const [x, y] = cursor.split(",").map(Number);
                    path.push({ x, y });
                    cursor = parent.get(cursor);
                }
                path.reverse();
                routes.set(cacheKey, path);
                return path.map((cell) => ({ ...cell }));
            }
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++) {
                    if ((!dx && !dy) || (input.taxicab && dx && dy)) continue;
                    const x = current.x + dx,
                        y = current.y + dy,
                        goal = x === end.x && y === end.y;
                    if (!passable(actor, x, y, input, goal)) continue;
                    if (
                        dx &&
                        dy &&
                        (!passable(actor, current.x + dx, current.y, input) ||
                            !passable(actor, current.x, current.y + dy, input))
                    )
                        continue;
                    const step =
                            (web({ x, y }, input.webKeys) ? WEB_COST : 1) +
                            trafficCost(
                                x,
                                y,
                                KinkyDungeonMapGet(x, y),
                                input.ignoreTrafficLaws,
                                input.ignoreAllWeighting,
                            ),
                        nextCost = current.g + step,
                        nextKey = `${x},${y}`;
                    if (nextCost >= (best.get(nextKey) ?? Infinity)) continue;
                    best.set(nextKey, nextCost);
                    parent.set(nextKey, currentKey);
                    push(heap, { x, y, g: nextCost, f: nextCost + heuristic(x, y) });
                }
        }
        routes.set(cacheKey, undefined);
        return undefined;
    }

    if (typeof KinkyDungeonEnemyTryMove === "function")
        KinkyDungeonEnemyTryMove = api.Hooks.wrap(
            "WebMobility.move",
            KinkyDungeonEnemyTryMove,
            (native) =>
                function (actor, direction, delta, x, y, canSprint) {
                    return moveWithWebCredit.call(this, native, actor, direction, delta, x, y, canSprint);
                },
        );
    if (typeof KinkyDungeonFindPath === "function")
        KinkyDungeonFindPath = api.Hooks.wrap(
            "WebMobility.path",
            KinkyDungeonFindPath,
            (native) =>
                function (
                    startx,
                    starty,
                    endx,
                    endy,
                    blockEnemy,
                    blockPlayer,
                    ignoreLocks,
                    tiles,
                    requireLight,
                    noDoors,
                    needDoorMemory,
                    actor,
                    trimLongDistance,
                    _heuristicOverride,
                    taxicab,
                    ignoreTrafficLaws,
                    _allowPassable,
                    ignoreAllWeighting,
                    leashTarget,
                ) {
                    if (
                        !isMobileSpider(actor) ||
                        !hasOwnedWeb() ||
                        _heuristicOverride ||
                        _allowPassable ||
                        leashTarget ||
                        typeof tiles !== "string"
                    )
                        return native.apply(this, arguments);
                    return weightedPath(
                        actor,
                        { x: startx, y: starty },
                        { x: endx, y: endy },
                        {
                            blockEnemy,
                            blockPlayer,
                            ignoreLocks,
                            tiles,
                            requireLight,
                            noDoors,
                            needDoorMemory,
                            trimLongDistance,
                            taxicab,
                            ignoreTrafficLaws,
                            ignoreAllWeighting,
                        },
                    );
                },
        );

    // Native hunt follows KDGetDir while the target is visible, without calling FindPath.
    // Use the same actor-specific route for that ordinary pursuit step.
    if (typeof KDGetDir === "function")
        KDGetDir = api.Hooks.wrap(
            "WebMobility.direction",
            KDGetDir,
            (native) =>
                function (actor, target) {
                    if (
                        arguments.length > 2 ||
                        !isMobileSpider(actor) ||
                        !Number.isInteger(target?.x) ||
                        !Number.isInteger(target?.y) ||
                        !hasOwnedWeb() ||
                        (typeof AIData !== "undefined" && AIData.kite) ||
                        (actor.fx && actor.fy)
                    )
                        return native.apply(this, arguments);
                    const path = weightedPath(actor, actor, target, {
                        blockEnemy: true,
                        blockPlayer: false,
                        ignoreLocks: typeof AIData !== "undefined" && AIData.ignoreLocks,
                        tiles: (typeof AIData !== "undefined" && AIData.MovableTiles) || KinkyDungeonMovableTilesEnemy,
                    });
                    if (!path?.length || Math.max(Math.abs(path[0].x - actor.x), Math.abs(path[0].y - actor.y)) > 1)
                        return native.apply(this, arguments);
                    return { x: path[0].x - actor.x, y: path[0].y - actor.y, delta: 1 };
                },
        );

    api.WebMobility = Object.freeze({
        SPEED,
        WEB_COST,
        isMobileSpider,
        movementCredit,
        weightedPath,
        invalidateNavigation,
    });
})();
