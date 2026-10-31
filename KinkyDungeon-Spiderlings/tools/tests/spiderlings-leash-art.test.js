"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { loadWebbingRuntime, modRoot } = require("./helpers/model-runtime.js");

test("silk leash models retain native pose precedence and ship every resolved sprite in both colors", () => {
    const { context } = loadWebbingRuntime();
    const model = context.ModelDefs.SpiderlingsSilkLeashModel;
    const line = model.Layers.Leash;
    assert.deepEqual(Array.from(model.AddPose), ["Leash"]);
    assert.equal(line.NoColorize, true);
    assert.equal(model.Layers.LeashCollar.NoColorize, true);
    assert.equal(model.Layers.LeashCollar.Pri, -400);
    assert.equal(model.Layers.LeashCollarHardware, undefined);
    assert.deepEqual(Array.from(context.ModelDefs.SpiderlingsSilkCollarModel.AddPose), []);
    const cases = [
        [[], "Leash"],
        [["Free"], "LeashFree"],
        [["Crossed"], "LeashCrossed"],
        [["Front"], "LeashFront"],
        [["HandsBehind", "Free"], "Leash"],
        [["HandsBound", "Crossed"], "Leash"],
        [["Free", "Pulled"], "LeashPulled"],
        [["Kneel", "Free"], "LeashKneel"],
        [["KneelClosed", "Pulled"], "LeashKneelPulled"],
        [["Hogtie"], "LeashHogtie"],
        [["Hogtie", "Pulled"], "LeashHogtiePulled"],
    ];
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    for (const [poses, expected] of cases) {
        const morph = Object.entries(line.MorphPoses).find(([pose]) => poses.includes(pose))?.[1] || "";
        const append = Object.entries(line.AppendPose).find(([pose]) => poses.includes(pose))?.[1] || "";
        assert.equal(line.Name + morph + append, expected);
        for (const suffix of ["", "Pink"]) {
            const asset = `Models/SpiderlingsSilkLeash${suffix}/${expected}.png`;
            assert.ok(manifest.fileorder.includes(asset), asset);
            assert.ok(fs.existsSync(path.join(modRoot, asset)), asset);
        }
    }
});

test("prison cosmetic markers change only their own carrier models and survive item serialization", async () => {
    const calls = [];
    const nativeResult = {};
    const runtime = loadWebbingRuntime({
        KDAddModel(...args) {
            calls.push({ receiver: this, args });
            return nativeResult;
        },
    });
    const { context } = runtime;
    const model = { Name: "Leash", Folder: "Leash" };
    const receiver = {};
    for (const [name, expected] of [
        ["BasicLeash", "SpiderlingsSilkLeashModel"],
        ["BasicCollar", "SpiderlingsSilkCollarModel"],
    ]) {
        const item = { name, id: 33, lock: "Red", cutProgress: 0.4, data: { otherMod: 7 } };
        const args = [{}, "ItemNeckRestraints", model, "", {}, item, {}];
        assert.equal(context.KDAddModel.apply(receiver, args), nativeResult);
        assert.equal(calls.at(-1).args[2], model);
        assert.equal(context.Spiderlings.markSilkLeashArtwork(item), true);
        assert.equal(context.Spiderlings.markSilkLeashArtwork(item), false);
        const restored = JSON.parse(JSON.stringify(item));
        args[5] = restored;
        assert.equal(context.KDAddModel.apply(receiver, args), nativeResult);
        assert.equal(calls.at(-1).args[2].Name, expected);
        assert.equal(calls.at(-1).args[5], restored);
        assert.equal(calls.at(-1).receiver, receiver);
        assert.deepEqual(
            {
                id: restored.id,
                lock: restored.lock,
                cutProgress: restored.cutProgress,
                otherMod: restored.data.otherMod,
            },
            { id: 33, lock: "Red", cutProgress: 0.4, otherMod: 7 },
        );
    }
    const foreign = { name: "RopeLeash", id: 99, data: {} };
    assert.equal(context.Spiderlings.markSilkLeashArtwork(foreign), false);
    context.KDAddModel({}, "ItemNeckRestraints", model, "", {}, foreign);
    assert.equal(calls.at(-1).args[2], model);
    assert.deepEqual(model, { Name: "Leash", Folder: "Leash" });

    const appearance = structuredClone(context.ModelDefs.SpiderlingsSilkLeashModel);
    const savedCopy = structuredClone(context.ModelDefs.SpiderlingsSilkCollarModel);
    const player = { Appearance: [{ Model: appearance }] };
    context.KinkyDungeonPlayer = player;
    context.KDCurrentModels = new Map([[player, { Models: new Map([[savedCopy.Name, savedCopy]]) }]]);
    for (const pink of [true, false]) {
        context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        await context.Spiderlings.applyWebbingColor();
        for (const owned of [context.ModelDefs.SpiderlingsSilkLeashModel, appearance, savedCopy])
            assert.equal(owned.Folder, `SpiderlingsSilkLeash${pink ? "Pink" : ""}`);
    }
});

for (const brokenPink of [false, true]) {
    test(`leash atlas aliases remain color-isolated with ${brokenPink ? "pink direct fallback" : "both sheets ready"}`, async () => {
        const files = {};
        for (const color of ["", "-pink"])
            for (const extension of ["json", "png"]) {
                const name = `TextureAtlas/spiderlings-leash${color}-0.${extension}`;
                files[name] = `blob:${name}`;
            }
        const cache = new Map();
        const loads = [];
        const { context } = loadWebbingRuntime({
            KDModFiles: files,
            kdpixitex: cache,
            PIXI: {
                settings: {
                    ADAPTER: {
                        async fetch(url) {
                            if (brokenPink && url.includes("-pink")) throw new Error("pink sheet unavailable");
                            return {
                                ok: true,
                                json: async () => JSON.parse(fs.readFileSync(path.join(modRoot, url.slice(5)), "utf8")),
                            };
                        },
                    },
                },
                SCALE_MODES: { LINEAR: "linear" },
                Assets: {
                    async load(input) {
                        const name = typeof input === "string" ? input : input.src;
                        loads.push(name);
                        return { baseTexture: { valid: true, width: 4096, height: 4096 } };
                    },
                },
                Spritesheet: class {
                    constructor(baseTexture, data) {
                        this.textures = Object.fromEntries(
                            Object.keys(data.frames).map((name) => [name, { baseTexture }]),
                        );
                    }
                    async parse() {}
                },
                Texture: { addToCache() {} },
                utils: { TextureCache: {} },
            },
        });
        await context.Spiderlings.loadSpiderlingsTextureAtlases();
        const frames = Array.from(context.Spiderlings.ModelRuntime.SILK_LEASH_FRAMES);
        assert.equal(frames.length, 10);
        assert.ok(frames.every((name) => cache.has(name)));
        context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = true;
        await context.Spiderlings.applyWebbingColor();
        await context.Spiderlings.preloadSpiderlingsTextures("SpiderlingsSilkLeashModel", true);
        const pinkFrames = frames.map((name) => name.replace("SpiderlingsSilkLeash/", "SpiderlingsSilkLeashPink/"));
        assert.ok(pinkFrames.every((name) => cache.has(name)));
        assert.equal(
            pinkFrames.every((name) => loads.includes(name)),
            brokenPink,
        );
        assert.ok(frames.every((name) => !loads.includes(name)));
    });
}
