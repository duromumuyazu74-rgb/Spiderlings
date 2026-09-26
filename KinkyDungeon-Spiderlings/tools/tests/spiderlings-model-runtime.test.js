"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
    loadWebbingRuntime,
    modRoot,
    families,
    armId,
    armModelId,
    armAsset,
    lv2ArmDisplacement,
    displacementAssets,
    webbingAtlas,
    webbingAtlasImage,
    pinkAtlas,
    pinkAtlasImage,
} = require("./helpers/model-runtime.js");

for (const scale of [1, "1"])
    test(`the model runtime accepts ${typeof scale} atlas scale and caches all direct aliases before preload`, async () => {
        const atlasData = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
        atlasData.meta.scale = scale;
        const fetches = [];
        const kdTextures = [];
        const assetLoads = [];
        const textureCache = new Map();
        const addedAliases = [];
        let spritesheetInput;
        const runtime = loadWebbingRuntime({
            KDModFiles: {
                [webbingAtlas]: "blob:spiderlings-webbing-atlas-json",
                [webbingAtlasImage]: "blob:spiderlings-webbing-atlas-png",
                [armAsset]: "blob:arm-fallback",
            },
            kdpixitex: textureCache,
            KDTex(texturePath) {
                kdTextures.push(texturePath);
                return { texturePath };
            },
            PIXI: {
                settings: {
                    ADAPTER: {
                        async fetch(url) {
                            fetches.push(url);
                            return {
                                ok: true,
                                async json() {
                                    return atlasData;
                                },
                            };
                        },
                    },
                },
                Assets: {
                    load(asset) {
                        const texturePath = typeof asset === "string" ? asset : asset.src;
                        assetLoads.push(texturePath);
                        return Promise.resolve({ baseTexture: { texturePath } });
                    },
                },
                SCALE_MODES: { LINEAR: "linear" },
                Spritesheet: class {
                    constructor(baseTexture, data, resolutionFilename) {
                        spritesheetInput = { baseTexture, data, resolutionFilename };
                        this.textures = Object.fromEntries(
                            Object.keys(data.frames).map((key) => [key, { atlasFrame: key, baseTexture }]),
                        );
                    }
                    async parse() {}
                },
                Texture: {
                    addToCache(texture, alias) {
                        addedAliases.push([texture, alias]);
                    },
                },
                utils: { TextureCache: {} },
            },
        });

        assert.deepEqual(Array.from(runtime.context.Spiderlings.ModelRuntime.TEXTURE_ATLASES), [
            webbingAtlas,
            pinkAtlas,
        ]);
        assert.deepEqual(Array.from(runtime.context.Spiderlings.ModelRuntime.DISPLACEMENT_ASSETS), [
            ...displacementAssets,
        ]);
        assert.equal(typeof runtime.context.Spiderlings.preloadSpiderlingsTextures, "function");
        assert.equal(typeof runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels, "function");
        await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
        await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, false);
        assert.deepEqual(fetches, ["blob:spiderlings-webbing-atlas-json"]);
        assert.deepEqual(assetLoads, [...displacementAssets, webbingAtlasImage]);
        assert.equal(spritesheetInput.resolutionFilename, webbingAtlas);
        assert.equal(spritesheetInput.baseTexture.texturePath, webbingAtlasImage);
        assert.deepEqual(kdTextures, displacementAssets);
        assert.deepEqual([...textureCache.keys()], [...displacementAssets, ...Object.keys(atlasData.frames)]);
        assert.equal(
            addedAliases.some(([, alias]) => alias === armAsset),
            true,
        );
    });

test("delivered bullet colors follow settings without changing spell identities or draw geometry", () => {
    const calls = [];
    const receiver = {};
    const result = {};
    const { context } = loadWebbingRuntime({
        KinkyDungeonRootDirectory: "Game/",
        KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: true } },
        KDDraw(...args) {
            calls.push({ receiver: this, args });
            return result;
        },
    });
    const spells = JSON.stringify(context.KinkyDungeonSpellListEnemies);
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    for (const pink of [true, false, true]) {
        context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        context.KDEventMapGeneric.afterModConfig.Spiderlings();
        for (const name of ["SpiderWeb", "SpiderWebHit", "WebSpray", "WebSprayTrail", "Fireball"]) {
            const args = [
                {},
                new Map(),
                "existing-bullet",
                `Game/Bullets/${name}.png`,
                10,
                20,
                72,
                72,
                0.5,
                { alpha: 0.8 },
                true,
            ];
            const expected = name !== "Fireball" && pink ? `Game/Bullets/${name}Pink.png` : args[3];
            assert.equal(context.KDDraw.apply(receiver, args), result);
            assert.equal(calls.at(-1).receiver, receiver);
            assert.deepEqual(
                calls.at(-1).args,
                args.map((arg, i) => (i === 3 ? expected : arg)),
            );
            if (name !== "Fireball") assert.ok(manifest.fileorder.includes(expected.slice(5)), expected);
        }
        const unrelated = [{}, new Map(), "other", "Models/Other/WebSpray.png"];
        context.KDDraw(...unrelated);
        assert.deepEqual(calls.at(-1).args, unrelated);
        assert.equal(JSON.stringify(context.KinkyDungeonSpellListEnemies), spells);
    }
});

test("enemy artwork follows restored settings and repeated toggles without changing enemy identities", () => {
    const calls = [];
    const receiver = {};
    const result = {};
    for (const savedPink of [false, true]) {
        const { context } = loadWebbingRuntime({
            KinkyDungeonRootDirectory: "Game/",
            KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: savedPink } },
            KDDraw(...args) {
                calls.push({ receiver: this, args });
                return result;
            },
        });
        const enemies = JSON.stringify(context.KinkyDungeonEnemies);
        const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
        for (const pink of [savedPink, !savedPink, savedPink]) {
            context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            context.KDEventMapGeneric.afterModConfig.Spiderlings();
            for (const name of ["Spinner", "Tunneler", "WebCaster", "NestEntrance", "Jumper", "Maidforce"]) {
                const args = [
                    {},
                    new Map(),
                    `existing-${name}`,
                    `Game/Enemies/${name}.png`,
                    10,
                    20,
                    72,
                    72,
                    0.5,
                    { alpha: 0.8 },
                    true,
                ];
                const colored = !["Jumper", "Maidforce"].includes(name);
                const expected = colored && pink ? `Game/Enemies/${name}Pink.png` : args[3];
                assert.equal(context.KDDraw.apply(receiver, args), result);
                assert.equal(calls.at(-1).receiver, receiver);
                assert.deepEqual(
                    calls.at(-1).args,
                    args.map((arg, i) => (i === 3 ? expected : arg)),
                );
                if (name !== "Maidforce") {
                    const index = manifest.fileorder.indexOf(expected.slice(5));
                    assert.ok(index >= 0 && index < manifest.fileorder.indexOf("SpiderlingsModelRuntime.js"), expected);
                }
            }
            for (const path of [
                "Game/EnemiesBound/Spinner.png",
                "Game/Enemies/Other/Spinner.png",
                "Models/Other/Spinner.png",
            ]) {
                const args = [{}, new Map(), "unrelated", path];
                context.KDDraw(...args);
                assert.deepEqual(calls.at(-1).args, args);
            }
            assert.equal(JSON.stringify(context.KinkyDungeonEnemies), enemies);
        }
    }
});

test("Pink mode selects matching art for Spinner web-cell enemies", () => {
    const images = [];
    const { context } = loadWebbingRuntime({
        KinkyDungeonRootDirectory: "Game/",
        KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: true } },
        KDDraw(_board, _sprites, _id, image) {
            images.push(image);
            return {};
        },
    });
    for (const name of ["SpiderlingsSpinnerTrap", "SpiderlingsSilkAnchor"])
        context.KDDraw({}, new Map(), `spr_${name}`, `Game/Enemies/${name}.png`);
    assert.deepEqual(images, [
        "Game/Enemies/SpiderlingsSpinnerTrapPink.png",
        "Game/Enemies/SpiderlingsSilkAnchorPink.png",
    ]);
    images.length = 0;
    context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    context.KDEventMapGeneric.afterModConfig.Spiderlings();
    for (const name of ["SpiderlingsSpinnerTrap", "SpiderlingsSilkAnchor"])
        context.KDDraw({}, new Map(), `spr_${name}`, `Game/Enemies/${name}.png`);
    assert.deepEqual(images, ["Game/Enemies/SpiderlingsSpinnerTrap.png", "Game/Enemies/SpiderlingsSilkAnchor.png"]);
});

test("both color atlases preload before equipment, reuse textures on switching, and fail independently", async () => {
    const original = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
    const pink = JSON.parse(fs.readFileSync(path.join(modRoot, pinkAtlas), "utf8"));
    for (const broken of [null, webbingAtlas, pinkAtlas]) {
        const loads = [];
        const fetches = [];
        const destroyed = [];
        const cache = new Map();
        const runtime = loadWebbingRuntime({
            console: { ...console, warn() {} },
            KDModFiles: Object.fromEntries(
                [webbingAtlas, webbingAtlasImage, pinkAtlas, pinkAtlasImage].map((path) => [path, `blob:${path}`]),
            ),
            kdpixitex: cache,
            PIXI: {
                settings: {
                    ADAPTER: {
                        async fetch(url) {
                            fetches.push(url);
                            return {
                                async json() {
                                    return url === `blob:${pinkAtlas}` ? pink : original;
                                },
                            };
                        },
                    },
                },
                Assets: {
                    async load(asset) {
                        const path = typeof asset === "string" ? asset : asset.src;
                        loads.push(path);
                        return { valid: true, baseTexture: { valid: true, path } };
                    },
                },
                Spritesheet: class {
                    constructor(baseTexture, data, path) {
                        this.path = path;
                        this.textures = Object.fromEntries(
                            Object.keys(data.frames)
                                .filter((_, index) => path !== broken || index !== 24)
                                .map((name) => [name, { valid: true, baseTexture }]),
                        );
                    }
                    async parse() {}
                    destroy() {
                        destroyed.push(this.path);
                    }
                },
            },
        });
        // Eager loading is independent of the current color and worn items.
        await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
        assert.deepEqual(fetches, [`blob:${webbingAtlas}`, `blob:${pinkAtlas}`]);
        for (const [atlasPath, data] of [
            [webbingAtlas, original],
            [pinkAtlas, pink],
        ]) {
            assert.equal(
                Object.keys(data.frames).filter((name) => cache.has(name)).length,
                atlasPath === broken ? 0 : 25,
                "an incomplete sheet must publish no partial aliases",
            );
        }
        assert.deepEqual(destroyed, broken ? [broken] : []);
        const atlasTextures = new Map(cache);
        for (const isPink of [true, false, true]) {
            runtime.context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = isPink;
            await runtime.context.Spiderlings.applyWebbingColor();
            await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, true);
            const path = isPink ? "Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png" : armAsset;
            if (broken !== (isPink ? pinkAtlas : webbingAtlas)) {
                assert.equal(cache.get(path), atlasTextures.get(path), "color switching reuses its atlas frame");
            }
        }
        assert.deepEqual(
            loads.filter((path) => path.startsWith("Models/")),
            broken === pinkAtlas
                ? ["Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png"]
                : broken === webbingAtlas
                  ? [armAsset]
                  : [],
            "healthy atlases avoid all first-hit and color-switch direct PNG requests",
        );
    }
});

test("pink fallback preloads are independent of original texture caches and a late atlas completion", async () => {
    const atlasData = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
    const cache = new Map();
    const loads = [];
    let finishAtlas;
    const gate = new Promise((resolve) => {
        finishAtlas = resolve;
    });
    const runtime = loadWebbingRuntime({
        KDModFiles: { [webbingAtlas]: "blob:atlas-json", [webbingAtlasImage]: "blob:atlas-png" },
        kdpixitex: cache,
        PIXI: {
            settings: {
                ADAPTER: {
                    async fetch() {
                        await gate;
                        return {
                            async json() {
                                return atlasData;
                            },
                        };
                    },
                },
            },
            Assets: {
                async load(asset) {
                    const key = typeof asset === "string" ? asset : asset.src;
                    loads.push(key);
                    return { baseTexture: { key } };
                },
            },
            Spritesheet: class {
                constructor(baseTexture, data) {
                    this.textures = Object.fromEntries(Object.keys(data.frames).map((key) => [key, { baseTexture }]));
                }
                async parse() {}
            },
        },
    });
    runtime.context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = true;
    await runtime.context.Spiderlings.applyWebbingColor();
    const preload = runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, true);
    finishAtlas();
    await preload;
    assert.equal(loads.includes("Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png"), true);
    assert.equal(runtime.models[0].Folder, "SpiderlingsWebbingLv1Pink");
    assert.equal(cache.has(armAsset), true, "original atlas aliases remain original");
    runtime.context.KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    await runtime.context.Spiderlings.applyWebbingColor();
    await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, true);
    assert.equal(loads.includes(armAsset), false, "switching back reuses the original atlas");
});

test("the model runtime falls back to the unchanged direct PNG when atlas loading fails", async () => {
    const kdTextures = [];
    const assetLoads = [];
    const runtime = loadWebbingRuntime({
        console: { ...console, warn() {} },
        KDModFiles: { [webbingAtlas]: "blob:broken-atlas-json" },
        kdpixitex: new Map(),
        KDTex(texturePath) {
            kdTextures.push(texturePath);
        },
        PIXI: {
            settings: {
                ADAPTER: {
                    async fetch() {
                        throw new Error("atlas unavailable");
                    },
                },
            },
            Assets: {
                load(texturePath) {
                    assetLoads.push(texturePath);
                    return Promise.resolve({ texturePath });
                },
            },
            Texture: { addToCache() {} },
            utils: { TextureCache: {} },
        },
    });

    await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
    await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, false);
    assert.deepEqual(kdTextures, [...displacementAssets, armAsset]);
    assert.deepEqual(assetLoads, [...displacementAssets, armAsset]);
});

test("an incomplete parsed atlas is discarded atomically before direct fallback", async () => {
    const atlasData = JSON.parse(fs.readFileSync(path.join(modRoot, webbingAtlas), "utf8"));
    const directLoads = [];
    const textureCache = new Map();
    let destroyed = false;
    const runtime = loadWebbingRuntime({
        console: { ...console, warn() {} },
        KDModFiles: {
            [webbingAtlas]: "blob:atlas-json",
            [webbingAtlasImage]: "blob:atlas-png",
        },
        kdpixitex: textureCache,
        KDTex() {},
        PIXI: {
            settings: {
                ADAPTER: {
                    async fetch() {
                        return {
                            ok: true,
                            async json() {
                                return atlasData;
                            },
                        };
                    },
                },
            },
            Assets: {
                async load(texturePath) {
                    if (typeof texturePath !== "string") return { baseTexture: { atlas: true } };
                    directLoads.push(texturePath);
                    return { texturePath };
                },
            },
            SCALE_MODES: { LINEAR: "linear" },
            Spritesheet: class {
                constructor() {
                    this.textures = Object.fromEntries(
                        Object.keys(atlasData.frames)
                            .filter((key) => key !== armAsset)
                            .map((key) => [key, { baseTexture: { atlas: true } }]),
                    );
                }
                async parse() {}
                destroy() {
                    destroyed = true;
                }
            },
            Texture: { addToCache() {} },
            utils: { TextureCache: {} },
        },
    });

    await runtime.context.Spiderlings.loadSpiderlingsTextureAtlases();
    await runtime.context.Spiderlings.preloadSpiderlingsTextures(armModelId, false);
    assert.equal(destroyed, true);
    assert.deepEqual([...textureCache.keys()], []);
    assert.deepEqual(directLoads, [...displacementAssets, armAsset]);
});

test("first pink enemy application waits for decoding and replaces KD's pending texture before redress", async () => {
    for (const alreadyCached of [false, true]) {
        const pinkPath = "Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png";
        const pending = { valid: false, baseTexture: { valid: false } };
        const decoded = { valid: true, baseTexture: { valid: true } };
        const cache = new Map(alreadyCached ? [[pinkPath, pending]] : []);
        const pixiCache = alreadyCached ? { [pinkPath]: pending } : {};
        const redresses = [];
        let finish;
        const loading = new Promise((resolve) => {
            finish = resolve;
        });
        let directRequests = 0;
        const runtime = loadWebbingRuntime({
            KDModSettings: { Spiderlings: { spiderlingsPinkWebbing: true } },
            KDModFiles: { [pinkPath]: "blob:pink-without-extension" },
            KinkyDungeonPlayer: {},
            kdpixitex: cache,
            KDTex(texturePath) {
                if (texturePath === pinkPath) cache.set(texturePath, pending);
            },
            KinkyDungeonDressPlayer() {
                redresses.push(cache.get(pinkPath));
            },
            PIXI: {
                Assets: {
                    // Pixi's background promise acknowledges scheduling, not decoding.
                    async backgroundLoad() {},
                    load(asset) {
                        const texturePath = typeof asset === "string" ? asset : asset.src;
                        if (texturePath !== pinkPath) return Promise.resolve(decoded);
                        assert.equal(asset.format, "png");
                        assert.equal(
                            asset.loadParser,
                            "modTextureLoader",
                            "KD 5.4 blob URLs need explicit PNG parsing",
                        );
                        directRequests += 1;
                        return loading;
                    },
                },
                utils: { TextureCache: pixiCache },
                Texture: {
                    addToCache(texture, key) {
                        pixiCache[key] = texture;
                    },
                },
            },
        });
        runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels(
            { trigger: "postApply" },
            { name: armId },
        );
        await new Promise((resolve) => setImmediate(resolve));
        assert.equal(redresses.length, 0, "do not bake an unready texture into the character");
        assert.equal(directRequests, 1, "cached pending textures still need an awaited load");
        finish(decoded);
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(redresses, [decoded], "redress without another player action, using the decoded texture");
        assert.equal(pixiCache[pinkPath], decoded);
    }
});

test("concurrent distinct model preloads redress after every pending texture has settled", async () => {
    const resolvers = new Map();
    let redresses = 0;
    const runtime = loadWebbingRuntime({
        KinkyDungeonPlayer: {},
        ForceRefreshModels() {},
        KinkyDungeonDressPlayer() {
            redresses += 1;
        },
        setTimeout() {},
        KDTex() {},
        PIXI: {
            Assets: {
                load(texturePath) {
                    return new Promise((resolve) => resolvers.set(texturePath, resolve));
                },
            },
        },
    });
    const refresh = runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels;
    refresh({ trigger: "postApply" }, { name: "SpiderlingsWebbingLv2Arm" });
    refresh({ trigger: "postApply" }, { name: families[1].id });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();

    assert.deepEqual(
        [...resolvers.keys()].sort(),
        ["Models/SpiderlingsWebbingLv2/ArmWebbing.png", ...displacementAssets, families[1].runtimeAsset].sort(),
    );
    resolvers.get("Models/SpiderlingsWebbingLv2/ArmWebbing.png")({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 0);
    resolvers.get(families[1].runtimeAsset)({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 0);
    resolvers.get(lv2ArmDisplacement)({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 1);
});

test("a displacement texture finishes decoding before the post-apply redress", async () => {
    const resolvers = new Map();
    const timers = [];
    let redresses = 0;
    const runtime = loadWebbingRuntime({
        KinkyDungeonPlayer: {},
        ForceRefreshModels() {},
        KinkyDungeonDressPlayer() {
            redresses += 1;
        },
        setTimeout(callback) {
            timers.push(callback);
        },
        kdpixitex: new Map(),
        KDTex() {},
        PIXI: {
            Assets: {
                load(texturePath) {
                    return new Promise((resolve) => resolvers.set(texturePath, resolve));
                },
            },
        },
    });
    const refresh = runtime.context.KDEventMapInventory.postApply.SpiderlingsRefreshModels;
    refresh({ trigger: "postApply" }, { name: "SpiderlingsWebbingLv2Arm" });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();

    assert.deepEqual(
        [...resolvers.keys()].sort(),
        ["Models/SpiderlingsWebbingLv2/ArmWebbing.png", ...displacementAssets].sort(),
    );
    assert.equal(timers.length, 0, "a mapped item must not schedule a redress ahead of texture decoding");
    resolvers.get("Models/SpiderlingsWebbingLv2/ArmWebbing.png")({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 0);
    resolvers.get(lv2ArmDisplacement)({});
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 1);
});

test("an equipped save waits for eager displacement decoding before its one corrective redress", async () => {
    const resolvers = new Map();
    let redresses = 0;
    const runtime = loadWebbingRuntime({
        KinkyDungeonPlayer: {},
        ForceRefreshModels() {},
        KinkyDungeonDressPlayer() {
            redresses += 1;
        },
        setTimeout() {},
        kdpixitex: new Map(),
        KDTex() {},
        PIXI: {
            Assets: {
                load(texturePath) {
                    return new Promise((resolve) => resolvers.set(texturePath, resolve));
                },
            },
        },
    });
    const afterDress = runtime.context.KDEventMapInventory.afterDress.SpiderlingsRefreshModels;
    afterDress({ trigger: "afterDress" }, { name: "SpiderlingsWebbingLv2Arm" });
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
    assert.equal(redresses, 0);

    for (const texturePath of displacementAssets) {
        resolvers.get(texturePath)({});
    }
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(redresses, 1);
});
