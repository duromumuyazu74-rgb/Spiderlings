"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const MAGE = "MageSpiderlings";
    const HEX = "SpiderlingsMageHex";
    const COLLAPSE = "SpiderlingsMageCollapse";
    const KEY = "SpiderlingsMageSpells";
    const MAX_STACKS = 3;
    const HEX_WARNING = 2;
    const HEX_ACTIVE = 3;
    const COLLAPSE_CHARGE = 3;
    const COLLAPSE_COOLDOWN = 7;

    function state() {
        if (!KDMapData[KEY]) KDMapData[KEY] = { clock: 0, fields: [], collapses: [], marks: {}, blasts: [] };
        return KDMapData[KEY];
    }

    function mageById(id) {
        return KDMapData.Entities.find((entity) => entity.id === id && entity.hp > 0 && entity.Enemy?.name === MAGE);
    }

    function mageSource(id) {
        return mageById(id) || { id, hp: 1, faction: "Enemy", Enemy: { name: MAGE } };
    }

    function hostileMaid(source, target) {
        const huntingPrey = api.HuntingGrounds?.isPrey(source, target);
        return !!(
            target?.hp > 0 &&
            target.Enemy &&
            (huntingPrey ||
                (!target.allied &&
                    !target.Enemy.allied &&
                    !(target.ceasefire > 0) &&
                    !(typeof KDIsInParty === "function" && KDIsInParty(target)) &&
                    !(typeof KDIsServant === "function" && KDIsServant(KDGameData.Collection?.[target.id + ""])) &&
                    typeof KDGetFaction === "function" &&
                    KDGetFaction(target) === "Maidforce")) &&
            typeof KDHostile === "function" &&
            KDHostile(source, target)
        );
    }

    function markKey(target) {
        return target?.player ? "player" : target?.id == null ? undefined : `npc:${target.id}`;
    }

    function markFor(target) {
        const mark = state().marks[markKey(target)];
        return mark && (mark.expiresAt >= state().clock || mark.fragileUntil >= state().clock) ? mark : undefined;
    }

    function contains(field, target) {
        return target && target.x >= field.x && target.x < field.x + 4 && target.y >= field.y && target.y < field.y + 4;
    }

    function collapseDistance(x, y, target) {
        const dx = Math.abs(target.x - x);
        const dy = Math.abs(target.y - y);
        if (dx > 2 || dy > 2 || (dx === 2 && dy === 2)) return -1;
        return Math.max(dx, dy);
    }

    function addMark(target, ownerId) {
        const now = state().clock;
        const key = markKey(target);
        if (!key) return;
        const previous = markFor(target);
        if (previous?.lastStackAt === now) {
            refreshFragility(target);
            return;
        }
        if (previous?.pendingUntil >= now) {
            refreshFragility(target);
            return;
        }
        const stacks = Math.min(MAX_STACKS, (previous?.expiresAt >= now ? previous.stacks : 0) + 1);
        state().marks[key] = {
            stacks,
            ownerId,
            lastStackAt: now,
            expiresAt: now + 2 + stacks,
            fragileUntil: now + 3,
        };
    }

    function refreshFragility(target) {
        const mark = markFor(target);
        if (mark) mark.fragileUntil = state().clock + 3;
    }

    function choose(mage) {
        const s = state();
        const canHex = !s.fields.some((field) => field.ownerId === mage.id && field.endAt > s.clock);
        const canCollapse =
            !s.collapses.some((collapse) => collapse.ownerId === mage.id) && !(mage.SpiderlingsCollapseCooldown > 0);
        const roll = KDRandom();
        if (canHex && roll < 0.34) return HEX;
        if (canCollapse && roll < 0.68) return COLLAPSE;
        return "SpiderlingsMageBolt";
    }

    function removeCastBullet(spell, previous) {
        const index = KDMapData.Bullets.findIndex(
            (bullet) => !previous.has(bullet) && bullet.bullet?.spell?.name === spell,
        );
        if (index < 0) return;
        const [bullet] = KDMapData.Bullets.splice(index, 1);
        bullet.time = 0;
        if (typeof KinkyDungeonUpdateSingleBulletVisual === "function")
            KinkyDungeonUpdateSingleBulletVisual(bullet, true);
        if (typeof KinkyDungeonBulletsID !== "undefined" && bullet.spriteID)
            KinkyDungeonBulletsID[bullet.spriteID] = null;
    }

    if (typeof KinkyDungeonCastSpell === "function") {
        const nativeCast = KinkyDungeonCastSpell;
        KinkyDungeonCastSpell = function (x, y, spell, caster) {
            if (caster?.Enemy?.name !== MAGE || ![HEX, COLLAPSE].includes(spell?.name))
                return nativeCast.apply(this, arguments);
            const s = state();
            if (
                spell.name === COLLAPSE &&
                (caster.SpiderlingsCollapseCooldown > 0 || s.collapses.some((pending) => pending.ownerId === caster.id))
            )
                return { result: "Fail" };
            if (spell.name === HEX && s.fields.some((field) => field.ownerId === caster.id && field.endAt > s.clock))
                return { result: "Fail" };
            const previous = new Set(KDMapData.Bullets);
            const result = nativeCast.apply(this, arguments);
            if (result?.result !== "Cast") return result;
            removeCastBullet(spell.name, previous);
            if (spell.name === HEX) {
                s.fields.push({
                    x: Math.floor(x) - 1,
                    y: Math.floor(y) - 1,
                    ownerId: caster.id,
                    activateAt: s.clock + HEX_WARNING + 1,
                    endAt: s.clock + HEX_WARNING + 1 + HEX_ACTIVE,
                });
            } else {
                s.collapses.push({
                    x: Math.floor(x),
                    y: Math.floor(y),
                    ownerId: caster.id,
                    startAt: s.clock,
                    explodeAt: s.clock + COLLAPSE_CHARGE,
                });
            }
            return result;
        };
    }

    function eligibleTargets(source) {
        const targets = [KinkyDungeonPlayerEntity];
        for (const entity of KDMapData.Entities) if (hostileMaid(source, entity)) targets.push(entity);
        return targets;
    }

    function damageShieldOnly(target, amount) {
        if (!(target.shield > 0)) return;
        target.shield -= Math.min(target.shield, amount);
        if (target.shield <= 0) delete target.shield;
        if (
            typeof KinkyDungeonSetEnemyFlag === "function" &&
            typeof globalThis.KDEnemyShieldRegenStopTime === "function"
        )
            KinkyDungeonSetEnemyFlag(target, "tookShieldDmg", globalThis.KDEnemyShieldRegenStopTime(target));
    }

    function activateField(field) {
        const source = mageSource(field.ownerId);
        for (const target of eligibleTargets(source)) {
            if (!contains(field, target)) continue;
            if (!target.player) damageShieldOnly(target, 3);
        }
    }

    function bindPlayer(source, attempts) {
        for (let i = 0; i < attempts; i++) api.Webbing?.applyEnemyProgression("WebCaster", source, "Enemy");
    }

    function bindMaid(source, target, attempts, actionId) {
        for (let i = 0; i < attempts; i++) {
            if (!(target.hp > 0)) break;
            api.Combat?.applySilkBinding(source, target, 3, { attack: "mage-spell", contact: false, actionId });
        }
    }

    function resolveBlast(blast) {
        const source = mageSource(blast.ownerId);
        const actionId = api.NPCAdhesion?.actionId(source);
        const radius = blast.stacks - 1;
        for (const target of eligibleTargets(source)) {
            if (Math.max(Math.abs(target.x - blast.x), Math.abs(target.y - blast.y)) > radius) continue;
            if (target.player) bindPlayer(source, blast.stacks);
            else bindMaid(source, target, blast.stacks, actionId);
        }
        state().blasts.push({ x: blast.x, y: blast.y, radius, expiresAt: state().clock + 1 });
    }

    function resolveCollapse(collapse) {
        const source = mageById(collapse.ownerId);
        if (!source) return;
        const actionId = api.NPCAdhesion?.actionId(source);
        for (const target of eligibleTargets(source)) {
            const distance = collapseDistance(collapse.x, collapse.y, target);
            if (distance < 0) continue;
            const attempts = 5 - distance * 2;
            const damage = target.player ? Math.max(0, 2 - distance) : attempts;
            if (damage > 0 && target.player && typeof KinkyDungeonDealDamage === "function")
                // KD halves Will loss for glue. Arcane deals the stated 1/2 Will damage.
                KinkyDungeonDealDamage({ damage, type: "arcane" });
            else if (damage > 0 && !target.player && typeof KinkyDungeonDamageEnemy === "function")
                KinkyDungeonDamageEnemy(
                    target,
                    { damage, type: "glue", flags: [KEY] },
                    true,
                    true,
                    undefined,
                    undefined,
                    source,
                );
            if (target.player) bindPlayer(source, attempts);
            else bindMaid(source, target, attempts, actionId);
        }
        source.SpiderlingsCollapseCooldown = COLLAPSE_COOLDOWN;
        state().blasts.push({ x: collapse.x, y: collapse.y, radius: 2, corners: false, expiresAt: state().clock + 1 });
    }

    function trigger(target) {
        const key = markKey(target);
        const mark = markFor(target);
        if (!key || !mark?.stacks || mark.expiresAt < state().clock || mark.pendingUntil >= state().clock) return;
        const s = state();
        s.blasts.push({
            x: target.x,
            y: target.y,
            ownerId: mark.ownerId,
            stacks: mark.stacks,
            detonateAt: s.clock + 2,
        });
        mark.stacks = 0;
        mark.pendingUntil = s.clock + 1;
    }

    KDAddEvent(KDEventMapGeneric, "beforeDamageEnemy", KEY, (_event, data) => {
        data.spiderlingsMageSlimeBefore = data.enemy?.specialBoundLevel?.Slime || 0;
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) => {
        const target = data.enemy;
        const mark = markFor(target);
        if (!mark) return;
        if (mark.fragileUntil >= state().clock && target.shield > 0 && data.dmgShieldDealt > 0) {
            const extra = Math.min(target.shield, data.dmgShieldDealt * 0.5);
            damageShieldOnly(target, extra);
            data.dmgShieldDealt += extra;
        }
        const source = data.attacker || data.incomingDamage?.spiderlingsSource;
        if (
            !["Spinner", "Jumper", "WebCaster"].includes(source?.Enemy?.name) ||
            data.incomingDamage?.spiderlingsAttack === "trail" ||
            data.incomingDamage?.spiderlingsCrossfire ||
            data.incomingDamage?.flags?.includes(KEY)
        )
            return;
        if (
            (target.specialBoundLevel?.Slime || 0) > data.spiderlingsMageSlimeBefore ||
            data.dmgDealt > 0 ||
            data.dmgShieldDealt > 0
        )
            trigger(target);
    });

    if (typeof KDPlayerEffects !== "undefined") {
        for (const effectName of ["SpiderlingsWebbingEnemyBind", "SpiderlingsWebSprayHit"]) {
            const original = KDPlayerEffects[effectName];
            if (typeof original !== "function") continue;
            KDPlayerEffects[effectName] = function (_target, _damage, effect, _spell, _faction, _bullet, source) {
                const result = original.apply(this, arguments);
                if (
                    result?.effect &&
                    ["Spinner", "Jumper", "WebCaster"].includes(source?.Enemy?.name) &&
                    !(effectName === "SpiderlingsWebSprayHit" && effect?.triggerSource !== "direct")
                )
                    trigger(KinkyDungeonPlayerEntity);
                return result;
            };
        }
    }

    KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => {
        const delta = Number(data?.delta || 0);
        if (!(delta > 0)) return;
        const s = state();
        // A positive native tick is one spell turn, like the existing rune timer.
        s.clock += 1;
        for (const caster of KDMapData.Entities)
            if (caster.Enemy?.name === MAGE && caster.SpiderlingsCollapseCooldown > 0)
                caster.SpiderlingsCollapseCooldown = Math.max(0, caster.SpiderlingsCollapseCooldown - 1);
        for (const field of s.fields) {
            if (field.activateAt === s.clock) activateField(field);
            if (field.activateAt > s.clock || field.endAt <= s.clock) continue;
            const source = mageSource(field.ownerId);
            for (const target of eligibleTargets(source))
                if (contains(field, target)) {
                    addMark(target, field.ownerId);
                    refreshFragility(target);
                }
        }
        s.fields = s.fields.filter((field) => field.endAt > s.clock);
        for (const collapse of s.collapses) if (collapse.explodeAt <= s.clock) resolveCollapse(collapse);
        s.collapses = s.collapses.filter((collapse) => collapse.explodeAt > s.clock && mageById(collapse.ownerId));
        const pending = s.blasts.filter((blast) => blast.detonateAt && blast.detonateAt <= s.clock);
        s.blasts = s.blasts.filter((blast) => !blast.detonateAt || blast.detonateAt > s.clock);
        for (const blast of pending) resolveBlast(blast);
        s.blasts = s.blasts.filter((blast) => !blast.expiresAt || blast.expiresAt > s.clock);
        for (const [key, mark] of Object.entries(s.marks))
            if (mark.expiresAt < s.clock && mark.fragileUntil < s.clock) delete s.marks[key];
    });

    KDAddEvent(KDEventMapGeneric, "draw", KEY, (_event, data) => {
        if (typeof KDDraw !== "function" || typeof kdpixisprites === "undefined" || !data) return;
        const s = state();
        const size = KinkyDungeonGridSizeDisplay;
        const root = typeof KinkyDungeonRootDirectory === "string" ? KinkyDungeonRootDirectory : "";
        const pink = api.getSetting?.("spiderlingsPinkWebbing") === true ? "Pink" : "";
        const offset = typeof StandalonePatched !== "undefined" && StandalonePatched ? 0 : data.CamX_offset;
        const draw = (id, x, y, art) =>
            KDDraw(
                kdgameboard,
                kdpixisprites,
                id,
                root + `Bullets/${art}.png`,
                (x - data.CamX - offset + 0.5) * size,
                (y -
                    data.CamY -
                    (typeof StandalonePatched !== "undefined" && StandalonePatched ? 0 : data.CamY_offset) +
                    0.5) *
                    size,
                size,
                size,
                0,
                undefined,
                true,
            );
        for (const field of s.fields)
            for (let dx = 0; dx < 4; dx++)
                for (let dy = 0; dy < 4; dy++)
                    draw(
                        `${KEY}_hex_${field.ownerId}_${dx}_${dy}`,
                        field.x + dx,
                        field.y + dy,
                        field.activateAt > s.clock ? "SpiderlingsMageRuneIcon" : `SpiderWeb${pink}`,
                    );
        for (const collapse of s.collapses) {
            const ring = Math.min(2, s.clock - collapse.startAt);
            for (let dx = -2; dx <= 2; dx++)
                for (let dy = -2; dy <= 2; dy++)
                    if (
                        collapseDistance(0, 0, { x: dx, y: dy }) >= 0 &&
                        Math.max(Math.abs(dx), Math.abs(dy)) === 2 - ring
                    )
                        draw(
                            `${KEY}_collapse_${collapse.ownerId}_${dx}_${dy}`,
                            collapse.x + dx,
                            collapse.y + dy,
                            `SpiderWeb${pink}`,
                        );
        }
        for (const blast of s.blasts)
            if (blast.detonateAt > s.clock)
                for (let dx = -(blast.stacks - 1); dx <= blast.stacks - 1; dx++)
                    for (let dy = -(blast.stacks - 1); dy <= blast.stacks - 1; dy++)
                        draw(
                            `${KEY}_warn_${blast.x}_${blast.y}_${dx}_${dy}`,
                            blast.x + dx,
                            blast.y + dy,
                            `SpiderWeb${pink}`,
                        );
            else if (blast.expiresAt > s.clock)
                for (let dx = -blast.radius; dx <= blast.radius; dx++)
                    for (let dy = -blast.radius; dy <= blast.radius; dy++)
                        if (blast.corners !== false || collapseDistance(0, 0, { x: dx, y: dy }) >= 0)
                            draw(
                                `${KEY}_hit_${blast.x}_${blast.y}_${dx}_${dy}`,
                                blast.x + dx,
                                blast.y + dy,
                                `SpiderWebHit${pink}`,
                            );
    });

    for (const event of ["postMapgen", "defeat", "passout", "postPrisonIntro"])
        KDAddEvent(KDEventMapGeneric, event, KEY, () => {
            delete KDMapData[KEY];
        });

    api.MageSpells = Object.freeze({ choose, collapseDistance, markFor });
})();
