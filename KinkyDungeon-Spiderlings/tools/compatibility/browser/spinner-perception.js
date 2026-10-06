(async () => {
    const { setup, spawn, turn, expect } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const room = () => {
        KDMapData.GridWidth = 36;
        KDMapData.GridHeight = 24;
        KDMapData.Grid =
            Array.from({ length: 24 }, (_, y) =>
                Array.from({ length: 36 }, (_, x) => (x && y && x < 35 && y < 23 ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.StartPosition = { x: 2, y: 2 };
        KDMapData.EndPosition = { x: 33, y: 21 };
        KDMapData.Tiles = {};
        KinkyDungeonPlayerBuffs = {};
        KDUpdateEnemyCache = true;
    };
    const actors = (reverse) => {
        const scout = spawn("Spinner", 7, 10),
            helper = spawn("Spinner", 3, 10);
        for (const actor of [scout, helper]) {
            actor.aware = false;
            actor.hostile = 999;
            actor.vp = 0;
        }
        KDMovePlayer(14, 10, false);
        KinkyDungeonPlayerEntity.sound = 0;
        const ratio = globalThis.KinkyDungeonTrackSneak({ ...scout, vp: 1 }, 0, KinkyDungeonPlayerEntity);
        expect(ratio > 0, "Native sneak threshold could not be sampled");
        scout.vp = 0.7 / ratio;
        KDMapData.Entities = reverse ? [helper, scout] : [scout, helper];
        KDUpdateEnemyCache = true;
        return { scout, helper };
    };
    for (const reverse of [false, true]) {
        setup(`spinner-perception-${reverse}`);
        room();
        const { scout, helper } = actors(reverse),
            before = JSON.stringify([scout, helper]),
            flags = JSON.stringify([...KinkyDungeonFlags]);
        expect(scout.Enemy.visionRadius === 8, "Spinner still uses the old five-cell visual radius");
        expect(
            KinkyDungeonCheckLOS(scout, KinkyDungeonPlayerEntity, 7, 8, true, true),
            "Native seven-cell visual contact fixture is occluded",
        );
        const ai = Spiderlings.SpinnerAI.beginTurn({ activate: true }),
            encounter = Spiderlings.SpinnerNativeField.state(),
            group = Object.values(ai.groups).find((entry) => entry.memberIds.includes(scout.id)),
            observation = Spiderlings.SpinnerAI.groupObservation(group);
        const members = Spiderlings.FieldCommand.inspect().members;
        expect(
            members[scout.id]?.home && members[scout.id].home === members[helper.id]?.home,
            "Nearby helper lost the scout's original team ownership",
        );
        expect(observation?.x === 14 && observation.y === 10, "Planning did not receive recognized contact");
        expect(group.planId, "The recognized team's first planning batch did not select a site");
        expect(JSON.stringify([scout, helper]) === before, "Planning observation mutated native entity state");
        expect(JSON.stringify([...KinkyDungeonFlags]) === flags, "Planning observation wrote native global flags");
        expect(!scout.aware && !helper.aware, "Sharing a contact granted native awareness");
        const plan = ai.plans[group.planId];
        rows.push({ reverse, observation, plan: structuredClone(plan), vp: scout.vp });

        KDMovePlayer(13, 10, false);
        Spiderlings.SpinnerAI.refreshObservations(encounter, 1);
        expect(Spiderlings.SpinnerAI.groupObservation(group)?.dx === -1, "Recognized movement omitted its direction");
        const historical = structuredClone(Spiderlings.SpinnerAI.groupObservation(group));
        KDMovePlayer(28, 10, false);
        KinkyDungeonPlayerEntity.sound = 0;
        Spiderlings.SpinnerAI.refreshObservations(encounter, 1);
        expect(
            JSON.stringify(Spiderlings.SpinnerAI.groupObservation(group)) === JSON.stringify(historical),
            "Hidden movement refreshed the team's precise player position",
        );
        const zeroBefore = JSON.stringify(group.engagement);
        Spiderlings.SpinnerAI.refreshObservations(encounter, 0);
        Spiderlings.SpinnerAI.completePositiveTurn(0);
        KinkyDungeonAdvanceTime(0, true);
        expect(JSON.stringify(group.engagement) === zeroBefore, "Zero time advanced shared contact state");
        for (let count = 0; count < 4; count++) Spiderlings.SpinnerAI.completePositiveTurn(1);
        expect(!Spiderlings.SpinnerAI.groupObservation(group), "Hidden position remained available after four turns");
        rows.at(-1).hiddenHistory = historical;
        rows.at(-1).expired = true;
    }

    setup("spinner-perception-native-gates");
    room();
    const { scout } = actors(false);
    scout.vp = 0;
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    const encounter = Spiderlings.SpinnerNativeField.state(),
        group = Object.values(encounter.ai.groups).find((entry) => entry.memberIds.includes(scout.id));
    expect(!Spiderlings.SpinnerAI.groupObservation(group), "An unrecognized player bypassed native stealth");
    const thresholdRatio = globalThis.KinkyDungeonTrackSneak({ ...scout, vp: 1 }, 0, KinkyDungeonPlayerEntity);
    scout.vp = 0.7 / thresholdRatio;
    for (let y = 1; y < 23; y++) KinkyDungeonMapSet(10, y, "1");
    expect(
        !KinkyDungeonCheckLOS(scout, KinkyDungeonPlayerEntity, 7, 8, true, true),
        "Native wall fixture does not block the scout",
    );
    expect(!globalThis.KDCanHearEnemy(scout, KinkyDungeonPlayerEntity, 1), "Silent wall fixture has an audible player");
    Spiderlings.SpinnerAI.refreshObservations(encounter, 1);
    expect(!Spiderlings.SpinnerAI.groupObservation(group), "A wall and silent target supplied exact coordinates");
    rows.push({ nativeStealthRejected: true, nativeWallRejected: true, silentHearingRejected: true });

    for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "NestEntrance", "MageSpiderlings"]) {
        setup(`spinner-shared-${name}`);
        room();
        const reporter = spawn(name, 24, 10),
            recipient = spawn("Spinner", 3, 10);
        KDMapData.Entities = [recipient, reporter];
        for (const actor of [reporter, recipient]) {
            actor.aware = false;
            actor.hostile = 999;
            actor.vp = 0;
        }
        KDMovePlayer(29, 10, false);
        KinkyDungeonPlayerEntity.sound = 0;
        const ratio = globalThis.KinkyDungeonTrackSneak({ ...reporter, vp: 1 }, 0, KinkyDungeonPlayerEntity);
        reporter.vp = 0.7 / ratio;
        KDUpdateEnemyCache = true;
        const before = JSON.stringify([reporter, recipient]),
            ai = Spiderlings.SpinnerAI.beginTurn({ activate: true }),
            group = Object.values(ai.groups).find((entry) => entry.memberIds.includes(recipient.id)),
            report = Spiderlings.SpinnerAI.playerObservation();
        expect(report?.x === 29 && report.reporterId === reporter.id, `${name} did not publish native contact`);
        expect(Spiderlings.SpinnerAI.groupObservation(group)?.x === 29, `${name} did not reach a remote crew`);
        expect(
            group.engagement.lureId === undefined || group.memberIds.includes(group.engagement.lureId),
            "Remote reporter replaced the recipient's lure",
        );
        expect(!recipient.aware && recipient.vp === 0, "Remote sharing granted individual awareness");
        expect(JSON.stringify([reporter, recipient]) === before, "Sharing mutated native observers");
        rows.push({ species: name, reporterId: reporter.id, recipientId: recipient.id, report });
    }

    setup("spinner-shared-first-native-recognition");
    room();
    const tunneler = spawn("Tunneler", 24, 10),
        remote = spawn("Spinner", 3, 10);
    KDMapData.Entities = [remote, tunneler];
    KDUpdateEnemyCache = true;
    KDMovePlayer(26, 10, false);
    KinkyDungeonPlayerEntity.sound = 0;
    for (const actor of [tunneler, remote]) {
        actor.aware = false;
        actor.hostile = 999;
        actor.vp = 0;
    }
    const ratio = globalThis.KinkyDungeonTrackSneak({ ...tunneler, vp: 1 }, 0, KinkyDungeonPlayerEntity);
    tunneler.vp = 0.49 / ratio;
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    expect(!Spiderlings.SpinnerAI.playerObservation(), "Partial recognition published too early");
    KinkyDungeonAdvanceTime(1, true);
    const firstReport = Spiderlings.SpinnerAI.playerObservation();
    expect(
        firstReport?.reporterId === tunneler.id,
        `Native wander first recognition did not publish this turn: ${JSON.stringify({ firstReport, vp: tunneler.vp, aware: tunneler.aware, x: tunneler.x, y: tunneler.y, disabled: KinkyDungeonIsDisabled(tunneler), player: { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y }, command: Spiderlings.FieldCommand.inspect().regions })}`,
    );
    expect(!remote.aware, "Native first recognition granted remote Spinner awareness");
    rows.push({ firstNativeRecognition: true, report: firstReport, nativeVP: tunneler.vp });

    setup("spinner-shared-sole-builder");
    room();
    // Keep personal LOS absent while the remote report persists. Both native
    // map endpoints belong to the builder's component, so its field is legal.
    for (let y = 1; y < 23; y++) KinkyDungeonMapSet(20, y, "1");
    KDMapData.EndPosition = { x: 18, y: 21 };
    KDPathCache = new Map();
    KDPathCacheIgnoreLocks = new Map();
    KDMovePlayer(29, 10, false);
    KinkyDungeonPlayerEntity.sound = 0;
    const builder = spawn("Spinner", 3, 10);
    builder.aware = false;
    builder.vp = 0;
    builder.hostile = 999;
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    for (let tick = 0; tick < 40; tick++) {
        await turn();
        if (Spiderlings.SpinnerNativeField.state()?.topology?.actionLog.length > 0) break;
    }
    const paidBeforeReport = Spiderlings.SpinnerNativeField.state()?.topology?.actionLog.length || 0;
    expect(paidBeforeReport > 0, "The native fixture did not establish partial enclosure work");
    const reporter = spawn("Jumper", 24, 10),
        reporterRatio = globalThis.KinkyDungeonTrackSneak({ ...reporter, vp: 1 }, 0, KinkyDungeonPlayerEntity);
    reporter.hostile = 999;
    reporter.aware = false;
    reporter.vp = 0.7 / reporterRatio;
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    let constructionTurns = 0;
    for (; constructionTurns < 60; constructionTurns++) {
        reporter.x = 24;
        reporter.y = 10;
        reporter.aware = false;
        reporter.vp = 0.7 / reporterRatio;
        KDUpdateEnemyCache = true;
        await turn();
        if (Spiderlings.SpinnerNativeField.state().topology.actionLog.length > paidBeforeReport) break;
    }
    const solo = Spiderlings.SpinnerNativeField.state(),
        soloGroup = Object.values(solo.ai.groups).find((entry) => entry.memberIds.includes(builder.id));
    expect(Spiderlings.SpinnerAI.playerObservation(), "The sole-builder fixture lost its remote report");
    expect(solo.ai.plans[soloGroup.planId]?.kind === "enclosure", "The sole builder did not plan an enclosure");
    expect(
        solo.topology.actionLog.length > paidBeforeReport,
        "Remote contact starved the sole builder's native paid construction",
    );
    expect(!builder.aware, "The sole-builder fixture gained personal recognition");
    expect(soloGroup.engagement.lureId === undefined, "An unfinished enclosure lost its only builder to luring");
    rows.push({
        soleSharedBuilder: true,
        constructionTurns: constructionTurns + 1,
        paidBeforeReport,
        paidActions: solo.topology.actionLog.length,
        group: structuredClone(soloGroup),
    });

    setup("spinner-npc-awareness-pressure");
    room();
    // One legal enclosure keeps this contact crew staffed. Spare crews and
    // parallel construction are exercised in the command/work scenarios.
    for (let y = 1; y < 23; y++)
        for (let x = 1; x < 35; x++) if (x < 5 || x > 15 || y < 6 || y > 14) KinkyDungeonMapSet(x, y, "1");
    KDMapData.StartPosition = { x: 5, y: 6 };
    KDMapData.EndPosition = { x: 15, y: 14 };
    KDPathCache = new Map();
    KDPathCacheIgnoreLocks = new Map();
    const pressure = actors(false);
    pressure.helper.x = 6;
    KDUpdateEnemyCache = true;
    Spiderlings.SpinnerAI.beginTurn({ activate: true });
    // Planning can reassign a crew while comparing distant enclosure sites.
    // Establish recognized contact after that batch before testing NPC-only awareness.
    expect(
        Spiderlings.SpinnerAI.reportPlayerContact(
            pressure.scout,
            KinkyDungeonPlayerEntity,
            { canSensePlayer: true, canSeePlayer: true, hostile: true },
            1,
        ),
        "The pressure fixture did not publish native recognized contact",
    );
    const pressureState = Spiderlings.SpinnerNativeField.state(),
        pressureGroup = Object.values(pressureState.ai.groups).find((entry) =>
            entry.memberIds.includes(pressure.scout.id),
        ),
        historical = Spiderlings.SpinnerAI.playerObservation(),
        destinations = [],
        nativePath = globalThis.KinkyDungeonFindPath;
    pressure.scout.aware = true;
    pressure.scout.vp = 0;
    pressure.scout.movePoints = 1.5;
    expect(pressureGroup.engagement, "The pressure fixture has no recognized engagement");
    pressureGroup.engagement.mode = "pressure";
    pressureGroup.engagement.lureId = pressure.scout.id;
    KDMovePlayer(7, 13, false);
    KinkyDungeonPlayerEntity.sound = 0;
    globalThis.KinkyDungeonFindPath = function (fromX, fromY, toX, toY) {
        destinations.push({ x: toX, y: toY });
        return nativePath.apply(this, arguments);
    };
    try {
        KinkyDungeonCurrentTick += 1;
        pressure.scout.SpiderlingsSpinnerRuntimeDelta = 1;
        Spiderlings.SpinnerAI.handleBeforeMove(pressure.scout, KinkyDungeonPlayerEntity, {
            canSensePlayer: true,
            canSeePlayer: true,
            hostile: true,
        });
    } finally {
        globalThis.KinkyDungeonFindPath = nativePath;
    }
    expect(
        destinations.length > 0 && destinations.every((point) => point.x === historical.x && point.y === historical.y),
        `NPC awareness used an unrecognized live position: ${JSON.stringify(destinations)}`,
    );
    expect(
        JSON.stringify(Spiderlings.SpinnerAI.playerObservation()) === JSON.stringify(historical),
        "NPC awareness refreshed the recognized player report",
    );
    rows.push({ npcAwarenessPressure: true, historical, destinations });
    return { rows };
})();
