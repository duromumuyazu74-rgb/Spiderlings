(async () => {
    const { setup, spawn, pin, turn, expect, save, restore, enemy, frame } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    for (const pinned of [true, false]) {
        setup(`adhesion-recovery-${pinned}`);
        const target = spawn("DragonGirlShadow", 12, 10, "Maidforce");
        const source = spawn("WebCaster", 10, 10);
        pin(target, source);
        KDRemoveEntity(source, false, false);
        if (!pinned) delete target.SpiderlingsNPCAdhesion;
        const before = { x: target.x, y: target.y };
        target.movePoints = 100;
        const moved = KinkyDungeonEnemyTryMove(target, { x: 1, y: 0 }, 1, 13, 10, false);
        expect(
            pinned ? !moved && target.x === before.x : target.x === 13,
            "Native voluntary move did not respect adhesion",
        );
        KDMoveEntity(target, 12, 10, false);
        // Drive the real ShadowShroud teleport handler with its native bullet event.
        const shroud = { x: 16, y: 10, bullet: { spell: { name: "ShadowShroud" } } };
        KDMapData.Bullets.push(shroud);
        KDMovePlayer(18, 10, false);
        target.faction = "Enemy";
        const bullet = {
            x: 16,
            y: 10,
            bullet: {
                source: target.id,
                faction: "Enemy",
                targetX: 18,
                targetY: 10,
                events: [{ trigger: "afterBulletHit", type: "ShadowShroudTele", aoe: 8 }],
            },
        };
        target.attackPoints = 0;
        KinkyDungeonSendBulletEvent("afterBulletHit", bullet, {});
        expect(target.x === (pinned ? 12 : 16), `Native self teleport mismatch: ${target.x}`);
        KDMapData.Bullets = [];
        KDMoveEntity(target, 20, 10, false);
        expect(target.x === 20, "External displacement was blocked");
        target.stun = 99;
        const row = { pinned, moved, teleported: !pinned, displaced: target.x, states: [] };
        rows.push(row);
        await frame();
        await frame();
        const id = target.id;
        const ledger = JSON.stringify(target.SpiderlingsNPCAdhesion);
        restore(save());
        expect(JSON.stringify(enemy(id).SpiderlingsNPCAdhesion) === ledger, "Native save changed the silk ledger");
        for (let tick = 1; tick <= 8; tick++) {
            await turn();
            row.states.push(Spiderlings.NPCAdhesion.status(enemy(id)));
        }
        expect(row.states.at(-1) === "free", "Expired eight-turn pressure still pins the target");
        KDUntieEnemy(enemy(id), 1000, true, true);
        expect(!Spiderlings.NPCAdhesion.hasAttributedSilk(enemy(id)), "Native untying retained owned silk");
    }
    return { rows };
})();
