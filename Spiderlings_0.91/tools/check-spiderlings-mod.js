"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const zlib = require("node:zlib");
const { parseReleaseVersion } = require("./release-version.js");

const modRoot = path.resolve(__dirname, "..");
const workspaceRoot = path.resolve(modRoot, "..");
const gameRoot = path.join(workspaceRoot, "KinkiestDungeon-5.5");
const agentsPath = path.join(workspaceRoot, "AGENTS.md");
const modAgentsPath = path.join(modRoot, "AGENTS.md");
const maintenancePath = path.join(modRoot, "MAINTENANCE.md");
const watcherPath = path.join(modRoot, "tools", "watch-spiderlings-mod.ps1");
const localeFiles = ["CN", "DE", "ES", "JP", "KR", "PL", "RU"].map((locale) => `Spiderlings${locale}.csv`);
const runtimeScripts = [
    "SpiderlingsCore.js",
    "SpiderlingsEncounters.js",
    "SpiderlingsWebCaster.js",
    "SpiderlingsModelRuntime.js",
    "Spiderlings.js",
    "SpiderlingsInfestation.js",
    "SpiderlingsCombat.js",
    "SpiderlingsJumperDash.js",
    "SpiderlingsWebbingModels.js",
    "SpiderlingsWebbingData.js",
    "SpiderlingsWebbingRules.js",
    "SpiderlingsWebbing.js",
    "SpiderlingsSpinnerTopology.js",
    "SpiderlingsSpinnerArt.js",
    "SpiderlingsSpinnerCapture.js",
    "SpiderlingsSpinnerRecoveryCore.js",
    "SpiderlingsSpinnerNPCCapture.js",
    "SpiderlingsSpinnerField.js",
    "SpiderlingsSpinnerNativeField.js",
    "SpiderlingsSpinnerRecovery.js",
    "SpiderlingsSpinnerNPCRecovery.js",
    "SpiderlingsSpinnerAI.js",
    "SpiderlingsSpinnerScenarios.js",
    "SpiderlingsSpinnerRuntime.js",
];
const atlasAssets = [
    "TextureAtlas/spiderlings-webbing-0.png",
    "TextureAtlas/spiderlings-webbing-0.json",
    "TextureAtlas/spiderlings-webbing-pink-0.png",
    "TextureAtlas/spiderlings-webbing-pink-0.json",
];
const displacementAssets = [
    "DisplacementMaps/SpiderlingsWebbingLv2ArmSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2BellySquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2LegsSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2AnklesSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2FootSquish.png",
];
const soundAssets = [
    "Sounds/webs-sweep-away-by-hand-001_01.ogg",
    "Sounds/webs-sweep-away-by-hand-002_01.ogg",
    "Sounds/webs-sweep-away-by-hand-003_01.ogg",
    "Sounds/webs-sweep-away-by-hand-004_01.ogg",
];
const runtimeAssets = [
    "UI/MapMod/SpiderlingsInfestation.png",
    "Bullets/SpiderWeb.png",
    "Bullets/SpiderWebHit.png",
    "Bullets/WebSpray.png",
    "Bullets/WebSprayTrail.png",
    "Bullets/SpiderWebPink.png",
    "Bullets/SpiderWebHitPink.png",
    "Bullets/WebSprayPink.png",
    "Bullets/WebSprayTrailPink.png",
    "Enemies/Jumper.png",
    "Enemies/NestEntrance.png",
    "Enemies/Spinner.png",
    "Enemies/Tunneler.png",
    "Enemies/WebCaster.png",
    "Enemies/NestEntrancePink.png",
    "Enemies/SpinnerPink.png",
    "Enemies/TunnelerPink.png",
    "Enemies/WebCasterPink.png",
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
    "Models/SpiderlingsWebbingLv1Pink/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv1Pink/MittenLeft.png",
    "Models/SpiderlingsWebbingLv1Pink/MittenRight.png",
    "Models/SpiderlingsWebbingLv1Pink/Belly.png",
    "Models/SpiderlingsWebbingLv1Pink/Legs.png",
    "Models/SpiderlingsWebbingLv1Pink/Ankles.png",
    "Models/SpiderlingsWebbingLv1Pink/Foot.png",
    "Models/SpiderlingsWebbingLv1Pink/Blindfold.png",
    "Models/SpiderlingsWebbingLv1Pink/Stuffing.png",
    "Models/SpiderlingsWebbingLv1Pink/Gag.png",
    "Models/SpiderlingsWebbingLv2Pink/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv2Pink/Belly.png",
    "Models/SpiderlingsWebbingLv2Pink/Legs.png",
    "Models/SpiderlingsWebbingLv2Pink/Ankles.png",
    "Models/SpiderlingsWebbingLv2Pink/Foot.png",
    "Models/SpiderlingsWebbingLv3Pink/ArmWebbing.png",
    "Models/SpiderlingsWebbingLv3Pink/Belly.png",
    "Models/SpiderlingsWebbingLv3Pink/Legs.png",
    "Models/SpiderlingsWebbingLv3Pink/Ankles.png",
    "Models/SpiderlingsWebbingLv3Pink/Foot.png",
    "Models/SpiderlingsWebbingLv3Pink/Blindfold.png",
    "Models/SpiderlingsWebbingLv3Pink/Gag.png",
    "Models/SpiderlingsWebbingLv3Pink/Hood.png",
    "Models/SpiderlingsWebbingCocoonPink/Cocoon.png",
    "Models/SpiderlingsWebbingCocoonPink/OuterWebs.png",
    "Models/SpiderlingsSpinnerLegbinder/Band.png",
    "Models/SpiderlingsSpinnerLegbinder/Tail.png",
    "Models/SpiderlingsSpinnerLegbinder/Finished.png",
    "Models/SpiderlingsSpinnerLegbinder/Closure.png",
    ...displacementAssets,
    ...atlasAssets,
    ...soundAssets,
];
const families = [
    { family: "Arm", group: "ItemArms", asset: "ArmWebbing.png" },
    { family: "MittenLeft", group: "ItemHands", asset: "MittenLeft.png" },
    { family: "MittenRight", group: "ItemHands", asset: "MittenRight.png" },
    { family: "Belly", group: "ItemTorso", asset: "Belly.png" },
    { family: "Legs", group: "ItemLegs", asset: "Legs.png" },
    { family: "Ankles", group: "ItemFeet", asset: "Ankles.png" },
    { family: "Foot", group: "ItemBoots", asset: "Foot.png" },
    { family: "Blindfold", group: "ItemHead", asset: "Blindfold.png" },
    { family: "Stuffing", group: "ItemMouth", asset: "Stuffing.png" },
    { family: "Gag", group: "ItemMouth", asset: "Gag.png" },
].map((entry) => ({
    ...entry,
    id: `SpiderlingsWebbingLv1${entry.family}`,
    model: `SpiderlingsWebbingLv1${entry.family}Model`,
    path: `Models/SpiderlingsWebbingLv1/${entry.asset}`,
}));
const lv2Families = [
    { family: "Arm", group: "ItemArms", asset: "ArmWebbing.png" },
    { family: "Belly", group: "ItemTorso", asset: "Belly.png" },
    { family: "Legs", group: "ItemLegs", asset: "Legs.png" },
    { family: "Ankles", group: "ItemFeet", asset: "Ankles.png" },
    { family: "Foot", group: "ItemBoots", asset: "Foot.png" },
].map((entry) => ({
    ...entry,
    id: `SpiderlingsWebbingLv2${entry.family}`,
    model: `SpiderlingsWebbingLv2${entry.family}Model`,
    path: `Models/SpiderlingsWebbingLv2/${entry.asset}`,
}));
const cocoon = {
    id: "SpiderlingsWebbingCocoon",
    model: "SpiderlingsWebbingCocoonModel",
    path: "Models/SpiderlingsWebbingCocoon/Cocoon.png",
};
const lv3Families = [
    { family: "Arm", group: "ItemArms", asset: "ArmWebbing.png", layer: "WrappingChest", priority: 52 },
    { family: "Belly", group: "ItemTorso", asset: "Belly.png", layer: "WrappingTorsoLower", priority: 52 },
    { family: "Legs", group: "ItemLegs", asset: "Legs.png", layer: "OverSkirtDeco", priority: 52 },
    { family: "Ankles", group: "ItemFeet", asset: "Ankles.png", layer: "OverSkirtDeco", priority: 52 },
    { family: "Foot", group: "ItemBoots", asset: "Foot.png", layer: "WrappingLegs", priority: 52 },
    { family: "Blindfold", group: "ItemHead", asset: "Blindfold.png", layer: "Blindfold", priority: 52 },
    { family: "Gag", group: "ItemMouth", asset: "Gag.png", layer: "GagMuzzle", priority: 52 },
    { family: "Hood", group: "ItemHead", asset: "Hood.png", layer: "Hood", priority: 52 },
].map((entry) => ({
    ...entry,
    id: `SpiderlingsWebbingLv3${entry.family}`,
    model: `SpiderlingsWebbingLv3${entry.family}Model`,
    path: `Models/SpiderlingsWebbingLv3/${entry.asset}`,
}));
const legacyRestraints = [
    "WebArms",
    "WebArms2",
    "WebLegs",
    "WebLegs2",
    "WebAnkle",
    "WebFeet",
    "WebGag",
    "WebBlindfold",
    "LooseWebbing",
    "WebBelly",
    "WebGagStuffing",
    "WebGagCleave",
    "WebGagFull",
    "WebFaceGag",
    "WebHandLeft",
    "WebHandRight",
    "LooseWebbingCocoon1",
    "LooseWebbingCocoon2",
    "LooseWebbingCocoon3",
    "LooseWebbingCocoon4",
    "LooseWebbingCocoon5",
];
const legacyModels = [
    "SpiderlingsWebBlindfold",
    "SpiderlingsWebFace",
    "SpiderlingsWebGagStuffing",
    "SpiderlingsWebGagFull",
    "SpiderlingsWebGagWrap",
    "SpiderlingsWebGagFullOver",
    "SpiderlingsWebGagWrapOver",
    "SpiderlingsWebGagCleave",
    "SpiderlingsWebArms",
    "SpiderlingsWebLegs",
    "SpiderlingsWebHeavyBoots",
    "SpiderlingsWebHeavyAnkles",
    "SpiderlingsWebHeavyLegs",
    "SpiderlingsWebHeavyBottom",
    "SpiderlingsWebHeavyBottomFull",
    "SpiderlingsWebBelly",
    "SpiderlingsWebHeavyArms",
    "SpiderlingsWebHeavyHandLeft",
    "SpiderlingsWebHeavyHandRight",
    "SpiderlingsWebHeavyHands",
    "SpiderlingsLooseWebbing",
    "SpiderlingsLooseWebbingCocoon1",
    "SpiderlingsLooseWebbingCocoon2",
    "SpiderlingsLooseWebbingCocoon3",
    "SpiderlingsLooseWebbingCocoon4",
    "SpiderlingsLooseWebbingCocoon5",
];
const legacyPaths = [
    "SpiderlingsLooseWebbing.js",
    "SpiderlingsWebHeavyModels.js",
    "Models/SpiderlingsWebHeavy",
    "Models/SpiderlingsWebbingCocoonPlaceholder",
    "Models/SpiderlingsWebbingDebug/TestPlaceholder.png",
    "Models/SpiderlingsWebbingLv2/MittenLeft.png",
    "Models/SpiderlingsWebbingLv2/MittenRight.png",
    "Models/SpiderlingsWebbingLv2/Stuffing.png",
    "Models/SpiderlingsWebbingLv2/Gag.png",
    "Models/GagTape",
    "Models/Blindfold/Tape-spiderlings.png",
    "DisplacementMaps/SpiderlingsWebbingLv1BellySquish.png",
    "DisplacementMaps/TapeAnklesSquishClosed.png",
    "TextureAtlas/spiderlings-0.json",
    "TextureAtlas/spiderlings-0.png",
    "TextureAtlas/spiderlings-1.json",
    "TextureAtlas/spiderlings-1.png",
    "TextureAtlas/spiderlings-2.json",
    "TextureAtlas/spiderlings-2.png",
    "tools/adapt-spiderlings-hand-sprites.py",
    "tools/tests/spiderlings-silk-progression.test.js",
];

const errors = [];
const warnings = [];
const notes = [];

function pass(message) {
    console.log(`[ok] ${message}`);
}
function fail(message) {
    errors.push(message);
    console.error(`[fail] ${message}`);
}
function note(message) {
    notes.push(message);
    console.log(`[info] ${message}`);
}
function readText(file) {
    return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
}
function readModText(relativePath) {
    return readText(path.join(modRoot, relativePath));
}
function exists(relativePath) {
    return fs.existsSync(path.join(modRoot, relativePath));
}
function plain(value) {
    return JSON.parse(JSON.stringify(value));
}
function layers(model) {
    return model && model.Layers ? (Array.isArray(model.Layers) ? model.Layers : Object.values(model.Layers)) : [];
}

function walkNames(directory, relativeRoot) {
    if (!fs.existsSync(directory)) return [];
    const result = [];
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const relativePath = `${relativeRoot}/${entry.name}`;
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) result.push(...walkNames(fullPath, relativePath));
        else result.push(relativePath);
    }
    return result;
}

function parseCsv(relativePath) {
    const result = new Map();
    for (const rawLine of readModText(relativePath).split(/\r?\n/)) {
        if (!rawLine || rawLine.startsWith("#")) continue;
        const comma = rawLine.indexOf(",");
        if (comma > 0) result.set(rawLine.slice(0, comma), rawLine.slice(comma + 1));
    }
    return result;
}

function checkProjectInputs() {
    if (!fs.existsSync(gameRoot) || fs.realpathSync(gameRoot) === fs.realpathSync(modRoot)) {
        fail("KinkiestDungeon-5.5 must remain a separate read-only reference package.");
    } else pass("KinkiestDungeon-5.5 and Spiderlings package boundaries are separate.");
    for (const file of [
        agentsPath,
        modAgentsPath,
        maintenancePath,
        watcherPath,
        path.join(workspaceRoot, "CONTRIBUTING.md"),
        path.join(workspaceRoot, "docs/DEVELOPMENT.md"),
        path.join(__dirname, "run-spiderlings-tests.js"),
        path.join(__dirname, "test-suites.json"),
    ]) {
        if (!fs.existsSync(file) || !fs.statSync(file).isFile()) fail(`Missing maintenance entry point: ${file}`);
    }
}

function loadManifest() {
    let manifest;
    try {
        manifest = JSON.parse(readModText("mod.json"));
    } catch (error) {
        fail(`mod.json is invalid: ${error.message}`);
        return undefined;
    }
    if (manifest.modname !== "Spiderlings") fail("mod.json modname must be Spiderlings.");
    if (!manifest.moddesc || !manifest.modbuild) fail("mod.json must include moddesc and modbuild.");
    try {
        const release = parseReleaseVersion(manifest.modbuild);
        pass(`Release ${release.version}: ${release.channel} build, baseline ${release.baseline}.`);
    } catch (error) {
        fail(error.message);
    }
    if (manifest.gamemajor !== 5 || manifest.gameminor !== 4)
        fail("mod.json must retain the 5.4/5.5 compatibility window.");
    const expected = [...runtimeAssets, ...runtimeScripts];
    if (JSON.stringify(manifest.fileorder) !== JSON.stringify(expected))
        fail("mod.json fileorder is not the exact atlas-first/direct-fallback allowlist.");
    for (const relativePath of expected) if (!exists(relativePath)) fail(`manifest entry is missing: ${relativePath}`);
    if (!errors.some((message) => message.startsWith("mod.json") || message.startsWith("manifest")))
        pass("mod.json contains only the atlas-first assets, direct fallbacks, and runtime modules.");
    return manifest;
}

function checkRuntimeTrees() {
    const actual = [
        ...walkNames(path.join(modRoot, "UI"), "UI"),
        ...walkNames(path.join(modRoot, "Models"), "Models"),
        ...walkNames(path.join(modRoot, "Enemies"), "Enemies"),
        ...walkNames(path.join(modRoot, "Bullets"), "Bullets"),
        ...walkNames(path.join(modRoot, "DisplacementMaps"), "DisplacementMaps"),
        ...walkNames(path.join(modRoot, "TextureAtlas"), "TextureAtlas"),
        ...walkNames(path.join(modRoot, "Sounds"), "Sounds"),
    ]
        .filter((entry) => /\.(png|json|wav|ogg)$/i.test(entry))
        .sort();
    const expected = [...runtimeAssets].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        const missing = expected.filter((entry) => !actual.includes(entry));
        const extra = actual.filter((entry) => !expected.includes(entry));
        if (missing.length) fail(`runtime asset paths missing: ${missing.join(", ")}`);
        if (extra.length) fail(`runtime asset paths outside allowlist: ${extra.join(", ")}`);
    } else pass(`runtime tree contains exactly ${expected.length} allowlisted atlas-first/direct-fallback assets.`);

    for (const relativePath of legacyPaths)
        if (exists(relativePath)) fail(`retired path still exists: ${relativePath}`);
    if (!errors.some((message) => /retired path|runtime asset paths/.test(message)))
        pass(
            "legacy scripts, model trees, retired displacement maps, atlas pages, and old progression test are absent.",
        );

    // DSmap exports are cropped. checkRuntime verifies their native canvas
    // offsets and shared Lv2/Lv3 routing; do not require full-canvas PNGs here.
}

function checkOfficialSkirtBoundary() {
    const defs = readText(path.join(gameRoot, "Data", "Defs.ts"));
    const baseMatch = defs.match(/let LAYERS_BASE = \[([\s\S]*?)\n\];/);
    const orderedLayers = baseMatch ? [...baseMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]) : [];
    const lv1LegsIndex = orderedLayers.indexOf("WrappingLegsOver");
    const outerLegsIndex = orderedLayers.indexOf("OverSkirtDeco");
    if (
        outerLegsIndex < 0 ||
        ["OverSkirt", "SkirtOverDeco", "SkirtOver", "SkirtDeco", "Skirt"].some(
            (layer) => orderedLayers.indexOf(layer) <= outerLegsIndex,
        )
    )
        fail("outer Legs must use the uppermost standing skirt slot.");
    const skirtLayers = ["OverSkirtDeco", "OverSkirt", "SkirtOverDeco", "SkirtOver", "SkirtDeco", "Skirt"];
    if (
        lv1LegsIndex < 0 ||
        skirtLayers.some((layer) => orderedLayers.indexOf(layer) < 0 || orderedLayers.indexOf(layer) >= lv1LegsIndex)
    ) {
        fail("KD 5.5 official layer order no longer places every standing skirt layer above WrappingLegsOver.");
    } else pass("KD 5.5 places OverSkirt, SkirtOver, and Skirt above the Lv1 Legs WrappingLegsOver boundary.");
}

function checkTextureAtlas(pink = false) {
    const initialErrorCount = errors.length;
    const atlasJsonPath = atlasAssets[pink ? 3 : 1];
    const atlasPngPath = atlasAssets[pink ? 2 : 0];
    const builderPath = "tools/build-spiderlings-atlas.py";
    const expectedFrames = [...families, ...lv2Families, ...lv3Families]
        .map((entry) => entry.path)
        .concat(cocoon.path, "Models/SpiderlingsWebbingCocoon/OuterWebs.png")
        .map((path) => (pink ? path.replace(/(SpiderlingsWebbing(?:Lv[123]|Cocoon))\//, "$1Pink/") : path));
    let atlas;
    try {
        atlas = JSON.parse(readModText(atlasJsonPath));
    } catch (error) {
        fail(`${atlasJsonPath} is invalid: ${error.message}`);
        return;
    }

    if (!exists(atlasPngPath)) fail(`${atlasPngPath} is missing.`);
    const frameNames = Object.keys(atlas.frames || {});
    if (JSON.stringify(frameNames) !== JSON.stringify(expectedFrames))
        fail(`${atlasJsonPath} does not contain the exact twenty-five Webbing frame aliases.`);
    if (
        !atlas.meta ||
        atlas.meta.image !== path.basename(atlasPngPath) ||
        atlas.meta.format !== "RGBA8888" ||
        atlas.meta.scale !== "1" ||
        atlas.meta.related_multi_packs !== undefined ||
        !atlas.meta.size ||
        atlas.meta.size.w !== 4096 ||
        atlas.meta.size.h !== 4096
    ) {
        fail(`${atlasJsonPath} metadata is not the exact single-page 4096 contract.`);
    }

    const rectangles = [];
    for (const frameName of expectedFrames) {
        const entry = atlas.frames && atlas.frames[frameName];
        const frame = entry && entry.frame;
        const source = entry && entry.sourceSize;
        const sprite = entry && entry.spriteSourceSize;
        if (!entry || entry.rotated !== false || entry.trimmed !== true || !frame || !source || !sprite) {
            fail(`${atlasJsonPath} frame metadata is incomplete: ${frameName}`);
            continue;
        }
        const integers = [
            frame.x,
            frame.y,
            frame.w,
            frame.h,
            source.w,
            source.h,
            sprite.x,
            sprite.y,
            sprite.w,
            sprite.h,
        ];
        if (
            !integers.every(Number.isInteger) ||
            frame.x < 0 ||
            frame.y < 0 ||
            frame.w <= 0 ||
            frame.h <= 0 ||
            source.w <= 0 ||
            source.h <= 0 ||
            sprite.x < 0 ||
            sprite.y < 0 ||
            sprite.w !== frame.w ||
            sprite.h !== frame.h ||
            frame.x + frame.w > 4096 ||
            frame.y + frame.h > 4096 ||
            sprite.x + sprite.w > source.w ||
            sprite.y + sprite.h > source.h
        ) {
            fail(`${atlasJsonPath} frame/source bounds are invalid: ${frameName}`);
            continue;
        }
        rectangles.push({ name: frameName, ...frame });
    }
    for (let left = 0; left < rectangles.length; left += 1) {
        for (let right = left + 1; right < rectangles.length; right += 1) {
            const a = rectangles[left];
            const b = rectangles[right];
            if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
                fail(`${atlasJsonPath} frames overlap: ${a.name}, ${b.name}`);
            }
        }
    }

    if (!exists(builderPath)) fail(`${builderPath} is missing.`);
    else {
        const builder = readModText(builderPath);
        for (const frameName of expectedFrames)
            if (!builder.includes(`"${frameName}"`)) fail(`${builderPath} explicit allowlist is missing ${frameName}.`);
        if (/\.rglob\s*\(|os\.walk\s*\(|\.glob\s*\(/.test(builder))
            fail(`${builderPath} must not recursively discover atlas sources.`);
        if (/\.resize\s*\(|\.thumbnail\s*\(|\.rotate\s*\(|ImageOps|\.convert\s*\(/.test(builder))
            fail(`${builderPath} contains a forbidden image transform.`);
        for (const token of [
            'getchannel("A").getbbox()',
            "source.crop(alpha_bounds)",
            "page.paste(crop, (frame_x, frame_y))",
        ]) {
            if (!builder.includes(token)) fail(`${builderPath} is missing the lossless trim step: ${token}`);
        }
    }

    if (errors.length === initialErrorCount) {
        pass(
            `${pink ? "pink" : "original"} Webbing atlas exposes twenty-five Lv1/Lv2/Lv3/Cocoon aliases; PNG payloads were not inspected by the checker.`,
        );
    }
}

function checkSyntax() {
    for (const relativePath of runtimeScripts) {
        try {
            new vm.Script(readModText(relativePath), { filename: relativePath });
            pass(`${relativePath} parses as JavaScript.`);
        } catch (error) {
            fail(`${relativePath} has a syntax error: ${error.message}`);
        }
    }
}

function createMockState() {
    const models = [];
    const restraints = [];
    const enemies = [];
    const spells = [];
    const texts = {};
    const equipped = new Map();
    const nativeStruggleInputs = [];
    const actionMessages = [];
    const errorSounds = [];
    const nativeTrapBindings = () => ({ effect: true });
    let restraintCacheRefreshes = 0;
    const context = {
        console,
        globalThis: null,
        window: null,
        ModelDefs: {},
        KDOptimizeDisplacementMapInfo: {},
        KDModelDefs: {},
        KinkyDungeonRestraints: restraints,
        KinkyDungeonEnemies: enemies,
        KinkyDungeonSpellListEnemies: spells,
        KinkyDungeonStatsPresets: {},
        KDPerkStart: {},
        KDEventMapInventory: {},
        KDEventMapGeneric: {},
        KDEventMapSpell: {},
        KDCastConditions: {},
        KDPlayerEffects: { TrapBindings: nativeTrapBindings },
        KinkyDungeonSpellSpecials: {},
        KDModConfigs: {},
        KDModSettings: {},
        KDModFiles: {},
        KinkyDungeonPlayer: {},
        KinkyDungeonPlayerEntity: {},
        KinkyDungeonRootDirectory: "Game/",
        KinkyDungeonFlags: new Map(),
        KDInputTypes: {
            struggle(data) {
                nativeStruggleInputs.push(data);
                return "NativeStruggle";
            },
        },
        KDGameData: {},
        KDRefreshCharacter: new Map(),
        KDRefresh: false,
        KinkyDungeonPlayerNeedsRefresh: false,
        KDMapInit(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToMap(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToLayerMap(values) {
            return Object.fromEntries((values || []).map((value) => [value.Name, value]));
        },
        KDAddEvent(map, trigger, type, handler) {
            map[trigger] = map[trigger] || {};
            map[trigger][type] = handler;
        },
        AddModel(model) {
            models.push(model);
            context.ModelDefs[model.Name] = model;
            context.KDModelDefs[model.Name] = model;
        },
        AddRestraint(restraint) {
            restraints.push(restraint);
        },
        addTextKey(key, value) {
            texts[key] = value;
        },
        KinkyDungeonAddRestraintText(name, display, description, flavor) {
            texts[`Restraint${name}`] = display;
            texts[`Restraint${name}Desc`] = description;
            texts[`Restraint${name}Desc2`] = flavor;
        },
        KinkyDungeonGetRestraintByName(name) {
            return restraints.find((entry) => entry.name === name);
        },
        KinkyDungeonAllRestraintDynamic() {
            return [];
        },
        KinkyDungeonGetRestraintItem(group) {
            return equipped.get(group);
        },
        KDDynamicLinkListSurface(root) {
            const result = [];
            let current = root;
            while (current) {
                result.push(current);
                current = current.dynamicLink;
            }
            return result;
        },
        TextGet(key) {
            return texts[key] || key;
        },
        KinkyDungeonSendActionMessage(...args) {
            actionMessages.push(args);
        },
        KDSoundEnabled() {
            return true;
        },
        AudioPlayInstantSoundKD(sound) {
            errorSounds.push(sound);
        },
        KinkyDungeonRefreshEnemiesCache() {},
        KDIsSubbier(player, enemy) {
            return !!enemy?.Enemy.bound;
        },
        KinkyDungeonRefreshRestraintsCache() {
            restraintCacheRefreshes += 1;
        },
        ForceRefreshModels() {},
        KinkyDungeonDressPlayer() {},
        setTimeout(callback) {
            callback();
        },
    };
    context.globalThis = context;
    context.window = context;
    return {
        context,
        models,
        restraints,
        enemies,
        spells,
        texts,
        equipped,
        nativeStruggleInputs,
        actionMessages,
        errorSounds,
        nativeTrapBindings,
        get restraintCacheRefreshes() {
            return restraintCacheRefreshes;
        },
    };
}

function loadRuntime() {
    const state = createMockState();
    vm.createContext(state.context);
    for (const relativePath of runtimeScripts) {
        try {
            vm.runInContext(readModText(relativePath), state.context, { filename: relativePath });
        } catch (error) {
            fail(`mock runtime failed in ${relativePath}: ${error.stack || error.message}`);
            break;
        }
    }
    return state;
}

function checkRuntime(state) {
    const nestSummon = state.spells.find((spell) => spell.name === "SummonNestEntrance");
    if (!nestSummon?.noSprite || !nestSummon.selfcast || nestSummon.onhit !== "summon") {
        fail(
            "Nest excavation must retain native self-cast summoning without requesting a nonexistent projectile sprite.",
        );
    }

    const player = { player: true };
    if (
        state.context.KDIsSubbier(player, player) !== false ||
        state.context.KDIsSubbier(player, { Enemy: { bound: "Maid" } }) !== true
    ) {
        fail("KD 5.5.3 dialogue compatibility must exclude player subjects and retain native NPC checks.");
    } else pass("KD 5.5.3 player fallback is safe and NPC dialogue checks remain native.");
    const cocoonStart = state.context.KinkyDungeonStatsPresets.SpiderlingsCocoonStart;
    if (
        cocoonStart?.id !== "SpiderlingsCocoonStart" ||
        cocoonStart.category !== "Start" ||
        cocoonStart.cost !== -1 ||
        !cocoonStart.tags?.includes("start") ||
        typeof state.context.KDPerkStart.SpiderlingsCocoonStart !== "function"
    ) {
        fail(
            "Silken Awakening must register a native Start perk with cost -1 (two displayed points granted) and its KDPerkStart handler.",
        );
    }
    const populationCap = state.context.KDModConfigs.Spiderlings.find(
        (entry) => entry.type === "string" && entry.refvar === "spiderlingsMapPopulationCap",
    );
    const cappedSpecies = state.enemies
        .filter((enemy) => enemy.tags?.SpiderlingsMapPopulation)
        .map((enemy) => enemy.name)
        .sort();
    if (
        !populationCap ||
        populationCap.default !== "25" ||
        JSON.stringify(cappedSpecies) !== JSON.stringify(["Jumper", "Spinner", "Tunneler", "WebCaster"])
    ) {
        fail("Map population cap must default to 25 and count only the four Spiderlings species, excluding nests.");
    }
    // Texture decoding, cache publication, and fallback are exercised by the
    // public model-runtime suite before this checker runs in the local watcher.
    const color = state.context.KDModConfigs.Spiderlings.find((entry) => entry.refvar === "spiderlingsPinkWebbing");
    if (
        !color ||
        color.type !== "boolean" ||
        color.default !== false ||
        typeof state.context.Spiderlings.applyWebbingColor !== "function"
    ) {
        fail("Webbing color must expose a default-original boolean setting and model-copy synchronization.");
    }
    const expectedIds = [...families, ...lv2Families, ...lv3Families]
        .map((entry) => entry.id)
        .concat(cocoon.id, "SpiderlingsSpinnerLegbinder", "SpiderlingsSilkLeash")
        .sort();
    const expectedModels = [...families, ...lv2Families, ...lv3Families]
        .map((entry) => entry.model)
        .concat(cocoon.model, "SpiderlingsSpinnerLegbinderModel")
        .sort();
    const actualIds = state.restraints.map((entry) => entry.name).sort();
    const actualModels = state.models.map((entry) => entry.Name).sort();
    const catalog = state.context.Spiderlings && state.context.Spiderlings.restraintCatalog;
    const catalogIds =
        catalog && typeof catalog.list === "function"
            ? catalog
                  .list()
                  .map((entry) => entry.id)
                  .sort()
            : [];
    const runtimeAtlases =
        state.context.Spiderlings && state.context.Spiderlings.ModelRuntime
            ? Array.from(state.context.Spiderlings.ModelRuntime.TEXTURE_ATLASES || [])
            : [];
    const runtimeDisplacements =
        state.context.Spiderlings && state.context.Spiderlings.ModelRuntime
            ? Array.from(state.context.Spiderlings.ModelRuntime.DISPLACEMENT_ASSETS || [])
            : [];
    if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds))
        fail(`runtime restraint registry is not exact: ${actualIds.join(", ")}`);
    if (JSON.stringify(actualModels) !== JSON.stringify(expectedModels))
        fail(`runtime model registry is not exact: ${actualModels.join(", ")}`);
    if (JSON.stringify(catalogIds) !== JSON.stringify(expectedIds))
        fail(`central restraint catalog is not exact: ${catalogIds.join(", ")}`);
    if (JSON.stringify(runtimeAtlases) !== JSON.stringify([atlasAssets[1], atlasAssets[3]]))
        fail(`runtime atlas list is not exact: ${runtimeAtlases.join(", ")}`);
    if (JSON.stringify(runtimeDisplacements) !== JSON.stringify(displacementAssets))
        fail(`runtime displacement list is not exact: ${runtimeDisplacements.join(", ")}`);
    if (state.restraintCacheRefreshes < 2)
        fail("restraint cache is not refreshed after both Webbing and the late-loaded Silk leash register.");
    if (state.context.KDPlayerEffects.TrapBindings !== state.nativeTrapBindings)
        fail("Spiderlings replaced KD's native TrapBindings handler.");
    for (const apiName of [
        "SilkProgression",
        "LooseWebbing",
        "SpiderlingsLooseWebbingUpgrade",
        "SpiderlingsApplyLooseWebbingSlow",
        "SpiderlingsClearLooseWebbingSlow",
    ]) {
        if (state.context.Spiderlings && state.context.Spiderlings[apiName] !== undefined)
            fail(`retired runtime API is still exported: ${apiName}`);
    }
    for (const id of legacyRestraints) if (actualIds.includes(id)) fail(`legacy restraint registered: ${id}`);
    for (const id of legacyModels) if (actualModels.includes(id)) fail(`legacy model registered: ${id}`);
    if (
        !errors.some((message) =>
            /registry|catalog|atlas list|displacement list|TrapBindings|retired runtime API|legacy .* registered|cache/.test(
                message,
            ),
        )
    ) {
        pass(
            "mock runtime registers the exact Webbing, Leg binder, and Silk leash catalog with two atlases and five displacement textures, and preserves native TrapBindings.",
        );
    }

    const byId = new Map(state.restraints.map((entry) => [entry.name, entry]));
    const byModel = new Map(state.models.map((entry) => [entry.Name, entry]));
    const bag = byId.get("SpiderlingsSpinnerLegbinder");
    const leash = byId.get("SpiderlingsSilkLeash");
    const capture = state.context.Spiderlings.SpinnerCapture;
    if (
        !leash ||
        leash.Group !== "ItemNeckRestraints" ||
        leash.leash !== true ||
        leash.tether !== 2.9 ||
        leash.power !== 1 ||
        JSON.stringify(leash.requireAllTagsToEquip) !== JSON.stringify(["Collars"])
    )
        fail("Spiderlings Silk leash does not preserve the BasicLeash carrier contract.");
    if (
        !bag ||
        bag.Group !== "ItemLegs" ||
        bag.hobble !== 2 ||
        bag.bindarms ||
        bag.bindhands ||
        bag.immobile ||
        !capture ||
        capture.CONFIG.lineColor !== 0xffffff ||
        capture.CONFIG.wrapTurns !== 5 ||
        capture.CONFIG.minSpinners !== 2 ||
        capture.CONFIG.weaveGoal !== 100
    )
        fail(
            "Spinner leg bag must remain an independent mobile ItemLegs restraint with white tethers and five wrapping turns.",
        );
    let blockers = [];
    let preflight;
    state.context.KDGetBlockersToAddRestraint = () => blockers;
    state.context.KDCanAddRestraint = (...args) => {
        preflight = args;
        return true;
    };
    const securityEnemy = { id: 1 };
    if (
        !capture.canEquip(securityEnemy) ||
        preflight?.[4] !== undefined ||
        preflight?.[5] !== true ||
        preflight?.[6] !== true ||
        preflight?.[7] !== securityEnemy
    )
        fail("Spinner leg bag must use native deep/no-overpower compatibility with the acting source.");
    blockers = [{}];
    if (capture.canEquip(securityEnemy)) fail("Spinner leg bag must reject native ItemLegs blockers before addition.");
    const forbiddenImageFields = ["MorphPoses"];
    const displacementContracts = new Map([
        [
            "SpiderlingsWebbingLv2ArmModel",
            { sprite: "SpiderlingsWebbingLv2ArmSquish", layers: ["Rope1"], amount: 1200, xPad: 650, yPad: 749 },
        ],
        [
            "SpiderlingsWebbingLv2BellyModel",
            {
                sprite: "SpiderlingsWebbingLv2BellySquish",
                layers: ["CorsetTorso"],
                amount: 1200,
                xPad: 459,
                yPad: 1280,
            },
        ],
        [
            "SpiderlingsWebbingLv2LegsModel",
            { sprite: "SpiderlingsWebbingLv2LegsSquish", layers: ["Skirts"], amount: 2000, xPad: 110, yPad: 1657 },
        ],
        [
            "SpiderlingsWebbingLv2AnklesModel",
            { sprite: "SpiderlingsWebbingLv2AnklesSquish", layers: ["Skirts"], amount: 2000, xPad: 383, yPad: 2085 },
        ],
        [
            "SpiderlingsWebbingLv2FootModel",
            { sprite: "SpiderlingsWebbingLv2FootSquish", layers: ["Shoes"], amount: 100, xPad: 741, yPad: 2928 },
        ],
        [
            "SpiderlingsWebbingLv3ArmModel",
            { sprite: "SpiderlingsWebbingLv2ArmSquish", layers: ["Rope1"], amount: 1200, xPad: 650, yPad: 749 },
        ],
        [
            "SpiderlingsWebbingLv3BellyModel",
            {
                sprite: "SpiderlingsWebbingLv2BellySquish",
                layers: ["CorsetTorso"],
                amount: 1200,
                xPad: 459,
                yPad: 1280,
            },
        ],
        [
            "SpiderlingsWebbingLv3LegsModel",
            { sprite: "SpiderlingsWebbingLv2LegsSquish", layers: ["Skirts"], amount: 2000, xPad: 110, yPad: 1657 },
        ],
        [
            "SpiderlingsWebbingLv3AnklesModel",
            { sprite: "SpiderlingsWebbingLv2AnklesSquish", layers: ["Skirts"], amount: 2000, xPad: 383, yPad: 2085 },
        ],
        [
            "SpiderlingsWebbingLv3FootModel",
            { sprite: "SpiderlingsWebbingLv2FootSquish", layers: ["Shoes"], amount: 100, xPad: 741, yPad: 2928 },
        ],
    ]);
    const displacementFields = ["DisplacementSprite", "DisplaceLayers", "DisplaceAmount", "DisplacementInvariant"];
    for (const family of [...families, ...lv2Families, ...lv3Families]) {
        const model = byModel.get(family.model);
        const modelLayers = layers(model);
        const contract = displacementContracts.get(family.model);
        if (!contract) {
            if (modelLayers.some((layer) => displacementFields.some((field) => field in layer))) {
                fail(`${family.model} gained an unexpected displacement contract.`);
            }
            continue;
        }
        const layer = modelLayers[0];
        const padding = state.context.KDOptimizeDisplacementMapInfo[`DisplacementMaps/${contract.sprite}.png`];
        if (padding?.xPad !== contract.xPad || padding?.yPad !== contract.yPad)
            fail(`${family.model} lost its authored canvas offset.`);
        if (
            !layer ||
            layer.DisplacementSprite !== contract.sprite ||
            layer.DisplacementInvariant !== true ||
            layer.DisplaceAmount !== contract.amount ||
            JSON.stringify(Object.keys(layer.DisplaceLayers || {})) !== JSON.stringify(contract.layers)
        ) {
            fail(`${family.model} custom displacement contract changed.`);
        }
    }
    for (const family of [...families, ...lv2Families]) {
        const model = byModel.get(family.model);
        const clothingHidePoses = ((model && model.AddPose) || []).filter(
            (pose) => /^Encase/.test(pose) || pose === "FlattenedUnderbust" || pose === "WrapArms",
        );
        const eraseLayers = layers(model).filter(
            (layer) => "EraseSprite" in layer || "EraseLayers" in layer || "EraseMorph" in layer,
        );
        if (clothingHidePoses.length || eraseLayers.length) {
            fail(
                `${family.model} must preserve existing clothing; found hide poses ${clothingHidePoses.join(", ")} or erase fields.`,
            );
        }
    }
    for (const family of families) {
        const restraint = byId.get(family.id);
        const model = byModel.get(family.model);
        if (!restraint || !model) continue;
        if (
            restraint.Group !== family.group ||
            restraint.Model !== family.model ||
            restraint.accessible !== true ||
            restraint.inaccessible
        ) {
            fail(`${family.id} group/model/player-access contract changed.`);
        }
        if (restraint.weight !== 0 || JSON.stringify(plain(restraint.enemyTags)) !== "{}")
            fail(`${family.id} entered an ambient enemy tag pool.`);
        if (restraint.DefaultLock !== undefined || restraint.removePrison || restraint.forceRemovePrison)
            fail(`${family.id} gained lock or prison-removal semantics.`);
        const refreshEvents = (restraint.events || [])
            .filter((event) => event.type === "SpiderlingsRefreshModels")
            .map((event) => event.trigger)
            .sort();
        if (JSON.stringify(refreshEvents) !== JSON.stringify(["afterDress", "postApply", "postRemoval"]))
            fail(`${family.id} refresh event contract changed.`);
        if (model.Folder !== "SpiderlingsWebbingLv1")
            fail(`${family.model} no longer resolves under the direct Lv1 folder.`);
        const modelLayers = layers(model);
        if (
            modelLayers.length !== 1 ||
            modelLayers.some((layer) => layer.Invariant !== true || layer.NoColorize !== true)
        ) {
            fail(`${family.model} must expose its exact invariant non-colorized delivered layer.`);
        }
        if (
            ["MittenLeft", "MittenRight"].includes(family.family) &&
            modelLayers.some((layer) => layer.HideWhenOverridden)
        ) {
            fail(
                `${family.model} must remain visible during its first equipment pass instead of yielding to an existing hand layer.`,
            );
        }
        if (
            ["MittenLeft", "MittenRight"].includes(family.family) &&
            modelLayers.some(
                (layer) => JSON.stringify(Object.keys(layer.RequirePoses || {})) !== JSON.stringify(["Free"]),
            )
        ) {
            fail(`${family.model} must draw independently of leg pose while preserving existing glove layers.`);
        }
        for (const field of forbiddenImageFields) {
            if (field in model || modelLayers.some((layer) => field in layer))
                fail(`${family.model} contains forbidden image adaptation field ${field}.`);
        }
        const resolvedPaths = modelLayers
            .map((layer) => `Models/${layer.Folder || model.Folder}/${layer.Sprite || layer.Name}.png`)
            .sort();
        if (
            JSON.stringify(resolvedPaths) !== JSON.stringify([family.path]) ||
            resolvedPaths.some((runtimePath) => !exists(runtimePath))
        ) {
            fail(`${family.model} resolves to unexpected direct paths ${resolvedPaths.join(", ")}.`);
        }
        for (const suffix of ["", "Desc", "Desc2"]) {
            if (!String(state.texts[`Restraint${family.id}${suffix}`] || "").trim())
                fail(`${family.id} English fallback ${suffix || "name"} is empty.`);
        }
    }
    const arm = byId.get("SpiderlingsWebbingLv1Arm");
    const mittenLeft = byId.get("SpiderlingsWebbingLv1MittenLeft");
    const mittenRight = byId.get("SpiderlingsWebbingLv1MittenRight");
    const belly = byId.get("SpiderlingsWebbingLv1Belly");
    const legs = byId.get("SpiderlingsWebbingLv1Legs");
    const ankles = byId.get("SpiderlingsWebbingLv1Ankles");
    const foot = byId.get("SpiderlingsWebbingLv1Foot");
    const blindfold = byId.get("SpiderlingsWebbingLv1Blindfold");
    if (!arm || arm.bindarms !== true || "bindhands" in arm || "restricthands" in arm)
        fail("Arm must bind only ItemArms in Wristtie.");
    for (const mitten of [mittenLeft, mittenRight]) {
        if (
            !mitten ||
            mitten.bindhands !== 0.5 ||
            mitten.bypass !== true ||
            "bindarms" in mitten ||
            mitten.Group !== "ItemHands"
        ) {
            fail(
                "Mitten Left and Mitten Right must remain independent half-strength ItemHands restraints with native application bypass.",
            );
            break;
        }
    }
    for (const field of [
        "bindarms",
        "bindhands",
        "restricthands",
        "hobble",
        "blockfeet",
        "strictness",
        "harness",
        "remove",
    ]) {
        if (belly && field in belly) fail(`Belly must remain pure ItemTorso; found ${field}.`);
    }
    for (const restraint of [legs, ankles, foot]) {
        if (
            !restraint ||
            "hobble" in restraint ||
            "blockfeet" in restraint ||
            !["FeetLinked", "BlockKneel", "BlockHogtie"].every((tag) => (restraint.addTag || []).includes(tag))
        ) {
            fail("lower-body restraints must keep Closed pose tags without adding hobble/blockfeet slowdown.");
            break;
        }
    }
    if (!blindfold || blindfold.Group !== "ItemHead" || blindfold.blindfold !== 1) {
        fail("Lv1 Blindfold must retain its light ItemHead blindfold effect.");
    }
    for (const [id, fields] of [
        ["SpiderlingsWebbingLv3Blindfold", { blindfold: 2 }],
        ["SpiderlingsWebbingLv1Stuffing", { gag: 0.1 }],
        ["SpiderlingsWebbingLv1Gag", { gag: 0.15 }],
        ["SpiderlingsWebbingLv3Gag", { gag: 0.5 }],
        ["SpiderlingsWebbingLv3Hood", { blindfold: 4, gag: 1 }],
    ]) {
        if (Object.entries(fields).some(([field, value]) => byId.get(id)?.[field] !== value)) {
            fail(`${id} must preserve sensory progression toward Hood.`);
        }
    }
    for (const family of ["MittenLeft", "MittenRight"]) {
        const mittenLayers = layers(byModel.get(`SpiderlingsWebbingLv1${family}Model`));
        const deliveredMitten = mittenLayers.find((layer) => layer.Sprite === family);
        if (
            !deliveredMitten ||
            JSON.stringify(Object.keys(deliveredMitten.RequirePoses || {})) !== JSON.stringify(["Free"]) ||
            JSON.stringify(Object.keys(deliveredMitten.HidePoses || {})) !==
                JSON.stringify(["SpiderlingsWebbingCocoonCover"]) ||
            mittenLayers.some((layer) => layer.Sprite === "TestPlaceholder")
        ) {
            fail(
                `${family} must require only Free hands and hide only under Cocoon, without a leg-pose dependency, Wristtie special case, or TEST.`,
            );
        }
    }
    if (
        !errors.some((message) =>
            /Lv1|Arm must|Mitten|Belly must|lower-body|direct path|image adaptation|refresh event|ambient enemy/.test(
                message,
            ),
        )
    ) {
        pass(
            "all ten direct Lv1 restraint/model contracts remain exact, including clothing-preserving split mittens, Blindfold, mouth layers, and Arm-only Wristtie binding.",
        );
    }

    for (const family of lv2Families) {
        const restraint = byId.get(family.id);
        const model = byModel.get(family.model);
        const modelLayers = layers(model);
        if (
            !restraint ||
            restraint.Group !== family.group ||
            restraint.Model !== family.model ||
            restraint.power !== 2 ||
            restraint.accessible !== true ||
            restraint.inaccessible ||
            restraint.weight !== 0 ||
            JSON.stringify(plain(restraint.enemyTags)) !== "{}"
        ) {
            fail(`${family.id} rendered Lv2 restraint contract changed.`);
        }
        if (
            !model ||
            model.Folder !== "SpiderlingsWebbingLv2" ||
            modelLayers.length !== 1 ||
            modelLayers.some((layer) => layer.Invariant !== true || layer.NoColorize !== true) ||
            !(model.Categories || []).includes("SpiderlingsWebbingLv2")
        ) {
            fail(`${family.model} must expose its exact invariant non-colorized delivered Lv2 layer.`);
        }
        const lv1Layer = layers(byModel.get(`SpiderlingsWebbingLv1${family.family}Model`))[0];
        const lv2Layer = modelLayers[0];
        const innerLayer = { Legs: "WrappingLegsOver", Ankles: "WrappingAnklesOver" }[family.family];
        const expectedLv1Layer = innerLayer || (lv2Layer && lv2Layer.Layer);
        if (
            !lv1Layer ||
            !lv2Layer ||
            lv1Layer.Layer !== expectedLv1Layer ||
            (innerLayer && lv2Layer.Layer !== "OverSkirtDeco") ||
            lv1Layer.Pri !== 50 ||
            lv2Layer.Pri !== 51 ||
            lv2Layer.NoOverride !== true
        ) {
            fail(
                `${family.model} must remain above its still-visible Lv1 layer, with Lv1 Legs below skirts and Lv2 Legs above them.`,
            );
        }
        const resolvedPaths = modelLayers
            .map((layer) => `Models/${layer.Folder || model.Folder}/${layer.Sprite || layer.Name}.png`)
            .sort();
        if (
            JSON.stringify(resolvedPaths) !== JSON.stringify([family.path]) ||
            resolvedPaths.some((runtimePath) => !exists(runtimePath))
        ) {
            fail(`${family.model} resolves to unexpected direct paths ${resolvedPaths.join(", ")}.`);
        }
        const escapeTriggers = ((restraint && restraint.events) || [])
            .filter((event) => event.type === "SpiderlingsLv2Escape")
            .map((event) => event.trigger)
            .sort();
        if (JSON.stringify(escapeTriggers) !== JSON.stringify(["beforeStruggleCalc", "struggle"])) {
            fail(`${family.id} must require the shared two-action native escape lifecycle.`);
        }
        for (const suffix of ["", "Desc", "Desc2"]) {
            if (!String(state.texts[`Restraint${family.id}${suffix}`] || "").trim())
                fail(`${family.id} English fallback ${suffix || "name"} is empty.`);
        }
    }

    for (const family of lv3Families) {
        const restraint = byId.get(family.id);
        const model = byModel.get(family.model);
        const modelLayers = layers(model);
        if (
            !restraint ||
            restraint.Group !== family.group ||
            restraint.Model !== family.model ||
            restraint.power !== 3 ||
            restraint.accessible !== true ||
            restraint.inaccessible ||
            restraint.weight !== 0 ||
            JSON.stringify(plain(restraint.enemyTags)) !== "{}"
        ) {
            fail(`${family.id} manual Lv3 restraint contract changed.`);
        }
        if (
            !model ||
            model.Folder !== "SpiderlingsWebbingLv3" ||
            modelLayers.length !== 1 ||
            !(model.Categories || []).includes("SpiderlingsWebbingLv3") ||
            modelLayers.some(
                (layer) =>
                    layer.Invariant !== true ||
                    layer.NoColorize !== true ||
                    layer.HideWhenOverridden !== true ||
                    !!layer.NoOverride !== ["Legs", "Ankles"].includes(family.family) ||
                    layer.Layer !== family.layer ||
                    layer.Pri !== family.priority,
            )
        ) {
            fail(`${family.model} must expose its invariant delivered layer at the intended covering priority.`);
        }
        const coverPose = `SpiderlingsWebbingLv3${family.family}Cover`;
        if (!model || !(model.AddPose || []).includes(coverPose)) {
            fail(`${family.model} must expose its own cover pose for the matching inner artwork.`);
        }
        for (const inner of [...families, ...lv2Families].filter((entry) => entry.family === family.family)) {
            if (!layers(byModel.get(inner.model)).every((layer) => (layer.HidePoses || {})[coverPose])) {
                fail(`${inner.model} must hide while its matching Lv3 artwork covers it.`);
            }
        }
        if (family.family === "Arm") {
            const armLayer = modelLayers[0];
            if (
                !armLayer ||
                armLayer.CrossHideOverride !== true ||
                armLayer.ForceSingleOverride !== true ||
                JSON.stringify(armLayer.HideOverrideLayerMulti) !== JSON.stringify(["ChestBinding"])
            ) {
                fail(`${family.model} must cover chest bindings using KD's native cross-layer override contract.`);
            }
            const priorityHidePoses = [
                "Free",
                "Boxtie",
                "Yoked",
                "Front",
                "Up",
                "Crossed",
                "SpiderlingsWebbingCocoonCover",
            ];
            if (
                !armLayer ||
                JSON.stringify(armLayer.HidePoseConditional) !== JSON.stringify(priorityHidePoses.map((pose) => [pose]))
            ) {
                fail(
                    `${family.model} must exclude unsupported and Cocoon-covered poses from KD's cross-layer priority collection.`,
                );
            }
        }
        const resolvedPaths = modelLayers.map(
            (layer) => `Models/${layer.Folder || model.Folder}/${layer.Sprite || layer.Name}.png`,
        );
        if (
            JSON.stringify(resolvedPaths) !== JSON.stringify([family.path]) ||
            resolvedPaths.some((runtimePath) => !exists(runtimePath))
        ) {
            fail(`${family.model} resolves to unexpected direct paths ${resolvedPaths.join(", ")}.`);
        }
        const escapeTriggers = ((restraint && restraint.events) || [])
            .filter((event) => event.type === "SpiderlingsLv3Escape")
            .map((event) => event.trigger)
            .sort();
        if (JSON.stringify(escapeTriggers) !== JSON.stringify(["beforeStruggleCalc", "struggle"])) {
            fail(`${family.id} must use the shared two-action native escape lifecycle.`);
        }
        const escapeTarget = state.context.Spiderlings.Webbing.resolveWebbingAction({
            action: {
                type: "escapeAttempt",
                item: { name: family.id },
                method: "Remove",
                effective: true,
                progress: 1,
            },
        }).outcome;
        if (escapeTarget.requiredActions !== 2 || escapeTarget.completed !== true) {
            fail(`${family.id} must complete its counted escape on the second effective action.`);
        }
        const refreshTriggers = ((restraint && restraint.events) || [])
            .filter((event) => event.type === "SpiderlingsRefreshModels")
            .map((event) => event.trigger)
            .sort();
        if (JSON.stringify(refreshTriggers) !== JSON.stringify(["afterDress", "postApply", "postRemoval"])) {
            fail(`${family.id} refresh event contract changed.`);
        }
    }
    if (!errors.some((message) => /Lv3/.test(message))) {
        pass(
            "all eight Lv3 items resolve to their delivered assets, intended covering priorities, and native escape/refresh events.",
        );
    }
    for (const [name, hiddenLayers] of [
        ["SpiderlingsWebbingLv3HoodModel", ["AnimalEars", "AnimalEarsFront", "AnimalEarsMid"]],
        ["SpiderlingsWebbingLv3LegsModel", ["Tail", "TailNoRot", "TailFront"]],
        ["SpiderlingsWebbingCocoonModel", ["Tail", "TailNoRot", "TailFront"]],
    ]) {
        const model = state.models.find((entry) => entry.Name === name);
        if (!hiddenLayers.every((layer) => (model?.HideLayers || []).includes(layer))) {
            fail(`${name} must hide all covered native ear or tail layers.`);
        }
    }

    const pairedGateApi = state.context.Spiderlings && state.context.Spiderlings.Webbing;
    const nativeBeforeGateProbe = state.nativeStruggleInputs.length;
    for (const family of lv2Families) {
        const inner = { name: `SpiderlingsWebbingLv1${family.family}`, group: family.group, data: { untouched: true } };
        const thirdParty = { name: `ThirdParty${family.family}`, group: family.group, dynamicLink: inner };
        const outer = { name: family.id, group: family.group, dynamicLink: thirdParty };
        state.equipped.set(family.group, outer);
        for (const method of ["Cut", "Struggle", "Remove"]) {
            if (state.context.KDInputTypes.struggle({ group: family.group, type: method, index: 2 }) !== "Blocked") {
                fail(`${family.id} failed to block ${method} against its paired Lv1 before native escape processing.`);
            }
        }
        if (
            state.context.KDInputTypes.struggle({ group: family.group, type: "Remove", index: 1 }) !== "NativeStruggle"
        ) {
            fail(`${family.id} incorrectly blocked an unrelated third-party linked restraint.`);
        }
        if (JSON.stringify(inner.data) !== JSON.stringify({ untouched: true }))
            fail(`${family.id} changed blocked Lv1 escape state.`);
    }
    state.equipped.clear();
    if (
        !pairedGateApi ||
        pairedGateApi.PAIRED_OUTER_GATE_MESSAGE_KEY !== "KinkyDungeonSpiderlingsWebbingLv1Covered" ||
        !String(pairedGateApi.PAIRED_OUTER_GATE_MESSAGE_FALLBACK || "").trim() ||
        state.nativeStruggleInputs.length !== nativeBeforeGateProbe + lv2Families.length ||
        state.actionMessages.length !== lv2Families.length * 3 ||
        state.errorSounds.length !== lv2Families.length * 3 ||
        state.errorSounds.some((sound) => sound !== "Game/Audio/ClickError.ogg")
    ) {
        fail(
            "paired outer-layer gate must block only exact Lv1 targets with localized feedback and the native error sound.",
        );
    }
    if (
        !errors.some((message) =>
            /paired outer-layer gate|failed to block|third-party linked|blocked Lv1 escape state/.test(message),
        )
    ) {
        pass(
            "all five paired outer-layer gates block player Cut/Struggle/Remove before native costs while leaving third-party targets untouched.",
        );
    }

    const cocoonGateErrors = errors.length;
    for (const family of [...families, ...lv2Families, ...lv3Families]) {
        const inner = { name: family.id, group: family.group };
        state.equipped.set(family.group, inner);
        state.equipped.set("ItemDevices", { name: cocoon.id, group: "ItemDevices" });
        const nativeBeforeCocoon = state.nativeStruggleInputs.length;
        if (
            state.context.KDInputTypes.struggle({ group: family.group, type: "Remove" }) !== "Blocked" ||
            state.nativeStruggleInputs.length !== nativeBeforeCocoon
        ) {
            fail(`Cocoon must block ${family.id} before native costs even without other inner restraints.`);
        }
        if (state.context.KDInputTypes.struggle({ group: "ItemDevices", type: "Remove" }) !== "NativeStruggle") {
            fail("Cocoon must remain operable through its own outermost gate.");
        }
        state.equipped.delete("ItemDevices");
        if (state.context.KDInputTypes.struggle({ group: family.group, type: "Remove" }) !== "NativeStruggle") {
            fail(`${family.id} must become operable again after Cocoon removal.`);
        }
        state.equipped.clear();
    }
    if (errors.length === cocoonGateErrors)
        pass("Cocoon blocks all twenty-three inner Webbing items across groups and restores their actions on removal.");

    const cocoonRestraint = byId.get(cocoon.id);
    const cocoonModel = byModel.get(cocoon.model);
    const cocoonLayer = layers(cocoonModel)[0];
    if (
        !cocoonRestraint ||
        cocoonRestraint.Group !== "ItemDevices" ||
        cocoonRestraint.immobile === true ||
        cocoonRestraint.hobble !== 3 ||
        JSON.stringify(plain(cocoonRestraint.escapeChance)) !==
            JSON.stringify({ Cut: 0.025, Struggle: 0.02, Remove: 0.02 })
    ) {
        fail("Cocoon restraint contract changed.");
    }
    if (
        !cocoonModel ||
        cocoonModel.Folder !== "SpiderlingsWebbingCocoon" ||
        layers(cocoonModel).length !== 2 ||
        !cocoonLayer ||
        cocoonLayer.Sprite !== "Cocoon" ||
        cocoonLayer.Invariant !== true ||
        cocoonLayer.NoColorize !== true ||
        cocoonLayer.Layer !== "FurnitureFront" ||
        cocoonLayer.Pri !== 100 ||
        !(cocoonModel.Categories || []).includes("SpiderlingsWebbingCocoon") ||
        !["Wristties", "FeetLinked"].every((pose) => (cocoonModel.AddPose || []).includes(pose))
    ) {
        fail("Cocoon must retain its body on FurnitureFront and its standing Wristties/FeetLinked pose.");
    }
    const outerWebs = cocoonModel && cocoonModel.Layers.OuterWebs;
    if (
        !outerWebs ||
        outerWebs.Sprite !== "OuterWebs" ||
        outerWebs.Layer !== "FurnitureBack" ||
        outerWebs.Invariant !== true ||
        outerWebs.NoColorize !== true ||
        outerWebs.RequirePoses?.SpiderlingsCocoonAnchored !== true
    ) {
        fail("Cocoon outer webs must be a separate transparent layer gated by the equipped cocoon's anchored pose.");
    }
    for (const trigger of ["beforeMove", "afterDress", "postRemoval", "tickAfter"]) {
        if (typeof state.context.KDEventMapGeneric[trigger]?.SpiderlingsCocoonOuterWebs !== "function") {
            fail(`Cocoon outer webs are missing their ${trigger} lifecycle handler.`);
        }
    }
    const cocoonRefreshTriggers = ((cocoonRestraint && cocoonRestraint.events) || [])
        .filter((event) => event.type === "SpiderlingsRefreshModels")
        .map((event) => event.trigger)
        .sort();
    if (JSON.stringify(cocoonRefreshTriggers) !== JSON.stringify(["afterDress", "postApply", "postRemoval"])) {
        fail("Cocoon must refresh models after apply/removal so its Wristtie pose cannot become stale.");
    }
    const webbingSource = readModText("SpiderlingsWebbing.js");
    if (/Math\.max\(0,\s*Number\(data\.cost/.test(webbingSource))
        fail("counted escape must preserve KD's negative stamina cost sign.");
    const testModels = [...byModel.values()].filter((model) =>
        layers(model).some((layer) => layer.Sprite === "TestPlaceholder"),
    );
    if (testModels.length) fail("No model may retain TEST placeholder art.");
    if (!errors.some((message) => /Cocoon|Lv2|negative stamina|TEST placeholder/.test(message))) {
        pass(
            "all five Lv2 items and Cocoon render delivered art and retain their counted escape contracts; no placeholder remains.",
        );
    }
}

function checkRouting(state) {
    const enemyByName = new Map(state.enemies.map((entry) => [entry.name, entry]));
    for (const name of ["Spinner", "Jumper"]) {
        const enemy = enemyByName.get(name);
        const expectedAttack = name === "Jumper" ? "SpellMeleeEffectSuicide" : "MeleeEffect";
        if (
            !enemy ||
            enemy.attack !== expectedAttack ||
            enemy.suicideOnEffect !== (name === "Jumper") ||
            !enemy.effect ||
            !enemy.effect.effect ||
            enemy.effect.effect.name !== "SpiderlingsWebbingEnemyBind" ||
            enemy.effect.effect.profile !== name ||
            String(enemy.attack).includes("Bind")
        )
            fail(`${name} does not use the exact shared enemy effect route.`);
    }
    const spinner = enemyByName.get("Spinner");
    const jumper = enemyByName.get("Jumper");
    if (
        !spinner ||
        !jumper ||
        jumper.attackRange !== 2 ||
        jumper.movePoints !== 1.25 ||
        jumper.castWhileMoving !== true ||
        !(jumper.movePoints < spinner.movePoints)
    ) {
        fail("Jumper must attack within two tiles and move slightly faster than Spinner.");
    }
    const webbing = state.context.Spiderlings && state.context.Spiderlings.Webbing;
    const expectedProfiles = {
        Spinner: [0, 0, 0, 0, 2, 1, 1, 0, 0, 0, 0],
        Jumper: [1, 1, 1, 2, 3, 3, 3, 1, 1, 1, 1],
        WebCaster: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    };
    if (!webbing || JSON.stringify(plain(webbing.ENEMY_PROFILES)) !== JSON.stringify(expectedProfiles))
        fail("shared enemy profiles changed or gained another route.");
    if (webbing && (webbing.ENEMY_PROFILES.Tunneler || webbing.ENEMY_PROFILES.NestEntrance))
        fail("Tunneler/NestEntrance entered the Webbing selector.");
    if (webbing) {
        const inner = state.restraints
            .filter((entry) => /^SpiderlingsWebbingLv[12]/.test(entry.name))
            .map((entry) => ({ name: entry.name }));
        const resolve = (items) =>
            webbing.resolveWebbingAction({
                snapshot: { items, webSpray: { stacks: 5 } },
                action: { type: "enemyBind", profile: "WebCaster", random: () => 0 },
            }).outcome;
        const full = state.restraints
            .filter((entry) => /^SpiderlingsWebbingLv[123]/.test(entry.name))
            .map((entry) => ({ name: entry.name }));
        const lv3Only = full.filter((entry) => entry.name.startsWith("SpiderlingsWebbingLv3"));
        if (
            resolve(inner).selectedId !== "SpiderlingsWebbingLv3Arm" ||
            resolve(full).selectedId !== webbing.COCOON_ID ||
            resolve(lv3Only).selectedId !== webbing.COCOON_ID ||
            lv3Only.some(
                (missing) => resolve(lv3Only.filter((entry) => entry !== missing)).selectedId === webbing.COCOON_ID,
            )
        ) {
            fail(
                "enemy progression must enter Lv3 after the corresponding lower layers; Cocoon requires all eight physical Lv3 items, without requiring Lv1/Lv2 completeness.",
            );
        }
    }

    const spellByName = new Map(state.spells.map((entry) => [entry.name, entry]));
    const dash = spellByName.get("SpiderlingsJumperDash");
    const dashApi = state.context.Spiderlings && state.context.Spiderlings.JumperDash;
    const dashSource = readModText("SpiderlingsJumperDash.js");
    if (
        !jumper ||
        jumper.specialAttack !== undefined ||
        JSON.stringify(plain(jumper.spells)) !== JSON.stringify(["SpiderlingsJumperDash"]) ||
        !dash ||
        dash.type !== "inert" ||
        dash.castRange !== 4 ||
        dash.range !== 4 ||
        dash.minRange !== 2 ||
        dash.castCondition !== "SpiderlingsJumperDash" ||
        dash.noCastMsg !== true ||
        dash.specialCD !== 5 ||
        JSON.stringify(plain(dash.playerEffect)) !== JSON.stringify({}) ||
        !dashApi ||
        JSON.stringify(plain(dashApi.CONFIG)) !==
            JSON.stringify({
                minRangeExclusive: 2,
                maxRangeInclusive: 4,
                cooldownTurns: 5,
                reactionActions: 2,
                warningColor: "#ff66ff",
            }) ||
        typeof dashApi.runtimeController?.commitCast !== "function" ||
        typeof state.context.KDCastConditions.SpiderlingsJumperDash !== "function" ||
        typeof state.context.KDEventMapGeneric.enemyCast?.SpiderlingsJumperDash !== "function" ||
        typeof state.context.KDEventMapGeneric.beforeEnemyLoop?.SpiderlingsJumperDash !== "function" ||
        typeof state.context.KDEventMapGeneric.tickAfter?.SpiderlingsJumperDash !== "function" ||
        typeof state.context.KDEventMapGeneric.afterEnemyTick?.SpiderlingsJumperDash !== "function" ||
        ["postMapgen", "defeat", "passout", "postPrisonIntro"].some(
            (trigger) => typeof state.context.KDEventMapGeneric[trigger]?.SpiderlingsJumperDashClear !== "function",
        ) ||
        !/KinkyDungeonCheckPath\(source\.x, source\.y, target\.x, target\.y, false, true, 1, false\)/.test(
            dashSource,
        ) ||
        !/runtimeController\.commitCast\(data\.enemy, target\)/.test(dashSource) ||
        typeof state.context.Spiderlings.Combat?.hitNPC !== "function" ||
        state.context.Spiderlings.Combat.CONFIG.melee.bind !== 1.5
    ) {
        fail(
            "Jumper Dash must enter KD's spell loop and delegate its >2..<=4, five-CD, two-action purple warning lifecycle to Spiderlings-owned runtime state.",
        );
    }
    if (dashApi && typeof dashApi.createController === "function") {
        const sources = new Map();
        const warnings = new Set();
        const damage = [];
        let routeClear = true;
        let landingOpen = true;
        let playerAtTarget = true;
        let moved = 0;
        let consumed = 0;
        const controller = dashApi.createController({
            isCooldownReady: (source) => !(source.castCooldownSpecial > 0),
            canSense: () => true,
            routeClear: () => routeClear,
            landingCandidates: () => (landingOpen ? [{ x: 3, y: 0 }] : []),
            startCooldown: (source, turns) => {
                source.castCooldownSpecial = turns;
            },
            addWarning: (dashState) => warnings.add(dashState.sourceId),
            clearWarning: (dashState) => warnings.delete(dashState.sourceId),
            announce() {},
            findSource: (sourceId) => sources.get(sourceId),
            isPlayerAt: () => playerAtTarget,
            moveSource: (source, landing) => {
                source.x = landing.x;
                source.y = landing.y;
                moved += 1;
            },
            progressWebbing: () => ({ progressed: false }),
            damagePlayer: (_source, payload) => damage.push(plain(payload)),
            consumeSource: () => {
                consumed += 1;
            },
        });
        const source = { id: 9101, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper", fullBoundBonus: 2 } };
        sources.set(source.id, source);
        if (
            controller.canStart(source, { x: 2, y: 0 }) ||
            !controller.canStart(source, { x: 4, y: 0 }) ||
            !controller.begin(source, { x: 4, y: 0 }).started ||
            source.castCooldownSpecial !== 5 ||
            !warnings.has(source.id) ||
            controller.advancePlayerAction().length !== 0 ||
            controller.advancePlayerAction().length !== 0
        ) {
            fail(
                "Jumper Dash checker probe rejected its >2..<=4 start, five-turn cooldown, warning, or two complete reaction opportunities.",
            );
        } else {
            const outcome = plain(controller.advancePlayerAction());
            if (
                JSON.stringify(outcome) !== JSON.stringify([{ sourceId: source.id, outcome: "hit-no-progress" }]) ||
                moved !== 1 ||
                warnings.has(source.id) ||
                consumed !== 0 ||
                JSON.stringify(damage) !== JSON.stringify([{ damage: 0.1, type: "tickle" }])
            ) {
                fail(
                    "Jumper Dash checker probe rejected its landing-first certain hit, immediate no-progress bonus, warning cleanup, or progress-only consumption.",
                );
            }
        }

        const blocked = { id: 9102, x: 0, y: 1, hp: 2, Enemy: { name: "Jumper", fullBoundBonus: 2 } };
        sources.set(blocked.id, blocked);
        routeClear = true;
        landingOpen = true;
        playerAtTarget = true;
        controller.begin(blocked, { x: 4, y: 1 });
        controller.advancePlayerAction();
        controller.advancePlayerAction();
        routeClear = false;
        const blockedOutcome = plain(controller.advancePlayerAction());
        if (
            JSON.stringify(blockedOutcome) !== JSON.stringify([{ sourceId: blocked.id, outcome: "failed" }]) ||
            blocked.x !== 0 ||
            blocked.y !== 1 ||
            blocked.castCooldownSpecial !== 5 ||
            warnings.has(blocked.id) ||
            damage.length !== 1
        ) {
            fail(
                "Jumper Dash checker probe allowed a blocked route, remote payload, cooldown refund, movement, or orphan warning.",
            );
        }

        const committed = {
            id: 9103,
            x: 0,
            y: 2,
            hp: 2,
            castCooldownSpecial: 5,
            Enemy: { name: "Jumper", fullBoundBonus: 2 },
        };
        sources.set(committed.id, committed);
        routeClear = true;
        landingOpen = true;
        if (
            !controller.commitCast(committed, { x: 4, y: 2 }).started ||
            committed.castCooldownSpecial !== 5 ||
            !warnings.has(committed.id)
        ) {
            fail(
                "Jumper Dash must commit KD's enemyCast after native specialCD has already started, without re-running the ready-cooldown gate.",
            );
        }
        controller.clearAll("checker");
        if (warnings.has(committed.id)) fail("Jumper Dash committed-cast checker probe left an orphan warning.");
    }
    const spray = spellByName.get("WebSpray");
    const webCaster = enemyByName.get("WebCaster");
    if (
        !spray ||
        spray.minRange !== 0 ||
        !webCaster ||
        webCaster.kite !== 3 ||
        webCaster.kiteChance !== 1 ||
        webCaster.movePoints !== 1.5 ||
        !webCaster.castWhileMoving
    ) {
        fail(
            "WebCaster must kite within three tiles and keep WebSpray usable at adjacent distance, including after movement.",
        );
    }
    const generic = spellByName.get("SpiderWeb");
    const direct = {
        name: "SpiderlingsWebSprayHit",
        provenance: "WebCaster.WebSpray",
        triggerSource: "direct",
        profile: "WebCaster",
        allowInert: true,
    };
    const trail = { ...direct, triggerSource: "trail" };
    if (
        !spray ||
        JSON.stringify(plain(spray.playerEffect)) !== JSON.stringify(direct) ||
        JSON.stringify(plain(spray.trailPlayerEffect)) !== JSON.stringify(trail) ||
        spray.trail !== "lingering" ||
        spray.noTrailOnPlayer !== true
    )
        fail("WebSpray direct/trail provenance contract changed.");
    if (
        !generic ||
        !generic.playerEffect ||
        generic.playerEffect.name !== "TrapBindings" ||
        generic.playerEffect.provenance !== undefined
    )
        fail("generic SpiderWeb no longer stays outside the shared resolver.");
    if (
        typeof state.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind !== "function" ||
        typeof state.context.KDPlayerEffects.SpiderlingsWebSprayHit !== "function"
    )
        fail("shared enemy/WebSpray runtime handlers are missing.");
    if (!webbing || webbing.WEBSPRAY_INACTIVITY_TURNS !== 7)
        fail("WebSpray slow must clear atomically after seven inactive turns.");
    if (
        !errors.some((message) =>
            /route|profiles|selector|Jumper Dash|WebSpray|generic SpiderWeb|handlers/.test(message),
        )
    ) {
        pass(
            "Spinner, Jumper, and provenance-marked WebSpray use the shared resolver; generic SpiderWeb and Nest routes remain isolated.",
        );
    }
}

function checkTranslations(state) {
    const initialErrorCount = errors.length;
    const currentIds = [...families, ...lv2Families, ...lv3Families]
        .map((entry) => entry.id)
        .concat(cocoon.id, "SpiderlingsSpinnerLegbinder");
    const runtimeMessageKeys = [
        "KDModButtonspiderlingsPinkWebbing",
        "KinkyDungeonSpellSpiderlingsJumperDash",
        "KinkyDungeonSpellCastSpiderlingsJumperDash",
        "KinkyDungeonSpiderlingsCocoonAnchored",
    ];
    const escapeMessageKeys = ["SpiderlingsWebbing", "SpiderlingsCocoon"].flatMap((suffix) =>
        ["Cut", "Struggle", "Remove"].flatMap((method) =>
            ["Fail" + suffix, "Fail" + suffix + "Aroused", "Success" + suffix].map(
                (outcome) => "KinkyDungeonStruggle" + method + outcome,
            ),
        ),
    );
    runtimeMessageKeys.push(...escapeMessageKeys);
    runtimeMessageKeys.push("KinkyDungeonStatSpiderlingsCocoonStart", "KinkyDungeonStatDescSpiderlingsCocoonStart");
    runtimeMessageKeys.push(
        ...["Pull", "Contest", "Start", "Win", "Interrupt", "Tired", "Wrap", "Done", "Weave", "Escape"].map(
            (s) => "SpiderlingsSpinner" + s,
        ),
        "KinkyDungeonStatSpiderlingsSpinnerDemo",
        "KinkyDungeonStatDescSpiderlingsSpinnerDemo",
        "NameSpiderlingsSilkAnchor",
        "KillSpiderlingsSilkAnchor",
        "SpiderlingsFieldPreparing",
        "SpiderlingsFieldReady",
        "SpiderlingsFieldSprung",
        "SpiderlingsFieldBroken",
        "SpiderlingsFieldReset",
        "SpiderlingsFieldJumper",
        "SpiderlingsFieldStatus",
        "SpiderlingsFieldRebuild",
        "SpiderlingsFieldWaiting",
        "SpiderlingsFieldAddSpinner",
        "SpiderlingsFieldTrap",
        ...["preparing", "ready", "sprung", "broken", "complete"].map((p) => "SpiderlingsFieldPhase" + p),
    );
    const pairedGateKey = "KinkyDungeonSpiderlingsWebbingLv1Covered";
    for (const localeFile of localeFiles) {
        if (!exists(localeFile)) {
            fail(`translation file is missing: ${localeFile}`);
            continue;
        }
        const entries = parseCsv(localeFile);
        for (const id of currentIds) {
            for (const suffix of ["", "Desc", "Desc2"]) {
                if (!String(entries.get(`Restraint${id}${suffix}`) || "").trim())
                    fail(`${localeFile} is missing Restraint${id}${suffix}.`);
            }
        }
        for (const id of legacyRestraints) {
            for (const suffix of ["", "Desc", "Desc2"]) {
                if (entries.has(`Restraint${id}${suffix}`))
                    fail(`${localeFile} still contains legacy key Restraint${id}${suffix}.`);
            }
        }
        for (const key of runtimeMessageKeys)
            if (!String(entries.get(key) || "").trim()) fail(`${localeFile} is missing ${key}.`);
        for (const key of escapeMessageKeys) {
            if ((String(entries.get(key) || "").match(/TargetRestraint/g) || []).length !== 1)
                fail(`${localeFile} ${key} must retain exactly one TargetRestraint placeholder.`);
        }
        if (!String(entries.get(pairedGateKey) || "").trim()) fail(`${localeFile} is missing ${pairedGateKey}.`);
    }
    const fallbackMissing = currentIds
        .flatMap((id) => ["", "Desc", "Desc2"].map((suffix) => `Restraint${id}${suffix}`))
        .concat(runtimeMessageKeys, pairedGateKey)
        .filter((key) => !String(state.texts[key] || "").trim());
    if (fallbackMissing.length) fail(`English fallback keys are missing: ${fallbackMissing.join(", ")}`);
    if (errors.length === initialErrorCount) {
        pass(
            "English fallbacks and all seven locales cover twenty-five restraint text triplets, paired outer-layer gates, and the Spinner demo actions.",
        );
    }
}

function parseZip(zipPath) {
    const data = fs.readFileSync(zipPath);
    let eocd = -1;
    for (let index = data.length - 22; index >= Math.max(0, data.length - 65558); index -= 1) {
        if (data.readUInt32LE(index) === 0x06054b50) {
            eocd = index;
            break;
        }
    }
    if (eocd < 0) throw new Error("end-of-central-directory record not found");
    const count = data.readUInt16LE(eocd + 10);
    let offset = data.readUInt32LE(eocd + 16);
    const entries = new Map();
    for (let index = 0; index < count; index += 1) {
        if (data.readUInt32LE(offset) !== 0x02014b50) throw new Error("invalid central-directory header");
        const method = data.readUInt16LE(offset + 10);
        const compressedSize = data.readUInt32LE(offset + 20);
        const fileNameLength = data.readUInt16LE(offset + 28);
        const extraLength = data.readUInt16LE(offset + 30);
        const commentLength = data.readUInt16LE(offset + 32);
        const localOffset = data.readUInt32LE(offset + 42);
        const name = data
            .slice(offset + 46, offset + 46 + fileNameLength)
            .toString("utf8")
            .replace(/\\/g, "/");
        entries.set(name, { name, method, compressedSize, localOffset });
        offset += 46 + fileNameLength + extraLength + commentLength;
    }
    return { data, entries };
}

function extractEntryBytes(zip, entry) {
    const offset = entry.localOffset;
    if (zip.data.readUInt32LE(offset) !== 0x04034b50) throw new Error(`invalid local header for ${entry.name}`);
    const fileNameLength = zip.data.readUInt16LE(offset + 26);
    const extraLength = zip.data.readUInt16LE(offset + 28);
    const start = offset + 30 + fileNameLength + extraLength;
    const compressed = zip.data.slice(start, start + entry.compressedSize);
    if (entry.method === 0) return compressed;
    if (entry.method === 8) return zlib.inflateRawSync(compressed);
    throw new Error(`unsupported compression method ${entry.method}`);
}

function extractTextEntry(zip, entry) {
    return extractEntryBytes(zip, entry).toString("utf8");
}

function checkReleaseZip(manifest) {
    if (!manifest || !manifest.modbuild) return;
    let zipName;
    try {
        zipName = parseReleaseVersion(manifest.modbuild).packageName;
    } catch {
        return;
    } // loadManifest already reports invalid versions.

    const zipPath = path.join(workspaceRoot, zipName);
    if (!fs.existsSync(zipPath)) {
        note(`${zipName} is absent; this run checks the source package without certifying an installable ZIP.`);
        return;
    }
    let zip;
    try {
        zip = parseZip(zipPath);
    } catch (error) {
        fail(`${zipName} is unreadable: ${error.message}`);
        return;
    }
    const expected = ["mod.json", ...manifest.fileorder, ...localeFiles].sort();
    const actual = [...zip.entries.keys()].sort();
    if (JSON.stringify(actual) !== JSON.stringify(expected))
        fail(`${zipName} entries do not exactly match the manifest allowlist plus locales.`);
    for (const name of actual) {
        if (name.startsWith("/") || name.includes("\\") || name.includes("../") || name.startsWith("tools/"))
            fail(`${zipName} contains unsafe/development entry ${name}.`);
    }
    for (const name of expected.filter((entry) => !entry.toLowerCase().endsWith(".png"))) {
        const packed = zip.entries.get(name);
        const sourcePath = path.join(modRoot, ...name.split("/"));
        try {
            if (!packed || !fs.readFileSync(sourcePath).equals(extractEntryBytes(zip, packed))) {
                fail(`${zipName} contains stale non-PNG entry ${name}.`);
            }
        } catch (error) {
            fail(`${zipName} non-PNG entry ${name} cannot be compared: ${error.message}`);
        }
    }
    const packedManifestEntry = zip.entries.get("mod.json");
    if (packedManifestEntry) {
        try {
            const packedManifest = JSON.parse(extractTextEntry(zip, packedManifestEntry).replace(/^\uFEFF/, ""));
            if (
                packedManifest.modbuild !== manifest.modbuild ||
                JSON.stringify(packedManifest.fileorder) !== JSON.stringify(manifest.fileorder)
            ) {
                fail(`${zipName} contains a stale manifest contract.`);
            }
        } catch (error) {
            fail(`${zipName} mod.json cannot be parsed: ${error.message}`);
        }
    }
    if (!errors.some((message) => message.includes(zipName)))
        pass(
            `${zipName} contains exactly ${expected.length} allowlisted entries and current non-PNG payloads; PNG payloads were not inspected.`,
        );
}

function main() {
    console.log(`Spiderlings mod check: ${modRoot}`);
    console.log(`Reference game package: ${gameRoot} (read-only)`);
    checkProjectInputs();
    const manifest = loadManifest();
    checkRuntimeTrees();
    checkOfficialSkirtBoundary();
    checkTextureAtlas();
    checkTextureAtlas(true);
    checkSyntax();
    const state = loadRuntime();
    checkRuntime(state);
    checkRouting(state);
    checkTranslations(state);
    checkReleaseZip(manifest);
    console.log("");
    console.log(`Summary: ${errors.length} error(s), ${warnings.length} warning(s), ${notes.length} note(s).`);
    if (errors.length) process.exit(1);
}

main();
