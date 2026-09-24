"use strict";

// JSON-only field geometry and shared durability. Native entities are projections owned by the adapter.
(() => {
    const api = globalThis.Spiderlings,
        VERSION = 2,
        ANCHOR_HP = 2,
        OWNERLESS_TURNS = 20,
        REBUILD_TURNS = 4;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const key = (cell) => `${cell.x},${cell.y}`;
    const point = (value) => {
        if (typeof value === "string") {
            const [x, y] = value.split(",").map(Number);
            return { x, y };
        }
        return { x: value.x, y: value.y };
    };
    const sameCell = (a, b) => a.x === b.x && a.y === b.y;
    const unique = (values) => Array.from(new Set(values));
    const ownerKey = (owners) => [...owners].sort().join("+");
    const edgeKey = (a, b) => [a, b].sort().join("|");
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const directions = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: -1, y: -1 },
    ];

    function cellsBetween(a, b, includeEnds = false) {
        if (a.x !== b.x && a.y !== b.y) throw new Error("Spinner boundaries must be axis-aligned.");
        const cells = [],
            dx = Math.sign(b.x - a.x),
            dy = Math.sign(b.y - a.y),
            length = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)),
            start = includeEnds ? 0 : 1,
            end = includeEnds ? length : length - 1;
        for (let index = start; index <= end; index++) cells.push({ x: a.x + dx * index, y: a.y + dy * index });
        return cells;
    }

    function boundaryCells(vertices, closed = true) {
        const cells = [];
        for (let index = 0; index < (closed ? vertices.length : vertices.length - 1); index++)
            cells.push(...cellsBetween(vertices[index], vertices[(index + 1) % vertices.length], true));
        return unique(cells.map(key)).map(point);
    }

    function segmentsIntersect(a, b, c, d) {
        const verticalAB = a.x === b.x,
            verticalCD = c.x === d.x;
        if (verticalAB !== verticalCD) {
            const verticalA = verticalAB ? a : c,
                verticalB = verticalAB ? b : d,
                horizontalA = verticalAB ? c : a,
                horizontalB = verticalAB ? d : b;
            return (
                verticalA.x >= Math.min(horizontalA.x, horizontalB.x) &&
                verticalA.x <= Math.max(horizontalA.x, horizontalB.x) &&
                horizontalA.y >= Math.min(verticalA.y, verticalB.y) &&
                horizontalA.y <= Math.max(verticalA.y, verticalB.y)
            );
        }
        if (verticalAB && a.x === c.x)
            return Math.max(Math.min(a.y, b.y), Math.min(c.y, d.y)) <= Math.min(Math.max(a.y, b.y), Math.max(c.y, d.y));
        if (!verticalAB && a.y === c.y)
            return Math.max(Math.min(a.x, b.x), Math.min(c.x, d.x)) <= Math.min(Math.max(a.x, b.x), Math.max(c.x, d.x));
        return false;
    }

    function polygonInterior(vertices) {
        const xs = vertices.map((cell) => cell.x),
            ys = vertices.map((cell) => cell.y),
            boundary = new Set(boundaryCells(vertices).map(key)),
            cells = [];
        for (let y = Math.min(...ys) + 1; y < Math.max(...ys); y++)
            for (let x = Math.min(...xs) + 1; x < Math.max(...xs); x++) {
                let inside = false;
                for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
                    const a = vertices[i],
                        b = vertices[j];
                    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
                }
                if (inside && !boundary.has(`${x},${y}`)) cells.push({ x, y });
            }
        return cells;
    }

    function connected(cells) {
        if (!cells.length) return false;
        const remaining = new Set(cells.map(key)),
            queue = [cells[0]];
        remaining.delete(key(cells[0]));
        for (let index = 0; index < queue.length; index++)
            for (const direction of directions.slice(0, 4)) {
                const next = { x: queue[index].x + direction.x, y: queue[index].y + direction.y };
                if (remaining.delete(key(next))) queue.push(next);
            }
        return remaining.size === 0;
    }

    function mapHas(map, collection, cell) {
        return (map?.[collection] || []).includes(key(cell));
    }

    function validatePolygon(input, outer = false) {
        const vertices = (input.vertices || []).map(point),
            map = input.map;
        if (vertices.length < 4) return { valid: false, reason: "vertices" };
        for (let index = 0; index < vertices.length; index++) {
            const a = vertices[index],
                b = vertices[(index + 1) % vertices.length];
            if (sameCell(a, b) || (a.x !== b.x && a.y !== b.y)) return { valid: false, reason: "orthogonal" };
            for (let other = index + 1; other < vertices.length; other++) {
                if (other === index || other === index + 1 || (index === 0 && other === vertices.length - 1)) continue;
                if (segmentsIntersect(a, b, vertices[other], vertices[(other + 1) % vertices.length]))
                    return { valid: false, reason: "simple" };
            }
        }
        const boundary = boundaryCells(vertices),
            interior = polygonInterior(vertices),
            xs = vertices.map((cell) => cell.x),
            ys = vertices.map((cell) => cell.y),
            bounds = {
                left: Math.min(...xs),
                top: Math.min(...ys),
                right: Math.max(...xs),
                bottom: Math.max(...ys),
            };
        bounds.width = bounds.right - bounds.left + 1;
        bounds.height = bounds.bottom - bounds.top + 1;
        const interiorWidth = bounds.right - bounds.left - 1,
            interiorHeight = bounds.bottom - bounds.top - 1;
        if (!outer && (interiorWidth < 3 || interiorWidth > 7 || interiorHeight < 3 || interiorHeight > 7))
            return { valid: false, reason: "dimensions" };
        if (!connected(interior)) return { valid: false, reason: "interior" };
        if (
            map &&
            [...boundary, ...interior].some((cell) => !mapHas(map, "floor", cell) || mapHas(map, "locked", cell))
        )
            return { valid: false, reason: "terrain" };
        if (map && [...boundary, ...interior].some((cell) => mapHas(map, "protected", cell)))
            return { valid: false, reason: "protected" };
        if (outer && map && boundary.some((cell) => mapHas(map, "occupied", cell)))
            return { valid: false, reason: "occupied" };
        const interiorKeys = new Set(interior.map(key)),
            coreFree = (center) =>
                [-1, 0, 1].every((dx) =>
                    [-1, 0, 1].every((dy) => {
                        const cell = { x: center.x + dx, y: center.y + dy };
                        return (
                            interiorKeys.has(key(cell)) &&
                            !mapHas(map, "protected", cell) &&
                            !mapHas(map, "occupied", cell)
                        );
                    }),
                );
        const preferred = input.core && point(input.core),
            candidates = interior.filter(coreFree).sort((a, b) => {
                const center = { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
                return distance(a, center) - distance(b, center) || a.y - b.y || a.x - b.x;
            }),
            core = preferred && coreFree(preferred) ? preferred : candidates[0],
            gate = point(input.gate || {}),
            gateKey = key(gate),
            vertexKeys = new Set(vertices.map(key));
        if (!core) return { valid: false, reason: "core" };
        if (!boundary.some((cell) => sameCell(cell, gate)) || vertexKeys.has(gateKey))
            return { valid: false, reason: "gate" };
        const edge = vertices.findIndex((vertex, index) =>
            cellsBetween(vertex, vertices[(index + 1) % vertices.length], true).some((cell) => sameCell(cell, gate)),
        );
        if (edge < 0 || cellsBetween(vertices[edge], vertices[(edge + 1) % vertices.length], true).length < 4)
            return { valid: false, reason: "gate-edge" };
        return { valid: true, vertices, boundary, interior, bounds, core, gate };
    }

    function normalizeGraph(fieldSpecs, built = false) {
        const unitEdges = new Map(),
            adjacency = new Map(),
            originalAnchors = new Map();
        const addAdjacent = (cell, edge) => {
            if (!adjacency.has(cell)) adjacency.set(cell, []);
            adjacency.get(cell).push(edge);
        };
        for (const field of fieldSpecs) {
            for (const vertex of field.vertices) {
                const cell = key(vertex);
                if (!originalAnchors.has(cell)) originalAnchors.set(cell, new Set());
                originalAnchors.get(cell).add(field.id);
            }
            const closed = field.type !== "line";
            for (let index = 0; index < (closed ? field.vertices.length : field.vertices.length - 1); index++) {
                const cells = cellsBetween(
                    field.vertices[index],
                    field.vertices[(index + 1) % field.vertices.length],
                    true,
                );
                for (let cellIndex = 1; cellIndex < cells.length; cellIndex++) {
                    const a = key(cells[cellIndex - 1]),
                        b = key(cells[cellIndex]),
                        id = edgeKey(a, b);
                    if (!unitEdges.has(id)) unitEdges.set(id, { id, nodes: [a, b], owners: new Set() });
                    unitEdges.get(id).owners.add(field.id);
                }
            }
        }
        for (const edge of unitEdges.values()) {
            addAdjacent(edge.nodes[0], edge);
            addAdjacent(edge.nodes[1], edge);
        }
        const breakpoints = new Set(originalAnchors.keys());
        for (const [cell, edges] of adjacency) {
            const here = point(cell),
                axes = edges.map((edge) => {
                    const other = point(edge.nodes.find((candidate) => candidate !== cell));
                    return `${Math.abs(other.x - here.x)},${Math.abs(other.y - here.y)}`;
                });
            if (
                edges.length !== 2 ||
                new Set(axes).size !== 1 ||
                new Set(edges.map((edge) => ownerKey(edge.owners))).size !== 1
            )
                breakpoints.add(cell);
        }
        const visited = new Set(),
            links = [];
        for (const first of unitEdges.values()) {
            if (visited.has(first.id)) continue;
            let current = breakpoints.has(first.nodes[0]) ? first.nodes[0] : first.nodes[1],
                edge = first;
            const cellKeys = [current],
                owners = [...first.owners].sort();
            while (edge) {
                visited.add(edge.id);
                const next = edge.nodes[0] === current ? edge.nodes[1] : edge.nodes[0];
                cellKeys.push(next);
                if (breakpoints.has(next)) break;
                edge = adjacency
                    .get(next)
                    .find((candidate) => !visited.has(candidate.id) && ownerKey(candidate.owners) === owners.join("+"));
                current = next;
            }
            const maxHp = 2 + 0.5 * (cellKeys.length - 1),
                plannedCells = cellKeys.filter((cell) => !originalAnchors.has(cell)).map(point);
            links.push({
                id: `${edgeKey(cellKeys[0], cellKeys.at(-1))}#${owners.join("+")}`,
                a: cellKeys[0],
                b: cellKeys.at(-1),
                owners,
                cells: cellKeys.map(point),
                plannedCells,
                builtCells: built ? clone(plannedCells) : [],
                connected: built,
                hp: maxHp,
                maxHp,
                cooldown: 0,
                ownerlessAge: 0,
                collapsed: false,
            });
        }
        const anchors = [];
        for (const [cell, initialOwners] of originalAnchors) {
            const owners = new Set(initialOwners);
            for (const link of links)
                if (link.a === cell || link.b === cell) for (const owner of link.owners) owners.add(owner);
            const position = point(cell);
            anchors.push({
                id: cell,
                ...position,
                owners: [...owners].sort(),
                built,
                hp: ANCHOR_HP,
                maxHp: ANCHOR_HP,
                cooldown: 0,
                ownerlessAge: 0,
                collapsed: false,
                snaredTargetIds: [],
            });
        }
        const junctions = [];
        for (const cell of breakpoints) {
            if (originalAnchors.has(cell)) continue;
            const incident = links.filter((link) => link.a === cell || link.b === cell);
            const position = point(cell);
            junctions.push({
                ...position,
                kind: incident.length >= 4 ? "crossing" : "junction",
                linkIds: incident.map((link) => link.id),
                owners: unique(incident.flatMap((link) => link.owners)).sort(),
            });
        }
        return { anchors, links, junctions };
    }

    function baseState(input, graph) {
        const owners = unique(input.owners || []);
        return {
            version: VERSION,
            fieldId: input.fieldId || input.compositeId || "spinner-field",
            kind: input.kind || "line",
            owners,
            ownerlessAge: 0,
            collapsed: false,
            fieldOwners: Object.fromEntries((input.fieldSpecs || []).map((field) => [field.id, owners])),
            fields: {},
            lineFields: Object.fromEntries(
                (input.fieldSpecs || [])
                    .filter((field) => field.type === "line")
                    .map((field) => [
                        field.id,
                        { id: field.id, kind: "line", vertices: clone(field.vertices), retired: false },
                    ]),
            ),
            composites: {},
            workCreditByMember: {},
            assignmentByMember: {},
            actionLog: [],
            ...graph,
        };
    }

    function createPhysicalGraph(input) {
        const fieldSpecs = (input.fields || []).map((field) => ({
                ...field,
                vertices: field.vertices.map(point),
                type: field.type || "line",
            })),
            state = baseState(
                { ...input, fieldSpecs, fieldId: input.fieldId || fieldSpecs[0]?.id, kind: "graph" },
                normalizeGraph(fieldSpecs, !!input.built),
            );
        return state;
    }

    function createLine(input) {
        if (!input?.fieldId || !Array.isArray(input.owners) || input.owners.length === 0)
            throw new Error("A Spinner line needs a field ID and at least one owner.");
        if (!Array.isArray(input.anchors) || input.anchors.length !== 2)
            throw new Error("A Spinner interception line needs exactly two anchors.");
        const state = createPhysicalGraph({
            fieldId: input.fieldId,
            owners: input.owners,
            fields: [{ id: input.fieldId, type: "line", vertices: input.anchors }],
        });
        state.kind = "line";
        state.anchors.forEach((anchor, index) => {
            anchor.id = input.anchors[index].id || `${input.fieldId}:anchor:${index}`;
        });
        const link = state.links[0];
        link.id = `${input.fieldId}:link:0`;
        link.a = state.anchors[0].id;
        link.b = state.anchors[1].id;
        link.maxHp = 2 + 0.5 * (link.cells.length - 1);
        link.hp = link.maxHp;
        state.fieldOwners = { [input.fieldId]: clone(input.owners) };
        return state;
    }

    function addLine(state, input) {
        if (state?.lineFields?.[input?.fieldId] && !state.lineFields[input.fieldId].retired) return clone(state);
        const next = clone(state),
            line = createLine(input);
        next.version = VERSION;
        next.kind = "graph";
        next.lineFields = next.lineFields || {};
        next.lineFields[input.fieldId] = line.lineFields[input.fieldId];
        next.fieldOwners = next.fieldOwners || {};
        next.fieldOwners[input.fieldId] = clone(line.fieldOwners[input.fieldId]);
        next.owners = unique([...next.owners, ...line.owners]);
        next.anchors.push(...line.anchors);
        next.links.push(...line.links);
        next.junctions.push(...line.junctions);
        next.collapsed = false;
        return next;
    }

    function fieldRetired(state, fieldId) {
        return !!(state.fields?.[fieldId]?.retired || state.lineFields?.[fieldId]?.retired);
    }

    function retireField(state, fieldId) {
        const next = clone(state);
        if (!next.lineFields?.[fieldId] && !next.fields?.[fieldId]) return next;
        if (next.lineFields?.[fieldId]) next.lineFields[fieldId].retired = true;
        if (next.fields?.[fieldId]) next.fields[fieldId].retired = true;
        const retiredOnly = (structure) => structure.owners.every((owner) => fieldRetired(next, owner));
        next.anchors = next.anchors.filter((anchor) => !retiredOnly(anchor));
        next.links = next.links.filter((link) => !retiredOnly(link));
        const linkIds = new Set(next.links.map((link) => link.id));
        next.junctions = next.junctions
            .map((junction) => ({ ...junction, linkIds: junction.linkIds.filter((id) => linkIds.has(id)) }))
            .filter((junction) => junction.linkIds.length > 1);
        next.assignmentByMember = Object.fromEntries(
            Object.entries(next.assignmentByMember || {}).filter(([, action]) => action.fieldId !== fieldId),
        );
        next.owners = unique(
            Object.entries(next.fieldOwners || {})
                .filter(([id]) => !fieldRetired(next, id))
                .flatMap(([, owners]) => owners),
        );
        refresh(next);
        return next;
    }

    function setFieldOwners(state, fieldId, ownerIds) {
        const next = clone(state);
        if (!next.fieldOwners?.[fieldId]) return next;
        next.fieldOwners[fieldId] = unique(ownerIds || []);
        next.owners = unique(
            Object.entries(next.fieldOwners)
                .filter(([id]) => !fieldRetired(next, id))
                .flatMap(([, owners]) => owners),
        );
        return next;
    }

    function abandonedState(input, owners, reason) {
        return {
            ...baseState(
                { ...input, owners, fieldSpecs: [], fieldId: input.compositeId, kind: "abandoned" },
                { anchors: [], links: [], junctions: [] },
            ),
            reason,
        };
    }

    function createEnclosure(input) {
        const owners = unique(input.owners || []),
            requested = input.layers || [];
        if (owners.length < 2) return abandonedState(input, owners, "owners");
        const accepted = [];
        for (let index = 0; index < requested.length; index++) {
            if (index > 0 && owners.length < 4) break;
            const checked = validatePolygon({ ...requested[index], map: input.map }, index > 0);
            if (!checked.valid) {
                if (index === 0 && input.fallbackLine)
                    return {
                        ...createLine({ ...input.fallbackLine, owners }),
                        kind: "line",
                        fallbackReason: checked.reason,
                    };
                if (index === 0) return abandonedState(input, owners, checked.reason);
                break;
            }
            if (index > 0) {
                const inner = accepted[index - 1],
                    spacing =
                        Math.min(
                            ...checked.boundary.map((outer) =>
                                Math.min(...inner.boundary.map((cell) => distance(outer, cell))),
                            ),
                        ) - 1;
                if (
                    spacing !== 2 ||
                    !inner.boundary.every((cell) => checked.interior.some((inside) => sameCell(cell, inside))) ||
                    !checked.interior.some((cell) => sameCell(cell, accepted[0].core))
                )
                    break;
            }
            accepted.push({
                ...checked,
                id: requested[index].id || `${input.compositeId}:layer:${index}`,
                layer: index,
            });
        }
        if (!accepted.length) return abandonedState(input, owners, "vertices");
        const fieldSpecs = accepted.map((layer) => ({ id: layer.id, type: "enclosure", vertices: layer.vertices })),
            state = baseState(
                { ...input, fieldSpecs, fieldId: input.compositeId, kind: "enclosure" },
                normalizeGraph(fieldSpecs, !!input.built),
            ),
            core = accepted[0].core;
        state.composites[input.compositeId] = {
            id: input.compositeId,
            groupId: input.groupId,
            layerIds: accepted.map((layer) => layer.id),
            core,
            targetId: null,
            closureArmed: !!input.built,
        };
        for (const layer of accepted)
            state.fields[layer.id] = {
                id: layer.id,
                compositeId: input.compositeId,
                groupId: input.groupId,
                layer: layer.layer,
                kind: "enclosure",
                vertices: layer.vertices,
                boundaryCells: layer.boundary,
                interiorCells: layer.interior,
                bounds: layer.bounds,
                core,
                gateCell: layer.gate,
                spacing: layer.layer ? 2 : 0,
                phase: input.built ? "sealed" : "preparing",
                retired: false,
                reopenPending: false,
            };
        refresh(state);
        return state;
    }

    function addEnclosure(state, input) {
        if (state?.composites?.[input?.compositeId]) return { state, added: false, reason: "field" };
        const enclosure = createEnclosure(input);
        if (enclosure.kind !== "enclosure") return { state, added: false, reason: enclosure.reason || "field" };
        if (!state)
            return { state: enclosure, added: true, fieldId: enclosure.composites[input.compositeId].layerIds[0] };
        const occupied = new Set([...state.anchors.map(key), ...state.links.flatMap((link) => link.cells.map(key))]);
        if (
            [...enclosure.anchors, ...enclosure.links.flatMap((link) => link.cells)].some((cell) =>
                occupied.has(key(cell)),
            )
        )
            return { state, added: false, reason: "overlap" };
        const next = clone(state);
        next.kind = "graph";
        next.anchors.push(...enclosure.anchors);
        next.links.push(...enclosure.links);
        next.junctions.push(...enclosure.junctions);
        Object.assign(next.fields, enclosure.fields);
        Object.assign(next.composites, enclosure.composites);
        Object.assign(next.fieldOwners, enclosure.fieldOwners);
        next.owners = unique([...next.owners, ...enclosure.owners]);
        next.collapsed = false;
        refresh(next);
        return { state: next, added: true, fieldId: enclosure.composites[input.compositeId].layerIds[0] };
    }

    function extendEnclosure(state, input) {
        const composite = state?.composites?.[input?.compositeId],
            inner = composite && state.fields?.[composite.layerIds.at(-1)],
            owners = unique(input?.owners || state?.fieldOwners?.[inner?.id] || []),
            id = input?.layer?.id || `${input.compositeId}:layer:${composite?.layerIds.length}`;
        if (!inner || inner.retired || owners.length < 4 || state.fields[id] || state.lineFields?.[id])
            return { state, added: false, reason: "field" };
        if (!isLayerClosed(state, inner.id)) return { state, added: false, reason: "inner-open" };
        const checked = validatePolygon({ ...input.layer, map: input.map }, true);
        if (!checked.valid) return { state, added: false, reason: checked.reason };
        const innerBoundary = inner.boundaryCells,
            spacing =
                Math.min(
                    ...checked.boundary.map((outer) => Math.min(...innerBoundary.map((cell) => distance(outer, cell)))),
                ) - 1,
            interior = new Set(checked.interior.map(key)),
            otherBoundaries = new Set([
                ...Object.values(state.fields)
                    .filter((field) => field.compositeId !== composite.id && !field.retired)
                    .flatMap((field) => field.boundaryCells.map(key)),
                ...Object.values(state.lineFields || {})
                    .filter((field) => !field.retired)
                    .flatMap((field) => boundaryCells(field.vertices, false).map(key)),
            ]);
        if (
            spacing !== 2 ||
            !innerBoundary.every((cell) => interior.has(key(cell))) ||
            !interior.has(key(composite.core)) ||
            checked.boundary.some((cell) => otherBoundaries.has(key(cell)))
        )
            return { state, added: false, reason: "nesting" };
        const next = clone(state),
            graph = normalizeGraph([{ id, type: "enclosure", vertices: checked.vertices }]);
        next.anchors.push(...graph.anchors);
        next.links.push(...graph.links);
        next.junctions.push(...graph.junctions);
        next.owners = unique([...next.owners, ...owners]);
        next.fieldOwners[id] = owners;
        next.fields[id] = {
            id,
            compositeId: composite.id,
            groupId: composite.groupId,
            layer: composite.layerIds.length,
            kind: "enclosure",
            vertices: checked.vertices,
            boundaryCells: checked.boundary,
            interiorCells: checked.interior,
            bounds: checked.bounds,
            core: composite.core,
            gateCell: checked.gate,
            spacing: 2,
            phase: "preparing",
            retired: false,
            reopenPending: false,
        };
        next.composites[composite.id].layerIds.push(id);
        refresh(next);
        return { state: next, added: true, fieldId: id };
    }

    function solidCells(state) {
        if (!state || state.collapsed) return [];
        const cells = new Map();
        for (const anchor of state.anchors || [])
            if (anchor.built && anchor.hp > 0 && !anchor.collapsed)
                cells.set(key(anchor), { x: anchor.x, y: anchor.y, anchorIds: [anchor.id], linkIds: [] });
        for (const link of state.links || []) {
            if (!(link.hp > 0) || link.collapsed) continue;
            for (const cell of link.builtCells || []) {
                const current = cells.get(key(cell)) || { x: cell.x, y: cell.y, anchorIds: [], linkIds: [] };
                current.linkIds = unique([...current.linkIds, link.id]);
                cells.set(key(cell), current);
            }
            if (link.connected)
                for (const anchorId of [link.a, link.b]) {
                    const anchor = state.anchors.find(
                        (candidate) => candidate.id === anchorId || key(candidate) === anchorId,
                    );
                    if (!anchor?.built || !(anchor.hp > 0)) continue;
                    const current = cells.get(key(anchor));
                    if (current) current.linkIds = unique([...current.linkIds, link.id]);
                }
        }
        return Array.from(cells.values()).sort((a, b) => a.y - b.y || a.x - b.x);
    }

    function validateCell(snapshot, cell) {
        if (!snapshot?.inBounds || !snapshot?.floor) return "terrain";
        if (snapshot.protected) return "protected";
        if (snapshot.occupied) return "occupied";
        if (snapshot.cell && !sameCell(snapshot.cell, cell)) return "snapshot";
        return "";
    }

    function fieldBodyComplete(state, field) {
        const solids = new Set(solidCells(state).map(key)),
            gate = key(field.gateCell);
        if (!field.boundaryCells.every((cell) => key(cell) === gate || solids.has(key(cell)))) return false;
        return state.links
            .filter((link) => link.owners.includes(field.id) && !link.cells.some((cell) => key(cell) === gate))
            .every((link) => link.connected);
    }

    function isLayerClosed(state, fieldId) {
        const field = state.fields?.[fieldId];
        if (!field) return false;
        const solids = new Set(solidCells(state).map(key));
        return (
            field.boundaryCells.every((cell) => solids.has(key(cell))) &&
            state.links.filter((link) => link.owners.includes(field.id)).every((link) => link.connected && link.hp > 0)
        );
    }

    function refresh(state) {
        for (const field of Object.values(state.fields || {}).sort((a, b) => a.layer - b.layer)) {
            if (field.retired) {
                field.phase = "retired";
                continue;
            }
            const closed = isLayerClosed(state, field.id),
                body = fieldBodyComplete(state, field),
                wasComplete = ["sealed", "breached"].includes(field.phase);
            if (closed) field.phase = "sealed";
            else if (wasComplete) field.phase = "breached";
            else if (field.reopenPending) field.phase = "sealing";
            else if (body) field.phase = state.composites[field.compositeId]?.closureArmed ? "sealing" : "ready";
            else field.phase = "preparing";
        }
        return state;
    }

    function actionCell(state, action) {
        if (action.cell) return point(action.cell);
        if (action.type === "placeAnchor") {
            const anchor = state.anchors.find((candidate) => candidate.id === action.anchorId);
            return anchor && point(anchor);
        }
        const link = state.links.find((candidate) => candidate.id === action.linkId);
        return link?.plannedCells.find((cell) => !(link.builtCells || []).some((built) => sameCell(built, cell)));
    }

    function legalAction(state, action, snapshot) {
        if (!state || state.collapsed) return { legal: false, reason: "collapsed" };
        const fieldOwners = state.fieldOwners?.[action?.fieldId] || state.owners;
        if (!fieldOwners.includes(action?.ownerId)) return { legal: false, reason: "owner" };
        if (action.type === "placeAnchor") {
            const anchor = state.anchors.find((candidate) => candidate.id === action.anchorId);
            if (!anchor || anchor.built || anchor.hp <= 0) return { legal: false, reason: "anchor" };
            const reason = validateCell(snapshot, anchor);
            return { legal: !reason, reason };
        }
        if (["extendLink", "closeGate", "connectGate", "rebuildLink"].includes(action.type)) {
            const link = state.links.find((candidate) => candidate.id === action.linkId),
                cell = actionCell(state, action);
            if (!link || link.collapsed) return { legal: false, reason: "link" };
            if (action.type === "connectGate")
                return { legal: !link.connected && !!action.fieldId, reason: link.connected ? "link" : "" };
            if (action.type === "rebuildLink" && (!(link.cooldown >= REBUILD_TURNS) || link.hp > 0))
                return { legal: false, reason: "cooldown" };
            if (!cell) return { legal: !link.connected, reason: link.connected ? "link" : "" };
            if (!link.plannedCells.some((candidate) => sameCell(candidate, cell)))
                return { legal: false, reason: "cell" };
            if (link.builtCells.some((candidate) => sameCell(candidate, cell)))
                return { legal: false, reason: "built" };
            const reason = validateCell(snapshot, cell);
            return { legal: !reason, reason };
        }
        if (action.type === "reopenGate") {
            const link = state.links.find((candidate) => candidate.id === action.linkId),
                cell = actionCell(state, action);
            return {
                legal: !!link?.builtCells.some((candidate) => sameCell(candidate, cell)),
                reason: link ? "" : "link",
            };
        }
        if (action.type === "repair") {
            const structure =
                state.links.find((candidate) => candidate.id === action.linkId) ||
                state.anchors.find((candidate) => candidate.id === action.anchorId);
            return {
                legal: !!structure && structure.hp > 0 && structure.hp < structure.maxHp && !structure.collapsed,
                reason: structure ? "health" : "structure",
            };
        }
        if (action.type === "repairAnchor") {
            const anchor = state.anchors.find((candidate) => candidate.id === action.anchorId);
            return {
                legal: !!anchor?.built && anchor.hp > 0 && anchor.hp < anchor.maxHp,
                reason: !anchor?.built || anchor.hp <= 0 || anchor.hp >= anchor.maxHp ? "anchor" : "",
            };
        }
        if (action.type === "repairLink") {
            const link = state.links.find((candidate) => candidate.id === action.linkId);
            return {
                legal: !!link && link.hp > 0 && link.hp < link.maxHp && (link.builtCells.length > 0 || link.connected),
                reason:
                    !link || link.hp <= 0 || link.hp >= link.maxHp || (!link.builtCells.length && !link.connected)
                        ? "link"
                        : "",
            };
        }
        return { legal: false, reason: "action" };
    }

    function applyAction(state, action, snapshot) {
        const verdict = legalAction(state, action, snapshot);
        if (!verdict.legal) return { state: clone(state), effects: [], outcome: verdict };
        const next = clone(state),
            effects = [],
            cell = actionCell(next, action);
        if (action.type === "placeAnchor") {
            next.anchors.find((candidate) => candidate.id === action.anchorId).built = true;
            effects.push({ type: "placeProxy", cell });
        } else if (["extendLink", "closeGate", "connectGate", "rebuildLink"].includes(action.type)) {
            const link = next.links.find((candidate) => candidate.id === action.linkId);
            if (action.type === "rebuildLink") {
                link.hp = Math.max(link.maxHp * 0.1, 0.1);
                link.cooldown = 0;
                link.builtCells = [];
            }
            if (cell && action.type !== "connectGate") {
                link.builtCells.push(cell);
                effects.push({ type: "placeProxy", cell });
            }
            if (action.type === "connectGate") link.connected = true;
            else if (action.type !== "closeGate" && link.builtCells.length === link.plannedCells.length)
                link.connected = true;
        } else if (action.type === "reopenGate") {
            const link = next.links.find((candidate) => candidate.id === action.linkId);
            link.builtCells = link.builtCells.filter((candidate) => !sameCell(candidate, cell));
            link.connected = false;
            const field = next.fields[action.fieldId];
            if (field) field.reopenPending = false;
            effects.push({ type: "removeProxy", cell });
        } else if (["repair", "repairAnchor", "repairLink"].includes(action.type)) {
            const structure =
                next.links.find((candidate) => candidate.id === action.linkId) ||
                next.anchors.find((candidate) => candidate.id === action.anchorId);
            structure.hp = Math.min(structure.maxHp, Math.round((structure.hp + structure.maxHp * 0.1) * 1000) / 1000);
            effects.push({ type: "synchronizeProxies" });
        }
        next.actionLog = next.actionLog || [];
        next.actionLog.push({
            type: action.type,
            fieldId: action.fieldId,
            role: action.role || (action.type === "closeGate" ? "gate" : "body"),
            ...(cell ? { cell } : {}),
        });
        refresh(next);
        effects.push({ type: "invalidateNavigation" });
        return { state: next, effects, outcome: { legal: true, reason: "" } };
    }

    function candidateActions(state, field, actorCell) {
        const gate = key(field.gateCell),
            actions = [];
        for (const anchor of state.anchors)
            if (anchor.owners.includes(field.id) && !anchor.built)
                actions.push({
                    type: "placeAnchor",
                    anchorId: anchor.id,
                    fieldId: field.id,
                    role: "body",
                    cell: point(anchor),
                });
        for (const link of state.links.filter((candidate) => candidate.owners.includes(field.id))) {
            const pending = link.plannedCells.filter(
                (cell) => key(cell) !== gate && !link.builtCells.some((built) => sameCell(built, cell)),
            );
            for (const cell of pending)
                if (link.hp > 0 || link.cooldown >= REBUILD_TURNS)
                    actions.push({
                        type: link.hp > 0 ? "extendLink" : "rebuildLink",
                        linkId: link.id,
                        fieldId: field.id,
                        role: "body",
                        cell,
                    });
            if (!pending.length && !link.connected && !link.cells.some((cell) => key(cell) === gate))
                actions.push({
                    type: "extendLink",
                    linkId: link.id,
                    fieldId: field.id,
                    role: "body",
                    cell: point(link.cells[0]),
                });
        }
        return actions.sort(
            (a, b) =>
                distance(a.cell, actorCell) - distance(b.cell, actorCell) || key(a.cell).localeCompare(key(b.cell)),
        );
    }

    function workKey(action) {
        return [action.type, action.anchorId || action.linkId || "", action.cell ? key(action.cell) : ""].join(":");
    }

    function nextWorkAction(state, ownerId, actorCell, reservedKeys = [], compositeId) {
        if (!state.owners.includes(ownerId)) return undefined;
        const fields = Object.values(state.fields || {})
                .filter(
                    (field) =>
                        state.fieldOwners?.[field.id]?.includes(ownerId) &&
                        (!compositeId || field.compositeId === compositeId),
                )
                .sort((a, b) => a.layer - b.layer),
            here = point(actorCell),
            reserved = new Set(reservedKeys);
        for (const field of fields)
            if (field.reopenPending) {
                const link = state.links.find((candidate) =>
                    candidate.builtCells.some((cell) => sameCell(cell, field.gateCell)),
                );
                if (link) {
                    const action = {
                        type: "reopenGate",
                        linkId: link.id,
                        fieldId: field.id,
                        role: "gate",
                        cell: field.gateCell,
                    };
                    if (!reserved.has(workKey(action))) return action;
                }
                field.reopenPending = false;
            }
        for (const field of fields) {
            if (field.retired) continue;
            const actions = candidateActions(state, field, here).filter((action) => !reserved.has(workKey(action)));
            if (actions.length) return actions[0];
            if (!fieldBodyComplete(state, field)) return undefined;
        }
        for (const field of fields) {
            if (!state.composites?.[field.compositeId]?.closureArmed) continue;
            if (field.retired) continue;
            if (isLayerClosed(state, field.id)) continue;
            const link = state.links.find((candidate) =>
                candidate.plannedCells.some((cell) => sameCell(cell, field.gateCell)),
            );
            if (link?.builtCells.some((cell) => sameCell(cell, field.gateCell))) {
                const action = {
                    type: "connectGate",
                    linkId: link.id,
                    fieldId: field.id,
                    role: "gate",
                    cell: field.gateCell,
                };
                if (!reserved.has(workKey(action))) return action;
            }
            if (link) {
                const action = {
                    type: "closeGate",
                    linkId: link.id,
                    fieldId: field.id,
                    role: "gate",
                    cell: field.gateCell,
                };
                if (!reserved.has(workKey(action))) return action;
            }
        }
        for (const link of state.links) {
            const maintained = link.owners.some((fieldId) =>
                fields.some((field) => field.id === fieldId && !field.retired),
            );
            if (!maintained) continue;
            const ownedFieldId = link.owners.find((fieldId) => fields.some((field) => field.id === fieldId));
            if (link.hp > 0 && link.hp < link.maxHp)
                return {
                    type: "repair",
                    linkId: link.id,
                    fieldId: ownedFieldId,
                    role: "repair",
                    cell: point(link.cells[0]),
                };
            if (link.hp <= 0 && link.cooldown >= REBUILD_TURNS) {
                const cell = link.plannedCells[0] || point(link.cells[0]);
                return { type: "rebuildLink", linkId: link.id, fieldId: ownedFieldId, role: "rebuild", cell };
            }
        }
        return undefined;
    }

    function updateTarget(state, target) {
        for (const composite of Object.values(state.composites || {})) {
            const inside = isInsideCommonCore(state, composite.id, target);
            if (inside) {
                if (composite.closureArmed && composite.targetId === "player" && target?.id !== "player") continue;
                composite.targetId = target?.id;
                composite.closureArmed = true;
            } else if (composite.closureArmed && composite.targetId === target?.id) {
                composite.closureArmed = false;
                for (const fieldId of composite.layerIds) {
                    const field = state.fields[fieldId];
                    if (field.phase === "sealing" && !isLayerClosed(state, fieldId)) field.reopenPending = true;
                }
            }
        }
        refresh(state);
        return state;
    }

    function distanceToAnchor(state, cell) {
        const anchorKeys = new Set(
                state.anchors.filter((anchor) => anchor.built && anchor.hp > 0 && !anchor.collapsed).map(key),
            ),
            adjacency = new Map(),
            add = (from, to) => {
                if (!adjacency.has(from)) adjacency.set(from, new Set());
                adjacency.get(from).add(to);
            };
        for (const link of state.links.filter((candidate) => candidate.hp > 0 && !candidate.collapsed)) {
            const live = new Set(link.builtCells.map(key));
            for (const endpoint of [link.a, link.b]) {
                const anchor = state.anchors.find(
                        (candidate) => candidate.id === endpoint || key(candidate) === endpoint,
                    ),
                    anchorKey = anchor && key(anchor);
                if (anchorKey && anchorKeys.has(anchorKey)) live.add(anchorKey);
            }
            for (let index = 1; index < link.cells.length; index++) {
                const a = key(link.cells[index - 1]),
                    b = key(link.cells[index]);
                if (live.has(a) && live.has(b)) {
                    add(a, b);
                    add(b, a);
                }
            }
        }
        const start = key(cell),
            queue = [{ cell: start, distance: 0 }],
            seen = new Set([start]);
        for (let index = 0; index < queue.length; index++) {
            const current = queue[index];
            if (anchorKeys.has(current.cell)) return current.distance;
            for (const next of adjacency.get(current.cell) || [])
                if (!seen.has(next)) {
                    seen.add(next);
                    queue.push({ cell: next, distance: current.distance + 1 });
                }
        }
        return Infinity;
    }

    function damageAt(state, hit) {
        const next = clone(state),
            amount = Math.max(0, Number(hit?.damage) || 0),
            cell = hit?.cell && point(hit.cell),
            effects = [];
        if (!cell || amount <= 0 || next.collapsed) return { state: next, effects, outcome: { damage: 0 } };
        const anchor = next.anchors.find(
                (candidate) => candidate.built && candidate.hp > 0 && sameCell(candidate, cell),
            ),
            damagedLinks = new Set();
        let applied = 0;
        if (anchor) {
            applied += Math.min(anchor.hp, amount);
            anchor.hp = Math.max(0, anchor.hp - amount);
            for (const link of next.links.filter(
                (candidate) => candidate.hp > 0 && [candidate.a, candidate.b].includes(anchor.id),
            )) {
                applied += Math.min(link.hp, amount);
                link.hp = Math.max(0, link.hp - amount);
                damagedLinks.add(link.id);
            }
            if (anchor.hp <= 0)
                for (const link of next.links.filter((candidate) => [candidate.a, candidate.b].includes(anchor.id))) {
                    link.hp = 0;
                    link.cooldown = 0;
                    link.builtCells = [];
                    link.connected = false;
                }
        } else {
            for (const link of next.links.filter(
                (candidate) => candidate.hp > 0 && candidate.builtCells.some((built) => sameCell(built, cell)),
            )) {
                const multiplier = Math.max(0.25, 1 - 0.15 * distanceToAnchor(next, cell)),
                    dealt = amount * multiplier;
                applied += Math.min(link.hp, dealt);
                link.hp = Math.max(0, link.hp - dealt);
                if (link.hp <= 0) {
                    link.cooldown = 0;
                    link.builtCells = [];
                    link.connected = false;
                }
                damagedLinks.add(link.id);
            }
        }
        refresh(next);
        if (anchor || damagedLinks.size) effects.push({ type: "synchronizeProxies" }, { type: "invalidateNavigation" });
        return { state: next, effects, outcome: { damage: applied, anchorId: anchor?.id, linkIds: [...damagedLinks] } };
    }

    function consumeSnare(state, targetId, cell) {
        const next = clone(state),
            anchor = next.anchors.find((candidate) => candidate.built && candidate.hp > 0 && sameCell(candidate, cell));
        if (!anchor || anchor.snaredTargetIds.includes(targetId))
            return { state: next, effects: [], outcome: { snared: false } };
        anchor.snaredTargetIds.push(targetId);
        return {
            state: next,
            effects: [{ type: "snareTarget", targetId, anchorId: anchor.id }],
            outcome: { snared: true },
        };
    }

    function structureHasOwner(state, structure, active) {
        return structure.owners.some(
            (fieldId) =>
                !fieldRetired(state, fieldId) &&
                (state.fieldOwners[fieldId] || []).some((ownerId) => active.has(ownerId)),
        );
    }

    function tickOwnerless(state, input) {
        const next = clone(state),
            active = new Set(input?.activeOwnerIds || []),
            delta = Math.max(0, Number(input?.delta) || 0),
            structures = [...next.anchors, ...next.links];
        for (const structure of structures) {
            if (structureHasOwner(next, structure, active)) structure.ownerlessAge = 0;
            else if (delta > 0) structure.ownerlessAge = (structure.ownerlessAge || 0) + delta;
            if (structure.hp <= 0 && delta > 0) structure.cooldown = (structure.cooldown || 0) + delta;
            if (structure.ownerlessAge >= OWNERLESS_TURNS) {
                structure.collapsed = true;
                structure.hp = 0;
            }
        }
        const hasOwner = next.owners.some((ownerId) => active.has(ownerId));
        next.ownerlessAge = hasOwner ? 0 : next.ownerlessAge + delta;
        next.collapsed = structures.length > 0 && structures.every((structure) => structure.collapsed);
        refresh(next);
        const effects = next.collapsed ? [{ type: "fieldRetired" }, { type: "invalidateNavigation" }] : [];
        return { state: next, effects, outcome: { collapsed: next.collapsed, ownerlessAge: next.ownerlessAge } };
    }

    function containsDeclaredField(state, fieldId, target) {
        return !!state.fields?.[fieldId]?.interiorCells.some((cell) => sameCell(cell, target));
    }

    function isInsideCommonCore(state, compositeId, target) {
        const core = state.composites?.[compositeId]?.core;
        return !!core && Math.abs(target.x - core.x) <= 1 && Math.abs(target.y - core.y) <= 1;
    }

    function flood(state, start, map, goal) {
        const floors = new Set(map.floor || []),
            blocked = new Set(solidCells(state).map(key)),
            initial = key(start),
            queue = [point(start)],
            seen = new Set([initial]);
        if (!floors.has(initial) || blocked.has(initial)) return [];
        for (let index = 0; index < queue.length; index++) {
            const current = queue[index];
            if (goal(current)) return queue.slice(0, index + 1);
            for (const direction of directions) {
                const next = { x: current.x + direction.x, y: current.y + direction.y },
                    nextKey = key(next);
                if (floors.has(nextKey) && !blocked.has(nextKey) && !seen.has(nextKey)) {
                    seen.add(nextKey);
                    queue.push(next);
                }
            }
        }
        return [];
    }

    function pathOutsideField(state, fieldId, start, map) {
        return flood(state, start, map, (cell) => !containsDeclaredField(state, fieldId, cell));
    }

    function inspectReachability(state, compositeId, target, map) {
        const composite = state.composites[compositeId],
            declared = {},
            outsideFields = {};
        for (const fieldId of composite.layerIds) {
            declared[fieldId] = containsDeclaredField(state, fieldId, target);
            outsideFields[fieldId] = pathOutsideField(state, fieldId, target, map).length > 0;
        }
        const outer = composite.layerIds.at(-1),
            exit = point(map.exit);
        return {
            declared,
            outsideFields,
            outsideComposite: pathOutsideField(state, outer, target, map).length > 0,
            floorExit: flood(state, target, map, (cell) => sameCell(cell, exit)).length > 0,
        };
    }

    function captureGeometryReady(state, compositeId, target) {
        const composite = state.composites?.[compositeId];
        return (
            !!composite &&
            containsDeclaredField(state, composite.layerIds[0], target) &&
            composite.layerIds.every((fieldId) => isLayerClosed(state, fieldId))
        );
    }

    function restore(saved) {
        return clone(saved);
    }

    function inspect(state) {
        const snapshot = clone(state);
        snapshot.solidCells = solidCells(snapshot);
        return snapshot;
    }

    api.SpinnerTopology = {
        VERSION,
        ANCHOR_HP,
        OWNERLESS_TURNS,
        REBUILD_TURNS,
        createLine,
        addLine,
        retireField,
        setFieldOwners,
        createPhysicalGraph,
        createEnclosure,
        addEnclosure,
        extendEnclosure,
        validatePolygon,
        legalAction,
        applyAction,
        nextWorkAction,
        workKey,
        updateTarget,
        refresh,
        damageAt,
        consumeSnare,
        tickOwnerless,
        containsDeclaredField,
        isLayerClosed,
        isInsideCommonCore,
        pathOutsideField,
        inspectReachability,
        captureGeometryReady,
        restore,
        inspect,
        solidCells,
    };
})();
