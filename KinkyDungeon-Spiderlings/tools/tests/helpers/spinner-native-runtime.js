"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./lifecycle-runtime.js");

const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });

function runtime(overrides = {}) {
    let nextId = 100;
    const tiles = new Map(),
        buffs = [],
        context = {
            console,
            Spiderlings: {},
            KinkyDungeonEnemies: [
                {
                    name: "IceWall",
                    tags: {},
                    dropTable: [],
                    events: [],
                },
            ],
            KDMapData: {
                GridWidth: 31,
                GridHeight: 21,
                Entities: [],
                StartPosition: { x: 2, y: 10 },
                EndPosition: { x: 28, y: 10 },
                ShortcutPositions: [],
            },
            KDGameData: { SleepTurns: 0 },
            KinkyDungeonPlayerEntity: { player: true, x: 1, y: 1 },
            KinkyDungeonMovableTilesEnemy: ".0",
            KinkyDungeonMovableTilesSmartEnemy: ".0",
            KinkyDungeonCurrentTick: 5,
            KinkyDungeonRootDirectory: "Game/",
            KinkyDungeonFlags: new Map(),
            KDModFiles: Object.fromEntries(
                ["Top", "Side", "Corner"].flatMap((part) =>
                    ["", "Pink"].map((color) => [`Bullets/SpiderlingsSpinnerTrap${part}${color}.png`, {}]),
                ),
            ),
            KDPathConditions: {},
            KDInputTypes: {},
            KDEventMapGeneric: {},
            KDPathCache: new Map([["old", []]]),
            KDPathCacheIgnoreLocks: new Map([["old", []]]),
            KDUpdateEnemyCache: false,
            KDMapInit: (values) => Object.fromEntries(values.map((value) => [value, true])),
            KinkyDungeonMapGet: (x, y) => (x === 9 && y === 9 ? "1" : "."),
            KinkyDungeonTilesGet: (key) => tiles.get(key),
            KinkyDungeonEntityAt(x, y) {
                if (context.KinkyDungeonPlayerEntity.x === x && context.KinkyDungeonPlayerEntity.y === y)
                    return context.KinkyDungeonPlayerEntity;
                return context.KDMapData.Entities.findLast((entity) => entity.x === x && entity.y === y);
            },
            DialogueCreateEnemy(x, y, name) {
                if (context.KinkyDungeonEntityAt(x, y)) return undefined;
                const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === name);
                if (!definition) return undefined;
                const entity = { id: nextId++, x, y, hp: definition.maxhp, Enemy: definition };
                context.KDMapData.Entities.push(entity);
                return entity;
            },
            DialogueGetEnemy(name) {
                const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === name);
                return { id: nextId++, x: 1, y: 1, hp: definition.maxhp, Enemy: definition };
            },
            KDAddNewEntity(entity) {
                context.KDMapData.Entities.push(entity);
                return entity;
            },
            KinkyDungeonGetBuffedStat: () => 0,
            KinkyDungeonMultiplicativeStat: () => 1,
            KDBoundEffects: () => 0,
            KinkyDungeonIsDisabled: () => false,
            KinkyDungeonCheckPath: () => true,
            KDHelpless: () => false,
            KDHostile: () => true,
            KinkyDungeonApplyBuffToEntity(entity, buff) {
                entity.buffs = entity.buffs || {};
                entity.buffs[buff.id] = buff;
                buffs.push({ entity, buff });
            },
            KDMoveEntity(entity, x, y, _willing, _dash, _forceHitBullets, ignoreBlocked) {
                if (!ignoreBlocked && context.KinkyDungeonEntityAt(x, y)) return false;
                entity.x = x;
                entity.y = y;
                return true;
            },
            KinkyDungeonEnemyCanMove: () => true,
            KinkyDungeonEnemyTryMove(enemy, _direction, _points, x, y) {
                return context.KDMoveEntity(enemy, x, y);
            },
            KDAddEvent(map, trigger, name, handler) {
                map[trigger] = map[trigger] || {};
                map[trigger][name] = handler;
            },
        };
    Object.assign(context, overrides);
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    load(context, "SpiderlingsCore.js");
    load(context, "SpiderlingsSpinnerTopology.js");
    load(context, "SpiderlingsSpinnerNativeField.js");
    load(context, "SpiderlingsSpinnerScenarios.js");
    context.Spiderlings.SpinnerField = { handleEnemyTurn: () => undefined };
    context.Spiderlings.SpinnerCapture = { handleEnemyTurn: () => undefined };
    load(context, "SpiderlingsSpinnerRuntime.js");
    return { context, tiles, buffs };
}

module.exports = { runtime, load };
