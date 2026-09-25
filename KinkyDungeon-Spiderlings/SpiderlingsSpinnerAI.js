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
    let turnDecisions = new Map();

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
            goal = cellKey(to),
            queue = [start],
            parent = new Map([[start, null]]);
        if (!cells.has(start) || !cells.has(goal) || blocked.has(start) || blocked.has(goal)) return [];
        for (let index = 0; index < queue.length; index++) {
            const current = queue[index];
            if (current === goal) break;
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
        if (!parent.has(goal)) return [];
        const path = [];
        for (let current = goal; current; current = parent.get(current)) {
            const [x, y] = current.split(",").map(Number);
            path.push({ x, y });
        }
        return path.reverse();
    }

    function routeDistances(snapshot, work) {
        const passable = new Set((snapshot?.cells || []).filter((cell) => cell.floor && !cell.locked).map(cellKey)),
            fields = new Map(),
            neighbors = new Map();
        for (const key of passable) {
            const [x, y] = key.split(",").map(Number);
            neighbors.set(
                key,
                DIRECTIONS.map((direction) => `${x + direction.x},${y + direction.y}`).filter((next) =>
                    passable.has(next),
                ),
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

    function pathDistance(a, b, options = {}) {
        if (typeof options.pathDistance === "function") return options.pathDistance(a, b);
        if (typeof options.routeDistances === "function") return options.routeDistances(a, b);
        if (options.mapSnapshot) {
            const path = routeOnSnapshot(options.mapSnapshot, a, b);
            return path.length ? path.length - 1 : Infinity;
        }
        if (typeof KinkyDungeonFindPath === "function") {
            const path = KinkyDungeonFindPath(
                a.x,
                a.y,
                b.x,
                b.y,
                false,
                false,
                false,
                KinkyDungeonMovableTilesEnemy,
                undefined,
                undefined,
                undefined,
                a,
            );
            return Array.isArray(path) ? path.length : Infinity;
        }
        return distance(a, b);
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

    function sourceFor(members) {
        const nestIds = members.map((member) => member.SpiderlingsNestParentID).filter((id) => id !== undefined);
        if (nestIds.length === members.length && nestIds.every((id) => id === nestIds[0]))
            return { type: "nest", nestId: nestIds[0] };
        return { type: "ordinary" };
    }

    function sameSource(entity, group) {
        return group.source?.type === "nest"
            ? entity.SpiderlingsNestParentID === group.source.nestId
            : entity.SpiderlingsNestParentID === undefined;
    }

    function auditGroups(ai, entities, options = {}) {
        const byId = new Map(entities.map((entity) => [entity.id, entity])),
            assigned = new Set();
        for (const group of Object.values(ai.groups).sort((a, b) => a.id.localeCompare(b.id))) {
            group.memberIds = group.memberIds.filter((id) => baseEligibility(byId.get(id), options));
            for (const id of group.memberIds) assigned.add(id);
            for (const id of Object.keys(group.assignments || {}))
                if (!group.memberIds.includes(Number(id)) && !group.memberIds.includes(id))
                    delete group.assignments[id];
        }
        const available = entities
            .filter((entity) => eligibleSpinner(entity, options) && !assigned.has(entity.id))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
        for (const entity of [...available]) {
            const choices = Object.values(ai.groups)
                .map((group) => ({
                    group,
                    steps: Math.min(
                        ...group.memberIds
                            .map((id) => byId.get(id))
                            .filter((member) => eligibleSpinner(member, options))
                            .map((member) => pathDistance(entity, member, options)),
                    ),
                }))
                .filter((choice) => choice.steps <= GROUP_RADIUS && sameSource(entity, choice.group))
                .sort((a, b) => a.steps - b.steps || a.group.id.localeCompare(b.group.id));
            if (choices[0]) {
                choices[0].group.memberIds.push(entity.id);
                assigned.add(entity.id);
            }
        }
        const remaining = available.filter((entity) => !assigned.has(entity.id)),
            visited = new Set();
        for (const entity of remaining) {
            if (visited.has(entity.id)) continue;
            const component = [],
                queue = [entity];
            visited.add(entity.id);
            for (let index = 0; index < queue.length; index++) {
                const current = queue[index];
                component.push(current);
                for (const candidate of remaining)
                    if (
                        !visited.has(candidate.id) &&
                        candidate.SpiderlingsNestParentID === current.SpiderlingsNestParentID &&
                        pathDistance(current, candidate, options) <= GROUP_RADIUS
                    ) {
                        visited.add(candidate.id);
                        queue.push(candidate);
                    }
            }
            if (component.length < 2 && Object.hasOwn(options.mapSnapshot || {}, "candidateLines")) continue;
            const id = `spinner-group-${ai.nextGroupOrdinal++}`;
            ai.groups[id] = {
                id,
                memberIds: component.map((member) => member.id),
                source: sourceFor(component),
                selectionOrdinal: 0,
                planId: null,
                assignments: {},
                metrics: { travel: 0, construction: 0, wait: 0, yield: 0, repair: 0 },
            };
        }
        return ai;
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

    function analyzeEnclosureCandidates(snapshot, group, distances = routeDistances(snapshot), work, geometry) {
        // A supplied line catalogue is an explicit line-only scenario (used by authored fixtures).
        if (Object.hasOwn(snapshot, "candidateLines")) return [];
        const origin = (group.members || group.memberPositions || [])[0],
            byKey = geometry?.byKey || new Map((snapshot.cells || []).map((cell) => [cellKey(cell), cell])),
            occupied = new Set([
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
            candidates = [];
        if (!origin) return candidates;
        for (let y = origin.y - 6; y <= origin.y + 6; y++)
            for (let x = origin.x - 6; x <= origin.x + 6; x++) {
                const center = byKey.get(`${x},${y}`);
                if (!center) continue;
                if (work) {
                    work.candidateCells++;
                    work.candidatesExamined++;
                }
                if (distance(origin, center) > 6 || !Number.isFinite(distances(origin, center))) continue;
                const boundary = ringCells(center, 1),
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
                if (!legal) continue;
                const gate = reachableGate(
                    snapshot,
                    center,
                    1,
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
                    score = 300 + routeHits * 12 + Math.max(0, 12 - nestDistance * 2) - travelDistance * 2;
                if (!Number.isFinite(travelDistance)) continue;
                candidates.push({
                    id: `enclosure:${cellKey(center)}`,
                    type: "enclosure",
                    center: { x: center.x, y: center.y },
                    anchors: rectangle(center, 1),
                    gate,
                    cells,
                    score,
                    travelDistance,
                    reasons: { route: routeHits, nest: nestDistance },
                });
            }
        return candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    }

    function selectSavedPlan(ai, group, candidates) {
        if (group.planId && ai.plans[group.planId]) return ai.plans[group.planId];
        const invalid = new Set(ai.invalidCandidateIds || []),
            occupied = new Set(
                Object.values(ai.plans)
                    .filter((plan) => !["invalid", "abandoned"].includes(plan.status))
                    .flatMap((plan) => plan.cells || []),
            ),
            eligible = candidates.filter(
                (candidate) =>
                    !invalid.has(candidate.id) && !candidate.cells.some((cell) => occupied.has(cellKey(cell))),
            ),
            shortlist = eligible.slice(0, SHORTLIST_SIZE);
        if (!shortlist.length) return undefined;
        const random = seededRandom(`${ai.mapSeed}:${ai.mapIdentity}:${group.id}:${group.selectionOrdinal}`),
            floorScore = shortlist[shortlist.length - 1].score,
            weights = shortlist.map((candidate) => Math.max(1, candidate.score - floorScore + 2));
        let draw = random() * weights.reduce((total, weight) => total + weight, 0),
            selected = shortlist[0];
        for (let index = 0; index < shortlist.length; index++) {
            draw -= weights[index];
            if (draw <= 0) {
                selected = shortlist[index];
                break;
            }
        }
        const planId = `spinner-plan-${ai.nextPlanOrdinal++}`,
            fieldId = `spinner-field-${group.id}-${group.selectionOrdinal}`;
        ai.plans[planId] = {
            id: planId,
            kind: selected.type,
            groupId: group.id,
            candidateId: selected.id,
            fieldId,
            ...(selected.type === "enclosure"
                ? {
                      compositeId: fieldId,
                      center: clone(selected.center),
                      gate: clone(selected.gate),
                      fieldIds: [fieldId],
                  }
                : {}),
            status: "traveling",
            selectedRevision: ai.candidateRevision,
            selectionOrdinal: group.selectionOrdinal,
            anchors: clone(selected.anchors),
            cells: selected.cells.map(cellKey),
            ...(selected.type === "enclosure" ? { initialCells: selected.cells.map(cellKey) } : {}),
            invalidReason: null,
        };
        group.planId = planId;
        return ai.plans[planId];
    }

    function nativeMapSnapshot() {
        const cells = [];
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                const tile = KinkyDungeonTilesGet(`${x},${y}`),
                    mapTile = KinkyDungeonMapGet(x, y);
                cells.push({
                    x,
                    y,
                    floor: KinkyDungeonMovableTilesEnemy.includes(mapTile),
                    locked: !!tile?.Lock,
                    protected: !!(
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
            KDMapData.Entities.filter((entity) => entity.hp > 0 && entity.Enemy?.immobile).map(cellKey),
        );
        for (const cell of cells) if (fixedBlockers.has(cellKey(cell))) cell.protected = true;
        const entrances = [KDMapData.StartPosition, ...Object.values(KDMapData.ShortcutPositions || {})].filter(
                Boolean,
            ),
            exits = [KDMapData.EndPosition].filter(Boolean),
            protectedKeys = new Set([...entrances, ...exits, ...(KDMapData.JailPoints || [])].map(cellKey));
        for (const cell of cells) if (protectedKeys.has(cellKey(cell))) cell.protected = true;
        return {
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
    }

    function taskCell(field, task) {
        if (task.type === "placeAnchor" || task.type === "repairAnchor") {
            const anchor = field.anchors.find((candidate) => candidate.id === task.anchorId);
            return anchor && { x: anchor.x, y: anchor.y };
        }
        const link = field.links.find((candidate) => candidate.id === task.linkId);
        if (task.type === "repairLink") return link?.builtCells[0] || field.anchors.find((a) => a.id === link?.a);
        return link?.plannedCells[link.builtCells.length] || field.anchors.find((anchor) => anchor.id === link?.b);
    }

    function pendingTasks(field, canConstruct) {
        const tasks = [];
        for (const anchor of field.anchors)
            if (anchor.built && anchor.hp > 0 && anchor.hp < anchor.maxHp)
                tasks.push({ key: `repair-anchor:${anchor.id}`, type: "repairAnchor", anchorId: anchor.id });
        for (const link of field.links)
            if (link.hp > 0 && link.hp < link.maxHp && (link.builtCells.length || link.connected))
                tasks.push({
                    key: `repair-link:${link.id}`,
                    type: "repairLink",
                    linkId: link.id,
                    cell: clone(link.builtCells[0] || field.anchors.find((anchor) => anchor.id === link.a)),
                });
        if (!canConstruct) return tasks;
        for (const anchor of field.anchors)
            if (!anchor.built && anchor.hp > 0)
                tasks.push({ key: `anchor:${anchor.id}`, type: "placeAnchor", anchorId: anchor.id });
        for (const link of field.links) {
            const endpointsBuilt = [link.a, link.b].every(
                (id) => field.anchors.find((anchor) => anchor.id === id)?.built,
            );
            if (!link.connected && link.hp > 0 && endpointsBuilt)
                tasks.push({
                    key: `link:${link.id}:${link.builtCells.length}`,
                    type: "extendLink",
                    linkId: link.id,
                    ...(link.plannedCells[link.builtCells.length]
                        ? { cell: clone(link.plannedCells[link.builtCells.length]) }
                        : {}),
                });
        }
        return tasks;
    }

    function workCells(target, snapshot) {
        const byKey = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell]));
        return DIRECTIONS.map((direction) => ({ x: target.x + direction.x, y: target.y + direction.y }))
            .filter((cell) => {
                const value = byKey.get(cellKey(cell));
                return value?.floor && !value.protected && !value.locked;
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
        const field = assignmentField(encounter, assignment);
        if (!field || !assignment?.target || !assignment?.workCell) return false;
        const graph = encounter?.topology;
        if (
            graph?.fields?.[assignment.fieldId] &&
            !(graph.fieldOwners?.[assignment.fieldId] || graph.owners).includes(ownerId)
        )
            return false;
        if (assignment.anchorId) {
            const anchor = field.anchors.find((candidate) => candidate.id === assignment.anchorId);
            if (!anchor) return false;
            if (assignment.type === "placeAnchor") return !anchor.built && anchor.hp > 0;
            if (assignment.type === "rebuildAnchor") return anchor.built && anchor.hp <= 0;
            if (assignment.type === "repairAnchor") return anchor.built && anchor.hp > 0 && anchor.hp < anchor.maxHp;
        }
        if (assignment.linkId) {
            const link = field.links.find((candidate) => candidate.id === assignment.linkId);
            if (!link) return false;
            if (["extendLink", "rebuildLink", "closeGate"].includes(assignment.type))
                return !link.builtCells.some((cell) => cellKey(cell) === cellKey(assignment.target));
            if (assignment.type === "connectGate") return !link.connected;
            if (assignment.type === "reopenGate")
                return link.builtCells.some((cell) => cellKey(cell) === cellKey(assignment.target));
            if (["repair", "repairLink"].includes(assignment.type)) return link.hp > 0 && link.hp < link.maxHp;
        }
        return true;
    }

    function assignmentFromAction(action, workCell) {
        return {
            ...clone(action),
            key: assignmentKey(action),
            target: clone(action.cell),
            workCell: clone(workCell),
        };
    }

    function reserveActions(encounter, snapshot, distances = routeDistances(snapshot)) {
        const ai = ensureAI(encounter),
            entities = new Map(KDMapData.Entities.map((entity) => [entity.id, entity]));
        for (const group of Object.values(ai.groups)) {
            const previousAssignments = group.assignments || {};
            group.assignments = {};
            const plan = ai.plans[group.planId],
                field =
                    plan?.kind === "enclosure" ? undefined : api.SpinnerNativeField.fieldById(encounter, plan?.fieldId),
                graph = encounter.topology,
                members = group.memberIds
                    .map((id) => entities.get(id))
                    .filter(
                        (entity) => eligibleSpinner(entity) && String(entity.id) !== String(group.engagement?.lureId),
                    ),
                tasks = field ? pendingTasks(field, members.length >= 2) : [],
                reservedTasks = new Set(),
                reservedWork = new Set();
            for (const member of members.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
                const previous = previousAssignments[member.id],
                    retainedTask =
                        previous &&
                        (field
                            ? tasks.find((task) => task.key === previous.key)
                            : assignmentPending(encounter, previous, member.id)),
                    retainedWork = previous?.workCell,
                    canRetain =
                        retainedTask &&
                        retainedWork &&
                        !reservedTasks.has(assignmentKey(field ? retainedTask : previous)) &&
                        !reservedWork.has(cellKey(retainedWork)) &&
                        workCells(field ? taskCell(field, retainedTask) : previous.target, snapshot).some(
                            (cell) => cellKey(cell) === cellKey(retainedWork),
                        ) &&
                        Number.isFinite(distances(member, retainedWork));
                if (canRetain) {
                    group.assignments[member.id] = field
                        ? {
                              ...clone(retainedTask),
                              target: clone(taskCell(field, retainedTask)),
                              workCell: clone(retainedWork),
                              fieldId: plan.fieldId,
                          }
                        : clone(previous);
                    reservedTasks.add(assignmentKey(group.assignments[member.id]));
                    reservedWork.add(cellKey(retainedWork));
                    continue;
                }
                if (!field && graph?.fields && plan?.compositeId) {
                    const action = api.SpinnerTopology.nextWorkAction(graph, member.id, member, [...reservedTasks]);
                    if (!action?.cell) continue;
                    const work = workCells(action.cell, snapshot)
                        .filter((cell) => !reservedWork.has(cellKey(cell)))
                        .sort(
                            (a, b) =>
                                distances(member, a) - distances(member, b) || cellKey(a).localeCompare(cellKey(b)),
                        )[0];
                    if (!work || !Number.isFinite(distances(member, work))) continue;
                    group.assignments[member.id] = assignmentFromAction(action, work);
                    reservedTasks.add(assignmentKey(action));
                    reservedWork.add(cellKey(work));
                    continue;
                }
                const options = tasks
                    .filter((task) => !reservedTasks.has(task.key))
                    .map((task) => {
                        const target = taskCell(field, task),
                            work = workCells(target, snapshot)
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

    function mapSeed() {
        return String(KDGameData?.LastMapSeed ?? KDMapData?.MapSeed ?? "spinner-map");
    }

    function mapIdentity() {
        return String(KDMapData?.RoomType ?? KDMapData?.MapMod ?? `${KDMapData?.GridWidth}x${KDMapData?.GridHeight}`);
    }

    function staticCandidateLegal(candidate, snapshot) {
        const cells = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell]));
        return (candidate.initialCells || candidate.cells).every((key) => {
            const cell = cells.get(key);
            return cell?.floor && !cell.protected && !cell.locked;
        });
    }

    function geometrySignature(snapshot) {
        let value = 2166136261;
        for (const cell of snapshot.cells || [])
            value = Math.imul(
                value ^ (Number(!!cell.floor) | (Number(!!cell.protected) << 1) | (Number(!!cell.locked) << 2)),
                16777619,
            );
        return `${snapshot.width}x${snapshot.height}:${value >>> 0}`;
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

    function invalidatePlan(
        encounter,
        group,
        reason,
        snapshot,
        distances = routeDistances(snapshot),
        lines = lineCatalogue(snapshot),
        work,
        enclosureGeometry,
    ) {
        const ai = ensureAI(encounter),
            plan = ai.plans[group.planId];
        if (!plan) return;
        if (work) work.failedSiteReplans++;
        else if (ai.plannerWorkLast)
            ai.plannerWorkLast.failedSiteReplans = (ai.plannerWorkLast.failedSiteReplans || 0) + 1;
        plan.status = "invalid";
        plan.invalidReason = reason;
        ai.invalidCandidateIds = Array.from(new Set([...(ai.invalidCandidateIds || []), plan.candidateId]));
        ai.candidateRevision++;
        for (const fieldId of plan.fieldIds || [plan.fieldId]) api.SpinnerNativeField.retireField(fieldId);
        group.planId = null;
        group.selectionOrdinal++;
        const members = group.memberIds
                .map((id) => KDMapData.Entities.find((entity) => entity.id === id))
                .filter((entity) => eligibleSpinner(entity)),
            enclosures = analyzeEnclosureCandidates(
                snapshot,
                { ...group, members },
                distances,
                work,
                enclosureGeometry?.(),
            ),
            candidates = enclosures.length
                ? enclosures
                : analyzeLineCandidates(snapshot, { ...group, members }, distances, lines, work);
        ai.candidates = candidates;
        if (members.length < 2 && candidates[0]?.type === "line") {
            group.noPlanSignature = planningSignature(ai, members);
            return;
        }
        const replacement = selectSavedPlan(ai, group, candidates);
        if (!replacement) group.noPlanSignature = planningSignature(ai, members);
        if (replacement?.kind === "enclosure")
            api.SpinnerNativeField.addEnclosure({
                compositeId: replacement.compositeId,
                groupId: group.id,
                owners: group.memberIds,
                layers: [{ id: replacement.fieldId, vertices: replacement.anchors, gate: replacement.gate }],
                autoSeal: true,
                scenario: "autonomous-enclosure",
            });
        else if (replacement)
            api.SpinnerNativeField.addLine({
                fieldId: replacement.fieldId,
                owners: group.memberIds,
                anchors: replacement.anchors,
                scenario: "autonomous-line",
            });
    }

    function expandPlan(encounter, plan, group, snapshot, work) {
        if (plan?.kind !== "enclosure") return;
        const graph = encounter.topology,
            composite = graph?.composites?.[plan.compositeId],
            innerId = composite?.layerIds.at(-1),
            inner = graph?.fields?.[innerId];
        if (!inner || composite.layerIds.length >= 3 || !api.SpinnerTopology.isLayerClosed(graph, innerId)) return;
        const radius = composite.layerIds.length + 1,
            center = plan.center,
            boundary = ringCells(center, radius),
            byKey = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell])),
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
                    .filter((other) => other !== plan && other.status !== "invalid")
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
        const gate = reachableGate(snapshot, center, radius, work, byKey);
        if (!gate) {
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
            plan.fieldIds.push(fieldId);
            plan.cells.push(...boundary.map(cellKey));
            delete plan.expansionBlockedSignature;
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
                fieldId: graph.fieldId,
                compositeId: composite.id,
                status: "preparing",
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
        const ai = ensureAI(encounter, {
                mapSeed: input.mapSeed ?? mapSeed(),
                mapIdentity: input.mapIdentity ?? mapIdentity(),
            }),
            snapshot = input.mapSnapshot || nativeMapSnapshot(),
            work = {
                mapScans: input.mapSnapshot ? 0 : 1,
                distanceFieldBuilds: 0,
                lineCatalogueBuilds: 0,
                candidatesExamined: 0,
                candidateCells: 0,
                expansionCells: 0,
                routeChecks: 0,
                failedSiteReplans: 0,
            },
            distances = routeDistances(snapshot, work),
            entities = input.entities || KDMapData.Entities;
        let lines, enclosureGeometry;
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
                    const byKey = new Map((snapshot.cells || []).map((cell) => [cellKey(cell), cell])),
                        passable = new Set(
                            (snapshot.cells || []).filter((cell) => cell.floor && !cell.locked).map(cellKey),
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
                    enclosureGeometry = {
                        byKey,
                        passable,
                        neighbors,
                        routeKeys: new Set(
                            routeOnSnapshot(snapshot, snapshot.entrances?.[0], snapshot.exits?.[0]).map(cellKey),
                        ),
                        gateCache: new Map(),
                    };
                }
                return enclosureGeometry;
            };
        if (ai.geometrySignature && ai.geometrySignature !== signature) {
            ai.invalidCandidateIds = [];
            ai.candidateRevision++;
        }
        ai.geometrySignature = signature;
        auditGroups(ai, entities, { ...input, mapSnapshot: snapshot, routeDistances: distances });
        if (input.adoptExisting) adoptExistingTopology(encounter, ai);
        for (const group of Object.values(ai.groups).sort((a, b) => a.id.localeCompare(b.id))) {
            const current = ai.plans[group.planId];
            if (current && !staticCandidateLegal(current, snapshot))
                invalidatePlan(
                    encounter,
                    group,
                    "terrain",
                    snapshot,
                    distances,
                    currentLines(),
                    work,
                    currentEnclosureGeometry,
                );
            if (group.planId) continue;
            const members = group.memberIds
                .map((id) => entities.find((entity) => entity.id === id))
                .filter((entity) => eligibleSpinner(entity, input));
            const noPlanSignature = planningSignature(ai, members);
            if (group.noPlanSignature === noPlanSignature) continue;
            const enclosures = analyzeEnclosureCandidates(
                    snapshot,
                    { ...group, members },
                    distances,
                    work,
                    currentEnclosureGeometry(),
                ),
                candidates = enclosures.length
                    ? enclosures
                    : analyzeLineCandidates(snapshot, { ...group, members }, distances, currentLines(), work);
            ai.candidates = candidates;
            if (members.length < 2 && candidates[0]?.type === "line") {
                group.noPlanSignature = noPlanSignature;
                continue;
            }
            const plan = selectSavedPlan(ai, group, candidates);
            if (plan) delete group.noPlanSignature;
            else group.noPlanSignature = noPlanSignature;
            if (plan?.kind === "enclosure")
                api.SpinnerNativeField.addEnclosure({
                    compositeId: plan.compositeId,
                    groupId: group.id,
                    owners: group.memberIds,
                    layers: [{ id: plan.fieldId, vertices: plan.anchors, gate: plan.gate }],
                    autoSeal: true,
                    scenario: "autonomous-enclosure",
                });
            else if (plan)
                api.SpinnerNativeField.addLine({
                    fieldId: plan.fieldId,
                    owners: group.memberIds,
                    anchors: plan.anchors,
                    scenario: "autonomous-line",
                });
        }
        for (const group of Object.values(ai.groups)) {
            const plan = ai.plans[group.planId];
            if (plan?.kind === "enclosure") expandPlan(encounter, plan, group, snapshot, work);
            if (plan)
                for (const fieldId of plan.fieldIds || [plan.fieldId])
                    api.SpinnerNativeField.setOwners(fieldId, group.memberIds);
            auditEngagement(encounter, group);
        }
        reserveActions(encounter, snapshot, distances);
        let replacedApproach = false;
        for (const group of Object.values(ai.groups)) {
            const plan = ai.plans[group.planId],
                field =
                    plan?.kind === "enclosure" ? undefined : api.SpinnerNativeField.fieldById(encounter, plan?.fieldId),
                members = group.memberIds
                    .map((id) => entities.find((entity) => entity.id === id))
                    .filter((entity) => eligibleSpinner(entity, input));
            if (
                field &&
                members.length >= 1 &&
                pendingTasks(field, true).length > 0 &&
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

    function decisionKey(enemy) {
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
        return `${tick}:${enemy.id}`;
    }

    function decide(enemy, group, category, handled, extra = {}) {
        turnDecisions.set(decisionKey(enemy), { category, groupId: group.id, ...extra });
        return handled;
    }

    function gateNativePhase(enemy) {
        const decision = turnDecisions.get(decisionKey(enemy));
        return !decision || ["native-defense", "delegate-native"].includes(decision.category);
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
                const gate = encounter.topology.fields?.[fieldId]?.gateCell;
                if (gate) result.push(gate);
            }
        for (const assignment of Object.values(group.assignments || {}))
            if (assignmentPending(encounter, assignment)) result.push(assignment.target, assignment.workCell);
        return result.filter(Boolean);
    }

    function selectLure(encounter, group, preferredIds = []) {
        const waypoint = planWaypoint(encounter, group),
            required = new Set(requiredCells(encounter, group).map(cellKey)),
            preferred = new Set(preferredIds.map(String));
        let candidates = group.memberIds
            .map((id) => KDMapData.Entities.find((entity) => String(entity.id) === String(id)))
            .filter((entity) => eligibleSpinner(entity));
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

    function auditEngagement(encounter, group) {
        const engagement = group.engagement;
        if (!engagement) return;
        const target = resolveTarget(engagement.target);
        if (!targetIsLiving(target) || !targetIsHostile(group, target)) {
            clearEngagement(group);
            return;
        }
        if (engagement.lastKnown?.age >= 4 || engagement.lastKnown?.source !== "native") delete engagement.lastKnown;
        const lure = KDMapData.Entities.find((entity) => String(entity.id) === String(engagement.lureId));
        if (!eligibleSpinner(lure) || !group.memberIds.some((id) => String(id) === String(lure?.id))) {
            const replacement = selectLure(encounter, group);
            if (replacement) engagement.lureId = replacement.id;
            else delete engagement.lureId;
        }
        if (engagement.lureId !== undefined) delete group.assignments?.[engagement.lureId];
    }

    function observeTarget(encounter, group, enemy, target, aiData) {
        const sensed = enemy.aware && aiData.canSensePlayer && aiData.hostile === true && targetIsLiving(target);
        if (!sensed) return false;
        if (!group.engagement) {
            const reference = targetReference(target);
            if (!reference) return false;
            group.engagement = {
                target: reference,
                lureId: enemy.id,
                mode: "lure",
                noSightTurns: 0,
                lureNoContactTurns: 0,
                compositeId: encounter.ai?.plans?.[group.planId]?.compositeId || null,
            };
            const selected = selectLure(encounter, group, [enemy.id]);
            if (selected) group.engagement.lureId = selected.id;
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
        observations.sensed.add(String(enemy.id));
        if (actualSight) observations.sight.add(String(enemy.id));
        observedGroups.set(group.id, observations);
        if (firstObservation)
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
            engagement.mode = "lure";
            if (String(engagement.lureId) === String(enemy.id)) engagement.lureNoContactTurns = 0;
        }
        const lure = KDMapData.Entities.find((entity) => String(entity.id) === String(engagement.lureId));
        if (
            !eligibleSpinner(lure) ||
            (engagement.lureNoContactTurns >= 8 && String(engagement.lureId) !== String(enemy.id) && actualSight)
        ) {
            const replacement = selectLure(encounter, group, [enemy.id]);
            if (replacement) engagement.lureId = replacement.id;
        }
        delete group.assignments?.[engagement.lureId];
        return true;
    }

    function nativePath(enemy, target) {
        if (typeof KinkyDungeonFindPath !== "function") return [];
        return (
            KinkyDungeonFindPath(
                enemy.x,
                enemy.y,
                target.x,
                target.y,
                false,
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
            record(group, "wait");
            return "wait";
        }
        const targetSnapshot = api.SpinnerNativeField.snapshot(assignment.target);
        if (!targetSnapshot.inBounds || !targetSnapshot.floor || targetSnapshot.protected) {
            invalidatePlan(encounter, group, "terrain", nativeMapSnapshot());
            record(group, "wait");
            return "wait";
        }
        if (
            targetSnapshot.occupied &&
            !assignment.type.startsWith("repair") &&
            !(enemy.x === assignment.target.x && enemy.y === assignment.target.y)
        ) {
            record(group, "wait");
            return "wait";
        }
        if (distance(enemy, assignment.workCell) > 0) {
            const path = nativePath(enemy, assignment.workCell),
                next = path.find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
            if (!next || api.SpinnerNativeField.snapshot(next).actorOccupied) {
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
            return "builder-move";
        }
        if (!api.SpinnerNativeField.accrueConstructionAction(enemy, delta)) {
            record(group, "wait");
            return "wait";
        }
        const outcome = api.SpinnerNativeField.applyPaidAction(enemy, {
            ...assignment,
            ownerId: enemy.id,
            fieldId: assignment.fieldId,
        });
        if (outcome.applied) {
            record(group, assignment.type.startsWith("repair") ? "repair" : "construction");
            delete group.assignments[enemy.id];
        } else record(group, outcome.reason === "occupied" ? "wait" : "wait");
        return "field-work";
    }

    function cellVisibleFrom(enemy, cell, target) {
        if (!target || typeof KinkyDungeonCheckLOS !== "function") return true;
        const observer = { ...enemy, x: cell.x, y: cell.y };
        return KinkyDungeonCheckLOS(
            observer,
            target,
            Math.hypot(cell.x - target.x, cell.y - target.y),
            99,
            false,
            true,
        );
    }

    function moveLure(enemy, group, target, actualSight) {
        const encounter = api.SpinnerNativeField.state(),
            engagement = group.engagement,
            waypoint = planWaypoint(encounter, group),
            known = engagement.lastKnown,
            required = new Set(requiredCells(encounter, group).map(cellKey)),
            mustYield = required.has(cellKey(enemy)),
            candidates = DIRECTIONS.map((direction) => ({ x: enemy.x + direction.x, y: enemy.y + direction.y }))
                .filter((cell) => {
                    const snapshot = api.SpinnerNativeField.snapshot(cell);
                    return snapshot.inBounds && snapshot.floor && !snapshot.protected && !snapshot.actorOccupied;
                })
                .map((cell) => ({
                    cell,
                    required: required.has(cellKey(cell)),
                    melee: known ? distance(cell, known) <= 1 : false,
                    visible: !actualSight || cellVisibleFrom(enemy, cell, target),
                    route: waypoint ? distance(cell, waypoint) : 0,
                }))
                .sort(
                    (a, b) =>
                        Number(a.required) - Number(b.required) ||
                        Number(a.melee) - Number(b.melee) ||
                        Number(b.visible) - Number(a.visible) ||
                        a.route - b.route ||
                        cellKey(a.cell).localeCompare(cellKey(b.cell)),
                );
        const chosen = candidates[0];
        if (!chosen) {
            record(group, "wait");
            return "wait";
        }
        const moved = KinkyDungeonEnemyTryMove(
            enemy,
            { x: chosen.cell.x - enemy.x, y: chosen.cell.y - enemy.y },
            enemy.SpiderlingsSpinnerRuntimeDelta || 1,
            chosen.cell.x,
            chosen.cell.y,
            false,
        );
        record(group, mustYield ? "yield" : moved ? "travel" : "wait");
        return mustYield ? "yield" : "lure-move";
    }

    function handleBeforeMove(enemy, target, aiData = {}) {
        const encounter = api.SpinnerNativeField.state(),
            state = encounter?.ai;
        if (!state || enemy?.Enemy?.name !== "Spinner") return false;
        const group = Object.values(state.groups).find((candidate) => candidate.memberIds.includes(enemy.id));
        if (!group || !eligibleSpinner(enemy)) return false;
        if (group.source?.type === "nest") clearEngagement(group);
        else auditEngagement(encounter, group);
        if (api.Infestation?.isNestAttacker?.(enemy, target)) return decide(enemy, group, "delegate-native", false);
        const observed = group.source?.type === "nest" ? false : observeTarget(encounter, group, enemy, target, aiData),
            perceivedThreat = enemy.aware && aiData.canSensePlayer && aiData.hostile === true && targetIsLiving(target),
            actualSight = !!(
                aiData.canSeePlayer ||
                aiData.canSeePlayerChase ||
                aiData.canSeePlayerMedium ||
                aiData.canShootPlayer
            );
        if (group.engagement && String(group.engagement.lureId) === String(enemy.id)) {
            if (group.engagement.mode === "pursuit") return decide(enemy, group, "delegate-native", false);
            return decide(
                enemy,
                group,
                moveLure(enemy, group, observed ? target : undefined, observed && actualSight),
                true,
            );
        }
        if (perceivedThreat && distance(enemy, target) <= 1)
            return decide(enemy, group, "native-defense", true, { target: targetReference(target) });
        if (!group.engagement && perceivedThreat && group.source?.type !== "nest")
            return decide(enemy, group, "delegate-native", false);
        const assignment = group.assignments?.[enemy.id];
        if (!assignment) {
            const blocking = Object.entries(group.assignments || {}).some(
                ([memberId, other]) =>
                    String(memberId) !== String(enemy.id) &&
                    [other.target, other.workCell].some((cell) => cell?.x === enemy.x && cell?.y === enemy.y),
            );
            if (blocking) {
                const destination = DIRECTIONS.map((direction) => ({
                    x: enemy.x + direction.x,
                    y: enemy.y + direction.y,
                })).find((cell) => {
                    const snapshot = api.SpinnerNativeField.snapshot(cell);
                    return snapshot.inBounds && snapshot.floor && !snapshot.protected && !snapshot.actorOccupied;
                });
                if (destination) {
                    KinkyDungeonEnemyTryMove(
                        enemy,
                        { x: destination.x - enemy.x, y: destination.y - enemy.y },
                        enemy.SpiderlingsSpinnerRuntimeDelta || 1,
                        destination.x,
                        destination.y,
                        false,
                    );
                    record(group, "yield");
                    return decide(enemy, group, "yield", true);
                }
            }
            return decide(enemy, group, "delegate-native", false);
        }
        return decide(enemy, group, performAssignment(enemy, group, assignment), true);
    }

    function preparePositiveTurn(delta, input = {}) {
        if (!(delta > 0)) return undefined;
        if (!api.SpinnerNativeField.state()?.autonomous) return undefined;
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
        if (preparedMap === KDMapData && preparedTick === tick) return api.SpinnerNativeField.state()?.ai;
        preparedMap = KDMapData;
        preparedTick = tick;
        observedGroups = new Map();
        turnDecisions = new Map();
        return beginTurn(input);
    }

    function completePositiveTurn(delta) {
        if (!(delta > 0)) return;
        const encounter = api.SpinnerNativeField.state();
        if (!encounter?.ai) return;
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
            else if (!sawTarget) engagement.mode = "search";
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
                String(group.engagement?.lureId) === String(memberId) ||
                !assignmentPending(encounter, assignment) ||
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
        turnDecisions = new Map();
        observedGroups = new Map();
        return ai;
    }

    function restoreAfterLoad() {
        preparedMap = undefined;
        preparedTick = -1;
        const encounter = api.SpinnerNativeField.state();
        if (!encounter?.ai) return undefined;
        for (const group of Object.values(encounter.ai.groups || {})) group.assignments ||= {};
        return auditSavedState(encounter);
    }

    function inspect() {
        const state = api.SpinnerNativeField.state()?.ai;
        return state ? clone(state) : undefined;
    }

    api.SpinnerAI = {
        GROUP_RADIUS,
        SHORTLIST_SIZE,
        seededRandom,
        eligibleSpinner,
        ensureAI,
        auditGroups,
        analyzeLineCandidates,
        selectSavedPlan,
        reserveActions,
        beginTurn,
        preparePositiveTurn,
        handleBeforeMove,
        gateNativePhase,
        completePositiveTurn,
        restoreAfterLoad,
        auditSavedState,
        inspect,
        routeOnSnapshot,
    };
})();
