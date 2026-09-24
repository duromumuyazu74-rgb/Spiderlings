"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const MAGE = "MageSpiderlings";
    const RUNE = "SpiderlingsMageRune";
    const ARM_EFFECT = "SpiderlingsMageRuneArms";
    const LIMIT = 3;
    const RADIUS = 3;

    function isRune(bullet) {
        return bullet?.bullet?.spell?.name === RUNE;
    }

    function activeRunes(ownerId) {
        return KDMapData.Bullets.filter(
            (bullet) => isRune(bullet) && bullet.time > 0 && bullet.bullet.source === ownerId,
        ).length;
    }

    function legalCells(mage) {
        if (!mage || typeof KinkyDungeonMapGet !== "function") return [];
        const cells = [];
        for (let y = mage.y - RADIUS; y <= mage.y + RADIUS; y++) {
            for (let x = mage.x - RADIUS; x <= mage.x + RADIUS; x++) {
                if (x === mage.x && y === mage.y) continue;
                if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(x, y))) continue;
                if (
                    typeof KinkyDungeonCheckLOS === "function" &&
                    !KinkyDungeonCheckLOS(mage, { x, y }, Math.hypot(x - mage.x, y - mage.y), RADIUS, false, true)
                )
                    continue;
                if (KDMapData.Entities.some((entity) => entity.hp > 0 && entity.x === x && entity.y === y)) continue;
                if (KinkyDungeonPlayerEntity.x === x && KinkyDungeonPlayerEntity.y === y) continue;
                if (KDMapData.Bullets.some((bullet) => bullet.time > 0 && bullet.x === x && bullet.y === y)) continue;
                cells.push({ x, y });
            }
        }
        return cells;
    }

    function mageRuneSource(bullet) {
        if (!isRune(bullet)) return;
        const id = bullet.bullet.source;
        const live = KDMapData.Entities.find((entity) => entity.id === id && entity.Enemy?.name === MAGE);
        // The cast belongs to a hostile Mage even after its entity has been removed.
        return live || { id, hp: 1, faction: "Enemy", Enemy: { name: MAGE } };
    }

    function hostileMaid(bullet, target) {
        const source = mageRuneSource(bullet);
        return !!(
            source &&
            bullet.bullet.faction === "Enemy" &&
            target?.hp > 0 &&
            target.Enemy &&
            !target.allied &&
            !target.Enemy.allied &&
            !(target.ceasefire > 0) &&
            !(typeof KDIsInParty === "function" && KDIsInParty(target)) &&
            !(typeof KDIsServant === "function" && KDIsServant(KDGameData.Collection?.[target.id + ""])) &&
            typeof KDGetFaction === "function" &&
            KDGetFaction(target) === "Maidforce" &&
            typeof KDHostile === "function" &&
            KDHostile(source, target)
        );
    }

    // The native spell chooser and its cooldown own the action budget. Choose
    // one spell per available cast; a rune replaces the bolt one time in four.
    KDAddEvent(KDEventMapGeneric, "enumerateSpellOpts", "SpiderlingsMageRuneChoice", (_event, data) => {
        const mage = data.enemy;
        if (mage?.Enemy?.name !== MAGE) return;
        const canPlace = activeRunes(mage.id) < LIMIT && legalCells(mage).length > 0;
        const chosen = canPlace && KDRandom() < 0.25 ? RUNE : "SpiderlingsMageBolt";
        data.spellOptions.splice(0, data.spellOptions.length, chosen);
        data.spellPriority.splice(0, data.spellPriority.length);
    });

    if (typeof KinkyDungeonCastSpell === "function") {
        const nativeCast = KinkyDungeonCastSpell;
        KinkyDungeonCastSpell = function (x, y, spell, mage) {
            if (spell?.name !== RUNE || mage?.Enemy?.name !== MAGE) return nativeCast.apply(this, arguments);
            const cells = activeRunes(mage.id) < LIMIT ? legalCells(mage) : [];
            if (!cells.length) return { result: "Fail" };
            const cell = cells[Math.floor(KDRandom() * cells.length)];
            const args = Array.from(arguments);
            args[0] = cell.x;
            args[1] = cell.y;
            return nativeCast.apply(this, args);
        };
    }

    if (typeof KDBulletCanHitEntity === "function") {
        const nativeCanHit = KDBulletCanHitEntity;
        KDBulletCanHitEntity = function (bullet, target) {
            if (!isRune(bullet) || target?.player) return nativeCanHit.apply(this, arguments);
            if (!hostileMaid(bullet, target)) return false;
            const original = bullet.bullet;
            // KD considers Enemy and Maidforce favorable. Override that one
            // collision without changing either faction's global relation.
            bullet.bullet = { ...original, spell: { ...original.spell, friendlyfire: true } };
            try {
                return nativeCanHit.apply(this, arguments);
            } finally {
                bullet.bullet = original;
            }
        };
    }

    if (typeof KDBulletHitEnemy === "function") {
        const nativeHit = KDBulletHitEnemy;
        KDBulletHitEnemy = function (bullet, target) {
            if (!isRune(bullet) || !hostileMaid(bullet, target)) return nativeHit.apply(this, arguments);
            const original = bullet.bullet;
            // The native NPC damage path applies bindType Slime once. Its
            // generic player-effect conversion must not add a second bind.
            bullet.bullet = {
                ...original,
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

    KDPlayerEffects[ARM_EFFECT] = (target, _damage, _effect, _spell, _faction, bullet, source) => ({
        effect: !!target?.player && api.Mage.equipArms(source || mageRuneSource(bullet)),
    });
})();
