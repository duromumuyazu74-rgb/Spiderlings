(async () => {
    const { expect, turn, photo } = globalThis.normalAcceptance;
    globalThis.bossAcceptance.enter("boss-resonance-feedback");
    const resonanceState = Spiderlings.BossEncounter.state();
    const resonanceBoss = Spiderlings.BossEncounter.boss();
    resonanceState.nextBody = resonanceState.nextSupport = 10000;
    resonanceState.nextPulse = resonanceState.clock;
    resonanceState.warnings = [];
    for (const enemy of [...KDMapData.Entities])
        if (enemy !== resonanceBoss && !Spiderlings.BossFootprint.isPart(enemy))
            KDRemoveEntity(enemy, false, false, true);
    resonanceState.builderIds = [];
    KDMovePlayer(resonanceBoss.x, resonanceBoss.y + 3, false);
    const hud = () => {
        const data = { stats: {} };
        KinkyDungeonSendEvent("drawBuffIcons", data);
        return data.stats.SpiderlingsBossResonance;
    };
    const glow = (actor) => kdpixisprites.get("SpiderlingsBossResonance:" + actor);
    const visible = (sprite) => !!(sprite?.parent && sprite.visible && sprite.renderable && sprite.alpha > 0);
    const originalSend = KinkyDungeonSendEvent;
    const resonancePulses = [];
    let resonanceImage;
    KinkyDungeonSendEvent = function (event, data) {
        if (event === "spiderlingsBossResonance")
            resonancePulses.push({ clock: resonanceState.clock, id: data.enemy.id });
        return originalSend.apply(this, arguments);
    };
    try {
        await turn();
        const density = Spiderlings.SilkDensity.state().value;
        resonanceImage = await photo();
        expect(resonancePulses.length === 1, "A due native turn did not emit one resonance pulse");
        for (const actor of ["boss", "player"]) {
            const sprite = glow(actor);
            expect(visible(sprite), `Missing native ${actor} resonance glow`);
            expect(sprite.texture.baseTexture.valid && sprite.texture.orig.width > 1, `Invalid ${actor} aura texture`);
        }
        expect(Math.abs(glow("boss").alpha - glow("player").alpha) < 1e-9, "Resonance glows are not synchronized");
        expect(
            KDModFiles[KinkyDungeonRootDirectory + "Buffs/buff/buffSpiderlingsBossResonance.png"] &&
                KDModFiles[KinkyDungeonRootDirectory + "Buffs/buff/buffSpiderlingsBossResonance.png"] !==
                    KDModFiles[KinkyDungeonRootDirectory + "Bullets/SpiderlingsMageRuneIcon.png"],
            "Resonance status did not use its prepared icon",
        );
        expect(hud()?.icon === "buff/buffSpiderlingsBossResonance", "Resonance status is missing");
        const texture = KDTex(KinkyDungeonRootDirectory + "Buffs/buff/buffSpiderlingsBossResonance.png");
        expect(
            texture?.baseTexture.valid && texture.orig.width === 46 && texture.orig.height === 46,
            "Resonance status icon is not decoded at its supplied size",
        );
        await new Promise((resolve) => setTimeout(resolve, 1100));
        await photo();
        expect(!visible(glow("boss")) && !visible(glow("player")), "One-second resonance glows did not clear");
        expect(!!hud(), "Maintenance status ended with the short glow");
        expect(Spiderlings.SilkDensity.state().value === density, "Rendering changed silk density");
        for (let index = 0; index < 5; index++) await turn();
        expect(resonancePulses.length === 1, "Resonance repeated before its six-turn interval");
        await turn();
        expect(resonancePulses.length === 2, "The next resonance interval did not fire");
        resonanceBoss.stun = 3;
        await photo();
        expect(!hud(), "Disabled Matriarch retained its maintenance status");
        expect(!visible(glow("boss")) && !visible(glow("player")), "Disabled Matriarch retained its glow");
        resonanceBoss.stun = 0;
        resonanceState.phase = "interlude";
        expect(!hud(), "Regeneration interlude retained resonance status");
        resonanceState.phase = "victory";
        expect(!hud(), "Victory retained resonance status");
    } finally {
        KinkyDungeonSendEvent = originalSend;
    }
    globalThis.bossAcceptance.enter("boss-visible-melee-warning");
    const warningState = Spiderlings.BossEncounter.state(),
        warningBoss = Spiderlings.BossEncounter.boss();
    for (const enemy of [...KDMapData.Entities])
        if (enemy !== warningBoss && !Spiderlings.BossFootprint.isPart(enemy))
            KDRemoveEntity(enemy, false, false, true);
    warningState.builderIds = [];
    warningState.warnings = [];
    warningState.nextBody = warningState.nextSupport = warningState.nextPulse = 10000;
    warningState.lastBodyAt = -10;
    warningBoss.SpiderlingsBossMeleeCredit = 3;
    KDMovePlayer(warningBoss.x, warningBoss.y + 2, false);
    const resolvedWarnings = [],
        warningTexts = [];
    const nativeText = DrawTextFitKD;
    DrawTextFitKD = function (text) {
        if (text.includes(TextGet("SpiderlingsBossSkillName_melee"))) warningTexts.push(text);
        return nativeText.apply(this, arguments);
    };
    KDAddEvent(KDEventMapGeneric, "spiderlingsBossWarningResolved", "CompatibilityBossWarning", (_event, data) =>
        resolvedWarnings.push(data),
    );
    let warningImage, impactImage;
    try {
        await turn();
        expect(
            warningState.warnings.length === 1 && warningState.warnings[0].kind === "melee",
            "Melee resolved before its first visible warning frame",
        );
        expect(
            warningState.warnings[0].at - warningState.clock === 1,
            "Melee warning did not retain a full next world turn",
        );
        const cells = JSON.stringify(warningState.warnings[0].cells),
            clock = warningState.clock;
        warningImage = await photo();
        const expected = TextGet("SpiderlingsBossCastCountdown")
            .replace("SKILL", TextGet("SpiderlingsBossSkillName_melee"))
            .replace("TURNS", "1");
        expect(warningTexts.includes(expected), "The live melee countdown was not rendered");
        expect(warningState.clock === clock && resolvedWarnings.length === 0, "Drawing advanced a pending attack");
        await turn();
        expect(
            resolvedWarnings.length === 1 && warningState.warnings.length === 0,
            "Warned melee did not resolve once on its advertised turn",
        );
        expect(
            JSON.stringify(resolvedWarnings[0].cells) === cells,
            "The hit footprint differs from the locked warning",
        );
        expect(Spiderlings.SilkDensity.state().value === 10, "Native warned melee did not apply one real silk contact");
        impactImage = await photo();
    } finally {
        DrawTextFitKD = nativeText;
        delete KDEventMapGeneric.spiderlingsBossWarningResolved.CompatibilityBossWarning;
    }
    globalThis.bossAcceptance.enter("boss-attack-cadence");
    let encounter = Spiderlings.BossEncounter.state();
    for (let index = 0; index < 25; index++) await turn();
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
    const jumperResults = [];
    for (const evade of [false, true]) {
        globalThis.bossAcceptance.enter("boss-support-jumper-" + evade);
        encounter = Spiderlings.BossEncounter.state();
        const owner = Spiderlings.BossEncounter.boss();
        owner.stun = 10000;
        encounter.nextBody = encounter.nextSupport = encounter.nextPulse = 10000;
        encounter.warnings = [];
        for (const enemy of [...KDMapData.Entities])
            if (enemy !== owner && !Spiderlings.BossFootprint.isPart(enemy)) KDRemoveEntity(enemy, false, false, true);
        KDMovePlayer(20, 20, false);
        const [jumper] = Spiderlings.BossEncounter.spawnFormation(["Jumper"], [{ x: 24, y: 20 }], "support");
        let winding = false;
        for (let n = 0; n < 12 && !winding; n++) {
            await turn();
            winding = Spiderlings.JumperDash.runtimeController.snapshot().some((entry) => entry.sourceId === jumper.id);
        }
        expect(winding, "Boss support Jumper did not start its native Dash");
        expect(KDMapData.Entities.includes(jumper), "Jumper retired before its attack resolved");
        if (evade) KDMovePlayer(20, 22, false);
        await turn();
        expect(KDMapData.Entities.includes(jumper), "Jumper lost the second reaction opportunity");
        await turn();
        expect(!KDMapData.Entities.includes(jumper), "Boss Jumper remained after its resolved Dash");
        expect(!Spiderlings.JumperDash.runtimeController.snapshot().length, "Retired Jumper left a pending attack");
        jumperResults.push({ evade, retired: true });
    }
    globalThis.bossAcceptance.enter("boss-paid-rings");
    encounter = Spiderlings.BossEncounter.state();
    const boss = Spiderlings.BossEncounter.boss();
    boss.stun = 10000;
    encounter.nextBody = encounter.nextSupport = encounter.nextPulse = 10000;
    encounter.warnings = [];
    // The builders must close and shrink even when the player stands outside all rings.
    KDMovePlayer(3, 20, false);
    for (const enemy of [...KDMapData.Entities])
        if (enemy !== boss && !Spiderlings.BossFootprint.isPart(enemy) && !encounter.builderIds.includes(enemy.id))
            KDRemoveEntity(enemy, false, false, true);
    let complete = false,
        turns = 0;
    const paidByBuilder = new Map(),
        earlyWork = [],
        builderAttacks = [];
    const applyPaid = Spiderlings.SpinnerNativeField.applyPaidAction;
    Spiderlings.SpinnerNativeField.applyPaidAction = function (actor, action) {
        const result = applyPaid.apply(this, arguments);
        if (result.applied && encounter.builderIds.includes(actor.id)) {
            paidByBuilder.set(actor.id, (paidByBuilder.get(actor.id) || 0) + 1);
            if (encounter.ringIndex === 0 && turns < 12) earlyWork.push({ id: actor.id, ...action.cell });
        }
        return result;
    };
    KDAddEvent(KDEventMapGeneric, "beforeAttack", "CompatibilityBossBuilders", (_event, data) => {
        if (encounter.builderIds.includes(data.enemy?.id))
            builderAttacks.push({ id: data.enemy.id, complete: !!encounter.ringsComplete });
    });
    for (; turns < 800 && !complete; turns++) {
        await turn();
        const graph = Spiderlings.SpinnerNativeField.state()?.topology;
        const rings = Object.values(graph?.composites || {}).filter((ring) =>
            Spiderlings.BossFields.ownsComposite(ring.id),
        );
        complete =
            rings.length === 9 &&
            encounter.ringsComplete &&
            rings.every((ring) => ring.layerIds.every((id) => Spiderlings.SpinnerTopology.isLayerClosed(graph, id)));
    }
    Spiderlings.SpinnerNativeField.applyPaidAction = applyPaid;
    expect(paidByBuilder.size === 8, "Some opening builders never contributed paid work");
    expect(
        new Set(earlyWork.map((cell) => (Math.round(Math.atan2(cell.y - 20, cell.x - 20) / (Math.PI / 4)) + 8) % 8))
            .size === 8,
        "Opening construction did not spread across eight directions: " + JSON.stringify(earlyWork),
    );
    expect(!builderAttacks.some((attack) => !attack.complete), "A builder attacked before the final ring closed");
    expect(
        complete,
        "Eight builders did not finish nine adjacent paid rings: " +
            JSON.stringify({
                turns,
                ring: encounter.ringIndex,
                graph: Spiderlings.SpinnerNativeField.state()?.topology?.composites,
                workers: KDMapData.Entities.filter((enemy) => encounter.builderIds.includes(enemy.id)).map((enemy) => ({
                    id: enemy.id,
                    x: enemy.x,
                    y: enemy.y,
                    stun: enemy.stun,
                    movePoints: enemy.movePoints,
                    work: Spiderlings.SpinnerTopology.nextWorkAction(
                        Spiderlings.SpinnerNativeField.state().topology,
                        enemy.id,
                        enemy,
                    ),
                })),
            }),
    );
    const walls = KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "SpiderlingsSpinnerTrap");
    expect(walls.length > 80, "Closed rings have no physical web projections");
    const fields = await photo();
    KDMovePlayer(20, 20, false);
    for (let n = 0; n < 20 && !builderAttacks.length; n++) await turn();
    expect(builderAttacks.length > 0, "Completed builders did not resume native attacks");
    delete KDEventMapGeneric.beforeAttack.CompatibilityBossBuilders;
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
        jumperResults,
        construction: { paidByBuilder: [...paidByBuilder], earlyWork, builderAttacks },
        resonance: { pulses: resonancePulses, nativeTextures: true, statusLifecycle: true },
        warningFeedback: { renderedCountdown: true, resolutionEvents: resolvedWarnings.length, sameFootprint: true },
        images: { resonance: resonanceImage, meleeWarning: warningImage, meleeImpact: impactImage, combat, fields },
        fixture:
            "Resonance uses paid native turns with other schedules delayed, then samples inactive phase projections; cadence runs normally; wall placement isolates one due formation; paid-ring fixture disables only Boss offense and removes support.",
    };
})();
