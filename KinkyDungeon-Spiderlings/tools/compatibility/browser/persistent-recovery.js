(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance,
        field = Spiderlings.SpinnerNativeField,
        recovery = Spiderlings.SpinnerRecovery,
        ai = Spiderlings.SpinnerAI,
        topology = Spiderlings.SpinnerTopology,
        rows = (globalThis.normalTrace = []);
    const prepare = (seed) => {
        setup(seed);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(14, 10, false);
        const actors = [spawn("Spinner", 13, 10), spawn("Spinner", 15, 10)];
        for (const actor of actors) Object.assign(actor, { hostile: 999, aware: true, vp: 10 });
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(Spiderlings.SpinnerCapture.ID), 0, false, "");
        const bag = Spiderlings.SpinnerCapture.item();
        expect(bag, "Persistent recovery needs a real native leg bag");
        (bag.data ||= {}).wrapProgress = 1;
        return { actors, bag };
    };
    {
        const { actors, bag } = prepare("persistent-recovery-nearest"),
            home = (id, x) => ({
                compositeId: id,
                owners: actors.map((actor) => actor.id),
                built: false,
                layers: [
                    {
                        id,
                        vertices: [
                            { x: x - 2, y: 8 },
                            { x: x + 2, y: 8 },
                            { x: x + 2, y: 12 },
                            { x: x - 2, y: 12 },
                        ],
                        gate: { x: x + 2, y: 10 },
                    },
                ],
            });
        field.initializeEnclosure(home("far", 22));
        field.addEnclosure(home("near", 10));
        field.state().builders = {};
        ai.beginTurn({ activate: true, adoptExisting: true });
        let hits = 0;
        const bind = KDPlayerEffects.SpiderlingsWebbingEnemyBind;
        KDPlayerEffects.SpiderlingsWebbingEnemyBind = function (...args) {
            if (args[2]?.profile === "Spinner") hits++;
            return bind.apply(this, args);
        };
        try {
            for (let cycle = 0; cycle < 2; cycle++) {
                KDMovePlayer(14, 10, false);
                for (const original of actors) {
                    const actor = KDMapData.Entities.find((entry) => entry.id === original.id);
                    actor.aware = true;
                    actor.vp = 10;
                }
                const row = { cycle, hitsBefore: hits, positions: [], destinations: [] };
                rows.push(row);
                for (let tick = 0; tick < 90; tick++) {
                    await turn();
                    const active = recovery.state(),
                        goal = active && recovery.destination(active);
                    if (goal) row.destinations.push(goal.compositeId);
                    row.positions.push({ x: KDPlayer().x, y: KDPlayer().y, sources: recovery.strength() });
                    if (topology.isInsideCommonCore(field.state().topology, "near", KDPlayer()) && !active) break;
                }
                expect(hits > row.hitsBefore, `No repeat native hit: ${JSON.stringify(row)}`);
                expect(
                    row.positions.some((position) => position.sources > 0),
                    `No repeat attachment: ${JSON.stringify(row)}`,
                );
                expect(
                    row.destinations.every((id) => id === "near"),
                    `Not the nearest field: ${JSON.stringify(row)}`,
                );
                expect(
                    topology.isInsideCommonCore(field.state().topology, "near", KDPlayer()),
                    `No repeated return: ${JSON.stringify(row)}`,
                );
                expect(
                    Spiderlings.SpinnerCapture.item()?.id === bag.id &&
                        Spiderlings.SpinnerCapture.item().data.wrapProgress === 1,
                    "Recovery replaced or reset the leg bag",
                );
                restore(save());
                expect(Spiderlings.SpinnerCapture.item().id === bag.id, "Reload lost the retained bag");
            }
        } finally {
            KDPlayerEffects.SpiderlingsWebbingEnemyBind = bind;
        }
    }
    {
        const { bag } = prepare("persistent-recovery-rebuild");
        field.ensureMap({ scenario: "recovery-no-field" });
        expect(recovery.needsField(), "Fixture already has a recovery field");
        ai.beginTurn({ activate: true });
        const row = { mode: "rebuild", turns: [] };
        rows.push(row);
        for (let tick = 0; tick < 100; tick++) {
            await turn();
            const graph = field.state()?.topology;
            row.turns.push({
                tick,
                actions: graph?.actionLog.length,
                cores: Object.values(graph?.composites || {}).map((composite) => composite.core),
            });
            if (graph?.actionLog.length > 2) break;
        }
        const graph = field.state()?.topology,
            composites = Object.values(graph?.composites || {});
        expect(
            composites.some((composite) => topology.isInsideCommonCore(graph, composite.id, { x: 14, y: 10 })),
            `New field did not surround the observed wearer: ${JSON.stringify(row)}`,
        );
        expect(graph.actionLog.length > 2, `New field never received paid construction: ${JSON.stringify(row)}`);
        expect(Spiderlings.SpinnerCapture.item() === bag, "Building changed the leg bag");
    }
    return { rows };
})();
