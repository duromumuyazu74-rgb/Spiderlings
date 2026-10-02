/* global kdenemyboard */
(async () => {
    const { setup, spawn, photo, frame, expect, save, restore, enemy: byID } = globalThis.normalAcceptance;
    const rows = [],
        images = {};
    const layers = (target) =>
        [kdenemyboard, kdcanvas].flatMap((board) =>
            board.children.filter(
                (child) => child.name === `SpiderlingsSpellVisuals_cocoon_${target.id}` && child.visible,
            ),
        );
    const hit = (target, amount, kind) => {
        const mage = kind === "mage" ? spawn("MageSpiderlings", 11, 10, "Enemy") : undefined;
        if (mage) mage.stun = 999;
        const source = mage || KDPlayer(),
            spell = KinkyDungeonFindSpell(
                kind === "mage"
                    ? "SpiderlingsMageBolt"
                    : kind === "staff"
                      ? "SpiderlingsSilkenSnare"
                      : "SpiderlingsCocoonConvergence",
                true,
            ),
            damage = mage
                ? Spiderlings.Combat.nativeSilkDamage(
                      mage,
                      { damage: 0, type: "glue", nocrit: true },
                      amount,
                      "mage-spell",
                  )
                : { damage: 0, type: "glue", bind: amount, bindType: "Slime", nocrit: true };
        KinkyDungeonDamageEnemy(target, damage, true, true, spell, undefined, source);
        if (mage) KDMapData.Entities = KDMapData.Entities.filter((enemy) => enemy !== mage);
    };
    const capture = async (name) => {
        images[name] = await photo();
    };
    for (const model of [false, true])
        for (const pink of [false, true])
            for (const kind of ["tome", "staff", "mage"]) {
                const seed = `npc-cocoon-${model ? "model" : "fixed"}-${pink}-${kind}`;
                setup(seed);
                KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
                KDMovePlayer(8, 10, false);
                const target = spawn("Maidforce", 10, 10, "Enemy");
                target.stun = 999;
                target.hostile = 999;
                target.shield = 0;
                KDQuickGenNPC(target, true);
                if (model) {
                    target.CustomSprite = undefined;
                    target.CustomName = "Silk sample";
                    target.style = "Maid";
                    KDToggles.ShowPatronNPCSprites = true;
                }
                hit(target, 1, kind);
                await capture(`${seed}-partial`);
                expect(!layers(target).length, "Partial silk rendered a cocoon");
                hit(target, 3, kind);
                await photo();
                expect(KDBoundEffects(target) === 4 && !KDHelpless(target), "Exact native Bound4 fixture changed");
                expect(!layers(target).length, "Bound4 alone rendered a cocoon");
                hit(target, 0.01, kind);
                await capture(`${seed}-full`);
                expect(
                    KDHelpless(target) && layers(target).length === 1,
                    "Attributed native helpless silk did not render one cocoon",
                );
                expect(
                    Object.keys(KDGetNPCRestraints(target.id)).length === 0,
                    "Cocoon drawing illegally equipped an item",
                );
                const layer = layers(target)[0],
                    silk = layer.children[0].children[1],
                    before = JSON.stringify({
                        bound: target.boundLevel,
                        slime: target.specialBoundLevel,
                        weapon: target.SpiderlingsWeaponWebbing,
                        spider: target.SpiderlingsNPCAdhesion,
                    });
                const artist = KDTex(`Models/SpiderlingsWebbingCocoon${pink ? "Pink" : ""}/Cocoon.png`);
                expect(
                    silk.texture.baseTexture === artist.baseTexture &&
                        silk.texture.frame.x === artist.frame.x &&
                        silk.texture.frame.y === artist.frame.y,
                    "Cocoon did not use the selected normal/pink artist frame",
                );
                expect(
                    !silk.texture.textureCacheIds.some((path) => path.includes("OuterWebs")),
                    "NPC cocoon added anchor webs",
                );
                for (let count = 0; count < 12; count++) await frame();
                expect(layers(target)[0] === layer, "Unchanged NPC appearance rebuilt the cocoon cache");
                expect(
                    JSON.stringify({
                        bound: target.boundLevel,
                        slime: target.specialBoundLevel,
                        weapon: target.SpiderlingsWeaponWebbing,
                        spider: target.SpiderlingsNPCAdhesion,
                    }) === before,
                    "Cocoon rendering mutated native binding or attribution",
                );
                images[`${seed}-actor`] = PIXIapp.renderer.extract.canvas(kdenemyboard).toDataURL("image/png");
                if (model) {
                    const character = KDNPCChar.get(target.id),
                        board = new PIXI.Container();
                    KinkyDungeonDressPlayer(character, false, false, KDGetNPCRestraints(target.id));
                    DrawCharacter(character, 0, 0, 0.5, false, board);
                    await frame();
                    DrawCharacter(character, 0, 0, 0.5, false, board);
                    expect(
                        board.children.some((child) => child.name === `SpiderlingsSpellVisuals_cocoon_${target.id}`),
                        "Native NPC portrait did not receive the authored cocoon",
                    );
                    images[`${seed}-portrait`] = PIXIapp.renderer.extract.canvas(board).toDataURL("image/png");
                }
                const id = target.id;
                restore(save());
                const restored = byID(id);
                await capture(`${seed}-reload`);
                expect(
                    layers(restored).length === 1 && Object.keys(KDGetNPCRestraints(id)).length === 0,
                    "Reload lost the visual or created equipment",
                );
                const savedLedger = JSON.stringify(
                    restored.SpiderlingsWeaponWebbing || restored.SpiderlingsNPCAdhesion,
                );
                // This fixture is silent while hidden; native hearing sprites
                // have their own appearance and are outside the cocoon test.
                restored.sound = 0;
                KinkyDungeonSetEnemyFlag(restored, "hidden", 100);
                KinkyDungeonVisionSet(restored.x, restored.y, 0);
                await frame();
                await frame();
                expect(!layers(restored).length, "Fog exposed a cocoon");
                expect(
                    JSON.stringify(restored.SpiderlingsWeaponWebbing || restored.SpiderlingsNPCAdhesion) ===
                        savedLedger,
                    "Fog consumed owned silk",
                );
                KinkyDungeonSetEnemyFlag(restored, "hidden", 0);
                await capture(`${seed}-visible-again`);
                expect(layers(restored).length === 1, "Revealed cocoon did not return");
                const recover = restored.specialBoundLevel.Slime - 7;
                KDTieUpEnemy(restored, -recover, "Slime", {}, false, 0);
                await capture(`${seed}-recovered`);
                expect(!KDHelpless(restored) && !layers(restored).length, "Recovered NPC retained a cocoon");
                hit(restored, 5, kind);
                await photo();
                expect(layers(restored).length === 1, "A new native helpless state did not enclose the NPC");
                restored.hp = 0;
                await frame();
                await frame();
                expect(!layers(restored).length, "Dead NPC retained a cocoon");
                rows.push({
                    seed,
                    model,
                    pink,
                    kind,
                    boundary: { bound4: 8, helpless: 8.02 },
                    equipment: 0,
                    cacheStable: true,
                    reload: true,
                    fog: true,
                    recovery: true,
                    death: true,
                });
            }
    for (const model of [false, true])
        for (const pink of [false, true]) {
            const seed = `npc-cocoon-armored-${model}-${pink}`;
            setup(seed);
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            KDMovePlayer(8, 10, false);
            const target = spawn("MaidKnightHeavy", 10, 10, "Enemy");
            target.stun = 999;
            target.hostile = 999;
            target.shield = 0;
            KDQuickGenNPC(target, true);
            if (model) {
                target.CustomSprite = undefined;
                target.CustomName = "Armored silk sample";
                KDToggles.ShowPatronNPCSprites = true;
            }
            hit(target, 1000, "staff");
            await capture(seed);
            expect(KDHelpless(target) && layers(target).length === 1, "Armored humanoid lacked one complete cocoon");
            expect(Object.keys(KDGetNPCRestraints(target.id)).length === 0, "Armored cocoon added illegal equipment");
            images[`${seed}-actor`] = PIXIapp.renderer.extract.canvas(kdenemyboard).toDataURL("image/png");
            rows.push({ seed, model, pink, name: "MaidKnightHeavy", cocoon: true, equipment: 0 });
        }
    return { rows, images };
})();
