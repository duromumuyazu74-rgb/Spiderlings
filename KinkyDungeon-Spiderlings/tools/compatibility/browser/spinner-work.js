(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const nativeAction = Spiderlings.SpinnerNativeField.applyPaidAction;
    let row, tick;
    Spiderlings.SpinnerNativeField.applyPaidAction = function (source, action) {
        const result = nativeAction.apply(this, arguments);
        if (row)
            row.actions.push({
                tick,
                source: source.id,
                x: source.x,
                y: source.y,
                action: action.type,
                fieldId: action.fieldId,
                cell: action.cell || action.target,
                result: structuredClone(result),
                credit: source.SpinnerConstructionPoints,
            });
        return result;
    };
    try {
        for (const count of [1, 2, 4, 8]) {
            row = undefined;
            setup(`workers-${count}`);
            KDMovePlayer(28, 18, false);
            const actors = [
                [12, 8],
                [14, 8],
                [16, 8],
                [12, 10],
                [14, 10],
                [16, 10],
                [12, 12],
                [16, 12],
            ]
                .slice(0, count)
                .map(([x, y]) => spawn("Spinner", x, y));
            for (const source of actors) {
                source.aware = false;
                source.vp = 0;
                // Global planning now places work near the player. Isolate paid
                // construction here; actual contact/defense is exercised below.
                source.Enemy = { ...source.Enemy, visionRadius: 0 };
                source.modified = true;
            }
            globalThis.normalAcceptance.prepareCrew({ actors, fieldPermits: 1 });
            Spiderlings.SpinnerAI.beginTurn({ activate: true });
            row = { count, actions: [], turns: [], reload: undefined };
            rows.push(row);
            for (tick = 1; tick <= 260; tick++) {
                await turn();
                const state = Spiderlings.SpinnerNativeField.state();
                const fields = Object.values(state?.topology?.fields || {}).map((field) => ({
                    id: field.id,
                    phase: field.phase,
                    bounds: field.bounds,
                }));
                row.turns.push({
                    tick,
                    fields,
                    metrics: structuredClone(state?.ai?.groups),
                    work: structuredClone(state?.ai?.plannerWork),
                    actors: actors.map(({ id }) => {
                        const e = KDMapData.Entities.find((entry) => entry.id === id);
                        return { id, x: e?.x, y: e?.y, credit: e?.SpinnerConstructionPoints };
                    }),
                });
                // Reload while outer-first paid construction is still partial.
                if (tick === 5) {
                    const before = JSON.stringify(state.topology);
                    restore(save());
                    row.reload = {
                        before: JSON.parse(before),
                        after: structuredClone(Spiderlings.SpinnerNativeField.state()?.topology),
                    };
                }
                if (
                    Object.values(state.topology.composites).some(
                        (composite) =>
                            composite.layerIds.length === 3 &&
                            composite.layerIds.every((id) =>
                                ["ready", "sealed"].includes(state.topology.fields[id].phase),
                            ),
                    )
                )
                    break;
            }
            row.final = structuredClone(Spiderlings.SpinnerNativeField.state());
            expect(
                row.actions.some((action) => action.result.applied),
                `No real paid construction with ${count} workers`,
            );
            expect(
                Object.values(row.final.topology.fields).filter((field) => field.phase === "ready").length >= 3,
                `${count} workers did not finish the three retained layers`,
            );
            const homes = actors.map((actor) => row.final.command.members[actor.id]?.home);
            expect(
                homes.every((home) => home && home === homes[0]),
                `${count} workers lost their original team ownership`,
            );
            const plan = Object.values(row.final.ai.plans).find((plan) => {
                    const composite = row.final.topology.composites[plan.compositeId];
                    return (
                        composite?.layerIds.length === 3 &&
                        composite.layerIds.every((id) => row.final.topology.fields[id].phase === "ready")
                    );
                }),
                composite = row.final.topology.composites[plan?.compositeId];
            expect(
                composite?.constructionOrder === "outer-first" && composite.layerIds.length === 3,
                `${count} workers did not declare the largest three-ring enclosure`,
            );
            expect(
                row.final.topology.fields[composite.layerIds[0]].interiorCells.length === 9,
                "The spacious enclosure did not keep its larger capture core",
            );
            const bodyWork = row.actions.filter(
                (action) =>
                    action.result.applied &&
                    composite.layerIds.includes(action.fieldId) &&
                    !/Gate|repair|rebuild/.test(action.action),
            );
            const layers = bodyWork.map((action) => row.final.topology.fields[action.fieldId]?.layer);
            expect(
                layers[0] === 2 && layers.includes(1) && layers.includes(0),
                "Paid work did not start at the outer ring",
            );
            expect(
                layers.every((layer, index) => index === 0 || layer <= layers[index - 1]),
                "Paid construction started an inner ring before finishing its outer ring",
            );
            for (const project of Object.values(row.final.topology.composites)) {
                const order = row.actions
                    .filter(
                        (action) =>
                            action.result.applied &&
                            project.layerIds.includes(action.fieldId) &&
                            !/Gate|repair|rebuild/.test(action.action),
                    )
                    .map((action) => row.final.topology.fields[action.fieldId].layer);
                expect(
                    order.every((layer, index) => index === 0 || layer <= order[index - 1]),
                    `Parallel project ${project.id} started an inner ring before finishing its outer ring`,
                );
            }
            row.retainedTeam = {
                memberIds: actors.map((actor) => actor.id),
                home: homes[0],
                compositeId: composite.id,
                constructionLayers: layers,
            };
            expect(
                JSON.stringify(row.reload.before) === JSON.stringify(row.reload.after),
                "Partial construction changed on reload",
            );
            const beforeIdle = row.actions.length;
            KinkyDungeonAdvanceTime(0, true);
            expect(row.actions.length === beforeIdle, "A zero-time update paid construction");
            // The original crew maintains its completed outer perimeter.
            const state = Spiderlings.SpinnerNativeField.state(),
                repairSites = Object.values(state.ai.groups).flatMap((group) => {
                    const plan = state.ai.plans[group.planId],
                        composite = state.topology.composites[plan?.compositeId],
                        fieldId = composite?.layerIds.at(-1),
                        field = state.topology.fields[fieldId],
                        owners = group.memberIds
                            .map((id) => KDMapData.Entities.find((entity) => entity.id === id))
                            .filter((entity) => entity?.hp > 0 && !KinkyDungeonIsDisabled(entity));
                    if (!field || !["ready", "sealed"].includes(field.phase) || !owners.length) return [];
                    return KDMapData.Entities.filter(
                        (entity) =>
                            Spiderlings.SpinnerNativeField.isOwnedProxy(entity) &&
                            field.boundaryCells.some((cell) => cell.x === entity.x && cell.y === entity.y) &&
                            !state.topology.anchors.some((anchor) => anchor.x === entity.x && anchor.y === entity.y) &&
                            !KDMapData.Entities.some(
                                (actor) =>
                                    actor.hp > 0 &&
                                    !Spiderlings.SpinnerNativeField.isOwnedProxy(actor) &&
                                    actor.x === entity.x &&
                                    actor.y === entity.y,
                            ),
                    ).map((proxy) => ({
                        proxy,
                        fieldId,
                        ownerIds: owners.map((owner) => owner.id),
                        distance: Math.min(...owners.map((owner) => Math.hypot(owner.x - proxy.x, owner.y - proxy.y))),
                    }));
                }),
                repairSite = repairSites.sort((left, right) => left.distance - right.distance)[0];
            expect(repairSite, "No staffed ready outer layer remained for paid repair acceptance");
            const { proxy } = repairSite;
            const cell = { x: proxy.x, y: proxy.y };
            row.repair = {
                cell,
                fieldId: repairSite.fieldId,
                ownerIds: repairSite.ownerIds,
                actionsBefore: row.actions.length,
                proxyBefore: structuredClone(proxy),
            };
            row.repair.damageDealt = KinkyDungeonDamageEnemy(
                proxy,
                // Long spans attenuate hits away from anchors down to 25%.
                { damage: 100, type: "slash", nocrit: true, evadeable: false, noblock: true },
                true,
                true,
                undefined,
                undefined,
                KinkyDungeonPlayerEntity,
            );
            row.repair.proxyAfter = structuredClone(proxy);
            row.repair.damageState = structuredClone(Spiderlings.SpinnerNativeField.state().topology);
            expect(
                !Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(cell),
                "Native damage did not breach the constructed field",
            );
            for (let step = 0; step < 90 && !Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(cell); step++) {
                tick++;
                await turn();
            }
            row.repair.actionsAfter = row.actions.length;
            row.repair.restored = Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(cell);
            row.repair.state = structuredClone(Spiderlings.SpinnerNativeField.state());
            row.repair.actors = actors.map(({ id }) => {
                const actor = KDMapData.Entities.find((entity) => entity.id === id);
                return {
                    id,
                    hp: actor?.hp,
                    stun: actor?.stun,
                    duty: structuredClone(Spiderlings.SpinnerDuties.current(actor)),
                };
            });
            row.repair.paidRepair = row.actions
                .slice(row.repair.actionsBefore)
                .some(
                    (action) =>
                        action.result.paid &&
                        action.result.applied &&
                        action.cell?.x === cell.x &&
                        action.cell?.y === cell.y,
                );
            expect(row.repair.restored && row.repair.paidRepair, `${count} workers did not pay to repair the breach`);
        }
    } finally {
        Spiderlings.SpinnerNativeField.applyPaidAction = nativeAction;
    }
    setup("corner-lure-with-paid-builders");
    KDMapData.GridWidth = 28;
    KDMapData.GridHeight = 22;
    KDMapData.Grid =
        Array.from({ length: 22 }, (_, y) =>
            Array.from({ length: 28 }, (_, x) => (x > 0 && y > 0 && x < 27 && y < 21 ? "0" : "1")).join(""),
        ).join("\n") + "\n";
    KDMapData.Tiles = {};
    KDMapData.StartPosition = { x: 2, y: 2 };
    KDMapData.EndPosition = { x: 25, y: 19 };
    for (let y = 5; y < 21; y++) KinkyDungeonMapSet(10, y, "1");
    KDMovePlayer(15, 10, false);
    KinkyDungeonPlayerEntity.sound = 0;
    const lure = spawn("Spinner", 11, 10),
        helpers = [spawn("Spinner", 4, 7), spawn("Spinner", 4, 13)],
        actors = [lure, ...helpers],
        layers = [2, 3, 4].map((radius, index) => ({
            id: `corner-layer-${index}`,
            vertices: [
                { x: 5 - radius, y: 10 - radius },
                { x: 5 + radius, y: 10 - radius },
                { x: 5 + radius, y: 10 + radius },
                { x: 5 - radius, y: 10 + radius },
            ],
            gate: { x: 5 + radius, y: 10 },
        }));
    for (const source of actors) source.hostile = 999;
    for (const source of helpers) {
        source.aware = false;
        source.vp = 0;
    }
    const encounter = Spiderlings.SpinnerNativeField.initializeEnclosure({
        compositeId: "corner-field",
        owners: actors.map((source) => source.id),
        autoSeal: false,
        layers,
        constructionOrder: "outer-first",
    });
    // Keep the real retained plan invested before ordinary intelligence can
    // redirect an unpaid plan. Further builder work uses the native loop.
    const initial = Spiderlings.SpinnerTopology.nextWorkAction(encounter.topology, lure.id, lure),
        applied = Spiderlings.SpinnerTopology.applyAction(
            encounter.topology,
            { ...initial, ownerId: lure.id },
            Spiderlings.SpinnerNativeField.snapshot(initial.cell),
        );
    expect(applied.outcome.legal, "Could not establish the corner fixture's retained field");
    encounter.topology = applied.state;
    encounter.builders = {};
    encounter.autonomous = true;
    Spiderlings.SpinnerNativeField.reconcile();
    const ai = Spiderlings.SpinnerAI.ensureAI(encounter),
        group = {
            id: "corner-group",
            memberIds: actors.map((source) => source.id),
            source: { type: "ordinary" },
            selectionOrdinal: 0,
            planId: "corner-plan",
            assignments: {},
            metrics: { travel: 0, construction: 0, wait: 0, yield: 0, repair: 0 },
        },
        plan = {
            id: "corner-plan",
            kind: "enclosure",
            groupId: group.id,
            fieldId: layers[0].id,
            compositeId: "corner-field",
            status: "preparing",
            center: { x: 5, y: 10 },
            gate: { x: 7, y: 10 },
            anchors: layers[0].vertices,
            layers,
            fieldIds: layers.map((layer) => layer.id),
            cells: Object.values(encounter.topology.fields).flatMap((field) =>
                field.boundaryCells.map((cell) => `${cell.x},${cell.y}`),
            ),
            selectionOrdinal: 0,
            invalidReason: null,
            constructionOrder: "outer-first",
        };
    plan.initialCells = [...plan.cells];
    ai.groups[group.id] = group;
    ai.plans[plan.id] = plan;
    ai.nextPlanOrdinal = 2;
    KDUpdateEnemyCache = true;
    KDPathCache = new Map();
    KDPathCacheIgnoreLocks = new Map();
    const corner = { turns: [] };
    globalThis.normalTrace = { rows, corner };
    for (let step = 0; step < 25; step++) {
        await turn();
        corner.turns.push({
            turn: step + 1,
            x: lure.x,
            y: lure.y,
            mode: group.engagement?.mode,
            metrics: structuredClone(group.metrics),
            paid: encounter.topology.actionLog.length,
        });
        expect(KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(lure.x, lure.y)), "Lure crossed a wall");
    }
    corner.firstMove = corner.turns.find((entry) => entry.x !== 11 || entry.y !== 10)?.turn;
    corner.command = Spiderlings.FieldCommand.inspect();
    corner.groups = structuredClone(encounter.ai.groups);
    corner.actors = structuredClone(actors);
    expect(corner.firstMove <= 4, "Legal detour remained stuck at a local minimum while builders worked");
    expect(group.metrics.construction > 0, "The corner regression did not retain real paid builders");
    expect(group.planId === plan.id, "Lure repair diverted the crew from its retained field");

    setup("mapgen-outer-body");
    KDMovePlayer(28, 18, false);
    const presetActors = [spawn("Spinner", 12, 8), spawn("Spinner", 14, 8)];
    const presetCrew = globalThis.normalAcceptance.prepareCrew({ actors: presetActors, fieldPermits: 1 });
    const preset = Spiderlings.SpinnerAI.initializeMapgenField({ preferredSites: [{ x: 14, y: 10 }] });
    expect(preset.status === "placed", "The legal mapgen outer field was not generated");
    const presetState = Spiderlings.SpinnerNativeField.state(),
        composite = presetState.topology.composites[preset.compositeId],
        outer = presetState.topology.fields[composite.layerIds.at(-1)];
    expect(outer.bounds.right - outer.bounds.left === 8 && outer.phase === "ready", "Preset outer body is too small");
    expect(
        KDMapData.Entities.filter(Spiderlings.SpinnerNativeField.isOwnedProxy).length === 31,
        "A single outer body should add only 31 collision proxies",
    );
    expect(!Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(outer.gateCell), "Preset opening is blocked");
    expect(presetState.topology.actionLog.length === 0, "Mapgen field spent fake paid construction");
    const before = JSON.stringify(presetState.topology),
        memberIds = [...presetState.ai.groups[preset.groupId].memberIds];
    restore(save());
    expect(JSON.stringify(Spiderlings.SpinnerNativeField.state().topology) === before, "Preset changed on reload");
    const reloaded = Spiderlings.SpinnerNativeField.state();
    expect(
        Spiderlings.SpinnerAI.initializeMapgenField().reason === "existing-field",
        "A revisit replenished the field",
    );
    for (let step = 0; step < 25; step++) await turn();
    expect(reloaded.topology.actionLog.length > 0, "Existing Spinner crew did not pay to complete inner circles");
    expect(
        memberIds.every(
            (id) =>
                Spiderlings.FieldCommand.inspect().members[id]?.home === preset.groupId &&
                composite.layerIds.every((fieldId) => Spiderlings.SpinnerNativeField.fieldOwners(fieldId).includes(id)),
        ),
        "Temporary dispatch lost prefab members' original physical ownership",
    );
    expect(
        KDMapData.Entities.filter((source) => source.Enemy?.name === "Spinner").length === presetCrew.population.length,
        "Field creation granted uncontrolled Spinner reinforcement",
    );
    const coreDefense = await (async () => {
        const { setup, spawn, turn, expect } = globalThis.normalAcceptance;
        const rows = [];
        globalThis.normalTrace = { rows };
        const originalPaid = Spiderlings.SpinnerNativeField.applyPaidAction,
            originalHit = KDPlayerEffects.SpiderlingsWebbingEnemyBind;
        let row;
        Spiderlings.SpinnerNativeField.applyPaidAction = function (source, action) {
            const result = originalPaid.apply(this, arguments);
            row?.actions.push({
                tick: KinkyDungeonCurrentTick,
                source: source.id,
                type: action.type,
                role: action.role,
                fieldId: action.fieldId,
                cell: action.cell || action.target,
                result: structuredClone(result),
                credit: source.SpinnerConstructionPoints,
            });
            return result;
        };
        KDPlayerEffects.SpiderlingsWebbingEnemyBind = function (
            target,
            _damage,
            effect,
            _spell,
            _faction,
            _bullet,
            source,
        ) {
            const result = originalHit.apply(this, arguments);
            if (target === KinkyDungeonPlayerEntity)
                row?.hits.push({
                    tick: KinkyDungeonCurrentTick,
                    source: source?.id,
                    profile: effect.profile,
                    capture: !!Spiderlings.SpinnerCapture.state(),
                });
            return result;
        };
        const room = () => {
            KDMapData.GridWidth = 36;
            KDMapData.GridHeight = 24;
            KDMapData.Grid =
                Array.from({ length: 24 }, (_, y) =>
                    Array.from({ length: 36 }, (_, x) => (x > 0 && y > 0 && x < 35 && y < 23 ? "0" : "1")).join(""),
                ).join("\n") + "\n";
            KDMapData.StartPosition = { x: 2, y: 2 };
            KDMapData.EndPosition = { x: 33, y: 21 };
            KDMapData.Tiles = {};
            KDPathCache = new Map();
            KDPathCacheIgnoreLocks = new Map();
            KDUpdateEnemyCache = true;
        };
        try {
            for (const [strategy, seed] of [
                ["core", 0],
                ["core", 1],
                ["core", 2],
                ["occupied-gate", 0],
                ["stun", 0],
                ["kill", 0],
                ["kill-all", 0],
            ]) {
                row = undefined;
                setup(`adversarial-spinner-core-entry-${seed}`);
                room();
                KDMovePlayer(23, 10, false);
                const actors = [
                    [18, 10],
                    [12, 7],
                    [12, 13],
                ].map(([x, y]) => spawn("Spinner", x, y));
                for (const actor of actors) {
                    actor.hostile = 999;
                    actor.aware = false;
                    actor.vp = 0;
                }
                globalThis.normalAcceptance.prepareCrew({ actors, fieldPermits: 1 });
                const preset = Spiderlings.SpinnerAI.initializeMapgenField({ preferredSites: [{ x: 14, y: 10 }] }),
                    encounter = Spiderlings.SpinnerNativeField.state(),
                    group = encounter.ai.groups[preset.groupId],
                    composite = encounter.topology.composites[preset.compositeId],
                    inner = encounter.topology.fields[composite.layerIds[0]],
                    target =
                        strategy === "occupied-gate"
                            ? inner.gateCell
                            : { x: composite.core.x + 1, y: composite.core.y };
                row = {
                    strategy,
                    seed: `adversarial-spinner-core-entry-${seed}`,
                    preset,
                    config: {
                        floor: MiniGameKinkyDungeonLevel,
                        weapon: KinkyDungeonPlayerDamage?.name,
                        stamina: KinkyDungeonStatStamina,
                        mana: KinkyDungeonStatMana,
                        will: KinkyDungeonStatWill,
                        gear: KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name),
                        perks: [...KinkyDungeonStatsChoice].filter(([_, v]) => v).map(([key]) => key),
                    },
                    target,
                    originalMembers: [...group.memberIds],
                    actions: [],
                    hits: [],
                    turns: [],
                };
                rows.push(row);
                KDMovePlayer(target.x, target.y, false);
                let counterDone = !["stun", "kill", "kill-all"].includes(strategy);
                for (let step = 1; step <= 160; step++) {
                    const current = Spiderlings.SpinnerNativeField.state(),
                        currentGroup = current.ai.groups[preset.groupId];
                    if (!counterDone) {
                        const bodyWorkers = actors.filter(
                            (actor) =>
                                String(actor.id) !== String(currentGroup.engagement?.lureId) &&
                                currentGroup.assignments[actor.id]?.role === "body",
                        );
                        const workers = strategy === "kill-all" ? actors.filter((actor) => actor.hp > 0) : bodyWorkers;
                        if (bodyWorkers.length === 2) {
                            row.counter = {
                                tick: KinkyDungeonCurrentTick,
                                workerIds: workers.map((actor) => actor.id),
                                beforePaid: current.topology.actionLog.length,
                                damage:
                                    strategy === "stun"
                                        ? {
                                              damage: 0.1,
                                              type: "stun",
                                              time: 12,
                                              nocrit: true,
                                              evadeable: false,
                                              noblock: true,
                                          }
                                        : { damage: 100, type: "slash", nocrit: true, evadeable: false, noblock: true },
                                before: workers.map((actor) => ({
                                    id: actor.id,
                                    hp: actor.hp,
                                    stun: actor.stun,
                                    credit: actor.SpinnerConstructionPoints,
                                })),
                            };
                            for (const actor of workers)
                                KinkyDungeonDamageEnemy(
                                    actor,
                                    row.counter.damage,
                                    true,
                                    true,
                                    undefined,
                                    undefined,
                                    KinkyDungeonPlayerEntity,
                                );
                            row.counter.after = workers.map((actor) => ({
                                id: actor.id,
                                hp: actor.hp,
                                stun: actor.stun,
                                disabled: KinkyDungeonIsDisabled(actor),
                            }));
                            expect(
                                workers.every((actor) =>
                                    strategy === "stun" ? KinkyDungeonIsDisabled(actor) : actor.hp <= 0,
                                ),
                                `Native ${strategy} did not interrupt body workers`,
                            );
                            counterDone = true;
                        }
                    }
                    const disabledBefore = actors
                            .filter((actor) => KinkyDungeonIsDisabled(actor) || actor.hp <= 0)
                            .map((actor) => actor.id),
                        beforeActions = row.actions.length;
                    await turn();
                    expect(
                        !row.actions
                            .slice(beforeActions)
                            .some((action) => disabledBefore.includes(action.source) && action.result.applied),
                        "Disabled/dead workers paid phantom construction",
                    );
                    const after = Spiderlings.SpinnerNativeField.state();
                    row.turns.push({
                        step,
                        tick: KinkyDungeonCurrentTick,
                        paid: after.topology.actionLog.length,
                        geometry: Spiderlings.SpinnerNativeField.captureGeometryReady(KinkyDungeonPlayerEntity),
                        capture: !!Spiderlings.SpinnerCapture.state(),
                        player: {
                            x: KinkyDungeonPlayerEntity.x,
                            y: KinkyDungeonPlayerEntity.y,
                            will: KinkyDungeonStatWill,
                            stamina: KinkyDungeonStatStamina,
                            slow: KinkyDungeonSlowLevel,
                        },
                        lure: after.ai.groups[preset.groupId]?.engagement?.lureId,
                        actors: actors.map((actor) => ({
                            id: actor.id,
                            x: actor.x,
                            y: actor.y,
                            hp: actor.hp,
                            stun: actor.stun,
                        })),
                    });
                    if (
                        ["core", "stun"].includes(strategy) &&
                        KinkyDungeonAllRestraintDynamic().some(
                            ({ item }) => item.name === "SpiderlingsSpinnerLegbinder",
                        ) &&
                        composite.layerIds.every((id) => after.topology.fields[id].phase === "sealed")
                    )
                        break;
                }
                expect(counterDone, `Native ${strategy} did not reach its assigned work counter`);
                const final = Spiderlings.SpinnerNativeField.state();
                row.final = {
                    geometry: Spiderlings.SpinnerNativeField.captureGeometryReady(KinkyDungeonPlayerEntity),
                    capture: structuredClone(Spiderlings.SpinnerCapture.state()),
                    fields: composite.layerIds.map((id) => ({ id, phase: final.topology.fields[id].phase })),
                    memberIds: final.ai.groups[preset.groupId]?.memberIds,
                    gear: KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name),
                };
                if (["core", "stun"].includes(strategy)) {
                    expect(
                        row.final.fields.every((field) => field.phase === "sealed"),
                        "Recognized core prey starved retained paid construction",
                    );
                    expect(
                        row.hits.some((hit) => hit.capture),
                        "Closed geometry did not admit actual native melee capture",
                    );
                    expect(
                        row.final.gear.includes("SpiderlingsSpinnerLegbinder"),
                        "Actual capture did not equip the completed legbag",
                    );
                    expect(
                        row.actions.filter((action) => action.result.paid && action.result.applied).length >= 40,
                        "Closure skipped paid inner construction",
                    );
                    expect(
                        row.originalMembers.every((id) => row.final.memberIds.includes(id)),
                        "Core construction dispersed the retained crew",
                    );
                } else {
                    if (strategy === "kill") {
                        expect(
                            row.final.geometry && !row.final.capture,
                            "The surviving sole builder should finish geometry without admitting one-source Capture",
                        );
                        expect(
                            row.actions.some(
                                (action) =>
                                    action.tick > row.counter.tick &&
                                    !row.counter.workerIds.includes(action.source) &&
                                    action.result.applied,
                            ),
                            "The surviving Spinner never continued real paid construction",
                        );
                    } else
                        expect(
                            !row.final.geometry && !row.final.capture,
                            `${strategy} should prevent a legal core closure`,
                        );
                    if (strategy === "occupied-gate")
                        expect(
                            !row.actions.some(
                                (action) =>
                                    action.result.applied && action.cell?.x === target.x && action.cell?.y === target.y,
                            ),
                            "A worker constructed through the player's occupied gate",
                        );
                    if (["kill", "kill-all"].includes(strategy))
                        expect(
                            !row.actions.some(
                                (action) =>
                                    action.tick > row.counter.tick &&
                                    row.counter.workerIds.includes(action.source) &&
                                    action.result.applied,
                            ),
                            "Killed builders continued paid work",
                        );
                }
                const beforeZero = JSON.stringify({
                    topology: final.topology,
                    credits: actors.map((actor) => actor.SpinnerConstructionPoints),
                });
                KinkyDungeonAdvanceTime(0, true);
                expect(
                    beforeZero ===
                        JSON.stringify({
                            topology: Spiderlings.SpinnerNativeField.state().topology,
                            credits: actors.map((actor) => actor.SpinnerConstructionPoints),
                        }),
                    "Zero-time core update paid or erased work",
                );
            }
        } finally {
            Spiderlings.SpinnerNativeField.applyPaidAction = originalPaid;
            KDPlayerEffects.SpiderlingsWebbingEnemyBind = originalHit;
        }
        return { rows };
    })();
    const result = {
        rows,
        corner,
        preset: { ...preset, memberIds, paidInnerActions: reloaded.topology.actionLog.length },
        coreDefense,
    };
    globalThis.normalTrace = result;
    return result;
})();
