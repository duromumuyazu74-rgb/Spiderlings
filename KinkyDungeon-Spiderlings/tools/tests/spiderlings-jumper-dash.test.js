"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { gamePath } = require("../reference-inputs.js");

const modRoot = path.join(__dirname, "..", "..");
const kdEnemyLoopPath = gamePath("Game", "src", "enemy", "KinkyDungeonEnemies.ts");

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function loadDefinitions(options = {}) {
    const context = {
        console,
        globalThis: null,
        window: null,
        KinkyDungeonEnemies: [],
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDModConfigs: {},
        KDModSettings: {},
        KDMapInit(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        KinkyDungeonAddRestraintText() {},
        addTextKey() {},
        KinkyDungeonRefreshRestraintsCache() {},
        KinkyDungeonRefreshEnemiesCache() {},
        ...options.globals,
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    const files = ["SpiderlingsCore.js", "Spiderlings.js", "SpiderlingsCombat.js"];
    if (fs.existsSync(path.join(modRoot, "SpiderlingsJumperDash.js"))) files.push("SpiderlingsJumperDash.js");
    for (const file of files) {
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    }
    return context;
}

function kd55SpellModeGate(enemy, AIData) {
    const source = fs.readFileSync(kdEnemyLoopPath, "utf8");
    const match = source.match(
        /&& !AIData\.ignore && (?<gate>\(!AIData\.moved \|\| enemy\.Enemy\.castWhileMoving\) && enemy\.Enemy\.attack\.includes\("Spell"\))\s*&& !AIData\.ignoreRanged/,
    );
    assert.ok(match, "KD 5.5 enemy spell-loop mode gate must remain discoverable");
    return Function("enemy", "AIData", `return ${match.groups.gate};`)(enemy, AIData);
}

test("Jumper can enter the KD 5.5 enemy spell loop", () => {
    const context = loadDefinitions();
    const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === "Jumper");
    assert.ok(definition);

    const jumper = { Enemy: definition };
    const waiting = { moved: false, ignore: false, ignoreRanged: false };
    assert.equal(
        kd55SpellModeGate(jumper, waiting),
        true,
        "a registered Dash name is unreachable unless Jumper's attack mode passes KD 5.5's real spell-loop gate",
    );
});

test("Jumper can enter the spell loop after moving in the same enemy action", () => {
    const context = loadDefinitions();
    const definition = context.KinkyDungeonEnemies.find((enemy) => enemy.name === "Jumper");
    assert.equal(kd55SpellModeGate({ Enemy: definition }, { moved: true, ignore: false, ignoreRanged: false }), true);
});

test("Dash spell delegates the greater-than-two through four targeting contract to its lifecycle", () => {
    const context = loadDefinitions();
    const dash = context.KinkyDungeonSpellListEnemies.find((spell) => spell.name === "SpiderlingsJumperDash");
    assert.equal(dash.minRange, 2);
    assert.equal(dash.castRange, 4);
    assert.equal(dash.range, 4);
    assert.equal(dash.specialCD, 5);
    assert.equal(dash.castCondition, "SpiderlingsJumperDash");
    assert.equal(dash.noCastMsg, true);
    assert.deepEqual(plain(dash.playerEffect), {});
});

test("Dash start uses the exclusive two-tile and inclusive four-tile physical window", () => {
    const context = loadDefinitions();
    const source = { id: 7, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper" } };
    const world = {
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: (_source, target) => [{ x: target.x, y: target.y }],
    };
    const controller = context.Spiderlings.JumperDash.createController(world);

    assert.equal(controller.canStart(source, { x: 2, y: 0 }), false);
    assert.equal(controller.canStart(source, { x: 3, y: 0 }), true);
    assert.equal(controller.canStart(source, { x: 4, y: 0 }), true);
    assert.equal(controller.canStart(source, { x: 5, y: 0 }), false);
    const coolingDown = context.Spiderlings.JumperDash.createController({ ...world, isCooldownReady: () => false });
    assert.equal(coolingDown.canStart(source, { x: 3, y: 0 }), false);
});

test("Cocoon dispersal cancels a winding Dash and prevents a new cast until activity resumes", () => {
    const context = loadDefinitions();
    const source = { id: 8, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper" } };
    let suppressed = false;
    let cleared = 0;
    const controller = context.Spiderlings.JumperDash.createController({
        isSuppressed: () => suppressed,
        landingCandidates: () => [{ x: 3, y: 0 }],
        clearWarning: () => cleared++,
    });
    assert.equal(controller.begin(source, { x: 4, y: 0 }).started, true);
    suppressed = true;
    assert.equal(controller.canStart(source, { x: 4, y: 0 }), false);
    assert.equal(controller.advancePlayerAction()[0].outcome, "cancelled");
    assert.equal(cleared, 1);
    assert.equal(controller.snapshot().length, 0);
    suppressed = false;
    assert.equal(controller.canStart(source, { x: 4, y: 0 }), true);
});

test("Dash locks one tile, starts five-turn cooldown, and creates one purple warning and message", () => {
    const context = loadDefinitions();
    const source = { id: 8, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper" } };
    const target = { x: 4, y: 0 };
    const calls = { cooldowns: [], warnings: [], messages: [] };
    const world = {
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: (_source, locked) => [{ ...locked }],
        startCooldown: (_source, turns) => calls.cooldowns.push(turns),
        addWarning: (state) => calls.warnings.push({ target: { ...state.target }, color: state.warningColor }),
        announce: (state) => calls.messages.push(state.sourceId),
    };
    const controller = context.Spiderlings.JumperDash.createController(world);

    assert.equal(controller.begin(source, target).started, true);
    target.x = 3;
    assert.deepEqual(plain(controller.snapshot()), [{ sourceId: 8, target: { x: 4, y: 0 }, opportunities: 0 }]);
    assert.equal(controller.begin(source, { x: 3, y: 0 }).started, false, "one wind-up cannot retarget");
    assert.deepEqual(calls.cooldowns, [5]);
    assert.deepEqual(calls.warnings, [{ target: { x: 4, y: 0 }, color: "#ff66ff" }]);
    assert.deepEqual(calls.messages, [8]);
});

test("Dash resolves only after two complete player actions and lands before one certain contact payload", () => {
    const context = loadDefinitions();
    const source = { id: 9, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper" } };
    const target = { x: 4, y: 0 };
    const calls = { routes: 0, moves: [], damage: [], progress: 0, consumed: 0, cleared: 0 };
    const world = {
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => {
            calls.routes += 1;
            return true;
        },
        landingCandidates: () => [{ x: 3, y: 0 }],
        startCooldown() {},
        addWarning() {},
        announce() {},
        clearWarning: () => {
            calls.cleared += 1;
        },
        findSource: () => source,
        isPlayerAt: (locked) => locked.x === 4 && locked.y === 0,
        moveSource: (enemy, landing) => {
            enemy.x = landing.x;
            enemy.y = landing.y;
            calls.moves.push({ ...landing });
        },
        damagePlayer: (_enemy, damage) => calls.damage.push({ ...damage }),
        progressWebbing: () => {
            calls.progress += 1;
            return { progressed: true };
        },
        consumeSource: (enemy) => {
            enemy.hp = 0;
            calls.consumed += 1;
        },
    };
    const controller = context.Spiderlings.JumperDash.createController(world);
    assert.equal(controller.begin(source, target).started, true);

    assert.deepEqual(plain(controller.advancePlayerAction()), []); // initiation enemy action is not a reaction opportunity
    assert.equal(controller.snapshot()[0].opportunities, 0);
    assert.deepEqual(plain(controller.advancePlayerAction()), []); // first complete player action
    assert.equal(controller.snapshot()[0].opportunities, 1);
    assert.deepEqual(plain(controller.advancePlayerAction()), [{ sourceId: 9, outcome: "hit-progressed" }]);
    assert.deepEqual(calls.moves, [{ x: 3, y: 0 }]);
    assert.deepEqual(calls.damage, [{ damage: 0.1, type: "tickle" }]);
    assert.equal(calls.progress, 1);
    assert.equal(calls.consumed, 1);
    assert.equal(calls.cleared, 1);
    assert.ok(calls.routes >= 2, "physical route is checked at start and again at resolution");
    assert.deepEqual(plain(controller.advancePlayerAction()), [], "resolved Dash cannot repeat");
});

test("KD pre-started special cooldown still commits enemyCast into the visible Dash lifecycle", () => {
    const source = { id: 10, x: 0, y: 0, hp: 2, aware: true, Enemy: { name: "Jumper" } };
    const player = { id: 1, x: 4, y: 0, player: true };
    const bullets = [{ bullet: { source: 10, spell: { name: "SpiderlingsJumperDash" } } }];
    const warnings = [];
    const messages = [];
    const damages = [];
    const physicalPathChecks = [];
    let progressCalls = 0;
    const genericEvents = {};
    const castConditions = {};
    const context = loadDefinitions({
        globals: {
            KDEventMapGeneric: genericEvents,
            KDCastConditions: castConditions,
            KDPlayerEffects: {
                SpiderlingsWebbingEnemyBind() {
                    progressCalls += 1;
                    return { effect: true };
                },
            },
            KDMapData: { Entities: [source], Bullets: bullets },
            KinkyDungeonPlayerEntity: player,
            KinkyDungeonExtraWarningTiles: warnings,
            KinkyDungeonMovableTilesSmartEnemy: ".D",
            KDBaseWhite: "#ffffff",
            KDAddEvent(map, trigger, type, handler) {
                map[trigger] = map[trigger] || {};
                map[trigger][type] = handler;
            },
            KinkyDungeonMapGet: () => ".",
            KinkyDungeonEnemyAt: (x, y) => [source].find((entity) => entity.x === x && entity.y === y),
            KinkyDungeonCheckPath: (...args) => {
                physicalPathChecks.push(args);
                return true;
            },
            KinkyDungeonCheckProjectileClearance: () => true,
            KDCanDetect: () => true,
            KDEnemyReallyAware: () => true,
            KinkyDungeonDealDamage: (damage) => {
                damages.push({ ...damage });
                return { happened: 1 };
            },
            KinkyDungeonSendTextMessage: (_priority, text) => {
                messages.push(text);
                return true;
            },
            TextGet: (key) => key,
        },
    });
    source.Enemy = context.KinkyDungeonEnemies.find((enemy) => enemy.name === "Jumper");
    const dash = context.KinkyDungeonSpellListEnemies.find((spell) => spell.name === "SpiderlingsJumperDash");

    assert.equal(castConditions.SpiderlingsJumperDash(source, player, dash), true);
    assert.ok(physicalPathChecks.length > 0);
    assert.deepEqual(physicalPathChecks[0], [0, 0, 4, 0, false, true, 1, false]);
    source.castCooldownSpecial = dash.specialCD; // KD 5.5 sets this before it sends enemyCast.
    genericEvents.enemyCast.SpiderlingsJumperDash("enemyCast", { spell: dash, enemy: source, player, tx: 4, ty: 0 });
    assert.equal(source.castCooldownSpecial, 5);
    assert.equal(
        context.KDMapData.Bullets.length,
        0,
        "the inert transport bullet cannot resolve a second remote effect",
    );
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].warning.color, "#ff66ff");
    assert.deepEqual([warnings[0].warning.x, warnings[0].warning.y], [4, 0]);
    assert.deepEqual(messages, ["KinkyDungeonSpellCastSpiderlingsJumperDash"]);

    source.immobile = 0; // KD 5.5 decays timed statuses before beforeEnemyLoop.
    genericEvents.beforeEnemyLoop.SpiderlingsJumperDash("beforeEnemyLoop", { enemy: source });
    assert.equal(source.immobile, 1, "the winding Jumper is held for this enemy action");
    assert.deepEqual([source.x, source.y], [0, 0]);

    genericEvents.tickAfter.SpiderlingsJumperDash("tickAfter", { delta: 1 });
    genericEvents.tickAfter.SpiderlingsJumperDash("tickAfter", { delta: 1 });
    assert.deepEqual([source.x, source.y], [0, 0]);
    genericEvents.tickAfter.SpiderlingsJumperDash("tickAfter", { delta: 1 });
    assert.deepEqual([source.x, source.y], [3, 0]);
    assert.deepEqual(damages, [{ damage: 0.1, type: "tickle" }]);
    assert.equal(progressCalls, 1);
    assert.equal(source.hp, 0);
    assert.equal(warnings.length, 0);

    source.immobile = 0;
    genericEvents.beforeEnemyLoop.SpiderlingsJumperDash("beforeEnemyLoop", { enemy: source });
    assert.equal(source.immobile, 0, "the resolved Dash no longer blocks normal movement");
});

test("death, removal, stun, and freeze cancel immediately while slow, bind, and silence do not", () => {
    const context = loadDefinitions();
    const sources = new Map();
    const cleared = [];
    const world = {
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: (_source, target) => [{ ...target }],
        startCooldown() {},
        addWarning() {},
        announce() {},
        clearWarning: (state) => cleared.push(state.sourceId),
        findSource: (id) => sources.get(id),
    };
    const controller = context.Spiderlings.JumperDash.createController(world);
    for (const id of [20, 21, 22, 23, 24, 25, 26]) {
        const source = { id, x: 0, y: id, hp: 2, Enemy: { name: "Jumper" } };
        sources.set(id, source);
        assert.equal(controller.begin(source, { x: 3, y: id }).started, true);
    }
    sources.get(20).hp = 0;
    sources.delete(21);
    sources.get(22).stun = 1;
    sources.get(23).freeze = 1;
    sources.get(24).slow = 5;
    sources.get(25).bind = 5;
    sources.get(26).silence = 5;

    assert.deepEqual(plain(controller.auditSources()), [
        { sourceId: 20, outcome: "cancelled" },
        { sourceId: 21, outcome: "cancelled" },
        { sourceId: 22, outcome: "cancelled" },
        { sourceId: 23, outcome: "cancelled" },
    ]);
    assert.deepEqual(
        plain(controller.snapshot()).map((state) => state.sourceId),
        [24, 25, 26],
    );
    assert.deepEqual(cleared, [20, 21, 22, 23]);
    for (const id of [20, 21, 22, 23, 24, 25, 26]) {
        assert.equal(sources.get(id)?.castCooldownSpecial ?? 5, 5, "cancellation never refunds the start cooldown");
    }
});

test("the player action that disables a Jumper cancels before that action can resolve its Dash", () => {
    const context = loadDefinitions();
    const source = { id: 27, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper", fullBoundBonus: 2 } };
    let payloads = 0;
    const cleared = [];
    const controller = context.Spiderlings.JumperDash.createController({
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: () => [{ x: 3, y: 0 }],
        startCooldown() {},
        addWarning() {},
        announce() {},
        clearWarning: (state) => cleared.push(state.sourceId),
        findSource: () => source,
        isPlayerAt: () => true,
        moveSource: () => {
            payloads += 1;
        },
        progressWebbing: () => {
            payloads += 1;
            return { progressed: true };
        },
        damagePlayer: () => {
            payloads += 1;
        },
    });
    controller.begin(source, { x: 4, y: 0 });
    controller.advancePlayerAction(); // initiation tick
    controller.advancePlayerAction(); // first reaction opportunity
    source.stun = 1;

    assert.deepEqual(plain(controller.advancePlayerAction()), [{ sourceId: 27, outcome: "cancelled" }]);
    assert.equal(payloads, 0);
    assert.deepEqual(cleared, [27]);
    assert.deepEqual(plain(controller.snapshot()), []);
});

test("leaving the locked tile during either reaction opportunity evades while Jumper lands on that tile and remains", () => {
    const context = loadDefinitions();
    for (const leaveAfterActions of [0, 1]) {
        const source = { id: 30 + leaveAfterActions, x: 0, y: leaveAfterActions, hp: 2, Enemy: { name: "Jumper" } };
        let playerAtTarget = true;
        let payloads = 0;
        const world = {
            isCooldownReady: () => true,
            canSense: () => true,
            routeClear: () => true,
            landingCandidates: (_source, target) => [{ ...target }],
            startCooldown() {},
            addWarning() {},
            announce() {},
            clearWarning() {},
            findSource: () => source,
            isPlayerAt: () => playerAtTarget,
            moveSource: (enemy, landing) => {
                enemy.x = landing.x;
                enemy.y = landing.y;
            },
            damagePlayer: () => {
                payloads += 1;
            },
            progressWebbing: () => {
                payloads += 1;
                return { progressed: true };
            },
            consumeSource: () => {
                payloads += 1;
            },
        };
        const controller = context.Spiderlings.JumperDash.createController(world);
        controller.begin(source, { x: 4, y: leaveAfterActions });
        controller.advancePlayerAction(); // initiation tick
        if (leaveAfterActions === 0) playerAtTarget = false;
        controller.advancePlayerAction(); // first opportunity
        if (leaveAfterActions === 1) playerAtTarget = false;
        const result = controller.advancePlayerAction(); // second opportunity and resolution
        assert.deepEqual(plain(result), [{ sourceId: source.id, outcome: "evaded" }]);
        assert.deepEqual([source.x, source.y], [4, leaveAfterActions]);
        assert.equal(source.hp, 2);
        assert.equal(payloads, 0);
        assert.equal(
            source.castCooldownSpecial,
            undefined,
            "the test world does not refund or rewrite the already-started cooldown",
        );
    }
});

test("dynamic route blocking or loss of every legal landing fails in place without a remote payload", () => {
    const context = loadDefinitions();
    for (const failure of ["route", "landing"]) {
        const source = { id: failure === "route" ? 40 : 41, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper" } };
        let resolving = false;
        let payloads = 0;
        const world = {
            isCooldownReady: () => true,
            canSense: () => true,
            routeClear: () => !(resolving && failure === "route"),
            landingCandidates: (_source, target) =>
                resolving && failure === "landing" ? [] : [{ x: target.x - 1, y: target.y }],
            startCooldown() {},
            addWarning() {},
            announce() {},
            clearWarning() {},
            findSource: () => source,
            isPlayerAt: () => true,
            moveSource: () => {
                payloads += 1;
            },
            damagePlayer: () => {
                payloads += 1;
            },
            progressWebbing: () => {
                payloads += 1;
                return { progressed: true };
            },
        };
        const controller = context.Spiderlings.JumperDash.createController(world);
        controller.begin(source, { x: 4, y: 0 });
        controller.advancePlayerAction();
        controller.advancePlayerAction();
        resolving = true;
        assert.deepEqual(plain(controller.advancePlayerAction()), [{ sourceId: source.id, outcome: "failed" }]);
        assert.deepEqual([source.x, source.y], [0, 0]);
        assert.equal(source.hp, 2);
        assert.equal(payloads, 0);
    }
});

test("a no-progress hit lands, retains Jumper, and applies only the fixed light damage in that same impact", () => {
    const context = loadDefinitions();
    const source = { id: 42, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper", fullBoundBonus: 2 } };
    const damages = [];
    let progressCalls = 0;
    let consumeCalls = 0;
    const world = {
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: () => [{ x: 3, y: 0 }],
        startCooldown() {},
        addWarning() {},
        announce() {},
        clearWarning() {},
        findSource: () => source,
        isPlayerAt: () => true,
        moveSource: (enemy, landing) => {
            enemy.x = landing.x;
            enemy.y = landing.y;
        },
        damagePlayer: (_enemy, damage) => damages.push({ ...damage }),
        progressWebbing: () => {
            progressCalls += 1;
            return { progressed: false };
        },
        consumeSource: () => {
            consumeCalls += 1;
        },
    };
    const controller = context.Spiderlings.JumperDash.createController(world);
    controller.begin(source, { x: 4, y: 0 });
    controller.advancePlayerAction();
    controller.advancePlayerAction();
    assert.deepEqual(plain(controller.advancePlayerAction()), [{ sourceId: 42, outcome: "hit-no-progress" }]);
    assert.deepEqual([source.x, source.y], [3, 0]);
    assert.deepEqual(damages, [{ damage: 0.1, type: "tickle" }]);
    assert.equal(progressCalls, 1);
    assert.equal(consumeCalls, 0);
    assert.equal(source.hp, 2);
});

test("multiple Jumpers keep independent targets, warnings, and two-action clocks", () => {
    const context = loadDefinitions();
    const sources = new Map([
        [50, { id: 50, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper" } }],
        [51, { id: 51, x: 0, y: 5, hp: 2, Enemy: { name: "Jumper" } }],
    ]);
    const warnings = new Set();
    const world = {
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: (_source, target) => [{ ...target }],
        startCooldown() {},
        announce() {},
        addWarning: (state) => warnings.add(state.sourceId),
        clearWarning: (state) => warnings.delete(state.sourceId),
        findSource: (id) => sources.get(id),
        isPlayerAt: () => false,
        moveSource: (source, landing) => {
            source.x = landing.x;
            source.y = landing.y;
        },
    };
    const controller = context.Spiderlings.JumperDash.createController(world);
    controller.begin(sources.get(50), { x: 3, y: 0 });
    controller.advancePlayerAction();
    controller.advancePlayerAction();
    controller.begin(sources.get(51), { x: 3, y: 5 });
    assert.deepEqual(plain(controller.advancePlayerAction()), [{ sourceId: 50, outcome: "evaded" }]);
    assert.deepEqual([...warnings], [51]);
    assert.deepEqual([sources.get(50).x, sources.get(50).y], [3, 0]);
    assert.deepEqual([sources.get(51).x, sources.get(51).y], [0, 5]);
    controller.advancePlayerAction();
    assert.deepEqual(plain(controller.advancePlayerAction()), [{ sourceId: 51, outcome: "evaded" }]);
    assert.deepEqual([sources.get(51).x, sources.get(51).y], [3, 5]);
    assert.equal(warnings.size, 0);
});

test("same-tick landing contention revalidates occupancy in order and never stacks or attacks remotely", () => {
    const context = loadDefinitions();
    const first = { id: 52, x: 0, y: 1, hp: 2, Enemy: { name: "Jumper", fullBoundBonus: 2 } };
    const second = { id: 53, x: 1, y: 0, hp: 2, Enemy: { name: "Jumper", fullBoundBonus: 2 } };
    const sources = new Map([
        [52, first],
        [53, second],
    ]);
    const occupied = new Set();
    const damages = [];
    const world = {
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: () => (occupied.has("3,1") ? [] : [{ x: 3, y: 1 }]),
        startCooldown() {},
        addWarning() {},
        announce() {},
        clearWarning() {},
        findSource: (id) => sources.get(id),
        isPlayerAt: () => true,
        moveSource: (source, landing) => {
            source.x = landing.x;
            source.y = landing.y;
            occupied.add(`${landing.x},${landing.y}`);
        },
        progressWebbing: () => ({ progressed: false }),
        damagePlayer: (source) => damages.push(source.id),
    };
    const controller = context.Spiderlings.JumperDash.createController(world);
    controller.begin(first, { x: 4, y: 1 });
    controller.begin(second, { x: 4, y: 1 });
    controller.advancePlayerAction();
    controller.advancePlayerAction();
    assert.deepEqual(plain(controller.advancePlayerAction()), [
        { sourceId: 52, outcome: "hit-no-progress" },
        { sourceId: 53, outcome: "failed" },
    ]);
    assert.deepEqual([first.x, first.y], [3, 1]);
    assert.deepEqual([second.x, second.y], [1, 0]);
    assert.deepEqual(damages, [52]);
});

test("map, defeat, prison, and fresh-runtime boundaries leave no orphan Dash state or warning", () => {
    const context = loadDefinitions();
    const sources = new Map([
        [60, { id: 60, x: 0, y: 0, hp: 2, Enemy: { name: "Jumper" } }],
        [61, { id: 61, x: 0, y: 4, hp: 2, Enemy: { name: "Jumper" } }],
    ]);
    const warnings = new Set();
    const controller = context.Spiderlings.JumperDash.createController({
        isCooldownReady: () => true,
        canSense: () => true,
        routeClear: () => true,
        landingCandidates: (_source, target) => [{ ...target }],
        startCooldown() {},
        announce() {},
        addWarning: (state) => warnings.add(state.sourceId),
        clearWarning: (state) => warnings.delete(state.sourceId),
        findSource: (id) => sources.get(id),
    });
    controller.begin(sources.get(60), { x: 3, y: 0 });
    controller.begin(sources.get(61), { x: 3, y: 4 });
    assert.deepEqual(plain(controller.clearAll("postMapgen")), [
        { sourceId: 60, outcome: "cleared", reason: "postMapgen" },
        { sourceId: 61, outcome: "cleared", reason: "postMapgen" },
    ]);
    assert.deepEqual(plain(controller.snapshot()), []);
    assert.equal(warnings.size, 0);
    assert.deepEqual(
        plain(context.Spiderlings.JumperDash.runtimeController.snapshot()),
        [],
        "a freshly initialized runtime starts empty",
    );
});
