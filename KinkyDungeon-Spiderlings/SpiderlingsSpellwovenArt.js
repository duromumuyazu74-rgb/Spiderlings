"use strict";

// Reuse the delivered Cocoon and moving silk-tail artwork on the native model
// canvas. No source pixels or ordinary Cocoon models are changed.
(() => {
    const api = globalThis.Spiderlings;
    const views = new Map();
    function dispose(view) {
        if (!view.overlay.destroyed) {
            view.overlay.parent?.removeChild(view.overlay);
            view.overlay.texture.destroy(true);
            view.overlay.destroy();
        }
        if (!view.layer.destroyed) view.layer.destroy({ children: true });
    }
    function clear() {
        for (const view of views.values()) dispose(view);
        views.clear();
    }
    function render(container) {
        const cocoon = api.SpellwovenCocoon.item();
        if (!cocoon) {
            clear();
            return;
        }
        if (!container?.Mesh || container.Mesh.destroyed) return;
        for (const [old, view] of views)
            if (old.Mesh.destroyed || old.Container.destroyed) {
                dispose(view);
                views.delete(old);
            }
        const pink = api.getSetting("spiderlingsPinkWebbing") === true ? "Pink" : "";
        const texture = KDTex(`Models/SpiderlingsWebbingCocoon${pink}/Cocoon.png`);
        const tailTexture = KDTex(`Models/SpiderlingsSpinnerLegbinder${pink}/Tail.png`);
        if (!texture?.baseTexture?.valid || !tailTexture?.baseTexture?.valid) return;
        const physical = cocoon.data?.Spellwoven || { layers: 1, wrap: 1 };
        const target = (0.18 + (0.82 * (api.SpellwovenCocoon.layers(cocoon) - 1)) / 19) * physical.wrap;
        let view = views.get(container);
        if (!view || view.overlay.destroyed) {
            if (view) dispose(view);
            const layer = new PIXI.Container();
            const overlay = new PIXI.Sprite(
                PIXI.RenderTexture.create({
                    width: container.RenderTexture.width,
                    height: container.RenderTexture.height,
                }),
            );
            overlay.name = "SpiderlingsSpellwovenFront";
            overlay.zIndex = 1e8;
            container.Mesh.sortableChildren = true;
            container.Mesh.addChild(overlay);
            const body = new PIXI.Sprite(texture),
                tail = new PIXI.Sprite(tailTexture),
                mask = new PIXI.Graphics(),
                stitches = new PIXI.Graphics();
            body.mask = mask;
            tail.pivot.set(688, 2770);
            layer.addChild(body, mask, stitches, tail);
            view = {
                layer,
                overlay,
                body,
                tail,
                mask,
                stitches,
                amount: target,
                from: target,
                target,
                start: CommonTime(),
            };
            views.set(container, view);
        }
        if (view.target !== target) {
            view.from = view.amount;
            view.target = target;
            view.start = CommonTime();
        }
        const blend = Math.min(1, (CommonTime() - view.start) / 500);
        view.amount = view.from + (view.target - view.from) * blend;
        const scale = container.Zoom * MODEL_SCALE;
        const swelling = 1 + (0.14 * (api.SpellwovenCocoon.layers(cocoon) - 1)) / 19;
        const cx = 1201.5,
            bottom = 3282,
            top = bottom - 2662 * view.amount;
        view.layer.position.copyFrom(container.Container.position);
        view.layer.pivot.copyFrom(container.Container.pivot);
        view.layer.scale.copyFrom(container.Container.scale);
        view.layer.rotation = container.Container.rotation;
        view.body.texture = texture;
        view.body.pivot.set(cx, 0);
        view.body.position.set(cx * scale, 0);
        view.body.scale.set(scale * swelling, scale);
        view.mask
            .clear()
            .beginFill(0xffffff, 1)
            .drawRect(0, top * scale, 2480 * scale, (3508 - top) * scale)
            .endFill();
        view.stitches.clear().lineStyle(2 * scale, pink ? 0xf5b5de : 0xf4efff, 0.8);
        for (let layer = 1; layer <= physical.layers; layer++) {
            const y = bottom - 2662 * (0.18 + (0.82 * (layer - 1)) / 19) * physical.wrap;
            if (y < top) continue;
            const width = 290 * swelling;
            view.stitches
                .moveTo((cx - width) * scale, (y + 14) * scale)
                .quadraticCurveTo(cx * scale, (y + 45) * scale, (cx + width) * scale, y * scale);
        }
        const angle = blend * Math.PI * 4;
        view.tail.texture = tailTexture;
        view.tail.visible = blend < 1;
        view.tail.scale.set(Math.cos(angle) * scale * 0.65, scale * 0.65);
        view.tail.position.set((cx + Math.sin(angle) * 280 * swelling) * scale, top * scale);
        PIXIapp.renderer.render(view.layer, { clear: true, renderTexture: view.overlay.texture });
    }
    if (typeof RenderModelContainer === "function")
        RenderModelContainer = api.Hooks.wrap(
            "SpellwovenArt.render",
            RenderModelContainer,
            (native) =>
                function (models, character, id) {
                    if (character === KinkyDungeonPlayer) render(models.Containers.get(id));
                    return native.apply(this, arguments);
                },
        );
    for (const event of ["afterLoadGame", "afterNewGame"]) KDAddEvent(KDEventMapGeneric, event, "SpellwovenArt", clear);
})();
