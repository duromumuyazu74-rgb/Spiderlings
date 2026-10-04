"use strict";

const scenarios = [
    ["basic", "basic.js"],
    ["escape-text-contract", "escape-text-contract.js"],
    ["wall", "wall.js"],
    ["spinner-outside", "spinner.js", "outside"],
    ["spinner-inside", "spinner.js", "inside"],
    ["capture-reload", "capture-reload.js", null, ["spinner-inside"]],
    ["spinner-art", "spinner-art.js", null, ["spinner-inside"]],
    ["webcaster", "webcaster.js"],
    ["rune-hit", "01-rune-hit.js"],
    ["target-overlay", "02-target-overlay.js", null, ["rune-hit"]],
    ["orphan-spray", "orphan-spray.js"],
    ["friendly-mage", "friendly-mage.js"],
    ["hidden-wrapping", "hidden-wrapping.js"],
    ["nest-weights", "nest-weights.js"],
    ["squad-perk", "squad-perk.js"],
    ["mage-body", "mage-body.js"],
    ["weapons", "weapons.js"],
    ["weapon-webbing", "weapon-webbing.js"],
    ["npc-cooperation", "npc-cooperation.js"],
    ["web-mobility", "web-mobility.js"],
    ["hunting-grounds", "hunting-grounds.js"],
    ["owned-effects", "owned-effects.js"],
    ["normal-helpers", "normal-helpers.js"],
    ...[
        "npc-cocoon-visuals",
        "weapon-charge",
        "crew-native-duties",
        "native-escape",
        "adhesion-offense",
        "adhesion-recovery",
        "spinner-work",
        "spinner-regressions",
        "spinner-perception",
        "web-breach",
        "wrapping-lifecycle",
        "cocoon-vigil",
        "mage-timing",
        "player-recovery",
        "action-cadence",
        "population-failure",
        "floor-objective-hints",
        "normal-integration",
        "normal-visuals",
        "passage-sites",
        "debug-stairs",
        "floor-weights",
    ].map((name) => [name, `${name}.js`, null, ["normal-helpers"]]),
    ["native-locales", null, null, [], "locales"],
].map(([name, file, variant, dependencies = [], kind = "browser"]) => ({ name, file, variant, dependencies, kind }));

function selectScenarios(requested = []) {
    const byName = new Map(scenarios.map((scenario) => [scenario.name, scenario]));
    const selected = new Set();
    function include(name) {
        const scenario = byName.get(name);
        if (!scenario) throw new Error(`Unknown scenario: ${name}. Use --list-scenarios.`);
        if (selected.has(name)) return;
        selected.add(name);
        for (const dependency of scenario.dependencies) include(dependency);
    }
    for (const name of requested.length ? requested : byName.keys()) include(name);
    const checks = scenarios.filter((scenario) => selected.has(scenario.name));
    return {
        mode: requested.length ? "partial" : "full",
        requested: [...new Set(requested)],
        executed: checks.map((scenario) => scenario.name),
        total: scenarios.length,
        checks,
    };
}

function parseArguments(args) {
    const options = { scenarios: [] };
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--prepare-only") options.prepareOnly = true;
        else if (args[i] === "--list-scenarios") options.list = true;
        else if (
            ["--baseline", "--cache", "--package", "--scenario"].includes(args[i]) &&
            args[i + 1] &&
            !args[i + 1].startsWith("--")
        ) {
            const option = args[i].slice(2),
                value = args[++i];
            if (option === "scenario") options.scenarios.push(...value.split(","));
            else options[option] = value;
        } else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
    }
    if (options.prepareOnly && options.scenarios.length)
        throw new Error("--prepare-only cannot run selected scenarios.");
    options.selection = selectScenarios(options.scenarios);
    return options;
}

module.exports = { selectScenarios, parseArguments };
