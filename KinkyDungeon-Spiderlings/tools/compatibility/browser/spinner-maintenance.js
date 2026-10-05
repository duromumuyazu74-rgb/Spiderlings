(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance,
        native = Spiderlings.SpinnerNativeField,
        capture = Spiderlings.SpinnerCapture,
        ai = Spiderlings.SpinnerAI,
        rows = (globalThis.normalTrace = []);
    for (const damage of [0.5, 100]) {
        setup(`spinner-maintenance-${damage}`);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(14, 10, false);
        const actors = [spawn("Spinner", 13, 10), spawn("Spinner", 15, 10)],
            row = { damage, actions: [], turns: [] };
        rows.push(row);
        for (const actor of actors) actor.hostile = 999;
        native.initializeEnclosure({
            compositeId: "maintenance-home",
            owners: actors.map((actor) => actor.id),
            built: true,
            autoSeal: true,
            layers: [
                {
                    id: "maintenance-ring",
                    vertices: [
                        { x: 10, y: 6 },
                        { x: 18, y: 6 },
                        { x: 18, y: 14 },
                        { x: 10, y: 14 },
                    ],
                    gate: { x: 18, y: 10 },
                },
            ],
        });
        // Adopt a retained paid field into the real autonomous dispatcher.
        native.state().builders = {};
        ai.beginTurn({ activate: true, adoptExisting: true });
        expect(capture.hit(actors[0]), "The closed field must admit Capture through an actual hit");
        KinkyDungeonEnemyLoop(actors[1], KDPlayer(), 1, 1, []);
        expect(capture.state().sourceIds.length === 2, "Both workers must start as actual Capture sources");
        capture.state().weaveProgress = 10;
        capture.state().escapeProgress = 7;
        const proxy = KDMapData.Entities.find((actor) => native.isOwnedProxy(actor) && actor.x === 18 && actor.y === 9);
        expect(proxy, "Damage fixture needs a real projected web cell");
        native.onNativeDamage({ enemy: proxy, dmgDealt: damage });
        const damagedLinkId = native.state().topology.links.find((link) => link.hp < link.maxHp).id;
        const snapshot = () =>
            JSON.stringify({
                capture: capture.state(),
                links: native.state().topology.links.map(({ id, hp, cooldown, builtCells, connected }) => ({
                    id,
                    hp,
                    cooldown,
                    builtCells,
                    connected,
                })),
                actors: KDMapData.Entities.filter((actor) => actor.Enemy.name === "Spinner").map(
                    ({ id, x, y, SpinnerConstructionPoints }) => ({ id, x, y, SpinnerConstructionPoints }),
                ),
            });
        KinkyDungeonDressPlayer();
        UpdateModels(KinkyDungeonPlayer);
        DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
        const before = snapshot();
        restore(save());
        expect(snapshot() === before, "Zero-time load must not release Capture sources or repair web damage");
        const apply = native.applyPaidAction;
        native.applyPaidAction = function (actor, action) {
            const result = apply.apply(this, arguments);
            row.actions.push({
                source: actor.id,
                type: action.type,
                cell: action.cell,
                applied: result.applied,
                activeCapture: !!capture.state(),
                sources: capture.state()?.sourceIds.length || 0,
            });
            return result;
        };
        try {
            for (let tick = 0; tick < 100; tick++) {
                await turn();
                if (
                    damage >= 100 &&
                    !row.midReload &&
                    row.actions.some((action) => action.applied && action.activeCapture)
                ) {
                    const savedWork = snapshot(),
                        savedJob = JSON.stringify(Object.values(native.state().ai.groups)[0]?.maintenance);
                    restore(save());
                    expect(
                        snapshot() === savedWork,
                        "Reload during rebuild must preserve damage, Capture progress and paid position",
                    );
                    expect(
                        JSON.stringify(Object.values(native.state().ai.groups)[0]?.maintenance) === savedJob,
                        "Reload must retain the maintenance member for later extension",
                    );
                    row.midReload = true;
                }
                const link = native.state().topology.links.find((entry) => entry.id === damagedLinkId);
                row.turns.push({
                    tick,
                    hp: link.hp,
                    connected: link.connected,
                    cells: link.builtCells.length,
                    maintenance: structuredClone(Object.values(native.state().ai.groups)[0]?.maintenance),
                    sources: capture.state()?.sourceIds,
                    assignments: structuredClone(Object.values(native.state().ai.groups)[0]?.assignments),
                });
                if (link.hp === link.maxHp && native.captureGeometryReady(KDPlayer())) break;
            }
        } finally {
            native.applyPaidAction = apply;
        }
        expect(
            row.actions.some((action) => action.applied && action.activeCapture && action.sources >= 1),
            `Capture starved paid maintenance: ${JSON.stringify(row)}`,
        );
        const link = native.state().topology.links.find((entry) => entry.id === damagedLinkId);
        if (damage >= 100)
            expect(
                row.actions.some((action) => action.applied && action.activeCapture && action.type === "extendLink"),
                "A destroyed multi-cell link must retain paid extension after its first rebuilt cell during Capture",
            );
        expect(
            link.hp === link.maxHp && native.captureGeometryReady(KDPlayer()),
            `The retained crew did not repair and close its field: ${JSON.stringify(row)}`,
        );
        expect(
            row.actions.filter((action) => action.activeCapture).every((action) => action.sources >= 1),
            "Repair must preserve an effective Capture source",
        );
        capture.cancel();
    }
    return { rows };
})();
