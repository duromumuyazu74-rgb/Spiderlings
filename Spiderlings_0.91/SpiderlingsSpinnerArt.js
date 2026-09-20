"use strict";

// Replaceable artist textures. Intentionally outside the Webbing atlases.
(() => {
    const api = globalThis.Spiderlings;
    const ROOT = "Models/SpiderlingsSpinnerLegbinder/";
    const PARTS = Object.freeze({
        Band: Object.freeze({path: ROOT + "Band.png", size: [2172, 724], frame: [0, 132, 2172, 468]}),
        Tail: Object.freeze({path: ROOT + "Tail.png", size: [2172, 724], frame: [0, 195, 2140, 400]}),
        Finished: Object.freeze({path: ROOT + "Finished.png", size: [1024, 1536], frame: [210, 30, 605, 1490]}),
        Closure: Object.freeze({path: ROOT + "Closure.png", size: [2172, 724], frame: [35, 85, 2105, 530]}),
    });
    const textures = new Map(), views = new Map();
    const tau = Math.PI * 2, turns = 8, steps = 48, segments = (turns + .5) * steps;
    const cx = 1240, bottom = 3160, top = 2030, band = 220;
    const radius = y => y > 2850 ? 280 + 55 * Math.min(1, (y - 2850) / 310)
        : 280 + 60 * Math.max(0, (2500 - y) / 470);
    function point(t) {
        const a = t - Math.PI / 2, y = bottom - (bottom - top) * Math.min(1, t / (turns * tau));
        return {x: cx + Math.sin(a) * radius(y), y: y + Math.cos(a) * 35, a};
    }
    function mesh(texture, count) {
        const vertices = new Float32Array(count * 8), uvs = new Float32Array(count * 8);
        const indices = new Uint16Array(count * 6);
        for (let i = 0; i < count; i++) {
            const v = i * 4;
            indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
        }
        return new PIXI.SimpleMesh(texture, vertices, uvs, indices, PIXI.DRAW_MODES.TRIANGLES);
    }
    function quad(target, i, xy, u0, u1) {
        target.vertices.set(xy, i * 8);
        target.geometry.getBuffer("aTextureCoord").data.set([u0, 0, u1, 0, u1, 1, u0, 1], i * 8);
    }
    function upload(target) { target.geometry.getBuffer("aTextureCoord").update(); }
    function createView(c) {
        const make = z => {
            const layer = new PIXI.Container();
            const texture = PIXI.RenderTexture.create({width: c.RenderTexture.width, height: c.RenderTexture.height});
            const overlay = new PIXI.Sprite(texture);
            overlay.name = z < 0 ? "SpiderlingsSpinnerBack" : "SpiderlingsSpinnerFront";
            overlay.zIndex = z;
            c.Mesh.sortableChildren = true;
            c.Mesh.addChild(overlay);
            return {layer, overlay};
        };
        const back = make(-1e8), front = make(1e8);
        const backBand = mesh(textures.get("Band"), segments), frontBand = mesh(textures.get("Band"), segments);
        const tail = mesh(textures.get("Tail"), 24);
        const finished = new PIXI.Sprite(textures.get("Finished"));
        const closure = new PIXI.Sprite(textures.get("Closure"));
        back.layer.addChild(backBand);
        front.layer.addChild(frontBand, finished, closure, tail);
        return {back, front, backBand, frontBand, tail, finished, closure};
    }
    function dispose(v) {
        for (const {layer, overlay} of [v.back, v.front]) {
            if (!overlay.destroyed) { overlay.parent?.removeChild(overlay); overlay.texture.destroy(true); overlay.destroy(); }
            if (!layer.destroyed) layer.destroy({children: true}); // Shared PNG textures survive redress.
        }
    }
    function clear() { for (const v of views.values()) dispose(v); views.clear(); }
    function render(c, {amount, active, contest, pink, scale}) {
        if (textures.size !== 4 || !c?.Mesh || c.Mesh.destroyed) return;
        // Native model rebuilds can replace whole containers.
        for (const [old, v] of views) if (old.Mesh.destroyed || old.Container.destroyed) { dispose(v); views.delete(old); }
        let v = views.get(c);
        if (v && (v.front.overlay.destroyed || v.back.overlay.destroyed)) { dispose(v); views.delete(c); v = undefined; }
        if (!v) { v = createView(c); views.set(c, v); }
        for (const {layer} of [v.back, v.front]) {
            layer.position.copyFrom(c.Container.position); layer.pivot.copyFrom(c.Container.pivot);
            layer.scale.copyFrom(c.Container.scale); layer.rotation = c.Container.rotation;
            layer.alpha = contest ? .65 : 1;
        }
        amount = Math.max(0, Math.min(1, amount));
        const tint = pink ? 0xFFC2DF : 0xFFFFFF, extent = amount * (turns + .5) * tau;
        // During the final half-turn, blend into the dedicated finished artwork.
        const finishedAlpha = contest ? 0 : amount >= 1 ? 1 : Math.max(0, (amount - .92) / .08);
        for (const m of [v.backBand, v.frontBand]) { m.vertices.fill(0); m.alpha = 1 - finishedAlpha; }
        const edge = (p, dy) => [(cx + Math.sin(p.a) * radius(p.y + dy)) * scale, (p.y + dy) * scale];
        for (let i = 0; i < Math.min(segments, Math.ceil(extent / (tau / steps))); i++) {
            const t0 = i * tau / steps, t1 = Math.min(extent, (i + 1) * tau / steps);
            const a = point(t0), b = point(t1), isFront = Math.cos(point((t0 + t1) / 2).a) >= 0;
            quad(isFront ? v.frontBand : v.backBand, i,
                [...edge(a, -band / 2), ...edge(b, -band / 2), ...edge(b, band / 2), ...edge(a, band / 2)],
                (i % steps) / steps, ((i % steps) + (t1 - t0) / (tau / steps)) / steps);
        }
        v.frontBand.tint = tint;
        v.backBand.tint = pink ? 0xBC8FA5 : 0xB8B8B8;
        upload(v.frontBand); upload(v.backBand);
        const tip = point(extent), tailFront = Math.cos(tip.a) >= 0;
        v.tail.visible = active && amount > 0 && amount < 1;
        (tailFront ? v.front.layer : v.back.layer).addChild(v.tail);
        v.tail.tint = tailFront ? tint : (pink ? 0xBC8FA5 : 0xB8B8B8);
        v.tail.alpha = 1 - finishedAlpha;
        if (v.tail.visible) {
            const endX = cx + Math.sin(tip.a) * 1080;
            const tailPoint = (u, side) => [
                (tip.x + (endX - tip.x) * u) * scale,
                (tip.y + 80 * u - 45 * Math.sin(u * Math.PI) + side * band / 2) * scale,
            ];
            for (let i = 0; i < 24; i++) {
                const a = i / 24, b = (i + 1) / 24;
                quad(v.tail, i, [...tailPoint(a, -1), ...tailPoint(b, -1), ...tailPoint(b, 1), ...tailPoint(a, 1)], a, b);
            }
            upload(v.tail);
        }
        v.finished.position.set(790 * scale, 1860 * scale);
        v.finished.width = 900 * scale; v.finished.height = 1470 * scale;
        v.finished.alpha = finishedAlpha; v.finished.tint = tint;
        v.closure.position.set(790 * scale, 1880 * scale);
        v.closure.width = 900 * scale; v.closure.height = 185 * scale;
        v.closure.alpha = finishedAlpha; v.closure.tint = tint;
        PIXIapp.renderer.render(v.back.layer, {clear: true, renderTexture: v.back.overlay.texture});
        PIXIapp.renderer.render(v.front.layer, {clear: true, renderTexture: v.front.overlay.texture});
    }
    async function prepare() {
        if (typeof PIXI === "undefined") return;
        await Promise.all(Object.entries(PARTS).map(async ([name, spec]) => {
            const source = await PIXI.Assets.load({src: spec.path, format: "png", loadParser: "modTextureLoader",
                data: {scaleMode: PIXI.SCALE_MODES.LINEAR}});
            if (source.orig.width !== spec.size[0] || source.orig.height !== spec.size[1])
                throw new Error(`${spec.path}: expected ${spec.size.join("x")}, received ${source.orig.width}x${source.orig.height}`);
            textures.set(name, new PIXI.Texture(source.baseTexture, new PIXI.Rectangle(...spec.frame)));
        }));
    }
    api.SpinnerArt = {PARTS, render, clear, ready: prepare()};
})();
