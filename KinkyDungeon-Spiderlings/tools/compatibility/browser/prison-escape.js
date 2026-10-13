(async () => {
    const { setup, spawn, turn, frame, expect, save } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    setup("prison-early-escape");
    save();
    const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
    slot.main = "";
    slot.data[""] = KDMapData;
    const journey = KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY];
    journey.RoomType = "";
    journey.Checkpoint = "grv";
    journey.type = "basic";
    const entrance = spawn("NestEntrance", 6, 3, "Enemy");
    if (!KinkyDungeonInventoryGetWeapon("Knife")) KinkyDungeonInventoryAddWeapon("Knife");
    KDSetWeapon("Knife");
    KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsWebbingCocoon"), 0, false, "");
    expect(Spiderlings.Prison.enter({ entrance, mode: "captured" }), "Early escape admission failed");
    const floor = MiniGameKinkyDungeonLevel,
        room = KDGameData.RoomType;
    const row = { name: "early-escape", cuts: [], moves: [], casts: [] };
    rows.push(row);
    const cocoon = () =>
        KinkyDungeonAllRestraintDynamic().find(({ item }) => item.name === "SpiderlingsWebbingCocoon")?.item;
    KDPushSpell(KinkyDungeonFindSpell("Fireball", true));
    for (let n = 0; n < 40 && cocoon(); n++) {
        KinkyDungeonStatWill = KinkyDungeonStatWillMax;
        KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
        const data = {};
        KinkyDungeonStruggle("ItemDevices", "Cut", 0, true, data);
        KDSendInput("struggle", { group: "ItemDevices", type: "Cut", index: 0 }, false, true);
        await frame();
        row.cuts.push({
            tick: KinkyDungeonCurrentTick,
            progress: cocoon()?.cutProgress,
            canCut: data.canCut,
            affinity: data.hasAffinity,
            remaining: !!cocoon(),
        });
    }
    expect(!cocoon(), "First captured chamber did not permit natural Cocoon escape");
    for (const goal of [
        { x: 18, y: 8 },
        { x: 46, y: 8 },
        { x: 51, y: 22 },
    ]) {
        let stalls = 0;
        for (let n = 0; n < 200 && KDGameData.RoomType === room; n++) {
            if (KDPlayer().x === goal.x && KDPlayer().y === goal.y) break;
            const route = KinkyDungeonFindPath(
                KDPlayer().x,
                KDPlayer().y,
                goal.x,
                goal.y,
                false,
                false,
                false,
                KinkyDungeonMovableTilesSmartEnemy,
            );
            expect(route?.length, "Early escape has no connected main-nest bypass");
            const next = route[0],
                before = { x: KDPlayer().x, y: KDPlayer().y };
            KinkyDungeonStatWill = KinkyDungeonStatWillMax;
            KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
            KDSendInput(
                "move",
                {
                    dir: { x: Math.sign(next.x - before.x), y: Math.sign(next.y - before.y), delta: 0 },
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
            await frame();
            row.moves.push({ before, after: { x: KDPlayer().x, y: KDPlayer().y }, tick: KinkyDungeonCurrentTick });
            stalls = KDPlayer().x === before.x && KDPlayer().y === before.y ? stalls + 1 : 0;
            if (stalls >= 3) {
                const manaBefore = KinkyDungeonStatMana;
                const result = KDSendInput(
                    "tryCastSpell",
                    { tx: next.x, ty: next.y, spellname: "Fireball", player: KDPlayer() },
                    false,
                    true,
                );
                await frame();
                row.casts.push({ result, manaBefore, manaAfter: KinkyDungeonStatMana, tick: KinkyDungeonCurrentTick });
                if (result !== "Cast") await turn();
                stalls = 0;
            }
        }
    }
    for (let n = 0; n < 3 && KDGameData.RoomType === room; n++) {
        KDSendInput(
            "move",
            {
                dir: { x: 0, y: 0, delta: 0 },
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
        await frame();
    }
    row.final = { room: KDGameData.RoomType, floor: MiniGameKinkyDungeonLevel, identity: KDGameData.PrisonerState };
    expect(
        KDGameData.RoomType !== room && MiniGameKinkyDungeonLevel === floor,
        "Early native escape did not return on same floor",
    );
    expect(!KDGameData.SpiderlingsPrisonIdentity, "Early escape retained owned identity");
    return { passed: true, rows };
})();
