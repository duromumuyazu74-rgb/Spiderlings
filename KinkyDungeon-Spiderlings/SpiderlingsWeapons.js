"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsWeapons";
    const TOME = "SpiderlingsSilkenBindingTome";
    const STAFF = "SpiderlingsSilkweaverStaff";
    const CONVERGENCE = "SpiderlingsCocoonConvergence";
    const SNARE = "SpiderlingsSilkenSnare";
    const cooldowns = { [CONVERGENCE]: 8, [SNARE]: 3 };

    // Run-wide cooldowns survive map changes and weapon swaps; pending casts belong to the map.
    function state() {
        return (KDGameData[KEY] ||= { clock: 0, readyAt: {} });
    }

    function pending() {
        return (KDMapData[KEY] ||= { collapses: [] });
    }

    function hostile(target) {
        return !!(target?.Enemy && target.hp > 0 && !target.player && !KDAllied(target) && KDHostile(target));
    }

    function remaining(name) {
        return Math.max(0, (state().readyAt[name] || 0) - state().clock);
    }

    KinkyDungeonWeapons[TOME] = {
        name: TOME,
        damage: 1.5,
        bind: 3,
        bindType: "Slime",
        chance: 1,
        staminacost: 1.5,
        type: "glue",
        magic: true,
        unarmed: false,
        noDamagePenalty: true,
        nocrit: true,
        rarity: 4,
        sfx: "MagicSlash",
        tags: ["tome", "bondage"],
        stamPenType: "Staff",
        angle: 0,
        special: { type: "spell", spell: CONVERGENCE, prereq: CONVERGENCE },
        events: [{ trigger: "tick", type: "Buff", kind: TOME, buffType: "BindAmp", power: 0.15, offhand: true }],
    };
    KinkyDungeonWeapons[STAFF] = {
        name: STAFF,
        damage: 3,
        bind: 5,
        bindType: "Slime",
        chance: 1,
        staminacost: 3,
        type: "glue",
        magic: true,
        unarmed: false,
        noDamagePenalty: true,
        crit: 1.1,
        rarity: 4,
        sfx: "MagicSlash",
        tags: ["staff", "bondage"],
        stamPenType: "Staff",
        special: { type: "spell", spell: SNARE, prereq: SNARE },
    };

    const convergence = {
        name: CONVERGENCE,
        type: "special",
        special: CONVERGENCE,
        school: "Conjure",
        components: [],
        manacost: 4,
        level: 1,
        range: 6,
        aoe: 2,
        aoetype: "box",
        power: 6,
        damage: "glue",
        bind: 24,
        bindType: "Slime",
        time: 0,
        noMiscast: true,
        sfx: "MagicSlash",
    };
    const snare = {
        name: SNARE,
        type: "bolt",
        school: "Conjure",
        components: [],
        manacost: 2,
        level: 1,
        range: 6,
        speed: 3,
        size: 1,
        power: 3,
        damage: "glue",
        bind: 8,
        bindType: "Slime",
        time: 0,
        noMiscast: true,
        noDirectionOffset: true,
        noDoubleHit: true,
        noUniqueHits: true,
        sfx: "MagicSlash",
        hitsfx: "MagicSlash",
    };
    for (const spell of [convergence, snare]) {
        api.registerNamed(KinkyDungeonSpellListEnemies, spell);
        KDPrereqs[spell.name] = () =>
            remaining(spell.name) === 0 && KinkyDungeonHasMana(KinkyDungeonGetManaCost(spell));
    }

    KinkyDungeonSpellSpecials[CONVERGENCE] = (_spell, _data, _targetX, _targetY, x, y) => {
        const clock = state().clock;
        pending().collapses.push({ x, y, startAt: clock + 1, explodeAt: clock + 3, ownerId: clock });
        // Undefined lets native casting finish: debit mana once and emit player-cast events.
    };

    const nativeCast = KinkyDungeonCastSpell;
    KinkyDungeonCastSpell = function (x, y, spell, enemy, player, bullet) {
        if (!cooldowns[spell?.name]) return nativeCast.apply(this, arguments);
        if (
            enemy ||
            bullet ||
            !player?.player ||
            remaining(spell.name) > 0 ||
            !KinkyDungeonHasMana(KinkyDungeonGetManaCost(spell))
        )
            return { result: "Fail" };
        if (Math.hypot(x - player.x, y - player.y) > 6 || !Number.isInteger(x) || !Number.isInteger(y))
            return { result: "Fail" };
        if (
            spell.name === CONVERGENCE &&
            (!KinkyDungeonTransparentObjects.includes(KinkyDungeonMapGet(x, y)) ||
                !(KinkyDungeonVisionGet(x, y) > 0) ||
                !KinkyDungeonCheckPath(player.x, player.y, x, y, true, false))
        )
            return { result: "Fail" };
        const result = nativeCast.apply(this, arguments);
        if (result?.result === "Cast") {
            state().readyAt[spell.name] = state().clock + cooldowns[spell.name];
            if (spell.name === SNARE && result.data?.bulletfired) {
                const fired = result.data.bulletfired;
                fired.bullet.name = "SpiderlingsMageBolt";
                KinkyDungeonUpdateSingleBulletVisual(fired, false);
            }
        }
        return result;
    };

    const nativeHit = KDBulletCanHitEntity;
    KDBulletCanHitEntity = function (bullet, target) {
        return (bullet?.bullet?.spell?.name !== SNARE || hostile(target)) && nativeHit.apply(this, arguments);
    };
    const nativeAoE = KDBulletAoECanHitEntity;
    KDBulletAoECanHitEntity = function (bullet, target) {
        return (bullet?.bullet?.spell?.name !== SNARE || hostile(target)) && nativeAoE.apply(this, arguments);
    };

    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) => {
        if (data.spell?.name !== SNARE || data.blocked || !hostile(data.enemy)) return;
        const target = data.enemy;
        if (target.shield > 0 && !data.ignoreshield && !data.shield_slow) return;
        const tags = target.Enemy.tags;
        if (tags.unslowable) return;
        let resistance = 0;
        // Match native damage-profile precedence, including weaknesses before immunity.
        outer: for (const tier of [1, 2]) {
            for (const [kind, amount] of [
                ["severeweakness", -2],
                ["weakness", -1],
                ["resist", 1],
                ["immune", 2],
            ]) {
                if (KinkyDungeonGetImmunity(tags, target.Enemy.Resistance?.profile, data.type, kind, tier)) {
                    resistance = amount;
                    break outer;
                }
            }
        }
        if (resistance >= 2) return;
        const before = target.slow || 0;
        target.slow = Math.max(before, tags.slowresist || resistance === 1 ? 1 : 2);
        if (target.slow > before) KinkyDungeonSendEvent("slow", data, undefined, data.forceWeapon);
        api.SpellVisuals?.hit(target);
    });

    function resolve(collapse) {
        for (const target of KDMapData.Entities) {
            if (!hostile(target)) continue;
            const distance = api.MageSpells.collapseDistance(collapse.x, collapse.y, target);
            if (
                distance < 0 ||
                !KinkyDungeonTransparentObjects.includes(KinkyDungeonMapGet(target.x, target.y)) ||
                !KinkyDungeonCheckPath(collapse.x, collapse.y, target.x, target.y, true, false)
            )
                continue;
            const power = 3 - distance;
            KinkyDungeonDamageEnemy(
                target,
                {
                    damage: power * 2,
                    bind: power * 8,
                    bindType: "Slime",
                    type: "glue",
                    time: 0,
                    flags: [KEY],
                    nocrit: true,
                },
                true,
                false,
                convergence,
                undefined,
                KinkyDungeonPlayerEntity,
            );
            api.SpellVisuals?.hit(target);
        }
    }

    KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => {
        if (!(data?.delta > 0)) return;
        state().clock += 1;
        const due = pending().collapses.filter((cast) => cast.explodeAt <= state().clock);
        pending().collapses = pending().collapses.filter((cast) => cast.explodeAt > state().clock);
        for (const cast of due) resolve(cast);
    });
    for (const event of ["postMapgen", "defeat", "passout", "postPrisonIntro"])
        KDAddEvent(KDEventMapGeneric, event, KEY, () => {
            delete KDMapData[KEY];
        });

    const nativeDrop = KDDropItems;
    KDDropItems = function (enemy, mapData) {
        const alreadyDropped = enemy.droppedItems;
        const result = nativeDrop.apply(this, arguments);
        if (enemy.Enemy?.name !== "MageSpiderlings" || alreadyDropped || !enemy.droppedItems) return result;
        const missing = [TOME, STAFF].filter((name) => !KinkyDungeonInventoryGetWeapon(name));
        if (missing.length && KDRandom() < 0.15)
            mapData.GroundItems.push({
                x: enemy.x,
                y: enemy.y,
                name: missing[Math.floor(KDRandom() * missing.length)],
            });
        return result;
    };

    const text = {
        [`KinkyDungeonSpellCast${CONVERGENCE}`]: "You weave a circle of silk. The strands begin to draw inward.",
        [`KinkyDungeonSpellCast${SNARE}`]: "You send a strand of sticky silk toward your target.",
        [`KinkyDungeonInventoryItem${TOME}`]: "Tome of Silken Binding",
        [`KinkyDungeonInventoryItem${TOME}Desc`]:
            "Fine silk runs through the spine and winds around the open pages. Read the woven words, and scattered threads draw inward.",
        [`KinkyDungeonInventoryItem${TOME}Desc2`]:
            "Main or off hand: +15% binding strength. Cocoon Convergence: 4 mana, range 6, two-turn charge, 8-turn cooldown. Silk draws inward across 21 tiles, binding enemies more tightly near the center. Walls block the effect.",
        [`KinkyDungeonInventoryItem${STAFF}`]: "Silkweaver's Staff",
        [`KinkyDungeonInventoryItem${STAFF}Desc`]:
            "A faint glow rests in the web at the staff's tip. With a sweep, slender strands reach out and wind around their target.",
        [`KinkyDungeonInventoryItem${STAFF}Desc2`]:
            "Silken Snare: 2 mana, range 6, 3-turn cooldown. A strand of silk binds the first hostile target it hits, then slows them for 2 turns. Walls stop the strand.",
        [`ItemPickup${TOME}`]: "You pick up a Tome of Silken Binding.",
        [`ItemPickup${STAFF}`]: "You pick up a Silkweaver's Staff.",
        [`KinkyDungeonSpecial${TOME}`]: "Cocoon Convergence",
        [`KinkyDungeonSpecial${STAFF}`]: "Silken Snare",
        [`KinkyDungeonSpell${CONVERGENCE}`]: "Cocoon Convergence",
        [`KinkyDungeonSpell${SNARE}`]: "Silken Snare",
        [`KDPrereqFail${CONVERGENCE}`]: "Cocoon Convergence needs 4 mana and must finish its 8-turn cooldown.",
        [`KDPrereqFail${SNARE}`]: "Silken Snare needs 2 mana and must finish its 3-turn cooldown.",
    };
    for (const [key, value] of Object.entries(text)) addTextKey(key, value);
    api.Weapons = Object.freeze({
        remaining,
        visualState: () => ({ clock: state().clock, collapses: pending().collapses }),
    });
})();
