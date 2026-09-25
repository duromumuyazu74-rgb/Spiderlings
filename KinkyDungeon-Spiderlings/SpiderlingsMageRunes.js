"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const MAGE = "MageSpiderlings";
    const RUNE = "SpiderlingsMageRune";
    const LIMIT = 3;
    const RADIUS = 3;
    const PHASE = "SpiderlingsRunePhase";
    const TURNS = "SpiderlingsRuneTurns";

    function isRune(bullet) {
        return bullet?.bullet?.spell?.name === RUNE;
    }

    function activeRunes(ownerId) {
        return KDMapData.Bullets.filter(
            (bullet) => isRune(bullet) && bullet.time > 0 && bullet.bullet.source === ownerId,
        ).length;
    }

    function setPhase(bullet, phase, turns) {
        bullet[PHASE] = phase;
        bullet[TURNS] = turns;
        bullet.bullet.name = phase === "placing" ? "SpiderlingsMageRuneIcon" : RUNE;
        bullet.bullet.bulletLight = phase === "triggered" ? 6 : phase === "placing" ? 4 : 0;
        bullet.bullet.bulletColor = 0xa77bdc;
        bullet.bullet.aoe = phase === "triggered" ? 1 : undefined;
        bullet.bullet.aoetype = phase === "triggered" ? "box" : undefined;
        if (typeof KinkyDungeonUpdateSingleBulletVisual === "function")
            KinkyDungeonUpdateSingleBulletVisual(bullet, false);
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
        const chosen = canPlace && KDRandom() < 0.25 ? RUNE : api.MageSpells?.choose?.(mage) || "SpiderlingsMageBolt";
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
            const previous = new Set(KDMapData.Bullets);
            const result = nativeCast.apply(this, args);
            if (result?.result === "Cast") {
                const bullet = KDMapData.Bullets.find((candidate) => !previous.has(candidate) && isRune(candidate));
                if (bullet) setPhase(bullet, "placing", 2);
            }
            return result;
        };
    }

    if (typeof KDBulletCanHitEntity === "function") {
        const nativeCanHit = KDBulletCanHitEntity;
        KDBulletCanHitEntity = function (bullet, _target) {
            // The rune resolves after its warning turn, never on contact.
            return isRune(bullet) ? false : nativeCanHit.apply(this, arguments);
        };
    }

    if (typeof KDBulletAoECanHitEntity === "function") {
        const nativeAoECanHit = KDBulletAoECanHitEntity;
        KDBulletAoECanHitEntity = function (bullet) {
            return isRune(bullet) ? false : nativeAoECanHit.apply(this, arguments);
        };
    }

    if (typeof KDCheckCollideableBullets === "function") {
        const nativeMovementCollision = KDCheckCollideableBullets;
        KDCheckCollideableBullets = function (target, force) {
            // Forced moves bypass KDBulletCanHitEntity. Hide only our rune's
            // damage during this native movement query so it can arm on tickAfter.
            if (!force) return nativeMovementCollision.apply(this, arguments);
            const runes = KDMapData.Bullets.filter(
                (bullet) => isRune(bullet) && bullet.x === target?.x && bullet.y === target?.y,
            );
            const damage = runes.map((bullet) => bullet.bullet.damage);
            for (const bullet of runes) bullet.bullet.damage = undefined;
            try {
                return nativeMovementCollision.apply(this, arguments);
            } finally {
                runes.forEach((bullet, index) => (bullet.bullet.damage = damage[index]));
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
                const before = target.specialBoundLevel?.Slime || 0;
                const result = nativeHit.apply(this, arguments);
                const added = Math.max(0, (target.specialBoundLevel?.Slime || 0) - before);
                if (added > 0)
                    api.NPCAdhesion?.recordNativeSilk(
                        mageRuneSource(bullet),
                        target,
                        added,
                        "mage-rune",
                        bullet.spriteID || `${bullet.bullet.source}:${bullet.x}:${bullet.y}`,
                    );
                return result;
            } finally {
                bullet.bullet = original;
            }
        };
    }

    function inBlast(bullet, target) {
        return target && Math.abs(target.x - bullet.x) <= 1 && Math.abs(target.y - bullet.y) <= 1;
    }

    function resolveRune(bullet) {
        const player = KinkyDungeonPlayerEntity;
        if (inBlast(bullet, player)) {
            api.Webbing?.applyEnemyProgression("WebCaster", mageRuneSource(bullet), "Enemy");
        }
        if (typeof KDBulletHitEnemy === "function") {
            for (const target of KDMapData.Entities) {
                if (inBlast(bullet, target) && hostileMaid(bullet, target)) {
                    api.Combat?.pressureNPCShield(target);
                    KDBulletHitEnemy(bullet, target, 0, false);
                }
            }
        }
        bullet.time = 0;
        const index = KDMapData.Bullets.indexOf(bullet);
        if (index >= 0) KDMapData.Bullets.splice(index, 1);
        if (typeof KinkyDungeonUpdateSingleBulletVisual === "function")
            KinkyDungeonUpdateSingleBulletVisual(bullet, true);
        if (typeof KinkyDungeonBulletsID !== "undefined" && bullet.spriteID)
            KinkyDungeonBulletsID[bullet.spriteID] = null;
        if (typeof KinkyDungeonSendEvent === "function")
            KinkyDungeonSendEvent("bulletDestroy", { bullet, target: undefined, outOfRange: false, outOfTime: false });
    }

    KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsMageRuneTiming", (_event, data) => {
        if (!(Number(data?.delta) > 0)) return;
        for (const bullet of [...KDMapData.Bullets]) {
            if (!isRune(bullet) || bullet.time <= 0) continue;
            const phase = bullet[PHASE] || "armed";
            if (phase === "placing") {
                if (--bullet[TURNS] <= 0) setPhase(bullet, "armed", 0);
            } else if (phase === "armed") {
                const playerOnRune =
                    inBlast(bullet, KinkyDungeonPlayerEntity) &&
                    KinkyDungeonPlayerEntity.x === bullet.x &&
                    KinkyDungeonPlayerEntity.y === bullet.y;
                const maidOnRune = KDMapData.Entities.some(
                    (target) => target.x === bullet.x && target.y === bullet.y && hostileMaid(bullet, target),
                );
                if (playerOnRune || maidOnRune) setPhase(bullet, "triggered", 1);
            } else if (phase === "triggered" && --bullet[TURNS] <= 0) {
                resolveRune(bullet);
            }
        }
    });
})();
