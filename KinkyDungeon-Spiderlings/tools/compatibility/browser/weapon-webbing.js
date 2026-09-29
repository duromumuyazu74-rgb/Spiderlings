(async () => {
    const expect = (condition, message) => {
        if (!condition) throw new Error(message);
    };
    const images = {},
        rows = [];
    const frame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const KEY = "SpiderlingsWeaponWebbing";
    const names = (enemy) => Object.values(KDGetNPCRestraints(enemy.id)).map((item) => item.name);
    const player = () => KinkyDungeonPlayerEntity;
    const spawn = (offset = 1) => {
        const enemy = DialogueCreateEnemy(player().x + offset, player().y, "Maidforce");
        enemy.hostile = 999;
        enemy.shield = 0;
        enemy.stun = 999;
        KDQuickGenNPC(enemy, true);
        return enemy;
    };
    const hit = (enemy, amount, kind = "SpiderlingsCocoonConvergence") => {
        KinkyDungeonDamageEnemy(
            enemy,
            { damage: 0, type: "glue", bind: amount, bindType: "Slime", nocrit: true },
            true,
            true,
            KinkyDungeonFindSpell(kind, true),
            undefined,
            player(),
        );
    };
    async function draw(enemy, label) {
        const character = KDNPCChar.get(enemy.id);
        KinkyDungeonDressPlayer(character, false, false, KDGetNPCRestraints(enemy.id));
        DrawCharacter(character, 200, 0, 1);
        await new Promise((resolve) => setTimeout(resolve, 350));
        DrawCharacter(character, 200, 0, 1);
        const mc = KDCurrentModels.get(character);
        const container = [...mc.Containers.values()][0];
        images[label] = PIXIapp.renderer.extract.canvas(container.Mesh).toDataURL("image/png");
        return mc;
    }
    KinkyDungeonStartNewGame(false);
    expect(
        !KinkyDungeonStatsPresets.SpiderlingsSpinnerDemo && !KDPerkStart.SpiderlingsSpinnerDemo,
        "Retired trial still appears as a starting perk",
    );
    expect(typeof Spiderlings.SpinnerField.enter === "function", "Reusable test field was removed");
    Spiderlings.SpinnerField.enter();
    expect(KDMapData.RoomType === "SpiderlingsSpinnerTraining", "Test field entry no longer works");
    KDMapData.Entities = [];
    KDUpdateEnemyCache = true;
    const enemy = spawn();
    hit(enemy, 1);
    expect(enemy[KEY]?.tome > 0 && names(enemy).length === 0, "Light silk failed attribution or issued an early set");
    const light = Spiderlings.WeaponWebbing.status(enemy);
    hit(enemy, 24);
    const final = Spiderlings.WeaponWebbing.status(enemy);
    expect(final.pieces === 4 && KDHelpless(enemy), "Native helpless tome target did not receive the four-part set");
    expect(enemy.boundLevel === enemy[KEY].tome, "Equipment added a second binding payment");
    expect(
        Object.values(KDGetNPCRestraints(enemy.id)).every((item) => item.conjured),
        "Spell silk became farmable inventory",
    );
    const firstIDs = enemy[KEY].items.map((item) => item.id);
    for (const pink of [false, true]) {
        const previous = Spiderlings.getSetting;
        Spiderlings.getSetting = (name) => (name === "spiderlingsPinkWebbing" ? pink : previous(name));
        try {
            await Spiderlings.applyWebbingColor(true);
            const mc = await draw(enemy, pink ? "set-pink" : "set-normal");
            expect(mc.Poses.Closed && !mc.Poses.Spread, "NPC leg pose hides the equipped silk");
            const rendered = [];
            for (const model of mc.Models.values()) {
                if (!/SpiderlingsWebbingLv1(?:Arm|Legs|Ankles|Belly)Model/.test(model.Name)) continue;
                for (const layer of Object.values(model.Layers)) {
                    if (ModelDrawLayer(mc, model, layer, mc.Poses)) {
                        const image = ModelLayerString(model, layer, mc.Poses);
                        expect(!!KDModFiles[image], `Missing set asset ${image}`);
                        expect(image.includes(pink ? "Lv1Pink/" : "Lv1/"), `NPC uses wrong color: ${image}`);
                        rendered.push(image);
                    }
                }
            }
            expect(
                rendered.length === 4,
                `Not all four NPC pieces are drawable: ${JSON.stringify({ rendered, poses: mc.Poses, models: [...mc.Models.keys()] })}`,
            );
            rows.push({ color: pink ? "Pink" : "Normal", rendered });
        } finally {
            Spiderlings.getSetting = previous;
        }
    }
    await Spiderlings.applyWebbingColor(true);
    const id = enemy.id;
    const save = KinkyDungeonSaveGame(true);
    expect(
        KinkyDungeonLoadGame(typeof save === "string" ? save : LZString.compressToBase64(JSON.stringify(save)), true),
        "Native save load failed",
    );
    const restored = KDMapData.Entities.find((enemy) => enemy.id === id);
    expect(
        restored && JSON.stringify(restored[KEY].items.map((item) => item.id)) === JSON.stringify(firstIDs),
        "Saved set identity changed",
    );
    expect(names(restored).length === 4, "Saved NPC set disappeared");
    for (const [slot, item] of Object.entries(KDGetNPCRestraints(id))) {
        KDInputSetNPCRestraint({
            slot,
            restraint: "",
            restraintid: item.id,
            id: item.id,
            lock: "",
            npc: id,
            player: player().id,
        });
    }
    expect(names(restored).length === 0, "Native removal failed");
    Spiderlings.WeaponWebbing.status(restored);
    expect(restored[KEY].items.length === 0, "Native removal reissued equipment");
    expect(!KinkyDungeonInventoryGetSafe("SpiderlingsWebbingLv1Arm"), "Conjured item entered player inventory");
    KDTieUpEnemy(restored, -(restored.specialBoundLevel.Slime || 0), "Slime", {}, false, 0);
    expect(!Spiderlings.WeaponWebbing.status(restored), "Freed NPC retained weapon overlay");
    const staff = spawn(2);
    hit(staff, 24, "SpiderlingsSilkenSnare");
    expect(Spiderlings.WeaponWebbing.status(staff)?.amount > 0 && names(staff).length === 0, "Staff formed a tome set");
    const mixed = spawn(3);
    KDTieUpEnemy(mixed, 100, "Slime", {}, false, 0);
    hit(mixed, 1);
    expect(names(mixed).length === 0 && mixed[KEY].tome < 100, "Unrelated Slime was claimed by the tome");
    const shielded = spawn(4);
    shielded.shield = 1000;
    hit(shielded, 24);
    expect(!shielded[KEY], "Blocked native binding produced persistent silk");

    const bagNPC = spawn(5);
    const bag = KinkyDungeonGetRestraintByName("SpiderlingsSpinnerLegbinder");
    const bagSlot = KDGetNPCBindingSlotForItem(bag, bagNPC.id);
    const looseID = KinkyDungeonGetItemID();
    KinkyDungeonInventoryAdd({ name: bag.name, id: looseID, type: LooseRestraint, quantity: 1 });
    expect(
        KDInputSetNPCRestraint({
            slot: bagSlot.sgroup.id,
            id: looseID,
            restraint: bag.name,
            restraintid: looseID,
            lock: "",
            npc: bagNPC.id,
            player: player().id,
            force: true,
        }),
        "Native bag equip failed",
    );
    for (const pink of [false, true]) {
        const previous = Spiderlings.getSetting;
        Spiderlings.getSetting = (name) => (name === "spiderlingsPinkWebbing" ? pink : previous(name));
        try {
            await Spiderlings.applyWebbingColor(true);
            const mc = await draw(bagNPC, pink ? "bag-pink" : "bag-normal");
            const model = mc.Models.get("SpiderlingsSpinnerLegbinderModel");
            const layer = model.Layers.Finished;
            const image = ModelLayerString(model, layer, mc.Poses);
            expect(ModelDrawLayer(mc, model, layer, mc.Poses), "NPC leg bag layer hidden");
            expect(
                image === `Models/SpiderlingsSpinnerLegbinder${pink ? "Pink" : ""}/Stage7.png` && KDModFiles[image],
                "NPC leg bag still requests deleted or wrong-color art",
            );
            rows.push({ bag: image });
        } finally {
            Spiderlings.getSetting = previous;
        }
    }
    await Spiderlings.applyWebbingColor(true);
    await frame();
    return {
        light,
        final,
        saveReload: true,
        nativeRemoval: true,
        mixedSlime: true,
        shielded: true,
        retainedTestField: true,
        rows,
        images,
    };
})();
