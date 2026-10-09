"use strict";

(() => {
    const ENEMY = "MageSpiderlings";
    const SPELL = "SpiderlingsMageBolt";
    const ORIGIN = "SpiderlingsMageOrigin";

    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "launchBullet", ORIGIN, (_event, data) => {
            const shot = data.b?.bullet || data.bullet;
            if (shot?.spell?.name !== SPELL || shot.source == null || !shot.faction) return;
            const source = KDMapData.Entities.find(
                (entity) => entity.id === shot.source && entity.hp > 0 && entity.Enemy?.name === ENEMY,
            );
            if (!source) return;
            shot[ORIGIN] = {
                sourceId: source.id,
                faction: shot.faction,
                allied: !!(source.allied || source.Enemy.allied),
                ceasefire: source.ceasefire || 0,
            };
        });
    }

    if (typeof KDPlayerEffects !== "undefined" && typeof KDPlayerEffects.Damage === "function") {
        const nativeDamage = KDPlayerEffects.Damage;
        KDPlayerEffects.Damage = function (target, _damage, _effect, spell, faction, bullet, entity) {
            const result = nativeDamage.apply(this, arguments);
            // Native Damage delegates shield and already-hit rejection to KinkyDungeonDealDamage.
            if (spell?.name === SPELL && target?.player && result?.effect) {
                const source = entity?.Enemy?.name === ENEMY ? entity : mageShot(bullet);
                const outcome = globalThis.Spiderlings?.Webbing?.applyEnemyProgression(ENEMY, source, faction);
                if (outcome?.progressed) globalThis.Spiderlings?.SpellVisuals?.hit(target);
            }
            return result;
        };
    }

    function mageShot(bullet, npc = false) {
        if (bullet?.bullet?.spell?.name !== SPELL) return;
        const id = bullet.bullet.source ?? bullet.bullet.spell?.source;
        const live = typeof KDMapData !== "undefined" && KDMapData.Entities.find((entity) => entity.id === id);
        if (live?.Enemy?.name === ENEMY && (!npc || live.hp > 0)) return live;
        if (!npc || id == null || (live && live.Enemy?.name !== ENEMY)) return;
        const saved = bullet.bullet[ORIGIN];
        if (saved?.sourceId !== id || !saved.faction || saved.faction !== bullet.bullet.faction) return;
        // A native projectile retains its caster ID and allegiance after death.
        // NPC silk resolution needs that identity; player progression stays as before.
        return {
            id,
            hp: 1,
            faction: saved.faction,
            allied: saved.allied,
            ceasefire: saved.ceasefire,
            Enemy: { name: ENEMY },
        };
    }

    function hostileNPC(source, target) {
        return !!(
            source?.hp > 0 &&
            !(source.ceasefire > 0) &&
            target?.hp > 0 &&
            !target.player &&
            target.Enemy &&
            !target.allied &&
            !target.Enemy.allied &&
            !(target.ceasefire > 0) &&
            (globalThis.Spiderlings?.Rivalry?.isMaid(target) ||
                globalThis.Spiderlings?.FieldCustody?.interceptionPair(source, target) ||
                globalThis.Spiderlings?.HuntingGrounds?.isPrey(source, target)) &&
            typeof KDHostile === "function" &&
            KDHostile(source, target)
        );
    }

    function collision(native) {
        return function (bullet, target) {
            const source = mageShot(bullet, true);
            if (!source || !hostileNPC(source, target)) return native.apply(this, arguments);
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
            const source = mageShot(bullet, true);
            if (!source || !target?.Enemy) return nativeHit.apply(this, arguments);
            const original = bullet.bullet;
            // The native NPC hit resolves shields and resistance. Suppress the
            // player damage effect so KD does not convert it into NPC tags.
            bullet.bullet = {
                ...original,
                damage: hostileNPC(source, target)
                    ? globalThis.Spiderlings.Combat.nativeSilkDamage(
                          source,
                          { ...original.damage, damage: 4 },
                          6,
                          "mage-spell",
                      )
                    : original.damage,
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
