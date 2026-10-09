/* Disposable topology model. No DOM, native combat, inventory or rendering. */
"use strict";
globalThis.SpinnerTopology = (() => {
    const key = (x, y) => `${x},${y}`;
    const point = (k) => k.split(",").map(Number);
    const distance = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
    const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [1, -1],
        [-1, 1],
        [-1, -1],
    ];
    const clone = (x) => JSON.parse(JSON.stringify(x));
    function random(seed) {
        let h = 2166136261;
        for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
        return () => {
            h += 0x6d2b79f5;
            let t = Math.imul(h ^ (h >>> 15), 1 | h);
            t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    const floor = (map, x, y) =>
        y >= 0 &&
        x >= 0 &&
        y < map.grid.length &&
        x < map.grid[0].length &&
        map.walk.includes(key(x, y)) &&
        !map.locked?.includes(key(x, y));
    function flood(map, start, blocked = new Set(), goal) {
        const initial = key(...start),
            queue = [initial],
            parent = new Map([[initial, null]]);
        if (!floor(map, ...start) || blocked.has(initial)) return { cells: new Set(), path: [] };
        let found;
        for (let i = 0; i < queue.length; i++) {
            const k = queue[i],
                p = point(k);
            if (goal?.(p)) {
                found = k;
                break;
            }
            for (const [dx, dy] of dirs) {
                const n = key(p[0] + dx, p[1] + dy);
                // Eight-way connectivity matches the native accessibility convention.
                if (!parent.has(n) && !blocked.has(n) && floor(map, p[0] + dx, p[1] + dy)) {
                    parent.set(n, k);
                    queue.push(n);
                }
            }
        }
        const path = [];
        while (found !== undefined && found !== null) {
            path.push(point(found));
            found = parent.get(found);
        }
        return { cells: new Set(parent.keys()), path: path.reverse() };
    }
    function segment(a, b) {
        const count = distance(a, b),
            result = [];
        for (let i = 0; i <= count; i++)
            result.push(key(a[0] + Math.sign(b[0] - a[0]) * i, a[1] + Math.sign(b[1] - a[1]) * i));
        return result;
    }
    const edgeKey = (a, b) => [a, b].sort().join("|");
    const ownerKey = (owners) => [...owners].sort().join("+");
    function physicalGraph(fieldSpecs) {
        const unitEdges = new Map(),
            adjacency = new Map(),
            originalAnchors = new Map();
        const addAdjacent = (node, edge) => {
            if (!adjacency.has(node)) adjacency.set(node, []);
            adjacency.get(node).push(edge);
        };
        for (const field of fieldSpecs) {
            for (const vertex of field.vertices) {
                const cell = key(...vertex);
                if (!originalAnchors.has(cell)) originalAnchors.set(cell, new Set());
                originalAnchors.get(cell).add(field.id);
            }
            const closed = field.type !== "line";
            for (let i = 0; i < (closed ? field.vertices.length : field.vertices.length - 1); i++) {
                const cells = segment(field.vertices[i], field.vertices[(i + 1) % field.vertices.length]);
                for (let j = 1; j < cells.length; j++) {
                    const id = edgeKey(cells[j - 1], cells[j]);
                    if (!unitEdges.has(id))
                        unitEdges.set(id, { id, nodes: [cells[j - 1], cells[j]], owners: new Set() });
                    unitEdges.get(id).owners.add(field.id);
                }
            }
        }
        for (const edge of unitEdges.values()) {
            addAdjacent(edge.nodes[0], edge);
            addAdjacent(edge.nodes[1], edge);
        }
        const breakpoints = new Set(originalAnchors.keys());
        for (const [node, edges] of adjacency) {
            const directions = edges.map((edge) => {
                const other = edge.nodes.find((cell) => cell !== node),
                    [x, y] = point(node),
                    [ox, oy] = point(other);
                return [Math.abs(ox - x), Math.abs(oy - y)].join(",");
            });
            const owners = new Set(edges.map((edge) => ownerKey(edge.owners)));
            if (edges.length !== 2 || new Set(directions).size !== 1 || owners.size !== 1) breakpoints.add(node);
        }
        const visited = new Set(),
            links = {};
        for (const first of unitEdges.values()) {
            if (visited.has(first.id)) continue;
            let current = breakpoints.has(first.nodes[0]) ? first.nodes[0] : first.nodes[1],
                edge = first;
            const cells = [current],
                owners = [...first.owners].sort();
            while (edge) {
                visited.add(edge.id);
                const next = edge.nodes[0] === current ? edge.nodes[1] : edge.nodes[0];
                cells.push(next);
                if (breakpoints.has(next)) break;
                edge = adjacency
                    .get(next)
                    .find((candidate) => !visited.has(candidate.id) && ownerKey(candidate.owners) === owners.join("+"));
                current = next;
            }
            const a = cells[0],
                b = cells.at(-1),
                id = `${edgeKey(a, b)}#${owners.join("+")}`,
                max = 2 + 0.5 * (cells.length - 1);
            links[id] = { id, a, b, cells, built: [...cells], started: true, hp: max, max, owners, cooldown: 0 };
        }
        const anchors = {};
        for (const [cell, initialOwners] of originalAnchors) {
            const owners = new Set(initialOwners);
            for (const link of Object.values(links))
                if (link.a === cell || link.b === cell) for (const owner of link.owners) owners.add(owner);
            anchors[cell] = { k: cell, placed: true, hp: 2, max: 2, owners: [...owners].sort(), cooldown: 0 };
        }
        const junctions = {};
        for (const cell of breakpoints) {
            if (anchors[cell]) continue;
            const incident = Object.values(links).filter((link) => link.a === cell || link.b === cell);
            junctions[cell] = {
                k: cell,
                kind: incident.length >= 4 ? "crossing" : "junction",
                links: incident.map((link) => link.id),
                owners: [...new Set(incident.flatMap((link) => link.owners))].sort(),
            };
        }
        return { anchors, links, junctions };
    }
    function shape(map, vertices, type) {
        const closed = type !== "line",
            edges = [];
        for (let i = 0; i < (closed ? vertices.length : vertices.length - 1); i++)
            edges.push(segment(vertices[i], vertices[(i + 1) % vertices.length]));
        const boundary = [...new Set(edges.flat())];
        if (boundary.some((k) => !floor(map, ...point(k)) || map.protected.includes(k) || map.occupied.includes(k)))
            return;
        const xs = vertices.map((p) => p[0]),
            ys = vertices.map((p) => p[1]);
        const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        const outside = ([x, y]) => x < bounds[0] || x > bounds[2] || y < bounds[1] || y > bounds[3];
        let core,
            interior = [];
        if (closed) {
            // Polygon membership is computed geometrically, so map walls cannot masquerade as web closure.
            const within = ([x, y]) => {
                let yes = false;
                for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
                    const [xi, yi] = vertices[i],
                        [xj, yj] = vertices[j];
                    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) yes = !yes;
                }
                return yes && !boundary.includes(key(x, y));
            };
            for (let y = bounds[1] + 1; y < bounds[3]; y++)
                for (let x = bounds[0] + 1; x < bounds[2]; x++) if (within([x, y])) interior.push(key(x, y));
            if (interior.some((k) => !floor(map, ...point(k)))) return;
            const freeCore = (x, y) =>
                [-1, 0, 1].every((dx) =>
                    [-1, 0, 1].every((dy) => {
                        const k = key(x + dx, y + dy);
                        return interior.includes(k) && !map.occupied.includes(k) && !map.protected.includes(k);
                    }),
                );
            for (const k of interior) {
                const [x, y] = point(k);
                if (freeCore(x, y)) {
                    core = [x, y];
                    break;
                }
            }
            if (!core) return;
            const cx = (bounds[0] + bounds[2]) / 2,
                cy = (bounds[1] + bounds[3]) / 2;
            const centers = interior.map(point).filter(([x, y]) => freeCore(x, y));
            centers.sort((a, b) => distance(a, [cx, cy]) - distance(b, [cx, cy]));
            core = centers[0];
        } else core = point(boundary[Math.floor(boundary.length / 2)]);
        return { type, vertices, edges, boundary, bounds, interior, core, outside };
    }
    function analyze(map, origin, seed, groupId, nesting = false) {
        const reachable = flood(map, origin, new Set(map.occupied)).cells;
        const candidates = [],
            chokes = [],
            candidateKeys = new Set();
        const w = map.grid[0].length,
            h = map.grid.length;
        for (let y = 1; y < h - 1; y++)
            for (let x = 1; x < w - 1; x++) {
                if (!floor(map, x, y)) continue;
                if (
                    (!floor(map, x - 1, y) && !floor(map, x + 1, y)) ||
                    (!floor(map, x, y - 1) && !floor(map, x, y + 1))
                )
                    chokes.push([x, y]);
            }
        const add = (s) => {
            if (!s || !s.boundary.some((k) => reachable.has(k))) return;
            const geometryKey = s.type + ":" + [...s.boundary].sort().join(";");
            if (candidateKeys.has(geometryKey)) return;
            candidateKeys.add(geometryKey);
            const nearExit = map.end ? distance(s.core, map.end) : 20;
            const approach = flood(map, origin, new Set(map.occupied), (p) => s.boundary.includes(key(...p))).path;
            const nearGroup = Math.max(0, approach.length - 1);
            const choke = chokes.length ? Math.min(...chokes.map((c) => distance(c, s.core))) : 20;
            const nest = map.nest ? Math.max(0, 30 - 3 * distance(s.core, map.nest)) : 0;
            const routeBonus = map.route?.some((k) => s.boundary.includes(k)) ? 18 : 0;
            const reasons = {
                exit: Math.max(0, 20 - nearExit),
                choke: Math.max(0, 12 - 2 * choke),
                route: routeBonus,
                nest,
                travel: -nearGroup * 0.3,
                space: s.type === "line" ? 0 : 8,
                shape: s.type === "orthogonal" ? 4 : 0,
            };
            const score = Object.values(reasons).reduce((a, b) => a + b, 0);
            const gate =
                s.type === "line"
                    ? undefined
                    : s.edges
                          .map((cells, i) => ({ i, k: cells[Math.floor(cells.length / 2)] }))
                          .filter((v) => s.edges[v.i].length >= 3)
                          .sort((a, b) => distance(point(a.k), map.start) - distance(point(b.k), map.start))[0];
            delete s.outside;
            candidates.push({
                ...s,
                id: `${s.type}:${s.vertices.map((p) => key(...p)).join(";")}`,
                score,
                reasons,
                context: s.type === "line" ? "narrow corridor / intersection branch" : "free room footprint",
                approachSteps: nearGroup,
                gate: gate?.k,
                gateEdge: gate?.i,
            });
        };
        // Small explicit templates, translated over the actual map. No field coordinates are preselected.
        for (let y = 1; y < h - 4; y++)
            for (let x = 1; x < w - 4; x++) {
                for (const width of [5, 7, 9])
                    for (const height of [5, 7, 9]) {
                        if (x + width >= w || y + height >= h) continue;
                        add(
                            shape(
                                map,
                                [
                                    [x, y],
                                    [x + width - 1, y],
                                    [x + width - 1, y + height - 1],
                                    [x, y + height - 1],
                                ],
                                "rectangle",
                            ),
                        );
                    }
                // A concave orthogonal room template with two arms at least three interior cells wide.
                if (x + 8 < w && y + 8 < h)
                    add(
                        shape(
                            map,
                            [
                                [x, y],
                                [x + 4, y],
                                [x + 4, y + 4],
                                [x + 8, y + 4],
                                [x + 8, y + 8],
                                [x, y + 8],
                            ],
                            "orthogonal",
                        ),
                    );
            }
        const seen = new Set();
        for (const [x, y] of chokes)
            for (const [dx, dy] of [
                [1, 0],
                [0, 1],
            ]) {
                for (const len of [2, 3]) {
                    const a = [x - dx, y - dy],
                        b = [a[0] + dx * (len - 1), a[1] + dy * (len - 1)],
                        id = a + ":" + b;
                    if (seen.has(id)) continue;
                    seen.add(id);
                    add(shape(map, [a, b], "line"));
                }
            }
        // Two-cell cross-sections have no one-cell choke; identify narrow cuts explicitly.
        for (let y = 1; y < h - 1; y++)
            for (let x = 1; x < w - 1; x++)
                for (const [dx, dy] of [
                    [1, 0],
                    [0, 1],
                ]) {
                    if (!floor(map, x - dx, y - dy) && !floor(map, x + 2 * dx, y + 2 * dy))
                        add(
                            shape(
                                map,
                                [
                                    [x, y],
                                    [x + dx, y + dy],
                                ],
                                "line",
                            ),
                        );
                }
        candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
        let eligible = candidates.filter((c) => c.type !== "line");
        if (nesting) {
            for (const c of eligible) {
                const [l, t, r, b] = c.bounds;
                if (c.type === "rectangle" && r - l + 7 <= 13 && b - t + 7 <= 13) {
                    const outer = shape(
                        map,
                        [
                            [l - 3, t - 3],
                            [r + 3, t - 3],
                            [r + 3, b + 3],
                            [l - 3, b + 3],
                        ],
                        "rectangle",
                    );
                    if (outer) {
                        delete outer.outside;
                        const innerGate = point(c.gate);
                        outer.gate =
                            innerGate[0] === l
                                ? key(l - 3, innerGate[1])
                                : innerGate[0] === r
                                  ? key(r + 3, innerGate[1])
                                  : innerGate[1] === t
                                    ? key(innerGate[0], t - 3)
                                    : key(innerGate[0], b + 3);
                        const blocked = new Set([...map.occupied, ...c.boundary, ...outer.boundary]);
                        blocked.delete(c.gate);
                        blocked.delete(outer.gate);
                        const entrancePath = flood(map, map.start, blocked, (p) => key(...p) === key(...c.core)).path;
                        if (entrancePath.length) {
                            c.outer = outer;
                            c.entrancePath = entrancePath;
                        }
                    }
                }
            }
            const nested = eligible.filter((c) => c.outer);
            if (nested.length) eligible = nested;
        }
        if (!eligible.length) eligible = candidates.filter((c) => c.type === "line");
        const shortlist = eligible.slice(0, 8),
            rng = random(seed + ":" + groupId);
        let draw = rng() * shortlist.reduce((s, c) => s + Math.max(1, c.score - shortlist.at(-1).score + 2), 0),
            selected;
        for (const c of shortlist) {
            draw -= Math.max(1, c.score - shortlist.at(-1).score + 2);
            if (draw <= 0) {
                selected = c;
                break;
            }
        }
        return {
            candidates,
            chokes,
            selected: selected || shortlist[0],
            shortlist: shortlist.map((c) => c.id),
            fallback:
                eligible[0]?.type === "line" ? "Interception line" : eligible.length ? "Enclosure" : "No legal site",
            policy: "Eligible enclosure templates first; otherwise interception lines. Weighted top-eight shortlist within that class. Travel uses reachable path length; strategic AI remains unimplemented.",
        };
    }
    function fixedMaps() {
        const maps = [];
        function make(id, name, desc, rects, start, end, spawns, extra = {}) {
            const grid = Array.from({ length: 21 }, () => Array(31).fill("#"));
            for (const [l, t, r, b] of rects)
                for (let y = t; y <= b; y++) for (let x = l; x <= r; x++) grid[y][x] = ".";
            grid[start[1]][start[0]] = "S";
            grid[end[1]][end[0]] = "E";
            for (const [x, y] of extra.doors || []) grid[y][x] = "D";
            const m = {
                id,
                name,
                desc,
                grid: grid.map((r) => r.join("")),
                start,
                end,
                spawns,
                kind: "hand-authored",
                protected: [key(...start), key(...end), ...(extra.doors || []).map((p) => key(...p))],
                occupied: [],
                ...extra,
            };
            m.walk = [];
            for (let y = 0; y < 21; y++) for (let x = 0; x < 31; x++) if (grid[y][x] !== "#") m.walk.push(key(x, y));
            m.route = flood(m, start, new Set(), (p) => key(...p) === key(...end)).path.map((p) => key(...p));
            maps.push(m);
        }
        make(
            "door",
            "Single-cell doorway",
            "The door is protected. Select the adjoining corridor and fall back to an interception line.",
            [
                [1, 9, 29, 11],
                [14, 9, 16, 9],
                [14, 11, 16, 11],
            ],
            [2, 10],
            [28, 10],
            [
                [9, 10],
                [11, 10],
            ],
            { doors: [[15, 10]] },
        );
        // Replace the side cells near the door with walls.
        const d = maps[0];
        d.grid = d.grid.map((r, y) => {
            const a = [...r];
            if (y === 9 || y === 11) for (let x = 14; x <= 16; x++) a[x] = "#";
            return a.join("");
        });
        d.walk = d.walk.filter((k) => {
            const [x, y] = point(k);
            return d.grid[y][x] !== "#";
        });
        make(
            "corridor",
            "Two-cell corridor",
            "A two-cell cut supports a short link without forcing a room enclosure.",
            [[1, 9, 29, 10]],
            [2, 9],
            [28, 10],
            [
                [9, 9],
                [10, 10],
            ],
        );
        make(
            "tee",
            "T junction",
            "Blocking one branch may leave a detour. Inspect the route to the exit.",
            [
                [1, 9, 29, 10],
                [14, 2, 15, 10],
            ],
            [2, 9],
            [15, 2],
            [
                [11, 9],
                [12, 10],
            ],
        );
        make(
            "cross",
            "Crossroads",
            "Four branches. A single interception line is not a capture region.",
            [
                [1, 9, 29, 10],
                [14, 2, 15, 18],
            ],
            [2, 9],
            [28, 10],
            [
                [12, 9],
                [13, 10],
            ],
        );
        make(
            "room",
            "Regular room",
            "Prebuild the body and retain an entrance. Core entry starts incremental sealing.",
            [
                [1, 10, 8, 10],
                [8, 4, 24, 16],
                [24, 10, 29, 10],
            ],
            [2, 10],
            [28, 10],
            [
                [11, 9],
                [12, 11],
                [13, 9],
            ],
        );
        make(
            "irregular",
            "Irregular room",
            "Compare a concave orthogonal loop with rectangle candidates in an L-shaped room.",
            [
                [1, 7, 5, 7],
                [5, 3, 10, 16],
                [5, 11, 23, 16],
                [23, 14, 29, 14],
            ],
            [2, 7],
            [28, 14],
            [
                [7, 6],
                [8, 9],
                [12, 13],
            ],
        );
        make(
            "exit",
            "Near the exit",
            "Preserve exit and interaction cells while allowing a blockade of the only route.",
            [
                [1, 10, 7, 10],
                [7, 5, 24, 15],
                [24, 10, 29, 10],
            ],
            [2, 10],
            [28, 10],
            [
                [9, 8],
                [11, 12],
            ],
            { features: [[23, 10]] },
        );
        maps.at(-1).protected.push("23,10");
        make(
            "tight",
            "Insufficient space",
            "A connected 2×2 room holds the entry, exit and two Spinners. No legal anchor pair fits.",
            [[14, 10, 15, 11]],
            [14, 10],
            [15, 11],
            [
                [14, 11],
                [15, 10],
            ],
        );
        make(
            "overlap",
            "Overlapping groups",
            "Two groups reuse one layout with shared physical links, owners and destruction.",
            [
                [1, 10, 5, 10],
                [5, 3, 25, 17],
                [25, 10, 29, 10],
            ],
            [2, 10],
            [28, 10],
            [
                [10, 8],
                [11, 9],
                [12, 10],
                [13, 11],
            ],
            { overlap: true },
        );
        make(
            "nested",
            "Nested enclosure",
            "Four actors can plan a second layer around a common core with two free cells between boundaries.",
            [
                [1, 10, 4, 10],
                [4, 2, 26, 18],
                [26, 10, 29, 10],
            ],
            [2, 10],
            [28, 10],
            [
                [10, 8],
                [12, 8],
                [10, 12],
                [12, 12],
            ],
            { nested: true },
        );
        return maps;
    }
    function nativeMap(snapshot, i) {
        // Spinner can open unlocked D doors. Placement protection remains independent.
        const walk = [
            ...new Set([
                ...snapshot.movable.map((p) => key(...p)),
                ...snapshot.grid.flatMap((row, y) => [...row].flatMap((tile, x) => (tile === "D" ? [key(x, y)] : []))),
            ]),
        ];
        const protectedCells = [...new Set(snapshot.protectedCells.map((p) => key(p.x, p.y)))];
        const occupied = [...new Set(snapshot.entities.map((p) => key(p.x, p.y)))];
        const map = {
            id: `native-${i}`,
            name: `KD ${snapshot.version} · sample ${(i % 3) + 1}`,
            desc: "Native-generated snapshot with static original occupancy. Metadata cells are conservatively protected; debug Spinners occupy additional free cells.",
            kind: "native-generated",
            grid: snapshot.grid,
            walk,
            protected: protectedCells,
            occupied,
            locked: Object.entries(snapshot.tiles || {})
                .filter(([, v]) => v.Lock)
                .map(([k]) => k),
            start: [snapshot.start.x, snapshot.start.y],
            end: [snapshot.end.x, snapshot.end.y],
            snapshot,
            spawns: [],
        };
        const reachable = flood(map, map.start, new Set(occupied)).cells;
        const free = [...reachable].filter((k) => !protectedCells.includes(k));
        const root = free.find((k) => {
            const [x, y] = point(k);
            return free.filter((n) => distance(point(n), [x, y]) <= 2).length >= 8;
        });
        if (root)
            map.spawns = free
                .filter((k) => distance(point(k), point(root)) <= 2)
                .slice(0, 4)
                .map(point);
        map.route = flood(map, map.start, new Set(occupied), (p) => key(...p) === key(...map.end)).path.map((p) =>
            key(...p),
        );
        return map;
    }
    function log(s, message) {
        s.log.push({ turn: s.turn, message });
        if (s.log.length > 80) s.log.shift();
    }
    function create(map, seed = "spinner-01", count = map.spawns.length) {
        const s = {
            schema: 1,
            map: clone(map),
            seed,
            turn: 0,
            aware: false,
            target: { pos: [...map.start], kind: "player" },
            groups: [],
            fields: [],
            anchors: {},
            links: {},
            log: [],
            selection: null,
            mode: "inspect",
            lastDamage: [],
            candidate: null,
        };
        const available = map.spawns.concat(
            map.walk
                .map(point)
                .filter(
                    (p) =>
                        !map.occupied.includes(key(...p)) &&
                        !map.protected.includes(key(...p)) &&
                        distance(p, map.spawns[0] || map.start) < 5,
                ),
        );
        const used = new Set([key(...map.start), ...map.occupied]);
        const actors = [];
        for (const p of available) {
            if (used.has(key(...p))) continue;
            used.add(key(...p));
            actors.push({ id: `s${actors.length + 1}`, pos: [...p], active: true, budget: 0, last: "Idle", path: [] });
            if (actors.length >= count) break;
        }
        s.groups.push({ id: "g1", actors, fieldIds: [], active: true });
        s.analysis = analyze(map, actors[0]?.pos || map.start, seed, "g1", map.nested && count >= 4);
        log(s, `Found ${s.analysis.candidates.length} candidates; selected ${s.analysis.fallback}.`);
        return s;
    }
    function addField(s, c, g, layer = 0) {
        const id = "f" + (s.fields.length + 1),
            f = {
                id,
                group: g.id,
                layer,
                type: c.type,
                core: [...c.core],
                interior: [...c.interior],
                bounds: [...c.bounds],
                vertices: clone(c.vertices),
                anchors: [],
                links: [],
                gate: c.gate,
                phase: "preparing",
                triggered: false,
                retired: false,
            };
        // Custom debug shapes without a selected gate default to the west edge.
        if (!f.gate && c.type !== "line") f.gate = key(c.bounds[0], c.core[1]);
        for (const p of c.vertices) {
            const k = key(...p);
            s.anchors[k] ||= { k, placed: false, hp: 2, max: 2, owners: [], cooldown: 0 };
            if (!s.anchors[k].owners.includes(id)) s.anchors[k].owners.push(id);
            f.anchors.push(k);
        }
        c.edges.forEach((cells) => {
            const a = cells[0],
                b = cells.at(-1),
                lid = [a, b].sort().join("|");
            const max = 2 + 0.5 * (cells.length - 1);
            s.links[lid] ||= { id: lid, a, b, cells, built: [], started: false, hp: max, max, owners: [], cooldown: 0 };
            if (!s.links[lid].owners.includes(id)) s.links[lid].owners.push(id);
            f.links.push(lid);
        });
        s.fields.push(f);
        g.fieldIds.push(id);
        return f;
    }
    function plan(s, id) {
        if (s.fields.length) return log(s, "An active plan exists. Reset before selecting another site.");
        const g = s.groups[0];
        if (g.actors.filter((a) => a.active).length < 2) return log(s, "Construction requires at least two Spinners.");
        const c = s.analysis.candidates.find((c) => c.id === id) || s.analysis.selected;
        if (!c) return log(s, "No legal anchor pair or enclosure; abandon construction.");
        s.candidate = c.id;
        addField(s, c, g);
        if (c.outer && g.actors.filter((a) => a.active).length >= 4) {
            const outer = clone(c.outer);
            outer.core = c.core;
            addField(s, outer, g, 1);
        }
        const worksites = c.interior
            .map(point)
            .filter((p) => usableCell(s, key(...p)) && key(...p) !== key(...s.target.pos));
        const reservedSites = new Set();
        for (const actor of g.actors) {
            const choices = worksites.filter((p) => !reservedSites.has(key(...p)));
            choices.sort(
                (a, b) =>
                    distance(a, actor.pos) +
                    c.boundary.filter((k) => !workReach(s, a, point(k))).length * 2 -
                    (distance(b, actor.pos) + c.boundary.filter((k) => !workReach(s, b, point(k))).length * 2),
            );
            if (choices[0]) {
                actor.worksite = choices[0];
                reservedSites.add(key(...choices[0]));
            }
        }
        log(s, `Saved plan ${c.type}, score ${c.score.toFixed(1)}; ${g.fieldIds.length} layers.`);
    }
    function overlap(s) {
        if (!s.fields.length) plan(s);
        if (!s.fields.length || s.groups.length > 1) return;
        const source = s.fields[0],
            c = s.analysis.candidates.find((c) => c.id === s.candidate),
            used = new Set([
                ...s.map.occupied,
                key(...s.target.pos),
                ...s.groups.flatMap((g) => g.actors.map((a) => key(...a.pos))),
            ]);
        const positions = s.map.walk
            .filter((k) => !used.has(k) && !s.map.protected.includes(k) && distance(point(k), source.core) < 4)
            .slice(0, 2)
            .map(point);
        if (positions.length < 2) return log(s, "No legal cells for the second group.");
        const g = {
            id: "g2",
            actors: positions.map((p, i) => ({
                id: `sB${i}`,
                pos: p,
                active: true,
                budget: 0,
                last: "Idle",
                path: [],
            })),
            fieldIds: [],
            active: true,
        };
        s.groups.push(g);
        addField(s, c, g);
        log(s, "The second group reuses one HP record per shared anchor and link.");
    }
    function durabilityFixture(kind) {
        const specs = {
            identical: [
                {
                    id: "f1",
                    group: "g1",
                    type: "rectangle",
                    vertices: [
                        [9, 5],
                        [17, 5],
                        [17, 13],
                        [9, 13],
                    ],
                },
                {
                    id: "f2",
                    group: "g2",
                    type: "rectangle",
                    vertices: [
                        [9, 5],
                        [17, 5],
                        [17, 13],
                        [9, 13],
                    ],
                },
            ],
            partial: [
                {
                    id: "f1",
                    group: "g1",
                    type: "rectangle",
                    vertices: [
                        [9, 5],
                        [17, 5],
                        [17, 10],
                        [9, 10],
                    ],
                },
                {
                    id: "f2",
                    group: "g2",
                    type: "rectangle",
                    vertices: [
                        [13, 10],
                        [21, 10],
                        [21, 15],
                        [13, 15],
                    ],
                },
            ],
            crossing: [
                {
                    id: "f1",
                    group: "g1",
                    type: "line",
                    vertices: [
                        [9, 10],
                        [21, 10],
                    ],
                },
                {
                    id: "f2",
                    group: "g2",
                    type: "line",
                    vertices: [
                        [15, 5],
                        [15, 15],
                    ],
                },
            ],
            nested: [
                {
                    id: "f1",
                    group: "g1",
                    type: "rectangle",
                    vertices: [
                        [9, 5],
                        [21, 5],
                        [21, 15],
                        [9, 15],
                    ],
                },
                {
                    id: "f2",
                    group: "g2",
                    type: "rectangle",
                    vertices: [
                        [12, 8],
                        [18, 8],
                        [18, 12],
                        [12, 12],
                    ],
                },
            ],
        }[kind];
        if (!specs) throw Error(`Unknown durability fixture: ${kind}`);
        const map = clone(fixedMaps().find((candidate) => candidate.id === "room")),
            s = create(map, `durability-${kind}`, 2),
            graph = physicalGraph(specs);
        s.map.id = `durability-${kind}`;
        s.map.name = `${kind[0].toUpperCase()}${kind.slice(1)} physical graph`;
        s.map.desc = "Settled shared-durability fixture. Damage is injected and does not model native combat.";
        s.physicalGraph = true;
        s.candidate = `durability-${kind}`;
        s.anchors = graph.anchors;
        s.links = graph.links;
        s.junctions = graph.junctions;
        s.groups = specs.map((spec, index) => ({
            id: spec.group,
            actors: [
                {
                    id: `owner-${index + 1}`,
                    pos: index ? [20, 14] : [10, 6],
                    active: true,
                    budget: 0,
                    last: "Idle",
                    path: [],
                },
            ],
            fieldIds: [spec.id],
            active: true,
        }));
        s.fields = specs.map((spec, index) => {
            const geometry = shape(s.map, spec.vertices, spec.type);
            return {
                id: spec.id,
                group: spec.group,
                layer: index,
                type: spec.type,
                core: [...geometry.core],
                interior: [...geometry.interior],
                bounds: [...geometry.bounds],
                vertices: clone(spec.vertices),
                anchors: spec.vertices.map((vertex) => key(...vertex)),
                links: Object.values(s.links)
                    .filter((link) => link.owners.includes(spec.id))
                    .map((link) => link.id),
                phase: spec.type === "line" ? "barrier" : "sealed",
                triggered: spec.type !== "line",
                retired: false,
            };
        });
        if (kind === "nested") s.target.pos = [...s.fields[1].core];
        else if (kind !== "crossing") s.target.pos = [...s.fields[0].core];
        s.analysis = { candidates: [], selected: null, fallback: null };
        s.log = [{ turn: 0, message: `Loaded the ${kind} shared-durability fixture.` }];
        return s;
    }
    function solids(s) {
        return new Set(
            Object.values(s.links)
                .filter((l) => l.hp > 0 && l.started !== false)
                .flatMap((l) => l.built),
        );
    }
    const inCore = (f, p) => f.interior.includes(key(...p));
    function update(s) {
        for (const f of s.fields) {
            if (f.retired) {
                f.phase = "retired";
                continue;
            }
            const links = f.links.map((id) => s.links[id]);
            const complete = links.every(
                (l) => l.hp > 0 && l.started !== false && l.cells.every((k) => l.built.includes(k)),
            );
            const ready = links.every(
                (l) => l.hp > 0 && l.started !== false && l.cells.every((k) => k === f.gate || l.built.includes(k)),
            );
            const was = f.phase;
            f.phase = complete
                ? f.type === "line"
                    ? "barrier"
                    : "sealed"
                : f.triggered
                  ? "sealing"
                  : ready
                    ? "ready"
                    : "preparing";
            if (links.some((l) => l.cooldown > 0)) f.phase = "breached";
            if (f.phase !== was) log(s, `${f.id}: ${phaseName(f.phase)}`);
        }
    }
    function gateAllowed(s, f) {
        if (!f.triggered) return false;
        return s.fields.filter((o) => o.group === f.group && o.layer < f.layer).every((o) => o.phase === "sealed");
    }
    function tasks(s, g) {
        const results = [];
        const fields = g.fieldIds.map((id) => s.fields.find((f) => f.id === id)).filter((f) => !f.retired);
        const layer = fields.find((f) => !["ready", "sealed", "barrier"].includes(f.phase))?.layer ?? 0;
        for (const f of fields) {
            if (f.layer > layer) continue;
            for (const k of f.anchors)
                if (!s.anchors[k].placed && s.anchors[k].cooldown <= 0)
                    results.push({ type: "anchor", k, id: k, f: f.id });
            for (const id of f.links) {
                const l = s.links[id];
                if (l.cooldown > 0 || !s.anchors[l.a].placed || !s.anchors[l.b].placed) continue;
                if (l.started === false && l.cells.every((k) => l.built.includes(k)))
                    results.push({ type: "extend", k: l.b, id, f: f.id });
                for (const k of l.cells) {
                    if (l.built.includes(k) || (k === f.gate && !gateAllowed(s, f))) continue;
                    const idx = l.cells.indexOf(k),
                        ends = [l.a, l.b];
                    if (
                        !ends.includes(k) &&
                        ![l.cells[idx - 1], l.cells[idx + 1]].some((n) => l.built.includes(n) || ends.includes(n))
                    )
                        continue;
                    results.push({ type: "extend", k, id, f: f.id });
                }
            }
        }
        return results;
    }
    function usableCell(s, k) {
        return floor(s.map, ...point(k)) && !s.map.protected.includes(k) && !s.map.occupied.includes(k);
    }
    function workReach(s, from, to) {
        if (Math.hypot(from[0] - to[0], from[1] - to[1]) > 5) return false;
        const steps = distance(from, to);
        for (let i = 1; i <= steps; i++) {
            const x = Math.round(from[0] + ((to[0] - from[0]) * i) / steps);
            const y = Math.round(from[1] + ((to[1] - from[1]) * i) / steps);
            if (!floor(s.map, x, y) || s.map.grid[y][x] === "D" || s.map.occupied.includes(key(x, y))) return false;
        }
        return true;
    }
    function validFootprint(s, f) {
        return (
            f.links.every((id) => s.links[id].cells.every((k) => usableCell(s, k))) &&
            f.interior.every((k) => floor(s.map, ...point(k))) &&
            (f.type === "line" ||
                [-1, 0, 1].every((dx) => [-1, 0, 1].every((dy) => usableCell(s, key(f.core[0] + dx, f.core[1] + dy)))))
        );
    }
    function editTerrain(s, k) {
        const [x, y] = point(k);
        if (
            x < 0 ||
            y < 0 ||
            y >= s.map.grid.length ||
            x >= s.map.grid[0].length ||
            s.map.protected.includes(k) ||
            s.map.occupied.includes(k) ||
            key(...s.target.pos) === k ||
            s.groups.some((g) => g.actors.some((a) => a.active && key(...a.pos) === k))
        )
            return false;
        const wasFloor = s.map.walk.includes(k);
        s.map.walk = wasFloor ? s.map.walk.filter((v) => v !== k) : [...s.map.walk, k];
        const row = [...s.map.grid[y]];
        row[x] = wasFloor ? "#" : ".";
        s.map.grid[y] = row.join("");
        for (const l of Object.values(s.links))
            if (wasFloor && l.cells.includes(k)) {
                l.hp = 0;
                l.built = [];
                l.cooldown = 4;
            }
        if (wasFloor && s.anchors[k]) s.anchors[k].placed = false;
        s.analysis = analyze(s.map, s.groups[0].actors[0]?.pos || s.map.start, s.seed, "g1", s.map.nested);
        log(s, "Terrain changed. The next action revalidates boundary, interior and core.");
        update(s);
        return true;
    }
    function step(s) {
        s.turn++;
        s.lastDamage = [];
        // Revalidate the entire active footprint. Keep legal old silk as retired obstacles.
        for (const g of s.groups) {
            const active = s.fields.filter((f) => f.group === g.id && !f.retired);
            if (!active.some((f) => !validFootprint(s, f))) continue;
            for (const f of active) f.retired = true;
            g.fieldIds = [];
            const origin = g.actors.find((a) => a.active)?.pos;
            if (!origin) continue;
            s.analysis = analyze(s.map, origin, s.seed, g.id, false);
            const next = s.analysis.candidates.find((c) => c.type === "line") || s.analysis.selected;
            if (next && g.actors.filter((a) => a.active).length >= 2) {
                addField(s, next, g);
                s.candidate = next.id;
                log(s, `${g.id} invalid plan; fallback / relocation to ${next.type}.`);
            } else log(s, `${g.id} has no legal replacement after terrain change; abandon construction.`);
        }
        for (const a of Object.values(s.anchors)) a.cooldown = Math.max(0, a.cooldown - 1);
        for (const l of Object.values(s.links)) l.cooldown = Math.max(0, l.cooldown - 1);
        for (const l of Object.values(s.links))
            if (l.started === false && l.cooldown === 0)
                for (const k of [l.a, l.b]) if (s.anchors[k]?.placed && !l.built.includes(k)) l.built.push(k);
        for (const g of s.groups) {
            const inner = s.fields.find((f) => f.group === g.id && f.layer === 0 && !f.retired);
            if (inner?.type !== "line" && inner && inCore(inner, s.target.pos)) {
                if (!g.actors.some((a) => a.active && a.id === g.lureId)) {
                    // Do not freeze a worker on the entrance when assigning the stationary lure.
                    const builders = g.actors.filter((a) => a.active);
                    const workCells = new Set(
                        g.fieldIds.flatMap((id) =>
                            s.fields.find((f) => f.id === id).links.flatMap((id) => s.links[id].cells),
                        ),
                    );
                    g.lureId = (builders.find((a) => !workCells.has(key(...a.pos))) || builders[0])?.id;
                }
                s.aware = true;
                for (const id of g.fieldIds) s.fields.find((f) => f.id === id).triggered = true;
            }
            for (const id of g.fieldIds) {
                const f = s.fields.find((f) => f.id === id);
                const anyInside = g.fieldIds.some((fid) =>
                    inCore(
                        s.fields.find((v) => v.id === fid),
                        s.target.pos,
                    ),
                );
                if (f.triggered && !anyInside && f.phase !== "sealed") {
                    f.triggered = false;
                    f.reopen = true;
                }
            }
        }
        const reservations = new Set();
        // Count from the last live owner, independently of each group's earlier losses.
        for (const structure of [...Object.values(s.links), ...Object.values(s.anchors)]) {
            const owned = structure.owners.some((id) => {
                const field = s.fields.find((f) => f.id === id);
                return s.groups.find((g) => g.id === field?.group)?.actors.some((a) => a.active);
            });
            structure.ownerless = owned ? 0 : (structure.ownerless || 0) + 1;
            if (structure.ownerless === 20) {
                if (structure.cells) {
                    structure.hp = 0;
                    structure.built = [];
                } else structure.placed = false;
            }
        }
        for (const g of s.groups) {
            const actors = g.actors.filter((a) => a.active);
            if (!actors.length) {
                g.ownerless = (g.ownerless || 0) + 1;
                if (g.ownerless === 20) {
                    for (const f of s.fields.filter((f) => f.group === g.id)) {
                        f.retired = true;
                        f.phase = "retired";
                    }
                    log(s, `${g.id} has been ownerless for 20 turns; unshared structures collapse.`);
                }
                continue;
            }
            g.ownerless = 0;
            for (let i = 0; i < actors.length; i++) {
                const a = actors[i];
                a.budget += 1;
                a.path = [];
                if (a.budget < 1) {
                    a.last = "Awaiting budget";
                    continue;
                }
                a.budget -= 1;
                if (
                    s.aware &&
                    a.id === (actors.find((actor) => actor.id === g.lureId) || actors[0]).id &&
                    actors.length > 1
                ) {
                    delete a.assignment;
                    a.last = "Lure duty (stationary model)";
                    continue;
                }
                const f = g.fieldIds.map((id) => s.fields.find((f) => f.id === id)).find((f) => f.reopen);
                if (f) {
                    for (const id of f.links) s.links[id].built = s.links[id].built.filter((k) => k !== f.gate);
                    f.reopen = false;
                    a.last = "Reopen gate";
                    continue;
                }
                const pending = actors.length < 2 ? [] : tasks(s, g);
                const claimed = new Set(
                    s.groups
                        .flatMap((group) => group.actors)
                        .filter(
                            (actor) =>
                                actor.active &&
                                actor.id !== a.id &&
                                actor.assignment &&
                                pending.some(
                                    (t) =>
                                        t.k === actor.assignment.k &&
                                        t.id === actor.assignment.id &&
                                        (workReach(s, actor.pos, point(t.k)) || !workReach(s, a.pos, point(t.k))),
                                ),
                        )
                        .map((actor) => actor.assignment.k),
                );
                const options = pending.filter(
                    (t) => !reservations.has(t.k) && !claimed.has(t.k) && usableCell(s, t.k),
                );
                options.sort(
                    (a1, b) =>
                        Number(!workReach(s, a.pos, point(a1.k))) - Number(!workReach(s, a.pos, point(b.k))) ||
                        distance(point(a1.k), a.pos) - distance(point(b.k), a.pos) ||
                        a1.k.localeCompare(b.k),
                );
                if (a.assignment && !options.some((t) => workReach(s, a.pos, point(t.k))))
                    options.sort(
                        (x, y) =>
                            Number(y.k === a.assignment.k && y.id === a.assignment.id) -
                            Number(x.k === a.assignment.k && x.id === a.assignment.id),
                    );
                const occupied = new Set([
                    ...s.map.occupied,
                    key(...s.target.pos),
                    ...s.groups.flatMap((v) =>
                        v.actors.filter((v) => v.active && v.id !== a.id).map((v) => key(...v.pos)),
                    ),
                ]);
                if (a.worksite && key(...a.pos) === key(...a.worksite)) a.worksiteReached = true;
                if (
                    options.length &&
                    a.worksite &&
                    !a.worksiteReached &&
                    !options.some((t) => !occupied.has(t.k) && workReach(s, a.pos, point(t.k)))
                ) {
                    const approach = flood(s.map, a.pos, occupied, (p) => key(...p) === key(...a.worksite)).path;
                    if (approach.length > 1) {
                        if (payExtraHalf(a)) {
                            a.pos = approach[1];
                            a.path = approach;
                            a.last = "Move to worksite";
                        }
                        continue;
                    }
                }
                let chosen, path;
                for (const t of options) {
                    if (occupied.has(t.k)) continue;
                    const p = point(t.k),
                        r = flood(s.map, a.pos, occupied, (q) => workReach(s, q, p) && !occupied.has(key(...q)));
                    if (r.path.length) {
                        chosen = t;
                        path = r.path;
                        break;
                    }
                }
                if (!chosen) {
                    delete a.assignment;
                    // Idle workers yield cells that another paid construction action needs.
                    if (pending.some((t) => t.k === key(...a.pos))) {
                        const blockedWork = new Set(pending.map((t) => t.k));
                        const free = dirs
                            .map(([dx, dy]) => [a.pos[0] + dx, a.pos[1] + dy])
                            .find((p) => floor(s.map, ...p) && !occupied.has(key(...p)) && !blockedWork.has(key(...p)));
                        if (free) {
                            if (payExtraHalf(a)) {
                                a.pos = free;
                                a.last = "Move to worksite";
                            }
                            continue;
                        }
                    }
                    const anchorRepair = Object.values(s.anchors).find(
                        (v) =>
                            v.placed &&
                            v.hp > 0 &&
                            v.hp < v.max &&
                            v.owners.some(
                                (id) => g.fieldIds.includes(id) && !s.fields.find((f) => f.id === id).retired,
                            ) &&
                            distance(point(v.k), a.pos) <= 1,
                    );
                    if (anchorRepair) {
                        if (!payExtraHalf(a)) continue;
                        anchorRepair.hp = Math.min(anchorRepair.max, anchorRepair.hp + anchorRepair.max * 0.1);
                        a.last = "Repair anchor 10%";
                        continue;
                    }
                    const repair = Object.values(s.links).find(
                        (l) =>
                            l.hp > 0 &&
                            l.hp < l.max &&
                            l.owners.some(
                                (id) => g.fieldIds.includes(id) && !s.fields.find((f) => f.id === id).retired,
                            ) &&
                            l.cells.some((k) => distance(point(k), a.pos) <= 1),
                    );
                    if (repair) {
                        if (!payExtraHalf(a)) continue;
                        repair.hp = Math.min(repair.max, repair.hp + repair.max * 0.1);
                        a.last = "Repair link 10%";
                    } else a.last = options.length ? "Waiting for a free work position" : "Idle";
                    continue;
                }
                reservations.add(chosen.k);
                a.task = chosen;
                a.path = path;
                if (path.length > 1) {
                    if (!payExtraHalf(a)) continue;
                    a.assignment = chosen;
                    a.pos = path[1];
                    a.last = "Move to worksite";
                    continue;
                }
                delete a.assignment;
                if (chosen.type === "anchor") {
                    const anchor = s.anchors[chosen.id];
                    anchor.placed = true;
                    anchor.hp = anchor.max;
                    // A placed anchor already supplies the endpoint cell of each attached link.
                    for (const l of Object.values(s.links))
                        if ((l.a === chosen.k || l.b === chosen.k) && !l.built.includes(chosen.k))
                            l.built.push(chosen.k);
                    a.last = "Place anchor";
                } else {
                    const l = s.links[chosen.id];
                    if (l.hp <= 0) l.hp = l.max;
                    l.started = true;
                    if (!l.built.includes(chosen.k)) l.built.push(chosen.k);
                    a.last = "Extend one cell";
                }
            }
        }
        update(s);
        return s;
    }
    function payExtraHalf(actor) {
        // The base action already spent one point. Movement and repair retain a 1.5-point cost.
        if (actor.budget < 0.5) {
            actor.budget += 1;
            actor.last = "Awaiting budget";
            return false;
        }
        actor.budget -= 0.5;
        return true;
    }
    function settle(s, limit = 400) {
        if (!s.fields.length) return s;
        let idle = 0,
            prev = "";
        for (let i = 0; i < limit; i++) {
            step(s);
            if (s.fields.length && s.fields.every((f) => ["ready", "sealed", "barrier", "retired"].includes(f.phase)))
                break;
            const sig = JSON.stringify([
                Object.values(s.anchors).map((a) => a.placed),
                Object.values(s.links).map((l) => l.built),
                s.groups.map((g) => g.actors.map((a) => a.pos)),
            ]);
            idle = sig === prev ? idle + 1 : 0;
            prev = sig;
            if (idle >= 12) {
                log(
                    s,
                    "No construction progress for 12 turns. Inspect occupancy or choose another site; no obstacle was forced into place.",
                );
                break;
            }
        }
        return s;
    }
    function graphAnchorDistances(s) {
        const adjacency = new Map(),
            queue = [],
            distances = new Map();
        const connect = (a, b) => {
            if (!adjacency.has(a)) adjacency.set(a, new Set());
            if (!adjacency.has(b)) adjacency.set(b, new Set());
            adjacency.get(a).add(b);
            adjacency.get(b).add(a);
        };
        for (const link of Object.values(s.links))
            if (link.hp > 0 && link.started !== false)
                for (let i = 1; i < link.cells.length; i++)
                    if (link.built.includes(link.cells[i - 1]) && link.built.includes(link.cells[i]))
                        connect(link.cells[i - 1], link.cells[i]);
        for (const anchor of Object.values(s.anchors))
            if (anchor.placed && anchor.hp > 0) {
                distances.set(anchor.k, 0);
                queue.push(anchor.k);
            }
        for (let i = 0; i < queue.length; i++) {
            const cell = queue[i],
                nextDistance = distances.get(cell) + 1;
            for (const next of adjacency.get(cell) || [])
                if (!distances.has(next)) {
                    distances.set(next, nextDistance);
                    queue.push(next);
                }
        }
        return distances;
    }
    function damageMultiplier(s, link, cell, anchorDistances) {
        const d = s.physicalGraph
            ? ((anchorDistances || graphAnchorDistances(s)).get(cell) ?? Infinity)
            : Math.min(distance(point(cell), point(link.a)), distance(point(cell), point(link.b)));
        return Math.max(0.25, 1 - 0.15 * d);
    }
    function attack(s, cell, amount = 1, aoe = false) {
        const p = point(cell),
            cells = aoe ? [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => key(p[0] + dx, p[1] + dy))) : [cell],
            anchorDistances = graphAnchorDistances(s);
        const damaged = new Map(),
            destroyed = [];
        for (const k of cells) {
            const anchor = s.anchors[k];
            if (anchor?.placed && anchor.hp > 0) {
                anchor.hp = Math.max(0, anchor.hp - amount);
                for (const l of Object.values(s.links))
                    if (l.a === k || l.b === k) damaged.set(l.id, (damaged.get(l.id) || 0) + amount);
                if (anchor.hp === 0) {
                    anchor.placed = false;
                    anchor.cooldown = 4;
                    destroyed.push(k);
                }
            } else
                for (const l of Object.values(s.links))
                    if (l.hp > 0 && l.built.includes(k)) {
                        damaged.set(
                            l.id,
                            (damaged.get(l.id) || 0) + amount * damageMultiplier(s, l, k, anchorDistances),
                        );
                    }
        }
        s.lastDamage = [];
        for (const [id, n] of damaged) {
            const l = s.links[id];
            l.hp = Math.max(0, l.hp - n);
            s.lastDamage.push({ id, damage: Number(n.toFixed(3)) });
        }
        for (const l of Object.values(s.links)) {
            if (destroyed.includes(l.a) || destroyed.includes(l.b)) l.hp = 0;
            if (l.hp <= 0 && l.built.length) {
                l.built = [];
                l.started = false;
                l.cooldown = 4;
            }
        }
        log(
            s,
            `Debug damage ${aoe ? "3×3 area" : "Single cell"}: ${s.lastDamage.map((v) => v.damage.toFixed(2)).join(" / ") || "No structure hit"}.`,
        );
        update(s);
        return s;
    }
    function enterCore(s) {
        const f = s.fields.find((f) => f.type !== "line" && !f.retired);
        if (!f) return log(s, "Interception lines have no capture core.");
        const blocked = new Set([
            ...s.map.occupied,
            ...solids(s),
            ...s.groups.flatMap((g) => g.actors.filter((a) => a.active).map((a) => key(...a.pos))),
        ]);
        const target = f.interior
            .map(point)
            .filter((p) => !blocked.has(key(...p)))
            .sort((a, b) => distance(a, f.core) - distance(b, f.core))[0];
        if (!target) return log(s, "No legal target cell in the core.");
        s.target.pos = target;
        log(s, "Debug target placement in the inner core; gates still close one cell per action.");
        update(s);
    }
    function vacateLure(s) {
        const group = s.groups[0];
        const lure =
            group?.actors.find((a) => a.active && a.id === group.lureId) || group?.actors.find((a) => a.active);
        if (!lure) return false;
        const occupied = new Set([
            ...s.map.occupied,
            key(...s.target.pos),
            ...s.groups.flatMap((g) => g.actors.filter((a) => a.active).map((a) => key(...a.pos))),
        ]);
        const boundary = new Set(s.fields.flatMap((f) => f.links.flatMap((id) => s.links[id].cells)));
        const free = [...flood(s.map, lure.pos).cells].find(
            (k) => !occupied.has(k) && !boundary.has(k) && !s.map.protected.includes(k),
        );
        if (!free) return false;
        lure.pos = point(free);
        log(s, "Debug relocation of the stationary lure; this is not native bait AI or pathfinding.");
        return true;
    }
    function move(s, goal) {
        const blocked = new Set([
            ...solids(s),
            ...s.map.occupied,
            ...s.groups.flatMap((g) => g.actors.filter((a) => a.active).map((a) => key(...a.pos))),
        ]);
        const p = flood(s.map, s.target.pos, blocked, (v) => key(...v) === key(...goal)).path;
        if (p.length > 1) {
            s.target.pos = p[1];
            step(s);
        } else log(s, "No walkable route to that cell.");
    }
    function inspect(s) {
        const solid = solids(s),
            blocked = new Set([...solid, ...s.map.occupied]);
        const r = flood(s.map, s.target.pos, blocked, (p) => key(...p) === key(...s.map.end));
        const fields = s.fields.map((f) => {
            const boundary = new Set(f.links.flatMap((id) => s.links[id].cells));
            const beyond = (p) => !f.interior.includes(key(...p)) && !boundary.has(key(...p));
            const escape = flood(s.map, s.target.pos, blocked, beyond).path;
            const inside = inCore(f, s.target.pos);
            const captureEligible =
                f.type !== "line" &&
                !f.retired &&
                !s.fields.some(
                    (other) =>
                        other.id !== f.id &&
                        !other.retired &&
                        other.type !== "line" &&
                        f.interior.some((k) => other.interior.includes(k)) &&
                        !f.interior.every((k) => other.interior.includes(k)) &&
                        !other.interior.every((k) => f.interior.includes(k)),
                );
            return {
                id: f.id,
                phase: f.phase,
                inside,
                captureEligible,
                closed: f.type !== "line" && f.phase === "sealed" && validFootprint(s, f),
                escapePath: escape,
            };
        });
        return {
            solid: [...solid],
            // Goal-directed flood stops at the exit; the overlay needs the entire connected region.
            reachable: [...flood(s.map, s.target.pos, blocked).cells],
            exitPath: r.path,
            fields,
            geometryReady:
                fields.some((f) => f.closed && f.inside && f.captureEligible) &&
                !fields.some((f) => {
                    const source = s.fields.find((v) => v.id === f.id);
                    return f.inside && !f.closed && !source.retired && source.type !== "line";
                }),
            violations: [...solid].filter(
                (k) => s.map.protected.includes(k) || !s.map.walk.includes(k) || s.map.occupied.includes(k),
            ),
            physicalCells: solid.size,
            anchorCount: Object.values(s.anchors).filter((a) => a.placed).length,
            junctionCount: Object.keys(s.junctions || {}).length,
            sharedLinks: Object.values(s.links).filter((l) => l.owners.length > 1).length,
        };
    }
    function phaseName(p) {
        return (
            {
                preparing: "Preparing",
                ready: "Ready with entrance",
                sealing: "Sealing",
                sealed: "Sealed enclosure",
                barrier: "Interception complete",
                breached: "Breached; rebuilding delay",
                retired: "Retired roadblock",
            }[p] || p
        );
    }
    return {
        key,
        point,
        distance,
        clone,
        random,
        floor,
        flood,
        segment,
        physicalGraph,
        shape,
        analyze,
        fixedMaps,
        nativeMap,
        create,
        plan,
        addField,
        editTerrain,
        overlap,
        durabilityFixture,
        step,
        settle,
        graphAnchorDistances,
        damageMultiplier,
        attack,
        enterCore,
        vacateLure,
        move,
        inspect,
        phaseName,
        solids,
        update,
    };
})();
