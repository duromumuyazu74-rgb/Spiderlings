/* exported KDGenMapCallback */
(async () => {
    const results = (globalThis.normalTrace = []);
    const expected = ["MageSpiderlings", "Spinner", "Spinner", "WebCaster"].sort().join(",");
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    // Keep native SFX I/O out of timing and avoid the upstream MiniWind path defect.
    const sound = KDToggles.Sound;
    KDToggles.Sound = false;
    try {
        for (const [zone, floor] of [
            ["grv", 5],
            ["cat", 7],
            ["lib", 12],
        ]) {
            for (let seed = 0; seed < 10; seed++) {
                const gameSeed = `normal-acceptance-${zone}-${floor}-${seed}`;
                globalThis.compatibilitySetSeed(gameSeed);
                KinkyDungeonStartNewGame(false);
                MiniGameKinkyDungeonLevel = floor;
                globalThis.compatibilitySetSeed(gameSeed);
                let start = performance.now();
                KinkyDungeonCreateMap(
                    KinkyDungeonMapParams[zone],
                    "",
                    "SpiderlingsHuntingGrounds",
                    floor,
                    false,
                    false,
                    "Maidforce",
                    { x: seed, y: floor },
                    false,
                );
                const generationMs = performance.now() - start;
                const state = KDMapData.SpiderlingsHuntingGrounds;
                const nests = KDMapData.Entities.filter((enemy) => state?.targetIds?.includes(enemy.id));
                const guards = nests.map((nest) => ({
                    id: nest.id,
                    x: nest.x,
                    y: nest.y,
                    names: KDMapData.Entities.filter((enemy) => enemy.SpiderlingsNestParentID === nest.id)
                        .map((enemy) => enemy.Enemy.name)
                        .sort(),
                }));
                const cancelled = state?.status === "cancelled" && state.reason === "insufficient-space";
                if (cancelled && (nests.length || KDMapData.MapMod === "SpiderlingsHuntingGrounds"))
                    throw Error("Cancelled floor retained an impossible objective");
                if (
                    !cancelled &&
                    (state?.status !== "active" ||
                        nests.length !== 3 ||
                        guards.some((row) => row.names.join(",") !== expected))
                )
                    throw Error(`Hunting Grounds layout: ${JSON.stringify({ zone, floor, seed, state, guards })}`);
                for (const a of nests)
                    for (const b of nests)
                        if (a !== b && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 9)
                            throw Error("Original objective nests overlap");
                const fieldPreset = state?.fieldPreset,
                    initialWebCells = KDMapData.Entities.filter(Spiderlings.SpinnerNativeField.isOwnedProxy).length;
                if (!cancelled && !["placed", "skipped"].includes(fieldPreset?.status))
                    throw Error("New floor did not settle its one-time field preset");
                if (fieldPreset?.status === "placed") {
                    const encounter = Spiderlings.SpinnerNativeField.state(),
                        composite = encounter?.topology?.composites?.[fieldPreset.compositeId],
                        outer = encounter?.topology?.fields?.[composite?.layerIds.at(-1)],
                        crew = encounter?.ai?.groups?.[fieldPreset.groupId];
                    if (
                        Object.keys(encounter?.topology?.composites || {}).length !== 1 ||
                        !outer ||
                        outer.bounds.right - outer.bounds.left !== 8 ||
                        outer.phase !== "ready" ||
                        initialWebCells !== 31 ||
                        Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(outer.gateCell) ||
                        encounter.topology.actionLog.length !== 0 ||
                        !crew ||
                        crew.memberIds.length < 2 ||
                        composite.layerIds.some((id) =>
                            crew.memberIds.some((owner) => !encounter.topology.fieldOwners[id].includes(owner)),
                        )
                    )
                        throw Error("New floor's large open outer field changed ownership, cost or entity budget");
                }
                const initialEntities = KDMapData.Entities.length;
                // Observe the complete ecology off the entrance stair; waiting on
                // that stair can otherwise queue a native ShopStart transition.
                const entrance = KDMapData.StartPosition;
                let observer;
                for (
                    let radius = 1;
                    radius < Math.max(KDMapData.GridWidth, KDMapData.GridHeight) && !observer;
                    radius++
                )
                    for (let dy = -radius; dy <= radius && !observer; dy++)
                        for (let dx = -radius; dx <= radius && !observer; dx++) {
                            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                            const x = entrance.x + dx,
                                y = entrance.y + dy;
                            if (
                                KinkyDungeonMapGet(x, y) === "0" &&
                                !KinkyDungeonEnemyAt(x, y) &&
                                KinkyDungeonFindPath(
                                    entrance.x,
                                    entrance.y,
                                    x,
                                    y,
                                    false,
                                    false,
                                    false,
                                    KinkyDungeonMovableTilesSmartEnemy,
                                )?.length
                            )
                                observer = { x, y };
                        }
                if (!observer) throw Error("No legal observation cell beside the entrance");
                KDMovePlayer(observer.x, observer.y, false);
                KDGenMapCallback = null;
                KinkyDungeonState = "Game";
                KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
                    id: "HuntingAcceptanceObserver",
                    type: "Sneak",
                    power: 1000,
                    duration: 10000,
                });
                const observedMap = KDMapData;
                const turns = [],
                    planner = [];
                for (let turn = 0; turn < 11; turn++) {
                    start = performance.now();
                    KinkyDungeonLastAction = "Wait";
                    KinkyDungeonAdvanceTime(1, true);
                    if (KDMapData !== observedMap || (!cancelled && KDMapData.MapMod !== "SpiderlingsHuntingGrounds"))
                        throw Error("Hunting Grounds timing escaped to another map");
                    turns.push(performance.now() - start);
                    planner.push(Spiderlings.SpinnerAI.inspect()?.plannerWorkLast ?? 0);
                    await frame();
                }
                results.push({
                    zone,
                    floor,
                    seed,
                    cancelled,
                    generationMs,
                    firstTurnMs: turns[0],
                    steadyTurnMs: turns.slice(1),
                    planner,
                    initialEntities,
                    initialWebCells,
                    fieldPreset: fieldPreset ? structuredClone(fieldPreset) : undefined,
                    finalEntities: KDMapData.Entities.length,
                    guards,
                });
            }
        }
        return results;
    } finally {
        KDToggles.Sound = sound;
    }
})();
