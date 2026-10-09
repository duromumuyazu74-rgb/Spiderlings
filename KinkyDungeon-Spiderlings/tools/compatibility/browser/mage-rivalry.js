(async () => {
    const { setup, spawn, turn, expect, prepareCrew } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const open = (seed) => {
        setup(seed);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
    };
    for (const name of ["MaidKnightHeavy", "MaidKnightLight"]) {
        open("mage-rivalry-" + name);
        const mage = spawn("MageSpiderlings", 8, 10),
            target = spawn(name, 12, 10);
        Object.assign(mage, { hostile: 999, aware: true, vp: 10 });
        Object.assign(target, { hp: 30, stun: 100 });
        expect(KDGetFaction(target) === "Adventurer", "Knight must keep its actual native faction");
        expect(Spiderlings.Rivalry.isMaid(target) && KDHostile(mage, target), "Shared Maid identity was lost");
        const row = { name, hits: [] };
        rows.push(row);
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "MageRivalryAcceptance", (_e, data) => {
            if (data.enemy?.id === target.id && data.spell?.name === "SpiderlingsMageBolt")
                row.hits.push({ bind: data.incomingDamage?.bind, damage: data.dmgDealt });
        });
        expect(
            KinkyDungeonCastSpell(target.x, target.y, KinkyDungeonFindSpell("SpiderlingsMageBolt", true), mage)
                .result === "Cast",
            "Native Mage bolt failed to launch",
        );
        // Observe that committed projectile without extra AI casts or retaliation.
        mage.stun = 100;
        for (let i = 0; i < 8 && !row.hits.length; i++) await turn();
        row.ownedSilk = target.SpiderlingsNPCAdhesion?.ownedSilk || 0;
        expect(row.hits.some((hit) => hit.bind === 6) && row.ownedSilk > 0, "Knight bolt lost native owned silk");
    }

    open("mage-custody-interception");
    KDMovePlayer(10, 11, false);
    const crew = [
        [7, 7],
        [8, 7],
        [7, 8],
        [8, 8],
    ].map(([x, y]) => spawn("Spinner", x, y));
    prepareCrew({ actors: crew, fieldPermits: 1 });
    for (const actor of crew) actor.stun = 100;
    const field = Spiderlings.SpinnerNativeField;
    field.initializeEnclosure({
        compositeId: "mage-custody",
        owners: crew.map((actor) => actor.id),
        built: true,
        layers: [
            {
                id: "mage-custody-ring",
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
    expect(bag, "Custody needs a native leg bag");
    (bag.data ||= {}).wrapProgress = 1;
    Spiderlings.FieldCustody.capture("mage-custody", bag.id);
    const intruder = spawn("ElementalIce", 12, 10),
        defender = spawn("MageSpiderlings", 8, 10);
    intruder.Enemy = { ...intruder.Enemy, noAttack: true, spells: [] };
    intruder.modified = true;
    intruder.movePoints = -1000;
    Object.assign(defender, { hp: 30, hostile: 999, aware: true, vp: 10, castCooldown: 0 });
    KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicLeash"), 0, false, "");
    expect(KinkyDungeonAttachTetherToEntity(4, intruder, KDPlayer(), "Default"), "Missing competing native tether");
    Spiderlings.FieldCustody.prepare();
    expect(Spiderlings.FieldCustody.targetFor(defender) === intruder, "Field did not approve its Mage defender");
    const row = { name: "mage-custody", casts: [] };
    rows.push(row);
    KDAddEvent(KDEventMapGeneric, "enemyCast", "MageRivalryCastAcceptance", (_e, data) => {
        if (data.enemy?.id === defender.id && data.player?.id === intruder.id) row.casts.push(data.spell.name);
    });
    for (let i = 0; i < 32 && !(intruder.SpiderlingsNPCAdhesion?.ownedSilk > 0); i++) await turn();
    row.ownedSilk = intruder.SpiderlingsNPCAdhesion?.ownedSilk || 0;
    expect(row.casts.length && row.ownedSilk > 0, "Approved Mage cast never bound the competing escort");
    return { rows };
})();
