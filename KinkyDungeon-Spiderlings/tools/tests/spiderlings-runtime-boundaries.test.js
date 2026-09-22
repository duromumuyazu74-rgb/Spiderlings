"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadLifecycleRuntime, modRoot } = require("./helpers/lifecycle-runtime.js");
const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });

test("Webbing rules resolve frozen input without registering any native objects", () => {
    const context = vm.createContext({ Spiderlings: {} });
    load(context, "SpiderlingsWebbingData.js");
    load(context, "SpiderlingsWebbingRules.js");
    const resolve = context.Spiderlings.WebbingRules.resolveWebbingAction;
    const snapshot = Object.freeze({ items: Object.freeze([]) });
    const inspected = resolve(Object.freeze({ snapshot, action: Object.freeze({ type: "inspectPhysical" }) }));
    assert.equal(inspected.outcome.physicalInnerCount, 0);
    const result = resolve(
        Object.freeze({
            snapshot,
            action: Object.freeze({
                type: "escapeAttempt",
                item: Object.freeze({ name: "SpiderlingsWebbingLv2Arm" }),
                method: "Cut",
                effective: true,
                progress: 1,
            }),
        }),
    );
    assert.equal(result.outcome.completed, true);
    assert.equal(result.outcome.keep, false);
    assert.equal(result.nextSnapshot, snapshot);
    assert.deepEqual(Object.keys(context.Spiderlings).sort(), ["WebbingData", "WebbingRules"]);
});

test("shared AI hooks use one Spinner dispatcher and preserve foreign calls", () => {
    const calls = [],
        receiver = {},
        result = { native: true };
    const native = function (...args) {
        calls.push({ receiver: this, args });
        return result;
    };
    const { context: c } = loadLifecycleRuntime(
        {
            KDAIType: {
                hunt: { beforemove: native, attack: native, spell: native },
                wander: { beforemove: native },
            },
            KinkyDungeonEnemyLoop: native,
            KDMapData: { Entities: [] },
        },
        undefined,
        true,
    );
    load(c, "SpiderlingsSpinnerField.js");
    c.Spiderlings.SpinnerNativeField = {
        isOwnedProxy: () => false,
        handleEnemyTurn: () => undefined,
        onNativeDamage() {},
        onEntry() {},
        tick() {},
        reconcile() {},
    };
    load(c, "SpiderlingsSpinnerRuntime.js");
    const enemy = { Enemy: { name: "Bandit" } },
        target = { player: true },
        data = {};
    const describe = (fn) => Array.from(c.Spiderlings.Hooks.describe(fn));
    assert.deepEqual(describe(c.KDAIType.hunt.beforemove), ["WebCaster.hunt", "Cocoon.hunt", "Spinner.beforemove"]);
    assert.deepEqual(describe(c.KDAIType.hunt.attack), ["Spinner.attack"]);
    assert.deepEqual(describe(c.KDAIType.hunt.spell), ["Spinner.spell"]);
    assert.deepEqual(describe(c.KinkyDungeonEnemyLoop), ["Spinner.runtime"]);
    assert.equal(c.KDAIType.hunt.beforemove.call(receiver, enemy, target, data, "extra"), result);
    assert.equal(c.KDAIType.hunt.attack.call(receiver, enemy, target, data, "extra"), result);
    assert.equal(c.KDAIType.hunt.spell.call(receiver, enemy, target, data, "extra"), result);
    assert.equal(c.KinkyDungeonEnemyLoop.call(receiver, enemy, target, 1, "extra"), result);
    assert.equal(calls.length, 4);
    assert.equal(calls[0].receiver, receiver);
    assert.deepEqual(calls[0].args, [enemy, target, data, "extra"]);
    assert.deepEqual(calls[1].args, [enemy, target, data, "extra"]);
    assert.deepEqual(calls[2].args, [enemy, target, data, "extra"]);
    assert.deepEqual(calls[3].args, [enemy, target, 1, "extra"]);
});

test("reinstalling an inner hook replaces its callback without nesting or reordering the chain", () => {
    const c = vm.createContext({});
    load(c, "SpiderlingsCore.js");
    const hooks = c.Spiderlings.Hooks,
        calls = [];
    const native = (value) => {
        calls.push("native");
        return value;
    };
    const install = (label, amount) => (prior) =>
        function (value) {
            calls.push(label);
            return prior.call(this, value) + amount;
        };
    const inner = hooks.wrap("inner", native, install("old", 1));
    const outer = hooks.wrap("outer", inner, install("outer", 10));
    const again = hooks.wrap("inner", outer, install("new", 2));
    assert.equal(again, outer);
    assert.equal(again(4), 16);
    assert.deepEqual(calls, ["outer", "new", "native"]);
    assert.deepEqual(Array.from(hooks.describe(again)), ["inner", "outer"]);
});
