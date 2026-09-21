"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { loadLifecycleRuntime, modRoot } = require("./helpers/lifecycle-runtime.js");

function recoveryRuntime(options = {}) {
    const gear = [],
        flags = new Map(),
        map = new Map(),
        tiles = new Map();
    let nextItemId = 1,
        canAdd = options.canAdd !== false,
        blockers = options.blockers || [],
        breached = true,
        fieldPresent = true,
        nativeLoops = 0,
        nativeLeash = { restraintID: 901, entity: 777, priority: 9 },
        contextRef;
    const player = { id: "player", x: 7, y: 5, player: true, leash: nativeLeash };
    if (options.item) gear.push(options.item);
    const runtime = loadLifecycleRuntime(
        {
            KDGameData: {},
            KDMapData: { Entities: [] },
            KDPlayerEffects: {},
            KinkyDungeonCurrentTick: 10,
            KinkyDungeonPlayerEntity: player,
            KinkyDungeonFlags: flags,
            KinkyDungeonMovableTilesEnemy: ".D",
            KinkyDungeonMapGet(x, y) {
                return map.get(`${x},${y}`) || ".";
            },
            KinkyDungeonTilesGet(key) {
                return tiles.get(key);
            },
            KinkyDungeonEntityAt(x, y) {
                return contextRef.KDMapData.Entities.find(
                    (entity) => entity.x === x && entity.y === y && entity.hp > 0,
                );
            },
            KinkyDungeonAllRestraintDynamic() {
                return gear.map((item) => ({ item }));
            },
            KinkyDungeonGetRestraintItem(group) {
                return gear.find((item) => (item.group || item.restraint?.Group) === group);
            },
            KDRestraint(item) {
                return item?.restraint;
            },
            KDGetBlockersToAddRestraint() {
                return blockers;
            },
            KDCanAddRestraint() {
                return canAdd;
            },
            KinkyDungeonAddRestraint(restraint) {
                if (!canAdd || blockers.length) return 0;
                gear.unshift({
                    id: `owned-${nextItemId++}`,
                    name: restraint.name,
                    group: restraint.Group,
                    restraint,
                    lock: "",
                    data: {},
                });
                return 1;
            },
            KDHostile(enemy) {
                return !enemy.friendly;
            },
            KDHelpless(enemy) {
                return !!enemy.helpless;
            },
            KinkyDungeonIsDisabled(enemy) {
                return !!enemy.disabled;
            },
            KinkyDungeonCheckLOS(_source, _target, _distance, maxDistance, blockEnemies, blockOnlyLOSBlock) {
                assert.equal(maxDistance, 3);
                assert.equal(blockEnemies, false);
                assert.equal(blockOnlyLOSBlock, false);
                return !options.noLOS;
            },
            KinkyDungeonFindPath(startX, startY, endX, endY) {
                const dx = Math.sign(endX - startX),
                    dy = Math.sign(endY - startY);
                return dx || dy ? [{ x: startX + dx, y: startY + dy }] : [];
            },
            KinkyDungeonSetFlag(name, duration) {
                flags.set(name, duration);
            },
            KinkyDungeonEnemyLoop() {
                nativeLoops++;
                return { native: true };
            },
        },
        undefined,
        true,
    );
    const c = runtime.context;
    contextRef = c;
    c.Spiderlings.SpinnerNativeField = {
        isOwnedProxy: () => false,
        containingComposite: () => undefined,
        captureGeometryReady: () => false,
        breachedDeparture(from, to) {
            if (!breached || from.x > 6 || to.x <= 6) return undefined;
            return { compositeId: "field-1", groupId: "group-1", eligibleSourceIds: [41] };
        },
        commonCore: () => (fieldPresent ? { x: 5, y: 5 } : undefined),
        accrueConstructionAction(enemy, delta) {
            enemy.recoveryCredit = (enemy.recoveryCredit || 0) + Math.max(0, delta || 0);
            if (enemy.recoveryCredit < 1) return false;
            enemy.recoveryCredit -= 1;
            return true;
        },
        onEntry() {},
        onNativeDamage() {},
        tick() {},
        reconcile() {},
        handleEnemyTurn: () => undefined,
    };
    c.Spiderlings.SpinnerField = {
        suppressesBinding: () => false,
        handleEnemyTurn: () => undefined,
    };
    c.Spiderlings.SpinnerAI = undefined;
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerRecovery.js"), "utf8"), c, {
        filename: "SpiderlingsSpinnerRecovery.js",
    });
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerRuntime.js"), "utf8"), c, {
        filename: "SpiderlingsSpinnerRuntime.js",
    });
    c.KDMovePlayer = (x, y, willing) => {
        const data = { lastX: player.x, lastY: player.y, moveX: x, moveY: y, willing, cancelmove: false };
        player.x = x;
        player.y = y;
        if (!willing) flags.set("forceMoved", 1);
        c.KDEventMapGeneric.playerMove.SpiderlingsSpinnerRuntime({}, data);
        return true;
    };
    const source = {
        id: 41,
        x: 9,
        y: 5,
        hp: 3,
        buffs: {},
        Enemy: { name: "Spinner", attack: "MeleeEffect", attackRange: 1, movePoints: 1 },
    };
    c.KDMapData.Entities.push(source);
    const send = (trigger, data = {}) => c.KDEventMapGeneric[trigger]?.SpiderlingsSpinnerRuntime?.({}, data);
    return {
        c,
        api: c.Spiderlings.SpinnerRecovery,
        gear,
        flags,
        player,
        source,
        send,
        nativeLoops: () => nativeLoops,
        setBreached: (value) => {
            breached = value;
        },
        setFieldPresent: (value) => {
            fieldPresent = value;
        },
        setCanAdd: (value) => {
            canAdd = value;
        },
        setBlockers: (value) => {
            blockers = value;
        },
        setNativeLeash: (value) => {
            nativeLeash = value;
            player.leash = value;
        },
        leave: () => c.KDMovePlayer(7, 5, true),
        hit: () =>
            c.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
                player,
                0,
                { profile: "Spinner" },
                undefined,
                "Enemy",
                undefined,
                source,
            ),
    };
}

function externalLeash(id = "external-1") {
    return {
        id,
        name: "ForeignLeash",
        group: "ItemNeckRestraints",
        lock: "Blue",
        tightness: 7,
        cutProgress: 0.37,
        struggleProgress: 0.42,
        data: { owner: "foreign", nested: { value: 3 } },
        dynamicLink: { id: "collar-1", name: "ForeignCollar" },
        restraint: { name: "ForeignLeash", Group: "ItemNeckRestraints", leash: true, tether: 2.9 },
    };
}

test("only an actual departure through a breached outer field arms a fresh recovery hit", () => {
    const r = recoveryRuntime();
    r.setBreached(false);
    r.leave();
    assert.equal(r.api.departure(), undefined, "opening or standing outside does not arm recovery");
    r.setBreached(true);
    r.c.Spiderlings.SpinnerCapture.isControllingPlayer = () => true;
    r.player.x = 6;
    r.leave();
    assert.equal(r.api.departure(), undefined, "capture or wrapping blocks departure arming");
    r.c.Spiderlings.SpinnerCapture.isControllingPlayer = () => false;
    r.player.x = 6;
    r.leave();
    assert.deepEqual(JSON.parse(JSON.stringify(r.api.departure())), {
        version: 1,
        compositeId: "field-1",
        groupId: "group-1",
        eligibleSourceIds: [41],
    });
    assert.equal(r.gear.length, 0, "departure itself never equips a leash");
});

test("an active capture consumes the Spinner hit before recovery fallback", () => {
    const r = recoveryRuntime();
    r.player.x = 6;
    r.leave();
    r.c.Spiderlings.SpinnerCapture.hit = () => false;
    r.c.Spiderlings.SpinnerCapture.isControllingPlayer = () => true;
    assert.equal(r.hit().effect, false);
    assert.equal(r.api.state(), undefined);
    assert.equal(r.gear.length, 0);
    assert.ok(r.api.departure(), "capture cannot consume the saved departure for recovery");

    r.c.Spiderlings.SpinnerCapture.isControllingPlayer = () => false;
    r.hit();
    assert.ok(r.api.state(), "a later fresh hit may start recovery after capture ends");
});

test("the fresh native hit adds one owned leash and reload preserves its exact identity", () => {
    const r = recoveryRuntime();
    r.player.x = 6;
    r.leave();
    assert.equal(r.api.state(), undefined, "a miss never reaches the successful hit entrance");
    const outcome = r.hit();
    assert.equal(outcome.effect, false);
    assert.equal(r.gear.length, 1);
    assert.equal(r.gear[0].name, "SpiderlingsSilkLeash");
    assert.equal(r.api.state().carrierId, r.gear[0].id);
    const carrier = r.gear[0];
    r.send("afterLoadGame");
    r.hit();
    assert.equal(r.gear.length, 1);
    assert.equal(r.gear[0], carrier);
});

test("a compatible external leash is reused byte-for-byte with native ownership unchanged", () => {
    const carrier = externalLeash(),
        r = recoveryRuntime({ item: carrier }),
        before = JSON.stringify(carrier),
        leashBefore = JSON.stringify(r.player.leash);
    r.player.x = 6;
    r.leave();
    r.hit();
    assert.equal(r.api.state().carrierId, carrier.id);
    assert.equal(r.api.state().ownedCarrier, false);
    assert.equal(JSON.stringify(carrier), before);
    assert.equal(JSON.stringify(r.player.leash), leashBefore);
    assert.equal(r.gear.length, 1);
});

test("an incompatible neck item blocks owned addition without any mutation", () => {
    const collar = {
            id: "plain-collar",
            name: "PlainCollar",
            group: "ItemNeckRestraints",
            lock: "Gold",
            data: { escape: 0.25 },
            restraint: { name: "PlainCollar", Group: "ItemNeckRestraints", leash: false },
        },
        r = recoveryRuntime({ item: collar, blockers: [collar] }),
        before = JSON.stringify(collar);
    r.player.x = 6;
    r.leave();
    assert.equal(r.hit().effect, false, "the legal recovery hit is consumed");
    assert.equal(r.api.state(), undefined);
    assert.equal(r.gear.length, 1);
    assert.equal(JSON.stringify(collar), before);
});

test("source loss leaves real equipment slack and requires another successful hit", () => {
    const r = recoveryRuntime();
    r.player.x = 6;
    r.leave();
    r.hit();
    const carrier = r.gear[0];
    r.source.hp = 0;
    r.api.audit();
    assert.deepEqual(Array.from(r.api.state().sourceIds), []);
    assert.equal(r.gear[0], carrier);
    r.source.hp = 3;
    r.api.audit();
    assert.deepEqual(Array.from(r.api.state().sourceIds), [], "validity alone cannot reconnect a source");
    r.hit();
    assert.deepEqual(Array.from(r.api.state().sourceIds), [41]);
});

test("the executor pays before pulling once toward the live core or surviving source", () => {
    const r = recoveryRuntime();
    r.player.x = 6;
    r.leave();
    r.hit();
    r.player.x = 7;
    r.c.KinkyDungeonCurrentTick = 20;
    r.c.KinkyDungeonEnemyLoop(r.source, r.player, 0.5);
    assert.equal(r.player.x, 7, "no complete native action means no pull");
    r.c.KinkyDungeonEnemyLoop(r.source, r.player, 0.5);
    assert.equal(r.player.x, 6);
    assert.equal(r.nativeLoops(), 0, "the executing source cannot also use native AI");
    assert.equal(r.flags.get("pulled"), 1);

    r.flags.clear();
    r.c.KinkyDungeonCurrentTick = 21;
    r.player.x = 7;
    r.source.x = 9;
    r.setFieldPresent(false);
    r.c.KinkyDungeonEnemyLoop(r.source, r.player, 1);
    assert.equal(r.player.x, 8, "a missing field falls back toward the surviving source");
});

test("native-first and owned-first orders allow only one displacement in a world turn", () => {
    const nativeFirst = recoveryRuntime();
    nativeFirst.player.x = 6;
    nativeFirst.leave();
    nativeFirst.hit();
    nativeFirst.flags.clear();
    nativeFirst.c.KinkyDungeonCurrentTick = 30;
    nativeFirst.c.KDMovePlayer(8, 5, false);
    nativeFirst.c.KinkyDungeonEnemyLoop(nativeFirst.source, nativeFirst.player, 1);
    assert.equal(nativeFirst.player.x, 8);

    const ownedFirst = recoveryRuntime();
    ownedFirst.player.x = 6;
    ownedFirst.leave();
    ownedFirst.hit();
    ownedFirst.flags.clear();
    ownedFirst.player.x = 7;
    ownedFirst.c.KinkyDungeonCurrentTick = 31;
    ownedFirst.c.KinkyDungeonEnemyLoop(ownedFirst.source, ownedFirst.player, 1);
    assert.equal(ownedFirst.player.x, 6);
    assert.equal(ownedFirst.flags.get("forceMoved"), 1);
    assert.equal(ownedFirst.flags.get("pulled"), 1);
    const afterOwned = ownedFirst.player.x;
    if (!ownedFirst.flags.get("forceMoved")) ownedFirst.c.KDMovePlayer(7, 5, false);
    assert.equal(ownedFirst.player.x, afterOwned);
});

test("carrier removal and lifecycle boundaries clear control without removing equipment", () => {
    const r = recoveryRuntime();
    r.player.x = 6;
    r.leave();
    r.hit();
    const carrier = r.gear.shift();
    r.send("postRemoval", { item: carrier });
    assert.equal(r.api.state(), undefined);
    assert.ok(r.api.departure(), "a later fresh hit may establish another real carrier");
    r.gear.unshift(carrier);
    r.hit();
    assert.ok(r.api.state());
    for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterNewGame"]) {
        r.send(trigger);
        assert.equal(r.api.state(), undefined, trigger);
        assert.equal(r.api.departure(), undefined, trigger);
        assert.equal(r.gear[0], carrier, trigger);
        r.player.x = 6;
        r.leave();
        r.hit();
    }
});
