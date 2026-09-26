"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsNPCWrapping.js"), "utf8");
const dispatcher = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsSpinnerRuntime.js"), "utf8");
const nativeField = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsSpinnerNativeField.js"), "utf8");
const oldCapture = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsSpinnerNPCCapture.js"), "utf8");

function fixture() {
    const calls = { native: 0, removed: [], colors: [], labels: [] };
    const target = {
        id: 10,
        x: 4,
        y: 4,
        hp: 10,
        faction: "Maidforce",
        full: true,
        silk: true,
        silkFaction: "Enemy",
        silkSufficient: true,
        specialBoundLevel: { Slime: 7 },
        Enemy: { name: "Maidforce", bound: "Maidforce", tags: {} },
    };
    const spiders = [1, 2, 3].map((id) => ({
        id,
        x: 3 + (id === 2 ? 1 : 0),
        y: 3 + (id === 3 ? 1 : 0),
        hp: 4,
        faction: "Enemy",
        Enemy: { name: id === 1 ? "Spinner" : "Jumper", movePoints: 1, tags: {} },
    }));
    const map = { Entities: [...spiders, target] };
    const blockedTiles = new Set();
    const context = {
        Spiderlings: {
            Hooks: { wrap: (_id, native, wrapper) => wrapper(native) },
            NPCAdhesion: {
                status: (entity) => (entity.full ? "full" : entity.helpless ? "native-helpless" : "free"),
                hasAttributedSilk: (entity) => !!entity.silk,
                hasSpiderHelplessness: (entity) => !!entity.helpless && !!entity.silkSufficient,
                silkSource: (entity) =>
                    entity.silk
                        ? { id: -1, hp: 1, faction: entity.silkFaction, Enemy: { name: "WebCaster" } }
                        : undefined,
            },
            getSetting: () => context.pink === true,
        },
        KDMapData: map,
        KDGameData: { Collection: {}, SleepTurns: 0 },
        KinkyDungeonGetBuffedStat: () => 0,
        KinkyDungeonMultiplicativeStat: () => 1,
        KDBoundEffects: () => 0,
        KDHostile: (sourceEntity, prey) => sourceEntity.faction !== prey.faction && !prey.peaceful,
        KDHelpless: (entity) => !!entity.helpless,
        KinkyDungeonIsDisabled: (entity) => !!entity.disabled,
        KinkyDungeonCheckPath: (x, y) => !map.Entities.find((entity) => entity.x === x && entity.y === y)?.blocked,
        KinkyDungeonTransparentMovableObjects: "0",
        KinkyDungeonMapGet: (x, y) => (blockedTiles.has(`${x},${y}`) ? "1" : "0"),
        KDRemoveEntity(entity, kill, capture) {
            calls.removed.push({ entity, kill, capture });
            if (entity.cancelRemoval) return false;
            map.Entities.splice(map.Entities.indexOf(entity), 1);
            return true;
        },
        KDEnemyStruggleTurn(entity) {
            entity.specialBoundLevel.Slime -= entity.struggle || 0;
        },
        PIXI: {
            Graphics: class {
                clear() {
                    return this;
                }
                lineStyle(_width, color) {
                    calls.colors.push(color);
                    return this;
                }
                moveTo() {
                    return this;
                }
                lineTo() {
                    return this;
                }
            },
        },
        kdgameboard: { addChild: () => {} },
        kdenemystatusboard: {},
        KinkyDungeonGridSizeDisplay: 72,
        TextGet: (key) => key,
        DrawTextFitKDTo: (_board, label) => calls.labels.push(label),
    };
    vm.createContext(context);
    vm.runInContext(nativeField, context);
    vm.runInContext(oldCapture, context);
    vm.runInContext(source, context);
    const wrap = context.Spiderlings.NPCWrapping;
    function act(spider, prey = target) {
        const action = wrap.handleEnemyTurn(spider, prey, 1);
        if (!action) calls.native++;
        return action;
    }
    return { calls, context, map, target, spiders, wrap, act, blockedTiles };
}

test("three different adjacent spiders pay three actions in one world turn, without native retaliation", () => {
    const r = fixture();
    assert.ok(r.act(r.spiders[0]));
    assert.equal(r.wrap.record(r.target).progress, 1);
    assert.equal(r.act(r.spiders[0]), undefined, "duplicate callback cannot pay twice");
    assert.ok(r.act(r.spiders[1]));
    assert.ok(r.act(r.spiders[2]));
    assert.equal(r.calls.native, 1);
    assert.equal(r.map.Entities.includes(r.target), false);
    assert.deepEqual(
        r.calls.removed.map(({ kill, capture }) => [kill, capture]),
        [[false, true]],
    );
    assert.equal(r.wrap.record(r.target), undefined);
});

test("one spider needs three positive turn preparations; invalid source cannot pay", () => {
    const r = fixture();
    r.spiders[1].disabled = true;
    r.spiders[2].blocked = true;
    assert.equal(r.act(r.spiders[1]), undefined);
    assert.equal(r.act(r.spiders[2]), undefined);
    r.act(r.spiders[0]);
    r.wrap.prepareTurn(0);
    assert.equal(r.act(r.spiders[0]), undefined);
    r.wrap.prepareTurn(1);
    r.act(r.spiders[0]);
    r.wrap.prepareTurn(1);
    r.act(r.spiders[0]);
    assert.equal(r.map.Entities.includes(r.target), false);
});

test("slow spiders wait for native movement credit before each paid wrapping action", () => {
    const r = fixture();
    const slow = r.spiders[0];
    slow.slow = 1;
    slow.Enemy.movePoints = 2;
    for (let turn = 1; turn <= 3; turn++) {
        assert.ok(r.act(slow), "waiting is still this actor's sole action");
        assert.equal(r.wrap.record(r.target).progress, 0);
        assert.equal(r.calls.native, 0);
        r.wrap.prepareTurn(1);
    }
    assert.ok(r.act(slow));
    assert.equal(r.wrap.record(r.target).progress, 1);
    assert.equal(slow.SpinnerConstructionPoints, 0);
});

test("diagonal wrapping cannot cross a blocked corner", () => {
    const r = fixture();
    r.blockedTiles.add("3,4");
    r.blockedTiles.add("4,3");
    assert.equal(r.act(r.spiders[0]), undefined);
    r.blockedTiles.delete("4,3");
    assert.ok(r.act(r.spiders[0]));
});

test("wrapping status and strands follow Normal and Pink settings", () => {
    const r = fixture();
    r.act(r.spiders[0]);
    const camera = { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 };
    r.wrap.draw(camera);
    assert.equal(r.calls.colors.at(-1), 0xffffff);
    assert.equal(r.calls.labels.at(-1), "SpiderlingsNPCWrapping 1/3");
    r.context.pink = true;
    r.wrap.draw(camera);
    assert.equal(r.calls.colors.at(-1), 0xffc2df);
});

test("pin loss, displacement, and carrier loss reset progress", () => {
    const r = fixture();
    r.act(r.spiders[0]);
    r.target.full = false;
    r.wrap.prepareTurn(1);
    assert.equal(r.wrap.record(r.target), undefined);
    r.target.full = true;
    r.act(r.spiders[1]);
    r.wrap.onDisplacement(r.target);
    assert.equal(r.wrap.record(r.target), undefined);
    r.wrap.prepareTurn(1);
    r.act(r.spiders[0]);
    for (const spider of r.spiders) spider.x = 20;
    r.wrap.prepareTurn(1);
    assert.equal(r.wrap.record(r.target), undefined);
});

test("partial native struggle retains paid wrapping while the target remains fully pinned", () => {
    const r = fixture();
    for (let turn = 1; turn <= 3; turn++) {
        assert.ok(r.act(r.spiders[0]));
        if (turn === 3) break;
        r.target.struggle = 0.5;
        r.context.KDEnemyStruggleTurn(r.target);
        r.wrap.prepareTurn(1);
        assert.equal(r.wrap.record(r.target).progress, turn);
    }
    assert.equal(r.map.Entities.includes(r.target), false);
});

test("a nearby replacement cannot inherit strands after every contributing spider is lost", () => {
    const r = fixture();
    r.act(r.spiders[0]);
    r.spiders[0].hp = 0;
    r.wrap.prepareTurn(1);
    assert.equal(r.wrap.record(r.target), undefined);
    assert.ok(r.act(r.spiders[1]));
    assert.equal(r.wrap.record(r.target).progress, 1);
});

test("attributed native helplessness requires three consecutive positive world turns without carriers", () => {
    const r = fixture();
    r.target.full = false;
    r.target.helpless = true;
    for (const spider of r.spiders) spider.x = 20;
    r.wrap.tickAfter(0);
    assert.equal(r.wrap.record(r.target), undefined);
    r.wrap.tickAfter(1);
    assert.equal(r.wrap.record(r.target).helplessTurns, 1);
    r.target.helpless = false;
    r.wrap.tickAfter(1);
    assert.equal(r.wrap.record(r.target), undefined);
    r.target.helpless = true;
    r.wrap.tickAfter(1);
    r.wrap.tickAfter(1);
    assert.equal(r.map.Entities.includes(r.target), true);
    r.wrap.tickAfter(1);
    assert.equal(r.map.Entities.includes(r.target), false);
});

test("unrelated binding cannot turn a small spider silk hit into fallback capture", () => {
    const r = fixture();
    r.target.full = false;
    r.target.helpless = true;
    r.target.silkSufficient = false;
    for (const spider of r.spiders) spider.x = 20;
    for (let turn = 0; turn < 3; turn++) r.wrap.tickAfter(1);
    assert.equal(r.map.Entities.includes(r.target), true);
    assert.equal(r.wrap.record(r.target), undefined);
});

test("a target that joins the silk source faction stays protected after all spiders leave", () => {
    const r = fixture();
    r.target.full = false;
    r.target.helpless = true;
    r.target.faction = "Enemy";
    r.map.Entities.splice(0, 3);
    for (let turn = 0; turn < 3; turn++) r.wrap.tickAfter(1);
    assert.equal(r.map.Entities.includes(r.target), true);
    assert.equal(r.wrap.targetEligible(r.target), false);
});

test("saved Spiderling identity keeps faction-specific rivalry after all spiders leave", () => {
    const r = fixture();
    r.context.KDHostile = (source, target) =>
        source.faction !== target.faction && source.Enemy?.name === "WebCaster" && target.faction === "Maidforce";
    r.target.full = false;
    r.target.helpless = true;
    r.map.Entities.splice(0, 3);
    assert.equal(r.wrap.targetEligible(r.target), true);
    for (let turn = 0; turn < 3; turn++) r.wrap.tickAfter(1);
    assert.equal(r.map.Entities.includes(r.target), false);
});

test("cancelled native removal retains paid completion and never charges another action", () => {
    const r = fixture();
    r.target.cancelRemoval = true;
    for (const spider of r.spiders) r.act(spider);
    assert.equal(r.wrap.record(r.target).progress, 3);
    assert.equal(r.map.Entities.includes(r.target), true);
    r.target.cancelRemoval = false;
    r.wrap.tickAfter(1);
    assert.equal(r.map.Entities.includes(r.target), true, "nonhelpless retry waits for a paid opportunity");
    r.wrap.prepareTurn(1);
    r.act(r.spiders[0]);
    assert.equal(r.map.Entities.includes(r.target), false);
    assert.equal(r.calls.removed.length, 2);
});

test("protected roles, nonhostile prey and foreign or absent silk cannot be wrapped", () => {
    for (const exclusion of [
        (target) => {
            target.Enemy.tags.nocapture = true;
        },
        (target) => {
            target.Enemy.specialdialogue = "Story";
        },
        (target) => {
            target.data = { shop: "Shop" };
        },
        (target) => {
            target.peaceful = true;
        },
        (target) => {
            target.silk = false;
        },
        (target) => {
            target.Enemy.immobile = true;
        },
    ]) {
        const r = fixture();
        exclusion(r.target);
        assert.equal(r.act(r.spiders[0]), undefined);
        assert.equal(r.wrap.record(r.target), undefined);
    }
});

test("an existing wrap resets when native hostility ends", () => {
    const r = fixture();
    r.act(r.spiders[0]);
    r.target.peaceful = true;
    r.wrap.prepareTurn(1);
    assert.equal(r.wrap.record(r.target), undefined);
});

test("ordinary miniboss prey remains eligible while BlindZombie's nocapture tag protects it", () => {
    for (const name of ["MaidKnightHeavy", "DragonGirlCrystal", "DragonGirlShadow"]) {
        const r = fixture();
        r.target.Enemy.name = name;
        r.target.Enemy.tags.miniboss = true;
        assert.ok(r.act(r.spiders[0]), name);
    }
    const blind = fixture();
    blind.target.Enemy.name = "BlindZombie";
    blind.target.Enemy.tags.nocapture = true;
    assert.equal(blind.act(blind.spiders[0]), undefined);
});

test("an ordinary persistent NPC may be wrapped, while alwaysEscape protects a scripted one", () => {
    const ordinary = fixture();
    ordinary.context.KDIsNPCPersistent = () => true;
    ordinary.context.KDGetPersistentNPC = () => ({ alwaysEscape: false });
    assert.ok(ordinary.act(ordinary.spiders[0]));
    const scripted = fixture();
    scripted.context.KDIsNPCPersistent = () => true;
    scripted.context.KDGetPersistentNPC = () => ({ alwaysEscape: true });
    assert.equal(scripted.act(scripted.spiders[0]), undefined);
});

test("KDHostile governs an allied spider and prey pair without blanket allegiance exclusions", () => {
    const r = fixture();
    r.spiders[0].allied = true;
    r.spiders[0].Enemy.allied = true;
    r.target.allied = true;
    r.target.Enemy.allied = true;
    assert.ok(r.act(r.spiders[0]));
    assert.equal(r.wrap.record(r.target).progress, 1);
});

test("shared dispatcher gives closed Spinner capture precedence and pays each action once", () => {
    const calls = [];
    const oldResult = { old: true };
    const newResult = { wrapping: true };
    let closed = true;
    const c = {
        Spiderlings: {
            Hooks: { wrap: (_id, native, wrapper) => wrapper(native) },
            SpinnerScenarios: {},
            Infestation: {},
            SpinnerNativeField: { isOwnedProxy: () => false, handleEnemyTurn: () => undefined },
            SpinnerRecovery: { handleEnemyTurn: () => undefined },
            SpinnerCapture: { handleEnemyTurn: () => undefined },
            SpinnerNPCCapture: {
                handleEnemyTurn: () => {
                    calls.push("closed");
                    return closed ? oldResult : undefined;
                },
            },
            SpinnerNPCRecovery: { handleEnemyTurn: () => undefined },
            NPCWrapping: {
                handleEnemyTurn: () => {
                    calls.push("wrap");
                    return newResult;
                },
            },
            SpinnerField: { handleEnemyTurn: () => undefined },
        },
        KinkyDungeonEnemyLoop: () => {
            calls.push("native");
        },
    };
    vm.createContext(c);
    vm.runInContext(dispatcher, c);
    const spider = { id: 1, Enemy: { name: "Spinner" } };
    assert.equal(c.KinkyDungeonEnemyLoop(spider, {}, 1), oldResult);
    assert.deepEqual(calls, ["closed"]);
    closed = false;
    assert.equal(c.KinkyDungeonEnemyLoop(spider, {}, 1), newResult);
    assert.deepEqual(calls, ["closed", "closed", "wrap"]);
});

test("full pin releases an older closed-field record before any new paid action", () => {
    const r = fixture();
    r.context.KDGameData.SpiderlingsSpinnerNPCCaptures = {
        version: 1,
        records: { 10: { targetId: 10, sourceIds: [1] } },
    };
    assert.equal(r.wrap.sourceEligible(r.spiders[0], r.target), false);
    r.wrap.prepareTurn(1);
    assert.equal(r.context.Spiderlings.SpinnerNPCCapture.records()[10], undefined);
    assert.ok(r.act(r.spiders[0]));
    assert.equal(r.wrap.record(r.target).progress, 1);
    r.context.Spiderlings.Combat = { applySilkBinding: () => assert.fail("old capture must not add Slime") };
    r.context.Spiderlings.SpinnerNPCCapture.settleTurn(1);
});

test("reload retains paid actions and pending strands without replaying a source", () => {
    const r = fixture();
    r.act(r.spiders[0]);
    r.map.SpiderlingsNPCWrapping = JSON.parse(JSON.stringify(r.map.SpiderlingsNPCWrapping));
    r.wrap.afterLoad();
    assert.equal(r.wrap.record(r.target).progress, 1);
    assert.equal(r.act(r.spiders[0]), undefined);
    r.wrap.prepareTurn(1);
    assert.ok(r.act(r.spiders[0]));
    assert.equal(r.wrap.record(r.target).progress, 2);
});
