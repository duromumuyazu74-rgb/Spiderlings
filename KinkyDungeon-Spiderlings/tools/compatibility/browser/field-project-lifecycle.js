(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance;
    setup("field-project-lifecycle");
    const oldLimit = KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit;
    try {
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "1";
        KDMapData.GridWidth = 40;
        KDMapData.GridHeight = 20;
        const floor = (x, y) =>
            (x >= 3 && x <= 7 && y >= 7 && y <= 11) ||
            (x >= 23 && x <= 35 && y >= 3 && y <= 15) ||
            (y === 9 && x >= 1 && x <= 38);
        KDMapData.Grid =
            Array.from({ length: 20 }, (_, y) =>
                Array.from({ length: 40 }, (_, x) => (floor(x, y) ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.Tiles = {};
        for (let y = 1; y < 19; y++) for (let x = 23; x < 39; x++) KDMapData.Tiles[`${x},${y}`] = { Protected: true };
        KDMapData.StartPosition = { x: 1, y: 9 };
        KDMapData.EndPosition = { x: 38, y: 9 };
        KinkyDungeonGenNavMap();
        KDMovePlayer(5, 9, false);
        const worker = spawn("Spinner", 5, 8);
        worker.hostile = 999;
        worker.aware = true;
        worker.vp = 10;
        worker.AI = "guard";
        const placed = Spiderlings.SpinnerNativeField.addEnclosure({
            compositeId: "retained-small-native",
            owners: [worker.id],
            layers: [
                {
                    id: "retained-small-inner",
                    vertices: [
                        { x: 3, y: 7 },
                        { x: 7, y: 7 },
                        { x: 7, y: 11 },
                        { x: 3, y: 11 },
                    ],
                    gate: { x: 7, y: 9 },
                },
            ],
            autoSeal: false,
        });
        expect(placed.added, "The retained small native field was not legal");
        Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
        const encounter = Spiderlings.SpinnerNativeField.state(),
            group = Object.values(encounter.ai.groups)[0],
            original = encounter.ai.plans[group.planId];
        const paidBefore = encounter.topology.actionLog.length;
        for (let i = 0; i < 18; i++) await turn();
        expect(
            encounter.topology.actionLog.length > paidBefore,
            "The sole guard Spinner stopped paid construction beside recognized prey",
        );
        expect(
            Object.values(encounter.command.requests).some((request) => request.kind === "build"),
            "The sole native builder never requested support",
        );
        const initialPaid = encounter.topology.actionLog.length;
        KDMapData.Tiles = {};
        KDMovePlayer(29, 9, false);
        const rows = [];
        for (let i = 0; i < 48 && group.planId === original.id; i++) {
            await turn();
            rows.push({
                i,
                planId: group.planId,
                project: original.projectState,
                lifecycle: { ...original.lifecycle, completed: original.lifecycle?.completed?.length },
            });
        }
        expect(group.planId !== original.id, "The obsolete small field occupied the only slot indefinitely");
        expect(original.status === "retired", "Replacement did not retire the old project");
        expect(
            !Spiderlings.SpinnerTopology.isInsideCommonCore(encounter.topology, original.compositeId, original.center),
            "Retired field remained a capture destination",
        );
        const remnants = encounter.topology.links.filter((link) => link.residual && link.hp > 0);
        expect(remnants.length > 0, "Retirement erased the paid web instead of retaining residuals");
        expect(
            Spiderlings.SpinnerNativeField.preparedCells().length > 0,
            "Residuals did not use passive silk traversal",
        );
        const retiredIds = remnants.map((link) => link.id),
            replacementId = group.planId;
        const saved = save();
        restore(saved);
        let current = Spiderlings.SpinnerNativeField.state();
        expect(current.ai.plans[original.id].status === "retired", "Load resurrected the retired command");
        expect(current.ai.groups[group.id].planId === replacementId, "Load changed the replacement project");
        for (let i = 0; i < 24; i++) await turn();
        current = Spiderlings.SpinnerNativeField.state();
        expect(
            current.topology.links.filter((link) => retiredIds.includes(link.id)).every((link) => link.hp <= 0),
            "Unused retired webs failed to dissipate through positive world time",
        );
        return { initialPaid, replacementId, retiredIds, rows, finalPaid: current.topology.actionLog.length };
    } finally {
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = oldLimit;
    }
})();
