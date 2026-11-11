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

        setup("telegraph-tunneler");
        clearFloor();
        KDMovePlayer(12, 10, false);
        const tunneler = spawn("Tunneler", 10, 10);
        const tunnelerLog = KinkyDungeonMessageLog.length;
        const nests = () => KDMapData.Entities.filter((enemy) => enemy.Enemy.name === "NestEntrance").length;
        // Let the native AI cast the dig. It applies suicideOnSpell and the cast cooldown; a direct
        // KinkyDungeonCastSpell skips both, so the surviving Tunneler digs a second nest on its next turn.
        let tunnelerTurns = 0;
        for (; tunnelerTurns < 6 && !nests(); tunnelerTurns++) await turn();
        const tunnelerRow = {
            kind: "tunneler-nest",
            turns: tunnelerTurns,
            messages: logFrom(tunnelerLog),
            nests: nests(),
            tunnelerRemains: KDMapData.Entities.includes(tunneler),
        };
        rows.push(tunnelerRow);
        images["tunneler-nest"] = await photo();
        const nestMessage = TextGet("KinkyDungeonSummonSingleNestEntrance");
        check(
            tunnelerRow.nests === 1 &&
                !tunnelerRow.tunnelerRemains &&
                tunnelerRow.messages.filter((entry) => entry.text === nestMessage).length === 1,
            "One Tunneler dig must open exactly one announced nest",
            tunnelerRow,
        );
        check(
            !tunnelerRow.messages.some((entry) => unresolved(entry.text)),
            "Tunneler nest message is missing its text",
            tunnelerRow.messages,
        );

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
