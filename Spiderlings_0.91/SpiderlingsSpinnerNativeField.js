"use strict";

// KD 5.5 adapter for the JSON Spinner topology. The topology owns truth; enemies are attackable projections.
(() => {
    const api = globalThis.Spiderlings,
        KEY = "SpiderlingsSpinnerEncounter",
        PROXY = "SpiderlingsSpinnerWebCell",
        PATH = "SpiderlingsWebTraversal",
        SNARE = "SpiderlingsSpinnerSnaringSilk";
    const topology = () => api.SpinnerTopology;
    const state = (map = KDMapData) => map?.[KEY];
    const cellKey = (cell) => `${cell.x},${cell.y}`;
    const result = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });

    function isSpiderling(entity) {
        return entity?.Enemy?.tags?.spiderlings === true;
    }

    function proxyMarker(entity) {
        return entity?.SpiderlingsSpinnerProxy;
    }

    function isOwnedProxy(entity) {
        return entity?.Enemy?.name === PROXY && !!proxyMarker(entity);
    }

    function invalidateNavigation() {
        KDUpdateEnemyCache = true;
        KDPathCache = new Map();
        KDPathCacheIgnoreLocks = new Map();
    }

    function topologyCell(encounter, cell) {
        return topology()
            .solidCells(encounter.topology)
            .find((candidate) => candidate.x === cell.x && candidate.y === cell.y);
    }

    function hpAtCell(encounter, cell) {
        const physical = topologyCell(encounter, cell);
        if (!physical) return 0;
        const anchorHP = physical.anchorIds.map(
                (id) => encounter.topology.anchors.find((anchor) => anchor.id === id)?.hp || 0,
            ),
            linkHP = physical.linkIds.map((id) => encounter.topology.links.find((link) => link.id === id)?.hp || 0);
        return Math.max(0, ...anchorHP, ...linkHP);
    }

    function createProxy(encounter, physical) {
        const enemy = DialogueCreateEnemy(physical.x, physical.y, PROXY);
        if (!enemy) return undefined;
        enemy.hostile = 999;
        enemy.targetedForAttack = true;
        enemy.SpiderlingsSpinnerProxy = { fieldId: encounter.topology.fieldId, cell: cellKey(physical) };
        enemy.hp = hpAtCell(encounter, physical);
        enemy.maxhp = enemy.hp;
        return enemy;
    }

    function reconcile(map = KDMapData) {
        const encounter = state(map);
        if (!encounter?.topology || map !== KDMapData) return { created: 0, removed: 0, reused: 0 };
        const expected = new Map(
                topology()
                    .solidCells(encounter.topology)
                    .map((cell) => [cellKey(cell), cell]),
            ),
            owned = map.Entities.filter(isOwnedProxy),
            kept = new Map();
        let removed = 0,
            created = 0,
            reused = 0;
        for (const enemy of owned) {
            const marker = proxyMarker(enemy),
                physical = expected.get(marker.cell);
            if (marker.fieldId !== encounter.topology.fieldId || !physical || kept.has(marker.cell)) {
                map.Entities.splice(map.Entities.indexOf(enemy), 1);
                removed++;
                continue;
            }
            enemy.x = physical.x;
            enemy.y = physical.y;
            enemy.hp = hpAtCell(encounter, physical);
            enemy.maxhp = enemy.hp;
            enemy.hostile = 999;
            enemy.targetedForAttack = true;
            kept.set(marker.cell, enemy);
            reused++;
        }
        for (const [key, physical] of expected) if (!kept.has(key) && createProxy(encounter, physical)) created++;
        if (created || removed) invalidateNavigation();
        return { created, removed, reused };
    }

    function initializeMap(input) {
        const owners = input.owners.map((owner) => (typeof owner === "object" ? owner.id : owner)),
            line = topology().createLine({
                fieldId: input.fieldId,
                owners,
                anchors: input.anchors,
            });
        KDMapData[KEY] = {
            version: 1,
            scenario: input.scenario || "doorway",
            topology: line,
            builders: input.builders || {},
        };
        reconcile();
        return state();
    }

    function snapshot(cell) {
        const tile = KinkyDungeonTilesGet(cellKey(cell)),
            occupant = KinkyDungeonEntityAt(cell.x, cell.y),
            player = KinkyDungeonPlayerEntity.x === cell.x && KinkyDungeonPlayerEntity.y === cell.y;
        return {
            cell: { x: cell.x, y: cell.y },
            inBounds: cell.x > 0 && cell.y > 0 && cell.x < KDMapData.GridWidth - 1 && cell.y < KDMapData.GridHeight - 1,
            floor: KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y)),
            protected: !!(tile?.OL || tile?.OffLimits || tile?.Jail || tile?.Protected),
            occupied: !!occupant || player,
        };
    }

    function actionCell(encounter, action) {
        if (action.type === "placeAnchor") {
            const anchor = encounter.topology.anchors.find((candidate) => candidate.id === action.anchorId);
            return anchor && { x: anchor.x, y: anchor.y };
        }
        const link = encounter.topology.links.find((candidate) => candidate.id === action.linkId);
        return link?.plannedCells[link.builtCells.length] || action.cell || { x: -1, y: -1 };
    }

    function applyPaidAction(actor, action) {
        const encounter = state();
        if (!encounter?.topology) return { paid: false, applied: false, reason: "inactive" };
        const cell = actionCell(encounter, action);
        if (
            Math.hypot(cell.x - actor.x, cell.y - actor.y) > 5 ||
            !KinkyDungeonCheckPath(actor.x, actor.y, cell.x, cell.y, false, true, 1, false)
        )
            return { paid: true, applied: false, reason: "range" };
        const applied = topology().applyAction(encounter.topology, action, snapshot(cell));
        encounter.topology = applied.state;
        if (applied.outcome.legal) reconcile();
        return { paid: true, applied: applied.outcome.legal, reason: applied.outcome.reason, effects: applied.effects };
    }

    // This mirrors KinkyDungeonEnemyTryMove's pinned 5.5.0 movement accumulator and threshold.
    function accrueConstructionAction(enemy, delta) {
        if (!(delta > 0)) return false;
        let speed = KinkyDungeonGetBuffedStat(enemy.buffs, "MoveSpeed")
            ? KinkyDungeonMultiplicativeStat(-KinkyDungeonGetBuffedStat(enemy.buffs, "MoveSpeed"))
            : 1;
        if (enemy.bind > 0)
            enemy.SpinnerConstructionPoints = (enemy.SpinnerConstructionPoints || 0) + (speed * delta) / 10;
        else if (enemy.slow > 0)
            enemy.SpinnerConstructionPoints = (enemy.SpinnerConstructionPoints || 0) + (speed * delta) / 2;
        else
            enemy.SpinnerConstructionPoints =
                (enemy.SpinnerConstructionPoints || 0) +
                (KDGameData.SleepTurns > 0 ? 4 * delta * speed : delta * speed);
        const boundCost = KDBoundEffects(enemy) * 0.5,
            needed = enemy.Enemy.movePoints + boundCost;
        if (enemy.SpinnerConstructionPoints < needed) return false;
        enemy.SpinnerConstructionPoints = Math.max(
            0,
            enemy.SpinnerConstructionPoints - enemy.Enemy.movePoints + boundCost,
        );
        return true;
    }

    function handleEnemyTurn(enemy, _target, delta) {
        const encounter = state(),
            builder = encounter?.builders?.[enemy?.id];
        if (!builder || !Array.isArray(builder.actions) || builder.actions.length === 0) return undefined;
        if (!isSpiderling(enemy) || enemy.hp <= 0 || KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy))
            return result(enemy);
        if (accrueConstructionAction(enemy, delta)) {
            const action = builder.actions.shift();
            builder.lastResult = applyPaidAction(enemy, { ...action, ownerId: enemy.id });
        }
        return result(enemy);
    }

    function onNativeDamage(data) {
        const encounter = state(),
            marker = proxyMarker(data?.enemy);
        if (!encounter?.topology || !marker || marker.fieldId !== encounter.topology.fieldId || !(data.dmgDealt > 0))
            return false;
        const [x, y] = marker.cell.split(",").map(Number),
            damaged = topology().damageAt(encounter.topology, { cell: { x, y }, damage: data.dmgDealt });
        encounter.topology = damaged.state;
        reconcile();
        invalidateNavigation();
        return true;
    }

    function targetId(entity) {
        return entity?.player ? "player" : entity?.id;
    }

    function onEntry(entity, x, y) {
        const encounter = state(),
            id = targetId(entity);
        if (!encounter?.topology || id === undefined) return false;
        const consumed = topology().consumeSnare(encounter.topology, id, { x, y });
        encounter.topology = consumed.state;
        if (!consumed.outcome.snared) return false;
        KinkyDungeonApplyBuffToEntity(entity, { id: SNARE, type: "MoveSpeed", power: -1, duration: 2 });
        return true;
    }

    function activeOwnerIds() {
        const encounter = state();
        if (!encounter?.topology) return [];
        return encounter.topology.owners.filter((id) => {
            const owner = KDMapData.Entities.find((entity) => entity.id === id);
            return owner?.hp > 0 && isSpiderling(owner);
        });
    }

    function tick(delta) {
        const encounter = state();
        if (!encounter?.topology || !(delta > 0)) return;
        const settled = topology().tickOwnerless(encounter.topology, { activeOwnerIds: activeOwnerIds(), delta });
        encounter.topology = settled.state;
        if (settled.effects.length) reconcile();
    }

    function canTraverse(mover, proxy) {
        return isSpiderling(mover) && isOwnedProxy(proxy) && proxyMarker(proxy).fieldId === state()?.topology?.fieldId;
    }

    function passThrough(mover, proxy, map) {
        if (!canTraverse(mover, proxy) || !map) return 0;
        const dx = Math.sign(proxy.x - mover.x),
            dy = Math.sign(proxy.y - mover.y),
            x = proxy.x + dx,
            y = proxy.y + dy;
        if (
            (!dx && !dy) ||
            !KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(x, y)) ||
            KinkyDungeonEntityAt(x, y)
        )
            return 0;
        if (KinkyDungeonPlayerEntity.x === x && KinkyDungeonPlayerEntity.y === y) return 0;
        KDMoveEntity(mover, x, y, true, undefined, true, false);
        return 2;
    }

    if (typeof KinkyDungeonEnemies !== "undefined" && !KinkyDungeonEnemies.some((enemy) => enemy.name === PROXY)) {
        const base = KinkyDungeonEnemies.find((enemy) => enemy.name === "IceWall") || {};
        KinkyDungeonEnemies.push({
            ...base,
            name: PROXY,
            faction: "Enemy",
            regen: 0,
            maxhp: 2,
            armor: 0,
            evasion: -100,
            immobile: false,
            pathcondition: PATH,
            AI: "wander",
            attack: "",
            attackRange: 0,
            visionRadius: 0,
            movePoints: 1000,
            attackPoints: 0,
            weight: 0,
            dropTable: [],
            events: [],
            tags: KDMapInit(["construct", "notalk", "nobrain", "nosignal", "noknockback", "temporary"]),
        });
    }
    if (typeof KDModFiles !== "undefined") {
        for (const prefix of ["", typeof KinkyDungeonRootDirectory === "string" ? KinkyDungeonRootDirectory : ""])
            KDModFiles[prefix + "Enemies/" + PROXY + ".png"] =
                KDModFiles[prefix + "Bullets/WebSprayTrail.png"] || KDModFiles["Bullets/WebSprayTrail.png"];
    }
    if (typeof KDPathConditions !== "undefined")
        KDPathConditions[PATH] = { query: canTraverse, doPassthrough: passThrough };

    api.SpinnerNativeField = {
        KEY,
        PROXY,
        PATH,
        SNARE,
        state,
        initializeMap,
        applyPaidAction,
        accrueConstructionAction,
        handleEnemyTurn,
        onNativeDamage,
        onEntry,
        tick,
        reconcile,
        invalidateNavigation,
        canTraverse,
        passThrough,
        isOwnedProxy,
    };
})();
