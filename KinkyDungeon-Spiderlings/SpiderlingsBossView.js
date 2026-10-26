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
            ["Buffs/" + RESONANCE_ICON, "Bullets/SpiderlingsMageRuneIcon.png"],
        ]) {
            const target = KinkyDungeonRootDirectory + source;
            if (KDModFiles[target]) KDModFiles[KinkyDungeonRootDirectory + name + ".png"] = KDModFiles[target];
        }
    const text = {
        NameSpiderlingsMatriarch: "Nestweaver Matriarch",
        NameSpiderlingsMatriarchPart: "Nestweaver Matriarch",
        NameSpiderlingsMatriarchRune: "Tracking silk rune",
        KDRoomType_SpiderlingsSilkboundCourt: "Silkbound Court",
        KDSideRoom_SpiderlingsSilkboundCourt: "Silkbound Court",
        KDEscapeMethodDesc_SpiderlingsSilkboundCourt: "Defeat the Matriarch twice to reopen the path to the prison.",
        SpiderlingsCourtEntranceFound:
            "A woven passage opens east of the main nest. It leads to the Matriarch's court.",
        SpiderlingsCourtLocked: "The Matriarch seals the passage. Defeat her to return to the prison.",
        SpiderlingsCourtVictory: "The Matriarch falls. The southern passage leads back to the prison.",
        SpiderlingsBossInterlude:
            "The Matriarch regenerates. Destroy the four marked nests to end her invulnerability.",
        SpiderlingsBossSkill_fan: "A silk fan locks its direction: TURNS world turns.",
        SpiderlingsBossSkill_ring: "A silk ring closes in: TURNS world turns.",
        SpiderlingsBossSkill_track: "Falling silk marks your old position: TURNS world turns.",
        SpiderlingsBossSkill_melee: "Silk gathers around the Matriarch's feet: TURNS world turns.",
        SpiderlingsBossCaptureWarning: "A tracking silk rune is forming. Destroy it before it reaches you.",
        SpiderlingsBossContestStart:
            "A silk tether draws you toward the Matriarch. Pull free before the binding bar fills.",
        SpiderlingsBossEscapeWindow:
            "The wrapping ends. You have 24 world turns to escape before an escort is dispatched.",
        SpiderlingsBossPhase_one: "Matriarch · phase one",
        SpiderlingsBossPhase_interlude: "Regeneration · NESTS / 4 nests remain",
        SpiderlingsBossPhase_two: "Matriarch · phase two",
        SpiderlingsBossPhase_victory: "Passage to the prison open",
        SpiderlingsBossLayer: "Spellwoven Cocoon · layer LAYER / 20",
        SpiderlingsBossEscapeTime: "Escape window: TURNS world turns",
        SpiderlingsBossEscort: "An escort is preparing. You can still escape before arrival.",
        SpiderlingsBossResonance: "Weave resonance",
        SpiderlingsBossResonanceDesc:
            "The Matriarch is maintaining silk density in the arena, preventing its natural decay.",
    };
    for (const [key, value] of Object.entries(text)) addTextKey(key, value);
    let drawing;
    let resonancePulse;
    function clear() {
        if (drawing) drawing.clear();
    }
    function reset() {
        clear();
        resonancePulse = undefined;
    }
    KDAddEvent(KDEventMapGeneric, "spiderlingsBossResonance", RESONANCE, (_event, data) => {
        resonancePulse = { map: KDMapData, bossId: data.enemy.id, started: CommonTime() };
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
        if (cocoon)
            DrawTextKD(
                TextGet("SpiderlingsBossLayer").replace("LAYER", api.SpellwovenCocoon.layers(cocoon)),
                1100,
                148,
                "#ecdafa",
                "#111111",
                20,
            );
        const saved = api.BossEncounter.state();
        if (!saved) {
            resonancePulse = undefined;
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
        for (const warning of saved.warnings) {
            drawing.lineStyle(1.5, 0xf0c477, 0.8).beginFill(0xe8ad55, 0.13);
            for (const cell of warning.cells)
                if (KinkyDungeonVisionGet(cell.x, cell.y) > 0) {
                    const [x, y] = point(cell);
                    drawing.drawRect(x + 2, y + 2, size - 4, size - 4);
                }
            drawing.endFill();
        }
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
        const label = TextGet("SpiderlingsBossPhase_" + saved.phase).replace(
            "NESTS",
            saved.nests.filter((goal) => !goal.destroyed).length,
        );
        DrawTextKD(label, 1100, 90, "#ecdafa", "#111111", 24);
        if (boss && saved.phase !== "victory")
            DrawTextKD(`${Math.ceil(boss.hp)} / ${boss.Enemy.maxhp}`, 1100, 118, "#ffffff", "#111111", 20);
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
        if (capture?.phase === "escape")
            DrawTextKD(
                TextGet("SpiderlingsBossEscapeTime").replace(
                    "TURNS",
                    Math.max(0, Math.ceil(capture.deadline - saved.clock)),
                ),
                1100,
                180,
                "#f2d398",
                "#111111",
                22,
            );
        if (capture?.phase === "escort")
            DrawTextKD(TextGet("SpiderlingsBossEscort"), 1100, 180, "#f2d398", "#111111", 20);
    });
    KDAddEvent(KDEventMapGeneric, "postMapgen", "SpiderlingsBossView", () => {
        clear();
        // Encounter initialization can emit the entry pulse earlier in this same event.
        if (resonancePulse?.map !== KDMapData) resonancePulse = undefined;
    });
    for (const trigger of ["afterLoadGame", "afterNewGame"])
        KDAddEvent(KDEventMapGeneric, trigger, "SpiderlingsBossView", reset);
})();
