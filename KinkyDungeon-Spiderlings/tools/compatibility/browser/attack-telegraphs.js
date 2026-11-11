(async () => {
    const { setup, spawn, turn, frame, expect, photo } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = {};
    // Scenes are recorded and photographed before each contract check, so a failure names its trace.
    const check = (condition, message, detail) => expect(condition, `${message}: ${JSON.stringify(detail)}`);
    const logFrom = (start) => KinkyDungeonMessageLog.slice(start).map(({ text, color }) => ({ text, color }));
    const unresolved = (text) => typeof text !== "string" || text.startsWith("[NotFound]");
    const near = (cells, x, y) => cells.some((cell) => cell.x === x && cell.y === y);
    // KD 5.4.92 keeps bullet warnings in a global; current 5.5 moved them into KDGameData.
    const nativeWarnings = () =>
        (typeof KDBulletWarnings !== "undefined" ? KDBulletWarnings : KDGameData.BulletWarnings || []).map(
            ({ x, y, color }) => ({ x, y, color }),
        );
    const warningSprites = (prefix) =>
        [...kdpixisprites.entries()]
            .filter(([id, sprite]) => id.startsWith(prefix) && sprite.visible && sprite.parent)
            .map(([id, sprite]) => ({ id, tint: sprite.tint, alpha: sprite.alpha, board: sprite.parent?.name }));
    // Records one frame's draws whose sprite id starts or ends with a key, with image and tint.
    const drawnImages = async (key) => {
        const seen = [],
            nativeDraw = KDDraw;
        KDDraw = function (...args) {
            const id = String(args[2]);
            if (id.startsWith(key) || id.endsWith(key))
                seen.push({ id, image: String(args[3]).split("/").pop(), tint: args[9]?.tint });
            return nativeDraw.apply(this, args);
        };
        try {
            await frame();
            await frame();
        } finally {
            KDDraw = nativeDraw;
        }
        return seen;
    };
    const clearFloor = () => {
        for (let y = 2; y < 18; y++)
            for (let x = 2; x < 24; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDUpdateEnemyCache = true;
    };
    const nativeForce = KDToggles.ForceWarnings;
    // Native warnings normally appear only while the pointer is over the map; the native toggle forces them.
    KDToggles.ForceWarnings = true;
    try {
        setup("telegraph-spinner");
        clearFloor();
        KDMovePlayer(12, 10, false);
        const spinner = spawn("Spinner", 13, 10);
        const spinnerRow = { kind: "spinner-melee", turns: 0 };
        rows.push(spinnerRow);
        for (; spinnerRow.turns < 6 && !(spinner.warningTiles?.length > 0); spinnerRow.turns++) await turn();
        spinnerRow.warningTiles = spinner.warningTiles?.length || 0;
        spinnerRow.color = spinner.Enemy.color;
        images["spinner-melee"] = await photo();

        setup("telegraph-jumper");
        clearFloor();
        KDMovePlayer(12, 10, false);
        const jumper = spawn("Jumper", 12, 13);
        const jumperLog = KinkyDungeonMessageLog.length;
        const dash = Spiderlings.JumperDash.runtimeController.begin(jumper, KinkyDungeonPlayerEntity);
        expect(dash.started, `Jumper Dash fixture did not start: ${JSON.stringify(dash)}`);
        await turn();
        const dashRow = {
            kind: "jumper-dash",
            messages: logFrom(jumperLog),
            warnings: nativeWarnings().filter((tile) => tile.x === dash.target.x && tile.y === dash.target.y),
        };
        rows.push(dashRow);
        images["jumper-dash"] = await photo();
        check(dashRow.warnings.length === 1, "Dash target lost its native warning tile", dashRow.warnings);
        const announce = dashRow.messages.find(
            (entry) => entry.text === TextGet("KinkyDungeonSpellCastSpiderlingsJumperDash"),
        );
        check(announce?.color === "#ff8844", "Dash announcement does not use the native enemy cast colour", announce);
        // A new native game does not end a Dash wind-up; clear it so its tile does not leak into later scenes.
        Spiderlings.JumperDash.runtimeController.clearAll("acceptance");
        if (typeof KDBulletWarnings !== "undefined") KDBulletWarnings.length = 0;
        else KDGameData.BulletWarnings = [];

        setup("telegraph-webspray");
        clearFloor();
        KDMovePlayer(17, 10, false);
        const caster = spawn("WebCaster", 9, 10);
        caster.stun = 999;
        const spray = KinkyDungeonFindSpell("WebSpray", true);
        expect(KinkyDungeonCastSpell(17, 10, spray, caster).result === "Cast", "WebSpray fixture cast failed");
        // Native bolts calculate their warning path during the bullet update that moves them.
        KinkyDungeonUpdateBullets(1, false);
        await frame();
        const sprayRow = {
            kind: "webspray-flight",
            warnings: nativeWarnings().filter((tile) => tile.y === 10 && tile.color === spray.color),
            color: spray.color,
            casterColor: caster.Enemy.color,
        };
        rows.push(sprayRow);
        images["webspray-flight"] = await photo();
        check(sprayRow.warnings.length >= 2, "WebSpray flight has no native warning path", sprayRow.warnings);
        check(caster.Enemy.color === "#FF00FF", "WebCaster lacks the Spiderling family colour", caster.Enemy.color);

        for (const [kind, spell] of [
            ["hex", "SpiderlingsMageHex"],
            ["collapse", "SpiderlingsMageCollapse"],
        ]) {
            setup(`telegraph-mage-${kind}`);
            clearFloor();
            KDMovePlayer(12, 11, false);
            const mage = spawn("MageSpiderlings", 7, 7);
            mage.stun = 999;
            expect(
                KinkyDungeonCastSpell(12, 11, KinkyDungeonFindSpell(spell, true), mage).result === "Cast",
                `${spell} fixture cast failed`,
            );
            const state = KDMapData.SpiderlingsMageSpells;
            const pending =
                kind === "hex"
                    ? state.fields.find((field) => field.ownerId === mage.id)
                    : state.collapses.find((collapse) => collapse.ownerId === mage.id);
            expect(pending, `${spell} fixture left no pending warning`);
            await turn();
            await frame();
            // The tinted colour layer of each warning tile; older packages used gold "danger" sprites.
            const sprites = warningSprites("SpiderlingsSpellVisuals_danger_").filter(
                (sprite) => !/_(wb|wbh)$/.test(sprite.id),
            );
            const danger = KDGetWarnings(KinkyDungeonPlayerEntity.x, KinkyDungeonPlayerEntity.y);
            const mageRow = {
                kind: `mage-${kind}`,
                tints: [...new Set(sprites.map((sprite) => sprite.tint))],
                boards: [...new Set(sprites.map((sprite) => sprite.board))],
                danger: danger.length,
                msg: KinkyDungeonFindSpell(spell, true).msg === true,
            };
            rows.push(mageRow);
            images[`mage-${kind}`] = await photo();
            check(
                mageRow.tints.length === 1 && mageRow.tints[0] === 0xa77bdc,
                `${spell} warning is not tinted with its spell colour`,
                mageRow.tints,
            );
            check(mageRow.danger > 0, `${spell} warning does not mark the player's tile as native danger`, mageRow);
            check(mageRow.msg, `${spell} does not use the native enemy cast message`, mageRow);
        }

        globalThis.bossAcceptance.enter("telegraph-boss");
        const encounter = Spiderlings.BossEncounter.state(),
            boss = Spiderlings.BossEncounter.boss();
        for (const enemy of [...KDMapData.Entities])
            if (enemy !== boss && !Spiderlings.BossFootprint.isPart(enemy)) KDRemoveEntity(enemy, false, false, true);
        encounter.builderIds = [];
        encounter.warnings = [];
        encounter.nextBody = encounter.nextSupport = encounter.nextPulse = 10000;
        boss.stun = 999;
        KDMovePlayer(boss.x, boss.y + 4, false);
        const fan = [];
        for (let y = boss.y + 2; y <= boss.y + 6; y++)
            for (let x = boss.x - (y - boss.y); x <= boss.x + (y - boss.y); x++) fan.push({ x, y });
        const melee = [];
        for (let dx = -2; dx <= 2; dx++)
            for (let dy = -2; dy <= 2; dy++)
                if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) melee.push({ x: boss.x + dx, y: boss.y + dy });
        const bossRow = { kind: "boss", stages: [] };
        rows.push(bossRow);
        for (const [label, warning] of [
            ["boss-fan-early", { kind: "fan", cells: fan, at: encounter.clock + 2 }],
            ["boss-fan-final", { kind: "fan", cells: fan, at: encounter.clock + 1 }],
            ["boss-melee", { kind: "melee", cells: melee, at: encounter.clock + 1 }],
        ]) {
            encounter.warnings = [warning];
            await frame();
            await frame();
            const sprites = warningSprites("SpiderlingsBossView_");
            bossRow.stages.push({
                label,
                sprites: sprites.length,
                tints: [...new Set(sprites.map((sprite) => sprite.tint))],
                boards: [...new Set(sprites.map((sprite) => sprite.board))],
                playerInside: near(warning.cells, KinkyDungeonPlayerEntity.x, KinkyDungeonPlayerEntity.y),
            });
            images[label] = await photo();
        }
        encounter.warnings = [];
        for (const stage of bossRow.stages)
            check(
                stage.sprites > 0 && stage.tints.includes(0xcdb4ff),
                `${stage.label} does not use native warning sprites tinted with the Matriarch colour`,
                stage,
            );

        // Tunneler digs run through native AI casting, which pays the cooldown and starts the native channel.
        const nests = () => KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "NestEntrance");
        const digScene = async (seed) => {
            setup(seed);
            clearFloor();
            KDMovePlayer(12, 10, false);
            const tunneler = spawn("Tunneler", 10, 10);
            const log = KinkyDungeonMessageLog.length;
            let turns = 0;
            for (; turns < 8 && !Spiderlings.TunnelerDig.pending().length; turns++) await turn();
            check(Spiderlings.TunnelerDig.pending().length === 1, "The Tunneler did not start a native dig", {
                turns,
                tunneler: { x: tunneler.x, y: tunneler.y, hp: tunneler.hp, castCooldown: tunneler.castCooldown },
            });
            return { tunneler, log, turns, cell: { x: tunneler.x, y: tunneler.y } };
        };
        const dig = await digScene("telegraph-tunneler");
        const digRow = { kind: "tunneler-dig", startTurns: dig.turns, cell: dig.cell, stages: [] };
        rows.push(digRow);
        for (const label of ["tunneler-dig-early", "tunneler-dig-final"]) {
            const tiles = await drawnImages("SpiderlingsSpellVisuals_dig_");
            digRow.stages.push({
                label,
                remaining: Spiderlings.TunnelerDig.pending()[0]?.remaining,
                colour: tiles.filter((tile) => tile.id.endsWith("_wc")),
                danger: KDGetWarnings(dig.cell.x, dig.cell.y).length,
                nests: nests().length,
                tunnelerAt: KDMapData.Entities.includes(dig.tunneler) && { x: dig.tunneler.x, y: dig.tunneler.y },
            });
            images[label] = await photo();
            await turn();
        }
        Object.assign(digRow, {
            messages: logFrom(dig.log),
            nests: nests().map(({ x, y }) => ({ x, y })),
            tunnelerRemains: KDMapData.Entities.includes(dig.tunneler),
        });
        images["tunneler-nest"] = await photo();
        for (let n = 0; n < 3; n++) await turn();
        digRow.nestsLater = nests().length;
        const [early, final] = digRow.stages;
        check(
            early.remaining === 2 &&
                early.colour.some((tile) => tile.image === "WarningColorSpecialBasic.png" && tile.tint === 0xff00ff) &&
                final.remaining === 1 &&
                final.colour.some((tile) => tile.image === "WarningColorSpecial.png" && tile.tint === 0xff00ff),
            "The dig tile is not a two-turn Special wind-up in the Tunneler colour",
            digRow.stages,
        );
        check(
            digRow.stages.every((stage) => stage.nests === 0 && stage.tunnelerAt && stage.danger > 0),
            "The nest opened or the Tunneler left before the wind-up ended",
            digRow.stages,
        );
        const digAnnounce = digRow.messages.find(
            (entry) => entry.text === TextGet("KinkyDungeonSpellCastSummonNestEntrance"),
        );
        check(
            digAnnounce?.color === "#ff8844",
            "The dig is not announced in the native enemy cast colour",
            digAnnounce,
        );
        const nestMessage = TextGet("KinkyDungeonSummonSingleNestEntrance");
        check(
            digRow.nests.length === 1 &&
                digRow.nests[0].x === dig.cell.x &&
                digRow.nests[0].y === dig.cell.y &&
                digRow.nestsLater === 1 &&
                !digRow.tunnelerRemains &&
                digRow.messages.filter((entry) => entry.text === nestMessage).length === 1,
            "One finished dig must open exactly one announced nest on the dig tile",
            digRow,
        );
        check(
            !digRow.messages.some((entry) => unresolved(entry.text)),
            "Tunneler dig messages are missing their text",
            digRow.messages,
        );

        for (const [kind, interrupt] of [
            ["tunneler-stunned", (tunneler) => (tunneler.stun = 2)],
            [
                "tunneler-killed",
                (tunneler) =>
                    KinkyDungeonDamageEnemy(
                        tunneler,
                        { type: "pain", damage: 5 },
                        false,
                        true,
                        undefined,
                        undefined,
                        KinkyDungeonPlayerEntity,
                    ),
            ],
        ]) {
            const cut = await digScene(`telegraph-${kind}`);
            interrupt(cut.tunneler);
            for (let n = 0; n < 4; n++) await turn();
            const cutRow = {
                kind,
                pending: Spiderlings.TunnelerDig.pending().length,
                nests: nests().length,
                tunneler: KDMapData.Entities.includes(cut.tunneler)
                    ? { hp: cut.tunneler.hp, channel: cut.tunneler.channel }
                    : null,
            };
            rows.push(cutRow);
            if (kind === "tunneler-stunned") images[kind] = await photo();
            check(
                cutRow.pending === 0 &&
                    cutRow.nests === 0 &&
                    (kind === "tunneler-killed" ? !cutRow.tunneler : cutRow.tunneler?.hp > 0),
                `An interrupted dig (${kind}) opened a nest or lost its Tunneler`,
                cutRow,
            );
        }

        setup("telegraph-nest");
        clearFloor();
        KDMovePlayer(12, 10, false);
        const nest = spawn("NestEntrance", 9, 10);
        const nestLog = KinkyDungeonMessageLog.length,
            nativeRandom = KDRandom;
        let calls = 0;
        try {
            KDRandom = () => (++calls === 1 ? 0 : calls === 2 ? 0.1 : nativeRandom());
            nest.SpiderlingsNestReinforcementTimer = 0;
            expect(
                Spiderlings.runNestReinforcements(null, { allied: false, delta: 2 }) === 1,
                "Nest reinforcement fixture did not spawn",
            );
        } finally {
            KDRandom = nativeRandom;
        }
        await frame();
        const nestRow = { kind: "nest-reinforcement", messages: logFrom(nestLog) };
        rows.push(nestRow);
        images["nest-reinforcement"] = await photo();
        check(
            nestRow.messages.length === 1 && !unresolved(nestRow.messages[0].text),
            "A visible Nest reinforcement is not announced",
            nestRow.messages,
        );

        // The tracking rune winds up for one native turn before contact; stepping out of its tile avoids it.
        globalThis.bossAcceptance.enter("telegraph-rune");
        const runeBoss = Spiderlings.BossEncounter.boss(),
            runeEncounter = Spiderlings.BossEncounter.state();
        for (const enemy of [...KDMapData.Entities])
            if (enemy !== runeBoss && !Spiderlings.BossFootprint.isPart(enemy))
                KDRemoveEntity(enemy, false, false, true);
        runeEncounter.builderIds = [];
        runeEncounter.warnings = [];
        runeEncounter.nextBody = runeEncounter.nextSupport = runeEncounter.nextPulse = 10000;
        runeBoss.stun = 999;
        KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
        const freeCell = (cells) =>
            cells.find(
                (cell) =>
                    KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y)) &&
                    !KinkyDungeonEntityAt(cell.x, cell.y),
            );
        // A teleported player keeps interpolating its sprite; snap it so photographs show the real tile.
        const place = (cell) => {
            KDMovePlayer(cell.x, cell.y, false);
            KinkyDungeonPlayerEntity.visual_x = cell.x;
            KinkyDungeonPlayerEntity.visual_y = cell.y;
        };
        const runeRow = { kind: "boss-rune", attempts: [] };
        rows.push(runeRow);
        for (const dodge of [true, false]) {
            expect(Spiderlings.BossCapture.start(runeBoss), "Cannot start the tracking rune");
            for (let n = 0; n < 6 && Spiderlings.BossCapture.state()?.phase === "warning"; n++) await turn();
            const rune = KDMapData.Entities.find((enemy) => enemy.id === Spiderlings.BossCapture.state()?.runeId);
            expect(rune, "The capture warning produced no tracking rune");
            // Stand beside the rune, away from the Matriarch, so its next native turn starts the attack.
            const away = Math.sign(rune.y - runeBoss.y) || 1;
            const beside = freeCell([
                { x: rune.x, y: rune.y + away },
                { x: rune.x + 1, y: rune.y + away },
                { x: rune.x - 1, y: rune.y + away },
            ]);
            expect(beside, "No free tile beside the tracking rune");
            place(beside);
            await turn();
            const tiles = (await drawnImages(`_w${rune.id}`)).filter((tile) => tile.image.startsWith("WarningColor"));
            const attempt = {
                dodge,
                warned: {
                    phase: Spiderlings.BossCapture.state()?.phase,
                    warningTiles: rune.warningTiles?.length || 0,
                    tiles,
                    danger: KDGetWarnings(KinkyDungeonPlayerEntity.x, KinkyDungeonPlayerEntity.y).length,
                },
            };
            runeRow.attempts.push(attempt);
            if (!dodge) images["boss-rune-warning"] = await photo();
            else {
                const step = freeCell([
                    { x: beside.x, y: beside.y + 2 * away },
                    { x: beside.x + 2, y: beside.y },
                    { x: beside.x - 2, y: beside.y },
                ]);
                expect(step, "No dodge tile out of the rune's reach");
                place(step);
            }
            await turn();
            attempt.after = { phase: Spiderlings.BossCapture.state()?.phase };
            Spiderlings.BossCapture.interrupt(true);
        }
        const [dodged, stayed] = runeRow.attempts;
        check(
            runeRow.attempts.every(
                ({ warned }) =>
                    warned.phase === "rune" &&
                    warned.warningTiles > 0 &&
                    warned.tiles.some((tile) => tile.image === "WarningColor.png" && tile.tint === 0xbca0e8),
            ),
            "The rune did not show a one-turn native wind-up in its own colour before contact",
            runeRow.attempts,
        );
        check(dodged.after.phase === "rune", "Stepping out of the rune's warning did not avoid it", dodged);
        check(stayed.after.phase === "contest", "The rune did not land after its one-turn wind-up", stayed);

        const runeText = TextGet("AttackSpiderlingsMatriarchRune");
        rows.push({ kind: "boss-rune-hit", text: runeText });
        check(!unresolved(runeText) && runeText !== "AttackSpiderlingsMatriarchRune", "Matriarch rune hit text", {
            runeText,
        });
    } finally {
        KDToggles.ForceWarnings = nativeForce;
    }
    return { rows, images };
})();
