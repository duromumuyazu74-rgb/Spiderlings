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
        const interception = !source && api.FieldCustody?.targetFor(enemy);
        const dispersing = !source && api.Webbing?.isCocoonDispersing?.(enemy, target);
        const yieldWork =
            !source &&
            !dispersing &&
            (api.SpinnerRecovery?.clearanceFor?.(enemy) || api.SpinnerAI.constructionYield(enemy));
        if (enemy.Enemy?.name !== "Spinner" && !dispersing && !yieldWork && !interception) return undefined;
        const cached = current(enemy);
        if (cached) return cached;
        const group = yieldWork
                ? api.SpinnerNativeField.state()?.ai?.groups[yieldWork.groupId]
                : interception
                  ? api.SpinnerNativeField.state()?.ai?.groups[api.FieldCustody.state()?.groupId]
                  : groupFor(enemy),
            order = api.FieldCommand.movingOrder(enemy);
        if (!group && !order && !source && !dispersing && !yieldWork && !interception) return undefined;
        let role = "native";
        const work = api.FieldProjects.beginWork(enemy);
        const currentSource = api.FieldCommand.sourceRole(enemy);
        if (currentSource) role = currentSource;
        else if (interception) role = "intercept";
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
            category: role === "intercept" ? "intercept" : role === "yield" ? "yield" : undefined,
            targetId: interception?.id,
            destination: role === "yield" ? yieldWork.destination : undefined,
            resolved: !["native", "work"].includes(role),
            nativeAllowed: role === "native" || role === "intercept",
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
            if (facts.perceivedRecovery || facts.recentRecovery) {
                pursue(facts.perceivedRecovery ? facts.recoveryTarget : facts.recoveryKnown, facts.perceivedRecovery);
                if (facts.perceivedRecovery && adjacent(facts.recoveryTarget)) duty.category = "recovery-contact";
            }
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
            else {
                duty.category = "native-defense";
                duty.handled = true;
            }
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
        // An assigned field member with no executable order holds position.
        // Roaming and target selection belong to the field, not another native AI.
        if (facts.validPlan && duty.role === "native" && duty.category === "delegate-native" && !facts.nestAttacker) {
            duty.role = "wait";
            duty.nativeAllowed = false;
            duty.handled = true;
        }
    }

    function beforeMove(enemy, target, aiData) {
        if (!(enemy.SpiderlingsSpinnerRuntimeDelta > 0)) return false;
        const duty = current(enemy);
        if (!duty) return false;
        if (duty.role === "intercept") {
            if (duty.executed) return true;
            const intruder = api.FieldCustody?.targetFor(enemy);
            duty.executed = true;
            if (!intruder || intruder !== target) {
                duty.nativeAllowed = false;
                return true;
            }
            const range = Math.max(1, enemy.Enemy.followRange || 1);
            if (Math.max(Math.abs(enemy.x - target.x), Math.abs(enemy.y - target.y)) > range) {
                duty.nativeAllowed = false;
                duty.result = api.SpinnerAI.executeTacticalDuty(enemy, {
                    groupId: duty.groupId,
                    category: "intercept",
                    destination: target,
                });
                recordResult(enemy, duty.result);
            }
            aiData.idle = false;
            return true;
        }
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
        if (duty?.role === "intercept") {
            const target = api.FieldCustody?.targetFor(enemy);
            return duty.nativeAllowed && target && String(target.id) === String(duty.targetId) ? true : false;
        }
        return !duty || (["native", "intercept"].includes(duty.role) && duty.nativeAllowed);
    }

    function admitNative(enemy, target, data) {
        const duty = current(enemy);
        if (
            !duty?.nativeAllowed ||
            !(enemy.SpiderlingsSpinnerRuntimeDelta > 0) ||
            !data?.canSensePlayer ||
            data.hostile !== true
        )
            return;
        const interception = duty.role === "intercept" && api.FieldCustody?.targetFor(enemy) === target;
        const contact = duty.category === "recovery-contact" && api.SpinnerRecovery?.wantsPursuit(enemy, target);
        if (!interception && !contact) return;
        // Native ignore-tied-up is an autonomous policy. An approved field contact
        // still uses native attack credit, warnings, detection, hit and costs.
        data.ignore = false;
        data.wantsToAttack = true;
        if (interception) {
            // KD also derives these ranged policies from the player's equipment,
            // even when this action targets the competing NPC escort.
            data.harmless = false;
            data.ignoreRanged = false;
            data.wantsToCast = true;
        }
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
        admitNative,
        current,
        restore,
        allowsBeforeMove: (enemy) => current(enemy)?.nativeBeforeMove !== false,
    };
})();
