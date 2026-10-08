"use strict";

// One action decision is shared by the enemy loop and every native movement/attack/spell phase.
(() => {
    const api = globalThis.Spiderlings;
    let map,
        tick,
        decisions = new Map(),
        nextAction = 0;

    function current(enemy) {
        if (map !== KDMapData || tick !== KinkyDungeonCurrentTick) {
            map = KDMapData;
            tick = KinkyDungeonCurrentTick;
            decisions = new Map();
        }
        const duty = decisions.get(String(enemy.id));
        if (duty) {
            const member = api.FieldCommand.ensure(api.SpinnerNativeField.state())?.members[enemy.id];
            const encounter = api.SpinnerNativeField.state();
            const invalidTask =
                !api.FieldCommand.protectedMember(enemy) &&
                (encounter?.ai?.groups[member?.commander]?.cancelled ||
                    (member?.phase !== "returning" &&
                        member?.requestId &&
                        encounter?.command?.requests[member.requestId]?.closed));
            if (
                invalidTask ||
                duty.commander !== member?.commander ||
                duty.loan !== member?.loan ||
                duty.requestId !== member?.requestId ||
                duty.phase !== member?.phase ||
                duty.planId !== encounter?.ai?.groups[duty.groupId]?.planId ||
                (!duty.executed &&
                    duty.role === "work" &&
                    duty.task !== JSON.stringify(api.FieldProjects.workFor(enemy)))
            ) {
                duty.role = "wait";
                duty.executed = true;
                duty.handled = true;
                duty.nativeAllowed = false;
            }
        }
        return duty;
    }

    function groupFor(enemy) {
        const encounter = api.SpinnerNativeField.state();
        const member = api.FieldCommand.ensure(encounter)?.members[enemy.id];
        return encounter?.ai?.groups[member?.commander];
    }

    function prepare(enemy, target, delta) {
        if (!(delta > 0)) return undefined;
        const source = api.FieldCommand.sourceRole(enemy);
        const dispersing = !source && api.Webbing?.isCocoonDispersing?.(enemy, target);
        const yieldWork = !source && !dispersing && api.SpinnerAI.constructionYield(enemy);
        if (enemy.Enemy?.name !== "Spinner" && !dispersing && !yieldWork) return undefined;
        const cached = current(enemy);
        if (cached) return cached;
        const group = yieldWork ? api.SpinnerNativeField.state()?.ai?.groups[yieldWork.groupId] : groupFor(enemy),
            order = api.FieldCommand.movingOrder(enemy);
        if (!group && !order && !source && !dispersing && !yieldWork) return undefined;
        let role = "native";
        const work = api.FieldProjects.beginWork(enemy);
        const currentSource = api.FieldCommand.sourceRole(enemy);
        if (currentSource) role = currentSource;
        else if (dispersing) role = "disperse";
        else if (yieldWork) role = "yield";
        else if (order) role = "dispatch";
        else if (
            api.HuntingGrounds?.isNestAttacker?.(enemy, target) ||
            enemy.SpiderlingsTaskNestDefenderTarget !== undefined ||
            api.SpinnerRecovery?.wantsPursuit?.(enemy, KinkyDungeonPlayerEntity) ||
            api.SpinnerNPCRecovery?.wantsPursuit?.(enemy, target)
        )
            role = "native";
        else if (api.SpinnerAI.hasMaintenanceAssignment(enemy)) role = "work";
        else if (work?.type !== "rally" && work) {
            const adjacent = target && Math.max(Math.abs(enemy.x - target.x), Math.abs(enemy.y - target.y)) <= 1;
            const threat =
                enemy.aware &&
                adjacent &&
                (target.player || (!KinkyDungeonIsDisabled(target) && !KDHelpless(target))) &&
                (!target.player || globalThis.KinkyDungeonTrackSneak?.({ ...enemy }, 0, target) >= 0.5);
            if (!threat) role = "work";
        }
        const member = api.FieldCommand.ensure(api.SpinnerNativeField.state())?.members[enemy.id];
        const decision = {
            actionId: ++nextAction,
            commander: member?.commander,
            loan: member?.loan,
            requestId: member?.requestId,
            phase: member?.phase,
            role,
            groupId: group?.id,
            planId: group?.planId,
            origin: { x: enemy.x, y: enemy.y },
            task: role === "work" ? JSON.stringify(work) : undefined,
            assignment: role === "work" ? work : undefined,
            category: role === "yield" ? "yield" : undefined,
            destination: role === "yield" ? yieldWork.destination : undefined,
            resolved: !["native", "work"].includes(role),
            nativeAllowed: role === "native",
            nativeBeforeMove: role !== "disperse",
            executed: false,
        };
        decisions.set(String(enemy.id), decision);
        return decision;
    }

    function beginAction(enemy, target, delta) {
        if (!(delta > 0)) return undefined;
        const previous = current(enemy);
        if (previous?.executed && previous.role === "work") api.SpinnerAI.refreshWork(enemy);
        decisions.delete(String(enemy.id));
        return prepare(enemy, target, delta);
    }

    function recordResult(enemy, result) {
        const duty = decisions.get(String(enemy.id));
        if (!duty || duty.resultRecorded) return;
        duty.executed = true;
        duty.result = result;
        duty.resultRecorded = true;
        api.FieldProjects?.recordOutcome?.(duty, enemy);
    }

    function allows(enemy, handler) {
        const duty = current(enemy);
        return !duty || duty.role === "native" || duty.role === handler;
    }

    function resolve(duty, enemy, target, aiData) {
        const facts = api.SpinnerAI.dutyFacts(enemy, target, aiData);
        duty.resolved = true;
        duty.role = "native";
        duty.nativeAllowed = true;
        duty.category = "delegate-native";
        duty.handled = false;
        if (!facts) return;
        const adjacent = (destination) =>
            destination && Math.max(Math.abs(enemy.x - destination.x), Math.abs(enemy.y - destination.y)) <= 1;
        const pursue = (destination, perceived) => {
            if (!destination) return;
            if (adjacent(destination)) {
                duty.category = perceived ? "native-defense" : "delegate-native";
                duty.handled = !!perceived;
                return;
            }
            duty.category = "pursuit";
            duty.destination = { x: destination.x, y: destination.y };
            duty.nativeAllowed = false;
            duty.handled = true;
        };
        const work = () => {
            duty.role = "work";
            duty.assignment = JSON.parse(JSON.stringify(facts.assignment));
            duty.task = JSON.stringify(facts.assignment);
            duty.nativeAllowed = false;
            duty.handled = true;
        };
        if (facts.recoveryPursuit) {
            if (facts.perceivedRecovery || facts.recentRecovery)
                pursue(facts.perceivedRecovery ? facts.recoveryTarget : facts.recoveryKnown, facts.perceivedRecovery);
        } else if (!facts.validPlan || facts.nestAttacker) {
            duty.category = facts.nestAttacker ? "crew" : "delegate-native";
        } else if (
            facts.maintenance ||
            facts.gateWork ||
            facts.bodyWorker ||
            facts.coreRally ||
            (facts.soleBuilder && facts.assignment && facts.assignment.type !== "rally")
        )
            work();
        else if (facts.observed && facts.targetInCore) {
            if (!adjacent(target)) pursue(target, facts.perceivedThreat);
        } else if (facts.lure) pursue(facts.perceivedThreat ? target : facts.known, facts.perceivedThreat);
        else if (facts.perceivedThreat && adjacent(target)) {
            duty.category = "native-defense";
            duty.handled = true;
        } else if (!facts.engaged && facts.perceivedThreat && facts.ordinary) {
            duty.category = "delegate-native";
        } else if (facts.assignment) work();
        else if (facts.yieldCell) {
            duty.category = "yield";
            duty.destination = facts.yieldCell;
            duty.nativeAllowed = false;
            duty.handled = true;
        }
    }

    function beforeMove(enemy, target, aiData) {
        if (!(enemy.SpiderlingsSpinnerRuntimeDelta > 0)) return false;
        const duty = current(enemy);
        if (!duty) return false;
        if (duty.executed) {
            if (duty.handled !== false) aiData.idle = false;
            return duty.handled !== false;
        }
        if (!duty.resolved) resolve(duty, enemy, target, aiData);
        else api.SpinnerAI.observeDuty(enemy, target, aiData);
        duty.executed = true;
        if (duty.role === "disperse") {
            const result = api.Webbing.disperseCocoonEnemy(enemy, target, aiData);
            duty.handled = result === true;
            recordResult(enemy, result);
            return duty.handled;
        }
        if (duty.role === "dispatch")
            duty.result = api.FieldCommand.handleMove(enemy, enemy.SpiderlingsSpinnerRuntimeDelta);
        else if (duty.role === "work") {
            duty.workStart = api.SpinnerNativeField.state()?.topology?.actionLog?.length || 0;
            duty.result = api.SpinnerAI.executeDuty(enemy, duty.groupId, duty.assignment);
        } else if (["pursuit", "yield"].includes(duty.category))
            duty.result = api.SpinnerAI.executeTacticalDuty(enemy, duty);
        else if (duty.category === "crew") duty.handled = !!api.HuntingGrounds?.handleCrewMove?.(enemy, target, aiData);
        recordResult(enemy, duty.result);
        if (duty.handled !== false) aiData.idle = false;
        return duty.handled !== false;
    }

    function gate(enemy) {
        const duty = current(enemy);
        return !duty || (duty.role === "native" && duty.nativeAllowed);
    }

    function restore() {
        map = undefined;
        tick = undefined;
        decisions = new Map();
    }

    api.SpinnerDuties = {
        prepare,
        beginAction,
        recordResult,
        allows,
        beforeMove,
        gate,
        current,
        restore,
        allowsBeforeMove: (enemy) => current(enemy)?.nativeBeforeMove !== false,
    };
})();
