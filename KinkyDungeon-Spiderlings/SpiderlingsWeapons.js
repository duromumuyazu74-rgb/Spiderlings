"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsWeapons";
    const TOME = "SpiderlingTome";
    const STAFF = "SpiderlingStaff";
    const legacyNames = { SpiderlingsSilkenBindingTome: TOME, SpiderlingsSilkweaverStaff: STAFF };
    const legacyByName = Object.fromEntries(Object.entries(legacyNames).map(([old, name]) => [name, old]));
    const resolveName = (name) => legacyNames[name] || name;
    let legacyEquipped;
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
        bind: 4,
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
        events: [{ trigger: "tick", type: "Buff", kind: TOME, buffType: "BindAmp", power: 0.2, offhand: true }],
    };
    KinkyDungeonWeapons[STAFF] = {
        name: STAFF,
        damage: 3,
        bind: 7,
        bindType: "Slime",
        chance: 1.1,
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

    // Old saves and direct legacy calls still resolve, without advertising two extra weapons.
    for (const [old, name] of Object.entries(legacyNames))
        Object.defineProperty(KinkyDungeonWeapons, old, {
            configurable: true,
            enumerable: false,
            get: () => KinkyDungeonWeapons[name],
        });

    function migrateEvents(events) {
        for (const event of events || []) {
            const name = resolveName(event.kind);
            if (name === TOME && event.trigger === "tick" && event.type === "Buff" && event.buffType === "BindAmp") {
                event.kind = TOME;
                event.power = 0.2;
            }
        }
    }

    function migrateItem(item) {
        if (!item) return;
        item.name = resolveName(item.name);
        if (item.inventoryVariant) item.inventoryVariant = resolveName(item.inventoryVariant);
        if (item.inventoryAs) item.inventoryAs = resolveName(item.inventoryAs);
        if (item.type === Weapon) migrateEvents(item.events);
    }

    function migrateCollection(items, references) {
        if (!items) return;
        const entries = items instanceof Map ? [...items.entries()] : Object.entries(items);
        const get = (name) => (items instanceof Map ? items.get(name) : items[name]);
        const set = (name, item) => (items instanceof Map ? items.set(name, item) : (items[name] = item));
        const remove = (name) => (items instanceof Map ? items.delete(name) : delete items[name]);
        for (const [old, item] of entries) {
            if (item.type !== Weapon) continue;
            migrateItem(item);
            let name = resolveName(old);
            if (name === old) continue;
            // A save containing both IDs must keep both identities, including the equipped old copy.
            if (get(name) && get(name) !== item) {
                const base = `${name}_L${item.id}`;
                let suffix = 0;
                name = base;
                while (get(name) || KinkyDungeonWeaponVariants[name]) name = `${base}_${++suffix}`;
                KinkyDungeonWeaponVariants[name] = { template: resolveName(old), events: item.events };
                item.name = name;
                item.inventoryVariant = name;
            }
            set(name, item);
            remove(old);
            references?.set(old, name);
        }
    }

    function migrateCarriedWeapons(enemy) {
        if (!enemy) return;
        for (const key of ["items", "tempitems"])
            if (Array.isArray(enemy[key])) enemy[key] = enemy[key].map(resolveName);
    }

    function migrateInventory() {
        for (const variant of Object.values(KinkyDungeonWeaponVariants)) {
            variant.template = resolveName(variant.template);
            migrateEvents(variant.events);
        }
        const references = new Map();
        migrateCollection(KinkyDungeonInventory.get(Weapon), references);
        for (const container of Object.values(KDGameData.Containers || {})) migrateCollection(container.items);
        for (const item of [...KinkyDungeonLostItems, ...(KDMapData.GroundItems || [])]) migrateItem(item);
        for (const enemy of KDMapData.Entities || []) migrateCarriedWeapons(enemy);
        for (const slot of Object.values(KDWorldMap)) {
            for (const map of Object.values(slot.data || {})) {
                for (const item of map.GroundItems || []) migrateItem(item);
                for (const enemy of map.Entities || []) migrateCarriedWeapons(enemy);
            }
        }
        for (const npc of Object.values(KDPersistentNPCs)) {
            migrateCarriedWeapons(npc.entity);
            migrateCarriedWeapons(npc.trueEntity);
            for (const member of npc.storedParty || []) migrateCarriedWeapons(member);
        }
        const name = (value) => references.get(value) || resolveName(value);
        const previous = legacyEquipped || KinkyDungeonPlayerWeapon;
        KinkyDungeonPlayerWeapon = name(previous);
        for (const key of ["PlayerWeaponLastEquipped", "Offhand", "OffhandOld", "OffhandReturn"])
            if (KDGameData[key])
                KDGameData[key] = name(
                    key === "PlayerWeaponLastEquipped" &&
                        legacyEquipped &&
                        KDGameData[key] === resolveName(legacyEquipped)
                        ? legacyEquipped
                        : KDGameData[key],
                );
        legacyEquipped = undefined;
        if (Array.isArray(KDGameData.PreviousWeapon)) KDGameData.PreviousWeapon = KDGameData.PreviousWeapon.map(name);
        KinkyDungeonWeaponChoices = KinkyDungeonWeaponChoices.map(name);
        for (const [old, current] of Object.entries(legacyNames)) {
            const buff = KinkyDungeonPlayerBuffs[old + "BindAmp"];
            if (buff) {
                delete KinkyDungeonPlayerBuffs[old + "BindAmp"];
                buff.id = current + "BindAmp";
                buff.power = 0.2;
                KinkyDungeonPlayerBuffs[buff.id] ||= buff;
            }
        }
        if ([TOME, STAFF].includes(resolveName(previous)))
            KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
    }

    const nativeAddWeapon = KinkyDungeonInventoryAddWeapon;
    KinkyDungeonInventoryAddWeapon = function (name, container) {
        return nativeAddWeapon.call(this, resolveName(name), container);
    };
    const nativeGetWeapon = KinkyDungeonInventoryGetWeapon;
    function legacyLookup(native, receiver, name, container) {
        const current = resolveName(name);
        const old = legacyByName[current];
        // Native load refreshes at delta zero before afterLoadGame migrates the inventory keys.
        const item = native.call(receiver, current, container);
        return item || (old ? native.call(receiver, old, container) : item);
    }
    KinkyDungeonInventoryGetWeapon = function (name, container) {
        return legacyLookup(nativeGetWeapon, this, name, container);
    };
    const nativeGetInventory = KinkyDungeonInventoryGet;
    KinkyDungeonInventoryGet = function (name, container) {
        return legacyLookup(nativeGetInventory, this, name, container);
    };
    const nativeGetSafe = KinkyDungeonInventoryGetSafe;
    KinkyDungeonInventoryGetSafe = function (name, container) {
        return legacyLookup(nativeGetSafe, this, name, container);
    };
    const nativeFindWeapon = KinkyDungeonFindWeapon;
    KinkyDungeonFindWeapon = function (name) {
        return nativeFindWeapon.call(this, resolveName(name));
    };
    const nativeSetWeapon = KDSetWeapon;
    KDSetWeapon = function (name, forced) {
        legacyEquipped = legacyNames[name] ? name : undefined;
        return nativeSetWeapon.call(this, resolveName(name), forced);
    };
    KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, migrateInventory);
    migrateInventory();

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
        bind: 10,
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
        target.slow = Math.max(before, tags.slowresist || resistance === 1 ? 1 : 3);
        if (target.slow > before) KinkyDungeonSendEvent("slow", data, undefined, data.forceWeapon);
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
        const owned = [...KinkyDungeonInventory.get(Weapon).values()].map((item) =>
            resolveName(KinkyDungeonWeaponVariants[item.name]?.template || item.name),
        );
        const missing = [TOME, STAFF].filter((name) => !owned.includes(name));
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
            "Silk threads run through the spine and across the pages. As you read, they draw the surrounding silk inward.",
        [`KinkyDungeonInventoryItem${TOME}Desc2`]:
            "Grants +20% binding strength in either hand. Cocoon Convergence costs 4 mana, reaches 6 tiles, charges for 2 turns, and has an 8-turn cooldown. It draws silk inward across 21 tiles and binds more strongly near the center. Walls block it. When this weapon's silk alone leaves an enemy helpless, it forms a cocoon. The weave opens as they struggle free.",
        [`KinkyDungeonInventoryItem${STAFF}`]: "Silkweaver's Staff",
        [`KinkyDungeonInventoryItem${STAFF}Desc`]:
            "A web glows at the staff's tip. A sweep sends its strands out to wrap around a target.",
        [`KinkyDungeonInventoryItem${STAFF}Desc2`]:
            "Silken Snare costs 2 mana, reaches 6 tiles, and has a 3-turn cooldown. Its strand binds the first hostile target hit and slows them for up to 3 turns. Walls stop it. When this weapon's silk alone leaves the enemy helpless, it forms a cocoon. The weave loosens as they struggle free.",
        [`ItemPickup${TOME}`]: "You pick up a Tome of Silken Binding.",
        [`ItemPickup${STAFF}`]: "You pick up a Silkweaver's Staff.",
        [`KinkyDungeonSpecial${TOME}`]: "Cocoon Convergence",
        [`KinkyDungeonSpecial${STAFF}`]: "Silken Snare",
        [`KinkyDungeonSpell${CONVERGENCE}`]: "Cocoon Convergence",
        [`KinkyDungeonSpell${SNARE}`]: "Silken Snare",
        [`KDPrereqFail${CONVERGENCE}`]: "Cocoon Convergence needs 4 mana. Its cooldown must also be over.",
        [`KDPrereqFail${SNARE}`]: "Silken Snare needs 2 mana. Its cooldown must also be over.",
    };
    for (const [key, value] of Object.entries(text)) addTextKey(key, value);
    api.Weapons = Object.freeze({
        resolveName,
        remaining,
        visualState: () => ({ clock: state().clock, collapses: pending().collapses }),
    });
})();
