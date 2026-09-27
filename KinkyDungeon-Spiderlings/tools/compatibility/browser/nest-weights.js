(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const records = [];
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
