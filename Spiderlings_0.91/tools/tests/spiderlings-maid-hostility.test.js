"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const modRoot = path.resolve(__dirname, "../..");
const gameSource = path.resolve(modRoot, "../KinkiestDungeon-5.5/Game/src");
const names = ["Spinner", "Jumper", "WebCaster", "Tunneler", "NestEntrance"];

function loadRuntime() {
    const context = {
        console,
        KinkyDungeonEnemies: [],
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDModConfigs: {},
        KDModSettings: {},
        KDGameData: { Collection: {}, PrisonerState: "", HostileFactions: [] },
        KDMapData: { Entities: [] },
        KinkyDungeonFlags: new Map(),
        KinkyDungeonPlayerEntity: { player: true, x: 20, y: 20 },
        party: new Set(),
        KDMapInit: (values) => Object.fromEntries(values.map((value) => [value, true])),
        addTextKey() {},
        KinkyDungeonRefreshEnemiesCache() {},
        KinkyDungeonRefreshRestraintsCache() {},
        KDAddEvent(map, trigger, type, handler) {
            (map[trigger] ||= {})[type] = handler;
        },
        KDIsInParty(entity) {
            return context.party.has(entity.id);
        },
        KDPlayer() {
            return context.KinkyDungeonPlayerEntity;
        },
        KDGetModifiedOpinionID: () => 0,
        KDEnemyHasFlag: () => false,
        KDHelpless: () => false,
        KDIsImprisoned: () => false,
        KDEntityHasFlag: () => false,
        KDEnemyVisionRadius: (entity) => entity.Enemy.visionRadius,
        KinkyDungeonCheckLOS: (_a, _b, distance, radius) => distance <= radius,
        KinkyDungeonCheckPath: () => true,
        KDGetNPCRestraints: () => undefined,
        KDUpdateEntityFlagCache: false,
        KinkyDungeonVisionGet: () => 1,
        KinkyDungeonJailGuard: () => undefined,
        KinkyDungeonLeashingEnemy: () => undefined,
        KinkyDungeonFindPath: (_x, _y, x, y) => [{ x, y }],
        KDNearbyEnemies(x, y, radius) {
            return context.KDMapData.Entities.filter((e) => Math.hypot(e.x - x, e.y - y) <= radius);
        },
        KDistChebyshev: (x, y) => Math.max(Math.abs(x), Math.abs(y)),
    };
    vm.createContext(context);
    const evaluateNative = (source, filename) => vm.runInContext(stripTypeScriptTypes(source), context, { filename });
    const factionList = fs.readFileSync(path.join(gameSource, "faction/KinkyDungeonFactionsList.ts"), "utf8");
    evaluateNative(
        factionList.slice(
            factionList.indexOf("let KinkyDungeonFactionRelationsBase"),
            factionList.indexOf("function KDSetFactionRelation"),
        ),
        "KD5.5-faction-relations.ts",
    );
    evaluateNative(
        fs.readFileSync(path.join(gameSource, "faction/KinkyDungeonFactions.ts"), "utf8"),
        "KD5.5-factions.ts",
    );
    const enemies = fs.readFileSync(path.join(gameSource, "enemy/KinkyDungeonEnemies.ts"), "utf8");
    evaluateNative(
        enemies.slice(
            enemies.indexOf("function KinkyDungeonNearestPlayer("),
            enemies.indexOf("function KDEnemyHidden("),
        ),
        "KD5.5-target-selection.ts",
    );
    evaluateNative(
        enemies.slice(enemies.indexOf("function KDSetCollFlag("), enemies.indexOf("function KDIDHasFlag(")),
        "KD5.5-enemy-flags.ts",
    );
    evaluateNative(
        enemies.slice(
            enemies.indexOf("function KinkyDungeonTickFlagsEnemy("),
            enemies.indexOf("function KDTickFlagsRestraint("),
        ),
        "KD5.5-flag-tick.ts",
    );
    const collection = fs.readFileSync(path.join(gameSource, "collection/KinkyDungeonCollection.ts"), "utf8");
    const flagTickStart = collection.indexOf("function KDUpdateCollectionFlags(");
    evaluateNative(
        collection.slice(flagTickStart, collection.indexOf("/**", flagTickStart)),
        "KD5.5-collection-flag-tick.ts",
    );
    const fight = fs.readFileSync(path.join(gameSource, "fight/KinkyDungeonFight.ts"), "utf8");
    evaluateNative(
        fight.slice(fight.indexOf("function KDBulletCanHitEntity("), fight.indexOf("function KDBulletEffectTiles(")),
        "KD5.5-projectile-collision.ts",
    );
    context.KDInitFactions(true);
    evaluateNative(
        fs.readFileSync(path.join(gameSource, "enemy/KDAIList.ts"), "utf8") + "\nglobalThis.KDAIType = KDAIType;",
        "KD5.5-ai-types.ts",
    );
    const nativeHostile = context.KDHostile;
    const nativeNearest = context.KinkyDungeonNearestPlayer;
    for (const file of ["SpiderlingsCore.js", "Spiderlings.js"]) {
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    }
    let nextId = 1;
    const make = (name, overrides = {}) => ({
        id: nextId++,
        x: 4,
        y: 4,
        hp: 3,
        aware: true,
        Enemy: context.KinkyDungeonEnemies.find((e) => e.name === name) || {
            name,
            faction: name === "Maidforce" ? "Maidforce" : undefined,
            visionRadius: 6,
            tags: {},
        },
        ...overrides,
    });
    return { context, nativeHostile, nativeNearest, make };
}

test("visible Maidforce and Spiderlings prefer each other even with the player closer to both", () => {
    const { context: kd, nativeNearest, make } = loadRuntime();
    kd.KinkyDungeonPlayerEntity.x = 5;
    kd.KinkyDungeonPlayerEntity.y = 4;
    const maid = make("Maidforce", { x: 4, hostile: 30 });
    for (const name of names) {
        const spider = make(name, { x: 6 });
        kd.KDMapData.Entities = [maid, spider];
        for (const [actor, rival] of [
            [maid, spider],
            [spider, maid],
        ]) {
            assert.equal(
                nativeNearest(actor, false, true),
                kd.KinkyDungeonPlayerEntity,
                "native player-distance ceiling reproduces the bug",
            );
            assert.equal(kd.KinkyDungeonNearestPlayer(actor, false, true), rival, name);
            assert.equal(kd.KDHostile(actor), true, "preference must not change actual hostility toward the player");
            assert.equal(kd.KinkyDungeonNearestPlayer(actor, false, false), kd.KinkyDungeonPlayerEntity);
        }
    }
});

test("a WebCaster prioritizes visible pending Cocoon reinforcement then returns to its rival", () => {
    const { context: kd, make } = loadRuntime();
    kd.KinkyDungeonPlayerEntity.x = 5;
    kd.KinkyDungeonPlayerEntity.y = 4;
    const caster = make("WebCaster", { x: 6 });
    const spinner = make("Spinner", { x: 6 });
    const maid = make("Maidforce", { x: 4, hostile: 30 });
    kd.KDMapData.Entities = [caster, maid];
    let pending = true;
    kd.Spiderlings.Webbing = { needsCocoonReinforcement: () => pending };
    assert.equal(kd.KinkyDungeonNearestPlayer(caster, false, true), kd.KinkyDungeonPlayerEntity);
    assert.equal(kd.KinkyDungeonNearestPlayer(spinner, false, true), maid);
    pending = false;
    assert.equal(kd.KinkyDungeonNearestPlayer(caster, false, true), maid);
    pending = true;
    kd.KinkyDungeonPlayerEntity.x = 30;
    assert.equal(kd.KinkyDungeonNearestPlayer(caster, false, true), maid, "no reinforcement target through lost sight");
});

test("roaming maids seek a reachable nearby spider without revealing an unseen combat target", () => {
    const { context: kd, make } = loadRuntime();
    const maid = make("Maidforce", { aware: false });
    const spider = make("Spinner", { x: 12 }),
        nest = make("NestEntrance", { x: 14 });
    kd.KDMapData.Entities = [maid, spider, nest];
    const aiData = { MovableTiles: "0D", ignoreLocks: false };
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), kd.KinkyDungeonPlayerEntity);
    kd.KinkyDungeonFindPath = (_x, _y, x, y, _blockEnemy, _blockPlayer, ignoreLocks, tiles) => {
        assert.equal(ignoreLocks, false);
        assert.equal(tiles, "0D");
        return x === spider.x ? undefined : [{ x, y }];
    };
    assert.equal(kd.KDAIType.hunt.aftermove(maid, kd.KinkyDungeonPlayerEntity, aiData), true);
    assert.deepEqual([maid.gx, maid.gy], [nest.x, nest.y]);
    assert.equal(maid.aware, false);
    nest.hp = 0;
    assert.equal(kd.KDAIType.hunt.aftermove(maid, kd.KinkyDungeonPlayerEntity, aiData), false);
    nest.hp = 12;
    nest.x = 17;
    assert.equal(kd.KDAIType.hunt.aftermove(maid, kd.KinkyDungeonPlayerEntity, aiData), false);
});

test("rival search yields to combat, provocation, obligations and excluded entities", () => {
    const { context: kd, make } = loadRuntime();
    const maid = make("Maidforce", { aware: false }),
        spider = make("Spinner", { x: 12 });
    kd.KDMapData.Entities = [maid, spider];
    const seek = (actor = maid, target = kd.KinkyDungeonPlayerEntity, data = {}) =>
        kd.KDAIType.wander.aftermove(actor, target, data);
    assert.equal(seek(), true);
    assert.equal(seek(maid, spider), false);
    assert.equal(seek(maid, undefined, { moveTowardPlayer: true }), false);
    for (const key of ["IntentAction", "CurrentAction", "action", "goToDespawn", "leash", "allied", "ceasefire"]) {
        maid[key] = 1;
        assert.equal(seek(), false, key);
        delete maid[key];
    }
    kd.KinkyDungeonSetEnemyFlag(maid, "SpiderlingsPlayerProvoked", 10);
    assert.equal(seek(), false);
    kd.KinkyDungeonSetEnemyFlag(maid, "SpiderlingsPlayerProvoked", 0);
    maid.aware = true;
    assert.equal(seek(maid, undefined, { aggressive: true }), false);
    maid.aware = false;
    kd.party.add(spider.id);
    assert.equal(seek(), false);
    kd.party.clear();
    assert.equal(seek(spider), true);
    assert.equal(kd.KDAIType.guard.aftermove(maid, kd.KinkyDungeonPlayerEntity, {}), false);
});

test("unaware offscreen spiders perceive maids without waiting for a maid search turn", () => {
    const { context: kd, make } = loadRuntime();
    kd.KinkyDungeonVisionGet = () => 0;
    for (const name of names) {
        const spider = make(name, { aware: false }),
            maid = make("Maidforce", { x: 6, aware: false });
        kd.KDMapData.Entities = [spider, maid];
        assert.equal(kd.KinkyDungeonNearestPlayer(spider, false, true), maid, name);
        assert.equal(spider.aware, true, name);
    }
});

test("spider wake-up respects walls, blindness, helplessness and faction overrides", () => {
    for (const reason of ["wall", "blind", "helpless", "prisoner", "ally", "ceasefire"]) {
        const { context: kd, make } = loadRuntime();
        kd.KinkyDungeonVisionGet = () => 0;
        const spider = make("Spinner", { aware: false }),
            maid = make("Maidforce", { x: 7, aware: false });
        kd.KDMapData.Entities = [spider, maid];
        if (reason === "wall") kd.KinkyDungeonCheckLOS = () => false;
        if (reason === "blind") spider.blind = 2;
        if (reason === "helpless") kd.KDHelpless = (e) => e === maid;
        if (reason === "prisoner") kd.KDIsImprisoned = (e) => e === maid;
        if (reason === "ally") maid.allied = 20;
        if (reason === "ceasefire") maid.ceasefire = 20;
        assert.equal(kd.KinkyDungeonNearestPlayer(spider, false, true), kd.KinkyDungeonPlayerEntity, reason);
        assert.equal(spider.aware, false, reason);
    }
});

test("searching maid acquires an offscreen rival only after native perception succeeds", () => {
    const { context: kd, make } = loadRuntime();
    const maid = make("Maidforce", { aware: false }),
        nest = make("NestEntrance", { x: 8, aware: false });
    kd.KDMapData.Entities = [maid, nest];
    kd.KinkyDungeonVisionGet = () => 0;
    const seek = () => kd.KDAIType.hunt.aftermove(maid, kd.KinkyDungeonPlayerEntity, {});
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), kd.KinkyDungeonPlayerEntity);
    const los = kd.KinkyDungeonCheckLOS;
    kd.KinkyDungeonCheckLOS = () => false;
    assert.equal(seek(), true);
    assert.equal(maid.aware, false, "walls still block perception");
    kd.KinkyDungeonCheckLOS = los;
    maid.blind = 2;
    assert.equal(seek(), true);
    assert.equal(maid.aware, false, "blindness still limits perception");
    maid.blind = 0;
    assert.equal(seek(), true);
    assert.equal(maid.aware, true);
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), nest);
});

test("committed player attacks provoke only their target for ten native flag ticks, including misses", () => {
    const { context: kd, make } = loadRuntime();
    kd.KinkyDungeonPlayerEntity.x = 5;
    kd.KinkyDungeonPlayerEntity.y = 4;
    const maid = make("Maidforce", { hostile: 30 }),
        spider = make("Spinner", { x: 6 });
    kd.KDMapData.Entities = [maid, spider];
    kd.KDGameData.Collection[maid.id] = {};
    const attack = (enemy) =>
        kd.KDEventMapGeneric.playerAttack.SpiderlingsRivalry("playerAttack", {
            enemy,
            attacker: kd.KinkyDungeonPlayerEntity,
            miss: true,
            damage: { type: "slash" },
        });
    attack(maid);
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), kd.KinkyDungeonPlayerEntity);
    assert.equal(kd.KinkyDungeonNearestPlayer(spider, false, true), maid);
    kd.KinkyDungeonTickFlagsEnemy(maid, 9);
    kd.KDUpdateCollectionFlags(9);
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), kd.KinkyDungeonPlayerEntity);
    attack(maid);
    assert.equal(maid.flags.SpiderlingsPlayerProvoked, 10);
    const loaded = JSON.parse(JSON.stringify(maid));
    assert.equal(kd.KinkyDungeonNearestPlayer(loaded, false, true), kd.KinkyDungeonPlayerEntity);
    kd.KinkyDungeonTickFlagsEnemy(loaded, 10);
    kd.KDUpdateCollectionFlags(10);
    assert.equal(kd.KinkyDungeonNearestPlayer(loaded, false, true), spider);
    attack(spider);
    assert.equal(kd.KinkyDungeonNearestPlayer(spider, false, true), kd.KinkyDungeonPlayerEntity);
});

test("player offensive spells provoke, while NPC damage, allied summons and healing do not", () => {
    const { context: kd, make } = loadRuntime();
    const maid = make("Maidforce");
    const damage = (extra) =>
        kd.KDEventMapGeneric.afterDamageEnemy.SpiderlingsRivalry("afterDamageEnemy", {
            enemy: maid,
            aggro: true,
            faction: "Player",
            ...extra,
        });
    for (const extra of [
        { faction: "Enemy", attacker: make("Spinner") },
        { attacker: make("Spinner", { faction: "Player" }) },
        { aggro: false, type: "heal" },
        { aggro: false, type: "inert" },
    ]) {
        damage(extra);
        assert.equal(kd.KDEnemyHasFlag(maid, "SpiderlingsPlayerProvoked"), false);
    }
    damage({ attacker: undefined, type: "stun", spell: { name: "PlayerSpell" }, dmgDealt: 0 });
    assert.equal(kd.KDEnemyHasFlag(maid, "SpiderlingsPlayerProvoked"), true);
});

test("rival preference keeps native LOS, vision, helpless and ally restrictions and restores scope on errors", () => {
    const { context: kd, nativeNearest, make } = loadRuntime();
    kd.KinkyDungeonPlayerEntity.x = 5;
    kd.KinkyDungeonPlayerEntity.y = 4;
    const maid = make("Maidforce", { hostile: 30 }),
        spider = make("Spinner", { x: 7 });
    kd.KDMapData.Entities = [maid, spider];
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true, 2), kd.KinkyDungeonPlayerEntity);
    const see = kd.KinkyDungeonCheckLOS;
    kd.KinkyDungeonCheckLOS = (actor, other, ...args) => other !== spider && see(actor, other, ...args);
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), kd.KinkyDungeonPlayerEntity);
    kd.KinkyDungeonCheckLOS = see;
    for (const overrides of [{ hp: 0 }, { allied: 20 }, { ceasefire: 5 }, { faction: "Player" }]) {
        kd.KDMapData.Entities = [maid, { ...spider, ...overrides }];
        assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), kd.KinkyDungeonPlayerEntity);
    }
    kd.KDMapData.Entities = [maid, spider];
    kd.KDHelpless = (e) => e === spider;
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), kd.KinkyDungeonPlayerEntity);
    kd.KDHelpless = () => false;
    kd.KinkyDungeonSetEnemyFlag(maid, "SpiderlingsPlayerProvoked", 10);
    kd.KinkyDungeonCheckLOS = (actor, other, ...args) => !other.player && see(actor, other, ...args);
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true), spider, "provocation cannot reveal an unseen player");
    kd.KinkyDungeonSetEnemyFlag(maid, "SpiderlingsPlayerProvoked", 0);
    kd.KinkyDungeonCheckLOS = () => {
        throw new Error("LOS failed");
    };
    assert.throws(() => kd.KinkyDungeonNearestPlayer(maid, false, true), /LOS failed/);
    kd.KinkyDungeonCheckLOS = see;
    assert.equal(kd.KDHostile(maid), true);
    const other = make("OtherEnemy");
    assert.equal(kd.KinkyDungeonNearestPlayer(other, false, true), nativeNearest(other, false, true));
});

test("KD 5.5 selects Spiderlings and natural or inherited-faction nests as Maidforce NPC targets", () => {
    const { context: kd, make, nativeHostile } = loadRuntime();
    const maid = make("Maidforce");
    for (const name of names) {
        for (const overrides of [{}, { faction: "Enemy" }]) {
            const spider = make(name, { x: 5, ...overrides });
            kd.KDMapData.Entities = [maid, spider];
            assert.equal(nativeHostile(maid, spider), false, "reproduces the original absence of NPC hostility");
            assert.equal(kd.KDHostile(maid, spider), true);
            assert.equal(kd.KDHostile(spider, maid), true);
            assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true, 6), spider);
            assert.equal(kd.KinkyDungeonAggressive(maid, spider), true);
            assert.equal(kd.KDHostile(spider), true, "existing player hostility remains native");
        }
    }
});

test("native friendly faction, allied, servant, party and ceasefire decisions remain effective", () => {
    const { context: kd, make, nativeHostile } = loadRuntime();
    const maid = make("Maidforce");
    for (const name of names) {
        for (const overrides of [
            { faction: "Player" },
            { faction: "Maidforce" },
            { faction: "Natural" },
            { allied: 20 },
            { faction: "Enemy", allied: 20 },
            { ceasefire: 20 },
        ]) {
            const spider = make(name, overrides);
            assert.equal(kd.KDHostile(maid, spider), nativeHostile(maid, spider));
            assert.equal(kd.KDHostile(spider, maid), nativeHostile(spider, maid));
        }
        const servant = make(name, { faction: "Enemy" });
        kd.KDGameData.Collection[servant.id] = { status: "Servant" };
        assert.equal(kd.KDHostile(maid, servant), false);
        const party = make(name, { faction: "Enemy" });
        kd.party.add(party.id);
        assert.equal(kd.KDHostile(maid, party), false);
        assert.equal(kd.KDHostile({ ...maid, ceasefire: 5 }, make(name)), false);
    }
});

test("generic Enemy, other factions and existing Maidforce Slime/Mold relationships are unchanged", () => {
    const { context: kd, make, nativeHostile } = loadRuntime();
    const maid = make("Maidforce");
    for (const name of ["UnrelatedEnemy", "Slime", "Mold"]) {
        const other = make(name, { Enemy: { name, faction: ["Slime", "Mold"].includes(name) ? name : undefined } });
        assert.equal(kd.KDHostile(maid, other), nativeHostile(maid, other));
        assert.equal(kd.KDHostile(other, maid), nativeHostile(other, maid));
    }
    assert.equal(kd.KDFactionRelation("Maidforce", "Enemy"), 0.1);
    assert.equal(kd.KDFactionHostile("Maidforce", "Slime"), true);
    assert.equal(kd.KDFactionHostile("Maidforce", "Mold"), true);
    const alliedMaid = make("Maidforce", { faction: "Player" });
    assert.equal(kd.KDHostile(alliedMaid, make("Spinner", { allied: 20 })), false);
});

test("maid projectile collision excludes the target Spiderling from native Enemy friendly-fire protection", () => {
    const { context: kd, make } = loadRuntime();
    const bullet = { x: 4, y: 4, bullet: { faction: "Maidforce", spell: {}, damage: { type: "pierce", damage: 4 } } };
    for (const name of names) {
        assert.equal(kd.KDFactionFavorable("Maidforce", make(name)), false);
        assert.equal(kd.KDBulletCanHitEntity(bullet, make(name)), true);
        assert.equal(kd.KDFactionFavorable("Maidforce", make(name, { faction: "Maidforce" })), true);
        assert.equal(kd.KDFactionFavorable("Maidforce", make(name, { ceasefire: 20 })), true);
    }
    assert.equal(kd.KDFactionFavorable("Maidforce", make("UnrelatedEnemy")), true);
    assert.equal(kd.KDBulletCanHitEntity(bullet, make("UnrelatedEnemy")), false);
    assert.equal(kd.KDFactionFavorable("Maidforce", "Enemy"), true);
});

test("KD 5.5 perception still requires a visible target within the maid's vision", () => {
    const { context: kd, make } = loadRuntime();
    const maid = make("Maidforce");
    kd.KDMapData.Entities = [maid, make("Spinner", { x: 15 })];
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true, 6), kd.KinkyDungeonPlayerEntity);
    kd.KDMapData.Entities[1].x = 5;
    kd.KinkyDungeonCheckLOS = () => false;
    assert.equal(kd.KinkyDungeonNearestPlayer(maid, false, true, 6), kd.KinkyDungeonPlayerEntity);
});
