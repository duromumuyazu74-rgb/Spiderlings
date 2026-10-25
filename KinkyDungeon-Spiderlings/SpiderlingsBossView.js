"use strict";

(() => {
    const api = globalThis.Spiderlings;
    // The native journal and status UI also request enemy-name artwork without
    // passing through KDDrawEnemySprite. All aliases reuse delivered PNGs.
    if (typeof KDModFiles !== "undefined")
        for (const [name, source] of [
            ["SpiderlingsMatriarch", "Enemies/Spinner.png"],
            ["SpiderlingsMatriarchPart", "Enemies/Spinner.png"],
            ["SpiderlingsMatriarchRune", "Bullets/SpiderlingsMageRuneIcon.png"],
        ]) {
            const target = KinkyDungeonRootDirectory + source;
            if (KDModFiles[target])
                KDModFiles[KinkyDungeonRootDirectory + "Enemies/" + name + ".png"] = KDModFiles[target];
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
    };
    for (const [key, value] of Object.entries(text)) addTextKey(key, value);
    let drawing;
    function clear() {
        if (drawing) drawing.clear();
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
        if (!saved) return;
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
    for (const trigger of ["postMapgen", "afterLoadGame", "afterNewGame"])
        KDAddEvent(KDEventMapGeneric, trigger, "SpiderlingsBossView", clear);
})();
