(async () => {
    const { setup, spawn, turn, frame, expect } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const equip = () => {
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsWebbingCocoon"), 0, false, "");
        const item = KinkyDungeonAllRestraintDynamic().find(
            ({ item }) => item.name === "SpiderlingsWebbingCocoon",
        )?.item;
        expect(item, "Cocoon vigil fixture could not equip its restraint");
        item.cutProgress = 0.4;
        return item;
    };
    const snapshot = (actor, cocoon) => ({
        tick: KinkyDungeonCurrentTick,
        x: actor.x,
        y: actor.y,
        idleTurns: KDMapData.SpiderlingsCocoonVigil?.idleTurns,
        dispersing: Spiderlings.Webbing.isCocoonDispersing(actor, KDPlayer()),
        cutProgress: cocoon.cutProgress,
        will: KinkyDungeonStatWill,
        distance: Math.hypot(actor.x - KDPlayer().x, actor.y - KDPlayer().y),
    });
    for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]) {
        setup(`cocoon-vigil-${name}`);
        const cocoon = equip();
        for (let i = 0; i < 24; i++) await turn();
        const actor = spawn(name, 5, 2, "Enemy");
        const row = { name, mode: "quiet-then-move", before: snapshot(actor, cocoon), casts: [], steps: [] };
        rows.push(row);
        expect(!row.before.dispersing, `${name} dispersed before the 25th quiet turn`);
        KDAddEvent(KDEventMapGeneric, "enemyCast", "CompatibilityCocoonVigil", (_event, data) => {
            if (data.enemy?.id === actor.id) row.casts.push({ spell: data.spell?.name, tick: KinkyDungeonCurrentTick });
        });
        try {
            for (let i = 0; i < 12; i++) {
                // Refill Will between turns to keep a regression from ending the fixture in defeat.
                // Spell selection, damage, repair and movement still run through native enemy AI.
                KinkyDungeonStatWill = KinkyDungeonStatWillMax;
                await turn();
                row.steps.push(snapshot(actor, cocoon));
            }
            expect(
                row.steps.every((step) => step.dispersing),
                `${name} did not disperse after 25 quiet turns`,
            );
            expect(row.casts.length === 0, `${name} cast at the passive Cocoon player: ${JSON.stringify(row)}`);
            expect(
                row.steps.every((step) => step.cutProgress === 0.4),
                `${name} repaired passive Cocoon progress`,
            );
            expect(
                row.steps.every((step) => step.will === KinkyDungeonStatWillMax),
                `${name} damaged the passive Cocoon player`,
            );
            expect(row.steps.at(-1).distance >= 4, `${name} never took native steps away from the Cocoon`);
            KinkyDungeonMove({ x: 1, y: 0 }, 1, false, true);
            await frame();
            row.resumed = snapshot(actor, cocoon);
            expect(!row.resumed.dispersing && row.resumed.idleTurns < 25, `${name} ignored resumed player movement`);
            if (name === "MageSpiderlings") {
                for (let i = 0; i < 12 && !row.casts.length; i++) await turn();
                expect(row.casts.length > 0, "Mage did not resume native casting after player activity");
                row.resumedCasts = [...row.casts];
            }
        } finally {
            delete KDEventMapGeneric.enemyCast.CompatibilityCocoonVigil;
        }
    }
    setup("cocoon-vigil-field-guard-orders");
    KDMapData.GridWidth = 24;
    KDMapData.GridHeight = 20;
    KDMapData.Grid =
        Array.from({ length: 20 }, (_, y) =>
            Array.from({ length: 24 }, (_, x) => (x && y && x < 23 && y < 19 ? "0" : "1")).join(""),
        ).join("\n") + "\n";
    KDMapData.Tiles = {};
    KDMapData.StartPosition = { x: 1, y: 1 };
    KDMapData.EndPosition = { x: 22, y: 1 };
    KDMovePlayer(12, 10, false);
    equip();
    for (let i = 0; i < 24; i++) await turn();
    const controlled = [
        spawn("Spinner", 11, 9),
        spawn("Spinner", 11, 10),
        spawn("Spinner", 13, 10),
        spawn("WebCaster", 13, 9),
    ];
    for (const actor of controlled) {
        actor.AI = "guard";
        actor.hostile = 999;
    }
    globalThis.normalAcceptance.addDisabledSpinnerReserves();
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    expect(
        Object.values(Spiderlings.FieldCommand.inspect().members).length >= 3,
        "Field vigil fixture did not assign real Spinner commanders",
    );
    expect(
        Object.values(Spiderlings.SpinnerNativeField.state().ai.plans).some(
            (plan) => !["invalid", "abandoned", "retired"].includes(plan.status),
        ),
        "Field vigil fixture did not retain an actual field order",
    );
    const fieldSteps = [];
    for (let i = 0; i < 40; i++) {
        await turn();
        fieldSteps.push(
            controlled.map((actor) => ({
                id: actor.id,
                distance: Math.hypot(actor.x - KDPlayer().x, actor.y - KDPlayer().y),
                dispersing: Spiderlings.Webbing.isCocoonDispersing(actor, KDPlayer()),
            })),
        );
    }
    expect(
        fieldSteps.at(-1).every((actor) => actor.dispersing && actor.distance >= 4),
        "Guard/field orders kept spiders around the quiet Cocoon",
    );
    rows.push({ mode: "field-guard-orders", steps: fieldSteps });
    setup("cocoon-vigil-pending-webcaster");
    const cocoon = equip();
    for (let i = 0; i < 25; i++) await turn();
    // Persisted pending reinforcement represents three earlier paid resistance intents.
    // The hit and anchoring below must come from the real WebCaster, not an injected effect.
    cocoon.data.SpiderlingsCocoonOuterWebs = { anchored: false, reinforcementPending: true, attemptAges: [] };
    const caster = spawn("WebCaster", 5, 2, "Enemy");
    const pending = { name: "WebCaster", mode: "pending-reinforcement", steps: [] };
    rows.push(pending);
    expect(
        !Spiderlings.Webbing.isCocoonDispersing(caster, KDPlayer()),
        "Pending WebCaster reinforcement was suppressed",
    );
    for (let i = 0; i < 20 && !cocoon.data.SpiderlingsCocoonOuterWebs.anchored; i++) {
        KinkyDungeonStatWill = KinkyDungeonStatWillMax;
        await turn();
        pending.steps.push(snapshot(caster, cocoon));
    }
    expect(cocoon.data.SpiderlingsCocoonOuterWebs.anchored, "Pending WebCaster never landed its native anchoring hit");
    expect(
        Spiderlings.Webbing.isCocoonDispersing(caster, KDPlayer()),
        "Reinforced WebCaster did not return to dispersal",
    );
    return { rows };
})();
