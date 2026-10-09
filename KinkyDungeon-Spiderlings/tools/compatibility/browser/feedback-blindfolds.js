/* global ModelLayers, KDToggleXRay: writable, KinkyDungeonGetBlindLevel, LayerGroups */
(async () => {
    const { setup, frame, expect, photo } = globalThis.normalAcceptance;
    const rows = [],
        images = {},
        nativeGroups = JSON.stringify(LayerGroups);
    const cases = [
        { native: true, id: "ClothBlindfold", pink: false, layered: false },
        ...[false, true].flatMap((pink) =>
            [1, 3].flatMap((level) =>
                (level === 3 ? [false, true] : [false]).map((layered) => ({
                    id: `SpiderlingsWebbingLv${level}Blindfold`,
                    level,
                    pink,
                    layered,
                })),
            ),
        ),
    ];
    try {
        for (const entry of cases) {
            KDToggleXRay = 0;
            setup(`blindfold-${entry.id}-${entry.pink}-${entry.layered}`);
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = entry.pink;
            Spiderlings.applyWebbingColor(true);
            if (entry.layered)
                KinkyDungeonAddRestraint(
                    KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Blindfold"),
                    0,
                    false,
                    "",
                );
            KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(entry.id), 0, false, "");
            const blindness = KinkyDungeonGetBlindLevel();
            for (const mode of [0, 1, 2, 0]) {
                KDToggleXRay = mode;
                KDRefreshCharacter.set(KinkyDungeonPlayer, true);
                KinkyDungeonDressPlayer(KinkyDungeonPlayer, false, true);
                expect(KDToggleXRay === mode, "Dressing changed the visual toggle state");
                const draws = [],
                    native = KDDraw;
                KDDraw = function (...args) {
                    const sprite = native.apply(this, args);
                    if (String(args[3]).includes(entry.native ? "Blindfold/Cloth.png" : "Blindfold.png"))
                        draws.push({
                            image: args[3],
                            z: args[9]?.zIndex,
                            visible: sprite?.visible,
                            masks: (args[9]?.filters || []).map(
                                (filter) => filter.maskSprite?.path || filter.maskSprite?.name || "",
                            ),
                        });
                    return sprite;
                };
                try {
                    await frame();
                    if (!entry.layered && [0, 2].includes(mode))
                        images[`${entry.id}-${entry.pink ? "pink" : "original"}-${mode}`] = await photo();
                } finally {
                    KDDraw = native;
                }
                const rendered = draws.findLast(
                    (draw) =>
                        draw.visible &&
                        (entry.native ||
                            draw.image.includes(
                                `SpiderlingsWebbingLv${entry.level}${entry.pink ? "Pink" : ""}/Blindfold.png`,
                            )),
                );
                expect(rendered, `${entry.id} was not rendered in X-ray mode ${mode}`);
                const mc = KDCurrentModels.get(KinkyDungeonPlayer);
                expect(
                    (mc.XRayFilters || []).includes("XrayFace") === (mode === 2),
                    "Native face X-ray detection differs from toggle mode",
                );
                expect(
                    rendered.masks.some((mask) => String(mask).includes("XrayFace")) === (mode === 2),
                    `${entry.id} did not consume the native face mask in mode ${mode}: ${JSON.stringify(rendered)}`,
                );
                expect(KinkyDungeonGetBlindLevel() === blindness, "Visual X-ray changed gameplay blindness");
                if (!entry.native) {
                    if (mode !== 2)
                        expect(
                            rendered.z > -ModelLayers.HairFront + 500 && rendered.z > -ModelLayers.Brows,
                            "Ordinary blindfold no longer covers foreground hair and brows",
                        );
                    expect(
                        [...mc.Models.values()].some((model) =>
                            Object.values(model.Layers).some((layer) => layer.Layer === "HairFront"),
                        ),
                        "Blindfold removed the foreground hairstyle",
                    );
                    if (entry.layered)
                        expect(
                            !draws.some((draw) => draw.visible && draw.image.includes("SpiderlingsWebbingLv1")),
                            "The covered inner blindfold reappeared during X-ray",
                        );
                }
                rows.push({ ...entry, mode, blindness, rendered });
            }
        }
        expect(JSON.stringify(LayerGroups) === nativeGroups, "Owned blindfolds modified native layer groups");
    } finally {
        KDToggleXRay = 0;
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
        Spiderlings.applyWebbingColor(true);
        KinkyDungeonDressPlayer();
    }
    return { rows, images };
})();
