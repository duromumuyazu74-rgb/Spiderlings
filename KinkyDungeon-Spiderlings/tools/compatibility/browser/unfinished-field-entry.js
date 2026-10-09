(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance;
    setup("unfinished-field-entry-cooperation");
    const oldLimit = KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit;
    const nativeExecute = Spiderlings.SpinnerAI.executeDuty;
    const paid = [],
        rows = [];
    try {
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "1";
        KDMapData.GridWidth = 30;
        KDMapData.GridHeight = 25;
        KDMapData.Grid =
            Array.from({ length: 25 }, (_, y) =>
                Array.from({ length: 30 }, (_, x) => (x && y && x < 29 && y < 24 ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.Tiles = {};
        KDMapData.StartPosition = { x: 1, y: 1 };
        KDMapData.EndPosition = { x: 28, y: 1 };
        KinkyDungeonGenNavMap();
        const crew = [
            [11, 9],
            [12, 9],
            [13, 9],
            [13, 10],
            [11, 11],
            [12, 11],
        ].map(([x, y]) => spawn("Spinner", x, y));
        for (const actor of crew) {
            actor.hostile = 999;
            actor.aware = true;
            actor.vp = 10;
        }
        crew[2].AI = "guard";
        crew[3].AI = "guard";
        const placed = Spiderlings.SpinnerAI.initializeMapgenField({ preferredSites: [{ x: 12, y: 10 }] });
        const encounter = Spiderlings.SpinnerNativeField.state(),
            core = encounter.topology.composites[placed.compositeId].core;
        expect(!Spiderlings.SpinnerNativeField.captureGeometryReady(core), "Entry fixture began already complete");
        const originalLog = encounter.topology.actionLog.length;
        Spiderlings.SpinnerAI.executeDuty = function (actor, ...args) {
            const before = Spiderlings.SpinnerNativeField.state().topology.actionLog.length;
            const result = nativeExecute.call(this, actor, ...args);
            const after = Spiderlings.SpinnerNativeField.state().topology.actionLog.length;
            if (after > before) paid.push({ actor: actor.id, tick: KinkyDungeonCurrentTick, actions: after - before });
            return result;
        };
        KDMovePlayer(core.x - 1, core.y, false);
        KinkyDungeonMove({ x: 1, y: 0 }, 1, false, true);
        expect(KDPlayer().x === core.x && KDPlayer().y === core.y, "Native movement did not enter the unfinished core");
        for (let i = 0; i < 24; i++) {
            KinkyDungeonStatWill = KinkyDungeonStatWillMax;
            await turn();
            const state = Spiderlings.SpinnerNativeField.state();
            rows.push({
                i,
                actions: state.topology.actionLog.length,
                combat: crew.filter((actor) => actor.flags?.touchedPlayer > 0).map((actor) => actor.id),
                groups: Object.values(state.ai.groups)
                    .filter((group) => group.planId)
                    .map((group) => ({
                        id: group.id,
                        lure: group.engagement?.lureId,
                        focus: group.planningFocus,
                        work: Object.keys(group.assignments || {}),
                    })),
            });
        }
        expect(
            paid.length > 0 && new Set(paid.map((item) => item.actor)).size >= 2,
            "Prey entry diverted the whole crew from paid construction",
        );
        expect(
            rows.some((row) => row.combat.length),
            "The separate pressure role never made a native melee contact",
        );
        expect(
            rows.some((row) => row.groups.some((group) => group.focus?.target.kind === "player")),
            "The engaged field ignored the current player position",
        );
        const beforeLoad = Spiderlings.SpinnerNativeField.state().topology.actionLog.length;
        restore(save());
        expect(
            Spiderlings.SpinnerNativeField.state().topology.actionLog.length === beforeLoad,
            "Reload granted free construction",
        );
        return { initialActions: originalLog, paid, rows };
    } finally {
        Spiderlings.SpinnerAI.executeDuty = nativeExecute;
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = oldLimit;
    }
})();
