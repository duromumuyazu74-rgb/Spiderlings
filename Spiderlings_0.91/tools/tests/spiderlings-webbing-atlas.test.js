"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const modRoot = path.join(__dirname, "..", "..");
const expectedFrames = [
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
];
const atlasFiles = [
    "TextureAtlas/spiderlings-webbing-0.png",
    "TextureAtlas/spiderlings-webbing-0.json",
    "TextureAtlas/spiderlings-webbing-pink-0.png",
    "TextureAtlas/spiderlings-webbing-pink-0.json",
];

const pinkFrames = expectedFrames.map((path) => path.replace(/(SpiderlingsWebbing(?:Lv[123]|Cocoon))\//, "$1Pink/"));
for (const [atlasName, frames] of [
    ["spiderlings-webbing-0", expectedFrames],
    ["spiderlings-webbing-pink-0", pinkFrames],
]) {
    test(`${atlasName} records restoration metadata for twenty-five frames on one losslessly trimmed page`, () => {
        const atlasJsonPath = path.join(modRoot, "TextureAtlas", `${atlasName}.json`);
        const atlasPngPath = path.join(modRoot, "TextureAtlas", `${atlasName}.png`);
        assert.equal(fs.existsSync(atlasJsonPath), true, "atlas JSON is missing");
        assert.equal(fs.existsSync(atlasPngPath), true, "atlas PNG is missing");

        const atlas = JSON.parse(fs.readFileSync(atlasJsonPath, "utf8"));
        assert.deepEqual(Object.keys(atlas.frames), frames);
        assert.deepEqual(atlas.meta, {
            app: "Spiderlings lossless Webbing atlas builder",
            version: "1.0",
            image: `${atlasName}.png`,
            format: "RGBA8888",
            size: { w: 4096, h: 4096 },
            scale: "1",
        });

        for (const runtimePath of frames) {
            const entry = atlas.frames[runtimePath];
            assert.equal(entry.rotated, false, runtimePath);
            assert.equal(entry.trimmed, true, runtimePath);
            const values = [
                entry.frame.x,
                entry.frame.y,
                entry.frame.w,
                entry.frame.h,
                entry.sourceSize.w,
                entry.sourceSize.h,
                entry.spriteSourceSize.x,
                entry.spriteSourceSize.y,
                entry.spriteSourceSize.w,
                entry.spriteSourceSize.h,
            ];
            assert.equal(values.every(Number.isInteger), true, runtimePath);
            assert.equal(entry.frame.w > 0 && entry.frame.h > 0, true, runtimePath);
            assert.equal(entry.sourceSize.w > 0 && entry.sourceSize.h > 0, true, runtimePath);
            assert.equal(entry.spriteSourceSize.w, entry.frame.w, runtimePath);
            assert.equal(entry.spriteSourceSize.h, entry.frame.h, runtimePath);
            assert.equal(entry.frame.x >= 0 && entry.frame.y >= 0, true, runtimePath);
            assert.equal(entry.frame.x + entry.frame.w <= 4096, true, runtimePath);
            assert.equal(entry.frame.y + entry.frame.h <= 4096, true, runtimePath);
            assert.equal(entry.spriteSourceSize.x >= 0 && entry.spriteSourceSize.y >= 0, true, runtimePath);
            assert.equal(entry.spriteSourceSize.x + entry.spriteSourceSize.w <= entry.sourceSize.w, true, runtimePath);
            assert.equal(entry.spriteSourceSize.y + entry.spriteSourceSize.h <= entry.sourceSize.h, true, runtimePath);
        }

        const mittenFrames = frames.filter((entry) => /Mitten/.test(entry));
        assert.deepEqual(
            mittenFrames,
            ["Models/SpiderlingsWebbingLv1/MittenLeft.png", "Models/SpiderlingsWebbingLv1/MittenRight.png"].map(
                (path) => (atlasName.includes("pink") ? path.replace("Lv1/", "Lv1Pink/") : path),
            ),
            "only Lv1 has mitten artwork",
        );
    });
}

test("the 0.92.36-test.11 manifest publishes displacement maps and the atlas before scripts while retaining every direct fallback", () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    assert.equal(manifest.modbuild, "0.92.36-test.11");
    assert.equal(
        manifest.author,
        "Art assets: T_Swizzle; Original mod author: anthropocentricity; Reset author: Chlorlne",
    );
    assert.deepEqual(
        manifest.fileorder.filter((entry) => entry.startsWith("TextureAtlas/")),
        atlasFiles,
    );

    const firstScript = manifest.fileorder.findIndex((entry) => /\.(?:js|ks)$/.test(entry));
    for (const runtimePath of [...expectedFrames, ...pinkFrames]) {
        assert.notEqual(manifest.fileorder.indexOf(runtimePath), -1, `${runtimePath} fallback is missing`);
        assert.equal(manifest.fileorder.indexOf(runtimePath) < firstScript, true, runtimePath);
    }
    for (const atlasPath of atlasFiles) {
        assert.equal(manifest.fileorder.indexOf(atlasPath) < firstScript, true, atlasPath);
    }
});

test("atlas packing fills the space beside a tall frame while preserving the one-pixel gap", () => {
    const script = `
import importlib.util
import sys
spec = importlib.util.spec_from_file_location("atlas_builder", sys.argv[1])
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
builder.ATLAS_SIZE = 10
sources = [
    {"runtime_path": "tall", "width": 4, "height": 6},
    {"runtime_path": "small-a", "width": 2, "height": 2},
    {"runtime_path": "small-b", "width": 2, "height": 2},
]
placements = builder.pack(sources)
assert placements == {"tall": (1, 1), "small-a": (7, 1), "small-b": (7, 5)}, placements
assert builder.pack(list(reversed(sources))) == placements
`;
    execFileSync("python", ["-B", "-c", script, path.join(modRoot, "tools", "build-spiderlings-atlas.py")], {
        encoding: "utf8",
    });
});
