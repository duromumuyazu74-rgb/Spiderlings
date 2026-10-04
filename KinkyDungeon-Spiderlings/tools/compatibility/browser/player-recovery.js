(async () => {
    const { setup, spawn, turn, frame, expect, photo, save, restore } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = {};
    {
        setup("gate-reorientation");
        for (let y = 2; y < 23; y++)
            for (let x = 2; x < 28; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(19, 10, false);
        const actors = [spawn("Spinner", 12, 8), spawn("Spinner", 12, 12)],
            reporter = spawn("WebCaster", 19, 8),
            field = Spiderlings.SpinnerNativeField,
            ai = Spiderlings.SpinnerAI;
        reporter.Enemy = { ...reporter.Enemy, movePoints: 999, attackPoints: 999, spells: [] };
        reporter.modified = true;
        reporter.hostile = 999;
        reporter.aware = true;
        reporter.vp = 10;
        for (const actor of actors) {
            actor.hostile = 999;
            actor.aware = false;
        }
        field.initializeEnclosure({
            compositeId: "rotating",
            owners: actors.map((a) => a.id),
            built: true,
            layers: [
                {
                    id: "rotating-inner",
                    vertices: [
                        { x: 11, y: 7 },
                        { x: 15, y: 7 },
                        { x: 15, y: 13 },
                        { x: 11, y: 13 },
                    ],
                    gate: { x: 11, y: 10 },
                },
            ],
        });
        field.state().builders = {};
        ai.beginTurn({ activate: true, adoptExisting: true });
        const gateRows = [];
        for (const x of [19, 7]) {
            KDMovePlayer(x, 10, false);
            KDMoveEntity(reporter, x, 8, true, undefined, true, true);
            reporter.vp = 10;
            reporter.aware = true;
            for (let tick = 0; tick < 90; tick++) {
                await turn();
                const f = field.state().topology.fields["rotating-inner"];
                gateRows.push({
                    tick: KinkyDungeonCurrentTick,
                    playerX: x,
                    gate: f.gateCell,
                    phase: f.phase,
                    actions: field.state().topology.actionLog.length,
                    assignment: Object.values(field.state().ai.groups).map((g) => g.assignments),
                    actors: actors.map((a) => ({ x: a.x, y: a.y })),
                });
                if ((x > 13 ? f.gateCell.x === 15 : f.gateCell.x === 11) && f.phase === "ready") break;
            }
            const f = field.state().topology.fields["rotating-inner"];
            expect(
                (x > 13 ? f.gateCell.x === 15 : f.gateCell.x === 11) && f.phase === "ready",
                `gate failed ${JSON.stringify(gateRows.slice(-3))}`,
            );
            const solids = new Set(
                Spiderlings.SpinnerTopology.solidCells(field.state().topology).map((c) => `${c.x},${c.y}`),
            );
            expect(
                f.boundaryCells.filter((c) => !solids.has(`${c.x},${c.y}`)).length === 1,
                "Old entrance was not rebuilt",
            );
        }

        rows.push({ mode: "gate-reorientation", turns: gateRows });
        images["gate-reorientation"] = await photo();
    }
    for (const count of [1, 2, 4, 8, 12]) {
        setup(`native-recovery-debt-${count}`);
        for (let y = 2; y < 23; y++)
            for (let x = 2; x < 28; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(15, 10, false);
        KDGameData.MovePoints = 0;
        globalThis.KinkyDungeonToggleAutoSprint = count === 4;
        const positions = [
                { x: 13, y: 10 },
                ...Array.from({ length: 15 }, (_, i) => ({ x: 12 + (i % 3), y: 8 + Math.floor(i / 3) })).filter(
                    (p) => p.x !== 13 || p.y !== 10,
                ),
            ],
            actors = positions.slice(0, count).map((p) => spawn("Spinner", p.x, p.y));
        // Isolate player movement cost from escort travel; native movement/input,
        // tether checks, world turns, source auditing and saves remain active.
        for (const actor of actors) {
            actor.hostile = 999;
            actor.aware = true;
            // KD 5.5 lowers the active native leash holder's threshold to one,
            // regardless of Enemy.movePoints. Withhold movement credit for this
            // interval-only fixture; the moving-escort cases below use normal credit.
            actor.movePoints = -1000;
        }
        const field = Spiderlings.SpinnerNativeField,
            recovery = Spiderlings.SpinnerRecovery;
        field.initializeEnclosure({
            compositeId: "movement",
            owners: actors.map((a) => a.id),
            built: false,
            layers: [
                {
                    id: "inner",
                    vertices: [
                        { x: 7, y: 8 },
                        { x: 11, y: 8 },
                        { x: 11, y: 12 },
                        { x: 7, y: 12 },
                    ],
                    gate: { x: 11, y: 10 },
                },
            ],
        });
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicCollar"), 0, false, "");
        const external = count === 4;
        if (external) KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicLeash"), 0, false, "");
        const originalCarrier = external && KinkyDungeonGetRestraintItem(recovery.GROUP);
        if (originalCarrier) {
            originalCarrier.cutProgress = 0.37;
            originalCarrier.struggleProgress = 0.23;
        }
        const originalContents = originalCarrier && JSON.stringify(originalCarrier);
        KDGameData[recovery.DEPARTURE] = {
            version: 1,
            compositeId: "movement",
            eligibleSourceIds: actors.map((a) => a.id),
        };
        for (const actor of actors) expect(recovery.hit(actor), "Native tether admission failed");
        expect(
            KDPlayer().leash?.reason === recovery.TETHER_REASON &&
                KDPlayer().leash.restraintID === recovery.state().carrierId,
            "Recovery lacks a real native tether",
        );
        expect(
            !KDInputTypes.spiderlingsRecoveryStand && !KDInputTypes.spiderlingsRecoveryRemoveSource,
            "Independent recovery inputs remain registered",
        );
        KinkyDungeonUpdateStats(0);
        const moves = [];
        let direction = -1;
        for (let i = 0; i < count * 3 + 2; i++) {
            const before = { x: KDPlayer().x, y: KDPlayer().y };
            KinkyDungeonMove({ x: 0, y: direction }, 1, true, true);
            await frame();
            if (KDPlayer().x !== before.x || KDPlayer().y !== before.y) {
                moves.push({ input: i, tick: KinkyDungeonCurrentTick, points: KDGameData.MovePoints });
                direction *= -1;
            }
            if (i === 0 && count === 12) {
                const debt = KDGameData.MovePoints,
                    carrier = recovery.state().carrierId;
                KinkyDungeonDressPlayer();
                UpdateModels(KinkyDungeonPlayer);
                DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
                restore(save());
                expect(
                    KDGameData.MovePoints === debt &&
                        recovery.strength() === count &&
                        KDPlayer().leash.restraintID === carrier,
                    "Native reload changed movement debt or tether ownership",
                );
            }
        }
        expect(recovery.strength() === count, "Movement silently lost a live connected tether source");
        expect(
            moves.length >= 3 && moves.slice(1).every((move, i) => move.input - moves[i].input === count),
            `Wrong native movement interval: ${JSON.stringify({ count, moves })}`,
        );
        if (originalCarrier)
            expect(JSON.stringify(originalCarrier) === originalContents, "Borrowed native leash contents changed");
        rows.push({ mode: "native-movement", count, moves, external });
        images[`native-${count}`] = await photo();
        const carrier = KinkyDungeonAllRestraintDynamic().find(
            ({ item }) => item.id === recovery.state().carrierId,
        ).item;
        KinkyDungeonRemoveRestraintSpecific(carrier, false, false, false);
        expect(!KDPlayer().leash && !recovery.state(), "Native carrier removal left recovery active");
    }
    for (const count of [1, 4, 12]) {
        setup(`moving-recovery-${count}`);
        for (let y = 2; y < 23; y++)
            for (let x = 2; x < 28; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(15, 10, false);
        globalThis.KinkyDungeonToggleAutoSprint = false;
        const positions = [
                { x: 13, y: 10 },
                ...Array.from({ length: 15 }, (_, i) => ({ x: 12 + (i % 3), y: 8 + Math.floor(i / 3) })).filter(
                    (p) => p.x !== 13 || p.y !== 10,
                ),
            ],
            actors = positions.slice(0, count).map((p) => spawn("Spinner", p.x, p.y)),
            field = Spiderlings.SpinnerNativeField,
            recovery = Spiderlings.SpinnerRecovery;
        for (const actor of actors) actor.hostile = 999;
        field.initializeEnclosure({
            compositeId: "move-home",
            owners: actors.map((a) => a.id),
            built: false,
            layers: [
                {
                    id: "inner",
                    vertices: [
                        { x: 5, y: 8 },
                        { x: 9, y: 8 },
                        { x: 9, y: 12 },
                        { x: 5, y: 12 },
                    ],
                    gate: { x: 9, y: 10 },
                },
            ],
        });
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicCollar"), 0, false, "");
        KDGameData[recovery.DEPARTURE] = {
            version: 1,
            compositeId: "move-home",
            eligibleSourceIds: actors.map((a) => a.id),
        };
        for (const a of actors) expect(recovery.hit(a), "hit failed");
        const trace = [];
        for (let i = 0; i < 30; i++) {
            KinkyDungeonMove({ x: 1, y: 0 }, 1, true, true);
            await frame();
            trace.push({ x: KDPlayer().x, y: KDPlayer().y, sources: recovery.strength(), debt: KDGameData.MovePoints });
            if (KDPlayer().x < 10) break;
        }
        expect(
            trace.some((t) => t.x < 15),
            `No native drag against repeated movement ${JSON.stringify({ count, trace })}`,
        );
        rows.push({ mode: "moving-recovery", count, trace });
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
        await turn();
        expect(!recovery.state(), "Arriving in the common core did not release temporary pulling duty");
        images[`automatic-departure-${preferNPC}`] = await photo();
    }
    return { rows, images };
})();
