(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    for (const name of ["Maidforce", "Deputy"]) {
        setup("prison-rival-" + name);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(x + "," + y);
            }
        KDMovePlayer(10, 10, false);
        KDMapData.JailPoints = [{ x: 26, y: 16, type: "jail", radius: 1 }];
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsWebbingCocoon"), 0, false, "");
        const cocoon = KinkyDungeonAllRestraintDynamic().find(
            ({ item }) => item.name === "SpiderlingsWebbingCocoon",
        ).item;
        cocoon.data ||= {};
        cocoon.data.SpiderlingsCocoonOuterWebs = { anchored: true, attemptAges: [] };
        const rival = spawn(name, 11, 10);
        KDIntentEvents.CaptureJail.trigger(rival, {});
        for (let n = 0; n < 12 && KDPlayer().leash?.entity !== rival.id; n++) await turn();
        const row = { name, initial: { x: rival.x, y: rival.y, hp: rival.hp, tether: KDPlayer().leash }, steps: [] };
        rows.push(row);
        expect(KDPlayer().leash?.entity === rival.id, "Native rival did not acquire actual tether");
        const initialPlayer = { x: KDPlayer().x, y: KDPlayer().y };
        const spider = spawn("WebCaster", rival.x, rival.y + 2, "Enemy");
        for (let n = 0; n < 16 && rival.hp > 0; n++) {
            KinkyDungeonStatWill = KinkyDungeonStatWillMax;
            await turn();
            row.steps.push({
                tick: KinkyDungeonCurrentTick,
                hp: rival.hp,
                x: rival.x,
                y: rival.y,
                player: { x: KDPlayer().x, y: KDPlayer().y },
                tether: KDPlayer().leash?.entity,
                paired: Spiderlings.PrisonEscort.rivalPair(spider, rival),
            });
        }
        expect(
            row.steps.some((step) => step.hp < row.initial.hp),
            "Spiderling did not damage the actual rival through combat",
        );
        expect(
            row.steps.some((step) => step.tether === rival.id),
            "Mod cancelled rival tether to win",
        );
        expect(
            row.steps.some((step) => step.player.x !== initialPlayer.x || step.player.y !== initialPlayer.y),
            "Surviving rival did not continue physical escort",
        );
        cocoon.data.SpiderlingsCocoonOuterWebs.anchored = false;
        expect(!Spiderlings.PrisonEscort.rivalPair(spider, rival), "Ordinary Cocoon falsely intercepted");
        cocoon.data.SpiderlingsCocoonOuterWebs.anchored = true;
        spider.faction = "Player";
        expect(!Spiderlings.PrisonEscort.rivalPair(spider, rival), "Allied Spiderling falsely intercepted");
        spider.faction = "Enemy";
        restore(save());
        const loadedRival = KDMapData.Entities.find((actor) => actor.id === rival.id);
        const loadedSpider = KDMapData.Entities.find((actor) => actor.id === spider.id);
        if (loadedRival) KDRemoveEntity(loadedRival, false, false, true);
        restore(save());
        expect(
            !Spiderlings.PrisonEscort.rivalPair(
                KDMapData.Entities.find((actor) => actor.id === loadedSpider.id),
                rival,
            ),
            "Stale saved NPC tether produced a false interception",
        );
    }
    return { passed: true, rows };
})();
