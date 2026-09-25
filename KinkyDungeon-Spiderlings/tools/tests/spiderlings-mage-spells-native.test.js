"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { gamePath } = require("../reference-inputs.js");

const root = path.join(__dirname, "../..");
const readNative = (file) => fs.readFileSync(gamePath(`Game/src/${file}`), "utf8");

function functionAt(source, declaration) {
    const start = source.indexOf(declaration);
    assert.ok(start >= 0, `missing native ${declaration}`);
    const open = source.indexOf("{", start);
    let depth = 0;
    for (let i = open; i < source.length; i++) {
        if (source[i] === "{") depth++;
        if (source[i] === "}" && --depth === 0) return source.slice(start, i + 1);
    }
    throw new Error(`unclosed native ${declaration}`);
}

test("KD 5.5 inert casts spend one native Mage action and leave only the saved spell lifecycle", () => {
    const magicSource = readNative("magic/KinkyDungeonMagic.ts");
    const fightSource = readNative("fight/KinkyDungeonFight.ts");
    const inertStart = magicSource.indexOf('} else if (spell.type == "inert" || spell.type == "dot") {');
    const inertEnd = magicSource.indexOf('} else if (spell.type == "hit") {', inertStart);
    assert.ok(inertStart >= 0 && inertEnd > inertStart);
    const nativeInert =
        magicSource
            .slice(inertStart + 2, inertEnd)
            .trim()
            .replace(/^else /, "") + "}";
    const mage = { id: 8, hp: 3, x: 5, y: 5, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    const map = { Entities: [mage], Bullets: [] };
    const events = {};
    let nativeLaunches = 0;
    const context = {
        Spiderlings: {},
        KDMapData: map,
        KinkyDungeonPlayerEntity: { x: 7, y: 7, player: true },
        KDGameData: { Collection: {} },
        KDEventMapGeneric: {},
        KDAddEvent: (_map, name, _id, fn) => (events[name] = fn),
        KinkyDungeonSendEvent: () => {},
        KDPlayerEffects: {},
        KDRandom: () => 0,
        KinkyDungeonGetEnemyID: () => 40,
        CommonTime: () => 1,
        KinkyDungeonUpdateSingleBulletVisual: () => {},
    };
    vm.createContext(context);
    vm.runInContext(stripTypeScriptTypes(functionAt(fightSource, "function KinkyDungeonLaunchBullet(")), context);
    vm.runInContext(
        stripTypeScriptTypes(`function KinkyDungeonCastSpell(x, y, spell, enemy) {
            let tX = x, tY = y, moveDirection = {x: 0, y: 0}, entity = enemy;
            let faction = enemy.faction, cast = {}, miscast = false, bullet = undefined, data = {};
            ${nativeInert}
            return {result: "Cast", data};
        }`),
        context,
    );
    const nativeCast = context.KinkyDungeonCastSpell;
    context.KinkyDungeonCastSpell = function (...args) {
        nativeLaunches++;
        return nativeCast.apply(this, args);
    };
    vm.runInContext(fs.readFileSync(path.join(root, "SpiderlingsMageSpells.js"), "utf8"), context);
    const spell = (name) => ({
        name,
        type: "inert",
        noSprite: true,
        size: 1,
        delay: 1,
        onhit: "",
        power: 0,
        damage: "inert",
        noTerrainHit: true,
    });
    assert.equal(context.KinkyDungeonCastSpell(7, 7, spell("SpiderlingsMageHex"), mage).result, "Cast");
    assert.equal(nativeLaunches, 1);
    assert.equal(map.Bullets.length, 0);
    assert.equal(map.SpiderlingsMageSpells.fields.length, 1);
    assert.equal(context.KinkyDungeonCastSpell(7, 7, spell("SpiderlingsMageCollapse"), mage).result, "Cast");
    assert.equal(nativeLaunches, 2);
    assert.equal(map.Bullets.length, 0);
    assert.equal(map.SpiderlingsMageSpells.collapses.length, 1);
    assert.equal(context.KinkyDungeonCastSpell(7, 7, spell("SpiderlingsMageCollapse"), mage).result, "Fail");
    assert.equal(nativeLaunches, 2, "a blocked duplicate does not spend a cast");
});

test("KD 5.5 arcane player damage uses full Will loss while glue uses half", () => {
    const source = readNative("player/KinkyDungeonStats.ts");
    assert.match(source, /willTypesWeak:\[[^\]]*"glue"/);
    assert.match(source, /willTypesStrong:\[[^\]]*"arcane"/);
    assert.match(source, /if \(data\.willTypesStrong\.includes\(data\.type\)\) \{\s*let amt = -data\.dmg;/);
    assert.match(source, /if \(data\.willTypesWeak\.includes\(data\.type\)\) \{\s*let amt = -data\.dmg\/2;/);
});
