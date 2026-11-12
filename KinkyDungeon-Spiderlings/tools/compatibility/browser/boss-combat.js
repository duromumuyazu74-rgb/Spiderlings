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
    const isolate = (keep = []) => {
        for (const enemy of [...KDMapData.Entities])
            if (
                enemy !== Spiderlings.BossEncounter.boss() &&
                !Spiderlings.BossFootprint.isPart(enemy) &&
                !keep.includes(enemy.id)
            )
                KDRemoveEntity(enemy, false, false, true);
    };
    const quiet = (state) => {
        state.nextBody = state.nextSupport = state.nextPulse = 10000;
        state.warnings = [];
        // Melee needs a recent body skill to have aged; this keeps her movement without attacks.
        state.lastBodyAt = 1e9;
    };
    globalThis.bossAcceptance.enter("boss-wall-support");
    encounter = Spiderlings.BossEncounter.state();
    const wallFormations = [];
    // A disabled Matriarch schedules nothing, so she stays active with her attacks held.
    quiet(encounter);
    for (const point of [
        { x: 9, y: 20 },
        { x: 31, y: 20 },
        { x: 20, y: 9 },
        { x: 20, y: 31 },
    ]) {
        for (const [index, name] of [
            [0, "WebCaster"],
            [2, "MageSpiderlings"],
        ]) {
            isolate();
            KDMovePlayer(point.x, point.y, false);
            encounter.supportIndex = index;
            encounter.nextSupport = encounter.clock;
            await turn();
            const members = KDMapData.Entities.filter(Spiderlings.BossEncounter.isFixedFormation);
            expect(members.length === 4, `Incomplete ${name} formation at ${point.x},${point.y}`);
            expect(new Set(members.map((enemy) => `${enemy.x},${enemy.y}`)).size === 4, "Support overlaps itself");
            expect(
                members.every(
                    (enemy) =>
                        Math.max(Math.abs(enemy.x - point.x), Math.abs(enemy.y - point.y)) >= 4 &&
                        Spiderlings.BossRoom.inArena(enemy),
                ),
                "Edge fallback placed support too close or outside the arena",
            );
            wallFormations.push({ player: point, name, positions: members.map(({ x, y }) => ({ x, y })) });
        }
    }
    const jumperResults = [];
    let comboImage;
    for (const evade of [false, true]) {
        globalThis.bossAcceptance.enter("boss-support-jumper-" + evade);
        encounter = Spiderlings.BossEncounter.state();
        quiet(encounter);
        isolate();
        KDMovePlayer(20, 20, false);
        const outcomes = [];
        KDAddEvent(KDEventMapGeneric, "spiderlingsJumperDashResolved", "CompatibilityBossCombo", (_event, data) =>
            outcomes.push(data.outcome),
        );
        try {
            encounter.supportIndex = 1;
            encounter.nextSupport = encounter.clock;
            await turn();
            const leaps = Spiderlings.JumperDash.runtimeController.snapshot();
            const jumpers = KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "Jumper");
            expect(leaps.length === 9 && jumpers.length === 9, "The summon did not start nine Jumper leaps");
            const targets = new Set(leaps.map((leap) => `${leap.target.x},${leap.target.y}`));
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++)
                    expect(targets.has(`${20 + dx},${20 + dy}`), "The combo left a cell of the 3x3 uncovered");
            for (const jumper of jumpers) {
                const leap = leaps.find((entry) => entry.sourceId === jumper.id);
                const reach = Math.hypot(jumper.x - leap.target.x, jumper.y - leap.target.y);
                expect(reach > 2 && reach <= 4, "A Jumper started outside its own Dash range");
            }
            expect(
                KinkyDungeonExtraWarningTiles.filter((tile) => tile.spiderlingsJumperDashSourceId !== undefined)
                    .length === 9,
                "The combo did not show nine native Dash warning tiles",
            );
            if (!evade) comboImage = await photo();
            // Two steps leave the 3x3 within the two reaction actions.
            if (evade) KDMovePlayer(23, 20, false);
            await turn();
            expect(
                KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "Jumper").length === 9 && !outcomes.length,
                "The combo landed before the second reaction action",
            );
            await turn();
            expect(!KDMapData.Entities.some((enemy) => enemy.Enemy.name === "Jumper"), "Combo Jumpers remained");
            expect(!Spiderlings.JumperDash.runtimeController.snapshot().length, "A combo leap is still pending");
            expect(
                evade === !outcomes.some((outcome) => outcome.startsWith("hit")),
                `Combo outcomes do not match the player's position: ${JSON.stringify(outcomes)}`,
            );
            jumperResults.push({ evade, outcomes, targets: [...targets] });
        } finally {
            delete KDEventMapGeneric.spiderlingsJumperDashResolved.CompatibilityBossCombo;
        }
    }
    globalThis.bossAcceptance.enter("boss-movement");
    encounter = Spiderlings.BossEncounter.state();
    quiet(encounter);
    isolate();
    encounter.builderIds = [];
    let mover = Spiderlings.BossEncounter.boss();
    const reach = () =>
        Math.max(
            Math.abs(Spiderlings.BossFootprint.nearest(mover, KDPlayer()).x - KDPlayer().x),
            Math.abs(Spiderlings.BossFootprint.nearest(mover, KDPlayer()).y - KDPlayer().y),
        );
    // A wall across the arena leaves a gap at its east end; greedy steps would stall against it.
    const barrier = [];
    for (let x = 9; x <= 26; x++) barrier.push({ x, y: 17 });
    for (const cell of barrier) KinkyDungeonMapSet(cell.x, cell.y, "1");
    KDMovePlayer(14, 26, false);
    const path = [];
    let movementTurns = 0;
    for (; movementTurns < 80 && reach() > 2; movementTurns++) {
        await turn();
        path.push({ x: mover.x, y: mover.y });
    }
    for (const cell of barrier) KinkyDungeonMapSet(cell.x, cell.y, "0");
    expect(reach() <= 2, "The Matriarch did not path around the wall to the player: " + JSON.stringify(path));
    expect(
        path.every((cell) => Math.max(Math.abs(cell.x - 20), Math.abs(cell.y - 20)) <= 9),
        "The Matriarch stepped onto the edge ring",
    );
    // After a ring closes she steps back inside the next one before chasing again.
    encounter.ringIndex = 4;
    KDMovePlayer(20, 9, false);
    for (let n = 0; n < 4; n++) await turn();
    expect(
        Math.max(Math.abs(mover.x - 20), Math.abs(mover.y - 20)) <= 5,
        `The Matriarch stayed on the ring under construction at ${mover.x},${mover.y}`,
    );
    encounter.ringIndex = 0;
    const movement = { turns: movementTurns, path };
    globalThis.bossAcceptance.enter("boss-paid-rings");
    encounter = Spiderlings.BossEncounter.state();
    mover = Spiderlings.BossEncounter.boss();
    quiet(encounter);
    // The player stands on the second ring's line: it is still planned and closes once she leaves.
    KDMovePlayer(14, 10, false);
    isolate(encounter.builderIds);
    let complete = false,
        turns = 0;
    const paidByBuilder = new Map(),
        earlyWork = [],
        builderAttacks = [],
        closedAt = [];
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
    // A ring that just closed can leave her on the next line for the step she needs to leave it.
    let onRing = 0,
        footprintOnRing = 0;
    for (; turns < 400 && !complete; turns++) {
        await turn();
        if (encounter.ringIndex >= 1 && KDPlayer().y === 10) KDMovePlayer(20, 22, false);
        const radius = Spiderlings.BossFields.currentRadius();
        onRing =
            Math.max(Math.abs(mover.x - 20), Math.abs(mover.y - 20)) + 1 >= radius && !encounter.ringsComplete
                ? onRing + 1
                : 0;
        footprintOnRing = Math.max(footprintOnRing, onRing);
        const graph = Spiderlings.SpinnerNativeField.state()?.topology;
        const rings = Object.values(graph?.composites || {}).filter((ring) =>
            Spiderlings.BossFields.ownsComposite(ring.id),
        );
        const closed = rings.filter((ring) =>
            ring.layerIds.every((id) => Spiderlings.SpinnerTopology.isLayerClosed(graph, id)),
        );
        if (closed.length > closedAt.length) closedAt.push(turns);
        complete = rings.length === 7 && encounter.ringsComplete && closed.length === 7;
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
        "Eight builders did not finish seven adjacent paid rings: " +
            JSON.stringify({
                turns,
                closedAt,
                ring: encounter.ringIndex,
                graph: Spiderlings.SpinnerNativeField.state()?.topology?.composites,
                workers: KDMapData.Entities.filter((enemy) => encounter.builderIds.includes(enemy.id)).map((enemy) => ({
                    id: enemy.id,
                    x: enemy.x,
                    y: enemy.y,
                    stun: enemy.stun,
                })),
            }),
    );
    expect(closedAt[0] <= 80, `The edge ring took ${closedAt[0]} turns to close`);
    expect(turns <= 300, `Seven rings took ${turns} turns to close`);
    expect(footprintOnRing <= 4, `The Matriarch stood on a ring under construction for ${footprintOnRing} turns`);
    const walls = KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "SpiderlingsSpinnerTrap");
    expect(walls.length === 448, `Closed rings project ${walls.length} web cells instead of 448`);
    const fields = await photo();
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
        closedAt,
        walls: walls.length,
        retainedTopology: !!snapshot,
        wallFormations,
        jumperResults,
        movement,
        construction: { paidByBuilder: [...paidByBuilder], earlyWork, builderAttacks },
        resonance: { pulses: resonancePulses, nativeTextures: true, statusLifecycle: true },
        warningFeedback: { renderedCountdown: true, resolutionEvents: resolvedWarnings.length, sameFootprint: true },
        images: {
            resonance: resonanceImage,
            meleeWarning: warningImage,
            meleeImpact: impactImage,
            combat,
            combo: comboImage,
            fields,
        },
        fixture:
            "Resonance uses paid native turns with other schedules delayed, then samples inactive phase projections; cadence runs normally; edge placement and the Jumper combo isolate one due formation with her attacks held; movement removes builders and adds a temporary wall; the paid-ring fixture removes support and keeps her moving without attacks.",
    };
})();
