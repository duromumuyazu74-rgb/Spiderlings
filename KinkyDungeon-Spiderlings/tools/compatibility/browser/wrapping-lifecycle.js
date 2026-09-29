(async () => {
    const { setup, spawn, turn, expect, pin, save, restore, enemy, frame } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const originalRemove = KDRemoveEntity;
    let target, row, tick;
    KDRemoveEntity = function (entity, kill, capture) {
        const result = originalRemove.apply(this, arguments);
        if (row && entity.id === target?.id) row.exits.push({ tick, kill: !!kill, capture: !!capture, result });
        return result;
    };
    try {
        for (const mode of [
            "single",
            "three",
            "stun",
            "displace",
            "free",
            "reload",
            "death-first",
            "capture-first",
            "helpless",
            "helpless-recovery",
            "foreign-helpless",
            "nocapture",
            "protected",
            "hunting-shop",
            "retaliation",
        ]) {
            row = undefined;
            setup(`wrapping-${mode}`);
            target = spawn(mode === "nocapture" ? "BlindZombie" : "MaidKnightHeavy", 16, 10, "Maidforce");
            // Isolate lifecycle ordering; the separate retaliation row leaves native offense active.
            if (mode !== "retaliation") target.stun = 99;
            const source = spawn("WebCaster", 14, 10);
            if (mode === "foreign-helpless") KDTieUpEnemy(target, 200, "Slime");
            else {
                if (mode === "nocapture") {
                    for (let n = 0; n < 8; n++) Spiderlings.Combat.hitNPC(source, target, "direct");
                } else {
                    pin(target, source);
                    while (target.boundLevel < 38) Spiderlings.Combat.hitNPC(source, target, "direct");
                }
                if (mode.startsWith("helpless"))
                    Spiderlings.Combat.applySilkBinding(source, target, 100, { attack: "direct" });
            }
            const actors = [source];
            KDMoveEntity(source, 15, 10, false);
            if (mode === "three")
                for (const [x, y] of [
                    [16, 9],
                    [16, 11],
                ])
                    actors.push(spawn("WebCaster", x, y));
            if (mode === "three")
                for (const actor of actors) actor.SpinnerConstructionPoints = actor.Enemy.movePoints - 1;
            if (["helpless", "helpless-recovery", "foreign-helpless", "nocapture"].includes(mode))
                for (const actor of actors) KDMoveEntity(actor, 5, 5, false);
            if (mode === "protected" || mode === "hunting-shop") target.shop = true;
            if (mode === "hunting-shop") {
                KDMapData.MapMod = "SpiderlingsHuntingGrounds";
                KDMapData.SpiderlingsHuntingGrounds = {
                    garrisonVersion: 2,
                    status: "active",
                    targetIds: [],
                    destroyedIds: [],
                };
                expect(Spiderlings.HuntingGrounds.active(), "Hunting Grounds role fixture is inactive");
            }
            row = { mode, exits: [], turns: [] };
            rows.push(row);
            await frame();
            for (tick = 1; tick <= 12; tick++) {
                if (mode === "death-first" && tick === 1) KDRemoveEntity(target, true, false);
                await turn();
                row.turns.push({
                    tick,
                    present: KDMapData.Entities.includes(target),
                    hp: target.hp,
                    status: Spiderlings.NPCAdhesion.status(target),
                    progress: structuredClone(Spiderlings.NPCWrapping.record(target)),
                    paid: KDMapData.SpiderlingsNPCWrapping?.paidSourceIds,
                    actors: actors.map((actor) => ({
                        hp: actor.hp,
                        x: actor.x,
                        y: actor.y,
                        stun: actor.stun,
                        disarm: actor.disarm,
                        bind: actor.bind,
                        credit: actor.SpinnerConstructionPoints,
                    })),
                });
                if (!KDMapData.Entities.includes(target)) {
                    if (mode === "capture-first") {
                        KinkyDungeonDamageEnemy(
                            target,
                            { type: "slash", damage: 10000, nocrit: true },
                            true,
                            true,
                            undefined,
                            undefined,
                            KinkyDungeonPlayerEntity,
                        );
                        await turn();
                    }
                    break;
                }
                const record = Spiderlings.NPCWrapping.record(target);
                if (!row.interrupted && (record?.progress > 0 || mode === "helpless-recovery")) {
                    row.interrupted = tick;
                    if (mode === "stun") for (const actor of actors) actor.stun = 999;
                    if (mode === "displace") KDMoveEntity(target, 22, 14, false);
                    if (mode === "free" || mode === "helpless-recovery") KDUntieEnemy(target, 1000, true, true);
                    if (mode === "reload") {
                        const id = target.id,
                            before = structuredClone(record);
                        restore(save());
                        target = enemy(id);
                        row.reload = { before, after: structuredClone(Spiderlings.NPCWrapping.record(target)) };
                    }
                }
                if (
                    row.interrupted &&
                    ["stun", "displace", "free", "helpless-recovery"].includes(mode) &&
                    tick >= row.interrupted + 2
                )
                    break;
            }
            const successful = row.exits.filter((exit) => exit.result);
            if (["single", "three", "reload", "capture-first", "helpless", "hunting-shop"].includes(mode))
                expect(
                    successful.filter((exit) => exit.capture && !exit.kill).length === 1,
                    `Native wrap failed: ${JSON.stringify(row)}`,
                );
            if (
                [
                    "stun",
                    "displace",
                    "free",
                    "helpless-recovery",
                    "foreign-helpless",
                    "nocapture",
                    "protected",
                ].includes(mode)
            )
                expect(
                    !successful.some((exit) => exit.capture),
                    `Ineligible/interrupted prey was captured: ${JSON.stringify(row)}`,
                );
            if (mode === "death-first")
                expect(!successful.some((exit) => exit.capture), "Death was followed by capture");
            if (mode === "capture-first")
                expect(!successful.some((exit) => exit.kill), "Stale damage killed already-captured prey");
            if (mode === "three")
                expect(successful[0].tick <= 2, "Three adjacent capable spiders did not share paid progress");
            if (row.reload)
                expect(
                    JSON.stringify(row.reload.before) === JSON.stringify(row.reload.after),
                    "Pending native capture changed on reload",
                );
            if (["stun", "displace", "free", "helpless-recovery"].includes(mode))
                expect(!row.turns.at(-1).progress?.progress, "Interrupted work retained progress");
        }
    } finally {
        KDRemoveEntity = originalRemove;
    }
    return { rows };
})();
