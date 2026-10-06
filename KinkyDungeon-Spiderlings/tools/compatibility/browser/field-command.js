(async () => {
    const { setup, spawn, turn, expect, save, restore, enemy } = globalThis.normalAcceptance;
    setup("large-field-before-nearby-pocket");
    KDMapData.GridWidth = 36;
    KDMapData.GridHeight = 20;
    KDMapData.Grid =
        Array.from({ length: 20 }, (_, y) =>
            Array.from({ length: 36 }, (_, x) =>
                (x >= 1 && x <= 7 && y >= 4 && y <= 10) ||
                (x >= 18 && x <= 33 && y >= 2 && y <= 16) ||
                (y === 7 && x >= 1 && x <= 33)
                    ? "0"
                    : "1",
            ).join(""),
        ).join("\n") + "\n";
    KDMapData.Tiles = {};
    KDMapData.StartPosition = { x: 1, y: 7 };
    KDMapData.EndPosition = { x: 5, y: 7 };
    KDMovePlayer(4, 7, false);
    spawn("Spinner", 3, 7).hostile = 999;
    const largeFirst = Spiderlings.SpinnerAI.beginTurn({ activate: true });
    expect(
        Object.values(largeFirst.plans).some((plan) => plan.radius === 4),
        `Nearby small pocket hid a reachable large field: ${JSON.stringify(largeFirst.plans)}`,
    );
    expect(
        Spiderlings.SpinnerNativeField.state().topology.actionLog.length === 0,
        "Large-field planning granted free construction",
    );
    setup("layered-field-command");
    const actors = [
        [7, 8],
        [7, 10],
        [9, 9],
        [10, 10],
    ].map(([x, y]) => spawn("Spinner", x, y));
    for (const actor of actors) {
        actor.aware = false;
        actor.vp = 0;
        actor.hostile = 999;
        // Isolate donor allocation from local capture; real capture/recovery loans
        // are covered by the contact scenes and must remain protected there.
        actor.Enemy = { ...actor.Enemy, visionRadius: 0 };
        actor.modified = true;
    }
    const native = Spiderlings.SpinnerNativeField,
        command = Spiderlings.FieldCommand;
    const ai = Spiderlings.SpinnerAI.beginTurn({ activate: true }),
        encounter = native.state();
    const home = Object.values(ai.groups).find((group) => group.planId);
    expect(home, "The global planner did not create a first field before native contact");
    expect(
        ai.projects.positions.some(
            (position) => position.target.kind === "player" && position.x === KinkyDungeonPlayerEntity.x,
        ),
        "Global planning lost current character positions",
    );
    expect(encounter.topology.actionLog.length === 0, "Planning granted free construction");
    const ids = actors.map((actor) => actor.id),
        planId = home.planId;
    let relocated = false;
    for (let step = 0; step < 30; step++) {
        await turn();
        if (!relocated && native.state().topology.actionLog.length > 0) {
            // Keep the paid project, but put the player outside it before capture
            // admission. Capture sources are intentionally unavailable as donors.
            KDMovePlayer(KDMapData.GridWidth - 5, KDMapData.GridHeight - 5, false);
            relocated = true;
        }
    }
    expect(native.state().topology.actionLog.length > 0, "Controlled Spinners never paid to build");
    expect(native.state().ai.plans[planId], "A paid field disappeared during character planning updates");
    const beforeZero = JSON.stringify({ topology: native.state().topology, command: command.inspect() });
    KinkyDungeonAdvanceTime(0, true);
    expect(
        beforeZero === JSON.stringify({ topology: native.state().topology, command: command.inspect() }),
        "Zero time advanced construction or command",
    );
    const saved = command.inspect();
    restore(save());
    expect(JSON.stringify(command.inspect()) === JSON.stringify(saved), "Loading rewrote valid command commitments");
    const current = native.state();
    // Submit real demand through the production dispatcher; no fixture action or free movement is applied.
    const receiver = command.newGroup(current.ai);
    const destination = { x: KDMapData.GridWidth - 5, y: KDMapData.GridHeight - 5 };
    const distances = (source, target) => {
        const path = Spiderlings.SpinnerAI.dispatchPath(source, target);
        return path.length ? path.length - 1 : Infinity;
    };
    const request = command.request(current, receiver.id, "build", 1, destination);
    command.allocate(current, distances);
    if (request.status !== "satisfied") {
        expect(
            ["necessary-duty", "committed", "unreachable"].includes(request.reason),
            "Busy crews rejected support without their actual reason",
        );
    }
    // The continuing planner can commit every original worker to a project.
    // Author a genuinely free reserve crew for the dispatcher contract here.
    const spare = spawn("Spinner", 2, 2);
    spare.hostile = 999;
    command.reconcile(current, KDMapData.Entities, {}, true);
    command.allocate(current, distances);
    expect(
        request.status === "satisfied",
        `A donor with spare workers rejected support: ${JSON.stringify({ reason: request.reason, protected: actors.map((actor) => ({ id: actor.id, protected: command.protectedMember(enemy(actor.id)) })), capture: Spiderlings.SpinnerCapture.state(), recovery: Spiderlings.SpinnerRecovery.state() })}`,
    );
    const member = Object.values(command.inspect().members).find((entry) => entry.commander === receiver.id);
    const loanDonor = current.ai.groups[member.home];
    expect(loanDonor && member.phase === "travelling", "Dispatch lost the donor or handed out autonomous control");
    const actor = enemy(member.id),
        position = { x: actor.x, y: actor.y };
    const updated = { x: destination.x - 3, y: destination.y };
    command.request(current, receiver.id, "build", 1, updated);
    command.allocate(current, distances);
    const refreshed = command.inspect().members[member.id];
    expect(
        refreshed.destination.x === updated.x &&
            refreshed.destination.y === updated.y &&
            refreshed.loan === member.loan,
        "Replanning left a stale movement order or duplicated a loan",
    );
    command.handleMove(actor, 0);
    expect(actor.x === position.x && actor.y === position.y, "A zero-time loan moved");
    request.closed = true;
    receiver.cancelled = true;
    command.reconcile(current, KDMapData.Entities, {}, false);
    expect(
        command.inspect().members[member.id].phase === "returning",
        "Cancelled support did not enter global return control",
    );
    command.projectOwners(current);
    const owners = command.owners(current, loanDonor.id);
    expect(
        owners.includes(member.id) && ids.every((id) => command.inspect().members[id]?.home),
        "Temporary support removed original physical ownership",
    );
    const persisted = command.inspect();
    restore(save());
    expect(JSON.stringify(command.inspect()) === JSON.stringify(persisted), "Load lost the return responsibility");
    return {
        firstPlan: planId,
        paidActions: native.state().topology.actionLog.length,
        loan: member,
        returned: command.inspect().members[member.id],
    };
})();
