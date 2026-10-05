"use strict";

// Presentation uses the original catalogue and settings namespace; changing pages never migrates values.
(() => {
    const api = globalThis.Spiderlings;
    if (typeof KDModConfigs === "undefined") return;
    api.ensureModSettings();
    const catalogue = [...KDModConfigs.Spiderlings];
    const pages = {
        general: [
            "spiderlingsPinkWebbing",
            "spiderlingsEnableHood",
            "spiderlingsSpinnerEncounters",
            "spiderlingsMapPopulationCap",
        ],
        floors: ["spiderlingsInfestationWeight", "spiderlingsHuntingGroundsWeight"],
        nests: [
            "spiderlingsNestSpinnerWeight",
            "spiderlingsNestJumperWeight",
            "spiderlingsNestWebCasterWeight",
            "spiderlingsNestTunnelerWeight",
            "spiderlingsNestMageWeight",
            "spiderlingsNestReinforcementCap",
            "spiderlingsNestTunnelerCap",
            "spiderlingsNestReinforcementInterval",
        ],
    };
    let current = "general";
    const button = (page, label) => ({
        type: "button",
        name: `SpiderlingsSettings${page}`,
        refvar: label,
        click: () => {
            select(page);
            return true;
        },
    });
    function select(page) {
        current = page;
        const navigation =
            page === "general"
                ? [button("floors", "spiderlingsSettingsFloors"), button("nests", "spiderlingsSettingsNests")]
                : [button("general", "spiderlingsSettingsBack")];
        const controls = pages[page].flatMap((key) => catalogue.filter((entry) => entry.refvar === key));
        // The old living-cap heading was not paired with its field's refvar.
        if (page === "nests") {
            const index = controls.findIndex((entry) => entry.refvar === "spiderlingsNestReinforcementCap");
            controls.splice(index, 0, { type: "text", refvar: "spiderlingsNestReinforcementCap" });
        }
        KDModConfigs.Spiderlings = [
            ...navigation,
            ...controls,
            { type: "text", refvar: `spiderlingsSettings${page[0].toUpperCase() + page.slice(1)}Help` },
            ...(page === "floors" ? [{ type: "text", refvar: "spiderlingsSettingsHuntingHelp" }] : []),
        ];
        if (typeof KDModPage !== "undefined") KDModPage = 0;
    }
    const ensure = api.ensureModSettings;
    api.ensureModSettings = function () {
        ensure();
        select(current);
    };
    api.SettingsPanel = { select, catalogue: () => [...catalogue], current: () => current };
    const labels = {
        spiderlingsSettingsFloors: "Floor settings",
        spiderlingsSettingsNests: "Nest settings",
        spiderlingsSettingsBack: "Back to general",
        spiderlingsSettingsFloorsHelp: "Weights select new floors. 0 disables a theme.",
        spiderlingsSettingsNestsHelp: "Species weights: 0 prevents that reinforcement.",
        spiderlingsSettingsGeneralHelp: "Themed floors retain their population budgets.",
        spiderlingsSettingsHuntingHelp: "Hunting Grounds: Maidforce floors from floor 5.",
        spiderlingsPinkWebbing: "Pink silk",
        spiderlingsEnableHood: "Allow silk hoods",
        spiderlingsSpinnerEncounters: "Spinner capture fields",
        spiderlingsMapPopulationCap: "Mobile spider limit (0: unlimited)",
        spiderlingsInfestationWeight: "Infestation weight",
        spiderlingsHuntingGroundsWeight: "Hunting Grounds weight",
        spiderlingsNestReinforcementCap: "Living reinforcements per nest",
        spiderlingsNestTunnelerCap: "Lifetime Tunnelers per nest (0: none)",
        spiderlingsNestReinforcementInterval: "Reinforcement check interval (turns)",
    };
    for (const [key, label] of Object.entries(labels)) addTextKey(`KDModButton${key}`, label);
    select(current);
})();
