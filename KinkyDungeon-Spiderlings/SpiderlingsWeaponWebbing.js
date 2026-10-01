"use strict";

// Player-paid silk stays separate from Spiderling prey collection and ordinary Slime.
(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsWeaponWebbing";
    const TOME = "SpiderlingTome";
    const STAFF = "SpiderlingStaff";
    const FAMILIES = ["Arm", "Legs", "Ankles", "Belly"];
    const slime = (enemy) => Math.max(0, enemy.specialBoundLevel?.Slime || 0);
    const worn = (enemy) => KDGetNPCRestraints(enemy.id);

    function removeUnsupportedItems(enemy, value) {
        const restraints = worn(enemy);
        value.items = value.items.filter((entry) =>
            Object.values(restraints).some((item) => item.id === entry.id && item.conjured),
        );
        let committed = value.items.reduce((sum, entry) => sum + entry.amount, 0);
        while (value.items.length && committed > value.tome + 1e-6) {
            const entry = value.items.pop();
            for (const [slot, item] of Object.entries(worn(enemy))) {
                if (item.id === entry.id && item.conjured)
                    // Native struggle already removed the silk. Do not debit binding a second time.
                    KDSetNPCRestraint(enemy.id, slot, undefined);
            }
            committed -= entry.amount;
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
        removeUnsupportedItems(enemy, value);
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

    function formSet(enemy, value) {
        if (!canFormCocoon(enemy, value.tome)) return;
        let available = value.tome - value.items.reduce((sum, entry) => sum + entry.amount, 0);
        for (const family of FAMILIES) {
            const restraint = KinkyDungeonGetRestraintByName(`SpiderlingsWebbingLv1${family}`);
            const restraints = worn(enemy);
            if (Object.values(restraints).some((item) => item.name === restraint.name)) continue;
            if (
                restraint.Group &&
                Object.values(restraints).some(
                    (item) => KinkyDungeonGetRestraintByName(item.name)?.Group === restraint.Group,
                )
            )
                continue;
            if (KDCanEquipItemOnNPC(restraint, enemy.id, false, "", "")) continue;
            if (KDGetBlockersToAddRestraint(restraint, enemy, !!restraint.bypass).length) continue;
            const slot = KDGetNPCBindingSlotForItem(restraint, enemy.id);
            if (!slot || restraints[slot.sgroup.id] || slot.sgroup.encasedBy.some((id) => restraints[id])) continue;
            const size = KDNPCRestraintSize(restraint, slot.sgroup, slot.row);
            const layers = KDNPCRestraintValidLayers(restraint, slot.sgroup, slot.row, restraints).slice(0, size);
            if (layers.length !== size || layers.some((layer) => restraints[layer.id])) continue;
            const stats = KDGetRestraintBondageStats(restraint, enemy);
            const uncommitted = slime(enemy) - (KDGetExpectedBondageAmount(enemy.id, enemy).Slime || 0);
            if (stats.type !== "Slime" || stats.amount > Math.min(available, uncommitted)) continue;
            const item = {
                name: restraint.name,
                id: KinkyDungeonGetItemID(),
                lock: "",
                conjured: true,
                faction: "Player",
            };
            // Like native conjured binding, assign equipment against already-paid binding.
            // Preflight every destination; bypass only the destructive native blocker-removal branch.
            for (const layer of layers)
                KDSetNPCRestraint(
                    enemy.id,
                    layer.id,
                    item,
                    false,
                    layers.map((entry) => entry.id),
                    undefined,
                    true,
                );
            value.items.push({ id: item.id, amount: stats.amount });
            available -= stats.amount;
        }
        KDEntityRestraintMetadata.set(enemy.id, KDUpdateRestraintMetadata(enemy.id, 0));
        KDUpdatePersistentNPC(enemy.id);
    }

    KDAddEvent(KDEventMapGeneric, "beforeDamageEnemy", KEY, (_event, data) => {
        reconcile(data.enemy);
        const kind = source(data);
        if (kind) data.spiderlingsWeaponSilk = { kind, before: slime(data.enemy) };
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) => {
        const hit = data.spiderlingsWeaponSilk;
        const enemy = data.enemy;
        if (!hit || !(enemy?.hp > 0) || enemy.player || KDAllied(enemy) || !KDHostile(enemy)) {
            // Record other Slime gains too, so they cannot mask later native removal of owned silk.
            reconcile(enemy);
            return;
        }
        const amount = Math.max(0, slime(enemy) - hit.before);
        if (!(amount > 0)) return;
        const value = (enemy[KEY] ||= { version: 1, tome: 0, staff: 0, lastSlime: hit.before, items: [] });
        value[hit.kind] += amount;
        value.lastSlime = slime(enemy);
        api.SpellVisuals?.hit(enemy);
        if (hit.kind === "tome") formSet(enemy, value);
    });
    KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => {
        if (data.delta > 0) for (const enemy of KDMapData.Entities) reconcile(enemy);
    });
    KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
        for (const enemy of KDMapData.Entities) reconcile(enemy);
    });
    KDAddEvent(KDEventMapGeneric, "afterDress", KEY, (_event, data) => {
        const id = KDNPCChar_ID.get(data.Character);
        const enemy = id && KDGetGlobalEntity(id);
        const value = enemy?.[KEY];
        const mc = value && KDCurrentModels.get(data.Character);
        if (!mc) return;
        const ids = new Set(value.items.map((entry) => entry.id));
        if (Object.values(worn(enemy)).some((item) => ids.has(item.id) && item.name === "SpiderlingsWebbingLv1Arm")) {
            for (const pose of ["Free", "Boxtie", "Yoked", "Front", "Up", "Crossed"]) delete mc.Poses[pose];
            mc.Poses.Wristtie = true;
        }
        if (
            Object.values(worn(enemy)).some(
                (item) => ids.has(item.id) && /SpiderlingsWebbingLv1(?:Legs|Ankles)$/.test(item.name),
            )
        ) {
            // Restraint pose only: native redress restores the NPC preference after removal.
            for (const pose of ["Spread", "Kneel", "KneelClosed", "Hogtie"]) delete mc.Poses[pose];
            mc.Poses.Closed = true;
            mc.Poses.FeetLinked = true;
        }
    });

    api.WeaponWebbing = Object.freeze({
        status(enemy) {
            // Drawing reads current native recovery without removing gear or mutating saved gameplay.
            const current = survivingSilk(enemy);
            if (!current || !(current.remaining > 1e-6)) return;
            const owned = current.remaining;
            const ids = new Set(
                Object.values(worn(enemy))
                    .filter((item) => item.conjured)
                    .map((item) => item.id),
            );
            return {
                amount: owned,
                coverage: Math.min(1, owned / Math.max(1, enemy.Enemy.maxhp * KDGetBindEffectMult(enemy))),
                pieces: enemy[KEY].items.filter((entry) => ids.has(entry.id)).length,
                cocoon: canFormCocoon(enemy, owned),
            };
        },
    });
})();
