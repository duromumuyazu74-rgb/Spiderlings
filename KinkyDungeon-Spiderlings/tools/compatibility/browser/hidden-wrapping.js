(async () => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    KinkyDungeonStartNewGame(false);
    KDMapData.Entities = [];
    KDMapData.Bullets = [];
    KDUpdateEnemyCache = true;
    for (let y = 3; y < 16; y++)
        for (let x = 3; x < 19; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMovePlayer(10, 10, false);
    const source = DialogueCreateEnemy(10, 8, "WebCaster");
    const target = DialogueCreateEnemy(11, 8, "Maidforce");
    source.SpinnerConstructionPoints = 10;
    target.specialBoundLevel = { Slime: 6 };
    target.boundLevel = 6;
    Spiderlings.NPCAdhesion.recordNativeSilk(source, target, 6, "direct", "visibility-check");
    expect(Spiderlings.NPCWrapping.vulnerable(target), "Silk vulnerability fixture failed");
    source.stun = 999;
    target.stun = 999;
    await frame();
    const labels = [];
    const originalDraw = DrawTextFitKDTo;
    DrawTextFitKDTo = function (...args) {
        if (String(args[1]).includes(TextGet("SpiderlingsNPCWrapping"))) labels.push(args[1]);
        return originalDraw.apply(this, args);
    };
    try {
        KinkyDungeonVisionSet(source.x, source.y, 5);
        KinkyDungeonVisionSet(target.x, target.y, 5);
        Spiderlings.NPCWrapping.draw({ CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
        expect(labels.length > 0, "Visible silk vulnerability label missing");
        const records = [];
        for (const state of ["hidden", "wall"]) {
            labels.length = 0;
            KinkyDungeonSetEnemyFlag(target, "hidden", state === "hidden" ? 100 : 0);
            if (state === "wall") {
                for (let x = 1; x < KDMapData.GridWidth - 1; x++) KinkyDungeonMapSet(x, 9, "1");
                KinkyDungeonVisionSet(source.x, source.y, 0);
                KinkyDungeonVisionSet(target.x, target.y, 0);
            }
            Spiderlings.NPCWrapping.draw({ CamX: 0, CamY: 0, CamX_offset: 0, CamY_offset: 0 });
            await frame();
            const sample = {
                state,
                labels: [...labels],
                vulnerable: Spiderlings.NPCWrapping.vulnerable(target),
            };
            expect(!labels.length, `${state}: wrapping leaked through visibility`);
            expect(sample.vulnerable, "Hiding the label changed damage vulnerability");
            records.push(sample);
        }
        return records;
    } finally {
        DrawTextFitKDTo = originalDraw;
    }
})();
