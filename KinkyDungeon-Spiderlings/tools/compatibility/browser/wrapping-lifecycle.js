(async () => {
    const { setup, spawn, turn, expect, pin, save, restore, enemy } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const nativeRemove = KDRemoveEntity;
    let target, row;
    KDRemoveEntity = function (entity, kill, capture) {
        const result = nativeRemove.apply(this, arguments);
        if (row && entity === target) row.exits.push({ kill: !!kill, capture: !!capture, result });
        return result;
    };
    const prepare = (mode) => {
        row = undefined;
        setup(`silk-vulnerability-${mode}`);
        const source = spawn("WebCaster", 14, 10);
        target = spawn("MaidKnightHeavy", 16, 10, "Maidforce");
        pin(target, source);
        source.stun = target.stun = 999;
        target.blocks = 0;
        target.shield = 0;
        target.hp = target.Enemy.maxhp;
        row = { mode, exits: [] };
        rows.push(row);
        expect(Spiderlings.NPCWrapping.vulnerable(target), "Full owned silk did not expose prey");
        return source;
    };
    const damage = (source, amount = 0.5) => {
        const before = { hp: target.hp, shield: target.shield || 0 };
        KinkyDungeonDamageEnemy(
            target,
            { type: "arcane", damage: amount, nocrit: true },
            true,
            true,
            undefined,
            undefined,
            source,
        );
        const after = { hp: target.hp, shield: target.shield || 0 };
        return { before, after, dealt: before.hp - after.hp + before.shield - after.shield };
    };
    try {
        for (const shield of [0, 20, 0.1]) {
            const samples = [];
            for (const exposed of [false, true]) {
                const source = prepare(`damage-${shield}-${exposed}`);
                if (!exposed) delete target.SpiderlingsNPCAdhesion;
                target.shield = shield;
                row.damage = damage(source);
                samples.push(row.damage);
            }
            expect(
                samples[0].dealt > 0 && Math.abs(samples[1].dealt - samples[0].dealt * 4) < 1e-8,
                `Effective native damage is not fourfold: ${JSON.stringify(samples)}`,
            );
            if (shield === 20)
                expect(
                    samples.every((sample) => sample.before.hp === sample.after.hp),
                    "Silk vulnerability bypassed native shield",
                );
            if (shield === 0.1)
                expect(
                    samples.every((sample) => sample.after.shield === 0 && sample.after.hp < sample.before.hp),
                    "Broken shield did not pass native overflow into HP",
                );
        }
        for (const mode of ["immune", "zero", "free", "protected", "foreign", "nocapture"]) {
            const source = prepare(mode);
            if (mode === "immune" || mode === "nocapture")
                target.Enemy = {
                    ...target.Enemy,
                    tags: { ...target.Enemy.tags, [mode === "immune" ? "arcaneimmune" : "nocapture"]: true },
                };
            if (mode === "free") KDUntieEnemy(target, 1000, true, true);
            if (mode === "protected") target.shop = true;
            if (mode === "foreign") delete target.SpiderlingsNPCAdhesion;
            if (["free", "protected", "foreign", "nocapture"].includes(mode))
                expect(!Spiderlings.NPCWrapping.vulnerable(target), `${mode} prey retained exposure`);
            row.damage = damage(source, mode === "zero" ? 0 : 0.5);
            if (mode === "immune" || mode === "zero") expect(row.damage.dealt === 0, `${mode} produced damage`);
        }
        const source = prepare("legacy-reload-no-countdown");
        Spiderlings.Combat.applySilkBinding(source, target, 1000, { attack: "direct" });
        const id = target.id;
        KDMapData.SpiderlingsNPCWrapping = {
            version: 1,
            records: {
                [id]: { targetId: id, progress: 3, helplessTurns: 3, sourceIds: [source.id] },
            },
            paidSourceIds: [source.id],
        };
        const before = { hp: target.hp, bound: target.boundLevel, slime: target.specialBoundLevel.Slime };
        restore(save());
        target = enemy(id);
        row.reload = {
            before,
            after: { hp: target.hp, bound: target.boundLevel, slime: target.specialBoundLevel.Slime },
        };
        expect(
            JSON.stringify(row.reload.before) === JSON.stringify(row.reload.after),
            "Legacy migration altered native prey",
        );
        expect(
            !KDMapData.SpiderlingsNPCWrapping && Spiderlings.NPCWrapping.vulnerable(target),
            "Reload retained countdown or lost real silk exposure",
        );
        for (let tick = 0; tick < 8; tick++) await turn();
        expect(
            KDMapData.Entities.includes(target) && !row.exits.length,
            "Elapsed turns removed living silk-bound prey",
        );
        row.afterTurns = { hp: target.hp, vulnerable: Spiderlings.NPCWrapping.vulnerable(target) };
        // Native lethal damage to a fully bound NPC becomes knockdown, not a Mod capture.
        row.lethalDamage = damage(enemy(source.id), 10000);
        expect(target.hp === 0.001 && KDMapData.Entities.includes(target), "Native bound knockdown was bypassed");
        expect(!row.exits.length, "Damage added a non-native removal");
        expect(KDRemoveEntity(target, true, false), "Native death removal failed");
        expect(!Spiderlings.NPCWrapping.vulnerable(target), "Removed prey retained exposure");
        expect(
            row.exits.filter((exit) => exit.result && exit.kill && !exit.capture).length === 1,
            "Native death did not remove exactly once",
        );
        Spiderlings.NPCWrapping.preemptNativeCapture();
        expect(!row.exits.some((exit) => exit.capture), "Death was followed by Mod capture");
    } finally {
        KDRemoveEntity = nativeRemove;
    }
    return { rows };
})();
