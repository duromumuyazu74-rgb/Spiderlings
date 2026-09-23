"use strict";

const test = require("node:test");
require("../../SpiderlingsCore.js");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { gamePath } = require("../reference-inputs.js");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

const { EncounterRules, ReinforcementRules } = require("../../SpiderlingsEncounters.js");

function loadCoreRuntime(overrides = {}, nativeSources = []) {
    const context = {
        console,
        KinkyDungeonEnemies: [],
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDModConfigs: {},
        KDModSettings: {},
        KDAddEvent(map, trigger, type, handler) {
            map[trigger] = map[trigger] || {};
            map[trigger][type] = handler;
        },
        ...overrides,
    };
    context.globalThis = context;
    vm.createContext(context);
    for (const source of nativeSources) vm.runInContext(stripTypeScriptTypes(source), context);
    for (const file of ["SpiderlingsCore.js", "SpiderlingsEncounters.js", "SpiderlingsWebCaster.js"]) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, "../..", file), "utf8"), context, { filename: file });
    }
    return context;
}

// KD 5.5.3 out/main.js:134955. This helper is absent from the pinned 5.5
// checkout; retain its failing player-as-enemy behavior in the regression.
const native553Subbier = `function KDIsSubbier(player, enemy) {
  if (!enemy || KinkyDungeonGoddessRep.Ghost < -25 || KDCanDom(enemy)) return false;
  return KinkyDungeonGoddessRep.Ghost > -25 && !KDCanDom(enemy, false, -0.3);
}`;

test("summon messages accept player fallback in KD 5.5.3 without losing summons or NPC dialogue", () => {
    const fight = fs.readFileSync(gamePath("Game/src/fight/KinkyDungeonFight.ts"), "utf8");
    const hit = fight.slice(
        fight.indexOf("function KinkyDungeonBulletHit("),
        fight.indexOf("function KinkyDungeonSummonEnemy ("),
    );
    for (const source of [undefined, 999, -1, 42]) {
        for (const count of [0, 1, 2]) {
            const player = { id: -1, player: true };
            const npc = { id: 42, Enemy: { name: "Tunneler", bound: "Tunneler" } };
            const messages = [],
                summoned = [],
                events = [],
                domChecks = [];
            const kd = loadCoreRuntime(
                {
                    KDPlayer: () => player,
                    KinkyDungeonGoddessRep: { Ghost: 50 },
                    KDCanDom(enemy) {
                        domChecks.push(enemy);
                        return !enemy.Enemy.bound;
                    },
                    KinkyDungeonFindID: (id) => (id === -1 ? player : id === 42 ? npc : undefined),
                    KinkyDungeonSendEvent: (name) => events.push(name),
                    KinkyDungeonSummonEnemy(x, y, name, requested) {
                        const result = Array.from({ length: count }, (_, id) => ({ id, Enemy: { name } }));
                        summoned.push({ name, requested, result });
                        return result;
                    },
                    KDBulletAoEMod: () => undefined,
                    KDFactionRelation: () => -1,
                    KDBaseWhite: "#ffffff",
                    TextGet: (key, params) => {
                        messages.push({ key, params });
                        return key;
                    },
                    KinkyDungeonSendTextMessage: () => {},
                },
                [
                    native553Subbier,
                    hit,
                    `function KDGetGenericDialogueParams(player, enemy) {
        return {EHonorconditional: KDIsSubbier(player, enemy) ? "Mistress" : "", EName: enemy.id};
      }`,
                ],
            );
            const bullet = {
                x: 3,
                y: 4,
                bullet: {
                    hit: "summon",
                    source,
                    faction: "Enemy",
                    spell: { name: "SummonNestEntrance", aoe: 1.5 },
                    summon: [{ name: "NestEntrance", count: 2 }],
                },
            };
            kd.KinkyDungeonBulletHit(bullet, 1);
            assert.equal(summoned[0].requested, 2);
            assert.equal(summoned[0].result.length, count);
            assert.deepEqual(events, ["beforeBulletHit", "afterBulletHit"]);
            assert.equal(messages.length, count > 0 ? 1 : 0);
            if (count) {
                assert.equal(messages[0].key, `KinkyDungeonSummon${count === 1 ? "Single" : "Multi"}NestEntrance`);
                assert.equal(messages[0].params.EName, source === 42 ? 42 : -1);
                assert.equal(messages[0].params.EHonorconditional, source === 42 ? "Mistress" : "");
            }
            assert.ok(
                domChecks.every((enemy) => enemy === npc),
                "player must never reach NPC dominance checks",
            );
        }
    }
});

test("KD 5.5.3 subbier compatibility preserves native calls and older runtimes", () => {
    const calls = [];
    const native = function (...args) {
        calls.push({ receiver: this, args });
        return "native";
    };
    const kd = loadCoreRuntime({ KDIsSubbier: native });
    const player = { player: true },
        npc = { Enemy: { bound: "Maid" } },
        receiver = {};
    assert.equal(kd.KDIsSubbier(player, player), false);
    for (const enemy of [npc, undefined, null]) {
        assert.equal(kd.KDIsSubbier.call(receiver, player, enemy, "extra"), "native");
        assert.equal(calls.at(-1).receiver, receiver);
        assert.deepEqual(calls.at(-1).args, [player, enemy, "extra"]);
    }
    assert.equal(calls.length, 3);
    assert.equal(loadCoreRuntime().KDIsSubbier, undefined, "do not install a new helper on KD 5.4/5.5");
});

test("ordinary Spiderlings use the confirmed native weights without the minor tag", () => {
    const expectedWeights = {
        Spinner: 12,
        Jumper: 12,
        WebCaster: 8,
        Tunneler: 4,
        NestEntrance: 2,
    };

    for (const [name, weight] of Object.entries(expectedWeights)) {
        assert.deepEqual(
            EncounterRules.nativePopulationOverrides(name, {
                spiderlings: true,
                minor: true,
            }),
            {
                weight,
                tags: { spiderlings: true },
            },
        );
    }
});

test("guaranteed squads use one fixed four-role composition on eligible ordinary maps", () => {
    assert.equal(EncounterRules.isEligibleOrdinaryMap({}), true);
    assert.equal(EncounterRules.isEligibleOrdinaryMap({ enemies: true, spawns: true, bossroom: false }), true);
    assert.equal(EncounterRules.isEligibleOrdinaryMap({ bossroom: true }), false);
    assert.equal(EncounterRules.isEligibleOrdinaryMap({ enemies: false }), false);
    assert.equal(EncounterRules.isEligibleOrdinaryMap({ spawns: false }), false);
    assert.deepEqual(EncounterRules.SQUAD_MEMBERS, ["Jumper", "WebCaster", "Tunneler", "Spinner"]);
});

function cellKey(point) {
    return `${point.x},${point.y}`;
}

function placementOptions(cells, overrides = {}) {
    const legal = new Set(cells.map(cellKey));
    return {
        width: 40,
        height: 40,
        isMovable: (point) => legal.has(cellKey(point)),
        isOccupied: () => false,
        isOffLimits: () => false,
        isReachable: (point) => legal.has(cellKey(point)),
        random: () => 0,
        ...overrides,
    };
}

function candidateKeys(candidate) {
    return candidate.cells.map(cellKey).sort();
}

test("placement planning enumerates every legal square and never mixes compact fallbacks into tier one", () => {
    const firstSquare = [
        { x: 12, y: 12 },
        { x: 13, y: 12 },
        { x: 12, y: 13 },
        { x: 13, y: 13 },
    ];
    const secondSquare = [
        { x: 20, y: 20 },
        { x: 21, y: 20 },
        { x: 20, y: 21 },
        { x: 21, y: 21 },
    ];
    const fallbackLine = [
        { x: 30, y: 10 },
        { x: 31, y: 10 },
        { x: 32, y: 10 },
        { x: 33, y: 10 },
    ];
    const options = placementOptions([...firstSquare, ...secondSquare, ...fallbackLine], { random: () => 0.99 });

    const squares = EncounterRules.enumerateSquareCandidates(options);
    const plan = EncounterRules.planSquadPlacement(options);

    assert.equal(squares.length, 2);
    assert.deepEqual(squares.map(candidateKeys), [firstSquare.map(cellKey).sort(), secondSquare.map(cellKey).sort()]);
    assert.equal(plan.outcome, "placeable");
    assert.equal(plan.tier, "square");
    assert.equal(plan.candidateCount, 2);
    assert.deepEqual(
        plan.placements.map((placement) => cellKey(placement.cell)).sort(),
        secondSquare.map(cellKey).sort(),
    );
});

test("compact fallback enumeration covers every four-cell corridor window and accepts L shapes", () => {
    const corridor = [12, 13, 14, 15, 16].map((x) => ({ x, y: 12 }));
    const candidates = EncounterRules.enumerateCompactCandidates(placementOptions(corridor));
    assert.deepEqual(candidates.map(candidateKeys), [
        corridor.slice(0, 4).map(cellKey),
        corridor.slice(1, 5).map(cellKey),
    ]);

    const linePlan = EncounterRules.planSquadPlacement(placementOptions(corridor));
    assert.equal(linePlan.tier, "compact");
    assert.deepEqual(
        linePlan.placements.map((placement) => cellKey(placement.cell)).sort(),
        corridor.slice(0, 4).map(cellKey).sort(),
    );

    const lShape = [
        { x: 20, y: 12 },
        { x: 20, y: 13 },
        { x: 20, y: 14 },
        { x: 21, y: 14 },
    ];
    const lPlan = EncounterRules.planSquadPlacement(placementOptions(lShape));
    assert.equal(lPlan.tier, "compact");
    assert.deepEqual(lPlan.placements.map((placement) => cellKey(placement.cell)).sort(), lShape.map(cellKey).sort());
});

test("compact candidates require four distinct connected cells within anchor radius two", () => {
    const line = [
        { x: 12, y: 12 },
        { x: 13, y: 12 },
        { x: 14, y: 12 },
        { x: 15, y: 12 },
    ];
    assert.equal(EncounterRules.isConnectedCandidate(line), true);
    assert.deepEqual(EncounterRules.findCompactAnchor(line), { x: 13, y: 12 });
    assert.equal(EncounterRules.isConnectedCandidate([line[0], line[1], line[2], line[2]]), false);
    assert.equal(EncounterRules.isConnectedCandidate([line[0], line[1], { x: 20, y: 20 }, { x: 21, y: 20 }]), false);
});

test("cell legality applies inclusive diagonal 10/4 safety boundaries", () => {
    const cell = { x: 11, y: 11 };
    const base = placementOptions([cell], {
        player: { x: 1, y: 1 },
        start: { x: 1, y: 1 },
        end: { x: 15, y: 15 },
        shortcuts: [{ x: 15, y: 7 }],
    });

    assert.equal(EncounterRules.isSquadCellLegal(cell, base), true);
    assert.equal(EncounterRules.isSquadCellLegal(cell, { ...base, player: { x: 2, y: 2 } }), false);
    assert.equal(EncounterRules.isSquadCellLegal(cell, { ...base, end: { x: 14, y: 14 } }), false);
    assert.equal(EncounterRules.isSquadCellLegal(cell, { ...base, shortcuts: [{ x: 14, y: 8 }] }), false);
});

test("cell legality rejects the exact occupied, unreachable, avoided, or impassable cell but not a nearby enemy", () => {
    const cell = { x: 12, y: 12 };
    const base = placementOptions([cell]);

    assert.equal(
        EncounterRules.isSquadCellLegal(cell, { ...base, isOccupied: (point) => point.x === 13 && point.y === 12 }),
        true,
    );
    assert.equal(
        EncounterRules.isSquadCellLegal(cell, { ...base, isOccupied: (point) => cellKey(point) === cellKey(cell) }),
        false,
    );
    assert.equal(EncounterRules.isSquadCellLegal(cell, { ...base, isReachable: () => false }), false);
    assert.equal(EncounterRules.isSquadCellLegal(cell, { ...base, isOffLimits: () => true }), false);
    assert.equal(EncounterRules.isSquadCellLegal(cell, { ...base, isMovable: () => false }), false);
    assert.equal(EncounterRules.isSquadCellLegal({ x: 0, y: 12 }, base), false);
});

test("the same seeded random sequence reproduces candidate choice and member assignment", () => {
    const cells = [
        { x: 12, y: 12 },
        { x: 13, y: 12 },
        { x: 12, y: 13 },
        { x: 13, y: 13 },
        { x: 20, y: 20 },
        { x: 21, y: 20 },
        { x: 20, y: 21 },
        { x: 21, y: 21 },
    ];
    const seeded = () => {
        const values = [0.75, 0.1, 0.9, 0.4];
        let index = 0;
        return () => values[index++];
    };
    const first = EncounterRules.planSquadPlacement(placementOptions(cells, { random: seeded() }));
    const second = EncounterRules.planSquadPlacement(placementOptions(cells, { random: seeded() }));

    assert.deepEqual(first, second);
    assert.deepEqual(first.placements.map((placement) => placement.enemy).sort(), [
        "Jumper",
        "Spinner",
        "Tunneler",
        "WebCaster",
    ]);
});

test("placement planning returns unplaceable without a smaller fallback", () => {
    assert.deepEqual(
        EncounterRules.planSquadPlacement(
            placementOptions([
                { x: 12, y: 12 },
                { x: 14, y: 12 },
                { x: 16, y: 12 },
            ]),
        ),
        { outcome: "unplaceable" },
    );
});

test("the squad setting defaults on and the retired one-enemy fallback API stays absent", () => {
    const texts = {};
    const context = loadCoreRuntime({
        addTextKey(key, value) {
            texts[key] = value;
        },
    });
    const toggle = context.KDModConfigs.Spiderlings.find((entry) => entry.refvar === "spiderlingsSquad");

    assert.deepEqual({ type: toggle.type, default: toggle.default }, { type: "boolean", default: true });
    assert.equal(context.KDModSettings.Spiderlings.spiderlingsSquad, true);
    assert.equal(texts.KDModButtonspiderlingsSquad, "Fixed spiderling squad");
    const spinnerEncounters = context.KDModConfigs.Spiderlings.find(
        (entry) => entry.refvar === "spiderlingsSpinnerEncounters",
    );
    assert.deepEqual(
        { type: spinnerEncounters.type, default: spinnerEncounters.default },
        { type: "boolean", default: true },
    );
    assert.equal(context.KDModSettings.Spiderlings.spiderlingsSpinnerEncounters, true);
    assert.equal(texts.KDModButtonspiderlingsSpinnerEncounters, "Autonomous Spinner encounters");
    assert.equal(EncounterRules.planOrdinaryFallback, undefined);
    assert.equal(EncounterRules.ORDINARY_FALLBACK_MAP_FLAG, undefined);
    assert.equal(context.KDEventMapGeneric.postMapgen?.SpiderlingsOrdinaryFallback, undefined);
});

test("nest selection keeps the unchanged 2/2/2/1 defaults", () => {
    assert.deepEqual(EncounterRules.DEFAULT_WEIGHTS, {
        Spinner: 2,
        Jumper: 2,
        WebCaster: 2,
        Tunneler: 1,
    });
    assert.equal(
        EncounterRules.selectWeightedSpiderling({}, () => 0.1),
        "Spinner",
    );
    assert.equal(
        EncounterRules.selectWeightedSpiderling({}, () => 0.3),
        "Jumper",
    );
    assert.equal(
        EncounterRules.selectWeightedSpiderling({}, () => 0.6),
        "WebCaster",
    );
    assert.equal(
        EncounterRules.selectWeightedSpiderling({}, () => 0.95),
        "Tunneler",
    );
});

test("a zero shared weight excludes that Spiderling type", () => {
    assert.equal(
        EncounterRules.selectWeightedSpiderling(
            {
                Spinner: 1,
                Jumper: 0,
                WebCaster: 0,
                Tunneler: 0,
            },
            () => 0.99,
        ),
        "Spinner",
    );
    assert.equal(
        EncounterRules.selectWeightedSpiderling(
            {
                Spinner: 0,
                Jumper: 0,
                WebCaster: 0,
                Tunneler: 0,
            },
            () => 0.5,
        ),
        null,
    );
});

function squadRuntime(overrides = {}) {
    const square = [
        { x: 12, y: 12 },
        { x: 13, y: 12 },
        { x: 12, y: 13 },
        { x: 13, y: 13 },
    ];
    const definitions = Object.fromEntries(
        ["Jumper", "WebCaster", "Tunneler", "Spinner"].map((name) => [
            name,
            { name, AI: name === "Tunneler" ? "wander" : "hunt", marker: `${name}-native` },
        ]),
    );
    const context = loadCoreRuntime({
        KDMapData: {
            Entities: [],
            GridWidth: 20,
            GridHeight: 20,
            StartPosition: { x: 1, y: 1 },
            EndPosition: { x: 18, y: 18 },
            ShortcutPositions: {},
            RandomPathablePoints: Object.fromEntries(square.map((point) => [`${point.x},${point.y}`, point])),
        },
        KinkyDungeonPlayerEntity: { player: true, x: 1, y: 1 },
        MiniGameKinkyDungeonLevel: 1,
        KDGetAltType: () => ({}),
        KDRandom: () => 0,
        KinkyDungeonMovableTilesEnemy: ".",
        KDDefaultAvoidTiles: "X",
        KinkyDungeonMapGet: () => ".",
        KinkyDungeonTilesGet: () => undefined,
        KinkyDungeonGetEnemyByName: (name) => definitions[name],
        KinkyDungeonSummonEnemy(
            x,
            y,
            name,
            _count,
            _radius,
            _strict,
            _lifetime,
            _hidden,
            goToTarget,
            faction,
            hostile,
            _minrad,
            startAware,
            noBullet,
        ) {
            const entity = {
                id: 100 + context.KDMapData.Entities.length,
                x,
                y,
                hp: 5,
                Enemy: definitions[name],
                faction,
                hostile: hostile ? 100 : undefined,
                gx: goToTarget ? 1 : undefined,
                gy: goToTarget ? 1 : undefined,
                aware: startAware || undefined,
                noBullet,
            };
            context.KDMapData.Entities.push(entity);
            return [entity];
        },
        KDRemoveEntity(entity) {
            const index = context.KDMapData.Entities.indexOf(entity);
            if (index >= 0) context.KDMapData.Entities.splice(index, 1);
            return index >= 0;
        },
        ...overrides,
    });
    return { context, definitions, square };
}

test("runtime registration keeps native weights and spawns one complete unaware 2x2 squad", () => {
    const summons = [];
    const natural = { id: 1, x: 11, y: 11, hp: 3, Enemy: { name: "NaturalEnemy" } };
    const { context, definitions, square } = squadRuntime();
    context.KDMapData.Entities.push(natural);
    const originalSummon = context.KinkyDungeonSummonEnemy;
    context.KinkyDungeonSummonEnemy = (...args) => {
        summons.push(args);
        return originalSummon(...args);
    };

    context.Spiderlings.addEnemies([
        { name: "Spinner", weight: 10, tags: { spiderlings: true, minor: true } },
        { name: "NestEntrance", weight: 10, tags: { spiderlings: true } },
    ]);

    assert.equal(context.KinkyDungeonEnemies[0].weight, 12);
    assert.equal(context.KinkyDungeonEnemies[0].tags.minor, undefined);
    assert.equal(context.KinkyDungeonEnemies[1].weight, 2);

    const handler = context.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad;
    assert.equal(typeof handler, "function");
    assert.equal(handler(), true);
    assert.equal(handler(), false);
    assert.equal(summons.length, 4);
    assert.deepEqual(
        summons.map((args) => ({ x: args[0], y: args[1] })),
        square,
    );
    assert.deepEqual(summons.map((args) => args[2]).sort(), ["Jumper", "Spinner", "Tunneler", "WebCaster"]);
    assert.equal(
        summons.every(
            (args) =>
                args[3] === 1 &&
                args[4] === 0 &&
                args[8] === false &&
                args[10] === true &&
                args[12] === false &&
                args[13] === true,
        ),
        true,
    );
    const squad = context.KDMapData.Entities.filter(
        (entity) => entity.SpiderlingsSquadProvenance === "guaranteed-squad",
    );
    assert.deepEqual(squad.map((entity) => entity.Enemy.name).sort(), ["Jumper", "Spinner", "Tunneler", "WebCaster"]);
    assert.deepEqual(
        squad.map((entity) => ({ x: entity.x, y: entity.y })),
        square,
    );
    assert.equal(
        squad.every((entity) => entity.Enemy === definitions[entity.Enemy.name]),
        true,
    );
    assert.equal(
        squad.every(
            (entity) => entity.hostile === 100 && !entity.aware && entity.gx === undefined && entity.gy === undefined,
        ),
        true,
    );
    assert.equal(context.KDMapData.SpiderlingsGuaranteedSquadState, "spawned");
    assert.equal(context.KDMapData.Entities.includes(natural), true);

    context.KDMapData.Entities = [natural];
    assert.equal(handler(), false);
    assert.deepEqual(context.KDMapData.Entities, [natural]);

    const restored = squadRuntime().context;
    restored.KDMapData.SpiderlingsGuaranteedSquadState = "spawned";
    assert.equal(restored.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad(), false);
    assert.equal(restored.KDMapData.Entities.length, 0);
});

test("disabled, excluded, and unplaceable new maps become terminal without backfill", () => {
    for (const room of [{ bossroom: true }, { enemies: false }, { spawns: false }]) {
        const { context } = squadRuntime({ KDGetAltType: () => room });
        const handler = context.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad;
        assert.equal(handler(), false);
        assert.equal(context.KDMapData.SpiderlingsGuaranteedSquadState, "ineligible");
        assert.equal(context.KDMapData.Entities.length, 0);
    }

    const disabled = squadRuntime().context;
    const disabledHandler = disabled.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad;
    disabled.KDModSettings.Spiderlings.spiderlingsSquad = false;
    assert.equal(disabledHandler(), false);
    assert.equal(disabled.KDMapData.SpiderlingsGuaranteedSquadState, "disabled");
    disabled.KDModSettings.Spiderlings.spiderlingsSquad = true;
    assert.equal(disabledHandler(), false);
    assert.equal(disabled.KDMapData.Entities.length, 0);

    const unplaceable = squadRuntime().context;
    unplaceable.KDMapData.RandomPathablePoints = { "12,12": { x: 12, y: 12 } };
    const unplaceableHandler = unplaceable.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad;
    assert.equal(unplaceableHandler(), false);
    assert.equal(unplaceable.KDMapData.SpiderlingsGuaranteedSquadState, "unplaceable");
    assert.equal(unplaceable.KDMapData.Entities.length, 0);
});

test("state-less stored maps have no load or transition hook that can backfill a squad", () => {
    const { context } = squadRuntime();
    const squadRegistrations = [];
    for (const [trigger, handlers] of Object.entries(context.KDEventMapGeneric)) {
        for (const [name, handler] of Object.entries(handlers)) {
            if (name === "SpiderlingsGuaranteedSquad" || handler === context.Spiderlings.runGuaranteedSpiderlingSquad) {
                squadRegistrations.push({ trigger, name });
            }
        }
    }

    assert.deepEqual(squadRegistrations, [{ trigger: "postMapgen", name: "SpiderlingsGuaranteedSquad" }]);
    assert.equal(context.KDMapData.SpiderlingsGuaranteedSquadState, undefined);
    assert.equal(context.KDMapData.Entities.length, 0);
});

test("runtime placement uses a compact corridor only when no legal square exists", () => {
    const { context } = squadRuntime();
    const corridor = [12, 13, 14, 15].map((x) => ({ x, y: 12 }));
    context.KDMapData.RandomPathablePoints = Object.fromEntries(corridor.map((point) => [cellKey(point), point]));

    const handler = context.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad;
    assert.equal(handler(), true);
    const squad = context.KDMapData.Entities.filter(
        (entity) => entity.SpiderlingsSquadProvenance === "guaranteed-squad",
    );
    assert.deepEqual(
        squad.map((entity) => ({ x: entity.x, y: entity.y })).sort((a, b) => a.x - b.x),
        corridor,
    );
    assert.equal(context.KDMapData.SpiderlingsGuaranteedSquadState, "spawned");
});

test("partial creation failure rolls back every new member without events or damage to existing entities", () => {
    const { context } = squadRuntime();
    const natural = { id: 1, x: 11, y: 11, hp: 3, Enemy: { name: "NaturalEnemy" } };
    context.KDMapData.Entities.push(natural);
    const originalSummon = context.KinkyDungeonSummonEnemy;
    let attempts = 0;
    context.KinkyDungeonSummonEnemy = (...args) => {
        attempts += 1;
        return attempts === 3 ? [] : originalSummon(...args);
    };
    const removals = [];
    context.KDRemoveEntity = (entity, kill, capture, noEvent) => {
        removals.push({ entity, kill, capture, noEvent });
        context.KDMapData.Entities.splice(context.KDMapData.Entities.indexOf(entity), 1);
        return true;
    };

    const handler = context.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad;
    assert.equal(handler(), false);
    assert.equal(context.KDMapData.SpiderlingsGuaranteedSquadState, "creation-failed");
    assert.deepEqual(context.KDMapData.Entities, [natural]);
    assert.equal(removals.length, 2);
    assert.equal(
        removals.every((removal) => removal.kill === false && removal.capture === false && removal.noEvent === true),
        true,
    );
    assert.equal(handler(), false);
    assert.equal(attempts, 3);
});

test("runtime validates all member definitions and entity capacity before creating anything", () => {
    const missing = squadRuntime();
    delete missing.definitions.Tunneler;
    let missingAttempts = 0;
    missing.context.KinkyDungeonSummonEnemy = () => {
        missingAttempts += 1;
        return [];
    };
    missing.context.KDRemoveEntity = () => true;
    assert.equal(missing.context.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad(), false);
    assert.equal(missing.context.KDMapData.SpiderlingsGuaranteedSquadState, "creation-failed");
    assert.equal(missingAttempts, 0);

    const full = squadRuntime();
    full.context.KDMapData.Entities = Array.from({ length: 297 }, (_, index) => ({
        id: index + 1,
        x: 30,
        y: 30,
        hp: 1,
        Enemy: { name: "NaturalEnemy" },
    }));
    let fullAttempts = 0;
    full.context.KinkyDungeonSummonEnemy = () => {
        fullAttempts += 1;
        return [];
    };
    full.context.KDRemoveEntity = () => true;
    assert.equal(full.context.KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad(), false);
    assert.equal(full.context.KDMapData.SpiderlingsGuaranteedSquadState, "creation-failed");
    assert.equal(fullAttempts, 0);
    assert.equal(full.context.KDMapData.Entities.length, 297);
});

test("reinforcement settings clamp to the confirmed defaults and ranges", () => {
    assert.equal(ReinforcementRules.DEFAULT_CAP, 6);
    assert.equal(ReinforcementRules.DEFAULT_INTERVAL, 2);
    assert.deepEqual(ReinforcementRules.SPAWN_RADII, [2.5, 5, 7.5]);
    assert.equal(ReinforcementRules.PROXIMITY_RADIUS, 5);
    assert.equal(ReinforcementRules.normalizeCap(undefined), 6);
    assert.equal(ReinforcementRules.normalizeCap("-5"), 6);
    assert.equal(ReinforcementRules.normalizeCap("3.5"), 6);
    assert.equal(ReinforcementRules.normalizeCap("0"), 0);
    assert.equal(ReinforcementRules.normalizeCap("999"), 999);
    assert.equal(ReinforcementRules.normalizeInterval(undefined), 2);
    assert.equal(ReinforcementRules.normalizeInterval(1), 2);
    assert.equal(ReinforcementRules.normalizeInterval(99), 20);

    const context = loadCoreRuntime();
    const configs = context.KDModConfigs.Spiderlings;
    const cap = configs.find((entry) => entry.refvar === "spiderlingsNestReinforcementCap");
    const interval = configs.find((entry) => entry.refvar === "spiderlingsNestReinforcementInterval");
    assert.deepEqual({ type: cap.type, default: cap.default }, { type: "string", default: "6" });
    assert.equal("rangehigh" in cap, false);
    assert.deepEqual(
        { default: interval.default, low: interval.rangelow, high: interval.rangehigh },
        { default: 2, low: 2, high: 20 },
    );
});

test("a qualifying nest attempts on exactly its configured second turn and pauses otherwise", () => {
    const first = ReinforcementRules.advanceTimer({
        timer: 0,
        delta: 1,
        interval: 2,
        cap: 6,
        livingOffspring: 0,
        eligible: true,
    });
    assert.deepEqual(first, { attempt: false, timer: 1 });
    assert.deepEqual(
        ReinforcementRules.advanceTimer({
            timer: first.timer,
            delta: 1,
            interval: 2,
            cap: 6,
            livingOffspring: 0,
            eligible: true,
        }),
        { attempt: true, timer: 2 },
    );
    assert.deepEqual(
        ReinforcementRules.advanceTimer({
            timer: 1,
            delta: 1,
            interval: 2,
            cap: 6,
            livingOffspring: 0,
            eligible: false,
        }),
        { attempt: false, timer: 1 },
    );
});

test("living offspring are counted only for their own parent", () => {
    const field = ReinforcementRules.PARENT_ID_FIELD;
    const entities = [{ [field]: 11, hp: 2 }, { [field]: 11, hp: 0 }, { [field]: 22, hp: 2 }, { hp: 2 }];

    assert.equal(ReinforcementRules.countLivingOffspring(entities, 11), 1);
    assert.equal(ReinforcementRules.countLivingOffspring(entities, 22), 1);
    assert.equal(ReinforcementRules.countLivingOffspring(entities, 33), 0);
});

test("a full cap remains due without resetting the nest timer", () => {
    assert.deepEqual(
        ReinforcementRules.advanceTimer({
            timer: 2,
            delta: 1,
            interval: 2,
            cap: 6,
            livingOffspring: 6,
            eligible: true,
        }),
        { attempt: false, timer: 2 },
    );
    assert.deepEqual(
        ReinforcementRules.advanceTimer({
            timer: 2,
            delta: 1,
            interval: 2,
            cap: 0,
            livingOffspring: 0,
            eligible: true,
        }),
        { attempt: false, timer: 2 },
    );
});

test("runtime reinforcement keeps per-nest timers and parent caps independent", () => {
    const nestA = { id: 11, x: 2, y: 2, hp: 12, aware: true, Enemy: { name: "NestEntrance", visionRadius: 30 } };
    const nestB = { id: 22, x: 8, y: 8, hp: 12, aware: true, Enemy: { name: "NestEntrance", visionRadius: 30 } };
    const summons = [];
    const context = loadCoreRuntime({
        KDMapData: { Entities: [nestA, nestB] },
        KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => true,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy(...args) {
            summons.push(args);
            const child = { id: 100 + summons.length, x: args[0], y: args[1], hp: 1, Enemy: { name: args[2] } };
            context.KDMapData.Entities.push(child);
            return [child];
        },
    });
    const handler = context.KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement;

    assert.equal(handler("event", { allied: false, delta: 1 }), 0);
    assert.equal(handler("event", { allied: false, delta: 1 }), 2);
    assert.equal(summons.length, 2);
    assert.deepEqual(
        summons.map((args) => args.slice(0, 6)),
        [
            [2, 2, "Spinner", 1, 2.5, true],
            [8, 8, "Spinner", 1, 2.5, true],
        ],
    );
    assert.deepEqual(
        context.KDMapData.Entities.slice(-2).map((entity) => entity.SpiderlingsNestParentID),
        [11, 22],
    );
    assert.equal(nestA.SpiderlingsNestReinforcementTimer, 0);
    assert.equal(nestB.SpiderlingsNestReinforcementTimer, 0);
});

function tunnelerCapRuntime() {
    const nest = { id: 11, x: 2, y: 2, hp: 12, aware: true, Enemy: { name: "NestEntrance", visionRadius: 30 } };
    let nextID = 100,
        blocked = false;
    const kd = loadCoreRuntime({
        KDMapData: { Entities: [nest] },
        KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => true,
        KDGetFaction: () => "Enemy",
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy(x, y, name) {
            if (blocked) return [];
            const child = { id: nextID++, x, y, hp: 1, Enemy: { name } };
            kd.KDMapData.Entities.push(child);
            return [child];
        },
    });
    const settings = kd.KDModSettings.Spiderlings;
    for (const species of ["Spinner", "Jumper", "WebCaster"]) settings[`spiderlingsNest${species}Weight`] = 0;
    const tick = () => kd.Spiderlings.runNestReinforcements({}, { allied: false, delta: 2 });
    return {
        kd,
        nest,
        settings,
        tick,
        block: (value) => {
            blocked = value;
        },
    };
}

test("each nest has an independent lifetime Tunneler budget that survives child removal and reload", () => {
    const { kd, nest, settings, tick } = tunnelerCapRuntime();
    assert.equal(kd.Spiderlings.getNestTunnelerCap(), 3);
    for (let count = 1; count <= 3; count++) {
        assert.equal(tick(), 1);
        assert.equal(nest.SpiderlingsNestTunnelerCount, count);
        kd.KDMapData.Entities = [nest]; // Child died or consumed itself to build a nest.
    }
    const restored = JSON.parse(JSON.stringify(nest));
    kd.KDMapData.Entities = [restored];
    assert.equal(tick(), 0);
    const newNest = { ...nest, id: 22, SpiderlingsNestTunnelerCount: undefined };
    kd.KDMapData.Entities.push(newNest);
    assert.equal(tick(), 1);
    assert.equal(restored.SpiderlingsNestTunnelerCount, 3);
    assert.equal(newNest.SpiderlingsNestTunnelerCount, 1);
    kd.KDMapData.Entities = [restored];
    settings.spiderlingsNestSpinnerWeight = 2;
    assert.equal(tick(), 1, "other species still reinforce after the Tunneler budget is exhausted");
    assert.equal(kd.KDMapData.Entities.at(-1).Enemy.name, "Spinner");
    assert.equal(restored.SpiderlingsNestTunnelerCount, 3);
});

test("Tunneler setting changes preserve spent budget and failed attempts spend nothing", () => {
    const { kd, nest, settings, tick, block } = tunnelerCapRuntime();
    settings.spiderlingsNestTunnelerCap = "0";
    assert.equal(tick(), 0);
    settings.spiderlingsNestTunnelerCap = "1";
    block(true);
    assert.equal(tick(), 0);
    assert.equal(nest.SpiderlingsNestTunnelerCount, 0);
    block(false);
    assert.equal(tick(), 1);
    assert.equal(nest.SpiderlingsNestTunnelerCount, 1);
    settings.spiderlingsNestTunnelerCap = "0";
    assert.equal(tick(), 0);
    settings.spiderlingsNestTunnelerCap = "2";
    kd.KDEventMapGeneric.afterModConfig.Spiderlings();
    kd.KDEventMapGeneric.afterModSettingsLoad.Spiderlings();
    assert.equal(tick(), 1);
    assert.equal(nest.SpiderlingsNestTunnelerCount, 2);
    assert.equal(tick(), 0);
    for (const invalid of ["", "bad", "-1", "2.5", "Infinity", "9007199254740992"]) {
        settings.spiderlingsNestTunnelerCap = invalid;
        assert.equal(kd.Spiderlings.getNestTunnelerCap(), 3);
    }
});

test("legacy nests seed their lifetime budget once from attributable Tunnelers", () => {
    const { kd, nest, tick } = tunnelerCapRuntime();
    kd.KDMapData.Entities.push(
        ...[1, 2, 3].map((id) => ({
            id,
            hp: id === 3 ? 0 : 1,
            Enemy: { name: "Tunneler" },
            SpiderlingsNestParentID: nest.id,
        })),
        { id: 4, hp: 1, Enemy: { name: "Tunneler" }, SpiderlingsNestParentID: 99 },
        { id: 5, hp: 1, Enemy: { name: "Spinner" }, SpiderlingsNestParentID: nest.id },
    );
    assert.equal(tick(), 0);
    assert.equal(nest.SpiderlingsNestTunnelerCount, 3);
    kd.KDMapData.Entities = [nest];
    assert.equal(tick(), 0);
    assert.equal(nest.SpiderlingsNestTunnelerCount, 3);
});

test("nearby living hostile nests raise the probability without needing awareness or line of sight", () => {
    function run(chanceRoll) {
        const source = {
            id: 11,
            x: 10,
            y: 10,
            hp: 12,
            aware: true,
            hostile: true,
            SpiderlingsNestReinforcementTimer: 1,
            Enemy: { name: "NestEntrance", visionRadius: 30 },
        };
        const entities = [
            source,
            {
                id: 12,
                x: 13,
                y: 14,
                hp: 12,
                aware: false,
                hostile: true,
                Enemy: { name: "NestEntrance", visionRadius: 30 },
            },
            {
                id: 13,
                x: 15,
                y: 10,
                hp: 12,
                aware: false,
                hostile: true,
                Enemy: { name: "NestEntrance", visionRadius: 30 },
            },
            {
                id: 14,
                x: 16,
                y: 10,
                hp: 12,
                aware: false,
                hostile: true,
                Enemy: { name: "NestEntrance", visionRadius: 30 },
            },
            {
                id: 15,
                x: 10,
                y: 11,
                hp: 0,
                aware: false,
                hostile: true,
                Enemy: { name: "NestEntrance", visionRadius: 30 },
            },
            {
                id: 16,
                x: 10,
                y: 12,
                hp: 12,
                aware: false,
                hostile: false,
                Enemy: { name: "NestEntrance", visionRadius: 30 },
            },
        ];
        const randomValues = [chanceRoll, 0];
        let randomCalls = 0;
        let summons = 0;
        const context = loadCoreRuntime({
            KDMapData: { Entities: entities },
            KinkyDungeonPlayerEntity: { player: true, x: 10, y: 8 },
            KDHostile: (entity) => entity.hostile === true,
            KinkyDungeonCheckLOS: () => true,
            KDistEuclidean: Math.hypot,
            KDGetFaction: () => "Enemy",
            KDRandom() {
                const value = randomValues[randomCalls] ?? 0;
                randomCalls += 1;
                return value;
            },
            KinkyDungeonSummonEnemy(...args) {
                summons += 1;
                return [{ id: 90, hp: 1, Enemy: { name: args[2] } }];
            },
        });
        const handler = context.KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement;
        return { result: handler("event", { allied: false, delta: 1 }), randomCalls, summons, source };
    }

    const below = run(0.349);
    assert.deepEqual(
        { result: below.result, randomCalls: below.randomCalls, summons: below.summons },
        { result: 1, randomCalls: 2, summons: 1 },
    );
    const boundary = run(0.35);
    assert.deepEqual(
        { result: boundary.result, randomCalls: boundary.randomCalls, summons: boundary.summons },
        { result: 0, randomCalls: 1, summons: 0 },
    );
    assert.equal(boundary.source.SpiderlingsNestReinforcementTimer, 0);
});

test("a perceived hostile maid activates nest reinforcement without player awareness or sight", () => {
    const nest = { id: 1, x: 3, y: 3, hp: 12, aware: false, Enemy: { name: "NestEntrance", visionRadius: 30 } };
    const maid = { id: 2, x: 7, y: 3, hp: 8, Enemy: { name: "Maidforce", faction: "Maidforce" } };
    const player = { player: true, x: 40, y: 40 };
    let perceived = maid;
    const c = loadCoreRuntime({
        KDMapData: { Entities: [nest, maid] },
        KinkyDungeonPlayerEntity: player,
        KDHostile: (a, b) => a === nest && (!b || b === maid),
        KDGetFaction: (e) => e.Enemy.faction || "Enemy",
        KinkyDungeonCheckLOS: () => false,
        KinkyDungeonNearestPlayer: () => perceived,
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy: () => [{ id: 3, hp: 1, Enemy: { name: "Spinner" } }],
    });
    const tick = () => c.Spiderlings.runNestReinforcements("afterEnemyTick", { allied: false, delta: 1 });
    assert.equal(tick(), 0);
    assert.equal(tick(), 1);
    perceived = player;
    assert.equal(tick(), 0, "losing the native NPC target pauses the nest");
    perceived = { ...maid, Enemy: { name: "Bandit", faction: "Bandit" } };
    assert.equal(tick(), 0, "other factions require an actual attack");
    perceived = { ...maid, hp: 0 };
    assert.equal(tick(), 0);
    c.KDHostile = () => false;
    perceived = maid;
    assert.equal(tick(), 0, "allied or non-hostile nests retain their existing boundary");
});

test("hostile NPC damage grants one reinforcement interval of alert and preserves timer, chance and caps", () => {
    const nest = { id: 1, hp: 12, x: 3, y: 3, aware: false, flags: {}, Enemy: { name: "NestEntrance" } };
    const attacker = { id: 2, hp: 8, Enemy: { name: "Bandit" } };
    const c = loadCoreRuntime({
        KDMapData: { Entities: [nest] },
        KDHostile: (a, b) => a === nest && (!b || b === attacker),
        KDEnemyHasFlag: (e, flag) => e.flags?.[flag] > 0,
        KinkyDungeonSetEnemyFlag: (e, flag, turns) => {
            e.flags[flag] = turns;
        },
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy: () => [{ id: 3, hp: 1, Enemy: { name: "Spinner" } }],
    });
    const hit = (data) => c.KDEventMapGeneric.afterDamageEnemy.SpiderlingsNestNPCThreat("afterDamageEnemy", data);
    const tick = () => c.Spiderlings.runNestReinforcements("afterEnemyTick", { allied: false, delta: 1 });
    for (const data of [
        { enemy: nest, attacker, aggro: false },
        { enemy: nest, attacker: { player: true }, aggro: true },
        { enemy: nest, attacker: { Enemy: { name: "Friendly" } }, aggro: true },
        { enemy: nest, aggro: true },
    ])
        hit(data);
    assert.deepEqual(nest.flags, {});
    hit({ enemy: nest, attacker, aggro: true });
    assert.equal(nest.flags.SpiderlingsNestNPCThreat, 3);
    assert.equal(tick(), 0, "damage does not immediately summon or skip the interval");
    c.KDRandom = () => 0.15;
    assert.equal(tick(), 0, "the original 15% probability remains effective");
    c.KDRandom = () => 0;
    c.KDModSettings.Spiderlings.spiderlingsNestReinforcementCap = "0";
    assert.equal(tick(), 0);
    c.KDModSettings.Spiderlings.spiderlingsNestReinforcementCap = "6";
    hit({ enemy: nest, attacker, aggro: true });
    assert.equal(tick(), 0);
    assert.equal(tick(), 1);
    nest.flags.SpiderlingsNestNPCThreat = 0;
    assert.equal(tick(), 0, "native flag expiration ends the alert");
    nest.hp = 0;
    hit({ enemy: nest, attacker, aggro: true });
    assert.equal(nest.flags.SpiderlingsNestNPCThreat, 0);
});

test("zero unit weights pause a due timer without consuming RNG and resume immediately", () => {
    const nest = {
        id: 11,
        x: 2,
        y: 2,
        hp: 12,
        aware: true,
        SpiderlingsNestReinforcementTimer: 2,
        Enemy: { name: "NestEntrance", visionRadius: 30 },
    };
    let randomCalls = 0;
    let summons = 0;
    const context = loadCoreRuntime({
        KDMapData: { Entities: [nest] },
        KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => true,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
        KDRandom() {
            randomCalls += 1;
            return 0;
        },
        KinkyDungeonSummonEnemy(...args) {
            summons += 1;
            return [{ id: 90, hp: 1, Enemy: { name: args[2] } }];
        },
    });
    const settings = context.KDModSettings.Spiderlings;
    for (const refvar of [
        "spiderlingsNestSpinnerWeight",
        "spiderlingsNestJumperWeight",
        "spiderlingsNestWebCasterWeight",
        "spiderlingsNestTunnelerWeight",
    ])
        settings[refvar] = 0;
    const handler = context.KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement;

    assert.equal(handler("event", { allied: false, delta: 1 }), 0);
    assert.deepEqual(
        { timer: nest.SpiderlingsNestReinforcementTimer, randomCalls, summons },
        { timer: 2, randomCalls: 0, summons: 0 },
    );

    settings.spiderlingsNestSpinnerWeight = 1;
    assert.equal(handler("event", { allied: false, delta: 1 }), 1);
    assert.deepEqual(
        { timer: nest.SpiderlingsNestReinforcementTimer, randomCalls, summons },
        { timer: 0, randomCalls: 2, summons: 1 },
    );
});

test("strict local reinforcement rejects unfair tiles and uses one reachable empty tile", () => {
    const nest = {
        id: 11,
        x: 2,
        y: 2,
        hp: 12,
        aware: true,
        SpiderlingsNestReinforcementTimer: 1,
        Enemy: { name: "NestEntrance", visionRadius: 30 },
    };
    const player = { player: true, x: 3, y: 3 };
    const occupied = new Set(["3,2"]);
    const candidates = [
        { x: 3, y: 3, walkable: true, reachable: true, reason: "player" },
        { x: 3, y: 2, walkable: true, reachable: true, reason: "occupied" },
        { x: 2, y: 3, walkable: false, reachable: true, reason: "impassable" },
        { x: 4, y: 2, walkable: true, reachable: false, reason: "wall" },
        { x: 6, y: 2, walkable: true, reachable: true, reason: "too far" },
        { x: 2, y: 4, walkable: true, reachable: true, reason: "legal" },
    ];
    const rejected = [];
    let spawnedChild;
    const context = loadCoreRuntime({
        KDMapData: { Entities: [nest] },
        KinkyDungeonPlayerEntity: player,
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => true,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy(x, y, enemyName, count, radius, strict) {
            assert.equal(count, 1);
            assert.equal(radius, 2.5);
            assert.equal(strict, true);
            const selected = candidates.find((candidate) => {
                const legal =
                    Math.hypot(candidate.x - x, candidate.y - y) <= radius &&
                    candidate.walkable &&
                    candidate.reachable &&
                    (candidate.x !== player.x || candidate.y !== player.y) &&
                    !occupied.has(`${candidate.x},${candidate.y}`);
                if (!legal) rejected.push(candidate.reason);
                return legal;
            });
            spawnedChild = selected
                ? { id: 90, x: selected.x, y: selected.y, hp: 1, Enemy: { name: enemyName } }
                : undefined;
            return spawnedChild ? [spawnedChild] : [];
        },
    });
    const handler = context.KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement;

    assert.equal(handler("event", { allied: false, delta: 1 }), 1);
    assert.deepEqual(rejected, ["player", "occupied", "impassable", "wall", "too far"]);
    assert.deepEqual(
        { x: spawnedChild.x, y: spawnedChild.y, parent: spawnedChild.SpiderlingsNestParentID },
        { x: 2, y: 4, parent: 11 },
    );
});

test("full nests remain due while failed spawn searches wait for the next interval", () => {
    const nestA = {
        id: 11,
        x: 2,
        y: 2,
        hp: 12,
        aware: true,
        SpiderlingsNestReinforcementTimer: 2,
        Enemy: { name: "NestEntrance", visionRadius: 30 },
    };
    const nestB = {
        id: 22,
        x: 8,
        y: 8,
        hp: 12,
        aware: true,
        SpiderlingsNestReinforcementTimer: 1,
        Enemy: { name: "NestEntrance", visionRadius: 30 },
    };
    const nestBRadii = [];
    let allowNestB = false;
    const existing = Array.from({ length: 6 }, (_, index) => ({
        id: 30 + index,
        hp: 1,
        SpiderlingsNestParentID: 11,
        Enemy: { name: "Spinner" },
    }));
    const context = loadCoreRuntime({
        KDMapData: { Entities: [nestA, nestB, ...existing] },
        KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => true,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy(...args) {
            if (args[0] === nestA.x) throw new Error("full parent must not summon");
            nestBRadii.push(args[4]);
            if (!allowNestB) return [];
            const child = { id: 99, hp: 1, Enemy: { name: args[2] } };
            context.KDMapData.Entities.push(child);
            return [child];
        },
    });
    const handler = context.KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement;

    assert.equal(handler("event", { allied: false, delta: 1 }), 0);
    assert.equal(nestA.SpiderlingsNestReinforcementTimer, 2);
    assert.equal(nestB.SpiderlingsNestReinforcementTimer, 0);
    assert.deepEqual(nestBRadii, [2.5, 5, 7.5]);

    allowNestB = true;
    assert.equal(handler("event", { allied: false, delta: 1 }), 0);
    assert.equal(handler("event", { allied: false, delta: 1 }), 1);
    assert.deepEqual(nestBRadii, [2.5, 5, 7.5, 2.5]);
    assert.equal(nestB.SpiderlingsNestReinforcementTimer, 0);
});

test("dead, non-hostile, unaware, unseen, or allied-phase nests pause without spawning", () => {
    const cases = [
        { hp: 0, aware: true, hostile: true, lineOfSight: true, allied: false },
        { hp: 12, aware: true, hostile: false, lineOfSight: true, allied: false },
        { hp: 12, aware: false, hostile: true, lineOfSight: true, allied: false },
        { hp: 12, aware: true, hostile: true, lineOfSight: false, allied: false },
        { hp: 12, aware: true, hostile: true, lineOfSight: true, allied: true },
    ];

    for (const current of cases) {
        const nest = {
            id: 11,
            x: 2,
            y: 2,
            hp: current.hp,
            aware: current.aware,
            SpiderlingsNestReinforcementTimer: 4,
            Enemy: { name: "NestEntrance", visionRadius: 30 },
        };
        let summons = 0;
        const context = loadCoreRuntime({
            KDMapData: { Entities: [nest] },
            KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
            KDHostile: () => current.hostile,
            KinkyDungeonCheckLOS: () => current.lineOfSight,
            KDistEuclidean: Math.hypot,
            KinkyDungeonSummonEnemy() {
                summons += 1;
                return [];
            },
        });
        const handler = context.KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement;

        assert.equal(handler("event", { allied: current.allied, delta: 1 }), 0);
        assert.equal(nest.SpiderlingsNestReinforcementTimer, 4);
        assert.equal(summons, 0);
    }
});

test("live interval, cap, and weight changes apply without deleting offspring", () => {
    const nest = {
        id: 11,
        x: 2,
        y: 2,
        hp: 12,
        aware: true,
        SpiderlingsNestReinforcementTimer: 1,
        Enemy: { name: "NestEntrance", visionRadius: 30 },
    };
    const childA = { id: 31, hp: 1, SpiderlingsNestParentID: 11, Enemy: { name: "Spinner" } };
    const childB = { id: 32, hp: 1, SpiderlingsNestParentID: 11, Enemy: { name: "Jumper" } };
    const summons = [];
    const context = loadCoreRuntime({
        KDMapData: { Entities: [nest] },
        KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => true,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy(...args) {
            summons.push(args);
            const child = { id: 90, hp: 1, Enemy: { name: args[2] } };
            context.KDMapData.Entities.push(child);
            return [child];
        },
    });
    const settings = context.KDModSettings.Spiderlings;
    const handler = context.KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement;

    settings.spiderlingsNestReinforcementInterval = 5;
    assert.equal(handler("event", { allied: false, delta: 1 }), 0);
    settings.spiderlingsNestReinforcementInterval = 2;
    settings.spiderlingsNestSpinnerWeight = 0;
    settings.spiderlingsNestJumperWeight = 1;
    settings.spiderlingsNestWebCasterWeight = 0;
    settings.spiderlingsNestTunnelerWeight = 0;
    assert.equal(handler("event", { allied: false, delta: 1 }), 1);
    assert.equal(summons[0][2], "Jumper");

    context.KDMapData.Entities = [nest, childA, childB];
    nest.SpiderlingsNestReinforcementTimer = 2;
    settings.spiderlingsNestReinforcementCap = "1";
    assert.equal(handler("event", { allied: false, delta: 1 }), 0);
    assert.deepEqual(context.KDMapData.Entities, [nest, childA, childB]);
});

test("NestEntrance registration removes recurring spells but preserves death summons", () => {
    const ondeath = [{ type: "summon", enemy: "Spinner", count: 2 }];
    const context = loadCoreRuntime();
    context.Spiderlings.addEnemies([
        {
            name: "NestEntrance",
            weight: 10,
            tags: { spiderlings: true },
            spells: ["SummonSpinner"],
            ondeath,
        },
    ]);

    assert.deepEqual(Array.from(context.KinkyDungeonEnemies[0].spells), []);
    assert.deepEqual(context.KinkyDungeonEnemies[0].ondeath, ondeath);
    assert.equal(ReinforcementRules.countLivingOffspring([{ hp: 1, Enemy: { name: "Spinner" } }], 1), 0);
});

test("every Spiderlings translation CSV includes squad and controlled reinforcement settings", () => {
    const keys = [
        "KDModButtonspiderlingsSquad",
        "KDModButtonspiderlingsSpinnerEncounters",
        "KDModButtonspiderlingsMapPopulationCap",
        "KDModButtonspiderlingsNestReinforcementControl",
        "KDModButtonspiderlingsNestReinforcementCap",
        "KDModButtonspiderlingsNestTunnelerCap",
        "KDModButtonspiderlingsNestReinforcementInterval",
    ];
    for (const language of ["CN", "DE", "ES", "JP", "KR", "PL", "RU"]) {
        const csv = fs.readFileSync(path.join(__dirname, "..", "..", `Spiderlings${language}.csv`), "utf8");
        for (const key of keys) assert.match(csv, new RegExp(`^${key},.+$`, "m"), `${language} is missing ${key}`);
    }
});

function nativePopulationRuntime(overrides = {}) {
    const game = gamePath("Game/src");
    const fight = fs.readFileSync(path.join(game, "fight/KinkyDungeonFight.ts"), "utf8");
    const spawns = fs.readFileSync(path.join(game, "enemy/KinkyDungeonSpawns.ts"), "utf8");
    let nextID = 1;
    const context = loadCoreRuntime(
        {
            KDMapData: { Entities: [], GridWidth: 40, GridHeight: 40 },
            KinkyDungeonPlayerEntity: { x: 1, y: 1 },
            AOECondition: () => true,
            KinkyDungeonMovableTilesEnemy: ".",
            KinkyDungeonGroundTiles: ".",
            KDDefaultAvoidTiles: "X",
            KinkyDungeonMapGet: () => ".",
            KinkyDungeonNoEnemy: () => true,
            KinkyDungeonCheckPath: () => true,
            KDProcessCustomPatron() {},
            KinkyDungeonFindSpell: () => undefined,
            KinkyDungeonSetEnemyFlag() {},
            KinkyDungeonGetEnemyID: () => nextID++,
            KDRandom: () => 0.5,
            KDPerkToggleTags: [],
            KinkyDungeonStatsChoice: new Map(),
            KinkyDungeonNewGame: 0,
            KinkyDungeonGoddessRep: {},
            KDLevelsPerCheckpoint: 10,
            KinkyDungeonGetEnemyByName(name) {
                return typeof name === "string" ? context.KinkyDungeonEnemies.find((e) => e.name === name) : name;
            },
            KDAddNewEntity(entity) {
                context.KDMapData.Entities.push(entity);
                return entity;
            },
            ...overrides,
        },
        [
            fight.slice(
                fight.indexOf("function KinkyDungeonSummonEnemy ("),
                fight.indexOf("function KinkyDungeonBulletDoT("),
            ),
            spawns.slice(
                spawns.indexOf("function KinkyDungeonGetEnemy ("),
                spawns.indexOf("function KDEntityCanBeGuard("),
            ),
            spawns.slice(
                spawns.indexOf("function KinkyDungeonHandleWanderingSpawns("),
                spawns.indexOf("/** The defauilt interval"),
            ),
        ],
    );
    context.Spiderlings.addEnemies(
        ["Spinner", "Jumper", "WebCaster", "Tunneler", "NestEntrance"].map((name) => ({
            name,
            maxhp: 5,
            minLevel: 0,
            allFloors: true,
            weight: 1,
            tags: { spiderlings: true },
            terrainTags: {},
        })),
    );
    return context;
}

test("prison population uses forty as its positive floor, retains higher settings and zero", () => {
    for (const [setting, expected] of [
        ["25", 40],
        ["50", 50],
        ["0", 0],
    ]) {
        const kd = nativePopulationRuntime();
        kd.Spiderlings.Prison = { isPrison: () => true };
        kd.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = setting;
        assert.equal(kd.Spiderlings.getMapPopulationCap(), expected);
        const requested = expected || 55;
        assert.equal(kd.KinkyDungeonSummonEnemy(12, 12, "Spinner", requested, 1).length, requested);
        if (expected) assert.equal(kd.KinkyDungeonSummonEnemy(12, 12, "Jumper", 1, 1).length, 0);
    }
});

test("prison extra nests use a separate live cap even for native batch summons", () => {
    const kd = nativePopulationRuntime();
    kd.Spiderlings.Prison = { isPrison: () => true };
    kd.KDMapData.SpiderlingsPrison = { mainNestIds: Array.from({ length: 10 }, (_, index) => index + 100) };
    for (const id of kd.KDMapData.SpiderlingsPrison.mainNestIds)
        kd.KDMapData.Entities.push({
            id,
            hp: 5,
            Enemy: { name: "NestEntrance" },
        });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsPrisonNest.js"), "utf8"), kd);
    const summon = (count) => kd.KinkyDungeonSummonEnemy(12, 12, "NestEntrance", count, 1);
    assert.equal(summon(7).length, 6);
    assert.equal(summon(1).length, 0);
    kd.KDMapData.Entities.find((enemy) => enemy.id === 1).hp = 0;
    assert.equal(summon(3).length, 1);
    assert.equal(kd.Spiderlings.PrisonNest.livingExtraEntrances(), 6);
    assert.equal(kd.Spiderlings.getMapPopulationCap(), 40, "extra nests do not consume spider population slots");
});

test("all ten hidden hostile main nests reinforce, then one loss reduces their chance", () => {
    const nests = Array.from({ length: 10 }, (_, index) => ({
        id: index + 1,
        x: 36 + [-2, -2, -2, -1, -1, 1, 1, 2, 2, 2][index],
        y: 22 + [-1, 0, 1, -2, 2, -2, 2, -1, 0, 1][index],
        hp: 5,
        aware: false,
        SpiderlingsNestReinforcementTimer: 2,
        Enemy: { name: "NestEntrance", visionRadius: 30 },
    }));
    const kd = loadCoreRuntime({
        KDMapData: { Entities: nests },
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => false,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
        KDRandom: () => 0.999,
        KinkyDungeonSummonEnemy(_x, _y, name) {
            const child = { id: 100 + kd.KDMapData.Entities.length, hp: 1, Enemy: { name } };
            kd.KDMapData.Entities.push(child);
            return [child];
        },
    });
    kd.Spiderlings.Prison = { isPrison: () => true };
    const tick = () => kd.Spiderlings.runNestReinforcements("afterEnemyTick", { allied: false, delta: 1 });
    assert.equal(tick(), 10);
    nests[0].hp = 0;
    for (const nest of nests.slice(1)) nest.SpiderlingsNestReinforcementTimer = 2;
    kd.KDRandom = () => 0.96;
    assert.equal(tick(), 0);
});

test("prison Tunnelers remain eligible beyond the ordinary lifetime quota", () => {
    const nest = {
        id: 10,
        x: 12,
        y: 12,
        hp: 5,
        aware: false,
        SpiderlingsNestReinforcementTimer: 2,
        SpiderlingsNestTunnelerCount: 3,
        Enemy: { name: "NestEntrance", visionRadius: 30 },
    };
    const kd = loadCoreRuntime({
        KDMapData: { Entities: [nest] },
        KDHostile: () => true,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
        KDRandom: () => 0,
        KinkyDungeonSummonEnemy(_x, _y, name) {
            const child = { id: 100 + kd.KDMapData.Entities.length, hp: 1, Enemy: { name } };
            kd.KDMapData.Entities.push(child);
            return [child];
        },
    });
    kd.Spiderlings.Prison = { isPrison: () => true };
    Object.assign(kd.KDModSettings.Spiderlings, {
        spiderlingsNestSpinnerWeight: 0,
        spiderlingsNestJumperWeight: 0,
        spiderlingsNestWebCasterWeight: 0,
        spiderlingsNestTunnelerWeight: 1,
    });
    for (let index = 0; index < 4; index += 1) {
        nest.SpiderlingsNestReinforcementTimer = 2;
        assert.equal(kd.Spiderlings.runNestReinforcements("afterEnemyTick", { allied: false, delta: 1 }), 1);
        kd.KDMapData.Entities.at(-1).hp = 0;
    }
    assert.equal(nest.SpiderlingsNestTunnelerCount, 3);
});

test("the default map cap limits native batch summons and releases slots after death or removal", () => {
    const kd = nativePopulationRuntime();
    const summon = (name, count) => kd.KinkyDungeonSummonEnemy(12, 12, name, count, 1);
    assert.equal(summon("Spinner", 24).length, 24);
    assert.equal(summon("Jumper", 4).length, 1);
    assert.equal(summon("WebCaster", 1).length, 0);
    assert.equal(summon("NestEntrance", 5).length, 5, "nests do not use spider slots");
    kd.KDMapData.Entities[0].hp = 0;
    assert.equal(summon("Tunneler", 2).length, 1);
    kd.KDMapData.Entities.splice(1, 1);
    assert.equal(summon("WebCaster", 2).length, 1);
    assert.equal(summon("Spinner", 1).length, 0);
});

test("native population selection excludes only the four capped species and recovers on a fresh map", () => {
    const kd = nativePopulationRuntime();
    kd.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "1";
    const choose = (...extra) => kd.KinkyDungeonGetEnemy([], 10, "grv", ".", ...extra);
    assert.equal(choose().name, "Jumper");
    kd.KinkyDungeonSummonEnemy(12, 12, "Spinner", 1, 1);
    const existingFilter = ["unrelated"];
    assert.equal(choose(undefined, undefined, undefined, existingFilter).name, "NestEntrance");
    assert.deepEqual(existingFilter, ["unrelated"]);
    kd.KinkyDungeonEnemies.push({
        name: "OtherSpider",
        maxhp: 5,
        minLevel: 0,
        weight: 10,
        tags: { spiderlings: true },
        terrainTags: {},
    });
    assert.equal(choose().name, "OtherSpider", "native and third-party spiders stay eligible");
    kd.KDMapData = { Entities: [], GridWidth: 40, GridHeight: 40 };
    assert.equal(choose().name, "Jumper", "new map has its own full quota");
});

test("a fixed squad is skipped atomically when fewer than four map slots remain", () => {
    const { context: kd } = squadRuntime();
    kd.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "4";
    const existing = { id: 1, x: 5, y: 5, hp: 2, Enemy: { name: "Spinner" } };
    kd.KDMapData.Entities.push(existing);
    assert.equal(kd.Spiderlings.runGuaranteedSpiderlingSquad(), false);
    assert.equal(kd.KDMapData.SpiderlingsGuaranteedSquadState, "population-capped");
    assert.deepEqual(kd.KDMapData.Entities, [existing]);
    kd.KDMapData.Entities = [];
    assert.equal(kd.Spiderlings.runGuaranteedSpiderlingSquad(), false, "no late backfill on a visited map");
    const fresh = squadRuntime().context;
    fresh.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "4";
    assert.equal(fresh.Spiderlings.runGuaranteedSpiderlingSquad(), true);
    assert.equal(fresh.KDMapData.Entities.length, 4);
});

test("multiple nests share the last map slot and a capped nest keeps its due timer", () => {
    const kd = nativePopulationRuntime({
        KDHostile: () => true,
        KinkyDungeonCheckLOS: () => true,
        KDistEuclidean: Math.hypot,
        KDGetFaction: () => "Enemy",
    });
    kd.KDRandom = () => 0.01;
    kd.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "1";
    const nestDefinition = kd.KinkyDungeonGetEnemyByName("NestEntrance");
    nestDefinition.visionRadius = 30;
    const nests = [1, 2].map((id) => ({
        id: 100 + id,
        x: 12,
        y: 12,
        hp: 12,
        aware: true,
        Enemy: nestDefinition,
        SpiderlingsNestReinforcementTimer: 2,
    }));
    kd.KDMapData.Entities.push(...nests);
    const tick = () => kd.Spiderlings.runNestReinforcements("afterEnemyTick", { allied: false, delta: 1 });
    assert.equal(tick(), 1);
    assert.equal(nests[1].SpiderlingsNestReinforcementTimer, 2);
    assert.equal(kd.KDMapData.Entities.length, 3);
    let randomCalls = 0;
    kd.KDRandom = () => {
        randomCalls++;
        return 0.01;
    };
    assert.equal(tick(), 0);
    assert.equal(randomCalls, 0, "full map does not roll a failed summon");
    kd.KDMapData.Entities.find((e) => e.Enemy.name === "Spinner").hp = 0;
    nests[0].aware = false;
    assert.equal(tick(), 1);
    const child = kd.KDMapData.Entities.find((e) => e.Enemy.name === "Spinner" && e.hp > 0);
    assert.equal(child.SpiderlingsNestParentID, nests[1].id);
});

test("native wandering respawn queues stop at the map cap without consuming deferred spiders", () => {
    const kd = nativePopulationRuntime({
        console: { log() {} },
        MiniGameKinkyDungeonLevel: 10,
        KinkyDungeonDifficulty: 0,
        KinkyDungeonBossFloor: () => undefined,
        KDGameData: { SleepTurns: 0, HunterTimer: 20 },
        KinkyDungeonTotalSleepTurns: 100,
        KinkyDungeonSearchTimer: 100,
        KinkyDungeonSearchTimerMin: 60,
        KinkyDungeonSearchStartAmount: 30,
        KinkyDungeonSearchHuntersAmount: 90,
        KinkyDungeonSearchEntranceAdjustAmount: 130,
        KinkyDungeonSearchEntranceChaseAmount: 160,
        KinkyDungeonFirstSpawn: false,
        KinkyDungeonAggressive: () => true,
        KDFactionRelation: () => 1,
        KDistChebyshev: (x, y) => Math.max(Math.abs(x), Math.abs(y)),
        KinkyDungeonVisionGet: () => 0,
        KinkyDungeonAddTags() {},
        KDCurrIndex: () => "grv",
        KinkyDungeonMakeGhostDecision() {},
        KinkyDungeonGetNearbyPoint: () => ({ x: 12, y: 12 }),
        KinkyDungeonGetShopForEnemy: () => undefined,
    });
    kd.KDRandom = () => 0.01;
    kd.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "1";
    kd.KDMapData.StartPosition = { x: 30, y: 30 };
    kd.KDMapData.EndPosition = { x: 35, y: 35 };
    kd.KDMapData.RespawnQueue = ["Spinner", "Jumper", "WebCaster"].map((enemy) => ({ enemy, faction: "Enemy" }));
    kd.KinkyDungeonHandleWanderingSpawns(1);
    assert.equal(kd.KDMapData.Entities.length, 1);
    assert.deepEqual(
        kd.KDMapData.RespawnQueue.map((entry) => entry.enemy),
        ["Jumper", "WebCaster"],
    );
    assert.equal(
        kd.KinkyDungeonGetEnemyByName("Spinner").name,
        "Spinner",
        "ordinary definition lookup remains available at cap",
    );
});

test("new settings allow exactly 25 living spiders by default", () => {
    const kd = nativePopulationRuntime();
    assert.equal(kd.Spiderlings.getMapPopulationCap(), 25);
    assert.equal(kd.KinkyDungeonSummonEnemy(12, 12, "Spinner", 30, 1).length, 25);
    assert.equal(kd.KinkyDungeonSummonEnemy(12, 12, "Tunneler", 1, 1).length, 0);
    kd.KDMapData.Entities[0].hp = 0;
    assert.equal(kd.KinkyDungeonSummonEnemy(12, 12, "Tunneler", 1, 1).length, 1);
});

test("map cap settings persist, accept zero as unlimited and preserve existing over-cap populations", () => {
    const kd = nativePopulationRuntime();
    const config = kd.KDModConfigs.Spiderlings.find(
        (entry) => entry.type === "string" && entry.refvar === "spiderlingsMapPopulationCap",
    );
    assert.equal(config.default, "25");
    const settings = kd.KDModSettings.Spiderlings;
    const summon = (count) => kd.KinkyDungeonSummonEnemy(12, 12, "Spinner", count, 1);
    settings.spiderlingsMapPopulationCap = "0";
    assert.equal(summon(25).length, 25);
    settings.spiderlingsMapPopulationCap = "12";
    kd.KDEventMapGeneric.afterModConfig.Spiderlings();
    kd.KDEventMapGeneric.afterModSettingsLoad.Spiderlings();
    assert.equal(settings.spiderlingsMapPopulationCap, "12");
    assert.equal(kd.KDMapData.Entities.length, 25, "lowering the cap does not remove living spiders");
    assert.equal(summon(1).length, 0);
    for (const invalid of ["", "abc", "-1", "2.5", "Infinity", "9007199254740992"]) {
        settings.spiderlingsMapPopulationCap = invalid;
        assert.equal(kd.Spiderlings.getMapPopulationCap(), 25);
    }
    const restored = nativePopulationRuntime({
        KDModSettings: { Spiderlings: { spiderlingsMapPopulationCap: "2" } },
        KDMapData: {
            Entities: [
                { id: 80, hp: 2, faction: "Player", Enemy: { name: "Spinner" } },
                { id: 81, hp: 2, Enemy: "Jumper" },
            ],
            GridWidth: 40,
            GridHeight: 40,
        },
    });
    assert.equal(restored.KinkyDungeonSummonEnemy(12, 12, "Tunneler", 1, 1).length, 0);
    restored.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "3";
    assert.equal(restored.KinkyDungeonSummonEnemy(12, 12, "Tunneler", 1, 1).length, 1);
});

test("native nest death bursts use only remaining slots across all three summon entries", () => {
    const kd = nativePopulationRuntime({
        KDMapInit: (values) => Object.fromEntries(values.map((value) => [value, true])),
        addTextKey() {},
        KinkyDungeonRefreshRestraintsCache() {},
        KinkyDungeonRefreshEnemiesCache() {},
        KDGetFaction: () => "Enemy",
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../Spiderlings.js"), "utf8"), kd);
    const list = fs.readFileSync(gamePath("Game/src/enemy/KinkyDungeonEnemiesList.ts"), "utf8");
    const start = list.indexOf('"summon":', list.indexOf("let KDOndeath:"));
    const handler = list.slice(start, list.indexOf('"dialogue":', start));
    vm.runInContext(stripTypeScriptTypes(`globalThis.nativeDeath = {${handler}};`), kd);
    kd.KDModSettings.Spiderlings.spiderlingsMapPopulationCap = "3";
    kd.KinkyDungeonSummonEnemy(12, 12, "WebCaster", 1, 1);
    const nest = { x: 12, y: 12, hp: 0, Enemy: kd.KinkyDungeonGetEnemyByName("NestEntrance") };
    for (const entry of nest.Enemy.ondeath) kd.nativeDeath.summon(nest, entry, kd.KDMapData);
    assert.deepEqual(
        kd.KDMapData.Entities.map((e) => e.Enemy.name),
        ["WebCaster", "Spinner", "Spinner"],
    );
});
