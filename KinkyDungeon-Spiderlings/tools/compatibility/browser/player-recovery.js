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
                for (let n = 0; n < 2; n++) actions.push(recovery.sourceRemovalInput({ sourceId: id, type: "Remove" }));
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
    KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    return { rows, images };
})();
