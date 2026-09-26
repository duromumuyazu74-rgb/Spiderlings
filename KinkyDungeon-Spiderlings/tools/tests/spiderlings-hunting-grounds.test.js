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
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsFloorSelection.js"), "utf8"), context);
    if (withOld) vm.runInContext(oldSource, context);
    vm.runInContext(source, context);
    return {
        context,
        messages,
        population,
        texts,
        generate(room, floor = 3) {
            return context.KinkyDungeonPlaceEnemies([], false, [], {}, floor, 30, 30, room, []);
        },
        event(trigger, data = {}) {
            context.KDEventMapGeneric[trigger].SpiderlingsHuntingGrounds({}, data);
            return data;
        },
    };
}

test("old Infestation and Hunting Grounds register independently in one Mod", () => {
    const r = runtime({}, [], true);
    assert.equal(r.context.KDMapMods.SpiderlingsInfestation.weight, 50);
    assert.equal(r.context.KDMapMods.SpiderlingsHuntingGrounds.weight, 750);
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
        "0,3": { y: 3, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation", visited: true },
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
        "2,3": { y: 3, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation", visited: true },
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

test("native modifier adds three independent nests and twelve attributable guards", () => {
    const r = runtime();
    const mod = r.context.KDMapMods.SpiderlingsHuntingGrounds;
    assert.equal(mod.weight, 750);
    assert.equal(mod.faction, undefined);
    assert.equal(mod.filter({ y: 2 }), 0);
    assert.equal(mod.filter({ y: 3 }), 0);
    assert.equal(mod.filter({ y: 3, Faction: "Maidforce" }), 1);
    assert.equal(mod.filter({ y: 3, RoomType: "PerkRoom" }), 0);
    assert.equal(r.generate(), "native-result");
    assert.equal(r.context.KDMapData.Entities.length, 15);
    const nests = r.context.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance");
    assert.equal(nests.length, 3);
    assert.equal(new Set(r.context.KDMapData.Entities.map((e) => `${e.x},${e.y}`)).size, 15);
    assert.equal(r.context.KDMapData.SpiderlingsHuntingGrounds.garrisonVersion, 2);
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
            ["MageSpiderlings", "Spinner", "Spinner", "WebCaster"],
        );
        assert.equal(nest.flags.no_pers_wander, -1);
        assert.equal(nest.flags.questtarget, -1);
    }
    assert.equal(r.population[0][7], undefined, "keep the native population budget");
    r.generate();
    r.event("postMapgen");
    assert.equal(r.context.KDMapData.Entities.length, 15);
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
    assert.equal(c.Spiderlings.HuntingGrounds.resolveNestDefenderTarget(guard, original), original);
    r.event("afterDamageEnemy", { enemy: nest, attacker: maid, dmgDealt: 1, aggro: true });
    assert.equal(c.Spiderlings.HuntingGrounds.resolveNestDefenderTarget(guard, original), maid);
    c.KinkyDungeonCurrentTick = 15;
    assert.equal(c.Spiderlings.HuntingGrounds.resolveNestDefenderTarget(guard, original), original);
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

test("native journey rejects a cached infestation below floor three and preserves the maid modifier", () => {
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
        KDJourneySlotTypes.basic(null, 0, 3, "grv");
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
        assert.equal(c.KDMapMods.SpiderlingsInfestation.weight, 50, bad);
        assert.equal(c.KDMapMods.SpiderlingsHuntingGrounds.weight, 750, bad);
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
            assert.ok(slot.y >= 3, `attempt ${attempt}, floor ${slot.y}`);
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
        eligible: { y: 3, MapMod: "SpiderlingsHuntingGrounds", EscapeMethod: "SpiderlingsHuntingGrounds" },
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
    assert.equal(r.context.KDMapData.Entities.length, 15);
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
            MiniGameKinkyDungeonLevel: 3,
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

test("maid population contains only Spiderlings, maids and a small Dressmaker/Nurse minority", () => {
    const r = nativePopulationRuntime();
    const c = r.context;
    for (const level of [3, 10, 30]) {
        const counts = { Spider: 0, Maid: 0, Dressmaker: 0, Nurse: 0 };
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
            assert.ok(group, enemy.name);
            counts[group]++;
        }
        assert.ok(
            counts.Spider > 0 && counts.Maid > 0 && counts.Dressmaker > 0 && counts.Nurse > 0,
            JSON.stringify(counts),
        );
        const humans = counts.Maid + counts.Dressmaker + counts.Nurse;
        assert.ok(counts.Spider > humans * 10, JSON.stringify({ level, counts }));
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
                faction === "Maidforce" ? undefined : "Unrelated",
                `${faction}/${mod} initial pool`,
            );
            assert.equal(filters.includes("minor"), faction !== "Maidforce", `${faction}/${mod} ordinary slots`);
            assert.equal(
                c.KinkyDungeonHandleWanderingSpawns(...pickArgs)?.name,
                faction === "Maidforce" ? undefined : "Unrelated",
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
    assert.equal(c.KinkyDungeonHandleWanderingSpawns(...pickArgs), undefined);
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
    assert.equal(c.KinkyDungeonPlaceEnemies(points, false, [], {}, 3, 30, 30, undefined, []).name, "Unrelated");
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
        else r.generate(undefined, scenario === "early" ? 2 : 3);
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

test("fifteen-place capacity is atomic and a failed final Mage preserves existing actors", () => {
    for (const existing of [285, 286]) {
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
        assert.equal(c.Spiderlings.HuntingGrounds.activeState() !== null, existing === 285);
        assert.equal(c.KDMapData.Entities.length, existing + (existing === 285 ? 15 : 0));
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
    assert.equal(c.KDMapData.Entities.length, 14);
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

test("infestation has at most three initial rivals and no wandering rivals", () => {
    let c, shop, scripted;
    const r = runtime({
        KinkyDungeonHandleWanderingSpawns() {
            for (let i = 0; i < 2; i++) c.KinkyDungeonSummonEnemy(5 + i, 5, "MaidforceMini")[0].faction = "Maidforce";
        },
    });
    c = r.context;
    c.KDMapData.MapFaction = "Maidforce";
    c.populationAction = () => {
        c.KinkyDungeonSummonEnemy(20, 20, "MaidforceMini")[0].faction = "Maidforce";
        for (let i = 0; i < 6; i++) c.KinkyDungeonSummonEnemy(10 + i, 10, "MaidforceMini")[0].faction = "Maidforce";
        shop = c.KinkyDungeonSummonEnemy(18, 10, "MaidforceMini")[0];
        shop.faction = "Maidforce";
        shop.flags = { Shop: -1 };
        scripted = c.KinkyDungeonSummonEnemy(19, 10, "MaidforceMini")[0];
        scripted.faction = "Maidforce";
        scripted.runSpawnAI = true;
    };
    c.KinkyDungeonPlaceEnemies([{ x: 20, y: 20 }], false, [], {}, 3, 30, 30, {}, []);
    assert.equal(c.KDMapData.Entities.filter((e) => e.faction === "Maidforce").length, 6);
    assert.ok(c.KDMapData.Entities.includes(shop) && c.KDMapData.Entities.includes(scripted));
    r.event("postMapgen");
    assert.equal(c.KDMapData.Entities.filter((e) => e.faction === "Maidforce").length, 6);
    c.KinkyDungeonHandleWanderingSpawns();
    assert.equal(c.KDMapData.Entities.filter((e) => e.faction === "Maidforce").length, 6);
    const ordinary = runtime();
    ordinary.context.KDMapData.MapMod = "None";
    ordinary.context.KDMapData.MapFaction = "Maidforce";
    ordinary.context.populationAction = () => {
        for (let i = 0; i < 6; i++)
            ordinary.context.KinkyDungeonSummonEnemy(10 + i, 10, "MaidforceMini")[0].faction = "Maidforce";
    };
    ordinary.generate();
    assert.equal(ordinary.context.KDMapData.Entities.filter((e) => e.faction === "Maidforce").length, 6);
});

test("postMapgen keeps preset maid guards even when they follow three random patrols", () => {
    const r = runtime(),
        c = r.context;
    c.KDMapData.MapFaction = "Maidforce";
    let preset;
    c.populationAction = () => {
        for (let i = 0; i < 5; i++) c.KinkyDungeonSummonEnemy(10 + i, 10, "MaidforceMini")[0].faction = "Maidforce";
        preset = c.KinkyDungeonSummonEnemy(20, 20, "MaidforceMini")[0];
        preset.faction = "Maidforce";
        preset.runSpawnAI = false;
    };
    c.KinkyDungeonPlaceEnemies([{ x: 20, y: 20, AI: "guard", force: true }], false, [], {}, 3, 30, 30, {}, []);
    r.event("postMapgen");
    assert.ok(c.KDMapData.Entities.includes(preset), "native preset is not a random patrol");
    assert.equal(c.KDMapData.Entities.filter((e) => e.faction === "Maidforce").length, 4);
});

test("post-map generation caps earlier patrols while preserving a shop actor", () => {
    const r = runtime(),
        c = r.context;
    c.KDMapData.MapFaction = "Maidforce";
    for (let i = 0; i < 4; i++) c.KinkyDungeonSummonEnemy(6 + i, 6, "MaidforceMini")[0].faction = "Maidforce";
    const shop = c.KinkyDungeonSummonEnemy(12, 6, "MaidforceMini")[0];
    shop.faction = "Maidforce";
    shop.flags = { Shop: -1 };
    r.generate();
    r.event("postMapgen");
    assert.equal(c.KDMapData.Entities.filter((e) => e.faction === "Maidforce" && !e.flags?.Shop).length, 3);
    assert.ok(c.KDMapData.Entities.includes(shop));
});

test("false scripted flags count toward the three maid patrols while permanent shops survive", () => {
    const r = runtime(),
        c = r.context;
    c.KDMapData.MapFaction = "Maidforce";
    for (let i = 0; i < 8; i++) {
        const maid = c.KinkyDungeonSummonEnemy(6 + i, 6, "MaidforceMini")[0];
        maid.faction = "Maidforce";
        maid.runSpawnAI = false;
    }
    r.generate();
    r.event("postMapgen");
    assert.equal(c.KDMapData.Entities.filter((e) => e.faction === "Maidforce").length, 3);
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
    const r = runtime();
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
    assert.deepEqual(born, ["Tunneler", "Spinner"]);
    assert.equal(nest.SpiderlingsNestTunnelerCount, 3, "independent of the exhausted lifetime budget");
    assert.equal(nest.ondeath, undefined, "temporary death entry is restored");
    c.KDRemoveEntity(nest, true);
    assert.equal(born.filter((n) => n === "Tunneler").length, 1);
});

test("task nest evacuation respects the map cap and reserves the last slot before ordinary death summons", () => {
    for (const count of [12, 13]) {
        const { c, nest, born, hit } = escapeRuntime();
        for (let i = 0; i < count; i++) c.KDMapData.Entities.push({ id: 100 + i, hp: 1, Enemy: { name: "Spinner" } });
        hit("Maidforce", 20);
        c.KDRemoveEntity(nest, true);
        assert.deepEqual(born, count === 12 ? ["Tunneler"] : []);
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
            wall = { x: born[0].x + 1, y: born[0].y };
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

function quietRuntime() {
    const r = runtime({
        KDHostile: (a, b) =>
            a !== b && (a.Enemy?.name === "MaidforceMini" || b?.Enemy?.name === "MaidforceMini" || b?.player),
        KDAllied: (e) => !!e.allied,
        KDIsInParty: (e) => !!e.party,
        KDIsImprisoned: (e) => !!e.prisoner,
        KinkyDungeonAggressive: () => true,
        KDHelpless: (e) => !!e.helpless,
        KDEnemyVisionRadius: () => 12,
        KinkyDungeonCheckLOS: (a, b) => !a.hidden && !b.hidden,
    });
    r.generate();
    const c = r.context,
        state = c.KDMapData.SpiderlingsHuntingGrounds;
    const anchor = state.clearing[0];
    c.KinkyDungeonPlayerEntity = { x: -100, y: -100, player: true };
    const spiders = Array.from({ length: 9 }, (_, i) => ({
        id: 100 + i,
        x: anchor.x + 1,
        y: anchor.y,
        hp: 1,
        Enemy: { name: i % 2 ? "WebCaster" : "Spinner" },
    }));
    c.KDMapData.Entities.push(...spiders);
    const tick = (delta) => r.event("tickAfter", { delta });
    return { ...r, c, state, anchor, spiders, tick };
}

test("one shared fifteen-turn peace timer leaves five wild spiders and every nest", () => {
    const { c, state, spiders, tick } = quietRuntime();
    tick(0);
    tick(14);
    assert.ok(spiders.every((e) => c.KDMapData.Entities.includes(e)));
    tick(1);
    assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 5);
    assert.equal(c.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance").length, 3);
    assert.equal(state.destroyedIds.length, 0);
    assert.equal(state.complete, false);
    tick(15);
    assert.equal(c.KDMapData.Entities.length, 20);
});

test("nearby capable hostile NPCs and players reset peace, including partial binding and edge fights", () => {
    for (const kind of ["maid", "player", "bound", "edge"]) {
        const { c, state, anchor, spiders, tick } = quietRuntime();
        tick(14);
        const opponent = { id: 500, x: anchor.x, y: anchor.y, hp: 10, Enemy: { name: "MaidforceMini" } };
        if (kind === "bound") opponent.boundLevel = 100;
        if (kind === "edge") {
            spiders[8].x = anchor.x + 10;
            opponent.x = anchor.x + 20;
        }
        if (kind === "player") c.KinkyDungeonPlayerEntity = { ...opponent, player: true, Enemy: undefined };
        else c.KDMapData.Entities.push(opponent);
        tick(1);
        assert.equal(state.quietTurns, 0, kind);
        assert.ok(
            spiders.every((e) => c.KDMapData.Entities.includes(e)),
            kind,
        );
        c.KinkyDungeonPlayerEntity = { x: -100, y: -100, player: true };
        c.KDMapData.Entities = c.KDMapData.Entities.filter((e) => e !== opponent);
        tick(14);
        assert.ok(
            spiders.every((e) => c.KDMapData.Entities.includes(e)),
            kind,
        );
        tick(1);
        assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 5, kind);
    }
});

test("helpless, imprisoned, incapacitated and imperceptible NPCs do not hold the garrison", () => {
    for (const reason of ["helpless", "prisoner", "stun", "freeze", "hidden", "noAttack"]) {
        const { c, state, anchor, spiders, tick } = quietRuntime();
        const maid = { id: 500, x: anchor.x, y: anchor.y, hp: 10, Enemy: { name: "MaidforceMini" }, [reason]: true };
        if (reason === "noAttack") maid.Enemy.noAttack = true;
        c.KDMapData.Entities.push(maid);
        tick(14);
        assert.equal(state.quietTurns, 14, reason);
        tick(1);
        assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 5, reason);
    }
});

test("an NPC recovering from helplessness resets the quiet timer", () => {
    const { c, state, anchor, spiders, tick } = quietRuntime();
    const maid = { id: 500, x: anchor.x, y: anchor.y, hp: 10, Enemy: { name: "MaidforceMini" }, helpless: true };
    c.KDMapData.Entities.push(maid);
    tick(14);
    assert.equal(state.quietTurns, 14);
    maid.helpless = false;
    tick(1);
    assert.equal(state.quietTurns, 0);
    assert.ok(spiders.every((e) => c.KDMapData.Entities.includes(e)));
});

test("the player waiting inside a Cocoon does not keep either spiders or objective nests in combat", () => {
    const { c, state, anchor, spiders, tick, event } = quietRuntime();
    c.KinkyDungeonPlayerEntity = { player: true, x: anchor.x, y: anchor.y };
    let passive = true;
    c.Spiderlings.Webbing = { isCocoonPassive: () => passive };
    for (let turn = 1; turn <= 14; turn++) {
        event("tick", { delta: 1 });
        tick(1);
    }
    assert.equal(state.quietTurns, 14);
    // The next turn starts with resistance, even if the player becomes passive
    // again before its end. All five objective nests can perceive the player.
    passive = false;
    event("tick", { delta: 1 });
    passive = true;
    tick(1);
    assert.equal(state.quietTurns, 0);
    assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 9);
    for (let turn = 1; turn <= 15; turn++) {
        event("tick", { delta: 1 });
        tick(1);
    }
    assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 5);
    assert.equal(state.quietTurns, 15);
    assert.equal(c.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance").length, 3);
});

test("a capable NPC still interrupts retirement beside a passive Cocoon player", () => {
    const { c, state, anchor, spiders, tick } = quietRuntime();
    c.KinkyDungeonPlayerEntity = { player: true, x: anchor.x, y: anchor.y };
    c.Spiderlings.Webbing = { isCocoonPassive: () => true };
    tick(14);
    c.KDMapData.Entities.push({ id: 501, x: anchor.x, y: anchor.y, hp: 10, Enemy: { name: "MaidforceMini" } });
    tick(1);
    assert.equal(state.quietTurns, 0);
    assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 9);
});

test("retirement preserves allied, party and captive spiders, remote fighters and ordinary maps", () => {
    const { c, spiders, tick } = quietRuntime();
    const protectedSpiders = [
        { ...spiders[0], id: 201, allied: true },
        { ...spiders[0], id: 202, party: true },
        { ...spiders[0], id: 203, prisoner: true },
        { ...spiders[0], id: 204, faction: "Player" },
        { ...spiders[0], id: 205, x: 200, y: 200 },
    ];
    c.KDMapData.Entities.push(...protectedSpiders);
    tick(15);
    assert.ok(protectedSpiders.every((e) => c.KDMapData.Entities.includes(e)));
    assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 5);
    const ordinary = quietRuntime();
    delete ordinary.c.KDMapData.SpiderlingsHuntingGrounds;
    ordinary.tick(100);
    assert.equal(ordinary.c.KDMapData.Entities.length, 24);
});

test("peace survives entity/map serialization and retirement honors native removal cancellation", () => {
    const { c, state, tick } = quietRuntime();
    tick(14);
    c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
    c.cancelRemoval = true;
    tick(1);
    assert.equal(c.KDMapData.Entities.length, 24);
    c.cancelRemoval = false;
    tick(1);
    assert.equal(c.KDMapData.Entities.length, 20);
    assert.equal(c.KDMapData.SpiderlingsHuntingGrounds.quietTurns, 15);
    assert.equal(state.quietTurns, 14, "saved map contains its own timer");
});

test("hostility within the spider garrison prevents retirement", () => {
    const { c, state, spiders, tick } = quietRuntime();
    tick(14);
    const native = c.KDHostile;
    c.KDHostile = (a, b) => a !== b && (a.rage > 0 || native(a, b));
    spiders[0].rage = 10;
    tick(1);
    assert.equal(state.quietTurns, 0);
    assert.ok(spiders.every((e) => c.KDMapData.Entities.includes(e)));
});

test("an enemy leaving during the turn cannot make a contested turn count as quiet", () => {
    const { c, state, anchor, spiders, tick, event } = quietRuntime();
    tick(14);
    const maid = { id: 501, x: anchor.x, y: anchor.y, hp: 10, Enemy: { name: "MaidforceMini" } };
    c.KDMapData.Entities.push(maid);
    event("tick", { delta: 1 });
    c.KDMapData.Entities = c.KDMapData.Entities.filter((e) => e !== maid);
    tick(1);
    assert.equal(state.quietTurns, 0);
    assert.ok(spiders.every((e) => c.KDMapData.Entities.includes(e)));
    event("tick", { delta: 14 });
    tick(14);
    assert.ok(spiders.every((e) => c.KDMapData.Entities.includes(e)));
    event("tick", { delta: 1 });
    tick(1);
    assert.equal(spiders.filter((e) => c.KDMapData.Entities.includes(e)).length, 5);
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
