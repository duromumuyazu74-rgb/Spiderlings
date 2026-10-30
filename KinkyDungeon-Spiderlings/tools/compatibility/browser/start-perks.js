(async () => {
    const { expect, frame, save, restore, photo, registerPackagedScript } = globalThis.normalAcceptance;
    const results = [];
    const scenes = {};
    const ids = ["SpiderlingsPrisonStart", "SpiderlingsBossStart"];
    KinkyDungeonStatsChoice.clear();
    KinkyDungeonStartNewGame(false);
    // The native perk menu renders the character before confirming a new game.
    // Reuse the shared save boundary to prepare that model in this isolated scene.
    save();
    for (const [script, perk] of [
        ["SpiderlingsPrison.js", "SpiderlingsPrisonStart"],
        ["SpiderlingsBossRoom.js", "SpiderlingsBossStart"],
    ]) {
        KDPerkStart[perk] = () => {
            throw Error("A legacy location-start handler ran during perk initialization");
        };
        await registerPackagedScript(script);
    }
    for (const id of ids) {
        const preset = KinkyDungeonStatsPresets[id];
        expect(preset?.category === "Start" && KDGetPerkCost(preset) === 0, id + " must be a free Start perk");
        KinkyDungeonStatsChoice.clear();
        expect(KDCanPickPerk(id), id + " cannot be selected");
        KinkyDungeonStatsChoice.set(id, true);
        expect(!KDCanPickPerk(ids.find((other) => other !== id)), "Location starts are not mutually exclusive");
    }
    for (const { cocoon, magicHands } of [
        { cocoon: false, magicHands: false },
        { cocoon: true, magicHands: false },
        { cocoon: false, magicHands: true },
    ]) {
        for (const id of ids) {
            KinkyDungeonStatsChoice.clear();
            KinkyDungeonStatsChoice.set(id, true);
            if (cocoon) KinkyDungeonStatsChoice.set("SpiderlingsCocoonStart", true);
            if (magicHands) KinkyDungeonStatsChoice.set("MagicHands", true);
            globalThis.compatibilitySetSeed(id + "-" + cocoon + "-" + magicHands);
            KDSaveQueue.length = 0;
            KinkyDungeonStartNewGame(false);
            const autosaves = KDSaveQueue.slice();
            expect(autosaves.length > 0, "The location start did not queue a native automatic save");
            expect(
                autosaves.every((entry) => !!new Map(entry.statchoice).get("MagicHands") === magicHands),
                "A native automatic save retained the temporary MagicHands perk",
            );
            expect(
                !!KinkyDungeonStatsChoice.get("MagicHands") === magicHands,
                "Starting perks changed MagicHands selection",
            );
            const autosave = autosaves.at(-1);
            const bossStart = id === "SpiderlingsBossStart";
            expect(bossStart ? Spiderlings.BossRoom.active() : Spiderlings.Prison.captured(), id + " did not start");
            if (bossStart) {
                expect(!!Spiderlings.BossEncounter.boss(), "Boss start has no Matriarch");
                expect(Spiderlings.BossEncounter.state().phase === "one", "Boss start skipped phase one");
                expect(KDGameData.PrisonerState !== "jail", "Boss start inherited a captured identity");
            } else {
                const chamber = KDMapData.SpiderlingsPrison.chamberBounds;
                expect(
                    KinkyDungeonPlayerEntity.x >= chamber.left &&
                        KinkyDungeonPlayerEntity.x <= chamber.right &&
                        KinkyDungeonPlayerEntity.y >= chamber.top &&
                        KinkyDungeonPlayerEntity.y <= chamber.bottom,
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
            const room = KDGameData.RoomType;
            const prison = bossStart ? Spiderlings.BossRoom.state().source.room : room;
            const initialPosition = { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y };
            const initialWorn = equipment();
            if (!bossStart)
                expect(
                    autosave.KDMapData.PrisonState === "Intro",
                    "The initial automatic save missed prison admission",
                );
            restore(LZString.compressToBase64(JSON.stringify(autosave)));
            expect(KDGameData.RoomType === room, "The native automatic save retained an intermediate room");
            expect(
                KinkyDungeonPlayerEntity.x === initialPosition.x && KinkyDungeonPlayerEntity.y === initialPosition.y,
                "The native automatic save lost the initial spawn position",
            );
            expect(!!KinkyDungeonStatsChoice.get("MagicHands") === magicHands, "Automatic reload changed MagicHands");
            expect(JSON.stringify(equipment()) === JSON.stringify(initialWorn), "Automatic reload changed equipment");
            if (!bossStart) {
                expect(Spiderlings.Prison.captured(), "The native automatic save lost captive identity");
                expect(
                    KDGameData.PrisonerState === "jail" && KDMapData.PrisonState === "Jail",
                    "Automatic reload lost the native captive stage",
                );
            }
            if (!cocoon && !magicHands) scenes[bossStart ? "bossStart" : "prisonStart"] = await photo();
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
            results.push({
                id,
                cocoon,
                magicHands,
                autosaves: autosaves.length,
                room,
                prison,
                returnRoom: KDGameData.RoomType,
            });
        }
    }
    KinkyDungeonStatsChoice.clear();
    globalThis.compatibilitySetSeed("ordinary-start-without-location-perk");
    KinkyDungeonStartNewGame(false);
    expect(KDGameData.RoomType === "JourneyFloor", "Unselected location perks changed the ordinary start");
    await frame();
    return { results, ordinaryStart: KDGameData.RoomType, images: scenes };
})();
