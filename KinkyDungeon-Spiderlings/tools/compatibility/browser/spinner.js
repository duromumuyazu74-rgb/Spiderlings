(async () => {
    KinkyDungeonStartNewGame(false);
    KDMapData.Entities = [];
    KDUpdateEnemyCache = true;
    KDMapData.Bullets = [];
    for (const key of Object.keys(KDMapData)) if (key.startsWith("Spiderlings")) delete KDMapData[key];
    for (const key of Object.keys(KDGameData)) if (key.startsWith("Spiderlings")) delete KDGameData[key];
    for (let y = 1; y < KDMapData.GridHeight - 1; y++)
        for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
            KinkyDungeonMapSet(x, y, x < 19 && y < 15 ? "0" : "1");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMapData.StartPosition = { x: 2, y: 2 };
    KDMapData.EndPosition = { x: 18, y: 14 };
    KDMapData.ShortcutPositions = {};
    KDMapData.JailPoints = [];
    KDPathCache = new Map();
    KDPathCacheIgnoreLocks = new Map();
    const outside = globalThis.spinnerScenario === "outside";
    KDMovePlayer(10, 8, false);
    const positions = globalThis.spinnerScenario === "solo" ? [[7, 8]] : [outside ? [10, 8] : [7, 8], [7, 9]];
    const actors = positions.map(([x, y]) => {
        const e = DialogueCreateEnemy(x, y, "Spinner");
        e.aware = true;
        e.hostile = 999;
        e.vp = 10;
        return e;
    });
    const encounter = Spiderlings.SpinnerNativeField.initializeEnclosure({
        compositeId: "spinner-regression",
        owners: actors.map((e) => e.id),
        autoSeal: false,
        layers: [
            {
                id: "inner",
                vertices: [
                    { x: 9, y: 7 },
                    { x: 11, y: 7 },
                    { x: 11, y: 9 },
                    { x: 9, y: 9 },
                ],
                gate: { x: 9, y: 8 },
            },
        ],
    });
    for (let i = 0; i < 30; i++) {
        const action = Spiderlings.SpinnerTopology.nextWorkAction(encounter.topology, actors[0].id, actors[0]);
        if (!action || ["closeGate", "connectGate"].includes(action.type)) break;
        const result = Spiderlings.SpinnerTopology.applyAction(
            encounter.topology,
            { ...action, ownerId: actors[0].id },
            Spiderlings.SpinnerNativeField.snapshot(action.cell),
        );
        if (!result.outcome.legal) throw Error(JSON.stringify(result.outcome));
        encounter.topology = result.state;
    }
    Spiderlings.SpinnerNativeField.reconcile();
    if (outside) actors[1].stun = 100;
    encounter.builders = {};
    encounter.autonomous = true;
    const ai = Spiderlings.SpinnerAI.ensureAI(encounter);
    Spiderlings.SpinnerAI.auditGroups(ai, KDMapData.Entities);
    const group = Object.values(ai.groups)[0];
    const plan = {
        id: "spinner-plan-1",
        kind: "enclosure",
        groupId: group.id,
        fieldId: "inner",
        compositeId: "spinner-regression",
        status: "preparing",
        center: { x: 10, y: 8 },
        gate: { x: 9, y: 8 },
        anchors: [
            { x: 9, y: 7 },
            { x: 11, y: 7 },
            { x: 11, y: 9 },
            { x: 9, y: 9 },
        ],
        cells: encounter.topology.fields.inner.boundaryCells.map((c) => `${c.x},${c.y}`),
        fieldIds: ["inner"],
        selectionOrdinal: 0,
        invalidReason: null,
    };
    plan.initialCells = [...plan.cells];
    ai.plans[plan.id] = plan;
    group.planId = plan.id;
    ai.nextPlanOrdinal = 2;
    if (outside) {
        KDMovePlayer(14, 8, false);
    }
    Spiderlings.SpinnerNativeField.onEntry(KinkyDungeonPlayerEntity);
    KDUpdateEnemyCache = true;
    const turns = [];
    for (let i = 0; i < 40; i++) {
        KinkyDungeonAdvanceTime(1);
        turns.push({
            x: actors[0].x,
            y: actors[0].y,
            mode: group.engagement?.mode,
            capture: !!KDGameData.SpiderlingsSpinnerCapture,
        });
        if (turns.at(-1).capture) break;
        await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    if (outside) {
        // Test.92 shortens the no-progress ambush to two turns. Movement after
        // that window is required pressure, not idle lure oscillation.
        if (new Set(turns.slice(0, 2).map((t) => `${t.x},${t.y}`)).size !== 1)
            throw new Error("Lure oscillates during the initial ambush window.");
        if (!turns.slice(0, 5).some((t) => t.mode === "pressure"))
            throw new Error("Spinner did not leave its shortened no-progress ambush.");
        if (new Set(turns.map((t) => `${t.x},${t.y}`)).size < 2)
            throw new Error("A continuously visible stationary player never triggers Spinner pressure.");
    }
    if (!outside && !turns.at(-1).capture) throw new Error("Prey in enclosure was not captured within 40 turns.");
    return { outside, turns };
})();
