(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const records = [];
    for (const state of ["alive", "removed", "dead"]) {
        KinkyDungeonStartNewGame(false);
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        KDUpdateEnemyCache = true;
        for (let y = 3; y < 16; y++)
            for (let x = 3; x < 19; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(10, 12, false);
        const caster = DialogueCreateEnemy(8, 8, "WebCaster");
        const target = DialogueCreateEnemy(12, 8, "Maidforce");
        caster.stun = 999;
        target.stun = 999;
        target.shield = 0;
        const cast = KinkyDungeonCastSpell(
            target.x,
            target.y,
            KinkyDungeonSpellListEnemies.find((s) => s.name === "WebSpray"),
            caster,
        );
        expect(cast.result === "Cast", "WebSpray cast failed");
        const before = { hp: target.hp, slime: target.specialBoundLevel?.Slime || 0 };
        if (state === "removed") KDMapData.Entities = KDMapData.Entities.filter((e) => e !== caster);
        if (state === "dead") caster.hp = 0;
        KDUpdateEnemyCache = true;
        for (let i = 0; i < 35; i++) {
            KinkyDungeonUpdateBullets(0.1, true);
            KinkyDungeonUpdateBullets(0.1, false);
            await new Promise((resolve) => requestAnimationFrame(resolve));
        }
        const after = {
            hp: target.hp,
            slime: target.specialBoundLevel?.Slime || 0,
            attributed: Spiderlings.NPCAdhesion.hasAttributedSilk(target),
        };
        expect(after.slime > before.slime && after.attributed, `${state}: spray did not bind NPC`);
        expect(after.hp < before.hp, `${state}: spray contact damage missing`);
        records.push({ state, before, after });
    }
    expect(
        records.every((r) => r.after.slime === records[0].after.slime),
        "Orphaned spray changed binding amount",
    );
    return records;
})();
