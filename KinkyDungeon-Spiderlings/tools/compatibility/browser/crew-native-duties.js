(async () => {
    const { setup, spawn, expect, frame } = globalThis.normalAcceptance,
        rows = [];
    for (const mode of ["ranged-kite", "runAway", "slow-flank"])
        for (const crew of [false, true]) {
            const seed = `crew-native-${mode}`;
            setup(seed);
            for (let y = 1; y < KDMapData.GridHeight - 1; y++)
                for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                    KinkyDungeonMapSet(x, y, "0");
                    KinkyDungeonTilesDelete(`${x},${y}`);
                    KinkyDungeonVisionSet(x, y, 5);
                }
            KDMovePlayer(2, 2, false);
            const actor = spawn(mode === "slow-flank" ? "Jumper" : "MageSpiderlings", 6, 10, "Enemy"),
                prey = spawn("Maidforce", mode === "ranged-kite" ? 9 : 10, 10, "Maidforce");
            actor.Enemy = { ...actor.Enemy, movePoints: mode === "slow-flank" ? 2 : 1 };
            actor.movePoints = mode === "slow-flank" ? 0 : 1;
            actor.flip = true;
            actor.attackPoints = 0;
            actor.castCooldown = 99;
            if (crew) actor.SpiderlingsHuntRole = "hunter";
            else delete actor.SpiderlingsHuntRole;
            actor.hp = mode === "runAway" ? 0.2 : actor.Enemy.maxhp;
            actor.gx = actor.tx = prey.x;
            actor.gy = actor.ty = prey.y;
            actor.path = undefined;
            actor.warningTiles = [];
            actor.items = prey.items = [];
            if (mode === "runAway") KinkyDungeonSetEnemyFlag(actor, "runAway", 99);
            const beforemove = KDAIType.hunt.beforemove,
                nativeMove = KinkyDungeonEnemyTryMove,
                ai = [],
                moves = [];
            KDAIType.hunt.beforemove = function (enemy, target, data) {
                if (enemy === actor)
                    ai.push({
                        kite: data.kite,
                        followRange: data.followRange,
                        canSeePlayer: data.canSeePlayer,
                        canSensePlayer: data.canSensePlayer,
                        canShootPlayer: data.canShootPlayer,
                        wantsToAttack: data.wantsToAttack,
                    });
                return beforemove.apply(this, arguments);
            };
            KinkyDungeonEnemyTryMove = function (enemy, direction, delta, x, y, ...rest) {
                const before = { x: enemy.x, y: enemy.y, credit: enemy.movePoints },
                    result = nativeMove.call(this, enemy, direction, delta, x, y, ...rest);
                if (enemy === actor)
                    moves.push({
                        delta,
                        direction,
                        before,
                        result,
                        after: { x: enemy.x, y: enemy.y, credit: enemy.movePoints },
                    });
                return result;
            };
            try {
                const startDistance = Math.hypot(actor.x - prey.x, actor.y - prey.y);
                KinkyDungeonEnemyLoop(actor, prey, 1, 1, []);
                const endDistance = Math.hypot(actor.x - prey.x, actor.y - prey.y);
                expect(ai.length > 0 && ai[0].canSensePlayer, "Duty fixture must reach native NPC perception");
                if (mode === "slow-flank") {
                    expect(
                        moves.filter((move) => move.delta === 1).length === 1,
                        "A slow flank must receive exactly one positive native movement payment",
                    );
                    expect(
                        actor.x === 6 && actor.y === 10 && actor.movePoints === 1,
                        "One turn cannot move a native two-credit unit; waiting must retain its credit",
                    );
                } else
                    expect(
                        ai[0].kite && endDistance > startDistance,
                        "The crew must preserve native ranged spacing and injury retreat",
                    );
                rows.push({
                    seed,
                    mode,
                    crew,
                    actor: actor.Enemy.name,
                    moveThreshold: actor.Enemy.movePoints,
                    startDistance,
                    endDistance,
                    hp: actor.hp,
                    ai,
                    moves,
                });
            } finally {
                KDAIType.hunt.beforemove = beforemove;
                KinkyDungeonEnemyTryMove = nativeMove;
            }
        }
    const seed = "test85-native-nest-projectile-mafia";
    setup(seed);
    MiniGameKinkyDungeonLevel = 12;
    KDToggles.Sound = false;
    KDGenMapCallback = null;
    KinkyDungeonState = "Game";
    for (let y = 1; y < KDMapData.GridHeight - 1; y++)
        for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
            KinkyDungeonVisionSet(x, y, 5);
        }
    KDMovePlayer(2, 2, false);
    KinkyDungeonStatStamina = 10;
    KinkyDungeonStatMana = 15;
    KinkyDungeonStatWill = 10;
    KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
        id: "NestProjectileObserver",
        type: "Sneak",
        power: 1000,
        duration: 999,
    });
    const nest = spawn("NestEntrance", 10, 10, "Enemy"),
        home = spawn("NestEntrance", 6, 14, "Enemy");
    nest.stun = home.stun = 999;
    nest.shield = home.shield = 0;
    KDMapData.MapMod = KDGameData.MapMod = "SpiderlingsHuntingGrounds";
    KDMapData.SpiderlingsHuntingGrounds = {
        status: "active",
        garrisonVersion: 3,
        targetIds: [nest.id, home.id],
        destroyedIds: [],
        target: 2,
    };
    const guard = spawn("WebCaster", 8, 14, "Enemy"),
        shooter = spawn("MaidforceMafia", 14, 10, "Maidforce");
    guard.SpiderlingsHuntRole = "guard";
    guard.SpiderlingsNestParentID = home.id;
    guard.aware = false;
    guard.gx = 8;
    guard.gy = 14;
    guard.tx = guard.ty = guard.target = undefined;
    shooter.Enemy = { ...shooter.Enemy, movePoints: 1000 };
    shooter.flip = false;
    shooter.gx = shooter.tx = nest.x;
    shooter.gy = shooter.ty = nest.y;
    shooter.target = nest.id;
    shooter.castCooldown = 0;
    for (const x of [10, 11, 12, 13]) for (const y of [12, 13]) KinkyDungeonMapSet(x, y, "1");
    KDUpdateEnemyCache = true;
    const fields = (actor) => ({
        id: actor.id,
        name: actor.Enemy.name,
        x: actor.x,
        y: actor.y,
        hp: actor.hp,
        target: actor.target,
        gx: actor.gx,
        gy: actor.gy,
        defender: actor.SpiderlingsTaskNestDefenderTarget,
        search: actor.SpiderlingsTaskNestSearch,
        alert: actor.SpiderlingsTaskNestAttacker,
    });
    expect(
        KDHostile(shooter, nest) && KDHostile(guard, shooter),
        "Projectile fixture must retain a legal native NPC conflict",
    );
    expect(
        KinkyDungeonCheckLOS(shooter, nest, 4, shooter.Enemy.visionRadius, true, true),
        "The native ranged shooter must have a legal line to the attacked nest",
    );
    expect(
        !Spiderlings.HuntingGrounds.perceives(guard, shooter),
        "The guard must not already perceive the projectile shooter",
    );
    const casts = [],
        hits = [],
        trace = [],
        nativeCast = KinkyDungeonCastSpell;
    let turn = 0;
    KinkyDungeonCastSpell = function (x, y, spell, caster) {
        const result = nativeCast.apply(this, arguments);
        if (caster === shooter) casts.push({ turn, spell: spell.name, result: result?.result, x, y });
        return result;
    };
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "SpiderlingsNativeNestProjectile", (_event, data) => {
        if (data.enemy === nest)
            hits.push({
                turn,
                tick: KinkyDungeonCurrentTick,
                damage: data.dmgDealt,
                hp: nest.hp,
                attacker: data.attacker?.id,
                source: data.bullet?.bullet?.source,
                faction: data.faction,
                alert: structuredClone(nest.SpiderlingsTaskNestAttacker),
            });
    });
    try {
        for (turn = 1; turn <= 30; turn++) {
            KinkyDungeonLastAction = "Wait";
            KinkyDungeonAdvanceTime(1, true);
            await frame();
            trace.push({
                turn,
                tick: KinkyDungeonCurrentTick,
                nest: fields(nest),
                guard: fields(guard),
                shooter: fields(shooter),
                guardPerceivesShooter: Spiderlings.HuntingGrounds.perceives(guard, shooter),
            });
            const firstHit = hits.find((hit) => hit.damage > 0 && hit.hp > 0);
            if (firstHit && turn >= firstHit.turn + 3) break;
        }
        const hit = hits.find((entry) => entry.damage > 0 && entry.hp > 0);
        expect(
            casts.some((cast) => cast.result === "Cast" && cast.spell === "RubberBullets"),
            "Native NPC AI must actually cast its ranged projectile",
        );
        expect(
            hit && hit.attacker === undefined && hit.source === shooter.id && hit.faction === "Maidforce",
            "Native projectile damage must exercise its source-only event",
        );
        expect(
            hit.alert?.id === shooter.id && hit.alert.x === shooter.x && hit.alert.y === shooter.y,
            "A live native projectile source must record the task-nest alarm",
        );
        const searching = trace.find((entry) => entry.guard.search?.id === nest.id);
        expect(
            searching && searching.guard.search.x === nest.x && searching.guard.search.y === nest.y,
            "The unseen shooter must cause investigation of the known attacked nest",
        );
        expect(
            !searching.guardPerceivesShooter && !searching.guard.defender && searching.guard.target !== shooter.id,
            "A projectile alarm must not reveal the unseen shooter's live position",
        );
        rows.push({ seed, mode: "native-nest-projectile", floor: 12, casts, hits, trace });
    } finally {
        KinkyDungeonCastSpell = nativeCast;
        delete KDEventMapGeneric.afterDamageEnemy.SpiderlingsNativeNestProjectile;
        setup("crew-native-duties-complete");
    }
    const preyArena = (seed) => {
        setup(seed);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
                KinkyDungeonVisionSet(x, y, 5);
            }
        KDMovePlayer(2, 2, false);
        KDGenMapCallback = null;
        KinkyDungeonState = "Game";
        KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
            id: "PreyDomainObserver",
            type: "Sneak",
            power: 1000,
            duration: 999,
        });
        KDMapData.MapMod = KDGameData.MapMod = "SpiderlingsHuntingGrounds";
        KDMapData.SpiderlingsHuntingGrounds = {
            status: "active",
            garrisonVersion: 3,
            targetIds: [],
            destroyedIds: [],
            target: 3,
        };
    };
    for (const name of ["Spinner", "Jumper", "WebCaster"]) {
        const seed = `test85-statue-prey-${name}`;
        preyArena(seed);
        const spider = spawn(name, 6, 10, "Enemy"),
            statue = spawn("Statue", 7, 10, "Natural"),
            maid = spawn("Maidforce", 10, 10, "Maidforce");
        spider.SpiderlingsHuntRole = "hunter";
        // Isolate continuous target selection with an explicit native stun.
        // Keep the Maid's native combat definition, HP and physical occupancy.
        maid.stun = 999;
        expect(
            statue.Enemy.immobile && !statue.Enemy.tags.scenery,
            "The native Statue fixture must exercise the missing scenery-tag case",
        );
        expect(
            !Spiderlings.HuntingGrounds.isPrey(spider, statue),
            "A Natural immobile statue is not a huntable combatant",
        );
        expect(Spiderlings.HuntingGrounds.isPrey(spider, maid), "The actual mobile Maid remains legal prey");
        expect(
            KinkyDungeonNearestPlayer(spider, false, true) === maid,
            "The spider must choose the legal Maid over the nearer statue",
        );
        const hits = [],
            trace = [];
        let turn = 0;
        KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "SpiderlingsNativeStatuePrey", (_event, data) => {
            const source =
                data.attacker || KDMapData.Entities.find((entity) => entity.id === data.bullet?.bullet?.source);
            if (source === spider && [statue, maid].includes(data.enemy))
                hits.push({
                    turn,
                    target: data.enemy.id,
                    name: data.enemy.Enemy.name,
                    damage: data.dmgDealt,
                    slime: data.enemy.specialBoundLevel?.Slime || 0,
                });
        });
        try {
            for (turn = 1; turn <= 8; turn++) {
                KinkyDungeonLastAction = "Wait";
                KinkyDungeonAdvanceTime(1, true);
                await frame();
                trace.push({
                    turn,
                    spider: {
                        id: spider.id,
                        x: spider.x,
                        y: spider.y,
                        hp: spider.hp,
                        target: spider.target,
                        credit: spider.movePoints,
                    },
                    statue: { hp: statue.hp, slime: statue.specialBoundLevel?.Slime || 0 },
                    maid: {
                        hp: maid.hp,
                        slime: maid.specialBoundLevel?.Slime || 0,
                        bound: maid.boundLevel,
                        stun: maid.stun,
                    },
                });
            }
            expect(
                !hits.some((hit) => hit.target === statue.id) &&
                    !trace.some((entry) => entry.spider.target === statue.id),
                "Paid turns cannot resume the harmless statue attack loop",
            );
            expect(
                hits.some((hit) => hit.target === maid.id) && trace.some((entry) => entry.maid.slime > 0),
                "The legal Maid must receive actual native spider attacks and binding progress",
            );
            rows.push({
                seed,
                mode: "native-statue-prey",
                actor: name,
                ids: { spider: spider.id, statue: statue.id, maid: maid.id },
                hits,
                trace,
            });
        } finally {
            delete KDEventMapGeneric.afterDamageEnemy.SpiderlingsNativeStatuePrey;
        }
    }
    preyArena("test85-shop-prey-WebCaster");
    const hunter = spawn("WebCaster", 6, 10, "Enemy"),
        shop = spawn("MaidforceMini", 7, 10, "Maidforce"),
        legalMaid = spawn("Maidforce", 10, 10, "Maidforce");
    hunter.SpiderlingsHuntRole = "hunter";
    legalMaid.stun = 999;
    KinkyDungeonSetEnemyFlag(shop, "Shop", -1);
    expect(!Spiderlings.HuntingGrounds.isPrey(hunter, shop), "A shop Maid cannot bypass the hunting combatant domain");
    expect(
        KinkyDungeonNearestPlayer(hunter, false, true) === legalMaid,
        "The hunter must select the mobile non-Shop Maid",
    );
    expect(
        KinkyDungeonNearestPlayer(shop, false, true) !== hunter,
        "The shop must not acquire an injected spider rivalry",
    );
    const shopTrace = [];
    try {
        for (let turn = 1; turn <= 8; turn++) {
            KinkyDungeonLastAction = "Wait";
            KinkyDungeonAdvanceTime(1, true);
            await frame();
            shopTrace.push({
                turn,
                hunter: { hp: hunter.hp, target: hunter.target },
                shop: { hp: shop.hp, target: shop.target },
                maid: { hp: legalMaid.hp, target: legalMaid.target },
            });
        }
        expect(
            !shopTrace.some((entry) => entry.hunter.target === shop.id || entry.shop.target === hunter.id),
            "Paid turns cannot invent combat with an unprovoked shop",
        );
        expect(
            shopTrace.some((entry) => entry.maid.target === hunter.id),
            "The legal Maid must retain actual native retaliation targeting",
        );
        rows.push({
            seed: "test85-shop-prey-WebCaster",
            mode: "native-shop-prey",
            ids: { spider: hunter.id, shop: shop.id, maid: legalMaid.id },
            trace: shopTrace,
        });
    } finally {
        setup("crew-native-duties-complete");
    }
    return { rows, images: {} };
})();
