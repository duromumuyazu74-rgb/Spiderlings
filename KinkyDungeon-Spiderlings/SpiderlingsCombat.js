"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const FLAG = "SpiderlingsNPCSilk";
    const CONTACT_FLAG = "SpiderlingsLightContact";
    const CONFIG = Object.freeze(
        Object.fromEntries(
            Object.entries({
                melee: { damage: 0.05, bind: 1.5 },
                dash: { damage: 0.1, bind: 3 },
                direct: { damage: 0.05, bind: 3 },
                trail: { damage: 0.01, bind: 0.5 },
            }).map(([kind, values]) => [kind, Object.freeze(values)]),
        ),
    );
    const CROSSFIRE = Object.freeze({ window: 2, bind: 2, cooldown: 4 });
    const COOLDOWN = "SpiderlingsNPCCrossfireCooldown";
    const SILK_GAG = "SpiderlingsNPCSilkGag";
    let cooperationClock = 0;
    let directHits = new WeakMap();
    const meleeSpecies = new Set(["Spinner", "Jumper"]);
    let meleeFrame;
    const trailHits = new Set();

    function eligible(source, target) {
        return !!(
            source?.hp > 0 &&
            target?.hp > 0 &&
            !target.player &&
            target.Enemy &&
            typeof KDHostile === "function" &&
            KDHostile(source, target)
        );
    }

    function damageInfo(kind) {
        return { damage: CONFIG[kind].damage, type: "tickle" };
    }

    function pressureNPCShield(target) {
        if (!(target?.shield > 0) || typeof KinkyDungeonApplyBuffToEntity !== "function") return;
        const regen = typeof KDGetShieldRegen === "function" ? KDGetShieldRegen(target) : 0;
        KinkyDungeonApplyBuffToEntity(target, {
            id: "SpiderlingsWebShieldPressure",
            type: "ShieldDrain",
            power: Math.max(2, regen + 2),
            duration: 2,
        });
    }

    function damagePlayer(kind) {
        if (typeof KinkyDungeonDealDamage === "function") return KinkyDungeonDealDamage(damageInfo(kind));
    }

    function silkPayload(source, bind, attack, contact = true) {
        return {
            damage: 0,
            type: "glue",
            bind,
            bindType: "Slime",
            time: 0,
            flags: [FLAG],
            spiderlingsAttack: attack,
            spiderlingsSource: source,
            spiderlingsSuppressContact: !contact,
        };
    }

    function payload(kind, source) {
        return silkPayload(source, CONFIG[kind].bind, kind);
    }

    function spraySource(bullet) {
        const data = bullet?.bullet;
        const effect = data?.playerEffect || data?.spell?.playerEffect;
        if (effect?.provenance !== "WebCaster.WebSpray" || !["direct", "trail"].includes(effect.triggerSource)) return;
        const source =
            typeof KDMapData !== "undefined" ? KDMapData.Entities.find((e) => e.id === data.source) : undefined;
        return source?.Enemy?.name === "WebCaster" ? { source, effect } : undefined;
    }

    // Native faction favorability can disagree with our entity-pair hostility
    // (Enemy -> Maidforce). Override only that gate in this one NPC query;
    // native geometry, collision flags, warning and unique-hit checks still run.
    function collision(native) {
        return function (bullet, target) {
            const shot = spraySource(bullet);
            if (!shot || target?.player) return native.apply(this, arguments);
            if (!eligible(shot.source, target)) return false;
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

    function event(trigger, name, handler) {
        if (typeof KDAddEvent === "function" && typeof KDEventMapGeneric !== "undefined")
            KDAddEvent(KDEventMapGeneric, trigger, name, handler);
    }

    // Slime is shared with native attacks. Attribute only binding actually
    // added by our marked payload, then retain that attribution in NPC saves.
    event("beforeDamageEnemy", SILK_GAG, (_event, data) => {
        if (data.incomingDamage?.flags?.includes(FLAG))
            data.spiderlingsSlimeBefore = data.enemy?.specialBoundLevel?.Slime || 0;
    });
    event("afterDamageEnemy", SILK_GAG, (_event, data) => {
        if (
            data.incomingDamage?.flags?.includes(FLAG) &&
            (data.enemy?.specialBoundLevel?.Slime || 0) > data.spiderlingsSlimeBefore
        )
            data.enemy[SILK_GAG] = true;
    });
    function silkGagged(enemy) {
        if (!enemy?.[SILK_GAG]) return false;
        if (!(enemy.boundLevel > 0) || !(enemy.specialBoundLevel?.Slime > 0)) {
            delete enemy[SILK_GAG];
            return false;
        }
        return KDHelpless(enemy);
    }
    if (typeof KDEnemyCanTalk === "function") {
        const nativeTalk = KDEnemyCanTalk;
        KDEnemyCanTalk = function (enemy) {
            return !silkGagged(enemy) && nativeTalk.apply(this, arguments);
        };
    }
    if (typeof KDEnemyCanSignal === "function") {
        const nativeSignal = KDEnemyCanSignal;
        KDEnemyCanSignal = function (enemy) {
            return !silkGagged(enemy) && nativeSignal.apply(this, arguments);
        };
    }
    // Commander flee calls MakeNoiseSignal through CanTalk, while ordinary
    // aggro uses CanSignalOthers. Cover direct signal callers as well.
    if (typeof KinkyDungeonMakeNoiseSignal === "function") {
        const nativeNoise = KinkyDungeonMakeNoiseSignal;
        KinkyDungeonMakeNoiseSignal = function (enemy) {
            if (silkGagged(enemy)) return [];
            const heard = nativeNoise.apply(this, arguments);
            // KD 5.5.3 updates the sender's entity goal inside the listener
            // loop. Refresh the actual recipients, keeping native perception
            // and any goal redirected by an afterSignal handler intact.
            if (typeof KDUpdateMoveToEntity === "function") {
                for (const listener of heard) {
                    if (listener !== enemy && listener.gx === enemy.x && listener.gy === enemy.y)
                        KDUpdateMoveToEntity(listener);
                }
            }
            return heard;
        };
    }

    // Damage resistance is evaluated before this event; a severe weakness can
    // turn the binding component into HP damage. The separate tickle component
    // retains reductions, but caps amplification at twice its scaled input:
    // native flat weakness bonuses (+0.5/+1) dwarf these tiny contacts.
    event("duringDamageEnemy", FLAG, (_event, data) => {
        if (data.incomingDamage?.flags?.includes(FLAG)) data.dmgDealt = 0;
        else if (data.incomingDamage?.flags?.includes(CONTACT_FLAG))
            data.dmgDealt = Math.min(data.dmgDealt, Math.max(0, data.dmg) * 2);
    });

    event("afterDamageEnemy", "SpiderlingsContactDamage", (_event, data) => {
        const incoming = data.incomingDamage;
        if (
            !incoming?.flags?.includes(FLAG) ||
            incoming.spiderlingsContactApplied ||
            incoming.spiderlingsCrossfire ||
            incoming.spiderlingsSuppressContact
        )
            return;
        incoming.spiderlingsContactApplied = true;
        if (data.blocked || !(data.enemy?.hp > 0)) return;
        const source = data.attacker || incoming.spiderlingsSource;
        // The binding call already owns the bullet's hit bookkeeping. The
        // second component has no bullet, so it neither skips nor reopens it.
        const contact = { ...damageInfo(incoming.spiderlingsAttack), flags: [CONTACT_FLAG] };
        incoming.spiderlingsDamageDealt = KinkyDungeonDamageEnemy(
            data.enemy,
            contact,
            !!data.bullet,
            true,
            data.spell,
            undefined,
            source,
            data.Delay,
        );
        pressureNPCShield(data.enemy);
    });

    function hitNPC(source, target, kind) {
        if (!eligible(source, target)) return { progressed: false };
        const before = target.boundLevel || 0;
        KinkyDungeonDamageEnemy(target, payload(kind, source), false, true, undefined, undefined, source);
        return { progressed: (target.boundLevel || 0) > before };
    }

    function applySilkBinding(source, target, amount, options = {}) {
        if (!eligible(source, target) || !(amount > 0)) return { progressed: false, boundAdded: 0, slimeAdded: 0 };
        const boundBefore = target.boundLevel || 0,
            slimeBefore = target.specialBoundLevel?.Slime || 0;
        KinkyDungeonDamageEnemy(
            target,
            silkPayload(source, amount, options.attack || "capture", options.contact === true),
            false,
            true,
            undefined,
            undefined,
            source,
        );
        const boundAdded = Math.max(0, (target.boundLevel || 0) - boundBefore),
            slimeAdded = Math.max(0, (target.specialBoundLevel?.Slime || 0) - slimeBefore);
        return { progressed: slimeAdded > 0, boundAdded, slimeAdded };
    }

    function cooperate(source, target) {
        if (target[COOLDOWN] > 0) {
            directHits.delete(target);
            return;
        }
        const active = api.activeWebCasters?.(target) || [];
        if (!active.includes(source)) return;
        const previous = directHits.get(target);
        directHits.set(target, { source, time: cooperationClock });
        if (
            !previous ||
            previous.source === source ||
            cooperationClock - previous.time > CROSSFIRE.window ||
            !active.includes(previous.source)
        )
            return;
        directHits.delete(target);
        // Reserve before the native call: reward events must not recursively
        // form another pair. Cooldown is an entity field retained by native saves.
        target[COOLDOWN] = CROSSFIRE.cooldown;
        const before = target.boundLevel || 0;
        KinkyDungeonDamageEnemy(
            target,
            { ...payload("direct", source), bind: CROSSFIRE.bind, spiderlingsCrossfire: true },
            true,
            true,
            undefined,
            undefined,
            source,
        );
        if (!((target.boundLevel || 0) > before)) delete target[COOLDOWN];
    }

    // The event immediately preceding the native NPC melee damage call arms
    // one conversion. A stack frame limits it to that enemy's synchronous turn.
    if (typeof KinkyDungeonEnemyLoop === "function" && typeof KinkyDungeonDamageEnemy === "function") {
        const nativeLoop = KinkyDungeonEnemyLoop;
        KinkyDungeonEnemyLoop = function (source, target) {
            const previous = meleeFrame;
            meleeFrame =
                meleeSpecies.has(source?.Enemy?.name) && eligible(source, target)
                    ? { source, target, armed: false }
                    : undefined;
            try {
                return nativeLoop.apply(this, arguments);
            } finally {
                meleeFrame = previous;
            }
        };
        event("beforeNPCDamageNPC", FLAG, () => {
            if (meleeFrame) meleeFrame.armed = true;
        });
        const nativeDamage = KinkyDungeonDamageEnemy;
        KinkyDungeonDamageEnemy = function (target, damage, ranged, noMsg, spell, bullet, source) {
            const frame = meleeFrame;
            if (!frame?.armed || frame.source !== source || frame.target !== target || spell || bullet || ranged)
                return nativeDamage.apply(this, arguments);
            frame.armed = false;
            if (!eligible(source, target)) return 0;
            const before = target.boundLevel || 0,
                slimeBefore = target.specialBoundLevel?.Slime || 0,
                helplessBefore = KDHelpless(target);
            const args = Array.from(arguments);
            args[1] = payload("melee", source);
            const result = nativeDamage.apply(this, args);
            const added = (target.boundLevel || 0) - before;
            const slimeAdded = (target.specialBoundLevel?.Slime || 0) - slimeBefore;
            if (slimeAdded > 0 && source.Enemy.name === "Spinner") {
                const captured = api.SpinnerNPCCapture?.onSuccessfulNativeSpinnerHit(source, target, slimeAdded, {
                    helplessBefore,
                });
                if (captured) api.SpinnerNPCRecovery?.clearForCapture(target);
                else api.SpinnerNPCRecovery?.onSuccessfulNativeSpinnerHit(source, target, slimeAdded);
            }
            if (added > 0 && source.Enemy.name !== "Spinner") source.hp = 0;
            // Only this native melee caller treats the return as an effect
            // count. Damage events and every other caller retain real HP loss.
            return added > 0 ? added : result + (args[1].spiderlingsDamageDealt || 0);
        };
    }

    if (typeof KDBulletHitEnemy === "function") {
        const nativeHit = KDBulletHitEnemy;
        KDBulletHitEnemy = function (bullet, target) {
            const original = bullet?.bullet;
            const shot = spraySource(bullet);
            if (!shot) return nativeHit.apply(this, arguments);
            const { source, effect } = shot;
            if (!eligible(source, target)) return;
            const trail = effect.triggerSource === "trail";
            const key = `${source.id}:${target.id}`;
            if (trail && trailHits.has(key)) return;
            const contact = payload(trail ? "trail" : "direct", source);
            // Keep the real bullet (and its native hit bookkeeping), but give
            // this synchronous NPC call a local payload with no equipment tags.
            bullet.bullet = {
                ...original,
                damage: contact,
                playerEffect: undefined,
                spell: { ...original.spell, playerEffect: undefined, bindType: undefined, bindTags: undefined },
            };
            try {
                const before = target.boundLevel || 0;
                const result = nativeHit.apply(this, arguments);
                if (trail && contact.spiderlingsContactApplied) trailHits.add(key);
                if (
                    !trail &&
                    contact.spiderlingsContactApplied &&
                    (target.boundLevel || 0) > before &&
                    eligible(source, target)
                )
                    cooperate(source, target);
                return result;
            } finally {
                bullet.bullet = original;
            }
        };
    }
    event("tickAfter", "SpiderlingsNPCSilkClear", (_event, data) => {
        if (data?.delta > 0) {
            trailHits.clear();
            cooperationClock += data.delta;
            for (const target of typeof KDMapData !== "undefined" ? KDMapData.Entities || [] : []) {
                silkGagged(target);
                if (target[COOLDOWN] > 0) {
                    target[COOLDOWN] = Math.max(0, target[COOLDOWN] - data.delta);
                    if (!target[COOLDOWN]) delete target[COOLDOWN];
                }
            }
        }
    });
    for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterLoadGame"])
        event(trigger, "SpiderlingsNPCSilkClear", () => {
            trailHits.clear();
            directHits = new WeakMap();
            cooperationClock = 0;
        });

    api.Combat = Object.freeze({
        CONFIG,
        CROSSFIRE,
        damageInfo,
        damagePlayer,
        hitNPC,
        applySilkBinding,
        pressureNPCShield,
        eligible,
    });
})();
