(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance;
    setup("anonymous-saved-field-borrowed-guard");
    KDMapData.GridWidth = 30;
    KDMapData.GridHeight = 22;
    KDMapData.Grid =
        Array.from({ length: 22 }, (_, y) =>
            Array.from({ length: 30 }, (_, x) => (x && y && x < 29 && y < 21 ? "0" : "1")).join(""),
        ).join("\n") + "\n";
    KDMapData.Tiles = {};
    KDMapData.StartPosition = { x: 1, y: 1 };
    KDMapData.EndPosition = { x: 28, y: 1 };
    KDMovePlayer(14, 10, false);
    const homeNest = spawn("NestEntrance", 5, 5);
    const builder = spawn("Spinner", 13, 10);
    builder.SpiderlingsNestParentID = homeNest.id;
    builder.SpiderlingsHuntRole = "builder";
    builder.hostile = 999;
    const native = Spiderlings.SpinnerNativeField,
        command = Spiderlings.FieldCommand;
    // Anonymous retained investment, not work awarded during the replay.
    native.initializeEnclosure({
        compositeId: "saved-home",
        owners: [builder.id],
        built: true,
        layers: [
            {
                id: "saved-ring",
                vertices: [
                    { x: 10, y: 6 },
                    { x: 18, y: 6 },
                    { x: 18, y: 14 },
                    { x: 10, y: 14 },
                ],
                gate: { x: 18, y: 10 },
            },
        ],
    });
    native.state().builders = {};
    Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
    const encounter = native.state();
    const receiver = Object.values(encounter.ai.groups).find((group) => group.planId);
    expect(receiver, "Retained field was not adopted into the dispatcher");
    const donorNest = spawn("NestEntrance", 24, 17);
    const guards = [spawn("Spinner", 22, 17), spawn("Spinner", 23, 17), spawn("Spinner", 22, 18)];
    for (const guard of guards) {
        guard.AI = "guard";
        guard.SpiderlingsNestParentID = donorNest.id;
        guard.hostile = 999;
    }
    command.reconcile(encounter, KDMapData.Entities, {}, true);
    const proxy = KDMapData.Entities.find((actor) => native.isOwnedProxy(actor) && actor.x === 10 && actor.y === 9);
    expect(proxy, "Retained field has no damageable boundary");
    native.onNativeDamage({ enemy: proxy, dmgDealt: 100 });
    const distance = (source, target) => {
        const route = Spiderlings.SpinnerAI.dispatchPath(source, target);
        return route.length ? route.length - 1 : Infinity;
    };
    const request = command.request(encounter, receiver.id, "repair", 1, { x: 14, y: 10 });
    command.allocate(encounter, distance);
    const loan = Object.values(command.inspect().members).find(
        (member) => member.commander === receiver.id && member.loan,
    );
    expect(loan && guards.some((guard) => guard.id === loan.id), "Fixture did not borrow a native guard");
    expect(request.deployed === 1, "Guard was not committed to the receiving field");
    const actor = KDMapData.Entities.find((entry) => entry.id === loan.id);
    expect(actor.AI === "guard" && !actor.SpiderlingsHuntRole, "Loan changed the retained guard role");
    const before = encounter.topology.actionLog.length;
    KinkyDungeonDressPlayer();
    UpdateModels(KinkyDungeonPlayer);
    await globalThis.normalAcceptance.frame();
    restore(save());
    const state = native.state();
    expect(state.topology.actionLog.length === before, "Loading paid for construction");
    const plan = state.ai.plans[receiver.planId];
    native.onEntry(KinkyDungeonPlayerEntity);
    let paidTurns = 0;
    for (; paidTurns < 100; paidTurns++) {
        await turn();
        if (Spiderlings.SpinnerCapture.state()) break;
    }
    expect(state.topology.actionLog.length > before, "Borrowed guard never paid for boundary repair");
    expect(
        plan.fieldIds.every((id) => state.topology.fields[id].phase === "sealed"),
        "Saved field never sealed",
    );
    expect(Spiderlings.SpinnerCapture.state(), "Saved field never began native-hit Capture");
    return {
        paidTurns: paidTurns + 1,
        phase: "sealed",
        capture: Spiderlings.SpinnerCapture.state().phase,
        paidActions: state.topology.actionLog.length - before,
        guardAI: actor.AI,
    };
})();
