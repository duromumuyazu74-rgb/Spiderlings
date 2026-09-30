"use strict";

// Map-only passage analysis. Native AI owns actor eligibility, reservations and
// paid construction; this module does not create entities or change the map.
(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const CARDINAL = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
    ];
    const DIRECTIONS = [...CARDINAL, [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const MAX_INTERIOR_SIDE = 3;
    const MAX_VALIDATIONS = 24;
    const MAX_DISTANCE_FIELDS = 64;
    const MAX_ROUTE_PROOFS = 128;
    const MAX_DISTANCE_BYTES = 1024 * 1024;
    const key = (cell) => `${cell.x},${cell.y}`;
    const point = ({ x, y }) => ({ x, y });
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const walkable = (cell) => !!(cell?.walkable ?? cell?.floor) && !cell.locked;
    const buildable = (cell) => !!cell?.floor && walkable(cell) && !cell.protected;
    const nativeWall = (cell) => !!cell?.wall && !walkable(cell) && !cell.locked && !cell.protected;

    function buildIndex(snapshot, { metrics = {} } = {}) {
        for (const name of [
            "analysisBuilds",
            "graphVertices",
            "graphEdges",
            "visited",
            "distanceFieldBuilds",
            "candidateCells",
            "routeChecks",
            "routeSearches",
            "validationVisits",
            "candidateCacheHits",
        ])
            metrics[name] ||= 0;
        metrics.analysisBuilds++;
        const cells = (snapshot.cells || []).map((cell) => ({ ...cell }));
        const byKey = new Map(cells.map((cell) => [key(cell), cell]));
        const nodes = cells.filter(walkable);
        const nodeIds = new Map(nodes.map((cell, id) => [key(cell), id]));
        // Include every native eight-neighbor possibility. In particular, do not
        // invent a wall-corner rule and then mislabel a diagonal bypass mandatory.
        const neighbors = nodes.map((cell) =>
            DIRECTIONS.flatMap(([dx, dy]) => {
                const id = nodeIds.get(`${cell.x + dx},${cell.y + dy}`);
                return id === undefined ? [] : [id];
            }),
        );
        metrics.graphVertices += nodes.length;
        metrics.graphEdges += neighbors.reduce((sum, entries) => sum + entries.length, 0) / 2;
        const index = {
            byKey,
            nodes,
            nodeIds,
            neighbors,
            metrics,
            width: snapshot.width,
            height: snapshot.height,
            entrances: (snapshot.entrances || []).map(point),
            exits: (snapshot.exits || []).map(point),
            distanceFields: new Map(),
            // Retain small-map working sets without allowing whole-map fields to grow without a bound.
            distanceFieldLimit: Math.max(
                1,
                Math.min(MAX_DISTANCE_FIELDS, Math.floor(MAX_DISTANCE_BYTES / Math.max(4, nodes.length * 4))),
            ),
            candidateCache: null,
        };
        analyzeCuts(index);
        index.layouts = layouts(index);
        return index;
    }

    function analyzeCuts(index) {
        const count = index.nodes.length;
        const entered = new Int32Array(count).fill(-1),
            low = new Int32Array(count);
        const parent = new Int32Array(count).fill(-1),
            next = new Uint8Array(count),
            children = new Uint8Array(count);
        const components = new Int32Array(count).fill(-1),
            cuts = new Set(),
            bridges = [];
        let clock = 0,
            component = 0;
        // An explicit DFS stack also handles long one-cell corridors without
        // consuming the JavaScript call stack.
        for (let root = 0; root < count; root++) {
            if (entered[root] >= 0) continue;
            entered[root] = low[root] = clock++;
            components[root] = component;
            const stack = [root];
            while (stack.length) {
                const node = stack.at(-1);
                if (next[node] < index.neighbors[node].length) {
                    const neighbor = index.neighbors[node][next[node]++];
                    if (entered[neighbor] < 0) {
                        parent[neighbor] = node;
                        children[node]++;
                        components[neighbor] = component;
                        entered[neighbor] = low[neighbor] = clock++;
                        stack.push(neighbor);
                    } else if (neighbor !== parent[node]) low[node] = Math.min(low[node], entered[neighbor]);
                } else {
                    stack.pop();
                    index.metrics.visited++;
                    const previous = parent[node];
                    if (previous < 0) {
                        if (children[node] > 1) cuts.add(node);
                    } else {
                        low[previous] = Math.min(low[previous], low[node]);
                        if (parent[previous] >= 0 && low[node] >= entered[previous]) cuts.add(previous);
                        if (low[node] > entered[previous]) bridges.push([previous, node]);
                    }
                }
            }
            component++;
        }
        index.components = components;
        index.articulationKeys = new Set([...cuts].map((id) => key(index.nodes[id])));
        index.bridges = bridges.map((pair) => pair.map((id) => point(index.nodes[id])));
    }

    function breadthFirst(index, from, blocked = new Set(), validation = false) {
        const values = new Int32Array(index.nodes.length).fill(-1);
        const start = index.nodeIds.get(key(from));
        if (start === undefined || blocked.has(key(from))) return values;
        const queue = [start];
        values[start] = 0;
        for (let offset = 0; offset < queue.length; offset++) {
            const node = queue[offset];
            if (validation) index.metrics.validationVisits++;
            for (const next of index.neighbors[node]) {
                if (values[next] >= 0 || blocked.has(key(index.nodes[next]))) continue;
                values[next] = values[node] + 1;
                queue.push(next);
            }
        }
        return values;
    }

    function distances(index, from) {
        const origin = key(from);
        let values = index.distanceFields.get(origin);
        if (values) {
            index.distanceFields.delete(origin);
            index.distanceFields.set(origin, values);
            return values;
        }
        index.metrics.distanceFieldBuilds++;
        values = breadthFirst(index, from);
        index.distanceFields.set(origin, values);
        if (index.distanceFields.size > index.distanceFieldLimit)
            index.distanceFields.delete(index.distanceFields.keys().next().value);
        return values;
    }

    function at(index, values, cell) {
        const id = index.nodeIds.get(key(cell));
        return id !== undefined && values[id] >= 0 ? values[id] : Infinity;
    }

    function distance(index, from, to) {
        if (!from || !to) return Infinity;
        return at(index, distances(index, from), to);
    }

    function layout(index, left, top, width, height) {
        const right = left + width - 1,
            bottom = top + height - 1;
        const interiorCells = [];
        for (let y = top; y <= bottom; y++)
            for (let x = left; x <= right; x++) {
                const cell = index.byKey.get(`${x},${y}`);
                if (!buildable(cell)) return undefined;
                interiorCells.push(point(cell));
            }
        const nativeWallCells = [];
        const gates = [];
        const corners = [
            [left - 1, top - 1],
            [right + 1, top - 1],
            [right + 1, bottom + 1],
            [left - 1, bottom + 1],
        ];
        // A passable diagonal corner would require a bent gate. Leave those
        // shapes to another candidate instead of assuming a sealed corner.
        for (const [x, y] of corners) {
            const cell = index.byKey.get(`${x},${y}`);
            if (!nativeWall(cell)) return undefined;
            nativeWallCells.push(point(cell));
        }
        const sides = [
            { id: "north", cells: Array.from({ length: width }, (_, i) => ({ x: left + i, y: top - 1 })) },
            { id: "east", cells: Array.from({ length: height }, (_, i) => ({ x: right + 1, y: top + i })) },
            { id: "south", cells: Array.from({ length: width }, (_, i) => ({ x: left + i, y: bottom + 1 })) },
            { id: "west", cells: Array.from({ length: height }, (_, i) => ({ x: left - 1, y: top + i })) },
        ];
        for (const side of sides) {
            let current;
            for (const cell of side.cells) {
                const tile = index.byKey.get(key(cell));
                if (nativeWall(tile)) {
                    nativeWallCells.push(point(cell));
                    current = undefined;
                } else if (buildable(tile)) {
                    if (!current) {
                        current = { id: `${side.id}-${gates.length}`, cells: [] };
                        gates.push(current);
                    }
                    current.cells.push(point(cell));
                } else return undefined;
            }
        }
        if (gates.length < 2 || gates.length > 4) return undefined;
        const inner = new Set(interiorCells.map(key));
        const boundary = new Set([...nativeWallCells, ...gates.flatMap((gate) => gate.cells)].map(key));
        if (
            [...interiorCells, ...nativeWallCells, ...gates.flatMap((gate) => gate.cells)].some(
                (cell) => cell.x <= 0 || cell.y <= 0 || cell.x >= index.width - 1 || cell.y >= index.height - 1,
            )
        )
            return undefined;
        if (
            gates.some(
                (gate) =>
                    !gate.cells.some((cell) =>
                        CARDINAL.some(([dx, dy]) => {
                            const outside = { x: cell.x + dx, y: cell.y + dy };
                            return (
                                !inner.has(key(outside)) &&
                                !boundary.has(key(outside)) &&
                                walkable(index.byKey.get(key(outside)))
                            );
                        }),
                    ),
            )
        )
            return undefined;
        const core = { x: left + Math.floor((width - 1) / 2), y: top + Math.floor((height - 1) / 2) };
        const cells = [...interiorCells, ...gates.flatMap((gate) => gate.cells)];
        const cutCount = interiorCells.filter((cell) => index.articulationKeys.has(key(cell))).length;
        const doorway = cells.some((cell) =>
            DIRECTIONS.some(([dx, dy]) => {
                const adjacent = index.byKey.get(`${cell.x + dx},${cell.y + dy}`);
                return adjacent?.door === true || ["D", "d"].includes(adjacent?.tile);
            }),
        );
        return {
            id: `passage:${left},${top}:${width}x${height}`,
            type: "passage",
            center: core,
            core,
            interiorCells,
            gates,
            nativeWallCells,
            cells,
            cutCount,
            doorway,
            roughScore: (cutCount ? 100 : 0) + (doorway ? 30 : 0) + (gates.length - 2) * 25 - cells.length,
        };
    }

    function layouts(index) {
        const result = [];
        for (const cell of index.nodes) {
            index.metrics.candidateCells++;
            for (let width = 1; width <= MAX_INTERIOR_SIDE; width++)
                for (let height = 1; height <= MAX_INTERIOR_SIDE; height++) {
                    const candidate = layout(index, cell.x, cell.y, width, height);
                    if (candidate) result.push(candidate);
                }
        }
        return result;
    }

    function candidates(index, { routes, maxCandidates = 8, blockedKeys = [] } = {}) {
        const requested = Math.max(0, Math.min(MAX_VALIDATIONS, Math.floor(maxCandidates)));
        if (!requested) return [];
        const pairs = (routes || index.entrances.flatMap((from) => index.exits.map((to) => ({ from, to }))))
            .filter((route) => route.from && route.to)
            .map((route, id) => ({ id: route.id ?? `route-${id}`, from: point(route.from), to: point(route.to) }));
        const occupied = new Set(blockedKeys);
        const signature = JSON.stringify({ pairs, requested, occupied: [...occupied].sort() });
        if (index.candidateCache?.signature === signature) {
            index.metrics.candidateCacheHits++;
            return clone(index.candidateCache.result);
        }
        const proofSignature = JSON.stringify(pairs);
        if (index.proofCache?.signature !== proofSignature)
            index.proofCache = { signature: proofSignature, results: new Map() };
        const routeFields = pairs
            .map((route) => ({
                ...route,
                fromDistances: distances(index, route.from),
                toDistances: distances(index, route.to),
            }))
            .map((route) => ({ ...route, baseline: at(index, route.fromDistances, route.to) }))
            .filter((route) => Number.isFinite(route.baseline));
        const shortlist = index.layouts
            .filter((candidate) => !candidate.cells.some((cell) => occupied.has(key(cell))))
            .map((candidate) => {
                const inside = new Set(candidate.cells.map(key));
                const relevant = routeFields.filter(
                    (route) => !inside.has(key(route.from)) && !inside.has(key(route.to)),
                );
                const onRoute = relevant.filter((route) =>
                    candidate.interiorCells.some(
                        (cell) =>
                            at(index, route.fromDistances, cell) + at(index, route.toDistances, cell) ===
                            route.baseline,
                    ),
                );
                return { candidate, relevant, onRoute, rank: candidate.roughScore + (onRoute.length ? 1000 : 0) };
            })
            .sort((a, b) => b.rank - a.rank || a.candidate.id.localeCompare(b.candidate.id))
            .slice(0, MAX_VALIDATIONS);
        const result = [];
        for (const { candidate, relevant, onRoute } of shortlist) {
            const cached = index.proofCache.results.get(candidate.id);
            if (cached !== undefined) {
                if (cached) result.push(cached);
                continue;
            }
            const gateKeys = new Set(candidate.gates.flatMap((gate) => gate.cells.map(key)));
            const interiorKeys = new Set(candidate.interiorCells.map(key));
            const proofs = [];
            // One bounded candidate validation, shared by every actor/group.
            // This conservative graph does not delete diagonal edges merely
            // because a newly built neighboring web might forbid the step.
            for (const route of relevant) {
                index.metrics.routeChecks++;
                index.metrics.routeSearches += 2;
                const closed = breadthFirst(index, route.from, gateKeys, true);
                const withoutInterior = breadthFirst(index, route.from, interiorKeys, true);
                const blockedGateDistance = at(index, closed, route.to);
                const interiorBypassDistance = at(index, withoutInterior, route.to);
                const detour = Math.min(blockedGateDistance, interiorBypassDistance);
                const passesInterior = onRoute.includes(route);
                proofs.push({
                    routeId: route.id,
                    from: route.from,
                    to: route.to,
                    baselineDistance: route.baseline,
                    detourDistance: Number.isFinite(detour) ? detour : null,
                    blockedGateDistance: Number.isFinite(blockedGateDistance) ? blockedGateDistance : null,
                    interiorBypassDistance: Number.isFinite(interiorBypassDistance) ? interiorBypassDistance : null,
                    kind: !Number.isFinite(detour)
                        ? "mandatory"
                        : passesInterior && detour > route.baseline
                          ? "detour"
                          : "local",
                    passesInterior,
                });
            }
            // All exits from the declared interior must encounter a paid gate
            // or a real wall, including native diagonal possibilities.
            const escapes = candidate.interiorCells.some((cell) =>
                index.neighbors[index.nodeIds.get(key(cell))].some(
                    (id) => !interiorKeys.has(key(index.nodes[id])) && !gateKeys.has(key(index.nodes[id])),
                ),
            );
            if (escapes) continue;
            const rank = { mandatory: 2, detour: 1, local: 0 };
            proofs.sort(
                (a, b) =>
                    rank[b.kind] - rank[a.kind] ||
                    b.detourDistance - b.baselineDistance - (a.detourDistance - a.baselineDistance),
            );
            const proof = proofs[0] || { kind: "local", passesInterior: false };
            const extra = proof.kind === "detour" ? Math.min(20, proof.detourDistance - proof.baselineDistance) : 0;
            const score =
                (proof.kind === "mandatory" ? 1000 : proof.kind === "detour" ? 500 + extra * 10 : 150) +
                (candidate.doorway ? 20 : 0) +
                (candidate.gates.length - 2) * 10 -
                candidate.cells.length;
            const validated = {
                ...candidate,
                proof: { ...proof, checkedRoutes: proofs.length },
                score,
                travelDistance: 0,
            };
            result.push(validated);
            index.proofCache.results.set(candidate.id, validated);
            if (index.proofCache.results.size > MAX_ROUTE_PROOFS)
                index.proofCache.results.delete(index.proofCache.results.keys().next().value);
        }
        result.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        const selected = result.slice(0, requested);
        index.candidateCache = { signature, result: selected };
        return clone(selected);
    }

    api.SpinnerPassagePlanner = { buildIndex, distance, candidates, MAX_VALIDATIONS, MAX_INTERIOR_SIDE };
})();
