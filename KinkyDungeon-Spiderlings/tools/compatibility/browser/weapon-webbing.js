(async () => {
    const expect = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const KEY = "SpiderlingsWeaponWebbing",
        rows = [];
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const names = (enemy) => Object.values(KDGetNPCRestraints(enemy.id)).map((item) => item.name);
    const spawn = (offset) => {
        const enemy = DialogueCreateEnemy(KinkyDungeonPlayerEntity.x + offset, KinkyDungeonPlayerEntity.y, "Maidforce");
        enemy.hostile = 999;
        enemy.shield = 0;
        enemy.stun = 999;
        KDQuickGenNPC(enemy, true);
        return enemy;
    };
    const hit = (enemy, amount, spell = "SpiderlingsCocoonConvergence") =>
        KinkyDungeonDamageEnemy(
            enemy,
            { damage: 0, type: "glue", bind: amount, bindType: "Slime", nocrit: true },
            true,
            true,
            KinkyDungeonFindSpell(spell, true),
            undefined,
            KinkyDungeonPlayerEntity,
        );
    KinkyDungeonStartNewGame(false);
    Spiderlings.SpinnerField.enter();
    KDMapData.Entities = [];
    KDUpdateEnemyCache = true;
    const enemy = spawn(1);
    const initialGear = names(enemy);
    hit(enemy, 1);
    const light = Spiderlings.WeaponWebbing.status(enemy);
    expect(light?.amount > 0 && !light.cocoon, "Partial silk lost ownership or formed a premature cocoon");
    hit(enemy, 24);
    const final = Spiderlings.WeaponWebbing.status(enemy);
    expect(
        final?.cocoon && KDHelpless(enemy) && final.pieces === 0,
        "Complete native silk did not form an equipment-free cocoon",
    );
    expect(JSON.stringify(names(enemy)) === JSON.stringify(initialGear), "Weapon issued NPC restraints");
    const snapshot = JSON.stringify(enemy[KEY]);
    for (let i = 0; i < 24; i++) Spiderlings.WeaponWebbing.status(enemy);
    expect(JSON.stringify(enemy[KEY]) === snapshot, "Drawing mutated material ownership");
    rows.push({
        scenario: "partial-complete",
        light,
        final,
        bound: enemy.boundLevel,
        slime: enemy.specialBoundLevel.Slime,
        gear: initialGear,
    });

    // Reproduce a test.84 ledger-owned conjured piece. Manual and unregistered pieces stay intact.
    const restraint = KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Arm");
    const slot = KDGetNPCBindingSlotForItem(restraint, enemy.id).sgroup.id;
    const oldItem = { id: KinkyDungeonGetItemID(), name: restraint.name, conjured: true, faction: "Player", lock: "" };
    KDSetNPCRestraint(enemy.id, slot, oldItem, false, [slot], undefined, true);
    enemy[KEY].items.push({ id: oldItem.id, amount: 1 });
    const beforeBind = enemy.boundLevel,
        beforeSlime = enemy.specialBoundLevel.Slime,
        id = enemy.id;
    await frame();
    await frame();
    const saved = KinkyDungeonSaveGame(true);
    expect(
        KinkyDungeonLoadGame(
            typeof saved === "string" ? saved : LZString.compressToBase64(JSON.stringify(saved)),
            true,
        ),
        "Native saved silk failed to load",
    );
    const restored = KDMapData.Entities.find((entry) => entry.id === id);
    expect(
        restored[KEY]?.items.length === 0 &&
            !Object.values(KDGetNPCRestraints(id)).some((item) => item.id === oldItem.id),
        "Legacy ledger-owned equipment survived loading",
    );
    expect(
        restored.boundLevel === beforeBind && restored.specialBoundLevel.Slime === beforeSlime,
        "Legacy cleanup debited binding twice",
    );
    expect(Spiderlings.WeaponWebbing.status(restored)?.cocoon, "Legacy cleanup removed the real cocoon");
    rows.push({
        scenario: "legacy-load",
        beforeBind,
        afterBind: restored.boundLevel,
        beforeSlime,
        afterSlime: restored.specialBoundLevel.Slime,
        retainedCocoon: true,
    });
    KDTieUpEnemy(restored, -(restored.specialBoundLevel.Slime - restored.Enemy.maxhp * 0.5), "Slime", {}, false, 0);
    expect(
        Spiderlings.WeaponWebbing.status(restored)?.amount > 0 && !Spiderlings.WeaponWebbing.status(restored).cocoon,
        "Native recovery failed to open the cocoon",
    );
    KDTieUpEnemy(restored, -(restored.specialBoundLevel.Slime || 0), "Slime", {}, false, 0);
    expect(!Spiderlings.WeaponWebbing.status(restored), "Freed prey retained weapon silk");
    const staff = spawn(2);
    hit(staff, 24, "SpiderlingsSilkenSnare");
    expect(
        Spiderlings.WeaponWebbing.status(staff)?.cocoon && names(staff).length === 0,
        "Staff cocoon created equipment or failed native thresholds",
    );
    const mixed = spawn(3);
    KDTieUpEnemy(mixed, 100, "Slime", {}, false, 0);
    hit(mixed, 1);
    expect(!Spiderlings.WeaponWebbing.status(mixed)?.cocoon, "Foreign material paid for an owned cocoon");
    const shield = spawn(4);
    shield.shield = 1000;
    hit(shield, 24);
    expect(!shield[KEY], "Completely shielded binding produced owned material");
    const created = KinkyDungeonSummonEnemy(
        KinkyDungeonPlayerEntity.x + 2,
        KinkyDungeonPlayerEntity.y + 2,
        "Maidforce",
        1,
        0,
        false,
        undefined,
        false,
        false,
        "Player",
        false,
        0,
        true,
        true,
    )[0];
    expect(created?.SpiderlingsWeaponPlayerCreated, "Native player summon missed provenance at creation");
    created.faction = "Enemy";
    created.allied = 0;
    created.hostile = 999;
    hit(created, 40);
    expect(!created.SpiderlingsWeaponCocoonRewarded, "Released player summon claimed a cocoon reward");
    rows.push({
        scenario: "native-player-summon",
        markedAtCreation: true,
        releasedFaction: created.faction,
        rewarded: !!created.SpiderlingsWeaponCocoonRewarded,
    });
    await frame();
    return {
        rows,
        light,
        final,
        nativeRecovery: true,
        noAutomaticEquipment: true,
        strictLegacyCleanup: true,
        foreignSlime: true,
        shield: true,
    };
})();
