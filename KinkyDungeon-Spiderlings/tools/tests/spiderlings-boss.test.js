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

test("both native Boss defeat branches return to the source chamber without native jail aftermath", () => {
    for (const putInJail of [false, true]) {
        const { context: c } = runtime();
        const calls = [];
        const leasher = { id: 123 };
        c.KDCustomDefeat = "";
        c.KDCustomDefeatEnemy = leasher;
        c.KinkyDungeonDefeat = function (...args) {
            calls.push({ receiver: this, args });
            return "native-defeat";
        };
        c.KinkyDungeonInterruptSleep = () => {};
        c.KDResetDialogue = () => {};
        c.KDBreakTether = (player) => {
            delete player.leash;
        };
        c.KinkyDungeonSendEvent = () => {};
        c.KDMapData.RoomType = c.KDGameData.RoomType = "court";
        c.KDMapData.SpiderlingsBossRoom = { source: { room: "prison" } };
        c.KinkyDungeonPlayerEntity.leash = { entity: leasher.id };
        c.KDGameData.KinkyDungeonLeashedPlayer = 2;
        c.KDGameData.PrisonerState = "parole";
        c.KDGoThruTile = () => {
            c.KDMapData.RoomType = c.KDGameData.RoomType = "prison";
            delete c.KDMapData.SpiderlingsBossRoom;
        };
        c.Spiderlings.Prison = {
            isPrison: () => c.KDGameData.RoomType === "prison",
            recapture: () => {
                Object.assign(c.KinkyDungeonPlayerEntity, { x: 14, y: 32 });
                c.KDGameData.SpiderlingsPrisonIdentity = { previous: c.KDGameData.PrisonerState };
                c.KDGameData.PrisonerState = "jail";
                return true;
            },
        };
        load(c, "SpiderlingsBossRoom.js");
        c.KinkyDungeonDefeat(putInJail, leasher);
        assert.equal(calls.length, 0);
        assert.equal(c.KDGameData.RoomType, "prison");
        assert.equal(c.KinkyDungeonPlayerEntity.x, 14);
        assert.equal(c.KinkyDungeonPlayerEntity.y, 32);
        assert.equal(c.KDGameData.SpiderlingsPrisonIdentity.previous, "parole");
        assert.equal(c.KinkyDungeonPlayerEntity.leash, undefined);
        assert.equal(c.KDGameData.KinkyDungeonLeashedPlayer, 0);
        const receiver = {};
        assert.equal(c.KinkyDungeonDefeat.call(receiver, putInJail, leasher), "native-defeat");
        assert.equal(calls[0].receiver, receiver);
        assert.deepEqual(calls[0].args, [putInJail, leasher]);
    }
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
    c.KinkyDungeonSendEvent = (trigger, data) => {
        for (const handler of Object.values(c.KDEventMapGeneric[trigger] || {})) handler({}, data);
    };
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

function resonanceView() {
    const fixture = setup();
    const { c, encounter } = fixture;
    let clock = 1000;
    const draws = [];
    const textDraws = [];
    const messages = {};
    c.CommonTime = () => clock;
    c.KinkyDungeonIsDisabled = (enemy) => enemy.stun > 0;
    c.KDCanSeeEnemy = (enemy) => enemy.visible !== false;
    c.KinkyDungeonVisionGet = () => 1;
    c.KinkyDungeonGridSizeDisplay = 72;
    c.KinkyDungeonRootDirectory = "Game/";
    c.KDModFiles = {
        "Game/Enemies/Spinner.png": "blob:spinner",
        "Game/Bullets/SpiderlingsMageRuneIcon.png": "blob:rune",
    };
    c.kdgameboard = { addChild: (child) => (child.parent = c.kdgameboard) };
    c.kdpixisprites = new Map();
    c.KDDraw = (...args) => draws.push(args);
    c.DrawTextKD = (text) => textDraws.push(text);
    c.DrawTextFitKD = (text) => textDraws.push(text);
    c.kdcanvas = {};
    c.FillRectKD = () => {};
    c.addTextKey = (key, value) => (messages[key] = value);
    c.TextGet = (key) => messages[key] || key;
    c.PIXI = {
        Graphics: class {
            clear() {}
            lineStyle() {
                return this;
            }
            beginFill() {
                return this;
            }
            drawRect() {
                return this;
            }
            endFill() {
                return this;
            }
            moveTo() {
                return this;
            }
            lineTo() {
                return this;
            }
            drawCircle() {
                return this;
            }
        },
    };
    c.Spiderlings.SpellwovenCocoon = { item: () => undefined };
    c.Spiderlings.BossCapture = {
        state: () => undefined,
        peaceful: () => false,
        controlling: () => false,
        contesting: () => false,
        advance() {},
    };
    encounter.state().nextBody = encounter.state().nextSupport = 10000;
    encounter.state().nextPulse = 0;
    load(c, "SpiderlingsBossView.js");
    return {
        ...fixture,
        textDraws,
        at: (time) => (clock = time),
        draw: () => {
            draws.length = 0;
            textDraws.length = 0;
            c.KinkyDungeonSendEvent("draw", { CamX: 0, CamY: 0 });
            return draws;
        },
        hud: () => {
            const data = { stats: {} };
            c.KinkyDungeonSendEvent("drawBuffIcons", data);
            return data.stats.SpiderlingsBossResonance;
        },
    };
}

test("resonance keeps its six-turn cadence while projecting one-second synchronized native glows", () => {
    const { c, encounter, at, draw, hud } = resonanceView();
    let refreshes = 0;
    c.Spiderlings.SilkDensity.refresh = () => refreshes++;
    encounter.advance(0);
    assert.equal(refreshes, 0);
    assert.equal(draw().length, 0);
    encounter.advance(1);
    assert.equal(refreshes, 1);
    at(1400);
    const glows = draw();
    assert.equal(glows.length, 2);
    c.KinkyDungeonSendEvent("postMapgen", {});
    assert.equal(draw().length, 2, "Map setup must retain a pulse emitted during encounter initialization");
    assert.deepEqual(
        glows.map((args) => args[3]),
        ["Game/Aura/Aura.png", "Game/Aura/Aura.png"],
    );
    assert.equal(glows[0][9].alpha, glows[1][9].alpha);
    assert.ok(glows[0][9].alpha > 0 && glows[0][9].alpha <= 0.7);
    assert.ok(Math.abs(glows[0][6] / glows[1][6] - 3) < 1e-9);
    assert.equal(hud().icon, "buff/buffSpiderlingsBossResonance");
    assert.equal(c.KDModFiles["Game/Buffs/buff/buffSpiderlingsBossResonance.png"], "blob:rune");
    assert.match(hud().text, /preventing its natural decay/);
    at(2000);
    assert.equal(draw().length, 0);
    assert.ok(hud(), "The maintenance indicator must outlast the short glow");
    assert.equal(refreshes, 1, "Rendering must not refresh density");
    encounter.advance(5);
    assert.equal(refreshes, 1);
    encounter.advance(1);
    assert.equal(refreshes, 2);
    at(2300);
    assert.equal(draw().length, 2);
});

test("resonance feedback clears on inactive phases, disability, escort, leaving and loading", () => {
    const { c, encounter, at, draw, hud } = resonanceView();
    encounter.advance(1);
    at(1300);
    assert.equal(draw().length, 2);
    c.KinkyDungeonSendEvent("afterLoadGame", {});
    assert.equal(draw().length, 0, "Loading must not replay an old pulse");
    assert.ok(hud());
    encounter.boss().stun = 2;
    assert.equal(hud(), undefined);
    encounter.boss().stun = 0;
    for (const phase of ["interlude", "victory"]) {
        encounter.state().phase = phase;
        assert.equal(hud(), undefined, phase);
    }
    encounter.state().phase = "two";
    assert.ok(hud());
    c.Spiderlings.BossCapture.state = () => ({ phase: "escort" });
    assert.equal(hud(), undefined);
    c.Spiderlings.BossCapture.state = () => ({ phase: "escape" });
    c.Spiderlings.BossCapture.peaceful = () => true;
    assert.ok(hud(), "The existing escape-window resonance remains active");
    c.Spiderlings.BossRoom.active = () => false;
    assert.equal(hud(), undefined);
    assert.equal(draw().length, 0);
});

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

test("support keeps complete safe formations at each wall and retries an obstructed quadrant", () => {
    for (const player of [
        { x: 3, y: 20 },
        { x: 37, y: 20 },
        { x: 20, y: 3 },
        { x: 20, y: 37 },
    ]) {
        const { c, walls, encounter } = setup();
        const state = encounter.state();
        c.KDMapData.Entities = c.KDMapData.Entities.filter((enemy) => !encounter.isFixedFormation(enemy));
        Object.assign(c.KinkyDungeonPlayerEntity, player);
        state.nextBody = state.nextPulse = 10000;
        state.warnings = [];
        for (const [index, name, count] of [
            [0, "WebCaster", 4],
            [1, "Jumper", 6],
            [2, "MageSpiderlings", 4],
        ]) {
            state.supportIndex = index;
            state.nextSupport = state.clock;
            encounter.advance(1);
            const members = c.KDMapData.Entities.filter((enemy) => encounter.isFixedFormation(enemy));
            assert.equal(members.length, count, `${name} at ${JSON.stringify(player)}`);
            assert.equal(new Set(members.map((enemy) => `${enemy.x},${enemy.y}`)).size, count);
            for (const member of members)
                assert.ok(Math.max(Math.abs(member.x - player.x), Math.abs(member.y - player.y)) >= 4);
            assert.equal(members.filter((enemy) => enemy.x < player.x).length, count / 2);
            if (name !== "Jumper")
                for (const dx of [-1, 1])
                    for (const dy of [-1, 1])
                        assert.equal(
                            members.filter(
                                (enemy) => Math.sign(enemy.x - player.x) === dx && Math.sign(enemy.y - player.y) === dy,
                            ).length,
                            1,
                        );
            c.KDMapData.Entities = c.KDMapData.Entities.filter((enemy) => !encounter.isFixedFormation(enemy));
        }
        for (let y = player.y - 7; y < player.y; y++)
            for (let x = player.x - 7; x < player.x; x++) walls.add(`${x},${y}`);
        state.supportIndex = 0;
        state.nextSupport = state.clock;
        const due = state.nextSupport;
        encounter.advance(1);
        assert.equal(state.supportIndex, 0);
        assert.equal(state.nextSupport, due);
        assert.equal(c.KDMapData.Entities.filter(encounter.isFixedFormation).length, 0);
        walls.clear();
        encounter.advance(1);
        assert.equal(state.supportIndex, 1);
        assert.equal(c.KDMapData.Entities.filter(encounter.isFixedFormation).length, 4);
    }
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

test("native melee scheduling leaves one visible world turn before its warned hit", () => {
    const { c, encounter } = setup();
    const saved = encounter.state(),
        boss = encounter.boss();
    saved.clock = 20;
    saved.nextBody = saved.nextSupport = saved.nextPulse = 10000;
    saved.warnings = [];
    saved.lastBodyAt = 0;
    boss.SpiderlingsBossMeleeCredit = 3;
    Object.assign(c.KinkyDungeonPlayerEntity, { x: boss.x, y: boss.y + 2 });
    let hits = 0;
    c.Spiderlings.Webbing = { applyEnemyProgression: () => hits++ };
    c.KinkyDungeonEnemyLoop = () => ({ idle: true });
    c.Spiderlings.NativeActions.install();
    c.KinkyDungeonEnemyLoop(boss, c.KinkyDungeonPlayerEntity, 1);
    encounter.advance(1);
    assert.equal(hits, 0, "A new warning must survive the turn in which native AI created it");
    assert.equal(saved.warnings.length, 1);
    assert.equal(saved.warnings[0].at - saved.clock, 1);
    encounter.advance(1);
    assert.equal(hits, 1);
    assert.equal(saved.warnings.length, 0);
});

test("fixed WebCaster support fires at the advertised native world-turn deadline", () => {
    const { c, encounter } = setup();
    const saved = encounter.state();
    saved.warnings = [];
    saved.nextBody = saved.nextPulse = saved.nextSupport = 10000;
    let casts = 0;
    c.KinkyDungeonCastSpell = () => {
        casts++;
        return { result: "Cast" };
    };
    c.KinkyDungeonEnemyLoop = () => ({ idle: true });
    c.Spiderlings.NativeActions.install();
    const support = c.KDMapData.Entities.filter((enemy) => enemy.SpiderlingsBossSupport);
    assert.equal(support.length, 4);
    for (const enemy of support) c.KinkyDungeonEnemyLoop(enemy, c.KinkyDungeonPlayerEntity, 1);
    encounter.advance(1);
    assert.equal(casts, 0);
    for (const enemy of support) c.KinkyDungeonEnemyLoop(enemy, c.KinkyDungeonPlayerEntity, 1);
    assert.equal(casts, 4, "The second paid turn must execute the two-turn cast forecast");
    encounter.advance(1);
    assert.ok(support.every((enemy) => enemy.SpiderlingsBossSupport.fired));
});

test("Boss warnings display the remaining world time without advancing or repeating their hit", () => {
    const { c, encounter, draw, textDraws, at } = resonanceView();
    const saved = encounter.state(),
        resolved = [];
    saved.warnings = [];
    saved.bodyIndex = 0;
    saved.nextBody = 0;
    saved.nextPulse = 10000;
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 20, y: 8 });
    let hits = 0;
    c.Spiderlings.Webbing = { applyEnemyProgression: () => hits++ };
    c.KDAddEvent(c.KDEventMapGeneric, "spiderlingsBossWarningResolved", "TestBossWarning", (_event, data) =>
        resolved.push(data),
    );
    encounter.advance(1);
    const snapshot = JSON.stringify(saved);
    draw();
    assert.ok(textDraws.includes("Silk fan · world turns left: 2"));
    draw();
    assert.equal(JSON.stringify(saved), snapshot);
    assert.equal(hits, 0);
    encounter.advance(0.5);
    draw();
    assert.ok(textDraws.includes("Silk fan · world turns left: 1.5"));
    encounter.advance(1.5);
    assert.equal(hits, 1);
    assert.equal(resolved.length, 1);
    assert.equal(resolved[0].kind, "fan");
    assert.ok(resolved[0].cells.some((cell) => cell.x === 20 && cell.y === 8));
    at(1100);
    draw();
    assert.equal(
        textDraws.some((text) => text.startsWith("Silk fan ·")),
        false,
    );
    c.KinkyDungeonSendEvent("afterLoadGame", {});
    at(2000);
    draw();
    assert.equal(hits, 1);
    assert.equal(resolved.length, 1);
});

test("Boss support countdowns use the Mage charge clock and combine simultaneous casts", () => {
    const { c, encounter, draw, textDraws } = resonanceView();
    c.addTextKey("KinkyDungeonSpellSpiderlingsMageCollapse", "Thousand Silk Collapse");
    const owners = [c.DialogueCreateEnemy(3, 3, "MageSpiderlings"), c.DialogueCreateEnemy(4, 3, "MageSpiderlings")];
    for (const owner of owners) owner.SpiderlingsBossSupport = { fired: true };
    c.KDMapData.SpiderlingsMageSpells = {
        clock: 50,
        collapses: owners.map((owner) => ({ ownerId: owner.id, explodeAt: 53 })),
    };
    draw();
    assert.equal(textDraws.filter((text) => text === "Thousand Silk Collapse · world turns left: 3").length, 1);
    c.KDMapData.SpiderlingsMageSpells.clock = 51;
    encounter.state().clock = 1;
    draw();
    assert.ok(textDraws.includes("Thousand Silk Collapse · world turns left: 2"));
    c.KDMapData.SpiderlingsMageSpells.collapses = [];
    draw();
    assert.equal(
        textDraws.some((text) => text.startsWith("Thousand Silk Collapse ·")),
        false,
    );
});
