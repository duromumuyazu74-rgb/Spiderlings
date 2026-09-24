"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const ENEMY = "MageSpiderlings";
    const SPELL = "SpiderlingsMageBolt";
    const EFFECT = "SpiderlingsMageArmHit";
    const RESTRAINT = "SpiderlingsMageArmSigil";

    api.restraintCatalog.register({
        id: RESTRAINT,
        module: "Mage",
        restraint: {
            name: RESTRAINT,
            inventory: true,
            unlimited: true,
            accessible: true,
            Asset: "Web",
            Group: "ItemArms",
            bindarms: true,
            power: 2,
            weight: 0,
            escapeChance: { Cut: 0.6, Remove: 0.3, Struggle: 0.25 },
            enemyTags: {},
            playerTags: {},
            minLevel: 0,
            allFloors: true,
        },
        text: [
            "Silken Arm Sigil",
            "A compact silk mark winds around your arms and holds them together.",
            "The mark is a temporary design. Cut, remove or struggle against it using the usual rules.",
        ],
    });

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
            KDGetFaction(target) === "Maidforce" &&
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
            // player equipment effect so KD does not convert it into NPC tags.
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

    function equipArms(source) {
        if (
            typeof KinkyDungeonGetRestraintByName !== "function" ||
            typeof KinkyDungeonAllRestraintDynamic !== "function" ||
            typeof KDGetBlockersToAddRestraint !== "function" ||
            typeof KDCanAddRestraint !== "function" ||
            typeof KinkyDungeonAddRestraint !== "function"
        )
            return false;
        if (KinkyDungeonAllRestraintDynamic().some(({ item }) => item.name === RESTRAINT)) return false;
        const restraint = KinkyDungeonGetRestraintByName(RESTRAINT);
        if (!restraint || KDGetBlockersToAddRestraint(restraint, KinkyDungeonPlayerEntity, false).length) return false;
        const current = KinkyDungeonGetRestraintItem("ItemArms");
        if (KDCanAddRestraint(restraint, false, "", false, current, true, true, source) !== true) return false;
        return (
            KinkyDungeonAddRestraint(
                restraint,
                0,
                false,
                "",
                false,
                false,
                false,
                undefined,
                "Enemy",
                false,
                undefined,
                undefined,
                true,
                source,
            ) > 0
        );
    }
    api.Mage = Object.freeze({ equipArms });

    if (typeof KDPlayerEffects !== "undefined") {
        KDPlayerEffects[EFFECT] = (_target, _damage, _effect, _spell, _faction, bullet, source) => {
            if (!_target?.player) return { effect: false };
            const damage =
                typeof KinkyDungeonDealDamage === "function"
                    ? KinkyDungeonDealDamage({ damage: 0.5, type: "glue" }, bullet)
                    : undefined;
            return { effect: equipArms(source || mageShot(bullet)) || (damage?.happened ?? 0) > 0 };
        };
    }
})();
