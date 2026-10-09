(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    KinkyDungeonStartNewGame(false);
    const perk = KinkyDungeonStatsPresets.SpiderlingsSquad;
    expect(perk?.category === "Enemies", "Squad perk is missing");
    expect(KDPERKCOSTMULT * KDGetPerkCost(perk) === -2, "Squad must display -2 points");
    const points = KinkyDungeonGetStatPoints(KinkyDungeonStatsChoice);
    KinkyDungeonStatsChoice.set("SpiderlingsSquad", true);
    expect(
        KDPERKCOSTMULT * (KinkyDungeonGetStatPoints(KinkyDungeonStatsChoice) - points) === 2,
        "Native perk accounting failed",
    );
    KinkyDungeonStatsChoice.delete("SpiderlingsSquad");
    expect(
        !KDModConfigs.Spiderlings.some((entry) => entry.refvar === "spiderlingsSquad"),
        "Old squad toggle remains visible",
    );
    const previous = { ...KDModSettings.Spiderlings };
    const setup = () => {
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        KDUpdateEnemyCache = true;
        KDMapData.RoomType = "";
        KDGameData.RoomType = "";
        KDGameData.MapMod = "";
        MiniGameKinkyDungeonLevel = 1;
        KDMapData.GridWidth = 32;
        KDMapData.GridHeight = 24;
        KDMapData.Grid = Array.from(
            { length: 24 },
            (_, y) => (y === 0 || y === 23 ? "1".repeat(32) : "1" + "0".repeat(30) + "1") + "\n",
        ).join("");
        KDMapData.StartPosition = { x: 1, y: 1 };
        KDMapData.EndPosition = { x: 30, y: 22 };
        KDMapData.ShortcutPositions = {};
        KDMapData.RandomPathablePoints = {};
        for (let y = 11; y <= 15; y++)
            for (let x = 12; x <= 19; x++) {
                KinkyDungeonTilesDelete(`${x},${y}`);
                KDMapData.RandomPathablePoints[`${x},${y}`] = { x, y };
            }
        KDMovePlayer(2, 2, false);
        delete KDMapData.SpiderlingsGuaranteedSquadState;
    };
    try {
        setup();
        KDModSettings.Spiderlings.spiderlingsSquad = true;
        expect(
            !Spiderlings.runGuaranteedSpiderlingSquad() && KDMapData.Entities.length === 0,
            "Legacy setting enabled squad without perk",
        );
        KinkyDungeonStatsChoice.set("SpiderlingsSquad", true);
        expect(!Spiderlings.runGuaranteedSpiderlingSquad(), "Existing map was backfilled");
        setup();
        for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "Mage"])
            KDModSettings.Spiderlings[`spiderlingsNest${name}Weight`] = 0;
        expect(
            Spiderlings.runGuaranteedSpiderlingSquad(),
            "Selected squad could not spawn: " +
                JSON.stringify({
                    state: KDMapData.SpiderlingsGuaranteedSquadState,
                    room: KDGetAltType(MiniGameKinkyDungeonLevel),
                    count: KDMapData.Entities.length,
                }),
        );
        const members = KDMapData.Entities.filter((e) => e.SpiderlingsSquadProvenance === "guaranteed-squad");
        const names = members.map((e) => e.Enemy.name).sort();
        expect(
            JSON.stringify(names) ===
                JSON.stringify(["Jumper", "MageSpiderlings", "Spinner", "Spinner", "Tunneler", "WebCaster"]),
            "Squad composition mismatch",
        );
        expect(new Set(members.map((e) => `${e.x},${e.y}`)).size === 6, "Squad positions overlap");
        expect(
            members.every((e) => !e.aware),
            "Squad spawned aware",
        );
        expect(
            !Spiderlings.runGuaranteedSpiderlingSquad() && KDMapData.Entities.length === 6,
            "Squad repeated on same map",
        );
        return { displayCost: -2, names, positions: members.map(({ x, y }) => ({ x, y })), legacySettingIgnored: true };
    } finally {
        KDModSettings.Spiderlings = previous;
        KinkyDungeonStatsChoice.delete("SpiderlingsSquad");
    }
})();
