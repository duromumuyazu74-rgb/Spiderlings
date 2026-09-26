"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./helpers/lifecycle-runtime.js");

function runtime() {
    const board = {},
        sprites = new Map(),
        draws = [],
        mage = { id: 7, hp: 3, Enemy: { name: "MageSpiderlings" } },
        webCaster = { id: 8, hp: 1, Enemy: { name: "WebCaster" } },
        context = {
            KinkyDungeonRootDirectory: "Game/",
            KDMapData: { Entities: [mage, webCaster] },
            KDEventMapGeneric: {},
            kdpixisprites: sprites,
            PIXI: {
                Filter: class {
                    constructor(vertex, fragment) {
                        this.vertex = vertex;
                        this.fragment = fragment;
                    }
                },
                SCALE_MODES: { NEAREST: 0 },
                BLEND_MODES: { NORMAL: 0, ADD: 1 },
            },
            KDAddEvent(events, trigger, name, handler) {
                (events[trigger] ||= {})[name] = handler;
            },
            KinkyDungeonCastSpell() {
                return { result: context.castResult || "Cast" };
            },
            KDDraw(parent, map, id, image, x, y, width, height, _rotation, options) {
                const sprite = {
                    parent,
                    texture: { baseTexture: {} },
                    position: { x, y },
                    width,
                    height,
                    scale: { x: id === "spr_7" && mage.flip ? -1 : 1 },
                    zIndex: options?.zIndex || 0,
                    blendMode: options?.blendMode,
                };
                map.set(id, sprite);
                draws.push({ id, image, sprite });
                return sprite;
            },
            KDDrawEnemySprite(parent, enemy, _tx, _ty, _camX, _camY, _staticView, _zIndex, id = "") {
                context.KDDraw(
                    parent,
                    sprites,
                    `spr_${enemy.id}${id}`,
                    `Game/Enemies/${enemy.Enemy.name}.png`,
                    144,
                    216,
                    72,
                    72,
                );
                return enemy.Enemy.name;
            },
        };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsMageVisuals.js"), "utf8"), context, {
        filename: "SpiderlingsMageVisuals.js",
    });
    return { context, board, draws, mage, webCaster };
}

test("Mage is plain at rest and successful rune and attack casts use distinct layered art", () => {
    const { context, board, draws, mage, webCaster } = runtime();
    const draw = () => {
        draws.length = 0;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        return draws.map((entry) => entry.image);
    };

    assert.deepEqual(draw(), ["Game/Enemies/MageSpiderlings.png"]);
    assert.equal(draws[0].sprite.filters.length, 1, "the opaque export matte is keyed on the base sprite");
    assert.match(draws[0].sprite.filters[0].fragment, /58\.0 \/ 255\.0/);
    assert.equal(draws[0].sprite.texture.baseTexture.scaleMode, 0);
    const unrelated = context.KDDraw(board, context.kdpixisprites, "other", "Game/Enemies/WebCaster.png", 0, 0, 72, 72);
    assert.equal(unrelated.filters, undefined);

    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageRune" }, mage);
    assert.deepEqual(draw(), [
        "Game/Enemies/MageSpiderlings.png",
        "Game/Enemies/MageSpiderlingsSpellParticles.png",
        "Game/Enemies/MageSpiderlingsSubtleGlow.png",
    ]);
    assert.ok(draws.every((entry) => entry.sprite.filters?.length === 1));
    assert.ok(draws.every((entry) => entry.sprite.position.x === 144 && entry.sprite.position.y === 216));
    assert.ok(draws[0].sprite.zIndex < draws[1].sprite.zIndex && draws[1].sprite.zIndex < draws[2].sprite.zIndex);
    assert.equal(draws[1].sprite.blendMode, 0);
    assert.equal(draws[2].sprite.blendMode, 1);

    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageBolt" }, mage);
    assert.deepEqual(draw().at(-1), "Game/Enemies/MageSpiderlingsReallyGlowy.png");
    mage.flip = true;
    draw();
    assert.ok(draws.every((entry) => entry.sprite.scale.x < 0));

    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageRune" }, webCaster);
    assert.deepEqual(draw().at(-1), "Game/Enemies/MageSpiderlingsReallyGlowy.png");
});

test("failed casts do not light Mage and the cast layers expire after their turn window", () => {
    const { context, board, draws, mage } = runtime();
    context.castResult = "Fail";
    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageRune" }, mage);
    context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
    assert.equal(draws.length, 1);

    context.castResult = "Cast";
    context.KinkyDungeonCastSpell(5, 5, { name: "AnotherMageSpell" }, mage);
    draws.length = 0;
    context.KDEventMapGeneric.tickAfter.SpiderlingsMageVisuals(null, { delta: 1 });
    context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
    assert.equal(draws.length, 3);
    assert.equal(draws[2].image, "Game/Enemies/MageSpiderlingsReallyGlowy.png");

    draws.length = 0;
    context.KDEventMapGeneric.tickAfter.SpiderlingsMageVisuals(null, { delta: 1 });
    context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
    assert.deepEqual(
        draws.map((entry) => entry.image),
        ["Game/Enemies/MageSpiderlings.png"],
    );
});

test("the supplied Mage artwork and each cast layer retain 72-pixel native enemy dimensions", () => {
    for (const name of [
        "MageSpiderlings.png",
        "MageSpiderlingsSpellParticles.png",
        "MageSpiderlingsSubtleGlow.png",
        "MageSpiderlingsReallyGlowy.png",
    ]) {
        const bytes = fs.readFileSync(path.join(modRoot, "Enemies", name));
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        assert.equal(bytes.readUInt32BE(16), 72);
        assert.equal(bytes.readUInt32BE(20), 72);
    }
});
