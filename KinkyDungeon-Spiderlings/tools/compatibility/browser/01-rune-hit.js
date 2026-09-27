(async () => {
    KinkyDungeonStartNewGame(false);
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    for (let x = 2; x <= 17; x++)
        for (let y = 2; y <= 14; y++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMapData.Entities = [];
    KDMapData.Bullets = [];
    KDUpdateEnemyCache = true;
    KDPathCache = new Map();
    KDPathCacheIgnoreLocks = new Map();
    KDMovePlayer(10, 7, false);
    const summon = (name, x, y) =>
        KinkyDungeonSummonEnemy(
            x,
            y,
            name,
            1,
            0,
            false,
            undefined,
            false,
            false,
            undefined,
            false,
            undefined,
            true,
            true,
        )?.[0];
    const mage = summon("MageSpiderlings", 7, 7);
    // KD 5.5.0's hearing silhouette requests EnemiesBound/<name>.png.
    // MaidforcePara has that official asset; basic Maidforce only supplies Maid.png.
    const maid = summon("MaidforcePara", 9, 7);
    const shielded = summon("Maidforce", 10, 8);
    const immune = summon("Maidforce", 11, 7);
    for (const e of [mage, maid, shielded, immune]) {
        expect(e, "Summon failed");
        e.stun = 100;
    }
    shielded.shield = 100;
    KinkyDungeonAdvanceTime(1);
    await frame();
    immune.Enemy = { ...immune.Enemy, tags: { ...immune.Enemy.tags, glueimmune: true } };
    expect(
        KinkyDungeonGetImmunity(immune.Enemy.tags, immune.Enemy.Resistance?.profile, "glue", "immune", 1),
        "Fixture immunity is missing",
    );
    const spell = KinkyDungeonSpellListEnemies.find((s) => s.name === "SpiderlingsMageRune");
    expect(KinkyDungeonCastSpell(8, 7, spell, mage).result === "Cast", "Rune cast failed");
    const rune = KDMapData.Bullets.find((b) => b.bullet.spell?.name === spell.name);
    expect(rune, "Rune missing");
    KDMapData.Entities = KDMapData.Entities.filter((e) => e !== mage);
    KDUpdateEnemyCache = true;
    const originalTime = CommonTime;
    globalThis.reviewProbe = { maid, shielded, immune, originalTime, time: CommonTime(), frame, expect };
    CommonTime = () => globalThis.reviewProbe.time ?? originalTime();
    const before = maid.specialBoundLevel?.Slime || 0;
    KDBulletHitEnemy(rune, maid, 0, true);
    KDBulletHitEnemy(rune, shielded, 0, true);
    KDBulletHitEnemy(rune, immune, 0, true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await frame();
    const hit = kdpixisprites.get(`SpiderlingsSpellVisuals_hit_${maid.id}:web`);
    const check = {
        casterGone: !KDMapData.Entities.some((e) => e.id === mage.id),
        before,
        after: maid.specialBoundLevel?.Slime || 0,
        visible: hit?.visible,
        alpha: hit?.alpha,
        shieldedSlime: shielded.specialBoundLevel?.Slime || 0,
        immuneSlime: immune.specialBoundLevel?.Slime || 0,
        shieldedFlash: !!kdpixisprites.get(`SpiderlingsSpellVisuals_hit_${shielded.id}:web`)?.visible,
        immuneFlash: !!kdpixisprites.get(`SpiderlingsSpellVisuals_hit_${immune.id}:web`)?.visible,
    };
    expect(
        check.after > before && check.visible && check.alpha === 1,
        "Actual Rune bind missing impact: " + JSON.stringify(check),
    );
    expect(check.shieldedSlime === 0 && !check.shieldedFlash, "Shielded NPC got false hit");
    expect(check.immuneSlime === 0 && !check.immuneFlash, "Immune NPC got false hit: " + JSON.stringify(check));
    globalThis.reviewProbe.time += 240;
    await frame();
    expect(!kdpixisprites.get(`SpiderlingsSpellVisuals_hit_${maid.id}:web`)?.visible, "Rune hit not fading");
    return check;
})();
