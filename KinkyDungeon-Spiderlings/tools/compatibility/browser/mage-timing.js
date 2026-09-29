(async () => {
    const { setup, spawn, turn, frame, expect, save, restore, enemy, photo } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = {};
    const cast = (name, mage, x = 12, y = 10) => KinkyDungeonCastSpell(x, y, KinkyDungeonFindSpell(name, true), mage);
    for (const pink of [false, true]) {
        setup(`mage-hex-${pink}`);
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        KDMovePlayer(8, 10, false);
        const mage = spawn("MageSpiderlings", 8, 8),
            target = spawn("MaidKnightHeavy", 12, 10, "Maidforce");
        mage.stun = 999;
        target.stun = 999;
        target.shield = 20;
        expect(cast("SpiderlingsMageHex", mage).result === "Cast", "Hex cast failed");
        const row = { pink, kind: "hex", turns: [] };
        rows.push(row);
        for (let tick = 0; tick <= 6; tick++) {
            if (tick) await turn();
            const current = enemy(target.id),
                state = KDMapData.SpiderlingsMageSpells;
            row.turns.push({
                tick,
                shield: current.shield,
                hp: current.hp,
                mark: structuredClone(Spiderlings.MageSpells.markFor(current)),
                fields: structuredClone(state.fields),
            });
            if ([1, 3, 5].includes(tick)) images[`${pink ? "pink" : "normal"}-hex-${tick}`] = await photo();
            if (tick === 2) {
                await frame();
                await frame();
                const before = JSON.stringify(state);
                restore(save());
                expect(
                    JSON.stringify(KDMapData.SpiderlingsMageSpells) === before,
                    "Hex clock changed on native reload",
                );
            }
        }
        expect(
            !row.turns[2].mark && row.turns[3].mark.stacks === 1 && row.turns[5].mark.stacks === 3,
            "Hex warning or mark timing differs",
        );
        expect(row.turns[6].fields.length === 0, "Hex active field outlived three turns");
        expect(row.turns[3].hp === row.turns[0].hp, "Shield-only activation overflowed into HP");
        for (const mode of ["impact", "escape", "owner-loss"]) {
            setup(`collapse-${pink}-${mode}`);
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            KDMovePlayer(12, 10, false);
            const caster = spawn("MageSpiderlings", 8, 8);
            caster.stun = 999;
            expect(cast("SpiderlingsMageCollapse", caster).result === "Cast", "Collapse cast failed");
            const collapse = { pink, kind: mode, turns: [] };
            rows.push(collapse);
            const affected = [];
            for (let y = 8; y <= 12; y++)
                for (let x = 10; x <= 14; x++)
                    if (Spiderlings.MageSpells.collapseDistance(12, 10, { x, y }) >= 0) affected.push({ x, y });
            expect(affected.length === 21, "Collapse footprint is not 21 cells");
            images[`${pink ? "pink" : "normal"}-collapse`] = await photo();
            if (mode === "owner-loss") KDRemoveEntity(caster, true, false);
            const initialWill = KinkyDungeonStatWill;
            for (let tick = 1; tick <= 3; tick++) {
                if (mode === "escape") {
                    KinkyDungeonMove({ x: 1, y: 0 }, 1, false, true);
                    await frame();
                } else await turn();
                collapse.turns.push({
                    tick,
                    x: KinkyDungeonPlayerEntity.x,
                    will: KinkyDungeonStatWill,
                    pending: KDMapData.SpiderlingsMageSpells.collapses.length,
                    cooldown: caster.SpiderlingsCollapseCooldown,
                    gear: KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name),
                });
            }
            expect(collapse.turns[1].gear.length === 0, "Collapse applied bindings before the third turn");
            if (mode === "impact") {
                expect(
                    collapse.turns[2].gear.length > 0 && caster.SpiderlingsCollapseCooldown === 7,
                    "Third-turn impact/cooldown missing",
                );
                expect(cast("SpiderlingsMageCollapse", caster).result === "Fail", "Collapse bypassed its cooldown");
                for (let tick = 0; tick < 7; tick++) await turn();
                expect(
                    cast("SpiderlingsMageCollapse", caster).result === "Cast",
                    "Cooldown did not expire after seven turns",
                );
            } else
                expect(
                    KinkyDungeonStatWill >= initialWill && collapse.turns[2].gear.length === 0,
                    "Escaped/cancelled Collapse still hit the player",
                );
        }
    }
    KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    return { rows, images };
})();
