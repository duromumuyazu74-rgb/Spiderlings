"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsSpellVisuals";
    const PURPLE = 0xc9a0e0;
    const DURATION = 240;
    const impacts = new Map();
    const dashes = [];
    const bulletFrames = new Map();
    let built = new WeakMap();
    let map;
    let drawing;
    let frame;
    const now = () => (typeof CommonTime === "function" ? CommonTime() : Date.now());
    const pink = () => (api.getSetting?.("spiderlingsPinkWebbing") === true ? "Pink" : "");

    function reset() {
        impacts.clear();
        dashes.length = 0;
        bulletFrames.clear();
        built = new WeakMap();
        if (drawing) {
            drawing.parent?.removeChild(drawing);
            drawing.destroy();
            drawing = undefined;
        }
        map = KDMapData;
    }

    function currentMap() {
        if (map !== KDMapData) reset();
    }

    function visible(x, y, target) {
        return (
            (!target?.Enemy || typeof KDCanSeeEnemy !== "function" || KDCanSeeEnemy(target)) &&
            (typeof KinkyDungeonVisionGet !== "function" || KinkyDungeonVisionGet(Math.round(x), Math.round(y)) > 0)
        );
    }

    function xy(x, y) {
        const pans = typeof StandalonePatched !== "undefined" && StandalonePatched;
        return [
            (x - frame.CamX - (pans ? 0 : frame.CamX_offset || 0) + 0.5) * KinkyDungeonGridSizeDisplay,
            (y - frame.CamY - (pans ? 0 : frame.CamY_offset || 0) + 0.5) * KinkyDungeonGridSizeDisplay,
        ];
    }

    function sprite(id, path, x, y, scale = 1, alpha = 1, rotation = 0, zIndex = -0.1, target) {
        if (!visible(target?.x ?? x, target?.y ?? y, target) || alpha <= 0) return;
        const [left, top] = xy(x, y);
        return KDDraw(
            kdgameboard,
            kdpixisprites,
            `${KEY}_${id}`,
            KinkyDungeonRootDirectory + path,
            left,
            top,
            scale * KinkyDungeonGridSizeDisplay,
            scale * KinkyDungeonGridSizeDisplay,
            rotation,
            { alpha, zIndex },
            true,
            undefined,
            undefined,
            true,
        );
    }

    function graphics() {
        if (!drawing || drawing.destroyed) {
            drawing = new PIXI.Graphics();
            drawing.name = KEY;
            drawing.zIndex = 2.4;
            kdgameboard.addChild(drawing);
        }
        return drawing;
    }

    function square(x, y, width, height = width, corners = true) {
        const cells = [];
        for (let dy = 0; dy < height; dy++)
            for (let dx = 0; dx < width; dx++) {
                if (!corners && (dx === 0 || dx === width - 1) && (dy === 0 || dy === height - 1)) continue;
                cells.push({ x: x + dx, y: y + dy });
            }
        return cells;
    }

    function outline(cells, dashed = false) {
        const keys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
        const edges = [
            [0, -1, -0.5, -0.5, 0.5, -0.5],
            [1, 0, 0.5, -0.5, 0.5, 0.5],
            [0, 1, 0.5, 0.5, -0.5, 0.5],
            [-1, 0, -0.5, 0.5, -0.5, -0.5],
        ];
        const g = graphics();
        g.lineStyle(2, PURPLE, dashed ? 0.65 : 0.9);
        for (const cell of cells) {
            if (!visible(cell.x, cell.y)) continue;
            for (const [dx, dy, ax, ay, bx, by] of edges) {
                if (keys.has(`${cell.x + dx},${cell.y + dy}`)) continue;
                const a = xy(cell.x + ax, cell.y + ay),
                    b = xy(cell.x + bx, cell.y + by);
                const count = dashed ? 6 : 1;
                for (let i = 0; i < count; i++) {
                    const start = i / count,
                        end = (i + (dashed ? 0.55 : 1)) / count;
                    g.moveTo(a[0] + (b[0] - a[0]) * start, a[1] + (b[1] - a[1]) * start);
                    g.lineTo(a[0] + (b[0] - a[0]) * end, a[1] + (b[1] - a[1]) * end);
                }
            }
        }
    }

    function hit(target, art = "web") {
        currentMap();
        if (!target || !visible(target.x, target.y, target)) return;
        impacts.set(`${target.player ? "player" : target.id}:${art}`, { target, art, start: now() });
    }

    function drawCollapse(collapse, clock, id, speed = 1) {
        outline(square(collapse.x - 2, collapse.y - 2, 5, 5, false));
        const stage = Math.min(2, Math.max(0, (clock - collapse.startAt) * speed));
        // The step follows saved turns; only the small silk drift uses render time.
        const drift = (now() % 800) / 800;
        const radius = Math.max(0.15, 2 - stage * 0.65 - drift * 0.45);
        sprite(`collapse_${id}`, "Bullets/SpiderlingsMageRune.png", collapse.x, collapse.y, 1, 0.4 + stage * 0.25);
        for (let i = 0; i < 8; i++) {
            const angle = (i * Math.PI) / 4;
            sprite(
                `silk_${id}_${i}`,
                `Bullets/WebSprayTrail${pink()}.png`,
                collapse.x + Math.cos(angle) * radius,
                collapse.y + Math.sin(angle) * radius,
                0.7,
                0.35 + drift * 0.3,
                angle,
            );
        }
    }

    function drawMage() {
        const state = KDMapData.SpiderlingsMageSpells;
        if (state) {
            for (const field of state.fields) {
                outline(square(field.x, field.y, 4), field.activateAt > state.clock);
                sprite(
                    `hex_${field.ownerId}`,
                    "Bullets/SpiderlingsMageRune.png",
                    field.x + 1.5,
                    field.y + 1.5,
                    1,
                    field.activateAt > state.clock ? 0.45 : 0.8,
                );
            }
            for (const collapse of state.collapses) drawCollapse(collapse, state.clock, collapse.ownerId);
            for (const blast of state.blasts)
                if (blast.detonateAt > state.clock) {
                    const radius = blast.stacks - 1;
                    outline(square(blast.x - radius, blast.y - radius, radius * 2 + 1), true);
                    sprite(
                        `mark_blast_${blast.x}_${blast.y}`,
                        "Bullets/SpiderlingsMageRuneIcon.png",
                        blast.x,
                        blast.y,
                        0.8,
                        0.8,
                    );
                }
            for (const [key, mark] of Object.entries(state.marks)) {
                if (!(mark.stacks > 0) || mark.expiresAt < state.clock) continue;
                const target =
                    key === "player"
                        ? KinkyDungeonPlayerEntity
                        : KDMapData.Entities.find((enemy) => `npc:${enemy.id}` === key && enemy.hp > 0);
                if (!target || !visible(target.x, target.y, target)) continue;
                // Native actors interpolate between cells; visibility still belongs to the occupied cell.
                const visualX = target.visual_x ?? target.x,
                    visualY = target.visual_y ?? target.y;
                sprite(
                    `mark_${key}`,
                    "Bullets/SpiderlingsMageRuneIcon.png",
                    visualX,
                    visualY - 0.55,
                    0.75,
                    1,
                    0,
                    2.5,
                    target,
                );
                const [x, y] = xy(visualX, visualY - 0.23);
                const g = graphics();
                g.lineStyle(0).beginFill(PURPLE, 1);
                for (let i = 0; i < mark.stacks; i++) g.drawCircle(x + (i - (mark.stacks - 1) / 2) * 7, y, 2);
                g.endFill();
            }
        }
        for (const bullet of KDMapData.Bullets)
            if (bullet.time > 0 && bullet.SpiderlingsRunePhase === "triggered")
                outline(square(bullet.x - 1, bullet.y - 1, 3), true);
    }

    function drawWeaponWebbing() {
        for (const target of KDMapData.Entities) {
            if (!(target.hp > 0) || !visible(target.x, target.y, target)) continue;
            const web = api.WeaponWebbing?.status(target);
            if (!web) continue;
            const [x, y] = xy(target.visual_x ?? target.x, target.visual_y ?? target.y);
            const size = KinkyDungeonGridSizeDisplay;
            const g = graphics();
            const color = pink() ? 0xefb7df : 0xf4eef5;
            const bands = 2 + Math.floor(web.coverage * 6);
            // Bands occupy the actor's body; the head remains readable at every coverage.
            for (let band = 0; band < bands; band++) {
                const height = y + size * (0.31 - band * 0.065);
                const width = size * (0.18 + Math.sin(((band + 1) / (bands + 1)) * Math.PI) * 0.07);
                g.lineStyle(2 + web.coverage, 0x72586d, 0.65);
                for (let pass = 0; pass < 2; pass++) {
                    if (pass) g.lineStyle(1.1 + web.coverage, color, 0.9);
                    for (let step = 0; step <= 12; step++) {
                        const angle = (step / 12) * Math.PI * 2;
                        const xx = x + Math.cos(angle) * width;
                        const yy = height + Math.sin(angle) * size * 0.025;
                        if (!step) g.moveTo(xx, yy);
                        else g.lineTo(xx, yy);
                    }
                }
            }
        }
    }

    KDAddEvent(KDEventMapGeneric, "draw", KEY, (_event, data) => {
        currentMap();
        if (!data || typeof KDDraw !== "function") return;
        frame = data;
        drawing?.clear();
        drawMage();
        drawWeaponWebbing();
        const weapons = api.Weapons?.visualState();
        for (const collapse of weapons?.collapses || [])
            drawCollapse(collapse, weapons.clock, `weapon_${collapse.ownerId}`, 2);
        for (const [id, effect] of impacts) {
            const age = (now() - effect.start) / DURATION;
            if (age >= 1) {
                impacts.delete(id);
                continue;
            }
            const target = effect.target;
            if (visible(target.x, target.y, target))
                sprite(
                    `hit_${id}`,
                    effect.art === "mark" ? "Bullets/SpiderlingsMageRuneIcon.png" : `Bullets/SpiderWebHit${pink()}.png`,
                    target.visual_x ?? target.x,
                    target.visual_y ?? target.y,
                    0.9 + age * 0.1,
                    1 - age,
                    0,
                    2.6,
                    target,
                );
        }
        for (let i = dashes.length - 1; i >= 0; i--) {
            const dash = dashes[i],
                age = (now() - dash.start) / DURATION;
            if (age >= 1) {
                dashes.splice(i, 1);
                continue;
            }
            for (let n = 1; n <= 2; n++) {
                const t = n / 3;
                sprite(
                    `dash_${dash.id}_${n}`,
                    "Enemies/Jumper.png",
                    dash.x + (dash.to.x - dash.x) * t,
                    dash.y + (dash.to.y - dash.y) * t,
                    1,
                    (1 - age) * 0.22,
                    0,
                    0.1,
                );
            }
        }
        for (const [id, record] of bulletFrames) if (now() - record.last > 500) bulletFrames.delete(id);
    });

    // Native projectile interpolation and collision remain in charge of position and lifetime.
    if (typeof KDDraw === "function") {
        const nativeDraw = KDDraw;
        KDDraw = function (...args) {
            const [board, sprites, id, path] = args;
            if (typeof kdbulletboard === "undefined" || board !== kdbulletboard) return nativeDraw.apply(this, args);
            const root = KinkyDungeonRootDirectory + "Bullets/";
            const name = typeof path === "string" && path.startsWith(root) ? path.slice(root.length) : "";
            const bolt = name === "SpiderlingsMageBolt.png";
            const spray = name === "WebSpray.png" || name === "WebSprayPink.png";
            const trail = name === "WebSprayTrail.png" || name === "WebSprayTrailPink.png";
            const impact = name === "SpiderlingsMageBoltHit.png";
            if (!bolt && !spray && !trail && !impact) return nativeDraw.apply(this, args);
            currentMap();
            args[9] = { ...args[9] };
            if (trail) {
                // Lingering ground silk is a settled web, not a moving strand or a fading hit flash.
                args[3] = root + `SpiderWebHit${name.endsWith("Pink.png") ? "Pink" : ""}.png`;
                args[8] = 0;
                return nativeDraw.apply(this, args);
            }
            let record = bulletFrames.get(id);
            if (!record) {
                record = { start: now(), points: [] };
                bulletFrames.set(id, record);
            }
            record.last = now();
            if (impact) args[9].alpha = (args[9].alpha ?? 1) * Math.max(0, 1 - (now() - record.start) / DURATION);
            if (bolt || spray) {
                if (bolt) {
                    args[6] *= 0.55;
                    args[7] *= 0.55;
                    args[8] = 0;
                }
                const visual = typeof KinkyDungeonBulletsVisual !== "undefined" && KinkyDungeonBulletsVisual.get(id);
                const size = KinkyDungeonGridSizeDisplay;
                const point = visual
                    ? { x: visual.visual_x, y: visual.visual_y }
                    : { x: args[4] / size, y: args[5] / size };
                const offsetX = args[4] - point.x * size,
                    offsetY = args[5] - point.y * size;
                record.points = record.points.filter((previous) => now() - previous.time < DURATION);
                for (const [index, previous] of record.points.entries()) {
                    const ghost = [...args];
                    ghost[2] = `${id}_spider_trail_${index}`;
                    ghost[3] = bolt ? path : root + `WebSprayTrail${pink()}.png`;
                    ghost[4] = previous.x * size + offsetX;
                    ghost[5] = previous.y * size + offsetY;
                    ghost[9] = {
                        ...args[9],
                        alpha: (args[9].alpha ?? 1) * (index ? 0.28 : 0.14) * (1 - (now() - previous.time) / DURATION),
                    };
                    nativeDraw.apply(this, ghost);
                }
                const previous = record.position;
                if (!previous || Math.hypot(previous.x - point.x, previous.y - point.y) * size > 3) {
                    record.position = point;
                    record.points.push({ ...point, time: now() });
                    if (record.points.length > 2) record.points.shift();
                }
            }
            return nativeDraw.call(this, board, sprites, id, ...args.slice(3));
        };
    }

    for (const name of ["SpiderlingsWebbingEnemyBind", "SpiderlingsWebSprayHit"]) {
        const nativeEffect = typeof KDPlayerEffects !== "undefined" && KDPlayerEffects[name];
        if (typeof nativeEffect !== "function") continue;
        KDPlayerEffects[name] = function (target, _damage, effect) {
            const result = nativeEffect.apply(this, arguments);
            if (result?.effect && effect?.triggerSource !== "trail")
                hit(target?.player ? target : KinkyDungeonPlayerEntity);
            return result;
        };
    }

    KDAddEvent(KDEventMapGeneric, "beforeDamageEnemy", KEY, (_event, data) => {
        data.spiderlingsVisualSlimeBefore = data.enemy?.specialBoundLevel?.Slime || 0;
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", KEY, (_event, data) => {
        const source = data.attacker || data.incomingDamage?.spiderlingsSource;
        if (!["Spinner", "Jumper", "WebCaster", "MageSpiderlings"].includes(source?.Enemy?.name)) return;
        if (data.incomingDamage?.spiderlingsAttack === "trail") return;
        const bound = (data.enemy?.specialBoundLevel?.Slime || 0) > data.spiderlingsVisualSlimeBefore;
        if (
            source.Enemy.name === "MageSpiderlings" &&
            !bound &&
            !data.incomingDamage?.flags?.includes("SpiderlingsMageSpells")
        )
            return;
        if (data.dmgDealt > 0 || data.dmgShieldDealt > 0 || bound) hit(data.enemy);
    });

    for (const event of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterLoadGame"])
        KDAddEvent(KDEventMapGeneric, event, KEY, reset);

    api.SpellVisuals = Object.freeze({
        hit,
        dash(source, to) {
            currentMap();
            dashes.push({ id: source.id, x: source.x, y: source.y, to: { ...to }, start: now() });
        },
        built(enemy) {
            currentMap();
            built.set(enemy, now());
        },
        constructionFlash(enemy) {
            currentMap();
            const time = built.get(enemy);
            return time === undefined ? 0 : Math.max(0, 1 - (now() - time) / DURATION) * 0.55;
        },
    });
})();
