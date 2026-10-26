(async () => {
    const { expect, save, restore, turn } = globalThis.normalAcceptance;
    const branches = [];
    for (const putInJail of [false, true]) {
        const { prisonRoom, boss, door } = globalThis.bossAcceptance.enter(`boss-native-defeat-${putInJail}`);
        const level = MiniGameKinkyDungeonLevel;
        const previousIdentity = KDGameData.PrisonerState;
        const inventory = KinkyDungeonAllRestraintDynamic().map(({ item }) => item.id);
        const court = KDGameData.RoomType;
        KinkyDungeonDefeat(putInJail, boss);
        expect(KDGameData.RoomType === prisonRoom, "Native defeat entered a different prison");
        expect(Spiderlings.Prison.captured(), "Native defeat did not establish prison captivity");
        const chamber = KDMapData.SpiderlingsPrison.chamberBounds;
        expect(
            KDPlayer().x >= chamber.left &&
                KDPlayer().x <= chamber.right &&
                KDPlayer().y >= chamber.top &&
                KDPlayer().y <= chamber.bottom,
            "Native defeat overwrote the chamber placement with Court coordinates",
        );
        expect(
            KDGameData.SpiderlingsPrisonIdentity.previous === previousIdentity,
            "Native defeat overwrote the prior prisoner identity before admission",
        );
        expect(
            JSON.stringify(KinkyDungeonAllRestraintDynamic().map(({ item }) => item.id)) === JSON.stringify(inventory),
            "Ordinary defeat added or removed equipment",
        );
        expect(MiniGameKinkyDungeonLevel === level, "Native defeat advanced the journey");
        expect(!Spiderlings.BossCapture.state(), "Native defeat retained Court capture control");
        restore(save());
        expect(
            KDGameData.RoomType === prisonRoom && Spiderlings.Prison.captured(),
            "Defeat placement did not survive load",
        );
        KDGoThruTile(door.x, door.y, true, true, true, true);
        await turn();
        expect(
            KDGameData.RoomType === court &&
                Spiderlings.BossEncounter.state()?.phase === "one" &&
                Spiderlings.BossEncounter.boss()?.id !== boss.id,
            "Native defeat did not reset the Court on reentry",
        );
        expect(KDGameData.PrisonerState === previousIdentity, "Leaving captivity did not restore the prior identity");
        branches.push({ putInJail, prisonRoom, court, previousIdentity, level });
    }
    return { ok: true, scenario: "boss-defeat", branches };
})();
