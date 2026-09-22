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
        tiles = new Map(),
        webCells = new Set(),
        eligibleSourceIds = [41],
        cores = new Map([["field-1", { x: 5, y: 5 }]]),
        fieldOwners = new Map([["field-1", [41]]]),
        staminaChanges = [];
    let nextItemId = 1,
        canAdd = options.canAdd !== false,
        blockers = options.blockers || [],
        breached = true,
        fieldPresent = true,
        nativeLoops = 0,
        stamina = 10,
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
                if (webCells.has(`${x},${y}`)) return { x, y, webProxy: true, Enemy: { name: "Web" } };
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
            KinkyDungeonCheckLOS(source, _target, _distance, maxDistance, blockEnemies, blockOnlyLOSBlock) {
                assert.equal(maxDistance, 3);
                assert.equal(blockEnemies, false);
                assert.equal(blockOnlyLOSBlock, false);
                return !options.noLOS && !source.noLOS;
            },
            KinkyDungeonFindPath(startX, startY, endX, endY) {
                if (typeof options.pathFinder === "function") return options.pathFinder(startX, startY, endX, endY);
                const dx = Math.sign(endX - startX),
                    dy = Math.sign(endY - startY);
                return dx || dy ? [{ x: startX + dx, y: startY + dy }] : [];
            },
            KinkyDungeonSetFlag(name, duration) {
                flags.set(name, duration);
            },
            KinkyDungeonHasStamina(cost) {
                return stamina >= cost;
            },
            KDChangeStamina(_category, _type, _id, amount) {
                stamina += amount;
                staminaChanges.push(amount);
            },
            KinkyDungeonAdvanceTime(delta) {
                contextRef.KinkyDungeonCurrentTick += delta;
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
        containingComposite: () => undefined,
        captureGeometryReady: () => false,
        breachedDeparture(from, to) {
            if (!breached || from.x > 6 || to.x <= 6) return undefined;
            return { compositeId: "field-1", groupId: "group-1", eligibleSourceIds: [...eligibleSourceIds] };
        },
        state: () => ({ topology: { composites: Object.fromEntries([...cores].map(([id]) => [id, { id }])) } }),
        compositeById: (id) => (fieldPresent && cores.has(id) ? { id } : undefined),
        fieldOwners: (id) => fieldOwners.get(id) || [],
        commonCore: (id) => (fieldPresent ? cores.get(id) : undefined),
        isSpiderlingsWebCell: (cell) => webCells.has(`${cell.x},${cell.y}`),
        isOwnedProxy: (entity) => entity?.webProxy === true,
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
    const addSource = (id, x = 9, y = 5, overrides = {}) => {
        const added = {
            id,
            x,
            y,
            hp: 3,
            buffs: {},
            Enemy: { name: "Spinner", attack: "MeleeEffect", attackRange: 1, movePoints: 1 },
            ...overrides,
        };
        c.KDMapData.Entities.push(added);
        if (!eligibleSourceIds.includes(id)) eligibleSourceIds.push(id);
        return added;
    };
    const send = (trigger, data = {}) => c.KDEventMapGeneric[trigger]?.SpiderlingsSpinnerRuntime?.({}, data);
    return {
        c,
        api: c.Spiderlings.SpinnerRecovery,
        inventoryEvents: runtime.inventoryEvents,
        gear,
        flags,
        player,
        source,
        addSource,
        eligibleSourceIds,
        cores,
        fieldOwners,
        webCells,
        map,
        tiles,
        staminaChanges,
        stamina: () => stamina,
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
        hit: (hitter = source) =>
            c.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
                player,
                0,
                { profile: "Spinner" },
                undefined,
                "Enemy",
                undefined,
                hitter,
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
    assert.deepEqual(Array.from(r.api.sourceIds()), []);
    assert.equal(r.gear[0], carrier);
    r.source.hp = 3;
    r.api.audit();
    assert.deepEqual(Array.from(r.api.sourceIds()), [], "validity alone cannot reconnect a source");
    r.hit();
    assert.deepEqual(Array.from(r.api.sourceIds()), [41]);
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

test("distinct hits build one-to-eight source records while refresh, audit, and re-hit keep identity rules", () => {
    const r = recoveryRuntime();
    const extras = Array.from({ length: 8 }, (_, index) => r.addSource(42 + index));
    r.player.x = 6;
    r.leave();
    r.hit();
    for (const source of extras) r.hit(source);
    assert.deepEqual(Array.from(r.api.sourceIds()), [41, 42, 43, 44, 45, 46, 47, 48]);
    assert.equal(r.api.strength(), 8);
    assert.equal(r.api.state().sources["49"], undefined, "the ninth distinct source is ignored");

    const work = (r.api.state().sourceRemovalWork["42"] = { removeOrStruggle: 1 });
    r.c.KinkyDungeonCurrentTick = 15;
    r.hit(extras[0]);
    assert.equal(r.api.state().sources["42"].lastHitTick, 15);
    assert.equal(r.api.state().sourceRemovalWork["42"], work, "refresh does not reset removal work");

    r.source.hp = 0;
    r.api.audit();
    assert.equal(r.api.state().sources["41"], undefined);
    assert.equal(r.api.state().executorId, 42);
    assert.equal(extras[0].SpinnerConstructionPoints, 0, "replacement receives no inherited action credit");
    r.source.hp = 3;
    r.api.audit();
    assert.equal(r.api.state().sources["41"], undefined, "proximity cannot reconnect an audited source");
    r.hit();
    assert.ok(r.api.state().sources["41"], "a fresh hit reconnects the source");
});

test("owned escape penalty scales by source count while an external carrier stays immutable", () => {
    const owned = recoveryRuntime();
    const sources = Array.from({ length: 7 }, (_, index) => owned.addSource(42 + index));
    owned.player.x = 6;
    owned.leave();
    owned.hit();
    const carrier = owned.gear[0];
    const before = owned.inventoryEvents["beforeStruggleCalc:SpiderlingsRecoveryEscape"];
    const one = { restraint: carrier, struggleType: "Remove", escapePenalty: 0, query: true };
    before({}, carrier, one);
    assert.equal(one.escapePenalty, 0);
    for (const source of sources) owned.hit(source);
    const eight = { restraint: carrier, struggleType: "Remove", escapePenalty: 0, query: true };
    before({}, carrier, eight);
    assert.ok(Math.abs(eight.escapePenalty - 0.35) < 1e-9);
    assert.equal(owned.api.strength(), 8);

    const foreign = externalLeash();
    const external = recoveryRuntime({ item: foreign });
    external.player.x = 6;
    external.leave();
    external.hit();
    const snapshot = JSON.stringify(foreign);
    const attempt = { restraint: foreign, struggleType: "Remove", escapePenalty: 0, query: true };
    external.inventoryEvents["beforeStruggleCalc:SpiderlingsRecoveryEscape"]({}, foreign, attempt);
    assert.equal(attempt.escapePenalty, 0);
    assert.equal(JSON.stringify(foreign), snapshot);
});

test("stand firm costs 5/7/19 displayed stamina and survives until a legal paid pull", () => {
    for (const [count, displayed] of [
        [1, 5],
        [2, 7],
        [8, 19],
    ]) {
        const r = recoveryRuntime();
        const sources = Array.from({ length: count - 1 }, (_, index) => r.addSource(42 + index));
        r.player.x = 6;
        r.leave();
        r.hit();
        for (const source of sources) r.hit(source);
        r.player.x = 7;
        assert.equal(r.api.standFirmCost(), displayed);
        assert.equal(r.api.standFirm(), "Stand");
        assert.equal(r.staminaChanges.at(-1), -displayed / 10);
        assert.equal(r.api.state().resisted, true);
        r.c.KinkyDungeonCurrentTick += 1;
        r.c.KinkyDungeonEnemyLoop(r.source, r.player, 1);
        assert.equal(r.player.x, 7);
        assert.equal(r.api.state().resisted, false);
    }
});

test("one- and two-cell Spiderlings web runs cost two paid actions per cell", () => {
    for (const [cells, actions] of [
        [["6,5"], 2],
        [["6,5", "5,5"], 4],
    ]) {
        const r = recoveryRuntime();
        for (const cell of cells) r.webCells.add(cell);
        if (cells.length === 2) r.cores.set("field-1", { x: 4, y: 5 });
        r.player.x = 6;
        r.leave();
        r.hit();
        r.player.x = 7;
        r.flags.clear();
        for (let action = 1; action <= actions; action++) {
            r.c.KinkyDungeonCurrentTick += 1;
            r.c.KinkyDungeonEnemyLoop(r.source, r.player, 1);
            assert.equal(r.player.x, action === actions ? (cells.length === 1 ? 5 : 4) : 7);
        }
        assert.equal(r.api.state().pendingCrossing, undefined);
    }
});

test("source removal uses one Cut or two shared Remove/Struggle results without changing carrier progress", () => {
    const r = recoveryRuntime();
    const second = r.addSource(42);
    r.player.x = 6;
    r.leave();
    r.hit();
    r.hit(second);
    const carrier = r.gear[0];
    carrier.cutProgress = 0.2;
    carrier.struggleProgress = 0.3;
    const before = r.inventoryEvents["beforeStruggleCalc:SpiderlingsRecoveryEscape"],
        after = r.inventoryEvents["struggle:SpiderlingsRecoveryEscape"];
    r.c.KDInputTypes.struggle = ({ type }) => {
        const attempt = {
            restraint: carrier,
            struggleType: type,
            struggleGroup: "ItemNeckRestraints",
            cost: -0.2,
            canCut: true,
            result: "Fail",
        };
        before({}, carrier, attempt);
        carrier.cutProgress = 0.9;
        carrier.struggleProgress = 0.9;
        after({}, carrier, attempt);
        return "NativeStruggle";
    };
    r.api.sourceRemovalInput({ sourceId: 42, type: "Remove" });
    assert.ok(r.api.state().sources["42"]);
    r.api.sourceRemovalInput({ sourceId: 42, type: "Struggle" });
    assert.equal(r.api.state().sources["42"], undefined);
    assert.equal(carrier.cutProgress, 0.2);
    assert.equal(carrier.struggleProgress, 0.3);

    r.hit(second);
    r.api.sourceRemovalInput({ sourceId: 42, type: "Cut" });
    assert.equal(r.api.state().sources["42"], undefined);
});

test("destination uses common core, unrelated majority, nearest tie, and executor fallback", () => {
    const r = recoveryRuntime({
        pathFinder: (startX, startY, endX, endY) =>
            Array.from({ length: endX === 5 ? 2 : 1 }, () => ({ x: endX, y: endY })),
    });
    const sources = Array.from({ length: 6 }, (_, index) => r.addSource(42 + index));
    r.cores.set("field-2", { x: 9, y: 5 });
    r.fieldOwners.set("field-1", [41, 42, 43, 44]);
    r.fieldOwners.set("field-2", [45, 46, 47]);
    r.player.x = 6;
    r.leave();
    r.hit();
    for (const source of sources) r.hit(source);
    assert.equal(r.api.destination(r.api.state()).compositeId, "field-1", "4:3 majority controls");
    r.source.hp = 0;
    r.c.KDMapData.Entities.find((source) => source.id === 42).hp = 0;
    r.api.audit();
    assert.equal(r.api.destination(r.api.state()).compositeId, "field-2", "nearest live core wins a tie");
    r.setFieldPresent(false);
    const fallback = r.api.destination(r.api.state());
    assert.match(fallback.key, /^source:/);
    assert.equal(fallback.x, r.c.KDMapData.Entities.find((source) => source.id === r.api.state().executorId).x);
});

test("death, hostility, range, LOS, helplessness, and incapacity each require a fresh source hit", () => {
    for (const [label, mutate, repair] of [
        ["death", (source) => (source.hp = 0), (source) => (source.hp = 3)],
        ["hostility", (source) => (source.friendly = true), (source) => (source.friendly = false)],
        ["range", (source) => (source.x = 20), (source) => (source.x = 9)],
        ["LOS", (source) => (source.noLOS = true), (source) => (source.noLOS = false)],
        ["helpless", (source) => (source.helpless = true), (source) => (source.helpless = false)],
        ["disabled", (source) => (source.disabled = true), (source) => (source.disabled = false)],
    ]) {
        const r = recoveryRuntime();
        r.player.x = 6;
        r.leave();
        r.hit();
        mutate(r.source);
        r.api.audit();
        assert.deepEqual(Array.from(r.api.sourceIds()), [], label);
        repair(r.source);
        r.api.audit();
        assert.deepEqual(Array.from(r.api.sourceIds()), [], `${label}: audit cannot reconnect`);
        r.hit();
        assert.deepEqual(Array.from(r.api.sourceIds()), [41], `${label}: a new hit reconnects`);
    }
});

test("pending crossing reload validates saved progress and cancels stale geometry without a free move", () => {
    const r = recoveryRuntime();
    r.webCells.add("6,5");
    r.player.x = 6;
    r.leave();
    r.hit();
    r.player.x = 7;
    r.flags.clear();
    r.c.KinkyDungeonCurrentTick = 20;
    r.c.KinkyDungeonEnemyLoop(r.source, r.player, 1);
    assert.equal(r.api.state().pendingCrossing.paidActions, 1);
    const saved = JSON.parse(JSON.stringify(r.api.state().pendingCrossing));
    r.send("afterLoadGame");
    assert.deepEqual(JSON.parse(JSON.stringify(r.api.state().pendingCrossing)), saved);
    assert.equal(r.player.x, 7);

    r.webCells.clear();
    r.send("afterLoadGame");
    assert.equal(r.api.state().pendingCrossing, undefined);
    assert.equal(r.player.x, 7);

    r.webCells.add("6,5");
    r.c.KinkyDungeonCurrentTick += 1;
    r.c.KinkyDungeonEnemyLoop(r.source, r.player, 1);
    assert.ok(r.api.state().pendingCrossing);
    r.source.hp = 0;
    r.api.audit();
    assert.equal(r.api.state().pendingCrossing, undefined);
    r.source.hp = 3;
    r.hit();
    assert.equal(r.api.state().pendingCrossing, undefined, "re-hit starts with no saved crossing work");
});

test("load migrates the v1 source and keeps v2 removal work without granting an action", () => {
    const r = recoveryRuntime();
    r.player.x = 6;
    r.leave();
    r.hit();
    const current = r.api.state();
    r.c.KDGameData.SpiderlingsSpinnerRecovery = {
        version: 1,
        carrierId: current.carrierId,
        ownedCarrier: true,
        compositeId: "field-1",
        groupId: "group-1",
        eligibleSourceIds: [41],
        sourceIds: [41],
        executorId: 41,
        lastPullTick: undefined,
    };
    r.source.SpinnerConstructionPoints = 0.5;
    r.send("afterLoadGame");
    assert.equal(r.api.state().version, 2);
    assert.deepEqual(Array.from(r.api.sourceIds()), [41]);
    assert.deepEqual(JSON.parse(JSON.stringify(r.api.state().sourceRemovalWork)), {});
    assert.equal(r.player.x, 7, "migration performs no pull");
});

test("external carrier remains byte-for-byte unchanged through stand firm and source removal", () => {
    const carrier = externalLeash();
    const r = recoveryRuntime({ item: carrier });
    const second = r.addSource(42);
    r.player.x = 6;
    r.leave();
    r.hit();
    r.hit(second);
    const original = JSON.stringify(carrier);
    r.api.standFirm();
    const before = r.inventoryEvents["beforeStruggleCalc:SpiderlingsRecoveryEscape"],
        after = r.inventoryEvents["struggle:SpiderlingsRecoveryEscape"];
    r.c.KDInputTypes.struggle = ({ type }) => {
        const attempt = {
            restraint: carrier,
            struggleType: type,
            struggleGroup: "ItemNeckRestraints",
            cost: -0.2,
            canCut: true,
            result: "Fail",
        };
        before({}, carrier, attempt);
        after({}, carrier, attempt);
        return "NativeStruggle";
    };
    r.api.sourceRemovalInput({ sourceId: 42, type: "Cut" });
    assert.equal(JSON.stringify(carrier), original);
    assert.equal(r.api.state().ownedCarrier, false);
});
