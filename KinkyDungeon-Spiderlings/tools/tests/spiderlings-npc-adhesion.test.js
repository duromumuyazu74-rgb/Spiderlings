"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../..", "SpiderlingsNPCAdhesion.js"), "utf8");

function fixture() {
    const events = {};
    const calls = { moves: [], npc: [], player: [], stamina: [], labels: [] };
    const map = { Entities: [] };
    const c = {
        Spiderlings: {},
        KDMapData: map,
        KDEventMapGeneric: {},
        kdenemystatusboard: {},
        KinkyDungeonGridSizeDisplay: 72,
        KinkyDungeonVisionGet: () => 1,
        TextGet: (key) => key,
        DrawTextFitKDTo: (_board, text) => calls.labels.push(text),
        KDAddEvent: (_map, trigger, key, handler) => ((events[trigger] ||= {})[key] = handler),
        KDHelpless: (enemy) => (enemy.boundLevel || 0) > 20,
        KDGetFaction: (enemy) => enemy.faction || "Enemy",
        KDGetBindEffectMult: (enemy) => (enemy.Enemy.tags.unstoppable ? 3 : enemy.Enemy.tags.unflinching ? 2 : 1),
        KDNPCStruggleThreshMult: () => 1,
        KinkyDungeonEnemyLoop: (enemy, target) => {
            if (enemy.moveTo) c.KDMoveEntity(enemy, ...enemy.moveTo);
            if (enemy.tryMove) c.KinkyDungeonEnemyTryMove(enemy);
            if (enemy.staminaHit) c.KDChangeStamina(`enemy${enemy.id}`, "enemy", "enemyHit", -enemy.staminaHit);
            return { enemy, target };
        },
        KDChangeStamina: (...args) => calls.stamina.push(args),
        KinkyDungeonEnemyTryMove: (enemy) => {
            calls.moves.push(["try", enemy.id]);
            return true;
        },
        KDMoveEntity: (enemy, x, y, willing, _dash, _force, _ignore, noEvent) => {
            const lastX = enemy.x;
            const lastY = enemy.y;
            enemy.x = x;
            enemy.y = y;
            calls.moves.push(["move", enemy.id, willing]);
            if (!noEvent) emit("enemyMove", { enemy, lastX, lastY, cancelmove: false });
            return true;
        },
        KinkyDungeonDamageEnemy: (target, damage) => {
            calls.npc.push({ target, damage });
            return damage.damage;
        },
        KinkyDungeonDealDamage: (damage) => {
            calls.player.push(damage);
            return damage.damage;
        },
    };
    function emit(trigger, data) {
        for (const handler of Object.values(events[trigger] || {})) handler({}, data);
    }
    vm.createContext(c);
    vm.runInContext(source, c);
    const sourceSpider = { id: 1, hp: 4, Enemy: { name: "WebCaster" } };
    const spinner = { id: 3, hp: 4, Enemy: { name: "Spinner" } };
    const target = {
        id: 2,
        x: 4,
        y: 5,
        hp: 20,
        boundLevel: 0,
        Enemy: { name: "Maidforce", maxhp: 8, tags: {} },
        specialBoundLevel: {},
    };
    map.Entities.push(sourceSpider, spinner, target);
    function bind(source, amount, attack = "direct", action = c.Spiderlings.NPCAdhesion.actionId(source)) {
        const incomingDamage = {
            flags: ["SpiderlingsNPCSilk"],
            spiderlingsAttack: attack,
            spiderlingsSource: source,
            spiderlingsActionId: action,
        };
        const data = { enemy: target, attacker: source, incomingDamage };
        emit("beforeDamageEnemy", data);
        target.specialBoundLevel.Slime = (target.specialBoundLevel.Slime || 0) + amount;
        target.boundLevel += amount;
        emit("afterDamageEnemy", data);
        return data;
    }
    function tick(times = 1) {
        for (let i = 0; i < times; i++) emit("tickAfter", { delta: 1 });
    }
    return { c, map, calls, sourceSpider, spinner, target, bind, tick, emit, adhesion: c.Spiderlings.NPCAdhesion };
}

test("direct Slime opens adhesion, while passive, blocked and unowned binding do not", () => {
    const r = fixture();
    assert.equal(r.adhesion.status(r.target), "free");
    r.bind(r.sourceSpider, 0);
    r.bind(r.sourceSpider, 3, "trail");
    assert.equal(r.adhesion.status(r.target), "free");
    assert.equal(r.adhesion.hasAttributedSilk(r.target), true);
    r.bind(r.sourceSpider, 3);
    assert.equal(r.adhesion.status(r.target), "initial");
    r.bind(r.spinner, 3, "melee");
    assert.equal(r.adhesion.status(r.target), "full");
    assert.equal(r.adhesion.pressure(r.target), 6);
    assert.equal(r.adhesion.hasAttributedSilk(r.target), true);
});

test("multiple native applications in one action accumulate once and repeated callbacks do not", () => {
    const r = fixture();
    r.bind(r.sourceSpider, 3);
    const action = r.adhesion.actionId(r.spinner);
    const first = r.bind(r.spinner, 1.5, "mage-spell", action);
    r.emit("afterDamageEnemy", first);
    r.bind(r.spinner, 1.5, "mage-spell", action);
    assert.equal(r.adhesion.pressure(r.target), 6);
    assert.equal(r.target.SpiderlingsNPCAdhesion.contributions.length, 2);
    r.tick(7);
    assert.equal(r.adhesion.status(r.target), "full");
    r.tick();
    assert.equal(r.adhesion.status(r.target), "free");
    r.bind(r.spinner, 3, "melee");
    assert.equal(r.adhesion.status(r.target), "free", "an old sequence requires a new direct spray");
    r.bind(r.sourceSpider, 3);
    assert.equal(r.adhesion.status(r.target), "initial");
});

test("paid Spinner capture work retains each contributor while native binding remains one call", () => {
    const r = fixture();
    r.bind(r.sourceSpider, 3);
    const third = { id: 4, hp: 4, Enemy: { name: "Spinner" } };
    r.map.Entities.push(third);
    const action = r.adhesion.actionId(r.spinner);
    r.target.specialBoundLevel.Slime += 3;
    r.target.boundLevel += 3;
    r.adhesion.recordNativeSilk(r.spinner, r.target, 3, "capture", action, [r.spinner.id, third.id]);
    assert.equal(r.adhesion.pressure(r.target), 6);
    assert.equal(r.target.SpiderlingsNPCAdhesion.contributions.length, 3);
    assert.equal(
        JSON.stringify(
            r.target.SpiderlingsNPCAdhesion.contributions.slice(1).map((entry) => [entry.sourceId, entry.amount]),
        ),
        JSON.stringify([
            [3, 1.5],
            [4, 1.5],
        ]),
    );
});

test("native removal proportionally reduces pressure and leaves unrelated binding untouched", () => {
    const r = fixture();
    r.target.specialBoundLevel.Slime = 4;
    r.target.boundLevel = 4;
    r.bind(r.sourceSpider, 3);
    r.bind(r.spinner, 3, "melee");
    assert.equal(r.adhesion.status(r.target), "full");
    r.target.specialBoundLevel.Slime -= 3;
    r.target.boundLevel -= 3;
    assert.equal(r.adhesion.pressure(r.target), 3);
    assert.equal(r.adhesion.status(r.target), "initial");
    r.target.specialBoundLevel.Slime = 0;
    r.target.boundLevel = 1;
    assert.equal(r.adhesion.status(r.target), "free");
    assert.equal(r.adhesion.hasAttributedSilk(r.target), false);
    assert.equal(r.target.boundLevel, 1);
});

test("saved silk source and owned strength gate native helplessness after reload", () => {
    const r = fixture();
    r.sourceSpider.faction = "Enemy";
    r.bind(r.sourceSpider, 3);
    r.target.boundLevel = 100;
    assert.equal(r.adhesion.hasSpiderHelplessness(r.target), false);
    assert.equal(r.adhesion.silkSource(r.target)?.faction, "Enemy");
    assert.equal(r.adhesion.silkSource(r.target)?.Enemy.name, "WebCaster");
    r.bind(r.sourceSpider, 6);
    assert.equal(r.adhesion.hasSpiderHelplessness(r.target), true);
    r.target.SpiderlingsNPCAdhesion = JSON.parse(JSON.stringify(r.target.SpiderlingsNPCAdhesion));
    r.emit("afterLoadGame", {});
    assert.equal(r.adhesion.silkSource(r.target)?.faction, "Enemy");
    assert.equal(r.adhesion.silkSource(r.target)?.Enemy.name, "WebCaster");
    assert.equal(r.adhesion.hasSpiderHelplessness(r.target), true);
});

test("explicit benchmarks override HP, and fallback uses the binding threshold tag", () => {
    const r = fixture();
    for (const [name, pin, full] of [
        ["BlindZombie", 3, 6],
        ["Maidforce", 3, 6],
        ["MaidforceMini", 6, 9],
        ["MaidKnightHeavy", 9, 15],
        ["DragonGirlCrystal", 12, 18],
        ["DragonGirlShadow", 15, 24],
    ]) {
        r.target.Enemy.name = name;
        assert.deepEqual({ ...r.adhesion.thresholds(r.target) }, { pin, full });
    }
    r.target.Enemy.name = "Other";
    r.target.Enemy.maxhp = 8;
    r.target.Enemy.tags.unflinching = true;
    assert.deepEqual({ ...r.adhesion.thresholds(r.target) }, { pin: 6, full: 9 });
    r.target.Enemy.tags.unstoppable = true;
    assert.deepEqual({ ...r.adhesion.thresholds(r.target) }, { pin: 9, full: 14 });
});

test("full pin scales damage but retains native attacks and allows later native helplessness", () => {
    const r = fixture();
    r.bind(r.sourceSpider, 3);
    r.bind(r.spinner, 3, "melee");
    const direct = { damage: 10, type: "fire", bind: 2 };
    r.c.KinkyDungeonDamageEnemy(r.spinner, direct, false, true, undefined, undefined, r.target);
    assert.equal(r.calls.npc.at(-1).damage.damage, 6.5);
    assert.equal(r.calls.npc.at(-1).damage.bind, 2);
    assert.equal(direct.damage, 10);
    const melee = { enemy: r.target, damage: 10, staminaDamage: 4 };
    r.emit("beforeDamage", melee);
    assert.equal(melee.damage, 6.5);
    r.target.staminaHit = 4;
    r.c.KinkyDungeonEnemyLoop(r.target, r.spinner);
    assert.equal(r.calls.stamina.at(-1)[3], -2.6);
    r.c.KDChangeStamina("enemy2", "enemy", "enemyHit", -4);
    assert.equal(r.calls.stamina.at(-1)[3], -4, "non-attack stamina changes keep native amounts");
    r.c.KinkyDungeonDealDamage({ damage: 10, type: "fire" }, { bullet: { source: r.target.id } });
    assert.equal(r.calls.player.at(-1).damage, 6.5);
    r.target.boundLevel = 21;
    assert.equal(r.adhesion.status(r.target), "native-helpless");
});

test("pin blocks own walking and dashes, while external displacement and scripted transfers work", () => {
    const r = fixture();
    r.bind(r.sourceSpider, 3);
    r.target.tryMove = true;
    r.target.moveTo = [6, 5, true, true];
    r.c.KinkyDungeonEnemyLoop(r.target, r.spinner);
    assert.equal(r.target.x, 4);
    assert.equal(r.calls.moves.length, 0);
    const selfTeleport = { entity: r.target, willing: true, cancel: false };
    r.emit("beforeTeleport", selfTeleport);
    assert.equal(selfTeleport.cancel, true);
    const externalTeleport = { entity: r.target, willing: false, cancel: false };
    r.emit("beforeTeleport", externalTeleport);
    assert.equal(externalTeleport.cancel, false);
    r.c.KDMoveEntity(r.target, 6, 5, false);
    assert.equal(r.target.x, 6);
    r.c.KDMoveEntity(r.target, 7, 5, true, false, false, false, true);
    assert.equal(r.target.x, 7);
    assert.equal(r.adhesion.status(r.target), "initial");
});

test("saved entity ledger and map clock restore without refreshing contribution age", () => {
    const r = fixture();
    r.bind(r.sourceSpider, 3);
    r.tick(4);
    const saved = JSON.parse(JSON.stringify(r.map));
    r.map.SpiderlingsNPCAdhesionClock = saved.SpiderlingsNPCAdhesionClock;
    r.map.SpiderlingsNPCAdhesionSerial = saved.SpiderlingsNPCAdhesionSerial;
    Object.assign(
        r.target,
        saved.Entities.find((enemy) => enemy.id === r.target.id),
    );
    r.emit("afterLoadGame", {});
    assert.equal(r.adhesion.status(r.target), "initial");
    const newAction = r.adhesion.actionId(r.sourceSpider);
    assert.ok(r.target.SpiderlingsNPCAdhesion.contributions.every((entry) => !entry.actionId.startsWith(newAction)));
    r.tick(4);
    assert.equal(r.adhesion.status(r.target), "free");
});

test("visible status feedback distinguishes initial, full and native helpless states", () => {
    const r = fixture();
    const draw = () => r.emit("draw", { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
    r.bind(r.sourceSpider, 3);
    draw();
    assert.equal(r.calls.labels.at(-1), "SpiderlingsNPCAdhesionInitial");
    r.bind(r.spinner, 3, "melee");
    draw();
    assert.equal(r.calls.labels.at(-1), "SpiderlingsNPCAdhesionFull");
    r.target.boundLevel = 21;
    draw();
    assert.equal(r.calls.labels.at(-1), "SpiderlingsNPCAdhesionHelpless");
});
