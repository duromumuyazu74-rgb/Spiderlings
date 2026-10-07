/* global KDMods, KDLoadTranslations, textProvider */
(async () => {
    const { setup, frame, expect, photo } = globalThis.normalAcceptance;
    setup("settings-and-notes");
    const panel = Spiderlings.SettingsPanel,
        images = {},
        pages = [];
    const previousState = KinkyDungeonState;
    KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "0";
    const disabled = Spiderlings.SpinnerAI.initializeMapgenField({ maxFields: 3 });
    expect(disabled.reason === "deployment-disabled", "Zero limit still deployed a preset field");
    expect(!Spiderlings.SpinnerNativeField.state(), "Disabled deployment mutated the map");
    KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "3";
    KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight = "73";
    KDModToggleTab = "Spiderlings";
    KinkyDungeonState = "ModConfig";
    for (const page of ["general", "floors", "nests"]) {
        panel.select(page);
        KDDrawModConfigs();
        await frame();
        const inputs = KDModConfigs.Spiderlings.filter((entry) => entry.type === "string").map((entry) => entry.refvar);
        expect(KDModConfigs.Spiderlings.length <= 16, "Settings need unnecessary native pagination");
        for (const id of inputs) {
            const input = document.getElementById(id),
                bounds = input?.getBoundingClientRect();
            expect(input && bounds.width > 0 && bounds.height > 0, `Native input ${id} is missing or hidden`);
            expect(getComputedStyle(input).visibility !== "hidden", `Native input ${id} is hidden`);
            if (id === "spiderlingsHuntingGroundsWeight")
                expect(input.value === "73", "Native floor input did not render the saved value");
        }
        if (page === "nests") {
            const entries = KDModConfigs.Spiderlings;
            for (const id of inputs) {
                const index = entries.findIndex((entry) => entry.type === "string" && entry.refvar === id);
                expect(
                    index >= 8 && entries[index - 1].refvar === id && entries[index - 1].type === "text",
                    `Nest limit ${id} lacks its heading in the limits column`,
                );
            }
            expect(
                entries.filter((entry, index) => entry.type === "range" && index < 8).length === 5,
                "Nest species weights are split across columns",
            );
        }
        images[`settings-${page}`] = await photo();
        pages.push({ page, rows: KDModConfigs.Spiderlings.length, inputs });
    }
    Spiderlings.ensureModSettings();
    expect(Spiderlings.getSetting("spiderlingsHuntingGroundsWeight") === "73", "Changing pages lost a saved setting");
    panel.select("general");
    KinkyDungeonState = previousState;
    const ids = Spiderlings.Bestiary.ids;
    const explored = JSON.parse(localStorage.getItem("kdexpLore") || "{}");
    // Persisted notes can precede Mod registration during native startup.
    explored[ids[1]] = 1;
    localStorage.setItem("kdexpLore", JSON.stringify(explored));
    KinkyDungeonCurrentLoreTabs = ["Default"];
    {
        const loadedPackage = Object.keys(KDMods).find((name) => name.startsWith("Spiderlings_"));
        const loadedEntries = await model.getEntries(KDMods[loadedPackage], {});
        const entry = loadedEntries.find((file) => file.filename === "SpiderlingsBestiary.js");
        const source = await fetch(await model.getURL(entry, {})).then((response) => response.text());
        (0, eval)(source);
    }
    expect(KinkyDungeonCurrentLoreTabs.includes("Spiderlings"), "Persisted single-entry category remains Unknown");
    KinkyDungeonCurrentLoreTab = "Spiderlings";
    KinkyDungeonUpdateLore(explored);
    expect(KinkyDungeonCurrentLoreItems.includes(ids[1]), "Persisted Jumper note disappeared after registration");
    const unlocked = Spiderlings.Bestiary.unlockAll();
    expect(unlocked.added <= 5 && unlocked.discovered === 6, "Debug unlock returned an invalid discovery count");
    expect(
        ids.every((id) => JSON.parse(localStorage.getItem("kdexpLore"))[id]),
        "Debug unlock left missing entries",
    );
    expect(Spiderlings.Bestiary.unlockAll().added === 0, "Repeated debug unlock duplicated discovery");
    expect(JSON.parse(localStorage.getItem("kdexpLore")).Cover === explored.Cover, "Debug unlock changed native lore");
    for (const id of ids) delete explored[id];
    localStorage.setItem("kdexpLore", JSON.stringify(explored));
    localStorage.setItem("kdnewLore", JSON.stringify(["Cover"]));
    let pickups = 0;
    for (; pickups < 500; pickups++) {
        const known = JSON.parse(localStorage.getItem("kdexpLore") || "{}");
        if (ids.every((id) => known[id])) break;
        KDMapData.GroundItems.push({ name: "Lore", x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y });
        KinkyDungeonItemCheck(KinkyDungeonPlayerEntity.x, KinkyDungeonPlayerEntity.y, MiniGameKinkyDungeonLevel);
    }
    expect(pickups < 500, "Random native notes failed to discover the six Spiderlings");
    expect(
        ids.every((id) => KinkyDungeonNewLoreList.includes(id)),
        "Native notes did not persist discovery",
    );
    expect(KinkyDungeonCurrentLoreTabs.includes("Spiderlings"), "The native Journal has no Spiderlings category");
    KinkyDungeonCurrentLoreTab = "Spiderlings";
    KinkyDungeonUpdateLore(JSON.parse(localStorage.getItem("kdexpLore") || "{}"));
    expect(
        ids.every((id) => KinkyDungeonCurrentLoreItems.includes(id)),
        "Discovered Spiderlings are missing from the native Journal directory",
    );
    KinkyDungeonCurrentLore = ids[0];
    KinkyDungeonCurrentLoreTabOffset = 0;
    KinkyDungeonCurrentLoreItemOffset = 0;
    KinkyDungeonDrawState = "Logbook";
    for (const id of ids) {
        KinkyDungeonCurrentLore = id;
        KinkyDungeonDrawLore();
        images[`entry-${id}`] = await photo();
        expect(kdpixisprites.get("kdlorimage0")?.visible, `Native Journal did not render ${id}`);
    }
    KinkyDungeonCurrentLore = ids[0];
    KinkyDungeonDrawLore();
    images.bestiary = await photo();
    expect(kdpixisprites.get("kdlorimage0")?.visible, "Native Journal did not render the owned enemy portrait");
    KinkyDungeonDrawState = "Titles";
    KinkyDungeonDrawTitles();
    images.titles = await photo();
    expect(!kdpixisprites.get("kdlorimage0")?.visible, "Owned Journal portrait leaked into Titles");
    expect(KinkyDungeonCurrentLore === ids[0] && KDLoreImg[ids[0]], "Titles damaged Journal selection or image");
    KinkyDungeonDrawState = "Logbook";
    KinkyDungeonDrawLore();
    await photo();
    expect(kdpixisprites.get("kdlorimage0")?.visible, "Returning from Titles lost the Journal portrait");
    KinkyDungeonDrawState = "Game";
    const packageName = Object.keys(KDMods).find((name) => name.startsWith("Spiderlings_")),
        entries = await model.getEntries(KDMods[packageName], {}),
        csvEntry = entries.find((entry) => entry.filename === "SpiderlingsCN.csv"),
        csv = await fetch(await model.getURL(csvEntry, {})).then((response) => response.text()),
        keys = csv
            .trim()
            .split("\n")
            .map((line) => line.slice(0, line.indexOf(","))),
        source = textProvider.getGroupManager().getGroup("default"),
        original = keys.map((key) => [key, source.get(key)]),
        language = TranslationLanguage;
    try {
        TranslationLanguage = "CN";
        KDLoadTranslations(csv);
        expect(TextGet("KDModButtonspiderlingsSettingsFloors") === "楼层设置", "Native Chinese settings did not load");
        KinkyDungeonState = "ModConfig";
        for (const page of ["general", "floors", "nests"]) {
            panel.select(page);
            KDDrawModConfigs();
            await frame();
            images[`settings-CN-${page}`] = await photo();
        }
        KinkyDungeonState = previousState;
        KinkyDungeonDrawState = "Logbook";
        for (const id of ids) {
            KinkyDungeonCurrentLore = id;
            KinkyDungeonDrawLore();
            images[`entry-CN-${id}`] = await photo();
            expect(kdpixisprites.get("kdlorimage0")?.visible, `Chinese Journal did not render ${id}`);
        }
        KinkyDungeonCurrentLore = ids[0];
        KinkyDungeonDrawLore();
        images["bestiary-CN"] = await photo();
        KinkyDungeonDrawState = "Titles";
        KinkyDungeonDrawTitles();
        images["titles-CN"] = await photo();
        expect(!kdpixisprites.get("kdlorimage0")?.visible, "Chinese Titles retained the owned portrait");
    } finally {
        TranslationLanguage = language;
        for (const [key, value] of original) addTextKey(key, value);
        KinkyDungeonState = previousState;
        KinkyDungeonDrawState = "Game";
        panel.select("general");
    }
    KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight = "2000";
    return { pages, pickups, discovered: ids, images };
})();
