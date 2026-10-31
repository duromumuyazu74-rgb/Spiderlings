"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const RESONANCE = "SpiderlingsBossResonance";
    const RESONANCE_ICON = "buff/buffSpiderlingsBossResonance";
    // The native journal and status UI also request enemy-name artwork without
    // passing through KDDrawEnemySprite. All aliases reuse delivered PNGs.
    if (typeof KDModFiles !== "undefined")
        for (const [name, source] of [
            ["Enemies/SpiderlingsMatriarch", "Enemies/Spinner.png"],
            ["Enemies/SpiderlingsMatriarchPart", "Enemies/Spinner.png"],
            ["Enemies/SpiderlingsMatriarchRune", "Bullets/SpiderlingsMageRuneIcon.png"],
        ]) {
            const target = KinkyDungeonRootDirectory + source;
            if (KDModFiles[target]) KDModFiles[KinkyDungeonRootDirectory + name + ".png"] = KDModFiles[target];
        }
    const text = {
        NameSpiderlingsMatriarch: "Nestweaver Matriarch",
        NameSpiderlingsMatriarchPart: "Nestweaver Matriarch",
        NameSpiderlingsMatriarchRune: "Tracking silk rune",
        KinkyDungeonStatSpiderlingsBossStart: "Matriarch start",
        KinkyDungeonStatDescSpiderlingsBossStart: "Start in the Silkbound Court to face the Nestweaver Matriarch.",
        KDRoomType_SpiderlingsSilkboundCourt: "Silkbound Court",
        KDSideRoom_SpiderlingsSilkboundCourt: "Silkbound Court",
        KDEscapeMethodDesc_SpiderlingsSilkboundCourt: "Defeat the Matriarch twice to reopen the path to the prison.",
        SpiderlingsCourtEntranceFound:
            "A woven passage opens east of the main nest. It leads to the Matriarch's court.",
        SpiderlingsCourtLocked: "The Matriarch seals the passage. Defeat her to return to the prison.",
        SpiderlingsCourtVictory: "The Matriarch falls. The southern passage leads back to the prison.",
        SpiderlingsBossInterlude:
            "The Matriarch regenerates. Destroy the four marked nests to end her invulnerability.",
        SpiderlingsBossSkill_fan: "The silk fan is aimed.",
        SpiderlingsBossSkill_ring: "A silk ring forms around the Matriarch.",
        SpiderlingsBossSkill_track: "Falling silk has marked its target.",
        SpiderlingsBossSkill_melee: "Silk gathers at the Matriarch's feet.",
        SpiderlingsBossSkillName_fan: "Silk fan",
        SpiderlingsBossSkillName_ring: "Silk ring",
        SpiderlingsBossSkillName_track: "Falling silk",
        SpiderlingsBossSkillName_melee: "Silk grasp",
        SpiderlingsBossSkillName_barrage: "Silk barrage",
        SpiderlingsBossSkillName_capture: "Spellwoven Cocoon",
        SpiderlingsBossSkillName_support: "Four-corner web spray",
        SpiderlingsBossCastCountdown: "SKILL · TURNS world turns",
        SpiderlingsBossBarrageCountdown: "SKILL · in TURNS turns · COUNT volleys left",
        SpiderlingsBossRuneTracking: "Tracking silk rune approaching",
        SpiderlingsBossCaptureWarning: "A tracking silk rune is forming. You can destroy it.",
        SpiderlingsBossContestStart: "Silk draws you toward the Matriarch. Pull free to break the tether.",
        SpiderlingsBossEscapeWindow: "Escape within 24 world turns or an escort will be dispatched.",
        SpiderlingsBossPhase_one: "Matriarch · phase one",
        SpiderlingsBossPhase_interlude: "Regeneration · NESTS / 4 nests remain",
        SpiderlingsBossPhase_two: "Matriarch · phase two",
        SpiderlingsBossPhase_victory: "Passage to the prison open",
        SpiderlingsBossLayer: "Spellwoven Cocoon · layer LAYER / 20",
        SpiderlingsBossEscapeTime: "Escape window: TURNS world turns",
        SpiderlingsBossEscort: "An escort is being arranged. You can still escape.",
        SpiderlingsBossResonance: "Weave resonance",
        SpiderlingsBossResonanceDesc: "The Matriarch maintains silk density, pausing its natural decay.",
    };
    for (const [key, value] of Object.entries(text)) addTextKey(key, value);
    let drawing;
    let resonancePulse;
    let impacts = [];
    function clear() {
        if (drawing) drawing.clear();
    }
    function reset() {
        clear();
        resonancePulse = undefined;
        impacts = [];
    }
    KDAddEvent(KDEventMapGeneric, "spiderlingsBossResonance", RESONANCE, (_event, data) => {
        resonancePulse = { map: KDMapData, bossId: data.enemy.id, started: CommonTime() };
    });
    KDAddEvent(KDEventMapGeneric, "spiderlingsBossWarningResolved", "SpiderlingsBossView", (_event, data) => {
        impacts = impacts.filter((impact) => impact.map === KDMapData && CommonTime() - impact.started < 650);
        impacts.push({ map: KDMapData, started: CommonTime(), cells: data.cells });
    });
    KDAddEvent(KDEventMapGeneric, "drawBuffIcons", RESONANCE, (_event, data) => {
        if (!api.BossEncounter.resonanceSource()) return;
        data.stats[RESONANCE] = {
            text: TextGet(RESONANCE) + ": " + TextGet(RESONANCE + "Desc"),
            icon: RESONANCE_ICON,
            category: "buffs",
            color: "#c9a0e0",
            bgcolor: "#333333",
            priority: 40,
        };
    });
    function drawResonance(point, size) {
        const source = api.BossEncounter.resonanceSource();
        if (!source || resonancePulse?.map !== KDMapData || resonancePulse.bossId !== source.id) {
            resonancePulse = undefined;
            return;
        }
        const progress = (CommonTime() - resonancePulse.started) / 1000;
        if (progress < 0 || progress >= 1) {
            resonancePulse = undefined;
            return;
        }
        const alpha = 0.7 * Math.sin(Math.PI * progress);
        const scale = 1.1 + progress * 0.25;
        const tint = api.getSetting?.("spiderlingsPinkWebbing") === true ? 0xffc3e6 : 0xd6c4e8;
        for (const [entity, image, id] of [
            [source, "Aura", "boss"],
            [KinkyDungeonPlayerEntity, "Aura", "player"],
        ]) {
            if (entity !== KinkyDungeonPlayerEntity && !KDCanSeeEnemy(entity)) continue;
            const [x, y] = point({
                x: (entity.visual_x ?? entity.x) + (entity.offX || 0) + 0.5,
                y: (entity.visual_y ?? entity.y) + (entity.offY || 0) + 0.5,
            });
            const width = (entity.Enemy?.GFX?.spriteWidth || size) * (entity.scaleX || 1) * scale;
            const height = (entity.Enemy?.GFX?.spriteHeight || size) * (entity.scaleY || 1) * scale;
            KDDraw(
                kdgameboard,
                kdpixisprites,
                RESONANCE + ":" + id,
                KinkyDungeonRootDirectory + "Aura/" + image + ".png",
                x - width / 2,
                y - height / 2,
                width,
                height,
                0,
                { alpha, tint, zIndex: 2.6 },
            );
        }
    }
    function drawWarnings(saved, point, size) {
        impacts = impacts.filter((impact) => impact.map === KDMapData && CommonTime() - impact.started < 650);
        if (saved.phase === "victory") impacts = [];
        for (const impact of impacts) {
            const alpha = 0.55 * (1 - (CommonTime() - impact.started) / 650);
            drawing.lineStyle(0).beginFill(0xffe6bf, alpha);
            for (const cell of impact.cells)
                if (KinkyDungeonVisionGet(cell.x, cell.y) > 0) {
                    const [x, y] = point(cell);
                    drawing.drawRect(x + 1, y + 1, size - 2, size - 2);
                }
            drawing.endFill();
        }
        const cells = new Map();
        for (const warning of saved.warnings)
            for (const cell of warning.cells) {
                if (!(KinkyDungeonVisionGet(cell.x, cell.y) > 0)) continue;
                const key = `${cell.x},${cell.y}`,
                    remaining = Math.max(0, warning.at - saved.clock);
                if (!cells.has(key) || remaining < cells.get(key).remaining) cells.set(key, { ...cell, remaining });
            }
        for (const cell of cells.values()) {
            const urgent = cell.remaining <= 1,
                color = urgent ? 0xff7260 : 0xffbf60;
            const [x, y] = point(cell);
            drawing.lineStyle(0).beginFill(color, urgent ? 0.3 : 0.18);
            drawing.drawRect(x + 1, y + 1, size - 2, size - 2).endFill();
            drawing.lineStyle(3, color, 1);
            for (const [dx, dy, x1, y1, x2, y2] of [
                [0, -1, x, y, x + size, y],
                [1, 0, x + size, y, x + size, y + size],
                [0, 1, x, y + size, x + size, y + size],
                [-1, 0, x, y, x, y + size],
            ]) {
                const neighbor = cells.get(`${cell.x + dx},${cell.y + dy}`);
                if (!neighbor || neighbor.remaining <= 1 !== urgent) drawing.moveTo(x1, y1).lineTo(x2, y2);
            }
            if (cell.x === KinkyDungeonPlayerEntity.x && cell.y === KinkyDungeonPlayerEntity.y)
                drawing.lineStyle(3, 0xffffff, 0.9).drawRect(x + 5, y + 5, size - 10, size - 10);
        }
    }
    function drawPanel(saved, capture, boss, cocoon) {
        const remaining = (at) => Math.max(0, Math.ceil((at - saved.clock) * 100) / 100);
        const countdown = (kind, at) =>
            TextGet("SpiderlingsBossCastCountdown")
                .replace("SKILL", TextGet("SpiderlingsBossSkillName_" + kind))
                .replace("TURNS", remaining(at));
        const rows = [
            {
                text: TextGet("SpiderlingsBossPhase_" + saved.phase).replace(
                    "NESTS",
                    saved.nests.filter((goal) => !goal.destroyed).length,
                ),
                color: "#ecdafa",
            },
        ];
        if (boss && saved.phase !== "victory")
            rows.push({ text: `${Math.ceil(boss.hp)} / ${boss.Enemy.maxhp}`, color: "#ffffff" });
        if (cocoon)
            rows.push({
                text: TextGet("SpiderlingsBossLayer").replace("LAYER", api.SpellwovenCocoon.layers(cocoon)),
                color: "#ecdafa",
            });
        if (capture?.phase === "escape")
            rows.push({
                text: TextGet("SpiderlingsBossEscapeTime").replace("TURNS", remaining(capture.deadline)),
                color: "#f2d398",
            });
        if (capture?.phase === "escort") rows.push({ text: TextGet("SpiderlingsBossEscort"), color: "#f2d398" });
        const pending = saved.warnings.map((warning) => ({
            at: warning.at,
            text: countdown(warning.kind, warning.at),
        }));
        if (capture?.phase === "warning") pending.push({ at: capture.due, text: countdown("capture", capture.due) });
        if (capture?.phase === "rune") pending.push({ at: saved.clock, text: TextGet("SpiderlingsBossRuneTracking") });
        if (saved.barrages.length) {
            const at = Math.min(...saved.barrages.map((circle) => circle.nextAt));
            pending.push({
                at,
                text: TextGet("SpiderlingsBossBarrageCountdown")
                    .replace("SKILL", TextGet("SpiderlingsBossSkillName_barrage"))
                    .replace("TURNS", remaining(at))
                    .replace("COUNT", Math.max(...saved.barrages.map((circle) => circle.remaining))),
            });
        }
        if (!api.BossEncounter.paused()) {
            const support = KDMapData.Entities.filter(
                (enemy) =>
                    enemy.hp > 0 &&
                    enemy.Enemy.name === "WebCaster" &&
                    enemy.SpiderlingsBossSupport &&
                    !enemy.SpiderlingsBossSupport.fired &&
                    !KinkyDungeonIsDisabled(enemy) &&
                    !KDHelpless(enemy),
            );
            if (support.length) {
                const at = Math.min(...support.map((enemy) => enemy.SpiderlingsBossSupport.castAt));
                pending.push({ at, text: countdown("support", at) });
            }
        }
        const mageState = KDMapData.SpiderlingsMageSpells;
        const collapseTimes = new Set(
            (mageState?.collapses || [])
                .filter((charge) =>
                    KDMapData.Entities.some(
                        (enemy) => enemy.id === charge.ownerId && enemy.hp > 0 && enemy.SpiderlingsBossSupport,
                    ),
                )
                .map((charge) => charge.explodeAt),
        );
        for (const explodeAt of collapseTimes) {
            const turns = Math.max(0, explodeAt - mageState.clock);
            pending.push({
                at: saved.clock + turns,
                text: TextGet("SpiderlingsBossCastCountdown")
                    .replace("SKILL", TextGet("KinkyDungeonSpellSpiderlingsMageCollapse"))
                    .replace("TURNS", turns),
            });
        }
        for (const warning of pending.sort((a, b) => a.at - b.at))
            rows.push({ text: warning.text, color: remaining(warning.at) <= 1 ? "#ff9483" : "#ffd28b" });
        FillRectKD(kdcanvas, kdpixisprites, "SpiderlingsBossPanel", {
            Left: 1270,
            Top: 190,
            Width: 450,
            Height: rows.length * 26 + 18,
            Color: "#191722",
            alpha: 0.86,
            zIndex: 109,
        });
        rows.forEach((row, index) =>
            DrawTextFitKD(row.text, 1495, 210 + index * 26, 426, row.color, "#111111", index ? 20 : 22, "center", 110),
        );
    }
    if (typeof KDDrawEnemySprite === "function")
        KDDrawEnemySprite = api.Hooks.wrap(
            "BossView.rune",
            KDDrawEnemySprite,
            (native) =>
                function (board, enemy, tx, ty, cx, cy, _static, zIndex = 0, id = "", size = -1) {
                    if (enemy?.Enemy?.name !== api.BossCapture.RUNE) return native.apply(this, arguments);
                    if (size === -1) size = KinkyDungeonGridSizeDisplay;
                    KDDraw(
                        board,
                        kdpixisprites,
                        "spr_" + enemy.id + id,
                        KinkyDungeonRootDirectory + "Bullets/SpiderlingsMageRuneIcon.png",
                        (tx - cx) * size,
                        (ty - cy) * size,
                        size,
                        size,
                        0,
                        { zIndex },
                    );
                    return "";
                },
        );
    KDAddEvent(KDEventMapGeneric, "draw", "SpiderlingsBossView", (_event, frame) => {
        clear();
        if (!frame) return;
        const cocoon = api.SpellwovenCocoon.item();
        const saved = api.BossEncounter.state();
        if (!saved) {
            resonancePulse = undefined;
            impacts = [];
            if (cocoon)
                DrawTextKD(
                    TextGet("SpiderlingsBossLayer").replace("LAYER", api.SpellwovenCocoon.layers(cocoon)),
                    1100,
                    148,
                    "#ecdafa",
                    "#111111",
                    20,
                );
            return;
        }
        if (!drawing || drawing.destroyed || drawing.parent !== kdgameboard) {
            if (drawing && !drawing.destroyed) drawing.destroy();
            drawing = new PIXI.Graphics();
            drawing.zIndex = 2.3;
            kdgameboard.addChild(drawing);
        }
        const size = KinkyDungeonGridSizeDisplay;
        const pans = typeof StandalonePatched !== "undefined" && StandalonePatched;
        const point = (p) => [
            (p.x - frame.CamX - (pans ? 0 : frame.CamX_offset || 0)) * size,
            (p.y - frame.CamY - (pans ? 0 : frame.CamY_offset || 0)) * size,
        ];
        drawResonance(point, size);
        drawWarnings(saved, point, size);
        for (const circle of saved.barrages) {
            if (!(KinkyDungeonVisionGet(circle.x, circle.y) > 0)) continue;
            const [x, y] = point(circle);
            drawing.lineStyle(3, 0xc5a0ef, 0.85).drawCircle(x + size / 2, y + size / 2, size * 0.4);
        }
        const capture = api.BossCapture.state(),
            boss = api.BossEncounter.boss();
        if (capture && boss && api.BossCapture.controlling()) {
            const [px, py] = point(KinkyDungeonPlayerEntity),
                [bx, by] = point(boss);
            drawing
                .lineStyle(3, 0xf3dcff, 0.9)
                .moveTo(bx + size / 2, by + size / 2)
                .lineTo(px + size / 2, py + size / 2);
        }
        drawPanel(saved, capture, boss, cocoon);
        if (capture?.phase === "contest") {
            DrawTextKD(
                TextGet("SpiderlingsSpinnerWeave").replace("{value}", capture.binding).replace("{goal}", "100"),
                1000,
                660,
                "#ffffff",
                "#111111",
                22,
            );
            DrawTextKD(
                TextGet("SpiderlingsSpinnerEscape").replace("{value}", capture.escape).replace("{goal}", "75"),
                1000,
                700,
                "#b7e7d6",
                "#111111",
                22,
            );
            DrawButtonKDEx(
                "SpiderlingsBossPull",
                () => {
                    KDSendInput("spiderlingsBossPull", {});
                    return true;
                },
                true,
                750,
                735,
                500,
                50,
                TextGet("SpiderlingsSpinnerPull"),
                "#ffffff",
            );
        }
    });
    KDAddEvent(KDEventMapGeneric, "postMapgen", "SpiderlingsBossView", () => {
        clear();
        // Encounter initialization can emit the entry pulse earlier in this same event.
        if (resonancePulse?.map !== KDMapData) resonancePulse = undefined;
        impacts = [];
    });
    for (const trigger of ["afterLoadGame", "afterNewGame"])
        KDAddEvent(KDEventMapGeneric, trigger, "SpiderlingsBossView", reset);
})();
