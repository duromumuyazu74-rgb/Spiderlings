"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "../..");

function runtime(wrongSize = false) {
    const loaded = [], renders = [], bases = [];
    const vector = () => ({x: 0, y: 0, copyFrom(v) { this.x = v.x; this.y = v.y; }, set(x, y) { this.x = x; this.y = y; }});
    class Container {
        constructor() { this.children = []; this.position = vector(); this.pivot = vector(); this.scale = vector(); }
        addChild(...children) { for (const c of children) { c.parent?.removeChild(c); c.parent = this; this.children.push(c); } }
        removeChild(c) { this.children = this.children.filter(x => x !== c); c.parent = null; }
        destroy(options) { this.destroyed = true; if (options?.children) for (const c of this.children) c.destroy(); }
    }
    class Texture {
        constructor(base, frame) { this.baseTexture = base; this.frame = frame; }
        destroy(base) { this.destroyed = true; if (base) this.baseTexture.destroyed = true; }
    }
    class Sprite extends Container { constructor(texture) { super(); this.texture = texture; } }
    class SimpleMesh extends Sprite {
        constructor(texture, vertices, uvs, indices) {
            super(texture); this.vertices = vertices; this.indices = indices;
            const buffer = {data: uvs, update() {}}; this.geometry = {getBuffer: () => buffer};
        }
    }
    const context = {Spiderlings: {}, PIXI: {Container, Sprite, SimpleMesh, Texture,
        Rectangle: class {constructor(x, y, width, height) {Object.assign(this, {x,y,width,height});}},
        RenderTexture: {create: () => new Texture({})}, DRAW_MODES: {TRIANGLES: 4}, SCALE_MODES: {LINEAR: 1},
        Assets: {async load(options) {
            loaded.push(options);
            const data = fs.readFileSync(path.join(root, options.src));
            const base = {path: options.src}; bases.push(base);
            return {baseTexture: base, orig: {width: wrongSize ? 1 : data.readUInt32BE(16), height: data.readUInt32BE(20)}};
        }}}, PIXIapp: {renderer: {render(layer) {renders.push(layer);}}}};
    vm.runInNewContext(fs.readFileSync(path.join(root, "SpiderlingsSpinnerArt.js"), "utf8"), context);
    return {art: context.Spiderlings.SpinnerArt, loaded, renders, bases,
        c: {Mesh: new Container(), Container: new Container(), RenderTexture: {width: 496, height: 702}}};
}

test("artist parts load their packaged direct PNGs without atlas aliases", async () => {
    const r = runtime(); await r.art.ready;
    const manifest = JSON.parse(fs.readFileSync(path.join(root, "mod.json")));
    const frames = JSON.parse(fs.readFileSync(path.join(root, "TextureAtlas/spiderlings-webbing-0.json"))).frames;
    assert.equal(r.loaded.length, 4);
    for (const request of r.loaded) {
        assert.equal(request.loadParser, "modTextureLoader");
        assert.equal(request.format, "png");
        assert.ok(manifest.fileorder.indexOf(request.src) < manifest.fileorder.indexOf("SpiderlingsSpinnerArt.js"));
        assert.equal(frames[request.src], undefined);
    }
});

test("winding uses Band/Tail; interruption hides the tail; completion uses Finished/Closure with pink tint", async () => {
    const r = runtime(); await r.art.ready;
    const draw = options => r.art.render(r.c, {amount: .4, active: true, contest: false, pink: false, scale: .2, ...options});
    draw({});
    const layers = r.renders.slice(-2), parts = () => layers.flatMap(l => l.children);
    const find = name => parts().filter(c => c.texture.baseTexture.path.endsWith("/" + name + ".png"));
    assert.ok(find("Band").some(m => m.vertices.some(n => n !== 0)));
    const tail = find("Tail")[0]; assert.equal(tail.visible, true);
    draw({amount: .1}); const firstParent = tail.parent;
    draw({amount: .15}); assert.notEqual(tail.parent, firstParent, "tail crosses the character's front/back boundary");
    draw({active: false}); assert.equal(tail.visible, false);
    assert.equal(find("Finished")[0].alpha, 0);
    draw({amount: 1, active: false, pink: true});
    assert.equal(tail.visible, false);
    assert.equal(find("Finished")[0].alpha, 1);
    assert.equal(find("Closure")[0].alpha, 1);
    assert.equal(find("Finished")[0].tint, 0xFFC2DF);
    assert.ok(find("Band").every(m => m.alpha === 0));
    r.art.clear(); assert.equal(r.c.Mesh.children.length, 0);
    assert.ok(r.bases.every(b => !b.destroyed), "redress must not destroy shared PNG textures");
    draw({amount: 1}); assert.equal(r.c.Mesh.children.length, 2);
});

test("incorrect replacement canvas dimensions are reported before rendering", async () => {
    const r = runtime(true);
    await assert.rejects(r.art.ready, /expected .*received/);
});
