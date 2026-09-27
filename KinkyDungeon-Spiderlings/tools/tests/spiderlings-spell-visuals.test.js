"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsSpellVisuals.js"), "utf8");

function fixture() {
    const events = {},
        draws = [],
        lines = [],
        dots = [];
    let clock = 0,
        pink = false;
    class Graphics {
        clear() {
            lines.length = 0;
            dots.length = 0;
            return this;
        }
        lineStyle() {
            return this;
        }
        moveTo(x, y) {
            this.start = [x, y];
            return this;
        }
        lineTo(x, y) {
            lines.push([...this.start, x, y]);
            return this;
        }
        beginFill() {
            return this;
        }
        endFill() {
            return this;
        }
        drawCircle(x, y, radius) {
            dots.push([x, y, radius]);
            return this;
        }
        destroy() {
            this.destroyed = true;
        }
    }
    const board = {
        addChild(g) {
            g.parent = board;
        },
        removeChild(g) {
            g.parent = null;
        },
    };
    const c = {
        Spiderlings: { getSetting: () => pink },
        KDMapData: { Entities: [], Bullets: [] },
        KinkyDungeonPlayerEntity: { x: 3, y: 3, player: true },
        CommonTime: () => clock,
        PIXI: { Graphics },
        KinkyDungeonGridSizeDisplay: 72,
        KinkyDungeonRootDirectory: "Game/",
        KinkyDungeonVisionGet: () => 1,
        KDCanSeeEnemy: (enemy) => !enemy.hidden,
        KinkyDungeonBulletsVisual: new Map(),
        StandalonePatched: true,
        kdgameboard: board,
        kdbulletboard: {},
        kdpixisprites: new Map(),
        KDEventMapGeneric: {},
        KDAddEvent: (_map, event, _key, fn) => {
            events[event] = fn;
        },
        KDPlayerEffects: {
            SpiderlingsWebbingEnemyBind: () => ({ effect: true }),
            SpiderlingsWebSprayHit: () => ({ effect: true }),
        },
        KDDraw: (...args) => {
            draws.push(args);
            return { args };
        },
    };
    vm.runInNewContext(source, c);
    function draw(camera = {}) {
        draws.length = 0;
        events.draw(null, { CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0, ...camera });
        return draws;
    }
    function state(overrides = {}) {
        const state = { clock: 0, fields: [], collapses: [], marks: {}, blasts: [], ...overrides };
        c.KDMapData.SpiderlingsMageSpells = state;
        return state;
    }
    return {
        c,
        events,
        draws,
        lines,
        dots,
        draw,
        state,
        time: (value) => {
            clock = value;
        },
        pink: (value) => {
            pink = value;
        },
    };
}

test("Hex uses one center rune and a complete boundary; activation does not tile the floor", () => {
    const r = fixture();
    const state = r.state({ fields: [{ x: 2, y: 2, ownerId: 1, activateAt: 3 }] });
    assert.equal(r.draw().length, 1);
    assert.equal(r.lines.length, 16 * 6, "four-cell sides show dashed edges, with no interior grid");
    assert.deepEqual(r.draws[0].slice(4, 8), [288, 288, 72, 72]);
    state.clock = 3;
    r.draw();
    assert.equal(r.lines.length, 16);
    assert.equal(r.draws.length, 1);
});

test("Collapse keeps the entire cut-corner outline through all three turns and switches silk color", () => {
    const r = fixture();
    const state = r.state({ collapses: [{ x: 4, y: 4, startAt: 0, ownerId: 1 }] });
    r.draw();
    const boundary = JSON.stringify(r.lines);
    assert.equal(r.lines.length, 20);
    assert.equal(r.draws.filter((d) => d[3].endsWith("WebSprayTrail.png")).length, 8);
    for (const clock of [1, 2]) {
        state.clock = clock;
        r.time(clock * 810);
        r.pink(true);
        r.draw();
        assert.equal(JSON.stringify(r.lines), boundary);
        assert.equal(r.draws.filter((d) => d[3].endsWith("WebSprayTrailPink.png")).length, 8);
    }
    state.collapses = [];
    r.draw();
    assert.equal(r.lines.length, 0);
    assert.equal(r.draws.length, 0);
});

test("one-, two- and three-stack bursts retain exact warning footprints without floor-wide hit art", () => {
    for (const stacks of [1, 2, 3]) {
        const r = fixture();
        const state = r.state({ blasts: [{ x: 4, y: 4, stacks, detonateAt: 2 }] });
        r.draw();
        assert.equal(r.lines.length, (stacks * 2 - 1) * 4 * 6);
        assert.equal(r.draws.length, 1);
        state.clock = 2;
        state.blasts = [{ x: 4, y: 4, radius: stacks - 1, expiresAt: 3 }];
        assert.equal(r.draw().length, 0, "legacy saved blast art is not replayed across empty tiles");
    }
});

test("marks follow only visible marked targets, expire in game turns, and show their stack count", () => {
    const r = fixture();
    const enemy = { id: 2, hp: 5, x: 3, y: 4, Enemy: { name: "Maid" } };
    r.c.KDMapData.Entities.push(enemy);
    const state = r.state({ marks: { "npc:2": { stacks: 3, expiresAt: 4 } } });
    r.draw();
    assert.equal(r.dots.length, 3);
    const x = r.draws[0][4];
    enemy.x++;
    r.time(5000);
    r.draw();
    assert.equal(r.draws[0][4], x + 72, "wall time does not expire a gameplay mark");
    enemy.hidden = true;
    assert.equal(r.draw().length, 0);
    enemy.hidden = false;
    state.clock = 5;
    assert.equal(r.draw().length, 0);
});

test("hit feedback coalesces per target, fades in real time and disappears on map replacement", () => {
    const r = fixture();
    const player = r.c.KinkyDungeonPlayerEntity;
    for (let i = 0; i < 5; i++) r.c.Spiderlings.SpellVisuals.hit(player);
    assert.equal(r.draw().length, 1);
    r.time(120);
    r.pink(true);
    r.draw();
    assert.ok(r.draws[0][3].endsWith("SpiderWebHitPink.png"));
    assert.equal(r.draws[0][9].alpha, 0.5);
    r.time(240);
    assert.equal(r.draw().length, 0);
    r.c.Spiderlings.SpellVisuals.hit(player);
    r.c.KDMapData = { Entities: [], Bullets: [] };
    assert.equal(r.draw().length, 0);
});

test("fully resisted NPC hits and ground-trail contacts do not create false hit flashes", () => {
    const r = fixture();
    const enemy = { id: 2, hp: 5, x: 3, y: 4, Enemy: { name: "Maid" } };
    const data = { enemy, attacker: { Enemy: { name: "WebCaster" } }, incomingDamage: { spiderlingsAttack: "direct" } };
    r.events.beforeDamageEnemy(null, data);
    r.events.afterDamageEnemy(null, data);
    assert.equal(r.draw().length, 0);
    enemy.specialBoundLevel = { Slime: 1 };
    r.events.afterDamageEnemy(null, data);
    assert.equal(r.draw().length, 1);
    r.events.postMapgen();
    data.incomingDamage.spiderlingsAttack = "trail";
    r.events.afterDamageEnemy(null, data);
    r.c.KDPlayerEffects.SpiderlingsWebSprayHit(null, null, { triggerSource: "trail" });
    assert.equal(r.draw().length, 0);
});

test("Mage bolts have a compact upright head and at most two world-aligned afterimages during camera motion", () => {
    const r = fixture();
    const options = { alpha: 0.8, zIndex: 2 };
    const shot = { visual_x: 3, visual_y: 4 };
    r.c.KinkyDungeonBulletsVisual.set("bolt", shot);
    const draw = (x, y) =>
        r.c.KDDraw(
            r.c.kdbulletboard,
            r.c.kdpixisprites,
            "bolt",
            "Game/Bullets/SpiderlingsMageBolt.png",
            x,
            y,
            72,
            72,
            1,
            options,
            true,
        );
    draw(252, 324);
    assert.equal(r.draws.at(-1)[6], 72 * 0.55);
    assert.equal(r.draws.at(-1)[8], 0);
    shot.visual_x = 4;
    r.draws.length = 0;
    draw(252, 324); // The camera moved one tile right with the shot.
    assert.equal(r.draws[0][4], 180, "the old world position pans with the current camera");
    for (let x = 5; x < 10; x++) {
        shot.visual_x = x;
        r.draws.length = 0;
        draw(x * 72, 324);
    }
    assert.equal(r.draws.length, 3);
    assert.deepEqual(options, { alpha: 0.8, zIndex: 2 });
    r.time(240);
    r.draws.length = 0;
    draw(9 * 72, 324);
    assert.equal(r.draws.length, 1, "stationary bolt remains but its afterimages expire in real time");
    r.time(480);
    r.draws.length = 0;
    draw(9 * 72, 324);
    assert.equal(r.draws.length, 1, "a stationary head does not regenerate expired afterimages");
});

test("WebSpray faces along its flight and retains faint native lingering trails", () => {
    const r = fixture();
    const draw = (name, rotation) =>
        r.c.KDDraw(
            r.c.kdbulletboard,
            r.c.kdpixisprites,
            name,
            `Game/Bullets/${name}.png`,
            72,
            72,
            72,
            72,
            rotation,
            { alpha: 0.8 },
            true,
        );
    draw("WebSpray", 0.4);
    assert.equal(r.draws.at(-1)[8], Math.PI + 0.4);
    draw("WebSprayTrail", 3);
    assert.equal(r.draws.at(-1)[9].alpha, 0.8 * 0.32);
    assert.equal(r.draws.at(-1)[8], 0);
    const before = r.draws.length;
    draw("Unrelated", 0.2);
    assert.equal(r.draws.length, before + 1);
    assert.equal(r.draws.at(-1)[8], 0.2);
});

test("dash ghosts and construction highlights expire without spending another game turn", () => {
    const r = fixture();
    const source = { id: 1, x: 1, y: 1 };
    r.c.Spiderlings.SpellVisuals.dash(source, { x: 4, y: 1 });
    r.c.Spiderlings.SpellVisuals.built(source);
    assert.equal(r.draw().length, 2);
    assert.equal(r.c.Spiderlings.SpellVisuals.constructionFlash(source), 0.55);
    r.time(240);
    assert.equal(r.draw().length, 0);
    assert.equal(r.c.Spiderlings.SpellVisuals.constructionFlash(source), 0);
});

test("rune triggering adds a 3x3 outline; fog and the native camera transform remain effective", () => {
    const r = fixture();
    r.c.KDMapData.Bullets.push({ x: 3, y: 3, time: 4, SpiderlingsRunePhase: "triggered" });
    r.draw({ CamX: 1, CamY: 2, CamX_offset: 0.4, CamY_offset: 0.2 });
    const first = [...r.lines[0]];
    assert.equal(first[0], 72);
    r.c.StandalonePatched = false;
    r.draw({ CamX: 1, CamY: 2, CamX_offset: 0.4, CamY_offset: 0.2 });
    assert.ok(Math.abs(r.lines[0][0] - (first[0] - 0.4 * 72)) < 0.0001);
    r.c.KinkyDungeonVisionGet = () => 0;
    r.draw();
    assert.equal(r.lines.length, 0);
});
