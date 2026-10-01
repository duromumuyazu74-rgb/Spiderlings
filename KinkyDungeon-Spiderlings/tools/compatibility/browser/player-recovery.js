(async () => {
    const { setup, spawn, turn, frame, expect, photo, save, restore, enemy } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = {};
    for (const count of [2, 4, 8])
        for (const external of [false, true]) {
            setup(`recovery-${count}-${external}`);
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = external;
            KDMovePlayer(14, 10, false);
            const positions = [
                [17, 9],
                [18, 9],
                [19, 9],
                [17, 10],
                [18, 10],
                [19, 10],
                [17, 11],
                [18, 11],
            ];
            const actors = positions.slice(0, count).map(([x, y]) => spawn("Spinner", x, y));
            for (const actor of actors) {
                actor.stun = 999;
                actor.hostile = 999;
            }
            const encounter = Spiderlings.SpinnerNativeField.initializeEnclosure({
                compositeId: "recovery-test",
                owners: actors.map((actor) => actor.id),
                built: true,
                autoSeal: true,
                layers: [
                    {
                        id: "inner",
                        vertices: [
                            { x: 13, y: 9 },
                            { x: 15, y: 9 },
                            { x: 15, y: 11 },
                            { x: 13, y: 11 },
                        ],
                        gate: { x: 13, y: 10 },
                    },
                ],
            });
            expect(encounter.topology.fields.inner.phase === "sealed", "Recovery fixture is not sealed");
            KDSetWeapon(null);
            KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
            let attacks = 0;
            while (Spiderlings.SpinnerNativeField.isSpiderlingsWebCell({ x: 15, y: 10 }) && attacks < 20) {
                KinkyDungeonMove({ x: 1, y: 0 }, 1, true, true);
                await frame();
                attacks++;
            }
            expect(attacks > 0 && attacks < 20, "Unarmed player could not break the wall");
            KDMovePlayer(16, 10, false);
            expect(
                Spiderlings.SpinnerRecovery.departure(),
                "Leaving the breached field did not record recovery eligibility",
            );
            const rejectionMessages = [],
                nativeMessage = KinkyDungeonSendTextMessage;
            actors[0].stun = 0;
            KinkyDungeonSendTextMessage = function (_priority, text) {
                rejectionMessages.push(text);
                return nativeMessage.apply(this, arguments);
            };
            try {
                KDPlayerEffects.SpiderlingsWebbingEnemyBind(
                    KinkyDungeonPlayerEntity,
                    "glue",
                    { profile: "Spinner" },
                    undefined,
                    "Enemy",
                    undefined,
                    actors[0],
                );
            } finally {
                KinkyDungeonSendTextMessage = nativeMessage;
                actors[0].stun = 999;
            }
            expect(
                Spiderlings.SpinnerRecovery.strength() === 0 && !KinkyDungeonGetRestraintItem("ItemNeckRestraints"),
                "Bare-neck rejection changed equipment or established recovery",
            );
            expect(
                rejectionMessages.length === 1 && !rejectionMessages[0].includes("[NotFound]"),
                "Rejected recovery hit has no readable feedback",
            );
            // Native leash admission requires a collar; a rejected slot never forces replacement.
            KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicCollar"), 0, false, "");
            let carrier;
            if (external) {
                KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicLeash"), 0, false, "");
                carrier = KinkyDungeonGetRestraintItem("ItemNeckRestraints");
                carrier.cutProgress = 0.37;
                carrier.struggleProgress = 0.23;
            }
            for (const actor of actors) {
                actor.stun = 0;
                KDPlayerEffects.SpiderlingsWebbingEnemyBind(
                    KinkyDungeonPlayerEntity,
                    "glue",
                    { profile: "Spinner" },
                    undefined,
                    "Enemy",
                    undefined,
                    actor,
                );
            }
            const recovery = Spiderlings.SpinnerRecovery;
            expect(
                recovery.strength() === count,
                `Only ${recovery.strength()}/${count} sources attached: ${JSON.stringify({ departure: recovery.departure(), state: recovery.state(), capture: Spiderlings.SpinnerCapture.state(), gear: KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name), actors: actors.map((actor) => ({ id: actor.id, present: KDMapData.Entities.includes(actor), x: actor.x, y: actor.y, hp: actor.hp, active: recovery.sourceActionable(actor), hostile: KDHostile(actor) })) })}`,
            );
            const row = {
                count,
                external,
                rejectionMessages,
                attacks,
                strength: recovery.strength(),
                standCost: recovery.standFirmCost(),
                positions: [],
            };
            rows.push(row);
            await frame();
            await frame();
            await new Promise((resolve) => setTimeout(resolve, 700));
            images[`recovery-${count}-${external}-strands`] = await photo();
            const strands = () =>
                recovery.sourceIds().map((id) => kdpixisprites.get(`SpiderlingsRecoveryTether_${id}`));
            expect(
                strands().length === count &&
                    strands().every((sprite) => sprite?.visible && sprite.texture.valid && sprite.mask),
                "Recovery sources have no visible masked silk art",
            );
            row.visual = {
                strands: strands().length,
                pink: external,
                unchangedNativeLeash: structuredClone(KinkyDungeonPlayerEntity.leash || null),
            };
            if (count === 2) {
                const nativeVision = KinkyDungeonVisionGet,
                    logicBefore = JSON.stringify(recovery.state()),
                    leashBefore = JSON.stringify(KinkyDungeonPlayerEntity.leash);
                try {
                    KinkyDungeonVisionGet = (x, y) =>
                        x === KinkyDungeonPlayerEntity.x && y === KinkyDungeonPlayerEntity.y ? 5 : 0;
                    await frame();
                    await frame();
                    expect(
                        strands().every((sprite) => sprite.mask.geometry.graphicsData.length === 1),
                        "Partly hidden silk mask includes hidden cells",
                    );
                    images[`recovery-${external}-one-visible-cell`] = await photo();
                    KinkyDungeonVisionGet = () => 0;
                    await frame();
                    await frame();
                    expect(
                        strands().every((sprite) => !sprite || !sprite.visible),
                        "Fully hidden recovery silk remains visible",
                    );
                    row.visual.hiddenEarlyDraw = false;
                } finally {
                    KinkyDungeonVisionGet = nativeVision;
                }
                expect(
                    JSON.stringify(recovery.state()) === logicBefore &&
                        JSON.stringify(KinkyDungeonPlayerEntity.leash) === leashBefore,
                    "Rendering changed recovery or native movement ownership",
                );
                await frame();
                await frame();
            }
            const beforeEscape = save();
            await frame();
            const controlNames = ["Stand", "Select", "Cut", "Remove", "Struggle"].map(
                (name) => "SpiderlingsSpinnerRecovery" + name,
            );
            expect(
                controlNames.every((name) => KDButtonsCache[name]),
                "Active native recovery has no player action controls",
            );
            row.controls = controlNames;
            if (count === 8) {
                const liveCarrier = KinkyDungeonGetRestraintItem(recovery.GROUP),
                    savedAttempts = { present: "attempts" in liveCarrier, value: liveCarrier.attempts },
                    queryBuff = "SpiderlingsRecoveryQueryProbe";
                KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
                    id: queryBuff,
                    type: "StrugglePower",
                    power: -2,
                    duration: 9999,
                });
                row.queries = [];
                try {
                    for (const attempts of [undefined, 0.75]) {
                        if (attempts === undefined) delete liveCarrier.attempts;
                        else liveCarrier.attempts = attempts;
                        const before = {
                            carrier: JSON.stringify(liveCarrier),
                            recovery: JSON.stringify(recovery.state()),
                            stamina: KinkyDungeonStatStamina,
                            tick: KinkyDungeonCurrentTick,
                        };
                        for (let n = 0; n < 10; n++) KDEventMapGeneric.draw.SpiderlingsSpinnerRecovery({}, {});
                        expect(
                            JSON.stringify(liveCarrier) === before.carrier &&
                                JSON.stringify(recovery.state()) === before.recovery &&
                                KinkyDungeonStatStamina === before.stamina &&
                                KinkyDungeonCurrentTick === before.tick,
                            "Native HUD cost queries consumed carrier attempts, progress, resources or a turn",
                        );
                        row.queries.push({ initialAttempts: attempts ?? "absent", draws: 10, unchanged: true });
                    }
                } finally {
                    KinkyDungeonExpireBuff(KinkyDungeonPlayerEntity, queryBuff);
                    if (savedAttempts.present) liveCarrier.attempts = savedAttempts.value;
                    else delete liveCarrier.attempts;
                }
            }
            const nativeEscape = KDEventMapInventory.beforeStruggleCalc.SpiderlingsRecoveryEscape;
            row.escapePenalty = 0;
            KDEventMapInventory.beforeStruggleCalc.SpiderlingsRecoveryEscape = function (_event, item, data) {
                const before = data.escapePenalty || 0;
                const result = nativeEscape.apply(this, arguments);
                row.escapePenalty += (data.escapePenalty || 0) - before;
                return result;
            };
            try {
                row.escapeResult = KDInputTypes.struggle({ group: recovery.GROUP, type: "Struggle" });
            } finally {
                KDEventMapInventory.beforeStruggleCalc.SpiderlingsRecoveryEscape = nativeEscape;
            }
            expect(
                Math.abs(row.escapePenalty - (external ? 0 : 0.05 * (count - 1))) < 1e-8,
                "Native ordinary escape calculation used the wrong source penalty",
            );
            restore(beforeEscape);
            const stamina = [];
            const nativeStamina = KDChangeStamina;
            KDChangeStamina = function (source, type, trigger, amount) {
                if (trigger === "spiderlingsRecoveryStand") stamina.push(amount);
                return nativeStamina.apply(this, arguments);
            };
            try {
                expect(KDInputTypes.spiderlingsRecoveryStand() === "Stand", "Native stand-firm input failed");
            } finally {
                KDChangeStamina = nativeStamina;
            }
            expect(
                stamina.length === 1 && Math.abs(stamina[0] + (5 + 2 * (count - 1)) / 10) < 1e-8,
                "Stand-firm charged the wrong stamina",
            );
            row.stamina = stamina[0];
            await frame();
            await frame();
            restore(save());
            expect(recovery.strength() === count, "Reload changed active tether sources");
            images[`${external ? "pink" : "normal"}-${count}`] = await photo();
            for (let tick = 0; tick < 8; tick++) {
                await turn();
                row.positions.push({
                    x: KinkyDungeonPlayerEntity.x,
                    y: KinkyDungeonPlayerEntity.y,
                    state: structuredClone(recovery.state()),
                    goal: recovery.destination(recovery.state()),
                    core: Spiderlings.SpinnerNativeField.commonCore("recovery-test"),
                    path: KinkyDungeonFindPath(
                        KinkyDungeonPlayerEntity.x,
                        KinkyDungeonPlayerEntity.y,
                        14,
                        10,
                        true,
                        false,
                        false,
                        KinkyDungeonMovableTilesEnemy,
                        undefined,
                        undefined,
                        undefined,
                        enemy(actors[0].id),
                    ),
                });
            }
            expect(
                row.positions.some((position) => position.x < 16),
                "Recovery ignored the open breach",
            );
            // Move the source cluster with the player so only native source-removal work is under test.
            for (const [index, actor] of actors.entries())
                KDMoveEntity(
                    enemy(actor.id),
                    KinkyDungeonPlayerEntity.x + 1 + (index % 2),
                    KinkyDungeonPlayerEntity.y - 1 + Math.floor(index / 2),
                    false,
                );
            recovery.audit();
            const id = recovery.sourceIds()[0],
                before = recovery.strength();
            expect(id !== undefined, "No surviving tether remained for native source-removal acceptance");
            if (id !== undefined) {
                const actions = [];
                for (let n = 0; n < 2; n++) {
                    const before = KinkyDungeonCurrentTick;
                    actions.push(KDSendInput("spiderlingsRecoveryRemoveSource", { sourceId: id, type: "Remove" }));
                    await frame();
                    expect(KinkyDungeonCurrentTick > before, "The player input failed to pay a native world turn");
                }
                expect(
                    !recovery.sourceIds().includes(id),
                    "Two native removal actions did not release the chosen source",
                );
                row.removal = { actions, before, after: recovery.strength() };
            }
            if (external) {
                carrier = KinkyDungeonAllRestraintDynamic()
                    .map(({ item }) => item)
                    .find((item) => item.name === "BasicLeash");
                expect(
                    carrier?.cutProgress === 0.37 && carrier?.struggleProgress === 0.23,
                    "Source removal changed the external leash progress",
                );
            }
        }
    for (const preferNPC of [false, true]) {
        setup(`recovery-automatic-departure-${preferNPC}`);
        KDMovePlayer(14, 10, false);
        const pursuers = [spawn("Spinner", 19, 9), spawn("Spinner", 19, 11)],
            field = Spiderlings.SpinnerNativeField,
            recovery = Spiderlings.SpinnerRecovery;
        for (const actor of pursuers) {
            actor.stun = 999;
            actor.hostile = 999;
        }
        const encounter = field.initializeEnclosure({
            compositeId: "automatic-recovery",
            owners: pursuers.map((actor) => actor.id),
            built: true,
            autoSeal: true,
            layers: [
                {
                    id: "automatic-inner",
                    vertices: [
                        { x: 13, y: 9 },
                        { x: 15, y: 9 },
                        { x: 15, y: 11 },
                        { x: 13, y: 11 },
                    ],
                    gate: { x: 13, y: 10 },
                },
            ],
        });
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicCollar"), 0, false, "");
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(Spiderlings.SpinnerCapture.ID), 0, false, "");
        const bag = Spiderlings.SpinnerCapture.item();
        expect(bag, "The automatic pursuit fixture could not equip the leg bag");
        (bag.data ||= {}).wrapProgress = 1;
        KDSetWeapon(null);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
        for (let attacks = 0; field.isSpiderlingsWebCell({ x: 15, y: 10 }) && attacks < 20; attacks++) {
            KinkyDungeonMove({ x: 1, y: 0 }, 1, true, true);
            await frame();
        }
        expect(
            !field.isSpiderlingsWebCell({ x: 15, y: 10 }),
            "The completed leg bag fixture could not breach its field",
        );
        KDMovePlayer(16, 10, false);
        expect(recovery.departure(), "The completed leg bag departure did not arm recovery");
        for (const actor of pursuers) actor.stun = 0;
        encounter.builders = {};
        const nativeNearest = globalThis.KinkyDungeonNearestPlayer;
        if (preferNPC) {
            const npc = spawn("Bandit", 20, 7),
                reporter = spawn("Jumper", 13, 4);
            npc.stun = 999;
            reporter.hostile = 999;
            reporter.aware = false;
            const ratio = globalThis.KinkyDungeonTrackSneak({ ...reporter, vp: 1 }, 0, KinkyDungeonPlayerEntity);
            reporter.vp = 0.7 / ratio;
            globalThis.KinkyDungeonNearestPlayer = function (actor) {
                return pursuers.some((pursuer) => pursuer.id === actor.id) ? npc : nativeNearest.apply(this, arguments);
            };
        }
        Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
        const automatic = { mode: "automatic-departure", preferNPC, hits: 0, positions: [] },
            nativeBind = KDPlayerEffects.SpiderlingsWebbingEnemyBind;
        rows.push(automatic);
        KDPlayerEffects.SpiderlingsWebbingEnemyBind = function (...args) {
            if (args[2]?.profile === "Spinner") automatic.hits++;
            return nativeBind.apply(this, args);
        };
        try {
            for (
                let tick = 0;
                tick < 24 && !field.containsComposite("automatic-recovery", KinkyDungeonPlayerEntity);
                tick++
            ) {
                await turn();
                automatic.positions.push({
                    x: KinkyDungeonPlayerEntity.x,
                    y: KinkyDungeonPlayerEntity.y,
                    sources: recovery.strength(),
                    actors: pursuers.map((actor) => ({ id: actor.id, x: actor.x, y: actor.y })),
                });
            }
        } finally {
            KDPlayerEffects.SpiderlingsWebbingEnemyBind = nativeBind;
            globalThis.KinkyDungeonNearestPlayer = nativeNearest;
        }
        expect(automatic.hits > 0, `Escaped prey was not hit by native pursuit: ${JSON.stringify(automatic)}`);
        expect(
            automatic.positions.some((position) => position.sources > 0),
            `Native pursuit did not attach a real recovery strand: ${JSON.stringify(automatic)}`,
        );
        expect(
            field.containsComposite("automatic-recovery", KinkyDungeonPlayerEntity),
            `Paid recovery did not pull escaped prey home: ${JSON.stringify(automatic)}`,
        );
        expect(Spiderlings.SpinnerCapture.item() === bag, "Automatic recovery replaced the completed leg bag");
        expect(bag.data.wrapProgress === 1, "Automatic recovery changed the completed leg bag's progress");
        images[`automatic-departure-${preferNPC}`] = await photo();
    }
    setup("recovery-remote-relay");
    for (let y = 5; y <= 15; y++)
        for (let x = 5; x < KDMapData.GridWidth - 1; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMovePlayer(10, 10, false);
    const relays = Array.from({ length: 8 }, (_, index) => spawn("Spinner", 14 + index * 2, 10));
    for (const actor of relays) {
        actor.stun = 999;
        actor.hostile = 999;
    }
    const relayField = Spiderlings.SpinnerNativeField;
    relayField.initializeEnclosure({
        compositeId: "remote-relay",
        owners: relays.map((actor) => actor.id),
        built: true,
        autoSeal: true,
        layers: [
            {
                id: "relay-inner",
                vertices: [
                    { x: 9, y: 9 },
                    { x: 11, y: 9 },
                    { x: 11, y: 11 },
                    { x: 9, y: 11 },
                ],
                gate: { x: 11, y: 10 },
            },
        ],
    });
    KDSetWeapon(null);
    KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
    for (let attempts = 0; relayField.isSpiderlingsWebCell({ x: 11, y: 10 }) && attempts < 20; attempts++) {
        KinkyDungeonMove({ x: 1, y: 0 }, 1, true, true);
        await frame();
    }
    expect(!relayField.isSpiderlingsWebCell({ x: 11, y: 10 }), "Relay fixture could not breach its exit");
    KDMovePlayer(12, 10, false);
    const recovery = Spiderlings.SpinnerRecovery;
    expect(recovery.departure(), "Relay fixture did not depart a real field");
    KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicCollar"), 0, false, "");
    relays[0].stun = 0;
    KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        KinkyDungeonPlayerEntity,
        "glue",
        { profile: "Spinner" },
        undefined,
        "Enemy",
        undefined,
        relays[0],
    );
    expect(recovery.strength() === 1, "Relay root did not establish a native carrier");
    const beforeJoin = { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y };
    for (const actor of relays.slice(1)) {
        actor.stun = 0;
        recovery.handleEnemyTurn(actor, KinkyDungeonPlayerEntity, 0);
        expect(!recovery.sourceIds().includes(actor.id), "Zero-time relay joined without payment");
        recovery.handleEnemyTurn(actor, KinkyDungeonPlayerEntity, 2);
        expect(recovery.sourceIds().includes(actor.id), "Connected remote Spinner failed paid relay admission");
        expect(
            KinkyDungeonPlayerEntity.x === beforeJoin.x && KinkyDungeonPlayerEntity.y === beforeJoin.y,
            "Relay admission also pulled the player",
        );
    }
    expect(recovery.strength() === 8, "A single physical root did not support eight relay sources");
    restore(save());
    expect(recovery.strength() === 8, "Native reload lost a connected relay chain");
    const savedRelays = relays.map((actor) => enemy(actor.id));
    const chain = structuredClone(recovery.state());
    savedRelays[0].stun = 1;
    recovery.audit();
    expect(recovery.strength() === 0, "Disconnected remote relay cycle anchored itself");
    rows.push({ mode: "remote-relay", sources: chain, joiningDidNotPull: true, rootLossPruned: true });
    KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    return { rows, images };
})();
