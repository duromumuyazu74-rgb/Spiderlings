"use strict";
/* global KinkyDungeonCreateMapGenType, KinkyDungeonPlaceBrickwork: writable, KinkyDungeonPlaceTraps: writable */
/* global KinkyDungeonPlaceChests: writable, KinkyDungeonPlaceDoors: writable, KinkyDungeonPlaceShrines: writable */
/* global KinkyDungeonPlaceChargers: writable, KinkyDungeonPlaceSpecialTiles: writable, KinkyDungeonPlaceLore: writable */
/* global KinkyDungeonPlaceSetPieces: writable, KinkyDungeonPlaceJailEntrances: writable */

(() => {
    const spiderlings = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const layout = (spiderlings.HuntingGroundsLayout = spiderlings.HuntingGroundsLayout || {});
    if (layout.SpiderlingsLayoutLoaded) return;
    const pointKey = (point) => `${point.x},${point.y}`;
    const chebyshev = (left, right) => Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
    const directions = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
    ];
    const earlyPlans = new WeakMap();
    const reservations = new WeakMap();
    const carveable = "1234XrR";

    function cloneValue(value, seen = new WeakMap()) {
        if (!value || typeof value !== "object") return value;
        if (seen.has(value)) return seen.get(value);
        const copy = Array.isArray(value)
            ? []
            : value instanceof Map
              ? new Map()
              : value instanceof Set
                ? new Set()
                : {};
        seen.set(value, copy);
        if (Array.isArray(value)) value.forEach((item) => copy.push(cloneValue(item, seen)));
        else if (value instanceof Map)
            value.forEach((item, key) => copy.set(cloneValue(key, seen), cloneValue(item, seen)));
        else if (value instanceof Set) value.forEach((item) => copy.add(cloneValue(item, seen)));
        else for (const [name, item] of Object.entries(value)) copy[name] = cloneValue(item, seen);
        return copy;
    }

    function flood(start, passable, occupied = new Set()) {
        const reached = new Set();
        if (!start || !passable.has(pointKey(start)) || occupied.has(pointKey(start))) return reached;
        const pending = [start];
        reached.add(pointKey(start));
        for (let index = 0; index < pending.length; index += 1) {
            const current = pending[index];
            for (const direction of directions) {
                const next = { x: current.x + direction.x, y: current.y + direction.y };
                const name = pointKey(next);
                if (passable.has(name) && !occupied.has(name) && !reached.has(name)) {
                    reached.add(name);
                    pending.push(next);
                }
            }
        }
        return reached;
    }

    function footprint(center, radius, predicate) {
        for (let y = center.y - radius; y <= center.y + radius; y += 1)
            for (let x = center.x - radius; x <= center.x + radius; x += 1) if (!predicate(x, y)) return false;
        return true;
    }

    function makeAnchors(width, height, random) {
        const jitter = () => Math.floor(random() * 3) - 1;
        const clamp = (value, limit) => Math.max(5, Math.min(limit - 6, value));
        return [
            {
                x: clamp(Math.round(width * 0.22) + jitter(), width),
                y: clamp(Math.round(height * 0.25) + jitter(), height),
            },
            {
                x: clamp(Math.round(width * 0.78) + jitter(), width),
                y: clamp(Math.round(height * 0.25) + jitter(), height),
            },
            {
                x: clamp(Math.round(width * 0.78) + jitter(), width),
                y: clamp(Math.round(height * 0.76) + jitter(), height),
            },
            {
                x: clamp(Math.round(width * 0.22) + jitter(), width),
                y: clamp(Math.round(height * 0.76) + jitter(), height),
            },
        ];
    }

    // Called immediately after KD's TileMaze terrain generator, before native
    // stairs, doors, setpieces, quests and enemy placement. Only plain walls
    // become floor; native marked terrain and map size remain the game's own.
    function shapeTerrain(options) {
        const { width, height, tile, meta, set, random } = options;
        const diagnostics = options.diagnostics || {};
        if (width < 23 || height < 23) {
            diagnostics.failure = "size";
            return null;
        }
        const preferred = makeAnchors(width, height, options.fallback ? () => 0.5 : random);
        const planned = new Set(
            (options.planned || [])
                .filter((point) => Number.isInteger(point?.x) && Number.isInteger(point?.y))
                .map(pointKey),
        );
        const natural = (x, y) =>
            !planned.has(`${x},${y}`) && !meta(x, y) && (tile(x, y) === "0" || carveable.includes(tile(x, y)));
        const candidates = [];
        for (let y = 4; y < height - 4; y += 1)
            for (let x = 4; x < width - 4; x += 1) {
                const center = { x, y };
                if (
                    footprint(center, 3, natural) &&
                    [options.start, options.end, ...(options.shortcuts || [])]
                        .filter(Boolean)
                        .every((point) => chebyshev(center, point) >= 5)
                )
                    candidates.push(center);
            }
        const anchors = [];
        diagnostics.candidates = candidates.length;
        for (const target of preferred) {
            const candidate = candidates
                .filter((center) => anchors.every((placed) => chebyshev(placed, center) >= 9))
                .sort((left, right) => chebyshev(left, target) - chebyshev(right, target))[0];
            if (candidate) anchors.push(candidate);
        }
        diagnostics.anchors = anchors;
        if (anchors.length < 3) {
            diagnostics.failure = "anchors";
            return null;
        }
        const midpoint = { x: Math.round(width * 0.5), y: Math.round(height * 0.48) };
        let crossroad = null;
        for (let radius = 0; radius < Math.max(width, height) && !crossroad; radius += 1)
            for (
                let y = Math.max(2, midpoint.y - radius);
                y <= Math.min(height - 3, midpoint.y + radius) && !crossroad;
                y += 1
            )
                for (let x = Math.max(2, midpoint.x - radius); x <= Math.min(width - 3, midpoint.x + radius); x += 1)
                    if (
                        Math.max(Math.abs(x - midpoint.x), Math.abs(y - midpoint.y)) === radius &&
                        footprint({ x, y }, 1, natural)
                    ) {
                        crossroad = { x, y };
                        break;
                    }
        if (!crossroad) {
            diagnostics.failure = "crossroad";
            return null;
        }
        const proposed = new Set();
        const add = (x, y) => {
            if (
                x > 0 &&
                y > 0 &&
                x < width - 1 &&
                y < height - 1 &&
                carveable.includes(tile(x, y)) &&
                !meta(x, y) &&
                !planned.has(`${x},${y}`)
            )
                proposed.add(`${x},${y}`);
        };
        const square = (center, radius) => {
            for (let y = center.y - radius; y <= center.y + radius; y += 1)
                for (let x = center.x - radius; x <= center.x + radius; x += 1) add(x, y);
        };
        const corridor = (from, to) => {
            const target = pointKey(to);
            const pending = [from];
            const parent = new Map([[pointKey(from), null]]);
            for (let index = 0; index < pending.length && !parent.has(target); index += 1) {
                const current = pending[index];
                for (const direction of directions) {
                    const next = { x: current.x + direction.x, y: current.y + direction.y };
                    const name = pointKey(next);
                    if (parent.has(name) || next.x <= 0 || next.y <= 0 || next.x >= width - 1 || next.y >= height - 1)
                        continue;
                    if (!proposed.has(name) && !natural(next.x, next.y)) continue;
                    parent.set(name, pointKey(current));
                    pending.push(next);
                }
            }
            if (!parent.has(target)) return false;
            for (let name = target; name; name = parent.get(name)) {
                const [x, y] = name.split(",").map(Number);
                add(x, y);
            }
            return true;
        };
        for (const anchor of anchors) square(anchor, Math.min(width, height) >= 28 ? 4 : 3);
        square(crossroad, 2);
        const links = [];
        for (const anchor of anchors) links.push(corridor(anchor, crossroad));
        const siteTargets = [
            { x: Math.round(width * 0.25), y: Math.round(height * 0.55) },
            { x: Math.round(width * 0.5), y: Math.round(height * 0.35) },
            { x: Math.round(width * 0.75), y: Math.round(height * 0.55) },
            { x: Math.round(width * 0.3), y: Math.round(height * 0.8) },
            { x: Math.round(width * 0.7), y: Math.round(height * 0.8) },
            { x: Math.round(width * 0.5), y: Math.round(height * 0.75) },
        ];
        const siteCandidates = [];
        for (let y = 3; y < height - 3; y += 1)
            for (let x = 3; x < width - 3; x += 1) {
                const center = { x, y };
                if (
                    anchors.every((anchor) => chebyshev(anchor, center) > 6) &&
                    [options.start, options.end, ...(options.shortcuts || [])]
                        .filter(Boolean)
                        .every((point) => chebyshev(point, center) > 4) &&
                    footprint(center, 2, natural)
                )
                    siteCandidates.push(center);
            }
        const huntingSites = [];
        for (const target of siteTargets) {
            const candidate = siteCandidates
                .filter((center) => huntingSites.every((placed) => chebyshev(placed, center) >= 5))
                .sort((left, right) => chebyshev(left, target) - chebyshev(right, target))[0];
            if (candidate) huntingSites.push(candidate);
        }
        for (const site of huntingSites) {
            square(site, 2);
            links.push(corridor(site, crossroad));
        }
        for (const endpoint of [options.start, options.end, ...(options.shortcuts || [])])
            if (endpoint) links.push(corridor(endpoint, crossroad));
        diagnostics.links = links;
        diagnostics.huntingSites = huntingSites;
        if (links.includes(false)) {
            diagnostics.failure = "links";
            return null;
        }
        // An unsupported or blocked native generator leaves its terrain intact.
        const usableAnchors = anchors.filter((center) =>
            footprint(center, 3, (x, y) => tile(x, y) === "0" || proposed.has(`${x},${y}`)),
        );
        if (usableAnchors.length < 3) {
            diagnostics.failure = "usable-anchors";
            return null;
        }
        for (const name of proposed) {
            const [x, y] = name.split(",").map(Number);
            set(x, y, "0");
        }
        const reserved = [];
        if (options.reserve)
            for (const center of [...usableAnchors, ...huntingSites]) {
                const radius = usableAnchors.includes(center) ? 4 : 2;
                for (let y = center.y - radius; y <= center.y + radius; y += 1)
                    for (let x = center.x - radius; x <= center.x + radius; x += 1)
                        if (x > 0 && y > 0 && x < width - 1 && y < height - 1 && tile(x, y) === "0" && !meta(x, y)) {
                            options.reserve(x, y);
                            reserved.push(`${x},${y}`);
                        }
            }
        return {
            anchors: usableAnchors,
            huntingSites,
            crossroad,
            opened: proposed.size,
            width,
            height,
            reserved: reserved.length,
            fallback: !!options.fallback,
        };
    }

    function release(map) {
        const reserved = reservations.get(map);
        if (!reserved) return;
        for (const name of reserved) {
            const data = map.Tiles?.[name];
            if (!data?.SpiderlingsLayoutReserve) continue;
            delete data.SpiderlingsLayoutReserve;
            if (
                !data.Type &&
                !data.Lock &&
                !data.Jail &&
                !data.Loot &&
                !data.Special &&
                !data.NoRemove &&
                "XmrR4".includes(KinkyDungeonMapGet(...name.split(",").map(Number)))
            ) {
                KinkyDungeonMapSet(...name.split(",").map(Number), "0");
                delete data.Skin;
            }
            if (!data.Type && !data.Lock && !data.Jail && !data.Loot && !data.Special) delete data.OL;
            if (!Object.keys(data).length) delete map.Tiles[name];
        }
        reservations.delete(map);
        if (typeof KinkyDungeonGenNavMap === "function") KinkyDungeonGenNavMap();
    }

    function relocateReserved(list, reserved) {
        if (!Array.isArray(list) || !reserved?.size) return 0;
        const used = new Set(list.map(pointKey));
        let moved = 0;
        for (const point of list) {
            if (!reserved.has(pointKey(point))) continue;
            const candidates = [];
            for (let y = 2; y < KDMapData.GridHeight - 2; y += 1)
                for (let x = 2; x < KDMapData.GridWidth - 2; x += 1) {
                    const name = `${x},${y}`;
                    if (
                        reserved.has(name) ||
                        used.has(name) ||
                        KinkyDungeonMapGet(x, y) !== "0" ||
                        KinkyDungeonTilesGet(name)
                    )
                        continue;
                    candidates.push({ x, y });
                }
            candidates.sort(
                (left, right) =>
                    chebyshev(left, point) - chebyshev(right, point) || left.y - right.y || left.x - right.x,
            );
            if (!candidates.length) continue;
            used.delete(pointKey(point));
            point.x = candidates[0].x;
            point.y = candidates[0].y;
            used.add(pointKey(point));
            moved += 1;
        }
        return moved;
    }

    // One shared passability/occupancy index serves all nest, field and route
    // checks. Candidate cost is bounded by the map area and three selections.
    function planEncounter(options) {
        const { width, height, tile, meta, start } = options;
        const diagnostics = options.diagnostics || {};
        if (width < 23 || height < 23 || !start) return null;
        const passable = new Set();
        const floor = new Set();
        const protectedCells = new Set();
        const occupied = new Set((options.entities || []).filter((entity) => entity.hp !== 0).map(pointKey));
        const stationary = new Set(
            (options.entities || []).filter((entity) => entity.hp !== 0 && entity.Enemy?.immobile).map(pointKey),
        );
        const mandatory = [
            start,
            ...(options.exits || []),
            ...(options.spawnPoints || []).filter((point) => point.required?.length || point.force || point.priority),
            ...(options.required || []),
        ].filter(Boolean);
        const reservedPoints = [start, ...(options.exits || []), ...(options.required || [])];
        const spawnPointCells = new Set((options.spawnPoints || []).map(pointKey));
        const approaches = [start, ...(options.exits || [])].filter(Boolean);
        for (const point of reservedPoints) protectedCells.add(pointKey(point));
        for (let y = 1; y < height - 1; y += 1)
            for (let x = 1; x < width - 1; x += 1) {
                const name = `${x},${y}`;
                const value = tile(x, y);
                const data = meta(x, y);
                if (options.movable.includes(value)) passable.add(name);
                if ("023".includes(value) && !data?.OL && !data?.Lock && !data?.Type) floor.add(name);
                if (data?.OL || data?.Lock || data?.Type) protectedCells.add(name);
            }
        const initiallyReachable = flood(start, passable, stationary);
        diagnostics.preexistingUnreachable = mandatory.filter((point) => !initiallyReachable.has(pointKey(point)));
        const allProtected = new Set([...protectedCells, ...stationary]);
        const legal = (x, y) => floor.has(`${x},${y}`) && !allProtected.has(`${x},${y}`);
        const available = [];
        for (let y = 4; y < height - 4; y += 1)
            for (let x = 4; x < width - 4; x += 1) {
                const point = { x, y };
                if (
                    !initiallyReachable.has(pointKey(point)) ||
                    occupied.has(pointKey(point)) ||
                    spawnPointCells.has(pointKey(point)) ||
                    !footprint(point, 3, legal)
                )
                    continue;
                if (approaches.some((entry) => chebyshev(entry, point) < 5)) continue;
                if (options.acceptNest && !options.acceptNest(point, initiallyReachable)) continue;
                available.push(point);
            }
        const preferred = options.anchors || [];
        diagnostics.nestCandidates = available.length;
        diagnostics.candidates = available;
        available.sort((left, right) => {
            const rank = (point) => Math.min(...preferred.map((anchor) => chebyshev(anchor, point)), 999);
            return rank(left) - rank(right) || left.y - right.y || left.x - right.x;
        });
        const nests = [];
        for (const point of available) {
            if (nests.some((nest) => chebyshev(nest, point) < 9)) continue;
            nests.push(point);
            if (nests.length === 3) break;
        }
        diagnostics.nests = nests;
        if (nests.length !== 3) {
            diagnostics.failure = "nest-sites";
            return null;
        }
        const nestCells = new Set(nests.map(pointKey));
        const blocking = new Set([...stationary, ...nestCells]);
        const reached = flood(start, passable, blocking);
        diagnostics.baseline = initiallyReachable.size;
        diagnostics.reached = reached.size;
        diagnostics.unreachableMandatory = mandatory.filter((point) => !reached.has(pointKey(point)));
        if (
            reached.size !== initiallyReachable.size - 3 ||
            mandatory.some((point) => initiallyReachable.has(pointKey(point)) && !reached.has(pointKey(point))) ||
            nests.some(
                (nest) =>
                    !directions.some((direction) => reached.has(`${nest.x + direction.x},${nest.y + direction.y}`)),
            )
        ) {
            diagnostics.failure = "route";
            return null;
        }
        const siteCandidates = [];
        for (let y = 2; y < height - 2; y += 1)
            for (let x = 2; x < width - 2; x += 1) {
                const point = { x, y };
                if (nests.some((nest) => chebyshev(nest, point) <= 5)) continue;
                if (!reached.has(pointKey(point)) || !footprint(point, 1, legal)) continue;
                siteCandidates.push(point);
            }
        const sites = [];
        for (const target of options.huntingSites || []) {
            const candidate = siteCandidates
                .filter((point) => sites.every((site) => chebyshev(site, point) >= 3))
                .sort((left, right) => chebyshev(left, target) - chebyshev(right, target))[0];
            if (candidate) sites.push(candidate);
            if (sites.length === 3) break;
        }
        for (const point of siteCandidates)
            if (sites.length < 3 && sites.every((site) => chebyshev(site, point) >= 3)) sites.push(point);
        diagnostics.sites = sites;
        if (sites.length !== 3) {
            diagnostics.failure = "field-sites";
            return null;
        }
        return {
            nests,
            sites,
            metrics: {
                open: floor.size,
                passable: passable.size,
                reachable: reached.size,
                nestCandidates: available.length,
                protected: protectedCells.size,
            },
        };
    }

    function register() {
        if (typeof KinkyDungeonCreateMapGenType === "undefined" || !KinkyDungeonCreateMapGenType.TileMaze) return;
        const original = KinkyDungeonCreateMapGenType.TileMaze;
        if (original.SpiderlingsHuntingGroundsLayoutWrapped) return;
        // Several native placement passes ignore OL metadata. Expose reserved
        // floor as wall only while their candidate pickers run.
        const shield = (original) => {
            if (typeof original !== "function" || original.SpiderlingsHuntingGroundsLayoutWrapped) return original;
            const wrapped = function (...args) {
                const reserved = reservations.get(KDMapData);
                if (!reserved?.size) return original.apply(this, args);
                const nativeGet = KinkyDungeonMapGet;
                KinkyDungeonMapGet = function (x, y) {
                    if (reserved.has(`${x},${y}`)) return "1";
                    return nativeGet.apply(this, arguments);
                };
                try {
                    return original.apply(this, args);
                } finally {
                    KinkyDungeonMapGet = nativeGet;
                }
            };
            wrapped.SpiderlingsHuntingGroundsLayoutWrapped = true;
            return wrapped;
        };
        if (typeof KinkyDungeonPlaceBrickwork === "function")
            KinkyDungeonPlaceBrickwork = shield(KinkyDungeonPlaceBrickwork);
        if (typeof KinkyDungeonPlaceTraps === "function") KinkyDungeonPlaceTraps = shield(KinkyDungeonPlaceTraps);
        if (typeof KinkyDungeonPlaceChests === "function") KinkyDungeonPlaceChests = shield(KinkyDungeonPlaceChests);
        if (typeof KinkyDungeonPlaceDoors === "function") KinkyDungeonPlaceDoors = shield(KinkyDungeonPlaceDoors);
        if (typeof KinkyDungeonPlaceShrines === "function") {
            const originalShrines = shield(KinkyDungeonPlaceShrines);
            KinkyDungeonPlaceShrines = function (...args) {
                const reserved = reservations.get(KDMapData);
                const moved = relocateReserved(args[1], reserved);
                const plan = earlyPlans.get(KDMapData);
                if (plan && moved) plan.relocatedShrines = (plan.relocatedShrines || 0) + moved;
                return originalShrines.apply(this, args);
            };
        }
        if (typeof KinkyDungeonPlaceChargers === "function")
            KinkyDungeonPlaceChargers = shield(KinkyDungeonPlaceChargers);
        if (typeof KinkyDungeonPlaceSpecialTiles === "function")
            KinkyDungeonPlaceSpecialTiles = shield(KinkyDungeonPlaceSpecialTiles);
        if (typeof KinkyDungeonPlaceLore === "function") KinkyDungeonPlaceLore = shield(KinkyDungeonPlaceLore);
        if (typeof KinkyDungeonPlaceSetPieces === "function") {
            const originalSetPieces = shield(KinkyDungeonPlaceSetPieces);
            KinkyDungeonPlaceSetPieces = function (...args) {
                const plan = earlyPlans.get(KDMapData);
                const temporary = (plan?.anchors || []).map((point) => ({ ...point, radius: 4 }));
                if (temporary.length) (KDMapData.SpecialAreas = KDMapData.SpecialAreas || []).push(...temporary);
                try {
                    return originalSetPieces.apply(this, args);
                } finally {
                    if (temporary.length)
                        KDMapData.SpecialAreas = KDMapData.SpecialAreas.filter((area) => !temporary.includes(area));
                }
            };
        }
        if (typeof KinkyDungeonPlaceJailEntrances === "function")
            KinkyDungeonPlaceJailEntrances = shield(KinkyDungeonPlaceJailEntrances);
        if (typeof KinkyDungeonPlaceChargers === "function") {
            const originalChargers = KinkyDungeonPlaceChargers;
            KinkyDungeonPlaceChargers = function (...args) {
                const reserved = reservations.get(KDMapData);
                const moved = relocateReserved(args[0], reserved);
                const plan = earlyPlans.get(KDMapData);
                if (plan && moved) plan.relocatedChargers = (plan.relocatedChargers || 0) + moved;
                return originalChargers.apply(this, args);
            };
        }
        KinkyDungeonCreateMapGenType.TileMaze = function (...args) {
            const eligible =
                KDMapData.MapMod === "SpiderlingsHuntingGrounds" &&
                !KDMapData.RoomType &&
                !KDMapData.SpiderlingsHuntingGrounds;
            const originalMap = eligible ? cloneValue(KDMapData) : null;
            const originalArgs = eligible ? args.map((arg) => cloneValue(arg)) : null;
            let result;
            for (let attempt = 0; attempt < (eligible ? 5 : 1); attempt += 1) {
                if (attempt) {
                    reservations.delete(KDMapData);
                    for (const name of Object.keys(KDMapData)) delete KDMapData[name];
                    Object.assign(KDMapData, cloneValue(originalMap));
                    for (let index = 0; index < args.length; index += 1) {
                        if (!args[index] || typeof args[index] !== "object") continue;
                        if (Array.isArray(args[index]))
                            args[index].splice(0, args[index].length, ...cloneValue(originalArgs[index]));
                        else {
                            for (const name of Object.keys(args[index])) delete args[index][name];
                            Object.assign(args[index], cloneValue(originalArgs[index]));
                        }
                    }
                }
                result = original.apply(this, args);
                if (!eligible) break;
                const diagnostics = {};
                const shaped = shapeTerrain({
                    diagnostics,
                    fallback: attempt === 4,
                    width: KDMapData.GridWidth,
                    height: KDMapData.GridHeight,
                    tile: KinkyDungeonMapGet,
                    meta: (x, y) => KinkyDungeonTilesGet(`${x},${y}`),
                    set: KinkyDungeonMapSet,
                    random: KDRandom,
                    start: KDMapData.StartPosition,
                    end: KDMapData.EndPosition,
                    shortcuts: Object.values(KDMapData.ShortcutPositions || {}),
                    planned: [
                        ...(args[0] || []),
                        ...(args[7]?.chestlist || []),
                        ...(args[7]?.traps || []),
                        ...(args[7]?.shrinelist || []),
                        ...(args[7]?.chargerlist || []),
                        ...(args[7]?.spawnpoints || []),
                    ],
                    reserve: (x, y) => KinkyDungeonTilesSet(`${x},${y}`, { OL: true, SpiderlingsLayoutReserve: true }),
                });
                if (shaped) {
                    shaped.attempts = attempt + 1;
                    const reserved = new Set();
                    for (const [name, data] of Object.entries(KDMapData.Tiles || {}))
                        if (data?.SpiderlingsLayoutReserve) reserved.add(name);
                    reservations.set(KDMapData, reserved);
                }
                earlyPlans.set(KDMapData, shaped || { failed: true, attempts: attempt + 1, diagnostics });
                if (shaped && (shaped.anchors.length >= 4 || attempt === 4)) break;
            }
            return result;
        };
        KinkyDungeonCreateMapGenType.TileMaze.SpiderlingsHuntingGroundsLayoutWrapped = true;
    }

    Object.assign(layout, {
        flood,
        footprint,
        shapeTerrain,
        planEncounter,
        earlyPlan: (map) => earlyPlans.get(map),
        release,
        register,
    });
    layout.SpiderlingsLayoutLoaded = true;
    register();
    if (typeof module !== "undefined" && module.exports) module.exports = layout;
})();
