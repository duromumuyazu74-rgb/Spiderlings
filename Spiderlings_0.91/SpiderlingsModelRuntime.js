"use strict";

// Generic Spiderlings model loading and refresh support. Webbing models prefer
// the derived lossless atlas while retaining the unchanged direct PNGs as a
// compatibility fallback.
(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const REFRESH_EVENT = "SpiderlingsRefreshModels";
    const MODEL_CATEGORIES = new Set([
        "SpiderlingsWebbingLv1",
        "SpiderlingsWebbingLv2",
        "SpiderlingsWebbingLv3",
        "SpiderlingsWebbingCocoon",
    ]);
    const DISPLACEMENT_ASSETS = Object.freeze([
        "DisplacementMaps/SpiderlingsWebbingLv2ArmSquish.png",
        "DisplacementMaps/SpiderlingsWebbingLv2BellySquish.png",
        "DisplacementMaps/SpiderlingsWebbingLv2LegsSquish.png",
        "DisplacementMaps/SpiderlingsWebbingLv2AnklesSquish.png",
        "DisplacementMaps/SpiderlingsWebbingLv2FootSquish.png",
    ]);
    const WEBBING_ATLAS_FRAMES = Object.freeze([
        "Models/SpiderlingsWebbingLv1/ArmWebbing.png",
        "Models/SpiderlingsWebbingLv1/MittenLeft.png",
        "Models/SpiderlingsWebbingLv1/MittenRight.png",
        "Models/SpiderlingsWebbingLv1/Belly.png",
        "Models/SpiderlingsWebbingLv1/Legs.png",
        "Models/SpiderlingsWebbingLv1/Ankles.png",
        "Models/SpiderlingsWebbingLv1/Foot.png",
        "Models/SpiderlingsWebbingLv1/Blindfold.png",
        "Models/SpiderlingsWebbingLv1/Stuffing.png",
        "Models/SpiderlingsWebbingLv1/Gag.png",
        "Models/SpiderlingsWebbingLv2/ArmWebbing.png",
        "Models/SpiderlingsWebbingLv2/Belly.png",
        "Models/SpiderlingsWebbingLv2/Legs.png",
        "Models/SpiderlingsWebbingLv2/Ankles.png",
        "Models/SpiderlingsWebbingLv2/Foot.png",
        "Models/SpiderlingsWebbingLv3/ArmWebbing.png",
        "Models/SpiderlingsWebbingLv3/Belly.png",
        "Models/SpiderlingsWebbingLv3/Legs.png",
        "Models/SpiderlingsWebbingLv3/Ankles.png",
        "Models/SpiderlingsWebbingLv3/Foot.png",
        "Models/SpiderlingsWebbingLv3/Blindfold.png",
        "Models/SpiderlingsWebbingLv3/Gag.png",
        "Models/SpiderlingsWebbingLv3/Hood.png",
        "Models/SpiderlingsWebbingCocoon/Cocoon.png",
        "Models/SpiderlingsWebbingCocoon/OuterWebs.png",
    ]);
    const ATLAS_DEFINITIONS = Object.freeze([
        Object.freeze({
            path: "TextureAtlas/spiderlings-webbing-0.json",
            image: "TextureAtlas/spiderlings-webbing-0.png",
            frames: WEBBING_ATLAS_FRAMES,
        }),
        Object.freeze({
            path: "TextureAtlas/spiderlings-webbing-pink-0.json",
            image: "TextureAtlas/spiderlings-webbing-pink-0.png",
            frames: Object.freeze(
                WEBBING_ATLAS_FRAMES.map((path) => path.replace(/(SpiderlingsWebbing(?:Lv[123]|Cocoon))\//, "$1Pink/")),
            ),
        }),
    ]);
    const TEXTURE_ATLASES = Object.freeze(ATLAS_DEFINITIONS.map((atlas) => atlas.path));
    const texturePreloads = new Map();
    const textureLoads = new Map();
    const atlasLoads = new Map();
    let atlasReady;
    let displacementPreload;
    let displacementTexturesReady = false;
    let afterDressRefreshQueued = false;
    let refreshQueued = false;
    let pendingTextureRefreshes = 0;

    function modelDefs() {
        if (typeof ModelDefs != "undefined" && ModelDefs) return ModelDefs;
        if (typeof KDModelDefs != "undefined" && KDModelDefs) return KDModelDefs;
        return {};
    }

    function layers(model) {
        if (!model || !model.Layers) return [];
        return Array.isArray(model.Layers) ? model.Layers : Object.values(model.Layers);
    }

    function isOwnedModel(model) {
        return !!(
            model &&
            Array.isArray(model.Categories) &&
            model.Categories.some((category) => MODEL_CATEGORIES.has(category))
        );
    }

    function texturePaths(modelName) {
        const model = modelDefs()[modelName];
        if (!isOwnedModel(model)) return [];
        const result = new Set();
        for (const layer of layers(model)) {
            if (layer.DisplacementSprite && layer.DisplacementInvariant) {
                const displacementPath = `DisplacementMaps/${layer.DisplacementSprite}.png`;
                if (DISPLACEMENT_ASSETS.includes(displacementPath)) result.add(displacementPath);
            }
            const folder = layer.Folder || model.Folder;
            const sprite = layer.Sprite == null ? layer.Name : layer.Sprite;
            if (!folder || !sprite) continue;
            if (layer.Invariant || !layer.Poses || !Object.keys(layer.Poses).length) {
                result.add(`Models/${folder}/${sprite}.png`);
            }
        }
        return [...result];
    }

    function addTextureAlias(texture, key) {
        try {
            if (
                texture &&
                key &&
                typeof PIXI != "undefined" &&
                PIXI &&
                PIXI.Texture &&
                typeof PIXI.Texture.addToCache == "function"
            )
                PIXI.Texture.addToCache(texture, key);
        } catch (_error) {
            // Duplicate or unavailable Pixi aliases are harmless.
        }
    }

    function cacheTexture(fullPath, texture) {
        if (!fullPath || !texture) return;
        addTextureAlias(texture, fullPath);
        if (fullPath.startsWith("Models/")) addTextureAlias(texture, fullPath.slice("Models/".length));
        try {
            if (typeof KDModFiles != "undefined" && KDModFiles && KDModFiles[fullPath]) {
                addTextureAlias(texture, KDModFiles[fullPath]);
            }
            if (typeof kdpixitex != "undefined" && kdpixitex && typeof kdpixitex.set == "function") {
                kdpixitex.set(fullPath, texture);
            }
        } catch (_error) {
            // KD caches may not exist during early load or in headless tests.
        }
    }

    function cacheAtlasResult(result) {
        const sheets = [result, ...Object.values((result && result.linkedSheets) || {})];
        for (const sheet of sheets) {
            for (const [name, texture] of Object.entries((sheet && sheet.textures) || {})) cacheTexture(name, texture);
        }
        return result;
    }

    function modFileUrl(runtimePath) {
        try {
            if (typeof KDModFiles != "undefined" && KDModFiles && KDModFiles[runtimePath])
                return KDModFiles[runtimePath];
        } catch (_error) {
            // The logical path remains a valid fallback outside a loaded mod zip.
        }
        return runtimePath;
    }

    function validateAtlasData(atlasPath, atlasData) {
        const definition = ATLAS_DEFINITIONS.find((atlas) => atlas.path === atlasPath);
        const expectedImage = definition.image.slice(definition.image.lastIndexOf("/") + 1);
        const frameNames = Object.keys((atlasData && atlasData.frames) || {});
        if (JSON.stringify(frameNames) != JSON.stringify(definition.frames))
            throw new Error(`Unexpected Spiderlings atlas frames in ${atlasPath}`);
        if (
            !atlasData.meta ||
            atlasData.meta.image != expectedImage ||
            atlasData.meta.scale != "1" ||
            atlasData.meta.related_multi_packs !== undefined
        )
            throw new Error(`Unexpected Spiderlings atlas metadata in ${atlasPath}`);
        for (const frameName of definition.frames) {
            const entry = atlasData.frames[frameName];
            if (
                !entry ||
                entry.rotated !== false ||
                entry.trimmed !== true ||
                !entry.frame ||
                !entry.sourceSize ||
                !entry.spriteSourceSize
            ) {
                throw new Error(`Invalid Spiderlings atlas frame ${frameName}`);
            }
        }
    }

    function validateParsedAtlas(atlasPath, sheet) {
        const definition = ATLAS_DEFINITIONS.find((atlas) => atlas.path === atlasPath);
        for (const frameName of definition.frames) {
            const texture = sheet && sheet.textures && sheet.textures[frameName];
            if (!texture || !texture.baseTexture)
                throw new Error(`Parsed Spiderlings atlas ${atlasPath} is missing ${frameName}`);
        }
    }

    async function parseAtlas(atlasPath) {
        const definition = ATLAS_DEFINITIONS.find((atlas) => atlas.path === atlasPath);
        if (
            typeof PIXI == "undefined" ||
            !PIXI ||
            !PIXI.settings ||
            !PIXI.settings.ADAPTER ||
            typeof PIXI.settings.ADAPTER.fetch != "function" ||
            !PIXI.Assets ||
            typeof PIXI.Assets.load != "function" ||
            typeof PIXI.Spritesheet != "function"
        )
            return null;
        if (typeof KDModFiles == "undefined" || !KDModFiles || !KDModFiles[atlasPath] || !KDModFiles[definition.image])
            return null;
        const response = await PIXI.settings.ADAPTER.fetch(modFileUrl(atlasPath));
        if (!response || typeof response.json != "function")
            throw new Error(`Unable to read Spiderlings atlas ${atlasPath}`);
        if (response.ok === false)
            throw new Error(`Unable to fetch Spiderlings atlas ${atlasPath}: ${response.status}`);
        const atlasData = await response.json();
        validateAtlasData(atlasPath, atlasData);
        const imageTexture = await PIXI.Assets.load({
            src: definition.image,
            format: "png",
            loadParser: "modTextureLoader",
            data: { scaleMode: PIXI.SCALE_MODES && PIXI.SCALE_MODES.LINEAR },
        });
        const baseTexture = imageTexture && (imageTexture.baseTexture || imageTexture);
        if (!baseTexture) throw new Error(`Unable to load Spiderlings atlas image ${definition.image}`);
        const sheet = new PIXI.Spritesheet(baseTexture, atlasData, atlasPath);
        try {
            if (sheet && typeof sheet.parse == "function") await sheet.parse();
            validateParsedAtlas(atlasPath, sheet);
            return cacheAtlasResult(sheet);
        } catch (error) {
            if (sheet && typeof sheet.destroy == "function") sheet.destroy(false);
            throw error;
        }
    }

    function loadAtlas(atlasPath) {
        if (atlasLoads.has(atlasPath)) return atlasLoads.get(atlasPath);
        let promise;
        try {
            promise = Promise.resolve(parseAtlas(atlasPath)).catch((error) => {
                try {
                    if (typeof console != "undefined" && console && typeof console.warn == "function") {
                        console.warn(
                            `[Spiderlings] Webbing atlas failed; using direct PNG fallback: ${atlasPath}`,
                            error,
                        );
                    }
                } catch (_warningError) {
                    // Diagnostics must never prevent direct fallback.
                }
                return null;
            });
        } catch (_error) {
            promise = Promise.resolve(null);
        }
        atlasLoads.set(atlasPath, promise);
        return promise;
    }

    function loadTextureAtlases() {
        if (!atlasReady) atlasReady = Promise.all(TEXTURE_ATLASES.map(loadAtlas));
        return atlasReady;
    }

    function hasTexture(texturePath) {
        const ready = (texture) =>
            !!(texture && texture.baseTexture && texture.valid !== false && texture.baseTexture.valid !== false);
        try {
            if (
                typeof kdpixitex != "undefined" &&
                kdpixitex &&
                typeof kdpixitex.get == "function" &&
                ready(kdpixitex.get(texturePath))
            )
                return true;
            if (typeof PIXI != "undefined" && PIXI && PIXI.utils && PIXI.utils.TextureCache) {
                if (ready(PIXI.utils.TextureCache[texturePath])) return true;
                if (
                    typeof KDModFiles != "undefined" &&
                    KDModFiles &&
                    KDModFiles[texturePath] &&
                    ready(PIXI.utils.TextureCache[KDModFiles[texturePath]])
                )
                    return true;
            }
        } catch (_error) {
            // Cache lookup is an optimization only.
        }
        return false;
    }

    function loadTexture(texturePath, foreground) {
        if (textureLoads.has(texturePath)) return textureLoads.get(texturePath);
        try {
            if (typeof KDTex == "function") KDTex(texturePath, false);
        } catch (_error) {
            // Pixi may not be initialized yet; Assets below remains the loader.
        }
        let loader;
        try {
            if (typeof PIXI != "undefined" && PIXI && PIXI.Assets) {
                // backgroundLoad only acknowledges queuing in Pixi 7.2.1.
                // Every caller uses this promise as a rendering readiness gate.
                loader = typeof PIXI.Assets.load == "function" ? PIXI.Assets.load.bind(PIXI.Assets) : undefined;
            }
        } catch (_error) {
            loader = undefined;
        }
        let promise;
        try {
            // KD 5.4's resolver turns a logical PNG into an extensionless blob.
            // Select the parser explicitly, as for the atlas image above.
            const asset =
                modFileUrl(texturePath) !== texturePath
                    ? {
                          src: texturePath,
                          format: "png",
                          loadParser: "modTextureLoader",
                          data: { scaleMode: PIXI.SCALE_MODES && PIXI.SCALE_MODES.LINEAR },
                      }
                    : texturePath;
            promise = loader
                ? Promise.resolve(loader(asset)).then(
                      (texture) => {
                          // KDTex may have cached Texture.from(blob) before it was ready.
                          // Publish the decoded Assets texture before forcing a redraw.
                          if (texture && texture.baseTexture) cacheTexture(texturePath, texture);
                          return !!texture;
                      },
                      () => false,
                  )
                : Promise.resolve(false);
        } catch (_error) {
            promise = Promise.resolve(false);
        }
        promise = promise.then((loaded) => {
            if (!loaded) textureLoads.delete(texturePath);
            return loaded;
        });
        textureLoads.set(texturePath, promise);
        return promise;
    }

    function preloadDisplacementTextures(foreground = false) {
        if (!displacementPreload) {
            displacementPreload = Promise.all(DISPLACEMENT_ASSETS.map((entry) => loadTexture(entry, foreground))).then(
                (result) => {
                    displacementTexturesReady = result.every(Boolean);
                    if (!displacementTexturesReady) displacementPreload = undefined;
                    return result;
                },
            );
        }
        return displacementPreload;
    }

    function preloadTextures(modelName, foreground = false) {
        if (!modelName) return Promise.resolve([]);
        const key = `${modelName}:${webbingColor()}:${foreground ? "foreground" : "background"}`;
        if (texturePreloads.has(key)) return texturePreloads.get(key);
        const paths = texturePaths(modelName);
        const promise = loadTextureAtlases()
            .then(() =>
                Promise.all(
                    paths
                        .filter(
                            (entry) =>
                                DISPLACEMENT_ASSETS.includes(entry) || textureLoads.has(entry) || !hasTexture(entry),
                        )
                        .map((entry) => loadTexture(entry, foreground)),
                ),
            )
            .then((result) => {
                if (result.some((loaded) => !loaded)) texturePreloads.delete(key);
                return result;
            });
        texturePreloads.set(key, promise);
        return promise;
    }

    function webbingColor() {
        return api.getSetting && api.getSetting("spiderlingsPinkWebbing") === true ? "pink" : "original";
    }

    // Select delivered colors at draw time so existing sprites follow the setting.
    // Enemy and spell identities remain unchanged, including saved entities.
    function registerColoredArtwork() {
        if (typeof KDDraw != "function" || KDDraw.spiderlingsColoredArtwork) return;
        const nativeDraw = KDDraw;
        const root = typeof KinkyDungeonRootDirectory == "string" ? KinkyDungeonRootDirectory : "";
        const paths = new Map(
            [
                ...["SpiderWeb", "SpiderWebHit", "WebSpray", "WebSprayTrail"].map((name) => `Bullets/${name}`),
                ...["Spinner", "Tunneler", "WebCaster", "NestEntrance"].map((name) => `Enemies/${name}`),
            ].map((path) => [`${root}${path}.png`, `${root}${path}Pink.png`]),
        );
        KDDraw = function (...args) {
            if (paths.has(args[3]) && webbingColor() === "pink") args[3] = paths.get(args[3]);
            return nativeDraw.apply(this, args);
        };
        KDDraw.spiderlingsColoredArtwork = true;
    }

    // Both atlases are preloaded at startup into independent color aliases.
    // Switching folders reuses them without loading per-item PNGs on each hit.
    function syncWebbingColor() {
        let changed = false;
        const pink = webbingColor() === "pink";
        const apply = (model) => {
            if (!isOwnedModel(model)) return;
            for (const entry of [model, ...layers(model)]) {
                if (!entry.Folder) continue;
                const base = entry.Folder.replace(/Pink$/, "");
                if (MODEL_CATEGORIES.has(base)) {
                    const folder = base + (pink ? "Pink" : "");
                    if (entry.Folder !== folder) {
                        entry.Folder = folder;
                        changed = true;
                    }
                }
            }
        };
        Object.values(modelDefs()).forEach(apply);
        const player = typeof KinkyDungeonPlayer != "undefined" ? KinkyDungeonPlayer : undefined;
        for (const item of (player && player.Appearance) || []) apply(item.Model);
        const container = player && typeof KDCurrentModels != "undefined" && KDCurrentModels.get(player);
        if (container && container.Models) for (const model of container.Models.values()) apply(model);
        return changed;
    }

    function applyWebbingColor(refresh = false) {
        syncWebbingColor();
        const player = typeof KinkyDungeonPlayer != "undefined" ? KinkyDungeonPlayer : undefined;
        if (refresh) {
            refreshPlayerModel(true);
            const names = new Set(
                ((player && player.Appearance) || [])
                    .filter((item) => isOwnedModel(item.Model))
                    .map((item) => item.Model.Name),
            );
            return Promise.all([...names].map((name) => preloadTextures(name, true))).then(() =>
                refreshPlayerModel(false),
            );
        }
        return Promise.resolve();
    }

    function modelNameForItem(item) {
        if (
            !item ||
            !item.name ||
            typeof KinkyDungeonRestraints == "undefined" ||
            !Array.isArray(KinkyDungeonRestraints)
        )
            return undefined;
        const restraint = KinkyDungeonRestraints.find((entry) => entry.name == item.name);
        return restraint && restraint.Model;
    }

    function refreshPlayerModel(redress) {
        const player = typeof KinkyDungeonPlayer != "undefined" ? KinkyDungeonPlayer : undefined;
        if (!player) return;
        if (typeof ForceRefreshModels == "function") ForceRefreshModels(player);
        if (
            typeof KDRefreshCharacter != "undefined" &&
            KDRefreshCharacter &&
            typeof KDRefreshCharacter.set == "function"
        ) {
            KDRefreshCharacter.set(player, true);
        }
        if (typeof KDRefresh != "undefined") KDRefresh = true;
        if (typeof KinkyDungeonPlayerNeedsRefresh != "undefined") KinkyDungeonPlayerNeedsRefresh = true;
        if (redress && typeof KinkyDungeonDressPlayer == "function") KinkyDungeonDressPlayer(undefined, false, true);
    }

    function refreshPlayerModelSoon(item) {
        refreshPlayerModel(false);
        const modelName = modelNameForItem(item);
        const preload = modelName ? preloadTextures(modelName) : null;
        if (preload && typeof preload.then == "function") {
            pendingTextureRefreshes += 1;
            const settle = () => {
                pendingTextureRefreshes = Math.max(0, pendingTextureRefreshes - 1);
                if (!pendingTextureRefreshes) refreshPlayerModel(true);
            };
            preload.then(settle, settle);
        } else if (typeof setTimeout == "function" && !refreshQueued) {
            refreshQueued = true;
            setTimeout(() => {
                refreshQueued = false;
                refreshPlayerModel(true);
            }, 0);
        }
    }

    function addInventoryEvent(trigger, handler) {
        if (typeof KDAddEvent == "function") KDAddEvent(KDEventMapInventory, trigger, REFRESH_EVENT, handler);
        else {
            KDEventMapInventory[trigger] = KDEventMapInventory[trigger] || {};
            KDEventMapInventory[trigger][REFRESH_EVENT] = handler;
        }
    }

    function registerRefreshEvent() {
        if (typeof KDEventMapInventory == "undefined") return false;
        for (const trigger of ["postApply", "postRemoval", "afterDress"]) {
            addInventoryEvent(trigger, (event, item) => {
                if (event && event.trigger == "afterDress") {
                    // Native dressing already refreshes its models. Invalidate only
                    // when a restored copy actually needed its color corrected.
                    if (syncWebbingColor()) refreshPlayerModel(false);
                    if (!displacementTexturesReady && !afterDressRefreshQueued) {
                        afterDressRefreshQueued = true;
                        preloadDisplacementTextures().then(() => {
                            afterDressRefreshQueued = false;
                            if (displacementTexturesReady) refreshPlayerModel(true);
                        });
                    }
                } else refreshPlayerModelSoon(item);
            });
        }
        return true;
    }

    api.loadSpiderlingsTextureAtlases = loadTextureAtlases;
    api.applyWebbingColor = applyWebbingColor;
    api.preloadSpiderlingsDisplacementTextures = preloadDisplacementTextures;
    api.preloadSpiderlingsTextures = preloadTextures;
    api.refreshSpiderlingsPlayerModelSoon = refreshPlayerModelSoon;
    api.registerSpiderlingsRefreshEvent = registerRefreshEvent;
    api.ModelRuntime = Object.freeze({
        MODEL_CATEGORIES: Object.freeze([...MODEL_CATEGORIES]),
        TEXTURE_ATLASES,
        DISPLACEMENT_ASSETS,
    });

    registerColoredArtwork();
    loadTextureAtlases();
    preloadDisplacementTextures();
    registerRefreshEvent();
})();
