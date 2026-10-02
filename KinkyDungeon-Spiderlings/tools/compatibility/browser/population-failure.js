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
                KDModSettings.Spiderlings.spiderlingsMapPopulationCap = mode === "budget" ? 11 : 25;
                const seed = "normal-acceptance-grv-5-0";
                globalThis.compatibilitySetSeed(seed);
                KinkyDungeonStartNewGame(false);
                KDToggles.Sound = false;
                MiniGameKinkyDungeonLevel = 5;
                globalThis.compatibilitySetSeed(seed);
                const original = KinkyDungeonSummonEnemy;
                let attempts = 0;
                const rejectedAt = mode === "required" ? 7 : mode === "patrol" ? 20 : Infinity;
                const born = [];
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
                        { x: 0, y: 5 },
                        false,
                    );
                } finally {
                    KinkyDungeonSummonEnemy = original;
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
                    survivingBornIds: born
                        .filter((enemy) => KDMapData.Entities.includes(enemy))
                        .map((enemy) => enemy.id),
                };
                rows.push(row);
                expect(state, `${theme}/${mode} did not enter the theme initialization path`);
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
                        !KDMapData.Entities.some((enemy) => enemy.SpiderlingsNestRosterTarget === 6),
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
