(async () => {
    const { setup: nativeSetup, spawn, turn, frame, expect, pin, photo } = globalThis.normalAcceptance;
    const setup = (seed) => {
        nativeSetup(seed);
        KinkyDungeonBulletsVisual.clear();
        KDDamageQueue.length = 0;
        KinkyDungeonFloaters.length = 0;
    };
    const rows = (globalThis.normalTrace = []),
        images = {};
    const cast = (name, source, x, y) => KinkyDungeonCastSpell(x, y, KinkyDungeonFindSpell(name, true), source);
    const colorName = (pink) => (pink ? "pink" : "normal");
    const snap = async (name) => {
        images[name] = await photo();
    };
    for (const pink of [false, true]) {
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        for (const width of [3, 7]) {
            setup(`visual-border-${pink}-${width}`);
            KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
            KDMovePlayer(11 + Math.floor(width / 2), 8 + Math.floor(width / 2), false);
            const owner = spawn("Spinner", 10, 7);
            owner.stun = 999;
            const left = 11,
                top = 8,
                right = left + width - 1,
                bottom = top + width - 1;
            Spiderlings.SpinnerNativeField.initializeEnclosure({
                compositeId: "visual-field",
                owners: [owner.id],
                built: true,
                autoSeal: true,
                layers: [
                    {
                        id: "visual-ring",
                        vertices: [
                            { x: left, y: top },
                            { x: right, y: top },
                            { x: right, y: bottom },
                            { x: left, y: bottom },
                        ],
                        gate: { x: left, y: top + 1 },
                    },
                ],
            });
            await snap(`${colorName(pink)}-border-${width}`);
            const drawn = [...kdpixisprites.entries()]
                .filter(([id, sprite]) => id.includes("_border_") && !id.endsWith("_flash") && sprite.visible)
                .map(([id, sprite]) => ({
                    id,
                    rotation: sprite.rotation,
                    url: sprite.texture?.baseTexture?.resource?.url,
                    path: sprite.texture?.textureCacheIds?.find((key) => key.includes("SpiderlingsSpinnerTrap")),
                }));
            const paths = ["Top", "Side", "Corner"].map(
                (part) => KinkyDungeonRootDirectory + `Bullets/SpiderlingsSpinnerTrap${part}${pink ? "Pink" : ""}.png`,
            );
            for (const path of paths)
                expect(
                    drawn.some((entry) => entry.url === KDModFiles[path]),
                    `Missing rendered border ${path}`,
                );
            const corners = drawn.filter((entry) => entry.url === KDModFiles[paths[2]]);
            expect(
                new Set(corners.map((entry) => Math.round((entry.rotation * 2) / Math.PI))).size === 4,
                "Not all four authored corners were oriented",
            );
            rows.push({ kind: "borders", pink, width, drawn });
        }
        setup(`visual-status-${pink}`);
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        KDMovePlayer(10, 10, false);
        const caster = spawn("WebCaster", 8, 8);
        caster.stun = 999;
        const initial = spawn("MaidKnightHeavy", 12, 8, "Maidforce");
        const full = spawn("MaidKnightHeavy", 14, 10, "Maidforce");
        const helpless = spawn("MaidKnightHeavy", 12, 12, "Maidforce");
        for (const target of [initial, full, helpless]) target.stun = 999;
        for (let hit = 0; hit < 30 && Spiderlings.NPCAdhesion.status(initial) === "free"; hit++)
            Spiderlings.Combat.hitNPC(caster, initial, "direct");
        pin(full, caster);
        pin(helpless, caster);
        Spiderlings.Combat.applySilkBinding(caster, helpless, 100, { attack: "direct" });
        const states = [initial, full, helpless].map((target) => Spiderlings.NPCAdhesion.status(target));
        expect(
            JSON.stringify(states) === JSON.stringify(["initial", "full", "native-helpless"]),
            `Native visual status preconditions differ: ${JSON.stringify(states)}`,
        );
        KDDamageQueue.length = 0;
        KinkyDungeonFloaters.length = 0;
        await new Promise((resolve) => setTimeout(resolve, 400));
        await snap(`${colorName(pink)}-npc-states`);
        rows.push({ kind: "physical-silk-states", pink, states });
        KDMapData.Entities = KDMapData.Entities.filter((target) => ![initial, helpless].includes(target));
        expect(Spiderlings.NPCWrapping.vulnerable(full), "No full silk-bound NPC to inspect");
        KDDamageQueue.length = 0;
        KinkyDungeonFloaters.length = 0;
        await new Promise((resolve) => setTimeout(resolve, 500));
        await snap(`${colorName(pink)}-npc-wrapping`);
        rows.push({
            kind: "silk-without-policy-label",
            pink,
            vulnerable: Spiderlings.NPCWrapping.vulnerable(full),
            multiplier: Spiderlings.NPCWrapping.DAMAGE_MULTIPLIER,
            source: { x: caster.x, y: caster.y, visual_x: caster.visual_x, visual_y: caster.visual_y },
        });

        setup(`visual-spray-${pink}`);
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = pink;
        KDMovePlayer(10, 10, false);
        const source = spawn("WebCaster", 12, 8);
        source.stun = 999;
        const observed = new Set(),
            actual = new Set(),
            nativeDraw = KDDraw;
        const paths = ["WebSpray", "WebSprayTrail", "SpiderWeb", "SpiderWebHit"].map(
            (name) => KinkyDungeonRootDirectory + `Bullets/${name}${pink ? "Pink" : ""}.png`,
        );
        const inspect = () => {
            for (const sprite of kdpixisprites.values())
                if (sprite.visible) {
                    const url = sprite.texture?.baseTexture?.resource?.url;
                    for (const path of paths) if (url === KDModFiles[path]) actual.add(path);
                }
        };
        KDDraw = function (board, sprites, id, path) {
            const result = nativeDraw.apply(this, arguments);
            if (result?.visible && typeof path === "string" && /Bullets\/(?:WebSpray|SpiderWeb)/.test(path))
                observed.add(path);
            return result;
        };
        try {
            expect(cast("WebSpray", source, 17, 8).result === "Cast", "Native spray cast failed");
            await snap(`${colorName(pink)}-spray-flight`);
            inspect();
            for (let step = 0; step < 12; step++) {
                KinkyDungeonUpdateBullets(0.25, false);
                await frame();
                await frame();
                inspect();
                if (step === 2)
                    images[`${colorName(pink)}-spray-travel`] = document.querySelector("canvas").toDataURL("image/png");
            }
            await snap(`${colorName(pink)}-spray-settled`);
            inspect();
            expect(cast("SpiderWeb", source, 14, 11).result === "Cast", "Native terrain web cast failed");
            await snap(`${colorName(pink)}-terrain-web`);
            inspect();
            rows.push({ kind: "spray-assets", pink, observed: [...observed], actual: [...actual] });
            expect(
                paths.every((path) => actual.has(path)),
                `Not all four ${colorName(pink)} assets were drawn: ${JSON.stringify([...actual])}`,
            );
        } finally {
            KDDraw = nativeDraw;
        }
    }
    for (const stacks of [1, 2, 3]) {
        setup(`hex-duration-${stacks}`);
        const mage = spawn("MageSpiderlings", 10, 8),
            target = spawn("MaidKnightHeavy", 12, 10, "Maidforce");
        mage.stun = 999;
        target.stun = 999;
        target.shield = 20;
        expect(cast("SpiderlingsMageHex", mage, 12, 10).result === "Cast", "Hex duration cast failed");
        for (let tick = 0; tick < stacks + 2; tick++) await turn();
        const clock = KDMapData.SpiderlingsMageSpells.clock,
            mark = structuredClone(Spiderlings.MageSpells.markFor(target));
        expect(mark.stacks === stacks && mark.expiresAt - clock === 2 + stacks, "Hex mark duration is not 3/4/5");
        KDMoveEntity(target, 18, 14, false);
        for (let tick = 0; tick <= 2 + stacks; tick++) await turn();
        expect(!Spiderlings.MageSpells.markFor(target), "Expired mark remains active outside Hex");
        rows.push({ kind: "mark-expiry", stacks, clock, mark, expiredAt: KDMapData.SpiderlingsMageSpells.clock });
    }
    for (const shield of [20, 0.5]) {
        const results = [];
        for (const marked of [false, true]) {
            setup(`hex-fragility-${shield}-${marked}`);
            const mage = spawn("MageSpiderlings", 10, 8),
                target = spawn("MaidKnightHeavy", 12, 10, "Maidforce");
            mage.stun = 999;
            target.stun = 999;
            target.shield = 20;
            cast("SpiderlingsMageHex", mage, 12, 10);
            for (let tick = 0; tick < 3; tick++) await turn();
            if (!marked) delete KDMapData.SpiderlingsMageSpells.marks[`npc:${target.id}`];
            target.shield = shield;
            const before = { hp: target.hp, shield: target.shield };
            KinkyDungeonDamageEnemy(
                target,
                { damage: 2, type: "arcane", nocrit: true },
                true,
                true,
                undefined,
                undefined,
                mage,
            );
            results.push({ marked, before, after: { hp: target.hp, shield: target.shield || 0 } });
        }
        const [plain, fragile] = results,
            plainDamage = shield - plain.after.shield,
            fragileDamage = shield - fragile.after.shield;
        expect(
            Math.abs(fragileDamage - Math.min(shield, plainDamage * 1.5)) < 1e-8,
            "Fragility does not add 50 percent actual shield damage",
        );
        expect(plain.after.hp === fragile.after.hp, "Extra fragility damage overflowed into HP");
        rows.push({ kind: "shield-fragility", shield, results });
    }
    setup("hex-native-detonation");
    KDMovePlayer(9, 10, false);
    const mage = spawn("MageSpiderlings", 10, 8),
        target = spawn("MaidKnightHeavy", 12, 10, "Maidforce"),
        source = spawn("WebCaster", 10, 12);
    mage.stun = 999;
    target.stun = 999;
    source.stun = 999;
    target.shield = 20;
    cast("SpiderlingsMageHex", mage, 12, 10);
    for (let tick = 0; tick < 5; tick++) await turn();
    expect(Spiderlings.MageSpells.markFor(target).stacks === 3, "Three-stack detonation fixture failed");
    target.shield = 0;
    Spiderlings.Combat.hitNPC(source, target, "direct");
    const clock = KDMapData.SpiderlingsMageSpells.clock,
        blast = KDMapData.SpiderlingsMageSpells.blasts.find((entry) => entry.detonateAt);
    expect(blast?.detonateAt === clock + 2 && blast.stacks === 3, "Native direct hit did not schedule two-turn blast");
    const before = target.specialBoundLevel.Slime;
    await snap("hex-detonation-warning");
    await turn();
    expect(
        KDMapData.SpiderlingsMageSpells.blasts.some((entry) => entry.detonateAt === clock + 2),
        "Hex detonated a turn early",
    );
    const intermediate = target.specialBoundLevel.Slime;
    await turn();
    expect(
        !KDMapData.SpiderlingsMageSpells.blasts.some((entry) => entry.detonateAt),
        "Hex detonation remained pending after two turns",
    );
    expect(target.specialBoundLevel.Slime > intermediate, "Two-turn Hex blast did not apply native silk");
    await snap("hex-detonation-active");
    rows.push({
        kind: "native-detonation",
        clock,
        blast: structuredClone(blast),
        before,
        intermediate,
        after: target.specialBoundLevel.Slime,
    });
    KDModSettings.Spiderlings.spiderlingsPinkWebbing = false;
    return { rows, images };
})();
