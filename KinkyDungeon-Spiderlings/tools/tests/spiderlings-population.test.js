"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsPopulation.js"), "utf8");

function runtime(kind = "SpiderlingsInfestation") {
    let id = 100;
    const settings = { cap: 25 };
    const nests = [
        { x: 10, y: 10 },
        { x: 25, y: 10 },
        { x: 10, y: 25 },
    ]
        .slice(0, kind === "SpiderlingsInfestation" ? 2 : 3)
        .map((point, index) => ({ ...point, id: index + 1, hp: 12, Enemy: { name: "NestEntrance", immobile: true } }));
    const c = {
        Spiderlings: { getSetting: () => settings.cap },
        KDMapData: {
            MapMod: kind,
            GridWidth: 40,
            GridHeight: 40,
            StartPosition: { x: 1, y: 1 },
            EndPosition: { x: 38, y: 38 },
            Entities: [...nests],
        },
        KinkyDungeonPlayerEntity: { x: 1, y: 1 },
        KinkyDungeonMovableTiles: "0",
        KinkyDungeonMapGet: () => "0",
        KinkyDungeonTilesGet: () => undefined,
        KinkyDungeonGetEnemyByName: (name) => ({ name }),
        KDGetFaction: () => "Spider",
        KinkyDungeonSummonEnemy(x, y, name) {
            const child = { id: ++id, x, y, hp: 10, Enemy: { name } };
            c.KDMapData.Entities.push(child);
            return [child];
        },
        KDRemoveEntity(entity, kill, capture, noEvent) {
            assert.equal(kill, false);
            assert.equal(capture, false);
            assert.equal(noEvent, true);
            const index = c.KDMapData.Entities.indexOf(entity);
            if (index >= 0) c.KDMapData.Entities.splice(index, 1);
            return index >= 0;
        },
    };
    vm.createContext(c);
    vm.runInContext(source, c);
    const api = c.Spiderlings.Population;
    api.prepareFloor(kind);
    return {
        c,
        api,
        nests,
        settings,
        seed: (extra = {}) => api.seedCrews({ kind, nests, spawnPoints: [], sites: [], ...extra }),
    };
}

test("crew failure preserves unrelated hook births and restores previous nest rosters", () => {
    for (const failure of ["empty", "throw"]) {
        const r = runtime(),
            { c, nests } = r,
            summon = c.KinkyDungeonSummonEnemy;
        const resident = { id: 900, x: 35, y: 35, hp: 1, Enemy: { name: "Bandit" } };
        const unrelated = { id: 901, x: 34, y: 35, hp: 1, Enemy: { name: "QuestNPC" } };
        c.KDMapData.Entities.push(resident);
        const oldRoster = ["Spinner"];
        nests[0].SpiderlingsNestRoster = oldRoster;
        nests[0].SpiderlingsNestRosterTarget = 4;
        let calls = 0;
        const error = new Error("native failure");
        c.KinkyDungeonSummonEnemy = (...args) => {
            calls++;
            if (calls === 1) c.KDMapData.Entities.push(unrelated);
            if (calls === 7) {
                if (failure === "empty") return [];
                summon(...args);
                throw error;
            }
            return summon(...args);
        };
        if (failure === "throw") assert.throws(r.seed, (actual) => actual === error);
        else assert.equal(r.seed().ok, false);
        assert.deepEqual(c.KDMapData.Entities, [...nests, resident, unrelated]);
        assert.equal(nests[0].SpiderlingsNestRoster, oldRoster);
        assert.equal(nests[0].SpiderlingsNestRosterTarget, 4);
        assert.equal(Object.hasOwn(nests[1], "SpiderlingsNestRoster"), false);
    }
});

test("refused crew cleanup preserves the native error cause and reports the cleanup failure", () => {
    const r = runtime(),
        { c, nests } = r,
        summon = c.KinkyDungeonSummonEnemy;
    const original = new Error("summon failed after insertion");
    const resident = { id: 950, x: 35, y: 35, hp: 1, Enemy: { name: "Bandit" } };
    c.KDMapData.Entities.push(resident);
    c.KinkyDungeonSummonEnemy = (...args) => {
        summon(...args);
        throw original;
    };
    c.KDRemoveEntity = () => false;
    assert.throws(r.seed, (error) => error.cause === original && /cleanup/i.test(error.message));
    assert.ok(c.KDMapData.Entities.includes(resident));
    assert.ok(nests.every((nest) => !Object.hasOwn(nest, "SpiderlingsNestRoster")));
});

test("every required crew member fails atomically on empty, misplaced or extra native results", () => {
    for (const kind of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        const required = kind === "SpiderlingsInfestation" ? 12 : 18;
        for (const mode of ["empty", "misplaced", "extra"])
            for (let failed = 1; failed <= required; failed++) {
                const r = runtime(kind),
                    { c, nests } = r,
                    summon = c.KinkyDungeonSummonEnemy;
                let calls = 0;
                c.KinkyDungeonSummonEnemy = (...args) => {
                    if (++calls !== failed) return summon(...args);
                    if (mode === "empty") return [];
                    const batch = summon(...args);
                    if (mode === "misplaced") batch[0].x++;
                    if (mode === "extra") batch.push(...summon(...args));
                    return batch;
                };
                assert.equal(r.seed().ok, false, `${kind}/${mode}/${failed}`);
                assert.deepEqual(c.KDMapData.Entities, nests);
                assert.ok(nests.every((nest) => !Object.hasOwn(nest, "SpiderlingsNestRoster")));
            }
    }
});

test("optional patrol failure preserves all eighteen core members without retaining a partial patrol", () => {
    for (let failed = 19; failed <= 24; failed++) {
        const r = runtime("SpiderlingsHuntingGrounds"),
            { c, nests } = r,
            summon = c.KinkyDungeonSummonEnemy;
        let calls = 0;
        c.KinkyDungeonSummonEnemy = (...args) => (++calls === failed ? [] : summon(...args));
        const result = r.seed();
        assert.equal(result.ok, true);
        assert.equal(result.coreIds.length, 18);
        assert.equal(result.patrolIds.length, 0);
        assert.equal(c.KDMapData.Entities.length, 21);
        assert.ok(nests.every((nest) => c.Spiderlings.Population.missingRoles(nest).length === 0));
    }
});

test("a placement query reserves nothing and the birth request rechecks occupancy and budget", () => {
    for (const change of ["occupancy", "wall", "budget"]) {
        const r = runtime(),
            { c, api, nests, settings } = r;
        const before = JSON.stringify(c.KDMapData);
        const positions = api.planCrews({ nests, spawnPoints: [] });
        assert.equal(JSON.stringify(c.KDMapData), before);
        const point = positions[0][0];
        if (change === "occupancy") c.KDMapData.Entities.push({ ...point, id: 990, hp: 1, Enemy: { name: "Bandit" } });
        if (change === "wall") c.KinkyDungeonMapGet = (x, y) => (x === point.x && y === point.y ? "1" : "0");
        if (change === "budget") settings.cap = 11;
        const actual = JSON.stringify(c.KDMapData.Entities);
        assert.equal(r.seed({ positions }).ok, false);
        assert.equal(JSON.stringify(c.KDMapData.Entities), actual);
    }
});

test("completed crew initialization cannot duplicate a saved roster even with unlimited spare capacity", () => {
    const r = runtime(),
        { c, settings } = r;
    assert.equal(r.seed().ok, true);
    settings.cap = 0;
    c.KDMapData.SpiderlingsPopulationPlan.cap = 100;
    const before = JSON.stringify(c.KDMapData);
    assert.equal(r.seed().ok, false);
    assert.equal(JSON.stringify(c.KDMapData), before);
});

test("Hunting Grounds and saved layout fallback add twenty slots and ignore obsolete ceilings", () => {
    const { c, api, settings } = runtime("SpiderlingsHuntingGrounds");
    assert.equal(c.Spiderlings.getMapPopulationCap(), 45);
    assert.equal(c.KDMapData.SpiderlingsPopulationPlan.cap, 45);
    for (const [setting, expected] of [
        [10, 30],
        [50, 70],
        [0, 20],
    ]) {
        settings.cap = setting;
        c.KDMapData.SpiderlingsPopulationPlan.cap = 25;
        assert.equal(c.Spiderlings.getMapPopulationCap(), expected);
        api.prepareFloor("SpiderlingsHuntingGrounds");
        assert.equal(c.KDMapData.SpiderlingsPopulationPlan.cap, expected);
    }
    c.KDMapData.MapMod = "";
    assert.equal(c.Spiderlings.getMapPopulationCap(), 0);
    assert.equal(c.Spiderlings.availableSpiderlingSlots(), Infinity);
    settings.cap = 20;
    c.KDMapData.MapMod = "None";
    c.KDMapData.SpiderlingsPopulationPlan.layoutFallback = true;
    c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
    assert.equal(c.Spiderlings.getMapPopulationCap(), 40);
    assert.equal(c.Spiderlings.availableSpiderlingSlots(), 40);
    delete c.KDMapData.SpiderlingsPopulationPlan.layoutFallback;
    assert.equal(c.Spiderlings.getMapPopulationCap(), 20);
});

test("two large fields receive their original nest Spinner pairs even at the minimum hunting cap", () => {
    const { c, api, nests, settings, seed } = runtime("SpiderlingsHuntingGrounds");
    settings.cap = 0;
    api.prepareFloor("SpiderlingsHuntingGrounds");
    const sites = [
        { x: 20, y: 20, radius: 4 },
        { x: 30, y: 30, radius: 4 },
    ];
    const result = seed({ sites });
    assert.equal(result.ok, true);
    assert.equal(result.coreIds.length, 18);
    assert.equal(result.fieldIds.length, 4);
    assert.equal(result.patrolIds.length, 0);
    for (const [index, site] of sites.entries()) {
        const pair = c.KDMapData.Entities.filter((actor) => actor.SpiderlingsPresetFieldCenter?.x === site.x);
        assert.equal(pair.length, 2);
        assert.ok(
            pair.every((actor) => actor.Enemy.name === "Spinner" && actor.SpiderlingsNestParentID === nests[index].id),
        );
        assert.deepEqual(
            pair.map((actor) => [actor.x, actor.y]),
            [
                [site.x - 1, site.y],
                [site.x + 1, site.y],
            ],
        );
        assert.equal(api.missingRoles(nests[index]).length, 0);
    }
});

test("separate patrol births retain separate shared crew identities", () => {
    const { c, seed } = runtime("SpiderlingsHuntingGrounds");
    const result = seed();
    assert.equal(result.patrolIds.length, 24);
    const crews = new Map();
    for (const actor of c.KDMapData.Entities.filter((actor) => result.patrolIds.includes(actor.id))) {
        const members = crews.get(actor.SpiderlingsHuntCrewID) || [];
        members.push(actor.id);
        crews.set(actor.SpiderlingsHuntCrewID, members);
    }
    assert.equal(crews.size, 4);
    assert.ok([...crews.values()].every((crew) => crew.length === 6));
});
