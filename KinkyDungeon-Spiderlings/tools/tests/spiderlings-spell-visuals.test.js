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
            return { args };
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

test("Hex shows its full area and saved-turn countdown, then changes color and shape on activation", () => {
    const r = fixture();
    const state = r.state({ fields: [{ x: 2, y: 2, ownerId: 1, activateAt: 3, endAt: 6 }] });
    assert.equal(r.draw().length, 1);
    assert.equal(r.lines.length, 16 * 6, "four-cell sides show dashed edges, with no interior grid");
    assert.deepEqual(r.draws[0].slice(4, 6), [288, 288]);
    assert.equal(r.fills.length, 16);
    assert.equal(r.labels[0][1], "3");
    const warningColor = r.fills[0].color;
    const warningArt = r.draws[0][3];
    r.time(5000);
    r.draw();
    assert.equal(r.labels[0][1], "3", "render time cannot spend a spell turn");
    state.clock = 2;
    r.draw();
    assert.equal(r.labels[0][1], "1");
    state.clock = 3;
    r.draw();
    assert.equal(r.lines.length, 16);
    assert.equal(r.draws.length, 1);
    assert.equal(r.labels[0][1], "3");
    assert.notEqual(r.fills[0].color, warningColor);
    assert.notEqual(r.draws[0][3], warningArt);
    assert.ok(r.fills.every((cell) => cell.alpha > 0 && cell.alpha < 0.2));
    state.clock = 5;
    r.draw();
    assert.equal(r.labels[0][1], "1");
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

test("Collapse keeps its cut-corner area, highlights stronger inner cells and counts down while charging", () => {
    const r = fixture();
    const state = r.state({ collapses: [{ x: 4, y: 4, startAt: 0, explodeAt: 3, ownerId: 1 }] });
    r.draw();
    const boundary = JSON.stringify(r.lines);
    const cells = new Set(r.fills.map((fill) => `${fill.x / 72},${fill.y / 72}`));
    assert.equal(cells.size, 21);
    for (const corner of ["2,2", "2,6", "6,2", "6,6"]) assert.equal(cells.has(corner), false);
    const opacity = (x, y) =>
        r.fills.filter((fill) => fill.x === x * 72 && fill.y === y * 72).reduce((sum, fill) => sum + fill.alpha, 0);
    assert.ok(opacity(4, 4) > opacity(3, 3));
    assert.ok(opacity(3, 3) > opacity(4, 2));
    const initialCenter = opacity(4, 4);
    assert.equal(r.labels[0][1], "3");
    assert.equal(r.draws.filter((d) => d[3].endsWith("WebSprayTrail.png")).length, 8);
    for (const clock of [1, 2]) {
        state.clock = clock;
        r.time(clock * 810);
        r.pink(true);
        r.draw();
        assert.equal(JSON.stringify(r.lines), boundary);
        assert.equal(r.labels[0][1], String(3 - clock));
        assert.ok(opacity(4, 4) > initialCenter);
        assert.equal(r.draws.filter((d) => d[3].endsWith("WebSprayTrailPink.png")).length, 8);
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
        assert.equal(r.lines.length, (stacks * 2 - 1) * 4 * 6);
        assert.equal(r.draws.length, 1);
        assert.equal(r.fills.length, (stacks * 2 - 1) ** 2);
        assert.equal(r.labels[0][1], "2");
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
    assert.equal(r.lines.length, 20);
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
    for (let tick = 0; tick < 4; tick++) r.events.tickAfter(null, { delta: 1 });
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
    for (let tick = 0; tick < 3; tick++) r.events.tickAfter(null, { delta: 1 });
    assert.equal(r.draw().length, 1);
    r.time(260);
    assert.equal(r.draw()[0][9].alpha, 0.5);
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
