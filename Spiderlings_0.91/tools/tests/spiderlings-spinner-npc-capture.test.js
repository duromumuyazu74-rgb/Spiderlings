"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modRoot = path.resolve(__dirname, "../..");
const load = (context, file) =>
    vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });

function fixture() {
    const damageCalls = [];
    let nativeLoops = 0;
    const context = {
        console,
        Spiderlings: {},
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDGameData: {},
        KDMapData: { Entities: [] },
        KDAddEvent(map, trigger, id, handler) {
            (map[trigger] ||= {})[id] = handler;
        },
        KDHostile(source, target) {
            return source?.faction !== target?.faction;
        },
        KDHelpless(enemy) {
            return enemy.boundLevel >= 8;
        },
        KDIsImmobile(enemy) {
            return !!(enemy.Enemy?.immobile || enemy.immobile || enemy.imprisoned);
        },
        KinkyDungeonIsDisabled(enemy) {
            return !!enemy.disabled;
        },
        KinkyDungeonCheckPath(x, y, _tx, _ty) {
            return !context.KDMapData.Entities.find((enemy) => enemy.x === x && enemy.y === y)?.blockedLOS;
        },
        KDNPCStruggleThreshMult(enemy) {
            return 1 + (enemy.rank || 0) + (enemy.Enemy.tags?.unstoppable ? 2 : enemy.Enemy.tags?.unflinching ? 1 : 0);
        },
        KinkyDungeonEnemyTryMove(enemy, _direction, _delta, x, y) {
            enemy.x = x;
            enemy.y = y;
            return true;
        },
        KDEnemyStruggleTurn(enemy) {
            const removed = Math.min(enemy.boundLevel || 0, enemy.struggleAmount || 0);
            enemy.boundLevel -= removed;
            const slimeRemoved = Math.min(enemy.specialBoundLevel?.Slime || 0, removed);
            if (enemy.specialBoundLevel) enemy.specialBoundLevel.Slime -= slimeRemoved;
            return removed;
        },
    };
    const events = (trigger, data) => {
        for (const handler of Object.values(context.KDEventMapGeneric[trigger] || {})) handler({}, data);
    };
    context.KinkyDungeonDamageEnemy = (target, damage, ranged, _noMsg, spell, bullet, attacker) => {
        damageCalls.push({ target, damage, ranged, spell, bullet, attacker });
        const data = {
            enemy: target,
            incomingDamage: damage,
            dmg: damage.damage || 0,
            dmgDealt: damage.damage || 0,
            attacker,
        };
        events("beforeDamageEnemy", data);
        events("duringDamageEnemy", data);
        if (target.shield || target.immune) data.blocked = true;
        if (!data.blocked && damage.bind > 0) {
            const added = damage.bind * (target.resistant ? 0.75 : 1);
            target.boundLevel = (target.boundLevel || 0) + added;
            (target.specialBoundLevel ||= {}).Slime = (target.specialBoundLevel.Slime || 0) + added;
        }
        target.hp -= data.dmgDealt;
        events("afterDamageEnemy", data);
        return data.dmgDealt;
    };
    context.KinkyDungeonEnemyLoop = (source, target) => {
        nativeLoops += 1;
        events("beforeNPCDamageNPC", { enemy: source });
        return context.KinkyDungeonDamageEnemy(
            target,
            { damage: 2, type: "slash" },
            false,
            true,
            undefined,
            undefined,
            source,
        );
    };
    context.globalThis = context;
    vm.createContext(context);
    load(context, "SpiderlingsCore.js");
    load(context, "SpiderlingsCombat.js");
    context.Spiderlings.SpinnerCapture = { state: () => undefined, handleEnemyTurn: () => undefined };
    context.Spiderlings.SpinnerRecovery = {
        handleEnemyTurn: () => undefined,
        audit() {},
        afterLoad() {},
        clearControl() {},
    };
    let geometryReady = true;
    context.Spiderlings.SpinnerNativeField = {
        containingComposite: () => ({ id: "composite-1" }),
        captureGeometryReady: () => geometryReady,
        isOwnedProxy: () => false,
        handleEnemyTurn: () => undefined,
        onNativeDamage() {},
        onEntry() {},
        tick() {},
        reconcile() {},
    };
    context.Spiderlings.SpinnerField = { handleEnemyTurn: () => undefined };
    load(context, "SpiderlingsSpinnerNPCCapture.js");
    load(context, "SpiderlingsSpinnerRuntime.js");

    const spinner = (id, x, y) => ({
        id,
        x,
        y,
        hp: 10,
        boundLevel: 0,
        faction: "Spiderlings",
        Enemy: { name: "Spinner", attack: "Melee", attackRange: 1, maxhp: 10, tags: { spiderlings: true } },
    });
    const target = (id = 10) => ({
        id,
        x: 0,
        y: 0,
        hp: 10,
        boundLevel: 0,
        specialBoundLevel: {},
        faction: "Maidforce",
        Enemy: { name: "Maid", bound: true, maxhp: 10, attack: "Melee", attackRange: 1, tags: {} },
    });
    const tick = (delta = 1) => events("tick", { delta });
    const tickAfter = (delta = 1) => events("tickAfter", { delta });
    return {
        context,
        damageCalls,
        events,
        spinner,
        target,
        tick,
        tickAfter,
        nativeLoops: () => nativeLoops,
        setGeometryReady: (value) => (geometryReady = value),
    };
}

test("aggregated NPC capture binding uses one native Slime call without contact or HP damage", () => {
    for (const [mode, expected] of [
        ["normal", 3],
        ["resistant", 2.25],
        ["immune", 0],
        ["shield", 0],
    ]) {
        const runtime = fixture();
        const source = runtime.spinner(1, 1, 0);
        const target = runtime.target();
        target[mode] = true;
        const hp = target.hp;
        const result = runtime.context.Spiderlings.Combat.applySilkBinding(source, target, 3, { contact: false });
        assert.equal(result.slimeAdded, expected, mode);
        assert.equal(target.hp, hp, mode);
        assert.equal(runtime.damageCalls.length, 1, `${mode}: exactly one native call`);
        assert.equal(runtime.damageCalls[0].damage.bindType, "Slime");
        assert.equal(target.SpiderlingsNPCSilkGag === true, expected > 0, mode);
    }
});

test("only a successful native Spinner hit in ready geometry admits the hitter", () => {
    const runtime = fixture();
    const first = runtime.spinner(1, 1, 0);
    const second = runtime.spinner(2, 0, 1);
    const target = runtime.target();
    runtime.context.KDMapData.Entities.push(first, second, target);

    runtime.context.Spiderlings.Combat.hitNPC(first, target, "melee");
    assert.equal(runtime.context.Spiderlings.SpinnerNPCCapture.state(), undefined, "synthetic helper does not admit");
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    const record = runtime.context.Spiderlings.SpinnerNPCCapture.records()[String(target.id)];
    assert.deepEqual(Array.from(record.sourceIds), [first.id]);
    assert.equal(record.strandDebt, 1.5);
    assert.equal(record.completionTarget, 20);
    assert.deepEqual({ ...record.anchor }, { x: 0, y: 0 });

    runtime.events("postMapgen", {});
    const thresholdTarget = runtime.target(19);
    thresholdTarget.boundLevel = 7;
    thresholdTarget.specialBoundLevel.Slime = 7;
    runtime.context.KDMapData.Entities.push(thresholdTarget);
    runtime.context.KinkyDungeonEnemyLoop(first, thresholdTarget, 1);
    assert.ok(
        runtime.context.Spiderlings.SpinnerNPCCapture.records()[String(thresholdTarget.id)],
        "a hit that crosses helpless admits from its pre-hit eligibility",
    );
    runtime.context.KDMapData.Entities.pop();
    runtime.events("postMapgen", {});

    for (const rejected of [
        () => (runtime.setGeometryReady(false), runtime.target(20)),
        () => Object.assign(runtime.target(21), { immobile: 1 }),
        () => Object.assign(runtime.target(22), { faction: "Spiderlings" }),
        () => Object.assign(runtime.target(23), { Enemy: { name: "Ghost", bound: false, maxhp: 10, tags: {} } }),
        () => Object.assign(runtime.target(24), { shield: true }),
        () => Object.assign(runtime.target(25), { immune: true }),
    ]) {
        runtime.setGeometryReady(true);
        const candidate = rejected();
        candidate.x = 0;
        candidate.y = 0;
        runtime.context.KDMapData.Entities.push(candidate);
        runtime.context.KinkyDungeonEnemyLoop(first, candidate, 1);
        assert.equal(runtime.context.Spiderlings.SpinnerNPCCapture.records()[String(candidate.id)], undefined);
        runtime.context.KDMapData.Entities.pop();
    }
});

test("paid joins aggregate acted sources while field breach, one source, and target actions remain native", () => {
    const runtime = fixture();
    const first = runtime.spinner(1, 1, 0);
    const second = runtime.spinner(2, 0, 1);
    const target = runtime.target();
    runtime.context.KDMapData.Entities.push(first, second, target);
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    const initialCalls = runtime.damageCalls.length;

    runtime.tick();
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    runtime.context.KinkyDungeonEnemyLoop(second, target, 1);
    runtime.tickAfter();
    assert.equal(runtime.damageCalls.length, initialCalls + 1);
    assert.equal(runtime.damageCalls.at(-1).damage.bind, 1.5, "joining source contributes on a later turn");

    runtime.setGeometryReady(false);
    runtime.tick();
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    runtime.context.KinkyDungeonEnemyLoop(second, target, 1);
    runtime.tickAfter();
    assert.equal(runtime.damageCalls.at(-1).damage.bind, 3);
    assert.equal(runtime.context.KinkyDungeonEnemyTryMove(target, { x: 1, y: 0 }, 1, 1, 0, false), false);

    const beforeNative = runtime.nativeLoops();
    runtime.context.KinkyDungeonEnemyLoop(target, first, 1);
    assert.equal(runtime.nativeLoops(), beforeNative + 1, "captured target retains its native attack/cast loop");

    second.hp = 0;
    runtime.tick();
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    runtime.tickAfter();
    assert.deepEqual(Array.from(runtime.context.Spiderlings.SpinnerNPCCapture.records()[String(target.id)].sourceIds), [
        first.id,
    ]);
    first.hp = 0;
    runtime.tick();
    assert.equal(runtime.context.Spiderlings.SpinnerNPCCapture.state(), undefined, "zero sources escape immediately");
});

test("native struggle reduction escapes before reinforcement and holds only surviving participants", () => {
    const runtime = fixture();
    const first = runtime.spinner(1, 1, 0);
    const second = runtime.spinner(2, 0, 1);
    const target = runtime.target();
    runtime.context.KDMapData.Entities.push(first, second, target);
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    runtime.tick();
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    runtime.context.KinkyDungeonEnemyLoop(second, target, 1);
    runtime.tickAfter();

    runtime.tick();
    target.struggleAmount = 3;
    runtime.context.KDEnemyStruggleTurn(target, 1, 1, false, false);
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    runtime.context.KinkyDungeonEnemyLoop(second, target, 1);
    const calls = runtime.damageCalls.length;
    runtime.tickAfter();
    assert.equal(runtime.context.Spiderlings.SpinnerNPCCapture.state(), undefined);
    assert.equal(runtime.damageCalls.length, calls, "escape resolves before a new binding call");
    assert.equal(first.SpiderlingsSpinnerStunTurns, 6);
    assert.equal(second.SpiderlingsSpinnerStunTurns, 6);
    assert.equal(first.stun, 6);
    assert.equal(second.stun, 6);
});

test("source audits remove every illegal source condition and enforce the eight-source cap", () => {
    for (const [label, mutate] of [
        ["death", (source) => (source.hp = 0)],
        ["stun", (source) => (source.stun = 1)],
        ["range", (source) => (source.x = 4)],
        ["physical LOS", (source) => (source.blockedLOS = true)],
        ["hostility", (source, target) => (source.faction = target.faction)],
    ]) {
        const runtime = fixture();
        const first = runtime.spinner(1, 1, 0);
        const second = runtime.spinner(2, 0, 1);
        const target = runtime.target();
        runtime.context.KDMapData.Entities.push(first, second, target);
        runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
        mutate(first, target);
        runtime.context.Spiderlings.SpinnerNPCCapture.auditSources();
        assert.equal(runtime.context.Spiderlings.SpinnerNPCCapture.state(), undefined, label);
    }

    const runtime = fixture();
    const target = runtime.target();
    const sources = Array.from({ length: 9 }, (_, index) => runtime.spinner(index + 1, 1, 0));
    runtime.context.KDMapData.Entities.push(...sources, target);
    runtime.context.KinkyDungeonEnemyLoop(sources[0], target, 1);
    const nativeAfterAdmission = runtime.nativeLoops();
    for (const source of sources.slice(1)) runtime.context.KinkyDungeonEnemyLoop(source, target, 1);
    const record = runtime.context.Spiderlings.SpinnerNPCCapture.records()[String(target.id)];
    assert.equal(record.sourceIds.length, 8);
    assert.equal(new Set(record.sourceIds).size, 8);
    assert.equal(
        runtime.nativeLoops(),
        nativeAfterAdmission,
        "the capped ninth Spinner waits instead of adding another hit",
    );
});

test("zero-time settlement and helpless no-helper turns add no synthetic escape work", () => {
    const runtime = fixture();
    const first = runtime.spinner(1, 1, 0);
    const second = runtime.spinner(2, 0, 1);
    const target = runtime.target();
    runtime.context.KDMapData.Entities.push(first, second, target);
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    const record = runtime.context.Spiderlings.SpinnerNPCCapture.records()[String(target.id)];
    const calls = runtime.damageCalls.length;
    runtime.tickAfter(0);
    assert.equal(runtime.damageCalls.length, calls);
    assert.equal(record.strandDebt, 1.5);

    target.boundLevel = 10;
    target.specialBoundLevel.Slime = 10;
    runtime.tick();
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    runtime.tickAfter();
    assert.equal(record.strandDebt, 3, "skipping the native struggle call earns no escape progress");

    runtime.tick();
    target.struggleAmount = 3;
    runtime.context.KDEnemyStruggleTurn(target, 1, 1, false, false);
    runtime.tickAfter();
    assert.equal(
        runtime.context.Spiderlings.SpinnerNPCCapture.state(),
        undefined,
        "a native helper-enabled call can escape",
    );
});

test("completion and lifecycle cleanup preserve native binding and never create NPC equipment state", () => {
    for (const traits of [{}, { rank: 2 }, { tag: "unflinching" }, { tag: "unstoppable" }]) {
        const runtime = fixture();
        const first = runtime.spinner(1, 1, 0);
        const second = runtime.spinner(2, 0, 1);
        const target = runtime.target();
        target.rank = traits.rank || 0;
        if (traits.tag) target.Enemy.tags[traits.tag] = true;
        runtime.context.KDMapData.Entities.push(first, second, target);
        runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
        const record = runtime.context.Spiderlings.SpinnerNPCCapture.records()[String(target.id)];
        target.boundLevel = record.completionTarget;
        target.specialBoundLevel.Slime = record.completionTarget;
        runtime.tickAfter();
        assert.equal(runtime.context.Spiderlings.SpinnerNPCCapture.state(), undefined);
        assert.equal(runtime.context.KDMapData.Entities.includes(target), true);
        assert.equal(target.boundLevel, record.completionTarget);
        assert.equal(target.SpiderlingsNPCSilkGag, true);
        for (const field of ["equipment", "imprisoned", "prisoner", "collection"]) assert.equal(field in target, false);
        assert.equal(first.SpiderlingsSpinnerStunTurns, undefined);
    }

    const runtime = fixture();
    const first = runtime.spinner(1, 1, 0);
    const second = runtime.spinner(2, 0, 1);
    const target = runtime.target();
    runtime.context.KDMapData.Entities.push(first, second, target);
    runtime.context.KinkyDungeonEnemyLoop(first, target, 1);
    const saved = JSON.parse(JSON.stringify(runtime.context.Spiderlings.SpinnerNPCCapture.state()));
    const calls = runtime.damageCalls.length;
    runtime.events("afterLoadGame", {});
    runtime.events("afterLoadGame", {});
    assert.deepEqual(JSON.parse(JSON.stringify(runtime.context.Spiderlings.SpinnerNPCCapture.state())), saved);
    assert.equal(runtime.damageCalls.length, calls, "load performs no binding tick");
    runtime.events("postMapgen", {});
    assert.equal(runtime.context.Spiderlings.SpinnerNPCCapture.state(), undefined);
    assert.equal(target.boundLevel > 0, true, "transition preserves native binding");
});

test("manifest loads NPC Capture between combat/player capture and the Spinner dispatcher", () => {
    const order = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8")).fileorder;
    const index = (file) => order.indexOf(file);
    assert.ok(index("SpiderlingsCombat.js") < index("SpiderlingsSpinnerCapture.js"));
    assert.ok(index("SpiderlingsSpinnerCapture.js") < index("SpiderlingsSpinnerNPCCapture.js"));
    assert.ok(index("SpiderlingsSpinnerNPCCapture.js") < index("SpiderlingsSpinnerRuntime.js"));
});
