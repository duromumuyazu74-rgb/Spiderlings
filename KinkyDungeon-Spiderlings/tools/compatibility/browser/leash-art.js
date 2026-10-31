/* global KDGeneratePoseArray */
(async () => {
    const { setup, renderFrame, expect, save, restore } = globalThis.normalAcceptance;
    setup("silk-leash-art");
    const images = {},
        rows = [];
    const modelName = "SpiderlingsSilkLeashModel";
    const marker = Spiderlings.ModelRuntime.SILK_ART_MARKER;
    const nativeModel = JSON.stringify(ModelDefs.Leash);
    const nativeCarrier = JSON.stringify(KinkyDungeonGetRestraintByName("BasicLeash"));
    const equip = (name) => KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(name), 0, false, "");
    equip("BasicCollar");
    equip("SpiderlingsSilkLeash");
    expect(
        KinkyDungeonGetRestraintItem("ItemNeckRestraints")?.name === "SpiderlingsSilkLeash",
        "Owned silk leash was not equipped",
    );
    expect(
        KinkyDungeonGetRestraintByName("SpiderlingsSilkLeash").Model === modelName,
        "Recovery still uses the placeholder model",
    );
    await Spiderlings.loadSpiderlingsTextureAtlases();
    const cases = [
        ["bound", "Wristtie", "Closed", ["HandsBound"], "Leash"],
        ["free", "Free", "Closed", [], "LeashFree"],
        ["crossed", "Crossed", "Closed", [], "LeashCrossed"],
        ["front", "Front", "Closed", [], "LeashFront"],
        ["pulled", "Free", "Closed", ["Pulled"], "LeashPulled"],
        ["kneel", "Wristtie", "Kneel", [], "LeashKneel"],
        ["kneel-pulled", "Wristtie", "KneelClosed", ["Pulled"], "LeashKneelPulled"],
        ["hogtie", "Wristtie", "Hogtie", [], "LeashHogtie"],
        ["hogtie-pulled", "Wristtie", "Hogtie", ["Pulled"], "LeashHogtiePulled"],
    ];
    const view = "silk-leash-acceptance";
    const draw = () => {
        let mesh;
        for (let pass = 0; pass < 4; pass++) {
            mesh = DrawCharacter(
                KinkyDungeonPlayer,
                0,
                0,
                1,
                true,
                null,
                PIXI.SCALE_MODES.LINEAR,
                [],
                0,
                false,
                [],
                view,
            );
            // A changed native pose schedules a new mesh for the next draw.
            // Rendering the old container immediately produces a mixed-pose image.
            if (!KDCurrentModels.get(KinkyDungeonPlayer).Refresh.has(view)) break;
        }
        const mc = KDCurrentModels.get(KinkyDungeonPlayer);
        expect(!mc.Refresh.has(view), "Native pose mesh is still awaiting its rebuild");
        RenderModelContainer(mc, KinkyDungeonPlayer, view);
        return mesh;
    };
    const nativeDraw = KDDraw;
    let drawn = [];
    KDDraw = function (...args) {
        const sprite = nativeDraw.apply(this, args);
        if (String(args[3]).includes("Models/SpiderlingsSilkLeash"))
            drawn.push({ path: args[3], visible: sprite?.visible, alpha: sprite?.alpha, tint: sprite?.tint });
        return sprite;
    };
    try {
        for (const pink of [false, true]) {
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            await Spiderlings.applyWebbingColor(true);
            await Spiderlings.preloadSpiderlingsTextures(modelName, true);
            KinkyDungeonDressPlayer(KinkyDungeonPlayer, false, true);
            draw();
            await renderFrame();
            for (const [name, arms, legs, extras, sprite] of cases) {
                const mc = KDCurrentModels.get(KinkyDungeonPlayer);
                mc.Poses = KDGeneratePoseArray(arms, legs);
                for (const pose of extras) mc.Poses[pose] = true;
                const expected = `Models/SpiderlingsSilkLeash${pink ? "Pink" : ""}/${sprite}.png`;
                expect(
                    ModelLayerString(ModelDefs[modelName], ModelDefs[modelName].Layers.Leash, mc.Poses) === expected,
                    `Wrong native pose resolution: ${name}`,
                );
                expect(KDModFiles[expected], `Missing packaged pose: ${expected}`);
                ForceRefreshModels(KinkyDungeonPlayer);
                drawn = [];
                const mesh = draw();
                const actual = drawn.find((entry) => entry.path === expected && entry.visible);
                expect(actual, `Native character did not draw ${expected}: ${JSON.stringify(drawn)}`);
                const texture = KDTex(expected);
                expect(
                    texture?.baseTexture?.valid && texture.baseTexture.width === 4096,
                    "Leash atlas was not decoded",
                );
                expect(texture.orig.width === 2480 && texture.orig.height === 3508, "Leash canvas origin was lost");
                images[`${pink ? "pink" : "white"}-${name}`] = PIXIapp.renderer.extract
                    .canvas(mesh)
                    .toDataURL("image/png");
                rows.push({ pink, name, path: actual.path, alpha: actual.alpha, tint: actual.tint });
            }
        }
    } finally {
        KDDraw = nativeDraw;
    }

    const silk = KinkyDungeonGetRestraintItem("ItemNeckRestraints");
    KinkyDungeonRemoveRestraintSpecific(silk, false, false, false);
    equip("BasicLeash");
    const carrier = KinkyDungeonGetRestraintItem("ItemNeckRestraints");
    const collar = KinkyDungeonGetRestraintItem("ItemNeck");
    expect(carrier?.name === "BasicLeash" && !carrier.data?.[marker], "Native carrier fixture differs");
    carrier.cutProgress = 0.23;
    Spiderlings.markSilkLeashArtwork(carrier);
    Spiderlings.markSilkLeashArtwork(collar);
    const identity = carrier.id;
    restore(save());
    const restored = KinkyDungeonGetRestraintItem("ItemNeckRestraints");
    expect(
        restored?.name === "BasicLeash" &&
            restored.id === identity &&
            restored.cutProgress === 0.23 &&
            restored.data?.[marker],
        "Cosmetic carrier lost native identity or progress on reload",
    );
    for (const pink of [false, true]) {
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        await Spiderlings.applyWebbingColor(true);
        await renderFrame();
        KinkyDungeonDressPlayer(KinkyDungeonPlayer, false, true);
        const mesh = draw();
        const names = KinkyDungeonPlayer.Appearance.map((entry) => entry.Model?.Name);
        expect(
            names.includes(modelName) && names.includes("SpiderlingsSilkCollarModel"),
            "Native carriers did not restore their authored models",
        );
        images[`${pink ? "pink" : "white"}-prison-carriers`] = PIXIapp.renderer.extract
            .canvas(mesh)
            .toDataURL("image/png");
    }
    expect(JSON.stringify(ModelDefs.Leash) === nativeModel, "The shared native leash model was changed");
    expect(
        JSON.stringify(KinkyDungeonGetRestraintByName("BasicLeash")) === nativeCarrier,
        "The shared native leash mechanics were changed",
    );
    return { poses: rows, nativeCarrierReload: true, images };
})();
