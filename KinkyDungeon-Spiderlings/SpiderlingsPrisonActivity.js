"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsPrisonActivity";
    const mobile = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]);
    let taskIds = new Set();
    let playerNoise = false;

    function eligible(enemy) {
        return !!(
            api.Prison?.isPrison?.() &&
            enemy?.hp > 0 &&
            mobile.has(enemy.Enemy?.name) &&
            !enemy.allied &&
            !enemy.Enemy.allied &&
            !KDIsInParty(enemy) &&
            !KDAllied(enemy)
        );
    }

    function activity(enemy) {
        const prison = KDMapData.SpiderlingsPrison;
        const seed = prison?.builderIds?.includes(enemy.id);
        return (enemy[KEY] ||= { awake: seed ? 10 : 0, mode: seed ? "assigned" : "resting" });
    }

    function wake(enemy, reason, point) {
        if (!eligible(enemy)) return;
        const saved = activity(enemy);
        saved.awake = 10;
        saved.mode = reason;
        if (point && !taskIds.has(enemy.id)) {
            saved.heard = { x: point.x, y: point.y };
            enemy.gx = point.x;
            enemy.gy = point.y;
            if (!enemy.aware) enemy.action = "investigatesound";
        }
    }

    function prepare(delta) {
        if (!(delta > 0) || !api.Prison?.isPrison?.()) return;
        const prison = KDMapData.SpiderlingsPrison;
        const encounter = api.SpinnerNativeField.state();
        const byId = new Map(KDMapData.Entities.map((enemy) => [enemy.id, enemy]));
        taskIds = new Set(Object.keys(prison.patrols || {}).map(Number));
        for (const id of api.PrisonAlerts?.assignedWorkers?.() || []) taskIds.add(id);
        for (const dash of api.JumperDash?.runtimeController?.snapshot?.() || []) taskIds.add(dash.sourceId);
        const chamber = prison.chamberConstruction;
        const composite = encounter?.topology?.composites?.[api.PrisonConstruction.COMPOSITE];
        const needs = composite && api.SpinnerTopology.fieldWorkNeeds(encounter.topology, composite.layerIds);
        if (needs?.construction || needs?.repair) for (const id of chamber?.ownerIds || []) taskIds.add(id);
        for (const id of encounter?.custody?.contacts || []) taskIds.add(id);
        for (const id of encounter?.custody?.defenders || []) taskIds.add(id);
        for (const group of Object.values(encounter?.ai?.groups || {})) {
            const plan = encounter.ai.plans[group.planId];
            if (group.managedComposite || !plan || ["invalid", "abandoned", "retired"].includes(plan.status)) continue;
            const work = api.SpinnerTopology.fieldWorkNeeds(encounter.topology, plan.fieldIds || [plan.fieldId]);
            const count = work.construction ? plan.workforceTarget || 2 : work.repair ? 1 : 0;
            const workers = group.memberIds
                .map((id) => byId.get(id))
                .filter(
                    (enemy) =>
                        eligible(enemy) &&
                        !KinkyDungeonIsDisabled(enemy) &&
                        !KDHelpless(enemy) &&
                        !api.FieldCommand.sourceRole(enemy),
                );
            workers.sort((a, b) => Number(isResting(a)) - Number(isResting(b)) || a.id - b.id);
            for (const enemy of workers.slice(0, count)) taskIds.add(enemy.id);
        }
        for (const enemy of KDMapData.Entities) {
            if (!eligible(enemy)) continue;
            const member = encounter?.command?.members?.[enemy.id];
            const assignment = encounter?.ai?.groups?.[member?.commander]?.assignments?.[enemy.id];
            if (
                api.PrisonEscort?.ownsActor(enemy) ||
                api.FieldCommand?.sourceRole(enemy) ||
                enemy.SpiderlingsTaskNestDefenderTarget !== undefined ||
                (assignment && assignment.type !== "rally") ||
                ["travelling", "returning"].includes(member?.phase)
            )
                taskIds.add(enemy.id);
            const saved = activity(enemy);
            if (taskIds.has(enemy.id)) wake(enemy, "assigned");
            else if (
                typeof KDCanHearEnemy === "function" &&
                KinkyDungeonPlayerEntity.sound > 0 &&
                KDCanHearEnemy(enemy, KinkyDungeonPlayerEntity)
            )
                wake(enemy, "investigating", KinkyDungeonPlayerEntity);
            else if (saved.awake > 0) {
                const distance = Math.hypot(enemy.x - KinkyDungeonPlayerEntity.x, enemy.y - KinkyDungeonPlayerEntity.y);
                const sees =
                    enemy.aware &&
                    KDCanDetect(enemy, KinkyDungeonPlayerEntity) &&
                    KinkyDungeonCheckLOS(
                        enemy,
                        KinkyDungeonPlayerEntity,
                        distance,
                        KDEnemyVisionRadius(enemy),
                        true,
                        true,
                    );
                if (sees) saved.awake = 10;
                else saved.awake = Math.max(0, saved.awake - delta);
            }
            if (!(saved.awake > 0)) {
                saved.mode = "resting";
                enemy.aware = false;
                enemy.vp = 0;
            }
        }
    }

    function isResting(enemy) {
        return eligible(enemy) && !taskIds.has(enemy.id) && !(activity(enemy).awake > 0);
    }

    function wakeAssigned() {
        if (!api.Prison?.isPrison?.()) return;
        const encounter = api.SpinnerNativeField.state();
        for (const id of [...(encounter?.custody?.contacts || []), ...(encounter?.custody?.defenders || [])])
            taskIds.add(id);
        for (const enemy of KDMapData.Entities) {
            if (!eligible(enemy)) continue;
            const member = encounter?.command?.members?.[enemy.id];
            const assignment = encounter?.ai?.groups?.[member?.commander]?.assignments?.[enemy.id];
            if ((assignment && assignment.type !== "rally") || ["travelling", "returning"].includes(member?.phase))
                taskIds.add(enemy.id);
            if (taskIds.has(enemy.id)) wake(enemy, "assigned");
        }
    }

    function hear(data) {
        if (!playerNoise || !api.Prison?.isPrison?.()) return;
        for (const enemy of KDMapData.Entities)
            if (eligible(enemy) && KDCanHearSound(enemy, data.radius, data.x, data.y) > 0)
                wake(enemy, "investigating", data);
    }

    function contextHook(name, owns) {
        if (typeof globalThis[name] !== "function") return;
        globalThis[name] = api.Hooks.wrap(
            KEY + "." + name,
            globalThis[name],
            (native) =>
                function (...args) {
                    const previous = playerNoise;
                    playerNoise = owns(args);
                    try {
                        return native.apply(this, args);
                    } finally {
                        playerNoise = previous;
                    }
                },
        );
    }

    contextHook("KDProcessInput", () => true);
    contextHook("KinkyDungeonStruggle", (args) => args[3] !== true);
    contextHook("KinkyDungeonCastSpell", (args) => !args[3] && !args[5] && !!args[4]);
    contextHook("KinkyDungeonBulletHit", (args) => args[0]?.bullet?.source === -1);
    // A player input may advance enemy turns inside its own call. Their noises are not player noises.
    contextHook("KinkyDungeonAdvanceTime", () => false);
    if (typeof KDInputTypes !== "undefined" && typeof KDInputTypes.noise === "function")
        KDInputTypes.noise = api.Hooks.wrap(
            KEY + ".noise",
            KDInputTypes.noise,
            (native) =>
                function (...args) {
                    const previous = playerNoise;
                    playerNoise = true;
                    try {
                        return native.apply(this, args);
                    } finally {
                        playerNoise = previous;
                    }
                },
        );

    KDAddEvent(KDEventMapGeneric, "afterNoise", KEY, (_event, data) => hear(data));
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) => {
        if (data?.dmgDealt > 0 || data?.dmgShieldDealt > 0) wake(data.enemy, "defending");
    });
    for (const trigger of ["afterLoadGame", "postMapgen"])
        KDAddEvent(KDEventMapGeneric, trigger, KEY, () => {
            taskIds = new Set();
        });
    api.NativeActions?.registerBehavior(KEY, {
        admitAction: (enemy) => (isResting(enemy) ? { idle: true, defeat: false, defeatEnemy: enemy } : undefined),
    });
    api.PrisonActivity = Object.freeze({ prepare, wakeAssigned, isResting });
})();
