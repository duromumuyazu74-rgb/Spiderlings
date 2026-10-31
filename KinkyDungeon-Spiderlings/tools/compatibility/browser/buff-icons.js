(async () => {
    const { setup, spawn, renderFrame, expect, photo, turn, save, restore } = globalThis.normalAcceptance;
    const images = {},
        rows = [];
    const slow = "SpiderlingsWebSpraySlow",
        density = "SpiderlingsSilkDensity";
    const hud = async () => {
        let stats;
        const native = KDDrawBuffIcons;
        KDDrawBuffIcons = function (...args) {
            stats = args[2];
            return native.apply(this, args);
        };
        try {
            for (let pass = 0; pass < 30; pass++) {
                KDProcessBuffIcons(500, 100, false);
                await renderFrame();
                const owned = [stats[slow], stats[density]].filter(Boolean);
                if (
                    owned.every((entry) => {
                        const texture = KDTex(KinkyDungeonRootDirectory + "Buffs/" + entry.icon + ".png");
                        return texture?.baseTexture.valid && texture.orig.width === 46 && texture.orig.height === 46;
                    })
                )
                    return stats;
            }
            throw Error("Prepared status icons did not decode through the native HUD");
        } finally {
            KDDrawBuffIcons = native;
        }
    };

    setup("prepared-web-slow-icons");
    KDMovePlayer(10, 10, false);
    const caster = spawn("WebCaster", 9, 10, "Enemy");
    const spell = KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    for (const stage of [1, 2, 3, 4, 5]) {
        KDPlayerEffects.SpiderlingsWebSprayHit(KDPlayer(), "inert", spell.playerEffect, spell, "Enemy", null, caster);
        const entry = (await hud())[slow];
        expect(entry?.icon === "buff/buffSpiderlingsWebSpraySlow" + stage, "Web slow selected the wrong icon");
        expect(entry.count === String(stage), "Web slow lost its native layer count");
        expect(KinkyDungeonPlayerBuffs[slow].power === stage, "Icon selection changed SlowLevel");
        rows.push({ state: slow, stage, icon: entry.icon, count: entry.count });
        if (stage === 1 || stage === 5) images["web-slow-" + stage] = await photo();
    }
    KDRemoveEntity(caster, false, false, true);
    for (let index = 0; index < 8; index++) await turn();
    expect(!(await hud())[slow], "Expired web slow retained its status icon");

    setup("prepared-density-icons");
    for (const [value, stage] of [
        [1, 1],
        [99.9, 1],
        [100, 2],
        [299.9, 2],
        [300, 3],
        [699.9, 3],
        [700, 4],
        [1499.9, 4],
        [1500, 5],
        [5000, 5],
    ]) {
        Spiderlings.SilkDensity.state().value = value;
        Spiderlings.SilkDensity.advance(1);
        Spiderlings.SilkDensity.state().bareTurns = 0;
        const entry = (await hud())[density];
        expect(entry?.icon === "buff/buffSpiderlingsSilkDensity" + stage, "Density selected the wrong tier icon");
        expect(entry.count === String(Math.floor(value)), "Density lost its uncapped number");
        expect(Spiderlings.SilkDensity.state().value === value, "Drawing status icons changed saved density");
        rows.push({ state: density, value, stage, icon: entry.icon, count: entry.count });
        if (value === 1 || value === 1500) images["silk-density-" + stage] = await photo();
    }
    restore(save());
    expect((await hud())[density]?.icon === "buff/buffSpiderlingsSilkDensity5", "Reload lost the density tier");
    KDModSettings.Spiderlings.spiderlingsPinkWebbing = true;
    await Spiderlings.applyWebbingColor(true);
    expect(
        (await hud())[density]?.icon === "buff/buffSpiderlingsSilkDensity5",
        "Pink setting changed the single-palette icon",
    );
    Spiderlings.SilkDensity.state().value = 0;
    Spiderlings.SilkDensity.advance(1);
    expect(!(await hud())[density], "Zero density retained its status icon");
    return { rows, clearedSlow: true, restoredDensity: true, images };
})();
