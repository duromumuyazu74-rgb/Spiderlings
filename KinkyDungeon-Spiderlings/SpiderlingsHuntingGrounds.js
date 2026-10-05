"use strict";

(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const infestation = (api.HuntingGrounds = api.HuntingGrounds || {});
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

    function planIndependentNestPlacement(options) {
        return planNestPlacement({ ...options, count: 3, minimumDistance: 9 });
    }

    // Open ordinary walls through each nest's building area.
    // Interactive tiles, authored off-limits areas and the map border retain
    // their native identity; only plain walls/debris become ordinary floor.
    function planNestClearing(plan, options) {
        const cells = [];
        if (!plan?.length) return cells;
        const radius = options.radius ?? 1;
        const minX = Math.max(1, Math.min(...plan.map((p) => p.x)) - radius);
        const maxX = Math.min(options.width - 2, Math.max(...plan.map((p) => p.x)) + radius);
        const minY = Math.max(1, Math.min(...plan.map((p) => p.y)) - radius);
        const maxY = Math.min(options.height - 2, Math.max(...plan.map((p) => p.y)) + radius);
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
            radius: 3,
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

    const MOD = "SpiderlingsHuntingGrounds";
    const FIELD = "SpiderlingsHuntingGrounds";
    const MIN_FLOOR = 5;
    const TARGET = 3;
    const MOBILE = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]);
    const MOBILE_TAG = "SpiderlingsFloorMobile";
    const BATCH_TAG = "SpiderlingsFloorBatch";
    const POPULATION_TAG = MOD + "Population";
    const POPULATION_MULTIPLIERS = { Spider: 1, Maid: 3, Dressmaker: 0.5, Nurse: 1 };
    const INFESTATION_MULTIPLIERS = { Spider: 9, Maid: 0.35, Dressmaker: 0.2, Nurse: 0.2, Other: 0.1 };
    const NEST_PARENT_ID = "SpiderlingsNestParentID";
    const POPULATION_TAGS = ["spiderlings", "maid", "dressmaker"];
    const PRESET_TAG = MOD + "Preset";
    let selectingPopulation = false;
    const populationBonuses = () =>
        Object.fromEntries(
            Object.entries(KDMapData.MapMod === MOD ? INFESTATION_MULTIPLIERS : POPULATION_MULTIPLIERS).map(
                ([group, mult]) => [MOD + group, { bonus: 0, mult }],
            ),
        );

    function populationGroup(enemy) {
        if (["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings", "NestEntrance"].includes(enemy?.name))
            return "Spider";
        if (enemy?.faction === "Maidforce" && enemy.tags?.human) return "Maid";
        if (enemy?.name === "Nurse" && enemy.faction === "Dressmaker") return "Nurse";
        if (enemy?.faction === "Dressmaker" || enemy?.applyFaction === "Dressmaker") return "Dressmaker";
        return null;
    }

    function mobileCombatant(entity, includeShops = false) {
        const enemy = entity?.Enemy;
        return !!(
            entity.hp > 0 &&
            enemy &&
            !enemy.immobile &&
            !enemy.noAttack &&
            !enemy.tags?.scenery &&
            !api.SpinnerNativeField?.isOwnedProxy?.(entity) &&
            !["Natural", "Door", "Prisoner", "Furniture", "Player"].includes(KDGetFaction(entity)) &&
            (includeShops ||
                !(typeof KDEnemyHasFlag === "function" ? KDEnemyHasFlag(entity, "Shop") : entity.flags?.Shop)) &&
            !(typeof KDIsInParty === "function" && KDIsInParty(entity)) &&
            !(typeof KDIsImprisoned === "function" && KDIsImprisoned(entity)) &&
            !(typeof KDAllied === "function" && KDAllied(entity))
        );
    }

    function independentCombatant(entity) {
        return mobileCombatant(entity) && !entity.Enemy.master;
    }

    function populationCounts() {
        const actors = KDMapData.Entities.filter((entity) => mobileCombatant(entity, true) && !entity.Enemy.master);
        const spiders = actors.filter((entity) => MOBILE.has(entity.Enemy.name)).length;
        return { spiders, rivals: actors.length - spiders, total: actors.length };
    }

    function combatantCounts(hostileOnly) {
        const actors = KDMapData.Entities.filter(
            (entity) =>
                mobileCombatant(entity, !hostileOnly) &&
                (!hostileOnly || typeof KDHostile !== "function" || KDHostile(entity)),
        );
        return { spiders: actors.filter((entity) => MOBILE.has(entity.Enemy.name)).length, total: actors.length };
    }

    function protectedSpawn(point) {
        return !!(
            point.forceIndex !== undefined ||
            point.keys ||
            point.noPlay ||
            point.prisoner ||
            point.quest ||
            [...(point.required || []), ...(point.tags || [])].some(
                (tag) =>
                    ["shop", "prisoner", "jail", "quest", "jailer"].includes(tag) ||
                    (tag === "boss" && KDMapData.MapMod !== MOD),
            )
        );
    }

    function populationSpawnPoints(points) {
        return points
            .filter(
                (point) => protectedSpawn(point) || !api.HuntingGroundsLayout?.isPopulationReserved?.(KDMapData, point),
            )
            .map((point) => {
                if (!protectedSpawn(point)) return { ...point, faction: undefined };
                const maidGuard =
                    KDMapData.MapMod === MOD &&
                    point.keys &&
                    (point.faction === "Maidforce" ||
                        [...(point.required || []), ...(point.tags || [])].includes("maid"));
                return {
                    ...point,
                    required: maidGuard ? [...(point.required || []), MOD + "EliteMaid"] : point.required,
                    ftags: [...(point.ftags || []).filter((tag) => !maidGuard || tag !== "elite"), PRESET_TAG],
                };
            });
    }

    function choosePopulation(original, receiver, args) {
        const plan = KDMapData.SpiderlingsPopulationPlan;
        if (!plan || args[7]?.includes(PRESET_TAG)) return original.apply(receiver, args);
        if (plan.kind === MOD) {
            const request = [...args];
            request[7] = [
                ...(args[7] || []).filter((tag) => !["minor", "elite"].includes(tag)),
                BATCH_TAG,
                "peaceful",
                "quest",
                "boss",
                "miniboss",
            ];
            request[5] = { ...(args[5] || {}), requireHostile: "" };
            const slots = api.availableSpiderlingSlots();
            if (slots > 0) {
                request[0] = [...(args[0] || []), "spiderlings"];
                request[4] = [MOBILE_TAG];
                return original.apply(receiver, request);
            }
            // Initial prey are authored once in separated legal cells after native placement.
            // Wandering arrivals can only replace missing members of that same finite ecology.
            if (selectingPopulation === "initial") return undefined;
            const counts = { Maid: 0, Dressmaker: 0, Nurse: 0 };
            for (const entity of KDMapData.Entities.filter(
                (entity) => mobileCombatant(entity, true) && !entity.Enemy.master,
            )) {
                const group = populationGroup(entity.Enemy);
                if (Object.hasOwn(counts, group)) counts[group]++;
            }
            const group = Object.keys(counts).find((group) => counts[group] < (plan.preyQuota?.[group] || 0));
            if (!group) return undefined;
            request[4] = [MOD + (group === "Maid" ? "EliteMaid" : group === "Dressmaker" ? "NativeDressmaker" : group)];
            request[0] = [...(args[0] || []), "maid", "dressmaker"];
            const chosen = original.apply(receiver, request);
            return chosen && { ...chosen, clusterWith: undefined, cohesion: 0.01, cohesionRange: 1 };
        }
        const counts = combatantCounts(plan.kind === MOD);
        if (counts.total >= plan.mobileBudget) return undefined;
        const needSpider = counts.spiders / (counts.total + 1) < plan.targetRatio;
        if (needSpider) {
            if (typeof api.availableSpiderlingSlots === "function" && api.availableSpiderlingSlots() <= 0)
                return undefined;
            // The native selector still enforces floor, biome, terrain and global cap.
            // Rank boxes and generic template tags do not select the floor's composition.
            const request = [...args];
            request[0] = [...(args[0] || []), "spiderlings"];
            request[4] = [MOBILE_TAG];
            request[7] = (args[7] || []).filter((tag) => !["minor", "elite"].includes(tag));
            return original.apply(receiver, request);
        }
        const request = [...args];
        request[4] = args[4]?.filter((tag) => !["boss", "miniboss", "elite", "minor"].includes(tag));
        request[7] = [...(args[7] || []), MOBILE_TAG, BATCH_TAG];
        if (plan.kind === MOD) request[5] = { ...(args[5] || {}), requireHostile: "Player" };
        const chosen = original.apply(receiver, request);
        return chosen && { ...chosen, clusterWith: undefined, cohesion: 0.01, cohesionRange: 1 };
    }

    function usesMaidPopulation(room = {}) {
        return (
            KDMapData.MapFaction === "Maidforce" &&
            KDMapData.MapMod !== "SpiderlingsInfestation" &&
            !KDMapData.RoomType &&
            api.EncounterRules.isEligibleOrdinaryMap(room)
        );
    }

    function registerPopulation() {
        if (typeof KinkyDungeonEnemies === "undefined" || typeof KinkyDungeonGetEnemy !== "function") return;
        for (const enemy of KinkyDungeonEnemies) {
            const group = populationGroup(enemy);
            if (group) Object.assign(enemy.tags, { [POPULATION_TAG]: true, [MOD + group]: true });
            else enemy.tags[MOD + "Other"] = true;
            if (MOBILE.has(enemy.name)) enemy.tags[MOBILE_TAG] = true;
            if (group === "Maid" && enemy.tags.elite) enemy.tags[MOD + "EliteMaid"] = true;
            if (enemy.name === "Dressmaker") enemy.tags[MOD + "NativeDressmaker"] = true;
            if (enemy.master || enemy.summon?.some((entry) => entry.count > 0)) enemy.tags[BATCH_TAG] = true;
        }
        if (KinkyDungeonGetEnemy.SpiderlingsHuntingGroundsWrapped) return;
        const original = KinkyDungeonGetEnemy;
        KinkyDungeonGetEnemy = function (...args) {
            if (selectingPopulation && KDMapData.SpiderlingsPopulationPlan)
                return choosePopulation(original, this, args);
            if (selectingPopulation && !args[7]?.includes(PRESET_TAG)) {
                // Native selection owns level, tile, rank and cap eligibility.
                // A required owned tag also survives its minimum-weight fallback.
                args[0] = [...new Set([...(args[0] || []), ...POPULATION_TAGS])];
                if (KDMapData.MapMod !== MOD) args[4] = [...new Set([...(args[4] || []), POPULATION_TAG])];
                args[6] = { ...(args[6] || {}), ...populationBonuses() };
                // Native initial population spends the neutral allowance on preset
                // NPCs too, then excludes default-neutral maids/Dressmaker entirely.
                // This floor's ecology includes them regardless of player hostility;
                // keep the population budget and all other selection constraints.
                if (selectingPopulation === "initial" && args[5]?.requireHostile === "Player") {
                    args[5] = { ...args[5], requireHostile: "" };
                }
            }
            const selected = original.apply(this, args);
            if (
                selected &&
                selectingPopulation === "initial" &&
                KDMapData.MapMod === MOD &&
                !args[7]?.includes(PRESET_TAG) &&
                populationGroup(selected) !== "Spider"
            ) {
                // Ordinary prey must not start native same-faction clusters.
                // Return a floor-local definition; authored actors keep theirs.
                return { ...selected, clusterWith: undefined, cohesion: 0.01, cohesionRange: 1 };
            }
            return selected;
        };
        KinkyDungeonGetEnemy.SpiderlingsHuntingGroundsWrapped = true;
    }

    const texts = {
        KDMapMod_SpiderlingsHuntingGrounds: "Spiderling Hunting Grounds",
        KinkyDungeonMapModSpiderlingsHuntingGrounds:
            "Webs spread across the floor. Spiderlings roam the passages between their nests.",
        KDEscapeMethod_SpiderlingsHuntingGrounds: "Destroy the marked nests",
        KDEscapeMethodDesc_SpiderlingsHuntingGrounds:
            "Destroy original target nests to descend (red minimap quest markers). Later nests do not count.",
        SpiderlingsHuntingGroundsProgress: "Marked nests destroyed: CURRENT/TARGET",
        SpiderlingsHuntingGroundsBlocked:
            "Destroy original target nests to descend: red minimap quest markers. (CURRENT/TARGET)",
        SpiderlingsHuntingGroundsComplete:
            "The last marked nest is destroyed. You can now go downstairs. (TARGET/TARGET)",
    };

    function activeState(map = typeof KDMapData !== "undefined" ? KDMapData : null) {
        return map?.[FIELD]?.status === "active" ? map[FIELD] : null;
    }

    function progressText(blocked = false, compact = false) {
        const state = activeState();
        const name =
            state?.complete && !compact
                ? "SpiderlingsHuntingGroundsComplete"
                : blocked
                  ? "SpiderlingsHuntingGroundsBlocked"
                  : "SpiderlingsHuntingGroundsProgress";
        return TextGet(name)
            .replace("CURRENT", String(state?.destroyedIds.length || 0))
            .replaceAll("TARGET", String(state?.target || TARGET));
    }

    function cancelInfestation(reason) {
        // A failed nest layout removes the escape objective, not the chosen
        // spider ecology. Otherwise the native Maidforce pool fills the floor.
        const plan = KDMapData.SpiderlingsPopulationPlan;
        if (reason === "insufficient-space" && plan?.kind === MOD) plan.layoutFallback = true;
        else delete KDMapData.SpiderlingsPopulationPlan;
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

    function migrateHuntingGrounds(map, slot) {
        // test.32 saved the three-nest floor under the old Infestation ID.
        // The garrison marker leaves genuine five-nest saves unchanged.
        if (map?.MapMod === "SpiderlingsInfestation" && map.SpiderlingsInfestation?.garrisonVersion === 2) {
            map[FIELD] = map.SpiderlingsInfestation;
            delete map.SpiderlingsInfestation;
            map.MapMod = MOD;
            if (map.EscapeMethod === "SpiderlingsInfestation") map.EscapeMethod = MOD;
        }
        if (map?.MapMod !== MOD || map[FIELD]?.garrisonVersion !== 2) return false;
        if (slot?.MapMod === "SpiderlingsInfestation") {
            slot.MapMod = MOD;
            if (slot.EscapeMethod === "SpiderlingsInfestation") slot.EscapeMethod = MOD;
        }
        return true;
    }

    function cancelCreatedNests(created, reason, error) {
        const failures = error ? [error] : [];
        try {
            for (const entity of created) {
                if (!KDMapData.Entities.includes(entity)) continue;
                try {
                    KDRemoveEntity(entity, false, false, true);
                    if (KDMapData.Entities.includes(entity))
                        throw new Error("Spiderlings objective nest removal was refused");
                } catch (failure) {
                    failures.push(failure);
                }
            }
        } finally {
            cancelInfestation(reason);
        }
        if (failures.length > (error ? 1 : 0))
            throw new AggregateError(failures, "Spiderlings objective nest cleanup failed", {
                cause: error?.cause || error || failures[0],
            });
        if (error) throw error;
        return false;
    }

    function repairEarlyJourneyPreviews() {
        if (typeof KDGameData === "undefined") return;
        // Native room returns restore KDWorldMap without afterLoadGame or
        // postMapgen. Migrate cached rooms now, including when loading in a shop.
        if (typeof KDWorldMap !== "undefined")
            for (const location of Object.values(KDWorldMap)) {
                const slot = KDGameData.JourneyMap?.[`${location.jx},${location.jy}`];
                for (const map of Object.values(location.data || {})) migrateHuntingGrounds(map, slot);
            }
        if (
            typeof KDMapData !== "undefined" &&
            migrateHuntingGrounds(
                KDMapData,
                KDGameData.JourneyMap?.[`${KDGameData.JourneyX},${KDGameData.JourneyY}`],
            ) &&
            KDGameData.MapMod === "SpiderlingsInfestation"
        )
            KDGameData.MapMod = MOD;
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
        const populationPlan = api.Population.prepareFloor(MOD);
        if (populationPlan.cap < populationPlan.requiredMembers) {
            cancelInfestation("population-budget");
            return false;
        }
        api.HuntingGroundsLayout?.release(KDMapData);
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
        const earlyLayout = api.HuntingGroundsLayout?.earlyPlan(KDMapData);
        const encounter =
            earlyLayout && !earlyLayout.failed
                ? api.HuntingGroundsLayout.planEncounter({
                      width: KDMapData.GridWidth,
                      height: KDMapData.GridHeight,
                      tile: KinkyDungeonMapGet,
                      meta: (x, y) => KinkyDungeonTilesGet(`${x},${y}`),
                      start,
                      exits,
                      spawnPoints,
                      entities: KDMapData.Entities,
                      movable: KinkyDungeonMovableTiles,
                      anchors: earlyLayout.anchors,
                      huntingSites: earlyLayout.huntingSites,
                      largeHuntingSite: earlyLayout.largeHuntingSite,
                      acceptNest: (point, reached) =>
                          !!api.Population.planCrews({ nests: [point], passable, occupied, spawnPoints, reached }),
                      random: KDRandom,
                  })
                : null;
        const plan = earlyLayout
            ? encounter?.nests
            : planIndependentNestPlacement({ start, passable, candidates, random: KDRandom });
        const guards = plan && api.Population.planCrews({ nests: plan, passable, occupied, spawnPoints });
        if (
            !guards ||
            !KinkyDungeonGetEnemyByName("NestEntrance") ||
            KDMapData.Entities.length + TARGET + populationPlan.requiredMembers > 300
        ) {
            cancelInfestation("insufficient-space");
            return false;
        }
        const created = [];
        const nests = [];
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
                return cancelCreatedNests(created, "creation-failed");
            }
            nests.push(batch[0]);
        }
        let population;
        try {
            population = api.Population.seedCrews({
                kind: MOD,
                nests,
                spawnPoints,
                positions: guards,
                passable,
                sites: encounter?.sites || [],
            });
        } catch (error) {
            return cancelCreatedNests(created, "garrison-failed", error);
        }
        if (!population.ok) return cancelCreatedNests(created, "garrison-failed");
        for (const entity of nests) {
            KinkyDungeonSetEnemyFlag(entity, "no_pers_wander", -1);
            KinkyDungeonSetEnemyFlag(entity, "questtarget", -1);
        }
        KDMapData[FIELD] = {
            status: "active",
            target: TARGET,
            targetIds: nests.map((entity) => entity.id),
            destroyedIds: [],
            complete: false,
            garrisonVersion: 3,
            coreIds: population.coreIds,
            patrolIds: population.patrolIds,
            fieldIds: population.fieldIds,
            fieldPreset: {
                status: "pending",
                maxFields: 3,
                preferredSites: encounter?.sites || earlyLayout?.huntingSites || [],
                protectedPoints: spawnPoints.filter(protectedSpawn).map((point) => ({ x: point.x, y: point.y })),
            },
            clearing: plan.map((point) => ({ ...point })),
            layout: encounter
                ? {
                      ...encounter.metrics,
                      sites: encounter.sites,
                      largeHuntingSite: encounter.largeHuntingSite,
                      opened: earlyLayout.opened,
                      attempts: earlyLayout.attempts,
                      retries: earlyLayout.attempts - 1,
                      fallback: !!earlyLayout.fallback,
                      relocatedShrines: earlyLayout.relocatedShrines || 0,
                      relocatedChargers: earlyLayout.relocatedChargers || 0,
                  }
                : undefined,
            clearedTiles: earlyLayout
                ? 0
                : openNestClearing(
                      plan.map((point) => [point]),
                      spawnPoints,
                  ),
        };
        for (const site of encounter?.sites || [])
            api.HuntingGroundsLayout?.reservePopulationBoundary(KDMapData, site, site.radius || 2);
        api.HuntingGroundsLayout?.reservePopulationBoundary(KDMapData, encounter?.largeHuntingSite);
        return true;
    }

    const MAID_FINISHER = "SpiderlingsTaskNestMaidFinisher";
    const ESCAPE_DEATH = "SpiderlingsHuntingGroundsTaskNestEscape";
    const NEST_ATTACKER = "SpiderlingsTaskNestAttacker";
    const DEFENDER_TARGET = "SpiderlingsTaskNestDefenderTarget";
    const DEFENSE_SEARCH = "SpiderlingsTaskNestSearch";
    const DEFENSE_TURNS = 4;
    function isObjectiveNest(map, enemy) {
        const state = activeState(map) || api.Infestation?.activeState?.(map);
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
        const attacker =
            data.attacker ||
            KDMapData.Entities.find((entity) => entity.id === data.bullet?.bullet?.source && entity.hp > 0);
        if (
            data.dmgDealt > 0 &&
            nest.hp > 0 &&
            attacker?.id !== undefined &&
            !attacker.player &&
            (KDHostile(nest, attacker) || KDHostile(attacker, nest))
        )
            nest[NEST_ATTACKER] = {
                id: attacker.id,
                x: attacker.x,
                y: attacker.y,
                tick: KinkyDungeonCurrentTick,
            };
        // Record the lethal HP crossing, never the last nonlethal attacker or a
        // later hit against an already dead nest. Native bullet faction survives
        // when its shooter has already left the entity list.
        if (data.dmgDealt > 0 && nest.hp + data.dmgDealt > 0) {
            const faction = data.attacker ? KDGetFaction(data.attacker) : data.faction;
            if (nest.hp <= 0 && faction === "Maidforce") nest[MAID_FINISHER] = true;
            else delete nest[MAID_FINISHER];
        } else if (nest.hp > 0) delete nest[MAID_FINISHER];
    }

    let huntingTurn;

    function crewContact(enemy) {
        const state = activeState();
        if (!state || !MOBILE.has(enemy?.Enemy?.name)) return undefined;
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
        if (
            huntingTurn?.map !== KDMapData ||
            huntingTurn.tick !== tick ||
            huntingTurn.count !== KDMapData.Entities.length
        ) {
            const actors = KDMapData.Entities.filter(
                (actor) =>
                    actor.hp > 0 &&
                    MOBILE.has(actor.Enemy?.name) &&
                    KDGetFaction(actor) !== "Player" &&
                    !(typeof KDAllied === "function" && KDAllied(actor)) &&
                    !(typeof KDIsInParty === "function" && KDIsInParty(actor)) &&
                    !(typeof KDIsImprisoned === "function" && KDIsImprisoned(actor)),
            ).sort((a, b) => a.id - b.id);
            const groups = new Map(),
                byActor = new Map();
            for (const actor of actors) {
                const identity =
                    actor[NEST_PARENT_ID] !== undefined ? `nest:${actor[NEST_PARENT_ID]}` : actor.SpiderlingsHuntCrewID;
                if (!identity) continue;
                if (!groups.has(identity)) groups.set(identity, []);
                groups.get(identity).push(actor);
                byActor.set(actor.id, identity);
            }
            for (const actor of actors.filter((member) => !byActor.has(member.id))) {
                const neighbor = actors
                    .filter((member) => byActor.has(member.id) && distance(actor, member) <= 8)
                    .sort((a, b) => distance(actor, a) - distance(actor, b) || a.id - b.id)[0];
                const identity = neighbor ? byActor.get(neighbor.id) : `roam:${actor.id}`;
                if (!groups.has(identity)) groups.set(identity, []);
                groups.get(identity).push(actor);
                byActor.set(actor.id, identity);
            }
            const prey = KDMapData.Entities.filter(
                (target) =>
                    independentCombatant(target) &&
                    !MOBILE.has(target.Enemy.name) &&
                    !(typeof KDHelpless === "function" && KDHelpless(target)),
            );
            const contacts = (state.crewContacts ||= {}),
                claims = new Map();
            for (const identity of Object.keys(contacts))
                if (
                    !groups.has(identity) ||
                    tick < contacts[identity].tick ||
                    tick - contacts[identity].tick >= 4 ||
                    !prey.some((target) => target.id === contacts[identity].targetId)
                )
                    delete contacts[identity];
            for (const [identity, members] of groups) {
                const seen = prey.filter((target) =>
                    members.some(
                        (member) =>
                            !(typeof KinkyDungeonIsDisabled === "function" && KinkyDungeonIsDisabled(member)) &&
                            !(typeof KDHelpless === "function" && KDHelpless(member)) &&
                            KDHostile(member, target) &&
                            perceives(member, target),
                    ),
                );
                const prior = contacts[identity];
                const chosen =
                    seen.find((target) => target.id === prior?.targetId) ||
                    seen.sort(
                        (a, b) =>
                            (claims.get(a.id) || 0) - (claims.get(b.id) || 0) ||
                            members.reduce((sum, member) => sum + distance(member, a) - distance(member, b), 0) ||
                            a.id - b.id,
                    )[0];
                if (chosen) contacts[identity] = { targetId: chosen.id, x: chosen.x, y: chosen.y, tick };
                const current = contacts[identity];
                if (current) claims.set(current.targetId, (claims.get(current.targetId) || 0) + 1);
            }
            huntingTurn = { map: KDMapData, tick, count: KDMapData.Entities.length, byActor };
        }
        const contact = state.crewContacts?.[huntingTurn.byActor.get(enemy.id)];
        const target = contact && KDMapData.Entities.find((candidate) => candidate.id === contact.targetId);
        return target?.hp > 0 && KDHostile(enemy, target) && !(typeof KDHelpless === "function" && KDHelpless(target))
            ? contact
            : undefined;
    }

    function resolveNestDefenderTarget(enemy, nativeTarget, delta) {
        if (delta !== undefined && !(delta > 0)) return nativeTarget;
        delete enemy?.[DEFENDER_TARGET];
        delete enemy?.[DEFENSE_SEARCH];
        const state = activeState() || api.Infestation?.activeState?.();
        if (
            !state ||
            enemy?.hp <= 0 ||
            (!enemy?.SpiderlingsNestParentID && !enemy?.Enemy?.tags?.spiderlings) ||
            enemy?.Enemy?.name === "NestEntrance"
        )
            return nativeTarget;
        let chosen;
        let nearest = Infinity;
        for (const nest of KDMapData.Entities) {
            if (!state.targetIds.includes(nest.id) || nest.hp <= 0 || !nest[NEST_ATTACKER]) continue;
            const alert = nest[NEST_ATTACKER];
            if (KinkyDungeonCurrentTick < alert.tick || KinkyDungeonCurrentTick - alert.tick > DEFENSE_TURNS) continue;
            const range = distance(enemy, nest);
            if (range > 8 || range >= nearest) continue;
            const attacker = KDMapData.Entities.find((entity) => entity.id === alert.id);
            if (!attacker || attacker.hp <= 0 || !attacker.Enemy || !KDHostile(enemy, attacker)) continue;
            if (!perceives(enemy, attacker)) {
                if (enemy.SpiderlingsHuntRole && enemy.SpiderlingsHuntRole !== "builder")
                    enemy[DEFENSE_SEARCH] = { id: nest.id, x: nest.x, y: nest.y, tick: alert.tick };
                continue;
            }
            if (
                enemy.SpiderlingsHuntRole === "builder" &&
                distance(enemy, attacker) > 1 &&
                nest.hp > nest.Enemy.maxhp / 2
            )
                continue;
            chosen = attacker;
            nearest = range;
        }
        if (chosen) enemy[DEFENDER_TARGET] = chosen.id;
        // A crew reinforces one actually observed NPC. Shared coordinates guide
        // investigation only; acquiring the live target still needs this spider's LOS.
        if (!chosen) {
            const contact = crewContact(enemy);
            const prey = contact && KDMapData.Entities.find((candidate) => candidate.id === contact.targetId);
            if (prey && perceives(enemy, prey)) chosen = prey;
        }
        // Retain a living natively perceptible NPC instead of oscillating between
        // simultaneous contacts. Unseen prey never yields a live-position target.
        if (
            !chosen &&
            nativeTarget &&
            !nativeTarget.player &&
            nativeTarget.hp > 0 &&
            KDHostile(enemy, nativeTarget) &&
            perceives(enemy, nativeTarget)
        )
            return nativeTarget;
        if (!chosen && enemy.SpiderlingsHuntRole)
            chosen = KDMapData.Entities.filter(
                (entity) =>
                    independentCombatant(entity) &&
                    entity !== enemy &&
                    KDHostile(enemy, entity) &&
                    !(typeof KDHelpless === "function" && KDHelpless(entity)) &&
                    perceives(enemy, entity),
            ).sort((a, b) => distance(enemy, a) - distance(enemy, b) || a.id - b.id)[0];
        if (!chosen) return nativeTarget;
        enemy.aware = true;
        enemy.tx = chosen.x;
        enemy.ty = chosen.y;
        enemy.target = chosen.id;
        return chosen;
    }

    function perceives(actor, target) {
        if (!actor || !target || target.player) return false;
        const radius = actor.blind && !actor.aware ? 1.5 : KDEnemyVisionRadius(actor);
        return (
            KinkyDungeonCheckLOS(
                actor,
                target,
                Math.hypot(actor.x - target.x, actor.y - target.y),
                radius,
                true,
                true,
            ) &&
            (typeof KDCanDetect !== "function" || KDCanDetect(actor, target))
        );
    }

    function seekCrewDuty(enemy, target, aiData = {}) {
        if (
            (!enemy.SpiderlingsHuntRole && !MOBILE.has(enemy.Enemy?.name)) ||
            enemy.hp <= 0 ||
            !target?.player ||
            aiData.canSensePlayer ||
            aiData.moveTowardPlayer ||
            enemy.IntentAction ||
            enemy.CurrentAction ||
            enemy.action ||
            enemy.leash ||
            (typeof KinkyDungeonIsDisabled === "function" && KinkyDungeonIsDisabled(enemy)) ||
            (typeof KDHelpless === "function" && KDHelpless(enemy))
        )
            return false;
        const alert = enemy[DEFENSE_SEARCH],
            searching =
                alert && KinkyDungeonCurrentTick >= alert.tick && KinkyDungeonCurrentTick - alert.tick <= DEFENSE_TURNS;
        const contact = !searching && enemy.SpiderlingsHuntRole !== "builder" && crewContact(enemy);
        if (contact && distance(enemy, contact) > 1) {
            if (enemy.gx !== contact.x || enemy.gy !== contact.y) {
                enemy.gx = contact.x;
                enemy.gy = contact.y;
                enemy.path = undefined;
            }
            return true;
        }
        if (!searching && enemy.SpiderlingsHuntRole !== "guard") return false;
        const nest = KDMapData.Entities.find(
            (entity) => entity.id === (searching ? alert.id : enemy[NEST_PARENT_ID]) && entity.hp > 0,
        );
        if (!nest) return false;
        const goal = distance(enemy, nest) > 2 ? nest : enemy;
        if (enemy.gx !== goal.x || enemy.gy !== goal.y) {
            enemy.gx = goal.x;
            enemy.gy = goal.y;
            enemy.path = undefined;
        }
        return true;
    }

    function handleCrewMove(enemy, target, aiData = {}) {
        if (
            !enemy?.SpiderlingsHuntRole ||
            enemy.Enemy.name === "Spinner" ||
            enemy.SpiderlingsSpinnerRuntimeDelta <= 0 ||
            target?.player ||
            !target?.Enemy ||
            !aiData.canSensePlayer ||
            !KDHostile(enemy, target) ||
            !perceives(enemy, target) ||
            aiData.kite ||
            (typeof KDEnemyHasFlag === "function" && KDEnemyHasFlag(enemy, "runAway")) ||
            (enemy.Enemy.name !== "Jumper" && aiData.canShootPlayer && aiData.wantsToAttack) ||
            enemy.IntentAction ||
            enemy.CurrentAction ||
            enemy.action ||
            enemy.leash ||
            enemy.channel > 0 ||
            (typeof KinkyDungeonIsDisabled === "function" && KinkyDungeonIsDisabled(enemy)) ||
            (typeof KDHelpless === "function" && KDHelpless(enemy))
        )
            return false;
        const radius =
            enemy.Enemy.name === "Jumper"
                ? 1
                : Math.max(2, Math.ceil(aiData.followRange || enemy.Enemy.followRange || 3));
        if (distance(enemy, target) <= radius) return false;
        const occupied = new Set(KDMapData.Entities.filter((entity) => entity.hp > 0 && entity !== enemy).map(key));
        const stations = [];
        for (let dx = -radius; dx <= radius; dx++)
            for (let dy = -radius; dy <= radius; dy++) {
                if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                const point = { x: target.x + dx, y: target.y + dy };
                const tile = KinkyDungeonTilesGet(key(point));
                if (
                    occupied.has(key(point)) ||
                    !KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(point.x, point.y)) ||
                    tile?.Lock ||
                    tile?.OL ||
                    tile?.Type
                )
                    continue;
                const otherHunters = KDMapData.Entities.filter(
                    (entity) => entity !== enemy && entity.hp > 0 && entity.SpiderlingsHuntRole,
                );
                const separation = Math.min(...otherHunters.map((entity) => distance(entity, point)), 3);
                stations.push({ ...point, separation, range: distance(enemy, point) });
            }
        stations.sort(
            (a, b) =>
                b.separation - a.separation ||
                a.range - b.range ||
                ((a.x * 7 + a.y + enemy.id) % 17) - ((b.x * 7 + b.y + enemy.id) % 17),
        );
        for (const point of stations.slice(0, 4)) {
            const route = KinkyDungeonFindPath(
                enemy.x,
                enemy.y,
                point.x,
                point.y,
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
            const next = route?.find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
            if (!next || occupied.has(key(next))) continue;
            // One native credit payment per turn, including a slow unit's wait.
            // Returning handled prevents native AI from paying delta a second time.
            aiData.moved =
                KinkyDungeonEnemyTryMove(
                    enemy,
                    { x: next.x - enemy.x, y: next.y - enemy.y },
                    enemy.SpiderlingsSpinnerRuntimeDelta,
                    next.x,
                    next.y,
                    false,
                ) || aiData.moved;
            aiData.idle = false;
            return true;
        }
        return false;
    }

    function isNestAttacker(enemy, target) {
        return target?.id !== undefined && enemy?.[DEFENDER_TARGET] === target.id;
    }

    function evacuateTaskNest(enemy, _entry, map) {
        if (map !== KDMapData || !enemy[MAID_FINISHER] || !isObjectiveNest(map, enemy)) return;
        delete enemy[MAID_FINISHER];
        if (KDRandom() >= 0.25) return;
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
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", MOD, recordTaskNestDamage);
        if (typeof KDOndeath !== "undefined") KDOndeath[ESCAPE_DEATH] = evacuateTaskNest;
        // Eligibility follows the native primary faction; never turn another faction into maids.
        KDMapMods[MOD] = {
            name: MOD,
            roomType: "",
            altRoom: "",
            get weight() {
                return api.FloorSelection.weight(MOD);
            },
            filter: (slot) => (slot?.y >= MIN_FLOOR && !slot.RoomType && slot.Faction === "Maidforce" ? 1 : 0),
            tags: [],
            bonusTags: {},
            escapeMethod: MOD,
        };
        registerJourneySelection();
        registerPopulation();
        KDAddEvent(KDEventMapGeneric, "afterGetSpawnBoxes", MOD, (_event, data) => {
            // Basic maids are native "minor" enemies. Let them fill ordinary
            // slots too, rather than confining the main faction to the minor box.
            if (selectingPopulation) data.filterTagsBase = data.filterTagsBase.filter((tag) => tag !== "minor");
        });
        KinkyDungeonEscapeTypes[MOD] = {
            selectValid: false,
            filterRandom: () => 0,
            check: () => !activeState() || activeState().complete || api.FloorSelection?.canBypassObjective() === true,
            minimaptext: () => progressText(false, true),
            doortext: () =>
                api.FloorSelection?.canBypassObjective() ? api.FloorSelection.bypassText() : progressText(true),
        };
        KDAddEvent(KDEventMapGeneric, "calcEscapeMethod", MOD, (_event, data) => {
            if (activeState()) data.escapeMethod = MOD;
        });
        KDAddEvent(KDEventMapGeneric, "beforeStairCancel", MOD, (_event, data) => {
            if (
                activeState() &&
                !activeState().complete &&
                !api.FloorSelection?.canBypassObjective() &&
                (data.toTile === "s" || data.AdvanceAmount > 0)
            ) {
                data.cancelevent = MOD;
            }
        });
        KDCancelEvents[MOD] = () => KinkyDungeonSendActionMessage(10, progressText(true), "#ff88ff", 3);
        // Rooms with enemies:false never invoke population; clear their modifier too.
        KDAddEvent(KDEventMapGeneric, "postMapgen", MOD, () => {
            api.HuntingGroundsLayout?.release(KDMapData);
            if (KDMapData.MapMod === MOD && !KDMapData[FIELD]) cancelInfestation("ineligible");
            else {
                const preset = activeState()?.fieldPreset;
                if (preset?.status === "pending")
                    KDMapData[FIELD].fieldPreset = api.SpinnerAI?.initializeMapgenField(preset) || {
                        status: "skipped",
                        reason: "spinner-unavailable",
                    };
            }
        });
        if (!KinkyDungeonPlaceEnemies.SpiderlingsHuntingGroundsWrapped) {
            const original = KinkyDungeonPlaceEnemies;
            KinkyDungeonPlaceEnemies = function (...args) {
                const room = args[7] || {};
                placeNests(args[0], args[4], room);
                // The nest objective belongs to the modifier; population belongs
                // to the map's main faction, even when the objective is absent.
                const spiderFloor =
                    ([MOD, "SpiderlingsInfestation"].includes(KDMapData.MapMod) ||
                        KDMapData.SpiderlingsPopulationPlan?.layoutFallback) &&
                    api.EncounterRules.isEligibleOrdinaryMap(room) &&
                    !KDMapData.RoomType;
                const themed = spiderFloor || usesMaidPopulation(room);
                // Native population processes preset spawnpoints through the
                // same selector. Mark only their copied filter lists to opt out.
                if (spiderFloor) args[0] = populationSpawnPoints(args[0]);
                else if (themed)
                    args[0] = args[0].map((point) => ({ ...point, ftags: [...(point.ftags || []), PRESET_TAG] }));
                const previous = selectingPopulation;
                const priorMaidIds = new Set(
                    KDMapData.Entities.filter(
                        (entity) => independentCombatant(entity) && KDGetFaction(entity) === "Maidforce",
                    ).map((entity) => entity.id),
                );
                selectingPopulation = themed ? "initial" : false;
                try {
                    const result = original.apply(this, args);
                    if (spiderFloor && KDMapData.SpiderlingsPopulationPlan) {
                        const plan = KDMapData.SpiderlingsPopulationPlan;
                        if (plan.kind === MOD && plan.preyQuota && !plan.residentsSeeded) {
                            const existingPrey = KDMapData.Entities.filter(
                                (entity) =>
                                    mobileCombatant(entity, true) &&
                                    !entity.Enemy.master &&
                                    ["Maid", "Dressmaker", "Nurse"].includes(populationGroup(entity.Enemy)),
                            );
                            const quota = Object.fromEntries(
                                Object.entries(plan.preyQuota).map(([group, count]) => [
                                    group,
                                    Math.max(
                                        0,
                                        count -
                                            existingPrey.filter((entity) => populationGroup(entity.Enemy) === group)
                                                .length,
                                    ),
                                ]),
                            );
                            const residents = api.Population.seedHuntingResidents({
                                spawnPoints: args[0],
                                existingPrey,
                                prey: [
                                    ...Array.from({ length: quota.Maid }, (_, index) =>
                                        index % 2 ? "MaidforceMini" : "MaidforceMafia",
                                    ),
                                    ...Array(quota.Dressmaker).fill("Dressmaker"),
                                    ...Array(quota.Nurse).fill("Nurse"),
                                ],
                            });
                            plan.residentsSeeded = true;
                            plan.residentIds = residents;
                        }
                        plan.initial = {
                            ...populationCounts(),
                            strict: combatantCounts(true),
                            ecology: combatantCounts(false),
                        };
                        plan.extraMaid =
                            !!plan.extraMaidRequested &&
                            KDMapData.Entities.some(
                                (entity) =>
                                    !priorMaidIds.has(entity.id) &&
                                    independentCombatant(entity) &&
                                    KDGetFaction(entity) === "Maidforce",
                            );
                        delete plan.extraMaidRequested;
                    }
                    return result;
                } finally {
                    selectingPopulation = previous;
                }
            };
            KinkyDungeonPlaceEnemies.SpiderlingsHuntingGroundsWrapped = true;
        }
        if (
            typeof KinkyDungeonHandleWanderingSpawns === "function" &&
            !KinkyDungeonHandleWanderingSpawns.SpiderlingsHuntingGroundsWrapped
        ) {
            const original = KinkyDungeonHandleWanderingSpawns;
            KinkyDungeonHandleWanderingSpawns = function () {
                const previous = selectingPopulation;
                const room = typeof KDGetAltType === "function" ? KDGetAltType(MiniGameKinkyDungeonLevel) : {};
                selectingPopulation =
                    (KDMapData.SpiderlingsPopulationPlan &&
                        (!KDMapData.SpiderlingsPopulationPlan.layoutFallback ||
                            (!KDMapData.RoomType && api.EncounterRules.isEligibleOrdinaryMap(room || {})))) ||
                    usesMaidPopulation(room || {})
                        ? "wandering"
                        : false;
                try {
                    const result = original.apply(this, arguments);
                    return result;
                } finally {
                    selectingPopulation = previous;
                }
            };
            KinkyDungeonHandleWanderingSpawns.SpiderlingsHuntingGroundsWrapped = true;
        }
        if (!KDRemoveEntity.SpiderlingsHuntingGroundsWrapped) {
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
            KDRemoveEntity.SpiderlingsHuntingGroundsWrapped = true;
        }
    }

    Object.assign(infestation, {
        planNestPlacement,
        planIndependentNestPlacement,
        planNestClearing,
        reachableCells,
        populationGroup,
        populationCounts,
        independentCombatant,
        perceives,
        seekCrewDuty,
        handleCrewMove,
        activeState,
        resolveNestDefenderTarget,
        isNestAttacker,
        register,
    });
    register();
    if (typeof module !== "undefined" && module.exports) module.exports = infestation;
})();
