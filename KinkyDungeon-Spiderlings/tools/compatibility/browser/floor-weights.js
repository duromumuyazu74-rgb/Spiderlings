(async () => {
    const { expect } = globalThis.normalAcceptance;
    KinkyDungeonStartNewGame(false);
    const settings = structuredClone(KDModSettings);
    const rows = [];
    try {
        KDModSettings.Spiderlings = {
            ...KDModSettings.Spiderlings,
            spiderlingsInfestationWeight: "50",
            spiderlingsHuntingGroundsWeight: "1000",
        };
        delete KDModSettings.Spiderlings.spiderlingsFloorWeights90;
        KinkyDungeonSendEvent("afterModSettingsLoad", {});
        expect(
            Spiderlings.FloorSelection.weight("SpiderlingsInfestation") === 200,
            "Saved infestation default was not upgraded",
        );
        expect(
            Spiderlings.FloorSelection.weight("SpiderlingsHuntingGrounds") === 200,
            "Saved hunting default was not upgraded",
        );
        for (let seed = 0; seed < 12; seed++) {
            globalThis.compatibilitySetSeed(`floor-weights-${seed}`);
            KDMapModRefreshList = [KDMapMods.None];
            KDInitJourneyMap(0);
            const slots = Object.values(KDGameData.JourneyMap);
            const special = slots.filter(
                (s) => s.MapMod === "SpiderlingsInfestation" || s.MapMod === "SpiderlingsHuntingGrounds",
            );
            expect(special.length > 0, "Seeded native journey lost all spider floors");
            expect(
                special.every((s) => s.y >= 5 && s.type === "basic" && !s.RoomType && s.EscapeMethod === s.MapMod),
                "Invalid special journey slot",
            );
            expect(
                special.every((s) => !!s.Faction),
                "Spider theme lost its native faction",
            );
            rows.push({
                seed,
                infestation: special.filter((s) => s.MapMod === "SpiderlingsInfestation").length,
                hunting: special.filter((s) => s.MapMod === "SpiderlingsHuntingGrounds").length,
            });
        }
        const totals = rows.reduce(
            (sum, row) => ({ infestation: sum.infestation + row.infestation, hunting: sum.hunting + row.hunting }),
            { infestation: 0, hunting: 0 },
        );
        expect(
            Math.abs(totals.infestation - totals.hunting) < Math.max(15, totals.infestation * 0.25),
            "Native journey themes missed frequency parity",
        );
        for (const faction of ["Maidforce", "Bandit", "Nevermere"])
            expect(
                KDMapMods.SpiderlingsInfestation.filter({ y: 5, Faction: faction }) ===
                    KDMapMods.SpiderlingsHuntingGrounds.filter({ y: 5, Faction: faction }),
                "The themes still use different ordinary-floor pools",
            );
        KDGameData.JourneyY = 12;
        delete KDGameData.SpiderlingsFloorWeights90;
        const oldRandom = KDRandom;
        const slot = (y, extra = {}) => ({
            type: "basic",
            x: 0,
            y,
            Checkpoint: "grv",
            MapMod: "None",
            EscapeMethod: "Key",
            Faction: "Bandit",
            RoomType: "",
            SideRooms: [],
            HiddenRooms: {},
            ...extra,
        });
        KDGameData.JourneyMap = {
            past: slot(8),
            current: slot(12),
            future: slot(13),
            cached: slot(14),
            existing: slot(15, { MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation" }),
        };
        KDWorldMap = { cached: { jx: 0, jy: 14, data: {} } };
        const protectedBefore = JSON.stringify([
            KDGameData.JourneyMap.past,
            KDGameData.JourneyMap.current,
            KDGameData.JourneyMap.cached,
            KDGameData.JourneyMap.existing,
        ]);
        try {
            KDRandom = () => 0.01;
            KinkyDungeonSendEvent("afterLoadGame", {});
        } finally {
            KDRandom = oldRandom;
        }
        expect(
            KDGameData.JourneyMap.future.MapMod === "SpiderlingsInfestation",
            "Future saved preview did not receive the upgraded draw",
        );
        expect(
            JSON.stringify([
                KDGameData.JourneyMap.past,
                KDGameData.JourneyMap.current,
                KDGameData.JourneyMap.cached,
                KDGameData.JourneyMap.existing,
            ]) === protectedBefore,
            "Upgrade changed entered maps or existing objectives",
        );
        const before = JSON.stringify(KDGameData.JourneyMap);
        KinkyDungeonSendEvent("afterLoadGame", {});
        expect(JSON.stringify(KDGameData.JourneyMap) === before, "Reload rerolled upgraded journey");
        KDModSettings.Spiderlings.spiderlingsInfestationWeight = "200";
        KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight = "1500";
        delete KDModSettings.Spiderlings.spiderlingsFloorWeights91;
        KinkyDungeonSendEvent("afterModSettingsLoad", {});
        KinkyDungeonSendEvent("afterLoadGame", {});
        expect(
            Spiderlings.FloorSelection.weight("SpiderlingsInfestation") === 200 &&
                Spiderlings.FloorSelection.weight("SpiderlingsHuntingGrounds") === 200,
            "Older defaults did not reach current defaults",
        );
        expect(JSON.stringify(KDGameData.JourneyMap) === before, "Changed defaults rerolled a migrated journey");
        KDModSettings.Spiderlings.spiderlingsInfestationWeight = "200";
        KinkyDungeonSendEvent("afterModSettingsLoad", {});
        expect(
            Spiderlings.FloorSelection.weight("SpiderlingsInfestation") === 200,
            "Repeated settings load overwrote a deliberate later change",
        );
        KDModSettings.Spiderlings.spiderlingsInfestationWeight = "180";
        KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight = "1400";
        delete KDModSettings.Spiderlings.spiderlingsFloorWeights97;
        KinkyDungeonSendEvent("afterModSettingsLoad", {});
        expect(
            Spiderlings.FloorSelection.weight("SpiderlingsInfestation") === 200 &&
                Spiderlings.FloorSelection.weight("SpiderlingsHuntingGrounds") === 200,
            "Defaults did not reach equal current weights",
        );
        expect(JSON.stringify(KDGameData.JourneyMap) === before, "Test.97 rerolled an existing journey");
        return { rows, migration: KDGameData.SpiderlingsFloorWeights90 };
    } finally {
        KDModSettings = settings;
    }
})();
