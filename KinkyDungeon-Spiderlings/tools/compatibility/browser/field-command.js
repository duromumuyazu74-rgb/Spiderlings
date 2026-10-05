(async () => {
    const { setup, spawn, turn, expect, save, restore, enemy } = globalThis.normalAcceptance;
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
    for (let step = 0; step < 30; step++) await turn();
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
    const current = native.state(),
        donor = current.ai.groups[home.id];
    // Submit real demand through the production dispatcher; no fixture action or free movement is applied.
    const receiver = command.newGroup(current.ai);
    const destination = { x: KDMapData.GridWidth - 5, y: KDMapData.GridHeight - 5 };
    const distances = (source, target) => {
        const path = Spiderlings.SpinnerAI.dispatchPath(source, target);
        return path.length ? path.length - 1 : Infinity;
    };
    const request = command.request(current, receiver.id, "build", 1, destination);
    command.allocate(current, distances);
    expect(request.status === "satisfied", `A donor with spare workers rejected support: ${request.reason}`);
    const member = Object.values(command.inspect().members).find((entry) => entry.commander === receiver.id);
    expect(
        member.home === donor.id && member.phase === "travelling",
        "Dispatch lost the donor or handed out autonomous control",
    );
    const actor = enemy(member.id),
        position = { x: actor.x, y: actor.y };
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
    const owners = command.owners(current, donor.id);
    expect(
        ids.every((id) => owners.includes(id)),
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
