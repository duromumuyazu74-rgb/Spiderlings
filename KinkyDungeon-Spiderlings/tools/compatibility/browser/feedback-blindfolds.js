/* global ModelLayers */
(async () => {
    const { setup, frame, expect, photo } = globalThis.normalAcceptance;
    const rows = [],
        images = {};
    for (const pink of [false, true])
        for (const level of [1, 3]) {
            setup(`blindfold-${level}-${pink}`);
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            Spiderlings.applyWebbingColor(true);
            KinkyDungeonAddRestraint(
                KinkyDungeonGetRestraintByName(`SpiderlingsWebbingLv${level}Blindfold`),
                0,
                false,
                "",
            );
            KinkyDungeonDressPlayer();
            UpdateModels(KinkyDungeonPlayer);
            const draws = [],
                native = KDDraw;
            KDDraw = function (...args) {
                const sprite = native.apply(this, args);
                if (String(args[3]).includes("SpiderlingsWebbing") && String(args[3]).includes("Blindfold"))
                    draws.push({ image: args[3], z: args[9]?.zIndex, visible: sprite?.visible });
                return sprite;
            };
            try {
                await frame();
                images[`${pink ? "pink" : "original"}-${level}`] = await photo();
            } finally {
                KDDraw = native;
            }
            const rendered = draws.find((entry) => entry.visible);
            expect(rendered, `Lv${level} blindfold was not rendered`);
            expect(
                rendered.z > -ModelLayers.HairFront + 500 && rendered.z > -ModelLayers.Brows,
                "Native blindfold is still behind foreground hair or brows",
            );
            const mc = KDCurrentModels.get(KinkyDungeonPlayer);
            expect(
                [...mc.Models.values()].some((model) =>
                    Object.values(model.Layers).some((layer) => layer.Layer === "HairFront"),
                ),
                "Blindfold removed the foreground hairstyle",
            );
            rows.push({ pink, level, rendered });
        }
    KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    return { rows, images };
})();
