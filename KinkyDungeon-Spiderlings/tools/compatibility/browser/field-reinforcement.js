(async () => {
    const { setup, spawn, turn, expect } = globalThis.normalAcceptance;
    const oldLimit = KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit;
    const native = Spiderlings.SpinnerNativeField;
    const command = Spiderlings.FieldCommand;
    const rows = (globalThis.normalTrace = []);
    const open = (seed) => {
        setup(seed);
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "0";
        KDMapData.GridWidth = 44;
        KDMapData.GridHeight = 26;
        KDMapData.Grid =
            Array.from({ length: 26 }, (_, y) =>
                Array.from({ length: 44 }, (_, x) => (x && y && x < 43 && y < 25 ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.Tiles = {};
        KDMapData.StartPosition = { x: 1, y: 1 };
        KDMapData.EndPosition = { x: 42, y: 24 };
        KDMovePlayer(2, 23, false);
        KinkyDungeonGenNavMap();
    };
    const layer = (id) => ({
        id,
        vertices: [
            { x: 6, y: 6 },
            { x: 14, y: 6 },
            { x: 14, y: 14 },
            { x: 6, y: 14 },
        ],
        gate: { x: 6, y: 10 },
    });
    const unaware = (actor) => {
        actor.hostile = 999;
        actor.aware = false;
        actor.vp = 0;
        actor.Enemy = { ...actor.Enemy, visionRadius: 0 };
        actor.modified = true;
        return actor;
    };
    const distances = (source, target) => {
        const route = Spiderlings.SpinnerAI.dispatchPath(source, target);
        return route.length ? route.length - 1 : Infinity;
    };
    try {
        open("empty-field-nearby-reinforcement");
        const former = unaware(spawn("Spinner", 10, 11));
        // Retained geometry can outlive its original worker. The native authoring
        // interface supplies this save-like fixture without creating a new project.
        native.initializeEnclosure({
            compositeId: "unmanned-retained-field",
            owners: [former.id],
            built: false,
            layers: [layer("unmanned-retained-ring")],
        });
        Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
        const encounter = native.state();
        const receiver = Object.values(encounter.ai.groups).find((group) => group.planId);
        expect(receiver, "Retained field was not adopted into command control");
        former.hp = 0;
        const crew = [
            unaware(spawn("Spinner", 24, 8)),
            unaware(spawn("Spinner", 25, 8)),
            unaware(spawn("Spinner", 24, 9)),
            unaware(spawn("Spinner", 25, 9)),
        ];
        for (const actor of crew.slice(1)) actor.stun = 100;
        command.reconcile(encounter, KDMapData.Entities, {}, true);
        for (const request of Object.values(encounter.command.requests)) request.closed = true;
        const remote = command.newGroup(encounter.ai);
        const low = command.request(encounter, remote.id, "build", 1, { x: 35, y: 20 }, { urgency: 0 });
        command.allocate(encounter, distances);
        const oldLoan = { ...command.inspect().members[crew[0].id] };
        expect(oldLoan.commander === remote.id && oldLoan.loan, "Reserve worker did not begin a low priority loan");
        const origin = { x: crew[0].x, y: crew[0].y, movePoints: crew[0].movePoints };
        const originalActions = encounter.topology.actionLog.length;
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "1";
        // The player is three cells from the boundary, outside the whole field.
        KDMovePlayer(3, 10, false);
        Spiderlings.SpinnerAI.beginTurn({ activate: true });
        const urgent = Object.values(encounter.command.requests).find(
            (request) => request.fieldId === receiver.id && !request.closed && request.urgency >= 1,
        );
        const redirected = command.inspect().members[crew[0].id];
        rows.push({
            mode: "immediate-reassignment",
            low,
            urgent: urgent && { ...urgent },
            previous: oldLoan,
            redirected,
        });
        expect(urgent, "An unmanned field did not request support when the player approached its boundary");
        expect(
            redirected.commander === receiver.id && ["travelling", "support"].includes(redirected.phase),
            "An urgent field waited for a low priority loan to return home",
        );
        expect(redirected.home === oldLoan.home, "Direct reassignment lost the worker's original home");
        expect(
            crew[0].x === origin.x && crew[0].y === origin.y && crew[0].movePoints === origin.movePoints,
            "Immediate allocation moved a worker without native payment",
        );
        expect(
            urgent.deployed > 0 && urgent.arrived === 0 && urgent.usable === 0 && urgent.status !== "satisfied",
            `An in-transit promise counted as working support: ${JSON.stringify(urgent)}`,
        );
        expect(encounter.topology.actionLog.length === originalActions, "Immediate allocation paid for construction");
        expect(!Spiderlings.SpinnerCapture.state(), "Boundary proximity admitted Capture before native contact");
        for (const actor of crew) actor.stun = 0;
        const travel = [];
        for (let step = 0; step < 80 && encounter.topology.actionLog.length === originalActions; step++) {
            await turn();
            travel.push({
                step,
                actions: encounter.topology.actionLog.length,
                members: crew.map((actor) => ({ id: actor.id, x: actor.x, y: actor.y })),
            });
        }
        expect(encounter.topology.actionLog.length > originalActions, "Immediate reinforcements never paid to build");
        rows.push({ mode: "paid-arrival", travel });

        open("friendly-construction-cell-yield");
        const builders = [
            unaware(spawn("Spinner", 9, 9)),
            unaware(spawn("Spinner", 11, 9)),
            unaware(spawn("Spinner", 9, 11)),
            unaware(spawn("Spinner", 11, 11)),
        ];
        for (const actor of builders) actor.Enemy = { ...actor.Enemy, noAttack: true };
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "1";
        const placed = Spiderlings.SpinnerAI.initializeMapgenField({ preferredSites: [{ x: 10, y: 10 }] });
        expect(placed.status === "placed", "Nested yield fixture did not place its permitted field");
        const occupied = native.state();
        const plan = occupied.ai.plans[occupied.ai.groups[placed.groupId].planId];
        expect(plan.fieldIds.length === 3, "Nested yield fixture requires the real three-ring field");
        KDMovePlayer(plan.center.x, plan.center.y, false);
        native.onEntry(KinkyDungeonPlayerEntity);
        Spiderlings.SpinnerAI.beginTurn({ activate: true });
        let action;
        const preparation = [];
        // Reach the innermost real job with paid native work. Its adjacent
        // interior is inside the production footprint but is no boundary job.
        for (let step = 0; step < 80; step++) {
            action = Spiderlings.SpinnerTopology.nextWorkAction(
                occupied.topology,
                builders[0].id,
                builders[0],
                [],
                plan.fieldIds,
            );
            if (action?.fieldId === plan.fieldIds[0] && action.role === "body") break;
            await turn();
            preparation.push({ step, actions: occupied.topology.actionLog.length });
        }
        expect(action?.cell, "Occupied field fixture has no construction action");
        expect(
            action.fieldId === plan.fieldIds[0] && action.role === "body",
            "Occupied field fixture did not reach actual innermost body construction",
        );
        expect(
            occupied.topology.fields[plan.fieldIds[0]].interiorCells.every((cell) =>
                plan.cells.includes(`${cell.x},${cell.y}`),
            ),
            "Nested yield fixture lost the production interior footprint",
        );
        const blocker = unaware(spawn("Jumper", action.cell.x, action.cell.y));
        blocker.AI = "guard";
        blocker.gx = blocker.spawnX = blocker.x;
        blocker.gy = blocker.spawnY = blocker.y;
        blocker.Enemy = { ...blocker.Enemy, noAttack: true, spells: [] };
        KinkyDungeonSetEnemyFlag(blocker, "nofidget", -1);
        const start = { x: blocker.x, y: blocker.y, credit: blocker.movePoints };
        Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
        KinkyDungeonEnemyLoop(blocker, KDPlayer(), 0, 1, []);
        expect(
            blocker.x === start.x && blocker.y === start.y && blocker.movePoints === start.credit,
            "Zero time moved a construction blocker or granted movement credit",
        );
        const nativeApply = native.applyPaidAction;
        const paidAtTarget = [];
        const yieldTrace = [];
        rows.push({ mode: "friendly-inner-yield", target: action.cell, preparation, paidAtTarget, yieldTrace });
        native.applyPaidAction = function (source, work) {
            const wasBlocked = blocker.x === start.x && blocker.y === start.y;
            const result = nativeApply.apply(this, arguments);
            if (result.applied && work.cell?.x === start.x && work.cell?.y === start.y) {
                expect(!wasBlocked, "Construction was built through a living friendly blocker");
                paidAtTarget.push({ actor: source.id, tick: KinkyDungeonCurrentTick, type: work.type });
            }
            return result;
        };
        try {
            for (let step = 0; step < 40 && !paidAtTarget.length; step++) {
                const offer = Spiderlings.SpinnerAI.constructionYield(blocker);
                await turn();
                yieldTrace.push({
                    step,
                    blocker: { x: blocker.x, y: blocker.y },
                    actions: native.state().topology.actionLog.length,
                    offer,
                    duty: Spiderlings.SpinnerDuties.current(blocker)?.role,
                });
            }
            expect(
                yieldTrace.some((entry) => entry.blocker.x !== start.x || entry.blocker.y !== start.y),
                "A friendly guard kept the construction cell occupied",
            );
            expect(
                paidAtTarget.length,
                `Friendly yield never unlocked a paid construction action: ${JSON.stringify(yieldTrace)}`,
            );
        } finally {
            native.applyPaidAction = nativeApply;
        }
        return { rows };
    } finally {
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = oldLimit;
    }
})();
