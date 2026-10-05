"use strict";

// One action decision is shared by the enemy loop and every native movement/attack/spell phase.
(() => {
    const api = globalThis.Spiderlings;
    let map,
        tick,
        decisions = new Map();

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
                (encounter.ai.groups[member?.commander]?.cancelled ||
                    (member?.phase !== "returning" &&
                        member?.requestId &&
                        encounter.command.requests[member.requestId]?.closed));
            if (
                invalidTask ||
                duty.commander !== member?.commander ||
                duty.loan !== member?.loan ||
                duty.phase !== member?.phase
            ) {
                duty.role = "wait";
                duty.executed = true;
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
        if (!(delta > 0) || enemy.Enemy?.name !== "Spinner") return undefined;
        const cached = current(enemy);
        if (cached) return cached;
        const group = groupFor(enemy),
            order = api.FieldCommand.movingOrder(enemy);
        if (!group && !order) return undefined;
        let role = "native";
        if (api.SpinnerRecovery?.sourceIds?.().includes(enemy.id)) role = "recovery";
        else if (api.SpinnerCapture?.state?.()?.sourceIds?.includes(enemy.id)) role = "capture";
        else if (api.SpinnerNPCCapture?.usesSource?.(enemy.id)) role = "npcCapture";
        else if (api.SpinnerNPCRecovery?.usesEntity?.(enemy.id)) role = "npcRecovery";
        else if (order) role = "dispatch";
        else if (
            api.HuntingGrounds?.isNestAttacker?.(enemy, target) ||
            enemy.SpiderlingsTaskNestDefenderTarget !== undefined ||
            api.SpinnerRecovery?.wantsPursuit?.(enemy, KinkyDungeonPlayerEntity) ||
            api.SpinnerNPCRecovery?.wantsPursuit?.(enemy, target)
        )
            role = "native";
        else if (api.SpinnerAI.hasMaintenanceAssignment(enemy)) role = "work";
        else if (group?.assignments?.[enemy.id]?.type !== "rally" && group?.assignments?.[enemy.id]) {
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
            commander: member?.commander,
            loan: member?.loan,
            phase: member?.phase,
            role,
            groupId: group?.id,
            assignment: role === "work" ? JSON.parse(JSON.stringify(group.assignments[enemy.id])) : undefined,
            executed: false,
        };
        decisions.set(String(enemy.id), decision);
        return decision;
    }

    function allows(enemy, handler) {
        const duty = current(enemy);
        return !duty || duty.role === "native" || duty.role === handler;
    }

    function beforeMove(enemy, target, aiData) {
        if (!(enemy.SpiderlingsSpinnerRuntimeDelta > 0)) return false;
        const duty = current(enemy);
        if (!duty) return false;
        api.SpinnerAI.observeDuty(enemy, target, aiData);
        if (duty.role === "native") {
            const handled =
                api.HuntingGrounds?.handleCrewMove?.(enemy, target, aiData) ||
                api.SpinnerAI.handleBeforeMove(enemy, target, aiData);
            if (handled) aiData.idle = false;
            return handled;
        }
        if (duty.executed) {
            aiData.idle = false;
            return true;
        }
        duty.executed = true;
        if (duty.role === "dispatch") api.FieldCommand.handleMove(enemy, enemy.SpiderlingsSpinnerRuntimeDelta);
        else if (duty.role === "work") duty.result = api.SpinnerAI.executeDuty(enemy, duty.groupId, duty.assignment);
        aiData.idle = false;
        return true;
    }

    function gate(enemy) {
        const duty = current(enemy);
        return !duty || (duty.role === "native" && api.SpinnerAI.gateNativePhase(enemy));
    }

    function restore() {
        map = undefined;
        tick = undefined;
        decisions = new Map();
    }

    api.SpinnerDuties = { prepare, allows, beforeMove, gate, current, restore };
})();
