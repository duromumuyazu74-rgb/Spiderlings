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
            CommonTime: () => context.time || 0,
            KinkyDungeonRootDirectory: "Game/",
            KDMapData: { Entities: [mage, webCaster], Bullets: [] },
            KinkyDungeonCurrentTick: 0,
            KDEventMapGeneric: {},
            kdpixisprites: sprites,
            PIXI: {
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
                const previous = map.get(id);
                const sprite = {
                    parent,
                    texture: { baseTexture: {} },
                    position: { x, y },
                    width,
                    height,
                    scale: { x: previous?.scale.x || 1 },
                    zIndex: options?.zIndex || 0,
                    blendMode: options?.blendMode,
                    alpha: options?.alpha,
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
                sprites.get(`spr_${enemy.id}${id}`).scale.x = enemy.flip ? -1 : 1;
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

test("Mage uses the regular rune at rest and transparent cast layers without chroma keying", () => {
    const { context, board, draws, mage, webCaster } = runtime();
    const draw = () => {
        draws.length = 0;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        return draws.map((entry) => entry.image);
    };

    assert.deepEqual(draw(), ["Game/Enemies/MageSpiderlings.png", "Game/Enemies/MageSpiderlingsRegular.png"]);
    assert.equal(draws[0].sprite.filters, undefined, "the transparent body needs no chroma-key filter");
    assert.equal(draws[0].sprite.texture.baseTexture.scaleMode, 0);
    assert.equal(draws[1].sprite.filters, undefined, "the regular rune keeps its supplied alpha and colors");
    assert.equal(draws[1].sprite.blendMode, 0);
    assert.equal(draws[1].sprite.texture.baseTexture.scaleMode, 0);
    const unrelated = context.KDDraw(board, context.kdpixisprites, "other", "Game/Enemies/WebCaster.png", 0, 0, 72, 72);
    assert.equal(unrelated.filters, undefined);

    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageRune" }, mage);
    assert.deepEqual(draw(), [
        "Game/Enemies/MageSpiderlings.png",
        "Game/Enemies/MageSpiderlingsRegular.png",
        "Game/Enemies/MageSpiderlingsSpellParticles.png",
        "Game/Enemies/MageSpiderlingsSubtleGlow.png",
    ]);
    assert.ok(draws.every((entry) => entry.sprite.filters === undefined));
    assert.ok(draws.every((entry) => entry.sprite.position.x === 144 && entry.sprite.position.y === 216));
    assert.ok(draws[0].sprite.zIndex < draws[1].sprite.zIndex && draws[1].sprite.zIndex < draws[2].sprite.zIndex);
    assert.equal(draws[1].sprite.blendMode, 0);
    assert.equal(draws[2].sprite.blendMode, 0);
    assert.equal(draws[3].sprite.blendMode, 1);

    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageBolt" }, mage);
    assert.deepEqual(draw().at(-1), "Game/Enemies/MageSpiderlingsReallyGlowy.png");
    mage.flip = true;
    draw();
    assert.ok(draws.every((entry) => entry.sprite.scale.x < 0));

    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageRune" }, webCaster);
    assert.deepEqual(draw().at(-1), "Game/Enemies/MageSpiderlingsReallyGlowy.png");
});

test("failed casts stay dark and successful casts glow for one complete world turn", () => {
    const { context, board, draws, mage } = runtime();
    const draw = () => {
        draws.length = 0;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        return draws;
    };
    const tick = (delta = 1) => {
        context.KinkyDungeonCurrentTick += delta;
        for (const handler of Object.values(context.KDEventMapGeneric.tickAfter || {})) handler({}, { delta });
    };
    context.castResult = "Fail";
    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageRune" }, mage);
    assert.equal(draw().length, 2);
    context.castResult = "Cast";
    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageBolt" }, mage);
    tick(); // The cast's own native turn ends before its first frame.
    context.time = 10000;
    assert.equal(draw().at(-1).image, "Game/Enemies/MageSpiderlingsReallyGlowy.png");
    assert.equal(draws.at(-1).sprite.alpha, 1);
    tick(0);
    assert.equal(draw().length, 4);
    // A repeated notification of the same native turn cannot consume it twice.
    for (const handler of Object.values(context.KDEventMapGeneric.tickAfter || {})) handler({}, { delta: 1 });
    assert.equal(draw().length, 4);
    tick();
    assert.equal(draw().length, 2);
});

test("the supplied Mage artwork and each cast layer retain 72-pixel native enemy dimensions", () => {
    for (const name of [
        "MageSpiderlings.png",
        "MageSpiderlingsRegular.png",
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

test("cached abdomen layers follow both facing changes and stay on the body's transform", () => {
    const { context, board, draws, mage } = runtime();
    for (const flip of [false, true, false, true, false]) {
        mage.flip = flip;
        draws.length = 0;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        assert.ok(draws.every(({ sprite }) => sprite.scale.x === draws[0].sprite.scale.x));
        assert.ok(draws.every(({ sprite }) => sprite.position.x === draws[0].sprite.position.x));
    }
});

test("Mage cast glow remains visible when the paid turn delays its first frame", () => {
    const { context, board, draws, mage } = runtime();
    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageBolt" }, mage);
    context.time = 600;
    context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
    assert.equal(draws.at(-1).image, "Game/Enemies/MageSpiderlingsReallyGlowy.png");
    assert.equal(draws.at(-1).sprite.alpha, 1);
});

test("pending owned Hex, Collapse and mark bursts keep the body glowing until resolution", () => {
    for (const [list, deadline] of [
        ["fields", "activateAt"],
        ["collapses", "explodeAt"],
        ["blasts", "detonateAt"],
    ]) {
        const { context, board, draws, mage } = runtime();
        const state = (context.KDMapData.SpiderlingsMageSpells = { clock: 3, fields: [], collapses: [], blasts: [] });
        state[list].push({ ownerId: mage.id, [deadline]: 5 });
        context.time = 30000;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        assert.equal(draws.at(-1).image, "Game/Enemies/MageSpiderlingsReallyGlowy.png", list);
        state.clock = 5;
        draws.length = 0;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        assert.equal(draws.length, 2, list);
        state.clock = 3;
        state[list][0].ownerId = 99;
        draws.length = 0;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        assert.equal(draws.length, 2, "Another Mage's pending effect cannot light this body");
    }
});

test("Rune placement and triggered warnings glow, while a dormant trap does not", () => {
    const { context, board, draws, mage } = runtime();
    const rune = {
        time: 100,
        SpiderlingsRunePhase: "placing",
        bullet: { source: mage.id, spell: { name: "SpiderlingsMageRune" } },
    };
    context.KDMapData.Bullets.push(rune);
    for (const phase of ["placing", "triggered", "armed"]) {
        rune.SpiderlingsRunePhase = phase;
        draws.length = 0;
        context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
        assert.equal(draws.length, phase === "armed" ? 2 : 4);
    }
    rune.SpiderlingsRunePhase = "triggered";
    rune.time = 0;
    draws.length = 0;
    context.KDDrawEnemySprite(board, mage, 2, 3, 0, 0);
    assert.equal(draws.length, 2);
});

test("native save cloning preserves the one-turn glow and a later cast renews it", () => {
    const { context, board, draws, mage } = runtime();
    const tick = () => {
        context.KinkyDungeonCurrentTick++;
        for (const handler of Object.values(context.KDEventMapGeneric.tickAfter || {})) handler({}, { delta: 1 });
    };
    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageBolt" }, mage);
    tick();
    const restored = JSON.parse(JSON.stringify(mage));
    context.KDMapData.Entities[0] = restored;
    context.KDDrawEnemySprite(board, restored, 2, 3, 0, 0);
    assert.equal(draws.at(-1).image, "Game/Enemies/MageSpiderlingsReallyGlowy.png");
    context.KinkyDungeonCastSpell(5, 5, { name: "SpiderlingsMageRune" }, restored);
    tick();
    draws.length = 0;
    context.KDDrawEnemySprite(board, restored, 2, 3, 0, 0);
    assert.equal(draws.at(-1).image, "Game/Enemies/MageSpiderlingsSubtleGlow.png");
    tick();
    draws.length = 0;
    context.KDDrawEnemySprite(board, restored, 2, 3, 0, 0);
    assert.equal(draws.length, 2);
});
