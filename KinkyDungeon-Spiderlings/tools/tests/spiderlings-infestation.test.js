"use strict";

const test = require("node:test");
require("../../SpiderlingsCore.js");
const assert = require("node:assert/strict");
const { planNestPlacement, reachableCells } = require("../../SpiderlingsInfestation.js");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsInfestation.js"), "utf8");

function runtime(overrides = {}, nativeSources = []) {
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
        KDGameData: { MapMod: "SpiderlingsInfestation" },
        KDMapData: {
            MapMod: "SpiderlingsInfestation",
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
            const entity = { x, y, id: ++id, hp: 12, Enemy: { name, immobile: true } };
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
            context.KDEventMapGeneric[trigger].SpiderlingsInfestation({}, data);
            return data;
        },
    };
}

test("native modifier selects eligible floors and adds five grouped nests alongside native population", () => {
    const r = runtime();
    const mod = r.context.KDMapMods.SpiderlingsInfestation;
    assert.equal(mod.weight, 50);
    assert.equal(mod.faction, "Maidforce");
    assert.equal(mod.filter({ y: 2 }), 0);
    assert.equal(mod.filter({ y: 3 }), 1);
    assert.equal(mod.filter({ y: 3, RoomType: "PerkRoom" }), 0);
    assert.equal(r.generate(), "native-result");
    assert.equal(r.context.KDMapData.Entities.length, 5);
    const nests = r.context.KDMapData.Entities;
    assert.deepEqual(
        nests
            .map(
                (nest) =>
                    nests.filter((other) => other !== nest && Math.hypot(nest.x - other.x, nest.y - other.y) <= 5)
                        .length,
            )
            .sort(),
        [0, 1, 1, 1, 1],
    );
    assert.ok(r.context.KDMapData.Entities.every((e) => e.flags.no_pers_wander === -1 && e.flags.questtarget === -1));
    assert.equal(r.population[0][7], undefined, "keep the native population budget");
    r.generate();
    r.event("postMapgen");
    assert.equal(r.context.KDMapData.Entities.length, 5);
    assert.equal(r.context.KinkyDungeonEscapeTypes.SpiderlingsInfestation.filterRandom(), 0);
});

test("Infestation distribution favors 2+2+1 and raises the five-nest chance with depth", () => {
    const rules = runtime().context.Spiderlings.Infestation;
    assert.deepEqual(
        Array.from(rules.nestDistribution(3), (option) => option.weight),
        [80, 18, 2],
    );
    assert.deepEqual(
        Array.from(rules.nestDistribution(13), (option) => option.weight),
        [70, 18, 12],
    );
    assert.deepEqual(
        Array.from(rules.nestDistribution(40), (option) => option.weight),
        [52, 18, 30],
    );
    assert.deepEqual(Array.from(rules.selectNestDistribution(3, () => 0.79)), [2, 2, 1]);
    assert.deepEqual(Array.from(rules.selectNestDistribution(3, () => 0.8)), [2, 3]);
    assert.deepEqual(Array.from(rules.selectNestDistribution(3, () => 0.98)), [5]);
});

test("all three sampled Infestation shapes preserve separate groups and traversable nest approaches", () => {
    const planner = runtime().context.Spiderlings.Infestation.planGroupedNestPlacement,
        cells = rectangle(40, 30),
        passable = new Set(cells.map((point) => `${point.x},${point.y}`)),
        start = { x: 1, y: 1 };
    for (const groupSizes of [[2, 2, 1], [2, 3], [5]]) {
        const plan = planner({
            start,
            passable,
            candidates: cells.filter((point) => point.x > 5),
            groupSizes,
            random: seededRandom(21),
        });
        assert.equal(plan?.length, 5, groupSizes.join("+"));
        let offset = 0;
        const groups = groupSizes.map((size) => {
            const group = Array.from(plan.slice(offset, offset + size));
            offset += size;
            return group;
        });
        for (let i = 0; i < groups.length; i++)
            for (let j = i + 1; j < groups.length; j++)
                for (const left of groups[i])
                    for (const right of groups[j]) assert.ok(Math.hypot(left.x - right.x, left.y - right.y) >= 8);
        const reached = reachableCells(start, passable, new Set(Array.from(plan, (point) => `${point.x},${point.y}`)));
        assert.equal(reached.size, passable.size - 5);
    }
});

test("crowded Infestation spiders receive distinct native patrol goals without extra awareness or removal", () => {
    const r = runtime({
        KinkyDungeonPlayerEntity: { player: true, x: 1, y: 1 },
        KinkyDungeonMovableTilesEnemy: "0",
        KDHelpless: () => false,
        KDIsImprisoned: () => false,
        KinkyDungeonFindPath: (_x, _y, x, y) => [{ x, y }],
    });
    r.generate();
    const c = r.context,
        home = c.KDMapData.Entities[0],
        spiders = ["WebCaster", "Jumper", "MageSpiderlings"].map((name, index) => ({
            id: 100 + index,
            hp: 3,
            x: home.x + 1,
            y: home.y + index,
            Enemy: { name },
            SpiderlingsNestParentId: home.id,
        }));
    c.KDMapData.Entities.push(...spiders);
    const before = c.KDMapData.Entities.length;
    for (const spider of spiders) {
        assert.equal(c.Spiderlings.Infestation.seekPatrol(spider, c.KinkyDungeonPlayerEntity, {}), true);
        assert.equal(spider.aware, undefined);
        assert.ok(
            c.KDMapData.Entities.filter((entity) => entity.Enemy.name === "NestEntrance").every(
                (nest) => Math.max(Math.abs(spider.gx - nest.x), Math.abs(spider.gy - nest.y)) >= 6,
            ),
        );
    }
    assert.equal(new Set(spiders.map((spider) => `${spider.gx},${spider.gy}`)).size, 3);
    assert.equal(c.KDMapData.Entities.length, before);
    assert.equal(
        c.Spiderlings.Infestation.seekPatrol(spiders[0], c.KinkyDungeonPlayerEntity, { canSensePlayer: true }),
        false,
    );
    const saved = JSON.parse(JSON.stringify(spiders[0]));
    assert.equal(c.Spiderlings.Infestation.seekPatrol(saved, c.KinkyDungeonPlayerEntity, {}), true);
    assert.deepEqual([saved.gx, saved.gy], [spiders[0].gx, spiders[0].gy]);
});

function nativeJourneyRuntime(overrides = {}) {
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
    );
}

test("native journey rejects a cached infestation below floor three and preserves the maid modifier", () => {
    const r = nativeJourneyRuntime({ CommonRandomItemFromList: () => "Bandit" });
    const c = r.context;
    const selection = vm.runInContext(
        `
        KDMapModRefreshList = [KDMapMods.SpiderlingsInfestation, KDMapMods.Mold];
        KDJourneySlotTypes.basic(null, 0, 2, "grv");
    `,
        c,
    );
    assert.equal(selection.MapMod, "Mold");
    assert.equal(selection.Faction, "Maidforce");
    const remaining = vm.runInContext("KDMapModRefreshList.map(mod => mod.name)", c);
    assert.ok(!remaining.includes("SpiderlingsInfestation"));
    const eligible = vm.runInContext(
        `
        KDMapModRefreshList = [KDMapMods.SpiderlingsInfestation];
        KDJourneySlotTypes.basic(null, 0, 3, "grv");
    `,
        c,
    );
    assert.equal(eligible.MapMod, "SpiderlingsInfestation");
    assert.equal(eligible.EscapeMethod, "SpiderlingsInfestation");
    assert.equal(eligible.Faction, "Maidforce", "new infestations select maids even in a Bandit biome");
});

test("infestation uses the native Slime and Mold modifier weight", () => {
    const r = nativeJourneyRuntime();
    const mods = r.context.KDMapMods;
    assert.equal(mods.SpiderlingsInfestation.weight, mods.Slime.weight);
    assert.equal(mods.SpiderlingsInfestation.weight, mods.Mold.weight);
    assert.equal(mods.SpiderlingsInfestation.faction, "Maidforce");
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
            if (slot.MapMod !== "SpiderlingsInfestation") continue;
            infestations++;
            assert.ok(slot.y >= 3, `attempt ${attempt}, floor ${slot.y}`);
        }
    }
    assert.ok(infestations > 0, "eligible infestation encounters still occur");
});

test("loading repairs only unvisited early infestation previews and keeps independent factions", () => {
    const slots = {
        early: { y: 2, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation", Faction: "Maidforce" },
        maid: { y: 2, MapMod: "Mold", EscapeMethod: "Key", Faction: "Maidforce" },
        eligible: { y: 3, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation" },
        visited: { y: 2, visited: true, MapMod: "SpiderlingsInfestation", EscapeMethod: "SpiderlingsInfestation" },
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
    r.context.Spiderlings.Infestation.register();
    r.event("afterLoadGame");
    assert.equal(JSON.stringify(slots), after);
});

test("maid floors have no infestation objective; infestation floors place five nests without a maid modifier", () => {
    const r = runtime();
    r.context.KDMapData.MapMod = "Mold";
    r.generate();
    assert.equal(r.context.KDMapData.Entities.length, 0);
    assert.equal(r.context.Spiderlings.Infestation.activeState(), null);
    assert.equal(r.event("calcEscapeMethod", { escapeMethod: "Key" }).escapeMethod, "Key");
    r.context.KDMapData.MapMod = "SpiderlingsInfestation";
    r.context.KDMapData.MapFaction = "Bandit";
    r.generate();
    assert.equal(r.context.KDMapData.Entities.length, 5);
    assert.equal(r.context.Spiderlings.Infestation.activeState().targetIds.length, 5);
});

test("infestation preserves native initial and wandering population selection", () => {
    const nativeGetEnemy = () => "native-enemy";
    const nativeWandering = () => "native-wandering";
    const r = runtime({
        KinkyDungeonGetEnemy: nativeGetEnemy,
        KinkyDungeonHandleWanderingSpawns: nativeWandering,
    });
    const c = r.context;
    assert.equal(c.KinkyDungeonGetEnemy, nativeGetEnemy);
    assert.equal(c.KinkyDungeonHandleWanderingSpawns, nativeWandering);
    c.KDMapData.MapFaction = "Maidforce";
    const points = [{ x: 7, y: 8, required: ["human"], ftags: ["maid"], force: true }];
    const before = JSON.stringify(points);
    let received;
    c.populationAction = (...args) => {
        received = args;
        return "native-result";
    };
    assert.equal(c.KinkyDungeonPlaceEnemies(points, false, [], {}, 3, 30, 30, {}, []), "native-result");
    assert.equal(received[0], points);
    assert.equal(JSON.stringify(points), before);
    assert.equal(received[7].constructor, Object);
    assert.equal(c.KinkyDungeonGetEnemy(), "native-enemy");
    assert.equal(c.KinkyDungeonHandleWanderingSpawns(), "native-wandering");
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
        assert.equal(r.context.KinkyDungeonEscapeTypes.SpiderlingsInfestation.check(), true);
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

test("five successful original-nest destructions count once regardless of attribution and unlock descent", () => {
    const r = runtime();
    r.generate();
    const c = r.context;
    const original = [...c.KDMapData.Entities];
    const state = c.KDMapData.SpiderlingsInfestation;
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsInfestation.minimaptext(), /0\/5/);
    assert.equal(r.event("calcEscapeMethod", { escapeMethod: "Key" }).escapeMethod, "SpiderlingsInfestation");
    for (const data of [
        { toTile: "s", AdvanceAmount: 0 },
        { toTile: "s", AdvanceAmount: 1, force: true },
        { toTile: "H", AdvanceAmount: 1 },
    ]) {
        assert.equal(r.event("beforeStairCancel", data).cancelevent, "SpiderlingsInfestation");
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
        original[index].killer = ["Player", "Maidforce", "Enemy", "Environment", "Player"][index];
        c.KDRemoveEntity(original[index], true, true);
        c.KDRemoveEntity(original[index], true, true);
        assert.equal(state.destroyedIds.length, index + 1);
        assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsInfestation.check(), index === 4);
    }
    assert.match(r.messages.at(-1), /stairs.*\(5\/5\)/);
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsInfestation.minimaptext(), "Marked nests destroyed: 5/5");
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsInfestation.doortext(), /stairs.*\(5\/5\)/);
    assert.equal(r.messages.length, 5);
    assert.equal(r.event("beforeStairCancel", { toTile: "s", AdvanceAmount: 1 }).cancelevent, undefined);
});

test("map JSON preserves partial and completed progress, registration is idempotent, new maps are independent", () => {
    const r = runtime();
    r.generate();
    const c = r.context;
    c.Spiderlings.Infestation.register();
    c.KDRemoveEntity(c.KDMapData.Entities[0], true);
    const snapshot = JSON.stringify(c.KDMapData);
    c.KDMapData = JSON.parse(snapshot);
    r.generate();
    assert.equal(c.KDMapData.Entities.length, 4);
    assert.match(c.KinkyDungeonEscapeTypes.SpiderlingsInfestation.minimaptext(), /1\/5/);
    for (const entity of [...c.KDMapData.Entities]) c.KDRemoveEntity(entity, true);
    c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsInfestation.check(), true);
    c.KDMapData = { MapMod: "None", Entities: [] };
    assert.equal(r.event("calcEscapeMethod", { escapeMethod: "Key" }).escapeMethod, "Key");
    assert.equal(r.event("beforeStairCancel", { toTile: "s", AdvanceAmount: 1 }).cancelevent, undefined);
    c.KDMapData = JSON.parse(snapshot);
    assert.equal(c.KinkyDungeonEscapeTypes.SpiderlingsInfestation.check(), false);
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

test("three-plus-two objectives reinforce within groups at four to five tiles and keep a six-to-eight-tile gap", () => {
    const cells = rectangle(30, 30),
        passable = new Set(cells.map((p) => `${p.x},${p.y}`));
    const planner = runtime().context.Spiderlings.Infestation.planGroupedNestPlacement;
    for (const seed of [1, 8, 21]) {
        const candidates = cells.filter((p) => p.x > 5 && p.y > 5),
            start = { x: 1, y: 1 };
        const plan = planner({ start, passable, candidates, random: seededRandom(seed) });
        assert.equal(plan.length, 5);
        assert.equal(new Set(plan.map((p) => `${p.x},${p.y}`)).size, 5);
        const triple = plan.slice(0, 3),
            pair = plan.slice(3);
        for (const group of [triple, pair])
            for (const a of group)
                for (const b of group)
                    if (a !== b) {
                        const d = Math.hypot(a.x - b.x, a.y - b.y);
                        assert.ok(d >= 4 && d <= 5);
                    }
        const gap = Math.min(...triple.flatMap((a) => pair.map((b) => Math.hypot(a.x - b.x, a.y - b.y))));
        assert.ok(gap >= 6 && gap <= 8);
        assert.deepEqual(
            Array.from(plan, (a) => plan.filter((b) => a !== b && Math.hypot(a.x - b.x, a.y - b.y) <= 5).length),
            [2, 2, 2, 1, 1],
        );
        const reached = reachableCells(start, passable, new Set(plan.map((p) => `${p.x},${p.y}`)));
        assert.equal(reached.size, passable.size - 5);
        for (const p of plan)
            assert.ok(
                [
                    { x: p.x - 1, y: p.y },
                    { x: p.x + 1, y: p.y },
                    { x: p.x, y: p.y - 1 },
                    { x: p.x, y: p.y + 1 },
                ].some((q) => reached.has(`${q.x},${q.y}`)),
            );
    }
});

test("group placement rejects excessive gaps, cross-bonus distances and jointly blocked corridors", () => {
    const planner = runtime().context.Spiderlings.Infestation.planGroupedNestPlacement;
    const triple = [
        { x: 6, y: 6 },
        { x: 10, y: 6 },
        { x: 8, y: 10 },
    ];
    const points = (x) => [...triple, { x, y: 6 }, { x, y: 10 }];
    const cells = rectangle(30, 30),
        options = { start: { x: 1, y: 1 }, passable: new Set(cells.map((p) => `${p.x},${p.y}`)), random: () => 1 };
    for (const x of [16, 18]) assert.equal(planner({ ...options, candidates: points(x) }).length, 5);
    for (const x of [15, 19, 25]) assert.equal(planner({ ...options, candidates: points(x) }), null);
    assert.equal(planner({ ...options, candidates: points(16).slice(0, 4) }), null);
    assert.equal(planner({ ...options, candidates: points(16).map((p) => ({ x: p.x + 100, y: p.y })) }), null);
    const corridor = new Set(cells.filter((p) => p.y !== 6 || p.x === 6).map((p) => `${p.x},${p.y}`));
    assert.equal(planner({ ...options, passable: corridor, candidates: points(16) }), null);
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
    for (const count of [24, 25]) {
        const { c, nest, born, hit } = escapeRuntime();
        for (let i = 0; i < count; i++) c.KDMapData.Entities.push({ id: 100 + i, hp: 1, Enemy: { name: "Spinner" } });
        hit("Maidforce", 20);
        c.KDRemoveEntity(nest, true);
        assert.deepEqual(born, count === 24 ? ["Tunneler"] : []);
    }
});

test("the final objective evacuates before the task becomes complete", () => {
    const { c, nest, born, hit } = escapeRuntime();
    const state = c.KDMapData.SpiderlingsInfestation;
    state.destroyedIds = state.targetIds.filter((id) => id !== nest.id);
    hit("Maidforce", 20);
    c.KDRemoveEntity(nest, true);
    assert.equal(born[0], "Tunneler");
    assert.equal(state.destroyedIds.length, 5);
    assert.equal(state.complete, true);
});

test("ordinary nests, non-maid finishers, cancellation and non-kill removals do not evacuate", () => {
    for (const reason of ["ordinary", "player", "other", "nonlethal", "cancel", "remove", "dead-hit"]) {
        const { c, nest, born, hit } = escapeRuntime();
        if (reason === "ordinary") c.KDMapData.SpiderlingsInfestation.targetIds.shift();
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
    const planner = runtime().context.Spiderlings.Infestation.planNestClearing;
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
        if (c.KDMapData.Entities.length === 5) {
            const group = c.KDMapData.Entities.slice(0, 2);
            wall = {
                x: Math.round(group.reduce((sum, e) => sum + e.x, 0) / group.length),
                y: Math.round(group.reduce((sum, e) => sum + e.y, 0) / group.length),
            };
        }
        return born;
    };
    r.generate();
    const state = c.KDMapData.SpiderlingsInfestation;
    assert.equal(state.clearing.length, 5);
    assert.equal(writes, 1, "the clearing is actually carved");
    assert.equal(nav, 1);
    const count = writes;
    r.generate();
    assert.equal(writes, count);
    let failedWrites = 0;
    const failed = runtime({ KinkyDungeonSummonEnemy: () => [], KinkyDungeonMapSet: () => failedWrites++ });
    failed.generate();
    assert.equal(failed.context.KDMapData.SpiderlingsInfestation.status, "cancelled");
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
        state = c.KDMapData.SpiderlingsInfestation;
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
    assert.equal(c.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance").length, 5);
    assert.equal(state.destroyedIds.length, 0);
    assert.equal(state.complete, false);
    tick(15);
    assert.equal(c.KDMapData.Entities.length, 10);
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
    assert.equal(c.KDMapData.Entities.filter((e) => e.Enemy.name === "NestEntrance").length, 5);
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
    delete ordinary.c.KDMapData.SpiderlingsInfestation;
    ordinary.tick(100);
    assert.equal(ordinary.c.KDMapData.Entities.length, 14);
});

test("peace survives entity/map serialization and retirement honors native removal cancellation", () => {
    const { c, state, tick } = quietRuntime();
    tick(14);
    c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
    c.cancelRemoval = true;
    tick(1);
    assert.equal(c.KDMapData.Entities.length, 14);
    c.cancelRemoval = false;
    tick(1);
    assert.equal(c.KDMapData.Entities.length, 10);
    assert.equal(c.KDMapData.SpiderlingsInfestation.quietTurns, 15);
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
    const planner = runtime().context.Spiderlings.Infestation.planNestClearing;
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
