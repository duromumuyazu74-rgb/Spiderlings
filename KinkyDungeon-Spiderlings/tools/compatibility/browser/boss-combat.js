(async () => {
    const { expect, turn, photo } = globalThis.normalAcceptance;
    globalThis.bossAcceptance.enter("boss-attack-cadence");
    let encounter = Spiderlings.BossEncounter.state();
    for (let index = 0; index < 24; index++) await turn();
    expect(
        encounter.history
            .filter((entry) => entry.kind === "support")
            .map((entry) => entry.name)
            .join(",") === "WebCaster,Jumper,MageSpiderlings",
        "Native support cycle lost a group: " + JSON.stringify(encounter.history),
    );
    expect(
        encounter.history.some((entry) => entry.name === "barrage"),
        "Body axis stopped while support was active",
    );
    const combat = await photo();
    globalThis.bossAcceptance.enter("boss-wall-support");
    encounter = Spiderlings.BossEncounter.state();
    const wallFormations = [];
    encounter.nextBody = encounter.nextPulse = 10000;
    encounter.warnings = [];
    for (const point of [
        { x: 3, y: 20 },
        { x: 37, y: 20 },
        { x: 20, y: 3 },
        { x: 20, y: 37 },
    ]) {
        for (const [index, name, count] of [
            [0, "WebCaster", 4],
            [1, "Jumper", 6],
            [2, "MageSpiderlings", 4],
        ]) {
            for (const enemy of [...KDMapData.Entities])
                if (enemy !== Spiderlings.BossEncounter.boss() && !Spiderlings.BossFootprint.isPart(enemy))
                    KDRemoveEntity(enemy, false, false, true);
            KDMovePlayer(point.x, point.y, false);
            encounter.supportIndex = index;
            encounter.nextSupport = encounter.clock;
            await turn();
            const members = KDMapData.Entities.filter(Spiderlings.BossEncounter.isFixedFormation);
            expect(members.length === count, `Incomplete ${name} formation at ${point.x},${point.y}`);
            expect(new Set(members.map((enemy) => `${enemy.x},${enemy.y}`)).size === count, "Support overlaps itself");
            expect(
                members.every((enemy) => Math.max(Math.abs(enemy.x - point.x), Math.abs(enemy.y - point.y)) >= 4),
                "Wall fallback placed support too close",
            );
            expect(
                members.filter((enemy) => enemy.x < point.x).length === count / 2,
                "Wall fallback lost the east/west formation",
            );
            if (name !== "Jumper")
                for (const dx of [-1, 1])
                    for (const dy of [-1, 1])
                        expect(
                            members.filter(
                                (enemy) => Math.sign(enemy.x - point.x) === dx && Math.sign(enemy.y - point.y) === dy,
                            ).length === 1,
                            "Wall fallback lost a quadrant",
                        );
            wallFormations.push({ player: point, name, positions: members.map(({ x, y }) => ({ x, y })) });
        }
    }
    globalThis.bossAcceptance.enter("boss-paid-rings");
    encounter = Spiderlings.BossEncounter.state();
    const boss = Spiderlings.BossEncounter.boss();
    boss.stun = 10000;
    encounter.nextBody = encounter.nextSupport = encounter.nextPulse = 10000;
    encounter.warnings = [];
    for (const enemy of [...KDMapData.Entities])
        if (enemy !== boss && !Spiderlings.BossFootprint.isPart(enemy) && !encounter.builderIds.includes(enemy.id))
            KDRemoveEntity(enemy, false, false, true);
    let complete = false,
        turns = 0;
    for (; turns < 400 && !complete; turns++) {
        await turn();
        const graph = Spiderlings.SpinnerNativeField.state()?.topology;
        const rings = Object.values(graph?.composites || {}).filter((ring) =>
            Spiderlings.BossFields.ownsComposite(ring.id),
        );
        complete =
            rings.length === 2 &&
            rings.every((ring) => ring.layerIds.every((id) => Spiderlings.SpinnerTopology.isLayerClosed(graph, id)));
    }
    expect(
        complete,
        "Eight builders did not finish two real paid rings: " +
            JSON.stringify({
                turns,
                ring: encounter.ringIndex,
                graph: Spiderlings.SpinnerNativeField.state()?.topology?.composites,
            }),
    );
    const walls = KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "SpiderlingsSpinnerTrap");
    expect(walls.length > 80, "Closed rings have no physical web projections");
    const fields = await photo();
    const snapshot = JSON.stringify(Spiderlings.SpinnerNativeField.state().topology);
    for (const id of encounter.builderIds) {
        const enemy = KDMapData.Entities.find((actor) => actor.id === id);
        if (enemy) KDRemoveEntity(enemy, false, false, true);
    }
    for (let n = 0; n < 5; n++) await turn();
    expect(
        !KDMapData.Entities.some((enemy) => encounter.builderIds.includes(enemy.id)),
        "Killed opening crew was replaced",
    );
    return {
        ok: true,
        scenario: "boss-combat",
        turns,
        walls: walls.length,
        retainedTopology: !!snapshot,
        wallFormations,
        images: { combat, fields },
        fixture:
            "Cadence runs normally; wall placement isolates one due formation; paid-ring fixture disables only Boss offense and removes support.",
    };
})();
