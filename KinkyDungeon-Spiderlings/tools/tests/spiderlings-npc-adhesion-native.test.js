"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { gamePath } = require("../reference-inputs.js");

const modRoot = path.join(__dirname, "../..");

function nativeFunction(file, name) {
    const source = fs.readFileSync(gamePath(`Game/src/${file}`), "utf8");
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing pinned native ${name}`);
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let index = open; index < source.length; index++) {
        if (source[index] === "{") depth++;
        if (source[index] === "}" && --depth === 0) return stripTypeScriptTypes(source.slice(start, index + 1));
    }
    throw new Error(`unclosed native ${name}`);
}

test("pinned KD 5.5.0 native binding and movement preserve attack-capable adhesion", () => {
    const events = {};
    const map = { Entities: [] };
    const context = {
        Spiderlings: {},
        KDMapData: map,
        KDEventMapGeneric: {},
        KDAddEvent: (_map, trigger, key, handler) => ((events[trigger] ||= {})[key] = handler),
        KDUnPackEnemy: () => false,
        KDNPCStruggleThreshMult: () => 1,
        KDBoundEffects: (enemy) => (enemy.boundLevel > 10 ? 4 : 0),
        KinkyDungeonCurrentTick: 1,
        KDGetEffectTiles: () => ({}),
        KDEffectTileMoveOnFunctions: {},
        KinkyDungeonEntityAt: () => false,
        KDCheckCollideableBullets: () => {},
        KinkyDungeonSendEvent: (trigger, data) => {
            for (const handler of Object.values(events[trigger] || {})) handler({}, data);
        },
        KDApplyBindStun: () => {},
        KDDamageQueue: [],
        KinkyDungeonEnemyLoop: (enemy) => {
            context.KDMoveEntity(enemy, enemy.x + 1, enemy.y, true, true);
            enemy.attacks = (enemy.attacks || 0) + 1;
        },
    };
    vm.createContext(context);
    vm.runInContext(nativeFunction("enemy/KinkyDungeonEnemies.ts", "KDHelpless"), context);
    vm.runInContext(nativeFunction("enemy/KinkyDungeonEnemies.ts", "KDTieUpEnemy"), context);
    vm.runInContext(nativeFunction("map/KinkyDungeonTiles.ts", "KDMoveEntity"), context);
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsNPCAdhesion.js"), "utf8"), context);
    const spider = { id: 1, hp: 10, Enemy: { name: "WebCaster", maxhp: 10, tags: {} } };
    const target = {
        id: 2,
        hp: 20,
        x: 4,
        y: 5,
        Enemy: { name: "Maidforce", maxhp: 20, tags: {} },
        boundLevel: 0,
        specialBoundLevel: {},
    };
    map.Entities.push(spider, target);
    function nativeSilk(amount, attack) {
        const before = target.specialBoundLevel.Slime || 0;
        context.KDTieUpEnemy(target, amount, "Slime");
        const added = target.specialBoundLevel.Slime - before;
        context.Spiderlings.NPCAdhesion.recordNativeSilk(
            spider,
            target,
            added,
            attack,
            context.Spiderlings.NPCAdhesion.actionId(spider),
        );
    }
    nativeSilk(3, "direct");
    nativeSilk(3, "melee");
    assert.equal(context.Spiderlings.NPCAdhesion.status(target), "full");
    assert.equal(context.KDHelpless(target), false);
    context.KinkyDungeonEnemyLoop(target);
    assert.equal(target.x, 4, "native voluntary dash cannot translate");
    assert.equal(target.attacks, 1, "pin does not suppress native action opportunity");
    context.KDMoveEntity(target, 6, 5, false);
    assert.equal(target.x, 6, "native external displacement is preserved");
    nativeSilk(16, "melee");
    assert.equal(context.KDHelpless(target), true);
    assert.equal(context.Spiderlings.NPCAdhesion.status(target), "native-helpless");
});
