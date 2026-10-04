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
    const stages = [1, 1.5, 4.5];
    const chargeCooldowns = [8, 9, 12];
    let casting, attacking, manaLimit;

    // Run-wide cooldowns survive map changes and weapon swaps; pending casts belong to the map.
    function state() {
        return (KDGameData[KEY] ||= { clock: 0, readyAt: {} });
    }

    function pending() {
        const value = (KDMapData[KEY] ||= { collapses: [] });
        value.casts ||= {};
        value.rewards ||= [];
        return value;
    }

    function hostile(target) {
        return !!(target?.Enemy && target.hp > 0 && !target.player && !KDAllied(target) && KDHostile(target));
    }

    function remaining(name) {
        return Math.max(0, (state().readyAt[name] || 0) - state().clock);
    }

    function held() {
        return resolveName(KinkyDungeonWeaponVariants[KinkyDungeonPlayerWeapon]?.template || KinkyDungeonPlayerWeapon);
    }

    function charging() {
        return pending().collapses.find((cast) => (cast.stage || 1) < 3 && cast.explodeAt > state().clock);
    }

    function available(name) {
        const cast = name === CONVERGENCE && charging();
        return (
            held() === (name === CONVERGENCE ? TOME : STAFF) &&
            (cast ? state().clock > (cast.lastChargedAt ?? cast.startAt - 1) : remaining(name) === 0)
        );
    }

    // UI prerequisites, targeting preview and native payment must use the same tier snapshot.
    const nativeManaCost = KinkyDungeonGetManaCost;
    KinkyDungeonGetManaCost = function (spell) {
        if (spell?.name === CONVERGENCE && !spell.spiderlingsWeaponCostSnapshot)
            return nativeManaCost.call(
                this,
                { ...spell, manacost: charging() ? 2 : 4 },
                ...Array.from(arguments).slice(1),
            );
        return nativeManaCost.apply(this, arguments);
    };

    const nativeMana = KDChangeMana;
    KDChangeMana = function (src, type, trig, amount) {
        const before = KinkyDungeonStatMana;
        const result = nativeMana.apply(this, arguments);
        if (casting && src === casting.name && type === "spell" && trig === "cast" && amount < 0)
            casting.paid += Math.max(0, before - KinkyDungeonStatMana);
        return result;
    };
    KDAddEvent(KDEventMapGeneric, "changeMana", KEY, (_event, data) => {
        if (data.src === KEY && manaLimit !== undefined && data.Amount > 0 && data.mult > 0)
            data.Amount = Math.min(data.Amount, manaLimit / data.mult);
    });

    KDAddEvent(KDEventMapGeneric, "beforePlayerLaunchAttack", KEY, () => {
        const weapon = resolveName(KinkyDungeonPlayerDamage?.name);
        attacking = [TOME, STAFF].includes(weapon) ? { weapon, effective: false, cocoons: [] } : undefined;
    });
    const nativeStamina = KDChangeStamina;
    KDChangeStamina = function (src, type, trig, _amount) {
        const before = KinkyDungeonStatStamina;
        const result = nativeStamina.apply(this, arguments);
        if (attacking && src === "attack" && type === "weapon" && trig === "attack") {
            const paid = Math.max(0, before - KinkyDungeonStatStamina);
            if (attacking.effective)
                pending().rewards.push({
                    stamina: Math.min(paid * 0.2, attacking.weapon === TOME ? 0.3 : 0.6),
                    cocoons: attacking.cocoons.length,
                });
            attacking = undefined;
        }
        return result;
    };

    function rewardHit(data, effective, cocoon) {
        if (!effective) return false;
        const token = data.spell?.spiderlingsWeaponCast;
        if (token) {
            const cast = pending().casts[token];
            if (!cast) return false;
            if (!cast.staminaReturned) {
                cast.staminaReturned = true;
                pending().rewards.push({ stamina: 0.6 });
            }
            if (cocoon) pending().rewards.push({ cast: token, cocoons: 1 });
            return true;
        } else if (!data.spell && attacking) {
            attacking.effective = true;
            if (cocoon) attacking.cocoons.push(data.enemy.id);
            return true;
        }
        return false;
    }

    function payRewards() {
        const rewards = pending().rewards.splice(0);
        for (const reward of rewards) {
            if (reward.stamina) KDChangeStamina(KEY, "weapon", "silk", reward.stamina);
            const cast = reward.cast && pending().casts[reward.cast];
            let budget = cast
                ? Math.min(cast.paidMana * 0.5, cast.name === CONVERGENCE ? 2 : Infinity) - cast.manaReturned
                : Infinity;
            for (let i = 0; i < (reward.cocoons || 0) && budget > 0; i++) {
                const before = KinkyDungeonStatMana;
                manaLimit = budget;
                try {
                    KDChangeMana(KEY, "weapon", "cocoon", 0.75);
                } finally {
                    manaLimit = undefined;
                }
                const credited = Math.max(0, KinkyDungeonStatMana - before);
                budget -= credited;
                if (cast) cast.manaReturned += credited;
            }
        }
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
        // Native targeting must show the same 21 cells as the saved inward circle.
        aoe: 2.5,
        aoetype: "",
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
        KDPrereqs[spell.name] = () => available(spell.name) && KinkyDungeonHasMana(KinkyDungeonGetManaCost(spell));
    }

    // Commit the circle only after native payment and a successful Cast result.
    KinkyDungeonSpellSpecials[CONVERGENCE] = () => {};

    const nativeActivate = KinkyDungeonActivateWeaponSpell;
    KinkyDungeonActivateWeaponSpell = function () {
        const charge = held() === TOME && charging();
        if (!charge || KinkyDungeonPlayerDamage?.special?.spell !== CONVERGENCE)
            return nativeActivate.apply(this, arguments);
        const previousX = KinkyDungeonTargetX,
            previousY = KinkyDungeonTargetY;
        KinkyDungeonTargetX = charge.x;
        KinkyDungeonTargetY = charge.y;
        KinkyDungeonTargetingSpell = null;
        try {
            return nativeActivate.call(this, true);
        } finally {
            KinkyDungeonTargetX = previousX;
            KinkyDungeonTargetY = previousY;
        }
    };

    const nativeCast = KinkyDungeonCastSpell;
    KinkyDungeonCastSpell = function (x, y, spell, enemy, player, bullet) {
        if (!cooldowns[spell?.name]) return nativeCast.apply(this, arguments);
        if (
            enemy ||
            bullet ||
            !player?.player ||
            !available(spell.name) ||
            !KinkyDungeonHasMana(KinkyDungeonGetManaCost(spell))
        )
            return { result: "Fail" };
        const charge = spell.name === CONVERGENCE && charging();
        if (charge) {
            x = charge.x;
            y = charge.y;
        }
        if (Math.hypot(x - player.x, y - player.y) > 6 || !Number.isInteger(x) || !Number.isInteger(y))
            return { result: "Fail" };
        if (
            spell.name === CONVERGENCE &&
            (!KinkyDungeonTransparentObjects.includes(KinkyDungeonMapGet(x, y)) ||
                !(KinkyDungeonVisionGet(x, y) > 0) ||
                !KinkyDungeonCheckPath(player.x, player.y, x, y, true, false))
        )
            return { result: "Fail" };
        const token = charge?.token || `silk${(state().serial = (state().serial || 0) + 1)}`;
        const snapshot = {
            ...spell,
            manacost: charge ? 2 : spell.manacost,
            spiderlingsWeaponCostSnapshot: true,
            spiderlingsWeaponCast: token,
        };
        const args = Array.from(arguments);
        args[0] = x;
        args[1] = y;
        args[2] = snapshot;
        const payment = { name: spell.name, paid: 0 };
        const previous = casting;
        let result;
        casting = payment;
        try {
            result = nativeCast.apply(this, args);
        } finally {
            casting = previous;
        }
        if (result?.result === "Cast") {
            const budget = (pending().casts[token] ||= { name: spell.name, paidMana: 0, manaReturned: 0 });
            budget.paidMana += payment.paid;
            if (spell.name === CONVERGENCE) {
                if (charge) {
                    charge.stage = (charge.stage || 1) + 1;
                    charge.explodeAt += 1;
                    charge.lastChargedAt = state().clock;
                    charge.token = token;
                } else
                    pending().collapses.push({
                        x,
                        y,
                        stage: 1,
                        startAt: state().clock + 1,
                        explodeAt: state().clock + 3,
                        ownerId: state().clock,
                        lastChargedAt: state().clock,
                        token,
                    });
                const current = charge || pending().collapses.at(-1);
                state().readyAt[spell.name] = current.startAt - 1 + chargeCooldowns[(current.stage || 1) - 1];
            } else state().readyAt[spell.name] = state().clock + cooldowns[spell.name];
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
                    bind: power * 8 * stages[(collapse.stage || 1) - 1],
                    bindType: "Slime",
                    type: "glue",
                    time: 0,
                    flags: [KEY],
                    nocrit: true,
                },
                true,
                false,
                { ...convergence, spiderlingsWeaponCast: collapse.token },
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
        payRewards();
    });
    for (const event of ["postMapgen", "defeat", "passout", "postPrisonIntro"])
        KDAddEvent(KDEventMapGeneric, event, KEY, () => {
            delete KDMapData[KEY];
        });

    const nativeActionBar = KinkyDungeonDrawActionBar;
    KinkyDungeonDrawActionBar = function () {
        const weapon = held();
        const hover = [TOME, STAFF].includes(weapon) && MouseIn(580, 825, 50, 90);
        if (!hover) return nativeActionBar.apply(this, arguments);
        const title = TextGet(`KinkyDungeonSpecial${weapon}`),
            nativeText = DrawTextFitKD;
        let result;
        // Replace only the native name-only tooltip; keep the button and its input intact.
        DrawTextFitKD = function (text) {
            if (text !== title) return nativeText.apply(this, arguments);
        };
        try {
            result = nativeActionBar.apply(this, arguments);
        } finally {
            DrawTextFitKD = nativeText;
        }
        const spell = weapon === TOME ? convergence : snare;
        const sections = [TextGet(`KinkyDungeonSpellDescription${spell.name}`)];
        let status;
        if (weapon === TOME) {
            sections.push(TextGet(`KinkyDungeonSpellDescription2${spell.name}`));
            const stage = pending().collapses.at(-1)?.stage || 0;
            status = TextGet("KDSpiderlingsWeaponWeaveStatus")
                .replace("STAGE", stage)
                .replace("COST", Math.round(KinkyDungeonGetManaCost(spell) * 10))
                .replace("COOLDOWN", remaining(spell.name));
        }
        sections.push(TextGet(`KDSpiderlingsWeaponSustain${weapon}`));
        const lines = KinkyDungeonWordWrap(sections.join("\n"), 42, 78).split("\n");
        const width = 920,
            left = Math.max(520, Math.min(1960 - width, MouseX + 35));
        const height = 64 + (status ? 30 : 0) + lines.length * 24;
        const top = Math.max(30, Math.min(970 - height, MouseY - 20 - height));
        FillRectKD(kdcanvas, kdpixisprites, `${KEY}Tooltip`, {
            Left: left,
            Top: top,
            Width: width,
            Height: height,
            Color: "#151019",
            alpha: 0.85,
            zIndex: 149,
        });
        DrawTextFitKD(title, left + 20, top + 26, width - 40, "#f2d5fc", "#231527", 26, "left", 150);
        if (status) DrawTextFitKD(status, left + 20, top + 56, width - 40, "#ffe6a1", "#231527", 22, "left", 150);
        for (let i = 0; i < lines.length; i++)
            DrawTextFitKD(
                lines[i],
                left + 20,
                top + 58 + (status ? 30 : 0) + i * 24,
                width - 40,
                "#f2d5fc",
                "#231527",
                20,
                "left",
                150,
            );
        return result;
    };

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
        [`KinkyDungeonInventoryItem${TOME}Desc`]: "Soft silk threads run through the spine and lie across the pages.",
        [`KinkyDungeonInventoryItem${TOME}Desc2`]:
            "Cocoon Convergence: a silk circle within 6 tiles closes after two further actions, strongest at its center. Reuse before closure to reach up to three tiers; each extra weave costs mana and an action, delaying closure one turn. +20% binding in either hand. Its effective hits can restore stamina; each prey's first complete cocoon of this silk can return limited mana.",
        [`KinkyDungeonInventoryItem${STAFF}`]: "Silkweaver's Staff",
        [`KinkyDungeonInventoryItem${STAFF}Desc`]: "A fine web cups a faint glow at the staff's tip.",
        [`KinkyDungeonInventoryItem${STAFF}Desc2`]:
            "Silken Snare: fire silk up to 6 tiles, binding and slowing the first hostile target hit. Walls block it. Its effective hits can restore stamina; each prey's first complete cocoon of this silk can return limited mana.",
        [`ItemPickup${TOME}`]: "You pick up a Tome of Silken Binding.",
        [`ItemPickup${STAFF}`]: "You pick up a Silkweaver's Staff.",
        [`KinkyDungeonSpecial${TOME}`]: "Cocoon Convergence",
        [`KinkyDungeonSpecial${STAFF}`]: "Silken Snare",
        [`KinkyDungeonSpell${CONVERGENCE}`]: "Cocoon Convergence",
        [`KinkyDungeonSpell${SNARE}`]: "Silken Snare",
        [`KinkyDungeonSpellDescription${CONVERGENCE}`]:
            "Weave a silk circle up to 6 tiles away. It closes after two further actions, binding more strongly toward the center. Use this special again to deepen the same weave, up to three tiers; each added weave spends mana and one action and delays the closure by one turn. Walls block the silk.",
        [`KinkyDungeonSpellDescription2${CONVERGENCE}`]:
            "Additional weaves cost 20 base mana each. Binding strength: 1 / 1.5 / 4.5; cooldown: 8 / 9 / 12 turns from the first weave. Effective hits restore 6 stamina once per circle. A prey's first complete silk cocoon returns magic, limited to half the circle's paid mana and at most 20 mana.",
        [`KinkyDungeonSpellDescription${SNARE}`]:
            "Send sticky silk up to 6 tiles toward the first hostile target. The strand binds and slows its prey; walls stop it. Cooldown: 3 turns. An effective hit restores 6 stamina; a prey's first complete silk cocoon returns magic, limited to half the paid mana.",
        [`KDSpiderlingsWeaponSustain${TOME}`]:
            "+20% binding in either hand. Effective melee restores 20% of paid stamina, up to 3 base stamina. A prey's first silk cocoon made by melee returns 7.5 base mana once.",
        [`KDSpiderlingsWeaponSustain${STAFF}`]:
            "Effective melee restores 20% of paid stamina, up to 6 base stamina. A prey's first silk cocoon made by melee returns 7.5 base mana once.",
        KDSpiderlingsWeaponWeaveStatus: "Weave STAGE/3. Next mana cost: COST. New circle in COOLDOWN turns.",
        [`KDPrereqFail${CONVERGENCE}`]:
            "The tome must be in your hand, with enough mana for this weave. A finished circle must recover before another begins.",
        [`KDPrereqFail${SNARE}`]: "The staff must be in your hand, with enough mana and its cooldown over.",
    };
    for (const [key, value] of Object.entries(text)) addTextKey(key, value);
    api.Weapons = Object.freeze({
        resolveName,
        remaining,
        rewardHit,
        visualState: () => ({ clock: state().clock, collapses: pending().collapses }),
    });
})();
