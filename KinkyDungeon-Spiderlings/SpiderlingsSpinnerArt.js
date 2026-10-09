"use strict";

// Full-canvas artist stages; separate lossless sheets retain their original placement.
(() => {
    const api = globalThis.Spiderlings;
    const PARTS = Object.freeze(["Stage1", "Stage2", "Stage3", "Stage4", "Stage5", "Stage6", "Stage7", "Tail"]);
    const textures = new Map(),
        views = new Map();
    const pathFor = (name, pink) => `Models/SpiderlingsSpinnerLegbinder${pink ? "Pink" : ""}/${name}.png`;
    // Left/right points along each authored upper edge, on the 2480 x 3508 canvas.
    const EDGES = [
        [1100, 2928, 1310, 2928],
        [1086, 2818, 1312, 2780],
        [1078, 2733, 1328, 2690],
        [1053, 2600, 1375, 2570],
        [1010, 2400, 1360, 2350],
        [1004, 2351, 1361, 2226],
        [942, 2047, 1390, 2160],
        [913, 1935, 1458, 1928],
    ];
    function createView(c) {
        const make = (z) => {
            const layer = new PIXI.Container();
            const texture = PIXI.RenderTexture.create({ width: c.RenderTexture.width, height: c.RenderTexture.height });
            const overlay = new PIXI.Sprite(texture);
            layer.name = overlay.name = z < 0 ? "SpiderlingsSpinnerBack" : "SpiderlingsSpinnerFront";
            overlay.zIndex = z;
            c.Mesh.sortableChildren = true;
            c.Mesh.addChild(overlay);
            return { layer, overlay };
        };
        const back = make(-1e8),
            front = make(1e8);
        const lower = new PIXI.Sprite(textures.get(pathFor("Stage1", false)));
        const upper = new PIXI.Sprite(lower.texture);
        const tail = new PIXI.Sprite(textures.get(pathFor("Tail", false)));
        lower.name = "SpinnerStageLower";
        upper.name = "SpinnerStageUpper";
        tail.name = "SpinnerTail";
        // The separate source piece attaches at its right edge.
        tail.pivot.set(688, 2770);
        front.layer.addChild(lower, upper, tail);
        return { back, front, lower, upper, tail };
    }
    function dispose(v) {
        for (const { layer, overlay } of [v.back, v.front]) {
            if (!overlay.destroyed) {
                overlay.parent?.removeChild(overlay);
                overlay.texture.destroy(true);
                overlay.destroy();
            }
            if (!layer.destroyed) layer.destroy({ children: true }); // Shared artwork survives native redress.
        }
    }
    function clear() {
        for (const v of views.values()) dispose(v);
        views.clear();
    }
    function render(c, { amount, active, contest, pink, scale }) {
        if (textures.size !== 16 || !c?.Mesh || c.Mesh.destroyed) return;
        for (const [old, view] of views) {
            if (old.Mesh.destroyed || old.Container.destroyed) {
                dispose(view);
                views.delete(old);
            }
        }
        let v = views.get(c);
        if (v && (v.front.overlay.destroyed || v.back.overlay.destroyed)) {
            dispose(v);
            views.delete(c);
            v = undefined;
        }
        if (!v) {
            v = createView(c);
            views.set(c, v);
        }
        for (const { layer } of [v.back, v.front]) {
            layer.position.copyFrom(c.Container.position);
            layer.pivot.copyFrom(c.Container.pivot);
            layer.scale.copyFrom(c.Container.scale);
            layer.rotation = c.Container.rotation;
        }
        amount = Math.max(0, Math.min(1, amount));
        const position = amount * 7;
        const lower = Math.floor(position),
            upper = Math.min(7, lower + 1),
            blend = position - lower;
        for (const [sprite, stage, alpha] of [
            [v.lower, lower, lower > 0 ? 1 : 0],
            [v.upper, upper, blend],
        ]) {
            sprite.texture = textures.get(pathFor(`Stage${Math.max(1, stage)}`, pink));
            sprite.scale.set(scale, scale);
            sprite.alpha = alpha;
            sprite.visible = alpha > 0;
            sprite.tint = 0xffffff;
        }
        // Only adjacent full stages are shown. An opaque deposited layer avoids a translucent flash.
        const edge = EDGES[lower].map((n, i) => n + (EDGES[upper][i] - n) * blend);
        const angle = position * Math.PI * 2,
            side = Math.sin(angle),
            across = (side + 1) / 2;
        const tuck = Math.min(1, (1 - amount) * 7);
        v.tail.texture = textures.get(pathFor("Tail", pink));
        v.tail.visible = active && !contest && amount > 0 && amount < 1;
        v.tail.alpha = Math.min(1, position) * tuck;
        v.tail.scale.set(-side * scale * tuck, scale);
        v.tail.position.set(
            (edge[0] + (edge[2] - edge[0]) * across) * scale,
            (edge[1] + (edge[3] - edge[1]) * across + 35) * scale,
        );
        v.tail.rotation = -0.12 * Math.cos(angle);
        (Math.cos(angle) >= 0 ? v.front.layer : v.back.layer).addChild(v.tail);
        for (const { layer, overlay } of [v.back, v.front])
            PIXIapp.renderer.render(layer, { clear: true, renderTexture: overlay.texture });
    }
    const loadPNG = (path) =>
        PIXI.Assets.load({
            src: path,
            format: "png",
            loadParser: "modTextureLoader",
            data: { scaleMode: PIXI.SCALE_MODES.LINEAR },
        });
    function validateTexture(path, texture) {
        if (texture?.orig?.width !== 2480 || texture?.orig?.height !== 3508)
            throw new Error(`${path}: expected 2480x3508, received ${texture?.orig?.width}x${texture?.orig?.height}`);
        return texture;
    }
    async function prepareColor(pink) {
        const atlas = `TextureAtlas/spiderlings-spinner${pink ? "-pink" : ""}-0`;
        let sheet;
        try {
            if (typeof KDModFiles !== "undefined" && KDModFiles[atlas + ".json"]) {
                const response = await PIXI.settings.ADAPTER.fetch(KDModFiles[atlas + ".json"]);
                if (!response.ok) throw new Error(`Unable to fetch ${atlas}: ${response.status}`);
                const data = await response.json();
                const source = await loadPNG(atlas + ".png");
                sheet = new PIXI.Spritesheet(source.baseTexture, data);
                await sheet.parse();
                for (const name of PARTS) validateTexture(pathFor(name, pink), sheet.textures[pathFor(name, pink)]);
                for (const name of PARTS) textures.set(pathFor(name, pink), sheet.textures[pathFor(name, pink)]);
                return;
            }
        } catch (error) {
            sheet?.destroy(false);
            console.warn(`[Spiderlings] Spinner atlas failed; using direct PNGs: ${atlas}`, error);
        }
        await Promise.all(
            PARTS.map(async (name) => {
                const path = pathFor(name, pink);
                textures.set(path, validateTexture(path, await loadPNG(path)));
            }),
        );
    }
    async function prepare() {
        if (typeof PIXI === "undefined") return;
        await Promise.all([prepareColor(false), prepareColor(true)]);
    }
    api.SpinnerArt = { PARTS, render, clear, ready: prepare() };
})();
