(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const rows = (globalThis.normalTrace = []),
        images = {};
    let mage;
    const setup = () => {
        KinkyDungeonStartNewGame(false);
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        delete KDMapData.SpiderlingsMageSpells;
        KDUpdateEnemyCache = true;
        KDToggles.Sound = false;
        for (let y = 3; y < 16; y++)
            for (let x = 3; x < 19; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(10, 10, false);
        mage = DialogueCreateEnemy(8, 8, "MageSpiderlings");
        mage.stun = 999;
    };
    const check = async (label, lit, kind = "attack") => {
        await frame();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await frame();
        const base = kdpixisprites.get(`spr_${mage.id}`);
        expect(base?.visible, `Mage body is hidden: ${label}`);
        const layers = [...kdpixisprites.entries()]
            .filter(([id, sprite]) => id.startsWith(`spr_${mage.id}_mage_cast_`) && sprite.visible)
            .map(([, sprite]) => sprite);
        expect(layers.length === (lit ? 3 : 1), `Wrong body glow: ${label}, layers=${layers.length}`);
        expect(
            layers[0].texture.baseTexture.resource.url ===
                KDModFiles[KinkyDungeonRootDirectory + "Enemies/MageSpiderlingsRegular.png"],
            `Missing regular body rune: ${label}`,
        );
        expect(layers[0].blendMode === PIXI.BLEND_MODES.NORMAL, `Regular rune glows: ${label}`);
        const aligned = layers.every(
            (layer) =>
                layer.position.x === base.position.x &&
                layer.position.y === base.position.y &&
                Math.sign(layer.scale.x) === Math.sign(base.scale.x) &&
                Math.abs(layer.width - base.width) < 0.01 &&
                Math.abs(layer.height - base.height) < 0.01,
        );
        expect(aligned, `Detached body rune: ${label}`);
        expect(
            layers.every((layer) => layer.alpha === 1),
            `Body glow faded: ${label}`,
        );
        expect(
            layers.every((layer) => layer.zIndex > base.zIndex),
            `Rune is behind the body: ${label}`,
        );
        if (lit) {
            const path = `Enemies/MageSpiderlings${kind === "rune" ? "SubtleGlow" : "ReallyGlowy"}.png`;
            expect(
                layers[2].texture.baseTexture.resource.url === KDModFiles[KinkyDungeonRootDirectory + path],
                `Wrong glow texture: ${label}`,
            );
            expect(layers[2].blendMode === PIXI.BLEND_MODES.ADD, `Body glow is not additive: ${label}`);
        }
        rows.push({
            label,
            lit,
            aligned,
            layers: layers.length,
            tick: KinkyDungeonCurrentTick,
            spellClock: KDMapData.SpiderlingsMageSpells?.clock,
        });
    };
    const turn = async () => {
        KinkyDungeonLastAction = "Wait";
        KinkyDungeonAdvanceTime(1, true);
        await frame();
    };
    const cast = (name, x = 10) =>
        expect(
            KinkyDungeonCastSpell(x, 10, KinkyDungeonFindSpell(name, true), mage).result === "Cast",
            `Mage cast failed: ${name}`,
        );
    const reload = () => {
        const id = mage.id,
            saved = KinkyDungeonSaveGame(true);
        const data = typeof saved === "string" ? saved : LZString.compressToBase64(JSON.stringify(saved));
        expect(KinkyDungeonLoadGame(data, true), "Native save reload failed");
        mage = KDMapData.Entities.find((enemy) => enemy.id === id);
        expect(mage, "Reload lost the Mage");
    };
    setup();
    await check("idle", false);
    images.idle = document.querySelector("canvas").toDataURL("image/png");
    cast("SpiderlingsMageBolt");
    await turn();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    for (const flip of [false, true, false, true, false]) {
        mage.flip = flip;
        await check(`bolt-facing-${flip}`, true);
    }
    images["bolt-glow"] = document.querySelector("canvas").toDataURL("image/png");
    const record = JSON.stringify(mage.SpiderlingsMageCastGlow);
    KinkyDungeonAdvanceTime(0, true);
    await check("bolt-zero-time", true);
    expect(JSON.stringify(mage.SpiderlingsMageCastGlow) === record, "Zero time changed body glow");
    reload();
    await check("bolt-reloaded", true);
    expect(JSON.stringify(mage.SpiderlingsMageCastGlow) === record, "Reload consumed body glow");
    await turn();
    await check("bolt-next-turn", false);

    for (const [name, collection, deadline] of [
        ["SpiderlingsMageHex", "fields", "activateAt"],
        ["SpiderlingsMageCollapse", "collapses", "explodeAt"],
    ]) {
        setup();
        // Keep the visual observer outside the delayed binding area so native
        // blindness on resolution cannot hide the Mage being inspected.
        cast(name, 14);
        await turn();
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await check(`${name}-after-real-time`, true);
        images[name + "-charging"] = document.querySelector("canvas").toDataURL("image/png");
        reload();
        await check(`${name}-reloaded`, true);
        for (let count = 0; count < 7; count++) {
            const state = KDMapData.SpiderlingsMageSpells;
            const pending = state[collection].some(
                (effect) => effect.ownerId === mage.id && effect[deadline] > state.clock,
            );
            await check(`${name}-pending-${count}`, pending);
            if (!pending) break;
            await turn();
            if (count === 6) throw Error("Delayed Mage spell never resolved");
        }
        await check(`${name}-resolved`, false);
    }
    setup();
    cast("SpiderlingsMageRune");
    const rune = KDMapData.Bullets.find((bullet) => bullet.bullet.spell?.name === "SpiderlingsMageRune");
    expect(rune, "Rune placement missing");
    await turn();
    await check("rune-placing", true, "rune");
    await turn();
    await check("rune-armed", false);
    expect(rune.SpiderlingsRunePhase === "armed", "Rune did not arm");
    KDMovePlayer(rune.x, rune.y, false);
    await turn();
    expect(rune.SpiderlingsRunePhase === "triggered", "Rune did not trigger");
    while (rune.time > 0) {
        await check(`rune-warning-${rune.SpiderlingsRuneTurns}`, true, "rune");
        await turn();
    }
    await check("rune-resolved", false);
    return { rows, images };
})();
