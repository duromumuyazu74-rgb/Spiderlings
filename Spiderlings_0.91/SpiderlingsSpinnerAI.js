"use strict";

// Saved group planning and paid unaware construction for native Spinner lines.
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

    function routeOnSnapshot(snapshot, from, to, blocked = new Set()) {
        if (!from || !to) return [];
        const cells = new Set((snapshot?.cells || []).filter((cell) => cell.floor && !cell.locked).map(cellKey)),
            start = cellKey(from),
            goal = cellKey(to),
            queue = [start],
            parent = new Map([[start, null]]);
        if (!cells.has(start) || !cells.has(goal) || blocked.has(start) || blocked.has(goal)) return [];
        for (let index = 0; index < queue.length; index++) {
            const current = queue[index];
            if (current === goal) break;
            const [x, y] = current.split(",").map(Number);
            for (const direction of DIRECTIONS) {
                const next = `${x + direction.x},${y + direction.y}`;
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

    function pathDistance(a, b, options = {}) {
        if (typeof options.pathDistance === "function") return options.pathDistance(a, b);
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
                .filter((choice) => choice.steps <= GROUP_RADIUS)
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
                    if (!visited.has(candidate.id) && pathDistance(current, candidate, options) <= GROUP_RADIUS) {
                        visited.add(candidate.id);
                        queue.push(candidate);
                    }
            }
            if (component.length < 2) continue;
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

    function analyzeLineCandidates(snapshot, group) {
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
            members = group.members || group.memberPositions || [],
            origin = members[0] || snapshot.origins?.[0] || snapshot.entrances?.[0],
            nest =
                group.source?.type === "nest"
                    ? (snapshot.nests || []).find((candidate) => candidate.id === group.source.nestId)
                    : undefined,
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
        const candidates = [];
        for (const pair of pairs) {
            const anchors = pair.map((cell) => ({ x: cell.x, y: cell.y })),
                cells = lineCells(anchors[0], anchors[1]);
            if (anchors.length !== 2 || !cells.every(floor)) continue;
            const center = cells[Math.floor(cells.length / 2)],
                neighbors = DIRECTIONS.slice(0, 4).filter((direction) =>
                    floor({ x: center.x + direction.x, y: center.y + direction.y }),
                ).length,
                routeHits = cells.filter((cell) => routeKeys.has(cellKey(cell))).length,
                exitDistance = nearestDistance(center, snapshot.exits || []),
                chokeDistance = nearestDistance(center, snapshot.chokes || []),
                nestDistance = nest ? distance(center, nest) : 99,
                travelDistance = origin ? pathDistance(origin, center, { mapSnapshot: snapshot }) : 0,
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
                id: `line:${cellKey(anchors[0])};${cellKey(anchors[1])}`,
                type: "line",
                anchors,
                cells,
                score,
                reasons,
                travelDistance,
            });
        }
        return candidates
            .filter((candidate, index, values) => values.findIndex((other) => other.id === candidate.id) === index)
            .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
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
            groupId: group.id,
            candidateId: selected.id,
            fieldId,
            status: "traveling",
            selectedRevision: ai.candidateRevision,
            selectionOrdinal: group.selectionOrdinal,
            anchors: clone(selected.anchors),
            cells: selected.cells.map(cellKey),
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
                    protected: !!(tile?.OL || tile?.OffLimits || tile?.Jail || tile?.Protected),
                });
            }
        const nests = KDMapData.Entities.filter((entity) => entity.hp > 0 && entity.Enemy?.name === "NestEntrance").map(
            (entity) => ({ id: entity.id, x: entity.x, y: entity.y }),
        );
        const entrances = [KDMapData.StartPosition, ...Object.values(KDMapData.ShortcutPositions || {})].filter(
                Boolean,
            ),
            exits = [KDMapData.EndPosition].filter(Boolean),
            protectedKeys = new Set([...entrances, ...exits].map(cellKey));
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

    function reserveActions(encounter, snapshot) {
        const ai = ensureAI(encounter),
            entities = new Map(KDMapData.Entities.map((entity) => [entity.id, entity]));
        for (const group of Object.values(ai.groups)) {
            const previousAssignments = group.assignments || {};
            group.assignments = {};
            const plan = ai.plans[group.planId],
                field = api.SpinnerNativeField.fieldById(encounter, plan?.fieldId),
                members = group.memberIds.map((id) => entities.get(id)).filter((entity) => eligibleSpinner(entity)),
                tasks = field ? pendingTasks(field, members.length >= 2) : [],
                reservedTasks = new Set(),
                reservedWork = new Set();
            for (const member of members.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
                const previous = previousAssignments[member.id],
                    retainedTask = previous && tasks.find((task) => task.key === previous.key),
                    retainedWork = previous?.workCell,
                    canRetain =
                        retainedTask &&
                        retainedWork &&
                        !reservedTasks.has(retainedTask.key) &&
                        !reservedWork.has(cellKey(retainedWork)) &&
                        workCells(taskCell(field, retainedTask), snapshot).some(
                            (cell) => cellKey(cell) === cellKey(retainedWork),
                        ) &&
                        Number.isFinite(pathDistance(member, retainedWork, { mapSnapshot: snapshot }));
                if (canRetain) {
                    group.assignments[member.id] = {
                        ...clone(retainedTask),
                        target: clone(taskCell(field, retainedTask)),
                        workCell: clone(retainedWork),
                        fieldId: plan.fieldId,
                    };
                    reservedTasks.add(retainedTask.key);
                    reservedWork.add(cellKey(retainedWork));
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
                                        pathDistance(member, a, { mapSnapshot: snapshot }) -
                                            pathDistance(member, b, { mapSnapshot: snapshot }) ||
                                        cellKey(a).localeCompare(cellKey(b)),
                                )[0];
                        return {
                            task,
                            target,
                            work,
                            steps: work ? pathDistance(member, work, { mapSnapshot: snapshot }) : Infinity,
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
        return candidate.cells.every((key) => {
            const cell = cells.get(key);
            return cell?.floor && !cell.protected && !cell.locked;
        });
    }

    function invalidatePlan(encounter, group, reason, snapshot) {
        const ai = ensureAI(encounter),
            plan = ai.plans[group.planId];
        if (!plan) return;
        plan.status = "invalid";
        plan.invalidReason = reason;
        ai.invalidCandidateIds = Array.from(new Set([...(ai.invalidCandidateIds || []), plan.candidateId]));
        ai.candidateRevision++;
        api.SpinnerNativeField.retireField(plan.fieldId);
        group.planId = null;
        group.selectionOrdinal++;
        const members = group.memberIds
                .map((id) => KDMapData.Entities.find((entity) => entity.id === id))
                .filter((entity) => eligibleSpinner(entity)),
            candidates = analyzeLineCandidates(snapshot, { ...group, members });
        ai.candidates = candidates;
        if (members.length < 2) return;
        const replacement = selectSavedPlan(ai, group, candidates);
        if (replacement)
            api.SpinnerNativeField.addLine({
                fieldId: replacement.fieldId,
                owners: group.memberIds,
                anchors: replacement.anchors,
                scenario: "autonomous-line",
            });
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
            entities = input.entities || KDMapData.Entities;
        auditGroups(ai, entities, { ...input, mapSnapshot: snapshot });
        for (const group of Object.values(ai.groups).sort((a, b) => a.id.localeCompare(b.id))) {
            const current = ai.plans[group.planId];
            if (current && !staticCandidateLegal(current, snapshot))
                invalidatePlan(encounter, group, "terrain", snapshot);
            if (group.planId) continue;
            const members = group.memberIds
                    .map((id) => entities.find((entity) => entity.id === id))
                    .filter((entity) => eligibleSpinner(entity, input)),
                candidates = analyzeLineCandidates(snapshot, { ...group, members });
            ai.candidates = candidates;
            if (members.length < 2) continue;
            const plan = selectSavedPlan(ai, group, candidates);
            if (plan)
                api.SpinnerNativeField.addLine({
                    fieldId: plan.fieldId,
                    owners: group.memberIds,
                    anchors: plan.anchors,
                    scenario: "autonomous-line",
                });
        }
        for (const group of Object.values(ai.groups)) {
            const plan = ai.plans[group.planId];
            if (plan) api.SpinnerNativeField.setOwners(plan.fieldId, group.memberIds);
        }
        reserveActions(encounter, snapshot);
        let replacedApproach = false;
        for (const group of Object.values(ai.groups)) {
            const plan = ai.plans[group.planId],
                field = api.SpinnerNativeField.fieldById(encounter, plan?.fieldId),
                members = group.memberIds
                    .map((id) => entities.find((entity) => entity.id === id))
                    .filter((entity) => eligibleSpinner(entity, input));
            if (
                field &&
                members.length >= 2 &&
                pendingTasks(field, true).length > 0 &&
                Object.keys(group.assignments).length === 0
            ) {
                invalidatePlan(encounter, group, "approach", snapshot);
                replacedApproach = true;
            }
        }
        if (replacedApproach) reserveActions(encounter, snapshot);
        return ai;
    }

    function record(group, category) {
        group.metrics ||= { travel: 0, construction: 0, wait: 0, yield: 0, repair: 0 };
        group.metrics[category] = (group.metrics[category] || 0) + 1;
        group.lastAction = category;
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
            field = api.SpinnerNativeField.fieldById(encounter, assignment.fieldId),
            delta = enemy.SpiderlingsSpinnerRuntimeDelta || 1;
        if (!field) {
            record(group, "wait");
            return true;
        }
        const targetSnapshot = api.SpinnerNativeField.snapshot(assignment.target);
        if (!targetSnapshot.inBounds || !targetSnapshot.floor || targetSnapshot.protected) {
            invalidatePlan(encounter, group, "terrain", nativeMapSnapshot());
            record(group, "wait");
            return true;
        }
        if (
            targetSnapshot.occupied &&
            !assignment.type.startsWith("repair") &&
            !(enemy.x === assignment.target.x && enemy.y === assignment.target.y)
        ) {
            record(group, "wait");
            return true;
        }
        if (distance(enemy, assignment.workCell) > 0) {
            const path = nativePath(enemy, assignment.workCell),
                next = path.find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
            if (!next) {
                record(group, "wait");
                return true;
            }
            const moved = KinkyDungeonEnemyTryMove(
                enemy,
                { x: next.x - enemy.x, y: next.y - enemy.y },
                delta,
                next.x,
                next.y,
                true,
            );
            record(group, moved ? "travel" : "wait");
            return true;
        }
        if (!api.SpinnerNativeField.accrueConstructionAction(enemy, delta)) {
            record(group, "wait");
            return true;
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
        return true;
    }

    function handleBeforeMove(enemy, _target, aiData = {}) {
        const encounter = api.SpinnerNativeField.state(),
            state = encounter?.ai;
        if (!state || enemy?.Enemy?.name !== "Spinner") return false;
        const group = Object.values(state.groups).find((candidate) => candidate.memberIds.includes(enemy.id));
        if (!group || !eligibleSpinner(enemy)) return false;
        if (
            enemy.aware ||
            aiData.canSensePlayer ||
            aiData.canSeePlayer ||
            aiData.canSeePlayerChase ||
            aiData.canSeePlayerMedium
        )
            return false;
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
                    return snapshot.inBounds && snapshot.floor && !snapshot.protected && !snapshot.occupied;
                });
                if (destination) {
                    KinkyDungeonEnemyTryMove(
                        enemy,
                        { x: destination.x - enemy.x, y: destination.y - enemy.y },
                        enemy.SpiderlingsSpinnerRuntimeDelta || 1,
                        destination.x,
                        destination.y,
                        true,
                    );
                    record(group, "yield");
                    return true;
                }
            }
            record(group, "wait");
            return true;
        }
        return performAssignment(enemy, group, assignment);
    }

    function preparePositiveTurn(delta, input = {}) {
        if (!(delta > 0)) return undefined;
        if (!api.SpinnerNativeField.state()?.autonomous) return undefined;
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
        if (preparedMap === KDMapData && preparedTick === tick) return api.SpinnerNativeField.state()?.ai;
        preparedMap = KDMapData;
        preparedTick = tick;
        return beginTurn(input);
    }

    function restoreAfterLoad() {
        preparedMap = undefined;
        preparedTick = -1;
        const encounter = api.SpinnerNativeField.state();
        if (!encounter?.ai) return undefined;
        for (const group of Object.values(encounter.ai.groups || {})) group.assignments ||= {};
        return encounter.ai;
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
        restoreAfterLoad,
        inspect,
        routeOnSnapshot,
    };
})();
