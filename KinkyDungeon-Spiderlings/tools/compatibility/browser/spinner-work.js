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
            for (tick = 1; tick <= 180; tick++) {
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
                // Capacity-limited teams can finish separate small fields before
                // turn 20; reload while their paid construction is still partial.
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
                `${count} workers did not finish at least three retained fields or layers`,
            );
            expect(
                JSON.stringify(row.reload.before) === JSON.stringify(row.reload.after),
                "Partial construction changed on reload",
            );
            const beforeIdle = row.actions.length;
            KinkyDungeonAdvanceTime(0, true);
            expect(row.actions.length === beforeIdle, "A zero-time update paid construction");
            // Dispersal can leave completed, ownerless webs in the graph. Repair
            // acceptance damages a ready outer layer still staffed by a live team.
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
    return { rows };
})();
