"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const { gamePath } = require("../reference-inputs.js");

function nativeFunction(name, file = "enemy/KinkyDungeonEnemies.ts") {
    const source = fs.readFileSync(gamePath(`Game/src/${file}`), "utf8");
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

test("Hunting Grounds uses KD's capturable limit while allowing shop and quest NPCs", () => {
    const spider = { id: 1, hp: 5, faction: "Enemy", Enemy: { name: "Spinner" } };
    const target = {
        id: 2,
        hp: 8,
        faction: "Maidforce",
        data: { shop: "Merchant" },
        Enemy: { name: "QuestMerchant", bound: "Merchant", tags: { quest: true } },
    };
    const context = {
        Spiderlings: {
            HuntingGrounds: { active: () => true },
            NPCAdhesion: { silkSource: () => undefined },
        },
        KDMapData: { Entities: [spider, target] },
        KDHostile: () => true,
        KDNoCaptureTypes: ["skeleton", "construct", "nobrain", "nocapture"],
    };
    vm.createContext(context);
    vm.runInContext(nativeFunction("KDCapturable", "collection/KinkyDungeonCollection.ts"), context);
    vm.runInContext(
        fs.readFileSync(require("node:path").join(__dirname, "../..", "SpiderlingsNPCWrapping.js"), "utf8"),
        context,
    );
    assert.equal(context.Spiderlings.NPCWrapping.targetEligible(target), true);
    target.Enemy.tags.nocapture = true;
    assert.equal(context.Spiderlings.NPCWrapping.targetEligible(target), false);
});

test("native KD helpless entry never receives the player or an entity without Enemy during NPC wrapping", () => {
    const player = { player: true, id: 999, x: 1, y: 1, hp: 10 };
    const spider = { id: 1, x: 3, y: 3, hp: 5, Enemy: { name: "WebCaster", maxhp: 5 } };
    const maid = {
        id: 2,
        x: 5,
        y: 3,
        hp: 8,
        boundLevel: 0,
        Enemy: { name: "Maidforce", maxhp: 8, bound: "Maidforce", tags: {} },
    };
    const map = { Entities: [spider, maid, { id: 3, x: 8, y: 8, hp: 1 }] };
    const context = {
        Spiderlings: {
            Hooks: { wrap: (_name, native, wrapper) => wrapper(native) },
            NPCAdhesion: { status: () => "free", hasAttributedSilk: () => false },
        },
        KDMapData: map,
        KDGameData: { Collection: {} },
        KDHostile: () => true,
        KDNPCStruggleThreshMult: () => 1,
        KDBoundEffects: () => 0,
        KinkyDungeonGetEnemyByName: (name) => ({ name, maxhp: 8 }),
    };
    vm.createContext(context);
    vm.runInContext(nativeFunction("KDUnPackEnemy", "base/game/KinkyDungeonGame.ts"), context);
    vm.runInContext(nativeFunction("KDHelpless"), context);
    vm.runInContext(
        fs.readFileSync(require("node:path").join(__dirname, "../..", "SpiderlingsNPCWrapping.js"), "utf8"),
        context,
    );
    assert.throws(() => context.KDHelpless(player), /name/, "pinned native entry rejects a player as enemy");
    assert.doesNotThrow(() => context.Spiderlings.NPCWrapping.vulnerable(player));
    assert.doesNotThrow(() => context.Spiderlings.NPCWrapping.preemptNativeCapture());
    assert.equal(map.Entities.includes(maid), true);
});

test("native resistance, shields and knockdown retain ownership around the silk damage event", () => {
    const native = fs.readFileSync(gamePath("Game/src/fight/KinkyDungeonFight.ts"), "utf8");
    const start = native.indexOf('\t\tif (predata.type != "inert" && resistDamage < 2) {');
    const end = native.indexOf("\t\t} else if (!NoMsg) {", start);
    const knockdownStart = native.indexOf("\t\tif (!forceKill && (KDBoundEffects(Enemy) > 3");
    const knockdownEnd = native.indexOf("\n\t\tif (!predata.blocked)", knockdownStart);
    assert.ok(start >= 0 && end > start && knockdownStart > end && knockdownEnd > knockdownStart);
    // Execute the pinned native resistance-to-HP and knockdown blocks unchanged.
    // Browser acceptance separately exercises the complete damage entry point.
    const payment = stripTypeScriptTypes(
        native.slice(start, end) + "\n}\n" + native.slice(knockdownStart, knockdownEnd),
    );
    const target = { id: 2, hp: 100, Enemy: { name: "Maid", bound: "Maid", maxhp: 100, tags: {} } };
    const source = { id: 1, hp: 10, faction: "Enemy", Enemy: { name: "WebCaster" } };
    const context = {
        Spiderlings: { NPCAdhesion: { status: () => "full", hasAttributedSilk: () => true } },
        KDMapData: { Entities: [source, target] },
        KDEventMapGeneric: {},
        KDAddEvent: (map, name, key, handler) => ((map[name] ||= {})[key] = handler),
        KDHostile: () => true,
        Enemy: target,
        Damage: { damage: 2 },
        Spell: undefined,
        bullet: undefined,
        attacker: source,
        armor: 0.5,
        buffreduction: 0,
        resistDamage: 0,
        forceKill: false,
        killed: true,
        NoMsg: true,
        Delay: 0,
        KDBaseRed: "red",
        KDStrictPersonalities: [],
        KDLoosePersonalities: [],
        KinkyDungeonIgnoreBlockTypes: [],
        KDDamageQueue: [],
        KDArmorFormula: () => 0.5,
        KinkyDungeonVisionGet: () => 0,
        KinkyDungeonSetEnemyFlag: () => {},
        KDEnemyShieldRegenStopTime: () => 1,
        KDApplyBindStun: () => {},
        KDBoundEffects: () => 4,
        KDIsInParty: () => false,
        KDAddThought: () => {},
        TextGet: (key) => key,
    };
    context.KinkyDungeonSendEvent = (name, data) => {
        for (const handler of Object.values(context.KDEventMapGeneric[name] || {})) handler(null, data);
    };
    vm.createContext(context);
    vm.runInContext(
        fs.readFileSync(require("node:path").join(__dirname, "../..", "SpiderlingsNPCWrapping.js"), "utf8"),
        context,
    );
    const hit = (shield, resistance = 0, amount = 2) => {
        target.hp = 100;
        target.shield = shield;
        context.resistDamage = resistance;
        context.predata = { enemy: target, dmg: amount, dmgDealt: 0, dmgShieldDealt: 0, armormult: 1, type: "arcane" };
        vm.runInContext(payment, context);
        return {
            hp: target.hp,
            shield: target.shield || 0,
            damage: context.predata.dmgDealt,
            absorbed: context.predata.dmgShieldDealt,
        };
    };
    assert.deepEqual(hit(0), { hp: 96, shield: 0, damage: 4, absorbed: 0 });
    assert.deepEqual(hit(0, 1), { hp: 98, shield: 0, damage: 2, absorbed: 0 });
    assert.deepEqual(hit(10), { hp: 100, shield: 6, damage: 0, absorbed: 4 });
    assert.deepEqual(hit(1), { hp: 97, shield: 0, damage: 3, absorbed: 1 });
    assert.deepEqual(hit(10, 2), { hp: 100, shield: 10, damage: 0, absorbed: 0 });
    assert.deepEqual(hit(0, 0, 0), { hp: 100, shield: 0, damage: 0, absorbed: 0 });
    assert.equal(hit(0, 0, 1000).hp, 0.001, "Fully bound prey follows native knockdown instead of Mod removal");
    assert.ok(context.KDMapData.Entities.includes(target));
});
