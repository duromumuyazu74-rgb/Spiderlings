"use strict";

const test = require("node:test");
require("../../SpiderlingsCore.js");
const assert = require("node:assert/strict");
const { planNestPlacement, reachableCells } = require("../../SpiderlingsHuntingGrounds.js");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsHuntingGrounds.js"), "utf8");
const oldSource = fs.readFileSync(path.join(__dirname, "../../SpiderlingsInfestation.js"), "utf8");

function runtime(overrides = {}, nativeSources = [], withOld = false) {
    let id = 0;
    const messages = [];
    const population = [];
    const texts = {};
    const context = {
        Spiderlings: { EncounterRules: require("../../SpiderlingsEncounters.js").EncounterRules },
        KDMapMods: {},
        KinkyDungeonEscapeTypes: {},
        KDEventMapGeneric: {},
        KDCancelEvents: {},
        KDOndeath: {},
        KDGetFaction: (enemy) => enemy.faction || enemy.Enemy?.faction || "Enemy",
        KDGameData: { MapMod: "SpiderlingsHuntingGrounds" },
        KDMapData: {
            MapMod: "SpiderlingsHuntingGrounds",
            RoomType: "",
            GridWidth: 30,
            GridHeight: 30,
            StartPosition: { x: 1, y: 1 },
            EndPosition: { x: 28, y: 28 },
            Entities: [],
        },
        KinkyDungeonPlayerEntity: { x: 1, y: 1 },
        KinkyDungeonMovableTiles: "0DSsH",
        KinkyDungeonMapGet: () => "0",
        KDEnemyVisionRadius: () => 8,
        KinkyDungeonCheckLOS: () => true,
        KDCanDetect: () => true,
        KinkyDungeonTilesGet: () => undefined,
        KDRandom: () => 0.5,
        KinkyDungeonGetEnemyByName: (name) => ({ name }),
        KinkyDungeonSetEnemyFlag(entity, name, value) {
            (entity.flags ||= {})[name] = value;
        },
        KinkyDungeonSummonEnemy(x, y, name) {
            const entity = { x, y, id: ++id, hp: 12, Enemy: { name, immobile: name === "NestEntrance" } };
            context.KDMapData.Entities.push(entity);
            return [entity];
        },
        KDRemoveEntity(enemy, kill, capture, noEvent, forceIndex, map = context.KDMapData) {
            if (context.cancelRemoval) return false;
            const index = map.Entities.indexOf(enemy);
            if (index >= 0) map.Entities.splice(index, 1);
            if (kill)
                for (const entry of [...(enemy.ondeath || []), ...(enemy.Enemy.ondeath || [])])
                    context.KDOndeath[entry.type](enemy, entry, map);
            return true;
        },
        KinkyDungeonPlaceEnemies(...args) {
            population.push(args);
            return context.populationAction ? context.populationAction(...args) : "native-result";
        },
        KDAddEvent(map, trigger, name, handler) {
            (map[trigger] ||= {})[name] = handler;
        },
        addTextKey(name, text) {
            texts[name] = text;
        },
        TextGet: (name) => texts[name] || name,
        KinkyDungeonSendActionMessage(priority, text) {
            messages.push(text);
        },
        ...overrides,
    };
    vm.createContext(context);
    for (const native of nativeSources) vm.runInContext(stripTypeScriptTypes(native), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsPopulation.js"), "utf8"), context);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsFloorSelection.js"), "utf8"), context);
    if (withOld) vm.runInContext(oldSource, context);
    vm.runInContext(source, context);
    return {
        context,
        messages,
        population,
        texts,
        generate(room, floor = 5) {
            return context.KinkyDungeonPlaceEnemies([], false, [], {}, floor, 30, 30, room, []);
        },
        event(trigger, data = {}) {
            context.KDEventMapGeneric[trigger].SpiderlingsHuntingGrounds({}, data);
            return data;
        },
    };
}

test("both themes preserve population-plan publication, objective timing and selector cancellation", () => {
    for (const kind of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        for (const fail of [false, true]) {
            const r = runtime({}, [], true),
                c = r.context,
                births = [],
                summon = c.KinkyDungeonSummonEnemy;
            c.KDMapData.MapMod = c.KDGameData.MapMod = kind;
            c.KinkyDungeonSummonEnemy = (...args) => {
                births.push({
                    name: args[2],
                    plan: c.KDMapData.SpiderlingsPopulationPlan?.kind,
                    state: c.KDMapData[kind]?.status,
                });
                return fail && args[2] === "MageSpiderlings" ? [] : summon(...args);
            };
            let nativeFilters;
            c.populationAction = () => {
                const event = { filterTagsBase: ["minor", "boss"] };
                c.KDEventMapGeneric.afterGetSpawnBoxes.SpiderlingsHuntingGrounds({}, event);
                nativeFilters = Array.from(event.filterTagsBase);
            };
            r.generate();
            assert.ok(births.every((birth) => birth.plan === kind));
            assert.ok(
                births.filter((birth) => birth.name === "NestEntrance").every((birth) => birth.state === undefined),
            );
            assert.ok(
                births
                    .filter((birth) => birth.name !== "NestEntrance")
                    .every((birth) => birth.state === (kind === "SpiderlingsInfestation" ? "active" : undefined)),
            );
            assert.equal(c.KDMapData[kind].status, fail ? "cancelled" : "active");
            assert.deepEqual(
                nativeFilters,
                fail && kind === "SpiderlingsHuntingGrounds" ? ["minor", "boss"] : ["boss"],
            );
            if (fail) assert.equal(c.KDMapData.SpiderlingsPopulationPlan, undefined);
        }
    }
});

test("required crew failure keeps the theme's existing terrain result", () => {
    for (const kind of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        let wall,
            writes = 0;
        const r = runtime(
                {
                    KinkyDungeonMapGet: (x, y) => (wall && wall.x === x && wall.y === y ? "1" : "0"),
                    KinkyDungeonMapSet: () => {
                        writes++;
                        wall = undefined;
                    },
                },
                [],
                true,
            ),
            c = r.context,
            summon = c.KinkyDungeonSummonEnemy;
        c.KDMapData.MapMod = c.KDGameData.MapMod = kind;
        c.KinkyDungeonSummonEnemy = (...args) => {
            if (args[2] === "MageSpiderlings") return [];
            const born = summon(...args);
            if (
                args[2] === "NestEntrance" &&
                c.KDMapData.Entities.length === (kind === "SpiderlingsInfestation" ? 5 : 3)
            ) {
                const first = c.KDMapData.Entities.slice(0, 2);
                wall = { x: Math.round((first[0].x + first[1].x) / 2), y: Math.round((first[0].y + first[1].y) / 2) };
            }
            return born;
        };
        r.generate();
        assert.equal(c.KDMapData[kind].status, "cancelled");
        assert.equal(c.KDMapData.Entities.length, 0);
        assert.equal(writes, kind === "SpiderlingsInfestation" ? 1 : 0);
    }
});

test("native crew exceptions remove only the failed theme's births and still propagate", () => {
    for (const kind of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        const r = runtime({}, [], true),
            c = r.context,
            summon = c.KinkyDungeonSummonEnemy,
            resident = { id: 900, x: 2, y: 2, hp: 3, Enemy: { name: "Bandit" } },
            failure = new Error("native summon failed after insertion");
        c.KDMapData.MapMod = c.KDGameData.MapMod = kind;
        c.KDMapData.Entities.push(resident);
        c.KinkyDungeonSummonEnemy = (...args) => {
            const born = summon(...args);
            if (args[2] === "MageSpiderlings") throw failure;
            return born;
        };
        assert.throws(
            () => r.generate(),
            (error) => error === failure,
        );
        assert.deepEqual(c.KDMapData.Entities, [resident]);
        assert.equal(c.KDMapData[kind].status, "cancelled");
        assert.equal(c.KDMapData.SpiderlingsPopulationPlan, undefined);
        const event = { filterTagsBase: ["minor", "boss"] };
        c.KDEventMapGeneric.afterGetSpawnBoxes.SpiderlingsHuntingGrounds({}, event);
        assert.deepEqual(event.filterTagsBase, ["minor", "boss"]);
    }
});

test("objective cleanup attempts every nest and cancels the floor without masking crew failures", () => {
    for (const kind of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        for (const throwBirth of [false, true]) {
            for (const throwRemoval of [false, true]) {
                const r = runtime({}, [], true),
                    c = r.context,
                    summon = c.KinkyDungeonSummonEnemy,
                    remove = c.KDRemoveEntity,
                    resident = { id: 900, x: 2, y: 2, hp: 3, Enemy: { name: "Bandit" } },
                    birthFailure = new Error("native summon failed"),
                    cleanupFailure = new Error("native removal failed"),
                    attempted = [];
                c.KDMapData.MapMod = c.KDGameData.MapMod = kind;
                c.KDMapData.EscapeMethod = kind;
                c.KDMapData.Entities.push(resident);
                c.KinkyDungeonSummonEnemy = (...args) => {
                    if (args[2] === "MageSpiderlings") {
                        if (throwBirth) throw birthFailure;
                        return [];
                    }
                    return summon(...args);
                };
                let refused;
                c.KDRemoveEntity = (entity, ...args) => {
                    if (entity.Enemy.name === "NestEntrance") {
                        assert.deepEqual(args, [false, false, true]);
                        attempted.push(entity.id);
                        if (!refused) {
                            refused = entity;
                            if (throwRemoval) throw cleanupFailure;
                            return false;
                        }
                    }
                    return remove(entity, ...args);
                };
                assert.throws(
                    () => r.generate(),
                    (error) => {
                        assert.match(error.message, /cleanup failed/);
                        if (throwBirth) assert.equal(error.cause, birthFailure);
                        if (throwRemoval) assert.ok(error.errors.includes(cleanupFailure));
                        return true;
                    },
                );
                assert.equal(attempted.length, kind === "SpiderlingsInfestation" ? 5 : 3);
                assert.equal(new Set(attempted).size, attempted.length);
                assert.deepEqual(c.KDMapData.Entities, [resident, refused]);
                assert.equal(c.KDMapData[kind].status, "cancelled");
                assert.equal(c.KDMapData.SpiderlingsPopulationPlan, undefined);
                assert.equal(c.KDMapData.MapMod, "None");
                assert.equal(c.KDMapData.EscapeMethod, "Key");
            }
        }
    }
});

test("old Infestation and Hunting Grounds register independently in one Mod", () => {
    const r = runtime({}, [], true);
    assert.equal(r.context.KDMapMods.SpiderlingsInfestation.weight, 200);
    assert.equal(r.context.KDMapMods.SpiderlingsHuntingGrounds.weight, 1500);
    r.generate();
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds.targetIds.length, 3);
    assert.equal(r.context.KDMapData.SpiderlingsInfestation, undefined);
    r.context.KDMapData = {
        MapMod: "SpiderlingsInfestation",
        RoomType: "",
        GridWidth: 30,
        GridHeight: 30,
        StartPosition: { x: 1, y: 1 },
        EndPosition: { x: 28, y: 28 },
        Entities: [],
    };
    r.context.KDGameData.MapMod = "SpiderlingsInfestation";
    r.generate();
    assert.equal(r.context.KDMapData.SpiderlingsInfestation.targetIds.length, 5);
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds, undefined);
});

test("test.32 three-nest save migrates to Hunting Grounds without changing old Infestation saves", () => {
    const r = runtime({}, [], true);
    const saved = { status: "active", target: 3, targetIds: [1, 2, 3], destroyedIds: [], garrisonVersion: 2 };
    r.context.KDMapData.MapMod = "SpiderlingsInfestation";
    r.context.KDMapData.EscapeMethod = "SpiderlingsInfestation";
    r.context.KDMapData.SpiderlingsInfestation = saved;
    r.context.KDGameData.MapMod = "SpiderlingsInfestation";
    r.context.KDGameData.JourneyX = 0;
    r.context.KDGameData.JourneyY = 3;
    r.context.KDGameData.JourneyMap = {
        "0,3": { y: 5, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation", visited: true },
    };
    r.context.KDEventMapGeneric.afterLoadGame.SpiderlingsHuntingGrounds();
    assert.equal(r.context.KDMapData.MapMod, "SpiderlingsHuntingGrounds");
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds, saved);
    assert.equal(r.context.KDMapData.SpiderlingsInfestation, undefined);
    assert.equal(r.context.KDMapData.EscapeMethod, "SpiderlingsHuntingGrounds");
    assert.equal(r.context.KDGameData.JourneyMap["0,3"].MapMod, "SpiderlingsHuntingGrounds");
    r.context.KDMapData = { MapMod: "SpiderlingsInfestation", SpiderlingsInfestation: { status: "active", target: 5 } };
    r.context.KDEventMapGeneric.afterLoadGame.SpiderlingsHuntingGrounds();
    assert.equal(r.context.KDMapData.MapMod, "SpiderlingsInfestation");
    assert.equal(r.context.KDMapData.SpiderlingsInfestation.target, 5);
});

test("both loaded modifiers retain their own maid-finished objective death behavior", () => {
    for (const mod of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        const r = runtime({}, [], true),
            c = r.context;
        c.KDMapData.MapMod = c.KDGameData.MapMod = mod;
        r.generate();
        const nest = c.KDMapData.Entities.find((entity) => entity.id === c.KDMapData[mod].targetIds[0]);
        const born = [],
            summon = c.KinkyDungeonSummonEnemy;
        c.KinkyDungeonSummonEnemy = function (...args) {
            born.push(args[2]);
            return summon.apply(this, args);
        };
        c.KDOndeath.summon = (enemy, entry) => c.KinkyDungeonSummonEnemy(enemy.x, enemy.y, entry.enemy);
        c.KDRandom = () => 0.1;
        nest.Enemy.ondeath = [{ type: "summon", enemy: "Spinner" }];
        nest.hp -= 20;
        for (const handler of Object.values(c.KDEventMapGeneric.afterDamageEnemy))
            handler({}, { enemy: nest, dmgDealt: 20, faction: "Maidforce" });
        c.KDRemoveEntity(nest, true);
        assert.deepEqual(born, ["Tunneler", "Spinner"], mod);
        assert.equal(c.KDMapData[mod].destroyedIds.length, 1);
    }
});

test("loading in a side room migrates stored three-nest floors and their own journey slots", () => {
    const r = runtime({}, [], true),
        c = r.context;
    const oldMap = () => ({
        MapMod: "SpiderlingsInfestation",
        EscapeMethod: "SpiderlingsInfestation",
        SpiderlingsInfestation: {
            status: "active",
            garrisonVersion: 2,
            target: 3,
            targetIds: [1, 2, 3],
            destroyedIds: [1],
            complete: false,
        },
    });
    const stored = oldMap();
    c.KDMapData = { MapMod: "None", RoomType: "Shop" };
    c.KDGameData.MapMod = "None";
    c.KDGameData.JourneyX = 8;
    c.KDGameData.JourneyY = 6;
    c.KDGameData.JourneyMap = {
        "2,3": { y: 5, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation", visited: true },
        "8,6": { y: 6, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation", visited: true },
    };
    const five = { MapMod: "SpiderlingsInfestation", SpiderlingsInfestation: { status: "active", target: 5 } };
    c.KDWorldMap = {
        "0,3": { jx: 2, jy: 3, data: { "": stored } },
        "0,6": { jx: 8, jy: 6, data: { "": five, Shop: c.KDMapData } },
    };
    r.event("afterLoadGame");
    assert.equal(stored.MapMod, "SpiderlingsHuntingGrounds");
    assert.equal(stored.EscapeMethod, "SpiderlingsHuntingGrounds");
    assert.deepEqual(stored.SpiderlingsHuntingGrounds.destroyedIds, [1]);
    assert.equal(c.KDGameData.JourneyMap["2,3"].MapMod, "SpiderlingsHuntingGrounds");
    assert.equal(c.KDGameData.JourneyMap["8,6"].MapMod, "SpiderlingsInfestation");
    assert.equal(five.MapMod, "SpiderlingsInfestation");
    assert.equal(c.KDGameData.MapMod, "None");
    c.KDMapData = JSON.parse(JSON.stringify(stored));
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.minimaptext(), /1\/3/);
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), false);
});

test("new Hunting Grounds requests one field preset only after native population and never on old maps", () => {
    const r = runtime(),
        calls = [];
    r.context.Spiderlings.SpinnerAI = {
        initializeMapgenField(options) {
            calls.push(JSON.parse(JSON.stringify(options)));
            return { status: "placed", compositeId: "fixture-preset" };
        },
    };
    r.generate({});
    assert.equal(calls.length, 0, "Placement waits for the complete native population");
    const ids = [...r.context.KDMapData.SpiderlingsHuntingGrounds.targetIds];
    r.event("postMapgen");
    r.event("postMapgen");
    assert.equal(calls.length, 1);
    assert.deepEqual([...r.context.KDMapData.SpiderlingsHuntingGrounds.targetIds], ids);
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds.fieldPreset.status, "placed");
    delete r.context.KDMapData.SpiderlingsHuntingGrounds.fieldPreset;
    r.event("postMapgen");
    assert.equal(calls.length, 1, "Existing objectives without the new marker remain unchanged");
});

test("new Hunting population retains its authored large construction boundary until field initialization", () => {
    const r = runtime(),
        c = r.context,
        phases = [];
    c.KDMapData.Tiles = {};
    c.KinkyDungeonTilesGet = (name) => c.KDMapData.Tiles[name];
    c.KinkyDungeonTilesSet = (name, value) => (c.KDMapData.Tiles[name] = value);
    c.KinkyDungeonMapSet = () => {};
    c.KinkyDungeonGenNavMap = () => {};
    c.KinkyDungeonCreateMapGenType = { TileMaze() {} };
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsHuntingGroundsLayout.js"), "utf8"), c);
    c.KinkyDungeonCreateMapGenType.TileMaze();
    const site = JSON.parse(JSON.stringify(c.Spiderlings.HuntingGroundsLayout.earlyPlan(c.KDMapData).largeHuntingSite));
    assert.ok(site);
    c.populationAction = () => {
        phases.push("population");
        assert.equal(c.KinkyDungeonTilesGet(`${site.x + 4},${site.y}`).OL, true);
        assert.equal(c.KinkyDungeonTilesGet(`${site.x + 2},${site.y}`).OL, true);
        assert.equal(c.KinkyDungeonTilesGet(`${site.x},${site.y}`), undefined);
        assert.equal(c.KinkyDungeonMapGet(site.x + 4, site.y), "0", "birth reservation never invents wall terrain");
        assert.equal(c.KDMapData.Entities.length, 27, "the same three native nest crews remain intact");
    };
    c.Spiderlings.SpinnerAI = {
        initializeMapgenField(options) {
            phases.push("field");
            assert.deepEqual(JSON.parse(JSON.stringify(options.preferredSites[0])), { ...site, radius: 4 });
            assert.equal(
                Object.values(c.KDMapData.Tiles).some((tile) => tile.SpiderlingsLayoutReserve || tile.OL),
                false,
            );
            return { status: "placed", center: site, radius: 4 };
        },
    };
    r.generate();
    assert.deepEqual(phases, ["population"]);
    r.event("postMapgen");
    assert.deepEqual(phases, ["population", "field"]);
    assert.deepEqual(JSON.parse(JSON.stringify(c.KDMapData.SpiderlingsHuntingGrounds.layout.largeHuntingSite)), site);
    assert.equal(c.KDMapData.Entities.length, 27);
    const state = JSON.stringify(c.KDMapData),
        player = JSON.stringify(c.KinkyDungeonPlayerEntity);
    r.event("postMapgen");
    assert.equal(JSON.stringify(c.KDMapData), state);
    assert.equal(JSON.stringify(c.KinkyDungeonPlayerEntity), player);
});

test("a mobile NPC occupying only the optional preset keeps the native objective and guards", () => {
    for (const failure of ["none", "nest", "guard"]) {
        const r = runtime(),
            c = r.context;
        c.KDMapData.Tiles = {};
        c.KinkyDungeonTilesGet = (name) => c.KDMapData.Tiles[name];
        c.KinkyDungeonTilesSet = (name, value) => (c.KDMapData.Tiles[name] = value);
        c.KinkyDungeonMapSet = () => {};
        c.KinkyDungeonGenNavMap = () => {};
        c.KinkyDungeonCreateMapGenType = { TileMaze() {} };
        vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsHuntingGroundsLayout.js"), "utf8"), c);
        c.KinkyDungeonCreateMapGenType.TileMaze();
        const site = c.Spiderlings.HuntingGroundsLayout.earlyPlan(c.KDMapData).largeHuntingSite,
            maid = { id: 500, x: site.x + 3, y: site.y, hp: 10, Enemy: { name: "Maidforce" } },
            original = JSON.stringify(maid);
        c.KDMapData.Entities.push(maid);
        if (failure === "nest") c.KinkyDungeonMapGet = (x, y) => (x === 1 && y === 1 ? "0" : "1");
        if (failure === "guard") {
            const nativeSummon = c.KinkyDungeonSummonEnemy;
            c.KinkyDungeonSummonEnemy = (...args) => (args[2] === "MageSpiderlings" ? [] : nativeSummon(...args));
        }
        let fields = 0;
        c.Spiderlings.SpinnerAI = { initializeMapgenField: () => fields++ };
        r.generate();
        const state = c.KDMapData.SpiderlingsHuntingGrounds;
        assert.equal(state.status, failure === "none" ? "active" : "cancelled", failure);
        if (failure === "none") {
            assert.equal(c.KDMapData.MapMod, "SpiderlingsHuntingGrounds");
            assert.equal(state.targetIds.length, 3);
            assert.equal(state.fieldPreset.status, "pending");
            assert.equal(state.fieldPreset.maxFields, 3);
            assert.equal(c.KDMapData.Entities.length, 28);
        } else {
            assert.equal(state.reason, failure === "nest" ? "insufficient-space" : "garrison-failed");
            assert.deepEqual(c.KDMapData.Entities, [maid]);
        }
        r.event("postMapgen");
        assert.equal(fields, failure === "none" ? 1 : 0);
        assert.equal(JSON.stringify(maid), original);
        assert.equal(
            Object.values(c.KDMapData.Tiles).some((tile) => tile.SpiderlingsLayoutReserve || tile.OL),
            false,
        );
    }
});

test("native modifier adds three independent nests and eighteen attributable core members and a six-member patrol", () => {
    const r = runtime();
    const mod = r.context.KDMapMods.SpiderlingsHuntingGrounds;
    assert.equal(mod.weight, 1500);
    assert.equal(mod.faction, undefined);
    assert.equal(mod.filter({ y: 2 }), 0);
    assert.equal(mod.filter({ y: 5 }), 0);
    assert.equal(mod.filter({ y: 5, Faction: "Maidforce" }), 1);
    assert.equal(mod.filter({ y: 5, RoomType: "PerkRoom" }), 0);
    assert.equal(r.generate(), "native-result");
    assert.equal(r.context.KDMapData.Entities.length, 27);
    const nests = r.context.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance");
    assert.equal(nests.length, 3);
    assert.equal(new Set(r.context.KDMapData.Entities.map((e) => `${e.x},${e.y}`)).size, 27);
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds.garrisonVersion, 3);
    for (const nest of nests) {
        assert.ok(
            nests.every(
                (other) => other === nest || Math.max(Math.abs(nest.x - other.x), Math.abs(nest.y - other.y)) >= 9,
            ),
        );
        assert.deepEqual(
            r.context.KDMapData.Entities.filter((e) => e.SpiderlingsNestParentID === nest.id)
                .map((e) => e.Enemy.name)
                .sort(),
            ["Jumper", "MageSpiderlings", "Spinner", "Spinner", "WebCaster", "WebCaster"],
        );
        assert.equal(nest.flags.no_pers_wander, -1);
        assert.equal(nest.flags.questtarget, -1);
    }
    assert.equal(r.population[0][7], undefined, "keep the native population budget");
    r.generate();
    r.event("postMapgen");
    assert.equal(r.context.KDMapData.Entities.length, 27);
    assert.equal(r.context.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.filterRandom(), 0);
});

test("task nest damage makes nearby spiders target the maid attacker for a short window", () => {
    const r = runtime({
        KinkyDungeonCurrentTick: 10,
        KDHostile: (source, target) => source?.Enemy?.name !== "Maidforce" && target?.Enemy?.name === "Maidforce",
    });
    r.generate();
    const c = r.context,
        nest = c.KDMapData.Entities.find((entity) => entity.Enemy.name === "NestEntrance"),
        guard = c.KDMapData.Entities.find((entity) => entity.SpiderlingsNestParentID === nest.id),
        maid = { id: 900, x: nest.x + 1, y: nest.y, hp: 8, faction: "Maidforce", Enemy: { name: "Maidforce" } },
        original = c.KinkyDungeonPlayerEntity;
    c.KDMapData.Entities.push(maid);
    delete guard.SpiderlingsHuntRole;
    assert.equal(c.Spiderlings.HuntingGrounds.resolveNestDefenderTarget(guard, original), original);
    r.event("afterDamageEnemy", { enemy: nest, attacker: maid, dmgDealt: 1, aggro: true });
    assert.equal(c.Spiderlings.HuntingGrounds.resolveNestDefenderTarget(guard, original), maid);
    c.KinkyDungeonCurrentTick = 15;
    assert.equal(c.Spiderlings.HuntingGrounds.resolveNestDefenderTarget(guard, original), original);
});

test("task nest projectile alarms resolve only a live hostile source and keep actual attackers authoritative", () => {
    for (const mode of ["live", "missing", "dead", "player", "neutral", "actual"]) {
        const r = runtime({ KinkyDungeonCurrentTick: 10, KDHostile: () => mode !== "neutral" });
        r.generate();
        const c = r.context,
            nest = c.KDMapData.Entities.find((entity) => entity.Enemy.name === "NestEntrance"),
            shooter = {
                id: 900,
                x: nest.x + 4,
                y: nest.y,
                hp: mode === "dead" ? 0 : 8,
                faction: "Maidforce",
                Enemy: { name: "MaidforceMafia" },
            },
            actual = { id: 901, x: nest.x + 1, y: nest.y, hp: 8, faction: "Enemy", Enemy: { name: "Bandit" } };
        if (mode === "player") shooter.player = true;
        if (mode !== "missing") c.KDMapData.Entities.push(shooter);
        if (mode === "actual") c.KDMapData.Entities.push(actual);
        r.event("afterDamageEnemy", {
            enemy: nest,
            attacker: mode === "actual" ? actual : undefined,
            dmgDealt: 1,
            faction: "Maidforce",
            bullet: { bullet: { source: shooter.id, faction: "Maidforce" } },
        });
        if (["live", "actual"].includes(mode)) {
            const expected = mode === "actual" ? actual : shooter;
            assert.deepEqual(
                JSON.parse(JSON.stringify(nest.SpiderlingsTaskNestAttacker)),
                { id: expected.id, x: expected.x, y: expected.y, tick: 10 },
                mode,
            );
        } else assert.equal(nest.SpiderlingsTaskNestAttacker, undefined, mode);
    }
});

test("a projectile finisher retains the native damage faction even after its shooter leaves", () => {
    const r = runtime({ KDHostile: () => true });
    r.generate();
    const c = r.context,
        nest = c.KDMapData.Entities.find((entity) => entity.Enemy.name === "NestEntrance");
    nest.hp = -1;
    r.event("afterDamageEnemy", {
        enemy: nest,
        dmgDealt: 3,
        faction: "Maidforce",
        bullet: { bullet: { source: 900, faction: "Maidforce" } },
    });
    assert.equal(nest.SpiderlingsTaskNestMaidFinisher, true);
    assert.equal(
        nest.SpiderlingsTaskNestAttacker,
        undefined,
        "a missing shooter provides no live investigation target",
    );
});

function nativeJourneyRuntime(overrides = {}, withOld = false) {
    const game = require("../reference-inputs.js").gamePath("Game/src/map");
    return runtime(
        {
            PIXI: { Graphics: class {} },
            KDBaseWhite: "#fff",
            KinkyDungeonNewGame: 0,
            KDLevelsPerCheckpoint: 10,
            KinkyDungeonMaxLevel: 40,
            KDNoDragonLairCheckpoints: [],
            KDIsHellFloor: () => false,
            KinkyDungeonBossFloor: () => ({ forceCheckpoint: "grv" }),
            KinkyDungeonAltFloor: () => undefined,
            CommonRandomItemFromList: () => "Maidforce",
            KinkyDungeonMapParams: { grv: { factionList: ["Maidforce"] } },
            KinkyDungeonMapIndex: { grv: "grv" },
            KDGetRandomEscapeMethod: () => "Key",
            KDGetSideRoom: () => undefined,
            KDSideRooms: { ElevatorEgyptian: { name: "ElevatorEgyptian" } },
            KDGetByWeight: () => "grv",
            ...overrides,
        },
        [
            fs
                .readFileSync(path.join(game, "KinkyDungeonMapMods.ts"), "utf8")
                .replace("let KDMapMods: Record<string, MapMod>", "globalThis.KDMapMods"),
            fs.readFileSync(path.join(game, "KDJourney.ts"), "utf8"),
        ],
        withOld,
    );
}

test("higher defaults increase both spider floors across complete native journeys", (t) => {
    const game = require("../reference-inputs.js").gamePath();
    const read = (name) => fs.readFileSync(path.join(game, name), "utf8").replaceAll("\r", "");
    const declaration = (text, name) => {
        const start = text.indexOf("function " + name);
        const end = text.indexOf("\n}", start);
        assert.ok(start >= 0 && end > start, name);
        return text.slice(start, end + 2);
    };
    const gameCode = read("Game/src/base/game/KinkyDungeonGame.ts");
    const r = runtime(
        {
            PIXI: { Graphics: class {} },
            KDBaseWhite: "#fff",
            KinkyDungeonNewGame: 0,
            KDLevelsPerCheckpoint: 4,
            KinkyDungeonMaxLevel: 21,
            KDNoDragonLairCheckpoints: ["lib"],
            KinkyDungeonAltFloor: () => undefined,
            // Terrain, escape and side-room generation are outside this probability regression.
            KDGetRandomEscapeMethod: () => "Key",
            KDGetSideRoom: () => undefined,
            KDSideRooms: { ElevatorEgyptian: { name: "ElevatorEgyptian" } },
            KinkyDungeonMapIndex: Object.fromEntries(
                ["grv", "cat", "jng", "tmp", "bel", "tmb", "lib", "cry", "ore"].map((name) => [name, name]),
            ),
            KDGameData: { Journey: "", JourneyProgression: ["grv", "cat", "jng", "tmp", "bel"] },
        },
        [
            read("Game/src/map/KinkyDungeonParams.ts"),
            read("Game/src/map/KinkyDungeonMapMods.ts").replace(
                "let KDMapMods: Record<string, MapMod>",
                "globalThis.KDMapMods",
            ),
            read("Game/src/map/KinkyDungeonBoss.ts"),
            read("Game/src/map/KDJourney.ts"),
            declaration(read("Scripts/Common.ts"), "CommonRandomItemFromList"),
            declaration(gameCode, "KDGetByWeight"),
            declaration(gameCode, "KDIsHellFloor"),
        ],
        true,
    );
    const counts = vm.runInContext(
        `(() => {
        const counts = { nodes: 0, infestation: 0, hunting: 0, biomes: {} };
        for (let run = 0; run < 4000; run++) {
            let seed = (0x974200 + Math.imul(run + 1, 0x9e3779b9)) >>> 0;
            KDRandom = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;
            Math.random = KDRandom;
            KDMapModRefreshList = [];
            KDInitJourneyMap(0);
            for (const slot of Object.values(KDGameData.JourneyMap)) {
                if (slot.type !== "basic" || slot.y < 3 || slot.RoomType || KDIsHellFloor(slot.y)) continue;
                counts.nodes++;
                counts.biomes[slot.Checkpoint] = (counts.biomes[slot.Checkpoint] || 0) + 1;
                if (slot.MapMod === "SpiderlingsInfestation") counts.infestation++;
                if (slot.MapMod === "SpiderlingsHuntingGrounds") {
                    if (slot.Faction !== "Maidforce") throw new Error("Hunting Grounds changed faction");
                    counts.hunting++;
                }
            }
        }
        return counts;
    })()`,
        r.context,
    );
    assert.equal(counts.nodes, 260000);
    assert.ok(Object.keys(counts.biomes).length > 4, "retain the native biome distribution");
    assert.ok(counts.infestation / counts.nodes > 0.15 && counts.infestation / counts.nodes < 0.22);
    const ratio = counts.hunting / counts.infestation;
    assert.ok(ratio > 0.2 && ratio < 0.4, JSON.stringify(counts));
    t.diagnostic(JSON.stringify(counts));
});

test("both floor labels obey native journey selection together", (t) => {
    let seed = 1;
    const r = nativeJourneyRuntime(
        {
            CommonRandomItemFromList: () => "Bandit",
            KDRandom: () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
        },
        true,
    );
    const counts = vm.runInContext(
        `(() => {
        KDMapModRefreshList = [KDMapMods.SpiderlingsInfestation, KDMapMods.SpiderlingsHuntingGrounds, KDMapMods.Mold];
        const early = KDJourneySlotTypes.basic(null, 0, 2, "grv");
        if (early.MapMod !== "Mold") throw new Error("Early floor reused a spider modifier");
        KDMapModRefreshList = [];
        const counts = {};
        for (let i = 0; i < 30000; i++) {
            const slot = KDJourneySlotTypes.basic(null, 0, 5, "grv");
            counts[slot.MapMod] = (counts[slot.MapMod] || 0) + 1;
            if (slot.MapMod.startsWith("Spiderlings") &&
                ((slot.MapMod === "SpiderlingsHuntingGrounds" && slot.Faction !== "Maidforce") || slot.EscapeMethod !== slot.MapMod))
                throw new Error("Spider modifier lost its faction or objective");
        }
        return counts;
    })()`,
        r.context,
    );
    assert.ok(counts.SpiderlingsHuntingGrounds > 0);
    assert.ok(counts.SpiderlingsInfestation > 0 && counts.Bandit > 0 && counts.None > 0);
    t.diagnostic(JSON.stringify(counts));
});

test("native journey rejects a cached infestation through the first boss floor and preserves the maid modifier", () => {
    const r = nativeJourneyRuntime({ CommonRandomItemFromList: () => "Bandit" });
    const c = r.context;
    const selection = vm.runInContext(
        `
        KDMapModRefreshList = [KDMapMods.SpiderlingsHuntingGrounds, KDMapMods.Mold];
        KDJourneySlotTypes.basic(null, 0, 2, "grv");
    `,
        c,
    );
    assert.equal(selection.MapMod, "Mold");
    assert.equal(selection.Faction, "Maidforce");
    const remaining = vm.runInContext("KDMapModRefreshList.map(mod => mod.name)", c);
    assert.ok(!remaining.includes("SpiderlingsHuntingGrounds"));
    const eligible = vm.runInContext(
        `
        KDRandom = () => 0.25;
        KDMapModRefreshList = [KDMapMods.Mold];
        KDJourneySlotTypes.basic(null, 0, 5, "grv");
    `,
        c,
    );
    assert.equal(eligible.MapMod, "SpiderlingsHuntingGrounds");
    assert.equal(eligible.EscapeMethod, "SpiderlingsHuntingGrounds");
    assert.equal(
        eligible.Faction,
        "Maidforce",
        "Hunting Grounds keeps the Maidforce selected by the native Mold candidate",
    );
});

test("spider selection preserves every native primary faction and sets the objective before side rooms", () => {
    for (const base of ["None", "Mold", "Bandit", "Dragon", "Witch", "Slime"]) {
        const seen = [];
        const r = nativeJourneyRuntime(
            {
                CommonRandomItemFromList: () => "Nevermere",
                KDRandom: () => 0.01,
                KDGetSideRoom(slot, top) {
                    seen.push({ mod: slot.MapMod, faction: slot.Faction, escape: slot.EscapeMethod });
                    return { name: top ? "top" : "bottom" };
                },
            },
            true,
        );
        const c = r.context;
        const slot = vm.runInContext(
            `KDMapModRefreshList = [KDMapMods.${base}]; KDJourneySlotTypes.basic(null, 0, 5, "grv")`,
            c,
        );
        const faction = c.KDMapMods[base].faction || "Nevermere";
        assert.equal(slot.MapMod, "SpiderlingsInfestation", base);
        assert.equal(slot.Faction, faction, base);
        assert.equal(slot.EscapeMethod, slot.MapMod);
        assert.equal(seen.length, 2);
        assert.ok(seen.every((s) => s.mod === slot.MapMod && s.faction === faction && s.escape === slot.MapMod));
        assert.deepEqual(Array.from(slot.SideRooms), ["top", "bottom"]);
    }
});

test("Hunting Grounds only replaces a Maidforce primary faction even with an overwhelming weight", () => {
    const r = nativeJourneyRuntime({ CommonRandomItemFromList: () => "Bandit", KDRandom: () => 0.25 }, true);
    const c = r.context;
    c.Spiderlings.getSetting = (name) => (name === "spiderlingsInfestationWeight" ? "0" : "1000000");
    for (const base of ["None", "Bandit", "Dragon", "Mold"]) {
        const slot = vm.runInContext(
            `KDMapModRefreshList = [KDMapMods.${base}]; KDJourneySlotTypes.basic(null, 0, 5, "grv")`,
            c,
        );
        assert.equal(slot.MapMod, base === "Mold" ? "SpiderlingsHuntingGrounds" : base);
        assert.equal(slot.Faction, c.KDMapMods[base].faction || "Bandit");
    }
});

test("floor weights take effect on the next draw, zero disables, and invalid input uses defaults", () => {
    const r = nativeJourneyRuntime({ KDRandom: () => 0.25 }, true),
        c = r.context;
    const settings = { spiderlingsInfestationWeight: "0", spiderlingsHuntingGroundsWeight: "0" };
    c.Spiderlings.getSetting = (name) => settings[name];
    const draw = () =>
        vm.runInContext(`KDMapModRefreshList = [KDMapMods.Mold]; KDJourneySlotTypes.basic(null, 0, 5, "grv")`, c);
    const preview = draw();
    assert.equal(preview.MapMod, "Mold");
    settings.spiderlingsHuntingGroundsWeight = "750";
    assert.equal(draw().MapMod, "SpiderlingsHuntingGrounds");
    settings.spiderlingsHuntingGroundsWeight = "0";
    settings.spiderlingsInfestationWeight = "1000";
    assert.equal(draw().MapMod, "SpiderlingsInfestation");
    assert.equal(preview.MapMod, "Mold", "already generated nodes are not rerolled");
    for (const bad of ["", "-1", "1.5", "Infinity", "garbage", "9007199254740992"]) {
        settings.spiderlingsInfestationWeight = settings.spiderlingsHuntingGroundsWeight = bad;
        assert.equal(c.KDMapMods.SpiderlingsInfestation.weight, 200, bad);
        assert.equal(c.KDMapMods.SpiderlingsHuntingGrounds.weight, 1500, bad);
    }
});

test("native modifier pool excludes spider floors until a faction is known and ignores stale spider entries", () => {
    const r = nativeJourneyRuntime({ KDRandom: () => 0.1, CommonRandomItemFromList: () => "Bandit" }, true),
        c = r.context;
    for (const name of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"])
        assert.equal(c.KDMapMods[name].filter({ y: 5, Faction: "", RoomType: "" }), 0);
    c.Spiderlings.getSetting = () => "0";
    const slot = vm.runInContext(
        `KDMapModRefreshList = [KDMapMods.SpiderlingsInfestation, KDMapMods.SpiderlingsHuntingGrounds, KDMapMods.None]; KDJourneySlotTypes.basic(null, 0, 5, "grv")`,
        c,
    );
    assert.equal(slot.MapMod, "None");
    assert.equal(slot.Faction, "Bandit");
});

test("spider selection skips special rooms and Hell and does not leak outside basic journey generation", () => {
    const seen = [];
    const r = nativeJourneyRuntime(
            {
                KDRandom: () => 0.001,
                KDGetSideRoom(slot) {
                    seen.push(slot.MapMod);
                },
            },
            true,
        ),
        c = r.context;
    c.KDMapMods.Special = { name: "Special", roomType: "PerkRoom", faction: "Maidforce" };
    const special = vm.runInContext(
        `KDMapModRefreshList = [KDMapMods.Special]; KDJourneySlotTypes.basic(null, 0, 5, "grv")`,
        c,
    );
    assert.equal(special.MapMod, "Special");
    c.KDIsHellFloor = () => true;
    const hell = vm.runInContext(`KDJourneySlotTypes.basic(null, 0, 5, "grv")`, c);
    assert.equal(hell.MapMod, "");
    c.KDIsHellFloor = () => false;
    const external = { type: "basic", y: 5, MapMod: "None", Faction: "Maidforce", RoomType: "" };
    c.KDGetSideRoom(external, true, []);
    assert.equal(external.MapMod, "None");
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsFloorSelection.js"), "utf8"), c);
    seen.length = 0;
    const once = vm.runInContext(
        `KDMapModRefreshList = [KDMapMods.None]; KDJourneySlotTypes.basic(null, 0, 5, "grv")`,
        c,
    );
    assert.equal(once.MapMod, "SpiderlingsInfestation");
    assert.deepEqual(seen, [once.MapMod, once.MapMod]);
});

test("repeated native new journeys cannot reuse deep-floor infestation candidates on floor two", () => {
    let seed = 1;
    const r = nativeJourneyRuntime({
        KDRandom: () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296,
    });
    r.context.KDGameData.JourneyProgression = ["grv"];
    let infestations = 0;
    for (let attempt = 0; attempt < 40; attempt++) {
        vm.runInContext("KDInitJourneyMap(0)", r.context);
        for (const slot of Object.values(r.context.KDGameData.JourneyMap)) {
            if (slot.MapMod !== "SpiderlingsHuntingGrounds") continue;
            infestations++;
            assert.ok(slot.y >= 5, `attempt ${attempt}, floor ${slot.y}`);
        }
    }
    assert.ok(infestations > 0, "eligible infestation encounters still occur");
});

test("loading repairs only unvisited early infestation previews and keeps independent factions", () => {
    const slots = {
        early: {
            y: 2,
            MapMod: "SpiderlingsHuntingGrounds",
            EscapeMethod: "SpiderlingsHuntingGrounds",
            Faction: "Maidforce",
        },
        maid: { y: 2, MapMod: "Mold", EscapeMethod: "Key", Faction: "Maidforce" },
        eligible: { y: 5, MapMod: "SpiderlingsHuntingGrounds", EscapeMethod: "SpiderlingsHuntingGrounds" },
        visited: {
            y: 2,
            visited: true,
            MapMod: "SpiderlingsHuntingGrounds",
            EscapeMethod: "SpiderlingsHuntingGrounds",
        },
    };
    const before = JSON.stringify(slots);
    const r = runtime();
    r.context.KDGameData.JourneyMap = slots;
    r.event("afterLoadGame");
    assert.equal(slots.early.MapMod, "None");
    assert.equal(slots.early.EscapeMethod, "Key");
    assert.equal(slots.early.Faction, "Maidforce");
    for (const name of ["maid", "eligible", "visited"]) assert.deepEqual(slots[name], JSON.parse(before)[name]);
    const after = JSON.stringify(slots);
    r.context.Spiderlings.HuntingGrounds.register();
    r.event("afterLoadGame");
    assert.equal(JSON.stringify(slots), after);
});

test("maid floors have no infestation objective; infestation floors place three nests without a maid modifier", () => {
    const r = runtime();
    r.context.KDMapData.MapMod = "Mold";
    r.generate();
    assert.equal(r.context.KDMapData.Entities.length, 0);
    assert.equal(r.context.Spiderlings.HuntingGrounds.activeState(), null);
    assert.equal(r.event("calcEscapeMethod", { escapeMethod: "Key" }).escapeMethod, "Key");
    r.context.KDMapData.MapMod = "SpiderlingsHuntingGrounds";
    r.context.KDMapData.MapFaction = "Bandit";
    r.generate();
    assert.equal(r.context.KDMapData.Entities.length, 27);
    assert.equal(r.context.Spiderlings.HuntingGrounds.activeState().targetIds.length, 3);
});

function nativePopulationRuntime() {
    const game = require("../reference-inputs.js").gamePath("Game/src");
    const definitions = fs.readFileSync(path.join(game, "enemy/KinkyDungeonEnemiesList.ts"), "utf8");
    const spawns = fs.readFileSync(path.join(game, "enemy/KinkyDungeonSpawns.ts"), "utf8");
    const tiles = fs.readFileSync(path.join(game, "map/KinkyDungeonEditorGen.ts"), "utf8");
    const names = [
        "Maidforce",
        "MaidforcePara",
        "MaidforceStalker",
        "MaidforceMafia",
        "MaidforceMini",
        "MaidforceHead",
        "Dressmaker",
        "Puppetmaster",
        "PuppetLost",
        "Nurse",
        "Librarian",
        "MaidforceQuest",
    ];
    const enemies = names.map((name) => {
        const start = definitions.indexOf(`\t{name: "${name}"`);
        assert.ok(start >= 0, name);
        const end = definitions.indexOf("\n\t{name:", start + 1);
        return vm.runInNewContext(`[${definitions.slice(start, end)}\n]`, {
            KDBaseWhite: "#ffffff",
            KDMapInit: (tags) => Object.fromEntries(tags.map((tag) => [tag, true])),
        })[0];
    });
    enemies.push({
        name: "Unrelated",
        faction: "Bandit",
        minLevel: 0,
        weight: 1000,
        allFloors: true,
        tags: { human: true },
        terrainTags: {},
    });
    const native = spawns.slice(
        spawns.indexOf("function KinkyDungeonGetEnemy ("),
        spawns.indexOf("function KDEntityCanBeGuard("),
    );
    const r = runtime(
        {
            console: { log() {} },
            KinkyDungeonEnemies: enemies,
            KinkyDungeonRestraints: [],
            KinkyDungeonSpellListEnemies: [],
            KDModConfigs: {},
            KDModSettings: {},
            KDPerkToggleTags: [],
            KinkyDungeonStatsChoice: new Map(),
            KinkyDungeonNewGame: 0,
            KinkyDungeonGoddessRep: {},
            KDLevelsPerCheckpoint: 10,
            KinkyDungeonGroundTiles: "0",
            KDDefaultAvoidTiles: "X",
            KDRandom: seededRandom(812),
            KDFactionRelation: (a, b) => (a === b ? 1 : -1),
            KDMapInit: (tags) => Object.fromEntries(tags.map((tag) => [tag, true])),
            KinkyDungeonRefreshRestraintsCache() {},
            KinkyDungeonRefreshEnemiesCache() {},
            MiniGameKinkyDungeonLevel: 5,
            KDCurrIndex: () => "grv",
            KinkyDungeonMapSet() {},
            KDRunCreationScript() {},
            KDGetCurrentLocation: () => "test",
            DialogueCreateEnemy(x, y, name) {
                return { x, y, Enemy: enemies.find((enemy) => enemy.name === name) };
            },
            KinkyDungeonHandleWanderingSpawns(...args) {
                return this.KinkyDungeonGetEnemy(...args);
            },
        },
        [
            native,
            `globalThis.KDTileGen = {${tiles.slice(tiles.indexOf('"ForceSpawn":'), tiles.indexOf('"Prisoner":'))}};`,
            ["SpiderlingsCore.js", "SpiderlingsEncounters.js", "SpiderlingsWebCaster.js"]
                .map((file) => fs.readFileSync(path.join(__dirname, "../..", file), "utf8"))
                .join("\n"),
            fs.readFileSync(path.join(__dirname, "../../Spiderlings.js"), "utf8"),
        ],
    );
    r.context.KDMapData.SpiderlingsHuntingGrounds = { status: "active", complete: false };
    r.context.KDMapData.MapFaction = "Maidforce";
    r.select = (...args) => {
        r.context.populationAction = () => r.context.KinkyDungeonGetEnemy(...args);
        try {
            return r.generate();
        } finally {
            delete r.context.populationAction;
        }
    };
    return r;
}

test("Hunting Grounds weights Spiderlings while allowing native random prey", () => {
    const r = nativePopulationRuntime();
    const c = r.context;
    for (const level of [3, 10, 30]) {
        const counts = { Spider: 0, Maid: 0, Dressmaker: 0, Nurse: 0, Other: 0 };
        for (let index = 0; index < 3000; index++) {
            const enemy = r.select(
                ["construct", "mold", "bandit"],
                level,
                "grv",
                "0",
                undefined,
                undefined,
                undefined,
                ["boss", "miniboss", "elite"],
            );
            assert.ok(enemy);
            const group = c.Spiderlings.HuntingGrounds.populationGroup(enemy);
            counts[group || "Other"]++;
        }
        assert.ok(
            counts.Spider > 0 && counts.Maid > 0 && counts.Dressmaker > 0 && counts.Other > 0,
            JSON.stringify(counts),
        );
        const humans = counts.Maid + counts.Dressmaker + counts.Nurse;
        assert.ok(counts.Spider > humans * 10 && counts.Spider > counts.Other, JSON.stringify({ level, counts }));
        assert.ok(counts.Maid > counts.Dressmaker && counts.Maid > counts.Nurse, JSON.stringify({ level, counts }));
    }
});

test("infestation selection preserves native restrictions, fallback, spider cap and caller inputs", () => {
    const r = nativePopulationRuntime();
    const c = r.context;
    const select = (required, bonus, filters, single, min = 0) =>
        r.select([], 3, "grv", "0", required, undefined, bonus, filters, single, min);
    assert.equal(select(["librarian"]), undefined, "shared dressmaker tag cannot admit Apprentice faction");
    assert.equal(select(["peaceful"]), undefined, "quest NPCs are not combat population");
    assert.equal(select(["shadowclan"]), undefined, "Stalker retains native minimum level 4");
    assert.equal(select(undefined, undefined, undefined, ["unrelated"]), undefined);
    const tags = ["maid"],
        bonus = { human: { bonus: 0, mult: 2 } },
        filter = ["boss", "miniboss", "elite"];
    const before = JSON.stringify({ tags, bonus, filter });
    assert.equal(
        select(tags, bonus, filter, undefined, 10000).faction,
        "Maidforce",
        "fallback stays in the allowed pool",
    );
    assert.equal(JSON.stringify({ tags, bonus, filter }), before);
    c.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "1";
    c.KDMapData.Entities.push({ hp: 1, Enemy: { name: "Spinner" } });
    assert.equal(select(["Spinner"]), undefined);
    assert.equal(select(["maid"], undefined, filter).faction, "Maidforce");
    c.KDMapData.SpiderlingsHuntingGrounds.complete = true;
    assert.equal(select(["librarian"]), undefined, "completion does not change floor ecology");
    c.KDMapData = { MapMod: "None", Entities: [] };
    assert.equal(select(["human"], undefined, ["dressmaker", "maid"]).name, "Unrelated");
    c.KDMapData = { MapMod: "None", Entities: [], SpiderlingsHuntingGrounds: { status: "cancelled" } };
    assert.equal(select(["human"], undefined, ["dressmaker", "maid"]).name, "Unrelated");
});

test("ordinary maid ranks can fill maid population without changing other maps or native arrays", () => {
    const r = nativePopulationRuntime();
    const base = ["boss", "miniboss", "elite", "minor"];
    let data;
    r.context.populationAction = () => {
        data = r.event("afterGetSpawnBoxes", { filterTagsBase: base });
    };
    r.generate();
    assert.deepEqual(Array.from(data.filterTagsBase), ["boss", "miniboss", "elite"]);
    assert.deepEqual(base, ["boss", "miniboss", "elite", "minor"]);
    r.context.KDMapData = { Entities: [] };
    assert.equal(r.event("afterGetSpawnBoxes", { filterTagsBase: base }).filterTagsBase, base);
});

test("initial maid ecology survives an exhausted neutral allowance while wandering and presets keep hostility filters", () => {
    const r = nativePopulationRuntime();
    const c = r.context;
    c.KDFactionRelation = (a, b) =>
        a === b ? 1 : a === "Player" && ["Maidforce", "Dressmaker"].includes(b) ? -0.1 : -1;
    const alliances = { requireHostile: "Player", requireAllied: "", requireNonHostile: "" };
    const args = [[], 3, "grv", "0", ["maid"], alliances, undefined, ["boss", "miniboss", "elite"]];
    assert.equal(r.select(...args).faction, "Maidforce", "native neutral cap must not empty the themed floor");
    assert.equal(
        r.select([], 3, "grv", "0", ["dressmaker"], alliances, undefined, ["boss", "miniboss", "elite"]).faction,
        "Dressmaker",
    );
    assert.equal(alliances.requireHostile, "Player", "caller alliances are never mutated");
    assert.equal(c.KinkyDungeonGetEnemy(...args), undefined, "ordinary lookups retain the original filter");
    assert.equal(c.KinkyDungeonHandleWanderingSpawns(...args), undefined, "hostile search parties remain hostile");
    assert.equal(
        r.select(...args.slice(0, 7), [...args[7], "SpiderlingsHuntingGroundsPreset"]),
        undefined,
        "preset encounters retain their native filter",
    );
    assert.equal(
        r.select([], 3, "grv", "0", ["maid"], { ...alliances, requireAllied: "Bandit" }),
        undefined,
        "other explicit alliance constraints remain effective",
    );
    c.KDMapData.MapFaction = "Bandit";
    c.KDMapData.MapMod = "None";
    assert.equal(r.select(...args), undefined, "other main factions still use the native neutral allowance");
});

test("faction population and the three-nest objective vary independently across all four combinations", () => {
    for (const faction of ["Maidforce", "Bandit", "Nevermere"]) {
        for (const mod of ["None", "SpiderlingsHuntingGrounds"]) {
            const r = nativePopulationRuntime();
            const c = r.context;
            delete c.KDMapData.SpiderlingsHuntingGrounds;
            c.KDMapData.MapFaction = faction;
            c.KDMapData.MapMod = mod;
            c.KDGameData.MapMod = mod;
            const pickArgs = [[], 3, "grv", "0", ["human"], undefined, undefined, ["maid", "dressmaker"]];
            const base = ["boss", "miniboss", "elite", "minor"];
            let picked, filters;
            c.populationAction = () => {
                picked = c.KinkyDungeonGetEnemy(...pickArgs);
                filters = r.event("afterGetSpawnBoxes", { filterTagsBase: base }).filterTagsBase;
            };
            r.generate();
            const state = c.Spiderlings.HuntingGrounds.activeState();
            assert.equal(
                state?.targetIds.length || 0,
                mod === "SpiderlingsHuntingGrounds" ? 3 : 0,
                `${faction}/${mod} objective`,
            );
            assert.equal(
                picked?.name,
                faction === "Maidforce" && mod !== "SpiderlingsHuntingGrounds" ? undefined : "Unrelated",
                `${faction}/${mod} initial pool`,
            );
            assert.equal(
                filters.includes("minor"),
                faction !== "Maidforce" && mod !== "SpiderlingsHuntingGrounds",
                `${faction}/${mod} ordinary slots`,
            );
            assert.equal(
                c.KinkyDungeonHandleWanderingSpawns(...pickArgs)?.name,
                faction === "Maidforce" && mod !== "SpiderlingsHuntingGrounds" ? undefined : "Unrelated",
                `${faction}/${mod} wandering pool`,
            );
            if (state) {
                assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), false);
                for (const enemy of [...c.KDMapData.Entities]) c.KDRemoveEntity(enemy, true);
                assert.equal(state.destroyedIds.length, 3);
                assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), true);
            }
        }
    }
});

test("a cancelled infestation does not disable maid population and a maid side room keeps its native pool", () => {
    const r = nativePopulationRuntime();
    const c = r.context;
    delete c.KDMapData.SpiderlingsHuntingGrounds;
    c.KDMapData.GridWidth = 3;
    const args = [[], 3, "grv", "0", ["human"], undefined, undefined, ["maid", "dressmaker"]];
    assert.equal(r.select(...args), undefined);
    assert.equal(c.KDMapData.SpiderlingsHuntingGrounds.status, "cancelled");
    assert.equal(c.KinkyDungeonHandleWanderingSpawns(...args), undefined);
    c.KDMapData.RoomType = "GuardOutpost";
    assert.equal(r.select(...args).name, "Unrelated");
    assert.equal(c.KinkyDungeonHandleWanderingSpawns(...args).name, "Unrelated");
});

test("native presets and ordinary lookups retain their pool while random wandering uses the floor theme", () => {
    const r = nativePopulationRuntime();
    const c = r.context;
    const pickArgs = [[], 3, "grv", "0", ["human"], undefined, undefined, ["maid", "dressmaker"]];
    assert.equal(c.KinkyDungeonGetEnemy(...pickArgs).name, "Unrelated");
    assert.equal(c.KinkyDungeonHandleWanderingSpawns(...pickArgs).name, "Unrelated");
    assert.equal(c.KinkyDungeonGetEnemy(...pickArgs).name, "Unrelated", "wandering scope is restored");
    const created = [];
    c.DialogueCreateEnemy = (x, y, name) => {
        created.push({ x, y, name });
        return created.at(-1);
    };
    const generator = { tags: ["bandit"], required: ["human"], faction: "Bandit", Chance: 1 };
    c.KDTileGen.ForceSpawn(7, 8, {}, generator, {});
    assert.equal(created[0].name, "Unrelated");
    assert.equal(created[0].faction, "Bandit");
    const points = [{ x: 7, y: 8, required: ["human"], ftags: ["maid", "dressmaker"], force: true }];
    const before = JSON.stringify(points);
    c.populationAction = (spawnpoints) =>
        c.KinkyDungeonGetEnemy([], 3, "grv", "0", spawnpoints[0].required, undefined, undefined, spawnpoints[0].ftags);
    assert.equal(c.KinkyDungeonPlaceEnemies(points, false, [], {}, 5, 30, 30, undefined, []).name, "Unrelated");
    assert.equal(JSON.stringify(points), before);
    c.populationAction = () => {
        throw new Error("native population failed");
    };
    assert.throws(() => r.generate(), /native population failed/);
    assert.equal(c.KinkyDungeonGetEnemy(...pickArgs).name, "Unrelated", "failed population restores scope");
});

test("excluded, tiny, occupied and locked maps cancel infestation and keep native population", () => {
    for (const room of [
        { bossroom: true },
        { enemies: false },
        { spawns: false },
        { nokeys: true },
        { escapeMethod: "None" },
    ]) {
        const r = runtime();
        r.generate(room);
        assert.equal(r.context.KDMapData.MapMod, "None");
        assert.equal(r.context.KDMapData.Entities.length, 0);
        assert.equal(r.population[0][7], room);
    }
    for (const scenario of ["early", "small", "occupied", "locked", "no-enemies-call"]) {
        const r = runtime();
        if (scenario === "small") r.context.KDMapData.GridWidth = 3;
        if (scenario === "occupied")
            r.context.KDMapData.Entities = rectangle(30, 30).map((p) => ({ ...p, Enemy: { immobile: true } }));
        if (scenario === "locked") r.context.KinkyDungeonTilesGet = () => ({ Lock: "Red" });
        if (scenario === "no-enemies-call") r.event("postMapgen");
        else r.generate(undefined, scenario === "early" ? 4 : 5);
        assert.equal(r.context.KDMapData.MapMod, "None", scenario);
        assert.equal(r.context.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), true);
    }
});

test("failed creation rolls back the full batch without suppressing ordinary enemies", () => {
    const r = runtime();
    const summon = r.context.KinkyDungeonSummonEnemy;
    r.context.KinkyDungeonSummonEnemy = (...args) => (r.context.KDMapData.Entities.length === 2 ? [] : summon(...args));
    r.generate();
    assert.equal(r.context.KDMapData.Entities.length, 0);
    assert.equal(r.context.KDMapData.MapMod, "None");
    assert.equal(r.population[0][7], undefined);
});

test("a missing initial guard cancels all three nests before carving terrain", () => {
    let writes = 0;
    const r = runtime({ KinkyDungeonMapSet: () => writes++ });
    const summon = r.context.KinkyDungeonSummonEnemy;
    r.context.KinkyDungeonSummonEnemy = (...args) => (args[2] === "NestEntrance" ? summon(...args) : []);
    r.generate();
    assert.equal(r.context.KDMapData.Entities.length, 0);
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds.reason, "garrison-failed");
    assert.equal(writes, 0);
});

test("twenty-one-place core capacity is atomic and a failed final Mage preserves existing actors", () => {
    for (const existing of [279, 280]) {
        const r = runtime();
        const c = r.context;
        const original = Array.from({ length: existing }, (_, index) => ({
            id: 1000 + index,
            x: -100,
            y: -100,
            hp: 1,
            Enemy: { name: "Unrelated" },
        }));
        c.KDMapData.Entities.push(...original);
        r.generate();
        assert.equal(c.Spiderlings.HuntingGrounds.activeState() !== null, existing === 279);
        assert.equal(c.KDMapData.Entities.length, existing + (existing === 279 ? 21 : 0));
        assert.ok(original.every((entity) => c.KDMapData.Entities.includes(entity)));
    }
    const r = runtime();
    const c = r.context;
    const original = { id: 1000, x: 10, y: 10, hp: 1, Enemy: { name: "Unrelated" } };
    c.KDMapData.Entities.push(original);
    const summon = c.KinkyDungeonSummonEnemy;
    c.KinkyDungeonSummonEnemy = (...args) => (args[2] === "MageSpiderlings" ? [] : summon(...args));
    r.generate();
    assert.deepEqual(c.KDMapData.Entities, [original]);
    assert.equal(c.KDMapData.SpiderlingsHuntingGrounds.status, "cancelled");
    assert.equal(c.KDMapData.SpiderlingsHuntingGrounds.reason, "garrison-failed");
});

test("three successful original-nest destructions count once regardless of attribution and unlock descent", () => {
    const r = runtime();
    r.generate();
    const c = r.context;
    const original = c.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance");
    const state = c.KDMapData.SpiderlingsHuntingGrounds;
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.minimaptext(), /0\/3/);
    assert.equal(r.event("calcEscapeMethod", { escapeMethod: "Key" }).escapeMethod, "SpiderlingsHuntingGrounds");
    for (const data of [
        { toTile: "s", AdvanceAmount: 0 },
        { toTile: "s", AdvanceAmount: 1, force: true },
        { toTile: "H", AdvanceAmount: 1 },
    ]) {
        assert.equal(r.event("beforeStairCancel", data).cancelevent, "SpiderlingsHuntingGrounds");
    }
    for (const data of [
        { toTile: "S", AdvanceAmount: -1 },
        { toTile: "H", AdvanceAmount: 0 },
    ]) {
        assert.equal(r.event("beforeStairCancel", data).cancelevent, undefined);
    }
    c.cancelRemoval = true;
    c.KDRemoveEntity(original[0], true);
    assert.equal(state.destroyedIds.length, 0);
    c.cancelRemoval = false;
    const laterNest = c.KinkyDungeonSummonEnemy(2, 2, "NestEntrance")[0];
    c.KDRemoveEntity(laterNest, true);
    const child = c.KinkyDungeonSummonEnemy(2, 2, "Spinner")[0];
    c.KDRemoveEntity(child, true);
    assert.equal(state.destroyedIds.length, 0);
    for (let index = 0; index < original.length; index++) {
        original[index].playerdmg = index === 0 ? 12 : undefined;
        original[index].killer = ["Player", "Maidforce", "Enemy"][index];
        c.KDRemoveEntity(original[index], true, true);
        c.KDRemoveEntity(original[index], true, true);
        assert.equal(state.destroyedIds.length, index + 1);
        assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), index === 2);
    }
    assert.match(r.messages.at(-1), /stairs.*\(3\/3\)/);
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.minimaptext(), "Marked nests destroyed: 3/3");
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.doortext(), /stairs.*\(3\/3\)/);
    assert.equal(r.messages.length, 3);
    assert.equal(r.event("beforeStairCancel", { toTile: "s", AdvanceAmount: 1 }).cancelevent, undefined);
});

test("map JSON preserves partial and completed progress, registration is idempotent, new maps are independent", () => {
    const r = runtime();
    r.generate();
    const c = r.context;
    c.Spiderlings.HuntingGrounds.register();
    c.KDRemoveEntity(c.KDMapData.Entities[0], true);
    const snapshot = JSON.stringify(c.KDMapData);
    c.KDMapData = JSON.parse(snapshot);
    r.generate();
    assert.equal(c.KDMapData.Entities.length, 26);
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.minimaptext(), /1\/3/);
    for (const entity of [...c.KDMapData.Entities]) c.KDRemoveEntity(entity, true);
    c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), true);
    c.KDMapData = { MapMod: "None", Entities: [] };
    assert.equal(r.event("calcEscapeMethod", { escapeMethod: "Key" }).escapeMethod, "Key");
    assert.equal(r.event("beforeStairCancel", { toTile: "s", AdvanceAmount: 1 }).cancelevent, undefined);
    c.KDMapData = JSON.parse(snapshot);
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), false);
});

test("all seven locales provide the native modifier, objective and progress strings", () => {
    const r = runtime();
    for (const locale of ["CN", "DE", "ES", "JP", "KR", "PL", "RU"]) {
        const csv = fs.readFileSync(path.join(__dirname, `../../Spiderlings${locale}.csv`), "utf8");
        const entries = new Map(
            csv.split(/\r?\n/).map((line) => [line.slice(0, line.indexOf(",")), line.slice(line.indexOf(",") + 1)]),
        );
        for (const [name, fallback] of Object.entries(r.texts)) {
            assert.ok(entries.get(name), `${locale}: ${name}`);
            if (fallback.includes("CURRENT")) assert.ok(entries.get(name).includes("CURRENT"));
        }
    }
});

function rectangle(width, height) {
    const cells = [];
    for (let x = 1; x <= width; x += 1) {
        for (let y = 1; y <= height; y += 1) cells.push({ x, y });
    }
    return cells;
}

test("independent nest placement keeps all three attackable and outside mutual reinforcement range", () => {
    const cells = rectangle(30, 30);
    const passable = new Set(cells.map((p) => `${p.x},${p.y}`));
    const planner = runtime().context.Spiderlings.HuntingGrounds.planIndependentNestPlacement;
    for (const seed of [1, 8, 21]) {
        const plan = planner({
            start: { x: 1, y: 1 },
            passable,
            candidates: cells.filter((p) => p.x > 5 && p.y > 5),
            random: seededRandom(seed),
        });
        assert.equal(plan.length, 3);
        for (const nest of plan) {
            assert.ok(
                plan.every(
                    (other) => other === nest || Math.max(Math.abs(nest.x - other.x), Math.abs(nest.y - other.y)) >= 9,
                ),
            );
            assert.ok(plan.every((other) => other === nest || Math.hypot(nest.x - other.x, nest.y - other.y) > 5));
        }
        const reached = reachableCells({ x: 1, y: 1 }, passable, new Set(plan.map((p) => `${p.x},${p.y}`)));
        assert.equal(reached.size, passable.size - 3);
    }
    assert.equal(
        planner({
            start: { x: 1, y: 1 },
            passable,
            candidates: [
                { x: 10, y: 10 },
                { x: 20, y: 20 },
            ],
            random: () => 0,
        }),
        null,
    );
});

test("population and postMapgen never delete already born ordinary or protected NPCs", () => {
    const r = runtime(),
        c = r.context;
    c.KDMapData.MapFaction = "Maidforce";
    c.populationAction = () => {
        for (let i = 0; i < 8; i++) {
            const e = c.KinkyDungeonSummonEnemy(10 + i, 10, "MaidforceMini")[0];
            e.faction = "Maidforce";
        }
    };
    r.generate();
    const ids = c.KDMapData.Entities.map((e) => e.id),
        positions = c.KDMapData.Entities.map((e) => [e.x, e.y]);
    r.event("postMapgen");
    assert.deepEqual(
        c.KDMapData.Entities.map((e) => e.id),
        ids,
    );
    assert.deepEqual(
        c.KDMapData.Entities.map((e) => [e.x, e.y]),
        positions,
    );
});

test("a saved five-nest map retains its objective count and stair gate", () => {
    const r = runtime();
    r.generate();
    const c = r.context;
    const state = c.KDMapData.SpiderlingsHuntingGrounds;
    for (let index = 0; index < 2; index++)
        state.targetIds.push(c.KinkyDungeonSummonEnemy(2 + index, 2, "NestEntrance")[0].id);
    state.target = 5;
    delete state.garrisonVersion;
    c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.minimaptext(), /0\/5/);
    const nests = c.KDMapData.Entities.filter((e) => state.targetIds.includes(e.id));
    for (const nest of nests.slice(0, 4)) c.KDRemoveEntity(nest, true);
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.doortext(), /4\/5/);
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), false);
    c.KDRemoveEntity(nests[4], true);
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check(), true);
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.minimaptext(), /5\/5/);
});

// Independent removal-and-flood-fill oracle, retaining the original shuffle.
function floodFillPlacement(options) {
    const key = ({ x, y }) => `${x},${y}`;
    const near = ({ x, y }) => [
        { x: x - 1, y },
        { x: x + 1, y },
        { x, y: y - 1 },
        { x, y: y + 1 },
    ];
    const baseline = reachableCells(options.start, options.passable);
    const candidates = options.candidates.filter((point) => baseline.has(key(point)));
    for (let index = candidates.length - 1; index > 0; index -= 1) {
        const other = Math.min(index, Math.floor(Math.max(0, options.random()) * (index + 1)));
        [candidates[index], candidates[other]] = [candidates[other], candidates[index]];
    }
    const selected = [],
        blocked = new Set();
    for (const point of candidates) {
        if (
            selected.some(
                (placed) =>
                    Math.max(Math.abs(placed.x - point.x), Math.abs(placed.y - point.y)) < options.minimumDistance,
            )
        )
            continue;
        const proposed = new Set([...blocked, key(point)]);
        const reached = reachableCells(options.start, options.passable, proposed);
        if (reached.size !== baseline.size - proposed.size) continue;
        if ([...selected, point].some((nest) => !near(nest).some((cell) => reached.has(key(cell))))) continue;
        selected.push(point);
        blocked.add(key(point));
        if (selected.length === options.count) return selected;
    }
    return null;
}

function seededRandom(seed) {
    return () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 0x100000000;
}

test("cutpoint placement matches flood fill on every 3x3 topology and seeded larger maps", () => {
    const compare = (cells, candidates, start, seed, count, minimumDistance) => {
        const options = {
            start,
            candidates,
            passable: new Set(cells.map(({ x, y }) => `${x},${y}`)),
            count,
            minimumDistance,
        };
        const expectedRandom = seededRandom(seed),
            actualRandom = seededRandom(seed);
        assert.deepEqual(
            planNestPlacement({ ...options, random: actualRandom }),
            floodFillPlacement({ ...options, random: expectedRandom }),
            JSON.stringify({ cells, start, seed, count, minimumDistance }),
        );
        assert.equal(actualRandom(), expectedRandom(), "placement must consume the same random stream");
    };
    const small = rectangle(3, 3);
    for (let mask = 0; mask < 512; mask += 1) {
        const cells = small.filter((_, index) => mask & (1 << index));
        for (const start of cells) compare(cells, cells, start, mask, 3, 1);
    }
    for (let seed = 1; seed <= 250; seed += 1) {
        const random = seededRandom(seed);
        const cells = rectangle(12, 10).filter(() => random() > 0.25);
        const candidates = cells.filter(() => random() > 0.2);
        compare(cells, candidates, cells[seed % cells.length], seed, 1 + (seed % 5), 1 + (seed % 6));
    }
});

test("long corridors reject all interior nests without recursive stack growth", () => {
    const cells = rectangle(20000, 1);
    assert.equal(
        planNestPlacement({
            start: cells[0],
            candidates: cells.slice(1, -1),
            passable: new Set(cells.map(({ x, y }) => `${x},${y}`)),
            count: 1,
            minimumDistance: 1,
            random: seededRandom(42),
        }),
        null,
    );
});

test("stationary nests leave the walkable map connected and each nest attackable", () => {
    const candidates = rectangle(18, 18).filter((point) => point.x > 2 && point.y > 2);
    const passable = new Set(rectangle(20, 20).map(({ x, y }) => `${x},${y}`));
    const plan = planNestPlacement({
        start: { x: 1, y: 1 },
        passable,
        candidates,
        count: 4,
        minimumDistance: 6,
        random: () => 0.5,
    });
    assert.equal(plan.length, 4);
    const blocked = new Set(plan.map(({ x, y }) => `${x},${y}`));
    assert.equal(reachableCells({ x: 1, y: 1 }, passable, blocked).size, passable.size - 4);
    for (const point of plan) {
        assert.ok(
            plan
                .filter((other) => other !== point)
                .every((other) => Math.max(Math.abs(point.x - other.x), Math.abs(point.y - other.y)) >= 6),
        );
    }
});

test("a corridor choke or an unreachable room cannot supply a nest objective", () => {
    const corridor = rectangle(12, 1);
    const passable = new Set(corridor.map(({ x, y }) => `${x},${y}`));
    const plan = planNestPlacement({
        start: { x: 1, y: 1 },
        passable,
        candidates: corridor.filter((point) => point.x > 2 && point.x < 11),
        count: 1,
        minimumDistance: 1,
        random: () => 0,
    });
    assert.equal(plan, null);
    assert.equal(
        planNestPlacement({
            start: { x: 1, y: 1 },
            passable,
            candidates: [{ x: 30, y: 30 }],
            count: 1,
            minimumDistance: 1,
        }),
        null,
    );
});

test("insufficient space rejects the complete batch without accepting fewer targets", () => {
    const passable = new Set(rectangle(4, 4).map(({ x, y }) => `${x},${y}`));
    assert.equal(
        planNestPlacement({
            start: { x: 1, y: 1 },
            passable,
            candidates: [{ x: 3, y: 3 }],
            count: 2,
            minimumDistance: 1,
        }),
        null,
    );
});

function escapeRuntime() {
    const r = runtime({ KDRandom: () => 0.1 });
    r.generate();
    const c = r.context,
        nest = c.KDMapData.Entities[0],
        born = [];
    nest.SpiderlingsNestTunnelerCount = 3;
    const native = c.KinkyDungeonSummonEnemy;
    c.KinkyDungeonSummonEnemy = function (...args) {
        if (c.KDMapData.Entities.filter((e) => e.Enemy.name !== "NestEntrance" && e.hp > 0).length >= 25) return [];
        born.push(args[2]);
        return native.apply(this, args);
    };
    c.KDOndeath.summon = (enemy, o) => c.KinkyDungeonSummonEnemy(enemy.x, enemy.y, o.enemy, o.count, o.range);
    nest.Enemy.ondeath = [{ type: "summon", enemy: "Spinner", count: 1 }];
    const hit = (faction, damage) => {
        nest.hp -= damage;
        r.event("afterDamageEnemy", { enemy: nest, dmgDealt: damage, faction });
    };
    return { ...r, c, nest, born, hit };
}

test("maid lethal damage lets only an original task nest release one Tunneler before its normal burst", () => {
    const { c, nest, born, hit } = escapeRuntime();
    hit("Maidforce", 20);
    c.KDRemoveEntity(nest, true);
    assert.deepEqual(born, ["Tunneler"]);
    assert.equal(nest.SpiderlingsNestTunnelerCount, 3, "independent of the exhausted lifetime budget");
    assert.equal(nest.ondeath, undefined, "temporary death entry is restored");
    c.KDRemoveEntity(nest, true);
    assert.equal(born.filter((n) => n === "Tunneler").length, 1);
});

test("task nest evacuation respects the map cap and reserves the last slot before ordinary death summons", () => {
    for (const count of [0, 1]) {
        const { c, nest, born, hit } = escapeRuntime();
        for (let i = 0; i < count; i++) c.KDMapData.Entities.push({ id: 100 + i, hp: 1, Enemy: { name: "Spinner" } });
        hit("Maidforce", 20);
        c.KDRemoveEntity(nest, true);
        assert.deepEqual(born, count === 0 ? ["Tunneler"] : []);
    }
});

test("the final objective evacuates before the task becomes complete", () => {
    const { c, nest, born, hit } = escapeRuntime();
    const state = c.KDMapData.SpiderlingsHuntingGrounds;
    state.destroyedIds = state.targetIds.filter((id) => id !== nest.id);
    hit("Maidforce", 20);
    c.KDRemoveEntity(nest, true);
    assert.equal(born[0], "Tunneler");
    assert.equal(state.destroyedIds.length, 3);
    assert.equal(state.complete, true);
});

test("ordinary nests, non-maid finishers, cancellation and non-kill removals do not evacuate", () => {
    for (const reason of ["ordinary", "player", "other", "nonlethal", "cancel", "remove", "dead-hit"]) {
        const { c, nest, born, hit } = escapeRuntime();
        if (reason === "ordinary") c.KDMapData.SpiderlingsHuntingGrounds.targetIds.shift();
        if (reason === "nonlethal") {
            hit("Maidforce", 2);
            hit("Player", 20);
        } else if (reason === "dead-hit") {
            hit("Player", 20);
            hit("Maidforce", 1);
        } else hit(reason === "player" ? "Player" : reason === "other" ? "Bandit" : "Maidforce", 20);
        if (reason === "cancel") c.cancelRemoval = true;
        c.KDRemoveEntity(nest, reason !== "remove");
        assert.equal(born.includes("Tunneler"), false, reason);
        assert.equal(nest.ondeath, undefined, reason);
        if (reason === "cancel") {
            c.cancelRemoval = false;
            c.KDRemoveEntity(nest, true);
            assert.equal(born[0], "Tunneler");
        }
    }
});

test("clearing opens ring terrain and its walking margin, preserving objects and protected cells", () => {
    const planner = runtime().context.Spiderlings.HuntingGrounds.planNestClearing;
    const ring = [
        { x: 10, y: 8 },
        { x: 12, y: 9 },
        { x: 11, y: 12 },
        { x: 9, y: 12 },
        { x: 8, y: 9 },
    ];
    const tiles = new Map([
        ["7,7", "s"],
        ["8,7", "C"],
        ["9,7", "D"],
        ["10,7", "6"],
    ]);
    const meta = new Map([
        ["11,7", { OL: true }],
        ["12,7", { Lock: "Red" }],
        ["13,7", { Type: "Shrine" }],
    ]);
    const cells = planner(ring, {
        width: 30,
        height: 30,
        tile: (x, y) => tiles.get(`${x},${y}`) || "1",
        meta: (x, y) => meta.get(`${x},${y}`),
        protected: (x, y) => x === 7 && y === 8,
    });
    const keys = new Set(cells.map((p) => `${p.x},${p.y}`));
    assert.equal(cells.length, 49 - 8);
    assert.ok(keys.has("10,10"), "the ring center opens");
    assert.ok(keys.has("13,13"), "one-tile outer walkway opens");
    for (const key of [...tiles.keys(), ...meta.keys(), "7,8", "6,8", "14,8"]) assert.ok(!keys.has(key), key);
    assert.equal(
        planner([{ x: 1, y: 1 }], { width: 4, height: 4, tile: () => "1", meta: () => undefined }).length,
        4,
        "never carve the exterior border",
    );
});

test("terrain opens only after all nests are created, refreshes navigation, and never repeats on revisit", () => {
    let wall,
        writes = 0,
        nav = 0;
    const r = runtime({
        KinkyDungeonMapGet: (x, y) => (wall && x === wall.x && y === wall.y ? "1" : "0"),
        KinkyDungeonMapSet: () => {
            writes++;
        },
        KinkyDungeonGenNavMap: () => nav++,
    });
    const c = r.context;
    const native = c.KinkyDungeonSummonEnemy;
    c.KinkyDungeonSummonEnemy = function (...args) {
        const born = native.apply(this, args);
        if (
            args[2] === "NestEntrance" &&
            c.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance").length === 3
        ) {
            wall = { x: born[0].x + 3, y: born[0].y };
        }
        return born;
    };
    r.generate();
    const state = c.KDMapData.SpiderlingsHuntingGrounds;
    assert.equal(state.clearing.length, 3);
    assert.equal(writes, 1, "the clearing is actually carved");
    assert.equal(nav, 1);
    const count = writes;
    r.generate();
    assert.equal(writes, count);
    let failedWrites = 0;
    const failed = runtime({ KinkyDungeonSummonEnemy: () => [], KinkyDungeonMapSet: () => failedWrites++ });
    failed.generate();
    assert.equal(failed.context.KDMapData.SpiderlingsHuntingGrounds.status, "cancelled");
    assert.equal(failedWrites, 0);
});

test("quiet floors retain living spiders and invested crews through long waits and serialization", () => {
    const r = runtime();
    r.generate();
    const c = r.context,
        before = c.KDMapData.Entities.map((e) => e.id);
    for (let turn = 0; turn < 300; turn++)
        for (const trigger of ["tick", "tickAfter"])
            c.KDEventMapGeneric[trigger]?.[c.KDMapData.MapMod]?.({}, { delta: 1 });
    assert.deepEqual(
        c.KDMapData.Entities.map((e) => e.id),
        before,
    );
    c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
    for (let turn = 0; turn < 30; turn++) c.KDEventMapGeneric.tickAfter?.[c.KDMapData.MapMod]?.({}, { delta: 1 });
    assert.deepEqual(
        c.KDMapData.Entities.map((e) => e.id),
        before,
    );
    assert.equal(c.KDEventMapGeneric.tickAfter?.[c.KDMapData.MapMod], undefined);
});

test("clearing cannot open a wall around a locked room, including diagonal access", () => {
    const planner = runtime().context.Spiderlings.HuntingGrounds.planNestClearing;
    const ring = [
        { x: 5, y: 4 },
        { x: 7, y: 5 },
        { x: 6, y: 8 },
        { x: 4, y: 8 },
        { x: 3, y: 5 },
    ];
    // Sealed room starts at x=9. Its wall at x=8 lies in the clearing margin.
    const cells = planner(ring, {
        width: 16,
        height: 16,
        tile: (x, _y) => (x === 8 ? "1" : "0"),
        meta: () => undefined,
        accessible: new Set(rectangle(7, 14).map((p) => `${p.x},${p.y}`)),
        interactable: "0",
    });
    assert.ok(!cells.some((p) => p.x === 8), "keep walls bordering unreachable floor");
    const diagonal = planner([{ x: 7, y: 5 }], {
        width: 16,
        height: 16,
        tile: (x, y) => (x === 9 && y === 7 ? "0" : "1"),
        meta: () => undefined,
        accessible: new Set(),
        interactable: "0",
    });
    assert.ok(!diagonal.some((p) => p.x === 8 && p.y === 6), "KD can step diagonally into the room");
    assert.ok(
        diagonal.some((p) => p.x === 6 && p.y === 4),
        "ordinary unrelated walls still open",
    );
});

test("debug stair bypass releases both exit gates without changing objective progress", () => {
    const callbacks = {};
    const r = runtime({
        DrawButtonKDEx(name, callback) {
            callbacks[name] = callback;
        },
    });
    r.generate();
    const c = r.context;
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsFloorSelection.js"), "utf8"), c);
    const state = JSON.stringify(c.KDMapData),
        objective = c.KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds;
    assert.equal(objective.check(), false);
    assert.equal(
        r.event("beforeStairCancel", { toTile: "s", AdvanceAmount: 1 }).cancelevent,
        "SpiderlingsHuntingGrounds",
    );
    const originalPosition = { x: c.KinkyDungeonPlayerEntity.x, y: c.KinkyDungeonPlayerEntity.y };
    c.DrawButtonKDEx("debugtelestairs", () => {
        Object.assign(c.KinkyDungeonPlayerEntity, c.KDMapData.EndPosition);
        return true;
    });
    callbacks.debugtelestairs();
    Object.assign(c.KinkyDungeonPlayerEntity, originalPosition);
    assert.equal(objective.check(), true);
    assert.equal(r.event("beforeStairCancel", { toTile: "s", AdvanceAmount: 1 }).cancelevent, undefined);
    assert.match(objective.doortext(), /bypass is on/);
    delete c.KDMapData.SpiderlingsDebugStairBypass;
    assert.equal(JSON.stringify(c.KDMapData), state);
    assert.equal(objective.check(), false);
});

test("first boss floors stay ineligible and generic prey keeps its birth positions without moving authored actors", () => {
    for (const floor of [1, 2, 3, 4]) {
        const r = runtime();
        r.generate(undefined, floor);
        assert.equal(r.context.KDMapData.MapMod, "None");
    }
    const r = runtime(),
        c = r.context;
    c.KDMapData.MapFaction = "Maidforce";
    let preset;
    const prey = [];
    c.populationAction = () => {
        preset = c.KinkyDungeonSummonEnemy(20, 20, "MaidforceMini")[0];
        preset.faction = "Maidforce";
        for (let i = 0; i < 3; i++) {
            const e = c.KinkyDungeonSummonEnemy(10 + i, 10, "MaidforceMini")[0];
            e.faction = "Maidforce";
            prey.push(e);
        }
    };
    c.KinkyDungeonPlaceEnemies([{ x: 20, y: 20, force: true }], false, [], {}, 5, 30, 30, {}, []);
    assert.deepEqual([preset.x, preset.y], [20, 20]);
    assert.deepEqual(
        prey.map((e) => [e.x, e.y]),
        [
            [10, 10],
            [11, 10],
            [12, 10],
        ],
    );
    const positions = prey.map((e) => [e.x, e.y]);
    r.event("postMapgen");
    assert.deepEqual(
        prey.map((e) => [e.x, e.y]),
        positions,
    );
});

test("birth quota selects native mobile definitions before spawning and preserves explicit enemy templates", () => {
    const enemies = [
        { name: "Spinner", faction: "Spider", tags: { spiderlings: true } },
        { name: "Bandit", faction: "Bandit", tags: {} },
        { name: "QuestNPC", faction: "Bandit", tags: {} },
    ];
    const r = runtime({
        KinkyDungeonEnemies: enemies,
        KinkyDungeonGetEnemy: (...args) =>
            args[7]?.includes("SpiderlingsHuntingGroundsPreset")
                ? enemies[2]
                : args[4]?.includes("SpiderlingsFloorMobile")
                  ? enemies[0]
                  : enemies[1],
    });
    const c = r.context;
    c.populationAction = (points) => {
        for (const point of points) {
            const chosen = c.KinkyDungeonGetEnemy([], 5, "grv", "0", undefined, undefined, undefined, point.ftags);
            const actor = c.KinkyDungeonSummonEnemy(point.x, point.y, chosen.name)[0];
            actor.Enemy = chosen;
        }
        for (let attempt = 0; attempt < 30; attempt++) {
            const chosen = c.KinkyDungeonGetEnemy([], 5, "grv", "0");
            if (!chosen) continue;
            const actor = c.KinkyDungeonSummonEnemy(20, 20, chosen.name)[0];
            actor.Enemy = chosen;
        }
    };
    c.KinkyDungeonPlaceEnemies([{ x: 25, y: 25, forceIndex: 0 }], false, [], {}, 5, 30, 30, {}, []);
    const counts = c.Spiderlings.HuntingGrounds.populationCounts();
    assert.equal(counts.total, 29);
    assert.equal(counts.spiders, 25);
    assert.equal(c.KDMapData.Entities.find((actor) => actor.x === 25 && actor.y === 25).Enemy.name, "QuestNPC");
    assert.equal(enemies[1].clusterWith, undefined);
});

test("ecology budget excludes scenery, owned field cells, shops and subordinate definitions", () => {
    const r = runtime({
        Spiderlings: {
            EncounterRules: require("../../SpiderlingsEncounters.js").EncounterRules,
            SpinnerNativeField: { isOwnedProxy: (entity) => entity.proxy },
        },
        KDIsInParty: (entity) => entity.party,
        KDIsImprisoned: (entity) => entity.prisoner,
        KDAllied: (entity) => entity.allied,
    });
    const c = r.context;
    c.KDMapData.Entities = [
        { hp: 1, Enemy: { name: "Spinner" } },
        { hp: 1, Enemy: { name: "Bandit" } },
        ...[{ immobile: true }, { master: "Bandit" }, { noAttack: true }, { tags: { scenery: true } }].map(
            (definition) => ({ hp: 1, Enemy: { name: "Excluded", ...definition } }),
        ),
        ...[{ proxy: true }, { party: true }, { prisoner: true }, { allied: true }, { flags: { Shop: true } }].map(
            (actor) => ({ hp: 1, Enemy: { name: "Excluded" }, ...actor }),
        ),
    ];
    assert.deepEqual(JSON.parse(JSON.stringify(c.Spiderlings.HuntingGrounds.populationCounts())), {
        spiders: 1,
        rivals: 1,
        total: 2,
    });
});

test("six-member roster assigns two guards from the same core and refills only missing native roles", () => {
    const r = runtime();
    r.generate();
    const c = r.context;
    const nest = c.KDMapData.Entities.find((entity) => entity.Enemy.name === "NestEntrance");
    const children = c.KDMapData.Entities.filter((entity) => entity.SpiderlingsNestParentID === nest.id);
    assert.equal(children.length, 6);
    assert.equal(children.filter((entity) => entity.SpiderlingsHuntRole === "guard").length, 2);
    assert.equal(children.filter((entity) => entity.SpiderlingsHuntRole === "builder").length, 2);
    assert.equal(c.Spiderlings.Population.missingRoles(nest).length, 0);
    const lost = children.find((entity) => entity.SpiderlingsHuntRole === "guard" && entity.Enemy.name === "WebCaster");
    lost.hp = 0;
    assert.deepEqual(
        Array.from(c.Spiderlings.Population.missingRoles(nest), (slot) => slot.name),
        ["WebCaster"],
    );
    const role = c.Spiderlings.Population.missingRoles(nest)[0];
    const replacement = c.KinkyDungeonSummonEnemy(nest.x + 1, nest.y, "WebCaster")[0];
    replacement.SpiderlingsNestParentID = nest.id;
    replacement.SpiderlingsHuntRole = role.role;
    assert.equal(replacement.SpiderlingsHuntRole, "guard");
    assert.equal(c.Spiderlings.Population.missingRoles(nest).length, 0);
});

test("a low saved map cap cancels a new floor before spawning or splitting its mandatory crews", () => {
    const r = runtime({
        Spiderlings: {
            EncounterRules: require("../../SpiderlingsEncounters.js").EncounterRules,
            getSetting: () => 17,
        },
    });
    r.generate();
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds.reason, "population-budget");
    assert.equal(r.context.KDMapData.Entities.length, 0);
    assert.equal(r.context.KDMapData.SpiderlingsPopulationPlan, undefined);
});

test("guards clear old prey routes and hunters investigate only an alerted nest after losing native perception", () => {
    const r = runtime({ KinkyDungeonCurrentTick: 10, KDHostile: () => true });
    r.generate();
    const c = r.context,
        h = c.Spiderlings.HuntingGrounds;
    const nest = c.KDMapData.Entities.find((entity) => entity.Enemy.name === "NestEntrance");
    const guard = c.KDMapData.Entities.find(
        (entity) => entity.SpiderlingsNestParentID === nest.id && entity.SpiderlingsHuntRole === "guard",
    );
    const hunter = c.KDMapData.Entities.find(
        (entity) => entity.SpiderlingsNestParentID === nest.id && entity.SpiderlingsHuntRole === "hunter",
    );
    const builder = c.KDMapData.Entities.find(
        (entity) => entity.SpiderlingsNestParentID === nest.id && entity.SpiderlingsHuntRole === "builder",
    );
    const attacker = c.KinkyDungeonSummonEnemy(nest.x + 3, nest.y, "Bandit")[0];
    for (const actor of [guard, hunter, builder])
        Object.assign(actor, { x: nest.x + 4, y: nest.y, gx: 29, gy: 29, path: [{ x: 29, y: 29 }] });
    c.KinkyDungeonCheckLOS = () => false;
    r.event("afterDamageEnemy", { enemy: nest, attacker, dmgDealt: 1 });
    const player = { player: true, x: 1, y: 1 };
    for (const actor of [guard, hunter, builder]) h.resolveNestDefenderTarget(actor, player, 1);
    assert.equal(h.seekCrewDuty(hunter, player), true);
    assert.deepEqual([hunter.gx, hunter.gy], [nest.x, nest.y]);
    assert.equal(hunter.path, undefined);
    assert.equal(h.seekCrewDuty(builder, player), false, "unseen contacts leave paid construction duties intact");
    assert.equal(hunter.target, undefined, "an alarm does not reveal the attacker's live position");
    c.KinkyDungeonCurrentTick = 15;
    h.resolveNestDefenderTarget(hunter, player, 1);
    assert.equal(h.seekCrewDuty(hunter, player), false, "the search lease expires");
    assert.equal(h.seekCrewDuty(guard, player), true);
    assert.equal(guard.path, undefined);
});

test("a flank uses native movement credit and respects occupied cells and zero-time events", () => {
    const r = runtime({
        KDHostile: () => true,
        KinkyDungeonMovableTilesEnemy: "0",
        KinkyDungeonFindPath: (_x, _y, x, y) => [{ x, y }],
        KinkyDungeonEnemyTryMove: () => false,
    });
    const c = r.context,
        h = c.Spiderlings.HuntingGrounds;
    const actor = {
        id: 1,
        hp: 5,
        x: 4,
        y: 4,
        Enemy: { name: "Jumper" },
        SpiderlingsHuntRole: "hunter",
        SpiderlingsSpinnerRuntimeDelta: 0,
    };
    const target = { id: 2, hp: 5, x: 10, y: 10, Enemy: { name: "Bandit" } };
    c.KDMapData.Entities = [actor, target];
    let attempts = 0;
    c.KinkyDungeonEnemyTryMove = (_actor, _direction, delta) => {
        assert.equal(delta, 1);
        attempts++;
        return false;
    };
    assert.equal(h.handleCrewMove(actor, target, { canSensePlayer: true }), false);
    assert.equal(attempts, 0);
    actor.SpiderlingsSpinnerRuntimeDelta = 1;
    assert.equal(h.handleCrewMove(actor, target, { canSensePlayer: true }), true);
    assert.equal(attempts, 1);
    assert.deepEqual([actor.x, actor.y], [4, 4]);
    for (let dx = -1; dx <= 1; dx++)
        for (let dy = -1; dy <= 1; dy++)
            if (dx || dy) c.KDMapData.Entities.push({ hp: 1, x: 10 + dx, y: 10 + dy, Enemy: { name: "Occupied" } });
    attempts = 0;
    assert.equal(h.handleCrewMove(actor, target, { canSensePlayer: true }), false);
    assert.equal(attempts, 0);
});

test("maid-finished task nests pay one 25 percent roll before spatial retries on both floors", () => {
    for (const mod of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"])
        for (const roll of [0.249, 0.25]) {
            const r = runtime({ KDRandom: () => 0.5 }, [], true);
            const c = r.context;
            c.KDMapData.MapMod = c.KDGameData.MapMod = mod;
            r.generate();
            const nest = c.KDMapData.Entities.find((entity) => c.KDMapData[mod].targetIds.includes(entity.id));
            let rolls = 0,
                retries = 0;
            c.KDRandom = () => {
                rolls++;
                return roll;
            };
            c.KinkyDungeonSummonEnemy = () => {
                retries++;
                return [];
            };
            nest.hp = -1;
            for (const handler of Object.values(c.KDEventMapGeneric.afterDamageEnemy))
                handler({}, { enemy: nest, dmgDealt: 20, faction: "Maidforce" });
            c.KDRemoveEntity(nest, true);
            assert.equal(rolls, 1, mod);
            assert.equal(retries, roll < 0.25 ? 3 : 0, mod);
        }
});

test("native slow movement retains exactly one turn of credit while a crew flank waits", () => {
    const game = require("../reference-inputs.js").gamePath("Game/src");
    const enemies = fs.readFileSync(path.join(game, "enemy/KinkyDungeonEnemies.ts"), "utf8");
    const nativeMove = enemies.match(/function KinkyDungeonEnemyTryMove[\s\S]*?\r?\n}/)?.[0];
    assert.ok(nativeMove, "the regression uses the pinned native move-credit implementation");
    for (const [movePoints, bind, slow, gain] of [
        [2, 0, 0, 1],
        [3, 0, 0, 1],
        [2, 1, 0, 0.1],
        [2, 0, 1, 0.5],
    ]) {
        const r = runtime(
            {
                KDHostile: () => true,
                KinkyDungeonMovableTilesEnemy: "0",
                KinkyDungeonFindPath: (x, y) => [{ x: x + 1, y }],
                KinkyDungeonGetBuffedStat: () => 0,
                KDBoundEffects: () => 0,
                KinkyDungeonLeashingEnemy: () => undefined,
                KinkyDungeonEnemyAt: () => undefined,
                KinkyDungeonEntityAt: () => undefined,
                KDMoveEntity: (actor, x, y) => {
                    actor.x = x;
                    actor.y = y;
                },
            },
            [nativeMove],
        );
        const c = r.context;
        c.KDGameData.SleepTurns = 0;
        const actor = {
            id: 1,
            hp: 5,
            x: 4,
            y: 4,
            bind,
            slow,
            movePoints: 0,
            Enemy: { name: "WebCaster", movePoints, tags: {} },
            SpiderlingsHuntRole: "hunter",
            SpiderlingsSpinnerRuntimeDelta: 1,
        };
        const target = { id: 2, hp: 5, x: 10, y: 10, Enemy: { name: "Bandit" } };
        c.KDMapData.Entities = [actor, target];
        const aiData = { canSensePlayer: true, idle: true };
        assert.equal(c.Spiderlings.HuntingGrounds.handleCrewMove(actor, target, aiData), true);
        assert.deepEqual([actor.x, actor.y], [4, 4]);
        assert.equal(actor.movePoints, gain);
        assert.equal(aiData.idle, false, "native end-of-loop cleanup must retain the paid credit");
        assert.equal(aiData.moved, undefined);
    }
});

test("initial ecology reserves one dispersed neutral maid without turning it hostile or respawning it later", () => {
    const enemies = [
        { name: "Spinner", faction: "Spider", tags: { spiderlings: true } },
        { name: "MaidforceMini", faction: "Maidforce", tags: { human: true, maid: true } },
        { name: "Bandit", faction: "Bandit", tags: {} },
    ];
    const r = runtime({
        KinkyDungeonEnemies: enemies,
        KDHostile: (entity) => entity.Enemy.faction !== "Maidforce",
        KinkyDungeonGetEnemy: (...args) =>
            args[4]?.includes("SpiderlingsHuntingGroundsMaid")
                ? enemies[1]
                : args[4]?.includes("SpiderlingsFloorMobile")
                  ? enemies[0]
                  : enemies[2],
        KinkyDungeonHandleWanderingSpawns: function () {
            return this.KinkyDungeonGetEnemy([], 5, "grv", "0");
        },
    });
    const c = r.context;
    c.populationAction = () => {
        for (let attempt = 0; attempt < 30; attempt++) {
            const chosen = c.KinkyDungeonGetEnemy([], 5, "grv", "0");
            if (!chosen) continue;
            const actor = c.KinkyDungeonSummonEnemy(20, 20, chosen.name)[0];
            actor.Enemy = chosen;
        }
    };
    r.generate();
    const maids = c.KDMapData.Entities.filter((e) => e.Enemy.faction === "Maidforce");
    assert.equal(maids.length, 1);
    assert.equal(c.KDHostile(maids[0]), false);
    assert.equal(c.KDMapData.SpiderlingsPopulationPlan.extraMaid, true);
    assert.equal(c.KDMapData.SpiderlingsPopulationPlan.ecologyBudget, 30);
    assert.equal(c.Spiderlings.HuntingGrounds.populationCounts().total, 30);
    maids[0].hp = 0;
    assert.notEqual(c.KinkyDungeonHandleWanderingSpawns()?.faction, "Maidforce");
});

test("native kite, runAway and valid ranged firing duties take priority over a flank", () => {
    const r = runtime({ KDHostile: () => true, KDEnemyHasFlag: (actor, flag) => actor.flags?.[flag] });
    const h = r.context.Spiderlings.HuntingGrounds,
        actor = {
            id: 1,
            hp: 5,
            x: 4,
            y: 4,
            Enemy: { name: "MageSpiderlings", followRange: 3 },
            SpiderlingsHuntRole: "hunter",
            SpiderlingsSpinnerRuntimeDelta: 1,
        },
        prey = { id: 2, hp: 5, x: 10, y: 10, Enemy: { name: "Bandit" } };
    r.context.KDMapData.Entities = [actor, prey];
    for (const data of [
        { canSensePlayer: true, kite: true },
        { canSensePlayer: true, canShootPlayer: true, wantsToAttack: true },
    ])
        assert.equal(h.handleCrewMove(actor, prey, data), false);
    actor.flags = { runAway: 10 };
    assert.equal(h.handleCrewMove(actor, prey, { canSensePlayer: true }), false);
    delete actor.flags;
    prey.x = 7;
    prey.y = 4;
    assert.equal(h.handleCrewMove(actor, prey, { canSensePlayer: true, followRange: 3 }), false);
});

test("native generic rank boxes cannot exceed the prey budget with a boss's dependent summon batch", () => {
    const r = nativePopulationRuntime(),
        c = r.context,
        h = c.Spiderlings.HuntingGrounds;
    const batch = {
        name: "BatchBoss",
        faction: "Witch",
        tags: { boss: true, human: true },
        allFloors: true,
        minLevel: 0,
        weight: 1000,
        summon: [{ enemy: "TickleHandSlave", count: 3, range: 2.5, strict: true }],
    };
    c.KinkyDungeonEnemies.push(batch);
    h.register();
    for (let id = 1; id <= 24; id++) c.KDMapData.Entities.push({ id, hp: 1, Enemy: { name: "Spinner" } });
    c.KDMapData.Entities.push({ id: 25, hp: 1, Enemy: { name: "Maidforce", faction: "Maidforce" } });
    c.Spiderlings.Population.prepareFloor("SpiderlingsHuntingGrounds");
    for (let roll = 0; roll < 50; roll++) {
        const selected = r.select([], 10, "grv", "0", ["boss"]);
        assert.ok(selected);
        assert.notEqual(selected.name, "BatchBoss");
        assert.equal(!!selected.master, false);
        assert.equal(!!selected.summon?.some((entry) => entry.count > 0), false);
    }
    assert.equal(batch.tags.SpiderlingsFloorBatch, true);
});

test("generic template births respect field reservation while explicit authored templates retain their point", () => {
    const r = runtime({
            Spiderlings: {
                EncounterRules: require("../../SpiderlingsEncounters.js").EncounterRules,
                HuntingGroundsLayout: {
                    earlyPlan: () => undefined,
                    release: () => {},
                    isPopulationReserved: (_map, point) => point.x === 25,
                },
            },
        }),
        c = r.context,
        points = [
            { x: 25, y: 25, required: [] },
            { x: 25, y: 24, forceIndex: 0 },
            { x: 18, y: 18 },
        ];
    let actual;
    c.KDMapData.SpiderlingsHuntingGrounds = { status: "active", targetIds: [], garrisonVersion: 3 };
    c.Spiderlings.Population.prepareFloor("SpiderlingsHuntingGrounds");
    c.populationAction = (spawnPoints) => {
        actual = spawnPoints;
    };
    c.KinkyDungeonPlaceEnemies(points, false, [], {}, 5, 30, 30, {}, []);
    assert.equal(actual.length, 2);
    assert.equal(
        actual.some((point) => point.x === 25 && point.y === 25),
        false,
    );
    assert.equal(
        actual.some((point) => point.forceIndex === 0),
        true,
    );
    assert.equal(points.length, 3, "caller-owned authored inputs are unchanged");
});
