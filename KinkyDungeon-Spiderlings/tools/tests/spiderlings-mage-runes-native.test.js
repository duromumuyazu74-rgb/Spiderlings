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

test("KD 5.5 spell choice and dot launch keep one Mage action and a saved one-cell rune", () => {
    const enemySource = readNative("enemy/KinkyDungeonEnemies.ts");
    const magicSource = readNative("magic/KinkyDungeonMagic.ts");
    const fightSource = readNative("fight/KinkyDungeonFight.ts");
    const choiceStart = enemySource.indexOf("let spellOptions = [...enemy.Enemy.spells];");
    const choiceEnd = enemySource.indexOf("spellPriority = spellOptData.spellPriority;", choiceStart);
    assert.ok(choiceStart >= 0 && choiceEnd > choiceStart);
    const nativeChoice = enemySource.slice(
        choiceStart,
        choiceEnd + "spellPriority = spellOptData.spellPriority;".length,
    );
    const dotStart = magicSource.indexOf('} else if (spell.type == "inert" || spell.type == "dot") {');
    const dotEnd = magicSource.indexOf('} else if (spell.type == "hit") {', dotStart);
    assert.ok(dotStart >= 0 && dotEnd > dotStart);
    const nativeDot =
        magicSource
            .slice(dotStart + 2, dotEnd)
            .trim()
            .replace(/^else /, "") + "}";
    const launch = functionAt(fightSource, "function KinkyDungeonLaunchBullet(");
    const mage = {
        id: 31,
        hp: 3,
        x: 5,
        y: 5,
        faction: "Enemy",
        castCooldown: 0,
        Enemy: { name: "MageSpiderlings", spells: ["SpiderlingsMageBolt", "SpiderlingsMageRune"] },
    };
    const player = { x: 9, y: 5, player: true };
    const map = { Entities: [mage], Bullets: [] };
    const events = {};
    const context = {
        Spiderlings: { Mage: { equipArms: () => true } },
        KDMapData: map,
        KinkyDungeonPlayerEntity: player,
        KinkyDungeonMovableTilesEnemy: ["0"],
        KinkyDungeonMapGet: (x, y) => (x >= 3 && x <= 8 && y >= 3 && y <= 8 ? "0" : "1"),
        KinkyDungeonCheckLOS: () => true,
        KDRandom: () => 0,
        KDPlayerEffects: {},
        KDEventMapGeneric: {},
        KDAddEvent: (_map, event, _id, callback) => (events[event] = callback),
        KinkyDungeonSendEvent: (event, data) => events[event]?.(null, data),
        KinkyDungeonGetEnemyID: () => 17,
        CommonTime: () => 1,
        KinkyDungeonUpdateSingleBulletVisual: () => {},
    };
    vm.createContext(context);
    vm.runInContext(stripTypeScriptTypes(launch), context);
    vm.runInContext(
        stripTypeScriptTypes(`function KinkyDungeonCastSpell(x, y, spell, enemy) {
            let tX = x, tY = y, moveDirection = {x: 0, y: 0}, entity = enemy;
            let faction = enemy.faction, cast = {}, miscast = false, bullet = undefined, data = {};
            ${nativeDot}
            return {result: "Cast", data};
        }`),
        context,
    );
    vm.runInContext(fs.readFileSync(path.join(root, "SpiderlingsMageRunes.js"), "utf8"), context);
    context.nativeChoice = () =>
        vm.runInContext(
            stripTypeScriptTypes(`(() => {
                let AIData = {};
                let enemy = KDMapData.Entities[0], player = KinkyDungeonPlayerEntity;
                ${nativeChoice}
                return spellOptions;
            })()`),
            context,
        );
    assert.deepEqual(Array.from(context.nativeChoice()), ["SpiderlingsMageRune"]);
    const spell = {
        name: "SpiderlingsMageRune",
        type: "dot",
        tags: ["rune", "trap"],
        size: 1,
        delay: 300,
        power: 0,
        bind: 6,
        bindType: "Slime",
        damage: "glue",
        playerEffect: { name: "SpiderlingsMageRuneArms" },
        onhit: "",
        noTerrainHit: true,
    };
    mage.castCooldown = spell.delay > 0 ? 5 : 0;
    assert.equal(context.KinkyDungeonCastSpell(player.x, player.y, spell, mage).result, "Cast");
    assert.equal(map.Bullets.length, 1);
    const bullet = map.Bullets[0];
    assert.equal(bullet.time, 300);
    assert.equal(bullet.vx, 0);
    assert.equal(bullet.vy, 0);
    assert.equal(bullet.bullet.width, 1);
    assert.equal(bullet.bullet.source, mage.id);
    assert.equal(bullet.bullet.spell.tags.includes("rune"), true);
    assert.notDeepEqual([bullet.x, bullet.y], [player.x, player.y]);
    assert.equal(context.KinkyDungeonCastSpell(player.x, player.y, spell, mage).result, "Cast");
    assert.equal(map.Bullets.length, 2, "one native launch per cast");
});

test("KD 5.5 NPC bullet hit runs the native Slime bind path once without player-effect conversion", () => {
    const fight = readNative("fight/KinkyDungeonFight.ts");
    const hit = functionAt(fight, "function KDBulletHitEnemy(");
    const bindStart = fight.indexOf(
        "if (!predata.blocked)\n\t\t\tif (!Enemy.shield || predata.ignoreshield || predata.shield_bind)",
    );
    const bindEnd = fight.indexOf("if (!predata.blocked)", bindStart + 1);
    assert.ok(bindStart >= 0 && bindEnd > bindStart);
    const nativeBind = fight.slice(bindStart, bindEnd);
    const mage = { id: 31, hp: 0, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    const maid = { id: 32, x: 6, y: 5, hp: 8, faction: "Maidforce", Enemy: { name: "Maid", bound: true } };
    let tied = 0;
    let converted = 0;
    const context = {
        Spiderlings: { Mage: { equipArms: () => true } },
        KDMapData: { Entities: [], Bullets: [] },
        KinkyDungeonPlayerEntity: { player: true },
        KinkyDungeonMovableTilesEnemy: ["0"],
        KinkyDungeonMapGet: () => "0",
        KDRandom: () => 0,
        KDPlayerEffects: {},
        KDEventMapGeneric: {},
        KDAddEvent: () => {},
        KinkyDungeonSendEvent: () => {},
        KDUniqueBulletHits: new Map(),
        KDBulletID: (_bullet, enemy) => String(enemy.id),
        KDBindEnemyWithTags: () => converted++,
        KDGetFaction: (entity) => entity.faction,
        KDHostile: (a, b) => a.faction !== b.faction && !b.allied,
        KinkyDungeonIsDisabled: () => false,
        KinkyDungeonIsSlowed: () => false,
        KDStrictPersonalities: [],
        KDLoosePersonalities: [],
        KDAddThought: () => {},
        KDTieUpEnemy: (enemy, amount, type) => {
            tied++;
            enemy.slime = (enemy.slime || 0) + amount;
            assert.equal(type, "Slime");
        },
    };
    vm.createContext(context);
    vm.runInContext(stripTypeScriptTypes(hit), context);
    vm.runInContext(
        stripTypeScriptTypes(`function KinkyDungeonDamageEnemy(Enemy, Damage, ranged, noMsg, Spell, bullet, source, Delay) {
            let predata = {blocked: false, dmg: Damage.damage, bind: Damage.bind, bindType: Damage.bindType,
                bindEff: 1, type: Damage.type, faction: "Enemy", allowConjuredRestraint: false};
            let resistDamage = Enemy.immune ? 2 : 0, effect = false, NoMsg = noMsg;
            ${nativeBind}
        }`),
        context,
    );
    vm.runInContext(fs.readFileSync(path.join(root, "SpiderlingsMageRunes.js"), "utf8"), context);
    const spell = { name: "SpiderlingsMageRune", playerEffect: { name: "SpiderlingsMageRuneArms" } };
    const bullet = {
        x: maid.x,
        y: maid.y,
        bullet: {
            source: mage.id,
            faction: "Enemy",
            spell,
            damage: { damage: 0, type: "glue", bind: 6, bindType: "Slime" },
        },
    };
    context.KDBulletHitEnemy(bullet, maid, 0, true);
    assert.equal(tied, 1);
    assert.equal(maid.slime, 6);
    assert.equal(converted, 0);
    assert.equal(bullet.bullet.spell.playerEffect.name, "SpiderlingsMageRuneArms");
    const shielded = { ...maid, shield: 1, slime: 0 };
    context.KDBulletHitEnemy(bullet, shielded, 0, true);
    assert.equal(shielded.slime, 0);
});
