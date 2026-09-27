(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
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
    mage.stun = 999;
    const nativeTime = CommonTime;
    let clock = nativeTime();
    CommonTime = () => clock;
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rows = [];
    try {
        for (const spellName of [null, "SpiderlingsMageRune", "SpiderlingsMageBolt"]) {
            if (spellName) {
                const spell = KinkyDungeonSpellListEnemies.find((s) => s.name === spellName);
                expect(KinkyDungeonCastSpell(10, 10, spell, mage).result === "Cast", "Mage cast failed");
            }
            for (const flip of [false, true, false, true, false]) {
                mage.flip = flip;
                await frame();
                await new Promise((resolve) => setTimeout(resolve, 60));
                await frame();
                const base = kdpixisprites.get(`spr_${mage.id}`);
                expect(base?.visible, "Mage body is not visible");
                const layers = Array.from(kdpixisprites.entries())
                    .filter(([id, sprite]) => id.startsWith(`spr_${mage.id}_mage_cast_`) && sprite.visible)
                    .map(([, sprite]) => sprite);
                expect(layers.length === (spellName ? 3 : 1), "Regular pattern is missing during casting");
                const aligned = layers.every(
                    (layer) =>
                        layer.position.x === base.position.x &&
                        layer.position.y === base.position.y &&
                        Math.sign(layer.scale.x) === Math.sign(base.scale.x) &&
                        Math.abs(layer.width - base.width) < 0.01 &&
                        Math.abs(layer.height - base.height) < 0.01,
                );
                expect(aligned, `Detached abdomen pattern: ${spellName || "idle"}, flip=${flip}`);
                expect(layers[0].alpha === 1, "Abdomen pattern faded during casting");
                rows.push({ spell: spellName || "idle", flip, aligned, layers: layers.length });
            }
            clock += 300;
            await frame();
        }
        return rows;
    } finally {
        CommonTime = nativeTime;
    }
})();
