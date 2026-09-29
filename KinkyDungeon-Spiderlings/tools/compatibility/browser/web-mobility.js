(async () => {
    const rows = [];
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (const mode of ["plain", "web", "reload", "broken"]) {
        const web = mode !== "plain";
        KinkyDungeonStartNewGame(false);
        Spiderlings.SpinnerField.enter();
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        for (const key of Object.keys(KDMapData)) if (key.startsWith("Spiderlings")) delete KDMapData[key];
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, y === 10 || (x === 2 && y === 2) ? "0" : "1");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(28, 10, false);
        let spider = DialogueCreateEnemy(4, 10, "WebCaster");
        const builder = DialogueCreateEnemy(2, 2, "Spinner");
        builder.stun = 999;
        spider.aware = true;
        spider.vp = 10;
        spider.hostile = 999;
        spider.movePoints = 0;
        const encounter = Spiderlings.SpinnerNativeField.initializeMap({
            fieldId: "route-acceptance",
            owners: [builder.id],
            anchors: [
                { x: 5, y: 10 },
                { x: 25, y: 10 },
            ],
        });
        if (web) {
            const link = encounter.topology.links[0];
            const actions = [
                ...encounter.topology.anchors.map((anchor) => ({
                    type: "placeAnchor",
                    anchorId: anchor.id,
                    cell: anchor,
                })),
                ...link.plannedCells.map((cell) => ({ type: "extendLink", linkId: link.id, cell })),
            ];
            for (const action of actions) {
                const applied = Spiderlings.SpinnerTopology.applyAction(
                    encounter.topology,
                    { ...action, ownerId: builder.id },
                    Spiderlings.SpinnerNativeField.snapshot(action.cell),
                );
                if (!applied.outcome.legal) throw Error(JSON.stringify(applied.outcome));
                encounter.topology = applied.state;
            }
            Spiderlings.SpinnerNativeField.reconcile();
            if (!Spiderlings.SpinnerNativeField.isSpiderlingsWebCell({ x: 8, y: 10 }))
                throw Error("Physical route was not built");
        }
        KDMovePlayer(11, 10, false);
        KDUpdateEnemyCache = true;
        KDsetSeed("long-web-route");
        const trace = [];
        for (let turn = 1; turn <= 80; turn++) {
            KDMovePlayer(Math.min(28, spider.x + 7), 10, false);
            KinkyDungeonAdvanceTime(1, true);
            trace.push({
                turn,
                x: spider.x,
                y: spider.y,
                movePoints: spider.movePoints,
                attackPoints: spider.attackPoints,
                castCooldown: spider.castCooldown,
            });
            if (turn === 8 && mode === "reload") {
                const id = spider.id,
                    save = KinkyDungeonSaveGame(true);
                if (
                    !KinkyDungeonLoadGame(
                        typeof save === "string" ? save : LZString.compressToBase64(JSON.stringify(save)),
                        true,
                    )
                )
                    throw Error("Route reload failed");
                spider = KDMapData.Entities.find((enemy) => enemy.id === id);
            }
            if (turn === 8 && mode === "broken") {
                const proxy = KDMapData.Entities.find(
                    (enemy) =>
                        Spiderlings.SpinnerNativeField.isOwnedProxy(enemy) &&
                        enemy.x === spider.x + 1 &&
                        enemy.y === 10,
                );
                if (!proxy) throw Error("Missing next web cell for native breach");
                KinkyDungeonDamageEnemy(
                    proxy,
                    { type: "slash", damage: 1000, nocrit: true },
                    true,
                    true,
                    undefined,
                    undefined,
                    KinkyDungeonPlayerEntity,
                );
                if (Spiderlings.SpinnerNativeField.isSpiderlingsWebCell({ x: spider.x + 1, y: 10 }))
                    throw Error("Native breach did not remove the route");
            }
            await frame();
            if (spider.x >= 20) break;
        }
        if (spider.x < 20)
            throw Error(`Native route did not finish: ${JSON.stringify({ web, trace: trace.slice(-8), spider })}`);
        for (let y = 9; y <= 12; y++) for (let x = 3; x <= 26; x++) KinkyDungeonMapSet(x, y, "0");
        KDMovePlayer(28, 11, false);
        KDMoveEntity(spider, 4, 11, false, undefined, undefined, true, true);
        Spiderlings.WebMobility.invalidateNavigation(true);
        const path = KinkyDungeonFindPath(
            4,
            11,
            20,
            11,
            true,
            false,
            true,
            KinkyDungeonMovableTilesEnemy,
            false,
            false,
            false,
            spider,
            false,
            undefined,
            true,
            true,
        );
        if (!path?.length || ((mode === "web" || mode === "reload") && !path.some((cell) => cell.y === 10)))
            throw Error("Native path did not prefer the faster web detour");
        const casts = trace
            .filter((row, i) => row.castCooldown > 0 && row.castCooldown > (trace[i - 1]?.castCooldown || 0))
            .map((row) => row.turn);
        if (casts.slice(1).some((turn, i) => turn - casts[i] !== 9))
            throw Error("Web movement changed native spray cadence");
        rows.push({ mode, trace, path, casts });
    }
    const ratio = rows[0].trace.length / rows[1].trace.length;
    if (ratio < 1.3 || ratio > 1.7) throw Error(`Matched native web speed ${ratio}: ${JSON.stringify(rows)}`);
    if (rows[1].trace.length !== rows[2].trace.length || rows[3].trace.length <= rows[1].trace.length)
        throw Error("Reload reset movement or broken silk retained its speed bonus");
    return { rows, ratio };
})();
