(async () => {
    const expect = (value, message) => {
        if (!value) throw new Error(message);
    };
    const capture = Spiderlings.SpinnerCapture,
        art = Spiderlings.SpinnerArt;
    expect(capture.phase() === "contest", "Run after the native inside-field capture scenario.");
    await art.ready;
    const inventory = KinkyDungeonShowInventory;
    const clockDescriptor = Object.getOwnPropertyDescriptor(performance, "now");
    let clock = performance.now();
    const nativeRender = art.render,
        renderer = PIXIapp.renderer,
        nativeLayerRender = renderer.render;
    const layers = new Map(),
        draws = [];
    const images = {},
        rows = [];
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    KinkyDungeonShowInventory = true; // Pause the real automatic driver while paying explicit native world turns.
    Object.defineProperty(performance, "now", { configurable: true, value: () => clock });
    art.render = function (c, options) {
        draws.push({ ...options });
        return nativeRender(c, options);
    };
    renderer.render = function (layer) {
        if (["SpiderlingsSpinnerBack", "SpiderlingsSpinnerFront"].includes(layer.name)) layers.set(layer.name, layer);
        return nativeLayerRender.apply(this, arguments);
    };
    const draw = () => {
        DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
        const mc = KDCurrentModels.get(KinkyDungeonPlayer);
        for (const [id] of mc.Containers) RenderModelContainer(mc, KinkyDungeonPlayer, id);
        return [...mc.Containers.values()].find((c) =>
            c.Mesh?.children.some((s) => s.name === "SpiderlingsSpinnerFront"),
        );
    };
    const parts = () => [...layers.values()].flatMap((layer) => layer.children);
    try {
        for (let n = 0; n < 20 && capture.phase() === "contest"; n++) KinkyDungeonAdvanceTime(1);
        expect(capture.phase() === "wrap" && !capture.item(), "Contest must not deposit an early bag.");
        for (let n = 1; n <= 4; n++) {
            KinkyDungeonAdvanceTime(1);
            expect(capture.item()?.data.wrapProgress === n / 5, `Incorrect deposit on turn ${n}`);
            clock += 650;
            await frame();
            draw();
        }
        expect(draws.at(-1).amount === 0.8, "Four paid operations must render 80 percent.");
        KinkyDungeonAdvanceTime(1);
        expect(
            capture.item()?.data.wrapProgress === 1 && !capture.state() && !capture.isControllingPlayer(),
            "Fifth paid operation must commit equipment and release control.",
        );
        await frame();
        draw();
        expect(draws.at(-1).amount === 0.8 && draws.at(-1).active, "Final tween jumped to completion.");
        rows.push({ elapsed: 0, ...draws.at(-1) });
        clock += 250;
        draw();
        expect(Math.abs(draws.at(-1).amount - 0.9) < 1e-6, "Final tween midpoint is missing.");
        rows.push({ elapsed: 250, ...draws.at(-1) });
        clock += 250;
        let container = draw();
        expect(draws.at(-1).amount === 1 && !draws.at(-1).active, "Final tween did not finish.");
        rows.push({ elapsed: 500, ...draws.at(-1) });
        expect(parts().find((p) => p.name === "SpinnerTail")?.visible === false, "Completed tail remains visible.");
        expect(container, "Native character overlay is missing.");
        const stageTexture = parts().find((p) => p.name === "SpinnerStageLower").texture;
        expect(stageTexture.baseTexture.width === 2048, "Native package did not use the compact Spinner sheet.");
        expect(
            stageTexture.orig.width === 2480 && stageTexture.orig.height === 3508,
            "Sheet lost the artist canvas dimensions.",
        );
        expect(stageTexture.trim.x === 906 && stageTexture.trim.y === 1922, "Final stage placement changed.");
        for (const pink of [false, true]) {
            for (let stage = 1; stage <= 7; stage++) {
                art.render(container, {
                    amount: stage / 7,
                    active: false,
                    contest: false,
                    pink,
                    scale: container.Zoom * MODEL_SCALE,
                });
                const body = parts().find((p) => p.name === "SpinnerStageLower");
                expect(body.tint === 0xffffff && body.alpha === 1, "Authored colors were retinted or faded.");
                expect(
                    body.texture.textureCacheIds.some((id) =>
                        id.endsWith(`SpiderlingsSpinnerLegbinder${pink ? "Pink" : ""}/Stage${stage}.png`),
                    ),
                    "Wrong stage or color texture.",
                );
                images[`${pink ? "pink" : "normal"}-stage${stage}`] = renderer.extract
                    .canvas(container.Mesh)
                    .toDataURL("image/png");
            }
        }
        expect(capture.item().data.wrapProgress === 1, "Artwork preview changed saved equipment.");
        const save = KinkyDungeonSaveGame(true);
        expect(
            KinkyDungeonLoadGame(
                typeof save === "string" ? save : LZString.compressToBase64(JSON.stringify(save)),
                true,
            ),
            "Native completed-bag reload failed.",
        );
        await frame();
        container = draw();
        expect(
            capture.item()?.data.wrapProgress === 1 && draws.at(-1).amount === 1 && !draws.at(-1).active,
            "Reload replayed completion or lost the bag.",
        );
        return { paidTurns: 5, finalTween: rows, stagePreviews: 14, saveReload: true, images };
    } finally {
        art.render = nativeRender;
        renderer.render = nativeLayerRender;
        KinkyDungeonShowInventory = inventory;
        if (clockDescriptor) Object.defineProperty(performance, "now", clockDescriptor);
        else delete performance.now;
    }
})();
