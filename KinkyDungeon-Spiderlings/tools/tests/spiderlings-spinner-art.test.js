"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.join(__dirname, "../..");

function runtime({ wrongSize = false, atlas = false, broken = false } = {}) {
    const loaded = [],
        renders = [],
        bases = [];
    const vector = () => ({
        x: 0,
        y: 0,
        copyFrom(v) {
            this.x = v.x;
            this.y = v.y;
        },
        set(x, y) {
            this.x = x;
            this.y = y;
        },
    });
    class Container {
        constructor() {
            this.children = [];
            this.position = vector();
            this.pivot = vector();
            this.scale = vector();
        }
        addChild(...children) {
            for (const c of children) {
                c.parent?.removeChild(c);
                c.parent = this;
                this.children.push(c);
            }
        }
        removeChild(c) {
            this.children = this.children.filter((x) => x !== c);
            c.parent = null;
        }
        destroy(options) {
            this.destroyed = true;
            if (options?.children) for (const c of this.children) c.destroy();
        }
    }
    class Texture {
        constructor(base, frame, orig, trim) {
            this.orig = orig;
            this.trim = trim;
            this.baseTexture = base;
            this.frame = frame;
        }
        destroy(base) {
            this.destroyed = true;
            if (base) this.baseTexture.destroyed = true;
        }
    }
    class Sprite extends Container {
        constructor(texture) {
            super();
            this.texture = texture;
        }
    }
    const context = {
        console: { warn() {} },
        KDModFiles: atlas
            ? Object.fromEntries(
                  ["", "-pink"].map((color) => {
                      const file = `TextureAtlas/spiderlings-spinner${color}-0.json`;
                      return [file, file];
                  }),
              )
            : {},
        Spiderlings: {},
        PIXI: {
            Container,
            Sprite,
            Texture,
            Rectangle: class {
                constructor(x, y, width, height) {
                    Object.assign(this, { x, y, width, height });
                }
            },
            RenderTexture: { create: () => new Texture({}) },
            DRAW_MODES: { TRIANGLES: 4 },
            SCALE_MODES: { LINEAR: 1 },
            settings: {
                ADAPTER: {
                    async fetch(file) {
                        if (broken) throw new Error("atlas unavailable");
                        return { ok: true, json: async () => JSON.parse(fs.readFileSync(path.join(root, file))) };
                    },
                },
            },
            Spritesheet: class {
                constructor(base, data) {
                    this.base = base;
                    this.data = data;
                    this.textures = {};
                }
                async parse() {
                    for (const [name, entry] of Object.entries(this.data.frames)) {
                        this.textures[name] = new Texture(
                            this.base,
                            entry.frame,
                            { width: entry.sourceSize.w, height: entry.sourceSize.h },
                            entry.spriteSourceSize,
                        );
                    }
                }
                destroy() {}
            },
            Assets: {
                async load(options) {
                    loaded.push(options);
                    const data = fs.readFileSync(path.join(root, options.src));
                    const base = { path: options.src };
                    bases.push(base);
                    return {
                        baseTexture: base,
                        orig: { width: wrongSize ? 1 : data.readUInt32BE(16), height: data.readUInt32BE(20) },
                    };
                },
            },
        },
        PIXIapp: {
            renderer: {
                render(layer) {
                    renders.push(layer);
                },
            },
        },
    };
    vm.runInNewContext(fs.readFileSync(path.join(root, "SpiderlingsSpinnerArt.js"), "utf8"), context);
    return {
        art: context.Spiderlings.SpinnerArt,
        loaded,
        renders,
        bases,
        c: { Mesh: new Container(), Container: new Container(), RenderTexture: { width: 496, height: 702 } },
    };
}

for (const options of [{}, { atlas: true }, { atlas: true, broken: true }]) {
    test(`Spinner art loads full-canvas textures through sheets or direct fallbacks: ${JSON.stringify(options)}`, async () => {
        const r = runtime(options);
        await r.art.ready;
        const manifest = JSON.parse(fs.readFileSync(path.join(root, "mod.json")));
        assert.equal(r.loaded.length, options.atlas && !options.broken ? 2 : 16);
        for (const request of r.loaded) {
            assert.equal(request.loadParser, "modTextureLoader");
            assert.equal(request.format, "png");
            assert.ok(manifest.fileorder.indexOf(request.src) < manifest.fileorder.indexOf("SpiderlingsSpinnerArt.js"));
        }
        r.art.render(r.c, { amount: 1, active: false, pink: false, scale: 0.2 });
        const body = r.renders.at(-1).children.find((c) => c.name === "SpinnerStageLower");
        assert.deepEqual({ ...body.texture.orig }, { width: 2480, height: 3508 });
        assert.equal(body.scale.x, 0.2);
        assert.equal(body.position.x, 0);
        if (options.atlas && !options.broken) assert.deepEqual(body.texture.trim, { x: 906, y: 1922, w: 565, h: 1020 });
    });
}

test("seven full stages keep their canvas position and authored colors; only the active tail winds and tucks", async () => {
    const r = runtime();
    await r.art.ready;
    const draw = (options) =>
        r.art.render(r.c, { amount: 0, active: true, contest: false, pink: false, scale: 0.2, ...options });
    draw({});
    const parts = () => r.renders.slice(-2).flatMap((layer) => layer.children);
    const lower = parts().find((c) => c.name === "SpinnerStageLower");
    const upper = parts().find((c) => c.name === "SpinnerStageUpper");
    const tail = parts().find((c) => c.name === "SpinnerTail");
    assert.equal(lower.visible, false);
    assert.equal(upper.visible, false);
    assert.equal(tail.visible, false);
    for (let stage = 1; stage <= 7; stage++) {
        draw({ amount: stage / 7 });
        assert.ok(lower.texture.baseTexture.path.endsWith(`/Stage${stage}.png`));
        assert.equal(lower.alpha, 1);
        assert.equal(upper.visible, false);
        assert.equal(lower.position.y, 0);
    }
    draw({ amount: 3.5 / 7 });
    assert.ok(lower.texture.baseTexture.path.endsWith("/Stage3.png"));
    assert.ok(upper.texture.baseTexture.path.endsWith("/Stage4.png"));
    assert.equal(lower.alpha, 1, "deposited silk must not flash translucent during a transition");
    assert.equal(upper.alpha, 0.5);
    draw({ amount: 0.025 });
    const firstParent = tail.parent;
    const firstY = tail.position.y;
    draw({ amount: 0.075 });
    assert.notEqual(tail.parent, firstParent);
    draw({ amount: 0.975 });
    assert.ok(tail.position.y < firstY);
    assert.ok(tail.alpha > 0 && tail.alpha < 0.2, "tail tucks during the final artwork stage");
    draw({ amount: 0.4, active: false });
    assert.equal(tail.visible, false);
    draw({ amount: 1, active: false, pink: true });
    assert.equal(tail.visible, false);
    assert.ok(lower.texture.baseTexture.path.endsWith("SpiderlingsSpinnerLegbinderPink/Stage7.png"));
    assert.equal(lower.tint, 0xffffff, "source pink must not receive another tint");
    r.art.clear();
    assert.equal(r.c.Mesh.children.length, 0);
    assert.ok(r.bases.every((base) => !base.destroyed));
    draw({ amount: 1 });
    assert.equal(r.c.Mesh.children.length, 2);
});

test("incorrect replacement canvas dimensions are reported before rendering", async () => {
    const r = runtime({ wrongSize: true });
    await assert.rejects(r.art.ready, /expected .*received/);
});
