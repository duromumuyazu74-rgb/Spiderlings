(async () => {
    const { setup, spawn, line, turn, expect } = globalThis.normalAcceptance;
    setup("native-breach-choice");
    for (let y = 1; y < KDMapData.GridHeight - 1; y++)
        for (let x = 1; x < KDMapData.GridWidth - 1; x++)
            KinkyDungeonMapSet(x, y, y === 10 || (x === 12 && y >= 8 && y <= 12) || (x === 2 && y === 2) ? "0" : "1");
    const owner = spawn("Spinner", 18, 10);
    owner.stun = 999;
    const maid = spawn("MaidKnightHeavy", 10, 10, "Maidforce");
    line(owner, { x: 12, y: 8 }, { x: 12, y: 12 });
    const trace = (globalThis.normalTrace = []),
        hits = [];
    trace.push({
        initial: KDMapData.Entities.map((e) => ({
            name: e.Enemy.name,
            x: e.x,
            y: e.y,
            noAttack: e.Enemy.noAttack,
            lowpriority: e.Enemy.lowpriority,
            helpless: KDHelpless(e),
            aggressive: KinkyDungeonAggressive(maid, e),
            hostile: KDHostile(maid, e),
            nearby: KDNearbyEnemies(maid.x, maid.y, 12, undefined, true).includes(e),
            LOS: KinkyDungeonCheckLOS(maid, e, Math.hypot(maid.x - e.x, maid.y - e.y), 12, true, true),
        })),
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "NormalBreachAcceptance", (_e, data) => {
        if (data.attacker?.id === maid.id)
            hits.push({ name: data.enemy.Enemy.name, damage: data.dmgDealt, x: data.enemy.x, y: data.enemy.y });
    });
    try {
        for (let tick = 1; tick <= 40; tick++) {
            await turn();
            trace.push({
                tick,
                x: maid.x,
                y: maid.y,
                target: maid.target,
                web: Spiderlings.SpinnerNativeField.isSpiderlingsWebCell({ x: 12, y: 10 }),
            });
            if (maid.x > 12) break;
        }
    } finally {
        delete KDEventMapGeneric.afterDamageEnemy.NormalBreachAcceptance;
    }
    expect(
        hits.some((hit) => hit.name === "SpiderlingsSpinnerTrap" && hit.damage > 0),
        `Native NPC did not choose to breach: ${JSON.stringify({ trace, hits })}`,
    );
    expect(maid.x > 12, "Native NPC did not use the breach");
    return { trace, hits };
})();
