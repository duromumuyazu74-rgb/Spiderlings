"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsSpellVisuals.js"), "utf8");

function fixture({ mageSpells = false } = {}) {
    const events = {},
        draws = [],
        lines = [],
        dots = [],
        fills = [],
        labels = [],
        lineStyles = [];
    const geometryAllocations = { sets: 0 };
    let clock = 0,
        pink = false;
    class Graphics {
        clear() {
            this.rectangles = [];
            lines.length = 0;
            dots.length = 0;
            fills.length = 0;
            lineStyles.length = 0;
            return this;
        }
        lineStyle(width, color, alpha) {
            this.stroke = { width, color, alpha };
            return this;
        }
        moveTo(x, y) {
            this.start = [x, y];
            return this;
        }
        lineTo(x, y) {
            lines.push([...this.start, x, y]);
            lineStyles.push(this.stroke);
            return this;
        }
        beginFill(color, alpha) {
            this.fill = { color, alpha };
            return this;
        }
        endFill() {
            return this;
        }
        drawCircle(x, y, radius) {
            dots.push([x, y, radius]);
            return this;
        }
        drawRect(x, y, width, height) {
            (this.rectangles ||= []).push({ x, y, width, height });
            fills.push({ x, y, width, height, ...this.fill });
            return this;
        }
        destroy() {
            this.clear();
            this.destroyed = true;
        }
    }
    const board = {
        children: [],
        addChild(g) {
            g.parent = board;
            board.children.push(g);
        },
        removeChild(g) {
            g.parent = null;
            board.children.splice(board.children.indexOf(g), 1);
        },
    };
    const c = {
        Set: class extends Set {
            constructor(...args) {
                super(...args);
                geometryAllocations.sets++;
            }
        },
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
        DrawTextFitKDTo: (...args) => labels.push(args),
        KDDraw: (...args) => {
            draws.push(args);
            const rendered = { args };
            c.kdpixisprites.set(args[2], rendered);
            return rendered;
        },
    };
    if (mageSpells) {
        c.KDGetFaction = (target) => target.faction;
        c.KDHostile = () => false;
        c.KinkyDungeonCastSpell = (x, y, spell, caster) => {
            c.KDMapData.Bullets.push({ x, y, time: 1, bullet: { spell, source: caster.id } });
            return { result: "Cast" };
        };
        vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsMageSpells.js"), "utf8"), c);
    }
    vm.runInNewContext(source, c);
    function draw(camera = {}) {
        draws.length = 0;
        labels.length = 0;
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
        geometryAllocations,
        draws,
        lines,
        dots,
        fills,
        labels,
        lineStyles,
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

test("Hex preserves sixteen warning cells and switches to ground silk without countdown text", () => {
    const r = fixture();
    const state = r.state({ fields: [{ x: 2, y: 2, ownerId: 1, activateAt: 3, endAt: 6 }] });
    r.draw();
    const danger = () => r.draws.filter((d) => d[2].includes("danger_"));
    assert.equal(danger().length, 16);
    const positions = danger().map((d) => d.slice(4, 6));
    const core = () => r.draws.find((d) => d[2].endsWith("hex_1"));
    const warningArt = core()[3];
    assert.deepEqual(core().slice(4, 6), [288, 288]);
    assert.equal(r.labels.length, 0);
    r.time(5000);
    r.draw();
    assert.deepEqual(
        danger().map((d) => d.slice(4, 6)),
        positions,
    );
    assert.equal(state.clock, 0);
    state.clock = 3;
    r.draw();
    assert.equal(danger().length, 0);
    assert.notEqual(core()[3], warningArt);
    assert.equal(r.fills.length, 16);
    assert.ok(r.c.kdgameboard.children.some((g) => g.zIndex < 0));
    assert.ok(r.fills.every((cell) => cell.width < 72 * 0.1));
    assert.equal(r.labels.length, 0);
});

test("weapon silk follows the visible actor, thickens with surviving silk and clears on release", () => {
    const r = fixture();
    const enemy = { id: 7, hp: 20, x: 4, y: 5, visual_x: 4.25, visual_y: 5.5, Enemy: { name: "Maidforce" } };
    let coverage = 0.1;
    r.c.KDMapData.Entities.push(enemy);
    r.c.Spiderlings.WeaponWebbing = { status: () => (coverage === undefined ? undefined : { coverage }) };
    r.draw();
    const light = r.lines.map((line) => [...line]);
    assert.ok(light.length > 0);
    enemy.visual_x += 1;
    enemy.visual_y += 2;
    r.draw();
    const moved = light.map(([x, y, xx, yy]) => [x + 72, y + 144, xx + 72, yy + 144]);
    assert.equal(r.lines.length, moved.length);
    assert.ok(r.lines.every((line, i) => line.every((value, n) => Math.abs(value - moved[i][n]) < 1e-8)));
    coverage = 1;
    r.draw();
    assert.ok(r.lines.length > light.length);
    enemy.hidden = true;
    r.draw();
    assert.equal(r.lines.length, 0);
    enemy.hidden = false;
    r.c.KinkyDungeonVisionGet = () => 0;
    r.draw();
    assert.equal(r.lines.length, 0);
    r.c.KinkyDungeonVisionGet = () => 1;
    coverage = undefined;
    r.draw();
    assert.equal(r.lines.length, 0);
});

test("Collapse keeps its fixed cut-corner danger mask while its strands gather inward", () => {
    const r = fixture();
    const state = r.state({ collapses: [{ x: 4, y: 4, startAt: 0, explodeAt: 3, ownerId: 1 }] });
    r.draw();
    const danger = () => r.draws.filter((d) => d[2].includes("danger_"));
    const positions = danger().map((d) => d.slice(4, 6));
    assert.equal(danger().length, 21);
    const cells = new Set(danger().map((d) => `${d[4] / 72 - 0.5},${d[5] / 72 - 0.5}`));
    for (const corner of ["2,2", "2,6", "6,2", "6,6"]) assert.equal(cells.has(corner), false);
    const strands = () => r.lines.filter((_line, i) => r.lineStyles[i]?.width === 1.4);
    const initial = strands().map((line) => Math.hypot(line[0] - 324, line[1] - 324));
    for (const clock of [1, 2]) {
        state.clock = clock;
        r.time(clock * 810);
        r.pink(true);
        r.draw();
        assert.deepEqual(
            danger().map((d) => d.slice(4, 6)),
            positions,
        );
        assert.equal(r.labels.length, 0);
        const silk = strands();
        assert.equal(silk.length, 24);
        assert.ok(silk.every((line, i) => Math.hypot(line[0] - 324, line[1] - 324) < initial[i]));
    }
    state.collapses = [];
    r.draw();
    assert.equal(r.lines.length, 0);
    assert.equal(r.draws.length, 0);
});

test("mark bursts keep exact footprints and visibly resolve before fading without another game turn", () => {
    for (const stacks of [1, 2, 3]) {
        const r = fixture();
        const state = r.state({ blasts: [{ x: 4, y: 4, stacks, detonateAt: 2 }] });
        r.draw();
        assert.equal(r.draws.filter((d) => d[2].includes("danger_")).length, (stacks * 2 - 1) ** 2);
        assert.equal(r.fills.length, 0);
        assert.equal(r.labels.length, 0);
        state.clock = 2;
        state.blasts = [{ x: 4, y: 4, radius: stacks - 1, expiresAt: 3 }];
        r.c.Spiderlings.SpellVisuals.burst(state.blasts[0]);
        assert.equal(r.draw().length, 1);
        assert.ok(r.draws[0][3].endsWith("SpiderlingsMageRuneHit.png"));
        assert.equal(r.fills.length, (stacks * 2 - 1) ** 2);
        const initialAlpha = r.fills[0].alpha;
        state.blasts = [];
        r.time(260);
        r.draw();
        assert.ok(r.fills[0].alpha < initialAlpha, "the flash survives removal of its gameplay record");
        r.time(600);
        assert.equal(r.draw().length, 0);
        assert.equal(r.fills.length, 0);
    }
});

test("Collapse impact excludes corner cells and every new area visual respects fog and map replacement", () => {
    const r = fixture();
    r.state({ blasts: [{ x: 4, y: 4, radius: 2, corners: false, expiresAt: 1 }] });
    r.c.Spiderlings.SpellVisuals.burst(r.c.KDMapData.SpiderlingsMageSpells.blasts[0]);
    r.draw();
    assert.equal(r.fills.length, 21);
    assert.equal(
        r.lineStyles.filter((style) => style.width === 1.25).length,
        24,
        "Only the center web has lit at the start of propagation",
    );
    r.c.KinkyDungeonVisionGet = (x, y) => (x === 4 && y === 4 ? 1 : 0);
    r.draw();
    assert.equal(r.fills.length, 1);
    r.c.KinkyDungeonVisionGet = () => 0;
    r.draw();
    assert.equal(r.fills.length, 0);
    assert.equal(r.draws.length, 0);
    assert.equal(r.labels.length, 0);
    r.c.KinkyDungeonVisionGet = () => 1;
    r.c.KDMapData = { Entities: [], Bullets: [] };
    assert.equal(r.draw().length, 0);
    assert.equal(r.fills.length, 0);
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

test("a visible target keeps its complete mark beside an unseen tile", () => {
    const r = fixture();
    const enemy = { id: 2, hp: 5, x: 3, y: 4, Enemy: { name: "Maid" } };
    r.c.KDMapData.Entities.push(enemy);
    r.c.KinkyDungeonVisionGet = (x, y) => (x === enemy.x && y === enemy.y ? 1 : 0);
    r.state({ marks: { "npc:2": { stacks: 2, expiresAt: 4 } } });
    r.draw();
    assert.equal(r.dots.length, 2);
    assert.equal(r.draws.length, 1, "the icon uses the target's visibility, not the tile above its head");
    enemy.hidden = true;
    r.draw();
    assert.equal(r.dots.length, 0);
    assert.equal(r.draws.length, 0);
});

test("marks, stack dots and hit flashes follow native entity interpolation", () => {
    const r = fixture();
    const enemy = { id: 2, hp: 5, x: 4, y: 4, visual_x: 3.25, visual_y: 3.8, Enemy: { name: "Maid" } };
    r.c.KDMapData.Entities.push(enemy);
    r.state({ marks: { "npc:2": { stacks: 1, expiresAt: 4 } } });
    r.c.Spiderlings.SpellVisuals.hit(enemy);
    r.draw();
    const mark = r.draws.find((d) => d[2].endsWith("mark_npc:2"));
    const hit = r.draws.find((d) => d[2].endsWith("hit_2:web"));
    assert.equal(mark[4], (enemy.visual_x + 0.5) * 72);
    assert.equal(mark[5], (enemy.visual_y - 0.55 + 0.5) * 72);
    assert.equal(r.dots[0][0], mark[4]);
    assert.equal(r.dots[0][1], (enemy.visual_y - 0.23 + 0.5) * 72);
    assert.equal(hit[4], mark[4]);
    assert.equal(hit[5], (enemy.visual_y + 0.5) * 72);
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

test("Mage bolts have a readable upright head and at most two world-aligned afterimages during camera motion", () => {
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
    assert.ok(r.draws.at(-1)[6] >= 72 * 0.8 && r.draws.at(-1)[6] <= 72);
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

test("WebSpray keeps its open edge facing forward in every flight direction", () => {
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
    for (const name of ["WebSpray", "WebSprayPink"]) {
        for (const direction of [0, Math.PI / 2, Math.PI, -Math.PI / 2, Math.PI / 4]) {
            draw(name, direction);
            assert.equal(r.draws.at(-1)[8], direction);
            assert.equal(r.draws.at(-1)[3], `Game/Bullets/${name}.png`);
            assert.equal(r.draws.at(-1)[9].alpha, 0.8);
        }
    }
    const before = r.draws.length;
    draw("Unrelated", 0.2);
    assert.equal(r.draws.length, before + 1);
    assert.equal(r.draws.at(-1)[8], 0.2);
});

test("settled WebSpray uses the complete web at native opacity for its entire native lifetime", () => {
    const r = fixture();
    const options = { alpha: 0.8, zIndex: 2 };
    for (const color of ["", "Pink"]) {
        for (const time of [0, 240, 2000]) {
            r.time(time);
            r.c.KDDraw(
                r.c.kdbulletboard,
                r.c.kdpixisprites,
                `ground${color}`,
                `Game/Bullets/WebSprayTrail${color}.png`,
                72,
                144,
                72,
                72,
                3,
                options,
                true,
            );
            const draw = r.draws.at(-1);
            assert.equal(draw[2], `ground${color}`);
            assert.equal(draw[3], `Game/Bullets/SpiderWebHit${color}.png`);
            assert.deepEqual(draw.slice(4, 9), [72, 144, 72, 72, 0]);
            assert.equal(draw[9].alpha, 0.8);
            assert.equal(draw[9].zIndex, 2);
        }
    }
    assert.deepEqual(options, { alpha: 0.8, zIndex: 2 });
});

test("moving silk afterimages remain stretched and expire without creating settled webs", () => {
    const r = fixture();
    r.pink(true);
    const shot = { visual_x: 3, visual_y: 4 };
    r.c.KinkyDungeonBulletsVisual.set("spray", shot);
    const draw = () =>
        r.c.KDDraw(
            r.c.kdbulletboard,
            r.c.kdpixisprites,
            "spray",
            "Game/Bullets/WebSprayPink.png",
            shot.visual_x * 72,
            shot.visual_y * 72,
            72,
            72,
            Math.PI / 2,
            { alpha: 1 },
            true,
        );
    draw();
    shot.visual_y++;
    r.draws.length = 0;
    draw();
    assert.equal(r.draws.length, 2);
    assert.equal(r.draws[0][3], "Game/Bullets/WebSprayTrailPink.png");
    assert.equal(r.draws[0][8], Math.PI / 2);
    assert.ok(r.draws[0][9].alpha < 1);
    r.time(240);
    r.draws.length = 0;
    draw();
    assert.equal(r.draws.length, 1);
    assert.equal(r.draws[0][3], "Game/Bullets/WebSprayPink.png");
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

test("resolved Mage bursts survive gameplay-record expiry before the first render", () => {
    const r = fixture({ mageSpells: true });
    const mage = { id: 1, hp: 10, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    r.c.KDMapData.Entities.push(mage);
    r.c.KinkyDungeonCastSpell(4, 4, { name: "SpiderlingsMageCollapse" }, mage);
    for (let tick = 0; tick < 6; tick++) r.events.tickAfter(null, { delta: 1 });
    assert.equal(r.c.KDMapData.SpiderlingsMageSpells.blasts.length, 0);
    assert.equal(r.draw().length, 1, "A burst must not depend on rendering its one-turn gameplay record");
    assert.equal(r.fills.length, 21);
    r.time(600);
    assert.equal(r.draw().length, 0);
});

test("native-style reload restores persistent state without replaying a resolved burst", () => {
    const r = fixture({ mageSpells: true });
    const mage = { id: 1, hp: 10, faction: "Enemy", Enemy: { name: "MageSpiderlings" } };
    r.c.KDMapData.Entities.push(mage);
    r.c.KinkyDungeonCastSpell(4, 4, { name: "SpiderlingsMageCollapse" }, mage);
    for (let tick = 0; tick < 5; tick++) r.events.tickAfter(null, { delta: 1 });
    assert.equal(r.draw().length, 1);
    r.time(260);
    assert.equal(r.draw()[0][9].alpha, 0.65);
    const saved = JSON.stringify(r.c.KDMapData);
    r.c.KDMapData = JSON.parse(saved);
    r.events.afterLoadGame();
    assert.equal(r.draw().length, 0, "Reload must not treat saved resolved records as new feedback");
    assert.equal(JSON.stringify(r.c.KDMapData), saved);
});

test("burst delivery deduplicates an event, copies its shape and drops entirely hidden events", () => {
    const r = fixture();
    const event = { x: 4, y: 4, radius: 2, corners: false };
    r.c.Spiderlings.SpellVisuals.burst(event);
    r.c.Spiderlings.SpellVisuals.burst(event);
    event.radius = 0;
    assert.equal(r.draw().length, 1);
    assert.equal(r.fills.length, 21);
    r.events.afterLoadGame();
    r.c.KinkyDungeonVisionGet = () => 0;
    r.c.Spiderlings.SpellVisuals.burst({ x: 4, y: 4, radius: 1 });
    r.c.KinkyDungeonVisionGet = () => 1;
    assert.equal(r.draw().length, 0);
    assert.equal(r.fills.length, 0);
});

test("stationary warnings reuse geometry while their camera and fog projection remain live", () => {
    const r = fixture();
    r.state({
        fields: [{ x: 2, y: 2, ownerId: 1, activateAt: 3, endAt: 6 }],
        collapses: [{ x: 8, y: 8, ownerId: 2, startAt: 0, explodeAt: 3 }],
    });
    r.draw();
    const setsAfterWarmup = r.geometryAllocations.sets;
    const initialX = r.draws[0][4];
    for (let frame = 0; frame < 20; frame++) r.draw();
    assert.equal(r.geometryAllocations.sets, setsAfterWarmup, "Warm static footprints must not rebuild edge sets");
    r.draw({ CamX: 1 });
    assert.equal(r.draws[0][4], initialX - 72);
    r.c.KinkyDungeonVisionGet = () => 0;
    r.draw();
    assert.equal(r.fills.length, 0);
    assert.equal(r.draws.length, 0);
});

test("area warnings and actor overlays own separate layers and both clear on reload", () => {
    const r = fixture();
    r.state({
        fields: [{ x: 2, y: 2, ownerId: 1, activateAt: 3, endAt: 6 }],
        marks: { player: { stacks: 1, expiresAt: 5 } },
    });
    r.draw();
    const layers = r.c.kdgameboard.children;
    assert.equal(layers.length, 2);
    assert.ok(layers[0].zIndex < layers[1].zIndex, "Actor silk must stay above the area fill");
    r.events.afterLoadGame();
    assert.equal(r.c.kdgameboard.children.length, 0);
});

test("Mage warning keeps all dangerous cells while silk moves inward, without numeric labels", () => {
    const r = fixture();
    const state = r.state({ collapses: [{ x: 4, y: 4, ownerId: 1, startAt: 0, explodeAt: 3 }] });
    r.draw();
    assert.equal(r.labels.length, 0);
    const danger = () => r.draws.filter((d) => d[2].includes("danger_"));
    assert.equal(danger().length, 21);
    const positions = danger().map((d) => d.slice(4, 6));
    const silk = () => r.lines.filter((_line, i) => r.lineStyles[i]?.width === 1.4);
    const outer = silk().map((line) => Math.hypot(line[0] - 324, line[1] - 324));
    r.time(600);
    r.draw();
    assert.deepEqual(
        danger().map((d) => d.slice(4, 6)),
        positions,
    );
    assert.ok(silk().every((d, i) => Math.hypot(d[0] - 324, d[1] - 324) < outer[i]));
    assert.equal(state.clock, 0);
    assert.equal(r.labels.length, 0);
});

test("persistent warnings restore from saved phase without numeric labels and keep purple/pink ground distinct", () => {
    const r = fixture();
    r.state({ clock: 1, collapses: [{ x: 4, y: 4, ownerId: 1, startAt: 0, explodeAt: 3 }] });
    r.draw();
    const positions = r.draws.filter((d) => d[2].includes("danger_")).map((d) => d.slice(4, 6));
    const saved = JSON.stringify(r.c.KDMapData);
    r.c.KDMapData = JSON.parse(saved);
    r.events.afterLoadGame();
    r.draw();
    assert.deepEqual(
        r.draws.filter((d) => d[2].includes("danger_")).map((d) => d.slice(4, 6)),
        positions,
    );
    assert.equal(r.labels.length, 0);
    assert.equal(JSON.stringify(r.c.KDMapData), saved);
    r.state({ clock: 3, fields: [{ x: 2, y: 2, ownerId: 1, activateAt: 3, endAt: 6 }] });
    r.draw();
    const normal = r.fills[0].color;
    r.pink(true);
    r.draw();
    assert.notEqual(r.fills[0].color, normal);
    assert.ok(r.c.kdgameboard.children.some((g) => g.zIndex < 0));
    r.c.KinkyDungeonVisionGet = () => 0;
    r.draw();
    assert.equal(r.fills.length, 0);
    assert.equal(r.draws.length, 0);
});

test("Mage inward-gathering cast descriptions agree in English fallback and all locale files", () => {
    const root = path.join(__dirname, "../..");
    const runtime = fs.readFileSync(path.join(root, "Spiderlings.js"), "utf8");
    const english = [
        "The Spiderling Mage draws silk inward across marked ground. Each actual turn inside the active sigil adds one mark (up to three) and refreshes it; overlapping sigils grant no extra layer that turn.",
        "Silk gathers from the marked outer tiles toward the center before bursting.",
    ];
    for (const value of english) assert.ok(runtime.includes(value));
    for (const locale of ["CN", "DE", "ES", "JP", "KR", "PL", "RU"]) {
        const csv = fs.readFileSync(path.join(root, `Spiderlings${locale}.csv`), "utf8");
        if (locale === "CN") {
            assert.ok(csv.includes("由外向内"));
            assert.ok(csv.includes("准备爆发"));
        } else {
            assert.ok(csv.includes(english[1]), `${locale}: inward Collapse text`);
            const hexLine = csv
                .split(/\r?\n/)
                .find((line) => line.startsWith("KinkyDungeonSpellCastSpiderlingsMageHex,"));
            assert.ok(hexLine && hexLine.length > 80, `${locale}: localized Hex per-turn text`);
        }
    }
});

test("warning backing stays faint while every native dangerous-cell marker remains visible", () => {
    const r = fixture();
    r.state({ collapses: [{ x: 4, y: 4, startAt: 0, explodeAt: 3, ownerId: 1 }] });
    r.draw();
    const backing = r.draws.filter((d) => d[3].endsWith("WarningBacking.png"));
    assert.equal(backing.length, 21);
    assert.ok(backing.every((d) => d[9].alpha <= 0.04));
    assert.equal(r.draws.filter((d) => d[3].endsWith("WarningColorSpell.png") && d[9].alpha >= 0.48).length, 21);
});

test("gathering uses bounded thin strands whose heads move inward, not repeated web decals", () => {
    const r = fixture();
    const state = r.state({ collapses: [{ x: 4, y: 4, startAt: 0, explodeAt: 3, ownerId: 1 }] });
    const heads = () => r.lines.filter((_line, i) => r.lineStyles[i]?.width === 1.4);
    r.draw();
    assert.equal(r.draws.filter((d) => /WebSprayTrail/.test(d[3])).length, 0);
    assert.equal(heads().length, 24);
    const mean = () => heads().reduce((sum, line) => sum + Math.hypot(line[0] - 324, line[1] - 324), 0) / 24;
    const outer = mean();
    state.clock = 2;
    r.time(1800);
    r.draw();
    assert.ok(mean() < outer);
    assert.equal(r.draws.filter((d) => d[2].includes("danger_")).length, 21);
    assert.equal(r.labels.length, 0);
});

test("resolved burst owns a bounded bright feedback layer and clears without replay", () => {
    const r = fixture();
    r.c.Spiderlings.SpellVisuals.burst({ x: 4, y: 4, radius: 1 });
    r.draw();
    const feedback = r.c.kdgameboard.children.find((g) => g.name === "SpiderlingsSpellVisuals_feedback");
    assert.ok(feedback);
    assert.equal(feedback.zIndex, 2.6);
    assert.ok(r.dots.some((dot) => dot[2] <= 72 * 0.12));
    assert.equal(r.draws.filter((d) => d[2].includes("burst_") && d[9].zIndex === 2.6).length, 1);
    r.time(521);
    r.draw();
    assert.equal(r.draws.length, 0);
    assert.equal(r.dots.length, 0);
    r.events.afterLoadGame();
    assert.equal(r.draw().length, 0);
});

test("Hex warning and active center pixels are clipped to their visible quarter", () => {
    const r = fixture();
    r.c.KinkyDungeonVisionGet = (x, y) => (x === 4 && y === 4 ? 1 : 0);
    const state = r.state({ fields: [{ x: 2, y: 2, ownerId: 7, activateAt: 3, endAt: 6 }] });
    for (const clock of [0, 3]) {
        state.clock = clock;
        r.draw();
        const core = r.c.kdpixisprites.get("SpiderlingsSpellVisuals_hex_7");
        assert.ok(core?.mask, "A cross-cell center needs pixel clipping");
        assert.equal(core.mask.rectangles.length, 1);
        const rect = core.mask.rectangles[0];
        assert.ok(rect.x >= 288 && rect.y >= 288);
        assert.ok(rect.x + rect.width <= 360 && rect.y + rect.height <= 360);
        assert.ok(rect.width > 0 && rect.height > 0);
    }
    r.c.KinkyDungeonVisionGet = () => 1;
    r.draw();
    assert.equal(r.c.kdpixisprites.get("SpiderlingsSpellVisuals_hex_7").mask, null);
    r.events.afterLoadGame();
    assert.equal(r.c.kdgameboard.children.length, 0);
});

test("eight entirely hidden Collapse warnings early-return before creating graphics", () => {
    const r = fixture();
    let calls = 0;
    r.c.KinkyDungeonVisionGet = () => {
        calls++;
        return 0;
    };
    r.state({
        collapses: Array.from({ length: 8 }, (_, i) => ({
            x: 50 + i * 5,
            y: 50,
            ownerId: i + 1,
            startAt: 0,
            explodeAt: 3,
        })),
    });
    r.draw();
    assert.equal(calls, 168);
    assert.equal(r.draws.length, 0);
    assert.equal(r.lines.length, 0);
    assert.equal(r.c.kdgameboard.children.length, 0);
});

test("the same visible filament set moves inward as wall time advances", () => {
    const r = fixture();
    r.state({ collapses: [{ x: 4, y: 4, ownerId: 1, startAt: 0, explodeAt: 3 }] });
    r.draw();
    r.time(300);
    r.draw();
    const strands = () => r.lines.filter((_line, i) => r.lineStyles[i]?.width === 1.4);
    const before = strands().map((line) => Math.hypot(line[0] - 324, line[1] - 324));
    r.time(600);
    r.draw();
    assert.equal(before.length, 24);
    assert.equal(strands().length, 24);
    assert.ok(strands().every((line, i) => Math.hypot(line[0] - 324, line[1] - 324) < before[i]));
});
