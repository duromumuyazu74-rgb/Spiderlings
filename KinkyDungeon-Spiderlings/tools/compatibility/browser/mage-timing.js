(async () => {
    const { setup: nativeSetup, spawn, turn, frame, expect, save, restore, enemy, photo } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = {};
    const setup = (seed) => {
        nativeSetup(seed);
        KinkyDungeonBulletsVisual.clear();
        KDDamageQueue.length = 0;
        KinkyDungeonFloaters.length = 0;
    };
    const gear = () => KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name);
    const rendered = (prefix) =>
        [...kdpixisprites.entries()]
            .filter(([id, sprite]) => id.startsWith(`SpiderlingsSpellVisuals_${prefix}`) && sprite.visible)
            .map(([id, sprite]) => ({ id, alpha: sprite.alpha, url: sprite.texture?.baseTexture?.resource?.url }));
    const hasArt = (sprites, name) =>
        sprites.some((sprite) => sprite.url === KDModFiles[KinkyDungeonRootDirectory + `Bullets/${name}.png`]);
    const cast = (name, mage, x = 12, y = 10) => KinkyDungeonCastSpell(x, y, KinkyDungeonFindSpell(name, true), mage);
    for (const pink of [false, true]) {
        const color = pink ? "pink" : "normal";
        for (const mode of ["hit", "miss"]) {
            setup(`mage-bolt-${pink}-${mode}`);
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            KDMovePlayer(12, mode === "hit" ? 10 : 12, false);
            const caster = spawn("MageSpiderlings", 8, 10);
            caster.stun = 999;
            const bolt = { pink, kind: "bolt", mode, before: { will: KinkyDungeonStatWill, gear: gear() }, steps: [] };
            rows.push(bolt);
            expect(bolt.before.gear.length === 0, "Bolt fixture starts restrained");
            expect(cast("SpiderlingsMageBolt", caster).result === "Cast", "Silk bolt cast failed");
            expect(gear().length === 0, "Silk bolt applied restraints before collision");
            expect(
                KDMapData.Bullets.some((entry) => entry.bullet.spell?.name === "SpiderlingsMageBolt"),
                "Native silk bolt projectile is missing",
            );
            images[`${color}-bolt-${mode}-flight`] = await photo();
            for (let step = 0; step < 35; step++) {
                // Use native movement and collision, including its per-update hit deduplication.
                KinkyDungeonUpdateBullets(0.1, true);
                KinkyDungeonUpdateBullets(0.1, false);
                await frame();
                const equipped = gear();
                bolt.steps.push({ step, will: KinkyDungeonStatWill, gear: equipped });
                if (equipped.length && !bolt.impact) {
                    bolt.impact = { step, gear: equipped };
                    await frame();
                    await frame();
                    images[`${color}-bolt-impact`] = document.querySelector("canvas").toDataURL("image/png");
                    bolt.impact.sprites = rendered("hit_player:web");
                }
            }
            bolt.after = { will: KinkyDungeonStatWill, gear: gear() };
            if (mode === "hit") {
                expect(
                    bolt.after.gear.length === 1 && /^SpiderlingsWebbingLv1/.test(bolt.after.gear[0]),
                    `Native silk bolt did not apply one ordinary Webbing restraint: ${JSON.stringify(bolt.after)}`,
                );
                expect(bolt.after.will < bolt.before.will, "Silk bolt lost its native contact damage");
                expect(
                    hasArt(bolt.impact.sprites, `SpiderWebHit${pink ? "Pink" : ""}`),
                    "Silk bolt binding has no matching impact feedback",
                );
                const beforeReload = JSON.stringify(bolt.after.gear);
                restore(save());
                expect(JSON.stringify(gear()) === beforeReload, "Silk bolt Webbing changed after native reload");
            } else {
                expect(bolt.after.gear.length === 0, "Missed silk bolt applied Webbing");
                expect(bolt.after.will === bolt.before.will, "Missed silk bolt damaged the player");
            }
        }
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
            if ([1, 3, 5].includes(tick)) {
                images[`${color}-hex-${tick}`] = await photo();
                row.turns[tick].sprites = rendered(`hex_${mage.id}`);
                expect(
                    hasArt(row.turns[tick].sprites, tick < 3 ? "SpiderlingsMageRune" : "SpiderlingsMageRuneHit"),
                    `Hex ${tick < 3 ? "warning" : "active"} artwork is missing`,
                );
            }
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
            images[`${color}-collapse-${mode}-warning`] = await photo();
            collapse.warning = rendered(`collapse_${caster.id}`);
            expect(hasArt(collapse.warning, "SpiderlingsMageRune"), "Collapse warning artwork is missing");
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
                    gear: gear(),
                });
                if (mode === "impact" && tick === 3) {
                    images[`${color}-collapse-burst`] = await photo();
                    collapse.burst = rendered("burst_");
                    expect(hasArt(collapse.burst, "SpiderlingsMageRuneHit"), "Collapse resolved without burst artwork");
                }
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
