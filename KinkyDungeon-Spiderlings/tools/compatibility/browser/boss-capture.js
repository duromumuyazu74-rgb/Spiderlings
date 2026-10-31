(async () => {
    const { expect, turn, save, restore, photo } = globalThis.normalAcceptance;
    const { prisonRoom } = globalThis.bossAcceptance.enter("matriarch-capture");
    let boss = Spiderlings.BossEncounter.boss();
    // Isolate native rune/control and escape contracts from the separately tested attack cadence.
    for (const enemy of [...KDMapData.Entities])
        if (enemy !== boss && !Spiderlings.BossFootprint.isPart(enemy)) KDRemoveEntity(enemy, false, false, true);
    let encounter = Spiderlings.BossEncounter.state();
    encounter.nextBody = encounter.nextSupport = encounter.nextPulse = 10000;
    encounter.warnings = [];
    KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
    expect(Spiderlings.BossCapture.start(boss), "Cannot start rune telegraph");
    for (let n = 0; n < 6 && Spiderlings.BossCapture.state()?.phase === "warning"; n++) await turn();
    const trackingRune = KDMapData.Entities.find((enemy) => enemy.id === Spiderlings.BossCapture.state()?.runeId);
    expect(trackingRune, "Rune telegraph did not produce the tracking actor");
    let runeSteps = 0;
    // Measure the native movement cost separately from AI path selection and occupancy waits.
    for (let n = 0; n < 6; n++) {
        const previous = { x: trackingRune.x, y: trackingRune.y };
        KinkyDungeonEnemyTryMove(trackingRune, { x: 0, y: 1, delta: 1 }, 1, trackingRune.x, trackingRune.y + 1, false);
        runeSteps += Math.max(Math.abs(trackingRune.x - previous.x), Math.abs(trackingRune.y - previous.y));
    }
    expect(runeSteps === 4, `Tracking rune moved ${runeSteps} cells in six native movement actions instead of four`);
    for (let turnCount = 0; turnCount < 40 && Spiderlings.BossCapture.state()?.phase !== "contest"; turnCount++)
        await turn();
    expect(
        Spiderlings.BossCapture.state()?.phase === "contest",
        "Native rune did not hit and establish a contest: " +
            JSON.stringify({
                capture: Spiderlings.BossCapture.state(),
                boss: { x: boss.x, y: boss.y },
                player: { x: KDPlayer().x, y: KDPlayer().y },
            }),
    );
    const contestImage = await photo();
    const stamina = KinkyDungeonStatStamina;
    for (let pull = 0; pull < 3; pull++) KDSendInput("spiderlingsBossPull", {});
    expect(!Spiderlings.BossCapture.state(), "Three paid pulls did not break the tether");
    expect(KinkyDungeonStatStamina < stamina, "Pulls did not pay native stamina");

    expect(Spiderlings.BossCapture.start(boss), "Cannot restart capture after escape");
    for (let turnCount = 0; turnCount < 40 && Spiderlings.BossCapture.state()?.phase !== "contest"; turnCount++)
        await turn();
    expect(Spiderlings.BossCapture.state()?.phase === "contest", "Second rune failed to admit control");
    for (let turnCount = 0; turnCount < 35 && Spiderlings.BossCapture.state()?.phase === "contest"; turnCount++)
        await turn();
    expect(Spiderlings.BossCapture.state()?.phase === "wrap", "Lost contest did not begin five-turn wrapping");
    const wrapStart = encounter.clock;
    for (let count = 0; count < 5; count++) KinkyDungeonAdvanceTime(1, true);
    let cocoon = Spiderlings.SpellwovenCocoon.item();
    expect(cocoon && Spiderlings.BossCapture.state()?.phase === "escape", "Finisher did not equip Spellwoven Cocoon");
    expect(encounter.clock - wrapStart === 5, "Wrapping lock did not last exactly five paid world turns");
    expect(
        cocoon.data.Spellwoven.layers === 1 && cocoon.data.Spellwoven.wrap === 1,
        "Initial Cocoon was not layer one",
    );
    const deadline = Spiderlings.BossCapture.state().deadline;
    restore(save());
    encounter = Spiderlings.BossEncounter.state();
    boss = Spiderlings.BossEncounter.boss();
    cocoon = Spiderlings.SpellwovenCocoon.item();
    expect(Spiderlings.BossCapture.state().deadline === deadline, "Reload reset the escape deadline");
    const layerBeforeEmpty = cocoon.data.Spellwoven.layers;
    KinkyDungeonStatStamina = 0;
    KinkyDungeonStruggle("ItemDevices", "Remove", 0);
    expect(cocoon.data.Spellwoven.layers === layerBeforeEmpty, "An empty-stamina attempt grew a silk layer");
    KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
    KDGameData.SpiderlingsSilkDensity.value = 500;
    const beforeLayer = cocoon.data.Spellwoven.layers;
    KinkyDungeonStruggle("ItemDevices", "Remove", 0);
    for (let count = 0; count < 8 && KDGameData.DelayedActions?.length; count++) await turn();
    expect(
        Spiderlings.SpellwovenCocoon.item()?.data.Spellwoven.layers === beforeLayer + 1,
        "Delayed work did not grow exactly one layer",
    );
    expect(Spiderlings.BossCapture.state().deadline === deadline, "Layer growth reset the escape timer");
    const cocoonImage = await photo();
    // Phase one must preserve an already applied item, unlike an unfinished tether.
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
        Spiderlings.BossEncounter.state().phase === "interlude" && Spiderlings.SpellwovenCocoon.item(),
        "Interlude erased an applied Cocoon",
    );
    for (const enemy of [...KDMapData.Entities])
        if (enemy !== boss && !Spiderlings.BossFootprint.isPart(enemy)) KDRemoveEntity(enemy, false, false, true);
    // Shorten only the remaining window to exercise the exact saved timeout boundary.
    Spiderlings.BossCapture.state().deadline = encounter.clock + 1;
    await turn();
    expect(Spiderlings.BossCapture.state()?.phase === "escort", "Timeout did not submit custody");
    expect(Spiderlings.PrisonEscort.state()?.spellwoven, "Custody did not record the special Cocoon payload");
    expect(
        KDMapData.Entities.some((enemy) => enemy.Enemy.name === "Tunneler"),
        "Missing crew did not get a construction worker",
    );
    const itemId = cocoon.id,
        layers = cocoon.data.Spellwoven.layers;
    for (let count = 0; count < 160 && Spiderlings.BossRoom.active(); count++) await turn();
    expect(
        KDGameData.RoomType === prisonRoom && Spiderlings.Prison.captured(),
        "Physical escort did not return to the same prison: " +
            JSON.stringify({ escort: Spiderlings.PrisonEscort.state(), capture: Spiderlings.BossCapture.state() }),
    );
    expect(
        Spiderlings.SpellwovenCocoon.item()?.id === itemId && Spiderlings.SpellwovenCocoon.layers() === layers,
        "Custody replaced or reset the Cocoon",
    );
    KinkyDungeonRemoveRestraint("ItemDevices", false);
    KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(Spiderlings.Webbing.COCOON_ID), 0, false, "");
    const inner = KinkyDungeonGetRestraintItem("ItemDevices");
    inner.struggleProgress = 0.35;
    const outer = Spiderlings.SpellwovenCocoon.equip(boss);
    expect(
        outer &&
            KinkyDungeonAllRestraintDynamic().some(
                (entry) => entry.item.id === inner.id && entry.item.struggleProgress === 0.35,
            ),
        "Special outer Cocoon replaced the original item or its work",
    );
    outer.data.Spellwoven.layers = 20;
    outer.data.Spellwoven.wrap = 1;
    outer.struggleProgress = 0.99;
    KDGameData.SpiderlingsSilkDensity.value = 0;
    KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
    KinkyDungeonStruggle("ItemDevices", "Remove", 0);
    for (let count = 0; count < 6 && Spiderlings.SpellwovenCocoon.item(); count++) await turn();
    expect(!Spiderlings.SpellwovenCocoon.item(), "Layer twenty could not finish a legal zero-density escape");
    expect(
        KinkyDungeonGetRestraintItem("ItemDevices")?.id === inner.id,
        "Removing the special layer removed the ordinary Cocoon: " +
            JSON.stringify({
                expected: inner.id,
                items: KinkyDungeonAllRestraintDynamic()
                    .filter((entry) => KDRestraint(entry.item).Group === "ItemDevices")
                    .map((entry) => ({
                        id: entry.item.id,
                        name: entry.item.name,
                        progress: entry.item.struggleProgress,
                        link: entry.item.dynamicLink?.name,
                    })),
            }),
    );
    const oldBossId = boss.id;
    const door = KDMapData.SpiderlingsCourtDoor;
    KDGoThruTile(door.x, door.y, true, true, true, true);
    Spiderlings.BossEncounter.initialize();
    expect(
        Spiderlings.BossEncounter.state()?.phase === "one" && Spiderlings.BossEncounter.boss()?.id !== oldBossId,
        "Reentry resumed the defeated attempt instead of restarting phase one",
    );
    expect(Spiderlings.BossRoom.state().attempts === 2, "Retry count did not advance once");
    return {
        ok: true,
        scenario: "boss-capture",
        runePace: { nativeMovementActions: 6, steps: runeSteps },
        prisonRoom,
        itemId,
        layers,
        images: { contest: contestImage, cocoon: cocoonImage },
        fixture:
            "Support isolated; six native movement actions measure rune cost before real AI pursuit and contact; timeout shortened only after real rune, contest, wrapping and escape work.",
    };
})();
