"use strict";

(() => {
    const api = globalThis.Spiderlings = globalThis.Spiderlings || {};
    const CONFIG = Object.freeze({
        minRangeExclusive: 2,
        maxRangeInclusive: 4,
        cooldownTurns: 5,
        reactionActions: 2,
        warningColor: "#ff66ff",
    });

    function distance(a, b) {
        const dx = Number(a.x) - Number(b.x);
        const dy = Number(a.y) - Number(b.y);
        return Math.sqrt(dx * dx + dy * dy);
    }

    function createController(world) {
        // Source IDs isolate concurrent wind-ups and remain stable when entity objects are refreshed.
        const states = new Map();

        function isEligible(source, target, requireReadyCooldown) {
            if (!source || !target || source.Enemy && source.Enemy.name != "Jumper") return false;
            if (world.isSuppressed && world.isSuppressed(source, target)) return false;
            if (target.Enemy && !target.player && world.validNPC && !world.validNPC(source, target)) return false;
            const range = distance(source, target);
            if (!(range > CONFIG.minRangeExclusive && range <= CONFIG.maxRangeInclusive)) return false;
            if (requireReadyCooldown && world.isCooldownReady && !world.isCooldownReady(source)) return false;
            if (world.canSense && !world.canSense(source, target)) return false;
            if (world.routeClear && !world.routeClear(source, target)) return false;
            const candidates = world.landingCandidates ? world.landingCandidates(source, target) : [];
            return Array.isArray(candidates) && candidates.length > 0;
        }

        function canStart(source, target) {
            return isEligible(source, target, true);
        }

        function start(source, target, committedByKD) {
            const sourceId = source && source.id;
            if (sourceId === undefined || states.has(sourceId)) return {started: false, reason: "already-winding-up"};
            if (!isEligible(source, target, !committedByKD)) return {started: false, reason: "ineligible"};
            const state = {
                sourceId,
                source,
                target: {x: Number(target.x), y: Number(target.y)},
                targetId: target.Enemy && !target.player ? target.id : undefined,
                opportunities: 0,
                skipNextAdvance: true,
                warningColor: CONFIG.warningColor,
            };
            states.set(sourceId, state);
            if (!committedByKD && world.startCooldown) world.startCooldown(source, CONFIG.cooldownTurns);
            if (world.addWarning) world.addWarning(state);
            if (world.announce) world.announce(state);
            return {started: true, sourceId, target: {...state.target}};
        }

        function begin(source, target) {
            return start(source, target, false);
        }

        function commitCast(source, target) {
            // KD commits special cooldown before enemyCast, so this path must not require a ready cooldown again.
            return start(source, target, true);
        }

        function snapshot() {
            return Array.from(states.values(), (state) => ({
                sourceId: state.sourceId,
                target: {...state.target},
                opportunities: state.opportunities,
                ...(state.targetId !== undefined ? {targetId: state.targetId} : {}),
            }));
        }

        function finish(state) {
            states.delete(state.sourceId);
            if (world.clearWarning) world.clearWarning(state);
        }

        function resolve(state) {
            const source = world.findSource ? world.findSource(state.sourceId) : state.source;
            if (!source || world.routeClear && !world.routeClear(source, state.target)) {
                finish(state);
                return {sourceId: state.sourceId, outcome: "failed"};
            }
            const candidates = world.landingCandidates ? world.landingCandidates(source, state.target) : [];
            const landing = Array.isArray(candidates) ? candidates[0] : undefined;
            if (!landing) {
                finish(state);
                return {sourceId: state.sourceId, outcome: "failed"};
            }
            if (world.moveSource) world.moveSource(source, landing);
            let progression;
            if (state.targetId !== undefined) {
                const target = world.findSource && world.findSource(state.targetId);
                if (!target || target.x != state.target.x || target.y != state.target.y
                    || !world.validNPC?.(source, target)) {
                    finish(state);
                    return {sourceId: state.sourceId, outcome: "evaded"};
                }
                progression = world.bindNPC(source, target);
            } else {
                if (!(world.isPlayerAt && world.isPlayerAt(state.target))) {
                    finish(state);
                    return {sourceId: state.sourceId, outcome: "evaded"};
                }
                progression = world.progressWebbing ? world.progressWebbing(source) : {progressed: false};
                if (world.damagePlayer) world.damagePlayer(source, api.Combat.damageInfo("dash"));
            }
            if (progression?.progressed && world.consumeSource) world.consumeSource(source);
            finish(state);
            return {sourceId: state.sourceId, outcome: progression && progression.progressed ? "hit-progressed" : "hit-no-progress"};
        }

        function advancePlayerAction() {
            const outcomes = auditSources();
            for (const state of Array.from(states.values())) {
                // The cast event shares the initiating action; skip it so exactly two later actions remain.
                if (state.skipNextAdvance) {
                    state.skipNextAdvance = false;
                    continue;
                }
                state.opportunities += 1;
                if (state.opportunities >= CONFIG.reactionActions) outcomes.push(resolve(state));
            }
            return outcomes;
        }

        function auditSources() {
            const outcomes = [];
            for (const state of Array.from(states.values())) {
                const source = world.findSource ? world.findSource(state.sourceId) : state.source;
                if (!source || !(Number(source.hp) > 0) || Number(source.stun || 0) > 0 || Number(source.freeze || 0) > 0
                    || world.isSuppressed && world.isSuppressed(source,
                        state.targetId !== undefined ? world.findSource?.(state.targetId) : undefined)
                    || state.targetId !== undefined && !world.validNPC?.(source, world.findSource?.(state.targetId))) {
                    finish(state);
                    outcomes.push({sourceId: state.sourceId, outcome: "cancelled"});
                }
            }
            return outcomes;
        }

        function holdWindingSource(source) {
            if (!source || !states.has(source.id)) return false;
            if (world.holdSource) world.holdSource(source);
            return true;
        }

        function clearAll(reason) {
            const outcomes = [];
            for (const state of Array.from(states.values())) {
                finish(state);
                outcomes.push({sourceId: state.sourceId, outcome: "cleared", reason});
            }
            return outcomes;
        }

        return Object.freeze({advancePlayerAction, auditSources, begin, canStart, clearAll, commitCast, holdWindingSource, snapshot});
    }

    function runtimeRouteClear(source, target) {
        if (typeof KinkyDungeonCheckPath == "function") {
            return KinkyDungeonCheckPath(source.x, source.y, target.x, target.y, false, true, 1, false);
        }
        if (typeof KinkyDungeonCheckProjectileClearance == "function"
            && !KinkyDungeonCheckProjectileClearance(source.x, source.y, target.x, target.y, false)) return false;
        const steps = Math.max(Math.abs(target.x - source.x), Math.abs(target.y - source.y));
        for (let step = 1; step < steps; step += 1) {
            const x = Math.round(source.x + (target.x - source.x) * step / steps);
            const y = Math.round(source.y + (target.y - source.y) * step / steps);
            if (typeof KinkyDungeonEnemyAt == "function") {
                const blocker = KinkyDungeonEnemyAt(x, y);
                if (blocker && blocker.id != source.id) return false;
            }
        }
        return true;
    }

    function runtimeLandingOpen(source, point) {
        if (typeof KinkyDungeonMapGet == "function" && typeof KinkyDungeonMovableTilesSmartEnemy != "undefined"
            && !KinkyDungeonMovableTilesSmartEnemy.includes(KinkyDungeonMapGet(point.x, point.y))) return false;
        if (typeof KinkyDungeonPlayerEntity != "undefined"
            && KinkyDungeonPlayerEntity.x == point.x && KinkyDungeonPlayerEntity.y == point.y) return false;
        if (typeof KinkyDungeonEnemyAt == "function") {
            const occupant = KinkyDungeonEnemyAt(point.x, point.y);
            if (occupant && occupant.id != source.id) return false;
        }
        return runtimeRouteClear(source, point);
    }

    function runtimeLandingCandidates(source, target) {
        const playerOccupiesTarget = typeof KinkyDungeonPlayerEntity != "undefined"
            && KinkyDungeonPlayerEntity.x == target.x && KinkyDungeonPlayerEntity.y == target.y;
        const npcOccupiesTarget = typeof KinkyDungeonEnemyAt == "function" && KinkyDungeonEnemyAt(target.x, target.y);
        if (!playerOccupiesTarget && !npcOccupiesTarget) return runtimeLandingOpen(source, target) ? [{x: target.x, y: target.y}] : [];
        const candidates = [];
        for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
                if (dx == 0 && dy == 0) continue;
                const point = {x: target.x + dx, y: target.y + dy};
                if (runtimeLandingOpen(source, point)) candidates.push(point);
            }
        }
        candidates.sort((a, b) => distance(source, a) - distance(source, b) || a.y - b.y || a.x - b.x);
        return candidates;
    }

    const runtimeWorld = {
        isSuppressed: (source, target) => !!api.Webbing?.isCocoonDispersing(source,
            target?.Enemy && !target.player ? target : KinkyDungeonPlayerEntity),
        validNPC: (source, target) => !!api.Combat?.eligible(source, target),
        bindNPC: (source, target) => api.Combat.hitNPC(source, target, "dash"),
        isCooldownReady: (source) => !(Number(source && source.castCooldownSpecial || 0) > 0),
        canSense: (source, target) => (!source || source.aware !== false)
            && (typeof KDEnemyReallyAware != "function" || KDEnemyReallyAware(source, target))
            && (typeof KDCanDetect != "function" || KDCanDetect(source, target)),
        routeClear: runtimeRouteClear,
        landingCandidates: runtimeLandingCandidates,
        startCooldown(source, turns) {
            source.castCooldownSpecial = Math.max(Number(source.castCooldownSpecial || 0), turns);
        },
        addWarning(state) {
            if (typeof KinkyDungeonExtraWarningTiles == "undefined" || !Array.isArray(KinkyDungeonExtraWarningTiles)) return;
            KinkyDungeonExtraWarningTiles.push({
                duration: 999999,
                delay: 0,
                spiderlingsJumperDashSourceId: state.sourceId,
                warning: {
                    visual_x: state.target.x,
                    visual_y: state.target.y,
                    color: CONFIG.warningColor,
                    scale: 1,
                    x: state.target.x,
                    y: state.target.y,
                    x_orig: state.source.x,
                    y_orig: state.source.y,
                },
            });
        },
        clearWarning(state) {
            if (typeof KinkyDungeonExtraWarningTiles == "undefined" || !Array.isArray(KinkyDungeonExtraWarningTiles)) return;
            for (let index = KinkyDungeonExtraWarningTiles.length - 1; index >= 0; index -= 1) {
                if (KinkyDungeonExtraWarningTiles[index].spiderlingsJumperDashSourceId == state.sourceId) {
                    KinkyDungeonExtraWarningTiles.splice(index, 1);
                }
            }
        },
        announce(state) {
            if (typeof KinkyDungeonSendTextMessage == "function" && typeof TextGet == "function") {
                KinkyDungeonSendTextMessage(4, TextGet(state.targetId === undefined
                    ? "KinkyDungeonSpellCastSpiderlingsJumperDash" : "KinkyDungeonSpellCastSpiderlingsJumperDashNPC"),
                    typeof KDBaseWhite != "undefined" ? KDBaseWhite : "#ffffff", 4, undefined, undefined, undefined, "Combat");
            }
        },
        findSource(sourceId) {
            if (typeof KDMapData == "undefined" || !Array.isArray(KDMapData.Entities)) return undefined;
            return KDMapData.Entities.find((entity) => entity && entity.id == sourceId);
        },
        holdSource(source) {
            source.immobile = Math.max(Number(source.immobile || 0), 1);
        },
        isPlayerAt(target) {
            return typeof KinkyDungeonPlayerEntity != "undefined"
                && KinkyDungeonPlayerEntity.x == target.x && KinkyDungeonPlayerEntity.y == target.y;
        },
        moveSource(source, landing) {
            source.x = landing.x;
            source.y = landing.y;
            source.gx = landing.x;
            source.gy = landing.y;
            source.fx = landing.x;
            source.fy = landing.y;
        },
        damagePlayer(_source, damage) {
            if (typeof KinkyDungeonDealDamage == "function") {
                KinkyDungeonDealDamage({damage: damage.damage, type: damage.type});
            }
        },
        progressWebbing(source) {
            if (typeof KDPlayerEffects == "undefined" || typeof KDPlayerEffects.SpiderlingsWebbingEnemyBind != "function") {
                return {progressed: false};
            }
            const spell = typeof KinkyDungeonSpellListEnemies != "undefined"
                ? KinkyDungeonSpellListEnemies.find((entry) => entry.name == "SpiderlingsJumperDash") : undefined;
            const result = KDPlayerEffects.SpiderlingsWebbingEnemyBind(
                KinkyDungeonPlayerEntity,
                "tickle",
                {name: "SpiderlingsWebbingEnemyBind", profile: "Jumper", consumeOnProgress: true},
                spell,
                "Enemy",
                undefined,
                source,
            );
            return {progressed: !!(result && result.effect)};
        },
        consumeSource(source) {
            source.hp = 0;
        },
    };

    const runtimeController = createController(runtimeWorld);

    function removeNativeTransportBullet(sourceId) {
        if (typeof KDMapData == "undefined" || !Array.isArray(KDMapData.Bullets)) return;
        for (let index = KDMapData.Bullets.length - 1; index >= 0; index -= 1) {
            const bullet = KDMapData.Bullets[index] && KDMapData.Bullets[index].bullet;
            if (bullet && bullet.source == sourceId && bullet.spell && bullet.spell.name == "SpiderlingsJumperDash") {
                KDMapData.Bullets.splice(index, 1);
            }
        }
    }

    function addGenericEvent(trigger, type, handler) {
        if (typeof KDEventMapGeneric == "undefined") return;
        if (typeof KDAddEvent == "function") KDAddEvent(KDEventMapGeneric, trigger, type, handler);
        else {
            KDEventMapGeneric[trigger] = KDEventMapGeneric[trigger] || {};
            KDEventMapGeneric[trigger][type] = handler;
        }
    }

    function registerRuntime() {
        if (typeof KDCastConditions != "undefined") {
            KDCastConditions.SpiderlingsJumperDash = (source, target) => runtimeController.canStart(source, target);
        }
        addGenericEvent("enemyCast", "SpiderlingsJumperDash", (_event, data) => {
            if (!data || !data.spell || data.spell.name != "SpiderlingsJumperDash" || !data.enemy) return;
            removeNativeTransportBullet(data.enemy.id);
            const target = data.player?.Enemy && !data.player.player ? data.player : {x: data.tx, y: data.ty};
            runtimeController.commitCast(data.enemy, target);
        });
        addGenericEvent("tickAfter", "SpiderlingsJumperDash", (_event, data) => {
            if (!data || !(Number(data.delta) > 0)) return;
            runtimeController.advancePlayerAction();
        });
        addGenericEvent("beforeEnemyLoop", "SpiderlingsJumperDash", (_event, data) => {
            if (!data || !data.enemy) return;
            runtimeController.holdWindingSource(data.enemy);
        });
        addGenericEvent("afterEnemyTick", "SpiderlingsJumperDash", (_event, data) => {
            if (!data || data.allied !== false) return;
            runtimeController.auditSources();
        });
        for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterLoadGame"]) {
            addGenericEvent(trigger, "SpiderlingsJumperDashClear", () => runtimeController.clearAll(trigger));
        }
    }

    api.JumperDash = Object.freeze({CONFIG, createController, runtimeController});
    registerRuntime();
})();
