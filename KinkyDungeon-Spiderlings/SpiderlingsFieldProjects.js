"use strict";

// Continuous demand, investment and real workforce are assessed together, not by independent site callers.
(() => {
    const api = globalThis.Spiderlings;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

    function update(encounter, planner) {
        const ai = encounter.ai,
            command = api.FieldCommand,
            state = command.ensure(encounter);
        const positions = command.positions(encounter);
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
                    point &&
                    group.planningFocus &&
                    (distance(point, group.planningFocus) <= Math.max(6, (saved.radius || 0) + 2) ||
                        planner.intercepts(saved, group.planningFocus)) &&
                    members.some((member) => Number.isFinite(planner.distances(member, point)))
                );
            });
            if (!plan && members.length && !existing) {
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
            const workable = members.some((member) => Number.isFinite(planner.distances(member, origin)));
            const fields = (plan.fieldIds || [plan.fieldId]).map((id) => encounter.topology.fields[id]).filter(Boolean);
            const { repair, construction } = api.SpinnerTopology.fieldWorkNeeds(
                encounter.topology,
                plan.fieldIds || [plan.fieldId],
            );
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
            const required = defense
                ? 2
                : targets.length
                  ? 2
                  : construction
                    ? Math.max(1, ...fields.map((field) => (field.kind === "passage" ? field.gates.length * 2 : 1)))
                    : repair
                      ? 1
                      : 0;
            const own = members.filter((member) => !state.members[member.id]?.loan).length;
            plan.projectState = !workable ? "waiting" : repair ? "repair" : construction ? "building" : "usable";
            const key = `${group.id}:${kind}`;
            for (const request of Object.values(state.requests))
                if (request.fieldId === group.id && request.id !== key) request.closed = true;
            if (required > own) command.request(encounter, group.id, kind, required - own, origin);
            else if (state.requests[key]) state.requests[key].closed = true;
            plan.coverageAvailable = workable;
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
        }));
        ai.projects.unmet = unmet;
        // Supplied line fixtures describe legacy diagnostic fields, not a normal-map area planner.
        if (!planner.lineFixture && active.length)
            for (const target of unmet) {
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
                const request = command.request(encounter, group.id, "build", 1, destination);
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
                plan.projectState = "approaching";
                active.push(group);
            }
        command.allocate(encounter, planner.distances);
        command.dispatchRegions(encounter, planner.distances);
        command.projectOwners(encounter);
        return ai.projects;
    }

    api.FieldProjects = { update };
})();
