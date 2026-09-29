(async () => {
    const { setup, spawn, turn, pin, save, restore, enemy, expect, frame } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const comparisons = [];
    const originalCast = KinkyDungeonCastSpell;
    const originalDamage = KinkyDungeonDealDamage;
    let target, sample, tick, incoming;
    KinkyDungeonCastSpell = function (x, y, spell, source) {
        const result = originalCast.apply(this, arguments);
        if (sample && source?.id === target?.id && result?.result === "Cast")
            sample.casts.push({ tick, spell: spell.name, status: Spiderlings.NPCAdhesion.status(target) });
        return result;
    };
    KinkyDungeonDealDamage = function (damage, bullet) {
        incoming = { source: bullet?.bullet?.source, spell: bullet?.bullet?.spell?.name };
        try {
            return originalDamage.apply(this, arguments);
        } finally {
            incoming = undefined;
        }
    };
    KDAddEvent(KDEventMapGeneric, "beforePlayerDamage", "NormalOffenseAcceptance", (_e, data) => {
        if (sample)
            sample.hits.push({
                tick,
                ...incoming,
                damage: data.dmgOrig,
                type: data.type,
                status: Spiderlings.NPCAdhesion.status(target),
                helpless: KDHelpless(target),
            });
    });
    try {
        for (const [name, distance] of [
            ["MaidKnightHeavy", 1],
            ["MaidforceMini", 4],
            ["DragonGirlCrystal", 4],
            ["MaidforceHead", 4],
        ]) {
            target = undefined;
            sample = undefined;
            setup(`offense-${name}`);
            target = spawn(name, 15, 10, "Maidforce");
            target.hostile = 999;
            target.shield = 0;
            const caster = spawn("WebCaster", 13, 10);
            pin(target, caster);
            // Head Maid's native projectile can land several turns after selection. Add real silk
            // hits so native struggle does not erase full adhesion before the impact comparison.
            const bindingFloor = target.Enemy.maxhp * (name === "MaidforceHead" ? 1.5 : 0.75);
            while (target.boundLevel < bindingFloor) Spiderlings.Combat.hitNPC(caster, target, "direct");
            expect(!KDHelpless(target), "Offense fixture became natively helpless while adding silk");
            KDMapData.Entities = [target];
            KDMapData.Bullets = [];
            KDMapData.EffectTiles = {};
            KDUpdateEnemyCache = true;
            KDMovePlayer(15 + distance, 10, false);
            const id = target.id;
            await frame();
            await frame();
            const snapshot = save();
            const expected =
                name === "MaidKnightHeavy"
                    ? [
                          { spell: undefined, type: "tickle" },
                          { spell: "HeavySlash", type: "crush" },
                      ]
                    : name === "MaidforceHead"
                      ? [{ spell: "Hairpin", type: "pain" }]
                      : [];
            // Native accuracy and spell selection can legitimately produce no matching hit.
            // Retain every paired trial, including misses, and require actual impact evidence.
            for (let trial = 0; trial < (expected.length ? 8 : 1); trial++) {
                for (const control of [false, true]) {
                    sample = undefined;
                    restore(snapshot);
                    target = enemy(id);
                    if (control) delete target.SpiderlingsNPCAdhesion;
                    target.castCooldown = 0;
                    target.attackPoints = target.Enemy.attackPoints;
                    target.movePoints = 0;
                    sample = {
                        name,
                        control,
                        trial,
                        initialBinding: target.boundLevel,
                        casts: [],
                        hits: [],
                        turns: [],
                    };
                    rows.push(sample);
                    for (tick = 1; tick <= 6; tick++) {
                        // Native rendering also consumes RNG between frames. Pair each world step,
                        // keeping native attack/spell selection and collision fully enabled.
                        KDsetSeed(`matched-offense-${name}-${trial}-${tick}`);
                        await turn();
                        sample.turns.push({
                            tick,
                            x: target.x,
                            y: target.y,
                            status: Spiderlings.NPCAdhesion.status(target),
                            boundLevel: target.boundLevel,
                            castCooldown: target.castCooldown,
                            attackPoints: target.attackPoints,
                        });
                    }
                }
                const [pinned, control] = rows.slice(-2);
                for (const { spell, type } of expected) {
                    const hits = pinned.hits.filter(
                        (entry) =>
                            entry.spell === spell && entry.type === type && entry.status === "full" && !entry.helpless,
                    );
                    const baseline = control.hits.find((entry) => entry.spell === spell && entry.type === type);
                    if (!hits.length || !baseline) continue;
                    for (const hit of hits)
                        expect(
                            Math.abs(hit.damage / baseline.damage - 0.65) < 1e-9,
                            `Native damage scaled incorrectly: ${JSON.stringify({ name, trial, hit, baseline })}`,
                        );
                    const category = spell || "melee";
                    if (!comparisons.some((entry) => entry.name === name && entry.category === category))
                        comparisons.push({ name, category, trial, pinned: hits[0].damage, control: baseline.damage });
                }
                if (
                    expected.every(({ spell }) =>
                        comparisons.some((entry) => entry.name === name && entry.category === (spell || "melee")),
                    )
                )
                    break;
            }
            expect(
                expected.every(({ spell }) =>
                    comparisons.some((entry) => entry.name === name && entry.category === (spell || "melee")),
                ),
                `Missing native capable full-pin hit: ${name}: ${JSON.stringify(rows.filter((entry) => entry.name === name))}`,
            );
        }
    } finally {
        KinkyDungeonCastSpell = originalCast;
        KinkyDungeonDealDamage = originalDamage;
        delete KDEventMapGeneric.beforePlayerDamage.NormalOffenseAcceptance;
    }
    expect(
        rows
            .filter((row) => row.name === "MaidKnightHeavy" && !row.control)
            .some((row) => row.casts.some((entry) => entry.status === "full")),
        "Full-pinned NPC did not choose its spell",
    );
    return { rows, comparisons };
})();
