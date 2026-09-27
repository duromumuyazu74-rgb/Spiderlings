(async () => {
    const expect = (value, message) => {
        if (!value) throw Error(message);
    };
    const TOME = "SpiderlingsSilkenBindingTome",
        STAFF = "SpiderlingsSilkweaverStaff";
    const CONVERGENCE = "SpiderlingsCocoonConvergence",
        SNARE = "SpiderlingsSilkenSnare";
    const records = [];
    const costs = [];
    let manaBeforeCast;
    KDAddEvent(KDEventMapGeneric, "beforeCast", "SpiderlingsWeaponAcceptance", (_e, d) => {
        if ([CONVERGENCE, SNARE].includes(d.spell?.name)) manaBeforeCast = KinkyDungeonStatMana;
    });
    KDAddEvent(KDEventMapGeneric, "afterPlayerCast", "SpiderlingsWeaponAcceptance", (_e, d) => {
        if ([CONVERGENCE, SNARE].includes(d.spell?.name))
            costs.push({ name: d.spell.name, actual: manaBeforeCast - KinkyDungeonStatMana, nativeCost: d.manacost });
    });
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const turn = async () => {
        KinkyDungeonAdvanceTime(1);
        await frame();
    };
    function setup() {
        KinkyDungeonStartNewGame(false);
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        KDMapData.GroundItems = [];
        KDUpdateEnemyCache = true;
        for (let y = 3; y < 18; y++)
            for (let x = 3; x < 20; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(8, 10, false);
        KinkyDungeonInventoryAddWeapon(TOME);
        KinkyDungeonInventoryAddWeapon(STAFF);
        KinkyDungeonStatMana = 10;
        // Native ManaRegen discounts the first cast; suspend it to measure the agreed base costs.
        KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
            id: "ManaRegenSuspend",
            type: "ManaRegenSuspend",
            power: 1,
            duration: 999,
        });
        KDSetWeapon(TOME);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
    }
    function target(x, y, extra = {}) {
        const e = DialogueCreateEnemy(x, y, "Maidforce");
        e.Enemy = {
            ...e.Enemy,
            maxhp: 100,
            movePoints: 1000,
            attackPoints: 1000,
            spells: [],
            tags: { ...e.Enemy.tags },
        };
        Object.assign(
            e,
            { hp: 100, shield: 0, hostile: 999, aware: true, stun: 999, movePoints: 0, attackPoints: 0 },
            extra,
        );
        return e;
    }
    function cast(name, x, y) {
        return KDInputTypes.tryCastSpell({
            tx: x,
            ty: y,
            spell: KinkyDungeonFindSpell(name, true),
            player: KinkyDungeonPlayerEntity,
        });
    }
    const trace = [];
    KDAddEvent(KDEventMapGeneric, "beforeDamageEnemy", "SpiderlingsWeaponAcceptance", (_e, d) => {
        if ([CONVERGENCE, SNARE].includes(d.spell?.name) || [TOME, STAFF].includes(d.incomingDamage?.name))
            trace.push({
                id: d.enemy.id,
                spell: d.spell?.name,
                weapon: d.incomingDamage?.name,
                damage: d.incomingDamage.damage,
                bind: d.incomingDamage.bind,
                slow: d.enemy.slow || 0,
            });
    });
    try {
        setup();
        await turn();
        const playerBefore = KinkyDungeonStatWill;
        const center = target(11, 10),
            inner = target(12, 10),
            outer = target(13, 10),
            corner = target(13, 12);
        const ally = target(10, 10, { faction: "Player", hostile: 0, allied: 999 });
        const blocked = target(11, 8);
        KinkyDungeonMapSet(11, 9, "1");
        await frame();
        const mana = KinkyDungeonStatMana,
            clock = Spiderlings.Weapons.visualState().clock;
        KinkyDungeonActivateWeaponSpell();
        expect(KinkyDungeonTargetingSpell?.name === CONVERGENCE, "Tome special did not activate from native weapon UI");
        expect(cast(CONVERGENCE, 11, 10) === "Cast", "Convergence input cast failed");
        expect(Spiderlings.Weapons.visualState().clock === clock + 1, "Casting did not use one native action");
        expect(
            Math.abs(costs.at(-1)?.actual - 4) < 0.01,
            `Convergence mana: ${JSON.stringify(costs)} (${mana} -> ${KinkyDungeonStatMana} after regeneration)`,
        );
        expect(!trace.some((t) => t.spell === CONVERGENCE), "Convergence detonated on casting turn");
        KDSetWeapon(STAFF);
        const saved = KinkyDungeonSaveGame(true);
        expect(
            KinkyDungeonLoadGame(
                typeof saved === "string" ? saved : LZString.compressToBase64(JSON.stringify(saved)),
                true,
            ),
            "Native weapon save reload failed",
        );
        expect(Spiderlings.Weapons.remaining(CONVERGENCE) === 7, "Reload or swapping reset cooldown");
        expect(Spiderlings.Weapons.visualState().collapses.length === 1, "Native save lost pending cast");
        KDMovePlayer(5, 10, false);
        await turn();
        expect(!trace.some((t) => t.spell === CONVERGENCE), "Convergence detonated one turn early");
        await turn();
        const collapseHits = trace.filter((t) => t.spell === CONVERGENCE);
        expect(collapseHits.length === 3, `Convergence target filtering failed: ${JSON.stringify(collapseHits)}`);
        for (const [e, damage, bind] of [
            [center, 6, 24],
            [inner, 4, 16],
            [outer, 2, 8],
        ]) {
            const hit = collapseHits.find((h) => h.id === e.id);
            expect(hit?.damage === damage && hit?.bind === bind, "Incorrect collapse ring");
            expect(
                KDMapData.Entities.find((t) => t.id === e.id)?.specialBoundLevel?.Slime > 0,
                "Native collapse failed to bind",
            );
        }
        expect(
            !collapseHits.some((h) => [corner.id, ally.id, blocked.id].includes(h.id)),
            "Convergence hit protected target",
        );
        expect(KinkyDungeonStatWill === playerBefore, "Player convergence harmed player");
        const now = Spiderlings.Weapons.visualState().clock;
        expect(
            cast(CONVERGENCE, 10, 10) === "Fail" && Spiderlings.Weapons.visualState().clock === now,
            "Cooldown rejection spent an action",
        );
        records.push({
            scenario: "convergence",
            manaSpent: 4,
            castingAction: 1,
            delayActions: 2,
            saveReload: true,
            hits: collapseHits,
        });

        setup();
        await turn();
        trace.length = 0;
        KDSetWeapon(STAFF);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
        const first = target(10, 10),
            behind = target(12, 10),
            neutral = target(9, 10, { hostile: 0, faction: "Player", allied: 999 });

        expect(cast(SNARE, 14, 10) === "Cast", "Snare input cast failed");
        for (let i = 0; i < 3 && !trace.some((t) => t.spell === SNARE); i++) await turn();
        const hits = trace.filter((t) => t.spell === SNARE);
        expect(hits.length === 1 && hits[0].id === first.id, `Snare first enemy collision: ${JSON.stringify(hits)}`);
        expect(hits[0].bind === 8 && hits[0].slow === 0, "Snare applied slow before binding");
        expect(first.specialBoundLevel?.Slime > 0 && first.slow > 0, "Snare did not bind and slow");
        expect(!(behind.boundLevel > 0) && !(neutral.boundLevel > 0), "Snare pierced or hit ally");
        expect(Math.abs(costs.at(-1)?.actual - 2) < 0.01, "Snare mana cost was not 2");
        records.push({ scenario: "snare", hits, slime: first.specialBoundLevel.Slime, slow: first.slow });

        setup();
        await turn();
        trace.length = 0;
        KDSetWeapon(STAFF);
        const walled = target(12, 10);
        KinkyDungeonMapSet(10, 10, "1");
        expect(cast(SNARE, 14, 10) === "Cast", "Wall probe cast failed");
        for (let i = 0; i < 3; i++) await turn();
        expect(!trace.some((t) => t.spell === SNARE) && !walled.boundLevel, "Snare crossed a wall");
        expect(
            !Object.values(KDMapData.EffectTiles || {}).some((tile) => Object.keys(tile).some((k) => /Web/.test(k))),
            "Snare created ground webs",
        );
        records.push({ scenario: "snare-wall", blocked: true });

        setup();
        await turn();
        trace.length = 0;
        for (const [weapon, bind] of [
            [TOME, 3],
            [STAFF, 5],
        ]) {
            KDSetWeapon(weapon);
            KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
            const e = target(9, 10);
            e.stun = 999;
            KinkyDungeonLaunchAttack(e);
            const hit = trace.find((h) => h.id === e.id && h.weapon === weapon);
            expect(hit?.bind === bind, `${weapon} native melee lost explicit binding`);
            KDMapData.Entities = [];
            KDUpdateEnemyCache = true;
        }
        expect(KinkyDungeonPlayerBuffs[TOME + "BindAmp"]?.power === 0.15, "Tome passive missing");
        KDSetWeapon(TOME);
        KDGameData.Offhand = TOME;
        await turn();
        expect(
            Object.values(KinkyDungeonPlayerBuffs).filter((b) => b.id === TOME + "BindAmp").length === 1,
            "Tome passive stacks with itself",
        );
        records.push({ scenario: "melee", hits: trace.slice(), passive: 0.15 });

        setup();
        KinkyDungeonInventoryRemove(KinkyDungeonInventoryGetWeapon(STAFF));
        const mage = DialogueCreateEnemy(11, 10, "MageSpiderlings");
        mage.playerdmg = 1;
        const random = KDRandom;
        try {
            KDRandom = () => 0;
            KDDropItems(mage, KDMapData);
            KDDropItems(mage, KDMapData);
        } finally {
            KDRandom = random;
        }
        expect(
            KDMapData.GroundItems.filter((i) => i.name === STAFF).length === 1,
            "Native Mage loot did not drop missing staff exactly once",
        );
        KDMovePlayer(11, 10, false);
        KinkyDungeonItemCheck(11, 10);
        expect(KinkyDungeonInventoryGetWeapon(STAFF), "Dropped weapon could not be picked up");
        for (const weapon of [TOME, STAFF]) {
            const tex = KDTex(KinkyDungeonRootDirectory + `Items/${weapon}.png`);
            expect(tex && tex.width === 72 && tex.height === 72, `${weapon} inventory art missing`);
        }
        records.push({ scenario: "loot-and-art", missingWeapon: STAFF, nativePickup: true });
        // Leave the saved-turn inward animation visible for the acceptance screenshot.
        setup();
        await turn();
        target(11, 10);
        cast(CONVERGENCE, 11, 10);
        await frame();
        return records;
    } finally {
        delete KDEventMapGeneric.beforeDamageEnemy.SpiderlingsWeaponAcceptance;
        delete KDEventMapGeneric.beforeCast.SpiderlingsWeaponAcceptance;
        delete KDEventMapGeneric.afterPlayerCast.SpiderlingsWeaponAcceptance;
    }
})();
