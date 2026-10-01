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
            }
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
                if (fields.filter((field) => ["ready", "sealed"].includes(field.phase)).length >= 3) break;
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
            const staffed = Object.values(row.final.ai.groups).find((group) =>
                actors.every((actor) => group.memberIds.includes(actor.id)),
            );
            expect(staffed, `${count} workers dispersed instead of retaining their field team`);
            const plan = row.final.ai.plans[staffed.planId],
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
                (action) => action.result.applied && !/Gate|repair/.test(action.action),
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
            row.retainedTeam = { memberIds: staffed.memberIds, compositeId: composite.id, constructionLayers: layers };
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
                            field.boundaryCells.some((cell) => cell.x === entity.x && cell.y === entity.y),
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
            KinkyDungeonDamageEnemy(
                proxy,
                { damage: 20, type: "slash", nocrit: true },
                true,
                true,
                undefined,
                undefined,
                KinkyDungeonPlayerEntity,
            );
            expect(
                !Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(cell),
                "Native damage did not breach the constructed field",
            );
            row.repair = {
                cell,
                fieldId: repairSite.fieldId,
                ownerIds: repairSite.ownerIds,
                actionsBefore: row.actions.length,
            };
            for (let step = 0; step < 90 && !Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(cell); step++) {
                tick++;
                await turn();
            }
            row.repair.actionsAfter = row.actions.length;
            row.repair.restored = Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(cell);
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
    expect(corner.firstMove <= 4, "Legal detour remained stuck at a local minimum while builders worked");
    expect(group.metrics.construction > 0, "The corner regression did not retain real paid builders");
    expect(group.planId === plan.id, "Lure repair diverted the crew from its retained field");

    setup("mapgen-outer-body");
    KDMovePlayer(28, 18, false);
    const presetActors = [spawn("Spinner", 12, 8), spawn("Spinner", 14, 8)];
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
        memberIds.every((id) => reloaded.ai.groups[preset.groupId].memberIds.includes(id)),
        "Prefab diverted existing crew members",
    );
    expect(
        KDMapData.Entities.filter((source) => source.Enemy?.name === "Spinner").length === presetActors.length,
        "Field creation granted uncontrolled Spinner reinforcement",
    );
    return { rows, corner, preset: { ...preset, memberIds, paidInnerActions: reloaded.topology.actionLog.length } };
})();
