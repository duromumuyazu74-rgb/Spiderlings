(async () => {
    const { setup, spawn, turn, expect, save, restore, prepareCrew } = globalThis.normalAcceptance;
    setup("field-custody-recovery-contact");
    for (let y = 1; y < KDMapData.GridHeight - 1; y++)
        for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMovePlayer(12, 10, false);
    const crew = [spawn("Spinner", 11, 10), spawn("Spinner", 12, 11), spawn("Spinner", 9, 12), spawn("Spinner", 8, 9)];
    prepareCrew({ actors: crew, fieldPermits: 1 });
    crew[0].AI = "guard";
    for (const actor of crew) Object.assign(actor, { hostile: 999, aware: true, vp: 10 });
    const field = Spiderlings.SpinnerNativeField;
    field.initializeEnclosure({
        compositeId: "custody-field",
        owners: crew.map((a) => a.id),
        built: true,
        layers: [
            {
                id: "custody-ring",
                vertices: [
                    { x: 6, y: 6 },
                    { x: 14, y: 6 },
                    { x: 14, y: 14 },
                    { x: 6, y: 14 },
                ],
                gate: { x: 14, y: 10 },
            },
        ],
    });
    field.state().builders = {};
    Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
    for (const name of ["SpiderlingsSpinnerLegbinder", "SpiderlingsWebbingLv1Gag", "SpiderlingsWebbingLv3Arm"])
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(name), 0, false, "");
    const bag = Spiderlings.SpinnerCapture.item();
    expect(bag, "Captured-prey fixture requires its native leg bag");
    (bag.data ||= {}).wrapProgress = 1;
    KinkyDungeonStatWill = 0;
    Spiderlings.FieldCustody.capture("custody-field", bag.id);
    let hits = 0;
    const nativeBind = KDPlayerEffects.SpiderlingsWebbingEnemyBind;
    KDPlayerEffects.SpiderlingsWebbingEnemyBind = function (...args) {
        if (args[2]?.profile === "Spinner") hits++;
        return nativeBind.apply(this, args);
    };
    const trace = (globalThis.normalTrace = []);
    try {
        for (let i = 0; i < 24; i++) {
            await turn();
            trace.push({
                i,
                x: KDPlayer().x,
                y: KDPlayer().y,
                sources: Spiderlings.SpinnerRecovery.sourceIds().length,
                hits,
            });
            if (KDPlayer().x === 10 && KDPlayer().y === 10 && !Spiderlings.SpinnerRecovery.state()) break;
        }
    } finally {
        KDPlayerEffects.SpiderlingsWebbingEnemyBind = nativeBind;
    }
    expect(hits > 0, "Field contact must cross an actual native hit, not inject Recovery.hit");
    expect(
        trace.some((t) => t.sources > 0),
        `Recovery never attached: ${JSON.stringify(trace)}`,
    );
    expect(
        KDPlayer().x === 10 && KDPlayer().y === 10,
        `Recovery did not reach the exact center: ${JSON.stringify(trace)}`,
    );
    restore(save());
    expect(Spiderlings.FieldCustody.state()?.bagId === bag.id, "Reload lost captured-prey attribution");

    const intruder = spawn("ElementalIce", 11, 10);
    intruder.hostile = 999;
    const leash = KinkyDungeonAttachTetherToEntity(2.5, intruder, KDPlayer(), "Default");
    expect(leash, "Competition requires a real native tether");
    let attacks = 0;
    const nativeAttack = KinkyDungeonEnemyTryAttack;
    KinkyDungeonEnemyTryAttack = function (actor, target, ...args) {
        if (actor.Enemy?.tags?.spiderlings && target?.id === intruder.id) attacks++;
        return nativeAttack.call(this, actor, target, ...args);
    };
    try {
        for (let i = 0; i < 14 && attacks === 0; i++) await turn();
    } finally {
        KinkyDungeonEnemyTryAttack = nativeAttack;
    }
    expect(attacks > 0, "A field defense order must execute native attacks against the competing escort");
    expect(Spiderlings.FieldCustody.state()?.defenders.length <= 2, "All workers were diverted into interception");
    for (const original of crew) {
        const actor = KDMapData.Entities.find((a) => a.id === original.id);
        if (actor) actor.channel = 30;
    }
    const position = [
        { x: intruder.x + 2, y: intruder.y },
        { x: intruder.x, y: intruder.y - 2 },
        { x: intruder.x - 2, y: intruder.y },
    ].find(
        (cell) =>
            KinkyDungeonMapGet(cell.x, cell.y) === "0" &&
            !KinkyDungeonEntityAt(cell.x, cell.y) &&
            !(KDPlayer().x === cell.x && KDPlayer().y === cell.y),
    );
    expect(position, "Ranged interception fixture needs a free firing position");
    const caster = spawn("WebCaster", position.x, position.y);
    // Keep the observation alive through retaliation; spell parameters and costs
    // are unchanged and the native template keeps its player-leash policy.
    Object.assign(caster, { hp: 20, hostile: 999, aware: true, vp: 10, castCooldown: 0 });
    const casts = [];
    KDAddEvent(KDEventMapGeneric, "enemyCast", "FieldCustodyRangedAcceptance", (_e, data) => {
        if (data.enemy?.id === caster.id && data.player?.id === intruder.id)
            casts.push({ spell: data.spell.name, target: data.player.id });
    });
    for (let i = 0; i < 12 && !casts.length; i++) await turn();
    expect(
        casts.some((cast) => cast.spell === "WebSpray"),
        "Player restraint/leash policy blocked NPC interception casting",
    );
    expect(!caster.modified, "The action must preserve an ordinary native enemy");
    expect(caster.Enemy.followLeashedOnly === true, "The scoped action leaked a changed WebCaster definition");
    return { hits, attacks, casts, trace, custody: Spiderlings.FieldCustody.state() };
})();
