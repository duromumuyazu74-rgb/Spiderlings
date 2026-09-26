"use strict";
/* global KDGetBindEffectMult */

// NPC adhesion is separate from KD binding. The enemy owns the saved silk ledger;
// the map owns its clock, so a revisited floor does not age while it is away.
(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsNPCAdhesion";
    const CLOCK = "SpiderlingsNPCAdhesionClock";
    const SERIAL = "SpiderlingsNPCAdhesionSerial";
    const WINDOW = 8;
    const DAMAGE = 0.65;
    const BENCHMARKS = Object.freeze({
        BlindZombie: [3, 6],
        Maidforce: [3, 6],
        MaidforceMini: [6, 9],
        MaidKnightHeavy: [9, 15],
        DragonGirlCrystal: [12, 18],
        DragonGirlShadow: [15, 24],
    });
    const paidAttacks = new Set(["direct", "melee", "dash", "capture", "mage-rune", "mage-spell"]);
    let actingEnemy;

    function now() {
        return typeof KDMapData === "undefined" ? 0 : Number(KDMapData[CLOCK] || 0);
    }

    function slime(target) {
        return Math.max(0, Number(target?.specialBoundLevel?.Slime || 0));
    }

    function thresholds(target) {
        const named = BENCHMARKS[target?.Enemy?.name];
        if (named) return { pin: named[0], full: named[1] };
        const tags = target?.Enemy?.tags || {};
        const factor = tags.unstoppable ? 3 : tags.unflinching ? 2 : 1;
        const hp = Math.max(0, Number(target?.Enemy?.maxhp || 0));
        const pin = Math.max(3, Math.ceil(3 * Math.sqrt(hp / 8) * factor));
        return { pin, full: Math.max(pin + 3, Math.ceil(1.5 * pin)) };
    }

    function record(target) {
        const value = target?.[KEY];
        return value?.version === 1 && Array.isArray(value.contributions) ? value : undefined;
    }

    function clear(target) {
        if (target) delete target[KEY];
    }

    function reconcile(target) {
        const value = record(target);
        if (!value) return;
        const actual = slime(target);
        const previous = Math.max(0, Number(value.lastSlime || 0));
        const removed = Math.max(0, previous - actual);
        if (removed > 0) {
            const oldOwned = Math.max(0, Number(value.ownedSilk || 0));
            value.ownedSilk = Math.max(0, oldOwned - removed);
            const fraction = oldOwned > 0 ? value.ownedSilk / oldOwned : 0;
            for (const contribution of value.contributions) contribution.amount *= fraction;
        }
        value.ownedSilk = Math.min(actual, Math.max(0, Number(value.ownedSilk || 0)));
        value.lastSlime = actual;
        value.contributions = value.contributions.filter(
            (entry) => entry.amount > 0 && Number.isFinite(entry.time) && now() - entry.time < WINDOW,
        );
        if (!value.contributions.length) value.opened = false;
        if (!value.ownedSilk) clear(target);
    }

    function pressure(target) {
        reconcile(target);
        return (record(target)?.contributions || []).reduce((total, entry) => total + entry.amount, 0);
    }

    function hasAttributedSilk(target) {
        if (!(target?.hp > 0)) return false;
        reconcile(target);
        return (record(target)?.ownedSilk || 0) > 0;
    }

    function silkSource(target) {
        reconcile(target);
        const value = record(target);
        if (!value?.sourceFaction || !value.sourceName) return undefined;
        return { id: -1, hp: 1, faction: value.sourceFaction, Enemy: { name: value.sourceName } };
    }

    function hasSpiderHelplessness(target) {
        if (!hasAttributedSilk(target) || typeof KDHelpless !== "function" || !KDHelpless(target)) return false;
        const owned = Math.min(record(target).ownedSilk, Math.max(0, Number(target.boundLevel || 0)));
        const maxhp = target.Enemy?.maxhp;
        if (!(maxhp > 0) || typeof KDNPCStruggleThreshMult !== "function" || typeof KDGetBindEffectMult !== "function")
            return false;
        const fullyBound =
            owned >= maxhp * KDGetBindEffectMult(target) ||
            (target.hp <= 0.1 * maxhp && Math.max(owned, 0.1) > target.hp);
        return fullyBound && (target.hp <= 0.52 || owned > KDNPCStruggleThreshMult(target) * maxhp);
    }

    function status(target) {
        if (!target || target.player || !(target.hp > 0)) return "free";
        if (typeof KDHelpless === "function" && KDHelpless(target)) return "native-helpless";
        const recent = pressure(target);
        const limits = thresholds(target);
        const owned = record(target)?.ownedSilk || 0;
        if (recent >= limits.full && owned >= limits.full) return "full";
        if (recent >= limits.pin && owned > 0) return "initial";
        return "free";
    }

    function blocksVoluntaryMove(target) {
        if (!record(target)) return false;
        const current = status(target);
        return current === "initial" || current === "full";
    }

    function recordNativeSilk(source, target, amount, attack, actionId, contributors) {
        if (!(amount > 0) || !(target?.hp > 0) || !target.Enemy || target.player) return;
        const actual = slime(target);
        if (!(actual > 0)) return;
        let value = record(target);
        if (!value) {
            value = {
                version: 1,
                targetId: target.id,
                lastSlime: Math.max(0, actual - amount),
                ownedSilk: 0,
                contributions: [],
            };
            target[KEY] = value;
        }
        // Reconcile earlier native struggle before adding this particular hit.
        const before = Math.max(0, actual - amount);
        if (value.lastSlime > before) {
            const removed = value.lastSlime - before;
            const oldOwned = value.ownedSilk;
            value.ownedSilk = Math.max(0, oldOwned - removed);
            const fraction = oldOwned > 0 ? value.ownedSilk / oldOwned : 0;
            for (const entry of value.contributions) entry.amount *= fraction;
        }
        value.lastSlime = actual;
        value.ownedSilk = Math.min(actual, value.ownedSilk + amount);
        if (source?.Enemy && typeof KDGetFaction === "function") {
            value.sourceFaction = KDGetFaction(source);
            value.sourceName = source.Enemy.name;
        }
        value.contributions = value.contributions.filter((entry) => entry.amount > 0 && now() - entry.time < WINDOW);
        if (!value.contributions.length) value.opened = false;
        if (attack === "direct" && source?.Enemy?.name === "WebCaster") value.opened = true;
        if (!value.opened || !paidAttacks.has(attack)) return;
        const ids = Array.isArray(contributors) && contributors.length ? contributors : [source?.id];
        const id = actionId || newActionId(source);
        for (const sourceId of ids) {
            const key = `${id}:${sourceId}`;
            const existing = value.contributions.find((entry) => entry.actionId === key);
            if (existing) existing.amount += amount / ids.length;
            else value.contributions.push({ actionId: key, sourceId, time: now(), amount: amount / ids.length });
        }
    }

    function newActionId(source) {
        KDMapData[SERIAL] = Number(KDMapData[SERIAL] || 0) + 1;
        return `${source?.id ?? "unknown"}:${now()}:${KDMapData[SERIAL]}`;
    }

    function onDisplacement(target) {
        if (!target?.[KEY]) return;
        api.NPCWrapping?.onDisplacement?.(target);
        api.SpinnerNPCCapture?.auditSources?.();
    }

    if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "beforeDamageEnemy", KEY, (_event, data) => {
            if (data.incomingDamage?.flags?.includes("SpiderlingsNPCSilk"))
                data.spiderlingsAdhesionBefore = slime(data.enemy);
        });
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) => {
            const incoming = data.incomingDamage;
            if (!incoming?.flags?.includes("SpiderlingsNPCSilk") || data.spiderlingsAdhesionRecorded) return;
            data.spiderlingsAdhesionRecorded = true;
            const added = Math.max(0, slime(data.enemy) - Number(data.spiderlingsAdhesionBefore || 0));
            if (added > 0) {
                const attack =
                    incoming.spiderlingsCrossfire || incoming.spiderlingsAttack === "trail"
                        ? "passive"
                        : incoming.spiderlingsAttack;
                recordNativeSilk(
                    data.attacker || incoming.spiderlingsSource,
                    data.enemy,
                    added,
                    attack,
                    incoming.spiderlingsActionId,
                    incoming.spiderlingsContributors,
                );
            }
        });
        KDAddEvent(KDEventMapGeneric, "beforeDamage", KEY, (_event, data) => {
            if (!record(data?.enemy) || status(data.enemy) !== "full") return;
            if (data.damage > 0) data.damage *= DAMAGE;
        });
        KDAddEvent(KDEventMapGeneric, "enemyMove", KEY, (_event, data) => {
            if (!data?.cancelmove && (data.enemy.x !== data.lastX || data.enemy.y !== data.lastY))
                onDisplacement(data.enemy);
        });
        KDAddEvent(KDEventMapGeneric, "beforeTeleport", KEY, (_event, data) => {
            if (data?.willing && blocksVoluntaryMove(data.entity)) data.cancel = true;
        });
        KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => {
            if (!(data?.delta > 0)) return;
            KDMapData[CLOCK] = now() + data.delta;
            for (const target of KDMapData.Entities || []) reconcile(target);
        });
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
            for (const target of KDMapData.Entities || []) reconcile(target);
        });
        KDAddEvent(KDEventMapGeneric, "draw", KEY, (_event, data) => {
            if (!data || typeof DrawTextFitKDTo !== "function" || typeof kdenemystatusboard === "undefined") return;
            const size = KinkyDungeonGridSizeDisplay;
            const boardPans = typeof StandalonePatched !== "undefined" && StandalonePatched;
            for (const target of KDMapData.Entities || []) {
                if (!record(target) || !(target.hp > 0)) continue;
                if (typeof KinkyDungeonVisionGet === "function" && !(KinkyDungeonVisionGet(target.x, target.y) > 0))
                    continue;
                const state = status(target);
                if (state === "free") continue;
                const key = {
                    initial: "SpiderlingsNPCAdhesionInitial",
                    full: "SpiderlingsNPCAdhesionFull",
                    "native-helpless": "SpiderlingsNPCAdhesionHelpless",
                }[state];
                const x = (target.x - data.CamX - (boardPans ? 0 : data.CamX_offset) + 0.5) * size;
                const y = (target.y - data.CamY - (boardPans ? 0 : data.CamY_offset) - 0.2) * size;
                DrawTextFitKDTo(kdenemystatusboard, TextGet(key), x, y, size * 1.5, "#f2d5fc", "#231527", 13);
            }
        });
    }

    if (typeof KinkyDungeonEnemyLoop === "function") {
        const native = KinkyDungeonEnemyLoop;
        KinkyDungeonEnemyLoop = function (enemy) {
            const previous = actingEnemy;
            actingEnemy = enemy;
            try {
                return native.apply(this, arguments);
            } finally {
                actingEnemy = previous;
            }
        };
    }
    if (typeof KinkyDungeonEnemyTryMove === "function") {
        const native = KinkyDungeonEnemyTryMove;
        KinkyDungeonEnemyTryMove = function (enemy) {
            return blocksVoluntaryMove(enemy) ? false : native.apply(this, arguments);
        };
    }
    if (typeof KDMoveEntity === "function") {
        const native = KDMoveEntity;
        KDMoveEntity = function (enemy, x, y, willing, dash, forceHitBullets, ignoreBlocked, noEvent) {
            if (willing && !noEvent && enemy === actingEnemy && blocksVoluntaryMove(enemy)) return false;
            const previousX = enemy?.x;
            const previousY = enemy?.y;
            const result = native.apply(this, arguments);
            // noEvent scripted transfers do not emit enemyMove.
            if (noEvent && enemy?.[KEY] && (enemy.x !== previousX || enemy.y !== previousY)) onDisplacement(enemy);
            return result;
        };
    }
    if (typeof KinkyDungeonDamageEnemy === "function") {
        const native = KinkyDungeonDamageEnemy;
        KinkyDungeonDamageEnemy = function (target, damage, ranged, noMsg, spell, bullet, attacker) {
            const source =
                attacker ||
                (typeof KDMapData !== "undefined" &&
                    KDMapData.Entities?.find((entity) => entity.id === bullet?.bullet?.source));
            if (!(damage?.damage > 0) || !record(source) || status(source) !== "full")
                return native.apply(this, arguments);
            const args = Array.from(arguments);
            args[1] = { ...damage, damage: damage.damage * DAMAGE };
            return native.apply(this, args);
        };
    }
    if (typeof KinkyDungeonDealDamage === "function") {
        const native = KinkyDungeonDealDamage;
        KinkyDungeonDealDamage = function (damage, bullet) {
            const source =
                typeof KDMapData !== "undefined" &&
                KDMapData.Entities?.find((entity) => entity.id === bullet?.bullet?.source);
            if (!(damage?.damage > 0) || !record(source) || status(source) !== "full")
                return native.apply(this, arguments);
            const args = Array.from(arguments);
            args[0] = { ...damage, damage: damage.damage * DAMAGE };
            return native.apply(this, args);
        };
    }
    // KD's melee path passes Will damage through beforeDamage, but pays Stamina
    // from its local variable afterward. Scope this one resource call to the
    // acting attacker rather than changing unrelated stamina expenditure.
    if (typeof KDChangeStamina === "function") {
        const native = KDChangeStamina;
        KDChangeStamina = function (source, type, trigger, amount) {
            if (
                actingEnemy &&
                source === `enemy${actingEnemy.id}` &&
                type === "enemy" &&
                trigger === "enemyHit" &&
                amount < 0 &&
                record(actingEnemy) &&
                status(actingEnemy) === "full"
            ) {
                const args = Array.from(arguments);
                args[3] = amount * DAMAGE;
                return native.apply(this, args);
            }
            return native.apply(this, arguments);
        };
    }

    api.NPCAdhesion = Object.freeze({
        KEY,
        WINDOW,
        DAMAGE,
        thresholds,
        status,
        pressure,
        hasAttributedSilk,
        hasSpiderHelplessness,
        silkSource,
        blocksVoluntaryMove,
        canWrap: (target) => status(target) === "full",
        onDisplacement,
        recordNativeSilk,
        actionId: newActionId,
    });
})();
