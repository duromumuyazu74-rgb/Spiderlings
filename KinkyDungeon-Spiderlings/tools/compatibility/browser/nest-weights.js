(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const records = [];
    {
        const previous = KDModSettings.Spiderlings;
        const nativeRandom = KDRandom;
        const nativeSummon = KinkyDungeonSummonEnemy;
        try {
            KinkyDungeonStartNewGame(false);
            KDMapData.Entities = [];
            KDMapData.Bullets = [];
            KDUpdateEnemyCache = true;
            for (let y = 3; y < 16; y++)
                for (let x = 3; x < 19; x++) {
                    KinkyDungeonMapSet(x, y, "0");
                    KinkyDungeonTilesDelete(`${x},${y}`);
                }
            KDMovePlayer(10, 10, false);
            KDModSettings.Spiderlings = {};
            KinkyDungeonSendEvent("afterModSettingsLoad", {});
            Spiderlings.ensureModSettings();
            const defaults = Spiderlings.getSharedSpiderlingWeights();
            expect(
                JSON.stringify(defaults) ===
                    JSON.stringify({
                        Spinner: 4,
                        Jumper: 1,
                        WebCaster: 2,
                        Tunneler: 1,
                        MageSpiderlings: 1,
                    }),
                `Fresh initialized weights are wrong: ${JSON.stringify(defaults)}`,
            );
            const nest = DialogueCreateEnemy(8, 8, "NestEntrance");
            nest.aware = true;
            const births = [];
            KinkyDungeonSummonEnemy = function (...args) {
                const result = nativeSummon.apply(this, args);
                births.push({ name: args[2], count: result?.length || 0 });
                return result;
            };
            for (const [roll, expected] of [
                [0.35, "Spinner"],
                [0.5, "Jumper"],
                [0.65, "WebCaster"],
            ]) {
                let calls = 0;
                KDRandom = () => (++calls === 1 ? 0 : calls === 2 ? roll : nativeRandom());
                nest.SpiderlingsNestReinforcementTimer = 0;
                expect(
                    Spiderlings.runNestReinforcements(null, { allied: false, delta: 2 }) === 1,
                    `Fresh initialized settings failed to summon through the native path: ${JSON.stringify({
                        calls,
                        births,
                        hostile: KDHostile(nest),
                        vision: nest.Enemy.visionRadius,
                        nest: [nest.x, nest.y, nest.hp, nest.SpiderlingsNestReinforcementTimer],
                        player: [KinkyDungeonPlayerEntity.x, KinkyDungeonPlayerEntity.y],
                    })}`,
                );
                expect(
                    births.at(-1).name === expected && births.at(-1).count === 1,
                    `Fresh runtime selector chose ${JSON.stringify(births.at(-1))} at ${roll}`,
                );
                for (const child of [...KDMapData.Entities].filter((e) => e.SpiderlingsNestParentID === nest.id))
                    KDRemoveEntity(child, false, false, true);
            }
            KDModSettings.Spiderlings = { spiderlingsNestSpinnerWeight: 0, spiderlingsNestJumperWeight: 7 };
            KinkyDungeonSendEvent("afterModSettingsLoad", {});
            Spiderlings.ensureModSettings();
            const saved = Spiderlings.getSharedSpiderlingWeights();
            expect(
                saved.Spinner === 0 && saved.Jumper === 7 && saved.WebCaster === 2,
                "Explicit saved zero/custom values were replaced",
            );
            let calls = 0;
            KDRandom = () => (++calls === 1 ? 0 : calls === 2 ? 0.35 : nativeRandom());
            nest.SpiderlingsNestReinforcementTimer = 0;
            expect(
                Spiderlings.runNestReinforcements(null, { allied: false, delta: 2 }) === 1 &&
                    births.at(-1).name === "Jumper",
                "Saved weights did not reach the native runtime selector",
            );
            records.push({ case: "fresh-and-saved-settings", defaults, saved, births });
        } finally {
            KDModSettings.Spiderlings = previous;
            KDRandom = nativeRandom;
            KinkyDungeonSummonEnemy = nativeSummon;
        }
    }
    for (const weights of [
        { Tunneler: 1, Mage: 1 },
        { Tunneler: 0, Mage: 1 },
        { Tunneler: 0, Mage: 0 },
    ]) {
        KinkyDungeonStartNewGame(false);
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        KDUpdateEnemyCache = true;
        MiniGameKinkyDungeonLevel = 1;
        for (let y = 3; y < 16; y++)
            for (let x = 3; x < 19; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(10, 10, false);
        const previous = { ...KDModSettings.Spiderlings };
        const savedSettings = localStorage.getItem("KDModSettings");
        try {
            for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "Mage"])
                KDModSettings.Spiderlings[`spiderlingsNest${name}Weight`] = weights[name] || 0;
            KinkyDungeonSendEvent("afterModConfig", {});
            localStorage.setItem("KDModSettings", JSON.stringify(KDModSettings));
            KDLoadModSettings();
            const nest = DialogueCreateEnemy(8, 8, "NestEntrance");
            nest.aware = true;
            expect(KDGetEffSecurityLevel() < 0, "Fixture must be below natural Mage eligibility");
            for (let turn = 0; turn < 250; turn++) {
                Spiderlings.runNestReinforcements(null, { allied: false, delta: 1 });
                if (turn % 10 === 0) await new Promise((resolve) => requestAnimationFrame(resolve));
            }
            const births = {};
            for (const entity of KDMapData.Entities.filter((e) => e.SpiderlingsNestParentID === nest.id))
                births[entity.Enemy.name] = (births[entity.Enemy.name] || 0) + 1;
            expect(!births.Spinner && !births.Jumper && !births.WebCaster, "Zero-weight species spawned");
            expect((births.Tunneler || 0) <= (weights.Tunneler ? 3 : 0), "Tunneler exclusion or lifetime cap failed");
            if (weights.Mage) expect(births.MageSpiderlings > 0, "Configured Mage was excluded at low floor");
            else expect(Object.keys(births).length === 0, "All-zero pool spawned a fallback");
            records.push({ weights, security: KDGetEffSecurityLevel(), births });
        } finally {
            KDModSettings.Spiderlings = previous;
            if (savedSettings === null) localStorage.removeItem("KDModSettings");
            else localStorage.setItem("KDModSettings", savedSettings);
        }
    }
    return records;
})();
