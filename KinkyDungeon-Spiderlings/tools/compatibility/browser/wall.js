(() => {
    KinkyDungeonStartNewGame(false);
    KDMapData.Entities = [];
    KDMapData.Bullets = [];
    KDUpdateEnemyCache = true;
    for (const key of Object.keys(KDMapData)) if (key.startsWith("Spiderlings")) delete KDMapData[key];
    for (let y = 4; y < 13; y++)
        for (let x = 6; x < 17; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMovePlayer(14, 8, false);
    KinkyDungeonMapSet(10, 6, "1");
    const spider = DialogueCreateEnemy(10, 8, "Spinner");
    spider.movePoints = 0;
    const encounter = Spiderlings.SpinnerNativeField.initializeMap({
        fieldId: "wall-regression",
        owners: [spider.id],
        anchors: [
            { x: 10, y: 7 },
            { x: 12, y: 7 },
        ],
    });
    const built = Spiderlings.SpinnerNativeField.applyPaidAction(spider, {
        type: "placeAnchor",
        ownerId: spider.id,
        anchorId: encounter.topology.anchors[0].id,
    });
    if (!built.applied) throw new Error("Could not place owned web.");
    KDUpdateEnemyCache = true;
    const moves = [];
    KDAddEvent(KDEventMapGeneric, "enemyMove", "CompatibilityWall", (_event, data) => {
        if (data.enemy === spider) moves.push({ x: data.moveX, y: data.moveY });
    });
    const direction = { x: 0, y: -1, delta: 1 };
    const admitted = KinkyDungeonEnemyCanMove(spider, direction, KinkyDungeonMovableTilesEnemy, "", false, 0);
    const moved = admitted && KinkyDungeonEnemyTryMove(spider, direction, 1, 10, 7, false);
    const nextWallAllowed = KinkyDungeonEnemyCanMove(spider, direction, KinkyDungeonMovableTilesEnemy, "", false, 0);
    if (!moved || spider.x !== 10 || spider.y !== 7 || moves.length !== 1 || nextWallAllowed || spider.movePoints !== 0)
        throw new Error("Owned-web traversal did not stop after one paid step.");
    return { moved, x: spider.x, y: spider.y, moves, nextWallAllowed, movePoints: spider.movePoints };
})();
