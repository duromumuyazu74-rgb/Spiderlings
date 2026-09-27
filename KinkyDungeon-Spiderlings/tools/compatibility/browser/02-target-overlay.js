(async () => {
    const { maid, frame, expect } = globalThis.reviewProbe;
    const key = `npc:${maid.id}`;
    KDMapData.SpiderlingsMageSpells = {
        clock: 0,
        fields: [],
        collapses: [],
        marks: { [key]: { stacks: 2, expiresAt: 5 } },
        blasts: [],
    };
    KDAddEvent(KDEventMapGeneric, "draw", "SpiderlingsReviewFrame", (_event, data) => {
        globalThis.reviewProbe.lastFrame = { ...data };
    });
    KinkyDungeonVisionSet(maid.x, maid.y, 5);
    KinkyDungeonVisionSet(maid.x, maid.y - 1, 0);
    await frame();
    const id = `SpiderlingsSpellVisuals_mark_${key}`;
    let icon = kdpixisprites.get(id);
    const wallEdge = {
        targetVisible: KinkyDungeonVisionGet(maid.x, maid.y),
        aboveVisible: KinkyDungeonVisionGet(maid.x, maid.y - 1),
        iconVisible: icon?.visible,
    };
    expect(
        wallEdge.targetVisible > 0 && wallEdge.aboveVisible === 0 && wallEdge.iconVisible,
        "Head icon disappeared at visibility edge: " + JSON.stringify(wallEdge),
    );
    KinkyDungeonSetEnemyFlag(maid, "hidden", 10);
    await frame();
    expect(!kdpixisprites.get(id)?.visible, "Hidden NPC still has a mark");
    KinkyDungeonSetEnemyFlag(maid, "hidden", 0);
    const before = { x: maid.visual_x, y: maid.visual_y };
    maid.y += 1;
    KinkyDungeonVisionSet(maid.x, maid.y, 5);
    KinkyDungeonUpdateVisualPosition(maid, 25);
    expect(Math.abs(maid.visual_y - maid.y) > 0.1, "Fixture did not enter native interpolation");
    Spiderlings.SpellVisuals.hit(maid);
    const camera = globalThis.reviewProbe.lastFrame;
    KinkyDungeonSendEvent("draw", camera);
    icon = kdpixisprites.get(id);
    const hit = kdpixisprites.get(`SpiderlingsSpellVisuals_hit_${maid.id}:web`);
    const x = (maid.visual_x - camera.CamX + 0.5) * KinkyDungeonGridSizeDisplay;
    const y = (maid.visual_y - camera.CamY + 0.5) * KinkyDungeonGridSizeDisplay;
    const sample = {
        before,
        logical: { x: maid.x, y: maid.y },
        visual: { x: maid.visual_x, y: maid.visual_y },
        mark: { x: icon?.x, y: icon?.y },
        hit: { x: hit?.x, y: hit?.y },
        expected: { x, y },
    };
    expect(
        Math.abs(icon.x - x) < 0.0001 && Math.abs(icon.y - (y - 0.55 * KinkyDungeonGridSizeDisplay)) < 0.0001,
        "Mark is ahead of native interpolation: " + JSON.stringify(sample),
    );
    expect(Math.abs(hit.x - x) < 0.0001 && Math.abs(hit.y - y) < 0.0001, "Impact is ahead of native interpolation");
    await new Promise((resolve) => setTimeout(resolve, 400));
    await frame();
    CommonTime = globalThis.reviewProbe.originalTime;
    return { wallEdge, hiddenCheck: "passed", interpolation: sample };
})();
