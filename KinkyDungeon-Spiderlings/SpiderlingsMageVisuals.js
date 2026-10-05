"use strict";

(() => {
    const MAGE = "MageSpiderlings";
    const RUNE = "SpiderlingsMageRune";
    const CAST = "SpiderlingsMageCastGlow";
    const BODY = "Enemies/MageSpiderlings.png";
    const REGULAR = "Enemies/MageSpiderlingsRegular.png";
    const PARTICLES = "Enemies/MageSpiderlingsSpellParticles.png";
    const GLOWS = Object.freeze({
        rune: "Enemies/MageSpiderlingsSubtleGlow.png",
        attack: "Enemies/MageSpiderlingsReallyGlowy.png",
    });
    function glowKind(enemy) {
        if (!(enemy.hp > 0)) return undefined;
        const spells = KDMapData.SpiderlingsMageSpells;
        const waiting = (list, deadline) =>
            spells?.[list]?.some((effect) => effect.ownerId === enemy.id && effect[deadline] > spells.clock);
        if (waiting("fields", "activateAt") || waiting("collapses", "explodeAt") || waiting("blasts", "detonateAt"))
            return "attack";
        if (
            KDMapData.Bullets.some(
                (bullet) =>
                    bullet.time > 0 &&
                    bullet.bullet?.spell?.name === RUNE &&
                    bullet.bullet.source === enemy.id &&
                    ["placing", "triggered"].includes(bullet.SpiderlingsRunePhase),
            )
        )
            return "rune";
        return enemy[CAST]?.kind;
    }

    KDAddEvent(KDEventMapGeneric, "tickAfter", CAST, (_event, data) => {
        if (!(data?.delta > 0)) return;
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : undefined;
        for (const enemy of KDMapData.Entities) {
            const cast = enemy[CAST];
            if (!cast || (tick !== undefined && cast.lastNativeTick === tick)) continue;
            cast.lastNativeTick = tick;
            // Enemy casts precede tickAfter. Keep the cast's completed turn lit,
            // then clear on the next positive turn; loading and frames consume nothing.
            if (cast.fresh) cast.fresh = false;
            else delete enemy[CAST];
        }
    });

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
                caster[CAST] = { kind: spell?.name === RUNE ? "rune" : "attack", fresh: true };
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
            const kind = glowKind(enemy);
            const layers = kind ? [REGULAR, PARTICLES, GLOWS[kind]] : [REGULAR];

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
                        blendMode: path === GLOWS[kind] ? PIXI.BLEND_MODES.ADD : PIXI.BLEND_MODES.NORMAL,
                        alpha: 1,
                    },
                    undefined,
                    undefined,
                    undefined,
                    true,
                );
                // KDDraw reuses sprites; assigning width preserves the previous scale sign.
                // Reset both facings, otherwise a left-to-right turn leaves the pattern mirrored off-body.
                if (layer) layer.scale.x = Math.abs(layer.scale.x) * (base.scale.x < 0 ? -1 : 1);
            }
            return spriteName;
        };
    }
})();
