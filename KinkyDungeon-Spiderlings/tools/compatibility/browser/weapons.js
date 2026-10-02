(async () => {
    const expect = (value, message) => {
        if (!value) throw Error(message);
    };
    const TOME = "SpiderlingTome",
        STAFF = "SpiderlingStaff";
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
        let previewCells = 0;
        for (let dx = -3; dx <= 3; dx++)
            for (let dy = -3; dy <= 3; dy++) {
                const shown = globalThis.AOECondition(
                    11,
                    10,
                    11 + dx,
                    10 + dy,
                    KinkyDungeonTargetingSpell.aoe,
                    KinkyDungeonTargetingSpell.aoetype,
                    KinkyDungeonPlayerEntity.x,
                    KinkyDungeonPlayerEntity.y,
                );
                const actual = Spiderlings.MageSpells.collapseDistance(11, 10, { x: 11 + dx, y: 10 + dy }) >= 0;
                expect(shown === actual, "Native Convergence preview disagrees with the real circle");
                if (shown) previewCells++;
            }
        expect(previewCells === 21, "Native Convergence preview included the four inactive corners");
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
            expect(
                Spiderlings.WeaponWebbing.status(KDMapData.Entities.find((t) => t.id === e.id))?.amount > 0,
                "Actual Convergence lost persistent silk",
            );
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
        expect(hits[0].bind === 10 && hits[0].slow === 0, "Snare applied slow before binding");
        expect(Spiderlings.WeaponWebbing.status(first)?.amount > 0, "Actual Snare lost persistent silk");
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
            [TOME, 4],
            [STAFF, 7],
        ]) {
            KDSetWeapon(weapon);
            KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
            const e = target(9, 10);
            e.stun = 999;
            KinkyDungeonLaunchAttack(e);
            const hit = trace.find((h) => h.id === e.id && h.weapon === weapon);
            expect(Spiderlings.WeaponWebbing.status(e)?.amount > 0, "Actual melee lost persistent silk");
            expect(hit?.bind === bind, `${weapon} native melee lost explicit binding`);
            KDMapData.Entities = [];
            KDUpdateEnemyCache = true;
        }
        expect(KinkyDungeonPlayerBuffs[TOME + "BindAmp"]?.power === 0.2, "Tome passive missing");
        KDSetWeapon(TOME);
        KDGameData.Offhand = TOME;
        await turn();
        expect(
            Object.values(KinkyDungeonPlayerBuffs).filter((b) => b.id === TOME + "BindAmp").length === 1,
            "Tome passive stacks with itself",
        );
        records.push({ scenario: "melee", hits: trace.slice(), passive: 0.2 });

        for (const enemyName of ["Spinner", "NestEntrance"])
            for (const weapon of [TOME, STAFF])
                for (const mode of ["ordinary", "lethal", "full-shield"]) {
                    setup();
                    await turn();
                    KDSetWeapon(weapon);
                    KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
                    const npc = DialogueCreateEnemy(9, 10, enemyName);
                    npc.hostile = 999;
                    npc.stun = 999;
                    npc.Enemy = { ...npc.Enemy, movePoints: 1000, attackPoints: 1000, spells: [], summon: [] };
                    if (mode === "lethal") npc.hp = 0.6;
                    if (mode === "full-shield") npc.shield = 20;
                    const beforeHP = npc.hp,
                        beforeSlime = npc.specialBoundLevel?.Slime || 0;
                    const change = KDChangeStamina;
                    let returned = 0;
                    KDChangeStamina = function (src) {
                        const before = KinkyDungeonStatStamina,
                            result = change.apply(this, arguments);
                        if (src === "SpiderlingsWeapons") returned += Math.max(0, KinkyDungeonStatStamina - before);
                        return result;
                    };
                    try {
                        KinkyDungeonLaunchAttack(npc);
                    } finally {
                        KDChangeStamina = change;
                    }
                    const expected = mode === "full-shield" ? 0 : weapon === TOME ? 0.3 : 0.6;
                    expect(
                        Math.abs(returned - expected) < 0.01,
                        "HP-only native refund differs: " +
                            JSON.stringify({
                                enemyName,
                                weapon,
                                mode,
                                returned,
                                expected,
                                beforeHP,
                                afterHP: npc.hp,
                                slime: npc.specialBoundLevel?.Slime,
                            }),
                    );
                    expect(
                        (npc.specialBoundLevel?.Slime || 0) === beforeSlime && !npc.SpiderlingsWeaponCocoonRewarded,
                        "Unbindable target issued owned material or mana marker",
                    );
                    records.push({
                        scenario: "native-HP-only-sustain",
                        enemyName,
                        weapon,
                        mode,
                        returnedStamina: returned,
                        beforeHP,
                        afterHP: npc.hp,
                        slimeAdded: (npc.specialBoundLevel?.Slime || 0) - beforeSlime,
                    });
                }

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

        setup();
        const originalTomeID = KinkyDungeonInventoryGetWeapon(TOME).id;
        const originalStaffID = KinkyDungeonInventoryGetWeapon(STAFF).id;
        const variantID = KinkyDungeonGetItemID();
        const containerID = KinkyDungeonGetItemID();
        const oldTome = "SpiderlingsSilkenBindingTome",
            oldStaff = "SpiderlingsSilkweaverStaff";
        const carrier = target(11, 10);
        carrier.items = [oldTome, oldStaff];
        carrier.tempitems = [oldStaff];
        KDUpdatePersistentNPC(carrier.id, true);
        const nativeSave = KinkyDungeonSaveGame(true);
        const legacySave =
            typeof nativeSave === "string" ? JSON.parse(LZString.decompressFromBase64(nativeSave)) : nativeSave;
        const oldNames = { [TOME]: oldTome, [STAFF]: oldStaff };
        for (const item of legacySave.inventory) {
            if (!oldNames[item.name]) continue;
            item.name = oldNames[item.name];
            for (const event of item.events || []) {
                if (event.kind === TOME) {
                    event.kind = oldTome;
                    event.power = 0.15;
                }
            }
        }
        legacySave.wep = oldTome;
        if (legacySave.stats) legacySave.stats.wep = oldTome;
        Object.assign(legacySave.KDGameData, {
            PlayerWeaponLastEquipped: oldTome,
            Offhand: oldStaff,
            OffhandOld: oldStaff,
            OffhandReturn: oldTome,
            PreviousWeapon: [oldTome, oldStaff, "Knife", "Unarmed"],
        });
        legacySave.choices_wep = [oldTome, oldStaff];
        legacySave.weaponVariants ||= {};
        legacySave.weaponVariants.SavedSilk = { template: oldStaff, events: [] };
        legacySave.inventory.push({
            name: "SavedSilk",
            inventoryVariant: "SavedSilk",
            type: Weapon,
            id: variantID,
            events: [],
        });
        legacySave.KDGameData.Containers.LegacySilk = {
            name: "LegacySilk",
            type: "Chest",
            lock: "",
            items: {
                [oldStaff]: { name: oldStaff, type: Weapon, id: containerID, events: [] },
            },
        };
        expect(
            KinkyDungeonLoadGame(LZString.compressToBase64(JSON.stringify(legacySave)), true),
            "Legacy weapon native load failed",
        );
        expect(
            KinkyDungeonPlayerWeapon === TOME && KinkyDungeonPlayerDamage.name === TOME,
            `Legacy equipped weapon migration differs: ${JSON.stringify({ weapon: KinkyDungeonPlayerWeapon, damage: KinkyDungeonPlayerDamage.name, last: KDGameData.PlayerWeaponLastEquipped, items: [...KinkyDungeonInventory.get(Weapon).values()] })}`,
        );
        expect(KinkyDungeonInventoryGetWeapon(TOME)?.id === originalTomeID, "Legacy tome identity changed");
        expect(KinkyDungeonInventoryGetWeapon(STAFF)?.id === originalStaffID, "Legacy staff identity changed");
        expect(
            KDGameData.PlayerWeaponLastEquipped === TOME &&
                KDGameData.OffhandOld === STAFF &&
                KDGameData.OffhandReturn === TOME,
            "Legacy weapon switching state failed migration",
        );
        expect(
            KDGameData.PreviousWeapon[0] === TOME && KDGameData.PreviousWeapon[1] === STAFF,
            "Legacy previous weapons failed migration",
        );
        expect(
            KinkyDungeonWeaponChoices[0] === TOME && KinkyDungeonWeaponChoices[1] === STAFF,
            "Legacy weapon quickslots failed migration",
        );
        expect(
            KinkyDungeonWeaponVariants.SavedSilk.template === STAFF &&
                KinkyDungeonInventoryGetWeapon("SavedSilk").id === variantID,
            "Legacy variant identity or template changed",
        );
        expect(
            KDGameData.Containers.LegacySilk.items[STAFF]?.name === STAFF,
            "Legacy container weapon failed migration",
        );
        expect(
            !Object.keys(KinkyDungeonWeapons).includes(oldTome) && KinkyDungeonWeapons[oldTome].name === TOME,
            "Legacy resolve alias is duplicated in normal weapon listings",
        );
        expect(
            KinkyDungeonInventoryGetWeapon(oldTome).id === originalTomeID,
            "Legacy direct lookup no longer resolves",
        );
        expect(
            KinkyDungeonInventoryGetWeapon(TOME).events.find((event) => event.buffType === "BindAmp").power === 0.2,
            "Legacy saved weapon passive stayed at 15%",
        );
        const restoredCarrier = KDMapData.Entities.find((enemy) => enemy.id === carrier.id);
        expect(
            restoredCarrier.items[0] === TOME &&
                restoredCarrier.items[1] === STAFF &&
                restoredCarrier.tempitems[0] === STAFF,
            "Native legacy NPC held weapons failed migration",
        );
        expect(KDPersistentNPCs[carrier.id].entity.items[0] === TOME, "Persistent held weapons failed migration");
        KDDropStolenItems(restoredCarrier, KDMapData);
        const stolenDrops = KDMapData.GroundItems.filter((item) => [TOME, STAFF].includes(item.name));
        expect(stolenDrops.length === 1 && stolenDrops[0].name === TOME, "NPC temporary held weapon became extra loot");
        expect(
            KinkyDungeonFindWeapon(stolenDrops[0].name)?.rarity === 4 && KinkyDungeonFindWeapon(oldTome)?.name === TOME,
            "Native stolen-weapon lookup lost the definition",
        );
        KinkyDungeonItemEvent(stolenDrops[0], true);
        expect(
            KinkyDungeonInventoryGetWeapon(TOME).id === originalTomeID,
            "Returning stolen silk replaced the existing weapon identity",
        );
        records.push({
            scenario: "legacy-weapon-save",
            tomeID: originalTomeID,
            staffID: originalStaffID,
            variantID,
            shortIDs: [TOME, STAFF],
            nativeStolenPickup: true,
        });
        setup();
        await turn();
        for (const [x, y] of [
            [11, 10],
            [12, 10],
            [13, 10],
            [11, 11],
            [12, 11],
            [13, 11],
        ]) {
            const prey = target(x, y);
            prey.Enemy = { ...prey.Enemy, maxhp: 8 };
            prey.hp = 8;
        }
        KinkyDungeonStatStamina = 4;
        expect(cast(CONVERGENCE, 11, 10) === "Cast", "First tier failed");
        KinkyDungeonStatMana = 2;
        expect(
            KDPrereqs[CONVERGENCE]() && KinkyDungeonGetManaCost(KinkyDungeonFindSpell(CONVERGENCE, true)) === 2,
            "Native UI blocked a 2-mana upgrade below base4",
        );
        KinkyDungeonTargetX = 19;
        KinkyDungeonTargetY = 17;
        KinkyDungeonActivateWeaponSpell();
        expect(!KinkyDungeonTargetingSpell, "Upgrade displayed a second false target");
        let circle = Spiderlings.Weapons.visualState().collapses[0];
        expect(
            circle.stage === 2 && circle.x === 11 && circle.y === 10,
            "Repeat button failed or moved the original circle",
        );
        const stageTwo = JSON.stringify(circle),
            paidBudget = KDMapData.SpiderlingsWeapons.casts[circle.token].paidMana;
        const noAction = Spiderlings.Weapons.visualState().clock;
        KinkyDungeonStatMana = 1;
        expect(cast(CONVERGENCE, 11, 10) === "Fail", "Unaffordable upgrade succeeded");
        expect(
            JSON.stringify(circle) === stageTwo && Spiderlings.Weapons.visualState().clock === noAction,
            "Failed upgrade changed stage, deadline or time",
        );
        KDSetWeapon(STAFF);
        expect(!KDPrereqs[CONVERGENCE](), "Swapped-away tome remained usable");
        KDSetWeapon(TOME);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
        await turn();
        KinkyDungeonStatMana = 2;
        KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
            id: "WeaponAcceptanceManaGain",
            type: "StatGainMana",
            power: 0.5,
            duration: 99,
        });
        KinkyDungeonActivateWeaponSpell();
        circle = Spiderlings.Weapons.visualState().collapses[0];
        expect(
            circle.stage === 3 && circle.explodeAt - Spiderlings.Weapons.visualState().clock === 1,
            "Late upgrade reset the warning instead of adding one action",
        );
        const token = circle.token,
            paid = KDMapData.SpiderlingsWeapons.casts[token].paidMana;
        expect(
            Math.abs(paid - paidBudget - 2) < 0.01,
            "Final native payment was not accumulated to the original budget",
        );
        const chargedSave = KinkyDungeonSaveGame(true);
        expect(
            KinkyDungeonLoadGame(
                typeof chargedSave === "string" ? chargedSave : LZString.compressToBase64(JSON.stringify(chargedSave)),
                true,
            ),
            "Charged native save failed",
        );
        expect(
            Spiderlings.Weapons.visualState().collapses[0].stage === 3 &&
                KDMapData.SpiderlingsWeapons.casts[token].paidMana === paid,
            "Save lost stage or payment budget",
        );
        KDSetWeapon(STAFF);
        const manaBefore = KinkyDungeonStatMana;
        await turn();
        const finalBudget = KDMapData.SpiderlingsWeapons.casts[token];
        expect(
            finalBudget.manaReturned > 0 && finalBudget.manaReturned <= Math.min(2, paid * 0.5) + 1e-9,
            "Gain-amplified multi-cocoon refund exceeded actual paid budget",
        );
        expect(
            Math.abs(finalBudget.manaReturned - 2) < 0.01,
            "Six-target +50% gain probe failed to reach the shared cap",
        );
        expect(
            KDMapData.Entities.filter((e) => e.SpiderlingsWeaponCocoonRewarded).length === 6,
            "First cocoon markers were not per prey",
        );
        expect(Spiderlings.Weapons.visualState().collapses.length === 0, "Charged circle did not resolve exactly once");
        records.push({
            scenario: "charge-low-mana-late-save-budget",
            paidMana: paid,
            returnedMana: finalBudget.manaReturned,
            stage: 3,
            lateWarningRemaining: 1,
            swapRetained: true,
            saveRetained: true,
            prey: 6,
            statGainMana: 0.5,
            manaBefore,
            manaAfter: KinkyDungeonStatMana,
        });

        setup();
        await turn();
        KDSetWeapon(STAFF);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
        delete KinkyDungeonPlayerBuffs.ManaRegenSuspend;
        KinkyDungeonStatStamina = 4;
        const freeTarget = target(10, 10);
        const freeStart = KinkyDungeonStatMana;
        expect(cast(SNARE, 14, 10) === "Cast", "Discounted Snare failed");
        expect(costs.at(-1).actual === 0, "Native ManaRegen did not supply the zero-cost fixture");
        for (let i = 0; i < 3 && !(freeTarget.specialBoundLevel?.Slime > 0); i++) await turn();
        const freeBudget = Object.values(KDMapData.SpiderlingsWeapons.casts)[0];
        expect(
            freeBudget.paidMana === 0 && freeBudget.manaReturned === 0 && freeBudget.staminaReturned,
            "Free legal Snare did not separate stamina reward from zero mana budget",
        );
        records.push({
            scenario: "native-free-snare",
            paidMana: freeBudget.paidMana,
            returnedMana: freeBudget.manaReturned,
            effectiveSlime: freeTarget.specialBoundLevel.Slime,
            stamina: KinkyDungeonStatStamina,
            manaStart: freeStart,
        });

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
