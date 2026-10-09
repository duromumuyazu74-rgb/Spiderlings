(async () => {
    // Actual packaged three-tier action; native payment, time, damage and recovery.
    // NPC movement, retaliation, spells, summons and unrelated wandering are paused.
    const { setup, spawn, frame, expect } = globalThis.normalAcceptance;
    const CONV = "SpiderlingsCocoonConvergence",
        KEY = "SpiderlingsWeapons";
    const nativeLookup = KinkyDungeonGetEnemyByName,
        nativeMove = KinkyDungeonEnemyTryMove;
    const nativeWander = KinkyDungeonHandleWanderingSpawns,
        nativeJail = globalThis.KinkyDungeonHandleJailSpawns;
    let frozenNames = new Map(),
        frozenEntities = new Set(),
        activeCast,
        castPayments = [],
        hitTrace = [];
    KinkyDungeonGetEnemyByName = function (name) {
        return frozenNames.get(name) || nativeLookup.apply(this, arguments);
    };
    KinkyDungeonEnemyTryMove = function (enemy) {
        return frozenEntities.has(enemy) ? false : nativeMove.apply(this, arguments);
    };
    KinkyDungeonHandleWanderingSpawns = () => {};
    globalThis.KinkyDungeonHandleJailSpawns = () => {};
    const stats = () => ({
        stamina: KinkyDungeonStatStamina,
        mana: KinkyDungeonStatMana,
        pool: globalThis.KinkyDungeonStatManaPool,
        will: KinkyDungeonStatWill,
    });
    const snapshot = (enemy) => ({
        name: enemy.Enemy.name,
        x: enemy.x,
        y: enemy.y,
        hp: enemy.hp,
        maxhp: enemy.Enemy.maxhp,
        shield: enemy.shield || 0,
        armor: enemy.Enemy.armor || 0,
        spellResist: enemy.Enemy.spellResist || 0,
        bound: enemy.boundLevel || 0,
        slime: enemy.specialBoundLevel?.Slime || 0,
        boundEffects: KDBoundEffects(enemy),
        helpless: KDHelpless(enemy),
        cocoon: !!Spiderlings.WeaponWebbing.status(enemy)?.cocoon,
        canBind: KDCanBind(enemy),
        hostile: KDHostile(enemy),
        rank: globalThis.KDEnemyRank(enemy),
        struggleThreshold: KDNPCStruggleThreshMult(enemy) * enemy.Enemy.maxhp,
        tags: enemy.Enemy.tags,
        resistance: enemy.Enemy.Resistance,
    });
    const wait = () => {
        KinkyDungeonLastAction = "Wait";
        KinkyDungeonAdvanceTime(1, true);
    };
    const reset = (seed, weapon, targetName) => {
        frozenNames.clear();
        frozenEntities.clear();
        activeCast = undefined;
        castPayments = [];
        hitTrace = [];
        setup(seed);
        MiniGameKinkyDungeonLevel = 12;
        KinkyDungeonBulletsVisual.clear();
        KDDamageQueue.length = 0;
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
                KinkyDungeonVisionSet(x, y, 5);
            }
        KDMovePlayer(8, 10, false);
        KinkyDungeonInventoryAddWeapon(weapon);
        KDSetWeapon(weapon);
        wait();
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
        const original = nativeLookup(targetName);
        frozenNames.set(targetName, {
            ...original,
            movePoints: 1000,
            attackPoints: 1000,
            specialAttackPoints: 1000,
            attack: "",
            specialAttack: "",
            spells: [],
            summon: [],
            noWander: true,
        });
        KinkyDungeonStatStamina = 10;
        KinkyDungeonStatMana = 12;
        globalThis.KinkyDungeonStatManaPool = 0;
        KinkyDungeonStatWill = 10;
    };
    KDAddEvent(KDEventMapGeneric, "afterPlayerCast", "TomeChargeResearch", (_event, data) => {
        if (data.spell?.name !== CONV) return;
        const circle = KDMapData[KEY].collapses[0];
        castPayments.push({
            nativeQuotedCost: data.manacost,
            manaAfterPayment: KinkyDungeonStatMana,
            stageBeforeCommit: circle?.stage || 0,
        });
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "TomeChargeResearch", (_event, data) => {
        if (data.spell?.name === CONV || data.spell?.name === "TomeBondage")
            hitTrace.push({
                ...snapshot(data.enemy),
                spell: data.spell.name,
                inputHP: data.incomingDamage.damage,
                inputBind: data.incomingDamage.bind,
                dmgDealt: data.dmgDealt,
                dmgShieldDealt: data.dmgShieldDealt,
                blocked: !!data.blocked,
                shieldBlocked: !!data.shieldBlocked,
            });
    });
    const models = [
        { name: "production-base", stages: 1, maxBind: 1, cooldown: 8 },
        { name: "production-mid", stages: 2, maxBind: 1.5, cooldown: 9 },
        { name: "production-high", stages: 3, maxBind: 4.5, cooldown: 12 },
    ];
    const scenarios = [
        { name: "Maid", npc: "Maidforce" },
        { name: "Wolf", npc: "Wolfgirl" },
        { name: "heavy-shield", npc: "HeavySkeleton", preparedShield: 5 },
        { name: "anti-glue", npc: "Alchemist" },
    ];
    const rows = [];
    try {
        for (const scenario of scenarios)
            for (const entry of models) {
                for (let trial = 0; trial < 32; trial++) {
                    const seed = `tome-charge-${scenario.name}-${trial}`;
                    reset(seed, "SpiderlingTome", scenario.npc);
                    const targets = [0, 1, 2].map((ring) => {
                        const target = spawn(scenario.npc, 12 + ring, 10, "Enemy");
                        target.hostile = 999;
                        frozenEntities.add(target);
                        if (scenario.preparedShield) target.shield = scenario.preparedShield;
                        return target;
                    });
                    const initial = stats(),
                        before = targets.map(snapshot),
                        clockStart = KDGameData[KEY].clock;
                    for (let stage = 1; stage <= entry.stages; stage++) {
                        const beforePaid = KinkyDungeonStatMana,
                            beforeClock = KDGameData[KEY].clock;
                        let result;
                        if (stage === 1) {
                            KinkyDungeonActivateWeaponSpell();
                            expect(
                                KinkyDungeonTargetingSpell?.name === CONV,
                                "Native Tome button rejected initial targeting",
                            );
                            result = KDInputTypes.tryCastSpell({
                                tx: 12,
                                ty: 10,
                                spellname: CONV,
                                player: KDPlayer(),
                                targetingSpellWeapon: KinkyDungeonPlayerDamage,
                            });
                        } else {
                            KinkyDungeonTargetX = 29;
                            KinkyDungeonTargetY = 19;
                            KinkyDungeonActivateWeaponSpell();
                            expect(
                                KDMapData[KEY].collapses[0].stage === stage &&
                                    KDGameData[KEY].clock === beforeClock + 1,
                                "Native repeat button failed to spend exactly one upgrade action",
                            );
                            expect(!KinkyDungeonTargetingSpell, "Upgrade displayed a second false target");
                            result = "Cast";
                        }
                        castPayments.at(-1).actualPaid = beforePaid - castPayments.at(-1).manaAfterPayment;
                        castPayments.at(-1).baseCost = stage === 1 ? 4 : 2;
                        activeCast = KDMapData[KEY].collapses[0];
                        castPayments.at(-1).stage = activeCast.stage;
                        expect(result === "Cast", `Candidate cast failed ${seed}/${entry.name}/${stage}: ${result}`);
                    }
                    let waits = 0;
                    while (KDMapData[KEY].collapses.length && waits < 8) {
                        wait();
                        waits++;
                    }
                    expect(
                        hitTrace.length === 3,
                        `Candidate circle did not hit three targets ${seed}/${entry.name}: ${hitTrace.length}`,
                    );
                    rows.push({
                        scenario: scenario.name,
                        model: entry.name,
                        seed,
                        initial,
                        before,
                        casts: castPayments,
                        totalPaidMana: castPayments.reduce((sum, c) => sum + c.actualPaid, 0),
                        totalBaseMana: castPayments.reduce((sum, c) => sum + c.baseCost, 0),
                        worldActions: KDGameData[KEY].clock - clockStart,
                        waitActions: waits,
                        final: stats(),
                        hits: hitTrace,
                        targets: targets.map(snapshot),
                        definition: {
                            ...entry,
                            hpRings: [6, 4, 2],
                            baseBindRings: [24, 16, 8],
                            aoeTiles: 21,
                            range: 6,
                            preparedShield: scenario.preparedShield || 0,
                        },
                    });
                }
                await frame();
            }
    } finally {
        KinkyDungeonGetEnemyByName = nativeLookup;
        KinkyDungeonEnemyTryMove = nativeMove;
        KinkyDungeonHandleWanderingSpawns = nativeWander;
        globalThis.KinkyDungeonHandleJailSpawns = nativeJail;
        delete KDEventMapGeneric.afterDamageEnemy.TomeChargeResearch;
        delete KDEventMapGeneric.afterPlayerCast.TomeChargeResearch;
    }
    return {
        kind: "native-production-Tome-three-tier-input-comparison",
        rows,
        configuration: {
            floor: 12,
            room: [31, 21],
            classMode: "Mage",
            perks: [],
            maxSPMPWP: [10, 15, 10],
            initialSPMPWP: [10, 12, 10],
            pool: 0,
            nativeManaRegen: "retained: first base4 cast discounted by3, upgrades after Suspend16",
            npcPaused: "movement/attacks/spells/summons/wandering/jail",
            preserved: "native damage, armor/resistance/block/shield, binding, recovery, resources, input/cast/time",
            seedsPerCell: 32,
            limitation:
                "Production native Tome button and successful input/payment/actions; NPC movement and retaliation paused. Failure/low-resource/save separately covered in weapons acceptance.",
        },
    };
})();
