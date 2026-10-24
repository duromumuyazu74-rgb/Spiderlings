(async () => {
    const { setup, spawn, frame, expect, save, restore, turn } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const density = Spiderlings.SilkDensity;
    const worn = () => KinkyDungeonAllRestraintDynamic().map(({ item }) => item);
    const equip = (name) => KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(name), 0, false, "");
    setup("silk-density-cocoon");
    KDModSettings.Spiderlings.spiderlingsEnableHood = false;
    KDMovePlayer(10, 10, false);
    for (const family of Spiderlings.Webbing.LV3_FAMILIES)
        if (family !== "Hood") equip("SpiderlingsWebbingLv3" + family);
    const spinner = spawn("Spinner", 9, 10, "Enemy");
    density.state().value = 90;
    KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        KDPlayer(),
        "tickle",
        { profile: "Spinner" },
        null,
        "Enemy",
        null,
        spinner,
    );
    expect(
        worn().some((item) => item.name === "SpiderlingsWebbingCocoon"),
        "Spinner did not finish Cocoon at density threshold",
    );
    expect(density.state().value === 100, "Cocoon consumed saved density");
    expect(!KinkyDungeonPlayerBuffs.SpiderlingsWebSpraySlow, "Cocoon required spray slow");
    for (let i = 0; i < 30; i++) density.contact(spinner);
    expect(density.state().value === 400, "Density was capped at 100");
    await frame();
    restore(save());
    expect(density.state().value === 400, "Native load lost density");
    rows.push({ name: "spinner-cocoon-and-persistence", density: density.state().value, count: worn().length });

    setup("silk-density-equipped-quiet");
    KDMovePlayer(10, 10, false);
    equip("SpiderlingsWebbingCocoon");
    expect(
        worn().some((item) => item.name === "SpiderlingsWebbingCocoon"),
        "Quiet fixture lacks Cocoon",
    );
    density.state().value = 400;
    for (let i = 0; i < 10; i++) await turn();
    expect(density.state().value === 400, "Quiet grace ended early while restrained");
    restore(save());
    for (let i = 0; i < 12; i++) await turn();
    expect(Math.abs(density.state().value - 200) < 1e-6, "Quiet equipped decay or saved grace mismatch");
    expect(
        worn().some((item) => item.name === "SpiderlingsWebbingCocoon"),
        "Decay removed the equipped Cocoon",
    );
    rows.push({ name: "native-equipped-quiet-decay", before: 400, after: density.state().value });

    const progress = [];
    for (const value of [0, 300]) {
        setup("silk-density-native-work");
        KDMovePlayer(10, 10, false);
        equip("SpiderlingsWebbingLv3Arm");
        density.state().value = value;
        const item = worn().find((entry) => entry.name === "SpiderlingsWebbingLv3Arm");
        const group = KinkyDungeonGetRestraintByName(item.name).Group;
        KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
        KDSendInput("struggle", { group, type: "Cut", index: 0 });
        await frame();
        for (let n = 0; KDGameData.DelayedActions.length && n < 10; n++) {
            KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
            await turn();
        }
        progress.push({ value, cut: item.cutProgress || 0, present: worn().includes(item) });
    }
    expect(progress[0].cut > 0 && progress[1].cut > 0, "Native Cut did not earn progress");
    expect(progress[1].cut < progress[0].cut / 2, "High density did not increase native escape work");
    rows.push({ name: "native-escape-work", progress });

    const retained = density.state().value;
    const quiet = density.state().bareTurns;
    while (worn().length) {
        const item = worn()[0];
        KinkyDungeonRemoveRestraint(KDRestraint(item).Group, false);
    }
    expect(density.state().bareTurns === quiet, "Removing equipment reset quiet time");
    density.advance(Math.max(0, 10 - quiet));
    expect(density.state().value === retained, "Quiet grace ended early");
    const age = Math.max(0, quiet - 10);
    density.advance(12);
    const expected = retained * 2 ** (-((age + 12) ** 2 - age ** 2) / 144);
    expect(Math.abs(density.state().value - expected) < 1e-6, "Post-grace decay mismatch");
    rows.push({ name: "equipment-independent-decay", before: retained, after: density.state().value });

    setup("prison-native-resting");
    KDMapData.GridWidth = 40;
    KDMapData.GridHeight = 30;
    KDMapData.Grid =
        Array.from({ length: 30 }, (_, y) =>
            Array.from({ length: 40 }, (_, x) => (x && y && x < 39 && y < 29 ? "0" : "1")).join(""),
        ).join("\n") + "\n";
    KDMapData.Tiles = {};
    KDMapData.ShortcutPositions = {};
    KDMapData.UsedEntrances = {};
    KDMapData.PotentialEntrances = [];
    KDMapData.SpecialAreas = [];
    KDMovePlayer(14, 10, false);
    KinkyDungeonGenNavMap();
    const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
    slot.main = "";
    slot.data[KDGameData.RoomType] = KDMapData;
    const journey = KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY];
    journey.RoomType = "";
    journey.Checkpoint = "grv";
    journey.type = "basic";
    save();
    const entrance = spawn("NestEntrance", 16, 10, "Enemy");
    expect(Spiderlings.Prison.enter({ entrance, mode: "voluntary" }), "Cannot enter actual prison for dormancy");
    const exit = KDMapData.SpiderlingsPrison.exit;
    const reservePoint = { x: exit.x - 2, y: exit.y + 2 };
    expect(KinkyDungeonMapGet(reservePoint.x, reservePoint.y) === "0", "Dormancy reserve is not on native floor");
    const reserve = spawn("Spinner", reservePoint.x, reservePoint.y, "Enemy");
    KDPlayer().sound = 0;
    Spiderlings.PrisonActivity.prepare(1);
    expect(Spiderlings.PrisonActivity.isResting(reserve), "Unassigned reserve was not resting");
    const location = { x: reserve.x, y: reserve.y };
    const result = KinkyDungeonEnemyLoop(reserve, KDPlayer(), 1);
    expect(
        result.idle && reserve.x === location.x && reserve.y === location.y,
        "Resting native enemy loop executed combat movement",
    );
    KDSendInput("noise", {});
    await frame();
    expect(!Spiderlings.PrisonActivity.isResting(reserve), "Native player shout did not wake nearby reserve");
    rows.push({ name: "native-prison-sleep-and-player-noise", id: reserve.id, location, awake: true });
    return {
        checks: [
            "non-WebCaster Cocoon",
            "uncapped density",
            "native save/load",
            "native equipped quiet decay",
            "native escape effort",
            "ten-turn quiet grace",
            "accelerating decay",
            "native prison dormancy and shout",
        ],
        rows,
    };
})();
