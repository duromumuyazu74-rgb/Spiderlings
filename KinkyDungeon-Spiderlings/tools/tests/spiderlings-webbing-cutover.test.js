"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const modRoot = path.join(__dirname, "..", "..");
const csvFiles = ["CN", "DE", "ES", "JP", "KR", "PL", "RU"].map((locale) => `Spiderlings${locale}.csv`);
const scripts = [
    "SpiderlingsCore.js",
    "SpiderlingsEncounters.js",
    "SpiderlingsWebCaster.js",
    "SpiderlingsModelRuntime.js",
    "Spiderlings.js",
    "SpiderlingsInfestation.js",
    "SpiderlingsCombat.js",
    "SpiderlingsMage.js",
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
    "SpiderlingsSpinnerRollout.js",
    "SpiderlingsSpinnerRuntime.js",
];
const assets = [
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
    "Enemies/MageSpiderlings.png",
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
    "DisplacementMaps/SpiderlingsWebbingLv2ArmSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2BellySquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2LegsSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2AnklesSquish.png",
    "DisplacementMaps/SpiderlingsWebbingLv2FootSquish.png",
    "TextureAtlas/spiderlings-webbing-0.png",
    "TextureAtlas/spiderlings-webbing-0.json",
    "TextureAtlas/spiderlings-webbing-pink-0.png",
    "TextureAtlas/spiderlings-webbing-pink-0.json",
    "Sounds/webs-sweep-away-by-hand-001_01.ogg",
    "Sounds/webs-sweep-away-by-hand-002_01.ogg",
    "Sounds/webs-sweep-away-by-hand-003_01.ogg",
    "Sounds/webs-sweep-away-by-hand-004_01.ogg",
];
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
const heavySprites = [
    "AnklesClosed",
    "AnklesHogtie",
    "AnklesKneelClosed",
    "ArmLeftBoxtie",
    "ArmLeftCrossed",
    "ArmLeftWristtie",
    "ArmRightBoxtie",
    "ArmRightCrossed",
    "ArmRightWristtie",
    "BottomClosed",
    "BottomHogtie",
    "BottomKneel",
    "BottomKneelClosed",
    "Chest",
    "Collar",
    "FeetClosed",
    "FeetHogtie",
    "FeetKneel",
    "HandLeftBoxtie",
    "HandLeftCrossed",
    "HandLeftFree",
    "HandLeftFront",
    "HandLeftUp",
    "HandLeftWristtie",
    "HandLeftYoked",
    "HandRightBoxtie",
    "HandRightCrossed",
    "HandRightFree",
    "HandRightFront",
    "HandRightUp",
    "HandRightWristtie",
    "HandRightYoked",
    "LegsClosed",
    "LegsHogtie",
    "LegsKneel",
    "LegsKneelClosed",
    "RightLegsClosed",
    "RightLegsHogtie",
    "RightLegsKneel",
    "RightLegsKneelClosed",
    "TopBoxtie",
    "TopCrossed",
    "TopWristtie",
];
const retiredModelAssets = [
    ...heavySprites.map((name) => `Models/SpiderlingsWebHeavy/${name}.png`),
    "Models/SpiderlingsWebHeavy/LooseWebbing.png",
    "Models/SpiderlingsWebHeavy/LooseWebbingCocoon1.png",
    "Models/SpiderlingsWebHeavy/LooseWebbingCocoon2.png",
    "Models/SpiderlingsWebHeavy/LooseWebbingCocoon3.png",
    "Models/SpiderlingsWebHeavy/LooseWebbingCocoon4.png",
    "Models/Blindfold/Tape-spiderlings.png",
    "Models/GagTape/Cleave-spiderlings.png",
    "Models/GagTape/Face-spiderlings.png",
    "Models/GagTape/Full-spiderlings.png",
    "Models/GagTape/Stuffing-spiderlings.png",
    "Models/GagTape/Wrap-spiderlings.png",
];

function read(relativePath) {
    return fs.readFileSync(path.join(modRoot, relativePath), "utf8").replace(/^\uFEFF/, "");
}

function csvMap(relativePath) {
    return new Map(
        read(relativePath)
            .split(/\r?\n/)
            .filter(Boolean)
            .map((line) => {
                const comma = line.indexOf(",");
                return [line.slice(0, comma), line.slice(comma + 1)];
            }),
    );
}

test("the manifest is an exact atlas-first allowlist with direct fallback and no legacy startup path", () => {
    const manifest = JSON.parse(read("mod.json"));
    assert.deepEqual(manifest.fileorder, [...assets, ...scripts]);
    for (const relativePath of manifest.fileorder)
        assert.equal(fs.existsSync(path.join(modRoot, relativePath)), true, relativePath);
    assert.deepEqual(
        manifest.fileorder.filter((entry) => entry.startsWith("TextureAtlas/")),
        [
            "TextureAtlas/spiderlings-webbing-0.png",
            "TextureAtlas/spiderlings-webbing-0.json",
            "TextureAtlas/spiderlings-webbing-pink-0.png",
            "TextureAtlas/spiderlings-webbing-pink-0.json",
        ],
    );
    assert.equal(
        manifest.fileorder.some((entry) =>
            /LooseWebbing|WebHeavy|GagTape|^Models\/Blindfold\/|TestPlaceholder/.test(entry),
        ),
        false,
    );
});

test("all 54 retired model PNGs, the old Cocoon source, retired displacement, scripts, atlas, and tools are absent", () => {
    assert.equal(retiredModelAssets.length, 54);
    const retiredPaths = [
        "Bullets/WebCast.png",
        "Bullets/WebCastHit.png",
        "Enemies/SpinnerOLD.png",
        ...retiredModelAssets,
        "Models/SpiderlingsWebHeavy/LooseWebbingCocoon5.png",
        "Models/SpiderlingsWebbingDebug/TestPlaceholder.png",
        "Models/SpiderlingsWebbingLv1/Mittens.png",
        "Models/SpiderlingsWebbingLv2/MittenLeft.png",
        "Models/SpiderlingsWebbingLv2/MittenRight.png",
        "Models/SpiderlingsWebbingLv2/Stuffing.png",
        "Models/SpiderlingsWebbingLv2/Gag.png",
        "DisplacementMaps/TapeAnklesSquishClosed.png",
        "SpiderlingsLooseWebbing.js",
        "SpiderlingsWebHeavyModels.js",
        "TextureAtlas/spiderlings-0.json",
        "TextureAtlas/spiderlings-0.png",
        "TextureAtlas/spiderlings-1.json",
        "TextureAtlas/spiderlings-1.png",
        "TextureAtlas/spiderlings-2.json",
        "TextureAtlas/spiderlings-2.png",
        "tools/adapt-spiderlings-hand-sprites.py",
        "tools/tests/spiderlings-silk-progression.test.js",
    ];
    for (const relativePath of retiredPaths)
        assert.equal(fs.existsSync(path.join(modRoot, relativePath)), false, relativePath);
    for (const relativePath of assets)
        assert.equal(fs.existsSync(path.join(modRoot, relativePath)), true, relativePath);
});

test("legacy IDs, five-module exports, upgrade APIs, and the TrapBindings wrapper are gone", () => {
    const core = read("SpiderlingsCore.js");
    const data = read("Spiderlings.js");
    const webbing = read("SpiderlingsWebbing.js");
    const runtimeSources = scripts.map(read).join("\n");

    assert.doesNotMatch(core, /SilkProgression|LOOSE_WEBBING|ONE_ACTION_ESCAPE_CHANCE/);
    assert.doesNotMatch(
        runtimeSources,
        /SpiderlingsLooseWebbingUpgrade|SpiderlingsApplyLooseWebbingSlow|SpiderlingsClearLooseWebbingSlow/,
    );
    assert.doesNotMatch(runtimeSources, /KDPlayerEffects\s*\.\s*TrapBindings\s*=/);
    for (const id of legacyRestraints) {
        assert.equal(new RegExp(`createRestraint\\(\\{[^}]*name:\\s*["']${id}["']`).test(runtimeSources), false, id);
    }
    assert.match(data, /name:\s*"SpiderWeb"[\s\S]*?playerEffect:\s*\{\s*name:\s*"TrapBindings"/);
    assert.doesNotMatch(data.match(/name:\s*"SpiderWeb"[\s\S]*?\}\s*,/)[0], /WebCaster\.WebSpray/);
    assert.match(webbing, /ENEMY_PROFILES/);
});

test("seven locale files contain the current restraint and Mage text", () => {
    const current = [
        "SpiderlingsSpinnerLegbinder",
        "SpiderlingsWebbingLv1Arm",
        "SpiderlingsWebbingLv1MittenLeft",
        "SpiderlingsWebbingLv1MittenRight",
        "SpiderlingsWebbingLv1Belly",
        "SpiderlingsWebbingLv1Legs",
        "SpiderlingsWebbingLv1Ankles",
        "SpiderlingsWebbingLv1Foot",
        "SpiderlingsWebbingLv1Blindfold",
        "SpiderlingsWebbingLv1Stuffing",
        "SpiderlingsWebbingLv1Gag",
        "SpiderlingsWebbingCocoon",
        "SpiderlingsWebbingLv2Arm",
        "SpiderlingsWebbingLv2Belly",
        "SpiderlingsWebbingLv2Legs",
        "SpiderlingsWebbingLv2Ankles",
        "SpiderlingsWebbingLv2Foot",
        "SpiderlingsWebbingLv3Arm",
        "SpiderlingsWebbingLv3Belly",
        "SpiderlingsWebbingLv3Legs",
        "SpiderlingsWebbingLv3Ankles",
        "SpiderlingsWebbingLv3Foot",
        "SpiderlingsWebbingLv3Blindfold",
        "SpiderlingsWebbingLv3Gag",
        "SpiderlingsWebbingLv3Hood",
    ];
    for (const csv of csvFiles) {
        const entries = csvMap(csv);
        assert.equal(entries.size, 196, `${csv}: current release text set including Mage combat`);
        for (const key of [
            "KinkyDungeonStatSpiderlingsCocoonStart",
            "KinkyDungeonStatDescSpiderlingsCocoonStart",
            "KinkyDungeonSpellCastSpiderlingsJumperDashNPC",
            "NameMageSpiderlings",
            "KillMageSpiderlings",
            "KinkyDungeonSpellSpiderlingsMageBolt",
            "KinkyDungeonSpellCastSpiderlingsMageBolt",
            "RestraintSpiderlingsMageArmSigil",
            "RestraintSpiderlingsMageArmSigilDesc",
            "RestraintSpiderlingsMageArmSigilDesc2",
        ]) {
            assert.ok(entries.get(key)?.trim(), `${csv}: ${key}`);
        }
        assert.deepEqual([...entries.keys()].sort(), [...csvMap(csvFiles[0]).keys()].sort(), `${csv}: locale keys`);
        for (const key of [
            "AttackTunneler",
            "AttackTunnelerBind",
            "AttackNestEntrance",
            "AttackNestEntranceBind",
            "AttackWebCaster",
            "AttackWebCasterBind",
            "KinkyDungeonSpellWebCast",
            "KinkyDungeonSpellCastWebCast",
            "KinkyDungeonSpellWebCastDamage",
            "KinkyDungeonSpellWebCastBind",
            "KinkyDungeonSpellShatterWebCast",
        ]) {
            assert.equal(entries.has(key), false, `${csv}: retired text ${key}`);
        }
        for (const id of current) {
            for (const suffix of ["", "Desc", "Desc2"]) {
                assert.notEqual(
                    String(entries.get(`Restraint${id}${suffix}`) || "").trim(),
                    "",
                    `${csv}:${id}${suffix}`,
                );
            }
        }
        for (const id of legacyRestraints) {
            for (const suffix of ["", "Desc", "Desc2"])
                assert.equal(entries.has(`Restraint${id}${suffix}`), false, `${csv}:${id}${suffix}`);
        }
        assert.notEqual(
            String(entries.get("KinkyDungeonSpiderlingsWebbingLv1Covered") || "").trim(),
            "",
            `${csv}:paired outer-layer gate`,
        );
    }
});

test("the release builder regenerates the explicit atlas then packages only manifest and locale entries", () => {
    const builder = read("tools/build-spiderlings-release.ps1");
    assert.match(builder, /fileorder/);
    assert.match(builder, /SpiderlingsCN\.csv/);
    assert.match(builder, /build-spiderlings-atlas\.py/);
    assert.match(builder, /\[switch\]\$Force/);
    assert.match(builder, /already exists[\s\S]*-Force/);
    assert.match(builder, /\[switch\]\$VerifyOnly/);
    assert.match(builder, /Test-ReleasePackage/);
    assert.match(builder, /Release entry differs from source/);
    assert.match(builder, /\.Spiderlings-package-/);
    assert.doesNotMatch(builder, /Get-ChildItem[^\r\n]*(Models|TextureAtlas)/);
});
