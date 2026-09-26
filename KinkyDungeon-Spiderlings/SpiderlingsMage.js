"use strict";

(() => {
    const ENEMY = "MageSpiderlings";
    const SPELL = "SpiderlingsMageBolt";

    function mageShot(bullet) {
        if (bullet?.bullet?.spell?.name !== SPELL) return;
        const id = bullet.bullet.source ?? bullet.bullet.spell?.source;
        return (
            typeof KDMapData !== "undefined" &&
            KDMapData.Entities.find((entity) => entity.id === id && entity.Enemy?.name === ENEMY)
        );
    }

    function hostileMaid(source, target) {
        return !!(
            source?.hp > 0 &&
            target?.hp > 0 &&
            !target.player &&
            target.Enemy &&
            typeof KDGetFaction === "function" &&
            (KDGetFaction(target) === "Maidforce" || globalThis.Spiderlings?.HuntingGrounds?.isPrey(source, target)) &&
            typeof KDHostile === "function" &&
            KDHostile(source, target)
        );
    }

    function collision(native) {
        return function (bullet, target) {
            const source = mageShot(bullet);
            if (!source || !hostileMaid(source, target)) return native.apply(this, arguments);
            const original = bullet.bullet;
            bullet.bullet = { ...original, spell: { ...original.spell, friendlyfire: true } };
            try {
                return native.apply(this, arguments);
            } finally {
                bullet.bullet = original;
            }
        };
    }
    if (typeof KDBulletCanHitEntity === "function") KDBulletCanHitEntity = collision(KDBulletCanHitEntity);
    if (typeof KDBulletAoECanHitEntity === "function") KDBulletAoECanHitEntity = collision(KDBulletAoECanHitEntity);

    if (typeof KDBulletHitEnemy === "function") {
        const nativeHit = KDBulletHitEnemy;
        KDBulletHitEnemy = function (bullet, target) {
            const source = mageShot(bullet);
            if (!source || !target?.Enemy) return nativeHit.apply(this, arguments);
            const original = bullet.bullet;
            // The native NPC hit resolves shields and resistance. Suppress the
            // player damage effect so KD does not convert it into NPC tags.
            bullet.bullet = {
                ...original,
                damage: hostileMaid(source, target) ? { ...original.damage, damage: 4 } : original.damage,
                playerEffect: undefined,
                spell: { ...original.spell, playerEffect: undefined },
            };
            try {
                return nativeHit.apply(this, arguments);
            } finally {
                bullet.bullet = original;
            }
        };
    }
})();
