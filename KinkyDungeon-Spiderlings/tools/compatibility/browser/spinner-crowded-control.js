(async () => {
    const { setup, spawn, turn, expect } = globalThis.normalAcceptance,
        rows = (globalThis.normalTrace = []),
        field = Spiderlings.SpinnerNativeField,
        recovery = Spiderlings.SpinnerRecovery,
        capture = Spiderlings.SpinnerCapture;
    const open = (seed) => {
        setup(seed);
        KDMapData.StartPosition = { x: 2, y: 2 };
        KDMapData.EndPosition = { x: KDMapData.GridWidth - 2, y: KDMapData.GridHeight - 2 };
        KDMapData.ShortcutPositions = {};
        KDMapData.JailPoints = [];
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
    };
    const layer = (id, x1, y1, x2, y2) => ({
        id,
        vertices: [
            { x: x1, y: y1 },
            { x: x2, y: y1 },
            { x: x2, y: y2 },
            { x: x1, y: y2 },
        ],
        gate: { x: x2, y: Math.floor((y1 + y2) / 2) },
    });
    {
        open("spinner-crowded-recovery");
        KDMovePlayer(16, 10, false);
        const actor = spawn("Spinner", 14, 10),
            blocker = spawn("WebCaster", 13, 10),
            row = { mode: "recovery-detour", positions: [] };
        rows.push(row);
        actor.hostile = blocker.hostile = 999;
        blocker.movePoints = -1000;
        blocker.Enemy = { ...blocker.Enemy, noAttack: true, spells: [] };
        blocker.modified = true;
        field.initializeEnclosure({
            compositeId: "return-home",
            owners: [actor.id],
            built: false,
            layers: [layer("return-inner", 7, 8, 11, 12)],
        });
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("BasicCollar"), 0, false, "");
        KDGameData[recovery.DEPARTURE] = {
            version: 1,
            compositeId: "return-home",
            eligibleSourceIds: [actor.id],
        };
        expect(recovery.hit(actor), "Recovery fixture failed native tether admission");
        actor.attackPoints = 3;
        actor.warningTiles = [{ x: 1, y: 0 }];
        KinkyDungeonEnemyLoop(actor, KDPlayer(), 0, 1, []);
        expect(actor.attackPoints === 0 && !actor.warningTiles.length, "Recovery refresh retained attack warnings");
        expect(actor.x === 14 && actor.y === 10, "Zero-time recovery moved its native owner");
        for (let tick = 0; tick < 20 && recovery.state(); tick++) {
            await turn();
            row.positions.push({ x: actor.x, y: actor.y, player: { x: KDPlayer().x, y: KDPlayer().y } });
            expect(actor.x !== blocker.x || actor.y !== blocker.y, "Recovery stepped through its coworker");
            expect(!actor.warningTiles?.length, "Recovery retained the old attack warning");
        }
        expect(
            row.positions.some((p) => p.x < 14),
            `Escort failed to leave crowd: ${JSON.stringify(row)}`,
        );
        expect(
            row.positions.some((p) => p.player.x < 16),
            `Native tether never dragged prey: ${JSON.stringify(row)}`,
        );
    }
    {
        open("spinner-capture-wall-detour");
        KDMovePlayer(6, 8, false);
        const sources = [spawn("Spinner", 7, 8), spawn("Spinner", 5, 8)],
            helper = spawn("Spinner", 12, 8),
            row = { mode: "capture-detour", positions: [] };
        rows.push(row);
        for (const actor of [...sources, helper]) actor.hostile = 999;
        field.initializeEnclosure({
            compositeId: "capture-home",
            owners: sources.map((a) => a.id),
            built: true,
            autoSeal: true,
            layers: [layer("capture-inner", 3, 3, 15, 15)],
        });
        for (let y = 6; y <= 10; y++) KinkyDungeonMapSet(11, y, "1");
        KDUpdateEnemyCache = true;
        expect(capture.hit(sources[0]), "Capture fixture failed real hit admission");
        helper.attackPoints = 3;
        helper.warningTiles = [{ x: -1, y: 0 }];
        const start = { x: helper.x, y: helper.y, credit: helper.movePoints };
        KinkyDungeonEnemyLoop(helper, KDPlayer(), 0, 1, []);
        expect(
            helper.x === start.x && helper.y === start.y && helper.movePoints === start.credit,
            "Zero-time capture approach paid movement",
        );
        for (let operation = 0; operation < 40 && !capture.state().sourceIds.includes(helper.id); operation++) {
            KinkyDungeonEnemyLoop(helper, KDPlayer(), 1, 1, []);
            row.positions.push({ x: helper.x, y: helper.y });
            expect(
                !helper.warningTiles?.length && helper.attackPoints === 0,
                "Capture approach retained attack warnings",
            );
        }
        expect(
            row.positions.some((p) => p.y < 6 || p.y > 10),
            "The Spinner did not route around the wall",
        );
        expect(
            capture.state().sourceIds.includes(helper.id),
            `Helper never reached the contest: ${JSON.stringify(row)}`,
        );
        capture.cancel();
    }
    {
        open("spinner-two-crews-before-capture");
        KDMovePlayer(14, 10, false);
        const actors = [
                spawn("Spinner", 5, 9),
                spawn("Spinner", 6, 11),
                spawn("Spinner", 22, 9),
                spawn("Spinner", 23, 11),
            ],
            reporter = spawn("WebCaster", 14, 8),
            row = { mode: "two-crews", paid: [], turns: [], hits: 0 };
        rows.push(row);
        for (const actor of [...actors, reporter]) actor.hostile = 999;
        reporter.movePoints = -1000;
        reporter.Enemy = { ...reporter.Enemy, noAttack: true, spells: [] };
        reporter.modified = true;
        globalThis.normalAcceptance.prepareCrew({ actors, fieldPermits: 2 });
        const placed = Spiderlings.SpinnerAI.initializeMapgenField({
            maxFields: 2,
            preferredSites: [
                { x: 6, y: 10 },
                // Both outer boundaries are four cells from the player. This
                // checks equal-demand cooperation; urgent preemption has its own scene.
                { x: 22, y: 10 },
            ],
        });
        expect(placed.fields?.length === 2, `Fixture did not create two staffed fields: ${JSON.stringify(placed)}`);
        const nativeAction = field.applyPaidAction,
            nativeBind = KDPlayerEffects.SpiderlingsWebbingEnemyBind;
        field.applyPaidAction = function (source, action) {
            const result = nativeAction.apply(this, arguments);
            if (result.applied)
                row.paid.push({ id: source.id, fieldId: action.fieldId, tick: KinkyDungeonCurrentTick });
            return result;
        };
        KDPlayerEffects.SpiderlingsWebbingEnemyBind = function (...args) {
            if (args[2]?.profile === "Spinner") row.hits++;
            return nativeBind.apply(this, args);
        };
        try {
            for (let tick = 0; tick < 100; tick++) {
                await turn();
                const groups = Object.values(field.state().ai.groups);
                row.turns.push(
                    groups.map((g) => ({
                        id: g.id,
                        lure: g.engagement?.lureId,
                        mode: g.engagement?.mode,
                        assignments: Object.values(g.assignments).map((a) => a.role),
                    })),
                );
                if (
                    placed.fields.every(
                        (f) =>
                            row.paid.filter(
                                (a) => field.state().topology.fields[a.fieldId]?.compositeId === f.compositeId,
                            ).length >= 2,
                    ) &&
                    row.hits > 0
                )
                    break;
            }
            for (const f of placed.fields)
                expect(
                    row.paid.filter((a) => field.state().topology.fields[a.fieldId]?.compositeId === f.compositeId)
                        .length >= 2,
                    `Observed prey starved one crew: ${JSON.stringify(row)}`,
                );
            expect(row.hits > 0, `Neither lure applied native melee pressure: ${JSON.stringify(row)}`);
            expect(!capture.state(), "The open approach unexpectedly admitted capture");
            Spiderlings.SpinnerAI.beginTurn({ activate: true });
            const remoteWork = Object.values(field.state().ai.groups)
                .flatMap((group) =>
                    Object.entries(group.assignments).map(([id, assignment]) => ({
                        actor: actors.find((actor) => String(actor.id) === id),
                        assignment,
                    })),
                )
                .find(
                    ({ actor, assignment }) =>
                        actor &&
                        assignment.role === "body" &&
                        Math.hypot(assignment.workCell.x - KDPlayer().x, assignment.workCell.y - KDPlayer().y) >
                            actor.Enemy.visionRadius,
                );
            expect(remoteWork, "Fixture has no remote unfinished construction job");
            KDMoveEntity(
                remoteWork.actor,
                remoteWork.assignment.workCell.x,
                remoteWork.assignment.workCell.y,
                true,
                undefined,
                true,
                true,
            );
            remoteWork.actor.SpinnerConstructionPoints = 0;
            // A real containing field and hit activate the existing player controller.
            const sources = [spawn("Spinner", 13, 10), spawn("Spinner", 15, 10)];
            for (const actor of sources) actor.hostile = 999;
            field.addEnclosure({
                compositeId: "contest-priority",
                owners: sources.map((a) => a.id),
                built: true,
                autoSeal: true,
                layers: [layer("contest-priority-inner", 12, 8, 16, 12)],
            });
            expect(capture.hit(sources[0]), "Formal capture did not start after the construction interval");
            const paid = row.paid.length;
            // Check the remote builder before its old lure joins Capture and
            // legitimately hands over the pressure duty to this worker.
            for (let operation = 0; operation < 6 && row.paid.length === paid; operation++) {
                // These isolated positive enemy operations need distinct ticks;
                // repeated native phases in one tick cannot grant more work.
                KinkyDungeonCurrentTick++;
                KinkyDungeonEnemyLoop(remoteWork.actor, KDPlayer(), 1, 1, []);
            }
            expect(row.paid.length > paid, "Formal capture froze a distant builder outside its vision radius");
            row.remoteConstruction = row.paid.slice(paid);
            const afterRemote = row.paid.length;
            for (const actor of actors.filter((actor) => capture.holdsSpiderAttack(actor, KDPlayer()))) {
                actor.attackPoints = 3;
                actor.warningTiles = [{ x: 1, y: 0 }];
                KinkyDungeonEnemyLoop(actor, KDPlayer(), 1, 1, []);
                expect(
                    actor.attackPoints === 0 && !actor.warningTiles.length,
                    "A former builder kept attacking in capture",
                );
            }
            expect(row.paid.length === afterRemote, "A nearby crew continued construction after formal capture");
            row.capturePreempted = true;
        } finally {
            field.applyPaidAction = nativeAction;
            KDPlayerEffects.SpiderlingsWebbingEnemyBind = nativeBind;
            capture.cancel();
        }
    }
    return { rows };
})();
