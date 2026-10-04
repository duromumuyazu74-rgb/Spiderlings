"use strict";
/* global DrawCharacter: writable */

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsSpellVisuals";
    const PURPLE = 0xc9a0e0;
    const WARNING = 0xf2c66f;
    const DURATION = 240;
    const BURST_DURATION = 520;
    const LAYERS = Object.freeze({ ground: -0.05, area: 2.4, actor: 2.5, feedback: 2.6 });
    let charging = new WeakMap();
    const MAX_SHAPES = 64;
    const shapes = new Map();
    let shapeEdges = new WeakMap();
    const impacts = new Map();
    const bursts = new Map();
    let seenBursts = new WeakSet();
    let burstSerial = 0;
    const dashes = [];
    const bulletFrames = new Map();
    let built = new WeakMap();
    let map;
    const drawings = new Map();
    let frame;
    let visionCache;
    const masks = new Map();
    const cocoons = new Map();
    const cocoonTextures = new Map();
    let npcCharacters = new WeakMap();
    const now = () => (typeof CommonTime === "function" ? CommonTime() : Date.now());
    const pink = () => (api.getSetting?.("spiderlingsPinkWebbing") === true ? "Pink" : "");

    function reset() {
        for (const view of cocoons.values()) disposeCocoon(view);
        cocoons.clear();
        npcCharacters = new WeakMap();
        for (const mask of masks.values()) disposeMask(mask);
        masks.clear();
        visionCache = undefined;
        impacts.clear();
        bursts.clear();
        seenBursts = new WeakSet();
        charging = new WeakMap();
        burstSerial = 0;
        dashes.length = 0;
        bulletFrames.clear();
        built = new WeakMap();
        for (const drawing of drawings.values()) {
            drawing.parent?.removeChild(drawing);
            drawing.destroy();
        }
        drawings.clear();
        shapes.clear();
        shapeEdges = new WeakMap();
        map = KDMapData;
    }

    function currentMap() {
        if (map !== KDMapData) reset();
    }

    function visible(x, y, target) {
        if (target?.Enemy && typeof KDCanSeeEnemy === "function" && !KDCanSeeEnemy(target)) return false;
        if (typeof KinkyDungeonVisionGet !== "function") return true;
        const xx = Math.round(x),
            yy = Math.round(y),
            key = `${xx},${yy}`;
        if (visionCache?.has(key)) return visionCache.get(key);
        const result = KinkyDungeonVisionGet(xx, yy) > 0;
        visionCache?.set(key, result);
        return result;
    }

    function disposeMask(mask) {
        if (mask.sprite?.mask === mask.drawing) mask.sprite.mask = null;
        mask.drawing.parent?.removeChild(mask.drawing);
        mask.drawing.destroy();
    }

    function visibleSpriteRectangles(x, y, scale) {
        const half = scale / 2,
            rects = [];
        let full = true;
        for (let yy = Math.floor(y - half + 0.5); yy <= Math.floor(y + half + 0.5); yy++) {
            for (let xx = Math.floor(x - half + 0.5); xx <= Math.floor(x + half + 0.5); xx++) {
                const left = Math.max(x - half, xx - 0.5),
                    top = Math.max(y - half, yy - 0.5);
                const right = Math.min(x + half, xx + 0.5),
                    bottom = Math.min(y + half, yy + 0.5);
                if (right <= left || bottom <= top) continue;
                if (visible(xx, yy)) rects.push({ left, top, right, bottom });
                else full = false;
            }
        }
        return { rects, full };
    }

    function clipSprite(id, rendered, bounds) {
        if (!rendered) return;
        if (bounds.full) {
            rendered.mask = null;
            return;
        }
        let mask = masks.get(id);
        if (!mask) {
            const drawing = new PIXI.Graphics();
            drawing.name = `${KEY}_mask_${id}`;
            kdgameboard.addChild(drawing);
            mask = { drawing };
            masks.set(id, mask);
        }
        mask.used = true;
        mask.sprite = rendered;
        mask.drawing.clear().beginFill(0xffffff, 1);
        for (const rect of bounds.rects) {
            const point = xy(rect.left, rect.top);
            mask.drawing.drawRect(
                point[0],
                point[1],
                (rect.right - rect.left) * KinkyDungeonGridSizeDisplay,
                (rect.bottom - rect.top) * KinkyDungeonGridSizeDisplay,
            );
        }
        mask.drawing.endFill();
        rendered.mask = mask.drawing;
    }

    function xy(x, y) {
        const pans = typeof StandalonePatched !== "undefined" && StandalonePatched;
        return [
            (x - frame.CamX - (pans ? 0 : frame.CamX_offset || 0) + 0.5) * KinkyDungeonGridSizeDisplay,
            (y - frame.CamY - (pans ? 0 : frame.CamY_offset || 0) + 0.5) * KinkyDungeonGridSizeDisplay,
        ];
    }

    function sprite(id, path, x, y, scale = 1, alpha = 1, rotation = 0, zIndex = -0.1, target, tint, clip = false) {
        if (alpha <= 0 || (!clip && !visible(target?.x ?? x, target?.y ?? y, target))) return;
        const bounds = clip ? visibleSpriteRectangles(x, y, scale) : undefined;
        if (bounds && !bounds.rects.length) return;
        const [left, top] = xy(x, y);
        const result = KDDraw(
            kdgameboard,
            kdpixisprites,
            `${KEY}_${id}`,
            KinkyDungeonRootDirectory + path,
            left,
            top,
            scale * KinkyDungeonGridSizeDisplay,
            scale * KinkyDungeonGridSizeDisplay,
            rotation,
            { alpha, zIndex, ...(tint === undefined ? {} : { tint }) },
            true,
            undefined,
            undefined,
            true,
        );
        if (bounds) clipSprite(id, kdpixisprites.get(`${KEY}_${id}`) || result, bounds);
        return result;
    }

    function graphics(layer = "area") {
        let drawing = drawings.get(layer);
        if (!drawing || drawing.destroyed) {
            drawing = new PIXI.Graphics();
            drawing.name = `${KEY}_${layer}`;
            drawing.zIndex = LAYERS[layer];
            kdgameboard.addChild(drawing);
            drawings.set(layer, drawing);
        }
        return drawing;
    }

    function square(x, y, width, height = width, corners = true) {
        const key = `${x},${y}:${width}x${height}:${corners}`;
        let cells = shapes.get(key);
        if (cells) {
            shapes.delete(key);
            shapes.set(key, cells);
            return cells;
        }
        cells = [];
        for (let dy = 0; dy < height; dy++)
            for (let dx = 0; dx < width; dx++) {
                if (!corners && (dx === 0 || dx === width - 1) && (dy === 0 || dy === height - 1)) continue;
                cells.push(Object.freeze({ x: x + dx, y: y + dy }));
            }
        Object.freeze(cells);
        shapes.set(key, cells);
        if (shapes.size > MAX_SHAPES) shapes.delete(shapes.keys().next().value);
        return cells;
    }

    function boundaryEdges(cells) {
        const cached = shapeEdges.get(cells);
        if (cached) return cached;
        const keys = new Set(cells.map((cell) => `${cell.x},${cell.y}`));
        const sides = [
            [0, -1, -0.5, -0.5, 0.5, -0.5],
            [1, 0, 0.5, -0.5, 0.5, 0.5],
            [0, 1, 0.5, 0.5, -0.5, 0.5],
            [-1, 0, -0.5, 0.5, -0.5, -0.5],
        ];
        const edges = [];
        for (const cell of cells)
            for (const [dx, dy, ax, ay, bx, by] of sides)
                if (!keys.has(`${cell.x + dx},${cell.y + dy}`))
                    edges.push({ cell, ax: cell.x + ax, ay: cell.y + ay, bx: cell.x + bx, by: cell.y + by });
        shapeEdges.set(cells, edges);
        return edges;
    }

    function silkColor() {
        return pink() ? 0xefb7df : PURPLE;
    }

    function groundSilk(cells, alpha, center, wave) {
        const g = graphics("ground"),
            size = KinkyDungeonGridSizeDisplay;
        for (const cell of cells) {
            if (!visible(cell.x, cell.y)) continue;
            const distance = center ? Math.max(Math.abs(cell.x - center.x), Math.abs(cell.y - center.y)) : 0;
            const age = wave === undefined ? undefined : wave * BURST_DURATION - distance * 70;
            const opacity = age === undefined ? alpha : age < 0 ? 0 : alpha * Math.max(0, 1 - age / 380);
            const [x, y] = xy(cell.x, cell.y);
            // Small cell anchors keep the true footprint readable without a solid area panel.
            g.lineStyle(0)
                .beginFill(silkColor(), alpha * 0.12)
                .drawRect(x - size * 0.04, y - size * 0.04, size * 0.08, size * 0.08)
                .endFill();
            if (opacity <= 0) continue;
            g.lineStyle(1.25, silkColor(), opacity);
            for (let i = 0; i < 8; i++) {
                const angle = (i * Math.PI) / 4;
                g.moveTo(x, y);
                g.lineTo(x + Math.cos(angle) * size * 0.5, y + Math.sin(angle) * size * 0.5);
            }
            for (const radius of [0.17, 0.31]) {
                for (let i = 0; i <= 8; i++) {
                    const angle = (i * Math.PI) / 4,
                        wobble = 1 + 0.07 * Math.sin(cell.x * 3 + cell.y * 7 + i * 2);
                    const xx = x + Math.cos(angle) * radius * size * wobble,
                        yy = y + Math.sin(angle) * radius * size * wobble;
                    if (i === 0) g.moveTo(xx, yy);
                    else g.lineTo(xx, yy);
                }
            }
        }
    }

    function warning(cells, id, effect, clock, start, end, x, y, core, stage = 1) {
        if (!cells.some((cell) => visible(cell.x, cell.y))) return;
        outline(cells, false, WARNING, 0.12, 1);
        for (const cell of cells) {
            sprite(
                `backing_${id}_${cell.x}_${cell.y}`,
                "WarningBacking.png",
                cell.x,
                cell.y,
                1,
                0.035,
                0,
                -0.3,
                undefined,
                WARNING,
            );
            sprite(
                `danger_${id}_${cell.x}_${cell.y}`,
                "WarningColorSpell.png",
                cell.x,
                cell.y,
                1,
                0.48,
                0,
                2.22,
                undefined,
                WARNING,
            );
        }
        let phase = charging.get(effect);
        if (!phase || phase.clock !== clock) {
            phase = { clock, at: now() };
            charging.set(effect, phase);
        }
        const progress = Math.min(
            0.96,
            Math.max(0, (clock - start + Math.min(0.85, (now() - phase.at) / 900)) / Math.max(1, end - start)),
        );
        sprite(
            core,
            "Bullets/SpiderlingsMageRune.png",
            x,
            y,
            0.8 + progress * 0.3 + (stage - 1) * 0.1,
            Math.min(1, 0.55 + progress * 0.35 + (stage - 1) * 0.1),
            0,
            -0.02,
            undefined,
            silkColor(),
            true,
        );
        const g = graphics("ground");
        const reach = Math.max(...cells.map((cell) => Math.max(Math.abs(cell.x - x), Math.abs(cell.y - y))));
        // Thin staggered filaments are pulled inward, rather than translating eight web decals.
        const strands = 8 + (stage - 1) * 2;
        for (let i = 0; i < strands; i++) {
            const angle = (i * Math.PI * 2) / strands + (i % 2 ? 0.1 : -0.07);
            const pull = Math.min(1, Math.max(0, progress * 1.12 - (i % 3) * 0.055));
            const head = reach * (1 - pull),
                tail = Math.min(reach, head + 0.3 + (i % 3) * 0.08);
            for (let step = 0; step < 3; step++) {
                const a = head + ((tail - head) * step) / 3;
                const b = head + ((tail - head) * (step + 1)) / 3;
                const bendA = Math.sin((a / Math.max(0.1, reach)) * Math.PI) * 0.045 * (i % 2 ? 1 : -1);
                const bendB = Math.sin((b / Math.max(0.1, reach)) * Math.PI) * 0.045 * (i % 2 ? 1 : -1);
                const ax = x + Math.cos(angle + bendA) * a,
                    ay = y + Math.sin(angle + bendA) * a;
                const bx = x + Math.cos(angle + bendB) * b,
                    by = y + Math.sin(angle + bendB) * b;
                if (!visible(ax, ay) || !visible(bx, by)) continue;
                const pa = xy(ax, ay),
                    pb = xy(bx, by);
                g.lineStyle(
                    1.4 + (stage - 1) * 0.3,
                    pink() ? 0xffd9ec : 0xe9d5ff,
                    (0.7 - step * 0.14) * (0.65 + progress * 0.35),
                );
                g.moveTo(pa[0], pa[1]);
                g.lineTo(pb[0], pb[1]);
            }
        }
    }

    function outline(cells, dashed = false, color = silkColor(), alpha = 1, width = 2) {
        const g = graphics("ground");
        g.lineStyle(width, color, alpha * (dashed ? 0.8 : 0.95));
        for (const edge of boundaryEdges(cells)) {
            if (!visible(edge.cell.x, edge.cell.y)) continue;
            const a = xy(edge.ax, edge.ay),
                b = xy(edge.bx, edge.by);
            const count = dashed ? 6 : 1;
            for (let i = 0; i < count; i++) {
                const start = i / count,
                    end = (i + (dashed ? 0.55 : 1)) / count;
                g.moveTo(a[0] + (b[0] - a[0]) * start, a[1] + (b[1] - a[1]) * start);
                g.lineTo(a[0] + (b[0] - a[0]) * end, a[1] + (b[1] - a[1]) * end);
            }
        }
    }

    function hit(target, art = "web") {
        currentMap();
        if (!target || !visible(target.x, target.y, target)) return;
        impacts.set(`${target.player ? "player" : target.id}:${art}`, { target, art, start: now() });
    }

    function burst(effect) {
        currentMap();
        if (!effect || seenBursts.has(effect)) return;
        seenBursts.add(effect);
        const cells = square(
            effect.x - effect.radius,
            effect.y - effect.radius,
            effect.radius * 2 + 1,
            effect.radius * 2 + 1,
            effect.corners !== false,
        );
        // Feedback is delivered at resolution, not by polling a one-turn save record.
        // Hidden events and saved resolved records never replay on a later render or load.
        if (!cells.some((cell) => visible(cell.x, cell.y))) return;
        bursts.set(
            { x: effect.x, y: effect.y, radius: effect.radius, corners: effect.corners, serial: ++burstSerial },
            now(),
        );
    }

    function drawCollapse(collapse, clock, id) {
        warning(
            square(collapse.x - 2, collapse.y - 2, 5, 5, false),
            `collapse_${id}`,
            collapse,
            clock,
            collapse.startAt,
            collapse.explodeAt,
            collapse.x,
            collapse.y,
            `collapse_${id}`,
            collapse.stage || 1,
        );
    }

    function drawMage() {
        const state = KDMapData.SpiderlingsMageSpells;
        if (state) {
            for (const field of state.fields) {
                const pending = field.activateAt > state.clock;
                const cells = square(field.x, field.y, 4);
                if (!cells.some((cell) => visible(cell.x, cell.y))) continue;
                if (pending) {
                    warning(
                        cells,
                        `hex_${field.ownerId}`,
                        field,
                        state.clock,
                        field.activateAt - 3,
                        field.activateAt,
                        field.x + 1.5,
                        field.y + 1.5,
                        `hex_${field.ownerId}`,
                    );
                } else {
                    groundSilk(cells, 0.32 + Math.sin(now() / 600) * 0.04);
                    outline(cells, false, silkColor(), 0.2, 1);
                    sprite(
                        `hex_${field.ownerId}`,
                        "Bullets/SpiderlingsMageRuneHit.png",
                        field.x + 1.5,
                        field.y + 1.5,
                        0.8,
                        0.55,
                        0,
                        -0.02,
                        undefined,
                        silkColor(),
                        true,
                    );
                }
            }
            for (const collapse of state.collapses) drawCollapse(collapse, state.clock, collapse.ownerId);
            for (const blast of state.blasts)
                if (blast.detonateAt > state.clock) {
                    const radius = blast.stacks - 1;
                    const cells = square(blast.x - radius, blast.y - radius, radius * 2 + 1);
                    warning(
                        cells,
                        `mark_${blast.x}_${blast.y}`,
                        blast,
                        state.clock,
                        blast.detonateAt - 2,
                        blast.detonateAt,
                        blast.x,
                        blast.y,
                        `mark_blast_${blast.x}_${blast.y}`,
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
                    mark.stacks >= 3 ? 1 : 0.7,
                    0,
                    LAYERS.actor,
                    target,
                );
                if (mark.stacks >= 3) {
                    const glow = sprite(
                        `mark_glow_${key}`,
                        "Bullets/SpiderlingsMageRuneIcon.png",
                        visualX,
                        visualY - 0.55,
                        0.75,
                        0.4,
                        0,
                        LAYERS.actor + 0.001,
                        target,
                    );
                    if (glow) glow.blendMode = PIXI.BLEND_MODES.ADD;
                }
                const [x, y] = xy(visualX, visualY - 0.23);
                const g = graphics("actor");
                g.lineStyle(0).beginFill(PURPLE, 1);
                for (let i = 0; i < mark.stacks; i++) g.drawCircle(x + (i - (mark.stacks - 1) / 2) * 7, y, 2);
                g.endFill();
            }
        }
        for (const bullet of KDMapData.Bullets)
            if (bullet.time > 0 && bullet.SpiderlingsRunePhase === "triggered") {
                const cells = square(bullet.x - 1, bullet.y - 1, 3);
                const clock = 1 - (bullet.SpiderlingsRuneTurns ?? 1);
                warning(
                    cells,
                    `rune_${bullet.spriteID || `${bullet.x}_${bullet.y}`}`,
                    bullet,
                    clock,
                    0,
                    1,
                    bullet.x,
                    bullet.y,
                    `rune_core_${bullet.x}_${bullet.y}`,
                );
            }
        for (const [blast, started] of bursts) {
            const age = (now() - started) / BURST_DURATION;
            if (age >= 1) {
                bursts.delete(blast);
                continue;
            }
            const cells = square(
                blast.x - blast.radius,
                blast.y - blast.radius,
                blast.radius * 2 + 1,
                blast.radius * 2 + 1,
                blast.corners !== false,
            );
            groundSilk(cells, (1 - age) * 0.8, blast, age);
            if (visible(blast.x, blast.y)) {
                const [x, y] = xy(blast.x, blast.y),
                    g = graphics("feedback");
                let ringVisible = true;
                for (let dx = -1; dx <= 1; dx++)
                    for (let dy = -1; dy <= 1; dy++) if (!visible(blast.x + dx, blast.y + dy)) ringVisible = false;
                if (ringVisible)
                    g.lineStyle(3, pink() ? 0xffe2ee : 0xf4eaff, Math.max(0, 1 - age)).drawCircle(
                        x,
                        y,
                        KinkyDungeonGridSizeDisplay * Math.min(blast.radius + 0.45, 0.22 + age * 0.7),
                    );
                // A small luminous core and off-center streaks stay below native gameplay text.
                if (age < 0.3)
                    g.lineStyle(0)
                        .beginFill(0xfff8ff, (1 - age / 0.3) * 0.75)
                        .drawCircle(x, y, KinkyDungeonGridSizeDisplay * 0.12)
                        .endFill();
                for (let i = 0; i < 4; i++) {
                    const angle = Math.PI / 4 + (i * Math.PI) / 2;
                    const inner = KinkyDungeonGridSizeDisplay * Math.min(blast.radius + 0.45, 0.25 + age * 0.45);
                    const outer = Math.min(
                        KinkyDungeonGridSizeDisplay * (blast.radius + 0.45),
                        inner + KinkyDungeonGridSizeDisplay * 0.16 * (1 - age),
                    );
                    if (
                        !visible(
                            blast.x + (Math.cos(angle) * outer) / KinkyDungeonGridSizeDisplay,
                            blast.y + (Math.sin(angle) * outer) / KinkyDungeonGridSizeDisplay,
                        )
                    )
                        continue;
                    g.lineStyle(2.5, pink() ? 0xffc5e7 : 0xe0bdff, Math.max(0, 1 - age * 1.2));
                    g.moveTo(x + Math.cos(angle) * inner, y + Math.sin(angle) * inner);
                    g.lineTo(x + Math.cos(angle) * outer, y + Math.sin(angle) * outer);
                }
            }
            sprite(
                `burst_${blast.serial}`,
                "Bullets/SpiderlingsMageRuneHit.png",
                blast.x,
                blast.y,
                0.8 + age * 0.6,
                Math.min(1, (1 - age) * 1.3),
                0,
                LAYERS.feedback,
                undefined,
                pink() ? 0xffc9e8 : 0xead5ff,
                true,
            );
        }
    }

    function hasCocoon(target) {
        return (
            target?.hp > 0 &&
            !!(api.WeaponWebbing?.status(target)?.cocoon || api.NPCAdhesion?.hasSpiderHelplessness(target, false))
        );
    }

    function disposeCocoon(view) {
        if (!view.native.destroyed && view.native.mask === view.head) view.native.mask = view.previousMask;
        view.layer.parent?.removeChild(view.layer);
        view.layer.destroy({ children: true });
    }

    function syncTransform(to, from) {
        to.position.copyFrom(from.position);
        to.pivot.copyFrom(from.pivot);
        to.scale.copyFrom(from.scale);
        to.rotation = from.rotation;
    }

    function cocoonTexture(trimmed) {
        const path = `Models/SpiderlingsWebbingCocoon${pink()}/Cocoon.png`,
            source = KDTex(path);
        if (!source?.valid) return;
        if (!trimmed) return source;
        let entry = cocoonTextures.get(source);
        if (!entry) {
            // Atlas frames are already losslessly trimmed; direct PNGs use the
            // same authored alpha bounds. Neither path changes the shared art.
            const rect = source.trim ? source.frame : new PIXI.Rectangle(813, 620, 777, 2662);
            entry = new PIXI.Texture(source.baseTexture, rect);
            cocoonTextures.set(source, entry);
        }
        return entry;
    }

    function cocoonView(target, native, texture) {
        let view = cocoons.get(native);
        if (!view) {
            const layer = new PIXI.Container(),
                body = new PIXI.Container(),
                head = new PIXI.Graphics(),
                silk = new PIXI.Sprite(texture);
            layer.name = `${KEY}_cocoon_${target.id}`;
            silk.name = "SpiderlingsNPCCocoon";
            body.addChild(head, silk);
            layer.addChild(body);
            native.parent.addChild(layer);
            view = { target, native, layer, body, head, silk, previousMask: native.mask };
            cocoons.set(native, view);
        }
        view.silk.texture = texture;
        view.silk.tint = native.tint ?? 0xffffff;
        view.layer.visible = true;
        view.layer.alpha = native.alpha;
        view.layer.zIndex = native.zIndex + 0.001;
        // Preserve a foreign clipping mask on the combined appearance.
        view.layer.mask = view.previousMask;
        native.mask = view.head;
        return view;
    }

    function modelCocoon(target, container) {
        const texture = cocoonTexture(false),
            native = container?.Mesh;
        if (!texture || !native?.parent) return;
        const view = cocoonView(target, native, texture),
            scale = container.Zoom * MODEL_SCALE;
        view.container = container;
        syncTransform(view.layer, native);
        syncTransform(view.body, container.Container);
        view.silk.position.set(0, 0);
        view.silk.scale.set(scale);
        if (view.headScale !== scale) {
            // The authored neck begins at y=620. Native chibi head scaling
            // keeps its neck at this same anchor and expands above y=0;
            // sleeves and skirts below the neck stay out.
            view.head
                .clear()
                .beginFill(0xffffff)
                .drawRect(-2480 * scale, -3508 * scale, 7440 * scale, 4168 * scale)
                .endFill();
            view.headScale = scale;
        }
    }

    function spriteCocoon(target, native) {
        const texture = cocoonTexture(true);
        if (!texture || !native?.parent) return;
        const view = cocoonView(target, native, texture),
            width = native.texture.orig.width,
            height = native.texture.orig.height;
        syncTransform(view.layer, native);
        view.body.position.set(-native.anchor.x * width, -native.anchor.y * height);
        const bodyHeight = height * 0.72,
            bodyWidth = bodyHeight * (777 / 2662);
        view.silk.position.set((width - bodyWidth) / 2, height * 0.25);
        view.silk.width = bodyWidth;
        view.silk.height = bodyHeight;
        if (view.headWidth !== width || view.headHeight !== height) {
            view.head
                .clear()
                .beginFill(0xffffff)
                .drawRect(0, 0, width, height * 0.32)
                .endFill();
            view.headWidth = width;
            view.headHeight = height;
        }
    }

    function drawCocoons() {
        for (const [native, view] of cocoons) {
            if (
                native.destroyed ||
                !KDMapData.Entities.includes(view.target) ||
                !hasCocoon(view.target) ||
                !visible(view.target.x, view.target.y, view.target)
            ) {
                disposeCocoon(view);
                cocoons.delete(native);
            } else view.layer.visible = native.visible;
        }
    }

    if (typeof DrawCharacter === "function") {
        const nativeDrawCharacter = DrawCharacter;
        DrawCharacter = function (character, ...args) {
            currentMap();
            const result = nativeDrawCharacter.call(this, character, ...args);
            const id = KDNPCChar_ID.get(character);
            if (id === undefined) return result;
            let target = npcCharacters.get(character);
            if (!target || target.id !== id) {
                target = KDMapData.Entities.find((enemy) => enemy.id === id);
                if (target) npcCharacters.set(character, target);
            }
            if (hasCocoon(target) && visible(target.x, target.y, target)) {
                const mc = KDCurrentModels.get(character),
                    container =
                        cocoons.get(result)?.container ||
                        [...(mc?.Containers.values() || [])].find((entry) => entry.Mesh === result);
                modelCocoon(target, container);
            } else if (cocoons.has(result)) {
                disposeCocoon(cocoons.get(result));
                cocoons.delete(result);
            }
            return result;
        };
    }

    if (typeof KDDrawEnemySprite === "function") {
        const nativeDrawEnemy = KDDrawEnemySprite;
        KDDrawEnemySprite = function (board, target, ...args) {
            currentMap();
            const enclosed = hasCocoon(target) && visible(target.x, target.y, target);
            const weaponSilk = api.WeaponWebbing?.status(target),
                onlyWeaponSilk = weaponSilk?.amount > 0 && weaponSilk.amount >= (target.boundLevel || 0);
            const fixedSprite = kdpixisprites.get(`spr_${target.id}${args[6] || ""}`);
            if (!enclosed && cocoons.has(fixedSprite)) {
                disposeCocoon(cocoons.get(fixedSprite));
                cocoons.delete(fixedSprite);
            }
            // Fixed bound sprites can be folded sideways. Use the upright native
            // face for this appearance only, without changing combat or equipment.
            const actor =
                enclosed || onlyWeaponSilk ? { ...target, Enemy: { ...target.Enemy, bound: undefined } } : target;
            const result = nativeDrawEnemy.call(this, board, actor, ...args);
            if (enclosed) spriteCocoon(target, kdpixisprites.get(`spr_${target.id}${args[6] || ""}`));
            return result;
        };
    }

    function drawFrame(data) {
        frame = data;
        for (const drawing of drawings.values()) drawing.clear();
        drawMage();
        drawCocoons();
        const weapons = api.Weapons?.visualState();
        for (const collapse of weapons?.collapses || [])
            drawCollapse(collapse, weapons.clock, `weapon_${collapse.ownerId}`);
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
                    LAYERS.feedback,
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
    }

    KDAddEvent(KDEventMapGeneric, "draw", KEY, (_event, data) => {
        currentMap();
        if (!data || typeof KDDraw !== "function") return;
        visionCache = new Map();
        for (const mask of masks.values()) mask.used = false;
        try {
            drawFrame(data);
        } finally {
            visionCache = undefined;
            for (const [id, mask] of masks)
                if (!mask.used) {
                    disposeMask(mask);
                    masks.delete(id);
                }
        }
    });

    // Native projectile interpolation and collision remain in charge of position and lifetime.
    if (typeof KDDraw === "function") {
        const nativeDraw = KDDraw;
        KDDraw = function (...args) {
            const [board, sprites, id, path] = args;
            if (typeof kdbulletboard === "undefined" || board !== kdbulletboard) return nativeDraw.apply(this, args);
            const root = KinkyDungeonRootDirectory + "Bullets/";
            const name = typeof path === "string" && path.startsWith(root) ? path.slice(root.length) : "";
            // Native AoE appends Hit to this invisible launcher but does not
            // preserve noSprite. Both runtimes provide the same Rope family art.
            if (name === "WitchRopeBoltLaunchManyHit.png") {
                args[3] = root + "RopeBoltLaunchManyHit.png";
                return nativeDraw.apply(this, args);
            }
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
            if (impact) {
                args[3] = root + `SpiderWebHit${pink()}.png`;
                args[8] = 0;
                args[9].alpha = (args[9].alpha ?? 1) * Math.max(0, 1 - (now() - record.start) / DURATION);
            }
            if (bolt || spray) {
                if (bolt) {
                    args[6] *= 0.9;
                    args[7] *= 0.9;
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
                    ghost[3] = root + `WebSprayTrail${pink()}.png`;
                    if (bolt) {
                        ghost[7] *= 0.28;
                        ghost[8] = Math.atan2(point.y - previous.y, point.x - previous.x);
                    }
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
        burst,
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
