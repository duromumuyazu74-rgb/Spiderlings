"use strict";

(() => {
    const MAGE = "MageSpiderlings";
    const RUNE = "SpiderlingsMageRune";
    const DISPLAY_MS = 240;
    const BODY = "Enemies/MageSpiderlings.png";
    const REGULAR = "Enemies/MageSpiderlingsRegular.png";
    const PARTICLES = "Enemies/MageSpiderlingsSpellParticles.png";
    const GLOWS = Object.freeze({
        rune: "Enemies/MageSpiderlingsSubtleGlow.png",
        attack: "Enemies/MageSpiderlingsReallyGlowy.png",
    });
    const active = new WeakMap();
    const now = () => (typeof CommonTime === "function" ? CommonTime() : Date.now());
    const magePaths = new Set(
        [BODY, REGULAR, PARTICLES, ...Object.values(GLOWS)].map((path) => KinkyDungeonRootDirectory + path),
    );

    if (typeof KDDraw === "function") {
        const nativeDraw = KDDraw;
        KDDraw = function (board, sprites, id, image) {
            const sprite = nativeDraw.apply(this, arguments);
            if (sprite?.texture && magePaths.has(image)) {
                sprite.texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
            }
            return sprite;
        };
    }

    if (typeof KinkyDungeonCastSpell === "function") {
        const nativeCast = KinkyDungeonCastSpell;
        KinkyDungeonCastSpell = function (x, y, spell, caster) {
            const outcome = nativeCast.apply(this, arguments);
            if (outcome?.result === "Cast" && caster?.Enemy?.name === MAGE && caster.hp > 0)
                active.set(caster, { kind: spell?.name === RUNE ? "rune" : "attack", started: now() });
            return outcome;
        };
    }

    if (typeof KDDrawEnemySprite === "function") {
        const nativeDraw = KDDrawEnemySprite;
        KDDrawEnemySprite = function (board, enemy, tx, ty, camX, camY, staticView, zIndex = 0, id = "") {
            const spriteName = nativeDraw.apply(this, arguments);
            if (enemy?.Enemy?.name !== MAGE || spriteName !== MAGE || enemy.CustomSprite) return spriteName;
            const base = kdpixisprites.get(`spr_${enemy.id}${id}`);
            if (!base?.texture || base.parent !== board) return spriteName;
            const visual = active.get(enemy);
            const fade = visual ? Math.max(0, 1 - (now() - visual.started) / DISPLAY_MS) : 0;
            const layers = fade > 0 ? [PARTICLES, GLOWS[visual.kind]] : [REGULAR];

            for (const [index, path] of layers.entries()) {
                const layer = KDDraw(
                    board,
                    kdpixisprites,
                    `spr_${enemy.id}${id}_mage_cast_${index}`,
                    KinkyDungeonRootDirectory + path,
                    base.position.x,
                    base.position.y,
                    Math.abs(base.width),
                    Math.abs(base.height),
                    undefined,
                    {
                        zIndex: (base.zIndex ?? zIndex) + 0.001 * (index + 1),
                        blendMode: index === 1 ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL,
                        alpha: path === REGULAR ? 1 : fade,
                    },
                    undefined,
                    undefined,
                    undefined,
                    true,
                );
                if (layer && base.scale.x < 0 && layer.scale.x > 0) layer.scale.x = -layer.scale.x;
            }
            return spriteName;
        };
    }
})();
