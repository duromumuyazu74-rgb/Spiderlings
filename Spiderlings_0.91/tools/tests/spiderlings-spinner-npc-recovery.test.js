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
    const webCells = new Set(),
        map = new Map(),
        tiles = new Map(),
        entityFlags = new Map(),
        itemCalls = [];
    let geometryReady = false,
        nativeLoops = 0;
    const context = {
        console,
        Spiderlings: {},
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDGameData: {},
        KDMapData: { Entities: [] },
        KinkyDungeonCurrentTick: 1,
        KinkyDungeonMovableTilesEnemy: ".D",
        KDAddEvent(eventMap, trigger, id, handler) {
            (eventMap[trigger] ||= {})[id] = handler;
        },
        KDHostile(source, target) {
            return source?.faction !== target?.faction;
        },
        KDHelpless(entity) {
            return !!entity.helpless;
        },
        KDIsImmobile(entity) {
            return !!(entity.immobile || entity.Enemy?.immobile || entity.imprisoned);
        },
        KinkyDungeonIsDisabled(entity) {
            return !!entity.disabled;
        },
        KinkyDungeonCheckLOS(source) {
            return !source.noLOS;
        },
        KinkyDungeonCheckPath(sourceX, sourceY) {
            return !context.KDMapData.Entities.find((entity) => entity.x === sourceX && entity.y === sourceY)?.noLOS;
        },
        KDNPCStruggleThreshMult: () => 1,
        KinkyDungeonMapGet(x, y) {
            return map.get(`${x},${y}`) || ".";
        },
        KinkyDungeonTilesGet(key) {
            return tiles.get(key);
        },
        KinkyDungeonEntityAt(x, y) {
            if (webCells.has(`${x},${y}`)) return { x, y, webProxy: true, Enemy: { name: "Web" } };
            return context.KDMapData.Entities.find((entity) => entity.hp > 0 && entity.x === x && entity.y === y);
        },
        KinkyDungeonFindPath(startX, startY, endX, endY) {
            const dx = Math.sign(endX - startX),
                dy = Math.sign(endY - startY);
            return dx || dy ? [{ x: startX + dx, y: startY + dy }] : [];
        },
        KDEnemyHasFlag(entity, flag) {
            return entityFlags.get(entity.id)?.has(flag) === true;
        },
        KinkyDungeonSetEnemyFlag(entity, flag) {
            if (!entityFlags.has(entity.id)) entityFlags.set(entity.id, new Set());
            entityFlags.get(entity.id).add(flag);
        },
        KinkyDungeonPlayerEntity: { player: true, x: 20, y: 20 },
        KinkyDungeonEnemyTryMove: () => true,
        KDEnemyStruggleTurn: () => undefined,
        KinkyDungeonAllRestraintDynamic() {
            itemCalls.push("all");
            return [];
        },
        KinkyDungeonAddRestraint() {
            itemCalls.push("add");
            return 0;
        },
    };
    const events = (trigger, data) => {
        for (const handler of Object.values(context.KDEventMapGeneric[trigger] || {})) handler({}, data);
    };
    context.KDMoveEntity = (target, x, y, willing = false) => {
        if (
            context.KinkyDungeonEntityAt(x, y) ||
            !context.KinkyDungeonMovableTilesEnemy.includes(context.KinkyDungeonMapGet(x, y))
        )
            return false;
        const lastX = target.x,
            lastY = target.y;
        target.x = x;
        target.y = y;
        events("enemyMove", { enemy: target, lastX, lastY, moveX: x, moveY: y, willing, cancelmove: false });
        return true;
    };
    context.KinkyDungeonDamageEnemy = (target, damage, _ranged, _noMsg, _spell, _bullet, attacker) => {
        const data = {
            enemy: target,
            incomingDamage: damage,
            dmg: damage.damage || 0,
            dmgDealt: damage.damage || 0,
            attacker,
        };
        events("beforeDamageEnemy", data);
        events("duringDamageEnemy", data);
        if (!target.shield && !target.immune && damage.bind > 0) {
            target.boundLevel += damage.bind;
            (target.specialBoundLevel ||= {}).Slime = (target.specialBoundLevel.Slime || 0) + damage.bind;
        } else data.blocked = true;
        target.hp -= data.dmgDealt;
        events("afterDamageEnemy", data);
        return data.dmgDealt;
    };
    context.KinkyDungeonEnemyLoop = (source, target) => {
        nativeLoops += 1;
        events("beforeNPCDamageNPC", { enemy: source });
        return context.KinkyDungeonDamageEnemy(
            target,
            { damage: 1, type: "slash" },
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
    load(context, "SpiderlingsSpinnerRecoveryCore.js");
    context.Spiderlings.SpinnerCapture = {
        state: () => undefined,
        handleEnemyTurn: () => undefined,
        isControllingPlayer: () => false,
    };
    context.Spiderlings.SpinnerRecovery = {
        sourceIds: () => [],
        handleEnemyTurn: () => undefined,
        audit() {},
        afterLoad() {},
        clearControl() {},
    };
    const sourceIds = Array.from({ length: 9 }, (_, index) => index + 1);
    context.Spiderlings.SpinnerNativeField = {
        state: () => ({ topology: { composites: { "field-1": { id: "field-1", groupId: "group-1" } } } }),
        breachedDeparture(from, to) {
            if (from.x <= 6 && to.x > 6)
                return { compositeId: "field-1", groupId: "group-1", eligibleSourceIds: sourceIds };
        },
        containingComposite: (target) => (target.x <= 6 ? { id: "field-1" } : undefined),
        containsComposite: (_id, target) => target.x <= 6,
        captureGeometryReady: (target) => geometryReady && target.x <= 6,
        compositeById: (id) => (id === "field-1" ? { id } : undefined),
        commonCore: () => ({ x: 5, y: 5 }),
        fieldOwners: () => sourceIds,
        isSpiderlingsWebCell: (cell) => webCells.has(`${cell.x},${cell.y}`),
        isOwnedProxy: (entity) => entity?.webProxy === true,
        accrueConstructionAction(source, delta) {
            source.recoveryCredit = (source.recoveryCredit || 0) + delta;
            if (source.recoveryCredit < 1) return false;
            source.recoveryCredit -= 1;
            return true;
        },
        handleEnemyTurn: () => undefined,
        onNativeDamage() {},
        onEntry() {},
        tick() {},
        reconcile() {},
    };
    context.Spiderlings.SpinnerField = { handleEnemyTurn: () => undefined };
    load(context, "SpiderlingsSpinnerNPCCapture.js");
    load(context, "SpiderlingsSpinnerNPCRecovery.js");
    load(context, "SpiderlingsSpinnerRuntime.js");

    const spinner = (id, x = 8, y = 5) => ({
        id,
        x,
        y,
        hp: 10,
        boundLevel: 0,
        faction: "Spiderlings",
        buffs: {},
        Enemy: { name: "Spinner", attack: "Melee", attackRange: 1, movePoints: 1, tags: { spiderlings: true } },
    });
    const target = {
        id: 100,
        x: 5,
        y: 5,
        hp: 20,
        boundLevel: 0,
        specialBoundLevel: {},
        faction: "Maidforce",
        Enemy: { name: "Maid", bound: true, maxhp: 10, tags: {} },
    };
    const sources = sourceIds.map((id, index) => spinner(id, 8 + (index % 2), 5 + (index % 2)));
    context.KDMapData.Entities.push(...sources, target);
    return {
        c: context,
        api: context.Spiderlings.SpinnerNPCRecovery,
        capture: context.Spiderlings.SpinnerNPCCapture,
        target,
        sources,
        webCells,
        map,
        tiles,
        itemCalls,
        events,
        nativeLoops: () => nativeLoops,
        setGeometryReady: (value) => (geometryReady = value),
        breach: () => context.KDMoveEntity(target, 7, 5, true),
        hit: (source = sources[0]) => context.KinkyDungeonEnemyLoop(source, target, 1),
        operate(source = sources[0], delta = 1) {
            context.KinkyDungeonCurrentTick += 1;
            entityFlags.clear();
            return context.KinkyDungeonEnemyLoop(source, target, delta);
        },
    };
}

test("NPC recovery requires a real breach and fresh positive-Slime hit without item APIs", () => {
    const r = fixture();
    r.hit();
    assert.equal(r.api.state(), undefined);
    assert.equal(r.breach(), true);
    assert.ok(r.api.departureForTarget(r.target));
    assert.equal(r.api.recordForTarget(r.target), undefined);
    r.hit();
    assert.deepEqual(Array.from(r.c.Spiderlings.SpinnerRecoveryCore.sourceIds(r.api.recordForTarget(r.target))), [1]);
    assert.deepEqual(r.itemCalls, []);
});

test("NPC recovery refreshes one through eight sources, rejects ninth, and requires re-hit after audit", () => {
    const r = fixture();
    r.breach();
    for (const source of r.sources) r.hit(source);
    const record = r.api.recordForTarget(r.target);
    assert.deepEqual(Array.from(r.c.Spiderlings.SpinnerRecoveryCore.sourceIds(record)), [1, 2, 3, 4, 5, 6, 7, 8]);
    r.c.KinkyDungeonCurrentTick = 20;
    r.api.onSuccessfulNativeSpinnerHit(r.sources[0], r.target, 1.5);
    assert.equal(record.sources["1"].lastHitTick, 20);
    r.sources[0].hp = 0;
    r.api.audit();
    assert.equal(record.sources["1"], undefined);
    r.sources[0].hp = 10;
    r.api.audit();
    assert.equal(record.sources["1"], undefined);
    r.hit(r.sources[0]);
    assert.ok(record.sources["1"]);
});

test("one executor pays and source count never multiplies NPC displacement", () => {
    const r = fixture();
    r.breach();
    r.hit(r.sources[0]);
    r.hit(r.sources[1]);
    const beforeNative = r.nativeLoops();
    r.operate(r.sources[1]);
    assert.equal(r.target.x, 7, "non-executor waits");
    r.operate(r.sources[0]);
    assert.equal(r.target.x, 6);
    assert.equal(r.nativeLoops(), beforeNative, "recovery sources do not also use native AI");
});

test("NPC recovery crosses one and two Spiderlings web cells at two paid actions per cell", () => {
    for (const [cells, actions, far] of [
        [["6,5"], 2, 5],
        [["6,5", "5,5"], 4, 4],
    ]) {
        const r = fixture();
        for (const cell of cells) r.webCells.add(cell);
        if (cells.length === 2) r.c.Spiderlings.SpinnerNativeField.commonCore = () => ({ x: 4, y: 5 });
        r.breach();
        r.hit();
        for (let index = 1; index <= actions; index++) {
            r.operate();
            assert.equal(r.target.x, index === actions ? far : 7);
        }
    }
});

test("walls, locks, foreign occupancy, and native pull flags block NPC recovery movement", () => {
    for (const mode of ["wall", "lock", "occupant", "pulled"]) {
        const r = fixture();
        r.breach();
        r.hit();
        if (mode === "wall") r.map.set("6,5", "#");
        if (mode === "lock") r.tiles.set("6,5", { Lock: "Red" });
        if (mode === "occupant")
            r.c.KDMapData.Entities.push({ id: 500, x: 6, y: 5, hp: 1, Enemy: { name: "Blocker" } });
        if (mode === "pulled") {
            r.c.KinkyDungeonCurrentTick += 1;
            r.c.KinkyDungeonSetEnemyFlag(r.target, "pulled", 1);
            r.c.KinkyDungeonEnemyLoop(r.sources[0], r.target, 1);
        } else r.operate();
        assert.equal(r.target.x, 7, mode);
    }
});

test("return and repair never auto-capture; a later normal hit admits hitter-only Capture", () => {
    const r = fixture();
    r.breach();
    r.hit(r.sources[0]);
    r.hit(r.sources[1]);
    r.operate(r.sources[0]);
    assert.equal(r.target.x, 6);
    assert.equal(r.capture.state(), undefined);
    r.setGeometryReady(true);
    r.api.audit();
    assert.equal(r.capture.state(), undefined, "closure alone does not capture");
    r.sources[0].x = 7;
    r.sources[0].y = 5;
    r.sources[1].x = 6;
    r.sources[1].y = 6;
    r.hit(r.sources[0]);
    const capture = r.capture.records()[String(r.target.id)];
    assert.deepEqual(Array.from(capture.sourceIds), [1]);
    assert.equal(r.api.recordForTarget(r.target), undefined);
});

test("load and lifecycle audits never move targets or retain stale map control", () => {
    const r = fixture();
    r.breach();
    r.hit();
    const saved = JSON.parse(JSON.stringify(r.api.state()));
    r.events("afterLoadGame", {});
    r.events("afterLoadGame", {});
    assert.deepEqual(JSON.parse(JSON.stringify(r.api.state())), saved);
    assert.equal(r.target.x, 7);
    r.sources[0].hp = 0;
    r.api.audit();
    assert.equal(r.api.recordForTarget(r.target), undefined);
    for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterNewGame"]) {
        r.events(trigger, {});
        assert.equal(r.api.state(), undefined, trigger);
    }
});

test("manifest loads Recovery Core and NPC Recovery before the shared dispatcher", () => {
    const order = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8")).fileorder;
    const index = (name) => order.indexOf(name);
    assert.ok(index("SpiderlingsSpinnerCapture.js") < index("SpiderlingsSpinnerRecoveryCore.js"));
    assert.ok(index("SpiderlingsSpinnerRecoveryCore.js") < index("SpiderlingsSpinnerRecovery.js"));
    assert.ok(index("SpiderlingsSpinnerRecovery.js") < index("SpiderlingsSpinnerNPCRecovery.js"));
    assert.ok(index("SpiderlingsSpinnerNPCRecovery.js") < index("SpiderlingsSpinnerRuntime.js"));
});
