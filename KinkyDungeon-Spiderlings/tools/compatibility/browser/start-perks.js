(async () => {
    const { expect, frame, save, restore, photo } = globalThis.normalAcceptance;
    const results = [];
    const scenes = {};
    const ids = ["SpiderlingsPrisonStart", "SpiderlingsBossStart"];
    KinkyDungeonStatsChoice.clear();
    KinkyDungeonStartNewGame(false);
    // The native perk menu renders the character before confirming a new game.
    // Reuse the shared save boundary to prepare that model in this isolated scene.
    save();
    for (const id of ids) {
        const preset = KinkyDungeonStatsPresets[id];
        expect(preset?.category === "Start" && KDGetPerkCost(preset) === 0, id + " must be a free Start perk");
        KinkyDungeonStatsChoice.clear();
        expect(KDCanPickPerk(id), id + " cannot be selected");
        KinkyDungeonStatsChoice.set(id, true);
        expect(!KDCanPickPerk(ids.find((other) => other !== id)), "Location starts are not mutually exclusive");
    }
    for (const cocoon of [false, true]) {
        for (const id of ids) {
            KinkyDungeonStatsChoice.clear();
            KinkyDungeonStatsChoice.set(id, true);
            if (cocoon) KinkyDungeonStatsChoice.set("SpiderlingsCocoonStart", true);
            globalThis.compatibilitySetSeed(id + "-" + cocoon);
            KinkyDungeonStartNewGame(false);
            const bossStart = id === "SpiderlingsBossStart";
            expect(bossStart ? Spiderlings.BossRoom.active() : Spiderlings.Prison.captured(), id + " did not start");
            if (bossStart) {
                expect(!!Spiderlings.BossEncounter.boss(), "Boss start has no Matriarch");
                expect(Spiderlings.BossEncounter.state().phase === "one", "Boss start skipped phase one");
                expect(KDGameData.PrisonerState !== "jail", "Boss start inherited a captured identity");
            } else {
                const chamber = KDMapData.SpiderlingsPrison.chamber;
                expect(
                    KinkyDungeonPlayerEntity.x === chamber.x && KinkyDungeonPlayerEntity.y === chamber.y,
                    "Prison start missed the chamber",
                );
                expect(KDMapData.PrisonState === "Intro", "Prison start did not establish captivity");
            }
            const equipment = () =>
                KinkyDungeonAllRestraintDynamic()
                    .map(({ item }) => item.name)
                    .sort();
            expect(
                equipment().includes("SpiderlingsWebbingCocoon") === cocoon,
                "Location start changed Cocoon selection",
            );
            if (!cocoon) scenes[bossStart ? "bossStart" : "prisonStart"] = await photo();
            const room = KDGameData.RoomType;
            const prison = bossStart ? Spiderlings.BossRoom.state().source.room : room;
            KDMovePlayer(KinkyDungeonPlayerEntity.x + 1, KinkyDungeonPlayerEntity.y, false);
            const position = { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y };
            const worn = equipment();
            restore(save());
            expect(KDGameData.RoomType === room, "Save reload restarted the selected room");
            expect(
                KinkyDungeonPlayerEntity.x === position.x && KinkyDungeonPlayerEntity.y === position.y,
                "Save reload reapplied the location perk",
            );
            expect(JSON.stringify(equipment()) === JSON.stringify(worn), "Save reload changed starting equipment");
            if (bossStart) {
                Spiderlings.BossRoom.complete();
                expect(Spiderlings.BossRoom.returnToPrison(), "Boss start lost its prison return");
                expect(Spiderlings.Prison.isPrison() && KDGameData.RoomType === prison, "Boss returned elsewhere");
            }
            const exit = KDMapData.SpiderlingsPrison.exit;
            KDGoThruTile(exit.x, exit.y, true, true, true, true);
            expect(KDGameData.RoomType === "JourneyFloor", "Starting prison lost its source-floor return");
            expect(!Spiderlings.Prison.captured(), "Prison exit kept the starting captive identity");
            results.push({ id, cocoon, room, prison, returnRoom: KDGameData.RoomType });
        }
    }
    KinkyDungeonStatsChoice.clear();
    globalThis.compatibilitySetSeed("ordinary-start-without-location-perk");
    KinkyDungeonStartNewGame(false);
    expect(KDGameData.RoomType === "JourneyFloor", "Unselected location perks changed the ordinary start");
    await frame();
    return { results, ordinaryStart: KDGameData.RoomType, images: scenes };
})();
