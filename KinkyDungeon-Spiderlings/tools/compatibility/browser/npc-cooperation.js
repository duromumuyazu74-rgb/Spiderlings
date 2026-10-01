(async () => {
    const results = [];
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const nativeCast = KinkyDungeonCastSpell;
    const nativeRemove = KDRemoveEntity;
    const nativePayment = Spiderlings.SpinnerNativeField.accrueConstructionAction;
    // Native 5.5 MinigunWindup passes a bare MiniWind audio path; exercise combat with SFX disabled.
    const sound = KDToggles.Sound;
    KDToggles.Sound = false;
    let casts, hits, target, turn, removals, cancelled, retryPayments;
    KDRemoveEntity = function (enemy, kill, capture) {
        const progress = enemy === target ? Spiderlings.NPCWrapping.record(target)?.progress : undefined;
        const result = nativeRemove.apply(this, arguments);
        if (enemy === target) removals.push({ turn, kill: !!kill, capture: !!capture, progress, result });
        return result;
    };
    Spiderlings.SpinnerNativeField.accrueConstructionAction = function () {
        if (cancelled && Spiderlings.NPCWrapping.record(target)?.progress === 3) retryPayments++;
        return nativePayment.apply(this, arguments);
    };
    KDAddEvent(KDEventMapGeneric, "removeEnemy", "SpiderlingsCooperationAcceptance", (_e, data) => {
        if (data.enemy === target && target.Enemy.name === "DragonGirlCrystal" && data.capture && !cancelled) {
            data.cancel = true;
            cancelled = true;
        }
    });
    KinkyDungeonCastSpell = function (x, y, spell, enemy) {
        const result = nativeCast.apply(this, arguments);
        if (result?.result === "Cast" && enemy)
            casts.push({ turn, source: enemy.id, name: enemy.Enemy.name, spell: spell.name });
        return result;
    };
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "SpiderlingsCooperationAcceptance", (_e, data) => {
        if (!target) return;
        const source =
            data.attacker ||
            data.incomingDamage?.spiderlingsSource ||
            KDMapData.Entities.find((entity) => entity.id === data.bullet?.bullet?.source);
        if (data.enemy.id === target.id || source?.id === target.id)
            hits.push({
                turn,
                source: source?.id,
                sourceName: source?.Enemy?.name,
                target: data.enemy.id,
                damage: data.dmgDealt,
                shieldDamage: data.dmgShieldDealt,
                slime: target.specialBoundLevel?.Slime || 0,
                ledger: structuredClone(target.SpiderlingsNPCAdhesion),
                helpless: KDHelpless(target),
                spell: data.spell?.name,
            });
    });
    try {
        for (const name of [
            "Maidforce",
            "MaidforceMini",
            "MaidKnightHeavy",
            "DragonGirlCrystal",
            "DragonGirlShadow",
            "BlindZombie",
        ]) {
            target = undefined;
            KinkyDungeonStartNewGame(false);
            KDsetSeed(`cooperation-${name}`);
            Spiderlings.SpinnerField.enter();
            KDMapData.Entities = [];
            KDMapData.Bullets = [];
            KDMapData.GroundItems = [];
            KDUpdateEnemyCache = true;
            KDMovePlayer(2, 2, false);
            target = DialogueCreateEnemy(19, 10, name);
            target.faction = "Maidforce";
            target.aware = true;
            target.vp = 10;
            if (name === "DragonGirlCrystal") {
                KDGetPersistentNPC(target.id, target);
                target.items = ["RedKey", "PotionMana"];
            }
            const actors = [
                [17, 8],
                [17, 10],
                [17, 12],
                [19, 8],
                [19, 12],
                [21, 8],
                [21, 10],
                [21, 12],
            ].map(([x, y]) => {
                const source = DialogueCreateEnemy(x, y, "WebCaster");
                source.aware = true;
                source.vp = 10;
                return source;
            });
            for (const [x, y, species] of [
                [16, 7, "MageSpiderlings"],
                [16, 13, "MageSpiderlings"],
                [22, 7, "MageSpiderlings"],
                [22, 13, "MageSpiderlings"],
                [18, 10, "Spinner"],
                [20, 10, "Spinner"],
            ]) {
                const source = DialogueCreateEnemy(x, y, species);
                source.aware = true;
                source.vp = 10;
                actors.push(source);
            }
            casts = [];
            hits = [];
            removals = [];
            cancelled = false;
            retryPayments = 0;
            KDsetSeed(`cooperation-combat-${name}`);
            const samples = [];
            const initial = {
                hp: target.hp,
                shield: target.shield,
                maxhp: target.Enemy.maxhp,
                hostile: actors.map((e) => KDHostile(e, target)),
            };
            for (turn = 1; turn <= 32; turn++) {
                KinkyDungeonLastAction = "Wait";
                KinkyDungeonAdvanceTime(1, true);
                samples.push({
                    turn,
                    x: target.x,
                    y: target.y,
                    hp: target.hp,
                    shield: target.shield,
                    slime: target.specialBoundLevel?.Slime || 0,
                    status: Spiderlings.NPCAdhesion.status(target),
                    pressure: Spiderlings.NPCAdhesion.pressure(target),
                    wrapping: structuredClone(KDMapData.SpiderlingsNPCWrapping),
                    present: KDMapData.Entities.includes(target),
                    sources: actors.map((e) => ({ id: e.id, x: e.x, y: e.y, hp: e.hp, target: e.target })),
                });
                await frame();
                if (!KDMapData.Entities.includes(target) || !(target.hp > 0)) break;
            }
            const strong = ["MaidKnightHeavy", "DragonGirlCrystal", "DragonGirlShadow"].includes(name);
            if (!casts.length || new Set(casts.map((row) => row.source)).size < 2)
                throw Error(`${name}: native AI did not cooperate`);
            if (strong && !samples.some((row) => row.status === "full"))
                throw Error(`${name}: coordinated native attacks did not reach capable full pin`);
            if (!strong && !samples.some((row) => row.status === "native-helpless"))
                throw Error(`${name}: native binding did not independently incapacitate the target`);
            if (name === "BlindZombie" && !samples.at(-1).present) throw Error("Native nocapture target was removed");
            for (const sample of samples)
                if (
                    casts.some(
                        (cast) => cast.turn === sample.turn && sample.wrapping?.paidSourceIds.includes(cast.source),
                    )
                )
                    throw Error(`${name}: a paid wrapping operation also cast a new spell`);
            const stolen = KDMapData.GroundItems.filter((item) => ["RedKey", "PotionMana"].includes(item.name))
                .map((item) => item.name)
                .sort();
            if (name === "DragonGirlCrystal") {
                if (
                    !cancelled ||
                    removals.filter((row) => row.result).length !== 1 ||
                    removals.some((row) => row.kill) ||
                    retryPayments
                )
                    throw Error(`Native cancelled capture retry: ${JSON.stringify({ removals, retryPayments })}`);
                if (
                    JSON.stringify(stolen) !== JSON.stringify(["PotionMana", "RedKey"]) ||
                    target.items.length ||
                    KDGetPersistentNPC(target.id).id !== target.id
                )
                    throw Error("Native capture lost identity or duplicated stolen property");
            }
            results.push({ name, initial, casts, hits, samples, removals, retryPayments, stolen });
        }
        const setupEcology = (seed) => {
            globalThis.compatibilitySetSeed(seed);
            KinkyDungeonStartNewGame(false);
            Spiderlings.SpinnerField.enter();
            KDMapData.Entities = [];
            KDMapData.Bullets = [];
            KDMapData.EffectTiles = {};
            KDMapData.GroundItems = [];
            for (const key of Object.keys(KDMapData)) if (key.startsWith("Spiderlings")) delete KDMapData[key];
            for (const key of Object.keys(KDGameData)) if (key.startsWith("Spiderlings")) delete KDGameData[key];
            KDMapData.RoomType = KDGameData.RoomType = "";
            KDMapData.MapMod = KDGameData.MapMod = "SpiderlingsHuntingGrounds";
            KDMapData.SpiderlingsHuntingGrounds = {
                garrisonVersion: 2,
                status: "active",
                targetIds: [],
                destroyedIds: [],
                target: 3,
            };
            KDMovePlayer(9, 10, false);
            for (let y = 1; y < KDMapData.GridHeight - 1; y++)
                for (let x = 1; x < KDMapData.GridWidth - 1; x++) KinkyDungeonMapSet(x, y, "0");
            KDUpdateEnemyCache = true;
            KDToggles.Sound = false;
            globalThis.compatibilitySetSeed(seed);
        };
        for (const [name, faction] of [
            ["MaidKnightHeavy", "Maidforce"],
            ["Adventurer_Brat_Fighter", "Adventurer"],
            ["Nurse", "Dressmaker"],
        ]) {
            const exchanges = [];
            let actualDamage = false;
            for (const order of ["spider-first", "prey-first"]) {
                target = undefined;
                setupEcology(`hunting-retaliation-${name}`);
                let spider;
                if (order === "spider-first") {
                    spider = DialogueCreateEnemy(12, 10, "WebCaster");
                    target = DialogueCreateEnemy(10, 10, name);
                } else {
                    target = DialogueCreateEnemy(10, 10, name);
                    spider = DialogueCreateEnemy(12, 10, "WebCaster");
                }
                target.faction = faction;
                for (const actor of [spider, target]) {
                    actor.aware = true;
                    actor.vp = 10;
                }
                // Retain definitions, resistance, attack cadence and spells.
                // Extra HP keeps the short exchange available; native healing
                // may still cap it. Neither movement nor attacks are disabled.
                spider.hp = 100;
                target.hp = 100;
                KDUpdateEnemyCache = true;
                hits = [];
                casts = [];
                removals = [];
                cancelled = false;
                const selected = KinkyDungeonNearestPlayer(target, true, true);
                if (selected !== spider || !KDHostile(target, spider) || !KDHostile(spider, target))
                    throw Error(`${name}: hunting rivalry did not acquire the spider while the player was closer`);
                const samples = [];
                for (turn = 1; turn <= 12; turn++) {
                    KinkyDungeonLastAction = "Wait";
                    KinkyDungeonAdvanceTime(1, true);
                    samples.push({
                        turn,
                        hp: target.hp,
                        spiderHP: spider.hp,
                        target: target.target,
                        bound: target.boundLevel,
                    });
                    await frame();
                    if (hits.some((hit) => hit.source === target.id && hit.target === spider.id && hit.damage > 0))
                        break;
                }
                const damaged = hits.some(
                    (hit) => hit.source === target.id && hit.target === spider.id && hit.damage > 0,
                );
                if (!damaged && !casts.some((cast) => cast.source === target.id))
                    throw Error(
                        `${name}: native NPC did not attack its hunter: ${JSON.stringify({ order, hits, casts, samples })}`,
                    );
                actualDamage ||= damaged;
                exchanges.push({ order, damaged, hits, casts, samples });
            }
            // Native AoE can miss a moving WebCaster when that actor executes
            // first. Keep the miss and exercise both actual actor orders.
            if (!actualDamage)
                throw Error(`${name}: neither native exchange landed a retaliatory hit: ${JSON.stringify(exchanges)}`);
            results.push({ name: `hunting-retaliation-${name}`, exchanges });
        }
        target = undefined;
        setupEcology("mage-bolt-owned-silk");
        KDMovePlayer(2, 2, false);
        const mage = DialogueCreateEnemy(5, 2, "MageSpiderlings");
        target = DialogueCreateEnemy(4, 2, "Maidforce");
        target.faction = "Maidforce";
        target.shield = 0;
        target.aware = mage.aware = true;
        hits = [];
        casts = [];
        removals = [];
        cancelled = false;
        const bolt = KinkyDungeonFindSpell("SpiderlingsMageBolt", true);
        const samples = [];
        for (turn = 1; turn <= 2; turn++) {
            KinkyDungeonCastSpell(target.x, target.y, bolt, mage);
            const bullet = KDMapData.Bullets.at(-1);
            if (!bullet) throw Error("Mage bolt failed to create its native projectile");
            KDBulletHitEnemy(bullet, target);
            const slime = target.specialBoundLevel?.Slime || 0;
            const owned = target.SpiderlingsNPCAdhesion?.ownedSilk || 0;
            if (!(slime > 0) || Math.abs(slime - owned) > 0.00001)
                throw Error(`Mage bolt lost or duplicated native silk: ${JSON.stringify({ slime, owned, hits })}`);
            samples.push({
                hit: turn,
                hp: target.hp,
                slime,
                owned,
                helpless: KDHelpless(target),
                spiderHelpless: Spiderlings.NPCAdhesion.hasSpiderHelplessness(target),
            });
            const before = { hp: target.hp, slime };
            KDBulletHitEnemy(bullet, target);
            if (target.hp !== before.hp || (target.specialBoundLevel?.Slime || 0) !== before.slime)
                throw Error("Mage bolt repeated damage or binding for the same native projectile");
        }
        if (samples[0].helpless || !samples[1].spiderHelpless)
            throw Error(`Mage bolt should subdue this native Maid after two hits: ${JSON.stringify(samples)}`);
        results.push({ name: "mage-bolt-owned-silk", hits, casts, samples });
        hits = [];
        casts = [];
        target = DialogueCreateEnemy(4, 3, "Maidforce");
        target.faction = "Maidforce";
        target.aware = true;
        target.shield = 99;
        const beforeHP = target.hp;
        KinkyDungeonCastSpell(target.x, target.y, bolt, mage);
        KDBulletHitEnemy(KDMapData.Bullets.at(-1), target);
        if (
            target.hp !== beforeHP ||
            target.specialBoundLevel?.Slime > 0 ||
            target.SpiderlingsNPCAdhesion?.ownedSilk > 0
        )
            throw Error("Shielded Mage bolt damaged HP or attributed blocked binding");
        results.push({
            name: "mage-bolt-shield",
            hp: target.hp,
            shield: target.shield,
            owned: target.SpiderlingsNPCAdhesion?.ownedSilk || 0,
            hits,
            casts,
        });
        target = undefined;
        setupEcology("mage-bolt-orphan");
        KDMovePlayer(2, 2, false);
        const departedMage = DialogueCreateEnemy(5, 2, "MageSpiderlings");
        target = DialogueCreateEnemy(4, 2, "Maidforce");
        target.faction = "Maidforce";
        target.aware = true;
        target.shield = 0;
        hits = [];
        casts = [];
        KinkyDungeonCastSpell(target.x, target.y, bolt, departedMage);
        if (!KDRemoveEntity(departedMage, false)) throw Error("Mage orphan fixture could not remove its caster");
        // Retain only saved native projectile data, as a floor reload would.
        KDMapData.Bullets = JSON.parse(JSON.stringify(KDMapData.Bullets));
        KDUpdateEnemyCache = true;
        const orphan = KDMapData.Bullets.at(-1);
        orphan.x = target.x;
        orphan.y = target.y;
        if (!KDBulletCanHitEntity(orphan, target)) throw Error("Saved orphan Mage bolt lost hostile NPC collision");
        const orphanHP = target.hp;
        KDBulletHitEnemy(orphan, target);
        if (
            !(target.hp < orphanHP) ||
            !(target.specialBoundLevel?.Slime > 0) ||
            Math.abs(target.specialBoundLevel.Slime - (target.SpiderlingsNPCAdhesion?.ownedSilk || 0)) > 0.00001 ||
            target.SpiderlingsNPCAdhesion.sourceName !== "MageSpiderlings" ||
            target.SpiderlingsNPCAdhesion.sourceFaction !== "Enemy"
        )
            throw Error(`Saved orphan Mage bolt lost silk identity: ${JSON.stringify({ hits, target })}`);
        results.push({
            name: "mage-bolt-orphan",
            hp: target.hp,
            slime: target.specialBoundLevel.Slime,
            ledger: structuredClone(target.SpiderlingsNPCAdhesion),
            hits,
            casts,
        });
        target = undefined;
        setupEcology("mage-bolt-friendly-orphan");
        KDMovePlayer(2, 2, false);
        const friendlyMage = DialogueCreateEnemy(5, 2, "MageSpiderlings");
        KDGameData.CurrentDialogMsgID = friendlyMage.id;
        KDGameData.CurrentDialogMsgSpeaker = friendlyMage.Enemy.name;
        KDAllySpeaker(9999, true);
        target = DialogueCreateEnemy(4, 2, "Apprentice");
        target.aware = true;
        target.stun = 999;
        hits = [];
        casts = [];
        KinkyDungeonCastSpell(target.x, target.y, bolt, friendlyMage);
        const friendFaction = KDMapData.Bullets.at(-1)?.bullet.faction;
        if (!friendFaction || friendFaction !== KDGetFaction(friendlyMage) || friendFaction === "Enemy")
            throw Error(`Native friendly Mage did not retain its allegiance: ${friendFaction}`);
        if (!KDFactionFavorable(friendFaction, target))
            throw Error("Friendly orphan fixture needs a natively favorable independent NPC");
        if (!KDRemoveEntity(friendlyMage, false))
            throw Error("Friendly Mage orphan fixture could not remove its caster");
        KDMapData.Bullets = JSON.parse(JSON.stringify(KDMapData.Bullets));
        KDUpdateEnemyCache = true;
        const friendlyOrphan = KDMapData.Bullets.at(-1);
        friendlyOrphan.x = friendlyOrphan.xx = target.x;
        friendlyOrphan.y = friendlyOrphan.yy = target.y;
        friendlyOrphan.vx = friendlyOrphan.vy = 0;
        const friendlyHP = target.hp;
        if (KDBulletCanHitEntity(friendlyOrphan, target) || KDBulletAoECanHitEntity(friendlyOrphan, target))
            throw Error("Saved friendly Mage bolt became hostile to an allied NPC after its caster left");
        KinkyDungeonLastAction = "Wait";
        KinkyDungeonAdvanceTime(1, true);
        await frame();
        if (
            target.hp !== friendlyHP ||
            target.specialBoundLevel?.Slime > 0 ||
            target.SpiderlingsNPCAdhesion?.ownedSilk > 0
        )
            throw Error("Saved friendly Mage bolt damaged or bound an allied NPC during a native world turn");
        results.push({
            name: "mage-bolt-friendly-orphan",
            faction: friendFaction,
            hp: target.hp,
            owned: target.SpiderlingsNPCAdhesion?.ownedSilk || 0,
            hits,
            casts,
        });
    } finally {
        KinkyDungeonCastSpell = nativeCast;
        KDRemoveEntity = nativeRemove;
        Spiderlings.SpinnerNativeField.accrueConstructionAction = nativePayment;
        KDToggles.Sound = sound;
        delete KDEventMapGeneric.removeEnemy.SpiderlingsCooperationAcceptance;
        delete KDEventMapGeneric.afterDamageEnemy.SpiderlingsCooperationAcceptance;
    }
    return results;
})();
