"use strict";

(() => {
    const MAGE = "MageSpiderlings";
    const RUNE = "SpiderlingsMageRune";
    const DISPLAY_TURNS = 2;
    const PARTICLES = "Enemies/MageSpiderlingsSpellParticles.png";
    const GLOWS = Object.freeze({
        rune: "Enemies/MageSpiderlingsSubtleGlow.png",
        attack: "Enemies/MageSpiderlingsReallyGlowy.png",
    });
    const CHROMA_KEY = `
        varying vec2 vTextureCoord;
        uniform sampler2D uSampler;
        void main(void) {
            vec4 color = texture2D(uSampler, vTextureCoord);
            vec3 matte = vec3(58.0 / 255.0, 66.0 / 255.0, 109.0 / 255.0);
            gl_FragColor = distance(color.rgb, matte) < 0.005 ? vec4(0.0) : color;
        }
    `;
    const active = new WeakMap();
    const keyedPaths = new Set(
        ["Enemies/MageSpiderlings.png", PARTICLES, ...Object.values(GLOWS)].map(
            (path) => KinkyDungeonRootDirectory + path,
        ),
    );
    let matteFilter;

    function filter() {
        matteFilter ||= new PIXI.Filter(null, CHROMA_KEY, {});
        return matteFilter;
    }

    if (typeof KDDraw === "function") {
        const nativeDraw = KDDraw;
        KDDraw = function (board, sprites, id, image) {
            const sprite = nativeDraw.apply(this, arguments);
            if (sprite?.texture && keyedPaths.has(image)) {
                sprite.filters = [filter()];
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
                active.set(caster, { kind: spell?.name === RUNE ? "rune" : "attack", remaining: DISPLAY_TURNS });
            return outcome;
        };
    }

    KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsMageVisuals", (_event, data) => {
        if (!(data?.delta > 0)) return;
        for (const enemy of KDMapData.Entities) {
            const visual = active.get(enemy);
            if (!visual) continue;
            visual.remaining -= data.delta;
            if (visual.remaining <= 0) active.delete(enemy);
        }
    });

    if (typeof KDDrawEnemySprite === "function") {
        const nativeDraw = KDDrawEnemySprite;
        KDDrawEnemySprite = function (board, enemy, tx, ty, camX, camY, staticView, zIndex = 0, id = "") {
            const spriteName = nativeDraw.apply(this, arguments);
            if (enemy?.Enemy?.name !== MAGE || spriteName !== MAGE || enemy.CustomSprite) return spriteName;
            const base = kdpixisprites.get(`spr_${enemy.id}${id}`);
            if (!base?.texture || base.parent !== board) return spriteName;
            const visual = active.get(enemy);
            if (!visual || visual.remaining <= 0) return spriteName;

            for (const [index, path] of [PARTICLES, GLOWS[visual.kind]].entries()) {
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
