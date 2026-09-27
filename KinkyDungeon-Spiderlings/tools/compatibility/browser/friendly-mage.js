(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const turn = async () => {
        KinkyDungeonAdvanceTime(1);
        await frame();
    };
    const setup = () => {
        KinkyDungeonStartNewGame(false);
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        KDUpdateEnemyCache = true;
        for (let y = 3; y < 16; y++)
            for (let x = 3; x < 19; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(10, 10, false);
        const mage = DialogueCreateEnemy(8, 8, "MageSpiderlings");
        const target = DialogueCreateEnemy(11, 10, "Maidforce");
        target.hostile = 999;
        target.shield = 0;
        KDGameData.CurrentDialogMsgID = mage.id;
        KDGameData.CurrentDialogMsgSpeaker = mage.Enemy.name;
        KDAllySpeaker(9999, true);
        expect(!KDHostile(mage, KinkyDungeonPlayerEntity) && KDHostile(mage, target), "Ally fixture failed");
        mage.stun = 999;
        target.stun = 999;
        return { mage, target };
    };
    const cast = (name, mage, target) => {
        expect(
            KinkyDungeonCastSpell(
                target.x,
                target.y,
                KinkyDungeonSpellListEnemies.find((s) => s.name === name),
                mage,
            ).result === "Cast",
            `${name}: cast failed`,
        );
    };
    const playerState = () => ({
        will: KinkyDungeonStatWill,
        restraints: KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name),
    });
    const remove = (mage) => {
        KDMapData.Entities = KDMapData.Entities.filter((e) => e !== mage);
        KDUpdateEnemyCache = true;
    };
    const records = [];
    {
        const { mage, target } = setup();
        const before = playerState();
        const npcHP = target.hp;
        cast("SpiderlingsMageCollapse", mage, target);
        for (let i = 0; i < 3; i++) await turn();
        const after = playerState();
        expect(JSON.stringify(before) === JSON.stringify(after), "Friendly Collapse harmed player");
        expect(target.hp < npcHP && target.specialBoundLevel?.Slime > 0, "Friendly Collapse missed hostile NPC");
        records.push({ spell: "Collapse", before, after, npcSlime: target.specialBoundLevel.Slime });
    }
    {
        const { mage, target } = setup();
        const before = playerState();
        cast("SpiderlingsMageHex", mage, target);
        remove(mage);
        KDMapData.SpiderlingsMageSpells = JSON.parse(JSON.stringify(KDMapData.SpiderlingsMageSpells));
        for (let i = 0; i < 5; i++) await turn();
        expect(!Spiderlings.MageSpells.markFor(KinkyDungeonPlayerEntity), "Orphan friendly Hex marked player");
        expect(Spiderlings.MageSpells.markFor(target)?.stacks === 3, "Friendly Hex missed hostile NPC");
        const spinner = DialogueCreateEnemy(10, 9, "Spinner");
        spinner.faction = "Player";
        spinner.stun = 999;
        Spiderlings.Combat.hitNPC(spinner, target, "melee");
        expect(
            KDMapData.SpiderlingsMageSpells.blasts.some((b) => b.detonateAt),
            "Hex mark did not trigger",
        );
        const slime = target.specialBoundLevel?.Slime || 0;
        KDMapData.SpiderlingsMageSpells = JSON.parse(JSON.stringify(KDMapData.SpiderlingsMageSpells));
        await turn();
        await turn();
        const after = playerState();
        expect(JSON.stringify(before) === JSON.stringify(after), "Orphan friendly Hex blast bound player");
        expect(target.specialBoundLevel?.Slime > slime, "Orphan friendly Hex blast missed hostile NPC");
        records.push({ spell: "Hex", before, after, npcSlime: target.specialBoundLevel.Slime });
    }
    {
        const { mage, target } = setup();
        const before = playerState();
        cast("SpiderlingsMageRune", mage, target);
        const rune = KDMapData.Bullets.find((b) => b.bullet.spell?.name === "SpiderlingsMageRune");
        expect(rune, "Rune missing");
        remove(mage);
        await turn();
        await turn();
        KDMovePlayer(rune.x, rune.y, false);
        await turn();
        expect(rune.SpiderlingsRunePhase === "armed", "Friendly player triggered orphan rune");
        KDMovePlayer(rune.x + 1, rune.y, false);
        KDMoveEntity(target, rune.x, rune.y, false);
        await turn();
        expect(rune.SpiderlingsRunePhase === "triggered", "Hostile NPC did not trigger friendly rune");
        await turn();
        const after = playerState();
        expect(JSON.stringify(before) === JSON.stringify(after), "Friendly rune blast bound player");
        expect(target.specialBoundLevel?.Slime > 0, "Friendly rune failed to bind hostile NPC");
        records.push({ spell: "Rune", before, after, npcSlime: target.specialBoundLevel.Slime });
    }
    return records;
})();
