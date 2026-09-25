"use strict";

// A prison map owns its original entrances and patrol assignments. Native
// enemies and the existing Spinner field controller perform all paid actions.
(() => {
    const api = globalThis.Spiderlings;
    const EXTRA_ENTRANCE_CAP = 6;
    const MAIN_OFFSETS = Object.freeze([
        [-2, -1],
        [-2, 0],
        [-2, 1],
        [-1, -2],
        [-1, 2],
        [1, -2],
        [1, 2],
        [2, -1],
        [2, 0],
        [2, 1],
    ]);
    const PATROL_ROUTES = Object.freeze([
        Object.freeze([
            { x: 36, y: 8 },
            { x: 24, y: 8 },
            { x: 24, y: 22 },
            { x: 28, y: 22 },
            { x: 22, y: 22 },
        ]),
        Object.freeze([
            { x: 36, y: 36 },
            { x: 24, y: 36 },
            { x: 24, y: 22 },
            { x: 24, y: 18 },
        ]),
    ]);
    const PATROL_STARTS = Object.freeze([
        { x: 36, y: 16 },
        { x: 36, y: 28 },
    ]);
    const BUILDER_STARTS = Object.freeze([
        { x: 34, y: 18 },
        { x: 38, y: 18 },
    ]);
    let placingMainNests = false;

    function state() {
        return api.Prison?.isPrison?.() ? KDMapData.SpiderlingsPrison : undefined;
    }

    function livingExtraEntrances(map = KDMapData) {
        const prison = map?.SpiderlingsPrison;
        const originals = new Set(prison?.mainNestIds || []);
        return (map?.Entities || []).filter(
            (enemy) => enemy.hp > 0 && enemy.Enemy?.name === "NestEntrance" && !originals.has(enemy.id),
        ).length;
    }

    function entranceSlots() {
        const prison = state();
        if (!prison || placingMainNests) return Infinity;
        return Array.isArray(prison.mainNestIds) && prison.mainNestIds.length === MAIN_OFFSETS.length
            ? Math.max(0, EXTRA_ENTRANCE_CAP - livingExtraEntrances())
            : 0;
    }

    function allowEntranceSummon() {
        return entranceSlots() > 0;
    }

    function ordinaryConstructionAllowed(cell) {
        const bounds = state()?.workBounds;
        return (
            !bounds || cell.x < bounds.left || cell.x > bounds.right || cell.y < bounds.top || cell.y > bounds.bottom
        );
    }

    function mainNestCells(prison) {
        return MAIN_OFFSETS.map(([dx, dy]) => ({ x: prison.mainNest.x + dx, y: prison.mainNest.y + dy }));
    }

    function validMainNestCells(cells, prison) {
        const occupied = new Set(
            KDMapData.Entities.filter((enemy) => enemy.hp > 0).map((enemy) => `${enemy.x},${enemy.y}`),
        );
        const blocked = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
        const passable = (cell) => KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y));
        if (
            cells.length !== MAIN_OFFSETS.length ||
            cells.some(
                (cell) =>
                    cell.x < prison.mainNestBounds.left ||
                    cell.x > prison.mainNestBounds.right ||
                    cell.y < prison.mainNestBounds.top ||
                    cell.y > prison.mainNestBounds.bottom ||
                    !passable(cell) ||
                    occupied.has(`${cell.x},${cell.y}`) ||
                    KinkyDungeonTilesGet(`${cell.x},${cell.y}`)?.OffLimits,
            ) ||
            cells.some((cell) => cells.some((other) => Math.hypot(cell.x - other.x, cell.y - other.y) > 5))
        )
            return false;
        const directions = [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
        ];
        const seen = new Set([`${prison.chamber.x},${prison.chamber.y}`]);
        const queue = [{ ...prison.chamber }];
        for (let index = 0; index < queue.length; index += 1) {
            for (const [dx, dy] of directions) {
                const next = { x: queue[index].x + dx, y: queue[index].y + dy };
                const key = `${next.x},${next.y}`;
                if (
                    next.x <= 0 ||
                    next.y <= 0 ||
                    next.x >= KDMapData.GridWidth - 1 ||
                    next.y >= KDMapData.GridHeight - 1 ||
                    seen.has(key) ||
                    blocked.has(key) ||
                    !passable(next)
                )
                    continue;
                seen.add(key);
                queue.push(next);
            }
        }
        return (
            seen.has(`${prison.exit.x},${prison.exit.y}`) &&
            cells.every((cell) => directions.some(([dx, dy]) => seen.has(`${cell.x + dx},${cell.y + dy}`)))
        );
    }

    function summonAt(point, name) {
        const result = KinkyDungeonSummonEnemy(
            point.x,
            point.y,
            name,
            1,
            0,
            false,
            undefined,
            false,
            false,
            "Enemy",
            true,
            undefined,
            false,
            true,
        );
        return result?.length === 1 && result[0].x === point.x && result[0].y === point.y ? result[0] : undefined;
    }

    function initializeMainNest() {
        const prison = state();
        if (!prison || Array.isArray(prison.mainNestIds)) return false;
        const cells = mainNestCells(prison);
        if (!validMainNestCells(cells, prison)) return false;
        const created = [];
        placingMainNests = true;
        try {
            for (const cell of cells) {
                const enemy = summonAt(cell, "NestEntrance");
                if (!enemy) break;
                created.push(enemy);
            }
        } finally {
            placingMainNests = false;
        }
        if (created.length !== MAIN_OFFSETS.length) {
            for (const enemy of created) KDRemoveEntity(enemy, false, false, true);
            return false;
        }
        prison.mainNestIds = created.map((enemy) => enemy.id);
        return true;
    }

    function assignPatrols() {
        const prison = state();
        if (!prison?.mainNestIds) return;
        prison.patrols ||= {};
        const byId = new Map(
            KDMapData.Entities.filter((enemy) => enemy.hp > 0).map((enemy) => [String(enemy.id), enemy]),
        );
        for (const id of Object.keys(prison.patrols)) if (!byId.has(id)) delete prison.patrols[id];
        const assigned = new Set(Object.values(prison.patrols).map((patrol) => patrol.route));
        const used = new Set(Object.keys(prison.patrols));
        for (let route = 0; route < PATROL_ROUTES.length; route += 1) {
            if (assigned.has(route)) continue;
            let actor = KDMapData.Entities.find(
                (enemy) =>
                    enemy.hp > 0 &&
                    ["Jumper", "WebCaster", "Tunneler"].includes(enemy.Enemy?.name) &&
                    !used.has(String(enemy.id)) &&
                    !enemy.allied &&
                    !enemy.Enemy.allied,
            );
            if (!actor && KDMapData.Entities.length >= 300) continue;
            if (!actor && typeof KinkyDungeonSummonEnemy === "function")
                actor = summonAt(PATROL_STARTS[route], "Jumper");
            if (!actor) continue;
            prison.patrols[actor.id] = { route, waypoint: 0 };
            used.add(String(actor.id));
            assigned.add(route);
            if (!actor.SpiderlingsNestParentID) actor.SpiderlingsNestParentID = prison.mainNestIds[route];
        }
    }

    function seedBuilders() {
        const prison = state();
        if (!prison?.mainNestIds || Array.isArray(prison.builderIds)) return;
        const created = [];
        for (const point of BUILDER_STARTS) {
            const actor = summonAt(point, "Spinner");
            if (!actor) break;
            actor.SpiderlingsNestParentID = prison.mainNestIds[created.length];
            created.push(actor);
        }
        if (created.length !== BUILDER_STARTS.length) {
            for (const actor of created) KDRemoveEntity(actor, false, false, true);
            return;
        }
        prison.builderIds = created.map((actor) => actor.id);
    }

    function activateConstruction() {
        if (!state() || !api.SpinnerNativeField?.ensureMap) return;
        const encounter = api.SpinnerNativeField.ensureMap({ scenario: "prison-ordinary" });
        encounter.autonomous = true;
        api.SpinnerNativeField.reconcile();
    }

    function setup() {
        if (!state()) return;
        initializeMainNest();
        assignPatrols();
        seedBuilders();
        activateConstruction();
    }

    function movePatrol(enemy, aiData) {
        const prison = state();
        const patrol = prison?.patrols?.[enemy?.id];
        if (!patrol || !(enemy.hp > 0) || aiData.canSensePlayer || KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy))
            return false;
        const route = PATROL_ROUTES[patrol.route];
        if (!route) return false;
        let waypoint = route[patrol.waypoint % route.length];
        if (enemy.x === waypoint.x && enemy.y === waypoint.y) {
            patrol.waypoint = (patrol.waypoint + 1) % route.length;
            waypoint = route[patrol.waypoint];
        }
        let path = KinkyDungeonFindPath(
            enemy.x,
            enemy.y,
            waypoint.x,
            waypoint.y,
            false,
            false,
            false,
            KinkyDungeonMovableTilesEnemy,
            undefined,
            undefined,
            undefined,
            enemy,
        );
        let next = path?.find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
        if (next && KinkyDungeonEntityAt(next.x, next.y)) {
            path = KinkyDungeonFindPath(
                enemy.x,
                enemy.y,
                waypoint.x,
                waypoint.y,
                true,
                true,
                !!aiData.ignoreLocks,
                aiData.MovableTiles || KinkyDungeonMovableTilesEnemy,
                undefined,
                undefined,
                undefined,
                enemy,
            );
            next = path?.find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
        }
        if (!next || KinkyDungeonEntityAt(next.x, next.y)) return true;
        // KD resets movePoints for idle enemies at the end of its loop. A
        // Jumper needs 1.25 points, so its paid movement must span turns.
        aiData.idle = false;
        aiData.moved =
            KinkyDungeonEnemyTryMove(
                enemy,
                { x: next.x - enemy.x, y: next.y - enemy.y },
                enemy.SpiderlingsSpinnerRuntimeDelta || 1,
                next.x,
                next.y,
                false,
            ) || aiData.moved;
        return true;
    }

    if (typeof KDAIType !== "undefined") {
        for (const name of ["hunt", "wander"]) {
            if (!KDAIType[name]?.beforemove) continue;
            const native = KDAIType[name].beforemove;
            KDAIType[name].beforemove = function (enemy, target, aiData) {
                return native.apply(this, arguments) || movePatrol(enemy, aiData);
            };
        }
    }
    if (typeof KDEventMapGeneric !== "undefined" && typeof KDAddEvent === "function") {
        KDAddEvent(KDEventMapGeneric, "postMapgen", "SpiderlingsPrisonNest", setup);
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", "SpiderlingsPrisonNest", setup);
        KDAddEvent(KDEventMapGeneric, "afterEnemyTick", "SpiderlingsPrisonNest", (_event, data) => {
            if (data?.allied === false && data.delta > 0) assignPatrols();
        });
    }
    api.PrisonNest = Object.freeze({
        EXTRA_ENTRANCE_CAP,
        PATROL_ROUTES,
        allowEntranceSummon,
        entranceSlots,
        ordinaryConstructionAllowed,
        livingExtraEntrances,
        initializeMainNest,
        assignPatrols,
        movePatrol,
        setup,
    });
})();
