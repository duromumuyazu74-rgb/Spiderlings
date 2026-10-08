(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const names = () => KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name);
    const bind = (actor, profile, consumeOnProgress = false) => {
        KinkyDungeonDressPlayer();
        UpdateModels(KinkyDungeonPlayer);
        return KDPlayerEffects.SpiderlingsWebbingEnemyBind(
            KinkyDungeonPlayerEntity,
            "glue",
            { profile, consumeOnProgress },
            undefined,
            "Enemy",
            undefined,
            actor,
        );
    };
    for (const profile of ["Spinner", "Jumper", "WebCaster", "MageSpiderlings"]) {
        setup(`complete-inner-${profile}`);
        KDModSettings.Spiderlings.spiderlingsEnableHood = true;
        const expected = [
            ...Spiderlings.Webbing.LV1_FAMILIES.map((family) => `SpiderlingsWebbingLv1${family}`),
            ...Spiderlings.Webbing.LV2_FAMILIES.map((family) => `SpiderlingsWebbingLv2${family}`),
            ...Spiderlings.Webbing.LV3_FAMILIES.map((family) => `SpiderlingsWebbingLv3${family}`),
        ];
        let actor = spawn(profile, 3, 2),
            hits = 0,
            consumed = 0;
        for (; hits < 100 && !expected.every((id) => names().includes(id)); hits++) {
            if (actor.hp <= 0) actor = spawn(profile, 3, 2);
            const result = bind(actor, profile, profile === "Jumper");
            if (profile === "Jumper" && result.effect) {
                expect(actor.hp <= 0, "A successful Jumper no longer consumes itself");
                consumed++;
            }
        }
        expect(
            expected.every((id) => names().includes(id)),
            `${profile} stalled: ${JSON.stringify(names())}`,
        );
        expect(!names().includes(Spiderlings.Webbing.COCOON_ID), "Inner binding created a cocoon without WebSpray");
        rows.push({ profile, hits, consumed, items: names() });
    }

    setup("legbag-anchor-lifecycle");
    const recovery = Spiderlings.SpinnerRecovery;
    KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(Spiderlings.SpinnerCapture.ID), 0, false, "");
    const bag = Spiderlings.SpinnerCapture.item();
    expect(bag, "Native fixture could not equip a leg bag");
    (bag.data ||= {}).wrapProgress = 1;
    KinkyDungeonUpdateStats(0);
    expect(
        KinkyDungeonAddRestraintIfWeaker(KinkyDungeonGetRestraintByName(recovery.LEASH), 0, false, "") > 0,
        "Leg bag alone did not admit the owned silk leash",
    );
    const actor = spawn("Spinner", 3, 2);
    for (let hit = 0; hit < 60 && !names().includes("SpiderlingsWebbingLv3Arm"); hit++) bind(actor, "Spinner");
    expect(names().includes("SpiderlingsWebbingLv3Arm"), "A completed leg bag blocked upper-body binding");
    expect(
        Spiderlings.SpinnerCapture.item() === bag && bag.data.wrapProgress === 1,
        "Upper-body binding replaced or reset the leg bag",
    );
    const oldCarrier = KinkyDungeonAllRestraintDynamic().find(({ item }) => item.name === recovery.LEASH).item;
    for (const event of oldCarrier.events) if (event.type === "SpiderlingsRecoveryAnchor") event.type = "RequireCollar";
    KinkyDungeonDressPlayer();
    UpdateModels(KinkyDungeonPlayer);
    DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
    restore(save());
    expect(names().includes(recovery.LEASH), "Reload discarded a bag-anchored silk leash");
    const restoredCarrier = KinkyDungeonAllRestraintDynamic().find(({ item }) => item.name === recovery.LEASH).item;
    expect(
        restoredCarrier.events.some((event) => event.type === "SpiderlingsRecoveryAnchor") &&
            !restoredCarrier.events.some((event) => event.type === "RequireCollar"),
        "Test.87 saved carrier retained its collar-only removal event",
    );
    KinkyDungeonRemoveRestraintSpecific(KinkyDungeonGetRestraintItem("ItemArms"), false, false, false);
    expect(names().includes(recovery.LEASH), "Removing unrelated gear detached a bag-anchored leash");
    KinkyDungeonRemoveRestraintSpecific(Spiderlings.SpinnerCapture.item(), false, false, false);
    expect(!names().includes(recovery.LEASH), "Removing the last anchor left an orphan owned leash");
    rows.push({ bagAnchor: true, upperBody: true, reload: true, anchorRemoval: true });

    for (const count of [2, 4, 8]) {
        setup(`observed-building-${count}`);
        KDMovePlayer(18, 10, false);
        const actors = Array.from({ length: count }, (_, index) =>
            spawn("Spinner", 12 + (index % 4), 9 + Math.floor(index / 4)),
        );
        for (const actor of actors) {
            actor.hostile = 999;
            actor.aware = true;
        }
        const field = Spiderlings.SpinnerNativeField;
        globalThis.normalAcceptance.prepareCrew({ actors, fieldPermits: 1 });
        Spiderlings.SpinnerAI.beginTurn({ activate: true });
        const row = { count, actions: [], turns: [], observedActions: 0 };
        rows.push(row);
        const nativeAction = field.applyPaidAction;
        field.applyPaidAction = function (source, action) {
            const result = nativeAction.apply(this, arguments);
            if (result.applied) {
                row.actions.push({ source: source.id, action: action.type, tick: KinkyDungeonCurrentTick });
                if (Object.values(field.state()?.ai?.groups || {}).some((group) => group.engagement))
                    row.observedActions++;
            }
            return result;
        };
        try {
            for (let tick = 0; tick < 90 && row.observedActions < 8; tick++) {
                // Changing approach direction must leave time for the assigned workers to arrive.
                if (tick % 3 === 0) KDMovePlayer(18, tick % 2 ? 9 : 11, false);
                await turn();
                row.turns.push(structuredClone(field.state()?.ai?.groups));
            }
        } finally {
            field.applyPaidAction = nativeAction;
        }
        expect(row.observedActions >= 8, `Observed prey starved ${count} builders: ${JSON.stringify(row)}`);
        expect(
            row.turns.some((groups) => Object.values(groups || {}).some((group) => group.engagement)),
            "Builder regression never established an observed engagement",
        );
        const proxies = KDMapData.Entities.filter(field.isOwnedProxy);
        row.proxyHP = proxies.map((proxy) => ({
            id: proxy.id,
            hp: proxy.hp,
            maxhp: proxy.maxhp,
            nativeMaxhp: proxy.Enemy.maxhp,
        }));
        expect(
            proxies.length && proxies.every((proxy) => proxy.Enemy.maxhp === proxy.maxhp && proxy.hp <= proxy.maxhp),
            `Native boundary tooltip maximum disagrees with its physical durability: ${JSON.stringify(row.proxyHP)}`,
        );
        KinkyDungeonDressPlayer();
        UpdateModels(KinkyDungeonPlayer);
        DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
        restore(save());
        expect(
            KDMapData.Entities.filter(field.isOwnedProxy).every((proxy) => proxy.Enemy.maxhp === proxy.maxhp),
            "Native unpacking discarded per-cell boundary durability",
        );
    }
    return { rows };
})();
