"use strict";

// Player weapon silk is material ownership, never additional NPC equipment.
(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsWeaponWebbing";
    const REWARDED = "SpiderlingsWeaponCocoonRewarded";
    const TOME = "SpiderlingTome",
        STAFF = "SpiderlingStaff";
    const legacyNames = new Set(["Arm", "Legs", "Ankles", "Belly"].map((family) => `SpiderlingsWebbingLv1${family}`));
    const slime = (enemy) => Math.max(0, enemy.specialBoundLevel?.Slime || 0);

    function clearLegacyItems(enemy, value) {
        if (!value.items?.length) return;
        const ids = new Set((value.items || []).map((entry) => entry.id));
        let changed = false;
        for (const [slot, item] of Object.entries(KDGetNPCRestraints(enemy.id))) {
            if (!ids.has(item.id) || !item.conjured || !legacyNames.has(item.name)) continue;
            // The native material remains paid. Equipment removal here must not debit it again.
            KDSetNPCRestraint(enemy.id, slot, undefined);
            changed = true;
        }
        value.items = [];
        if (changed) {
            KDEntityRestraintMetadata.set(enemy.id, KDUpdateRestraintMetadata(enemy.id, 0));
            KDUpdatePersistentNPC(enemy.id);
        }
    }

    function survivingSilk(enemy) {
        const value = enemy?.[KEY];
        if (!value) return;
        const actual = enemy.hp > 0 ? slime(enemy) : 0;
        const owned = value.tome + value.staff;
        const remaining = Math.min(actual, Math.max(0, owned - Math.max(0, value.lastSlime - actual)));
        const ratio = owned > 0 ? remaining / owned : 0;
        return { tome: value.tome * ratio, staff: value.staff * ratio, actual, remaining };
    }

    function reconcile(enemy) {
        const current = survivingSilk(enemy);
        if (!current) return;
        const value = enemy[KEY];
        value.tome = current.tome;
        value.staff = current.staff;
        value.lastSlime = current.actual;
        clearLegacyItems(enemy, value);
        if (!(current.remaining > 1e-6)) delete enemy[KEY];
        return enemy[KEY];
    }

    function source(data) {
        if (!data.attacker?.player && data.bullet?.bullet?.faction !== "Player") return;
        if (data.spell?.name === "SpiderlingsCocoonConvergence") return "tome";
        if (data.spell?.name === "SpiderlingsSilkenSnare") return "staff";
        if (data.spell) return;
        const name = api.Weapons.resolveName(data.weapon?.name || data.incomingDamage?.name);
        return name === TOME ? "tome" : name === STAFF ? "staff" : undefined;
    }

    function canFormCocoon(enemy, owned) {
        if (!KDCanBind(enemy) || !KDHelpless(enemy)) return false;
        const hp = enemy.Enemy.maxhp;
        const fullyBound =
            owned >= hp * KDGetBindEffectMult(enemy) || (enemy.hp <= 0.1 * hp && Math.max(owned, 0.1) > enemy.hp);
        return fullyBound && (enemy.hp <= 0.52 || owned > KDNPCStruggleThreshMult(enemy) * hp);
    }

    // KD 5.4.92 creates directly here; 5.5's KDAddNewEntity delegates to the same entry.
    const nativeAddEntity = KDAddEntity;
    KDAddEntity = function (enemy) {
        if (enemy.summoned && (enemy.faction === "Player" || enemy.Enemy?.allied))
            enemy.SpiderlingsWeaponPlayerCreated = true;
        return nativeAddEntity.apply(this, arguments);
    };

    KDAddEvent(KDEventMapGeneric, "beforeDamageEnemy", KEY, (_event, data) => {
        reconcile(data.enemy);
        const enemy = data.enemy;
        if (enemy?.summoned && KDAllied(enemy)) enemy.SpiderlingsWeaponPlayerCreated = true;
        const kind = source(data);
        if (kind && enemy?.hp > 0 && !enemy.player && !KDAllied(enemy) && KDHostile(enemy))
            data.spiderlingsWeaponSilk = {
                kind,
                before: slime(enemy),
                hp: enemy.hp,
                rewardEligible: !enemy.SpiderlingsWeaponPlayerCreated && !enemy.Enemy.allied,
                cocoon: canFormCocoon(enemy, enemy[KEY] ? enemy[KEY].tome + enemy[KEY].staff : 0),
            };
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) => {
        const hit = data.spiderlingsWeaponSilk,
            enemy = data.enemy;
        if (!hit || enemy.player || KDAllied(enemy) || !KDHostile(enemy)) {
            reconcile(enemy);
            return;
        }
        const amount = enemy.hp > 0 ? Math.max(0, slime(enemy) - hit.before) : 0;
        if (amount > 0) {
            const value = (enemy[KEY] ||= { version: 2, tome: 0, staff: 0, lastSlime: hit.before, items: [] });
            value[hit.kind] += amount;
            value.lastSlime = slime(enemy);
        } else if (enemy.hp <= 0) reconcile(enemy);
        const effective = (data.dmgDealt || 0) > 0 || amount > 0;
        if (effective && enemy.hp > 0) api.SpellVisuals?.hit(enemy);
        const owned = enemy[KEY] ? enemy[KEY].tome + enemy[KEY].staff : 0;
        const cocoon = effective && enemy.hp > 0 && !hit.cocoon && canFormCocoon(enemy, owned) && !enemy[REWARDED];
        if (hit.rewardEligible && effective) {
            if (api.Weapons.rewardHit(data, true, cocoon) && cocoon) enemy[REWARDED] = true;
        }
    });
    KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => {
        if (data.delta > 0) for (const enemy of KDMapData.Entities) reconcile(enemy);
    });
    KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
        for (const enemy of KDMapData.Entities) reconcile(enemy);
    });

    api.WeaponWebbing = Object.freeze({
        status(enemy) {
            const current = survivingSilk(enemy);
            if (!current || !(current.remaining > 1e-6)) return;
            const owned = current.remaining;
            return {
                amount: owned,
                coverage: Math.min(1, owned / Math.max(1, enemy.Enemy.maxhp * KDGetBindEffectMult(enemy))),
                pieces: 0,
                cocoon: canFormCocoon(enemy, owned),
            };
        },
    });
})();
