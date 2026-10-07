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
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

    function workforce(plan, needs, fields = []) {
        if (!needs.construction) return needs.repair ? 1 : 0;
        // Twelve pending paid steps per worker, capped at four, keeps an enclosure crew
        // together without reserving every Spinner on the map for one project.
        return Math.max(
            1,
            Math.min(4, Math.ceil((needs.remainingActions || plan.cells?.length || 1) / 12)),
            ...fields.map((field) => (field.kind === "passage" ? field.gates.length * 2 : 1)),
        );
    }

    function update(encounter, planner) {
        const ai = encounter.ai,
            command = api.FieldCommand,
            state = command.ensure(encounter);
        const positions = command.positions(encounter),
            maximum = limit();
        const activeProjects = () =>
            Object.values(ai.groups).filter((group) => {
                const plan = ai.plans[group.planId];
                return plan && !["invalid", "abandoned"].includes(plan.status) && !group.cancelled;
            });
        ai.projects ||= { version: 1, coverage: [], unmet: [] };
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
                    !["invalid", "abandoned"].includes(saved.status) &&
                    saved.coverageAvailable &&
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
                maximum > 0 &&
                (planner.lineFixture || activeProjects().length < maximum)
            ) {
                if (api.SpinnerRecovery?.needsField?.())
                    group.recoveryAround = positions.find((target) => target.target.kind === "player");
                planner.start(group);
            }
            plan = ai.plans[group.planId];
            if (!plan || ["invalid", "abandoned"].includes(plan.status)) continue;
            plan.planningFocus ||= group.planningFocus;
            plan.selectedTurn ??= ai.coordinationTurn || 0;
            plan.paidInvestment = planner.paid(plan);
            // Opening changes create real work before donors judge their minimum retained workforce.
            planner.prepareApproach(group);
            const origin = command.location(encounter, group);
            const fields = (plan.fieldIds || [plan.fieldId]).map((id) => encounter.topology.fields[id]).filter(Boolean);
            const needs = api.SpinnerTopology.fieldWorkNeeds(encounter.topology, plan.fieldIds || [plan.fieldId]);
            const { repair, construction } = needs;
            const workers = workforce(plan, needs, fields);
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
                  : repair
                    ? "repair"
                    : "build";
            const required = defense ? 2 : targets.length ? 2 : construction ? workers : repair ? 1 : 0;
            const own = members.filter((member) => !state.members[member.id]?.loan).length;
            plan.workforceTarget = workers;
            plan.availableWorkers = capable.length;
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
                const available = capable.filter((member) => !state.members[member.id]?.loan).length;
                const retained = ["capture", "recovery", "defense"].includes(kind)
                    ? Math.max(0, required - (own - available))
                    : 0;
                demands.set(workKind, Math.max(0, (repair ? 1 : workers) - Math.max(0, available - retained)));
            }
            for (const request of Object.values(state.requests))
                if (request.fieldId === group.id && !demands.has(request.kind)) request.closed = true;
            for (const [duty, count] of demands) {
                if (count > 0) command.request(encounter, group.id, duty, count, origin);
                else if (state.requests[`${group.id}:${duty}`]) state.requests[`${group.id}:${duty}`].closed = true;
            }
            plan.coverageAvailable = !!geometryReady || capable.length > 0;
        }
        const active = Object.values(ai.groups).filter((group) => {
            const plan = ai.plans[group.planId];
            return plan && !["invalid", "abandoned"].includes(plan.status) && !group.cancelled;
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
        if (!planner.lineFixture && active.length)
            for (const target of unmet) {
                if (active.length >= maximum) break;
                if (covered(target)) continue;
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
                const request = command.request(encounter, group.id, "build", crew, destination);
                command.allocate(encounter, planner.distances);
                if (!group.memberIds.length) {
                    request.closed = true;
                    delete ai.groups[group.id];
                    continue;
                }
                planner.commit(group, candidate);
                const plan = ai.plans[group.planId];
                if (!plan) {
                    request.closed = true;
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

    api.FieldProjects = { update, limit, MAX_PROJECTS };
})();
