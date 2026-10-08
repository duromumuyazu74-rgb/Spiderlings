(async () => {
    const { setup, spawn, turn, frame, expect, photo } = globalThis.normalAcceptance;
    setup("prepared-vertical-passage");
    for (let y = 1; y < KDMapData.GridHeight - 1; y++)
        for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
            const floor =
                (x >= 9 && x <= 11 && ((y >= 3 && y <= 7) || (y >= 13 && y <= 17))) ||
                (x === 10 && y >= 8 && y <= 12) ||
                (x >= 2 && x <= 3 && y >= 2 && y <= 3);
            KinkyDungeonMapSet(x, y, floor ? "0" : "1");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMapData.StartPosition = { x: 10, y: 3 };
    KDMapData.EndPosition = { x: 10, y: 17 };
    KDMapData.ShortcutPositions = {};
    KDMapData.JailPoints = [];
    KDMovePlayer(10, 16, false);
    KDPathCache = new Map();
    KDPathCacheIgnoreLocks = new Map();
    const actors = [spawn("Spinner", 9, 5), spawn("Spinner", 11, 5)];
    const { reserves } = globalThis.normalAcceptance.prepareCrew({
        actors,
        fieldPermits: 1,
        reserveCells: [
            { x: 2, y: 2 },
            { x: 3, y: 2 },
        ],
    });
    const native = Spiderlings.SpinnerNativeField;
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    const state = () => native.state();
    const field = () => Object.values(state().topology.fields).find((entry) => entry.kind === "passage");
    const trace = (globalThis.normalTrace = {
        actors: actors.map((actor) => actor.id),
        reserves: reserves.map((actor) => actor.id),
        closure: [],
    });
    expect(field(), "The vertical corridor did not produce a passage field");
    for (let n = 0; n < 120 && field().phase !== "ready"; n++) await turn();
    expect(field().phase === "ready", "Spinners did not pay to prepare the passage");
    for (const actor of actors) actor.stun = 999;
    const lower = field()
        .gates.flatMap((gate) => gate.cells)
        .sort((a, b) => b.y - a.y)[0];
    expect(native.isPreparedSilk(lower), "Open, prepared passage is not slow silk");
    KDMovePlayer(lower.x, lower.y + 1, false);
    KDGameData.MovePoints = 0;
    const moves = [];
    KinkyDungeonMove({ x: 0, y: -1 }, 1, false, true);
    moves.push({
        x: KinkyDungeonPlayerEntity.x,
        y: KinkyDungeonPlayerEntity.y,
        points: KDGameData.MovePoints,
        waits: KDGameData.SlowMoveTurns,
    });
    expect(
        moves[0].y === lower.y && (moves[0].points < 0 || moves[0].waits >= 1),
        `Prepared silk did not cost one extra native movement turn: ${JSON.stringify(moves)}`,
    );
    const images = { prepared: await photo() };
    KDMovePlayer(field().core.x, field().core.y, false);
    native.onEntry(KinkyDungeonPlayerEntity);
    expect(state().topology.composites[field().compositeId].closureArmed, "Entry did not request closure");
    expect(native.isPreparedSilk(lower), "Closure intent activated an unpaid gate");
    for (const actor of actors) actor.stun = 0;
    for (let n = 0; n < 80 && field().phase !== "sealed"; n++) {
        await turn();
        trace.closure.push({
            n,
            player: { x: KDPlayer().x, y: KDPlayer().y },
            phase: field().phase,
            groups: Object.values(state().ai.groups).map((group) => ({
                id: group.id,
                members: group.memberIds,
                planId: group.planId,
                assignments: Object.values(group.assignments).map((assignment) => ({
                    type: assignment.type,
                    target: assignment.target,
                    workCell: assignment.workCell,
                })),
            })),
            actors: [...actors, ...reserves].map((original) => {
                const actor = KDMapData.Entities.find((entry) => entry.id === original.id);
                return (
                    actor && {
                        id: actor.id,
                        x: actor.x,
                        y: actor.y,
                        stun: actor.stun,
                        source: Spiderlings.FieldCommand.sourceRole(actor),
                        duty: Spiderlings.SpinnerDuties.current(actor)?.role,
                    }
                );
            }),
            capture: Spiderlings.SpinnerCapture.state()?.phase,
            actions: state().topology.actionLog.length,
        });
    }
    expect(field().phase === "sealed", "Spinners did not pay to activate the web wall");
    expect(
        state().topology.actionLog.some((action) => action.type === "closeGate"),
        "Activation had no paid gate work",
    );
    for (const actor of actors) actor.stun = 999;
    const walls = field()
        .gates.flatMap((gate) => gate.cells)
        .map((cell) =>
            KDMapData.Entities.find(
                (entity) => native.isOwnedProxy(entity) && entity.x === cell.x && entity.y === cell.y,
            ),
        );
    expect(walls.every(Boolean), "Activated gates did not project attackable walls");
    expect(
        walls.every((wall) => !KDCanPassEnemy(KinkyDungeonPlayerEntity, wall)),
        "Activated walls still allow crossing",
    );
    images.activated = await photo();
    const orientations = walls.map((wall) => ({
        y: wall.y,
        rotation: kdpixisprites.get(`spr_${wall.id}_border_0`)?.rotation,
    }));
    const top = orientations.reduce((a, b) => (a.y < b.y ? a : b));
    const bottom = orientations.reduce((a, b) => (a.y > b.y ? a : b));
    expect(
        top.rotation === 0 && Math.abs(bottom.rotation - Math.PI) < 0.001,
        `Top/bottom passage walls are not opposed: ${JSON.stringify(orientations)}`,
    );
    const wall = walls.find((entry) => entry.y === lower.y),
        before = wall.hp;
    KDMovePlayer(lower.x, lower.y + 1, false);
    for (let n = 0; n < 30 && native.isSpiderlingsWebCell(lower); n++) {
        KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
        KinkyDungeonLaunchAttack(wall);
        await frame();
    }
    expect(
        !native.isSpiderlingsWebCell(lower) && wall.hp < before,
        "Native knife attacks did not cut an activated passage",
    );
    return { moves, orientations, paid: state().topology.actionLog.length, before, after: wall.hp, images };
})();
