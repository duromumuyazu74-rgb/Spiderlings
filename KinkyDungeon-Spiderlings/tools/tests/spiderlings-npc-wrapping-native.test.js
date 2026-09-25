"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { gamePath } = require("../reference-inputs.js");

function nativeFunction(name) {
    const source = fs.readFileSync(gamePath("Game/src/enemy/KinkyDungeonEnemies.ts"), "utf8");
    const start = source.indexOf(`function ${name}(`);
    assert.ok(start >= 0, `missing pinned native ${name}`);
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}" && --depth === 0) return stripTypeScriptTypes(source.slice(start, i + 1));
    }
    throw Error(`unclosed native ${name}`);
}

test("pinned KD nonlethal removal honors cancellation, returns stolen items, and keeps persistent NPC identity", () => {
    const persistent = { id: 10, spawned: true };
    const effects = { removal: 0, death: 0, post: 0 };
    const target = {
        id: 10,
        x: 4,
        y: 4,
        hp: 10,
        Enemy: { name: "Maidforce", maxhp: 10, bound: "Maidforce", tags: {}, ondeath: [{ type: "DeathBurst" }] },
        items: ["RedKey", "Temporary"],
        tempitems: ["Temporary"],
        boundLevel: 3,
    };
    const map = { Entities: [target], GroundItems: [], mapY: 0 };
    let cancel = true;
    const context = {
        KDMapData: map,
        KDGameData: { Collection: {} },
        KDSelectLabel: () => {},
        KDPlayer: () => ({ x: 100, y: 100 }),
        KinkyDungeonSendEvent: (name, data) => {
            if (name === "removeEnemy") {
                effects.removal++;
                data.cancel = cancel;
            }
        },
        KDIsNPCPersistent: (id) => id === 10,
        KDGetPersistentNPC: () => persistent,
        KDUpdatePersistentNPC: () => {
            effects.post++;
        },
        KDGetAltType: () => undefined,
        KDEntityAtRiskOfCapture: () => true,
        KDGetCapturingNPC: () => undefined,
        KDGetFaction: () => "Maidforce",
        KinkyDungeonRemoveBuffsWithTag: () => {},
        KDEnemyHasFlag: () => false,
        KDRemoveFromParty: () => {},
        KDSpliceIndex: (index, count, owner) => owner.Entities.splice(index, count),
        KDOndeath: {
            DeathBurst: () => {
                effects.death++;
            },
        },
    };
    vm.createContext(context);
    vm.runInContext(nativeFunction("KDDropStolenItems"), context);
    vm.runInContext(nativeFunction("KDRemoveEntity"), context);
    assert.equal(context.KDRemoveEntity(target, false, true), false);
    assert.equal(map.Entities.includes(target), true);
    assert.equal(map.GroundItems.length, 0);
    cancel = false;
    assert.equal(context.KDRemoveEntity(target, false, true), true);
    assert.equal(map.Entities.includes(target), false);
    assert.deepEqual(
        Array.from(map.GroundItems, (item) => item.name),
        ["RedKey"],
    );
    assert.equal(persistent.captured, true);
    assert.equal(persistent.spawned, undefined);
    assert.equal(effects.death, 0);
    assert.equal(effects.removal, 2);
    assert.equal(effects.post, 1);
});
