(async () => {
    const { setup, spawn, frame, expect, save, restore, photo, turn } = globalThis.normalAcceptance;
    setup("boss-prison-room");
    KDMapData.GridWidth = 40;
    KDMapData.GridHeight = 30;
    KDMapData.Grid = Array.from(
        { length: 30 },
        (_, y) => Array.from({ length: 40 }, (_, x) => (x && y && x < 39 && y < 29 ? "0" : "1")).join("") + "\n",
    ).join("");
    Object.assign(KDMapData, {
        Tiles: {},
        JailPoints: [],
        SpecialAreas: [],
        ShortcutPositions: {},
        UsedEntrances: {},
        PotentialEntrances: [],
        StartPosition: { x: 2, y: 2 },
        EndPosition: { x: 37, y: 27 },
    });
    KDMovePlayer(14, 10, false);
    KinkyDungeonGenNavMap();
    const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
    slot.main = "";
    slot.data[""] = KDMapData;
    Object.assign(KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY], {
        RoomType: "",
        Checkpoint: "grv",
        type: "basic",
    });
    save();
    const entrance = spawn("NestEntrance", 16, 10, "Enemy");
    expect(Spiderlings.Prison.enter({ entrance, mode: "voluntary" }), "Cannot enter V6 prison");
    const prisonRoom = KDGameData.RoomType;
    Spiderlings.BossRoom.ensureEntrance();
    const door = KDMapData.SpiderlingsCourtDoor;
    expect(door && KinkyDungeonMapGet(door.x, door.y) === "H", "Boss door missing from prison");
    const residentIds = Object.values(KDMapData.SpiderlingsPrison.residentIds);
    const sourceGrid = KDMapData.Grid;
    const level = MiniGameKinkyDungeonLevel;
    KDGoThruTile(door.x, door.y, true, true, true, true);
    expect(Spiderlings.BossRoom.active(), "Native prison shortcut did not enter Boss room");
    let boss = Spiderlings.BossEncounter.boss();
    expect(boss && boss.Enemy.GFX.spriteWidth === 216, "Enlarged Spinner demo was not registered");
    expect(
        Spiderlings.BossFootprint.cells(boss).every((point) => KinkyDungeonEnemyAt(point.x, point.y)),
        "Boss does not physically occupy all nine cells",
    );
    const fixed = KDMapData.Entities.filter(Spiderlings.BossEncounter.isFixedFormation);
    expect(
        fixed.filter((enemy) => enemy.Enemy.name === "Spinner").length === 8,
        "Opening builder count differs from eight: " +
            JSON.stringify({
                state: Spiderlings.BossEncounter.state(),
                cells: [
                    [7, 7],
                    [20, 7],
                    [33, 7],
                    [33, 20],
                    [33, 33],
                    [20, 33],
                    [7, 33],
                    [7, 20],
                ].map(([x, y]) => ({
                    x,
                    y,
                    tile: KinkyDungeonMapGet(x, y),
                    enemy: KinkyDungeonEntityAt(x, y)?.Enemy?.name,
                })),
            }),
    );
    const oldCap = KDModSettings.Spiderlings.spiderlingsMapPopulationCap;
    KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "1";
    expect(Spiderlings.availableSpiderlingSlots() === 1, "Fixed Boss formations consumed ordinary population capacity");
    KDModSettings.Spiderlings.spiderlingsMapPopulationCap = oldCap;
    const bx = boss.x,
        by = boss.y;
    KinkyDungeonMapSet(bx + 2, by, "1");
    KDMoveEntity(boss, bx + 1, by, true);
    expect(boss.x === bx && boss.y === by, "Boss footprint crossed a wall");
    KinkyDungeonMapSet(bx + 2, by, "0");
    KDMoveEntity(boss, bx + 1, by, true);
    expect(
        boss.x === bx + 1 &&
            Spiderlings.BossFootprint.cells(boss).every((point) => KinkyDungeonEnemyAt(point.x, point.y)),
        "Boss parts did not move together",
    );
    const edge = KDMapData.Entities.find((enemy) => enemy.SpiderlingsBossParent === boss.id);
    const hp = boss.hp;
    KinkyDungeonDamageEnemy(
        edge,
        { damage: 5, type: "fire" },
        true,
        true,
        undefined,
        undefined,
        KinkyDungeonPlayerEntity,
    );
    expect(boss.hp < hp && edge.hp > 0, "An edge hit did not damage the shared boss health");
    expect(
        KinkyDungeonEntityAt(boss.x + 1, boss.y)?.id === boss.id,
        "An edge click selected a separate enemy identity",
    );
    KDMovePlayer(boss.x + 2, boss.y, false);
    const meleeHP = boss.hp;
    KDSendInput(
        "move",
        {
            dir: { x: -1, y: 0, delta: 0 },
            delta: 1,
            AllowInteract: true,
            AutoDoor: false,
            AutoPass: true,
            sprint: false,
            SuppressSprint: false,
        },
        false,
        true,
    );
    expect(boss.hp < meleeHP, "Native edge melee input did not hit the multi-cell boss");
    KDMovePlayer(boss.x, boss.y + 4, false);
    const beforeAura = boss.hp;
    globalThis.compatibilitySetSeed("boss-weapon-aura");
    KinkyDungeonDamageEnemy(
        boss,
        { type: "fire", damage: 1 },
        false,
        true,
        undefined,
        undefined,
        KinkyDungeonPlayerEntity,
    );
    const expectedAura = beforeAura - boss.hp;
    boss.hp = beforeAura;
    globalThis.compatibilitySetSeed("boss-weapon-aura");
    KDEventMapWeapon.tick.AoEDamage({ damage: "fire", power: 1, aoe: 8 }, { name: "boss-test-aura" }, {});
    expect(
        Math.abs(beforeAura - boss.hp - expectedAura) < 0.0001,
        "Native direct weapon aura counted footprint parts repeatedly",
    );
    const scene = await photo();
    restore(save());
    boss = Spiderlings.BossEncounter.boss();
    expect(
        KDMapData.Entities.filter((enemy) => enemy.SpiderlingsBossParent === boss.id).length === 8,
        "Reload duplicated or lost footprint parts",
    );
    KDGoThruTile(Spiderlings.BossRoom.EXIT.x, Spiderlings.BossRoom.EXIT.y, true, true, true, true);
    expect(Spiderlings.BossRoom.active(), "Unfinished Boss allowed return stairs");
    const ally = spawn("Spinner", 3, 3, "Player");
    ally.allied = true;
    KinkyDungeonDamageEnemy(
        boss,
        { damage: 10000, type: "fire" },
        true,
        true,
        undefined,
        undefined,
        KinkyDungeonPlayerEntity,
    );
    expect(
        Spiderlings.BossEncounter.state().phase === "interlude" && KDMapData.Entities.includes(boss),
        "First defeat removed the Boss",
    );
    expect(Spiderlings.BossEncounter.state().nests.length === 4, "Four original Nest objectives missing");
    const regenHP = boss.hp;
    KinkyDungeonDamageEnemy(
        boss,
        { damage: 10000, type: "fire" },
        true,
        true,
        undefined,
        undefined,
        KinkyDungeonPlayerEntity,
    );
    expect(boss.hp === regenHP, "Interlude Boss accepted damage");
    for (const goal of Spiderlings.BossEncounter.state().nests) {
        const nest = KDMapData.Entities.find((enemy) => enemy.id === goal.id);
        expect(
            nest,
            "Original Nest failed to spawn: " +
                JSON.stringify({
                    goal,
                    nests: Spiderlings.BossEncounter.state().nests,
                    grid: [
                        [5, 5],
                        [35, 5],
                        [5, 35],
                        [35, 35],
                    ].map(([x, y]) => ({
                        x,
                        y,
                        tile: KinkyDungeonMapGet(x, y),
                        enemy: KinkyDungeonEntityAt(x, y)?.Enemy?.name,
                    })),
                }),
        );
        nest.hp = 0;
        KDRemoveEntity(nest, true, false, false);
    }
    await turn();
    expect(Spiderlings.BossEncounter.state().phase === "two", "Fourth Nest did not begin phase two");
    KinkyDungeonDamageEnemy(
        boss,
        { damage: 10000, type: "fire" },
        true,
        true,
        undefined,
        undefined,
        KinkyDungeonPlayerEntity,
    );
    expect(Spiderlings.BossRoom.state().complete, "Phase-two defeat did not open the room");
    expect(KDMapData.Entities.includes(ally) && ally.hp > 0, "Victory erased a player ally");
    expect(Spiderlings.BossRoom.returnToPrison(), "Victory did not return to the native prison");
    await frame();
    expect(
        KDGameData.RoomType === prisonRoom && MiniGameKinkyDungeonLevel === level,
        "Boss return changed prison identity or journey depth",
    );
    expect(KDMapData.Grid === sourceGrid, "Boss return regenerated the prison grid");
    expect(
        JSON.stringify(Object.values(KDMapData.SpiderlingsPrison.residentIds)) === JSON.stringify(residentIds),
        "Boss return recreated prison residents",
    );
    KDGoThruTile(door.x, door.y, true, true, true, true);
    expect(Spiderlings.BossRoom.active() && Spiderlings.BossRoom.state().complete, "Completed room did not persist");
    return {
        ok: true,
        scenario: "boss-room",
        prisonRoom,
        bossRoom: KDGameData.RoomType,
        fixedCount: fixed.length,
        level,
        images: { opening: scene },
    };
})();
