"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, load } = require("./helpers/spinner-native-runtime.js");

test("the prison Boss entrance leaves all authored field sites and props intact", () => {
    const { context: c } = runtime();
    load(c, "SpiderlingsPrisonLayout.js");
    load(c, "SpiderlingsBossRoom.js");
    const layout = c.Spiderlings.PrisonLayout.create();
    const entry = c.Spiderlings.BossRoom.ENTRY;
    assert.equal(layout.rows[entry.y][entry.x], "1");
    for (const site of layout.fieldSites) {
        const bounds = site.bounds;
        assert.equal(
            entry.x >= bounds.left && entry.x <= bounds.right && entry.y >= bounds.top && entry.y <= bounds.bottom,
            false,
            site.id,
        );
    }
    assert.equal(
        layout.props.some((prop) => prop.x === entry.x && prop.y === entry.y),
        false,
    );
});

function setup() {
    const { context: c } = runtime();
    c.KDMapData.GridWidth = c.KDMapData.GridHeight = 41;
    c.KDMapData.RoomType = c.KDGameData.RoomType = "court";
    c.KDMapData.Bullets = [];
    c.KinkyDungeonPlayerEntity.x = c.KinkyDungeonPlayerEntity.y = 20;
    const walls = new Set();
    c.KinkyDungeonGroundTiles = "023";
    c.KinkyDungeonMovableTilesEnemy = "023";
    c.KinkyDungeonMapGet = (x, y) =>
        x <= 0 || y <= 0 || x >= 40 || y >= 40 || walls.has(`${x},${y}`) ? "1" : x === 7 && y === 33 ? "2" : "0";
    c.KinkyDungeonDamageEnemy = (enemy, damage) => {
        enemy.hp -= damage.damage;
        return damage.damage;
    };
    c.KDRemoveEntity = (enemy) => {
        const index = c.KDMapData.Entities.indexOf(enemy);
        if (index < 0) return false;
        c.KDMapData.Entities.splice(index, 1);
        return true;
    };
    c.KDBulletCanHitEntity = (bullet, enemy) => bullet.x === enemy.x && bullet.y === enemy.y;
    c.KDBulletAoECanHitEntity = (bullet, enemy) =>
        Math.max(Math.abs(bullet.x - enemy.x), Math.abs(bullet.y - enemy.y)) <= bullet.radius;
    c.KinkyDungeonSendTextMessage = () => {};
    c.KDAllied = (enemy) => enemy.allied === true;
    c.KDIsInParty = (enemy) => enemy.party === true;
    c.KDEventMapWeapon = {
        tick: {
            AoEDamage: () => {
                for (const enemy of c.KDMapData.Entities) c.KinkyDungeonDamageEnemy(enemy, { damage: 1 });
            },
        },
    };
    c.TextGet = (key) => key;
    c.KinkyDungeonCastSpell = () => ({ result: "Cast" });
    c.KinkyDungeonFindSpell = (name) => ({ name });
    c.Spiderlings.addEnemies = (definitions) =>
        definitions.forEach((definition) => c.Spiderlings.registerNamed(c.KinkyDungeonEnemies, definition));
    for (const name of ["Spinner", "WebCaster", "Jumper", "Tunneler", "MageSpiderlings", "NestEntrance"])
        c.KinkyDungeonEnemies.push({ name, maxhp: 5, movePoints: 1, tags: { spiderlings: true } });
    const room = { complete: false };
    c.Spiderlings.BossRoom = {
        active: () => true,
        state: () => room,
        complete: () => {
            room.complete = true;
        },
        CENTER: { x: 20, y: 20 },
    };
    c.Spiderlings.SilkDensity = { refresh: () => {} };
    load(c, "SpiderlingsBossFootprint.js");
    load(c, "SpiderlingsBossEncounter.js");
    c.Spiderlings.BossEncounter.initialize();
    return { c, walls, room, encounter: c.Spiderlings.BossEncounter, footprint: c.Spiderlings.BossFootprint };
}

test("the enlarged boss has nine occupied cells and moves its whole footprint", () => {
    const { c, walls, encounter, footprint } = setup();
    const boss = encounter.boss();
    assert.equal(c.KinkyDungeonEntityAt(boss.x + 1, boss.y).id, boss.id);
    assert.equal(footprint.cells(boss).filter((point) => c.KinkyDungeonEntityAt(point.x, point.y)).length, 9);
    walls.add("22,5");
    c.KDMoveEntity(boss, 21, 5, true);
    assert.equal(boss.x, 20);
    walls.clear();
    c.KDMoveEntity(boss, 21, 5, true);
    assert.equal(boss.x, 21);
    assert.equal(c.KinkyDungeonEntityAt(19, 5), undefined);
    assert.equal(footprint.cells(boss).filter((point) => c.KinkyDungeonEntityAt(point.x, point.y)).length, 9);
});

test("edge melee damage and an area covering nine cells resolve to one health pool", () => {
    const { c, encounter, footprint } = setup();
    const boss = encounter.boss(),
        hp = boss.hp;
    const part = c.KDMapData.Entities.find(footprint.isPart);
    c.KinkyDungeonDamageEnemy(part, { damage: 5 });
    assert.equal(boss.hp, hp - 5);
    const candidates = c.KDMapData.Entities.filter((enemy) =>
        c.KDBulletAoECanHitEntity({ x: boss.x, y: boss.y, radius: 1 }, enemy),
    );
    assert.deepEqual(
        candidates.map((enemy) => enemy.id),
        [boss.id],
    );
    assert.equal(c.KDBulletCanHitEntity({ x: boss.x - 1, y: boss.y - 1 }, boss), true);
});

test("ordinary decorated ground supports all eight fixed builders without consuming population slots", () => {
    const { c, encounter } = setup();
    assert.equal(encounter.state().builderIds.length, 8);
    load(c, "SpiderlingsPopulation.js");
    assert.equal(c.Spiderlings.availableSpiderlingSlots(), 25);
    c.DialogueCreateEnemy(2, 2, "Spinner");
    assert.equal(c.Spiderlings.availableSpiderlingSlots(), 24);
});

test("a blocked support formation creates no partial group", () => {
    const { c, encounter } = setup();
    const before = c.KDMapData.Entities.length;
    assert.equal(
        encounter.spawnFormation(
            ["Spinner", "Spinner"],
            [
                { x: 3, y: 3 },
                { x: 20, y: 20 },
            ],
            "support",
        ),
        undefined,
    );
    assert.equal(c.KDMapData.Entities.length, before);
});

test("phase one becomes invulnerable and only the original four Nest deaths end regeneration", () => {
    const { c, encounter } = setup();
    const boss = encounter.boss();
    c.KinkyDungeonDamageEnemy(boss, { damage: 10000 });
    assert.equal(encounter.state().phase, "interlude");
    const hp = boss.hp;
    c.KinkyDungeonDamageEnemy(boss, { damage: 100 });
    assert.equal(boss.hp, hp);
    const unrelated = c.DialogueCreateEnemy(10, 10, "NestEntrance");
    c.KDRemoveEntity(unrelated, true);
    assert.equal(encounter.state().nests.filter((goal) => goal.destroyed).length, 0);
    for (const goal of encounter.state().nests)
        c.KDRemoveEntity(
            c.KDMapData.Entities.find((enemy) => enemy.id === goal.id),
            true,
        );
    encounter.advance(1);
    assert.equal(encounter.state().phase, "two");
    assert.equal(boss.hp, hp);
});

test("an occupied original Nest corner retries without duplicating completed corners", () => {
    const { c, encounter } = setup();
    const blocker = c.DialogueCreateEnemy(35, 35, "Spinner");
    c.KinkyDungeonDamageEnemy(encounter.boss(), { damage: 10000 });
    const first = encounter
        .state()
        .nests.filter((goal) => goal.spawned)
        .map((goal) => goal.id);
    assert.equal(first.length, 3);
    c.KDRemoveEntity(blocker, true);
    encounter.advance(1);
    assert.equal(encounter.state().nests.filter((goal) => goal.spawned).length, 4);
    assert.deepEqual(
        encounter
            .state()
            .nests.slice(0, 3)
            .map((goal) => goal.id),
        first,
    );
});

test("final victory cancels capture ownership and persists the open return route", () => {
    const { c, encounter, room } = setup();
    let released = false;
    c.Spiderlings.BossCapture = {
        interrupt: (final) => {
            released = final;
        },
    };
    encounter.state().phase = "two";
    c.KinkyDungeonDamageEnemy(encounter.boss(), { damage: 10000 });
    assert.equal(encounter.state().phase, "victory");
    assert.equal(room.complete, true);
    assert.equal(released, true);
    assert.equal(c.KDMapData.Entities.length, 1);
});

test("native weapon aura enumeration damages the boss once per invocation", () => {
    const { c, encounter } = setup();
    const boss = encounter.boss(),
        hp = boss.hp;
    c.KDEventMapWeapon.tick.AoEDamage();
    assert.equal(boss.hp, hp - 1);
    c.KDEventMapWeapon.tick.AoEDamage();
    assert.equal(boss.hp, hp - 2);
});

test("victory keeps player allies and their projectiles", () => {
    const { c, encounter } = setup();
    const ally = c.DialogueCreateEnemy(3, 3, "Spinner");
    ally.allied = true;
    c.KDMapData.Bullets.push({ time: 5, source: ally.id, bullet: { faction: "Player" } });
    encounter.state().phase = "two";
    c.KinkyDungeonDamageEnemy(encounter.boss(), { damage: 10000 });
    assert.ok(c.KDMapData.Entities.includes(ally));
    assert.equal(c.KDMapData.Bullets[0].time, 5);
});
