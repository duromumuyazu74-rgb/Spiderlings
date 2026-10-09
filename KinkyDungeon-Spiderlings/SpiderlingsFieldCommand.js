"use strict";

// The map-local controller owns commitments; field owners never reconstruct command after migration.
(() => {
    const api = globalThis.Spiderlings;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const same = (a, b) => String(a) === String(b);
    const species = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings", "NestEntrance"]);
    const priority = {
        residency: 0,
        defense: 0,
        capture: 0,
        recovery: 0,
        custody: 0,
        repair: 1,
        build: 2,
        readiness: 2,
    };

    function compareDemand(a, b) {
        return (
            Number(b.kind === "residency") - Number(a.kind === "residency") ||
            (b.urgency || 0) - (a.urgency || 0) ||
            priority[a.kind] - priority[b.kind]
        );
    }

    function groupDemand(encounter, group) {
        const plan = encounter.ai.plans[group.planId];
        const needs = api.SpinnerTopology.fieldWorkNeeds(encounter.topology, plan?.fieldIds || [plan?.fieldId]);
        return [
            { kind: needs.repair ? "repair" : "build", urgency: plan?.urgency || 0 },
            ...Object.values(ensure(encounter).requests).filter(
                (entry) =>
                    !entry.closed &&
                    entry.fieldId === group.id &&
                    entry.count > 0 &&
                    (entry.kind !== "residency" || requestStaffing(encounter, entry).committed < entry.count),
            ),
        ].sort(compareDemand)[0];
    }

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

    function servesRequest(entity, entry, encounter = api.SpinnerNativeField.state()) {
        if (!actionable(entity)) return false;
        if (entry.kind === "residency") {
            const member = ensure(encounter).members[entity.id];
            return (
                member?.home === entry.fieldId &&
                ((member.commander === entry.fieldId && !member.loan) || member.phase === "returning")
            );
        }
        if (!protectedMember(entity)) return true;
        if (entry.kind === "custody")
            return (
                api.FieldCustody?.ownsGroup(entry.fieldId) &&
                ensure(encounter).members[entity.id]?.commander === entry.fieldId
            );
        const group = encounter?.ai?.groups[entry.fieldId];
        const plan = encounter?.ai?.plans[group?.planId];
        const target = entry.target || group?.engagement?.target;
        if (!target) return false;
        if (entry.kind === "defense")
            return target.kind === "npc" && same(entity.SpiderlingsTaskNestDefenderTarget, target.id);
        if (!plan?.compositeId) return false;
        const belongs = (record) => same(record?.compositeId || record?.admittedCompositeId, plan.compositeId);
        const hasSource = (record) => record?.sourceIds?.some((id) => same(id, entity.id));
        const recoverySource = (record) =>
            Object.values(record?.sources || {}).find((source) => same(source.id, entity.id));
        if (entry.kind === "capture") {
            if (target.kind === "player") {
                const capture = api.SpinnerCapture?.state?.();
                return belongs(capture) && hasSource(capture);
            }
            return Object.values(api.SpinnerNPCCapture?.records?.() || {}).some(
                (record) => same(record.targetId, target.id) && belongs(record) && hasSource(record),
            );
        }
        if (entry.kind === "recovery") {
            if (target.kind === "player") {
                const recovery = api.SpinnerRecovery?.state?.();
                const source = recoverySource(recovery);
                return !!source && belongs(source);
            }
            return Object.values(api.SpinnerNPCRecovery?.records?.() || {}).some(
                (record) => same(record.targetId, target.id) && belongs(recoverySource(record)),
            );
        }
        return false;
    }

    function requestMembers(encounter, entry) {
        if (entry.kind === "residency")
            return Object.values(ensure(encounter).members).filter(
                (member) =>
                    member.home === entry.fieldId &&
                    ((member.commander === entry.fieldId && !member.loan && member.phase !== "returning") ||
                        member.phase === "returning"),
            );
        return Object.values(ensure(encounter).members).filter(
            (member) =>
                member.requestId === entry.id && member.commander === entry.fieldId && member.phase !== "returning",
        );
    }

    function requestStaffing(encounter, entry) {
        const deployed = requestMembers(encounter, entry).filter(
            (member) =>
                entry.kind !== "residency" || eligible(KDMapData.Entities.find((entity) => same(entity.id, member.id))),
        );
        const entityFor = (member) => KDMapData.Entities.find((entity) => same(entity.id, member.id));
        const present = (member) => member.phase !== "returning" && atSite(entityFor(member), entry.fieldId, encounter);
        const capable = deployed.filter((member) => servesRequest(entityFor(member), entry, encounter));
        return {
            deployed: deployed.length,
            arrived: deployed.filter(present).length,
            usable: capable.filter((member) => present(member) && !member.blocked).length,
            incoming: capable.filter(
                (member) =>
                    !present(member) &&
                    !member.blocked &&
                    (entry.kind !== "residency" || ["travelling", "returning"].includes(member.phase)),
            ).length,
            ...(entry.kind === "residency"
                ? { away: capable.filter((member) => !present(member) && member.phase === "home").length }
                : {}),
            blocked: deployed.filter((member) => member.blocked).length,
            // A brief blockage keeps its promise; sustained failure is released by reassessment.
            committed: capable.filter((member) => !(member.blockedTurns >= 8)).length,
        };
    }

    function validGroup(ai, id) {
        const group = ai.groups[id],
            plan = ai.plans[group?.planId];
        return !!group && !group.cancelled && (!plan || !["invalid", "abandoned", "retired"].includes(plan.status));
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
            metrics: { travel: 0, construction: 0, wait: 0, yield: 0, repair: 0 },
        };
        return api.FieldProjects?.enrollCrew(ai.groups[id]) || ai.groups[id];
    }

    function sourceRole(entity) {
        const id = entity?.id;
        if (api.SpinnerRecovery?.sourceIds?.().some((source) => same(source, id))) return "recovery";
        if (api.SpinnerCapture?.state?.()?.sourceIds?.some((source) => same(source, id))) return "capture";
        if (api.SpinnerNPCCapture?.usesSource?.(id)) return "npcCapture";
        if (api.SpinnerNPCRecovery?.usesEntity?.(id)) return "npcRecovery";
        return undefined;
    }

    function protectedMember(entity) {
        return !!(
            sourceRole(entity) ||
            entity?.SpiderlingsTaskNestDefenderTarget !== undefined ||
            api.FieldCustody?.assigned(entity) ||
            KDMapData.Entities.some((target) => api.SpinnerNPCRecovery?.wantsPursuit?.(entity, target))
        );
    }

    function location(encounter, group) {
        const plan = encounter.ai.plans[group?.planId];
        if (plan?.center) return plan.center;
        if (plan?.anchors?.length) return plan.anchors[0];
        return KDMapData.Entities.find((entity) => group?.memberIds.some((id) => same(id, entity.id)));
    }

    function atSite(entity, groupId, encounter = api.SpinnerNativeField.state()) {
        if (!entity || !encounter?.ai) return false;
        const group = encounter.ai.groups[groupId];
        const plan = encounter.ai.plans[group?.planId];
        const graph = encounter.topology;
        const outerId = graph?.composites?.[plan?.compositeId]?.layerIds.at(-1);
        const outer = graph?.fields?.[outerId];
        const distance = (point) => Math.max(Math.abs(point.x - entity.x), Math.abs(point.y - entity.y));
        if (outer)
            return (
                api.SpinnerTopology.containsDeclaredField(graph, outerId, entity) ||
                outer.boundaryCells.some((cell) => distance(cell) <= 1)
            );
        const origin =
            plan?.center ||
            plan?.anchors?.[0] ||
            Object.values(ensure(encounter).requests).find((entry) => !entry.closed && entry.fieldId === groupId)
                ?.destination;
        return !!origin && distance(origin) <= 3;
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
        if (api.FieldCustody?.ownsGroup(group?.id)) return true;
        const plan = encounter.ai.plans[group?.planId];
        return (
            !!plan?.compositeId &&
            positions(encounter).some((target) =>
                api.SpinnerTopology.isInsideCommonCore(encounter.topology, plan.compositeId, target),
            )
        );
    }

    function minimumResidents(encounter, group) {
        if (!group || !validGroup(encounter.ai, group.id)) return 0;
        const plan = encounter.ai.plans[group.planId];
        const layers = encounter.topology?.composites?.[plan?.compositeId]?.layerIds || [];
        const count = layers.filter((id) => {
            const field = encounter.topology.fields[id];
            return field && !field.retired && field.nativeTerrainValid !== false;
        }).length;
        return (count * (count + 1)) / 2;
    }

    function residency(encounter, groupId) {
        const minimum = minimumResidents(encounter, encounter.ai.groups[groupId]);
        const staffing = requestStaffing(encounter, {
            id: groupId + ":residency",
            fieldId: groupId,
            kind: "residency",
        });
        return {
            minimum,
            ...staffing,
            missing: Math.max(0, minimum - staffing.usable),
            unassigned: Math.max(0, minimum - staffing.committed),
        };
    }

    function residencyPending(encounter) {
        return Object.values(encounter.ai.groups).some((group) => residency(encounter, group.id).unassigned > 0);
    }

    function releaseResident(encounter, group, entity, reserved = 0) {
        const minimum = minimumResidents(encounter, group);
        if (!minimum) return true;
        const member = ensure(encounter).members[entity?.id];
        const counted =
            member?.home === group?.id &&
            ((member.commander === group.id && !member.loan) || member.phase === "returning");
        return residency(encounter, group.id).committed - Number(counted) - reserved >= minimum;
    }

    function settleResident(member) {
        member.home = member.commander;
        member.phase = "home";
        for (const key of ["loan", "requestId", "destination", "origin", "reason"]) delete member[key];
        member.blocked = false;
        member.blockedTurns = 0;
    }

    function retainResident(encounter, member) {
        const entity = KDMapData.Entities.find((actor) => same(actor.id, member.id));
        const group = encounter.ai.groups[member.commander];
        if (
            !actionable(entity) ||
            !group ||
            !atSite(entity, group.id, encounter) ||
            !minimumResidents(encounter, group) ||
            residency(encounter, group.id).committed >= minimumResidents(encounter, group)
        )
            return false;
        settleResident(member);
        return true;
    }

    function residencyDemands(encounter) {
        const state = ensure(encounter);
        for (const group of Object.values(encounter.ai.groups)) {
            const minimum = minimumResidents(encounter, group),
                destination = location(encounter, group);
            if (!minimum || !destination) {
                if (state.requests[group.id + ":residency"]) state.requests[group.id + ":residency"].closed = true;
                continue;
            }
            request(encounter, group.id, "residency", minimum, destination, { urgency: 2 });
        }
    }

    function reserve(encounter, group, minimum = false) {
        if (projectThreat(encounter, group))
            return Math.max(2, pending(encounter, group) ? encounter.ai.plans[group.planId]?.workforceTarget || 1 : 0);
        if (!pending(encounter, group)) return 0;
        return minimum ? 1 : Math.max(1, encounter.ai.plans[group?.planId]?.workforceTarget || 1);
    }

    function sync(encounter) {
        const state = ensure(encounter),
            ai = encounter.ai;
        for (const group of Object.values(ai.groups)) {
            group.memberIds = Object.values(state.members)
                .filter((member) => member.commander === group.id && member.phase !== "returning")
                .map((member) => member.id)
                .sort((a, b) => String(a).localeCompare(String(b)));
        }
        api.FieldProjects?.reconcileCrew(encounter);
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
            if (member.phase === "travelling" && protectedMember(entity)) {
                if (
                    state.requests[member.requestId]?.kind === "residency" &&
                    member.home === member.commander &&
                    !member.loan
                )
                    settleResident(member);
                else returnMember(encounter, member, "protected-duty");
            }
            if (member.phase === "travelling" && state.requests[member.requestId]?.closed) {
                if (
                    state.requests[member.requestId].kind === "residency" &&
                    member.home === member.commander &&
                    !member.loan
                )
                    settleResident(member);
                else returnMember(encounter, member, "request-complete");
            }
            if (member.phase === "support" && !protectedMember(entity)) {
                const request = state.requests[member.requestId];
                if (
                    !request ||
                    request.closed ||
                    (!pending(encounter, ai.groups[member.commander]) &&
                        !projectThreat(encounter, ai.groups[member.commander]))
                )
                    if (!retainResident(encounter, member)) returnMember(encounter, member, "support-complete");
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

    function offers(encounter, target, distances, excludeGroup, kind = "build", options = {}) {
        const state = ensure(encounter),
            byId = new Map(KDMapData.Entities.map((entity) => [String(entity.id), entity]));
        const result = [],
            reasons = new Set();
        for (const group of Object.values(encounter.ai.groups).filter(
            (entry) => entry.id !== excludeGroup && validGroup(encounter.ai, entry.id),
        )) {
            // This is the donor's release judgment. The global controller may not bypass its reserve.
            const residents = group.memberIds.map((id) => byId.get(String(id))).filter(Boolean);
            const members = residents.filter(actionable);
            const demand = groupDemand(encounter, group);
            const pauseBackground =
                options.urgency > 0 &&
                !demand.urgency &&
                !residents.some(protectedMember) &&
                !projectThreat(encounter, group);
            const retained =
                kind === "residency" || pauseBackground
                    ? 0
                    : reserve(encounter, group, compareDemand({ kind, ...options }, demand) < 0);
            const candidates = members.filter((entity) => {
                const member = state.members[entity.id];
                const current = state.requests[member?.requestId];
                return (
                    !protectedMember(entity) &&
                    ((!member?.loan && member?.phase === "home") ||
                        (member?.loan &&
                            ["travelling", "support"].includes(member.phase) &&
                            current &&
                            (current.closed || compareDemand({ kind, ...options }, current) < 0)))
                );
            });
            if (
                members.some(protectedMember) ||
                (retained > 0 && candidates.length > 0 && candidates.length <= retained)
            )
                reasons.add("necessary-duty");
            if (members.some((entity) => state.members[entity.id]?.loan || state.members[entity.id]?.phase !== "home"))
                reasons.add("committed");
            let reservedResidents = 0;
            const offered = candidates
                .map((entity) => ({ id: entity.id, donor: group.id, steps: distances(entity, target) }))
                .filter((offer) => Number.isFinite(offer.steps))
                .sort((a, b) => a.steps - b.steps || String(a.id).localeCompare(String(b.id)))
                .slice(0, Math.max(0, candidates.length - retained))
                .filter((offer) => {
                    const entity = byId.get(String(offer.id));
                    if (!releaseResident(encounter, group, entity, reservedResidents)) return false;
                    const member = state.members[entity.id];
                    if (member.home === group.id && !member.loan) reservedResidents++;
                    return true;
                });
            if (candidates.length && !offered.length) reasons.add("unreachable");
            result.push(...offered);
        }
        for (const member of Object.values(state.members).filter((entry) => entry.phase === "returning")) {
            const entity = byId.get(String(member.id));
            const current = state.requests[member.requestId];
            const home = encounter.ai.groups[member.home];
            if (
                !actionable(entity) ||
                protectedMember(entity) ||
                member.home === excludeGroup ||
                (current && !current.closed && compareDemand({ kind, ...options }, current) >= 0) ||
                (home &&
                    (!releaseResident(encounter, home, entity) ||
                        compareDemand({ kind, ...options }, groupDemand(encounter, home)) >= 0))
            )
                continue;
            const steps = distances(entity, target);
            if (Number.isFinite(steps)) result.push({ id: member.id, donor: member.home, steps });
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

    function request(encounter, groupId, kind, count, destination, options = {}) {
        const state = ensure(encounter),
            key = `${groupId}:${kind}`;
        const previous = state.requests[key];
        state.requests[key] = {
            ...previous,
            id: key,
            fieldId: groupId,
            kind,
            urgency: Math.max(0, Math.min(2, Math.floor(options.urgency || 0))),
            target: options.target ? clone(options.target) : undefined,
            count,
            destination: clone(destination),
            since: previous && !previous.closed ? previous.since : encounter.ai.coordinationTurn || 0,
            closed: false,
        };
        if (compareDemand(state.requests[key], previous || { kind }) < 0) delete state.requests[key].retryAfter;
        return state.requests[key];
    }

    function reviseDemands(encounter, groupId, demands, destination, options = {}) {
        const state = ensure(encounter);
        for (const entry of Object.values(state.requests))
            if (
                entry.fieldId === groupId &&
                !(demands.get(entry.kind) > 0) &&
                !(entry.kind === "custody" && api.FieldCustody?.ownsGroup(groupId)) &&
                !(entry.kind === "residency" && minimumResidents(encounter, encounter.ai.groups[groupId]))
            )
                entry.closed = true;
        for (const [kind, count] of demands)
            if (count > 0) request(encounter, groupId, kind, count, destination, options);
    }

    function endProjectSupport(encounter, groupId) {
        reviseDemands(encounter, groupId, new Map());
    }

    function adoptCustodyCrew(encounter, groupId) {
        const state = ensure(encounter),
            group = encounter?.ai?.groups[groupId];
        if (!state || !group || !api.FieldCustody?.ownsGroup(groupId)) return;
        const destination = location(encounter, group);
        if (!destination) return;
        const id = `${groupId}:custody`;
        for (const entity of KDMapData.Entities) {
            const member = state.members[entity.id];
            if (
                !member ||
                member.commander === groupId ||
                entity.Enemy?.name !== "Spinner" ||
                !actionable(entity) ||
                sourceRole(entity) ||
                entity.SpiderlingsTaskNestDefenderTarget !== undefined ||
                !atSite(entity, groupId, encounter)
            )
                continue;
            const donor = encounter.ai.groups[member.commander || member.home];
            if (donor && (pending(encounter, donor) || !releaseResident(encounter, donor, entity))) continue;
            Object.assign(member, {
                commander: groupId,
                phase: "support",
                requestId: id,
                loan: member.loan || state.nextLoan++,
                origin: member.loan ? member.origin : { x: entity.x, y: entity.y },
                destination: clone(destination),
                blocked: false,
                blockedTurns: 0,
            });
        }
        const count = Object.values(state.members).filter((m) => m.commander === groupId && m.requestId === id).length;
        if (count)
            request(encounter, groupId, "custody", count, destination, {
                urgency: 2,
                target: { kind: "player", id: KinkyDungeonPlayerEntity.id },
            });
        sync(encounter);
    }

    function dispatch(encounter, requestState, offer, distances) {
        const state = ensure(encounter),
            member = state.members[offer.id];
        const entity = KDMapData.Entities.find((candidate) => same(candidate.id, offer.id));
        const fresh = offers(
            encounter,
            requestState.destination,
            distances,
            requestState.fieldId,
            requestState.kind,
            requestState,
        );
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
            origin: member.loan ? member.origin : { x: entity.x, y: entity.y },
            blocked: false,
            blockedTurns: 0,
        });
        if (requestState.kind === "residency") {
            member.home = requestState.fieldId;
            delete member.loan;
        }
        encounter.ai.groups[requestState.fieldId].incomingIds = [
            ...new Set([...(encounter.ai.groups[requestState.fieldId].incomingIds || []), offer.id]),
        ];
        sync(encounter);
        return true;
    }

    function reassess(encounter) {
        const state = ensure(encounter),
            now = encounter.ai.coordinationTurn || 0,
            entityFor = (member) => KDMapData.Entities.find((entity) => same(entity.id, member.id)),
            loans = () => Object.values(state.members).filter((member) => member.loan && member.phase !== "returning");
        for (const requestState of Object.values(state.requests).filter((entry) => !entry.closed)) {
            const deployed = loans().filter(
                (member) =>
                    member.requestId === requestState.id && servesRequest(entityFor(member), requestState, encounter),
            );
            let extra = Math.max(0, deployed.length - requestState.count);
            for (const member of deployed.sort((a, b) => String(b.id).localeCompare(String(a.id))))
                if (extra && !protectedMember(entityFor(member))) {
                    if (!retainResident(encounter, member)) returnMember(encounter, member, "demand-reduced");
                    extra--;
                }
        }
        sync(encounter);
        for (const member of loans()) {
            const entity = entityFor(member),
                requestState = state.requests[member.requestId],
                receiver = encounter.ai.groups[member.commander];
            if (!entity || protectedMember(entity) || !requestState || requestState.closed) continue;
            const homeUrgent = Object.values(state.requests).some(
                (entry) =>
                    !entry.closed &&
                    entry.count >
                        (entry.kind === "residency"
                            ? requestStaffing(encounter, entry).committed
                            : Object.values(state.members).filter(
                                  (candidate) =>
                                      (candidate.requestId === entry.id && candidate.phase !== "returning") ||
                                      (candidate.home === member.home && candidate.phase === "returning"),
                              ).length) &&
                    entry.fieldId === member.home &&
                    compareDemand(entry, requestState) < 0,
            );
            const retained = receiver.memberIds
                .filter((id) => !same(id, member.id))
                .map((id) => KDMapData.Entities.find((candidate) => same(candidate.id, id)))
                .filter(actionable).length;
            if (homeUrgent && retained >= reserve(encounter, receiver, true)) {
                returnMember(encounter, member, "home-emergency");
                requestState.retryAfter = now + 1;
                sync(encounter);
            } else if (member.phase === "travelling" && member.blockedTurns >= 8) {
                returnMember(encounter, member, "route-blocked");
                requestState.retryAfter = now + (requestState.urgency ? 0 : 8);
                sync(encounter);
            } else if (!actionable(entity)) {
                returnMember(encounter, member, "incapacitated");
                sync(encounter);
            } else if (member.phase === "support" && !atSite(entity, member.commander, encounter)) {
                member.phase = "travelling";
            }
        }
    }

    function continueSupport(encounter) {
        const state = ensure(encounter);
        for (const entry of Object.values(state.requests)
            .filter((request) => !request.closed)
            .sort(compareDemand)) {
            let committed = requestStaffing(encounter, entry).committed;
            for (const member of Object.values(state.members)) {
                if (committed >= entry.count) break;
                const previous = state.requests[member.requestId];
                const entity = KDMapData.Entities.find((candidate) => same(candidate.id, member.id));
                if (
                    !member.loan ||
                    !previous?.closed ||
                    previous.fieldId !== entry.fieldId ||
                    !servesRequest(entity, entry, encounter) ||
                    !(
                        member.commander === entry.fieldId ||
                        (member.phase === "returning" &&
                            ["request-complete", "support-complete"].includes(member.reason))
                    )
                )
                    continue;
                if (
                    member.phase === "returning" &&
                    !releaseResident(encounter, encounter.ai.groups[member.home], entity)
                )
                    continue;
                member.commander = entry.fieldId;
                if (entry.kind === "residency") {
                    member.home = entry.fieldId;
                    delete member.loan;
                }
                const destinationChanged =
                    member.destination?.x !== entry.destination.x || member.destination?.y !== entry.destination.y;
                if (member.phase === "returning" || destinationChanged) member.phase = "travelling";
                if (destinationChanged) {
                    member.blocked = false;
                    member.blockedTurns = 0;
                }
                member.requestId = entry.id;
                member.destination = clone(entry.destination);
                delete member.reason;
                committed++;
            }
        }
        sync(encounter);
    }

    function allocate(encounter, distances) {
        const state = ensure(encounter);
        residencyDemands(encounter);
        continueSupport(encounter);
        reassess(encounter);
        // Replanning retains request identity, but every order must follow its current destination.
        for (const order of [...Object.values(state.members), ...Object.values(state.regions)]) {
            const requestState = state.requests[order.requestId];
            if (!requestState || requestState.closed || order.phase === "returning") continue;
            if (!validGroup(encounter.ai, requestState.fieldId)) continue;
            if (
                order.destination?.x === requestState.destination.x &&
                order.destination?.y === requestState.destination.y
            )
                continue;
            order.destination = clone(requestState.destination);
            order.blocked = false;
            order.blockedTurns = 0;
            if (order.phase === "support") order.phase = "travelling";
        }
        const waiting = Object.values(state.requests)
            .filter((entry) => !entry.closed)
            .map((entry) => ({
                entry,
                steps:
                    offers(encounter, entry.destination, distances, entry.fieldId, entry.kind, entry).members[0]
                        ?.steps ?? Infinity,
            }))
            .sort(
                (a, b) =>
                    compareDemand(a.entry, b.entry) ||
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
            let committed = requestStaffing(encounter, entry).committed;
            const supply = offers(encounter, entry.destination, distances, entry.fieldId, entry.kind, entry);
            for (const offer of supply.members) {
                if (committed >= entry.count) break;
                if (entry.retryAfter > (encounter.ai.coordinationTurn || 0)) break;
                if (dispatch(encounter, entry, offer, distances)) committed++;
            }
        }
        for (const entry of Object.values(state.requests).filter((request) => !request.closed)) {
            const staffing = requestStaffing(encounter, entry);
            Object.assign(entry, staffing);
            entry.missing = Math.max(0, entry.count - staffing.usable - staffing.incoming - (staffing.away || 0));
            entry.status =
                staffing.usable >= entry.count
                    ? "satisfied"
                    : entry.kind === "residency" && staffing.committed >= entry.count && !staffing.incoming
                      ? "assigned"
                      : staffing.blocked
                        ? "blocked"
                        : staffing.incoming
                          ? "travelling"
                          : staffing.usable
                            ? "partial"
                            : "rejected";
            entry.reason = entry.missing
                ? offers(encounter, entry.destination, distances, entry.fieldId, entry.kind, entry).reason
                : null;
            if (entry.retryAfter > (encounter.ai.coordinationTurn || 0)) {
                entry.status = "waiting";
                entry.reason = "reassessment";
            }
        }
        projectOwners(encounter);
    }

    function canYield(entity) {
        return (
            actionable(entity) &&
            !protectedMember(entity) &&
            !api.JumperDash?.runtimeController?.snapshot?.().some((entry) => same(entry.sourceId, entity.id))
        );
    }

    function movingOrder(entity) {
        const encounter = api.SpinnerNativeField.state(),
            state = ensure(encounter);
        if (!state || !canYield(entity)) return undefined;
        const member = state.members[entity.id];
        if (
            member?.phase === "travelling" &&
            state.requests[member.requestId]?.kind === "residency" &&
            atSite(entity, member.commander, encounter)
        ) {
            settleResident(member);
            sync(encounter);
            projectOwners(encounter);
        }
        return member && ["travelling", "returning"].includes(member.phase) ? member : state.regions[entity.id];
    }

    function handleMove(entity, delta) {
        if (!(delta > 0)) return false;
        const order = movingOrder(entity);
        if (!order?.destination) return false;
        const encounter = api.SpinnerNativeField.state();
        const residentOrder = encounter.command.requests[order.requestId]?.kind === "residency";
        if (
            residentOrder
                ? atSite(entity, order.commander, encounter)
                : Math.max(Math.abs(entity.x - order.destination.x), Math.abs(entity.y - order.destination.y)) <= 2
        ) {
            order.blocked = false;
            order.blockedTurns = 0;
            if (order.phase === "travelling" && residentOrder) settleResident(order);
            else if (order.phase === "travelling") order.phase = "support";
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
        const credit = entity.movePoints || 0;
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
        // Native movement can return false while accumulating credit (binding, slow or buffs).
        // A legal step waiting for that credit is not a failed route.
        const awaitingCredit = next && !moved && (entity.movePoints || 0) > credit;
        order.blocked = !moved && !awaitingCredit;
        order.blockedTurns = order.blocked ? (order.blockedTurns || 0) + 1 : 0;
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
        residency,
        residencyPending,
        canYield,
        adoptCustodyCrew,
        reconcile,
        ensure,
        newGroup,
        owners,
        projectOwners,
        positions,
        location,
        atSite,
        pending,
        protectedMember,
        sourceRole,
        servesRequest,
        offers,
        request,
        reviseDemands,
        endProjectSupport,
        allocate,
        dispatchRegions,
        reportNest,
        movingOrder,
        handleMove,
        spinnerCount: () =>
            KDMapData.Entities.filter((entity) => eligible(entity) && entity.Enemy.name === "Spinner").length,
        inspect: () => {
            const state = ensure(api.SpinnerNativeField.state());
            return state
                ? {
                      ...clone(state),
                      residency: Object.fromEntries(
                          Object.keys(api.SpinnerNativeField.state().ai.groups).map((id) => [
                              id,
                              residency(api.SpinnerNativeField.state(), id),
                          ]),
                      ),
                  }
                : undefined;
        },
    };
})();
