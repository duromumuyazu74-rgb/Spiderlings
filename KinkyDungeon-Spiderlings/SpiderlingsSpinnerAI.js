"use strict";

// Saved group planning and paid unaware construction for native Spinner fields.
(() => {
    const api = globalThis.Spiderlings,
        GROUP_RADIUS = 10,
        SHORTLIST_SIZE = 8,
        MAX_LINE_LENGTH = 5,
        DIRECTIONS = [
            { x: 1, y: 0 },
            { x: -1, y: 0 },
            { x: 0, y: 1 },
            { x: 0, y: -1 },
            { x: 1, y: 1 },
            { x: 1, y: -1 },
            { x: -1, y: 1 },
            { x: -1, y: -1 },
        ];
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const cellKey = (cell) => `${cell.x},${cell.y}`;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    let preparedMap;
    let preparedTick = -1;
    let observedGroups = new Map();
    let mapCache;
    let passageCache;
    let workSnapshot;

    function seededRandom(seed) {
        let value = 2166136261;
        for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
        return () => {
            value += 0x6d2b79f5;
            let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
            mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
            return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
        };
    }

    function baseEligibility(entity, options = {}) {
        const hostile = options.hostile || ((candidate) => KDHostile(candidate)),
            allied = options.allied || ((candidate) => KDAllied(candidate)),
            inParty = options.inParty || ((candidate) => KDIsInParty(candidate)),
            imprisoned = options.imprisoned || ((candidate) => KDIsImprisoned(candidate));
        return (
            entity?.hp > 0 &&
            entity.Enemy?.name === "Spinner" &&
            hostile(entity) &&
            !allied(entity) &&
            !inParty(entity) &&
            !imprisoned(entity)
        );
    }

    function eligibleSpinner(entity, options = {}) {
        const disabled = options.disabled || ((candidate) => KinkyDungeonIsDisabled(candidate)),
            helpless = options.helpless || ((candidate) => KDHelpless(candidate));
        return baseEligibility(entity, options) && !disabled(entity) && !helpless(entity);
    }

    function targetReference(target) {
        if (!target) return undefined;
        if (target.player) return { kind: "player", id: target.id ?? "player" };
        if (target.id === undefined) return undefined;
        return { kind: "npc", id: target.id };
    }

    function sameTarget(reference, target) {
        const other = targetReference(target);
        return !!reference && !!other && reference.kind === other.kind && String(reference.id) === String(other.id);
    }

    function resolveTarget(reference) {
        if (!reference) return undefined;
        if (reference.kind === "player") return KinkyDungeonPlayerEntity;
        return KDMapData.Entities.find((entity) => String(entity.id) === String(reference.id));
    }

    function targetIsLiving(target) {
        return !!target && (target.player || target.hp > 0);
    }

    function targetIsHostile(group, target) {
        if (!targetIsLiving(target)) return false;
        const member = group.memberIds
            .map((id) => KDMapData.Entities.find((entity) => String(entity.id) === String(id)))
            .find((entity) => baseEligibility(entity));
        if (!member) return false;
        return target.player ? KDHostile(member) : KDHostile(member, target);
    }

    function routeOnSnapshot(snapshot, from, to, blocked = new Set(), passable, neighbors) {
        if (!from || !to) return [];
        const cells =
                passable || new Set((snapshot?.cells || []).filter((cell) => cell.floor && !cell.locked).map(cellKey)),
            start = cellKey(from),
            goals = new Set(
                (Array.isArray(to) ? to : [to]).map(cellKey).filter((key) => cells.has(key) && !blocked.has(key)),
            ),
            queue = [start],
            parent = new Map([[start, null]]);
        if (!cells.has(start) || !goals.size || blocked.has(start)) return [];
        let goal;
        for (let index = 0; index < queue.length; index++) {
            const current = queue[index];
            if (goals.has(current)) {
                goal = current;
                break;
            }
            if (neighbors) {
                for (const neighbor of neighbors.get(current) || []) {
                    if (neighbor.corners?.some((corner) => blocked.has(corner))) continue;
                    if (!blocked.has(neighbor.key) && !parent.has(neighbor.key)) {
                        parent.set(neighbor.key, current);
                        queue.push(neighbor.key);
                    }
                }
                continue;
            }
            const [x, y] = current.split(",").map(Number);
            for (const direction of DIRECTIONS) {
                const next = `${x + direction.x},${y + direction.y}`;
                if (
                    direction.x &&
                    direction.y &&
                    (blocked.has(`${x + direction.x},${y}`) || blocked.has(`${x},${y + direction.y}`))
                )
                    continue;
                if (cells.has(next) && !blocked.has(next) && !parent.has(next)) {
                    parent.set(next, current);
                    queue.push(next);
                }
            }
        }
        if (!goal) return [];
        const path = [];
        for (let current = goal; current; current = parent.get(current)) {
            const [x, y] = current.split(",").map(Number);
            path.push({ x, y });
        }
        return path.reverse();
    }

    function routeDistances(snapshot, work, blocked = new Set(), includeDoors = false) {
        const passable = new Set(
                (snapshot?.cells || [])
                    .filter(
                        (cell) =>
                            (includeDoors ? (cell.walkable ?? cell.floor) : cell.floor) &&
                            !cell.locked &&
                            !blocked.has(cellKey(cell)),
                    )
                    .map(cellKey),
            ),
            fields = new Map(),
            neighbors = new Map();
        for (const key of passable) {
            const [x, y] = key.split(",").map(Number);
            neighbors.set(
                key,
                DIRECTIONS.filter(
                    (direction) =>
                        !direction.x ||
                        !direction.y ||
                        (!blocked.has(`${x + direction.x},${y}`) && !blocked.has(`${x},${y + direction.y}`)),
                )
                    .map((direction) => `${x + direction.x},${y + direction.y}`)
                    .filter((next) => passable.has(next)),
            );
        }
        return (from, to) => {
            if (!from || !to) return Infinity;
            const start = cellKey(from),
                goal = cellKey(to);
            if (!passable.has(start) || !passable.has(goal)) return Infinity;
            if (!fields.has(start)) {
                if (work) work.distanceFieldBuilds++;
                const field = new Map([[start, 0]]),
                    queue = [start];
                for (let index = 0; index < queue.length; index++) {
                    const current = queue[index],
                        steps = field.get(current) + 1;
                    for (const next of neighbors.get(current)) {
                        if (!field.has(next)) {
                            field.set(next, steps);
                            queue.push(next);
                        }
                    }
                }
                fields.set(start, field);
            }
            return fields.get(start).get(goal) ?? Infinity;
        };
    }

    function ensureAI(encounter, input = {}) {
        encounter.ai ||= {
            version: 1,
            mapSeed: String(input.mapSeed ?? "spinner-map"),
            mapIdentity: String(input.mapIdentity ?? "current-map"),
            nextGroupOrdinal: 1,
            nextPlanOrdinal: 1,
            candidateRevision: 0,
            candidates: [],
            invalidCandidateIds: [],
            groups: {},
            plans: {},
        };
        return encounter.ai;
    }

    function sourceBusy(entity) {
        return !!(api.FieldCommand.sourceRole(entity) || entity?.SpiderlingsTaskNestDefenderTarget !== undefined);
    }

    function fieldStandbyCells(ai, group, snapshot, graph) {
        const plan = ai.plans[group.planId];
        if (!plan || ["invalid", "abandoned", "retired"].includes(plan.status) || plan.kind === "line") return [];
        const field =
                graph?.fields?.[
                    (graph?.composites?.[plan.compositeId]?.layerIds || plan.fieldIds || [plan.fieldId]).at(-1)
                ],
            interiorCells = field?.interiorCells || plan.interiorCells || [plan.center],
            gates = field?.gates || plan.gates || [{ cells: [field?.gateCell || plan.gate] }],
            boundary = new Set(plan.cells || []),
            interior = new Set(interiorCells.filter(Boolean).map(cellKey)),
            otherFields = new Set(
                Object.values(ai.plans)
                    .filter((other) => other !== plan && !["invalid", "abandoned", "retired"].includes(other.status))
                    .flatMap((other) => other.cells || []),
            ),
            byKey = new Map((snapshot?.cells || []).map((cell) => [cellKey(cell), cell])),
            stations = new Map(),
            mouths = new Set();
        if (!snapshot) return [];
        for (const gate of gates) {
            const outside = new Map();
            for (const cell of gate.cells.filter(Boolean))
                for (const direction of DIRECTIONS.filter((entry) => !entry.x || !entry.y)) {
                    const point = { x: cell.x + direction.x, y: cell.y + direction.y },
                        key = cellKey(point),
                        tile = byKey.get(key);
                    if (tile?.floor && !tile.locked && !interior.has(key) && !boundary.has(key))
                        outside.set(key, point);
                }
            if (outside.size === 1) mouths.add([...outside.keys()][0]);
        }
        // Reserve distinct waiting cells without detaching any field owners.
        for (const gate of gates)
            for (const cell of gate.cells.filter(Boolean))
                for (let dy = -2; dy <= 2; dy++)
                    for (let dx = -2; dx <= 2; dx++) {
                        const point = { x: cell.x + dx, y: cell.y + dy },
                            key = cellKey(point),
                            tile = byKey.get(key);
                        if (
                            tile?.floor &&
                            !tile.locked &&
                            !tile.protected &&
                            !boundary.has(key) &&
                            !interior.has(key) &&
                            !mouths.has(key) &&
                            !otherFields.has(key)
                        ) {
                            stations.set(key, point);
                        }
                    }
        return [...stations.values()];
    }

    function planHasPaidWork(encounter, plan) {
        const graph = encounter?.topology,
            fieldIds = new Set(plan?.fieldIds || [plan?.fieldId]);
        return (
            !!graph &&
            (graph.actionLog?.some((entry) => fieldIds.has(entry.fieldId)) ||
                graph.anchors?.some((anchor) => anchor.built && anchor.owners.some((id) => fieldIds.has(id))) ||
                graph.links?.some(
                    (link) => (link.prepared || link.builtCells.length) && link.owners.some((id) => fieldIds.has(id)),
                ))
        );
    }

    function auditGroups(ai, entities, options = {}) {
        const encounter = api.SpinnerNativeField.state();
        return api.FieldCommand.reconcile(encounter, entities, options);
    }

    function nearestDistance(cell, points) {
        return points?.length ? Math.min(...points.map((point) => distance(cell, point))) : 99;
    }

    function lineCells(a, b) {
        const cells = [],
            count = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        for (let index = 0; index <= count; index++)
            cells.push({
                x: a.x + Math.sign(b.x - a.x) * index,
                y: a.y + Math.sign(b.y - a.y) * index,
            });
        return cells;
    }

    function lineCatalogue(snapshot) {
        const byKey = new Map((snapshot.cells || []).map((cell) => [cellKey(cell), cell])),
            protectedKeys = new Set(
                [...(snapshot.entrances || []), ...(snapshot.exits || []), ...(snapshot.protectedCells || [])].map(
                    cellKey,
                ),
            ),
            floor = (cell) => {
                const value = byKey.get(cellKey(cell));
                return !!value?.floor && !value.protected && !value.locked && !protectedKeys.has(cellKey(cell));
            },
            route = routeOnSnapshot(snapshot, snapshot.entrances?.[0], snapshot.exits?.[0]),
            routeKeys = new Set(route.map(cellKey)),
            supplied = snapshot.candidateLines || [],
            pairs = [];
        if (supplied.length) {
            for (const candidate of supplied) pairs.push(candidate.anchors || candidate);
        } else {
            for (const cell of snapshot.cells || []) {
                if (!floor(cell)) continue;
                for (const direction of [
                    { x: 1, y: 0 },
                    { x: 0, y: 1 },
                ])
                    for (let length = 1; length < MAX_LINE_LENGTH; length++) {
                        const end = { x: cell.x + direction.x * length, y: cell.y + direction.y * length },
                            cells = lineCells(cell, end);
                        if (cells.every(floor)) pairs.push([{ x: cell.x, y: cell.y }, end]);
                        else break;
                    }
            }
        }
        const lines = [],
            seen = new Set();
        for (const pair of pairs) {
            const anchors = pair.map((cell) => ({ x: cell.x, y: cell.y })),
                cells = lineCells(anchors[0], anchors[1]);
            if (anchors.length !== 2 || !cells.every(floor)) continue;
            const id = `line:${cellKey(anchors[0])};${cellKey(anchors[1])}`;
            if (seen.has(id)) continue;
            seen.add(id);
            const center = cells[Math.floor(cells.length / 2)],
                neighbors = DIRECTIONS.slice(0, 4).filter((direction) =>
                    floor({ x: center.x + direction.x, y: center.y + direction.y }),
                ).length,
                routeHits = cells.filter((cell) => routeKeys.has(cellKey(cell))).length,
                exitDistance = nearestDistance(center, snapshot.exits || []),
                chokeDistance = nearestDistance(center, snapshot.chokes || []);
            lines.push({ id, anchors, cells, center, neighbors, routeHits, exitDistance, chokeDistance });
        }
        return lines;
    }

    function analyzeLineCandidates(
        snapshot,
        group,
        distances = routeDistances(snapshot),
        lines = lineCatalogue(snapshot),
        work,
    ) {
        const members = group.members || group.memberPositions || [],
            origin = members[0] || snapshot.origins?.[0] || snapshot.entrances?.[0],
            nest =
                group.source?.type === "nest"
                    ? (snapshot.nests || []).find((candidate) => candidate.id === group.source.nestId)
                    : undefined,
            candidates = [];
        for (const line of lines) {
            if (work) work.candidatesExamined++;
            const { center, neighbors, routeHits, exitDistance, chokeDistance } = line,
                nestDistance = nest ? distance(center, nest) : 99,
                travelDistance = origin ? distances(origin, center) : 0,
                reasons =
                    group.source?.type === "nest"
                        ? {
                              nestDefense: Math.max(0, 50 - nestDistance * 5),
                              route: routeHits * 10,
                              choke: Math.max(0, 12 - chokeDistance * 2),
                              exit: Math.max(0, 8 - exitDistance),
                          }
                        : {
                              route: routeHits * 24,
                              exit: Math.max(0, 24 - exitDistance * 2),
                              choke: Math.max(0, 60 - chokeDistance * 8),
                              junction: neighbors >= 3 ? 10 : 0,
                          },
                score = Object.values(reasons).reduce((total, value) => total + value, 0) - travelDistance * 0.3;
            if (!Number.isFinite(travelDistance)) continue;
            candidates.push({
                id: line.id,
                type: "line",
                anchors: line.anchors.map((anchor) => ({ x: anchor.x, y: anchor.y })),
                cells: line.cells.map((cell) => ({ x: cell.x, y: cell.y })),
                score,
                reasons,
                travelDistance,
            });
        }
        const local = nest
            ? candidates.filter(
                  (candidate) =>
                      candidate.travelDistance <= 8 && candidate.anchors.every((anchor) => distance(anchor, nest) <= 6),
              )
            : [];
        return (local.length ? local : candidates).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    }

    function rectangle(center, radius) {
        return [
            { x: center.x - radius, y: center.y - radius },
            { x: center.x + radius, y: center.y - radius },
            { x: center.x + radius, y: center.y + radius },
            { x: center.x - radius, y: center.y + radius },
        ];
    }

    function ringCells(center, radius) {
        const cells = [];
        for (let y = center.y - radius; y <= center.y + radius; y++)
            for (let x = center.x - radius; x <= center.x + radius; x++)
                if (Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) === radius) cells.push({ x, y });
        return cells;
    }

    function enclosureGeometryFor(snapshot, includeDoors = false) {
        const byKey = new Map((snapshot.cells || []).map((cell) => [cellKey(cell), cell])),
            passable = new Set(
                (snapshot.cells || [])
                    .filter((cell) => (includeDoors ? cell.walkable : cell.floor) && !cell.locked)
                    .map(cellKey),
            ),
            neighbors = new Map();
        for (const key of passable) {
            const [x, y] = key.split(",").map(Number);
            neighbors.set(
                key,
                DIRECTIONS.flatMap((direction) => {
                    const next = `${x + direction.x},${y + direction.y}`;
                    return passable.has(next)
                        ? [
                              {
                                  key: next,
                                  corners:
                                      direction.x && direction.y
                                          ? [`${x + direction.x},${y}`, `${x},${y + direction.y}`]
                                          : undefined,
                              },
                          ]
                        : [];
                }),
            );
        }
        return {
            byKey,
            passable,
            neighbors,
            routeKeys: new Set(routeOnSnapshot(snapshot, snapshot.entrances?.[0], snapshot.exits?.[0]).map(cellKey)),
            gateCache: new Map(),
        };
    }

    function reachableGate(
        snapshot,
        center,
        radius,
        work,
        byKey = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell])),
        passable = new Set((snapshot.cells || []).filter((cell) => cell.floor && !cell.locked).map(cellKey)),
        cache,
        neighbors,
    ) {
        const cacheKey = `${cellKey(center)}:${radius}`;
        if (cache?.has(cacheKey)) return cache.get(cacheKey) || undefined;
        const blocked = new Set(ringCells(center, radius).map(cellKey)),
            origins = [snapshot.entrances?.[0], snapshot.exits?.[0]].filter(Boolean);
        for (const direction of DIRECTIONS.slice(0, 4)) {
            const gate = { x: center.x + direction.x * radius, y: center.y + direction.y * radius },
                exterior = { x: center.x + direction.x * (radius + 1), y: center.y + direction.y * (radius + 1) },
                tile = byKey.get(cellKey(exterior));
            if (!tile?.floor || tile.locked) continue;
            if (
                origins.every((origin) => {
                    if (work) work.routeChecks++;
                    return routeOnSnapshot(snapshot, origin, exterior, blocked, passable, neighbors).length > 0;
                })
            ) {
                cache?.set(cacheKey, gate);
                return gate;
            }
        }
        cache?.set(cacheKey, null);
        return undefined;
    }

    function analyzeEnclosureCandidates(
        snapshot,
        group,
        distances = routeDistances(snapshot),
        work,
        geometry,
        minimumRadius = 1,
    ) {
        // A supplied line catalogue is an explicit line-only scenario (used by authored fixtures).
        if (Object.hasOwn(snapshot, "candidateLines")) return [];
        const origin = (group.members || group.memberPositions || [])[0],
            observation = group.recoveryAround || group.planningFocus || api.SpinnerAI.groupObservation?.(group),
            focus = observation || origin,
            byKey = geometry?.byKey || new Map((snapshot.cells || []).map((cell) => [cellKey(cell), cell])),
            stationary = new Set(
                KDMapData.Entities.filter(
                    (entity) => entity.hp > 0 && entity.Enemy?.immobile && !api.SpinnerNativeField.isOwnedProxy(entity),
                ).map(cellKey),
            ),
            occupied =
                geometry?.occupied ||
                new Set([
                    ...KDMapData.Entities.filter(
                        (entity) =>
                            entity.hp > 0 &&
                            entity.Enemy?.tags?.spiderlings !== true &&
                            !api.SpinnerNativeField.isOwnedProxy(entity),
                    ).map(cellKey),
                    cellKey(KinkyDungeonPlayerEntity),
                ]),
            routeKeys =
                geometry?.routeKeys ||
                new Set(routeOnSnapshot(snapshot, snapshot.entrances?.[0], snapshot.exits?.[0]).map(cellKey)),
            passable =
                geometry?.passable ||
                new Set((snapshot.cells || []).filter((cell) => cell.floor && !cell.locked).map(cellKey)),
            nests = snapshot.nests || [],
            reserved = new Set(
                Object.values(api.SpinnerNativeField.state()?.ai?.plans || {})
                    .filter(
                        (plan) =>
                            plan.groupId !== group.id && !["invalid", "abandoned", "retired"].includes(plan.status),
                    )
                    .flatMap((plan) => plan.cells || []),
            ),
            candidates = [];
        if (!origin) return candidates;
        // Distance scores choose between equal sizes. Nearby fallback sites must
        // not hide a larger reachable enclosure from the global planner.
        for (const nearby of geometry?.candidateCenters ? [null] : [true, false]) {
            for (const center of geometry?.candidateCenters || snapshot.cells || []) {
                if (group.recoveryAround && distance(group.recoveryAround, center) > 1) continue;
                if (nearby !== null && distance(focus, center) <= 6 !== nearby) continue;
                if (work) {
                    work.candidateCells++;
                    work.candidatesExamined++;
                }
                if (!Number.isFinite(distances(origin, center))) continue;
                const radius = [4, 3, 2, 1]
                        .filter((size) => size >= minimumRadius && (!center.radius || size === center.radius))
                        .find(
                            (size) =>
                                [
                                    ...ringCells(center, size),
                                    ...Array.from({ length: size - 1 }, (_, index) =>
                                        ringCells(center, index + 1),
                                    ).flat(),
                                    center,
                                ].every((cell) => {
                                    const tile = byKey.get(cellKey(cell));
                                    return (
                                        tile?.floor &&
                                        !stationary.has(cellKey(cell)) &&
                                        !tile.locked &&
                                        !tile.protected &&
                                        !reserved.has(cellKey(cell)) &&
                                        (distance(cell, center) < Math.min(size, 2) || !occupied.has(cellKey(cell)))
                                    );
                                }) &&
                                reachableGate(
                                    snapshot,
                                    center,
                                    size,
                                    work,
                                    byKey,
                                    passable,
                                    geometry?.gateCache,
                                    geometry?.neighbors,
                                ),
                        ),
                    boundary = radius ? ringCells(center, radius) : [],
                    cells = [...boundary, center],
                    legal = cells.every((cell) => {
                        const tile = byKey.get(cellKey(cell));
                        return (
                            tile?.floor &&
                            !tile.locked &&
                            !tile.protected &&
                            (cellKey(cell) === cellKey(center) || !occupied.has(cellKey(cell)))
                        );
                    });
                if (!radius || !legal) continue;
                const gate = reachableGate(
                    snapshot,
                    center,
                    radius,
                    work,
                    byKey,
                    passable,
                    geometry?.gateCache,
                    geometry?.neighbors,
                );
                if (!gate) continue;
                const nest =
                        group.source?.type === "nest"
                            ? nests.find((candidate) => candidate.id === group.source.nestId)
                            : undefined,
                    routeHits = cells.filter((cell) => routeKeys.has(cellKey(cell))).length,
                    travelDistance = distances(origin, gate),
                    nestDistance = nest ? distance(center, nest) : 99,
                    score =
                        300 +
                        routeHits * 12 +
                        Math.max(0, 12 - nestDistance * 2) -
                        travelDistance * 2 -
                        distance(focus, center) * 4;
                if (!Number.isFinite(travelDistance)) continue;
                const innerRadius = Math.min(radius, 2);
                candidates.push({
                    id: `enclosure:${cellKey(center)}`,
                    type: "enclosure",
                    center: { x: center.x, y: center.y },
                    anchors: rectangle(center, innerRadius),
                    radius,
                    area: (radius * 2 - 1) ** 2,
                    gate: {
                        x: center.x + Math.sign(gate.x - center.x) * innerRadius,
                        y: center.y + Math.sign(gate.y - center.y) * innerRadius,
                    },
                    layers: Array.from({ length: radius - innerRadius + 1 }, (_, index) => {
                        const size = index + innerRadius;
                        return {
                            vertices: rectangle(center, size),
                            gate: {
                                x: center.x + Math.sign(gate.x - center.x) * size,
                                y: center.y + Math.sign(gate.y - center.y) * size,
                            },
                        };
                    }),
                    cells: [
                        ...Array.from({ length: radius }, (_, index) => ringCells(center, index + 1)).flat(),
                        center,
                    ],
                    score,
                    travelDistance,
                    reasons: { route: routeHits, nest: nestDistance },
                });
            }
        }
        return candidates.sort(compareSites);
    }

    function compareSites(a, b) {
        return (
            (b.area || b.interiorCells?.length || 1) - (a.area || a.interiorCells?.length || 1) ||
            b.score - a.score ||
            a.id.localeCompare(b.id)
        );
    }

    function selectSavedPlan(ai, group, candidates) {
        return api.FieldProjects.selectSavedPlan(ai, group, candidates);
    }

    function nativeMapSnapshot() {
        const metadata = JSON.stringify({
            tiles: Object.entries(KDMapData.Tiles || {}).map(([key, value]) => [
                key,
                value?.Lock,
                value?.OL,
                value?.OffLimits,
                value?.Jail,
                value?.Protected,
                value?.Priority,
                value?.Type,
            ]),
            fixed: KDMapData.Entities.filter(
                (entity) => entity.hp > 0 && entity.Enemy?.immobile && !api.SpinnerNativeField.isOwnedProxy(entity),
            ).map((entity) => [entity.id, entity.x, entity.y]),
            nests: KDMapData.Entities.filter((entity) => entity.hp > 0 && entity.Enemy?.name === "NestEntrance").map(
                (entity) => [entity.id, entity.x, entity.y],
            ),
            start: KDMapData.StartPosition,
            end: KDMapData.EndPosition,
            shortcuts: KDMapData.ShortcutPositions,
            jail: KDMapData.JailPoints,
        });
        // Native terrain edits replace Grid. Check mutable tile metadata separately;
        // moving actors and owned web proxies do not invalidate static map analysis.
        if (
            typeof KDMapData.Grid === "string" &&
            mapCache?.map === KDMapData &&
            mapCache.grid === KDMapData.Grid &&
            mapCache.metadata === metadata
        )
            return mapCache.snapshot;
        const cells = [];
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                const tile = KinkyDungeonTilesGet(`${x},${y}`),
                    mapTile = KinkyDungeonMapGet(x, y),
                    floor = KinkyDungeonMovableTilesEnemy.includes(mapTile),
                    door = mapTile === "D" || mapTile === "d",
                    walkable = (floor || door) && !tile?.Lock;
                cells.push({
                    x,
                    y,
                    tile: mapTile,
                    floor,
                    walkable,
                    wall:
                        !walkable &&
                        (typeof KinkyDungeonWallTiles === "string" ? KinkyDungeonWallTiles : "1").includes(mapTile),
                    locked: !!tile?.Lock,
                    protected: !!(
                        door ||
                        tile?.OL ||
                        tile?.OffLimits ||
                        tile?.Jail ||
                        tile?.Protected ||
                        tile?.Priority ||
                        ["Shrine", "Chest", "Door", "JailPoint", "Stairs"].includes(tile?.Type)
                    ),
                });
            }
        const nests = KDMapData.Entities.filter((entity) => entity.hp > 0 && entity.Enemy?.name === "NestEntrance").map(
            (entity) => ({ id: entity.id, x: entity.x, y: entity.y }),
        );
        const fixedBlockers = new Set(
            KDMapData.Entities.filter(
                (entity) => entity.hp > 0 && entity.Enemy?.immobile && !api.SpinnerNativeField.isOwnedProxy(entity),
            ).map(cellKey),
        );
        for (const cell of cells) if (fixedBlockers.has(cellKey(cell))) cell.protected = true;
        const entrances = [KDMapData.StartPosition, ...Object.values(KDMapData.ShortcutPositions || {})].filter(
                Boolean,
            ),
            exits = [KDMapData.EndPosition].filter(Boolean),
            protectedKeys = new Set([...entrances, ...exits, ...(KDMapData.JailPoints || [])].map(cellKey));
        for (const cell of cells) if (protectedKeys.has(cellKey(cell))) cell.protected = true;
        const snapshot = {
            width: KDMapData.GridWidth,
            height: KDMapData.GridHeight,
            cells,
            entrances,
            exits,
            chokes: globalThis.KDCommanderChokes
                ? Object.values(globalThis.KDCommanderChokes).map(({ x, y }) => ({ x, y }))
                : [],
            nests,
        };
        mapCache = { map: KDMapData, grid: KDMapData.Grid, metadata, snapshot };
        return snapshot;
    }

    function passageIndex(snapshot, ai) {
        if (!api.SpinnerPassagePlanner || Object.hasOwn(snapshot, "candidateLines")) return undefined;
        const signature = geometrySignature(snapshot);
        if (passageCache?.map !== KDMapData || passageCache.signature !== signature) {
            const metrics = { ...(ai.passageMetrics || {}) };
            passageCache = {
                map: KDMapData,
                signature,
                index: api.SpinnerPassagePlanner.buildIndex(snapshot, { metrics }),
            };
        }
        ai.passageMetrics = { ...passageCache.index.metrics };
        return passageCache.index;
    }

    function passageCandidates(snapshot, group, ai) {
        const index = passageIndex(snapshot, ai);
        if (!index) return [];
        const routes = (snapshot.entrances || []).flatMap((from, ordinal) =>
                (snapshot.exits || []).map((to, exit) => ({ id: `${ordinal}:${exit}`, from, to })),
            ),
            occupied = new Set(
                [
                    ...KDMapData.Entities.filter(
                        (entity) =>
                            entity.hp > 0 &&
                            !entity.Enemy?.tags?.spiderlings &&
                            !api.SpinnerNativeField.isOwnedProxy(entity),
                    ),
                    KinkyDungeonPlayerEntity,
                ]
                    .filter(Boolean)
                    .map(cellKey),
            ),
            members = group.members || [],
            approaches = routeDistances(snapshot, undefined, occupied, true);
        const candidates = api.SpinnerPassagePlanner.candidates(index, {
            routes,
            preferLarge: true,
            focus: group.planningFocus || api.SpinnerAI.groupObservation?.(group) || members[0],
            maxCandidates: SHORTLIST_SIZE,
            blockedKeys: [...occupied],
            reachableKeys: index.nodes
                .filter((cell) => members.every((member) => Number.isFinite(approaches(member, cell))))
                .map(cellKey),
        })
            .filter(
                (candidate) =>
                    candidate.proof.kind === "mandatory" ||
                    (candidate.proof.kind === "detour" &&
                        candidate.proof.detourDistance - candidate.proof.baselineDistance >= 4),
            )
            .filter(
                (candidate) =>
                    candidate.gates.every((gate) => gate.cells.every((cell) => !occupied.has(cellKey(cell)))) &&
                    (group.recoveryAround
                        ? candidate.interiorCells.some((cell) => cellKey(cell) === cellKey(group.recoveryAround))
                        : !candidate.interiorCells.some((cell) => cellKey(cell) === cellKey(KinkyDungeonPlayerEntity))),
            )
            .map((candidate) => {
                const travelDistance = Math.max(
                    ...members.map((member) =>
                        Math.min(
                            ...candidate.gates.flatMap((gate) => gate.cells).map((cell) => approaches(member, cell)),
                        ),
                    ),
                );
                const focus = group.planningFocus || api.SpinnerAI.groupObservation?.(group) || members[0];
                return {
                    ...candidate,
                    area: candidate.interiorCells.length,
                    travelDistance,
                    focusDistance: distance(focus, candidate.center),
                    score: candidate.score - travelDistance * 2 - distance(focus, candidate.center) * 4,
                };
            })
            .filter((candidate) => Number.isFinite(candidate.travelDistance))
            .sort(compareSites);
        ai.passageMetrics = { ...index.metrics };
        const local = candidates.filter((candidate) => candidate.focusDistance <= 6);
        return local.length ? local : candidates;
    }

    function initializeMapgenField(options = {}) {
        const deploymentLimit = api.FieldProjects.limit();
        if (deploymentLimit === 0) return { status: "skipped", reason: "deployment-disabled" };
        const previous = api.SpinnerNativeField.state();
        // Both legacy single-field and new multi-field saves are one-time investments.
        if (previous?.ai?.mapgenField || Object.keys(previous?.topology?.composites || {}).length)
            return { status: "skipped", reason: "existing-field" };
        const nativeSnapshot = nativeMapSnapshot(),
            snapshot = { ...nativeSnapshot, cells: nativeSnapshot.cells.map((cell) => ({ ...cell })) },
            protectedPoints = new Set((options.protectedPoints || []).map(cellKey));
        for (const cell of snapshot.cells) if (protectedPoints.has(cellKey(cell))) cell.protected = true;
        const encounter = api.SpinnerNativeField.ensureMap({ scenario: "mapgen-enclosure" }),
            ai = ensureAI(encounter, { mapSeed: mapSeed(), mapIdentity: mapIdentity() }),
            distances = routeDistances(snapshot, undefined, new Set(), options.maxFields > 1),
            geometry = enclosureGeometryFor(snapshot, options.maxFields > 1),
            authoredSites = options.maxFields > 1 ? options.preferredSites || [] : [],
            fields = [],
            attempted = new Set(),
            maximum = Math.max(1, Math.min(deploymentLimit, options.maxFields || 1));
        encounter.autonomous = true;
        auditGroups(ai, KDMapData.Entities, { mapSnapshot: snapshot, routeDistances: distances });
        const assignedSites = new Set(
            KDMapData.Entities.filter((entity) => entity.SpiderlingsPresetFieldCenter).map((entity) =>
                cellKey(entity.SpiderlingsPresetFieldCenter),
            ),
        );
        while (fields.length < maximum) {
            const occupied =
                maximum > 1 ? new Set(KDMapData.Entities.filter((entity) => entity.hp > 0).map(cellKey)) : undefined;
            const choices = Object.values(ai.groups)
                .filter(
                    (group) =>
                        !group.planId && !group.engagement && group.memberIds.length >= 2 && !attempted.has(group.id),
                )
                .flatMap((group) => {
                    const members = group.memberIds
                        .map((id) => KDMapData.Entities.find((entity) => entity.id === id))
                        .filter((entity) => eligibleSpinner(entity) && !sourceBusy(entity));
                    if (members.length < 2) return [];
                    const assigned = members[0].SpiderlingsPresetFieldCenter,
                        candidateCenters = authoredSites.length
                            ? authoredSites.filter((site) =>
                                  assigned ? cellKey(site) === cellKey(assigned) : !assignedSites.has(cellKey(site)),
                              )
                            : undefined;
                    return analyzeEnclosureCandidates(
                        snapshot,
                        { ...group, members },
                        distances,
                        undefined,
                        { ...geometry, occupied, candidateCenters },
                        2,
                    ).map((candidate) => ({
                        group,
                        candidate,
                        preferred: nearestDistance(candidate.center, options.preferredSites || []),
                    }));
                })
                .sort(
                    (left, right) =>
                        right.candidate.radius - left.candidate.radius ||
                        left.preferred - right.preferred ||
                        left.candidate.travelDistance - right.candidate.travelDistance ||
                        compareSites(left.candidate, right.candidate) ||
                        left.group.id.localeCompare(right.group.id),
                );
            if (!choices.length) break;
            const { group, candidate } = choices[0];
            attempted.add(group.id);
            const plan = selectSavedPlan(ai, group, [candidate]),
                added = api.SpinnerNativeField.addEnclosure({
                    compositeId: plan.compositeId,
                    groupId: group.id,
                    owners: group.memberIds,
                    layers: plan.layers,
                    constructionOrder: "outer-first",
                    autoSeal: false,
                    prebuiltOuter: true,
                    scenario: "mapgen-enclosure",
                });
            if (!added?.added) {
                plan.status = "invalid";
                plan.invalidReason = added?.reason || "creation-failed";
                group.planId = null;
                continue;
            }
            plan.provenance = "mapgen";
            plan.status = "preparing";
            fields.push({
                compositeId: plan.compositeId,
                groupId: group.id,
                center: clone(plan.center),
                radius: candidate.radius,
            });
        }
        ai.mapgenField = fields.length
            ? { status: "placed", ...fields[0], fields }
            : { status: "skipped", reason: "no-legal-staffed-site", fields: [] };
        mapCache = undefined;
        return clone(ai.mapgenField);
    }
    function workCells(target, snapshot, member) {
        const byKey = snapshotCellsByKey(snapshot);
        return DIRECTIONS.map((direction) => ({ x: target.x + direction.x, y: target.y + direction.y }))
            .filter((cell) => {
                const value = byKey.get(cellKey(cell));
                return (
                    value?.floor &&
                    !value.protected &&
                    !value.locked &&
                    (!member ||
                        !api.SpinnerNativeField.snapshot(cell).actorOccupied ||
                        cellKey(cell) === cellKey(member))
                );
            })
            .sort((a, b) => cellKey(a).localeCompare(cellKey(b)));
    }

    function assignmentKey(assignment) {
        return assignment.key || api.SpinnerTopology.workKey(assignment);
    }

    function assignmentField(encounter, assignment) {
        const graph = encounter?.topology;
        return (
            api.SpinnerNativeField.fieldById(encounter, assignment?.fieldId) ||
            (graph?.fields?.[assignment?.fieldId] ? graph : undefined)
        );
    }

    function assignmentPending(encounter, assignment, ownerId) {
        if (!assignment?.target || !assignment?.workCell) return false;
        return api.SpinnerTopology.inspectWorkAction(encounter?.topology, {
            ...assignment,
            ownerId,
            cell: assignment.target,
        }).pending;
    }

    function assignmentFromAction(action, workCell) {
        return {
            ...clone(action),
            key: assignmentKey(action),
            target: clone(action.cell),
            workCell: clone(workCell),
        };
    }

    function hasGateWork(encounter, group) {
        const plan = encounter.ai?.plans?.[group.planId],
            graph = encounter.topology,
            composite = graph?.composites?.[plan?.compositeId];
        return !!(
            composite &&
            composite.layerIds.some(
                (id) =>
                    graph.fields[id]?.reopenPending ||
                    (graph.fields[id]?.kind === "passage" &&
                        ["preparing", "sealing"].includes(graph.fields[id].phase)) ||
                    (composite.closureArmed && !api.SpinnerTopology.isLayerClosed(graph, id)),
            )
        );
    }

    function maintenanceFieldPending(encounter, group) {
        const job = group.maintenance,
            graph = encounter.topology,
            field = graph?.fields?.[job?.fieldId],
            capture = api.SpinnerCapture?.state?.();
        return !!(
            field &&
            !field.retired &&
            capture?.admittedCompositeId === field.compositeId &&
            (!api.SpinnerTopology.isLayerClosed(graph, field.id) ||
                graph.links.some((link) => link.owners.includes(field.id) && link.hp < link.maxHp) ||
                graph.anchors.some((anchor) => anchor.owners.includes(field.id) && anchor.hp < anchor.maxHp))
        );
    }

    function hasMaintenanceAssignment(enemy) {
        const encounter = api.SpinnerNativeField.state(),
            group = Object.values(encounter?.ai?.groups || {}).find((entry) => entry.memberIds.includes(enemy?.id)),
            assignment = group?.assignments?.[enemy?.id];
        if (
            !assignment ||
            !eligibleSpinner(enemy) ||
            sourceBusy(enemy) ||
            !(encounter.ai.plans[group.planId]?.fieldIds || [encounter.ai.plans[group.planId]?.fieldId]).includes(
                assignment?.fieldId,
            ) ||
            !assignmentPending(encounter, assignment, enemy.id)
        )
            return false;
        return !!(
            assignment.maintenance ||
            (group.maintenance?.memberId === enemy.id &&
                group.maintenance.fieldId === assignment.fieldId &&
                assignment.type !== "rally" &&
                maintenanceFieldPending(encounter, group)) ||
            api.SpinnerTopology.inspectWorkAction(encounter.topology, assignment).maintenance ||
            (api.SpinnerCapture?.state?.() &&
                hasGateWork(encounter, group) &&
                api.SpinnerTopology.inspectWorkAction(encounter.topology, assignment).gateWork &&
                !api.SpinnerTopology.inspectWorkAction(encounter.topology, assignment).opensGate)
        );
    }

    function proposeCaptureMaintenance(encounter, snapshot, distances) {
        for (const group of Object.values(encounter.ai.groups)) delete group.maintenanceOffer;
        const capture = api.SpinnerCapture?.state?.();
        if (!capture || !api.SpinnerCapture.releaseMaintenanceSource) return;
        const sources = (capture.sourceIds || [])
            .map((id) => KDMapData.Entities.find((entity) => entity.id === id))
            .filter((entity) => eligibleSpinner(entity));
        if (sources.length < 2) return;
        for (const group of Object.values(encounter.ai.groups)) {
            const plan = encounter.ai.plans[group.planId];
            if (plan?.compositeId !== capture.admittedCompositeId) continue;
            if (
                hasMaintenanceAssignment(
                    KDMapData.Entities.find((entity) => entity.id === group.maintenance?.memberId),
                ) ||
                Object.values(group.assignments).some(
                    (assignment) =>
                        assignment.maintenance ||
                        api.SpinnerTopology.inspectWorkAction(encounter.topology, assignment).maintenance,
                )
            )
                continue;
            const reserved = new Set(Object.values(group.assignments).map(assignmentKey)),
                occupied = new Set(Object.values(group.assignments).map((assignment) => cellKey(assignment.workCell))),
                options = [];
            for (const member of sources.filter((entity) => group.memberIds.includes(entity.id))) {
                if (
                    api.SpinnerRecovery?.sourceIds?.().includes(member.id) ||
                    api.SpinnerNPCCapture?.usesSource?.(member.id) ||
                    api.SpinnerNPCRecovery?.usesEntity?.(member.id) ||
                    member.SpiderlingsTaskNestDefenderTarget !== undefined
                )
                    continue;
                const skipped = new Set(reserved);
                let action = nextGroupWork(encounter, group, member, [...skipped]);
                while (action?.cell) {
                    const key = assignmentKey(action);
                    if (skipped.has(key)) break;
                    skipped.add(key);
                    const workStatus = api.SpinnerTopology.inspectWorkAction(encounter.topology, {
                            ...action,
                            ownerId: member.id,
                        }),
                        maintenance = workStatus.maintenance;
                    if (
                        maintenance &&
                        workStatus.pending &&
                        (!api.SpinnerNativeField.snapshot(action.cell).actorOccupied ||
                            workStatus.allowsOccupiedTarget ||
                            cellKey(member) === cellKey(action.cell))
                    ) {
                        const work = workCells(action.cell, snapshot, member)
                                .filter((cell) => !occupied.has(cellKey(cell)))
                                .sort((a, b) => distances(member, a) - distances(member, b))[0],
                            steps = work ? distances(member, work) : Infinity;
                        if (Number.isFinite(steps)) options.push({ member, action, work, steps });
                    }
                    action = nextGroupWork(encounter, group, member, [...skipped]);
                }
            }
            options.sort((a, b) => a.steps - b.steps || String(a.member.id).localeCompare(String(b.member.id)));
            const chosen = options[0];
            if (chosen)
                group.maintenanceOffer = {
                    memberId: chosen.member.id,
                    assignment: { ...assignmentFromAction(chosen.action, chosen.work), maintenance: true },
                };
        }
    }

    function nextGroupWork(encounter, group, member, reserved) {
        const plan = encounter.ai.plans[group.planId];
        return api.SpinnerTopology.nextWorkAction(
            encounter.topology,
            member.id,
            member,
            reserved,
            plan?.fieldIds || [plan?.fieldId],
        );
    }

    function reserveActions(encounter, snapshot, distances = routeDistances(snapshot)) {
        const ai = ensureAI(encounter),
            entities = new Map(KDMapData.Entities.map((entity) => [entity.id, entity]));
        for (const group of Object.values(ai.groups)) {
            const previousAssignments = group.assignments || {};
            group.assignments = {};
            const hasPendingMaintenanceWork = (member) => {
                // Legacy lines use their own task list and may not have an area graph yet.
                if (!plan?.compositeId) return false;
                const action = nextGroupWork(encounter, group, member, []);
                // A free lure is still a repair worker, including the paid journey
                // to the wall. Counting it as available but excluding that journey
                // prevents both maintenance and the request for another worker.
                return api.SpinnerTopology.inspectWorkAction(encounter.topology, action).maintenance;
            };
            const plan = ai.plans[group.planId],
                field = plan?.kind === "line" ? api.SpinnerNativeField.fieldById(encounter, plan.fieldId) : undefined,
                graph = encounter.topology,
                members = group.memberIds
                    .map((id) => entities.get(id))
                    .filter(
                        (entity) =>
                            eligibleSpinner(entity) &&
                            !sourceBusy(entity) &&
                            (hasGateWork(encounter, group) ||
                                String(entity.id) !== String(group.engagement?.lureId) ||
                                encounter.command?.requests[encounter.command.members[entity.id]?.requestId]?.kind ===
                                    "repair" ||
                                hasPendingMaintenanceWork(entity) ||
                                previousAssignments[entity.id]?.maintenance ||
                                (group.maintenance?.memberId === entity.id &&
                                    maintenanceFieldPending(encounter, group)) ||
                                api.SpinnerTopology.inspectWorkAction(graph, previousAssignments[entity.id])
                                    .maintenance),
                    ),
                tasks = field ? api.SpinnerTopology.lineWorkActions(field, members.length >= 2) : [],
                reservedTasks = new Set(),
                reservedWork = new Set();
            const known = groupObservation(group),
                lureKeepsPressure =
                    known &&
                    known.age < 4 &&
                    plan?.compositeId &&
                    api.SpinnerTopology.isInsideCommonCore(graph, plan.compositeId, known) &&
                    !api.SpinnerNativeField.captureGeometryReady(known),
                bodyWorkerAvailable = (action) =>
                    members.some(
                        (member) =>
                            String(member.id) !== String(group.engagement?.lureId) &&
                            workCells(action.cell || action.target, snapshot, member).some(
                                (cell) => !reservedWork.has(cellKey(cell)) && Number.isFinite(distances(member, cell)),
                            ),
                    );
            const workDistance = new Map();
            if (["passage", "enclosure"].includes(plan?.kind))
                for (const member of members) {
                    const action = nextGroupWork(encounter, group, member, []);
                    workDistance.set(member.id, action?.cell ? distances(action.cell, member) : Infinity);
                }
            for (const member of members.sort(
                (a, b) =>
                    (["passage", "enclosure"].includes(plan?.kind)
                        ? workDistance.get(a.id) - workDistance.get(b.id)
                        : 0) || String(a.id).localeCompare(String(b.id)),
            )) {
                const previous = previousAssignments[member.id],
                    retainedTask =
                        previous &&
                        (field
                            ? tasks.find((task) => task.key === previous.key)
                            : assignmentPending(encounter, previous, member.id)),
                    retainedWork = previous?.workCell,
                    canRetain =
                        retainedTask &&
                        (!api.SpinnerNativeField.snapshot(previous.target).actorOccupied ||
                            cellKey(previous.target) === cellKey(member) ||
                            api.SpinnerTopology.inspectWorkAction(graph, previous).allowsOccupiedTarget) &&
                        !(
                            lureKeepsPressure &&
                            previous.role === "body" &&
                            String(member.id) === String(group.engagement?.lureId) &&
                            bodyWorkerAvailable(previous)
                        ) &&
                        (plan?.constructionOrder !== "outer-first" ||
                            nextGroupWork(encounter, group, member, [...reservedTasks])?.fieldId ===
                                previous.fieldId) &&
                        retainedWork &&
                        !reservedTasks.has(assignmentKey(field ? retainedTask : previous)) &&
                        !reservedWork.has(cellKey(retainedWork)) &&
                        workCells(
                            field ? api.SpinnerTopology.inspectWorkAction(field, retainedTask).cell : previous.target,
                            snapshot,
                            member,
                        ).some((cell) => cellKey(cell) === cellKey(retainedWork)) &&
                        Number.isFinite(distances(member, retainedWork));
                if (canRetain) {
                    group.assignments[member.id] = field
                        ? {
                              ...clone(retainedTask),
                              target: clone(api.SpinnerTopology.inspectWorkAction(field, retainedTask).cell),
                              workCell: clone(retainedWork),
                              fieldId: plan.fieldId,
                          }
                        : clone(previous);
                    reservedTasks.add(assignmentKey(group.assignments[member.id]));
                    reservedWork.add(cellKey(retainedWork));
                    continue;
                }
                if (!field && graph?.fields && plan?.compositeId) {
                    // Topology owns layer order; an occupied job must not hide other
                    // legal work in that layer. Skips are local to this worker, since
                    // a colleague on the other side may still reach the same job.
                    const skipped = new Set(reservedTasks);
                    let action = nextGroupWork(encounter, group, member, [...skipped]);
                    const firstField = action?.fieldId;
                    while (action?.cell && action.fieldId === firstField) {
                        const key = assignmentKey(action);
                        if (skipped.has(key)) break;
                        skipped.add(key);
                        const blockedTarget =
                            api.SpinnerNativeField.snapshot(action.cell).actorOccupied &&
                            cellKey(action.cell) !== cellKey(member) &&
                            !api.SpinnerTopology.inspectWorkAction(encounter.topology, action).allowsOccupiedTarget;
                        const keepsPressure =
                            lureKeepsPressure &&
                            action.role === "body" &&
                            !api.SpinnerTopology.inspectWorkAction(encounter.topology, action).maintenance &&
                            String(member.id) === String(group.engagement?.lureId) &&
                            bodyWorkerAvailable(action);
                        const work =
                            !blockedTarget && !keepsPressure
                                ? workCells(action.cell, snapshot, member)
                                      .filter((cell) => !reservedWork.has(cellKey(cell)))
                                      .sort(
                                          (a, b) =>
                                              distances(member, a) - distances(member, b) ||
                                              cellKey(a).localeCompare(cellKey(b)),
                                      )[0]
                                : undefined;
                        if (work && Number.isFinite(distances(member, work))) {
                            group.assignments[member.id] = assignmentFromAction(action, work);
                            reservedTasks.add(key);
                            reservedWork.add(cellKey(work));
                            break;
                        }
                        action = nextGroupWork(encounter, group, member, [...skipped]);
                    }
                    continue;
                }
                const options = tasks
                    .filter((task) => !reservedTasks.has(task.key))
                    .map((task) => {
                        const target = api.SpinnerTopology.inspectWorkAction(field, task).cell,
                            work = workCells(target, snapshot, member)
                                .filter((cell) => !reservedWork.has(cellKey(cell)))
                                .sort(
                                    (a, b) =>
                                        distances(member, a) - distances(member, b) ||
                                        cellKey(a).localeCompare(cellKey(b)),
                                )[0];
                        return {
                            task,
                            target,
                            work,
                            steps: work ? distances(member, work) : Infinity,
                        };
                    })
                    .filter((option) => option.work && Number.isFinite(option.steps))
                    .sort((a, b) => a.steps - b.steps || a.task.key.localeCompare(b.task.key));
                if (!options[0]) continue;
                const chosen = options[0];
                group.assignments[member.id] = {
                    ...clone(chosen.task),
                    target: clone(chosen.target),
                    workCell: clone(chosen.work),
                    fieldId: plan.fieldId,
                };
                reservedTasks.add(chosen.task.key);
                reservedWork.add(cellKey(chosen.work));
            }
        }
    }

    function reserveRallyPositions(encounter, snapshot, distances) {
        const byKey = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell]));
        for (const group of Object.values(encounter.ai.groups)) {
            const plan = encounter.ai.plans[group.planId],
                field = encounter.topology?.fields?.[plan?.fieldId];
            if (plan?.kind !== "passage" || !field || ["invalid", "abandoned", "retired"].includes(plan.status))
                continue;
            const members = group.memberIds.map((id) => KDMapData.Entities.find((entity) => entity.id === id)),
                reserved = new Set(Object.values(group.assignments).map((action) => cellKey(action.workCell))),
                known = groupObservation(group),
                supporting =
                    known &&
                    known.age < 4 &&
                    field.phase === "sealed" &&
                    api.SpinnerTopology.isInsideCommonCore(encounter.topology, plan.compositeId, known),
                points = new Map(
                    fieldStandbyCells(encounter.ai, group, snapshot, encounter.topology).map((cell) => [
                        cellKey(cell),
                        cell,
                    ]),
                ),
                coverage = new Map(field.gates.map((gate) => [gate.id, 0])),
                nearestGate = (point) =>
                    [...field.gates].sort(
                        (a, b) =>
                            nearestDistance(point, a.cells) - nearestDistance(point, b.cells) ||
                            a.id.localeCompare(b.id),
                    )[0];
            const rallyMembers = members.filter((member) => eligibleSpinner(member) && !sourceBusy(member)),
                memberSignature = rallyMembers
                    .map((member) => String(member.id))
                    .sort()
                    .join(","),
                staffingChanged = group.rallyMembers !== undefined && group.rallyMembers !== memberSignature;
            if (field.phase === "ready" && (group.rallyPhase !== "ready" || staffingChanged)) group.rallyGates = {};
            if (field.phase === "ready" && group.rallyPhase === "ready" && !staffingChanged) {
                const blocked = new Set(
                    [
                        ...KDMapData.Entities.filter(
                            (actor) => actor.hp > 0 && !api.SpinnerNativeField.isOwnedProxy(actor),
                        ),
                        KinkyDungeonPlayerEntity,
                    ]
                        .filter(Boolean)
                        .map(cellKey),
                );
                const blockedPartition = rallyMembers.some((member) => {
                    const gateId = group.rallyGates?.[member.id];
                    if (!gateId || (points.has(cellKey(member)) && nearestGate(member).id === gateId)) return false;
                    const stationedBlocker = rallyMembers.some(
                        (other) =>
                            other !== member &&
                            distance(member, other) <= 1 &&
                            points.has(cellKey(other)) &&
                            nearestGate(other).id === group.rallyGates?.[other.id],
                    );
                    if (!stationedBlocker) return false;
                    const occupied = new Set(blocked);
                    occupied.delete(cellKey(member));
                    const destinations = [...points.values()].filter((point) => nearestGate(point).id === gateId);
                    return (
                        destinations.length > 0 &&
                        destinations.every((point) => !routeOnSnapshot(snapshot, member, point, occupied).length)
                    );
                });
                // Repartition only when a coworker already holding its mouth
                // makes the saved assignment unreachable through live occupancy.
                if (blockedPartition) group.rallyGates = {};
            }
            group.rallyPhase = field.phase;
            group.rallyMembers = memberSignature;
            group.rallyGates ||= {};
            for (const id of Object.keys(group.rallyGates))
                if (!members.some((member) => String(member?.id) === id && eligibleSpinner(member)))
                    delete group.rallyGates[id];
            const unassigned = members.filter(
                    (member) => eligibleSpinner(member) && !sourceBusy(member) && !group.rallyGates[member.id],
                ),
                gateOrder = [...field.gates].sort(
                    (a, b) =>
                        Math.min(...members.filter(Boolean).map((member) => distances(b.cells[0], member))) -
                            Math.min(...members.filter(Boolean).map((member) => distances(a.cells[0], member))) ||
                        a.id.localeCompare(b.id),
                );
            // Include the workers still needed at other mouths. Picking the
            // closest core worker first can send a remote colleague through its
            // completed station. Ties still send the front worker through first.
            for (const gate of gateOrder) {
                if (Object.values(group.rallyGates).includes(gate.id) || !unassigned.length) continue;
                const otherGates = gateOrder
                        .filter((other) => other !== gate && !Object.values(group.rallyGates).includes(other.id))
                        .slice(0, unassigned.length - 1),
                    coverageDistance = (member) =>
                        distances(gate.cells[0], member) +
                        otherGates.reduce(
                            (total, other) =>
                                total +
                                Math.min(
                                    ...unassigned
                                        .filter((candidate) => candidate !== member)
                                        .map((candidate) => distances(other.cells[0], candidate)),
                                ),
                            0,
                        );
                unassigned.sort(
                    (a, b) =>
                        coverageDistance(a) - coverageDistance(b) ||
                        distances(gate.cells[0], a) - distances(gate.cells[0], b) ||
                        String(a.id).localeCompare(String(b.id)),
                );
                group.rallyGates[unassigned.shift().id] = gate.id;
            }
            for (const action of Object.values(group.assignments)) {
                const gate = nearestGate(action.workCell);
                coverage.set(gate.id, coverage.get(gate.id) + 1);
            }
            if (supporting)
                for (const point of [...field.interiorCells, ...field.gates.flatMap((gate) => gate.cells)]) {
                    const tile = byKey.get(cellKey(point));
                    if (tile?.floor && !tile.locked && !tile.protected) points.set(cellKey(point), point);
                }
            group.incomingIds = members
                .filter((member) => member && distances(plan.center, member) > 3)
                .map((member) => member.id);
            group.staffing = {
                available: members.filter((member) => eligibleSpinner(member) && !sourceBusy(member)).length,
                incoming: group.incomingIds.length,
                nearCore: members.filter((member) => eligibleSpinner(member) && distance(member, plan.center) <= 1)
                    .length,
            };
            for (const member of members) {
                if (
                    !eligibleSpinner(member) ||
                    sourceBusy(member) ||
                    group.assignments[member.id] ||
                    String(member.id) === String(group.engagement?.lureId)
                )
                    continue;
                const choices = [...points.values()]
                    .filter(
                        (point) =>
                            (supporting ||
                                !group.rallyGates[member.id] ||
                                nearestGate(point).id === group.rallyGates[member.id]) &&
                            !reserved.has(cellKey(point)) &&
                            (!api.SpinnerNativeField.snapshot(point).actorOccupied ||
                                cellKey(point) === cellKey(member)),
                    )
                    .map((point) => ({
                        point,
                        steps: distances(member, point),
                        gate: nearestGate(point),
                        // Keep support on the far side of the observed approach, leaving the mouth to the lure.
                        approach: known ? distances(known, point) : 0,
                    }))
                    .filter((choice) => Number.isFinite(choice.steps))
                    .sort(
                        (a, b) =>
                            (supporting ? distance(a.point, known) - distance(b.point, known) : 0) ||
                            coverage.get(a.gate.id) - coverage.get(b.gate.id) ||
                            Number(b.approach > 3) - Number(a.approach > 3) ||
                            a.steps - b.steps ||
                            cellKey(a.point).localeCompare(cellKey(b.point)),
                    );
                const point = choices[0]?.point;
                if (!point) continue;
                const gate = choices[0].gate;
                coverage.set(gate.id, coverage.get(gate.id) + 1);
                reserved.add(cellKey(point));
                group.assignments[member.id] = {
                    type: "rally",
                    gateId: gate.id,
                    key: `rally:${cellKey(point)}`,
                    fieldId: plan.fieldId,
                    target: clone(point),
                    workCell: clone(point),
                };
            }
        }
    }

    function resetLureApproach(group) {
        if (!group.engagement) return;
        group.engagement.mode = "pressure";
        delete group.engagement.progress;
    }

    function adjustEnclosureApproach(encounter, group, snapshot, distances) {
        const plan = encounter.ai.plans[group.planId],
            composite = encounter.topology?.composites?.[plan?.compositeId],
            known =
                encounter.ai.projects?.positions?.find(
                    (position) =>
                        position.target.kind === plan?.planningFocus?.target?.kind &&
                        String(position.target.id) === String(plan?.planningFocus?.target?.id),
                ) || groupObservation(group),
            turn = encounter.ai.coordinationTurn || 0;
        if (
            plan?.kind !== "enclosure" ||
            !composite ||
            composite.closureArmed ||
            composite.autoSeal ||
            !known ||
            known.age >= 4 ||
            turn - (plan.lastGateTurn ?? -8) < 8
        )
            return;
        if (composite.layerIds.some((id) => encounter.topology.fields[id]?.reopenPending)) return;
        if (plan.gateFocus && cellKey(plan.gateFocus) === cellKey(known)) return;
        plan.gateFocus = { x: known.x, y: known.y };
        let changed = false;
        for (const id of composite.layerIds) {
            const field = encounter.topology.fields[id];
            if (!field || field.retired || field.reopenPending) continue;
            const cells = snapshotCellsByKey(snapshot),
                candidates = field.boundaryCells.filter(
                    (cell) =>
                        !encounter.topology.anchors.some((anchor) => cellKey(anchor) === cellKey(cell)) &&
                        (cells.get(cellKey(cell))?.walkable ?? cells.get(cellKey(cell))?.floor) &&
                        !cells.get(cellKey(cell))?.protected,
                ),
                gate = candidates.sort(
                    (a, b) =>
                        distances(a, known) - distances(b, known) ||
                        distance(a, field.core) - distance(b, field.core) ||
                        Number(cellKey(b) === cellKey(field.gateCell)) -
                            Number(cellKey(a) === cellKey(field.gateCell)) ||
                        cellKey(a).localeCompare(cellKey(b)),
                )[0];
            if (gate) changed = api.SpinnerNativeField.setEnclosureGate(id, gate).changed || changed;
        }
        if (changed) {
            plan.lastGateTurn = turn;
            group.assignments = {};
            resetLureApproach(group);
        }
    }

    function adjustPassageApproach(encounter, group, snapshot, distances) {
        const plan = encounter.ai.plans[group.planId],
            field = encounter.topology?.fields?.[plan?.fieldId],
            known =
                encounter.ai.projects?.positions?.find(
                    (position) =>
                        position.target.kind === plan?.planningFocus?.target?.kind &&
                        String(position.target.id) === String(plan?.planningFocus?.target?.id),
                ) || groupObservation(group),
            turn = encounter.ai.coordinationTurn || 0;
        if (
            plan?.kind !== "passage" ||
            !field ||
            !known ||
            known.age >= 4 ||
            field.retired ||
            encounter.topology.composites[field.compositeId]?.closureArmed ||
            turn - (plan.lastGateTurn ?? -8) < 8 ||
            group.memberIds.some((id) => sourceBusy(KDMapData.Entities.find((entity) => entity.id === id)))
        )
            return;
        const sorted = [...field.gates].sort(
                (a, b) => distances(a.cells[0], known) - distances(b.cells[0], known) || a.id.localeCompare(b.id),
            ),
            entrance = sorted[0],
            remaining = sorted.slice(1),
            exit = snapshot.exits?.[0];
        if (!entrance || !remaining.length) return;
        remaining.sort(
            (a, b) =>
                (exit ? distances(a.cells[0], exit) - distances(b.cells[0], exit) : 0) || a.id.localeCompare(b.id),
        );
        plan.entranceGateId = entrance.id;
        plan.throughGateId = remaining[0].id;
        const result = api.SpinnerNativeField.setPassageOpenGates(field.id, [entrance.id, remaining[0].id]);
        if (result.changed) {
            plan.lastGateTurn = turn;
            group.assignments = {};
            resetLureApproach(group);
        }
    }

    function mapSeed() {
        return String(KDGameData?.LastMapSeed ?? KDMapData?.MapSeed ?? "spinner-map");
    }

    function mapIdentity() {
        return String(KDMapData?.RoomType ?? KDMapData?.MapMod ?? `${KDMapData?.GridWidth}x${KDMapData?.GridHeight}`);
    }

    function snapshotCellsByKey(snapshot) {
        // Native terrain and tile-metadata edits replace the cached snapshot;
        // actor occupancy remains a fresh, separate query in planning.
        if (mapCache?.snapshot === snapshot) {
            if (!mapCache.cellsByKey)
                mapCache.cellsByKey = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell]));
            return mapCache.cellsByKey;
        }
        return new Map(snapshot.cells.map((cell) => [cellKey(cell), cell]));
    }

    function staticCandidateLegal(candidate, snapshot) {
        const cells = snapshotCellsByKey(snapshot);
        if (candidate.kind === "passage")
            return (
                candidate.gates.every((gate) =>
                    gate.cells.every((point) => {
                        const cell = cells.get(cellKey(point));
                        return cell?.floor && !cell.protected && !cell.locked;
                    }),
                ) &&
                candidate.nativeWallCells.every((point) => cells.get(cellKey(point))?.wall) &&
                candidate.interiorCells.every((point) => {
                    const cell = cells.get(cellKey(point));
                    return (cell?.walkable ?? cell?.floor) && !cell?.locked;
                })
            );
        return (candidate.initialCells || candidate.cells).every((key) => {
            const cell = cells.get(key);
            return cell?.floor && !cell.protected && !cell.locked;
        });
    }

    function geometrySignature(snapshot) {
        if (mapCache?.snapshot === snapshot && mapCache.signature) return mapCache.signature;
        let value = 2166136261;
        for (const cell of snapshot.cells || [])
            value = Math.imul(
                value ^
                    (Number(!!cell.floor) |
                        (Number(!!cell.protected) << 1) |
                        (Number(!!cell.locked) << 2) |
                        (Number(!!cell.wall) << 3) |
                        (Number(!!(cell.walkable ?? cell.floor)) << 4)),
                16777619,
            );
        const signature = `${snapshot.width}x${snapshot.height}:${value >>> 0}`;
        if (mapCache?.snapshot === snapshot) mapCache.signature = signature;
        return signature;
    }

    function planningSignature(ai, members) {
        const occupied = KDMapData.Entities.filter(
                (entity) =>
                    entity.hp > 0 &&
                    entity.Enemy?.tags?.spiderlings !== true &&
                    !api.SpinnerNativeField.isOwnedProxy(entity),
            )
                .map(cellKey)
                .sort()
                .join(";"),
            origins = members.map(cellKey).sort().join(";");
        return `${ai.geometrySignature}:${ai.candidateRevision}:${origins}:${occupied}:${cellKey(KinkyDungeonPlayerEntity)}`;
    }

    function invalidatePlan(encounter, group, reason, _snapshot, _distances, _lines, work) {
        if (work) work.failedSiteReplans++;
        else if (encounter.ai.plannerWorkLast)
            encounter.ai.plannerWorkLast.failedSiteReplans = (encounter.ai.plannerWorkLast.failedSiteReplans || 0) + 1;
        return api.FieldProjects.invalidate(encounter, group, reason);
    }

    function expandPlan(encounter, plan, group, snapshot, work) {
        if (plan?.kind !== "enclosure") return;
        const graph = encounter.topology,
            composite = graph?.composites?.[plan.compositeId],
            innerId = composite?.layerIds.at(-1),
            inner = graph?.fields?.[innerId];
        if (!composite || !plan.center || !plan.gate) return;
        composite.constructionOrder = "outer-first";
        plan.constructionOrder = "outer-first";
        if (!inner || composite.layerIds.length >= 3 || composite.closureArmed) return;
        const outer = graph.fields[composite.layerIds.at(-1)],
            radius = (outer.bounds.right - outer.bounds.left) / 2 + 1,
            center = plan.center,
            boundary = ringCells(center, radius),
            byKey = snapshotCellsByKey(snapshot),
            occupied = new Set(
                KDMapData.Entities.filter(
                    (entity) =>
                        entity.hp > 0 &&
                        !api.SpinnerNativeField.isOwnedProxy(entity) &&
                        entity.Enemy?.tags?.spiderlings !== true,
                ).map(cellKey),
            ),
            otherFields = new Set(
                Object.values(encounter.ai.plans)
                    .filter((other) => other !== plan && !["invalid", "abandoned", "retired"].includes(other.status))
                    .flatMap((other) => other.cells || []),
            ),
            signature = `${geometrySignature(snapshot)}:${boundary
                .map((cell) => {
                    const tile = byKey.get(cellKey(cell));
                    return `${Number(!!tile?.floor)}${Number(!!tile?.protected)}${Number(!!tile?.locked)}${Number(occupied.has(cellKey(cell)))}${Number(otherFields.has(cellKey(cell)))}`;
                })
                .join("")}`;
        if (work) work.expansionCells += boundary.length;
        if (plan.expansionBlockedSignature === signature) return;
        if (
            boundary.some((cell) => {
                const tile = byKey.get(cellKey(cell));
                return (
                    !tile?.floor ||
                    tile.protected ||
                    tile.locked ||
                    occupied.has(cellKey(cell)) ||
                    otherFields.has(cellKey(cell))
                );
            })
        ) {
            plan.expansionBlockedSignature = signature;
            return;
        }
        const gate = composite.autoSeal
            ? reachableGate(snapshot, center, radius, work, byKey)
            : {
                  x: center.x + Math.sign(plan.gate.x - center.x) * radius,
                  y: center.y + Math.sign(plan.gate.y - center.y) * radius,
              };
        if (!gate) {
            plan.expansionBlockedSignature = signature;
            return;
        }
        const exterior = { x: gate.x + Math.sign(gate.x - center.x), y: gate.y + Math.sign(gate.y - center.y) },
            exteriorTile = byKey.get(cellKey(exterior)),
            blockedBoundary = new Set(boundary.map(cellKey));
        if (
            !exteriorTile?.floor ||
            exteriorTile.locked ||
            [snapshot.entrances?.[0], snapshot.exits?.[0]]
                .filter(Boolean)
                .some((origin) => !routeOnSnapshot(snapshot, origin, exterior, blockedBoundary).length)
        ) {
            plan.expansionBlockedSignature = signature;
            return;
        }
        const fieldId = `${plan.fieldId}:ring:${radius}`,
            added = api.SpinnerNativeField.addEnclosureLayer({
                compositeId: plan.compositeId,
                owners: group.memberIds,
                layer: {
                    id: fieldId,
                    vertices: rectangle(center, radius),
                    gate,
                },
            });
        if (added.added) {
            plan.fieldIds ||= [...composite.layerIds.slice(0, -1)];
            plan.fieldIds.push(fieldId);
            plan.cells.push(...boundary.map(cellKey));
            delete plan.expansionBlockedSignature;
            expandPlan(encounter, plan, group, snapshot, work);
        } else plan.expansionBlockedSignature = signature;
    }

    function adoptExistingTopology(encounter, ai) {
        const graph = encounter.topology;
        if (graph?.kind !== "enclosure") return;
        const composite = Object.values(graph.composites || {})[0];
        if (!composite) return;
        for (const group of Object.values(ai.groups)) {
            if (group.planId) continue;
            if (!group.memberIds.some((id) => graph.owners.includes(id))) continue;
            const id = `spinner-plan-${ai.nextPlanOrdinal++}`;
            ai.plans[id] = {
                id,
                kind: "enclosure",
                groupId: group.id,
                fieldId: composite.layerIds[0],
                fieldIds: [...composite.layerIds],
                compositeId: composite.id,
                status: "preparing",
                center: clone(composite.core),
                anchors: graph.anchors.map((anchor) => ({ x: anchor.x, y: anchor.y })),
                cells: Object.values(graph.fields).flatMap((field) => field.boundaryCells.map(cellKey)),
                invalidReason: null,
            };
            group.planId = id;
            composite.groupId = group.id;
        }
    }

    function beginTurn(input = {}) {
        const encounter =
            api.SpinnerNativeField.state() ||
            (input.activate ? api.SpinnerNativeField.ensureMap({ scenario: "autonomous-line" }) : undefined);
        if (!encounter?.autonomous && !input.activate) return undefined;
        encounter.autonomous = true;
        const previousSnapshot = mapCache?.snapshot;
        const ai = ensureAI(encounter, {
                mapSeed: input.mapSeed ?? mapSeed(),
                mapIdentity: input.mapIdentity ?? mapIdentity(),
            }),
            snapshot = input.mapSnapshot || nativeMapSnapshot(),
            work = {
                mapScans: input.mapSnapshot || previousSnapshot === snapshot ? 0 : 1,
                distanceFieldBuilds: 0,
                lineCatalogueBuilds: 0,
                candidatesExamined: 0,
                candidateCells: 0,
                expansionCells: 0,
                routeChecks: 0,
                failedSiteReplans: 0,
            },
            index = passageIndex(snapshot, ai),
            distances = index
                ? (from, to) => api.SpinnerPassagePlanner.distance(index, from, to)
                : routeDistances(snapshot, work),
            entities = input.entities || KDMapData.Entities;
        workSnapshot = { map: KDMapData, snapshot };
        let lines, enclosureGeometry;
        const interceptionRoutes = new Map();
        // Share static geometry only within this turn; construction may change the next map snapshot.
        const signature = geometrySignature(snapshot),
            currentLines = () => {
                if (!lines) {
                    work.lineCatalogueBuilds++;
                    lines = lineCatalogue(snapshot);
                }
                return lines;
            },
            currentEnclosureGeometry = () => {
                if (!enclosureGeometry) {
                    enclosureGeometry = enclosureGeometryFor(snapshot);
                }
                return enclosureGeometry;
            };
        if (ai.geometrySignature && ai.geometrySignature !== signature) {
            ai.invalidCandidateIds = [];
            ai.candidateRevision++;
        }
        ai.geometrySignature = signature;
        auditGroups(ai, entities, {
            ...input,
            mapSnapshot: snapshot,
            routeDistances: distances,
            topology: encounter.topology,
        });
        refreshObservations(encounter);
        if (input.adoptExisting) adoptExistingTopology(encounter, ai);
        const candidatesFor = (group, members, replacingPlanId) => {
            const passages = passageCandidates(snapshot, { ...group, members }, ai, distances);
            const enclosures = [
                ...passages,
                ...analyzeEnclosureCandidates(
                    snapshot,
                    { ...group, members },
                    distances,
                    work,
                    currentEnclosureGeometry(),
                ),
            ].sort(compareSites);
            const candidates =
                enclosures.length || !Object.hasOwn(snapshot, "candidateLines")
                    ? enclosures
                    : analyzeLineCandidates(snapshot, { ...group, members }, distances, currentLines(), work);
            const occupied = new Set(
                Object.values(ai.plans)
                    .filter(
                        (plan) =>
                            plan.id !== replacingPlanId && !["invalid", "abandoned", "retired"].includes(plan.status),
                    )
                    .flatMap((plan) => plan.cells || []),
            );
            const available = candidates.filter(
                (candidate) =>
                    !ai.invalidCandidateIds.includes(candidate.id) &&
                    !candidate.cells.some((cell) => occupied.has(cellKey(cell))),
            );
            const focus = group.recoveryAround || group.planningFocus;
            const effective =
                !focus || Object.hasOwn(snapshot, "candidateLines")
                    ? available
                    : available.filter(
                          (candidate) =>
                              distance(candidate.center || candidate.anchors[0], focus) <=
                                  Math.max(6, (candidate.radius || 0) + 2) ||
                              planner.intercepts({ ...candidate, kind: candidate.type }, focus),
                      );
            const legalPassages = effective.filter((candidate) => candidate.type === "passage");
            const largeEnclosures = effective.filter(
                (candidate) => candidate.type === "enclosure" && candidate.radius >= 3,
            );
            return largeEnclosures.length ? largeEnclosures : legalPassages.length ? legalPassages : effective;
        };
        const projectFacts = new Map();
        const planner = {
            route: distances,
            lineFixture: Object.hasOwn(snapshot, "candidateLines"),
            geometrySignature: signature,
            facts(group) {
                const cacheKey = `${group.planId}:${group.memberIds.join(",")}`;
                const cached = projectFacts.get(group.id);
                if (cached?.key === cacheKey && cached.graph === encounter.topology) return cached.value;
                const members = group.memberIds
                    .map((id) => entities.find((entity) => entity.id === id))
                    .filter((entity) => eligibleSpinner(entity, input));
                const plan = ai.plans[group.planId];
                const canWork = (member) => {
                    if ([member.stun, member.freeze, member.channel, member.teleporting].some((value) => value > 0))
                        return false;
                    const plan = ai.plans[group.planId];
                    if (plan?.kind === "line") return true;
                    const skipped = new Set();
                    let action = nextGroupWork(encounter, group, member, []);
                    while (action?.cell) {
                        const key = assignmentKey(action);
                        if (skipped.has(key)) break;
                        skipped.add(key);
                        const status = api.SpinnerTopology.inspectWorkAction(encounter.topology, {
                            ...action,
                            ownerId: member.id,
                        });
                        if (
                            status.pending &&
                            (!api.SpinnerNativeField.snapshot(action.cell).actorOccupied ||
                                status.allowsOccupiedTarget ||
                                cellKey(member) === cellKey(action.cell)) &&
                            occupancyRoute(
                                member,
                                workCells(action.cell, snapshot, member).filter((cell) =>
                                    Number.isFinite(distances(member, cell)),
                                ),
                            ).length > 0
                        )
                            return true;
                        action = nextGroupWork(encounter, group, member, [...skipped]);
                    }
                    return false;
                };
                const value = {
                    members,
                    legal:
                        !plan || (staticCandidateLegal(plan, snapshot) && (plan.kind !== "line" || this.lineFixture)),
                    paid: !!plan && planHasPaidWork(encounter, plan),
                    signature: `${planningSignature(ai, members)}:${group.planningFocus?.x},${group.planningFocus?.y}`,
                    capableIds: plan ? members.filter(canWork).map((member) => member.id) : [],
                    blockReason: !members.length
                        ? "no-workers"
                        : members.every((member) =>
                                [member.stun, member.freeze, member.channel, member.teleporting].some(
                                    (number) => number > 0,
                                ),
                            )
                          ? "incapacitated"
                          : "work-route-blocked",
                };
                projectFacts.set(group.id, { key: cacheKey, graph: encounter.topology, value });
                return value;
            },
            candidates(group, members, replacing = false) {
                return candidatesFor(group, members, replacing ? group.planId : undefined);
            },
            prepare(group) {
                adjustPassageApproach(encounter, group, snapshot, distances);
                adjustEnclosureApproach(encounter, group, snapshot, distances);
            },
            intercepts(plan, target) {
                return (
                    ["passage", "enclosure"].includes(plan.kind) &&
                    (snapshot.exits || []).some((exit) => {
                        const key = `${cellKey(target)}:${cellKey(exit)}`;
                        if (!interceptionRoutes.has(key)) {
                            work.routeChecks++;
                            interceptionRoutes.set(key, new Set(routeOnSnapshot(snapshot, target, exit).map(cellKey)));
                        }
                        const route = interceptionRoutes.get(key);
                        const interior =
                            plan.interiorCells || encounter.topology?.fields?.[plan.fieldId]?.interiorCells;
                        if (interior) return interior.some((cell) => route.has(cellKey(cell)));
                        return (
                            !!plan.center &&
                            [...route].some((cell) => {
                                const [x, y] = cell.split(",").map(Number);
                                return distance({ x, y }, plan.center) < Math.min(plan.radius || 2, 2);
                            })
                        );
                    })
                );
            },
        };
        api.FieldProjects.prepareTurn(encounter, planner);
        for (const group of Object.values(ai.groups)) {
            const plan = ai.plans[group.planId];
            if (plan?.kind === "enclosure") expandPlan(encounter, plan, group, snapshot, work);
            if (plan)
                for (const fieldId of plan.fieldIds || [plan.fieldId])
                    api.SpinnerNativeField.setOwners(fieldId, api.FieldCommand.owners(encounter, group.id));
            if (
                group.maintenance &&
                (!maintenanceFieldPending(encounter, group) ||
                    !group.memberIds.includes(group.maintenance.memberId) ||
                    !baseEligibility(entities.find((entity) => entity.id === group.maintenance.memberId)))
            )
                delete group.maintenance;
            auditEngagement(encounter, group);
            adjustPassageApproach(encounter, group, snapshot, distances);
            adjustEnclosureApproach(encounter, group, snapshot, distances);
        }
        reserveActions(encounter, snapshot, distances);
        proposeCaptureMaintenance(encounter, snapshot, distances);
        reserveRallyPositions(encounter, snapshot, distances);
        let replacedApproach = false;
        for (const group of Object.values(ai.groups)) {
            const plan = ai.plans[group.planId],
                field = plan?.kind === "line" ? api.SpinnerNativeField.fieldById(encounter, plan.fieldId) : undefined,
                members = group.memberIds
                    .map((id) => entities.find((entity) => entity.id === id))
                    .filter((entity) => eligibleSpinner(entity, input));
            if (
                field &&
                members.length >= 1 &&
                api.SpinnerTopology.lineWorkActions(field, true).length > 0 &&
                Object.keys(group.assignments).length === 0 &&
                !group.engagement
            ) {
                invalidatePlan(
                    encounter,
                    group,
                    "approach",
                    snapshot,
                    distances,
                    currentLines(),
                    work,
                    currentEnclosureGeometry,
                );
                replacedApproach = true;
            }
        }
        if (replacedApproach) reserveActions(encounter, snapshot, distances);
        if (index) ai.passageMetrics = { ...index.metrics };
        ai.plannerWorkLast = work;
        ai.plannerWorkPeak = {
            mapScans: Math.max(ai.plannerWorkPeak?.mapScans || 0, work.mapScans),
            distanceFieldBuilds: Math.max(ai.plannerWorkPeak?.distanceFieldBuilds || 0, work.distanceFieldBuilds),
            lineCatalogueBuilds: Math.max(ai.plannerWorkPeak?.lineCatalogueBuilds || 0, work.lineCatalogueBuilds),
            candidatesExamined: Math.max(ai.plannerWorkPeak?.candidatesExamined || 0, work.candidatesExamined),
            candidateCells: Math.max(ai.plannerWorkPeak?.candidateCells || 0, work.candidateCells),
            expansionCells: Math.max(ai.plannerWorkPeak?.expansionCells || 0, work.expansionCells),
            routeChecks: Math.max(ai.plannerWorkPeak?.routeChecks || 0, work.routeChecks),
            failedSiteReplans: Math.max(ai.plannerWorkPeak?.failedSiteReplans || 0, work.failedSiteReplans),
        };
        return ai;
    }

    function record(group, category) {
        group.metrics ||= { travel: 0, construction: 0, wait: 0, yield: 0, repair: 0 };
        group.metrics[category] = (group.metrics[category] || 0) + 1;
        group.lastAction = category;
    }

    function planWaypoint(encounter, group) {
        const plan = encounter.ai?.plans?.[group.planId],
            composite = encounter.topology?.composites?.[plan?.compositeId];
        if (composite?.core) return clone(composite.core);
        if (plan?.anchors?.length)
            return {
                x: Math.round(plan.anchors.reduce((total, cell) => total + cell.x, 0) / plan.anchors.length),
                y: Math.round(plan.anchors.reduce((total, cell) => total + cell.y, 0) / plan.anchors.length),
            };
        return undefined;
    }

    function requiredCells(encounter, group) {
        const plan = encounter.ai?.plans?.[group.planId],
            result = [];
        if (plan?.compositeId)
            for (const fieldId of encounter.topology?.composites?.[plan.compositeId]?.layerIds || []) {
                const field = encounter.topology.fields?.[fieldId];
                if (field?.kind === "passage") result.push(...field.gates.flatMap((gate) => gate.cells));
                else if (field?.gateCell) result.push(field.gateCell);
            }
        for (const assignment of Object.values(group.assignments || {}))
            if (assignmentPending(encounter, assignment)) result.push(assignment.target, assignment.workCell);
        return result.filter(Boolean);
    }

    function needsSoleBuilder(encounter, group) {
        const plan = encounter.ai.plans[group.planId],
            composite = encounter.topology?.composites?.[plan?.compositeId];
        if (
            plan?.kind !== "enclosure" ||
            !composite?.layerIds.some((id) => encounter.topology.fields[id]?.phase === "preparing")
        )
            return false;
        // Keep one paid body worker until the enclosure is prepared, even with
        // personal prey contact. Recovery and adjacent defense remain separate duties.
        return (
            group.memberIds.filter((id) => {
                const member = KDMapData.Entities.find((entity) => String(entity.id) === String(id));
                return eligibleSpinner(member) && !sourceBusy(member);
            }).length === 1
        );
    }

    function selectLure(encounter, group, preferredIds = []) {
        if (needsSoleBuilder(encounter, group)) return undefined;
        const waypoint = planWaypoint(encounter, group),
            required = new Set(requiredCells(encounter, group).map(cellKey)),
            preferred = new Set(preferredIds.map(String));
        let candidates = group.memberIds
            .map((id) => KDMapData.Entities.find((entity) => String(entity.id) === String(id)))
            .filter((entity) => eligibleSpinner(entity) && !sourceBusy(entity));
        const clear = candidates.filter((entity) => !required.has(cellKey(entity)));
        if (clear.length) candidates = clear;
        return candidates.sort(
            (a, b) =>
                Number(preferred.has(String(b.id))) - Number(preferred.has(String(a.id))) ||
                (waypoint ? distance(a, waypoint) - distance(b, waypoint) : 0) ||
                String(a.id).localeCompare(String(b.id)),
        )[0];
    }

    function clearEngagement(group) {
        delete group.engagement;
    }

    function playerObservation(encounter = api.SpinnerNativeField.state()) {
        const report = encounter?.ai?.playerObservation;
        return report?.source === "native" &&
            report.age >= 0 &&
            report.age < 4 &&
            sameTarget(report.target, KinkyDungeonPlayerEntity)
            ? clone(report)
            : undefined;
    }

    function sharePlayerObservation(encounter, enemy, target, aiData, delta) {
        if (
            !(delta > 0) ||
            !encounter?.ai ||
            target !== KinkyDungeonPlayerEntity ||
            !eligibleObserver(enemy) ||
            !aiData.canSensePlayer ||
            aiData.hostile !== true ||
            !(aiData.recognized === true || recognizedPlayer(enemy, target))
        )
            return false;
        const previous = playerObservation(encounter),
            changed = !previous || previous.x !== target.x || previous.y !== target.y,
            report = {
                x: target.x,
                y: target.y,
                dx: changed ? (previous ? Math.sign(target.x - previous.x) : 0) : previous.dx,
                dy: changed ? (previous ? Math.sign(target.y - previous.y) : 0) : previous.dy,
                age: 0,
                source: "native",
                target: targetReference(target),
                reporterId: enemy.id,
            };
        encounter.ai.playerObservation = report;
        const visual = !!(
            aiData.canSeePlayer ||
            aiData.canSeePlayerChase ||
            aiData.canSeePlayerMedium ||
            aiData.canShootPlayer
        );
        for (const group of Object.values(encounter.ai.groups || {})) {
            if (!targetIsHostile(group, target)) continue;
            if (changed) delete group.noPlanSignature;
            // Knowledge does not replace an ongoing native NPC engagement.
            if (group.engagement && !sameTarget(group.engagement.target, target)) continue;
            if (!group.engagement) {
                group.engagement = {
                    target: targetReference(target),
                    sharedOnly: true,
                    mode: "pressure",
                    noSightTurns: 0,
                    lureNoContactTurns: 0,
                    compositeId: encounter.ai.plans[group.planId]?.compositeId || null,
                };
                group.engagement.lureId = selectLure(encounter, group, [enemy.id])?.id;
            }
            const known = clone(report);
            delete known.target;
            delete known.reporterId;
            group.engagement.lastKnown = known;
            const observations = observedGroups.get(group.id) || { sensed: new Set(), sight: new Set() };
            observations.sensed.add(`shared:${enemy.id}`);
            // A remote visual report advances group pressure, never the lure's
            // personal sight or native awareness/detection accumulator.
            if (visual) observations.sight.add(`shared:${enemy.id}`);
            observedGroups.set(group.id, observations);
            if (visual && group.engagement.mode !== "pressure") group.engagement.mode = "pressure";
        }
        return true;
    }

    function reportPlayerContact(enemy, target, aiData, delta) {
        return sharePlayerObservation(api.SpinnerNativeField.state(), enemy, target, aiData, delta);
    }

    function eligibleObserver(enemy) {
        return (
            enemy?.hp > 0 &&
            ["Spinner", "Jumper", "WebCaster", "Tunneler", "NestEntrance", "MageSpiderlings"].includes(
                enemy.Enemy?.name,
            ) &&
            KDHostile(enemy) &&
            !KDAllied(enemy) &&
            !KDIsInParty(enemy) &&
            !KDIsImprisoned(enemy) &&
            !KinkyDungeonIsDisabled(enemy) &&
            !KDHelpless(enemy) &&
            ![enemy.stun, enemy.freeze, enemy.channel, enemy.teleporting].some((value) => value > 0) &&
            !globalThis.KDIsDistracted?.(enemy)
        );
    }

    function recognizedPlayer(enemy, target) {
        // Awareness can originate from NPC combat. Player vp is the native
        // target-specific recognition gate and must not inherit that awareness.
        return (
            typeof globalThis.KinkyDungeonTrackSneak === "function" &&
            globalThis.KinkyDungeonTrackSneak({ ...enemy }, 0, target) >= 0.5
        );
    }

    function groupObservation(group) {
        const shared = playerObservation();
        if (
            shared &&
            targetIsHostile(group, KinkyDungeonPlayerEntity) &&
            (!group.engagement || sameTarget(group.engagement.target, KinkyDungeonPlayerEntity))
        ) {
            const observation = clone(shared);
            delete observation.reporterId;
            return observation;
        }
        const known = group.engagement?.lastKnown;
        return known?.source === "native" && known.age < 4
            ? { ...clone(known), target: clone(group.engagement.target) }
            : undefined;
    }

    function recognizedContact(enemy, target) {
        if (target === KinkyDungeonPlayerEntity) return recognizedPlayer(enemy, target);
        return !!(
            enemy.aware ||
            (typeof globalThis.KinkyDungeonTrackSneak === "function" &&
                globalThis.KinkyDungeonTrackSneak({ ...enemy }, 0, target) >= 0.5)
        );
    }

    function nativeContact(enemy) {
        if (
            !eligibleObserver(enemy) ||
            typeof globalThis.KinkyDungeonNearestPlayer !== "function" ||
            typeof globalThis.KinkyDungeonTrackSneak !== "function"
        )
            return undefined;
        // Native acquisition and TrackSneak(delta 0) may initialize awareness or
        // vp. Sample a detached observer so planning adds no detection progress.
        const observer = { ...enemy },
            target = globalThis.KinkyDungeonNearestPlayer(observer, false, true);
        if (!targetIsLiving(target) || !KDHostile(enemy, target)) return undefined;
        const aiData = nativeSenses(enemy, target);
        if (!aiData || !recognizedContact(enemy, target)) return undefined;
        return { target, aiData: { ...aiData, recognized: true } };
    }

    function nativeSenses(enemy, target) {
        let radius = enemy.Enemy.visionRadius ? KDEnemyVisionRadius(enemy) : 0;
        if (enemy.Enemy.visionRadius && enemy.lifetime > 0) radius += enemy.Enemy.visionSummoned || 0;
        radius = Math.max(1.5, radius + KinkyDungeonGetBuffedStat(enemy.buffs, "Vision"));
        if (KinkyDungeonStatsChoice.get("KillSquad"))
            radius = Math.max(radius * 1.2, (enemy.Enemy.blindSight || 0) + 3.5);
        if (enemy.blind && !enemy.aware) radius = 1.5;
        const distance = Math.hypot(enemy.x - target.x, enemy.y - target.y),
            visible = KinkyDungeonCheckLOS(enemy, target, distance, radius, true, true),
            heard = globalThis.KDCanHearEnemy?.(enemy, target, 1) === true;
        if (!visible && !heard) return undefined;
        return {
            hostile: KDHostile(enemy, target),
            canSensePlayer: true,
            canSeePlayer: visible && KinkyDungeonCheckLOS(enemy, target, distance, radius, false, false),
        };
    }

    function recoveryTarget(enemy, target, delta) {
        // Shared history guides approach; only this actor's real native sensory
        // range can route an eligible player duty away from an NPC target.
        if (
            delta > 0 &&
            eligibleSpinner(enemy) &&
            eligibleObserver(enemy) &&
            playerObservation() &&
            api.SpinnerRecovery?.wantsPursuit?.(enemy, KinkyDungeonPlayerEntity) &&
            nativeSenses(enemy, KinkyDungeonPlayerEntity)
        )
            return KinkyDungeonPlayerEntity;
        return target;
    }

    function refreshObservations(encounter = api.SpinnerNativeField.state(), delta = 1) {
        if (!(delta > 0) || !encounter?.ai) return;
        const byId = new Map(KDMapData.Entities.map((entity) => [String(entity.id), entity])),
            contacts = new Map();
        for (const enemy of [...KDMapData.Entities].sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
            const contact = nativeContact(enemy);
            if (contact) contacts.set(String(enemy.id), contact);
            if (contact?.target === KinkyDungeonPlayerEntity)
                sharePlayerObservation(encounter, enemy, contact.target, contact.aiData, delta);
        }
        for (const group of Object.values(encounter.ai.groups)) {
            // Older saves did not distinguish a broadcast from personal contact.
            // Classify them only on a positive turn using this native sample.
            if (
                group.engagement?.sharedOnly === undefined &&
                sameTarget(group.engagement?.target, KinkyDungeonPlayerEntity)
            )
                group.engagement.sharedOnly = !group.memberIds.some((id) => {
                    const member = byId.get(String(id));
                    return !sourceBusy(member) && contacts.get(String(id))?.target === KinkyDungeonPlayerEntity;
                });
            auditEngagement(encounter, group);
            const members = [...group.memberIds].sort((left, right) => String(left).localeCompare(String(right)));
            for (const id of members) {
                const enemy = byId.get(String(id));
                if (!enemy || sourceBusy(enemy)) continue;
                const contact = contacts.get(String(id));
                if (contact) observeTarget(encounter, group, enemy, contact.target, contact.aiData);
            }
        }
    }

    function auditEngagement(encounter, group) {
        const engagement = group.engagement;
        if (!engagement) return;
        const target = resolveTarget(engagement.target);
        if (!targetIsLiving(target) || !targetIsHostile(group, target)) {
            clearEngagement(group);
            return;
        }
        // Old saves may retain the removed wait timer and evasive lure mode.
        if (engagement.mode === "lure") engagement.mode = "pressure";
        delete engagement.progress;
        if (engagement.lastKnown?.age >= 4 || engagement.lastKnown?.source !== "native") delete engagement.lastKnown;
        const lure = KDMapData.Entities.find((entity) => String(entity.id) === String(engagement.lureId));
        if (needsSoleBuilder(encounter, group)) delete engagement.lureId;
        else if (
            !eligibleSpinner(lure) ||
            sourceBusy(lure) ||
            !group.memberIds.some((id) => String(id) === String(lure?.id))
        ) {
            const replacement = selectLure(encounter, group);
            if (replacement) engagement.lureId = replacement.id;
            else delete engagement.lureId;
        }
        if (
            engagement.lureId !== undefined &&
            !hasGateWork(encounter, group) &&
            !hasMaintenanceAssignment(
                KDMapData.Entities.find((entity) => String(entity.id) === String(engagement.lureId)),
            )
        )
            delete group.assignments?.[engagement.lureId];
    }

    function observeTarget(encounter, group, enemy, target, aiData) {
        if (target === KinkyDungeonPlayerEntity)
            sharePlayerObservation(encounter, enemy, target, aiData, enemy.SpiderlingsSpinnerRuntimeDelta ?? 1);
        const sensed =
            aiData.canSensePlayer &&
            aiData.hostile === true &&
            targetIsLiving(target) &&
            (aiData.recognized === true || recognizedContact(enemy, target));
        if (!sensed) return false;
        if (!group.engagement) {
            const reference = targetReference(target);
            if (!reference) return false;
            group.engagement = {
                target: reference,
                lureId: enemy.id,
                mode: "pressure",
                noSightTurns: 0,
                lureNoContactTurns: 0,
                compositeId: encounter.ai?.plans?.[group.planId]?.compositeId || null,
            };
            const selected = selectLure(encounter, group, [enemy.id]);
            if (selected) group.engagement.lureId = selected.id;
            else delete group.engagement.lureId;
        } else if (!sameTarget(group.engagement.target, target)) return false;
        const engagement = group.engagement,
            previous = engagement.lastKnown,
            actualSight = !!(
                aiData.canSeePlayer ||
                aiData.canSeePlayerChase ||
                aiData.canSeePlayerMedium ||
                aiData.canShootPlayer
            ),
            observations = observedGroups.get(group.id) || { sensed: new Set(), sight: new Set() },
            firstObservation = observations.sensed.size === 0;
        engagement.sharedOnly = false;
        observations.sensed.add(String(enemy.id));
        if (actualSight) observations.sight.add(String(enemy.id));
        observedGroups.set(group.id, observations);
        if (firstObservation || previous?.x !== target.x || previous?.y !== target.y)
            engagement.lastKnown = {
                x: target.x,
                y: target.y,
                dx: previous ? Math.sign(target.x - previous.x) : 0,
                dy: previous ? Math.sign(target.y - previous.y) : 0,
                age: 0,
                source: "native",
            };
        if (actualSight) {
            engagement.noSightTurns = 0;
            if (engagement.mode !== "pressure") engagement.mode = "pressure";
            if (String(engagement.lureId) === String(enemy.id)) engagement.lureNoContactTurns = 0;
        }
        if (needsSoleBuilder(encounter, group)) delete engagement.lureId;
        const lure = KDMapData.Entities.find((entity) => String(entity.id) === String(engagement.lureId));
        if (
            !eligibleSpinner(lure) ||
            (engagement.lureNoContactTurns >= 8 && String(engagement.lureId) !== String(enemy.id) && actualSight)
        ) {
            const replacement = selectLure(encounter, group, [enemy.id]);
            if (replacement) engagement.lureId = replacement.id;
        }
        if (
            !hasGateWork(encounter, group) &&
            !hasMaintenanceAssignment(
                KDMapData.Entities.find((entity) => String(entity.id) === String(engagement.lureId)),
            )
        )
            delete group.assignments?.[engagement.lureId];
        return true;
    }

    function nativePath(enemy, target, blockEnemy = true) {
        if (typeof KinkyDungeonFindPath !== "function") return [];
        return (
            KinkyDungeonFindPath(
                enemy.x,
                enemy.y,
                target.x,
                target.y,
                blockEnemy,
                false,
                false,
                KinkyDungeonMovableTilesEnemy,
                undefined,
                undefined,
                undefined,
                enemy,
            ) || []
        );
    }

    function performAssignment(enemy, group, assignment) {
        const encounter = api.SpinnerNativeField.state(),
            field = assignmentField(encounter, assignment),
            delta = enemy.SpiderlingsSpinnerRuntimeDelta || 1;
        if (!field) {
            group.lastBlockReason = "field-invalid";
            record(group, "wait");
            return "wait";
        }
        const targetSnapshot = api.SpinnerNativeField.snapshot(assignment.target);
        if (!targetSnapshot.inBounds || !targetSnapshot.floor || targetSnapshot.protected) {
            group.lastBlockReason = "terrain-invalid";
            invalidatePlan(encounter, group, "terrain", nativeMapSnapshot());
            record(group, "wait");
            return "wait";
        }
        if (
            targetSnapshot.occupied &&
            !api.SpinnerTopology.inspectWorkAction(encounter.topology, assignment).allowsOccupiedTarget &&
            !(enemy.x === assignment.target.x && enemy.y === assignment.target.y)
        ) {
            group.lastBlockReason = "work-cell-occupied";
            record(group, "wait");
            return "wait";
        }
        if (distance(enemy, assignment.workCell) > 0) {
            let path = nativePath(enemy, assignment.workCell);
            // A waiting coworker can block the complete corridor route. Recruits
            // still approach its free prefix; the next-step occupancy check below
            // never permits walking through that coworker or the prey.
            if (!path.length && assignment.type === "rally") path = nativePath(enemy, assignment.workCell, false);
            let next = path.find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
            // Native faction pathing can include live allies beyond its first
            // free step. Recheck the whole work route to avoid oscillating
            // between that free prefix and the detour around its obstruction.
            if (
                assignment.type !== "rally" &&
                path.some(
                    (cell) => cellKey(cell) !== cellKey(enemy) && api.SpinnerNativeField.snapshot(cell).actorOccupied,
                )
            ) {
                path = occupancyRoute(enemy, assignment.workCell);
                next = path.find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
            }
            if (!next || api.SpinnerNativeField.snapshot(next).actorOccupied) {
                group.lastBlockReason = "work-route-blocked";
                record(group, "wait");
                return "wait";
            }
            const moved = KinkyDungeonEnemyTryMove(
                enemy,
                { x: next.x - enemy.x, y: next.y - enemy.y },
                delta,
                next.x,
                next.y,
                false,
            );
            record(group, moved ? "travel" : "wait");
            group.lastBlockReason = moved ? undefined : "movement-budget";
            return "builder-move";
        }
        if (assignment.type === "rally") {
            record(group, "wait");
            return "rally-wait";
        }
        if (!api.SpinnerNativeField.accrueConstructionAction(enemy, delta)) {
            group.lastBlockReason = "construction-credit";
            record(group, "wait");
            return "wait";
        }
        const outcome = api.SpinnerNativeField.applyPaidAction(enemy, {
            ...assignment,
            ownerId: enemy.id,
            fieldId: assignment.fieldId,
        });
        if (outcome.applied) {
            delete group.lastBlockReason;
            record(group, api.SpinnerTopology.inspectWorkAction(encounter.topology, assignment).metric);
            delete group.assignments[enemy.id];
        } else {
            group.lastBlockReason = outcome.reason;
            record(group, "wait");
        }
        return "field-work";
    }

    function occupancyRoute(enemy, destination) {
        const snapshot = nativeMapSnapshot(),
            blocked = new Set([
                ...KDMapData.Entities.filter(
                    (entity) => entity.hp > 0 && entity.id !== enemy.id && !api.SpinnerNativeField.isOwnedProxy(entity),
                ).map(cellKey),
                cellKey(KinkyDungeonPlayerEntity),
            ]),
            passable = new Set(snapshot.cells.filter((cell) => cell.walkable && !cell.locked).map(cellKey));
        const destinations = Array.isArray(destination) ? destination : [destination];
        return routeOnSnapshot(snapshot, enemy, destinations, blocked, passable);
    }

    // Facts and paid executors are native adapters; final priority and phase permission live in Duties.
    function dutyFacts(enemy, target, aiData = {}) {
        const encounter = api.SpinnerNativeField.state(),
            state = encounter?.ai;
        const group = Object.values(state?.groups || {}).find((entry) => entry.memberIds.includes(enemy.id));
        if (!group || !eligibleSpinner(enemy)) return undefined;
        const playerDuty = api.SpinnerRecovery?.wantsPursuit?.(enemy, KinkyDungeonPlayerEntity);
        const recoveryTarget = playerDuty ? KinkyDungeonPlayerEntity : target;
        const recoveryKnown = playerDuty
            ? playerObservation(encounter) || groupObservation(group)
            : groupObservation(group);
        const perceivedThreat = !!(
            enemy.aware &&
            aiData.canSensePlayer &&
            aiData.hostile === true &&
            targetIsLiving(target) &&
            recognizedContact(enemy, target)
        );
        const recoveryPursuit = playerDuty || api.SpinnerNPCRecovery?.wantsPursuit?.(enemy, target);
        if (recoveryPursuit && perceivedThreat) {
            if (group.engagement && !sameTarget(group.engagement.target, target)) clearEngagement(group);
            observeTarget(encounter, group, enemy, target, aiData);
        }
        const plan = state.plans[group.planId];
        const validPlan =
            !!plan && !["invalid", "abandoned", "retired"].includes(plan.status) && !!planWaypoint(encounter, group);
        const homeGuard = group.source?.type === "nest" && plan?.kind !== "passage" && !enemy.SpiderlingsHuntRole;
        // A member's nest role cannot erase contact owned by its field commander.
        if (!validPlan) clearEngagement(group);
        else auditEngagement(encounter, group);
        const nestAttacker = !!api.HuntingGrounds?.isNestAttacker?.(enemy, target);
        const observed =
            validPlan && !homeGuard && !nestAttacker && !recoveryPursuit
                ? observeTarget(encounter, group, enemy, target, aiData)
                : false;
        const assignment = group.assignments?.[enemy.id],
            known = groupObservation(group);
        const blocking = Object.entries(group.assignments || {}).some(
            ([id, other]) =>
                String(id) !== String(enemy.id) &&
                [other.target, other.workCell].some((cell) => cell?.x === enemy.x && cell?.y === enemy.y),
        );
        const yieldCell =
            !assignment && blocking
                ? DIRECTIONS.map((direction) => ({ x: enemy.x + direction.x, y: enemy.y + direction.y })).find(
                      (cell) => {
                          const tile = api.SpinnerNativeField.snapshot(cell);
                          return tile.inBounds && tile.floor && !tile.protected && !tile.actorOccupied;
                      },
                  )
                : undefined;
        return {
            groupId: group.id,
            assignment,
            validPlan,
            perceivedThreat,
            recoveryPursuit,
            recoveryTarget,
            recoveryKnown,
            perceivedRecovery: recoveryTarget === target && perceivedThreat,
            recentRecovery: !!recoveryKnown && sameTarget(recoveryKnown.target, recoveryTarget),
            nestAttacker,
            observed,
            known,
            yieldCell,
            soleBuilder: needsSoleBuilder(encounter, group),
            maintenance: hasMaintenanceAssignment(enemy),
            gateWork:
                hasGateWork(encounter, group) &&
                api.SpinnerTopology.inspectWorkAction(encounter.topology, assignment).gateWork,
            bodyWorker:
                !!group.engagement &&
                assignment &&
                assignment.type !== "rally" &&
                String(group.engagement.lureId) !== String(enemy.id) &&
                !!plan?.compositeId,
            coreRally:
                assignment?.type === "rally" &&
                plan?.kind === "passage" &&
                encounter.topology.fields[plan.fieldId]?.phase === "sealed" &&
                known &&
                known.age < 4 &&
                distance(enemy, known) > 1 &&
                api.SpinnerTopology.isInsideCommonCore(encounter.topology, plan.compositeId, known),
            targetInCore:
                !!plan?.compositeId &&
                targetIsLiving(target) &&
                api.SpinnerTopology.isInsideCommonCore(encounter.topology, plan.compositeId, target),
            lure: !!group.engagement && String(group.engagement.lureId) === String(enemy.id),
            engaged: !!group.engagement,
            ordinary: group.source?.type !== "nest",
        };
    }

    function executeTacticalDuty(enemy, duty) {
        const group = api.SpinnerNativeField.state()?.ai?.groups[duty.groupId];
        if (!group) return "invalid";
        const path = duty.category === "pursuit" ? nativePath(enemy, duty.destination) : [duty.destination];
        const next = path.find((cell) => cell && (cell.x !== enemy.x || cell.y !== enemy.y));
        if (!next || api.SpinnerNativeField.snapshot(next).actorOccupied) {
            record(group, "wait");
            return "wait";
        }
        const moved = KinkyDungeonEnemyTryMove(
            enemy,
            { x: next.x - enemy.x, y: next.y - enemy.y },
            enemy.SpiderlingsSpinnerRuntimeDelta,
            next.x,
            next.y,
            false,
        );
        record(group, moved ? (duty.category === "yield" ? "yield" : "travel") : "wait");
        return moved ? duty.category : "wait";
    }

    // Historical diagnostics cross the same final-duty seam as the runtime.
    function handleBeforeMove(enemy, target, aiData = {}) {
        if (!(enemy?.SpiderlingsSpinnerRuntimeDelta > 0)) return false;
        api.SpinnerDuties.prepare(enemy, target, enemy.SpiderlingsSpinnerRuntimeDelta);
        return api.SpinnerDuties.beforeMove(enemy, target, aiData);
    }

    function gateNativePhase(enemy) {
        return api.SpinnerDuties.gate(enemy);
    }

    function preparePositiveTurn(delta, input = {}) {
        if (!(delta > 0)) return undefined;
        if (!api.SpinnerNativeField.state()?.autonomous) return undefined;
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
        if (preparedMap === KDMapData && preparedTick === tick) return api.SpinnerNativeField.state()?.ai;
        preparedMap = KDMapData;
        preparedTick = tick;
        observedGroups = new Map();
        return beginTurn(input);
    }

    function completePositiveTurn(delta) {
        if (!(delta > 0)) return;
        const encounter = api.SpinnerNativeField.state();
        if (!encounter?.ai) return;
        encounter.ai.coordinationTurn = (encounter.ai.coordinationTurn || 0) + 1;
        encounter.ai.worldTime = (encounter.ai.worldTime ?? encounter.ai.coordinationTurn - 1) + delta;
        for (const group of Object.values(encounter.ai.groups || {})) {
            auditEngagement(encounter, group);
            const engagement = group.engagement;
            if (!engagement) continue;
            const observations = observedGroups.get(group.id) || { sensed: new Set(), sight: new Set() },
                sawTarget = observations.sight.size > 0,
                lureSawTarget = observations.sight.has(String(engagement.lureId));
            if (engagement.lastKnown) {
                engagement.lastKnown.age++;
                if (engagement.lastKnown.age >= 4) delete engagement.lastKnown;
            }
            engagement.noSightTurns = sawTarget ? 0 : (engagement.noSightTurns || 0) + 1;
            engagement.lureNoContactTurns = lureSawTarget ? 0 : (engagement.lureNoContactTurns || 0) + 1;
            if (engagement.noSightTurns >= 8) engagement.mode = "pursuit";
            else if (!sawTarget && engagement.mode !== "pressure") engagement.mode = "search";
            if (
                encounter.ai.plans[group.planId]?.kind === "passage" &&
                engagement.noSightTurns >= 12 &&
                observations.sensed.size === 0
            )
                clearEngagement(group);
        }
        if (encounter.ai.playerObservation) {
            encounter.ai.playerObservation.age++;
            if (!playerObservation(encounter)) delete encounter.ai.playerObservation;
        }
        observedGroups = new Map();
    }

    function auditAssignments(encounter, group) {
        const tasks = new Set(),
            work = new Set(),
            cleaned = {};
        for (const [memberId, assignment] of Object.entries(group.assignments || {}).sort(([a], [b]) =>
            a.localeCompare(b),
        )) {
            const member = KDMapData.Entities.find((entity) => String(entity.id) === String(memberId)),
                task = assignment && assignmentKey(assignment),
                workKeyValue = assignment?.workCell && cellKey(assignment.workCell);
            if (
                !eligibleSpinner(member) ||
                (!hasGateWork(encounter, group) &&
                    String(group.engagement?.lureId) === String(memberId) &&
                    !hasMaintenanceAssignment(member)) ||
                !assignmentPending(encounter, assignment, member?.id) ||
                tasks.has(task) ||
                work.has(workKeyValue)
            )
                continue;
            tasks.add(task);
            work.add(workKeyValue);
            cleaned[memberId] = assignment;
        }
        group.assignments = cleaned;
    }

    function auditSavedState(encounter) {
        const ai = encounter?.ai;
        if (!ai) return undefined;
        for (const group of Object.values(ai.groups || {}).sort((a, b) => a.id.localeCompare(b.id))) {
            group.memberIds = group.memberIds.filter((id) => {
                const member = KDMapData.Entities.find((entity) => String(entity.id) === String(id));
                return baseEligibility(member);
            });
            if (!ai.plans[group.planId]) group.planId = null;
            auditEngagement(encounter, group);
            auditAssignments(encounter, group);
        }
        observedGroups = new Map();
        return ai;
    }

    function restoreAfterLoad() {
        preparedMap = undefined;
        preparedTick = -1;
        mapCache = undefined;
        passageCache = undefined;
        workSnapshot = undefined;
        const encounter = api.SpinnerNativeField.state();
        if (!encounter?.ai) return undefined;
        api.FieldCommand.reconcile(encounter, KDMapData.Entities, {}, false);
        for (const group of Object.values(encounter.ai.groups || {})) group.assignments ||= {};
        return auditSavedState(encounter);
    }

    function inspect() {
        const state = api.SpinnerNativeField.state()?.ai;
        return state ? clone(state) : undefined;
    }

    function observeDuty(enemy, target, aiData) {
        const encounter = api.SpinnerNativeField.state();
        const group = Object.values(encounter?.ai?.groups || {}).find((entry) => entry.memberIds.includes(enemy.id));
        const plan = encounter?.ai?.plans[group?.planId];
        if (
            group &&
            !sourceBusy(enemy) &&
            !(group.source?.type === "nest" && plan?.kind !== "passage" && !enemy.SpiderlingsHuntRole)
        )
            observeTarget(encounter, group, enemy, target, aiData);
    }

    function executeDuty(enemy, groupId, assignment) {
        const encounter = api.SpinnerNativeField.state(),
            group = encounter?.ai?.groups[groupId];
        if (
            !group ||
            group.cancelled ||
            !group.memberIds.includes(enemy.id) ||
            !eligibleSpinner(enemy) ||
            sourceBusy(enemy) ||
            !(encounter.ai.plans[group.planId]?.fieldIds || [encounter.ai.plans[group.planId]?.fieldId]).includes(
                assignment?.fieldId,
            ) ||
            (assignment?.type !== "rally" && !assignmentPending(encounter, assignment, enemy.id))
        )
            return "invalid";
        return performAssignment(enemy, group, assignment);
    }

    function refreshWork(enemy) {
        const encounter = api.SpinnerNativeField.state(),
            member = encounter?.command?.members[enemy.id],
            group = encounter?.ai?.groups[member?.commander],
            plan = encounter?.ai?.plans[group?.planId];
        if (!group || !plan || group.assignments[enemy.id] || sourceBusy(enemy) || !eligibleSpinner(enemy)) return;
        const needs = api.SpinnerTopology.fieldWorkNeeds(encounter.topology, plan.fieldIds || [plan.fieldId]);
        const pending =
            plan.kind === "line"
                ? api.SpinnerTopology.lineWorkActions(api.SpinnerNativeField.fieldById(encounter, plan.fieldId), true)
                      .length > 0
                : needs.construction || needs.repair;
        if (pending)
            reserveActions(encounter, workSnapshot?.map === KDMapData ? workSnapshot.snapshot : nativeMapSnapshot());
    }

    function dispatchPath(enemy, target) {
        const cells = DIRECTIONS.map((direction) => ({ x: target.x + direction.x, y: target.y + direction.y }));
        return occupancyRoute(enemy, [target, ...cells]);
    }

    api.SpinnerAI = {
        observeDuty,
        dutyFacts,
        executeTacticalDuty,
        executeDuty,
        refreshWork,
        dispatchPath,
        GROUP_RADIUS,
        SHORTLIST_SIZE,
        seededRandom,
        eligibleSpinner,
        ensureAI,
        groupObservation,
        playerObservation,
        reportPlayerContact,
        recoveryTarget,
        refreshObservations,
        auditGroups,
        analyzeLineCandidates,
        selectSavedPlan,
        reserveActions,
        hasMaintenanceAssignment,
        beginTurn,
        initializeMapgenField,
        preparePositiveTurn,
        handleBeforeMove,
        gateNativePhase,
        completePositiveTurn,
        restoreAfterLoad,
        auditSavedState,
        inspect,
        routeOnSnapshot,
        occupancyRoute,
    };
})();
