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
        staminaChanges = [],
        messages = [];
    let nextItemId = 1,
        canAdd = options.canAdd !== false,
        blockers = options.blockers || [],
        breached = true,
        fieldPresent = true,
        nativeLoops = 0,
        stamina = 10,
        nativeLeash = undefined,
        contextRef;
    const player = { id: "player", x: 7, y: 5, player: true, leash: nativeLeash };
    if (options.item) gear.push(options.item);
    const runtime = loadLifecycleRuntime(
        {
            KDLeashReason: {},
            KinkyDungeonAttachTetherToEntity(length, owner, target, reason, color, priority, item) {
                if (target.leash && target.leash.priority >= priority) return undefined;
                return (target.leash = { length, entity: owner.id, reason, color, priority, restraintID: item.id });
            },
            KDBreakTether(target) {
                delete target.leash;
            },
            KinkyDungeonUpdateTether(delta, message, target) {
                (contextRef.tetherCalls ||= []).push({ delta, message, owner: target.leash?.entity });
                if (!options.nativeTether || !target.leash) return false;
                const owner =
                    target.leash.entity === player.id
                        ? player
                        : contextRef.KDMapData.Entities.find((e) => e.id === target.leash.entity);
                if (!owner) return false;
                const xTo = arguments[3],
                    yTo = arguments[4];
                if (
                    xTo !== undefined &&
                    yTo !== undefined &&
                    Math.max(Math.abs(xTo - owner.x), Math.abs(yTo - owner.y)) > target.leash.length &&
                    (xTo - owner.x) ** 2 + (yTo - owner.y) ** 2 > (target.x - owner.x) ** 2 + (target.y - owner.y) ** 2
                ) {
                    messages.push("native-tether-too-short");
                    return true;
                }
                while (Math.max(Math.abs(target.x - owner.x), Math.abs(target.y - owner.y)) > target.leash.length) {
                    const x = target.x + Math.sign(owner.x - target.x),
                        y = target.y + Math.sign(owner.y - target.y);
                    if (target.player) contextRef.KDMovePlayer(x, y, false);
                    else Object.assign(target, { x, y });
                }
                return false;
            },
            KinkyDungeonMoveTo(x, y) {
                if (options.blockMove) return 0;
                if (options.nativeTether && contextRef.KinkyDungeonUpdateTether(0, true, player, x, y)) return 0;
                contextRef.KDMovePlayer(x, y, true);
                contextRef.KDGameData.MovePoints = 0;
                return options.moveCost || 1;
            },
            KinkyDungeonEnemyTryMove(actor, direction, delta, x, y) {
                actor.movePoints = (actor.movePoints || 0) + delta;
                if (actor.movePoints < actor.Enemy.movePoints) return false;
                actor.movePoints -= actor.Enemy.movePoints;
                actor.x = x;
                actor.y = y;
                return true;
            },
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
                return !options.noLOS && !source.noLOS && !_target.noLOS;
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
            KinkyDungeonSendTextMessage(_priority, text) {
                messages.push(text);
            },
            KinkyDungeonSendActionMessage(_priority, text) {
                messages.push(text);
            },
            TextGet: (key) => key,
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
        containsComposite: (_id, target) => target.x <= 6,
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
    c.Spiderlings.SpinnerTopology = {
        isInsideCommonCore: (_graph, id, target) => {
            const core = cores.get(id);
            return core && target.x === core.x && target.y === core.y;
        },
    };
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
        messages,
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
        leave: () => {
            player.x = 6;
            return c.KDMovePlayer(7, 5, true);
        },
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

const plain = (value) => JSON.parse(JSON.stringify(value));
const collar = (r) =>
    r.gear.push({ id: "collar", name: "BasicCollar", restraint: { Group: "ItemNeck", shrine: ["Collars"] } });
function attached(options) {
    const r = recoveryRuntime(options);
    r.leave();
    assert.equal(r.api.hit(r.source), true);
    return r;
}

test("successful departure hit establishes a native tether bound to the real carrier", () => {
    const r = attached();
    const state = r.api.state();
    assert.equal(r.player.leash.reason, r.api.TETHER_REASON);
    assert.equal(r.player.leash.entity, r.source.id);
    assert.equal(r.player.leash.restraintID, state.carrierId);
    assert.equal(r.c.KDGameData.KinkyDungeonLeashingEnemy, r.source.id);
    const before = JSON.stringify(r.gear);
    r.api.hit(r.source);
    assert.equal(JSON.stringify(r.gear), before);
    assert.equal(r.api.strength(), 1);
});
test("no actual departure and rejected carrier do not consume ordinary binding", () => {
    for (const options of [{}, { canAdd: false }, { blockers: ["ItemNeck"] }]) {
        const r = recoveryRuntime(options);
        assert.equal(r.api.hit(r.source), false);
        r.leave();
        if (options.canAdd === false || options.blockers) {
            assert.equal(r.api.hit(r.source), false);
            assert.equal(r.api.state(), undefined);
            assert.equal(r.gear.length, 0);
        }
    }
});
test("a pending departure without an anchor cannot steal construction for an impossible leash", () => {
    const r = recoveryRuntime();
    r.leave();
    assert.equal(r.api.wantsPursuit(r.source, r.player), false);
    collar(r);
    assert.equal(r.api.wantsPursuit(r.source, r.player), true);
});
test("foreign native tether ownership and external carrier contents are preserved", () => {
    const item = {
        id: 901,
        name: "BasicLeash",
        lock: "Red",
        cutProgress: 0.37,
        dynamicLink: { id: 902 },
        restraint: { Group: "ItemNeckRestraints", leash: true, tether: 2.9 },
    };
    const r = recoveryRuntime({ item });
    const foreign = { entity: 777, priority: 9, reason: "Default", restraintID: 901 };
    r.setNativeLeash(foreign);
    r.leave();
    const before = JSON.stringify(r.gear);
    assert.equal(r.api.hit(r.source), false);
    assert.equal(r.player.leash, foreign);
    assert.equal(JSON.stringify(r.gear), before);
    r.setNativeLeash(undefined);
    assert.equal(r.api.hit(r.source), true);
    assert.equal(r.player.leash.restraintID, 901);
    assert.equal(JSON.stringify(r.gear), before);
    r.api.clearControl();
    assert.equal(JSON.stringify(r.gear), before);
});
test("a native owner taking over clears only Spiderlings' temporary duty", () => {
    const r = attached();
    const foreign = { entity: 777, reason: "Default", restraintID: 901, priority: 9 };
    r.setNativeLeash(foreign);
    assert.equal(r.api.audit(), false);
    assert.equal(r.player.leash, foreign);
    assert.equal(r.gear.length, 1);
});
test("native movement debt grows linearly beyond eight sources and includes ordinary slow cost", () => {
    for (const count of [1, 2, 4, 8, 12, 32])
        for (const moveCost of [1, 3]) {
            const r = attached({ moveCost });
            for (let i = 1; i < count; i++) {
                const a = r.addSource(41 + i);
                r.api.state().eligibleSourceIds.push(a.id);
                assert.equal(r.api.hit(a), true);
            }
            r.c.KinkyDungeonMoveTo(7, 6);
            assert.equal(r.api.strength(), count);
            assert.equal(r.c.KDGameData.MovePoints, count === 1 ? 0 : 1 - moveCost - (count - 1));
        }
});
test("blocked native movement and forced displacement add no movement debt", () => {
    const r = attached({ blockMove: true });
    const other = r.addSource(42);
    r.api.state().eligibleSourceIds.push(42);
    r.api.hit(other);
    r.c.KDGameData.MovePoints = 0;
    r.c.KinkyDungeonMoveTo(8, 5);
    assert.equal(r.c.KDGameData.MovePoints, 0);
    r.c.KDMovePlayer(8, 5, false);
    assert.equal(r.c.KDGameData.MovePoints, 0);
});

test("paid movement away drags the native tether owner instead of rejecting the input", () => {
    const r = attached({ nativeTether: true });
    assert.ok(r.c.KinkyDungeonMoveTo(6, 5) > 0);
    assert.equal(r.player.x, 6);
    assert.equal(r.source.x, 8);
    assert.equal(r.source.leash, undefined, "Reverse displacement must not save a second leash");
    assert.ok(!r.messages.includes("native-tether-too-short"));
    const before = r.source.x;
    r.c.KDMovePlayer(5, 5, false);
    assert.equal(r.source.x, before, "Forced displacement must not pay for dragging a Spinner");
});

test("blocked player movement never drags a source and preserves its unrelated tether", () => {
    const r = attached({ nativeTether: true, blockMove: true });
    const foreign = { entity: 999, reason: "Default", priority: 10, length: 2 };
    r.source.leash = foreign;
    assert.equal(r.c.KinkyDungeonMoveTo(6, 5), 0);
    assert.equal(r.source.x, 9);
    assert.equal(r.source.leash, foreign);
});
test("escort uses paid enemy movement and native tether updates, never a private player move", () => {
    const r = attached();
    r.source.x = 6;
    r.source.y = 4;
    const before = { x: r.player.x, y: r.player.y };
    r.source.Enemy.movePoints = 2;
    r.api.handleEnemyTurn(r.source, r.player, 0);
    assert.equal(r.c.tetherCalls, undefined);
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.equal(r.source.movePoints, 1);
    assert.deepEqual({ x: r.player.x, y: r.player.y }, before);
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.equal(r.c.tetherCalls.length, 2);
    assert.equal(r.c.tetherCalls[0].owner, r.source.id);
});

test("an attached helper vacates a one-cell core so the executor can lead prey home", () => {
    const r = attached();
    Object.assign(r.source, { x: 6, y: 5 });
    const helper = r.addSource(42, 5, 5);
    r.api.state().eligibleSourceIds.push(helper.id);
    assert.equal(r.api.hit(helper), true);
    r.api.handleEnemyTurn(helper, r.player, 0);
    assert.deepEqual({ x: helper.x, y: helper.y }, { x: 5, y: 5 });
    r.api.handleEnemyTurn(helper, r.player, 1);
    assert.notDeepEqual({ x: helper.x, y: helper.y }, { x: 5, y: 5 });
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.deepEqual({ x: r.source.x, y: r.source.y }, { x: 5, y: 5 });
});

test("a blocked corner does not prevent the centered holder from using native return", () => {
    const r = attached({ nativeTether: true });
    Object.assign(r.source, { x: 5, y: 5 });
    Object.assign(r.player, { x: 7, y: 7 });
    r.c.KDMapData.Entities.push({ id: 80, x: 4, y: 4, hp: 4, Enemy: { name: "WebCaster" } });
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.deepEqual({ x: r.player.x, y: r.player.y }, { x: 5, y: 5 });
});
test("death, hostility, lost contact, and incapacity clear the native tether without deleting equipment", () => {
    for (const change of [
        (r) => (r.source.hp = 0),
        (r) => (r.source.friendly = true),
        (r) => (r.source.x = 50),
        (r) => (r.source.noLOS = true),
        (r) => (r.source.helpless = true),
        (r) => (r.source.disabled = true),
        (r) => (r.source.stun = 2),
    ]) {
        const r = attached();
        change(r);
        r.api.audit();
        assert.equal(r.api.strength(), 0);
        assert.equal(r.player.leash, undefined);
        assert.equal(r.gear.length, 1);
    }
});
test("carrier removal clears control and another native owner is never erased", () => {
    const r = attached();
    r.gear.length = 0;
    r.api.audit();
    assert.equal(r.player.leash, undefined);
    assert.equal(r.api.state(), undefined);
    const other = attached();
    const leash = { entity: 777, priority: 10, reason: "Default" };
    other.setNativeLeash(leash);
    other.api.clearControl();
    assert.equal(other.player.leash, leash);
});
test("core arrival ends the escort while preserving the actual restraint", () => {
    const r = attached();
    r.player.x = 5;
    r.player.y = 5;
    r.source.x = 6;
    assert.equal(r.api.handleEnemyTurn(r.source, r.player, 1), undefined);
    assert.equal(r.api.state(), undefined);
    assert.equal(r.player.leash, undefined);
    assert.equal(r.gear.length, 1);
});
test("v2 saves migrate to native ownership without moving or losing carrier progress", () => {
    const r = attached();
    const item = r.gear[0];
    item.cutProgress = 0.4;
    item.lock = "Red";
    item.events = [
        { trigger: "postRemoval", type: "RequireCollar" },
        { trigger: "tick", type: "other" },
    ];
    const saved = plain(r.api.state());
    saved.version = 2;
    saved.pendingCrossing = { completedActions: 3 };
    saved.sourceRemovalWork = { 41: { removeOrStruggle: 1 } };
    r.c.KDGameData[r.api.STATE] = saved;
    r.setNativeLeash(undefined);
    const pos = { x: r.player.x, y: r.player.y };
    r.api.afterLoad();
    assert.equal(r.api.state().version, 3);
    assert.equal(r.api.state().pendingCrossing, undefined);
    assert.equal(r.player.leash.restraintID, item.id);
    assert.equal(item.cutProgress, 0.4);
    assert.equal(item.lock, "Red");
    assert.equal(item.events[0].type, "SpiderlingsRecoveryAnchor");
    assert.equal(item.events[1].type, "other");
    assert.deepEqual({ x: r.player.x, y: r.player.y }, pos);
    assert.equal(r.c.tetherCalls, undefined);
});
test("native struggle calculation retains source pressure and never substitutes a counted action", () => {
    const r = attached();
    const other = r.addSource(42);
    r.api.state().eligibleSourceIds.push(42);
    r.api.hit(other);
    const item = r.gear[0];
    const data = { restraint: item, struggleType: "Cut", escapePenalty: 0.1, cutSpeed: 0.3 };
    r.c.KDEventMapInventory.beforeStruggleCalc.SpiderlingsRecoveryEscape({}, item, data);
    assert.ok(Math.abs(data.escapePenalty - 0.15) < 1e-9);
    assert.equal(data.cutSpeed, 0.3);
    assert.equal(data.escapeChance, undefined);
    assert.equal(r.c.KDInputTypes.spiderlingsRecoveryStand, undefined);
    assert.equal(r.c.KDInputTypes.spiderlingsRecoveryRemoveSource, undefined);
});
test("paid relay admits more than eight sources, while zero-time refresh cannot add them", () => {
    const r = attached();
    for (let i = 1; i < 12; i++) {
        const a = r.addSource(41 + i, 9 + i * 2, 5);
        r.api.state().eligibleSourceIds.push(a.id);
        r.api.handleEnemyTurn(a, r.player, 0);
        assert.equal(r.api.sourceIds().includes(a.id), false);
        r.api.handleEnemyTurn(a, r.player, 1);
        assert.equal(r.api.sourceIds().includes(a.id), true);
    }
    assert.equal(r.api.strength(), 12);
    r.api.afterLoad();
    assert.equal(r.api.strength(), 12);
    r.source.hp = 0;
    r.api.audit();
    assert.equal(r.api.strength(), 0);
});

test("recovery draws silk through visible-cell masks and clears it without mutating control", () => {
    const r = recoveryRuntime(),
        children = [],
        draws = [],
        sprites = new Map();
    class Graphics {
        constructor() {
            this.rects = [];
            this.visible = true;
        }
        clear() {
            this.rects = [];
            return this;
        }
        beginFill() {
            return this;
        }
        endFill() {
            return this;
        }
        drawRect(...rect) {
            this.rects.push(rect);
            return this;
        }
        destroy() {
            this.destroyed = true;
        }
    }
    r.c.PIXI = { Graphics };
    r.c.kdgameboard = { addChild: (child) => children.push(child) };
    r.c.kdpixisprites = sprites;
    r.c.KinkyDungeonGridSizeDisplay = 72;
    r.c.KDMapData.GridWidth = 20;
    r.c.KDMapData.GridHeight = 20;
    let visible = new Set(["8,5"]),
        pink = false;
    r.c.KinkyDungeonVisionGet = (x, y) => (visible.has(`${x},${y}`) ? 1 : 0);
    r.c.Spiderlings.getSetting = () => pink;
    r.c.KDDraw = (_board, _cache, id, image) => {
        draws.push({ id, image });
        const sprite = sprites.get(id) || {};
        sprite.visible = true;
        sprites.set(id, sprite);
        return sprite;
    };
    r.player.x = 6;
    r.leave();
    r.hit();
    const before = JSON.stringify({ state: r.api.state(), leash: r.player.leash, gear: r.gear });
    const draw = () =>
        r.c.KDEventMapGeneric.draw.SpiderlingsSpinnerRecovery({}, { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
    draw();
    assert.equal(draws.length, 1);
    assert.ok(draws[0].image.endsWith("SpiderlingsPlayerTether.png"));
    const strand = sprites.get("SpiderlingsRecoveryTether_41");
    assert.deepEqual(strand.mask.rects, [[576, 360, 72, 72]], "Only the visible cell may receive tether pixels");
    pink = true;
    draw();
    assert.ok(draws.at(-1).image.endsWith("SpiderlingsPlayerTetherPink.png"));
    assert.equal(JSON.stringify({ state: r.api.state(), leash: r.player.leash, gear: r.gear }), before);
    visible.clear();
    const count = draws.length;
    draw();
    assert.equal(draws.length, count, "An entirely hidden segment must not draw art");
    assert.equal(strand.visible, false);
    visible.add("8,5");
    draw();
    r.source.hp = 0;
    draw();
    assert.equal(strand.visible, false, "Dead source strands disappear before the next logic audit");
    r.api.clearControl();
    assert.ok(children.every((child) => child.destroyed));
    assert.equal(r.player.leash, undefined, "Clearing owned recovery releases its native tether");
});

test("all attached helpers move coreward even within two cells of the player", () => {
    const r = recoveryRuntime();
    const helper = r.addSource(42, 7, 6);
    r.leave();
    r.api.hit(r.source);
    r.api.hit(helper);
    const before = { x: helper.x, y: helper.y };
    r.api.handleEnemyTurn(helper, r.player, 1);
    assert.ok(helper.x < before.x);
    assert.equal(r.player.x, 7, "Only native tether updates may move the player");
});

test("occupied core selects a free interior endpoint without stepping onto player or blocker", () => {
    const r = attached();
    r.c.Spiderlings.SpinnerTopology.isInsideCommonCore = (_graph, _id, p) =>
        p.x >= 4 && p.x <= 6 && p.y >= 4 && p.y <= 6;
    r.source.x = 6;
    r.source.y = 5;
    const blocker = { id: 99, x: 5, y: 5, hp: 10, Enemy: { name: "WebCaster" } };
    r.c.KDMapData.Entities.push(blocker);
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.notDeepEqual({ x: r.source.x, y: r.source.y }, { x: 6, y: 5 });
    assert.notDeepEqual({ x: r.source.x, y: r.source.y }, { x: blocker.x, y: blocker.y });
    assert.deepEqual({ x: r.player.x, y: r.player.y }, { x: 7, y: 5 });
});

test("blocked escorts outside the core do not tighten a stationary native tether", () => {
    const r = attached({ pathFinder: (startX) => (startX === 7 ? [{ x: 5, y: 5 }] : undefined) });
    r.source.x = 6;
    r.source.y = 5;
    const length = r.player.leash.length;
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.equal(r.player.leash.length, length);
    assert.equal(r.source.x, 6);
});
test("a centered executor tightens its native tether on a paid turn", () => {
    const r = attached();
    r.source.x = 5;
    r.source.y = 5;
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.equal(r.source.x, 5);
    assert.equal(r.source.y, 5);
    assert.equal(r.player.leash.length, 0.5);
});

test("recovery clears native attack warnings for attached and joining sources on refresh", () => {
    const r = attached(),
        helper = r.addSource(42, 8, 6);
    r.api.state().eligibleSourceIds.push(helper.id);
    for (const actor of [r.source, helper]) {
        actor.attackPoints = 4;
        actor.warningTiles = [{ x: r.player.x, y: r.player.y }];
        r.api.handleEnemyTurn(actor, r.player, 0);
        assert.equal(actor.attackPoints, 0);
        assert.equal(actor.warningTiles.length, 0);
        assert.equal(actor.movePoints, undefined);
    }
    assert.equal(r.api.strength(), 1, "A refresh cannot pay for a new relay");
});

test("recovery detours a native faction route blocked by a coworker with paid movement", () => {
    const r = attached({ pathFinder: (x) => (x === 7 ? [{ x: 5, y: 5 }] : [{ x: 8, y: 4 }]) });
    r.c.KDMapData.GridWidth = r.c.KDMapData.GridHeight = 15;
    const blocker = { id: 99, x: 8, y: 4, hp: 3, Enemy: { name: "WebCaster" } };
    r.c.KDMapData.Entities.push(blocker);
    r.webCells.add("8,4");
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerAI.js"), "utf8"), r.c);
    r.source.Enemy.movePoints = 2;
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.deepEqual({ x: r.source.x, y: r.source.y }, { x: 9, y: 5 });
    assert.equal(r.source.movePoints, 1);
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.deepEqual({ x: r.source.x, y: r.source.y }, { x: 8, y: 6 });
    assert.deepEqual({ x: blocker.x, y: blocker.y }, { x: 8, y: 4 });
    assert.deepEqual({ x: r.player.x, y: r.player.y }, { x: 7, y: 5 });
    assert.ok(r.c.tetherCalls.length > 0, "The native tether still owns dragging");
});

const legBag = (r) => r.gear.push({ id: "leg-bag", name: "SpiderlingsSpinnerLegbinder", data: { wrapProgress: 1 } });
test("retained leg bag reacquires recovery after returning and leaving an intact field", () => {
    const r = attached();
    legBag(r);
    r.player.x = 5;
    r.source.x = 6;
    r.api.handleEnemyTurn(r.source, r.player, 1);
    assert.equal(r.api.state(), undefined);
    r.setBreached(false);
    r.leave();
    assert.equal(r.api.wantsPursuit(r.source, r.player), true);
    assert.equal(r.api.hit(r.source), true);
    r.gear.splice(
        r.gear.findIndex((item) => item.name === "SpiderlingsSpinnerLegbinder"),
        1,
    );
    r.api.audit();
    assert.equal(r.api.state(), undefined);
    assert.equal(r.api.wantsPursuit(r.source, r.player), false);
});
test("leg bag recovery selects the nearest reachable field instead of the source's former field", () => {
    const r = attached();
    legBag(r);
    r.cores.set("nearby", { x: 8, y: 5 });
    r.fieldOwners.set("nearby", [99]);
    assert.equal(r.api.destination(r.api.state()).compositeId, "nearby");
});

test("removing a leg bag cancels pending repeat recovery even when a compatible collar remains", () => {
    const r = attached();
    legBag(r);
    r.player.x = 5;
    r.source.x = 6;
    r.api.handleEnemyTurn(r.source, r.player, 1);
    r.setBreached(false);
    r.leave();
    r.gear.splice(
        r.gear.findIndex((item) => item.name === "SpiderlingsSpinnerLegbinder"),
        1,
    );
    assert.equal(r.api.wantsPursuit(r.source, r.player), false);
    assert.equal(r.api.hit(r.source), false);
});

test("carrier-loss retry keeps its leg bag identity until the bag is removed", () => {
    const r = attached();
    legBag(r);
    r.api.audit();
    r.gear.splice(
        r.gear.findIndex((item) => item.id === r.api.state().carrierId),
        1,
    );
    r.api.audit();
    assert.ok(r.api.departure());
    r.gear.splice(
        r.gear.findIndex((item) => item.name === "SpiderlingsSpinnerLegbinder"),
        1,
    );
    assert.equal(r.api.departure(), undefined);
});
