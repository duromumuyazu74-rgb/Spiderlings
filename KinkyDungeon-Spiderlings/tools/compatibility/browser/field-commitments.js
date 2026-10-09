(async () => {
    const { setup, spawn, turn, expect, prepareCrew } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const field = Spiderlings.SpinnerNativeField;
    const open = (seed, player, positions, progress) => {
        setup(seed);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(player.x, player.y, false);
        const crew = positions.map(([x, y]) => spawn("Spinner", x, y));
        prepareCrew({ actors: crew, fieldPermits: 1 });
        for (const actor of crew) Object.assign(actor, { hostile: 999, aware: true, vp: 10 });
        field.initializeEnclosure({
            compositeId: seed,
            owners: crew.map((actor) => actor.id),
            built: true,
            layers: [
                {
                    id: seed + "-ring",
                    vertices: [
                        { x: 5, y: 5 },
                        { x: 15, y: 5 },
                        { x: 15, y: 15 },
                        { x: 5, y: 15 },
                    ],
                    gate: { x: 15, y: 10 },
                },
            ],
        });
        field.state().builders = {};
        Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsSpinnerLegbinder"), 0, false, "");
        const bag = Spiderlings.SpinnerCapture.item();
        expect(bag, "Fixture needs its real leg bag");
        (bag.data ||= {}).wrapProgress = progress;
        Spiderlings.FieldCustody.capture(seed, bag.id);
        return { crew, bag };
    };
    {
        const { crew } = open(
            "committed-interception",
            { x: 10, y: 11 },
            [
                [7, 7],
                [8, 7],
                [7, 8],
                [8, 8],
            ],
            1,
        );
        for (const actor of crew) actor.stun = 100;
        const intruder = spawn("ElementalIce", 12, 10),
            jumper = spawn("Jumper", 9, 10);
        intruder.Enemy = { ...intruder.Enemy, noAttack: true, spells: [] };
        intruder.modified = true;
        intruder.movePoints = -1000;
        Object.assign(jumper, { hostile: 999, aware: true, vp: 10, castCooldown: 0, castCooldownSpecial: 0 });
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicLeash"), 0, false, "");
        expect(
            KinkyDungeonAttachTetherToEntity(4, intruder, KDPlayer(), "Default"),
            "Fixture needs a competing native tether",
        );
        const row = { mode: "committed-dash", casts: [], turns: [], hits: [] };
        rows.push(row);
        KDAddEvent(KDEventMapGeneric, "enemyCast", "CommitmentDashCast", (_e, data) => {
            if (data.enemy.id === jumper.id)
                row.casts.push({
                    spell: data.spell.name,
                    target: data.player.id,
                    hostile: KDHostile(jumper, intruder),
                    states: Spiderlings.JumperDash.runtimeController.snapshot(),
                });
        });
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "CommitmentDashHit", (_e, data) => {
            if (data.enemy.id === intruder.id && data.incomingDamage?.spiderlingsAttack === "dash")
                row.hits.push({ slime: data.enemy.specialBoundLevel?.Slime || 0 });
        });
        for (let i = 0; i < 8 && !row.hits.length; i++) {
            await turn();
            row.turns.push({
                tick: KinkyDungeonCurrentTick,
                x: jumper.x,
                y: jumper.y,
                states: Spiderlings.JumperDash.runtimeController.snapshot(),
                defenders: Spiderlings.FieldCustody.state()?.defenders,
            });
        }
        expect(row.casts.length === 1 && row.casts[0].hostile, "Committed interception revoked its own hostility");
        expect(
            row.turns[0].states.length === 1 && row.turns[0].states[0].opportunities === 0,
            "Cast action consumed the reaction window",
        );
        expect(
            row.turns[1].states.length === 1 && row.turns[1].states[0].opportunities === 1,
            "The first later action cancelled the commitment",
        );
        expect(
            row.hits.some((hit) => hit.slime > 0),
            "The native Dash never applied NPC silk",
        );
        expect(jumper.x !== 9 || jumper.y !== 10, "The committed Dash never landed");
        expect(!Spiderlings.JumperDash.runtimeController.snapshot().length, "Resolved commitment was not cleared");
    }
    {
        const seed = "partial-bag-exit",
            { crew, bag } = open(
                seed,
                { x: 14, y: 10 },
                [
                    [13, 10],
                    [14, 9],
                    [13, 9],
                    [12, 9],
                ],
                0.2,
            );
        // Starting saved state represents an ongoing weave. Neither recovery nor
        // the successful native recovery hit is injected by this scene.
        KDGameData.SpiderlingsSpinnerCapture = {
            version: 3,
            phase: "wrap",
            target: { kind: "player", x: 14, y: 10 },
            admittedCompositeId: seed,
            sourceIds: crew.slice(0, 2).map((actor) => actor.id),
            itemId: bag.id,
            weaveProgress: 0,
            escapeProgress: 0,
        };
        expect(Spiderlings.SpinnerCapture.isControllingPlayer(), "Fixture must start during Capture");
        KDMovePlayer(15, 10, false);
        KDMovePlayer(16, 10, false);
        expect(!field.containsComposite(seed, KDPlayer()), "Player did not leave the whole field");
        expect(Spiderlings.SpinnerRecovery.requested(), "Active Capture discarded the actual partial-bag exit");
        expect(!Spiderlings.SpinnerRecovery.state(), "Recovery took over before Capture released control");
        Spiderlings.SpinnerCapture.auditSources();
        expect(!Spiderlings.SpinnerCapture.isControllingPlayer(), "Departure did not interrupt the old weave");
        const row = { mode: "partial-bag-handoff", turns: [], hits: 0 };
        rows.push(row);
        const native = KDPlayerEffects.SpiderlingsWebbingEnemyBind;
        KDPlayerEffects.SpiderlingsWebbingEnemyBind = function (...args) {
            if (args[2]?.profile === "Spinner") row.hits++;
            return native.apply(this, args);
        };
        try {
            for (let i = 0; i < 24 && !Spiderlings.SpinnerRecovery.state(); i++) {
                await turn();
                row.turns.push({
                    tick: KinkyDungeonCurrentTick,
                    requested: Spiderlings.SpinnerRecovery.requested(),
                    sources: Spiderlings.SpinnerRecovery.sourceIds().length,
                });
            }
        } finally {
            KDPlayerEffects.SpiderlingsWebbingEnemyBind = native;
        }
        expect(
            row.hits > 0 && Spiderlings.SpinnerRecovery.sourceIds().length > 0,
            "No native hit admitted the queued departure after Capture ended",
        );
        expect(bag.data.wrapProgress === 0.2, "Handoff changed existing bag progress");
    }
    return { rows };
})();
