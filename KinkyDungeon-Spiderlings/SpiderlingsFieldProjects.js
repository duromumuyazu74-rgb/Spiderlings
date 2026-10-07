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
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const cellKey = (cell) => (typeof cell === "string" ? cell : `${cell.x},${cell.y}`);
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const frames = new WeakMap();
    const SEARCH_INTERVAL = 4,
        STALL_TURNS = 8,
        REPLACEMENT_TURNS = 8;
    const now = (encounter) => encounter.ai.worldTime ?? encounter.ai.coordinationTurn ?? 0;

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
        if (!old || !focus || limit() === 0 || !smallProject(encounter, old) || adapter.lineFixture) return false;
        if (
            Object.values(ai.groups).filter(
                (entry) =>
                    entry.planId &&
                    !entry.cancelled &&
                    !["invalid", "abandoned", "retired"].includes(ai.plans[entry.planId]?.status),
            ).length > limit()
        )
            return false;
        const life = progress(encounter, old),
            clock = now(encounter);
        if (planner.members(group).some((member) => api.FieldCommand.protectedMember(member))) {
            delete life.replacement;
            return false;
        }
        if (life.lastSearchTurn !== undefined && clock - life.lastSearchTurn < SEARCH_INTERVAL) return false;
        life.lastSearchTurn = clock;
        const facts = adapter.facts(group),
            available = facts.members.filter((member) => !api.FieldCommand.protectedMember(member));
        if (!available.length) {
            delete life.replacement;
            return false;
        }
        const candidate = adapter.candidates(group, available, true)[0];
        if (!candidate || !covers({ ...candidate, kind: candidate.type }, focus, planner)) {
            delete life.replacement;
            return false;
        }
        const oldCoverage = covers(old, focus, planner),
            oldArea = old.area || old.interiorCells?.length || (2 * (old.radius || 1) + 1) ** 2;
        const area = candidate.area || candidate.interiorCells?.length || 1;
        const travel = Math.min(
            ...available.map((member) => planner.distances(member, candidate.center || candidate.anchors[0])),
        );
        const cost = travel + candidate.cells.length + (candidate.layers?.length || 1) * 8;
        const oldWork = api.SpinnerTopology.fieldWorkNeeds(
            encounter.topology,
            old.fieldIds || [old.fieldId],
        ).remainingActions;
        const oldCost =
            oldWork + Math.min(...available.map((member) => planner.distances(member, old.center || old.anchors[0])));
        const better =
            !oldCoverage || (area > oldArea && cost <= oldCost) || (area >= oldArea && cost <= oldCost * 0.75);
        if (!better || !Number.isFinite(cost)) {
            delete life.replacement;
            return false;
        }
        const signature = `${candidate.id}:${focus.target.kind}:${focus.target.id}:${adapter.geometrySignature}`;
        if (life.replacement?.signature !== signature) life.replacement = { signature, since: clock };
        life.replacement.candidateId = candidate.id;
        const stable = life.completion >= 0.5 ? REPLACEMENT_TURNS * 2 : REPLACEMENT_TURNS;
        if (clock - life.replacement.since < stable) return false;
        // No world action can interleave with this synchronous, revalidated submission.
        const savedGroup = clone(group),
            savedGraph = encounter.topology,
            oldStatus = old.status;
        old.status = "retired";
        group.planId = null;
        group.selectionOrdinal++;
        group.assignments = {};
        const replacement = selectSavedPlan(ai, group, [candidate]);
        const result = activatePlan(replacement, group);
        if (!replacement || result?.added === false || !group.planId) {
            if (replacement) delete ai.plans[replacement.id];
            Object.assign(group, savedGroup);
            old.status = oldStatus;
            encounter.topology = savedGraph;
            api.SpinnerNativeField.reconcile();
            life.blockReason = result?.reason || "replacement-invalid";
            return false;
        }
        old.projectState = "retired";
        old.coverageAvailable = false;
        old.lifecycle.retiredTurn = clock;
        old.lifecycle.reason = "better-coverage";
        for (const id of old.fieldIds || [old.fieldId]) api.SpinnerNativeField.retireField(id, { residual: true });
        for (const request of Object.values(encounter.command.requests))
            if (request.fieldId === group.id) request.closed = true;
        delete group.maintenance;
        delete group.maintenanceOffer;
        delete group.engagement;
        delete group.noPlanSignature;
        replacement.planningFocus = clone(focus);
        replacement.revision = (old.revision || 0) + 1;
        progress(encounter, replacement);
        return true;
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

    function activatePlan(plan, group) {
        let result;
        if (plan?.kind === "passage")
            result = api.SpinnerNativeField.addPassage({
                compositeId: plan.compositeId,
                fieldId: plan.fieldId,
                groupId: group.id,
                owners: group.memberIds,
                interiorCells: plan.interiorCells,
                core: plan.center,
                gates: plan.gates,
                nativeWallCells: plan.nativeWallCells,
                scenario: "autonomous-passage",
            });
        else if (plan?.kind === "enclosure")
            result = api.SpinnerNativeField.addEnclosure({
                compositeId: plan.compositeId,
                groupId: group.id,
                owners: group.memberIds,
                layers: plan.layers || [{ id: plan.fieldId, vertices: plan.anchors, gate: plan.gate }],
                constructionOrder: plan.constructionOrder,
                autoSeal: false,
                scenario: "autonomous-enclosure",
            });
        else if (plan)
            result = api.SpinnerNativeField.addLine({
                fieldId: plan.fieldId,
                owners: group.memberIds,
                anchors: plan.anchors,
                scenario: "autonomous-line",
            });
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
        if (limit() > 0) frames.get(encounter)?.start(group);
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

    function update(encounter, planner, adapter) {
        const ai = encounter.ai,
            command = api.FieldCommand,
            state = command.ensure(encounter);
        const positions = command.positions(encounter),
            maximum = limit();
        const activeProjects = () =>
            Object.values(ai.groups).filter((group) => {
                const plan = ai.plans[group.planId];
                return plan && !["invalid", "abandoned", "retired"].includes(plan.status) && !group.cancelled;
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
                    !["invalid", "abandoned", "retired"].includes(saved.status) &&
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
            const stalled = (repair || construction) && now(encounter) - life.lastAdvanceTurn >= STALL_TURNS;
            if (stalled || ((repair || construction) && !capable.length)) {
                plan.projectState = "waiting";
                life.blockReason ||= adapter?.facts(group).blockReason || "no-workers";
            }
            plan.coverageAvailable = !!geometryReady || (capable.length > 0 && !stalled);
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

    api.FieldProjects = {
        prepareTurn,
        recordOutcome,
        invalidate,
        update,
        selectSavedPlan,
        activatePlan,
        limit,
        MAX_PROJECTS,
        SEARCH_INTERVAL,
        STALL_TURNS,
        inspect: (planId) => {
            const plan = api.SpinnerNativeField.state()?.ai?.plans[planId];
            return plan ? clone(plan) : undefined;
        },
    };
})();
