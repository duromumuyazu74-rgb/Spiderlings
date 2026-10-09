"use strict";

// Continuous demand, investment and real workforce are assessed together, not by independent site callers.
(() => {
    const api = globalThis.Spiderlings;
    const MAX_PROJECTS = 3;
    function limit() {
        const value = String(api.getSetting?.("spiderlingsCaptureFieldLimit") ?? MAX_PROJECTS).trim();
        const number = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(number) ? number : MAX_PROJECTS;
    }
    function permits() {
        return Math.floor(api.FieldCommand.spinnerCount() / 4);
    }
    function capacity() {
        return Math.min(limit(), permits());
    }
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const cellKey = (cell) => (typeof cell === "string" ? cell : `${cell.x},${cell.y}`);
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const frames = new WeakMap();
    const SEARCH_INTERVAL = 4,
        STALL_TURNS = 8,
        REPLACEMENT_TURNS = 8;
    const now = (encounter) => encounter.ai.worldTime ?? encounter.ai.coordinationTurn ?? 0;

    const workWorlds = new WeakMap();
    const cellsBySnapshot = new WeakMap();
    const DIRECTIONS = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: -1, y: -1 },
    ];
    let workSnapshot;
    const eligibleSpinner = (entity) => api.SpinnerAI.eligibleSpinner(entity);
    const sourceBusy = (entity) =>
        !!(api.FieldCommand.sourceRole(entity) || entity?.SpiderlingsTaskNestDefenderTarget !== undefined);
    const groupObservation = (group) => api.SpinnerAI.groupObservation(group);
    const routeOnSnapshot = (...args) => api.SpinnerAI.routeOnSnapshot(...args);
    const workWorld = () => workWorlds.get(api.SpinnerNativeField.state());
    const nativeMapSnapshot = () => workWorld().nativeMapSnapshot();
    const routeDistances = (snapshot) => workWorld().routeDistances(snapshot);
    const nativePath = (...args) => workWorld().nativePath(...args);
    const occupancyRoute = (...args) => workWorld().occupancyRoute(...args);
    const geometrySignature = (snapshot) => workWorld().geometrySignature(snapshot);
    const reachableGate = (...args) => workWorld().reachableGate(...args);
    const nearestDistance = (point, cells) => Math.min(...cells.map((cell) => distance(point, cell)));
    const snapshotCellsByKey = (snapshot) => {
        const cached = cellsBySnapshot.get(snapshot);
        if (cached?.cells === snapshot.cells) return cached.byKey;
        const byKey = new Map(snapshot.cells.map((cell) => [cellKey(cell), cell]));
        cellsBySnapshot.set(snapshot, { cells: snapshot.cells, byKey });
        return byKey;
    };
    const rectangle = (center, radius) => [
        { x: center.x - radius, y: center.y - radius },
        { x: center.x + radius, y: center.y - radius },
        { x: center.x + radius, y: center.y + radius },
        { x: center.x - radius, y: center.y + radius },
    ];
    const ringCells = (center, radius) => {
        const cells = [];
        for (let dy = -radius; dy <= radius; dy++)
            for (let dx = -radius; dx <= radius; dx++)
                if (Math.abs(dx) === radius || Math.abs(dy) === radius)
                    cells.push({ x: center.x + dx, y: center.y + dy });
        return cells;
    };
    function record(group, category) {
        group.metrics ||= { travel: 0, construction: 0, wait: 0, yield: 0, repair: 0 };
        group.metrics[category] = (group.metrics[category] || 0) + 1;
        group.lastAction = category;
    }
    function invalidatePlan(encounter, group, reason) {
        return invalidate(encounter, group, reason);
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

    function workFor(enemy) {
        const encounter = api.SpinnerNativeField.state();
        const member = encounter?.command?.members[enemy?.id];
        const assignment = encounter?.ai?.groups[member?.commander]?.assignments?.[enemy?.id];
        return assignment ? clone(assignment) : undefined;
    }

    function beginWork(enemy) {
        const encounter = api.SpinnerNativeField.state();
        const member = encounter?.command?.members[enemy.id];
        const group = encounter?.ai?.groups[member?.commander];
        const offer = group?.maintenanceOffer;
        if (
            offer?.memberId === enemy.id &&
            !(enemy.SpiderlingsTaskNestDefenderTarget !== undefined) &&
            !api.SpinnerRecovery?.sourceIds?.().includes(enemy.id) &&
            !api.SpinnerNPCCapture?.usesSource?.(enemy.id) &&
            !api.SpinnerNPCRecovery?.usesEntity?.(enemy.id) &&
            api.SpinnerCapture?.state?.()?.admittedCompositeId ===
                api.SpinnerNativeField.state()?.ai?.plans[group.planId]?.compositeId &&
            api.SpinnerTopology.inspectWorkAction(api.SpinnerNativeField.state()?.topology, {
                ...offer.assignment,
                ownerId: enemy.id,
            }).pending &&
            api.SpinnerCapture?.releaseMaintenanceSource?.(enemy)
        ) {
            group.assignments[enemy.id] = offer.assignment;
            group.maintenance = { memberId: enemy.id, fieldId: offer.assignment.fieldId };
            delete group.maintenanceOffer;
        }

        return workFor(enemy);
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
        const ai = encounter.ai,
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

    function expandPlan(encounter, plan, group, snapshot, work) {
        if (plan?.kind !== "enclosure") return;
        const graph = encounter.topology,
            composite = graph?.composites?.[plan.compositeId],
            innerId = composite?.layerIds.at(-1),
            inner = graph?.fields?.[innerId];
        if (!composite || !plan.center || !plan.gate) return;
        api.SpinnerNativeField.prepareEnclosureProject(plan.compositeId, group.id);
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
        if (!graph?.composites) return;
        for (const composite of Object.values(graph.composites || {})) {
            const fields = composite.layerIds.map((id) => graph.fields[id]);
            if (
                !fields.length ||
                fields.some(
                    (field) =>
                        !field || field.kind !== "enclosure" || field.retired || field.nativeTerrainValid === false,
                )
            )
                continue;
            if (
                Object.values(ai.plans).some(
                    (plan) =>
                        plan.compositeId === composite.id &&
                        !["invalid", "abandoned", "retired"].includes(plan.status) &&
                        !ai.groups[plan.groupId]?.cancelled,
                )
            )
                continue;
            const owners = api.SpinnerNativeField.fieldOwners(composite.id);
            const group =
                Object.values(ai.groups).find(
                    (entry) => !entry.planId && entry.memberIds.some((id) => owners.includes(id)),
                ) ||
                api.FieldCommand.newGroup(
                    ai,
                    KDMapData.Entities.filter((actor) => owners.includes(actor.id)),
                );
            const id = "spinner-plan-" + ai.nextPlanOrdinal++;
            ai.plans[id] = {
                id,
                kind: "enclosure",
                groupId: group.id,
                fieldId: composite.layerIds[0],
                fieldIds: [...composite.layerIds],
                compositeId: composite.id,
                status: "preparing",
                center: clone(composite.core),
                anchors: graph.anchors
                    .filter((anchor) => anchor.owners.some((owner) => composite.layerIds.includes(owner)))
                    .map((anchor) => ({ x: anchor.x, y: anchor.y })),
                cells: fields.flatMap((field) => field.boundaryCells.map(cellKey)),
                invalidReason: null,
            };
            group.planId = id;
            api.SpinnerNativeField.prepareEnclosureProject(composite.id, group.id);
        }
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

    function prepareWork(encounter, { snapshot, distances, entities = KDMapData.Entities, work, world }) {
        const ai = encounter.ai;
        workWorlds.set(encounter, world);
        workSnapshot = { map: KDMapData, snapshot };
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
                    !world.baseEligibility(entities.find((entity) => entity.id === group.maintenance.memberId)))
            )
                delete group.maintenance;
            world.auditEngagement(encounter, group);
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
                    .filter((entity) => world.eligible(entity));
            if (
                field &&
                members.length >= 1 &&
                api.SpinnerTopology.lineWorkActions(field, true).length > 0 &&
                Object.keys(group.assignments).length === 0 &&
                !group.engagement
            ) {
                work.failedSiteReplans++;
                invalidate(encounter, group, "approach");
                replacedApproach = true;
            }
        }
        if (replacedApproach) reserveActions(encounter, snapshot, distances);
    }

    function workObstruction(encounter, group, predicate) {
        const plan = encounter?.ai?.plans[group?.planId];
        if (!plan?.compositeId || group.cancelled || ["invalid", "abandoned", "retired"].includes(plan.status))
            return undefined;
        const worker = group.memberIds
            .map((id) => KDMapData.Entities.find((entity) => String(entity.id) === String(id)))
            .find((entity) => eligibleSpinner(entity) && !api.FieldCommand.protectedMember(entity));
        if (!worker) return undefined;
        const skipped = new Set();
        let action = nextGroupWork(encounter, group, worker, []);
        const fieldId = action?.fieldId;
        while (action?.cell && action.fieldId === fieldId) {
            const key = assignmentKey(action);
            if (skipped.has(key)) break;
            skipped.add(key);
            const occupant = KDMapData.Entities.findLast(
                (entity) =>
                    entity.hp > 0 &&
                    cellKey(entity) === cellKey(action.cell) &&
                    !api.SpinnerNativeField.isOwnedProxy(entity),
            );
            if (
                occupant &&
                !api.SpinnerTopology.inspectWorkAction(encounter.topology, action).allowsOccupiedTarget &&
                predicate(occupant, worker)
            )
                return { occupant, group, worker };
            action = nextGroupWork(encounter, group, worker, [...skipped]);
        }
        return undefined;
    }

    function assessWork(encounter, group, members, snapshot, distances) {
        const plan = encounter.ai.plans[group.planId];
        const canWork = (member) => {
            if ([member.stun, member.freeze, member.channel, member.teleporting].some((value) => value > 0))
                return false;
            const plan = encounter.ai.plans[group.planId];
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
        const capableIds = plan ? members.filter(canWork).map((member) => member.id) : [],
            obstruction = capableIds.length ? undefined : workObstruction(encounter, group, () => true);

        return { capableIds, obstruction };
    }
    function prepareApproach(encounter, group, snapshot, distances) {
        adjustPassageApproach(encounter, group, snapshot, distances);
        adjustEnclosureApproach(encounter, group, snapshot, distances);
    }
    function reconcileCrew(encounter) {
        for (const group of Object.values(encounter.ai.groups)) {
            group.assignments ||= {};
            for (const id of Object.keys(group.assignments))
                if (!group.memberIds.some((memberId) => String(memberId) === id)) delete group.assignments[id];
            if (group.maintenance && !group.memberIds.includes(group.maintenance.memberId)) delete group.maintenance;
        }
    }
    function enrollCrew(group) {
        group.selectionOrdinal ??= 0;
        group.planId ??= null;
        group.assignments ||= {};
        return group;
    }
    function reconcilePressure(encounter, group) {
        const engagement = group.engagement;
        if (
            engagement?.lureId !== undefined &&
            !hasGateWork(encounter, group) &&
            !hasMaintenanceAssignment(
                KDMapData.Entities.find((entity) => String(entity.id) === String(engagement.lureId)),
            )
        )
            delete group.assignments?.[engagement.lureId];
    }
    function restoreProjects(encounter, world) {
        workWorlds.set(encounter, world);
        for (const group of Object.values(encounter.ai.groups)) {
            enrollCrew(group);
            if (!encounter.ai.plans[group.planId]) group.planId = null;
            world.auditEngagement(encounter, group);
            auditAssignments(encounter, group);
        }
    }

    function workersForCandidate(candidate, members, snapshot, distances) {
        const targets =
            candidate.type === "enclosure"
                ? candidate.layers.at(-1).vertices
                : (candidate.gates || []).flatMap((gate) => gate.cells);
        return members.filter((member) =>
            targets.some((cell) => {
                const tile = api.SpinnerNativeField.snapshot(cell);
                return (
                    tile.inBounds &&
                    tile.floor &&
                    !tile.protected &&
                    (!tile.actorOccupied || cellKey(member) === cellKey(cell)) &&
                    occupancyRoute(
                        member,
                        workCells(cell, snapshot, member).filter((workCell) =>
                            Number.isFinite(distances(member, workCell)),
                        ),
                    ).length > 0
                );
            }),
        );
    }
    function progress(encounter, plan) {
        const work = api.SpinnerTopology.workProgress(encounter.topology, plan.fieldIds || [plan.fieldId]);
        const clock = now(encounter);
        plan.lifecycle ||= {
            version: 1,
            observedTurn: clock,
            lastPaidTurn: clock,
            lastAdvanceTurn: clock,
            lastRecoveryTurn: clock,
            completed: [],
        };
        const life = plan.lifecycle,
            valid = new Set(work.planned);
        life.completed = [...new Set([...life.completed, ...work.completed])].filter((key) => valid.has(key));
        life.completion = work.planned.length ? life.completed.length / work.planned.length : 0;
        return life;
    }

    function recordOutcome(duty, enemy) {
        if (duty.role !== "work") return;
        const encounter = api.SpinnerNativeField.state(),
            plan = encounter?.ai?.plans[duty.planId];
        if (!plan) return;
        const group = encounter.ai.groups[duty.groupId],
            life = progress(encounter, plan);
        const entries = encounter.topology.actionLog.slice(duty.workStart);
        if (entries.some((entry) => (plan.fieldIds || [plan.fieldId]).includes(entry.fieldId))) {
            life.lastPaidTurn = now(encounter);
            life.lastAdvanceTurn = now(encounter);
            delete life.blockReason;
        } else if (
            duty.assignment?.workCell &&
            distance(enemy, duty.assignment.workCell) < distance(duty.origin, duty.assignment.workCell)
        ) {
            life.lastAdvanceTurn = now(encounter);
            delete life.blockReason;
        } else life.blockReason = group?.lastBlockReason || "no-paid-progress";
        life.lastResult = {
            memberId: enemy.id,
            actionId: duty.actionId,
            result: duty.result,
            reason: life.blockReason,
            turn: now(encounter),
        };
    }

    function covers(plan, target, planner) {
        const point = plan.center || plan.anchors?.[0];
        return (
            !!point &&
            (distance(point, target) <= Math.max(6, (plan.radius || 0) + 2) || planner.intercepts(plan, target)) &&
            Number.isFinite(planner.distances(point, target))
        );
    }

    function smallProject(encounter, plan) {
        if (plan.kind === "line") return false;
        if (plan.kind === "passage") return plan.interiorCells.length < 25;
        const fields = (plan.fieldIds || [plan.fieldId]).map((id) => encounter.topology.fields[id]).filter(Boolean);
        return (
            fields.length > 0 &&
            fields.every(
                (field) => Math.max(field.bounds.right - field.bounds.left, field.bounds.bottom - field.bounds.top) < 6,
            )
        );
    }

    function replaceProject(encounter, group, planner, adapter) {
        const ai = encounter.ai,
            old = ai.plans[group.planId],
            focus = group.planningFocus;
        if (!old) return false;
        if (api.FieldCustody?.ownsField(old.compositeId)) return false;
        if (!focus || capacity() === 0 || !smallProject(encounter, old) || adapter.lineFixture) {
            if (old.lifecycle) delete old.lifecycle.replacement;
            return false;
        }
        if (
            Object.values(ai.groups).filter(
                (entry) =>
                    entry.planId &&
                    !entry.cancelled &&
                    !["invalid", "abandoned", "retired"].includes(ai.plans[entry.planId]?.status),
            ).length > capacity()
        )
            return false;
        const life = progress(encounter, old),
            clock = now(encounter);
        if (planner.members(group).some((member) => api.FieldCommand.protectedMember(member))) {
            delete life.replacement;
            return false;
        }
        const facts = adapter.facts(group),
            offered = facts.members.filter(
                (member) =>
                    !api.FieldCommand.protectedMember(member) &&
                    ![member.stun, member.freeze, member.channel, member.teleporting].some((value) => value > 0),
            );
        if (!offered.length) {
            delete life.replacement;
            return false;
        }
        // Cheap live validation runs between expensive site scans too.
        const observation = life.replacement;
        if (observation) {
            const candidate = observation.candidate;
            const workers = candidate ? adapter.workersFor(candidate, offered) : [];
            if (
                !candidate ||
                observation.signature !== replacementSignature(candidate, focus, adapter) ||
                !workers.length ||
                !betterReplacement(encounter, old, focus, candidate, workers, planner)
            )
                delete life.replacement;
        }
        if (life.lastSearchTurn !== undefined && clock - life.lastSearchTurn < SEARCH_INTERVAL) return false;
        life.lastSearchTurn = clock;
        const candidate = adapter.candidates(group, offered, true)[0];
        const available = candidate ? adapter.workersFor(candidate, offered) : [];
        if (!available.length) {
            delete life.replacement;
            return false;
        }
        if (!candidate || !covers({ ...candidate, kind: candidate.type }, focus, planner)) {
            delete life.replacement;
            return false;
        }
        if (!betterReplacement(encounter, old, focus, candidate, available, planner)) {
            delete life.replacement;
            return false;
        }
        const signature = replacementSignature(candidate, focus, adapter);
        if (life.replacement?.signature !== signature) life.replacement = { signature, since: clock };
        life.replacement.candidateId = candidate.id;
        life.replacement.candidate = clone(candidate);
        const stable = life.completion >= 0.5 ? REPLACEMENT_TURNS * 2 : REPLACEMENT_TURNS;
        if (clock - life.replacement.since < stable) return false;
        // No world action can interleave with this synchronous, revalidated submission.
        const savedGroup = clone(group),
            oldStatus = old.status;
        old.status = "retired";
        group.planId = null;
        group.selectionOrdinal++;
        group.assignments = {};
        const replacement = selectSavedPlan(ai, group, [candidate]);
        const result = activatePlan(replacement, group, { replaceFieldIds: old.fieldIds || [old.fieldId] });
        if (!replacement || result?.added === false || !group.planId) {
            if (replacement) delete ai.plans[replacement.id];
            Object.assign(group, savedGroup);
            old.status = oldStatus;
            life.blockReason = result?.reason || "replacement-invalid";
            return false;
        }
        old.projectState = "retired";
        old.coverageAvailable = false;
        old.lifecycle.retiredTurn = clock;
        old.lifecycle.reason = "better-coverage";
        api.FieldCommand.endProjectSupport(encounter, group.id);
        delete group.maintenance;
        delete group.maintenanceOffer;
        delete group.engagement;
        delete group.noPlanSignature;
        replacement.planningFocus = clone(focus);
        replacement.revision = (old.revision || 0) + 1;
        progress(encounter, replacement);
        return true;
    }

    function replacementSignature(candidate, focus, adapter) {
        return `${candidate.id}:${focus.target.kind}:${focus.target.id}:${adapter.geometrySignature}`;
    }

    function betterReplacement(encounter, old, focus, candidate, available, planner) {
        if (!covers({ ...candidate, kind: candidate.type }, focus, planner)) return false;
        const oldArea = old.area || old.interiorCells?.length || (2 * (old.radius || 1) + 1) ** 2;
        const area = candidate.area || candidate.interiorCells?.length || 1;
        const cost =
            Math.min(
                ...available.map((member) => planner.distances(member, candidate.center || candidate.anchors[0])),
            ) +
            candidate.cells.length +
            (candidate.layers?.length || 1) * 8;
        const oldWork = api.SpinnerTopology.fieldWorkNeeds(
            encounter.topology,
            old.fieldIds || [old.fieldId],
        ).remainingActions;
        const oldCost =
            oldWork + Math.min(...available.map((member) => planner.distances(member, old.center || old.anchors[0])));
        return (
            Number.isFinite(cost) &&
            (!covers(old, focus, planner) ||
                (area > oldArea && cost <= oldCost) ||
                (area >= oldArea && cost <= oldCost * 0.75))
        );
    }

    function compareSites(a, b) {
        return (
            (b.area || b.interiorCells?.length || 1) - (a.area || a.interiorCells?.length || 1) ||
            b.score - a.score ||
            a.id.localeCompare(b.id)
        );
    }

    function selectSavedPlan(ai, group, candidates) {
        if (group.planId && ai.plans[group.planId]) return ai.plans[group.planId];
        const invalid = new Set(ai.invalidCandidateIds || []),
            occupied = new Set(
                Object.values(ai.plans)
                    .filter((plan) => !["invalid", "abandoned", "retired"].includes(plan.status))
                    .flatMap((plan) => plan.cells || []),
            ),
            eligible = candidates.filter(
                (candidate) =>
                    !invalid.has(candidate.id) && !candidate.cells.some((cell) => occupied.has(cellKey(cell))),
            ),
            largestArea = Math.max(
                0,
                ...eligible.map((candidate) => candidate.area || candidate.interiorCells?.length || 1),
            ),
            shortlist = eligible
                .filter((candidate) => (candidate.area || candidate.interiorCells?.length || 1) === largestArea)
                .sort(compareSites)
                .slice(0, api.SpinnerAI.SHORTLIST_SIZE);
        if (!shortlist.length) return undefined;
        const random = api.SpinnerAI.seededRandom(
                `${ai.mapSeed}:${ai.mapIdentity}:${group.id}:${group.selectionOrdinal}`,
            ),
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
            ...(selected.type === "enclosure" || selected.type === "passage"
                ? {
                      compositeId: fieldId,
                      center: clone(selected.center),
                      ...(selected.gate ? { gate: clone(selected.gate) } : {}),
                      fieldIds:
                          selected.type === "enclosure"
                              ? selected.layers.map((_, index) => (index ? `${fieldId}:ring:${index + 1}` : fieldId))
                              : [fieldId],
                  }
                : {}),
            ...(selected.type === "enclosure"
                ? {
                      constructionOrder: "outer-first",
                      radius: selected.radius,
                      layers: selected.layers.map((layer, index) => ({
                          ...clone(layer),
                          id: index ? `${fieldId}:ring:${index + 1}` : fieldId,
                      })),
                  }
                : {}),
            ...(selected.type === "passage"
                ? {
                      interiorCells: clone(selected.interiorCells),
                      gates: clone(selected.gates),
                      nativeWallCells: clone(selected.nativeWallCells),
                      proof: clone(selected.proof),
                  }
                : {}),
            status: "traveling",
            selectedRevision: ai.candidateRevision,
            selectionOrdinal: group.selectionOrdinal,
            anchors: clone(selected.anchors || []),
            cells: selected.cells.map(cellKey),
            ...(selected.type === "enclosure" ? { initialCells: selected.cells.map(cellKey) } : {}),
            invalidReason: null,
        };
        group.planId = planId;
        const observation = api.SpinnerAI.groupObservation?.(group);
        if (observation) group.planningObservation = { ...clone(observation), turn: ai.coordinationTurn || 0 };
        return ai.plans[planId];
    }

    function activatePlan(plan, group, options = {}) {
        if (!plan) return undefined;
        const input = {
            groupId: group.id,
            owners: group.memberIds,
            fieldId: plan.fieldId,
            compositeId: plan.compositeId,
        };
        if (plan.kind === "passage")
            Object.assign(input, {
                interiorCells: plan.interiorCells,
                core: plan.center,
                gates: plan.gates,
                nativeWallCells: plan.nativeWallCells,
                scenario: "autonomous-passage",
            });
        else if (plan.kind === "enclosure")
            Object.assign(input, {
                layers: plan.layers || [{ id: plan.fieldId, vertices: plan.anchors, gate: plan.gate }],
                constructionOrder: plan.constructionOrder,
                autoSeal: false,
                scenario: "autonomous-enclosure",
            });
        else Object.assign(input, { anchors: plan.anchors, scenario: "autonomous-line" });
        const result = api.SpinnerNativeField.commitProjectStructure(plan.kind, input, options.replaceFieldIds);
        if (plan && result?.added === false) {
            plan.status = "invalid";
            plan.invalidReason = result.reason;
            group.planId = null;
            group.assignments = {};
            delete group.noPlanSignature;
            delete group.lastSiteSearch;
        }
        return result;
    }

    function deployPrebuilt(encounter, group, candidate) {
        const plan = selectSavedPlan(encounter.ai, group, [candidate]);
        const added = api.SpinnerNativeField.addEnclosure({
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
            return undefined;
        }
        plan.provenance = "mapgen";
        plan.status = "preparing";
        return plan;
    }

    function workforce(plan, needs, fields = []) {
        if (!needs.construction) return needs.repair ? 1 : 0;
        // Twelve pending paid steps per worker, capped at four, keeps an enclosure crew
        // together without reserving every Spinner on the map for one project.
        return Math.max(
            2,
            Math.min(4, Math.ceil((needs.remainingActions || plan.cells?.length || 1) / 12)),
            ...fields.map((field) => (field.kind === "passage" ? field.gates.length * 2 : 1)),
        );
    }

    function prepareTurn(encounter, adapter) {
        workWorlds.set(encounter, adapter.workWorld);
        const planner = {
            distances: adapter.route,
            lineFixture: adapter.lineFixture,
            members: (group) => adapter.facts(group).members,
            legal: (plan) => adapter.facts(encounter.ai.groups[plan.groupId]).legal,
            paid: (plan) => adapter.facts(encounter.ai.groups[plan.groupId]).paid,
            canWork: (group, member) => adapter.facts(group).capableIds.includes(member.id),
            intercepts: (plan, target) => adapter.intercepts(plan, target),
            prepareApproach: (group) => adapter.prepare(group),
            propose: (group, members) => adapter.candidates(group, members)[0],
            commit: (group, candidate) => activatePlan(selectSavedPlan(encounter.ai, group, [candidate]), group),
            relocate: (group) => abandon(encounter, group, "position-demand"),
            invalidate: (group) => {
                invalidate(encounter, group, "terrain");
            },
            start: (group) => {
                const maximum = adapter.lineFixture ? limit() : capacity();
                const active = Object.values(encounter.ai.groups).filter((entry) => {
                    const plan = encounter.ai.plans[entry.planId];
                    return plan && !entry.cancelled && !["invalid", "abandoned", "retired"].includes(plan.status);
                }).length;
                if (maximum === 0 || (!adapter.lineFixture && active >= maximum)) return;
                const facts = adapter.facts(group);
                if (group.noPlanSignature === facts.signature) return;
                const search = group.lastSiteSearch;
                if (
                    search &&
                    !adapter.lineFixture &&
                    search.geometry === adapter.geometrySignature &&
                    now(encounter) - search.turn < SEARCH_INTERVAL
                )
                    return;
                group.lastSiteSearch = { geometry: adapter.geometrySignature, turn: now(encounter) };
                const candidates = adapter.candidates(group, facts.members);
                encounter.ai.candidates = candidates;
                if (facts.members.length < 2 && candidates[0]?.type === "line") return;
                const plan = selectSavedPlan(encounter.ai, group, candidates);
                if (plan) delete group.noPlanSignature;
                else group.noPlanSignature = facts.signature;
                activatePlan(plan, group);
            },
        };
        frames.set(encounter, planner);
        return update(encounter, planner, adapter);
    }

    function invalidate(encounter, group, reason) {
        const plan = encounter.ai.plans[group.planId];
        if (!plan) return;
        encounter.ai.invalidCandidateIds = [...new Set([...encounter.ai.invalidCandidateIds, plan.candidateId])];
        encounter.ai.candidateRevision++;
        abandon(encounter, group, reason);
        plan.status = "invalid";
        delete group.lastSiteSearch;
        if (capacity() > 0) frames.get(encounter)?.start(group);
    }

    function abandon(encounter, group, reason) {
        const plan = encounter.ai.plans[group.planId];
        if (!plan) return;
        plan.status = "abandoned";
        plan.invalidReason = reason;
        for (const id of plan.fieldIds || [plan.fieldId]) api.SpinnerNativeField.retireField(id);
        group.planId = null;
        group.assignments = {};
        group.selectionOrdinal++;
        delete group.noPlanSignature;
    }

    function readiness(encounter, plan, positions, planner) {
        const outerId = encounter.topology.composites?.[plan.compositeId]?.layerIds.at(-1);
        const outer = encounter.topology.fields?.[outerId];
        if (!outer || outer.retired) return 0;
        let urgency = 0;
        for (const target of positions) {
            if (api.SpinnerTopology.containsDeclaredField(encounter.topology, outerId, target)) {
                urgency = 2;
                break;
            }
            if (outer.boundaryCells.some((cell) => distance(cell, target) <= 4 && planner.distances(cell, target) <= 4))
                urgency = Math.max(urgency, 1);
        }
        if (urgency) plan.readiness = { urgency, lastNearTurn: now(encounter) };
        // Crossing one edge and returning must not send an approaching crew home.
        else if (plan.readiness && now(encounter) - plan.readiness.lastNearTurn <= 2) urgency = plan.readiness.urgency;
        else delete plan.readiness;
        return urgency;
    }

    function update(encounter, planner, adapter) {
        const ai = encounter.ai,
            command = api.FieldCommand,
            state = command.ensure(encounter);
        const positions = command.positions(encounter),
            maximum = planner.lineFixture ? limit() : capacity();
        const activeProjects = () =>
            Object.values(ai.groups).filter((group) => {
                const plan = ai.plans[group.planId];
                return plan && !["invalid", "abandoned", "retired"].includes(plan.status) && !group.cancelled;
            });
        ai.projects ||= { version: 1, coverage: [], unmet: [] };
        ai.projects.permits = permits();
        ai.projects.maximum = maximum;
        // Global position knowledge is planning-only. It never creates a native engagement or attack awareness.
        ai.projects.positions = positions;
        for (const group of Object.values(ai.groups).sort((a, b) => a.id.localeCompare(b.id))) {
            let plan = ai.plans[group.planId];
            if (group.cancelled) continue;
            const members = planner.members(group);
            group.planningFocus = positions
                .filter((target) => members.some((member) => Number.isFinite(planner.distances(member, target))))
                .sort(
                    (a, b) =>
                        Number(
                            b.target.kind === group.engagement?.target.kind &&
                                String(b.target.id) === String(group.engagement?.target.id),
                        ) -
                            Number(
                                a.target.kind === group.engagement?.target.kind &&
                                    String(a.target.id) === String(group.engagement?.target.id),
                            ) ||
                        Math.min(...members.map((member) => planner.distances(member, a))) -
                            Math.min(...members.map((member) => planner.distances(member, b))),
                )[0];
            if (
                plan &&
                (!planner.legal(plan) ||
                    (plan.fieldIds || [plan.fieldId]).every((id) => encounter.topology.fields[id]?.retired))
            ) {
                planner.invalidate(group);
                plan = ai.plans[group.planId];
            }
            if (plan) {
                const now = ai.coordinationTurn || 0;
                const approach = Math.min(
                    ...Object.entries(group.assignments || {}).map(([id, assignment]) => {
                        const member = members.find((entity) => String(entity.id) === id);
                        return member && assignment.workCell
                            ? planner.distances(member, assignment.workCell)
                            : Infinity;
                    }),
                );
                if (
                    !plan.approachProgress ||
                    (Number.isFinite(approach) &&
                        (plan.approachProgress.distance === null || approach < plan.approachProgress.distance))
                )
                    plan.approachProgress = { distance: Number.isFinite(approach) ? approach : null, turn: now };
                if (
                    group.planningFocus &&
                    plan.planningFocus &&
                    distance(group.planningFocus, plan.planningFocus) >= 4 &&
                    !planner.paid(plan) &&
                    !api.FieldCustody?.ownsField(plan.compositeId) &&
                    now - (plan.selectedTurn || 0) >= 12 &&
                    now - plan.approachProgress.turn >= 8
                ) {
                    planner.relocate(group);
                    plan = undefined;
                }
            }
            const existing = Object.values(ai.groups).some((other) => {
                if (other === group) return false;
                const saved = ai.plans[other.planId],
                    point = command.location(encounter, other);
                return (
                    saved &&
                    !["invalid", "abandoned", "retired"].includes(saved.status) &&
                    (saved.coverageAvailable || saved.usableCoverage) &&
                    point &&
                    group.planningFocus &&
                    (distance(point, group.planningFocus) <= Math.max(6, (saved.radius || 0) + 2) ||
                        planner.intercepts(saved, group.planningFocus)) &&
                    members.some((member) => Number.isFinite(planner.distances(member, point)))
                );
            });
            if (
                !plan &&
                members.length &&
                !existing &&
                !command.residencyPending(encounter) &&
                maximum > 0 &&
                (planner.lineFixture || activeProjects().length < maximum)
            ) {
                if (api.SpinnerRecovery?.needsField?.())
                    group.recoveryAround = positions.find((target) => target.target.kind === "player");
                planner.start(group);
            }
            plan = ai.plans[group.planId];
            if (!plan || ["invalid", "abandoned", "retired"].includes(plan.status)) continue;
            plan.planningFocus ||= group.planningFocus;
            plan.selectedTurn ??= ai.coordinationTurn || 0;
            plan.paidInvestment = planner.paid(plan);
            if (adapter && replaceProject(encounter, group, planner, adapter)) plan = ai.plans[group.planId];
            const life = progress(encounter, plan);
            if (adapter && now(encounter) - Math.max(life.lastAdvanceTurn, life.lastRecoveryTurn) >= STALL_TURNS) {
                group.assignments = {};
                life.lastRecoveryTurn = now(encounter);
                life.recoveryAttempts = (life.recoveryAttempts || 0) + 1;
                life.blockReason ||= adapter.facts(group).blockReason;
            }
            // Opening changes create real work before donors judge their minimum retained workforce.
            planner.prepareApproach(group);
            const origin = command.location(encounter, group);
            const fields = (plan.fieldIds || [plan.fieldId]).map((id) => encounter.topology.fields[id]).filter(Boolean);
            const needs = api.SpinnerTopology.fieldWorkNeeds(encounter.topology, plan.fieldIds || [plan.fieldId]);
            const { repair, construction } = needs;
            const workers = workforce(plan, needs, fields);
            const urgency = readiness(encounter, plan, positions, planner);
            const outerId = encounter.topology.composites?.[plan.compositeId]?.layerIds.at(-1);
            const outer = encounter.topology.fields?.[outerId];
            const atSite = (member) => command.atSite(member, group.id, encounter);
            const capable = members.filter(
                (member) =>
                    !command.protectedMember(member) &&
                    Number.isFinite(planner.distances(member, origin)) &&
                    !state.members[member.id]?.blocked &&
                    (planner.canWork ? planner.canWork(group, member) : true),
            );
            const geometryReady =
                (fields.length > 0 && fields.every((field) => ["ready", "sealed"].includes(field.phase))) ||
                (plan.compositeId &&
                    api.SpinnerTopology.captureGeometryReady(encounter.topology, plan.compositeId, origin));
            const targets = positions.filter(
                (target) =>
                    plan.compositeId &&
                    api.SpinnerTopology.isInsideCommonCore(encounter.topology, plan.compositeId, target),
            );
            const defense = members.some((member) => member.SpiderlingsTaskNestDefenderTarget !== undefined);
            const kind = defense
                ? "defense"
                : targets.length
                  ? api.SpinnerRecovery?.needsField?.()
                      ? "recovery"
                      : "capture"
                  : urgency
                    ? "readiness"
                    : repair
                      ? "repair"
                      : "build";
            const nearby = positions.filter(
                (target) =>
                    outer &&
                    (api.SpinnerTopology.containsDeclaredField(encounter.topology, outerId, target) ||
                        outer.boundaryCells.some(
                            (cell) => distance(cell, target) <= 4 && planner.distances(cell, target) <= 4,
                        )),
            );
            const target = defense
                ? {
                      kind: "npc",
                      id: members.find((member) => member.SpiderlingsTaskNestDefenderTarget !== undefined)
                          .SpiderlingsTaskNestDefenderTarget,
                  }
                : (targets.length ? targets : nearby).find((entry) => entry.target.kind === "player")?.target ||
                  (targets.length ? targets : nearby)[0]?.target ||
                  group.engagement?.target;
            const staffing = members.filter(
                (member) =>
                    command.servesRequest(member, { kind, fieldId: group.id, target }, encounter) &&
                    !state.members[member.id]?.blocked &&
                    Number.isFinite(planner.distances(member, origin)),
            );
            const required = defense ? 2 : targets.length || urgency ? 2 : construction ? workers : repair ? 1 : 0;
            const own = staffing.filter((member) => !state.members[member.id]?.loan && atSite(member)).length;
            const residents = command.residency(encounter, group.id);
            plan.minimumResidents = residents.minimum;
            plan.residentStaff = residents.usable;
            plan.workforceTarget = workers;
            plan.availableWorkers = capable.length;
            plan.availableStaff = staffing.filter(atSite).length;
            plan.urgency = urgency;
            plan.usableCoverage = !!geometryReady;
            plan.projectState =
                (repair || construction) && !capable.length
                    ? "waiting"
                    : repair
                      ? "repair"
                      : construction
                        ? "building"
                        : "usable";
            const demands = new Map([[kind, Math.max(0, required - own)]]);
            // Capture sources cannot also repair their field. Keep their commitment and ask for a separate worker.
            if (repair || construction) {
                const workKind = repair ? "repair" : "build";
                // A blocked cell is an execution problem, not missing staff.
                // Keep the committed workers and resolve the obstruction before
                // asking for another identical crew that cannot work either.
                const workStaff = members.filter(
                    (member) =>
                        command.servesRequest(member, { kind: workKind, fieldId: group.id, target }, encounter) &&
                        !state.members[member.id]?.loan &&
                        !state.members[member.id]?.blocked &&
                        Number.isFinite(planner.distances(member, origin)),
                );
                const available = workStaff.length,
                    availableAtSite = workStaff.filter(atSite).length;
                const retained = ["capture", "recovery", "defense"].includes(kind)
                    ? Math.min(availableAtSite, Math.max(0, required - (own - availableAtSite)))
                    : 0;
                demands.set(workKind, Math.max(0, (repair ? 1 : workers) - Math.max(0, available - retained)));
            }
            command.reviseDemands(encounter, group.id, demands, origin, { urgency, target });
            const stalled = (repair || construction) && now(encounter) - life.lastAdvanceTurn >= STALL_TURNS;
            if (stalled || ((repair || construction) && !capable.length)) {
                plan.projectState = "waiting";
                life.blockReason ||= adapter?.facts(group).blockReason || "no-workers";
            }
            const activeSources = members.some(
                (member) =>
                    command.sourceRole(member) &&
                    command.servesRequest(member, { kind: "capture", fieldId: group.id, target }, encounter),
            );
            plan.coverageAvailable =
                (!!geometryReady && (plan.availableStaff >= 2 || activeSources)) || (capable.length > 0 && !stalled);
        }
        const active = Object.values(ai.groups).filter((group) => {
            const plan = ai.plans[group.planId];
            return plan && !["invalid", "abandoned", "retired"].includes(plan.status) && !group.cancelled;
        });
        const covered = (target) =>
            active.some((group) => {
                const plan = ai.plans[group.planId],
                    point = command.location(encounter, group);
                return (
                    plan.coverageAvailable &&
                    point &&
                    (distance(point, target) <= Math.max(6, (plan.radius || 0) + 2) ||
                        planner.intercepts(plan, target)) &&
                    Number.isFinite(planner.distances(point, target))
                );
            });
        const unmet = positions.filter((target) => !covered(target));
        // A ready field with missing staff still reports unmet demand. Moving
        // its last worker into a duplicate project does not fill that deficit.
        const reusable = (target) =>
            active.some((group) => {
                const plan = ai.plans[group.planId];
                return plan.usableCoverage && covers(plan, target, planner);
            });
        ai.projects.coverage = active.map((group) => ({
            groupId: group.id,
            planId: group.planId,
            available: !!ai.plans[group.planId].coverageAvailable,
            usable: !!ai.plans[group.planId].usableCoverage,
            workers: ai.plans[group.planId].availableWorkers,
            targetWorkers: ai.plans[group.planId].workforceTarget,
        }));
        ai.projects.unmet = unmet;
        // Supplied line fixtures describe legacy diagnostic fields, not a normal-map area planner.
        if (!planner.lineFixture && active.length && !command.residencyPending(encounter))
            for (const target of unmet) {
                if (active.length >= maximum) break;
                if (covered(target) || reusable(target)) continue;
                const supply = command.offers(encounter, target, planner.distances);
                if (!supply.members.length) continue;
                const first = KDMapData.Entities.find((entity) => String(entity.id) === String(supply.members[0].id));
                const group = command.newGroup(ai, [first]);
                group.planningFocus = target;
                if (api.SpinnerRecovery?.needsField?.() && target.target.kind === "player")
                    group.recoveryAround = target;
                // Candidate proof runs with a real offered worker before a persistent project is accepted.
                const candidate = planner.propose(group, [first]);
                if (!candidate) {
                    delete ai.groups[group.id];
                    continue;
                }
                const destination = candidate.center || candidate.anchors?.[0];
                const crew = workforce(candidate, { construction: true });
                command.request(encounter, group.id, "build", crew, destination);
                command.allocate(encounter, planner.distances);
                if (!group.memberIds.length) {
                    command.endProjectSupport(encounter, group.id);
                    delete ai.groups[group.id];
                    continue;
                }
                planner.commit(group, candidate);
                const plan = ai.plans[group.planId];
                if (!plan) {
                    command.endProjectSupport(encounter, group.id);
                    group.cancelled = true;
                    continue;
                }
                plan.coverageAvailable = true;
                plan.workforceTarget = crew;
                plan.availableWorkers = group.memberIds.length;
                plan.usableCoverage = false;
                plan.projectState = "approaching";
                active.push(group);
            }
        command.allocate(encounter, planner.distances);
        command.dispatchRegions(encounter, planner.distances);
        command.projectOwners(encounter);
        return ai.projects;
    }

    function reserveWork(encounter, snapshot, distances, world) {
        workWorlds.set(encounter, world);
        workSnapshot = { map: KDMapData, snapshot };
        return reserveActions(encounter, snapshot, distances);
    }
    api.FieldProjects = {
        reserveWork,
        prepareWork,
        beginWork,
        workFor,
        assessWork,
        prepareApproach,
        reconcileCrew,
        enrollCrew,
        reconcilePressure,
        restoreProjects,
        workObstruction,
        assignmentPending,
        hasGateWork,
        hasMaintenanceAssignment,
        adoptExistingTopology,
        workersForCandidate,
        deployPrebuilt,

        executeDuty,
        refreshWork,
        prepareTurn,
        recordOutcome,
        invalidate,
        update,
        selectSavedPlan,
        activatePlan,
        limit,
        permits,
        capacity,
        MAX_PROJECTS,
        SEARCH_INTERVAL,
        STALL_TURNS,
        inspect: (planId) => {
            const plan = api.SpinnerNativeField.state()?.ai?.plans[planId];
            return plan ? clone(plan) : undefined;
        },
    };
})();
