(async () => {
    KinkyDungeonStartNewGame(false);
    KDMapData.Entities = [];
    KDMapData.Bullets = [];
    KDUpdateEnemyCache = true;
    for (const key of Object.keys(KDMapData)) if (key.startsWith("Spiderlings")) delete KDMapData[key];
    for (let y = 2; y < 16; y++)
        for (let x = 3; x < 20; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMovePlayer(12, 10, false);
    const caster = DialogueCreateEnemy(10, 8, "WebCaster");
    caster.stun = 100;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const pause = () => new Promise((resolve) => setTimeout(resolve, 500));
    KinkyDungeonAdvanceTime(1);
    const result = [];
    for (const pink of [false, true]) {
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        KDMapData.Bullets = [];
        KinkyDungeonBulletsVisual.clear();
        const shots = [];
        for (const [dx, dy] of [
            [1, 0],
            [0, 1],
            [-1, 0],
            [0, -1],
        ]) {
            const spell = KinkyDungeonSpellListEnemies.find((s) => s.name === "WebSpray");
            if (KinkyDungeonCastSpell(10 + dx * 4, 8 + dy * 4, spell, caster).result !== "Cast")
                throw new Error("WebSpray cast failed.");
            shots.push(KDMapData.Bullets.findLast((b) => b.bullet.name === "WebSpray"));
        }
        await pause();
        const flight = shots.map((b) => {
            const s = kdpixisprites.get(b.spriteID);
            if (
                !s?.visible ||
                !s.texture?.baseTexture?.valid ||
                Math.abs(s.rotation - Math.atan2(b.vy, b.vx)) > 0.0001 ||
                s.alpha !== 1
            )
                throw new Error("Flight direction or opacity mismatch.");
            return { rotation: s.rotation, vx: b.vx, vy: b.vy, alpha: s.alpha };
        });
        for (let i = 0; i < 12; i++) {
            KinkyDungeonUpdateBullets(0.25, false);
            await frame();
        }
        await pause();
        const settled = KDMapData.Bullets.filter((b) => b.bullet.name === "WebSprayTrail");
        const expected = KDModFiles[KinkyDungeonRootDirectory + `Bullets/SpiderWebHit${pink ? "Pink" : ""}.png`];
        const visible = settled.filter((b) => kdpixisprites.get(b.spriteID)?.visible);
        if (!visible.length) throw new Error("No settled web visible.");
        for (const b of visible) {
            const s = kdpixisprites.get(b.spriteID);
            if (s.texture?.baseTexture?.resource?.url !== expected || s.alpha !== 1 || s.rotation !== 0)
                throw new Error("Ground web shape or opacity mismatch.");
        }
        for (let i = 0; i < 18; i++) {
            KinkyDungeonAdvanceTime(1);
            await frame();
        }
        const deadline = performance.now() + 12000;
        while (settled.some((b) => kdpixisprites.get(b.spriteID)?.visible) && performance.now() < deadline)
            await frame();
        if (settled.some((b) => kdpixisprites.get(b.spriteID)?.visible || KDMapData.Bullets.includes(b)))
            throw new Error("Expired web persists.");
        result.push({ pink, flight, visibleWebs: visible.length, expired: true });
    }
    return result;
})();
