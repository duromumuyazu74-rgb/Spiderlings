(async () => {
    const { expect, frame } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const previousSettings = { ...KDModSettings.Spiderlings };
    const mobile = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]);
    try {
        for (const theme of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
            const modes =
                theme === "SpiderlingsHuntingGrounds" ? ["budget", "required", "patrol"] : ["budget", "required"];
            for (const mode of modes) {
                KDModSettings.Spiderlings.spiderlingsMapPopulationCap =
                    mode === "budget" ? (theme === "SpiderlingsInfestation" ? 5 : 11) : 25;
                // This native seed supplies both large Hunting Grounds sites in both supported runtimes.
                const seed = "normal-acceptance-grv-5-6";
                globalThis.compatibilitySetSeed(seed);
                KinkyDungeonStartNewGame(false);
                KDToggles.Sound = false;
                MiniGameKinkyDungeonLevel = 5;
                globalThis.compatibilitySetSeed(seed);
                const original = KinkyDungeonSummonEnemy;
                let attempts = 0;
                const rejectedAt =
                    mode === "required"
                        ? theme === "SpiderlingsInfestation"
                            ? 4
                            : 7
                        : mode === "patrol"
                          ? 20
                          : Infinity;
                const born = [],
                    existing = [];
                const originalSeedCrews = Spiderlings.Population.seedCrews;
                let budgetResult;
                Spiderlings.Population.seedCrews = function (options) {
                    if (mode === "budget" && theme === "SpiderlingsHuntingGrounds") {
                        for (
                            let y = 1;
                            y < KDMapData.GridHeight - 1 && Spiderlings.availableSpiderlingSlots() >= 18;
                            y++
                        )
                            for (
                                let x = 1;
                                x < KDMapData.GridWidth - 1 && Spiderlings.availableSpiderlingSlots() >= 18;
                                x++
                            ) {
                                const meta = KinkyDungeonTilesGet(x + "," + y);
                                if (
                                    KinkyDungeonMapGet(x, y) !== "0" ||
                                    meta?.OL ||
                                    meta?.Lock ||
                                    meta?.Type ||
                                    KDMapData.Entities.some((enemy) => enemy.x === x && enemy.y === y)
                                )
                                    continue;
                                existing.push(
                                    ...original(
                                        x,
                                        y,
                                        "Spinner",
                                        1,
                                        0,
                                        false,
                                        undefined,
                                        false,
                                        false,
                                        undefined,
                                        true,
                                        undefined,
                                        true,
                                        false,
                                    ),
                                );
                            }
                        expect(
                            existing.length > 0 && Spiderlings.availableSpiderlingSlots() === 17,
                            "Budget fixture did not reserve real living-spider slots",
                        );
                    }
                    const result = originalSeedCrews.call(this, options);
                    if (mode === "budget") budgetResult = result;
                    return result;
                };
                KinkyDungeonSummonEnemy = function (x, y, name, ...args) {
                    const owned =
                        KDMapData.MapMod === theme && mobile.has(typeof name === "string" ? name : name?.name);
                    if (owned && ++attempts === rejectedAt) return [];
                    const batch = original.call(this, x, y, name, ...args);
                    if (owned) born.push(...(batch || []));
                    return batch;
                };
                try {
                    KinkyDungeonCreateMap(
                        KinkyDungeonMapParams.grv,
                        "",
                        theme,
                        5,
                        false,
                        false,
                        "Maidforce",
                        { x: 6, y: 5 },
                        false,
                    );
                } finally {
                    KinkyDungeonSummonEnemy = original;
                    Spiderlings.Population.seedCrews = originalSeedCrews;
                }
                const state = KDMapData[theme];
                const row = {
                    theme,
                    mode,
                    attempts,
                    state: structuredClone(state),
                    plan: structuredClone(KDMapData.SpiderlingsPopulationPlan),
                    mapMod: KDMapData.MapMod,
                    escape: KDMapData.EscapeMethod,
                    bornIds: born.map((enemy) => enemy.id),
                    budgetResult,
                    existingIds: existing.map((enemy) => enemy.id),
                    survivingBornIds: born
                        .filter((enemy) => KDMapData.Entities.includes(enemy))
                        .map((enemy) => enemy.id),
                };
                rows.push(row);
                expect(state, `${theme}/${mode} did not enter the theme initialization path`);
                if (mode === "budget" && theme === "SpiderlingsHuntingGrounds") {
                    expect(
                        budgetResult?.reason === "population-budget",
                        "Hunting budget failed for an unrelated reason",
                    );
                    expect(
                        existing.every((enemy) => KDMapData.Entities.includes(enemy)),
                        "Cancelling the new crew removed previously existing spiders",
                    );
                }
                if (mode === "patrol") {
                    expect(attempts >= rejectedAt, "The fixture never reached optional patrol birth");
                    expect(
                        state.status === "active" && state.coreIds.length === 18,
                        "Optional failure removed required crews",
                    );
                    expect(state.patrolIds.length === 0, "Optional failure retained a partial patrol");
                    expect(
                        state.coreIds.every((id) => KDMapData.Entities.some((enemy) => enemy.id === id)),
                        "Required crew identities disappeared after optional failure",
                    );
                    expect(!KDMapData.Entities.includes(born[18]), "The first partial patrol member was not removed");
                } else {
                    if (mode === "required")
                        expect(attempts >= rejectedAt, "The fixture never reached required crew failure");
                    expect(state.status === "cancelled", `${theme}/${mode} retained an incomplete objective`);
                    expect(
                        KDMapData.MapMod !== theme && KDMapData.EscapeMethod !== theme,
                        "Cancelled theme still blocks escape",
                    );
                    expect(!KDMapData.SpiderlingsPopulationPlan, "Cancelled theme retained its population budget");
                    expect(
                        born.every((enemy) => !KDMapData.Entities.includes(enemy)),
                        "Required crew failure retained a member of its partial batch",
                    );
                    expect(
                        !KDMapData.Entities.some((enemy) => [3, 6].includes(enemy.SpiderlingsNestRosterTarget)),
                        "Cancelled theme retained a required roster nest",
                    );
                }
                await frame();
            }
        }
        return { rows, scope: "Native map generation with bounded empty-summon fault injection." };
    } finally {
        KDModSettings.Spiderlings = previousSettings;
    }
})();
