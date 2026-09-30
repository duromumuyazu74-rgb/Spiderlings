(() => {
    const { setup, spawn, expect } = globalThis.normalAcceptance;
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
        expect(group.memberIds.includes(helper.id), "Nearby helper did not retain the scout's team");
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
    return { rows };
})();
