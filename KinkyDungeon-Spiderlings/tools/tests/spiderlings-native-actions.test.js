"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./helpers/lifecycle-runtime.js");

function fixture() {
    const calls = [],
        nativeResult = { native: true },
        direction = { x: 1, y: 0, delta: 1 },
        c = vm.createContext({
            Spiderlings: {},
            KinkyDungeonPlayerEntity: { id: 0, player: true },
            KDAIType: {
                hunt: {
                    beforemove(...args) {
                        calls.push({ phase: "move", receiver: this, args });
                        return false;
                    },
                    aftermove(...args) {
                        calls.push({ phase: "after", receiver: this, args });
                        return false;
                    },
                    attack(...args) {
                        calls.push({ phase: "attack", receiver: this, args });
                        return nativeResult;
                    },
                    spell(...args) {
                        calls.push({ phase: "spell", receiver: this, args });
                        return nativeResult;
                    },
                },
                guard: {},
            },
            KDGetDir(...args) {
                calls.push({ phase: "direction", receiver: this, args });
                return direction;
            },
            KinkyDungeonEnemyLoop(...args) {
                calls.push({ phase: "loop", receiver: this, args });
                return nativeResult;
            },
        });
    for (const file of ["SpiderlingsCore.js", "SpiderlingsNativeActions.js"])
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), c, { filename: file });
    return { c, calls, nativeResult, direction, actions: c.Spiderlings.NativeActions };
}

test("one shared adapter preserves native fallback and call context for uncommanded species", () => {
    const { c, calls, nativeResult, direction, actions } = fixture(),
        receiver = {};
    actions.install();
    for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings", "Bandit"]) {
        const actor = { id: name, Enemy: { name } },
            target = { player: true },
            data = {};
        assert.equal(c.KinkyDungeonEnemyLoop.call(receiver, actor, target, 0, "extra"), nativeResult);
        assert.equal(actor.SpiderlingsSpinnerRuntimeDelta, undefined);
        assert.equal(c.KDAIType.hunt.beforemove.call(receiver, actor, target, data, "extra"), false);
        assert.equal(c.KDAIType.hunt.attack.call(receiver, actor, target, data, "extra"), nativeResult);
        assert.equal(c.KDAIType.hunt.spell.call(receiver, actor, target, data, "extra"), nativeResult);
        assert.equal(c.KDGetDir.call(receiver, actor, target, "extra"), direction);
        const entries = calls.splice(0);
        assert.ok(entries.every((entry) => entry.receiver === receiver));
        assert.deepEqual(entries[0].args, [actor, target, 0, "extra"]);
        assert.deepEqual(entries[1].args, [actor, target, data, "extra"]);
        assert.deepEqual(entries[4].args, [actor, target, "extra"]);
    }
});

test("a defined pre-native movement result skips native and later behavior without losing false", () => {
    const { c, calls, actions } = fixture(),
        order = [];
    actions.registerBehavior("retreat", {
        beforeNativeMove() {
            order.push("retreat");
            return false;
        },
    });
    actions.registerBehavior("firing-angle", {
        afterNativeMove() {
            order.push("angle");
        },
    });
    const actor = { id: 1, Enemy: { name: "WebCaster" } };
    assert.equal(c.KDAIType.hunt.beforemove(actor, c.KinkyDungeonPlayerEntity, {}), false);
    assert.deepEqual(order, ["retreat"]);
    assert.equal(calls.length, 0);
});

test("post-native and direction policies replace their owner without adding wrapper chains", () => {
    const { c, calls, actions } = fixture(),
        order = [],
        actor = { id: 1, Enemy: { name: "WebCaster" } };
    actions.registerBehavior("WebCaster", { afterNativeMove: () => order.push("old") });
    actions.registerBehavior("WebCaster", {
        aiTypes: ["hunt"],
        afterNativeMove(_actor, _target, _data, result) {
            assert.equal(result, false);
            order.push("new");
        },
        preferDirection(_actor, _target, original) {
            return { ...original, y: -1 };
        },
    });
    actions.install();
    actions.install();
    c.KDAIType.hunt.beforemove(actor, c.KinkyDungeonPlayerEntity, {});
    c.KDAIType.guard.beforemove(actor, c.KinkyDungeonPlayerEntity, {});
    assert.deepEqual(order, ["new"]);
    assert.equal(calls.filter((entry) => entry.phase === "move").length, 1);
    assert.equal(c.KDGetDir(actor, c.KinkyDungeonPlayerEntity).y, -1);
    const describe = (handler) => Array.from(c.Spiderlings.Hooks.describe(handler));
    assert.deepEqual(describe(c.KDAIType.hunt.beforemove), ["NativeActions.beforemove.hunt"]);
    assert.deepEqual(describe(c.KinkyDungeonEnemyLoop), ["NativeActions.enemyLoop"]);
    assert.deepEqual(describe(c.KDGetDir), ["NativeActions.direction"]);
});

test("shared control order keeps each source owner and reports only the handling operation", () => {
    for (const role of ["recovery", "capture", "npcCapture", "npcRecovery"]) {
        const { c, calls, actions } = fixture(),
            order = [],
            reports = [],
            result = { role };
        c.Spiderlings.SpinnerDuties = {
            beginAction: (_actor, _target, delta) => (delta > 0 ? { role } : undefined),
            allows: (_actor, handler) => handler === role,
            recordResult: (actor, outcome) => reports.push({ actor, outcome }),
        };
        for (const [name, owner] of [
            ["recovery", "SpinnerRecovery"],
            ["capture", "SpinnerCapture"],
            ["npcCapture", "SpinnerNPCCapture"],
            ["npcRecovery", "SpinnerNPCRecovery"],
        ]) {
            const controller = {
                handleEnemyTurn() {
                    assert.equal(this, controller);
                    order.push(name);
                    return result;
                },
            };
            c.Spiderlings[owner] = controller;
        }
        c.Spiderlings.NPCWrapping = { preemptNativeCapture: () => order.push("wrapping-audit") };
        actions.install();
        const actor = { id: 1, Enemy: { name: "Spinner" } };
        assert.equal(c.KinkyDungeonEnemyLoop(actor, c.KinkyDungeonPlayerEntity, 1), result);
        assert.deepEqual(order, role.startsWith("npc") ? ["wrapping-audit", role] : [role]);
        assert.equal(reports.length, 1);
        assert.equal(reports[0].outcome, result);
        assert.equal(calls.length, 0, "A source operation cannot also delegate a native operation");
    }
});

test("shared move admission gates every selected native AI phase after command invalidation", () => {
    const { c, calls, actions } = fixture();
    let active,
        moves = 0;
    c.Spiderlings.SpinnerDuties = {
        beginAction: (_actor, _target, delta) => (active = delta > 0 ? { executed: false } : undefined),
        current: () => active,
        beforeMove(_actor, _target, data) {
            assert.equal(active.executed, false);
            active.executed = true;
            moves++;
            data.idle = false;
            return true;
        },
        gate: () => !active,
    };
    actions.install();
    for (const name of ["hunt", "guard"]) {
        const actor = { id: name, Enemy: { name: "Spinner" }, SpiderlingsSpinnerRuntimeDelta: 1 };
        c.Spiderlings.SpinnerDuties.beginAction(actor, c.KinkyDungeonPlayerEntity, 1);
        assert.equal(c.KDAIType[name].beforemove(actor, c.KinkyDungeonPlayerEntity, { idle: true }), true);
        assert.equal(c.KDAIType[name].attack(actor), false);
        assert.equal(c.KDAIType[name].spell(actor), false);
    }
    assert.equal(moves, 2);
    assert.equal(calls.length, 0);
});

test("after-move behavior follows native handling and preserves its zero-time decision", () => {
    const { c, calls, actions } = fixture(),
        actor = { id: 1, Enemy: { name: "Jumper" } },
        target = c.KinkyDungeonPlayerEntity,
        receiver = {};
    let zero = true,
        searches = 0;
    actions.registerBehavior("Rivalry", {
        aiTypes: ["hunt", "wander"],
        afterMove() {
            if (zero) return undefined;
            searches++;
            return true;
        },
    });
    assert.equal(c.KDAIType.hunt.aftermove.call(receiver, actor, target, {}, "extra"), false);
    assert.equal(searches, 0);
    zero = false;
    assert.equal(c.KDAIType.hunt.aftermove.call(receiver, actor, target, {}, "extra"), true);
    assert.equal(searches, 1);
    assert.ok(calls.every((entry) => entry.receiver === receiver && entry.args[3] === "extra"));
    const nativeHandled = {};
    c.KDAIType.hunt.aftermove = () => nativeHandled;
    actions.install();
    assert.equal(c.KDAIType.hunt.aftermove(actor, target, {}), nativeHandled);
    assert.equal(searches, 1, "An already handled native move cannot run a second behavior");
});

test("late installation retains a later route adapter's precedence over direction preference", () => {
    const { c, actions } = fixture(),
        routeDirection = { x: 0, y: 1, delta: 1 };
    let preferences = 0;
    actions.registerBehavior("WebCaster", {
        preferDirection(_actor, _target, original) {
            preferences++;
            return original;
        },
    });
    c.KDGetDir = c.Spiderlings.Hooks.wrap("WebMobility.direction", c.KDGetDir, () => () => routeDirection);
    actions.install();
    assert.equal(c.KDGetDir({}, {}), routeDirection);
    assert.equal(preferences, 0);
    assert.deepEqual(Array.from(c.Spiderlings.Hooks.describe(c.KDGetDir)), [
        "NativeActions.direction",
        "WebMobility.direction",
    ]);
});

test("native failure clears its action context and cannot publish later contact outside that loop", () => {
    const { c, actions } = fixture(),
        actor = { id: 1, Enemy: { name: "WebCaster" } },
        reports = [];
    c.KinkyDungeonTrackSneak = () => 0.75;
    c.Spiderlings.SpinnerAI = { reportPlayerContact: (...args) => reports.push(args) };
    c.KinkyDungeonEnemyLoop = () => {
        throw new Error("native failure");
    };
    actions.install();
    assert.throws(() => c.KinkyDungeonEnemyLoop(actor, c.KinkyDungeonPlayerEntity, 1), /native failure/);
    assert.equal(actor.SpiderlingsSpinnerRuntimeDelta, undefined);
    assert.equal(c.KinkyDungeonTrackSneak(actor, 1, c.KinkyDungeonPlayerEntity), 0.75);
    assert.equal(reports.length, 0);
});

test("interception scopes player-leash policy to the action without changing the shared enemy definition", () => {
    const { c, actions } = fixture(),
        definition = { name: "WebCaster", followLeashedOnly: true },
        actor = { id: 1, Enemy: definition },
        target = { id: 2, Enemy: { name: "ElementalIce" } };
    c.Spiderlings.FieldCustody = { targetFor: () => target };
    c.Spiderlings.SpinnerDuties = { beginAction: () => ({ role: "intercept" }), allows: () => false };
    c.KinkyDungeonEnemyLoop = (enemy) => {
        // Native KDHelpless/KDUnPackEnemy reloads ordinary enemy templates.
        if (!enemy.modified) enemy.Enemy = definition;
        assert.equal(enemy.Enemy.followLeashedOnly, false);
        assert.equal(definition.followLeashedOnly, true);
        throw Error("native cast failure");
    };
    actions.install();
    assert.throws(() => c.KinkyDungeonEnemyLoop(actor, target, 1), /native cast failure/);
    assert.equal(actor.Enemy, definition);
    assert.equal(actor.Enemy.followLeashedOnly, true);
    assert.equal(Object.hasOwn(actor, "modified"), false);
});
