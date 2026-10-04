(async () => {
    const { setup, spawn, turn, frame, expect, pin, save, restore } = globalThis.normalAcceptance;
    const report = (globalThis.normalTrace = { objectives: [], sustained: {} });
    const named = "SpiderlingsNormalIntegrationAcceptance";
    let cancelledId;
    KDAddEvent(KDEventMapGeneric, "removeEnemy", named, (_event, data) => {
        if (data.enemy.id === cancelledId) data.cancel = true;
    });
    try {
        for (const [modifier, count] of [
            ["SpiderlingsHuntingGrounds", 3],
            ["SpiderlingsInfestation", 5],
        ]) {
            KinkyDungeonStartNewGame(false);
            KDToggles.Sound = false;
            MiniGameKinkyDungeonLevel = 5;
            KDsetSeed(`integration-objective-${modifier}`);
            KinkyDungeonCreateMap(
                KinkyDungeonMapParams.grv,
                "",
                modifier,
                5,
                false,
                false,
                undefined,
                { x: 0, y: 5 },
                false,
            );
            const map = KDMapData,
                state = map[modifier];
            const row = { modifier, target: state?.target, initialIds: [...(state?.targetIds || [])] };
            report.objectives.push(row);
            expect(
                state?.status === "active" && state.targetIds.length === count,
                `${modifier} did not generate ${count} objectives`,
            );
            expect(
                !map[modifier === "SpiderlingsHuntingGrounds" ? "SpiderlingsInfestation" : "SpiderlingsHuntingGrounds"],
                "Independent infestation objectives leaked across modifiers",
            );
            // Isolate objective/stair transitions from unrelated random encounters.
            // Keep all task nests, their guards and scenery; population and hunting
            // have separate full-map scenarios. Some baseline native NPC dresses
            // include an upstream missing Gothic/HemLowerBack texture.
            for (const actor of [...map.Entities]) {
                if (
                    !actor.Enemy.immobile &&
                    !state.targetIds.includes(actor.id) &&
                    !state.targetIds.includes(actor.SpiderlingsNestParentID)
                )
                    KDRemoveEntity(actor, false, false);
            }
            const nest = map.Entities.find((enemy) => enemy.id === state.targetIds[0]);
            cancelledId = nest.id;
            row.cancelled = {
                result: KDRemoveEntity(nest, true, false),
                present: map.Entities.includes(nest),
                count: state.destroyedIds.length,
            };
            cancelledId = undefined;
            expect(
                !row.cancelled.result && row.cancelled.present && !row.cancelled.count,
                "Cancelled native death advanced the objective",
            );
            const later = KinkyDungeonSummonEnemy(
                nest.x,
                nest.y,
                "NestEntrance",
                1,
                5,
                false,
                undefined,
                false,
                false,
                undefined,
                true,
                undefined,
                false,
                true,
            )?.[0];
            expect(later && !state.targetIds.includes(later.id), "Later nest became a fixed objective");
            row.laterNest = {
                id: later.id,
                removed: KDRemoveEntity(later, true, false),
                count: state.destroyedIds.length,
            };
            expect(row.laterNest.removed && !row.laterNest.count, "Later nest death advanced a fixed objective");
            KDMovePlayer(map.EndPosition.x, map.EndPosition.y, false);
            const oldFloor = MiniGameKinkyDungeonLevel;
            KinkyDungeonHandleStairs("s", true);
            await frame();
            row.blocked = KDMapData === map && MiniGameKinkyDungeonLevel === oldFloor;
            expect(row.blocked, "Unfinished objective allowed native descent");
            row.deaths = [];
            for (const id of row.initialIds) {
                const original = map.Entities.find((enemy) => enemy.id === id);
                row.deaths.push({
                    id,
                    result: KDRemoveEntity(original, true, false),
                    count: state.destroyedIds.length,
                });
            }
            expect(
                state.complete && state.destroyedIds.length === count && row.deaths.every((death) => death.result),
                "Successful original nest deaths did not complete the fixed objective",
            );
            expect(KinkyDungeonEscapeTypes[modifier].check(), "Completed objective still denies native escape");
            KinkyDungeonHandleStairs("s", true);
            for (let attempt = 0; attempt < 240 && KDMapData === map; attempt++) await frame();
            row.descent = {
                from: oldFloor,
                to: MiniGameKinkyDungeonLevel,
                changedMap: KDMapData !== map,
                modifier: KDMapData.MapMod,
                oldTargetIds: [...state.targetIds],
                destroyed: [...state.destroyedIds],
                inheritedObjective: !!(
                    Spiderlings.HuntingGrounds.activeState() || Spiderlings.Infestation.activeState()
                ),
            };
            expect(
                row.descent.changedMap && row.descent.to > oldFloor,
                `Completed objective did not permit native descent: ${JSON.stringify(row.descent)}`,
            );
            expect(!row.descent.inheritedObjective, "Following ordinary floor inherited the completed objective");
        }
    } finally {
        delete KDEventMapGeneric.removeEnemy[named];
    }

    // An empty ordinary test room isolates long-lived Mod state from native floor
    // encounters. Actors still use native AI, construction, damage and removal.
    setup("ordinary-sustained-300");
    KDMovePlayer(2, 2, false);
    for (const [x, y] of [
        [1, 1],
        [2, 1],
        [3, 1],
        [1, 2],
        [3, 2],
        [1, 3],
        [2, 3],
        [3, 3],
    ])
        KinkyDungeonMapSet(x, y, "1");
    const workers = [
        [12, 8],
        [14, 8],
        [12, 10],
        [14, 10],
    ].map(([x, y]) => spawn("Spinner", x, y));
    workers.forEach((worker) => {
        worker.aware = false;
        worker.vp = 0;
    });
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    const sustained = report.sustained;
    sustained.turns = [];
    sustained.actions = [];
    sustained.damage = [];
    sustained.defeats = [];
    sustained.newNests = [];
    sustained.initialNativeTick = KinkyDungeonCurrentTick;
    sustained.fixture =
        "Ordinary empty room; player isolated behind walls; four native builders; five repeated native silk vulnerability preconditions and damage knockdowns.";
    let tick = 0;
    let batch;
    const nativeAction = Spiderlings.SpinnerNativeField.applyPaidAction;
    const nativeRemove = KDRemoveEntity;
    Spiderlings.SpinnerNativeField.applyPaidAction = function (source, action) {
        const result = nativeAction.apply(this, arguments);
        if (result.applied) sustained.actions.push({ tick, source: source.id, type: action.type });
        return result;
    };
    KDRemoveEntity = function (enemy, kill) {
        const result = nativeRemove.apply(this, arguments);
        if (kill && result) sustained.defeats.push({ tick, id: enemy.id, name: enemy.Enemy.name });
        return result;
    };
    function audit() {
        const state = Spiderlings.SpinnerNativeField.state();
        const solids = state?.topology ? Spiderlings.SpinnerTopology.solidCells(state.topology) : [];
        const proxies = KDMapData.Entities.filter(Spiderlings.SpinnerNativeField.isOwnedProxy);
        const coordinates = new Set(proxies.map((enemy) => `${enemy.x},${enemy.y}`));
        expect(
            proxies.length === solids.length && coordinates.size === proxies.length,
            `Stale or duplicate web projection at turn ${tick}`,
        );
        const records = Object.values(Spiderlings.SpinnerNPCCapture.records());
        expect(!KDMapData.SpiderlingsNPCWrapping, "Removed countdown state returned");
        expect(
            records.every((record) => KDMapData.Entities.some((enemy) => String(enemy.id) === String(record.targetId))),
            `Capture record survived target removal at turn ${tick}`,
        );
        expect(
            !Spiderlings.HuntingGrounds.activeState() && !Spiderlings.Infestation.activeState(),
            "Ordinary floor inherited an infestation objective",
        );
        const groups = Object.values(state?.ai?.groups || {});
        expect(
            groups.every((group) => group.memberIds.every((id) => KDMapData.Entities.some((enemy) => enemy.id === id))),
            `Construction group retained a removed worker at turn ${tick}`,
        );
        expect(
            groups.every((group) => !group.planId || !!state.ai.plans[group.planId]),
            "Construction group lost its saved plan",
        );
        return {
            tick,
            entities: KDMapData.Entities.length,
            proxies: proxies.length,
            solids: solids.length,
            groups: groups.length,
            fields: Object.keys(state?.topology?.fields || {}).length,
            plans: Object.keys(state?.ai?.plans || {}).length,
            pending: records.length,
            plannerWork: state?.ai?.plannerWorkLast ?? 0,
        };
    }
    try {
        for (tick = 1; tick <= 310; tick++) {
            if ([1, 61, 121, 181, 241].includes(tick)) {
                const target = spawn("MaidKnightHeavy", 23, 15, "Maidforce");
                const sources = [
                    [22, 15],
                    [23, 14],
                    [24, 15],
                ].map(([x, y]) => spawn("WebCaster", x, y));
                pin(target, sources[0]);
                while ((target.boundLevel || 0) < target.Enemy.maxhp * 0.8 && !KDHelpless(target))
                    Spiderlings.Combat.hitNPC(sources[0], target, "direct");
                target.stun = 99;
                batch = { targetId: target.id, sourceIds: sources.map((source) => source.id) };
            }
            if ([16, 76, 136, 196, 256].includes(tick)) {
                const prey = KDMapData.Entities.find((enemy) => enemy.id === batch.targetId);
                expect(prey, "Silk-bound prey exited through an obsolete countdown");
                KinkyDungeonDamageEnemy(
                    prey,
                    { type: "arcane", damage: 10000, nocrit: true },
                    true,
                    true,
                    undefined,
                    undefined,
                    KinkyDungeonPlayerEntity,
                );
                expect(prey.hp <= 0.001, "Native damage failed to defeat silk-bound prey");
                KDRemoveEntity(prey, true, false);
                for (const id of batch.sourceIds) {
                    const source = KDMapData.Entities.find((enemy) => enemy.id === id);
                    if (source) KDRemoveEntity(source, false, false);
                }
            }
            if ([60, 150, 240].includes(tick)) {
                const nest = spawn("NestEntrance", 25, 5 + sustained.newNests.length * 3);
                sustained.newNests.push({ tick, id: nest.id });
            }
            if (tick % 45 === 0) {
                const web = KDMapData.Entities.find(Spiderlings.SpinnerNativeField.isOwnedProxy);
                if (web) {
                    const before = web.hp;
                    KinkyDungeonDamageEnemy(
                        web,
                        { type: "slash", damage: 0.5, nocrit: true },
                        true,
                        true,
                        undefined,
                        undefined,
                        KinkyDungeonPlayerEntity,
                    );
                    sustained.damage.push({ tick, id: web.id, before, after: web.hp });
                }
            }
            await turn();
            sustained.turns.push(audit());
            if (tick === 155) {
                const before = audit();
                await frame();
                restore(save());
                sustained.reload = { before, after: audit() };
                expect(
                    JSON.stringify(sustained.reload.before) === JSON.stringify(sustained.reload.after),
                    "Sustained scene state changed on native reload",
                );
            }
        }
        tick = sustained.turns.length;
        sustained.final = audit();
        sustained.positiveTurns = sustained.turns.length;
        sustained.finalNativeTick = KinkyDungeonCurrentTick;
        expect(
            sustained.finalNativeTick - sustained.initialNativeTick >= 310,
            "Sustained fixture did not advance 310 native world turns",
        );
        expect(sustained.defeats.length >= 5, "Sustained scene did not finish five native defeats");
        expect(
            sustained.actions.some((action) => action.type === "placeAnchor"),
            "Sustained scene had no paid construction",
        );
        expect(
            sustained.damage.some((damage) => damage.after < damage.before),
            "Sustained scene did not damage a physical web",
        );
        expect(
            sustained.actions.some((action) => action.type.startsWith("repair")),
            "Damaged webs received no paid native repair",
        );
        expect(sustained.final.pending === 0, "Sustained scene retained a completed capture");
    } finally {
        Spiderlings.SpinnerNativeField.applyPaidAction = nativeAction;
        KDRemoveEntity = nativeRemove;
    }
    return report;
})();
