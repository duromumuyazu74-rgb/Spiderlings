"use strict";

(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const population = (api.Population = api.Population || {});
    const HUNTING = "SpiderlingsHuntingGrounds";
    const INFESTATION = "SpiderlingsInfestation";
    const CORE = ["Spinner", "Spinner", "Jumper", "WebCaster", "WebCaster", "MageSpiderlings"];
    const INFESTATION_CORE = ["Spinner", "Jumper", "WebCaster"];
    const INFESTATION_ROLES = ["builder", "hunter", "guard"];
    const crew = (kind) => (kind === INFESTATION ? INFESTATION_CORE : CORE);
    const ROLES = ["builder", "builder", "hunter", "hunter", "guard", "guard"];
    const MOBILE = new Set([...CORE, "Tunneler"]);
    const NPC_NEST_CLEARANCE = 6;
    const PARENT = "SpiderlingsNestParentID";
    const key = (point) => `${point.x},${point.y}`;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const neighbors = (point) => [
        { x: point.x - 1, y: point.y },
        { x: point.x + 1, y: point.y },
        { x: point.x, y: point.y - 1 },
        { x: point.x, y: point.y + 1 },
    ];

    function nestsOn(map) {
        return map.Entities.filter(
            (entity) =>
                entity.hp > 0 &&
                (typeof entity.Enemy === "string" ? entity.Enemy : entity.Enemy?.name) === "NestEntrance",
        );
    }
    function isNonSpiderNPC(entity) {
        const name = typeof entity?.Enemy === "string" ? entity.Enemy : entity?.Enemy?.name;
        return (
            !!entity &&
            !MOBILE.has(name) &&
            name !== "NestEntrance" &&
            !entity.Enemy?.tags?.spiderlings &&
            !entity.Enemy?.tags?.scenery &&
            !(
                entity.Enemy?.immobile &&
                !entity.Enemy?.attack &&
                !entity.Enemy?.tags?.prisoner &&
                !entity.Enemy?.tags?.human &&
                !entity.Enemy?.specialdialogue
            ) &&
            !api.SpinnerNativeField?.isOwnedProxy?.(entity)
        );
    }
    function isNestSiteClear(point) {
        return KDMapData.Entities.filter((entity) => entity.hp > 0 && isNonSpiderNPC(entity)).every(
            (entity) => distance(point, entity) >= NPC_NEST_CLEARANCE,
        );
    }
    const clearsNests = (point, nests) => nests.every((nest) => distance(point, nest) >= NPC_NEST_CLEARANCE);

    // Native initial population, wandering arrivals and dialogue births all enter here.
    // Correct the new actor's birth coordinates before native loadout/spawn scripts run.
    if (typeof KDAddNewEntity === "function" || typeof KDAddEntity === "function") {
        const install = (native) =>
            function (entity, ...args) {
                const mapData = args[3];
                const map = mapData || KDMapData;
                const themed =
                    [HUNTING, INFESTATION].includes(map.MapMod) || map.SpiderlingsPopulationPlan?.layoutFallback;
                if (
                    map === KDMapData &&
                    themed &&
                    entity &&
                    !map.Entities.some((saved) => saved.id === entity.id) &&
                    isNonSpiderNPC(entity)
                ) {
                    const nests = nestsOn(map);
                    if (!clearsNests(entity, nests)) {
                        const occupied = new Set([KinkyDungeonPlayerEntity, ...map.Entities].filter(Boolean).map(key));
                        const accessible = reachableCells(map.StartPosition, terrain(map.MapMod));
                        const point = [...accessible]
                            .map((cell) => {
                                const [x, y] = cell.split(",").map(Number);
                                return { x, y };
                            })
                            .filter((cell) => {
                                const meta = KinkyDungeonTilesGet(key(cell));
                                return (
                                    clearsNests(cell, nests) &&
                                    !occupied.has(key(cell)) &&
                                    KinkyDungeonMapGet(cell.x, cell.y) === "0" &&
                                    !meta?.Lock &&
                                    !meta?.OL &&
                                    !meta?.Type &&
                                    !api.HuntingGroundsLayout?.isPopulationReserved?.(map, cell)
                                );
                            })
                            .sort((a, b) => distance(a, entity) - distance(b, entity) || a.y - b.y || a.x - b.x)[0];
                        // Native summon callers dereference the returned actor. Refuse the
                        // insertion without a null return when this map has no legal birth cell.
                        if (!point) return entity;
                        entity.x = point.x;
                        entity.y = point.y;
                    }
                }
                return native.apply(this, arguments);
            };
        // 5.5's ordinary births use the new entry, but persistent arrivals still
        // use KDAddEntity directly. Both must check a new insertion; saved members
        // already present in the target map retain their coordinates.
        if (typeof KDAddEntity === "function")
            KDAddEntity = api.Hooks
                ? api.Hooks.wrap("SpiderlingsNPCNestClearance.Entity", KDAddEntity, install)
                : install(KDAddEntity);
        if (typeof KDAddNewEntity === "function")
            KDAddNewEntity = api.Hooks
                ? api.Hooks.wrap("SpiderlingsNPCNestClearance.New", KDAddNewEntity, install)
                : install(KDAddNewEntity);
    }

    // prepareFloor publishes the existing save plan at the theme's original hook point.
    // planCrews is a read-only layout query: no quota or cells are reserved by its result.
    // seedCrews rechecks current capacity and placement, and owns only its new actors/rosters.
    // Native initial/wandering selection retains its original HuntingGrounds wrapper order.
    function effectiveCap() {
        const value = String(api.getSetting?.("spiderlingsMapPopulationCap") ?? 25).trim();
        const numeric = Number(value);
        const settingCap = /^\d+$/.test(value) && Number.isSafeInteger(numeric) ? numeric : 25;
        const map = typeof KDMapData !== "undefined" ? KDMapData : undefined;
        const plan = map?.SpiderlingsPopulationPlan;
        if (map?.MapMod === HUNTING || (plan?.kind === HUNTING && plan.layoutFallback)) return settingCap + 20;
        if (plan?.kind !== map?.MapMod || !Number.isSafeInteger(plan?.cap) || plan.cap <= 0) return settingCap;
        return settingCap === 0 ? plan.cap : Math.min(settingCap, plan.cap);
    }

    function availableSlots() {
        const cap = effectiveCap();
        if (cap === 0) return Infinity;
        const entities = typeof KDMapData !== "undefined" ? KDMapData?.Entities || [] : [];
        return Math.max(
            0,
            cap -
                entities.filter(
                    (entity) =>
                        entity.hp > 0 &&
                        MOBILE.has(typeof entity.Enemy === "string" ? entity.Enemy : entity.Enemy?.name),
                ).length,
        );
    }

    function prepareFloor(kind) {
        if (kind !== HUNTING && kind !== INFESTATION) throw new Error("Unknown Spiderlings population theme");
        if (!KDMapData.SpiderlingsPopulationPlan) {
            const cap = kind === HUNTING ? effectiveCap() : Math.min(effectiveCap() || 25, 25);
            const targetRatio = kind === HUNTING ? 0.85 : 0.58;
            KDMapData.SpiderlingsPopulationPlan = {
                kind,
                cap,
                targetRatio,
                mobileBudget:
                    kind === HUNTING
                        ? cap + Math.max(1, Math.round((cap * 0.15) / 0.85))
                        : Math.min(30, Math.floor(cap / targetRatio)),
                version: 1,
            };
        }
        if (kind === HUNTING) {
            const plan = KDMapData.SpiderlingsPopulationPlan;
            plan.cap = effectiveCap();
            plan.preyQuota = { Maid: Math.max(2, Math.round(plan.cap / 9)), Dressmaker: 1, Nurse: 1 };
            plan.mobileBudget = plan.cap + Object.values(plan.preyQuota).reduce((sum, count) => sum + count, 0);
            plan.ecologyBudget = plan.mobileBudget;
        }
        return {
            cap: KDMapData.SpiderlingsPopulationPlan.cap,
            available: availableSlots(),
            requiredMembers: kind === HUNTING ? 18 : 6,
        };
    }

    function reachableCells(start, passable, blocked = new Set(), canEnter = () => true) {
        const reached = new Set();
        if (!start || !passable.has(key(start)) || blocked.has(key(start)) || !canEnter(start)) return reached;
        const pending = [start];
        reached.add(key(start));
        for (let index = 0; index < pending.length; index += 1) {
            for (const point of neighbors(pending[index])) {
                const name = key(point);
                if (!reached.has(name) && passable.has(name) && !blocked.has(name) && canEnter(point)) {
                    reached.add(name);
                    pending.push(point);
                }
            }
        }
        return reached;
    }

    function reserveInitialGuards(plan, passable, occupied, spawnPoints, accessibleOverride, names = CORE) {
        const blocked = new Set([...occupied, ...plan.map(key)]);
        const accessible =
            accessibleOverride || reachableCells(KDMapData.StartPosition, passable, new Set(plan.map(key)));
        const protectedPoints = [
            KDMapData.StartPosition,
            KDMapData.EndPosition,
            KinkyDungeonPlayerEntity,
            ...Object.values(KDMapData.ShortcutPositions || {}),
            ...(KDMapData.JailPoints || []),
            ...spawnPoints,
        ].filter(Boolean);
        const movable =
            typeof KinkyDungeonMovableTilesEnemy !== "undefined"
                ? KinkyDungeonMovableTilesEnemy
                : KinkyDungeonMovableTiles;
        const placements = [];
        for (const nest of plan) {
            const cells = [];
            for (let dx = -2; dx <= 2; dx += 1)
                for (let dy = -2; dy <= 2; dy += 1) {
                    const point = { x: nest.x + dx, y: nest.y + dy };
                    const name = key(point);
                    const meta = KinkyDungeonTilesGet(name);
                    if (
                        Math.hypot(dx, dy) > 2.5 ||
                        blocked.has(name) ||
                        !accessible.has(name) ||
                        !movable.includes(KinkyDungeonMapGet(point.x, point.y)) ||
                        meta?.OL ||
                        meta?.Lock ||
                        meta?.Type ||
                        protectedPoints.some((protectedPoint) => distance(protectedPoint, point) < 2) ||
                        (typeof globalThis.KinkyDungeonNoEnemy === "function" &&
                            !globalThis.KinkyDungeonNoEnemy(point.x, point.y, true))
                    )
                        continue;
                    cells.push(point);
                }
            cells.sort((a, b) => Math.hypot(a.x - nest.x, a.y - nest.y) - Math.hypot(b.x - nest.x, b.y - nest.y));
            if (cells.length < names.length) return null;
            const guards = cells.slice(0, names.length);
            for (const point of guards) blocked.add(key(point));
            placements.push(guards);
        }
        return placements;
    }

    function terrain(kind = KDMapData.MapMod) {
        const passable = new Set();
        const stationary = new Set(
            kind === HUNTING ? KDMapData.Entities.filter((entity) => entity.Enemy?.immobile).map(key) : [],
        );
        for (let x = 1; x < KDMapData.GridWidth - 1; x++)
            for (let y = 1; y < KDMapData.GridHeight - 1; y++)
                if (
                    KinkyDungeonMovableTiles.includes(KinkyDungeonMapGet(x, y)) &&
                    !KinkyDungeonTilesGet(`${x},${y}`)?.Lock &&
                    !stationary.has(`${x},${y}`)
                )
                    passable.add(`${x},${y}`);
        return passable;
    }

    function planCrews({
        nests,
        spawnPoints,
        passable = terrain(),
        occupied = new Set(KDMapData.Entities.map(key)),
        reached,
        kind = KDMapData.MapMod,
    }) {
        const names = crew(kind);
        if (!names.every((name) => KinkyDungeonGetEnemyByName(name))) return null;
        return reserveInitialGuards(nests, passable, occupied, spawnPoints, reached, names);
    }

    function missingRoles(nest) {
        const roster = nest.SpiderlingsNestRoster;
        if (![3, 6].includes(nest.SpiderlingsNestRosterTarget)) return null;
        const names = roster?.length === nest.SpiderlingsNestRosterTarget ? roster : CORE;
        const assignedRoles = names.length === 3 ? INFESTATION_ROLES : ROLES;
        const roles = names.map((name, index) => ({ name, role: assignedRoles[index] }));
        for (const child of KDMapData.Entities) {
            if (!(child.hp > 0) || child[PARENT] !== nest.id) continue;
            let index = roles.findIndex(
                (slot) => slot.name === child.Enemy.name && slot.role === child.SpiderlingsHuntRole,
            );
            if (index < 0) index = roles.findIndex((slot) => slot.name === child.Enemy.name);
            if (index >= 0) roles.splice(index, 1);
        }
        return roles;
    }

    function removeBirths(entities) {
        let failure;
        for (const entity of [...new Set(entities)].reverse()) {
            if (!KDMapData.Entities.includes(entity)) continue;
            try {
                KDRemoveEntity(entity, false, false, true);
            } catch (error) {
                failure ||= error;
            }
            if (KDMapData.Entities.includes(entity))
                failure ||= new Error("Spiderlings population cleanup left a new entity");
        }
        if (failure) throw failure;
    }

    function cleanupError(error, failure) {
        return new AggregateError([error, failure], "Spiderlings population cleanup failed", {
            cause: error.cause || error,
        });
    }

    function spawnGroup(positions, nest, owned, names = CORE, roles = ROLES) {
        const created = [];
        let pending;
        try {
            for (const [index, name] of names.entries()) {
                const point = positions[index];
                pending = { name, point, before: new Set(KDMapData.Entities) };
                const batch = KinkyDungeonSummonEnemy(
                    point.x,
                    point.y,
                    name,
                    1,
                    0,
                    false,
                    undefined,
                    false,
                    false,
                    nest ? KDGetFaction(nest) : undefined,
                    true,
                    undefined,
                    true,
                    false,
                );
                for (const entity of batch || [])
                    if (!pending.before.has(entity)) {
                        created.push(entity);
                        owned.add(entity);
                    }
                const child = batch?.[0];
                const invalid =
                    batch?.length !== 1 || pending.before.has(child) || child.x !== point.x || child.y !== point.y;
                pending = undefined;
                if (invalid) {
                    removeBirths(created);
                    return null;
                }
                if (nest) {
                    child[PARENT] = nest.id;
                    child.SpiderlingsHuntRole = roles[index];
                } else {
                    child.SpiderlingsHuntRole = "hunter";
                    child.SpiderlingsPatrolCrew = true;
                }
            }
            if (!nest && created.length)
                for (const child of created) child.SpiderlingsHuntCrewID = "patrol:" + created[0].id;
            return created;
        } catch (error) {
            // Only the pending exact-cell birth is attributable when native throws before returning.
            // Other actors inserted by third-party hooks do not belong to this request.
            if (pending)
                for (const entity of KDMapData.Entities)
                    if (
                        !pending.before.has(entity) &&
                        entity.Enemy?.name === pending.name &&
                        entity.x === pending.point.x &&
                        entity.y === pending.point.y &&
                        (entity[PARENT] === undefined || entity[PARENT] === nest?.id)
                    ) {
                        created.push(entity);
                        owned.add(entity);
                    }
            try {
                removeBirths(created);
            } catch (failure) {
                throw cleanupError(error, failure);
            }
            throw error;
        }
    }

    function planPatrol(passable, occupied, spawnPoints, sites) {
        if (KDMapData.Entities.length + CORE.length > 300) return [];
        if (typeof api.availableSpiderlingSlots === "function" && api.availableSpiderlingSlots() < CORE.length)
            return [];
        const candidates = [...passable]
            .map((name) => {
                const [x, y] = name.split(",").map(Number);
                return { x, y };
            })
            .filter(
                (point) =>
                    !occupied.has(key(point)) &&
                    KinkyDungeonMapGet(point.x, point.y) === "0" &&
                    !KinkyDungeonTilesGet(key(point))?.OL &&
                    !KinkyDungeonTilesGet(key(point))?.Type &&
                    distance(point, KDMapData.StartPosition) >= 8 &&
                    sites.every((site) => distance(point, site) > (site.radius || 2) + 3) &&
                    !spawnPoints.some((spawn) => distance(point, spawn) < 2),
            );
        candidates.sort(
            (a, b) =>
                Math.min(...sites.map((site) => distance(a, site)), 99) -
                Math.min(...sites.map((site) => distance(b, site)), 99),
        );
        let positions;
        const reached = reachableCells(
            KDMapData.StartPosition,
            passable,
            new Set(KDMapData.Entities.filter((entity) => entity.Enemy?.immobile).map(key)),
        );
        for (const candidate of candidates.slice(0, 64)) {
            positions = reserveInitialGuards([candidate], passable, occupied, spawnPoints, reached)?.[0];
            if (positions) break;
        }
        if (!positions) return [];

        return positions;
    }

    function seedCrews({ kind, nests, spawnPoints, sites = [], positions, passable }) {
        const expectedNests = kind === HUNTING ? 3 : kind === INFESTATION ? 2 : 0;
        const names = crew(kind),
            roles = kind === INFESTATION ? INFESTATION_ROLES : ROLES;
        if (
            !expectedNests ||
            nests.length !== expectedNests ||
            new Set(nests.map((nest) => nest.id)).size !== expectedNests ||
            nests.some(
                (nest) =>
                    nest.id === undefined || nest.Enemy?.name !== "NestEntrance" || !KDMapData.Entities.includes(nest),
            )
        )
            throw new Error("Invalid Spiderlings crew initialization");
        if (nests.some((nest) => [3, 6].includes(nest.SpiderlingsNestRosterTarget)))
            return { ok: false, reason: "already-initialized" };
        const required = nests.length * names.length;
        if (availableSlots() < required || KDMapData.Entities.length + required > 300)
            return { ok: false, reason: "population-budget" };
        if (!names.every((name) => KinkyDungeonGetEnemyByName(name))) return { ok: false, reason: "definition" };
        passable ||= terrain(kind);
        if (!positions) positions = planCrews({ kind, nests, spawnPoints, passable });
        if (!positions || positions.length !== nests.length || positions.some((group) => group.length !== names.length))
            return { ok: false, reason: "placement" };
        const fieldSites = kind === HUNTING ? sites.filter((site) => site.radius >= 4).slice(0, 2) : [];
        positions = positions.map((group, index) =>
            group.map((point, member) =>
                fieldSites[index] && member < 2
                    ? { x: fieldSites[index].x + (member === 0 ? -1 : 1), y: fieldSites[index].y }
                    : point,
            ),
        );
        const occupied = new Set(KDMapData.Entities.map(key));
        const blocked = new Set([
            ...nests.map(key),
            ...KDMapData.Entities.filter((entity) => kind === HUNTING && entity.Enemy?.immobile).map(key),
        ]);
        const reached = reachableCells(
            KDMapData.StartPosition,
            passable,
            blocked,
            (point) =>
                KinkyDungeonMovableTiles.includes(KinkyDungeonMapGet(point.x, point.y)) &&
                !KinkyDungeonTilesGet(key(point))?.Lock,
        );
        const protectedPoints = [
            KDMapData.StartPosition,
            KDMapData.EndPosition,
            KinkyDungeonPlayerEntity,
            ...Object.values(KDMapData.ShortcutPositions || {}),
            ...(KDMapData.JailPoints || []),
            ...spawnPoints,
        ].filter(Boolean);
        const movable =
            typeof KinkyDungeonMovableTilesEnemy !== "undefined"
                ? KinkyDungeonMovableTilesEnemy
                : KinkyDungeonMovableTiles;
        for (const [index, group] of positions.entries())
            for (const point of group) {
                const meta = KinkyDungeonTilesGet(key(point));
                if (
                    occupied.has(key(point)) ||
                    !reached.has(key(point)) ||
                    !movable.includes(KinkyDungeonMapGet(point.x, point.y)) ||
                    ((!fieldSites[index] || distance(point, fieldSites[index]) > 1) &&
                        Math.hypot(point.x - nests[index].x, point.y - nests[index].y) > 2.5) ||
                    meta?.OL ||
                    meta?.Lock ||
                    meta?.Type ||
                    protectedPoints.some((anchor) => distance(anchor, point) < 2) ||
                    (typeof globalThis.KinkyDungeonNoEnemy === "function" &&
                        !globalThis.KinkyDungeonNoEnemy(point.x, point.y, true))
                )
                    return { ok: false, reason: "placement" };
                occupied.add(key(point));
            }
        const rosterKeys = ["SpiderlingsNestRosterTarget", "SpiderlingsNestRoster"];
        const saved = nests.map((nest) =>
            rosterKeys.map((field) => ({ field, present: Object.hasOwn(nest, field), value: nest[field] })),
        );
        const owned = new Set();
        const restoreRosters = () =>
            nests.forEach((nest, index) =>
                saved[index].forEach(({ field, present, value }) => {
                    if (present) nest[field] = value;
                    else delete nest[field];
                }),
            );
        const cleanup = () => {
            try {
                removeBirths(owned);
            } finally {
                restoreRosters();
            }
        };
        const core = [];
        try {
            for (const [index, nest] of nests.entries()) {
                nest.SpiderlingsNestRosterTarget = names.length;
                nest.SpiderlingsNestRoster = [...names];
                const members = spawnGroup(positions[index], nest, owned, names, roles);
                if (!members) {
                    cleanup();
                    return { ok: false, reason: "creation" };
                }
                if (fieldSites[index])
                    for (const child of members.slice(0, 2)) {
                        child.SpiderlingsPresetFieldCenter = { x: fieldSites[index].x, y: fieldSites[index].y };
                    }
                core.push(...members);
            }
            const patrol = [],
                field = core.filter((child) => child.SpiderlingsPresetFieldCenter);
            if (kind === HUNTING) {
                while (availableSlots() >= CORE.length) {
                    const patrolPositions = planPatrol(
                        passable,
                        new Set(KDMapData.Entities.map(key)),
                        spawnPoints,
                        sites,
                    );
                    if (patrolPositions?.length !== CORE.length) break;
                    const members = spawnGroup(patrolPositions, undefined, owned);
                    if (!members) break;
                    patrol.push(...members);
                }
            }
            return {
                ok: true,
                coreNestIds: nests.map((nest) => nest.id),
                coreIds: core.map((child) => child.id),
                patrolIds: patrol.map((child) => child.id),
                fieldIds: field.map((child) => child.id),
            };
        } catch (error) {
            try {
                cleanup();
            } catch (failure) {
                throw cleanupError(error, failure);
            }
            throw error;
        }
    }

    function seedHuntingResidents({ spawnPoints = [], prey = [], existingPrey = [] } = {}) {
        const map = KDMapData,
            passable = terrain(HUNTING);
        const reached = reachableCells(map.StartPosition, passable);
        const occupied = new Set(map.Entities.map(key));
        const protectedPoints = [
            map.StartPosition,
            map.EndPosition,
            KinkyDungeonPlayerEntity,
            ...Object.values(map.ShortcutPositions || {}),
            ...(map.JailPoints || []),
            ...spawnPoints,
        ].filter(Boolean);
        const candidates = [...reached]
            .map((name) => {
                const [x, y] = name.split(",").map(Number);
                return { x, y };
            })
            .filter((point) => {
                const meta = KinkyDungeonTilesGet(key(point));
                return (
                    !occupied.has(key(point)) &&
                    KinkyDungeonMapGet(point.x, point.y) === "0" &&
                    !meta?.OL &&
                    !meta?.Lock &&
                    !meta?.Type &&
                    distance(point, map.StartPosition) >= 8 &&
                    protectedPoints.every((anchor) => distance(anchor, point) >= 2) &&
                    !api.HuntingGroundsLayout?.isPopulationReserved?.(map, point)
                );
            });
        const owned = new Set(),
            preyIds = [],
            spiderIds = [];
        const preyPoints = existingPrey.map((entity) => ({ x: entity.x, y: entity.y }));
        const nests = nestsOn(map);
        const takePoint = (separation = 0, prey = false) => {
            const index = candidates.findIndex(
                (point) =>
                    !occupied.has(key(point)) &&
                    (!prey || clearsNests(point, nests)) &&
                    preyPoints.every((other) => distance(point, other) >= separation),
            );
            if (index < 0) return null;
            const point = candidates.splice(index, 1)[0];
            occupied.add(key(point));
            return point;
        };
        // Authored prey positions are spread across the accessible map before filling spiders.
        for (const name of prey) {
            if (map.Entities.length >= 300 || !KinkyDungeonGetEnemyByName(name)) break;
            const point = takePoint(6, true);
            if (!point) break;
            const members = spawnGroup([point], undefined, owned, [name]);
            if (!members) continue;
            const child = members[0];
            child.Enemy = { ...child.Enemy, clusterWith: undefined, cohesion: 0.01, cohesionRange: 1 };
            delete child.SpiderlingsHuntRole;
            delete child.SpiderlingsPatrolCrew;
            delete child.SpiderlingsHuntCrewID;
            child.SpiderlingsHuntingPrey = true;
            preyPoints.push(point);
            preyIds.push(child.id);
        }
        let index = 0;
        while (availableSlots() > 0 && map.Entities.length < 300) {
            const point = takePoint(2);
            if (!point) break;
            const members = spawnGroup([point], undefined, owned, [CORE[index++ % CORE.length]]);
            if (!members) break;
            // A singleton has no separate patrol crew; it can join nearby hunters.
            delete members[0].SpiderlingsHuntCrewID;
            spiderIds.push(members[0].id);
        }
        return { preyIds, spiderIds };
    }

    // Existing consumers retain their entry names; only this module owns cap interpretation.
    api.getMapPopulationCap = effectiveCap;
    api.availableSpiderlingSlots = availableSlots;
    Object.assign(population, {
        prepareFloor,
        planCrews,
        seedCrews,
        seedHuntingResidents,
        missingRoles,
        NPC_NEST_CLEARANCE,
        isNestSiteClear,
    });
    if (typeof module !== "undefined" && module.exports) module.exports = population;
})();
