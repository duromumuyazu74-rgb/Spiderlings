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
                const initialEntities = KDMapData.Entities.length;
                const turns = [],
                    planner = [];
                for (let turn = 0; turn < 11; turn++) {
                    start = performance.now();
                    KinkyDungeonLastAction = "Wait";
                    KinkyDungeonAdvanceTime(1, true);
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
