(async () => {
    const capture = Spiderlings.SpinnerCapture;
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const snapshot = () => ({
        tick: KinkyDungeonCurrentTick,
        capture: JSON.parse(JSON.stringify(capture.state())),
        actors: KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "Spinner").map((enemy) => ({
            id: enemy.id,
            x: enemy.x,
            y: enemy.y,
            movePoints: enemy.movePoints,
        })),
    });
    expect(capture.phase() === "contest", "Run after the native inside-field capture scenario.");
    expect(capture.state().sourceIds.length === 1, "The native hit must start with only its paid hitter.");
    const before = snapshot();
    const data = KinkyDungeonSaveGame(true);
    const saved = typeof data === "string" ? data : LZString.compressToBase64(JSON.stringify(data));
    const restore = () => expect(KinkyDungeonLoadGame(saved, true), "Native capture save reload failed.");
    const result = { before };
    try {
        KinkyDungeonAdvanceTime(0);
        result.zeroTime = snapshot();
        expect(
            JSON.stringify(result.zeroTime) === JSON.stringify(before),
            "Zero-time refresh changed Capture membership, work, position or saved movement credit.",
        );
        restore();
        result.loaded = snapshot();
        expect(
            JSON.stringify(result.loaded) === JSON.stringify(before),
            "Native reload changed Capture membership, work, position or saved movement credit.",
        );
        KinkyDungeonAdvanceTime(1);
        result.joinTurn = snapshot();
        expect(capture.state().sourceIds.length === 2, "A positive enemy operation did not admit the helper.");
        expect(capture.state().weaveProgress === 6.25, "The helper wove silk on its paid joining operation.");
        KinkyDungeonAdvanceTime(1);
        result.weaveTurn = snapshot();
        expect(capture.state().weaveProgress === 18.75, "The joined helper did not weave on the next paid turn.");
        return result;
    } finally {
        restore();
    }
})();
