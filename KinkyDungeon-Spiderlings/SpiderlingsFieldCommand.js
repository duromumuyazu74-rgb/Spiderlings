"use strict";

// The map-local controller owns commitments; field owners never reconstruct command after migration.
(() => {
    const api = globalThis.Spiderlings;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const same = (a, b) => String(a) === String(b);
    const species = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings", "NestEntrance"]);

    function eligible(entity) {
        return !!(
            entity?.hp > 0 &&
            species.has(entity.Enemy?.name) &&
            KDHostile(entity) &&
            !KDAllied(entity) &&
            !KDIsInParty(entity) &&
            !KDIsImprisoned(entity)
        );
    }

    function actionable(entity) {
        return (
            eligible(entity) &&
            !KinkyDungeonIsDisabled(entity) &&
            !KDHelpless(entity) &&
            ![entity.stun, entity.freeze, entity.channel, entity.teleporting].some((value) => value > 0)
        );
    }

    function validGroup(ai, id) {
        const group = ai.groups[id],
            plan = ai.plans[group?.planId];
        return !!group && !group.cancelled && (!plan || !["invalid", "abandoned"].includes(plan.status));
    }

    function ensure(encounter) {
        if (!encounter?.ai) return undefined;
        const ai = encounter.ai;
        if (!encounter.command) {
            encounter.command = { version: 1, members: {}, requests: {}, regions: {}, nextLoan: 1 };
            const state = encounter.command;
            // Legacy command is imported once. Physical attribution is evidence only for this migration.
            for (const group of Object.values(ai.groups).sort((a, b) => a.id.localeCompare(b.id))) {
                const plan = ai.plans[group.planId];
                const ids = group.memberIds.length
                    ? group.memberIds
                    : (plan?.fieldIds || [plan?.fieldId]).flatMap((id) => encounter.topology?.fieldOwners?.[id] || []);
                for (const id of ids)
                    if (!state.members[id])
                        state.members[id] = { id, home: group.id, commander: group.id, phase: "home" };
            }
        }
        return encounter.command;
    }

    function newGroup(ai, members = []) {
        const id = `spinner-group-${ai.nextGroupOrdinal++}`;
        const nestIds = members.map((entity) => entity.SpiderlingsNestParentID);
        ai.groups[id] = {
            id,
            memberIds: [],
            source:
                nestIds.length && nestIds[0] !== undefined && nestIds.every((nest) => same(nest, nestIds[0]))
                    ? { type: "nest", nestId: nestIds[0] }
                    : { type: "ordinary" },
            selectionOrdinal: 0,
            planId: null,
            assignments: {},
            metrics: { travel: 0, construction: 0, wait: 0, yield: 0, repair: 0 },
        };
        return ai.groups[id];
    }

    function protectedMember(entity) {
        const id = entity?.id;
        return !!(
            api.SpinnerCapture?.state?.()?.sourceIds?.some((source) => same(source, id)) ||
            api.SpinnerRecovery?.sourceIds?.().some((source) => same(source, id)) ||
            api.SpinnerNPCCapture?.usesSource?.(id) ||
            api.SpinnerNPCRecovery?.usesEntity?.(id) ||
            entity?.SpiderlingsTaskNestDefenderTarget !== undefined ||
            api.SpinnerRecovery?.wantsPursuit?.(entity, KinkyDungeonPlayerEntity) ||
            KDMapData.Entities.some((target) => api.SpinnerNPCRecovery?.wantsPursuit?.(entity, target))
        );
    }

    function location(encounter, group) {
        const plan = encounter.ai.plans[group?.planId];
        if (plan?.center) return plan.center;
        if (plan?.anchors?.length) return plan.anchors[0];
        return KDMapData.Entities.find((entity) => group?.memberIds.some((id) => same(id, entity.id)));
    }

    function pending(encounter, group) {
        const plan = encounter.ai.plans[group?.planId];
        if (plan?.kind === "line") {
            const field = api.SpinnerNativeField.fieldById(encounter, plan.fieldId);
            return !!field && api.SpinnerTopology.lineWorkActions(field, true).length > 0;
        }
        if (!encounter.topology || !plan) return false;
        const needs = api.SpinnerTopology.fieldWorkNeeds(encounter.topology, plan.fieldIds || [plan.fieldId]);
        return needs.construction || needs.repair;
    }

    function projectThreat(encounter, group) {
        const plan = encounter.ai.plans[group?.planId];
        return (
            !!plan?.compositeId &&
            positions(encounter).some((target) =>
                api.SpinnerTopology.isInsideCommonCore(encounter.topology, plan.compositeId, target),
            )
        );
    }

    function sync(encounter) {
        const state = ensure(encounter),
            ai = encounter.ai;
        for (const group of Object.values(ai.groups)) {
            group.memberIds = Object.values(state.members)
                .filter((member) => member.commander === group.id && member.phase !== "returning")
                .map((member) => member.id)
                .sort((a, b) => String(a).localeCompare(String(b)));
            for (const id of Object.keys(group.assignments || {}))
                if (!group.memberIds.some((member) => same(member, id))) delete group.assignments[id];
        }
    }

    function owners(encounter, groupId) {
        return Object.values(ensure(encounter)?.members || {})
            .filter(
                (member) => member.home === groupId || (member.commander === groupId && member.phase !== "returning"),
            )
            .map((member) => member.id);
    }

    function projectOwners(encounter) {
        for (const group of Object.values(encounter.ai.groups)) {
            const plan = encounter.ai.plans[group.planId];
            if (plan && !["invalid", "abandoned"].includes(plan.status))
                for (const id of plan.fieldIds || [plan.fieldId])
                    api.SpinnerNativeField.setOwners(id, owners(encounter, group.id));
        }
    }

    function returnMember(encounter, member, reason) {
        member.phase = "returning";
        member.commander = null;
        member.reason = reason;
        const home = encounter.ai.groups[member.home];
        member.destination = validGroup(encounter.ai, member.home)
            ? clone(location(encounter, home) || member.origin)
            : null;
        if (!member.destination) {
            member.home = null;
            member.phase = "free";
            delete member.loan;
        }
    }

    function reconcile(encounter, entities, options = {}, recruit = true) {
        const state = ensure(encounter),
            ai = encounter.ai;
        const byId = new Map(entities.map((entity) => [String(entity.id), entity]));
        for (const [id, member] of Object.entries(state.members)) {
            const entity = byId.get(id);
            if (!eligible(entity) || entity.Enemy.name !== "Spinner") {
                delete state.members[id];
                continue;
            }
            if (!validGroup(ai, member.home)) member.home = null;
            if (member.commander && !validGroup(ai, member.commander))
                returnMember(encounter, member, "receiver-invalid");
            if (member.phase === "returning" && !member.home) returnMember(encounter, member, "home-invalid");
            if (member.phase === "travelling" && protectedMember(entity))
                returnMember(encounter, member, "protected-duty");
            if (member.phase === "travelling" && state.requests[member.requestId]?.closed)
                returnMember(encounter, member, "request-complete");
            if (member.phase === "support" && !protectedMember(entity)) {
                const request = state.requests[member.requestId];
                if (
                    !request ||
                    request.closed ||
                    (!pending(encounter, ai.groups[member.commander]) &&
                        !projectThreat(encounter, ai.groups[member.commander]))
                )
                    returnMember(encounter, member, "support-complete");
            }
        }
        for (const [id, order] of Object.entries(state.regions))
            if (
                !eligible(byId.get(id)) ||
                !validGroup(ai, order.fieldId) ||
                (order.requestId && state.requests[order.requestId]?.closed)
            )
                delete state.regions[id];
        sync(encounter);
        if (recruit) {
            const free = entities.filter(
                (entity) =>
                    actionable(entity) &&
                    entity.Enemy.name === "Spinner" &&
                    !protectedMember(entity) &&
                    (!state.members[entity.id] || state.members[entity.id].phase === "free"),
            );
            for (const entity of free.sort((a, b) => String(a.id).localeCompare(String(b.id)))) {
                const nearby = Object.values(ai.groups)
                    .filter(
                        (group) =>
                            validGroup(ai, group.id) &&
                            (group.source.type === "nest"
                                ? same(group.source.nestId, entity.SpiderlingsNestParentID)
                                : entity.SpiderlingsNestParentID === undefined),
                    )
                    .map((group) => ({
                        group,
                        steps: Math.min(
                            ...(group.memberIds.length
                                ? []
                                : [options.routeDistances?.(entity, location(encounter, group)) ?? Infinity]),
                            ...group.memberIds.map(
                                (id) => options.routeDistances?.(entity, byId.get(String(id))) ?? Infinity,
                            ),
                        ),
                    }))
                    .filter((choice) => choice.steps <= 10)
                    .sort((a, b) => a.steps - b.steps || a.group.id.localeCompare(b.group.id));
                const group = nearby[0]?.group || newGroup(ai, [entity]);
                state.members[entity.id] = { id: entity.id, home: group.id, commander: group.id, phase: "home" };
                group.memberIds.push(entity.id);
            }
        }
        if (Object.hasOwn(options.mapSnapshot || {}, "candidateLines"))
            for (const group of Object.values(ai.groups))
                if (!group.planId && group.memberIds.length === 1 && !state.members[group.memberIds[0]]?.loan) {
                    delete state.members[group.memberIds[0]];
                    delete ai.groups[group.id];
                }
        sync(encounter);
        return ai;
    }

    function positions(_encounter) {
        const actors = KDMapData.Entities.filter((entity) => eligible(entity) && entity.Enemy.name === "Spinner");
        return [
            KinkyDungeonPlayerEntity,
            ...KDMapData.Entities.filter(
                (entity) =>
                    entity.hp > 0 &&
                    !entity.Enemy?.tags?.spiderlings &&
                    !api.SpinnerNativeField.isOwnedProxy(entity) &&
                    actors.some((actor) => KDHostile(actor, entity)),
            ),
        ]
            .filter(Boolean)
            .map((target) => ({
                x: target.x,
                y: target.y,
                target: target.player ? { kind: "player", id: target.id ?? "player" } : { kind: "npc", id: target.id },
                age: 0,
                source: "global-planning",
            }));
    }

    function offers(encounter, target, distances, excludeGroup) {
        const state = ensure(encounter),
            byId = new Map(KDMapData.Entities.map((entity) => [String(entity.id), entity]));
        const result = [],
            reasons = new Set();
        for (const group of Object.values(encounter.ai.groups).filter(
            (entry) => entry.id !== excludeGroup && validGroup(encounter.ai, entry.id),
        )) {
            // This is the donor's release judgment. The global controller may not bypass its reserve.
            const members = group.memberIds.map((id) => byId.get(String(id))).filter(actionable);
            const reserve = projectThreat(encounter, group) ? 2 : pending(encounter, group) ? 1 : 0;
            const candidates = members.filter(
                (entity) =>
                    !protectedMember(entity) &&
                    !state.members[entity.id]?.loan &&
                    state.members[entity.id]?.phase === "home",
            );
            if (members.some(protectedMember) || (reserve > 0 && candidates.length > 0 && candidates.length <= reserve))
                reasons.add("necessary-duty");
            if (members.some((entity) => state.members[entity.id]?.loan || state.members[entity.id]?.phase !== "home"))
                reasons.add("committed");
            const offered = candidates
                .map((entity) => ({ id: entity.id, donor: group.id, steps: distances(entity, target) }))
                .filter((offer) => Number.isFinite(offer.steps))
                .sort((a, b) => a.steps - b.steps || String(a.id).localeCompare(String(b.id)))
                .slice(0, Math.max(0, candidates.length - reserve));
            if (candidates.length && !offered.length) reasons.add("unreachable");
            result.push(...offered);
        }
        return {
            members: result.sort((a, b) => a.steps - b.steps || String(a.id).localeCompare(String(b.id))),
            reason: reasons.has("necessary-duty")
                ? "necessary-duty"
                : reasons.has("committed")
                  ? "committed"
                  : reasons.has("unreachable")
                    ? "unreachable"
                    : "no-members",
        };
    }

    function request(encounter, groupId, kind, count, destination) {
        const state = ensure(encounter),
            key = `${groupId}:${kind}`;
        const previous = state.requests[key];
        state.requests[key] = {
            ...previous,
            id: key,
            fieldId: groupId,
            kind,
            count,
            destination: clone(destination),
            since: previous && !previous.closed ? previous.since : encounter.ai.coordinationTurn || 0,
            closed: false,
        };
        return state.requests[key];
    }

    function dispatch(encounter, requestState, offer, distances) {
        const state = ensure(encounter),
            member = state.members[offer.id];
        const entity = KDMapData.Entities.find((candidate) => same(candidate.id, offer.id));
        const fresh = offers(encounter, requestState.destination, distances, requestState.fieldId);
        if (
            !member ||
            !actionable(entity) ||
            protectedMember(entity) ||
            !fresh.members.some((candidate) => same(candidate.id, offer.id))
        )
            return false;
        Object.assign(member, {
            commander: requestState.fieldId,
            phase: "travelling",
            loan: state.nextLoan++,
            requestId: requestState.id,
            destination: clone(requestState.destination),
            origin: { x: entity.x, y: entity.y },
        });
        encounter.ai.groups[requestState.fieldId].incomingIds = [
            ...new Set([...(encounter.ai.groups[requestState.fieldId].incomingIds || []), offer.id]),
        ];
        sync(encounter);
        return true;
    }

    function allocate(encounter, distances) {
        const state = ensure(encounter);
        const priority = { defense: 0, capture: 0, recovery: 0, repair: 1, build: 2 };
        const waiting = Object.values(state.requests)
            .filter((entry) => !entry.closed)
            .map((entry) => ({
                entry,
                steps: offers(encounter, entry.destination, distances, entry.fieldId).members[0]?.steps ?? Infinity,
            }))
            .sort(
                (a, b) =>
                    priority[a.entry.kind] - priority[b.entry.kind] ||
                    a.steps - b.steps ||
                    a.entry.since - b.entry.since ||
                    a.entry.id.localeCompare(b.entry.id),
            );
        for (const { entry } of waiting) {
            if (!validGroup(encounter.ai, entry.fieldId)) {
                entry.closed = true;
                entry.reason = "receiver-invalid";
                continue;
            }
            let deployed = Object.values(state.members).filter(
                (member) =>
                    member.requestId === entry.id && member.commander === entry.fieldId && member.phase !== "returning",
            ).length;
            const supply = offers(encounter, entry.destination, distances, entry.fieldId);
            for (const offer of supply.members) {
                if (deployed >= entry.count) break;
                if (dispatch(encounter, entry, offer, distances)) deployed++;
            }
            entry.deployed = deployed;
            entry.missing = Math.max(0, entry.count - deployed);
            entry.status = entry.missing ? (deployed ? "partial" : "rejected") : "satisfied";
            entry.reason = entry.missing ? offers(encounter, entry.destination, distances, entry.fieldId).reason : null;
        }
        projectOwners(encounter);
    }

    function movingOrder(entity) {
        const encounter = api.SpinnerNativeField.state(),
            state = ensure(encounter);
        if (
            !state ||
            !actionable(entity) ||
            protectedMember(entity) ||
            api.JumperDash?.runtimeController?.snapshot?.().some((entry) => same(entry.sourceId, entity.id))
        )
            return undefined;
        const member = state.members[entity.id];
        return member && ["travelling", "returning"].includes(member.phase) ? member : state.regions[entity.id];
    }

    function handleMove(entity, delta) {
        if (!(delta > 0)) return false;
        const order = movingOrder(entity);
        if (!order?.destination) return false;
        const encounter = api.SpinnerNativeField.state();
        if (Math.max(Math.abs(entity.x - order.destination.x), Math.abs(entity.y - order.destination.y)) <= 2) {
            if (order.phase === "travelling") order.phase = "support";
            else if (order.phase === "returning") {
                order.commander = order.home;
                order.phase = "home";
                delete order.loan;
                delete order.requestId;
                delete order.destination;
            } else delete encounter.command.regions[entity.id];
            sync(encounter);
            projectOwners(encounter);
            return true;
        }
        const path = api.SpinnerAI.dispatchPath(entity, order.destination);
        const next = path.find((cell) => cell.x !== entity.x || cell.y !== entity.y);
        const moved =
            !!next &&
            KinkyDungeonEnemyTryMove(
                entity,
                { x: next.x - entity.x, y: next.y - entity.y },
                delta,
                next.x,
                next.y,
                false,
            );
        order.blocked = !moved;
        return true;
    }

    function reportNest(nest, result) {
        const encounter = api.SpinnerNativeField.state();
        if (!encounter?.command) return;
        const entry = encounter.command.nestRequests?.find((request) => same(request.nestId, nest.id));
        if (entry) Object.assign(entry, result, { turn: encounter.ai.coordinationTurn || 0 });
    }

    function dispatchRegions(encounter, distances) {
        const state = ensure(encounter),
            requests = Object.values(state.requests).filter(
                (entry) => !entry.closed && ["defense", "capture", "recovery"].includes(entry.kind),
            );
        for (const entity of KDMapData.Entities.filter(
            (candidate) => actionable(candidate) && !["Spinner", "NestEntrance"].includes(candidate.Enemy.name),
        )) {
            if (state.regions[entity.id]) continue;
            const choice = requests
                .filter(
                    (entry) =>
                        Math.max(Math.abs(entity.x - entry.destination.x), Math.abs(entity.y - entry.destination.y)) >
                        2,
                )
                .map((entry) => ({ entry, steps: distances(entity, entry.destination) }))
                .filter((entry) => Number.isFinite(entry.steps))
                .sort((a, b) => a.steps - b.steps)[0];
            if (choice)
                state.regions[entity.id] = {
                    fieldId: choice.entry.fieldId,
                    requestId: choice.entry.id,
                    destination: clone(choice.entry.destination),
                };
        }
        state.nestRequests = KDMapData.Entities.filter(
            (entity) => eligible(entity) && entity.Enemy.name === "NestEntrance",
        ).map((nest) => ({
            ...state.nestRequests?.find((entry) => same(entry.nestId, nest.id)),
            nestId: nest.id,
            position: { x: nest.x, y: nest.y },
            demands: Object.values(state.requests)
                .filter((entry) => !entry.closed)
                .map((entry) => entry.id),
        }));
    }

    api.FieldCommand = {
        reconcile,
        ensure,
        newGroup,
        owners,
        projectOwners,
        positions,
        location,
        pending,
        protectedMember,
        offers,
        request,
        allocate,
        dispatchRegions,
        reportNest,
        movingOrder,
        handleMove,
        inspect: () => {
            const state = ensure(api.SpinnerNativeField.state());
            return state ? clone(state) : undefined;
        },
    };
})();
