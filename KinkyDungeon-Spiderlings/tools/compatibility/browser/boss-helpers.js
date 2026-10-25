(() => {
    const { setup, spawn, expect, save } = globalThis.normalAcceptance;
    globalThis.bossAcceptance = {
        enter(seed) {
            setup(seed);
            KDMapData.GridWidth = 40;
            KDMapData.GridHeight = 30;
            KDMapData.Grid = Array.from(
                { length: 30 },
                (_, y) =>
                    Array.from({ length: 40 }, (_, x) => (x && y && x < 39 && y < 29 ? "0" : "1")).join("") + "\n",
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
            expect(
                Spiderlings.Prison.enter({ entrance: spawn("NestEntrance", 16, 10, "Enemy"), mode: "voluntary" }),
                "Cannot enter V6 prison",
            );
            const prisonRoom = KDGameData.RoomType;
            Spiderlings.BossRoom.ensureEntrance();
            const door = KDMapData.SpiderlingsCourtDoor;
            expect(door, "Prison Boss entrance missing");
            KDGoThruTile(door.x, door.y, true, true, true, true);
            expect(Spiderlings.BossRoom.active(), "Native Boss entry failed");
            return { prisonRoom, door, boss: Spiderlings.BossEncounter.boss() };
        },
    };
})();
