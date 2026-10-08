(async () => {
    const { setup, spawn, turn, expect } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const nativeAttack = KinkyDungeonEnemyTryAttack;
    const nativeConstruction = Spiderlings.SpinnerNativeField.applyPaidAction;
    const nativeAccrue = Spiderlings.SpinnerNativeField.accrueConstructionAction;
    let row, source, tick;
    KinkyDungeonEnemyTryAttack = function (actor) {
        const result = nativeAttack.apply(this, arguments);
        if (row?.action === "melee" && actor === source)
            row.attacks.push({ tick, completed: result, attackPoints: actor.attackPoints });
        return result;
    };
    Spiderlings.SpinnerNativeField.applyPaidAction = function (actor, action) {
        const result = nativeConstruction.apply(this, arguments);
        if (row?.action === "construction" && actor === source)
            row.construction.push({ tick, type: action.type, applied: result.applied, reason: result.reason });
        return result;
    };
    Spiderlings.SpinnerNativeField.accrueConstructionAction = function (actor, delta) {
        const before = actor.SpinnerConstructionPoints || 0;
        const result = nativeAccrue.apply(this, arguments);
        if (row?.action === "construction" && actor === source)
            row.workOpportunities.push({
                tick,
                delta,
                before,
                after: actor.SpinnerConstructionPoints,
                paid: result,
                web: Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(actor),
            });
        return result;
    };
    // Both rows have the same planned line. Only its physical completion differs.
    const prepareLine = (actor, built, start, end) => {
        const state = Spiderlings.SpinnerNativeField.initializeMap({
            fieldId: "cadence-standing-web",
            owners: [actor.id],
            anchors: [start, end],
        });
        if (built) {
            const actions = [
                ...state.topology.anchors.map((anchor) => ({ type: "placeAnchor", anchorId: anchor.id, cell: anchor })),
                ...state.topology.links[0].plannedCells.map((cell) => ({
                    type: "extendLink",
                    linkId: state.topology.links[0].id,
                    cell,
                })),
            ];
            for (const action of actions) {
                const result = Spiderlings.SpinnerTopology.applyAction(
                    state.topology,
                    { ...action, ownerId: actor.id },
                    Spiderlings.SpinnerNativeField.snapshot(action.cell),
                );
                expect(result.outcome.legal, "Standing web fixture was rejected");
                state.topology = result.state;
            }
            Spiderlings.SpinnerNativeField.reconcile();
        }
        expect(
            Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(actor) === built,
            "Stationary action comparison has the wrong web state",
        );
        return state;
    };
    try {
        for (const action of ["melee", "construction"]) {
            for (const web of [false, true]) {
                row = undefined;
                setup(`action-cadence-${action}`);
                KDMovePlayer(action === "melee" ? 13 : 28, action === "melee" ? 10 : 18, false);
                source = spawn("Spinner", 12, 10);
                source.hostile = 999;
                source.attackPoints = 0;
                source.movePoints = 0;
                source.SpinnerConstructionPoints = 0;
                prepareLine(source, web, { x: 12, y: 8 }, { x: 12, y: 12 });
                if (action === "construction") {
                    source.aware = false;
                    source.vp = 0;
                    globalThis.normalAcceptance.prepareCrew({ actors: [source], fieldPermits: 1 });
                    Spiderlings.SpinnerAI.beginTurn({ activate: true });
                }
                KDUpdateEnemyCache = true;
                KDsetSeed(`action-cadence-${action}`);
                row = {
                    action,
                    web,
                    cadenceUnit: action === "construction" ? "stationary work opportunity" : "world turn",
                    attacks: [],
                    construction: [],
                    workOpportunities: [],
                    exits: [],
                    turns: [],
                };
                rows.push(row);
                for (tick = 1; tick <= (action === "construction" ? 180 : 18); tick++) {
                    await turn();
                    row.turns.push({
                        tick,
                        x: source.x,
                        y: source.y,
                        attackPoints: source.attackPoints,
                        movePoints: source.movePoints,
                        constructionPoints: source.SpinnerConstructionPoints,
                        webCredit: source.SpiderlingsWebMoveCredit || 0,
                        standingOnWeb: Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(source),
                    });
                    if (
                        action === "construction" &&
                        row.construction.filter((entry) => entry.applied).length >= 30 &&
                        row.workOpportunities.filter((entry) => entry.web).length >= 5 &&
                        row.workOpportunities.filter((entry) => !entry.web).length >= 5
                    )
                        break;
                }
                expect(
                    action === "construction" || row.turns.every((entry) => entry.x === 12 && entry.y === 10),
                    `Stationary ${action} fixture moved: ${JSON.stringify(row)}`,
                );
                expect(
                    action === "construction" || row.turns.every((entry) => entry.standingOnWeb === web),
                    "Physical web state changed during stationary action comparison",
                );
                if (action === "melee") {
                    row.cadenceIndices = row.attacks.filter((entry) => entry.completed).map((entry) => entry.tick);
                    expect(row.cadenceIndices.length >= 5, "Native melee did not repeatedly complete");
                } else if (action === "construction") {
                    // Travel and selected geometry can change total elapsed time. Compare actual work
                    // opportunities, recording both web and ordinary cells within each native AI run.
                    row.cadenceIndices = row.workOpportunities.flatMap((entry, index) =>
                        entry.paid ? [index + 1] : [],
                    );
                    row.paidWorldTurns = row.construction.filter((entry) => entry.applied).map((entry) => entry.tick);
                    expect(
                        row.construction.filter((entry) => entry.applied).length >= 30,
                        `Native autonomous construction did not finish thirty operations: ${JSON.stringify(row)}`,
                    );
                    expect(
                        row.workOpportunities.filter((entry) => entry.web).length >= 5 &&
                            row.workOpportunities.filter((entry) => !entry.web).length >= 5,
                        "Autonomous construction did not sample both web and ordinary work cells",
                    );
                    expect(
                        row.workOpportunities.every(
                            (entry) =>
                                entry.delta === 1 &&
                                entry.after === entry.before + 1 - (entry.paid ? source.Enemy.movePoints : 0),
                        ),
                        "Autonomous construction used movement acceleration in its work budget",
                    );
                }
            }
            const [plain, web] = rows.slice(-2);
            // Geometry can require extra work opportunities to sample both kinds of floor.
            // Compare equal observation windows; each full trace still checks every native credit/debit above.
            const opportunities = Math.min(plain.workOpportunities.length, web.workOpportunities.length),
                comparable = (entry) =>
                    action === "construction"
                        ? entry.cadenceIndices.filter((index) => index <= opportunities)
                        : entry.cadenceIndices;
            expect(
                JSON.stringify(comparable(plain)) === JSON.stringify(comparable(web)),
                `Web movement changed native ${action} cadence: ${JSON.stringify({ plain: plain.cadenceIndices, web: web.cadenceIndices })}`,
            );
        }
    } finally {
        KinkyDungeonEnemyTryAttack = nativeAttack;
        Spiderlings.SpinnerNativeField.applyPaidAction = nativeConstruction;
        Spiderlings.SpinnerNativeField.accrueConstructionAction = nativeAccrue;
    }
    return { rows };
})();
