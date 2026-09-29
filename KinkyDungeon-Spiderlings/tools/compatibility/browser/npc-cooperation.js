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
        const source = data.attacker || data.incomingDamage?.spiderlingsSource;
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
