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
        images: { combat, fields },
        fixture: "Cadence runs normally; paid-ring fixture disables only Boss offense and removes support.",
    };
})();
