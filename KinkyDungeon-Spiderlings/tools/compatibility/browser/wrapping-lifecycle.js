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
                samples[0].dealt > 0 && Math.abs(samples[1].dealt - samples[0].dealt) < 1e-8,
                `Owned pin unexpectedly amplified native damage: ${JSON.stringify(samples)}`,
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
        const source = prepare("sustained-nonlethal-departure");
        Spiderlings.Combat.applySilkBinding(source, target, 1000, { attack: "direct" });
        target.items = ["RedKey", "PotionMana"];
        const id = target.id,
            hp = target.hp;
        KDMapData.SpiderlingsNPCWrapping = { version: 1, records: { [id]: { progress: 3 } } };
        restore(save());
        target = enemy(id);
        expect(!KDMapData.SpiderlingsNPCWrapping && target.hp === hp, "Legacy migration altered native prey");
        for (let tick = 0; tick < 3; tick++) await turn();
        expect(target.SpiderlingsNPCWrapping.remaining === 3, "Departure did not count three world turns");
        const before = JSON.stringify(target.SpiderlingsNPCWrapping);
        restore(save());
        target = enemy(id);
        expect(JSON.stringify(target.SpiderlingsNPCWrapping) === before, "Zero-time load consumed departure time");
        for (let tick = 0; tick < 2; tick++) await turn();
        expect(enemy(id) && target.hp === hp, "NPC left or lost HP before the six-turn rescue window");
        await turn();
        expect(!enemy(id) && target.hp === hp, "Sustained silk did not permit nonlethal departure");
        expect(
            row.exits.length === 1 && row.exits[0].result && !row.exits[0].kill && !row.exits[0].capture,
            "Departure produced death or collection",
        );
        const stolen = KDMapData.GroundItems.filter((item) => ["RedKey", "PotionMana"].includes(item.name));
        expect(stolen.length === 2, "Departure lost or duplicated stolen items");
        row.departure = { hp, preservedHP: target.hp, rescuedItems: stolen.map((item) => item.name) };

        const rescuerSource = prepare("rescue-resets-window");
        Spiderlings.Combat.applySilkBinding(rescuerSource, target, 1000, { attack: "direct" });
        const rescueId = target.id;
        for (let tick = 0; tick < 3; tick++) await turn();
        KDUntieEnemy(target, 10000, true, true);
        await turn();
        expect(!target.SpiderlingsNPCWrapping && enemy(rescueId), "Native untying did not cancel departure");
        Spiderlings.Combat.applySilkBinding(rescuerSource, target, 1000, { attack: "direct" });
        for (let tick = 0; tick < 5; tick++) await turn();
        expect(enemy(rescueId), "Rebinding reused old departure time");
        await turn();
        expect(!enemy(rescueId), "Rebinding did not start a fresh six-turn window");
        row.rescuedAndRebound = true;

        const vetoSource = prepare("native-removal-veto");
        Spiderlings.Combat.applySilkBinding(vetoSource, target, 1000, { attack: "direct" });
        const vetoId = target.id,
            vetoHP = target.hp;
        target.items = ["RedKey"];
        KDAddEvent(KDEventMapGeneric, "removeEnemy", "SpiderlingsAcceptanceVeto", (_event, data) => {
            if (data.enemy.id === vetoId && target.acceptanceVeto) data.cancel = true;
        });
        target.acceptanceVeto = true;
        try {
            for (let tick = 0; tick < 6; tick++) await turn();
            row.vetoState = {
                present: !!enemy(vetoId),
                hp: target.hp,
                expectedHP: vetoHP,
                held: target.items?.filter((name) => name === "RedKey").length || 0,
                dropped: KDMapData.GroundItems.filter((item) => item.name === "RedKey").length,
            };
            expect(
                row.vetoState.present && target.hp === vetoHP && row.vetoState.held + row.vetoState.dropped === 1,
                `Native veto did not preserve live prey and stolen items: ${JSON.stringify(row.vetoState)}`,
            );
            delete target.acceptanceVeto;
            await turn();
            expect(!enemy(vetoId), "Departure did not retry after native veto cleared");
        } finally {
            delete KDEventMapGeneric.removeEnemy.SpiderlingsAcceptanceVeto;
        }
        row.vetoHonored = true;

        const knockdownSource = prepare("native-knockdown-remains-native");
        Spiderlings.Combat.applySilkBinding(knockdownSource, target, 1000, { attack: "direct" });
        row.lethalDamage = damage(knockdownSource, 10000);
        expect(target.hp === 0.001 && KDMapData.Entities.includes(target), "Native bound knockdown was bypassed");
        expect(!row.exits.length, "Damage added immediate removal");
        expect(KDRemoveEntity(target, true, false), "Native death removal failed");
        expect(row.exits.length === 1 && row.exits[0].kill && !row.exits[0].capture, "Native death changed");
    } finally {
        KDRemoveEntity = nativeRemove;
    }
    return { rows };
})();
