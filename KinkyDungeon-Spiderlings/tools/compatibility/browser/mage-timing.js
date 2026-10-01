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
            const collapse = { pink, kind: mode, turns: [] };
            rows.push(collapse);
            const nativeTime = CommonTime;
            let visualTime = nativeTime();
            CommonTime = () => visualTime;
            try {
                expect(cast("SpiderlingsMageCollapse", caster).result === "Cast", "Collapse cast failed");
                const affected = [];
                for (let y = 8; y <= 12; y++)
                    for (let x = 10; x <= 14; x++)
                        if (Spiderlings.MageSpells.collapseDistance(12, 10, { x, y }) >= 0) affected.push({ x, y });
                expect(affected.length === 21, "Collapse footprint is not 21 cells");
                images[`${color}-collapse-${mode}-warning`] = await photo();
                const danger = () => rendered(`danger_collapse_${caster.id}_`);
                const trails = () => {
                    const ground = kdgameboard.children.find((g) => g.name === "SpiderlingsSpellVisuals_ground");
                    return (ground?.geometry?.graphicsData || [])
                        .filter((shape) => shape.lineStyle.width === 1.4)
                        .map((shape) => ({
                            x: shape.shape.points[0],
                            y: shape.shape.points[1],
                            alpha: shape.lineStyle.alpha,
                        }));
                };
                expect(danger().length === 21, "Collapse warning did not retain all 21 dangerous cells");
                {
                    // Both samples must precede the bounded intra-turn animation's
                    // 765ms plateau. Asset/photo latency must not choose the phase.
                    visualTime += 200;
                    await frame();
                    await frame();
                    const before = trails(),
                        center = rendered(`collapse_${caster.id}`);
                    const centerSprite = kdpixisprites.get(center[0]?.id);
                    const initialDistance = before.map((s) => Math.hypot(s.x - centerSprite.x, s.y - centerSprite.y));
                    visualTime += 350;
                    await frame();
                    await frame();
                    expect(danger().length === 21, "Inward gathering shrank the dangerous-cell mask");
                    const gathered = trails();
                    collapse.gatheringDebug = {
                        samplePhaseMs: [200, 550],
                        before,
                        gathered,
                        initialDistance,
                        currentDistance: gathered.map((s) => Math.hypot(s.x - centerSprite.x, s.y - centerSprite.y)),
                    };
                    const meanDistance = (positions) =>
                        positions.reduce(
                            (sum, point) => sum + Math.hypot(point.x - centerSprite.x, point.y - centerSprite.y),
                            0,
                        ) / positions.length;
                    // Match stable direction/brightness identities, never compare changing fog-set means.
                    const key = (point, maximum) =>
                        `${Math.round(Math.atan2(point.y - centerSprite.y, point.x - centerSprite.x) / (Math.PI / 4))}:${Math.round((1 - point.alpha / maximum) * 5)}`;
                    const beforeAlpha = Math.max(...before.map((point) => point.alpha)),
                        afterAlpha = Math.max(...gathered.map((point) => point.alpha));
                    const original = new Map(
                        before.map((point) => [
                            key(point, beforeAlpha),
                            Math.hypot(point.x - centerSprite.x, point.y - centerSprite.y),
                        ]),
                    );
                    const common = gathered.filter((point) => original.has(key(point, afterAlpha)));
                    expect(
                        common.length >= 8 &&
                            common.every(
                                (point) =>
                                    Math.hypot(point.x - centerSprite.x, point.y - centerSprite.y) <
                                    original.get(key(point, afterAlpha)),
                            ),
                        "Visible charging silk did not move inward",
                    );
                    collapse.gatheringDebug.matchedSegments = common.length;
                    images[`${color}-collapse-${mode}-gathered`] = document
                        .querySelector("canvas")
                        .toDataURL("image/png");
                    collapse.gathering = {
                        dangerCells: danger().length,
                        strands: 8,
                        visibleSegments: gathered.length,
                        meanBefore: meanDistance(before),
                        meanAfter: meanDistance(gathered),
                        inward: true,
                    };
                    visualTime += 250;
                    await frame();
                    await frame();
                    const plateau = trails();
                    visualTime += 350;
                    await frame();
                    await frame();
                    expect(
                        JSON.stringify(trails()) === JSON.stringify(plateau),
                        "Charging animation exceeded its bounded intra-turn plateau",
                    );
                    collapse.gathering.plateauPhaseMs = [800, 1150];
                    collapse.gathering.plateauStable = true;
                }
            } finally {
                CommonTime = nativeTime;
            }
            collapse.warning = rendered(`collapse_${caster.id}`);
            expect(hasArt(collapse.warning, "SpiderlingsMageRune"), "Collapse warning artwork is missing");
            if (mode === "owner-loss") KDRemoveEntity(caster, true, false);
            const initialWill = KinkyDungeonStatWill;
            for (let tick = 1; tick <= 5; tick++) {
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
                if (mode === "impact" && tick === 5) {
                    images[`${color}-collapse-burst`] = await photo();
                    collapse.burst = rendered("burst_");
                    expect(hasArt(collapse.burst, "SpiderlingsMageRuneHit"), "Collapse resolved without burst artwork");
                }
            }
            expect(collapse.turns[3].gear.length === 0, "Collapse applied bindings before the fifth turn");
            if (mode === "impact") {
                expect(
                    collapse.turns[4].gear.length > 0 && caster.SpiderlingsCollapseCooldown === 7,
                    "Fifth-turn impact/cooldown missing",
                );
                expect(cast("SpiderlingsMageCollapse", caster).result === "Fail", "Collapse bypassed its cooldown");
                for (let tick = 0; tick < 7; tick++) await turn();
                expect(
                    cast("SpiderlingsMageCollapse", caster).result === "Cast",
                    "Cooldown did not expire after seven turns",
                );
            } else
                expect(
                    KinkyDungeonStatWill >= initialWill && collapse.turns[4].gear.length === 0,
                    "Escaped/cancelled Collapse still hit the player",
                );
        }
    }
    for (const pink of [false, true]) {
        setup(`mage-burst-lifecycle-${pink}`);
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        KDMovePlayer(12, 10, false);
        const caster = spawn("MageSpiderlings", 8, 8);
        caster.stun = 999;
        expect(cast("SpiderlingsMageCollapse", caster).result === "Cast", "Lifecycle Collapse cast failed");
        const started = performance.now();
        // All six native turns run in this JS task, without a requestAnimationFrame between them.
        for (let tick = 0; tick < 6; tick++) {
            KinkyDungeonLastAction = "Wait";
            KinkyDungeonAdvanceTime(1, true);
        }
        const state = KDMapData.SpiderlingsMageSpells;
        expect(
            state.collapses.length === 0 && state.blasts.length === 0,
            "Lifecycle fixture retained gameplay feedback",
        );
        await frame();
        await frame();
        const beforeLoad = rendered("burst_");
        expect(
            beforeLoad.length === 1 && hasArt(beforeLoad, "SpiderlingsMageRuneHit"),
            "Native no-draw turns lost or duplicated the burst",
        );
        images[`${pink ? "pink" : "normal"}-lifecycle-delivery`] = document
            .querySelector("canvas")
            .toDataURL("image/png");
        const persistent = JSON.stringify(state);
        restore(save());
        await frame();
        await frame();
        expect(
            JSON.stringify(KDMapData.SpiderlingsMageSpells) === persistent,
            "Lifecycle reload changed spell gameplay",
        );
        expect(rendered("burst_").length === 0, "Native reload replayed an already-delivered burst");
        rows.push({
            kind: "burst-lifecycle",
            pink,
            turnsWithoutDraw: 6,
            deliverySprites: beforeLoad.length,
            elapsedMs: performance.now() - started,
            persistentStateUnchanged: true,
            replaySprites: 0,
        });
    }
    setup("hex-world-turn-continuity");
    KDMovePlayer(12, 10, false);
    const owners = [spawn("MageSpiderlings", 8, 8), spawn("MageSpiderlings", 8, 7)];
    for (const owner of owners) {
        owner.stun = 999;
        expect(cast("SpiderlingsMageHex", owner).result === "Cast", "Overlap Hex cast failed");
    }
    const mark = () => Spiderlings.MageSpells.markFor(KinkyDungeonPlayerEntity),
        continuity = { kind: "hex-world-turn-continuity", steps: [] };
    for (let i = 0; i < 3; i++) await turn();
    expect(mark()?.stacks === 1, "Overlapping active Hex did not grant exactly one layer");
    const beforeDuplicate = JSON.stringify(KDMapData.SpiderlingsMageSpells);
    KinkyDungeonSendEvent("tickAfter", { delta: 1 });
    expect(
        JSON.stringify(KDMapData.SpiderlingsMageSpells) === beforeDuplicate,
        "Duplicate positive event changed spell state",
    );
    restore(save());
    const afterLoad = JSON.stringify(KDMapData.SpiderlingsMageSpells);
    KinkyDungeonSendEvent("tickAfter", { delta: 1 });
    expect(
        JSON.stringify(KDMapData.SpiderlingsMageSpells) === afterLoad,
        "Same-turn reload replayed mark accumulation",
    );
    continuity.steps.push({
        phase: "overlap-and-reload",
        clock: KDMapData.SpiderlingsMageSpells.clock,
        mark: structuredClone(mark()),
    });
    const striker = spawn("Jumper", 13, 10);
    striker.stun = 0;
    const contact = KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        KinkyDungeonPlayerEntity,
        "glue",
        { profile: "Jumper" },
        undefined,
        "Enemy",
        undefined,
        striker,
    );
    expect(mark()?.stacks === 0, "Successful ordinary Jumper contact did not consume the Hex mark");
    continuity.contact = contact;
    striker.stun = 999;
    await turn();
    expect(mark()?.stacks === 1, "Active Hex failed to replenish on the next actual turn after consumption");
    continuity.steps.push({
        phase: "replenished",
        clock: KDMapData.SpiderlingsMageSpells.clock,
        mark: structuredClone(mark()),
    });
    images["hex-continuity-replenished"] = await photo();
    const expiration = mark().expiresAt;
    KDMovePlayer(10, 10, false);
    await turn();
    expect(mark()?.expiresAt === expiration, "Outside Hex refreshed the mark");
    for (let i = 0; i < 6; i++) await turn();
    expect(!mark(), "Expired fields refreshed marks outside their active lifetime");
    continuity.steps.push({ phase: "gone", clock: KDMapData.SpiderlingsMageSpells.clock, mark: mark() || null });
    rows.push(continuity);
    setup("hex-native-reentry");
    KDMovePlayer(12, 10, false);
    const reentryMage = spawn("MageSpiderlings", 8, 8);
    reentryMage.stun = 999;
    expect(cast("SpiderlingsMageHex", reentryMage).result === "Cast", "Reentry Hex cast failed");
    for (let i = 0; i < 3; i++) await turn();
    KDMovePlayer(10, 10, false);
    await turn();
    expect(mark()?.stacks === 1, "Leaving added a mark");
    KDMovePlayer(12, 10, false);
    await turn();
    expect(mark()?.stacks === 2, "Reentry into still-active Hex did not add a layer");
    rows.push({ kind: "hex-native-reentry", mark: structuredClone(mark()) });
    for (const restrained of [false, true]) {
        setup(`rune-native-warning-${restrained}`);
        KDMovePlayer(12, 10, false);
        if (restrained)
            KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsSpinnerLegbinder"), 0, false, "");
        KinkyDungeonUpdateStats(0);
        const mage = spawn("MageSpiderlings", 8, 8);
        mage.stun = 999;
        expect(cast("SpiderlingsMageRune", mage).result === "Cast", "Warning Rune cast failed");
        const rune = KDMapData.Bullets.find((entry) => entry.bullet.spell?.name === "SpiderlingsMageRune");
        KDMovePlayer(16, 10, false);
        for (let n = 0; n < 6 && rune.SpiderlingsRunePhase !== "armed"; n++) await turn();
        expect(rune.SpiderlingsRunePhase === "armed", "Warning Rune did not arm");
        KDMovePlayer(rune.x, rune.y, false);
        await turn();
        const warning = rune.SpiderlingsRuneTurns,
            slow = KinkyDungeonSlowLevel;
        expect(
            rune.SpiderlingsRunePhase === "triggered" && warning === 2 + Math.ceil(Math.max(0, slow) / 2),
            "Rune did not snapshot its native Slow warning",
        );
        const state = JSON.stringify(rune);
        KinkyDungeonSendEvent("tickAfter", { delta: 0 });
        expect(JSON.stringify(rune) === state, "Zero-time Rune update changed its deadline");
        for (let n = 1; n < warning; n++) {
            await turn();
            expect(rune.SpiderlingsRunePhase === "triggered", "Rune resolved before its adaptive warning elapsed");
            expect(rune.SpiderlingsRuneTurns === warning - n, "Waiting refreshed the Rune warning");
        }
        await turn();
        expect(rune.time <= 0 && !KDMapData.Bullets.includes(rune), "Rune missed its native warning deadline");
        rows.push({ kind: "rune-adaptive-warning", restrained, slow, warning });
    }
    KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    return { rows, images };
})();
