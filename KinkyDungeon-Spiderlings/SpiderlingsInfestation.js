"use strict";

(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const infestation = (api.Infestation = api.Infestation || {});
    const key = (point) => `${point.x},${point.y}`;
    const distance = (left, right) => Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y));
    const neighbors = (point) => [
        { x: point.x - 1, y: point.y },
        { x: point.x + 1, y: point.y },
        { x: point.x, y: point.y - 1 },
        { x: point.x, y: point.y + 1 },
    ];

    function reachableCells(start, passable, blocked = new Set()) {
        const reached = new Set();
        if (!start || !passable.has(key(start)) || blocked.has(key(start))) return reached;
        const pending = [start];
        reached.add(key(start));
        for (let index = 0; index < pending.length; index += 1) {
            for (const point of neighbors(pending[index])) {
                const name = key(point);
                if (!reached.has(name) && passable.has(name) && !blocked.has(name)) {
                    reached.add(name);
                    pending.push(point);
                }
            }
        }
        return reached;
    }

    // Iterative low-link DFS: long corridors must not consume the JS call stack.
    // The graph is connected before each removal; only accepted nests change it.
    function placementCutpoints(adjacency, start, blocked) {
        const entered = new Int32Array(adjacency.length);
        const low = new Int32Array(adjacency.length);
        const parent = new Int32Array(adjacency.length).fill(-1);
        const next = new Uint8Array(adjacency.length);
        const children = new Uint8Array(adjacency.length);
        const cuts = new Uint8Array(adjacency.length);
        const stack = [start];
        let clock = 1;
        entered[start] = low[start] = clock;
        while (stack.length) {
            const node = stack[stack.length - 1];
            if (next[node] < adjacency[node].length) {
                const neighbor = adjacency[node][next[node]++];
                if (blocked.has(neighbor) || neighbor === parent[node]) continue;
                if (!entered[neighbor]) {
                    parent[neighbor] = node;
                    children[node] += 1;
                    entered[neighbor] = low[neighbor] = ++clock;
                    stack.push(neighbor);
                } else low[node] = Math.min(low[node], entered[neighbor]);
            } else {
                stack.pop();
                const previous = parent[node];
                if (previous === -1) cuts[node] = children[node] > 1 ? 1 : 0;
                else {
                    low[previous] = Math.min(low[previous], low[node]);
                    if (parent[previous] !== -1 && low[node] >= entered[previous]) cuts[previous] = 1;
                }
            }
        }
        return cuts;
    }

    // A nest is a stationary entity. Check the map with every planned nest cell
    // blocked, including access to each nest's attack range, before creating any.
    function planNestPlacement(options) {
        const baseline = reachableCells(options.start, options.passable);
        const candidates = options.candidates.filter((point) => baseline.has(key(point)));
        const random = options.random || Math.random;
        for (let index = candidates.length - 1; index > 0; index -= 1) {
            const other = Math.min(index, Math.floor(Math.max(0, random()) * (index + 1)));
            [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
        }
        const selected = [];
        const blocked = new Set();
        let graph = null;
        let cuts = null;
        function updateCutpoints() {
            if (!graph) {
                const cells = [...baseline].map((name) => {
                    const [x, y] = name.split(",").map(Number);
                    return { x, y };
                });
                const indexByKey = new Map(cells.map((cell, index) => [key(cell), index]));
                graph = {
                    indexByKey,
                    adjacency: cells.map((cell) =>
                        neighbors(cell)
                            .map((nearby) => indexByKey.get(key(nearby)))
                            .filter((index) => index !== undefined),
                    ),
                };
            }
            cuts = placementCutpoints(
                graph.adjacency,
                graph.indexByKey.get(key(options.start)),
                new Set([...blocked].map((name) => graph.indexByKey.get(name))),
            );
        }
        for (const point of candidates) {
            if (selected.some((placed) => distance(placed, point) < options.minimumDistance)) continue;
            const name = key(point);
            if (name === key(options.start)) continue;
            const proposed = new Set([...blocked, name]);
            if (graph) {
                if (!cuts) updateCutpoints();
                if (!blocked.has(name) && cuts[graph.indexByKey.get(name)]) continue;
            } else {
                // Open maps usually accept the first spaced candidates. Pay for
                // indexing only after a choke actually forces repeated searches.
                const reachable = reachableCells(options.start, options.passable, proposed);
                if (reachable.size !== baseline.size - proposed.size) {
                    updateCutpoints();
                    continue;
                }
            }
            // A non-cutpoint preserves connectivity, but may be the last attack
            // cell of an already selected nest. Keep that independent gate.
            if (
                [...selected, point].some(
                    (nest) =>
                        !neighbors(nest).some((nearby) => baseline.has(key(nearby)) && !proposed.has(key(nearby))),
                )
            )
                continue;
            selected.push(point);
            blocked.add(name);
            cuts = null;
            if (selected.length === options.count) return selected;
        }
        return null;
    }

    function planGroupedNestPlacement(options) {
        if (options.groupSizes) return planDistributedNests(options);
        const baseline = reachableCells(options.start, options.passable);
        const candidates = options.candidates.filter((point) => baseline.has(key(point)));
        const random = options.random || Math.random;
        for (let index = candidates.length - 1; index > 0; index--) {
            const other = Math.min(index, Math.floor(Math.max(0, random()) * (index + 1)));
            [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
        }
        // Match the reinforcement bonus's Euclidean radius, not tile distance:
        // all members of each group must be four to five tiles apart.
        const near = candidates.map((point, index) =>
            candidates.flatMap((other, next) => {
                const squared = (point.x - other.x) ** 2 + (point.y - other.y) ** 2;
                return next > index && squared >= 16 && squared <= 25 ? [next] : [];
            }),
        );
        const pairs = [],
            triples = [];
        for (let i = 0; i < candidates.length; i++)
            for (const j of near[i]) {
                pairs.push([candidates[i], candidates[j]]);
                for (const k of near[j])
                    if (near[i].includes(k)) {
                        triples.push([candidates[i], candidates[j], candidates[k]]);
                    }
            }
        // Reuse the placement connectivity contract for each group and their
        // union; a valid group alone can still jointly block a corridor.
        const valid = (points) =>
            planNestPlacement({
                ...options,
                candidates: points,
                count: points.length,
                minimumDistance: 0,
                random: () => 1,
            }) !== null;
        const tripleValidity = new Map();
        for (const pair of pairs) {
            if (!valid(pair)) continue;
            for (const triple of triples) {
                const gapSquared = Math.min(
                    ...pair.flatMap((left) => triple.map((right) => (left.x - right.x) ** 2 + (left.y - right.y) ** 2)),
                );
                // Nearby separate groups: no cross-group five-tile bonus, and
                // neither group is sent to the opposite end of the map.
                if (gapSquared < 36 || gapSquared > 64) continue;
                if (!tripleValidity.has(triple)) tripleValidity.set(triple, valid(triple));
                if (!tripleValidity.get(triple)) continue;
                const plan = [...triple, ...pair];
                if (valid(plan)) return plan;
            }
        }
        return null;
    }

    function nestDistribution(floor) {
        const five = Math.min(30, 2 + Math.max(0, Math.floor(floor) - 3));
        return [
            { sizes: [2, 2, 1], weight: 82 - five },
            { sizes: [2, 3], weight: 18 },
            { sizes: [5], weight: five },
        ];
    }

    function selectNestDistribution(floor, random) {
        let roll = Math.max(0, Math.min(0.999999, random())) * 100;
        for (const option of nestDistribution(floor)) {
            roll -= option.weight;
            if (roll < 0) return [...option.sizes];
        }
        return [5];
    }

    function planDistributedNests(options) {
        const baseline = reachableCells(options.start, options.passable),
            candidates = options.candidates.filter((point) => baseline.has(key(point))),
            squared = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2,
            random = options.random || Math.random;
        for (let index = candidates.length - 1; index > 0; index--) {
            const other = Math.min(index, Math.floor(Math.max(0, random()) * (index + 1)));
            [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
        }
        // Retry different seeds without combinatorial enumeration of five-nest cliques.
        for (let attempt = 0; attempt < Math.min(32, candidates.length); attempt++) {
            const groups = [],
                selected = [];
            for (const size of options.groupSizes) {
                let group;
                for (let offset = 0; offset < candidates.length; offset++) {
                    const seed = candidates[(attempt + offset) % candidates.length];
                    if (selected.some((point) => squared(seed, point) < 64)) continue;
                    const proposed = [seed];
                    for (const point of candidates) {
                        if (proposed.length >= size) break;
                        if (
                            selected.some((other) => squared(point, other) < 64) ||
                            proposed.some((other) => squared(point, other) < 16) ||
                            squared(seed, point) > 64 ||
                            !proposed.some((other) => squared(point, other) <= 25)
                        )
                            continue;
                        proposed.push(point);
                    }
                    if (proposed.length === size) {
                        group = proposed;
                        break;
                    }
                }
                if (!group) break;
                groups.push(group);
                selected.push(...group);
            }
            if (groups.length !== options.groupSizes.length) continue;
            if (planNestPlacement({ ...options, candidates: selected, count: 5, minimumDistance: 0, random: () => 1 }))
                return selected;
        }
        return null;
    }

    // Open the ordinary terrain through and one tile beyond each nest group.
    // Interactive tiles, authored off-limits areas and the map border retain
    // their native identity; only plain walls/debris become ordinary floor.
    function planNestClearing(plan, options) {
        const cells = [];
        if (!plan?.length) return cells;
        const minX = Math.max(1, Math.min(...plan.map((p) => p.x)) - 1);
        const maxX = Math.min(options.width - 2, Math.max(...plan.map((p) => p.x)) + 1);
        const minY = Math.max(1, Math.min(...plan.map((p) => p.y)) - 1);
        const maxY = Math.min(options.height - 2, Math.max(...plan.map((p) => p.y)) + 1);
        for (let x = minX; x <= maxX; x++)
            for (let y = minY; y <= maxY; y++) {
                const tile = options.tile(x, y);
                const meta = options.meta(x, y);
                if (
                    !"1234".includes(tile) ||
                    !tile ||
                    meta?.OL ||
                    meta?.Lock ||
                    meta?.Type ||
                    options.protected?.(x, y)
                )
                    continue;
                // Retaining a locked door is insufficient if its side wall opens.
                // Native accessibility includes diagonal steps and interactive cells.
                let bordersSealedArea = false;
                if (options.accessible)
                    for (let dx = -1; dx <= 1; dx++)
                        for (let dy = -1; dy <= 1; dy++) {
                            if (
                                (!dx && !dy) ||
                                x + dx <= 0 ||
                                y + dy <= 0 ||
                                x + dx >= options.width - 1 ||
                                y + dy >= options.height - 1
                            )
                                continue;
                            const adjacent = options.tile(x + dx, y + dy);
                            if (
                                adjacent &&
                                options.interactable.includes(adjacent) &&
                                !options.accessible.has(`${x + dx},${y + dy}`)
                            )
                                bordersSealedArea = true;
                        }
                if (bordersSealedArea) continue;
                cells.push({ x, y, tile });
            }
        return cells;
    }

    function openNestClearing(groups, spawnPoints) {
        const protectedPoints = [
            KDMapData.StartPosition,
            KDMapData.EndPosition,
            ...Object.values(KDMapData.ShortcutPositions || {}),
            ...(KDMapData.JailPoints || []),
            ...spawnPoints,
        ].filter(Boolean);
        const options = {
            width: KDMapData.GridWidth,
            height: KDMapData.GridHeight,
            tile: KinkyDungeonMapGet,
            meta: (x, y) => KinkyDungeonTilesGet(`${x},${y}`),
            protected: (x, y) => protectedPoints.some((p) => distance(p, { x, y }) < 2),
            accessible:
                typeof KinkyDungeonGetAccessible === "function"
                    ? new Set(
                          Object.keys(KinkyDungeonGetAccessible(KDMapData.StartPosition.x, KDMapData.StartPosition.y)),
                      )
                    : undefined,
            interactable: typeof KDInteractableTiles !== "undefined" ? KDInteractableTiles : KinkyDungeonMovableTiles,
        };
        let cells = [
            ...new Map(
                groups.flatMap((group) => planNestClearing(group, options)).map((cell) => [key(cell), cell]),
            ).values(),
        ];
        // Opening a wall behind a stationary nest must not create a pocket
        // whose only entrance passes through that nest's occupied tile.
        const passable = new Set(cells.map(key));
        for (let x = 1; x < KDMapData.GridWidth - 1; x++)
            for (let y = 1; y < KDMapData.GridHeight - 1; y++) {
                if (
                    KinkyDungeonMovableTiles.includes(KinkyDungeonMapGet(x, y)) &&
                    !KinkyDungeonTilesGet(`${x},${y}`)?.Lock
                )
                    passable.add(`${x},${y}`);
            }
        const blocked = new Set(KDMapData.Entities.filter((e) => e.Enemy?.immobile).map(key));
        const reached = reachableCells(KDMapData.StartPosition, passable, blocked);
        cells = cells.filter((cell) => reached.has(key(cell)));
        for (const cell of cells) {
            KinkyDungeonMapSet(cell.x, cell.y, "0");
            if (KDMapData.TilesSkin) delete KDMapData.TilesSkin[key(cell)];
            if (KDMapData.TilesMemory) delete KDMapData.TilesMemory[key(cell)];
        }
        // Native MapSet only changes Grid. Population and later AI consume the
        // navigation map, which was already generated before placeNests runs.
        if (cells.length) {
            if (typeof KDPathCache !== "undefined") KDPathCache.clear();
            if (typeof KDPathCacheIgnoreLocks !== "undefined") KDPathCacheIgnoreLocks.clear();
            if (typeof KinkyDungeonGenNavMap === "function") KinkyDungeonGenNavMap();
        }
        return cells.length;
    }

    const MOD = "SpiderlingsInfestation";
    const FIELD = "SpiderlingsInfestation";
    const MIN_FLOOR = 3;
    const TARGET = 5;
    const QUIET_TURNS = 15;
    const GARRISON = 5;
    const NEARBY_RADIUS = 12;
    const MOBILE = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]);

    const texts = {
        KDMapMod_SpiderlingsInfestation: "Spiderling Infestation",
        KinkyDungeonMapModSpiderlingsInfestation:
            "Soft webs line the corners. Spiderlings step lightly along the threads, filling the room with delicate rustling.",
        KDEscapeMethod_SpiderlingsInfestation: "Destroy the marked nests",
        KDEscapeMethodDesc_SpiderlingsInfestation:
            "Soft threads fringe the nests first built here. Destroy these marked nests to continue downstairs.",
        SpiderlingsInfestationProgress: "Marked nests destroyed: CURRENT/5",
        SpiderlingsInfestationBlocked: "Some marked nests remain. You cannot take the stairs down yet. (CURRENT/5)",
        SpiderlingsInfestationComplete:
            "All marked nests are destroyed. Loose threads settle, and you can continue down the stairs. (5/5)",
    };

    function activeState(map = typeof KDMapData !== "undefined" ? KDMapData : null) {
        return map?.[FIELD]?.status === "active" ? map[FIELD] : null;
    }

    function wildSpider(enemy) {
        return (
            enemy?.hp > 0 &&
            MOBILE.has(enemy.Enemy?.name) &&
            KDGetFaction(enemy) !== "Player" &&
            !(typeof KDAllied === "function" && KDAllied(enemy)) &&
            !(typeof KDIsInParty === "function" && KDIsInParty(enemy)) &&
            !(typeof KDIsImprisoned === "function" && KDIsImprisoned(enemy))
        );
    }

    function seekPatrol(enemy, target, aiData = {}) {
        const state = activeState();
        if (
            !state ||
            !wildSpider(enemy) ||
            !target?.player ||
            enemy.Enemy.immobile ||
            enemy.IntentAction ||
            enemy.CurrentAction ||
            enemy.action ||
            enemy.leash ||
            enemy.goToDespawn ||
            enemy.Enemy.master ||
            (typeof KinkyDungeonIsDisabled === "function" && KinkyDungeonIsDisabled(enemy)) ||
            KDHelpless(enemy) ||
            KDIsImprisoned(enemy) ||
            aiData.canSensePlayer ||
            aiData.moveTowardPlayer ||
            api.SpinnerNPCCapture?.usesSource?.(enemy.id) ||
            api.NPCWrapping?.usesSource?.(enemy.id)
        )
            return false;
        const nests = KDMapData.Entities.filter((entity) => entity.hp > 0 && state.targetIds.includes(entity.id));
        if (!nests.length) return false;
        const nearestNest = Math.min(...nests.map((nest) => distance(enemy, nest)));
        const marker = enemy.SpiderlingsInfestationPatrol;
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
        if (marker && marker.lastPosition !== key(enemy)) {
            marker.lastPosition = key(enemy);
            marker.lastProgress = tick;
        }
        if (
            marker &&
            distance(enemy, marker.goal) > 1 &&
            tick - marker.lastProgress < 8 &&
            KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(marker.goal.x, marker.goal.y)) &&
            !KinkyDungeonTilesGet(key(marker.goal))?.Lock
        ) {
            enemy.gx = marker.goal.x;
            enemy.gy = marker.goal.y;
            return true;
        }
        if (!marker && nearestNest > 5) return false;
        const occupied = new Set(KDMapData.Entities.filter((entity) => entity.hp > 0 && entity !== enemy).map(key)),
            reserved = new Set(
                KDMapData.Entities.filter((entity) => entity !== enemy).flatMap((entity) =>
                    entity.SpiderlingsInfestationPatrol ? [key(entity.SpiderlingsInfestationPatrol.goal)] : [],
                ),
            ),
            goals = [];
        for (let x = Math.max(1, enemy.x - 14); x < Math.min(KDMapData.GridWidth - 1, enemy.x + 15); x++)
            for (let y = Math.max(1, enemy.y - 14); y < Math.min(KDMapData.GridHeight - 1, enemy.y + 15); y++) {
                const point = { x, y },
                    name = key(point),
                    tile = KinkyDungeonTilesGet(name);
                if (
                    !KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(x, y)) ||
                    tile?.OL ||
                    tile?.OffLimits ||
                    tile?.Lock ||
                    tile?.Type ||
                    occupied.has(name) ||
                    reserved.has(name) ||
                    distance(enemy, point) < 6 ||
                    nests.some((nest) => distance(nest, point) < 6)
                )
                    continue;
                goals.push(point);
            }
        const ordinal = state.patrolOrdinal || 0;
        for (let index = 0; index < goals.length; index++) {
            const goal = goals[(enemy.id * 17 + ordinal + index) % goals.length],
                route = KinkyDungeonFindPath(
                    enemy.x,
                    enemy.y,
                    goal.x,
                    goal.y,
                    true,
                    true,
                    false,
                    KinkyDungeonMovableTilesEnemy,
                    undefined,
                    undefined,
                    undefined,
                    enemy,
                    true,
                );
            if (!route?.length || route.length > 24) continue;
            state.patrolOrdinal = ordinal + 1;
            enemy.SpiderlingsInfestationPatrol = { goal: { ...goal }, lastPosition: key(enemy), lastProgress: tick };
            enemy.gx = goal.x;
            enemy.gy = goal.y;
            enemy.path = route;
            return true;
        }
        delete enemy.SpiderlingsInfestationPatrol;
        return false;
    }

    function retireQuietSpiders(_event, data, sampleOnly = false) {
        const state = activeState();
        if (!state || !(data?.delta > 0)) return;
        const entities = KDMapData.Entities;
        const nests = entities.filter((e) => e.hp > 0 && state.targetIds.includes(e.id));
        const anchors = (state.clearing ||= nests.map((e) => ({ x: e.x, y: e.y })));
        if (!anchors.length) return;
        const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) <= NEARBY_RADIUS;
        const spiders = entities.filter((e) => wildSpider(e) && anchors.some((p) => near(e, p)));
        // Only a capable, perceptible opponent keeps the garrison in combat.
        // Partial binding still counts; native helplessness does not. Recovery
        // is rechecked at both turn boundaries, just like a newly arrived enemy.
        const defenders = [...nests, ...spiders];
        const opponents = entities.filter(
            (e) =>
                e.hp > 0 &&
                !KDHelpless(e) &&
                !KDIsImprisoned(e) &&
                !(e.stun > 0) &&
                !(e.freeze > 0) &&
                !e.Enemy?.noAttack,
        );
        // Apply to the whole encounter, including nests: they do not use the
        // mobile spider's Cocoon dispersal AI but must share its peace state.
        if (typeof KinkyDungeonPlayerEntity !== "undefined" && !api.Webbing?.isCocoonPassive())
            opponents.push(KinkyDungeonPlayerEntity);
        const perceives = (actor, target) => {
            const radius = actor.blind && !actor.aware ? 1.5 : KDEnemyVisionRadius(actor);
            return KinkyDungeonCheckLOS(
                actor,
                target,
                Math.hypot(actor.x - target.x, actor.y - target.y),
                Math.min(NEARBY_RADIUS, radius),
                true,
                true,
            );
        };
        const threatened = defenders.some((e) =>
            opponents.some(
                (other) =>
                    e !== other &&
                    near(e, other) &&
                    (KDHostile(e, other) || (!other.player && KDHostile(other, e))) &&
                    (!other.player ||
                        typeof KinkyDungeonAggressive !== "function" ||
                        KinkyDungeonAggressive(e, other)) &&
                    (perceives(e, other) || (!other.player && perceives(other, e))),
            ),
        );
        if (sampleOnly) {
            state.threatThisTurn = threatened;
            return;
        }
        state.quietTurns =
            threatened || state.threatThisTurn ? 0 : Math.min(QUIET_TURNS, (state.quietTurns || 0) + data.delta);
        delete state.threatThisTurn;
        if (state.quietTurns < QUIET_TURNS || spiders.length <= GARRISON) return;
        // Keep the five closest to the original nest positions. Use non-kill native removal
        // for the rest: no death burst, loot, objective progress or quota refund.
        const range = (e) => Math.min(...anchors.map((p) => Math.hypot(e.x - p.x, e.y - p.y)));
        spiders.sort((a, b) => range(a) - range(b) || a.id - b.id);
        for (const enemy of spiders.slice(GARRISON)) KDRemoveEntity(enemy, false);
    }

    function progressText(blocked = false, compact = false) {
        const state = activeState();
        const name =
            state?.complete && !compact
                ? "SpiderlingsInfestationComplete"
                : blocked
                  ? "SpiderlingsInfestationBlocked"
                  : "SpiderlingsInfestationProgress";
        return TextGet(name).replace("CURRENT", String(state?.destroyedIds.length || 0));
    }

    function cancelInfestation(reason) {
        KDMapData[FIELD] = { status: "cancelled", reason };
        KDMapData.MapMod = "None";
        KDGameData.MapMod = "None";
        const slot = KDGameData.JourneyMap?.[`${KDGameData.JourneyX},${KDGameData.JourneyY}`];
        if (slot?.MapMod === MOD) {
            slot.MapMod = "None";
            if (slot.EscapeMethod === MOD) slot.EscapeMethod = "Key";
        }
        if (KDMapData.EscapeMethod === MOD) KDMapData.EscapeMethod = "Key";
    }

    function repairEarlyJourneyPreviews() {
        if (typeof KDGameData === "undefined") return;
        for (const slot of Object.values(KDGameData.JourneyMap || {})) {
            if (slot.MapMod !== MOD || slot.visited || !(slot.y < MIN_FLOOR)) continue;
            slot.MapMod = "None";
            if (slot.EscapeMethod === MOD) slot.EscapeMethod = "Key";
        }
    }

    function registerJourneySelection() {
        repairEarlyJourneyPreviews();
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", MOD, repairEarlyJourneyPreviews);
    }

    function placeNests(spawnPoints, floor, room = {}) {
        if (KDMapData.MapMod !== MOD || KDMapData[FIELD]) return !!activeState();
        if (
            floor < MIN_FLOOR ||
            KDMapData.RoomType ||
            !api.EncounterRules.isEligibleOrdinaryMap(room) ||
            room.nokeys ||
            room.escapeMethod
        ) {
            cancelInfestation("ineligible");
            return false;
        }
        const passable = new Set();
        const candidates = [];
        const start = KDMapData.StartPosition;
        const exits = [KDMapData.EndPosition, ...Object.values(KDMapData.ShortcutPositions || {})].filter(Boolean);
        const occupied = new Set(KDMapData.Entities.map(key));
        const stationary = new Set(KDMapData.Entities.filter((entity) => entity.Enemy?.immobile).map(key));
        for (let x = 1; x < KDMapData.GridWidth - 1; x += 1) {
            for (let y = 1; y < KDMapData.GridHeight - 1; y += 1) {
                const point = { x, y };
                const tile = KinkyDungeonMapGet(x, y);
                const meta = KinkyDungeonTilesGet(key(point));
                if (!KinkyDungeonMovableTiles.includes(tile) || meta?.Lock || stationary.has(key(point))) continue;
                passable.add(key(point));
                if (
                    tile !== "0" ||
                    meta?.OL ||
                    occupied.has(key(point)) ||
                    distance(start, point) < 5 ||
                    distance(KinkyDungeonPlayerEntity, point) < 2 ||
                    exits.some((exit) => distance(exit, point) < 2) ||
                    spawnPoints.some((spawn) => distance(spawn, point) < 2)
                )
                    continue;
                candidates.push(point);
            }
        }
        const requestedGroupSizes = selectNestDistribution(floor, KDRandom);
        let groupSizes = requestedGroupSizes,
            plan = planGroupedNestPlacement({ start, passable, candidates, groupSizes, random: KDRandom });
        // Terrain can reject a sampled shape. Preserve all five objectives with a legal alternate distribution.
        for (const sizes of [[2, 2, 1], [2, 3], [5]]) {
            if (plan) break;
            groupSizes = sizes;
            plan = planGroupedNestPlacement({ start, passable, candidates, groupSizes, random: KDRandom });
        }
        if (!plan || !KinkyDungeonGetEnemyByName("NestEntrance") || KDMapData.Entities.length + TARGET > 300) {
            cancelInfestation("insufficient-space");
            return false;
        }
        const created = [];
        for (const point of plan) {
            const batch = KinkyDungeonSummonEnemy(
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
            created.push(...(batch || []));
            if (batch?.length !== 1 || batch[0].x !== point.x || batch[0].y !== point.y) {
                for (const entity of created) KDRemoveEntity(entity, false, false, true);
                cancelInfestation("creation-failed");
                return false;
            }
        }
        for (const entity of created) {
            KinkyDungeonSetEnemyFlag(entity, "no_pers_wander", -1);
            KinkyDungeonSetEnemyFlag(entity, "questtarget", -1);
        }
        let offset = 0;
        const groups = groupSizes.map((size) => {
            const group = plan.slice(offset, offset + size);
            offset += size;
            return group;
        });
        KDMapData[FIELD] = {
            status: "active",
            target: TARGET,
            targetIds: created.map((entity) => entity.id),
            destroyedIds: [],
            complete: false,
            distributionVersion: 1,
            requestedGroupSizes,
            groupSizes,
            nestGroups: groups.map((group) =>
                group.map((point) => created.find((entity) => key(entity) === key(point)).id),
            ),
            clearing: plan.map((point) => ({ ...point })),
            clearedTiles: openNestClearing(groups, spawnPoints),
        };
        return true;
    }

    const MAID_FINISHER = "SpiderlingsTaskNestMaidFinisher";
    const ESCAPE_DEATH = "SpiderlingsTaskNestEscape";
    function isObjectiveNest(map, enemy) {
        const state = activeState(map);
        return !!(
            state &&
            enemy?.Enemy?.name === "NestEntrance" &&
            state.targetIds.includes(enemy.id) &&
            !state.destroyedIds.includes(enemy.id)
        );
    }

    function recordTaskNestDamage(_event, data) {
        const nest = data.enemy;
        if (!isObjectiveNest(KDMapData, nest)) return;
        // Record the lethal HP crossing, never the last nonlethal attacker or a
        // later hit against an already dead nest. Native bullet faction survives
        // when its shooter has already left the entity list.
        if (data.dmgDealt > 0 && nest.hp + data.dmgDealt > 0) {
            const faction = data.attacker ? KDGetFaction(data.attacker) : data.faction;
            if (nest.hp <= 0 && faction === "Maidforce") nest[MAID_FINISHER] = true;
            else delete nest[MAID_FINISHER];
        } else if (nest.hp > 0) delete nest[MAID_FINISHER];
    }

    function evacuateTaskNest(enemy, _entry, map) {
        if (map !== KDMapData || !enemy[MAID_FINISHER] || !isObjectiveNest(map, enemy)) return;
        delete enemy[MAID_FINISHER];
        // A separate death allowance, attempted before the ordinary burst.
        // The shared summon wrapper still enforces the map's mobile spider cap.
        for (const radius of [2.5, 5, 7.5]) {
            const born = KinkyDungeonSummonEnemy(
                enemy.x,
                enemy.y,
                "Tunneler",
                1,
                radius,
                true,
                undefined,
                false,
                false,
                KDGetFaction(enemy),
                true,
                undefined,
                true,
                false,
            );
            if (born?.length) break;
        }
    }

    // Count only successful native destruction, after removeEnemy cancellation
    // and the existing death burst. No attribution restriction or missing-ID polling.
    function recordDestruction(map, enemy) {
        const state = activeState(map);
        if (
            !state ||
            state.complete ||
            enemy.Enemy?.name !== "NestEntrance" ||
            !state.targetIds.includes(enemy.id) ||
            state.destroyedIds.includes(enemy.id)
        )
            return;
        state.destroyedIds.push(enemy.id);
        state.complete = state.destroyedIds.length >= state.target;
        if (map === KDMapData)
            KinkyDungeonSendActionMessage(
                10,
                progressText(),
                state.complete ? "#88ff88" : "#ff88ff",
                state.complete ? 8 : 3,
            );
    }

    function register() {
        if (
            typeof KDMapMods === "undefined" ||
            typeof KinkyDungeonEscapeTypes === "undefined" ||
            typeof KinkyDungeonPlaceEnemies !== "function" ||
            typeof KDRemoveEntity !== "function"
        )
            return;
        for (const [name, text] of Object.entries(texts)) addTextKey(name, text);
        KDAddEvent(KDEventMapGeneric, "tick", MOD, (event, data) => retireQuietSpiders(event, data, true));
        KDAddEvent(KDEventMapGeneric, "tickAfter", MOD, retireQuietSpiders);
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", MOD, recordTaskNestDamage);
        if (typeof KDOndeath !== "undefined") KDOndeath[ESCAPE_DEATH] = evacuateTaskNest;
        // FloorSelection draws this only after the native primary faction is known.
        KDMapMods[MOD] = {
            name: MOD,
            roomType: "",
            altRoom: "",
            get weight() {
                return api.FloorSelection.weight(MOD);
            },
            filter: (slot) => (slot?.y >= MIN_FLOOR && !slot.RoomType && slot.Faction ? 1 : 0),
            tags: [],
            bonusTags: {},
            escapeMethod: MOD,
        };
        registerJourneySelection();
        KinkyDungeonEscapeTypes[MOD] = {
            selectValid: false,
            filterRandom: () => 0,
            check: () => !activeState() || activeState().complete,
            minimaptext: () => progressText(false, true),
            doortext: () => progressText(true),
        };
        KDAddEvent(KDEventMapGeneric, "calcEscapeMethod", MOD, (_event, data) => {
            if (activeState()) data.escapeMethod = MOD;
        });
        KDAddEvent(KDEventMapGeneric, "beforeStairCancel", MOD, (_event, data) => {
            if (activeState() && !activeState().complete && (data.toTile === "s" || data.AdvanceAmount > 0)) {
                data.cancelevent = MOD;
            }
        });
        KDCancelEvents[MOD] = () => KinkyDungeonSendActionMessage(10, progressText(true), "#ff88ff", 3);
        // Rooms with enemies:false never invoke population; clear their modifier too.
        KDAddEvent(KDEventMapGeneric, "postMapgen", MOD, () => {
            if (KDMapData.MapMod === MOD && !KDMapData[FIELD]) cancelInfestation("ineligible");
        });
        if (!KinkyDungeonPlaceEnemies.SpiderlingsInfestationWrapped) {
            const original = KinkyDungeonPlaceEnemies;
            KinkyDungeonPlaceEnemies = function (...args) {
                const room = args[7] || {};
                placeNests(args[0], args[4], room);
                return original.apply(this, args);
            };
            KinkyDungeonPlaceEnemies.SpiderlingsInfestationWrapped = true;
        }
        if (!KDRemoveEntity.SpiderlingsInfestationWrapped) {
            const original = KDRemoveEntity;
            KDRemoveEntity = function (enemy, kill, capture, noEvent, forceIndex, mapData) {
                const map = mapData || KDMapData;
                const wasPresent = !!activeState(map) && map.Entities.includes(enemy);
                const escape = kill && wasPresent && enemy[MAID_FINISHER] && isObjectiveNest(map, enemy);
                const previousDeath = enemy.ondeath;
                if (escape) enemy.ondeath = [{ type: ESCAPE_DEATH }, ...(previousDeath || [])];
                let result;
                try {
                    result = original.apply(this, arguments);
                } finally {
                    if (escape) {
                        if (previousDeath === undefined) delete enemy.ondeath;
                        else enemy.ondeath = previousDeath;
                    }
                }
                if (result && kill && wasPresent && !map.Entities.some((entity) => entity.id === enemy.id)) {
                    recordDestruction(map, enemy);
                }
                return result;
            };
            KDRemoveEntity.SpiderlingsInfestationWrapped = true;
        }
    }

    Object.assign(infestation, {
        planNestPlacement,
        planGroupedNestPlacement,
        nestDistribution,
        selectNestDistribution,
        seekPatrol,
        planNestClearing,
        reachableCells,
        activeState,
        register,
    });
    register();
    if (typeof module !== "undefined" && module.exports) module.exports = infestation;
})();
