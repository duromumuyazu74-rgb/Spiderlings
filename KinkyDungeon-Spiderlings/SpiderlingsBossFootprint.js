"use strict";

// Native occupancy is single-cell, including DragonQueen. Parts block movement;
// damage and area targeting resolve to one living Matriarch.
(() => {
    const api = globalThis.Spiderlings;
    const NAME = "SpiderlingsMatriarch";
    const PART = "SpiderlingsMatriarchPart";
    let areaTargets;
    const offsets = [];
    for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) offsets.push({ x, y });
    const isBoss = (enemy) => enemy?.Enemy?.name === NAME;
    const isPart = (enemy) => enemy?.Enemy?.name === PART && enemy.SpiderlingsBossParent != null;
    const root = (enemy) =>
        isPart(enemy)
            ? KDMapData.Entities.find((other) => other.id === enemy.SpiderlingsBossParent && isBoss(other))
            : enemy;
    const cells = (enemy, x = enemy.x, y = enemy.y) => [{ x, y }, ...offsets.map((d) => ({ x: x + d.x, y: y + d.y }))];
    const parts = (enemy) =>
        KDMapData.Entities.filter((part) => isPart(part) && part.SpiderlingsBossParent === enemy.id);
    function nearest(enemy, target) {
        return {
            x: Math.max(enemy.x - 1, Math.min(enemy.x + 1, target.x)),
            y: Math.max(enemy.y - 1, Math.min(enemy.y + 1, target.y)),
        };
    }
    function canPlace(enemy, x, y) {
        return cells(enemy, x, y).every((point) => {
            if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(point.x, point.y))) return false;
            if (KinkyDungeonTilesGet(`${point.x},${point.y}`)?.Lock) return false;
            const occupant = KinkyDungeonEntityAt(point.x, point.y);
            return !occupant || root(occupant) === enemy;
        });
    }
    function sync(enemy) {
        if (!isBoss(enemy) || !(enemy.hp > 0)) return;
        const existing = parts(enemy);
        for (const offset of offsets) {
            let part = existing.find(
                (other) => other.SpiderlingsBossOffset?.x === offset.x && other.SpiderlingsBossOffset?.y === offset.y,
            );
            if (!part) {
                if (KinkyDungeonEntityAt(enemy.x + offset.x, enemy.y + offset.y)) continue;
                part = DialogueCreateEnemy(enemy.x + offset.x, enemy.y + offset.y, PART);
                if (!part) continue;
                part.SpiderlingsBossParent = enemy.id;
                part.SpiderlingsBossOffset = { ...offset };
            }
            part.x = enemy.x + offset.x;
            part.y = enemy.y + offset.y;
            part.visual_x = part.x;
            part.visual_y = part.y;
            part.hp = part.Enemy.maxhp;
            part.faction = enemy.faction;
        }
        KDUpdateEnemyCache = true;
    }
    function clear(enemy) {
        for (const part of parts(enemy)) KDRemoveEntity(part, false, false, true);
    }
    api.addEnemies([
        {
            name: PART,
            faction: "Enemy",
            nonHumanoid: true,
            immobile: true,
            tags: KDMapInit([
                "spiderlings",
                "inanimate",
                "scenery",
                "notalk",
                "nosignalothers",
                "nobrain",
                "unstoppable",
            ]),
            AI: "ambush",
            visionRadius: 0,
            maxhp: 1000,
            minLevel: 0,
            weight: -1000,
            terrainTags: {},
            floors: KDMapInit([]),
            movePoints: 1000,
            attackPoints: 1000,
            attack: "",
            power: 0,
            dmgType: "inert",
            dropTable: [],
        },
    ]);
    api.NativeActions.registerBehavior("BossFootprint", {
        admitAction: (enemy) => (isPart(enemy) ? { idle: true, defeat: false, defeatEnemy: enemy } : undefined),
    });
    for (const name of ["KinkyDungeonEnemyAt", "KinkyDungeonEntityAt"]) {
        if (typeof globalThis[name] !== "function") continue;
        globalThis[name] = api.Hooks.wrap(
            `BossFootprint.${name}`,
            globalThis[name],
            (native) =>
                function () {
                    const entity = native.apply(this, arguments);
                    return root(entity) || entity;
                },
        );
    }
    if (typeof KDMoveEntity === "function")
        KDMoveEntity = api.Hooks.wrap(
            "BossFootprint.move",
            KDMoveEntity,
            (native) =>
                function (enemy, x, y, ...args) {
                    if (isPart(enemy)) return false;
                    if (!isBoss(enemy)) return native.apply(this, arguments);
                    const steps = Math.max(Math.abs(x - enemy.x), Math.abs(y - enemy.y));
                    for (let step = 1; step <= steps; step++)
                        if (
                            !canPlace(
                                enemy,
                                Math.round(enemy.x + ((x - enemy.x) * step) / steps),
                                Math.round(enemy.y + ((y - enemy.y) * step) / steps),
                            )
                        )
                            return false;
                    // The full footprint was checked; native center occupancy includes our own parts.
                    args[3] = true;
                    const result = native.call(this, enemy, x, y, ...args);
                    sync(enemy);
                    return result;
                },
        );
    if (typeof KinkyDungeonDamageEnemy === "function")
        KinkyDungeonDamageEnemy = api.Hooks.wrap(
            "BossFootprint.damage",
            KinkyDungeonDamageEnemy,
            (native) =>
                function (enemy, ...args) {
                    const target = root(enemy);
                    if (!target) return 0;
                    if (isBoss(target) && areaTargets) {
                        if (areaTargets.has(target.id)) return 0;
                        areaTargets.add(target.id);
                    }
                    if (isBoss(target) && api.BossEncounter?.invulnerable()) return 0;
                    const damage = native.call(this, target, ...args);
                    if (isBoss(target)) api.BossEncounter?.checkDefeat(target);
                    return damage;
                },
        );
    // Vanilla weapon auras enumerate Entities directly instead of using the
    // bullet/nearby queries. One invocation still damages one boss only once.
    if (typeof KDEventMapWeapon !== "undefined")
        for (const handlers of Object.values(KDEventMapWeapon)) {
            if (typeof handlers.AoEDamage !== "function") continue;
            handlers.AoEDamage = api.Hooks.wrap(
                "BossFootprint.weaponArea",
                handlers.AoEDamage,
                (native) =>
                    function () {
                        const previous = areaTargets;
                        areaTargets = new Set();
                        try {
                            return native.apply(this, arguments);
                        } finally {
                            areaTargets = previous;
                        }
                    },
            );
        }
    for (const name of ["KDBulletCanHitEntity", "KDBulletAoECanHitEntity"]) {
        if (typeof globalThis[name] !== "function") continue;
        globalThis[name] = api.Hooks.wrap(
            `BossFootprint.${name}`,
            globalThis[name],
            (native) =>
                function (bullet, enemy, ...args) {
                    if (isPart(enemy)) return false;
                    if (!isBoss(enemy)) return native.apply(this, arguments);
                    return cells(enemy).some((point) => native.call(this, bullet, { ...enemy, ...point }, ...args));
                },
        );
    }
    if (typeof KDNearbyEnemies === "function")
        KDNearbyEnemies = api.Hooks.wrap(
            "BossFootprint.nearby",
            KDNearbyEnemies,
            (native) =>
                function () {
                    return [...new Set(native.apply(this, arguments).map(root).filter(Boolean))];
                },
        );
    if (typeof KDDrawEnemySprite === "function")
        KDDrawEnemySprite = api.Hooks.wrap(
            "BossFootprint.sprite",
            KDDrawEnemySprite,
            (native) =>
                function (board, enemy) {
                    if (isPart(enemy)) return "";
                    if (isBoss(enemy)) arguments[1] = { ...enemy, Enemy: { ...enemy.Enemy, name: "Spinner" } };
                    return native.apply(this, arguments);
                },
        );
    if (typeof KDDrawEnemyTooltip === "function")
        KDDrawEnemyTooltip = api.Hooks.wrap(
            "BossFootprint.tooltip",
            KDDrawEnemyTooltip,
            (native) =>
                function (enemy) {
                    arguments[0] = root(enemy) || enemy;
                    return native.apply(this, arguments);
                },
        );
    if (typeof KDRemoveEntity === "function")
        KDRemoveEntity = api.Hooks.wrap(
            "BossFootprint.remove",
            KDRemoveEntity,
            (native) =>
                function (enemy, kill) {
                    if (isBoss(enemy) && kill && api.BossEncounter?.checkDefeat(enemy)) return false;
                    const removed = native.apply(this, arguments);
                    if (removed && isBoss(enemy)) clear(enemy);
                    return removed;
                },
        );
    KDAddEvent(KDEventMapGeneric, "afterLoadGame", "SpiderlingsBossFootprint", () => {
        for (const enemy of [...KDMapData.Entities]) {
            if (isBoss(enemy)) sync(enemy);
            else if (isPart(enemy) && !root(enemy)) KDRemoveEntity(enemy, false, false, true);
        }
    });
    api.BossFootprint = Object.freeze({ NAME, PART, isBoss, isPart, root, cells, nearest, canPlace, sync, clear });
})();
