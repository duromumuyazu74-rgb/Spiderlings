(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance,
        native = Spiderlings.SpinnerNativeField,
        capture = Spiderlings.SpinnerCapture,
        ai = Spiderlings.SpinnerAI,
        rows = (globalThis.normalTrace = []);
    for (const damage of [0.5, 100]) {
        setup(`spinner-maintenance-${damage}`);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(14, 10, false);
        const actors = [spawn("Spinner", 13, 10), spawn("Spinner", 15, 10)],
            row = { damage, actions: [], turns: [] };
        rows.push(row);
        for (const actor of actors) actor.hostile = 999;
        native.initializeEnclosure({
            compositeId: "maintenance-home",
            owners: actors.map((actor) => actor.id),
            built: true,
            autoSeal: true,
            layers: [
                {
                    id: "maintenance-ring",
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
        // Adopt a retained paid field into the real autonomous dispatcher.
        native.state().builders = {};
        ai.beginTurn({ activate: true, adoptExisting: true });
        expect(capture.hit(actors[0]), "The closed field must admit Capture through an actual hit");
        KinkyDungeonEnemyLoop(actors[1], KDPlayer(), 1, 1, []);
        expect(capture.state().sourceIds.length === 2, "Both workers must start as actual Capture sources");
        capture.state().weaveProgress = 10;
        capture.state().escapeProgress = 7;
        const proxy = KDMapData.Entities.find((actor) => native.isOwnedProxy(actor) && actor.x === 18 && actor.y === 9);
        expect(proxy, "Damage fixture needs a real projected web cell");
        native.onNativeDamage({ enemy: proxy, dmgDealt: damage });
        const damagedLinkId = native.state().topology.links.find((link) => link.hp < link.maxHp).id;
        const snapshot = () =>
            JSON.stringify({
                capture: capture.state(),
                links: native.state().topology.links.map(({ id, hp, cooldown, builtCells, connected }) => ({
                    id,
                    hp,
                    cooldown,
                    builtCells,
                    connected,
                })),
                actors: KDMapData.Entities.filter((actor) => actor.Enemy.name === "Spinner").map(
                    ({ id, x, y, SpinnerConstructionPoints }) => ({ id, x, y, SpinnerConstructionPoints }),
                ),
            });
        KinkyDungeonDressPlayer();
        UpdateModels(KinkyDungeonPlayer);
        DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
        const before = snapshot();
        restore(save());
        expect(snapshot() === before, "Zero-time load must not release Capture sources or repair web damage");
        const apply = native.applyPaidAction;
        native.applyPaidAction = function (actor, action) {
            const result = apply.apply(this, arguments);
            row.actions.push({
                source: actor.id,
                type: action.type,
                cell: action.cell,
                applied: result.applied,
                activeCapture: !!capture.state(),
                sources: capture.state()?.sourceIds.length || 0,
            });
            return result;
        };
        try {
            for (let tick = 0; tick < 100; tick++) {
                await turn();
                if (
                    damage >= 100 &&
                    !row.midReload &&
                    row.actions.some((action) => action.applied && action.activeCapture)
                ) {
                    const savedWork = snapshot(),
                        savedJob = JSON.stringify(Object.values(native.state().ai.groups)[0]?.maintenance);
                    restore(save());
                    expect(
                        snapshot() === savedWork,
                        "Reload during rebuild must preserve damage, Capture progress and paid position",
                    );
                    expect(
                        JSON.stringify(Object.values(native.state().ai.groups)[0]?.maintenance) === savedJob,
                        "Reload must retain the maintenance member for later extension",
                    );
                    row.midReload = true;
                }
                const link = native.state().topology.links.find((entry) => entry.id === damagedLinkId);
                row.turns.push({
                    tick,
                    hp: link.hp,
                    connected: link.connected,
                    cells: link.builtCells.length,
                    maintenance: structuredClone(Object.values(native.state().ai.groups)[0]?.maintenance),
                    sources: capture.state()?.sourceIds,
                    assignments: structuredClone(Object.values(native.state().ai.groups)[0]?.assignments),
                });
                if (link.hp === link.maxHp && native.captureGeometryReady(KDPlayer())) break;
            }
        } finally {
            native.applyPaidAction = apply;
        }
        expect(
            row.actions.some((action) => action.applied && action.activeCapture && action.sources >= 1),
            `Capture starved paid maintenance: ${JSON.stringify(row)}`,
        );
        const link = native.state().topology.links.find((entry) => entry.id === damagedLinkId);
        if (damage >= 100)
            expect(
                row.actions.some((action) => action.applied && action.activeCapture && action.type === "extendLink"),
                "A destroyed multi-cell link must retain paid extension after its first rebuilt cell during Capture",
            );
        expect(
            link.hp === link.maxHp && native.captureGeometryReady(KDPlayer()),
            `The retained crew did not repair and close its field: ${JSON.stringify(row)}`,
        );
        expect(
            row.actions.filter((action) => action.activeCapture).every((action) => action.sources >= 1),
            "Repair must preserve an effective Capture source",
        );
        capture.cancel();
    }
    setup("npc-capture-maintenance-loan");
    for (let y = 1; y < KDMapData.GridHeight - 1; y++)
        for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMovePlayer(22, 16, false);
    const sources = [spawn("Spinner", 13, 10), spawn("Spinner", 15, 10)],
        target = spawn("MaidKnightHeavy", 14, 10, "Maidforce"),
        command = Spiderlings.FieldCommand,
        npcCapture = Spiderlings.SpinnerNPCCapture,
        support = { mode: "npc-capture-maintenance-loan", actions: [], turns: [] };
    rows.push(support);
    for (const source of sources) {
        source.hostile = 999;
        source.Enemy = { ...source.Enemy, maxhp: 20 };
        source.hp = 20;
    }
    target.movePoints = -100;
    target.castCooldown = 999;
    target.disarm = 999;
    native.initializeEnclosure({
        compositeId: "npc-maintenance-home",
        owners: sources.map((source) => source.id),
        built: true,
        autoSeal: true,
        layers: [
            {
                id: "npc-maintenance-ring",
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
    ai.beginTurn({ activate: true, adoptExisting: true });
    for (let attempt = 0; attempt < 20 && !npcCapture.usesSource(sources[0].id); attempt++) {
        await turn();
    }
    expect(
        npcCapture.usesSource(sources[0].id),
        `An actual silk hit did not begin NPC Capture: ${JSON.stringify({ target: { x: target.x, y: target.y, bound: target.boundLevel }, source: sources[0], records: npcCapture.records() })}`,
    );
    target.stun = 999;
    KinkyDungeonEnemyLoop(sources[1], target, 1, 1, []);
    expect(
        sources.every((source) => npcCapture.usesSource(source.id)),
        "Both local workers must hold actual NPC Capture",
    );
    const donors = [spawn("Spinner", 19, 9), spawn("Spinner", 19, 11)],
        encounter = native.state(),
        donorGroup = command.newGroup(encounter.ai, donors);
    for (const donor of donors) {
        donor.hostile = 999;
        encounter.command.members[donor.id] = {
            id: donor.id,
            home: donorGroup.id,
            commander: donorGroup.id,
            phase: "home",
        };
    }
    command.projectOwners(encounter);
    const damagedProxy = KDMapData.Entities.find(
        (actor) => native.isOwnedProxy(actor) && actor.x === 18 && actor.y === 9,
    );
    expect(damagedProxy, "NPC maintenance needs a real paid wall proxy");
    native.onNativeDamage({ enemy: damagedProxy, dmgDealt: 0.5 });
    const damagedId = encounter.topology.links.find((link) => link.hp < link.maxHp).id,
        paid = native.applyPaidAction;
    native.applyPaidAction = function (actor, action) {
        const result = paid.apply(this, arguments);
        support.actions.push({
            source: actor.id,
            type: action.type,
            applied: result.applied,
            protectedSources: sources.filter((source) => npcCapture.usesSource(source.id)).length,
            loan: command.inspect().members[actor.id]?.loan,
        });
        return result;
    };
    try {
        for (let tick = 0; tick < 30; tick++) {
            await turn();
            const link = native.state().topology.links.find((entry) => entry.id === damagedId);
            support.turns.push({
                tick,
                hp: link.hp,
                requests: structuredClone(command.inspect().requests),
                members: structuredClone(command.inspect().members),
                donors: donors.map((donor) => ({ id: donor.id, x: donor.x, y: donor.y, points: donor.movePoints })),
                assignments: structuredClone(Object.values(native.state().ai.groups).map((group) => group.assignments)),
            });
            if (link.hp === link.maxHp) break;
        }
        expect(
            support.actions.some((action) => action.applied && action.loan && action.protectedSources === 2),
            `NPC Capture did not receive paid borrowed maintenance: ${JSON.stringify(support)}`,
        );
        expect(
            native.state().topology.links.find((entry) => entry.id === damagedId).hp ===
                native.state().topology.links.find((entry) => entry.id === damagedId).maxHp,
            "Borrowed maintenance did not finish the damaged NPC Capture wall",
        );
    } finally {
        native.applyPaidAction = paid;
    }
    setup("sole-builder-personal-contact");
    KDMovePlayer(20, 16, false);
    const worker = spawn("Spinner", 10, 10),
        prey = spawn("MaidKnightHeavy", 16, 10, "Maidforce"),
        construction = { mode: "sole-builder-contact", actions: [], turns: [] };
    rows.push(construction);
    prey.stun = 999;
    ai.beginTurn({ activate: true });
    const apply = native.applyPaidAction;
    native.applyPaidAction = function (actor, action) {
        const result = apply.apply(this, arguments);
        if (actor.id === worker.id && result.applied)
            construction.actions.push({ type: action.type, cell: action.cell });
        return result;
    };
    try {
        for (let tick = 0; tick < 24; tick++) {
            await turn();
            const group = Object.values(native.state().ai.groups).find((entry) => entry.memberIds.includes(worker.id));
            construction.turns.push({
                tick,
                x: worker.x,
                y: worker.y,
                lure: group.engagement?.lureId,
                actions: construction.actions.length,
            });
            if (tick === 8) {
                const before = JSON.stringify({
                    x: worker.x,
                    y: worker.y,
                    points: worker.SpinnerConstructionPoints,
                    topology: native.state().topology,
                });
                restore(save());
                const restored = KDMapData.Entities.find((entry) => entry.id === worker.id);
                expect(
                    JSON.stringify({
                        x: restored.x,
                        y: restored.y,
                        points: restored.SpinnerConstructionPoints,
                        topology: native.state().topology,
                    }) === before,
                    "Zero-time load changed sole-builder paid work",
                );
            }
        }
        expect(construction.actions.length > 0, "Personal NPC contact consumed every construction turn");
    } finally {
        native.applyPaidAction = apply;
    }
    return { rows };
})();
