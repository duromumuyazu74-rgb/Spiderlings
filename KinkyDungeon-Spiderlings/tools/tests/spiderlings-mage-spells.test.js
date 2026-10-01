"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const root = path.join(__dirname, "../..");
const source = fs.readFileSync(path.join(root, "SpiderlingsMageSpells.js"), "utf8");

function fixture() {
    const events = {};
    const calls = { casts: [], playerDamage: [], playerWeb: [], npcDamage: [], npcWeb: [], draws: [] };
    const mage = { id: 1, x: 5, y: 5, hp: 3, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    const maid = { id: 2, x: 7, y: 7, hp: 20, shield: 10, faction: "Maidforce", Enemy: { name: "Maid" } };
    const player = { player: true, faction: "Player", x: 7, y: 8 };
    const map = { Entities: [mage, maid], Bullets: [] };
    let random = 0;
    let pink = false;
    const c = {
        Spiderlings: {
            Webbing: { applyEnemyProgression: (...args) => calls.playerWeb.push(args) },
            Combat: { applySilkBinding: (source, target, amount) => calls.npcWeb.push({ source, target, amount }) },
            getSetting: () => pink,
        },
        KDMapData: map,
        KDCastConditions: {},
        KinkyDungeonSpellListEnemies: [{ name: "SpiderlingsMageHex" }, { name: "SpiderlingsMageCollapse" }],
        KDGameData: { Collection: {} },
        KinkyDungeonPlayerEntity: player,
        KDGetFaction: (target) => target.faction,
        KDHostile: (source, target) => source.faction !== target.faction,
        KDEventMapGeneric: {},
        KDAddEvent: (_map, name, _key, handler) => (events[name] = handler),
        KDRandom: () => random,
        KDPlayerEffects: {
            SpiderlingsWebbingEnemyBind: () => ({ effect: true }),
            SpiderlingsWebSprayHit: () => ({ effect: true }),
        },
        KinkyDungeonCastSpell: (x, y, spell, caster) => {
            calls.casts.push({ x, y, spell, caster });
            map.Bullets.push({ x, y, time: 1, bullet: { spell, source: caster.id } });
            return { result: "Cast" };
        },
        KinkyDungeonDealDamage: (damage) => calls.playerDamage.push(damage),
        KinkyDungeonDamageEnemy: (target, damage) => calls.npcDamage.push({ target, damage }),
        KinkyDungeonGridSizeDisplay: 72,
        KinkyDungeonRootDirectory: "",
        kdpixisprites: {},
        kdgameboard: {},
        KDDraw: (...args) => calls.draws.push(args),
    };
    vm.createContext(c);
    vm.runInContext(source, c);
    const cast = (name, x = 7, y = 7) => c.KinkyDungeonCastSpell(x, y, { name }, mage);
    const tick = () => events.tickAfter(null, { delta: 1 });
    const draw = () => {
        calls.draws.length = 0;
        events.draw(null, { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
        return calls.draws;
    };
    return {
        c,
        events,
        calls,
        mage,
        maid,
        player,
        map,
        cast,
        tick,
        draw,
        random: (value) => (random = value),
        pink: (value) => (pink = value),
    };
}

test("friendly Collapse attacks hostile NPCs without damaging or binding the nearby player", () => {
    const r = fixture();
    r.mage.faction = "Player";
    r.cast("SpiderlingsMageCollapse");
    for (let i = 0; i < 5; i++) r.tick();
    assert.equal(r.calls.npcDamage.length, 1);
    assert.equal(r.calls.npcWeb.length, 5);
    assert.equal(r.calls.playerDamage.length, 0);
    assert.equal(r.calls.playerWeb.length, 0);
});

test("friendly Hex and its delayed blast preserve allegiance after the caster leaves and state reloads", () => {
    for (const removeAt of ["field", "blast"]) {
        const r = fixture();
        r.mage.faction = "Player";
        r.cast("SpiderlingsMageHex");
        if (removeAt === "field") r.map.Entities = [r.maid];
        r.map.SpiderlingsMageSpells = JSON.parse(JSON.stringify(r.map.SpiderlingsMageSpells));
        for (let i = 0; i < 5; i++) r.tick();
        assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player), undefined, removeAt);
        assert.equal(r.maid.shield, 7);
        assert.equal(r.c.Spiderlings.MageSpells.markFor(r.maid).stacks, 3);
        r.events.afterDamageEnemy(null, {
            enemy: r.maid,
            attacker: { Enemy: { name: "Spinner" } },
            incomingDamage: { spiderlingsAttack: "melee" },
            dmgDealt: 1,
        });
        r.map.Entities = [r.maid];
        r.map.SpiderlingsMageSpells = JSON.parse(JSON.stringify(r.map.SpiderlingsMageSpells));
        r.tick();
        r.tick();
        assert.equal(r.calls.npcWeb.length, 3);
        assert.equal(r.calls.playerWeb.length, 0, removeAt);
    }
});

test("Mage chooses each available spell and respects active-field and collapse limits", () => {
    const r = fixture();
    assert.equal(r.c.Spiderlings.MageSpells.choose(r.mage), "SpiderlingsMageHex");
    r.random(0.5);
    assert.equal(r.c.Spiderlings.MageSpells.choose(r.mage), "SpiderlingsMageCollapse");
    r.random(0.9);
    assert.equal(r.c.Spiderlings.MageSpells.choose(r.mage), "SpiderlingsMageBolt");
    r.cast("SpiderlingsMageHex");
    r.random(0);
    assert.equal(r.c.Spiderlings.MageSpells.choose(r.mage), "SpiderlingsMageCollapse");
    r.cast("SpiderlingsMageCollapse");
    r.random(0.5);
    assert.equal(r.c.Spiderlings.MageSpells.choose(r.mage), "SpiderlingsMageBolt");
});

test("native candidate conditions reject active Hex and pending or cooling Collapse before payment", () => {
    const r = fixture();
    const hex = r.c.KDCastConditions.SpiderlingsMageHex;
    const collapse = r.c.KDCastConditions.SpiderlingsMageCollapse;
    assert.equal(typeof hex, "function");
    assert.equal(typeof collapse, "function");
    for (const spell of r.c.KinkyDungeonSpellListEnemies) assert.equal(spell.castCondition, spell.name);
    assert.equal(hex(r.mage), true);
    assert.equal(collapse(r.mage), true);
    r.cast("SpiderlingsMageHex");
    r.cast("SpiderlingsMageCollapse");
    const before = JSON.stringify(r.map.SpiderlingsMageSpells);
    assert.equal(hex(r.mage), false);
    assert.equal(collapse(r.mage), false);
    assert.equal(JSON.stringify(r.map.SpiderlingsMageSpells), before, "candidate queries do not advance state");
    assert.equal(r.cast("SpiderlingsMageHex").result, "Fail", "direct entry still rejects an active field");
    assert.equal(r.cast("SpiderlingsMageCollapse").result, "Fail", "direct entry still rejects pending Collapse");
    for (let count = 0; count < 6; count++) r.tick();
    assert.equal(hex(r.mage), true, "Hex becomes eligible after its existing field expires");
    assert.equal(collapse(r.mage), false, "resolved Collapse retains its existing cooldown");
    for (let count = 0; count < 6; count++) r.tick();
    assert.equal(collapse(r.mage), true);
});

test("Shield Hex warns twice, covers 4x4 for three turns and extends mark and shield fragility", () => {
    const r = fixture();
    assert.equal(r.cast("SpiderlingsMageHex").result, "Cast");
    assert.equal(r.map.Bullets.length, 0, "the native action leaves no extra inert projectile");
    assert.equal(r.map.SpiderlingsMageSpells.fields.length, 1);
    r.tick();
    r.tick();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.maid), undefined);
    r.tick();
    assert.equal(r.maid.shield, 7, "activation removes only shield");
    assert.equal(r.maid.hp, 20);
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.maid).stacks, 1);
    r.tick();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.maid).stacks, 2);
    r.tick();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.maid).stacks, 3);
    r.tick();
    assert.equal(r.map.SpiderlingsMageSpells.fields.length, 0);
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.maid).expiresAt, 10);
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.maid).fragileUntil, 8);
});

test("Hunting Grounds Hex pressures neutral allied NPCs", () => {
    const r = fixture();
    r.c.Spiderlings.HuntingGrounds = { isPrey: (_source, target) => target.Enemy?.name === "Neutral" };
    r.c.KDHostile = () => true;
    const neutral = {
        id: 3,
        x: 7,
        y: 7,
        hp: 20,
        shield: 10,
        faction: "Enemy",
        allied: true,
        Enemy: { name: "Neutral" },
    };
    r.map.Entities = [r.mage, neutral];
    r.cast("SpiderlingsMageHex");
    r.tick();
    r.tick();
    r.tick();
    assert.equal(neutral.shield, 7);
});

test("fragility adds half of actual shield damage without HP overflow, and an ally hit detonates next turn", () => {
    const r = fixture();
    r.cast("SpiderlingsMageHex");
    for (let i = 0; i < 5; i++) r.tick();
    r.maid.shield = 1;
    const spider = { id: 3, hp: 4, faction: "Enemy", Enemy: { name: "Spinner" } };
    const data = {
        enemy: r.maid,
        attacker: spider,
        incomingDamage: { spiderlingsAttack: "melee" },
        dmgShieldDealt: 4,
        dmgDealt: 0,
    };
    r.events.beforeDamageEnemy(null, data);
    r.events.afterDamageEnemy(null, data);
    assert.equal(r.maid.shield, undefined);
    assert.equal(r.maid.hp, 20);
    assert.equal(data.dmgShieldDealt, 5, "bonus is capped at remaining shield");
    assert.equal(r.map.SpiderlingsMageSpells.blasts[0].detonateAt, 7);
    assert.equal(
        r.c.Spiderlings.MageSpells.markFor(r.maid).fragileUntil,
        8,
        "detonation does not remove shield fragility",
    );
    assert.equal(r.calls.npcWeb.length, 0);
    r.tick();
    assert.equal(r.calls.npcWeb.length, 0, "the target has a full warning turn");
    r.tick();
    assert.equal(r.calls.npcWeb.length, 3, "three stacks produce three native Slime attempts");
    assert.equal(r.map.SpiderlingsMageSpells.blasts.at(-1).radius, 2, "three stacks reach the full 5x5 square");
});

test("player direct Spiderling contact triggers a mark, while trail contact does not", () => {
    const r = fixture();
    r.cast("SpiderlingsMageHex");
    for (let i = 0; i < 3; i++) r.tick();
    const caster = { Enemy: { name: "WebCaster" } };
    r.c.KDPlayerEffects.SpiderlingsWebSprayHit(null, null, { triggerSource: "trail" }, null, null, null, caster);
    assert.equal(r.map.SpiderlingsMageSpells.blasts.length, 0);
    r.c.KDPlayerEffects.SpiderlingsWebSprayHit(null, null, { triggerSource: "direct" }, null, null, null, caster);
    assert.equal(r.map.SpiderlingsMageSpells.blasts.length, 1);
    r.tick();
    assert.equal(r.calls.playerWeb.length, 0);
    r.tick();
    assert.equal(r.calls.playerWeb.length, 1);
});

test("a WebCaster trail can wear a brittle shield without setting off the mark", () => {
    const r = fixture();
    r.cast("SpiderlingsMageHex");
    for (let i = 0; i < 3; i++) r.tick();
    const data = {
        enemy: r.maid,
        attacker: { Enemy: { name: "WebCaster" } },
        incomingDamage: { spiderlingsAttack: "trail" },
        dmgShieldDealt: 2,
        dmgDealt: 0,
    };
    r.events.beforeDamageEnemy(null, data);
    r.events.afterDamageEnemy(null, data);
    assert.equal(r.maid.shield, 6);
    assert.equal(r.map.SpiderlingsMageSpells.blasts.length, 0);
});

test("Collapse uses the 21-cell inward ring and center-to-edge damage and binding", () => {
    const r = fixture();
    r.maid.shield = 0;
    r.maid.x = 7;
    r.maid.y = 7;
    r.player.x = 8;
    r.player.y = 7;
    assert.equal(r.cast("SpiderlingsMageCollapse").result, "Cast");
    r.tick();
    r.tick();
    assert.equal(r.calls.npcDamage.length, 0);
    r.tick();
    r.tick();
    assert.equal(r.calls.npcDamage.length, 0);
    r.tick();
    assert.equal(r.calls.npcDamage[0].damage.damage, 5);
    assert.equal(r.calls.npcWeb.length, 5);
    assert.equal(r.calls.playerDamage[0].damage, 1);
    assert.equal(r.calls.playerDamage[0].type, "arcane");
    assert.equal(r.calls.playerWeb.length, 3);
    assert.ok(r.calls.playerWeb.every(([profile, source]) => profile === "MageSpiderlings" && source === r.mage));
    assert.equal(r.mage.SpiderlingsCollapseCooldown, 7);
    for (let i = 0; i < 6; i++) r.tick();
    assert.equal(r.c.Spiderlings.MageSpells.choose(r.mage), "SpiderlingsMageHex");
    r.tick();
    assert.equal(r.mage.SpiderlingsCollapseCooldown, 0);
    assert.equal(r.c.Spiderlings.MageSpells.collapseDistance(7, 7, { x: 9, y: 9 }), -1);
});

test("Collapse charge ends if its Mage dies", () => {
    const r = fixture();
    r.cast("SpiderlingsMageCollapse");
    r.tick();
    r.mage.hp = 0;
    r.tick();
    r.tick();
    assert.equal(r.calls.npcDamage.length, 0);
    assert.equal(r.calls.playerDamage.length, 0);
    assert.equal(r.map.SpiderlingsMageSpells.collapses.length, 0);
});

test("active Hex replenishes a consumed mark on the next actual turn", () => {
    const r = fixture();
    r.cast("SpiderlingsMageHex");
    for (let n = 0; n < 3; n++) r.tick();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).stacks, 1);
    r.c.KDPlayerEffects.SpiderlingsWebbingEnemyBind(r.player, 0, {}, {}, "Enemy", undefined, {
        Enemy: { name: "Spinner" },
    });
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).stacks, 0);
    r.tick();
    assert.equal(
        r.c.Spiderlings.MageSpells.markFor(r.player).stacks,
        1,
        "Active area must add one fresh layer despite the prior queued burst",
    );
});

test("Hex actual-turn identity survives overlap, repeated processing and reload; leaving stops refresh", () => {
    const r = fixture();
    r.c.KinkyDungeonCurrentTick = 0;
    r.cast("SpiderlingsMageHex");
    const next = () => {
        r.c.KinkyDungeonCurrentTick++;
        r.tick();
    };
    next();
    next();
    next();
    const s = r.map.SpiderlingsMageSpells;
    s.fields.push({ ...s.fields[0], ownerId: 4, endAt: 12 });
    r.map.Entities.push({ ...r.mage, id: 4 });
    s.fields[0].endAt = 12;
    const clock = s.clock;
    r.tick();
    r.tick();
    assert.equal(s.clock, clock, "Duplicate events do not advance the saved spell clock");
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).stacks, 1);
    r.map.SpiderlingsMageSpells = JSON.parse(JSON.stringify(s));
    r.tick();
    assert.equal(r.map.SpiderlingsMageSpells.clock, clock, "Reload in the same turn cannot replay a layer");
    next();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).stacks, 2);
    r.player.x = 20;
    const expiry = r.c.Spiderlings.MageSpells.markFor(r.player).expiresAt;
    next();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).expiresAt, expiry);
    r.player.x = 7;
    next();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).stacks, 3);
    next();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).stacks, 3, "Overlap and staying respect the cap");
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player).expiresAt, r.map.SpiderlingsMageSpells.clock + 5);
    r.map.SpiderlingsMageSpells.fields = [];
    for (let n = 0; n < 6; n++) next();
    assert.equal(r.c.Spiderlings.MageSpells.markFor(r.player), undefined, "Gone area never refreshes old marks");
});
