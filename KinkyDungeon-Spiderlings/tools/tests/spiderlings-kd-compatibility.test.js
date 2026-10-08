"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { git, gameVersion, syncUpstream } = require("../compatibility/prepare.js");
const vm = require("node:vm");
const { selectScenarios, stateGroups, parseArguments } = require("../compatibility/scenarios.js");
const { createDiagnostics, browserDiagnostics } = require("../compatibility/diagnostics.js");

test("native save preparation renders a missing player model once and preserves existing poses and paid time", () => {
    for (const existing of [false, true]) {
        const player = {},
            model = { Poses: { nativePose: true } },
            models = new Map(existing ? [[player, model]] : []),
            calls = [],
            worker = { movePoints: 0.625, attackPoints: 0.25, SpinnerConstructionPoints: 0.5 };
        const context = vm.createContext({
            KinkyDungeonPlayer: player,
            KDCurrentModels: models,
            KinkyDungeonCurrentTick: 19,
            KinkyDungeonDressPlayer: () => calls.push("dress"),
            DrawCharacter: (actor, x, y, zoom) => {
                assert.equal(actor, player);
                assert.deepEqual([x, y, zoom], [0, 0, 1]);
                calls.push("draw");
                models.set(actor, model);
            },
            KinkyDungeonSaveGame: (returnData) => {
                assert.equal(returnData, true);
                assert.equal(models.get(player), model);
                calls.push("save");
                return "native-save-data";
            },
            KinkyDungeonAdvanceTime: () => {
                throw Error("Save preparation cannot advance world time");
            },
            worker,
        });
        vm.runInContext(
            fs.readFileSync(path.join(__dirname, "../compatibility/browser/normal-helpers.js"), "utf8"),
            context,
        );
        assert.equal(context.normalAcceptance.save(), "native-save-data");
        assert.equal(context.normalAcceptance.save(), "native-save-data");
        assert.deepEqual(calls, existing ? ["save", "save"] : ["dress", "draw", "save", "save"]);
        assert.equal(models.get(player), model);
        assert.deepEqual(model.Poses, { nativePose: true });
        assert.equal(context.KinkyDungeonCurrentTick, 19);
        assert.deepEqual(worker, { movePoints: 0.625, attackPoints: 0.25, SpinnerConstructionPoints: 0.5 });
    }
});

test("shared budget fixture restores the production function after an asynchronous failure", async () => {
    const original = (kind) => ({ kind, cap: 60 });
    const context = vm.createContext({ Spiderlings: { Population: { prepareFloor: original } } });
    vm.runInContext(
        fs.readFileSync(path.resolve(__dirname, "../compatibility/browser/normal-helpers.js"), "utf8"),
        context,
    );
    await assert.rejects(
        context.normalAcceptance.withPopulationBudget("hunting", 1, async () => {
            assert.equal(context.Spiderlings.Population.prepareFloor("hunting").cap, 1);
            assert.equal(context.Spiderlings.Population.prepareFloor("other").cap, 60);
            await Promise.resolve();
            throw Error("fixture failed");
        }),
        /fixture failed/,
    );
    assert.equal(context.Spiderlings.Population.prepareFloor, original);
});

test("shared registration fixture evaluates the requested script from the loaded ZIP", async () => {
    const zip = {},
        entry = { filename: "Module.js" };
    const context = vm.createContext({
        KDMods: { Spiderlings_test: zip },
        model: {
            getEntries: async (actual) => {
                assert.equal(actual, zip);
                return [entry];
            },
            getURL: async (actual) => {
                assert.equal(actual, entry);
                return "blob:packaged";
            },
        },
        fetch: async (url) => {
            assert.equal(url, "blob:packaged");
            return { ok: true, text: async () => "globalThis.registrations = (globalThis.registrations || 0) + 1;" };
        },
    });
    vm.runInContext(
        fs.readFileSync(path.resolve(__dirname, "../compatibility/browser/normal-helpers.js"), "utf8"),
        context,
    );
    await context.normalAcceptance.registerPackagedScript("Module.js");
    assert.equal(context.registrations, 1);
    await assert.rejects(context.normalAcceptance.registerPackagedScript("Missing.js"), /missing/);
    assert.equal(context.registrations, 1);
});

function crewEnvironment() {
    const map = {
        GridWidth: 10,
        GridHeight: 10,
        Grid:
            Array.from({ length: 10 }, (_, y) =>
                Array.from({ length: 10 }, (_, x) => (x > 0 && x < 9 && y > 0 && y < 9 ? "0" : "1")).join(""),
            ).join("\n") + "\n",
        Entities: [],
        StartPosition: { x: 1, y: 1 },
        EndPosition: { x: 8, y: 8 },
    };
    const context = vm.createContext({
        KDMapData: map,
        KDPlayer: () => ({ x: 1, y: 1 }),
        KDHostile: (actor) => !actor.allied,
        KDAllied: (actor) => !!actor.allied,
        KDIsInParty: (actor) => !!actor.party,
        KDIsImprisoned: (actor) => !!actor.imprisoned,
        KinkyDungeonMovableTilesEnemy: "0",
        KinkyDungeonMapGet: (x, y) => map.Grid.split("\n")[y]?.[x] || "1",
        KinkyDungeonEntityAt: (x, y) => map.Entities.find((actor) => actor.x === x && actor.y === y),
        KinkyDungeonGenNavMap: () => {
            context.navRefreshes = (context.navRefreshes || 0) + 1;
        },
        DialogueCreateEnemy: (x, y, name) => {
            const actor = { id: map.Entities.length + 1, x, y, hp: 10, Enemy: { name } };
            map.Entities.push(actor);
            return actor;
        },
        Spiderlings: {
            SpinnerAI: {
                eligibleSpinner: (actor) =>
                    actor.hp > 0 &&
                    actor.Enemy.name === "Spinner" &&
                    !actor.stun &&
                    !actor.allied &&
                    !actor.party &&
                    !actor.imprisoned,
            },
            FieldProjects: {
                permits: () =>
                    Math.floor(
                        map.Entities.filter(
                            (actor) =>
                                actor.hp > 0 &&
                                actor.Enemy.name === "Spinner" &&
                                !actor.allied &&
                                !actor.party &&
                                !actor.imprisoned,
                        ).length / 4,
                    ),
            },
        },
    });
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../compatibility/browser/normal-helpers.js"), "utf8"),
        context,
    );
    return context;
}

test("crew preparation separates actionable members from permit population and isolates reserves without changing the work map", () => {
    const context = crewEnvironment(),
        { spawn, prepareCrew } = context.normalAcceptance,
        map = context.KDMapData,
        original = map.Grid,
        start = { ...map.StartPosition },
        end = { ...map.EndPosition },
        actors = [spawn("Spinner", 3, 3), spawn("Spinner", 4, 3)];
    spawn("WebCaster", 5, 5);
    const crew = prepareCrew({ actors, fieldPermits: 1 });
    assert.equal(crew.owned.length, 5);
    assert.equal(crew.actors.length, 2);
    assert.equal(crew.actionable.length, 2);
    assert.equal(crew.population.length, 4);
    assert.equal(crew.reserves.length, 2);
    assert.ok(crew.reserves.every((actor) => actor.y > 10 && actor.stun === 10000));
    assert.equal(map.GridWidth, 10);
    assert.equal(map.GridHeight, 13);
    for (let y = 0; y < 10; y++) assert.equal(map.Grid.split("\n")[y].slice(0, 10), original.split("\n")[y]);
    assert.deepEqual(map.StartPosition, start);
    assert.deepEqual(map.EndPosition, end);
    assert.equal(context.navRefreshes, 1);
    assert.equal(crew.reserveArea.original.width, 10);
    assert.equal(context.compatibilityEnvironment.preparations[0].population.length, 4);
    // No implicit top-up when exercising real population loss or natural generation.
    actors[0].hp = 0;
    const after = prepareCrew({ actors });
    assert.equal(after.population.length, 3);
    assert.equal(after.actionable.length, 1);
    assert.equal(after.reserves.length, 2);
    assert.equal(map.GridWidth, 10);
    assert.equal(map.GridHeight, 13);
});

test("authored reserve cells must be disconnected and real permit threshold preparation never adds population", () => {
    for (const count of [0, 3, 4, 8]) {
        const context = crewEnvironment(),
            { spawn, prepareCrew } = context.normalAcceptance;
        const actors = Array.from({ length: count }, (_, index) =>
            spawn("Spinner", 2 + (index % 4), 2 + Math.floor(index / 4)),
        );
        const crew = prepareCrew({ actors });
        assert.equal(crew.population.length, count);
        assert.equal(crew.reserves.length, 0);
        assert.equal(context.KDMapData.GridWidth, 10);
    }
    const context = crewEnvironment(),
        { spawn, prepareCrew } = context.normalAcceptance,
        actors = [spawn("Spinner", 3, 3), spawn("Spinner", 4, 3)];
    assert.throws(
        () =>
            prepareCrew({
                actors,
                fieldPermits: 1,
                reserveCells: [
                    { x: 3, y: 4 },
                    { x: 4, y: 4 },
                ],
            }),
        /disconnected/,
    );
    assert.equal(context.KDMapData.Entities.length, 2);
    assert.equal(context.KDMapData.GridWidth, 10);
    // A tiny authored pocket can be reused without extending or carving the map.
    context.KDMapData.Grid = context.KDMapData.Grid.split("\n")
        .map((line, y) =>
            y === 6 || y === 8
                ? line.slice(0, 5) + "1111" + line.slice(9)
                : y === 7
                  ? line.slice(0, 5) + "1001" + line.slice(9)
                  : line,
        )
        .join("\n");
    const crew = prepareCrew({
        actors,
        fieldPermits: 1,
        reserveCells: [
            { x: 6, y: 7 },
            { x: 7, y: 7 },
        ],
    });
    assert.equal(crew.reserveArea.kind, "authored-isolated-cells");
    assert.equal(context.KDMapData.GridWidth, 10);
    assert.equal(crew.reserves.length, 2);
});

test("native visual phase waiting advances render frames without paying world time or changing visual state", async () => {
    let frames = 0,
        now = 0;
    const bullet = { spriteID: "shot" },
        visual = { alpha: 0 },
        sprite = { texture: { baseTexture: { valid: false } } };
    const context = vm.createContext({
        requestAnimationFrame: (callback) => {
            frames++;
            now += 16;
            if (frames === 4) {
                visual.alpha = 1;
                sprite.texture.baseTexture.valid = true;
            }
            callback();
        },
        performance: { now: () => now },
        KinkyDungeonBulletsVisual: new Map([["shot", visual]]),
        kdpixisprites: new Map([["shot", sprite]]),
        KinkyDungeonAdvanceTime: () => {
            throw Error("visual waits cannot advance world time");
        },
    });
    vm.runInContext(
        fs.readFileSync(path.join(__dirname, "../compatibility/browser/normal-helpers.js"), "utf8"),
        context,
    );
    const selected = await context.normalAcceptance.waitForVisualStage(() => (frames < 2 ? [] : [bullet]));
    assert.equal(selected[0], bullet);
    assert.equal(frames, 4);
    assert.equal(visual.alpha, 1);
    visual.alpha = 0;
    const unfinished = await context.normalAcceptance.waitForVisualStage(() => [bullet]);
    assert.equal(unfinished[0], bullet);
    assert.equal(visual.alpha, 0, "deadline must not fake completion or weaken the caller's strict assertions");
    assert.ok(now >= 12000);
});

test("native locale evidence checks the loaded ZIP, rendered text and placeholders", () => {
    const { inspectLocale } = require("../compatibility/locales.js");
    const csv = 'Label,Du versuchst TargetRestraint.\r\nCounter,"CURRENT/TARGET 路 {count}"\n';
    const loaded = {
        language: "DE",
        csvFile: "SpiderlingsDE.csv",
        csv,
        nativeLoads: [{ language: "DE", matchingSelectedZIPCSV: true }],
        nativeBaseLanguageAvailable: true,
        values: [
            {
                key: "Label",
                english: "You try TargetRestraint.",
                source: "Du versuchst TargetRestraint.",
                rendered: "Du versuchst TargetRestraint.",
            },
            {
                key: "Counter",
                english: "CURRENT/TARGET 路 {count}",
                source: "CURRENT/TARGET 路 {count}",
                rendered: "CURRENT/TARGET 路 {count}",
            },
        ],
    };
    const good = inspectLocale(loaded);
    assert.equal(good.passed, true);
    assert.equal(good.count, 2);
    const stale = inspectLocale({
        ...loaded,
        values: [loaded.values[0], { ...loaded.values[1], rendered: "Counter" }],
    });
    assert.equal(stale.passed, false);
    assert.match(stale.errors.join("\n"), /Counter.*TextGet/);
    assert.equal(inspectLocale({ ...loaded, nativeLoads: [] }).passed, false);
    assert.equal(inspectLocale({ ...loaded, csv: csv + "Label,duplicate\n" }).passed, false);
    const badToken = inspectLocale({
        ...loaded,
        values: [{ ...loaded.values[0], english: "You try TargetRestraint {count}." }, loaded.values[1]],
    });
    assert.equal(badToken.passed, false);
    assert.match(badToken.errors.join("\n"), /Label.*placeholder/);
});

function localeRuntime(game, behavior = {}, events = []) {
    const texts = {};
    const english = {
        KDVersionStr: game.version,
        Label: "You try TargetRestraint.",
        Counter: "CURRENT/TARGET {count}",
    };
    const context = vm.createContext({
        File,
        atob,
        setTimeout,
        Uint8Array,
        TranslationLanguage: "EN",
        KDExecuted: false,
        KDMods: {},
        KDModInfo: {},
        KDModLoadOrder: [],
        KDToggles: { Sound: true },
        Spiderlings: {},
        AvaliableLanguages: ["EN", "CN", "DE", "ES", "JP", "KR", "RU"],
        compatibilityRejections: [],
        compatibilityDiagnostics: [],
        TextLoad: () => events.push({ type: "language", language: context.TranslationLanguage }),
        textProvider: {
            readyAll: async () => {},
            getGroupManager: () => ({ getGroup: () => ({ get: (key) => texts[key] }) }),
        },
        TextGet: (key) =>
            context.TranslationLanguage === behavior.staleLanguage && key === "Counter" ? key : texts[key] || key,
        KDLoadMod: async ([file]) => {
            context.KDMods[file.name] = file;
            context.KDModInfo[file.name] = { modbuild: "fixture" };
        },
        model: {
            getEntries: async () =>
                ["CN", "DE", "ES", "JP", "KR", "PL", "RU"].map((language) => ({
                    filename: `Spiderlings${language}.csv`,
                })),
            getURL: async (entry) => entry.filename,
        },
        fetch: async (filename) => ({
            text: async () => `Label,${filename} TargetRestraint.\r\nCounter,"CURRENT/TARGET {count}"\n`,
        }),
        KDLoadTranslations: (csv) => {
            events.push({ type: "native-csv", language: context.TranslationLanguage });
            for (const line of csv.trim().split(/\r?\n/)) {
                const comma = line.indexOf(",");
                texts[line.slice(0, comma)] = line.slice(comma + 1).replace(/^"(.*)"$/, "$1");
            }
        },
        KDExecuteMods: async () => {
            Object.assign(texts, english);
            if (context.TranslationLanguage !== "EN") {
                const filename = `Spiderlings${context.TranslationLanguage}.csv`;
                context.KDModLoadOrder = [{ fileorder: [filename] }];
                if (context.TranslationLanguage !== behavior.skipLanguage)
                    setTimeout(async () => {
                        if (context.TranslationLanguage === behavior.wrongLanguage) context.TranslationLanguage = "EN";
                        context.KDLoadTranslations(await (await context.fetch(filename)).text());
                    }, 0);
            }
        },
        KinkyDungeonRefreshRestraintsCache() {},
        KinkyDungeonRefreshEnemiesCache() {},
    });
    const evaluate = (fn, argument) => {
        context.testArgument = argument;
        return vm.runInContext(typeof fn === "string" ? fn : `(${fn.toString()})(testArgument)`, context);
    };
    return {
        page: {
            evaluate: async (fn, argument) => evaluate(fn, argument),
            waitForFunction: async (fn) => {
                for (let count = 0; count < 30; count++) {
                    if (evaluate(fn)) return;
                    await new Promise((resolve) => setTimeout(resolve, 1));
                }
                throw Error("Native CSV callback did not finish");
            },
            isClosed: () => false,
        },
        errors: behavior.pageError ? ["fixture native page error"] : [],
        missing: behavior.missingAsset ? ["/Game/Bullets/SpiderlingsMageBolt.png"] : [],
        diagnostics: { events: [] },
        setContext: async (value) => {
            context.compatibilityContext = value;
        },
        settleAssets: async () => {},
        close: async () => {
            events.push({ type: "closed" });
        },
        context,
    };
}

function localePackage(t) {
    const root = path.resolve(__dirname, "../../../.scratch/compatibility-tests");
    fs.mkdirSync(root, { recursive: true });
    const output = fs.mkdtempSync(path.join(root, "locale-"));
    const file = path.join(output, "fixture.zip");
    fs.writeFileSync(file, "native loader fixture");
    t.after(() => {
        assert.ok(fs.realpathSync(output).startsWith(fs.realpathSync(root) + path.sep));
        fs.rmSync(output, { recursive: true, force: true });
    });
    return { file, output };
}

test("package loading defaults to EN and awaits the genuine asynchronous selected CSV callback", async (t) => {
    const { loadPackage } = require("../compatibility/runtime.js");
    const { inspectLocale } = require("../compatibility/locales.js");
    const { file } = localePackage(t),
        events = [];
    const runtime = localeRuntime({ version: "5.5.3" }, {}, events);
    const nativeTranslations = runtime.context.KDLoadTranslations;
    assert.equal((await loadPackage(runtime.page, file)).language, "EN");
    const loaded = await loadPackage(runtime.page, file, { language: "PL" });
    assert.equal(inspectLocale(loaded.locale).passed, true);
    assert.equal(loaded.locale.nativeBaseLanguageAvailable, false);
    assert.equal(events.filter((event) => event.type === "native-csv").length, 1);
    assert.equal(runtime.context.KDLoadTranslations, nativeTranslations);
    assert.deepEqual(
        events.filter((event) => event.type === "language").map((event) => event.language),
        ["PL"],
    );
    const missing = localeRuntime({ version: "5.5.3" }, { skipLanguage: "DE" });
    const missingNative = missing.context.KDLoadTranslations;
    await assert.rejects(loadPackage(missing.page, file, { language: "DE" }), /Native CSV callback/);
    assert.equal(missing.context.KDLoadTranslations, missingNative);
});

test("native locale stage uses fresh instances of the prepared game and fails acceptance on bad text or native errors", async (t) => {
    const { verifyGame } = require("../verify-kd-compatibility.js");
    const { file, output } = localePackage(t);
    const game = {
        version: "5.5.3",
        commit: "prepared-commit",
        mainSha256: "prepared-runtime",
        checkedAt: "prepared-time",
    };
    const selection = selectScenarios(["native-locales"]);
    assert.equal(selection.mode, "partial");
    assert.deepEqual(selection.executed, ["native-locales"]);
    for (const [label, behavior] of [
        ["good", {}],
        ["stale", { staleLanguage: "ES" }],
        ["wrong-language", { wrongLanguage: "ES" }],
        ["native-error", { pageError: true }],
        ["missing-asset", { missingAsset: true }],
    ]) {
        const events = [],
            opened = [];
        const factory = async (prepared, folder) => {
            opened.push({ prepared, folder });
            return localeRuntime(prepared, behavior, events);
        };
        const report = await verifyGame(game, file, path.join(output, label), selection, factory);
        assert.equal(report.status, label === "good" ? "passed" : "failed");
        const result = report.checks.find((entry) => entry.name === "native-locales").result;
        assert.equal(result.records.length, 7);
        assert.equal(opened.length, 7);
        assert.equal(events.filter((event) => event.type === "closed").length, 7);
        for (const { prepared } of opened) assert.equal(prepared, game);
        const saved = JSON.parse(fs.readFileSync(path.join(output, label, "result.json"), "utf8"));
        const savedLocales = saved.checks.find((entry) => entry.name === "native-locales").result;
        for (const entry of savedLocales.records) {
            const evidence = JSON.parse(fs.readFileSync(path.join(output, label, entry.evidence), "utf8"));
            assert.equal(evidence.game.commit, game.commit);
            assert.equal(evidence.game.checkedAt, game.checkedAt);
            assert.equal(evidence.packageSha256, report.packageSha256);
            assert.deepEqual(entry.report, evidence);
            assert.ok(entry.report.loaded.locale.csv.includes("TargetRestraint"));
            assert.equal(entry.report.loaded.locale.nativeLoads[0].matchingSelectedZIPCSV, true);
            assert.equal(
                entry.report.loaded.locale.values[0].source,
                `Spiderlings${entry.language}.csv TargetRestraint.`,
            );
            assert.equal(entry.report.loaded.locale.values[0].rendered, entry.report.loaded.locale.values[0].source);
            assert.deepEqual(entry.report.errors, behavior.pageError ? ["fixture native page error"] : []);
            if (entry.status === "failed") assert.ok(entry.report.error);
        }
        if (label === "stale" || label === "wrong-language") {
            assert.equal(result.records.find((entry) => entry.language === "ES").status, "failed");
            assert.equal(result.records.filter((entry) => entry.status === "passed").length, 6);
        }
    }
});

function scenarioRuntimes(actions, behavior = {}) {
    const instances = [],
        lifecycle = [],
        sources = new Set(
            selectScenarios()
                .checks.filter((check) => check.file)
                .map((check) => fs.readFileSync(path.join(__dirname, "../compatibility/browser", check.file), "utf8")),
        ),
        helper = fs.readFileSync(path.join(__dirname, "../compatibility/browser/normal-helpers.js"), "utf8");
    const factory = async (game, folder) => {
        const runtime = localeRuntime(game),
            { context, page } = runtime,
            evaluate = page.evaluate,
            close = runtime.close;
        instances.push(runtime);
        lifecycle.push(`open:${path.basename(folder)}`);
        Object.assign(context, {
            settings: { pink: false },
            performance: { now: () => 1 },
            renderer: { render: () => "native" },
            nativeHook: () => "native",
            compatibilitySetSeed: (seed) => {
                context.compatibilityContext.seed = seed;
            },
        });
        page.evaluate = async (fn, argument) => {
            if (fn === helper) {
                runtime.helperLoads = (runtime.helperLoads || 0) + 1;
                if (behavior.helperFailure) throw Error("helper preparation failed");
            } else if (sources.has(fn)) {
                const name = context.compatibilityContext.scenario;
                return (await actions[name]?.(context, runtime)) || { fixture: name };
            }
            if (
                behavior.diagnosticFailure &&
                typeof fn === "function" &&
                fn.toString().includes("compatibilityDiagnostics")
            )
                throw Error("diagnostic collection failed");
            return evaluate(fn, argument);
        };
        page.screenshot = async () => {};
        runtime.close = async () => {
            lifecycle.push(`close:${path.basename(folder)}`);
            await close();
            runtime.closed = true;
            if (behavior.teardownFailure) throw Error("teardown failed");
        };
        return runtime;
    };
    return { factory, instances, lifecycle };
}

test("independent state groups get fresh settings, hooks, clock and renderer while real continuations share state", async (t) => {
    const { verifyGame } = require("../verify-kd-compatibility.js"),
        { file, output } = localePackage(t),
        game = { version: "5.4.92" };
    const fresh = (context) => {
        assert.equal(context.settings.pink, false);
        assert.equal(context.nativeHook(), "native");
        assert.equal(context.performance.now(), 1);
        assert.equal(context.renderer.render(), "native");
        assert.equal(context.contest, undefined);
        assert.equal(context.runeTarget, undefined);
    };
    const runs = scenarioRuntimes({
        "spinner-inside": (context) => {
            fresh(context);
            context.contest = { source: 42 };
            context.settings.pink = true;
            context.performance.now = () => 650;
            context.renderer.render = () => "fixture";
            context.nativeHook = () => "fixture";
        },
        "capture-reload": (context) => {
            assert.equal(context.contest.source, 42);
            context.contest.reloaded = true;
        },
        "spinner-art": (context) => {
            assert.equal(context.contest.reloaded, true);
            assert.equal(context.settings.pink, true);
        },
        webcaster: (context) => {
            fresh(context);
            assert.ok(context.normalAcceptance.waitForVisualStage);
        },
        "rune-hit": (context) => {
            fresh(context);
            context.runeTarget = { id: 73 };
        },
        "target-overlay": (context) => {
            assert.equal(context.runeTarget.id, 73);
        },
        "native-escape": (context) => {
            fresh(context);
            context.settings.pink = true;
        },
        "player-recovery": fresh,
    });
    const selection = selectScenarios([
        "spinner-art",
        "capture-reload",
        "webcaster",
        "target-overlay",
        "native-escape",
        "player-recovery",
    ]);
    const report = await verifyGame(game, file, output, selection, runs.factory);
    assert.equal(report.status, "passed");
    assert.deepEqual(
        report.checks.map((check) => check.name),
        selection.executed,
    );
    assert.deepEqual(
        report.groups.map((group) => group.id),
        ["spinner-inside", "webcaster", "rune-hit", "native-escape", "player-recovery"],
    );
    assert.equal(runs.instances.length, 5);
    assert.ok(runs.instances.every((runtime) => runtime.closed));
    assert.deepEqual(
        runs.instances.map((runtime) => runtime.helperLoads || 0),
        [0, 1, 0, 1, 1],
    );
    assert.deepEqual(
        runs.lifecycle,
        report.groups.flatMap((group) => [`open:${group.id}`, `close:${group.id}`]),
    );
    for (const group of report.groups) {
        const saved = JSON.parse(fs.readFileSync(path.join(output, "groups", group.id, "result.json"), "utf8"));
        assert.equal(saved.loaded.packageSha256, report.packageSha256);
        assert.equal(saved.status, "passed");
    }
});

test("scene, helper, native diagnostic and teardown failures retain group attribution and close the runtime", async (t) => {
    const { verifyGame } = require("../verify-kd-compatibility.js"),
        { file, output } = localePackage(t),
        selection = selectScenarios(["native-escape", "player-recovery"]);
    for (const [label, actions, behavior, failedCheck] of [
        [
            "scene",
            {
                "native-escape": () => {
                    throw Error("scene failed");
                },
            },
            {},
            "native-escape",
        ],
        [
            "native-error",
            { "native-escape": (_context, runtime) => runtime.errors.push("native scene error") },
            {},
            "native-escape",
        ],
        ["helper", {}, { helperFailure: true }, "helper:normal-helpers.js"],
        ["diagnostics", {}, { diagnosticFailure: true }, "diagnostics"],
        ["teardown", {}, { teardownFailure: true }, "teardown"],
        [
            "scene-and-diagnostics",
            {
                "native-escape": () => {
                    throw Error("primary scene failed");
                },
            },
            { diagnosticFailure: true },
            "native-escape",
        ],
    ]) {
        const runs = scenarioRuntimes(actions, behavior);
        const report = await verifyGame({ version: "5.4.92" }, file, path.join(output, label), selection, runs.factory);
        assert.equal(report.status, "failed", label);
        assert.equal(report.failedGroup, "native-escape", label);
        assert.equal(report.failedCheck, failedCheck, label);
        assert.equal(runs.instances.length, 1, "failed groups must not continue into later scenes");
        assert.equal(runs.instances[0].closed, true, label);
        if (label.startsWith("scene")) assert.equal(report.failureTrace.context.scenario, "native-escape");
        if (label === "scene-and-diagnostics") {
            assert.match(report.error, /primary scene failed/);
            assert.match(report.groups[0].diagnosticError, /diagnostic collection failed/);
        }
    }
});

test("full acceptance still runs all 60 checks and seven native languages against one ZIP", async (t) => {
    const { verifyGame } = require("../verify-kd-compatibility.js"),
        { file, output } = localePackage(t),
        runs = scenarioRuntimes({}),
        selection = selectScenarios();
    const report = await verifyGame({ version: "5.4.92" }, file, output, selection, runs.factory);
    assert.equal(report.status, "passed");
    assert.equal(report.verification.mode, "full");
    assert.equal(report.checks.length, 60);
    assert.deepEqual(
        report.checks.map((check) => check.name),
        selection.executed,
    );
    assert.ok(report.checks.every((check) => check.status === "passed"));
    for (const group of report.groups.filter((entry) => entry.loaded))
        assert.equal(group.loaded.packageSha256, report.packageSha256);
    const locales = report.checks.find((check) => check.name === "native-locales").result.records;
    assert.deepEqual(
        locales.map((entry) => entry.language),
        ["CN", "DE", "ES", "JP", "KR", "PL", "RU"],
    );
    assert.ok(
        locales.every((entry) => entry.status === "passed" && entry.report.packageSha256 === report.packageSha256),
    );
    assert.ok(runs.instances.every((runtime) => runtime.closed));
    assert.equal(runs.instances.length, report.groups.length - 1 + 7);
});

test("selection separates code helpers from state continuation and preserves all release checks", () => {
    const escape = selectScenarios(["native-escape"]);
    assert.equal(escape.mode, "partial");
    assert.deepEqual(escape.executed, ["native-escape"]);
    assert.deepEqual(escape.checks[0].helpers, ["normal-helpers.js"]);
    assert.deepEqual(selectScenarios(["spinner-art"]).executed, ["spinner-inside", "spinner-art"]);
    assert.deepEqual(selectScenarios(["target-overlay"]).executed, ["rune-hit", "target-overlay"]);
    const combined = selectScenarios(["native-escape", "player-recovery", "native-escape"]);
    assert.deepEqual(combined.executed, ["native-escape", "player-recovery"]);
    assert.equal(stateGroups(combined.checks).length, 2);
    const full = selectScenarios();
    assert.equal(full.mode, "full");
    assert.equal(full.total, full.executed.length);
    assert.equal(full.total, 60);
    assert.equal(full.checks.find((scenario) => scenario.name === "native-locales").kind, "locales");
    for (const scenario of full.checks) {
        if (scenario.kind === "locales") continue;
        const source = fs.readFileSync(path.join(__dirname, "../compatibility/browser", scenario.file), "utf8");
        if (scenario.name !== "normal-helpers" && source.includes("globalThis.normalAcceptance"))
            assert.ok(scenario.helpers.includes("normal-helpers.js"));
        for (const dependency of scenario.continues)
            assert.ok(full.executed.indexOf(dependency) < full.executed.indexOf(scenario.name));
    }
    const groups = stateGroups(full.checks);
    assert.deepEqual(
        groups.find((group) => group.id === "spinner-inside").checks.map((check) => check.name),
        ["spinner-inside", "capture-reload", "spinner-art"],
    );
    assert.deepEqual(
        groups.find((group) => group.id === "rune-hit").checks.map((check) => check.name),
        ["rune-hit", "target-overlay"],
    );
    assert.deepEqual(
        groups.find((group) => group.id === "webcaster").checks.map((check) => check.name),
        ["webcaster"],
    );
});

test("scenario argument errors fail before preparation and explicit full selection remains partial", () => {
    assert.throws(() => parseArguments(["--scenario", "typo"]), /Unknown scenario/);
    assert.throws(() => parseArguments(["--scenario", "--package", "file.zip"]), /incomplete/);
    assert.throws(() => parseArguments(["--scenario", "native-escape,"]), /Unknown scenario/);
    assert.throws(() => parseArguments(["--prepare-only", "--scenario", "basic"]), /cannot run/);
    assert.deepEqual(parseArguments(["--scenario", "native-escape,spinner-work"]).scenarios, [
        "native-escape",
        "spinner-work",
    ]);
    assert.equal(selectScenarios(selectScenarios().executed).mode, "partial");
    assert.equal(parseArguments(["--list-scenarios"]).list, true);
});

test("late resource failures keep the initiating scene and seed and await response-body completion", () => {
    const diagnostics = createDiagnostics(),
        request = {};
    diagnostics.setContext({ scenario: "hunting-grounds", seed: "hunt-2" });
    diagnostics.startRequest(request, "http://localhost/Models/Gothic/HemLowerBack.png", "image");
    diagnostics.setContext({ scenario: "debug-stairs", seed: "stairs-1" });
    diagnostics.response(request, 404);
    assert.equal(diagnostics.pendingAssets().length, 1);
    assert.equal(diagnostics.events[0].scenario, "hunting-grounds");
    assert.equal(diagnostics.events[0].seed, "hunt-2");
    assert.equal(diagnostics.events[0].status, 404);
    diagnostics.finishRequest(request);
    assert.equal(diagnostics.pendingAssets().length, 0);
    const failed = {};
    diagnostics.startRequest(failed, "http://localhost/asset.png", "image");
    diagnostics.finishRequest(failed, { error: "net::ERR_FAILED" });
    assert.equal(diagnostics.events[1].error, "net::ERR_FAILED");
});

test("browser rejection diagnostics retain Event resource URLs and seed changes", () => {
    const handlers = {},
        messages = [],
        seeds = [];
    const context = vm.createContext({
        window: {
            addEventListener: (name, callback) => {
                handlers[name] = callback;
            },
        },
        localStorage: { setItem() {} },
        console: { debug: (message) => messages.push(message) },
        KDsetSeed: (seed) => seeds.push(seed),
    });
    vm.runInContext(`(${browserDiagnostics.toString()})()`, context);
    context.compatibilityContext = { scenario: "hunting-grounds", seed: null };
    context.compatibilitySetSeed("hunt-7");
    handlers.unhandledrejection({
        reason: { target: { currentSrc: "http://localhost/missing.png" }, toString: () => "[object Event]" },
    });
    const entry = context.compatibilityDiagnostics[0];
    assert.equal(entry.scenario, "hunting-grounds");
    assert.equal(entry.seed, "hunt-7");
    assert.equal(entry.url, "http://localhost/missing.png");
    assert.equal(entry.message, "[object Event]");
    assert.deepEqual(seeds, ["hunt-7"]);
    assert.ok(messages[0].startsWith("SpiderlingsCompatibilityContext:"));
});

test("upstream sync follows new commits even when the gameplay version does not change, preserving local edits", () => {
    const parent = path.resolve(__dirname, "../../../.scratch/compatibility-tests");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "sync-"));
    const source = path.join(root, "official"),
        cache = path.join(root, "cache");
    fs.mkdirSync(source);
    git(source, "init", "-b", "5.5");
    const writeVersion = () => {
        const file = path.join(source, "Screens/MiniGame/KinkyDungeon/Text_KinkyDungeon.csv");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'KDVersionStr,"5.5.3"\n');
    };
    const commit = () => {
        git(source, "add", ".");
        git(
            source,
            "-c",
            "user.name=Compatibility test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-m",
            "fixture",
        );
        return git(source, "rev-parse", "HEAD");
    };
    writeVersion();
    fs.writeFileSync(path.join(source, "behavior.txt"), "first\n");
    const first = commit();
    const initial = syncUpstream(cache, source);
    assert.equal(initial.commit, first);
    assert.equal(gameVersion(initial.root), "5.5.3");
    assert.equal(syncUpstream(cache, source).updated, false);
    fs.writeFileSync(path.join(source, "behavior.txt"), "second\n");
    const second = commit();
    const updated = syncUpstream(cache, source);
    assert.equal(updated.commit, second);
    assert.equal(updated.previousCommit, first);
    assert.equal(updated.updated, true);
    assert.equal(fs.readFileSync(path.join(updated.root, "behavior.txt"), "utf8").trim(), "second");
    fs.writeFileSync(path.join(updated.root, "behavior.txt"), "local work\n");
    assert.throws(() => syncUpstream(cache, source), /local changes/);
    assert.equal(fs.readFileSync(path.join(updated.root, "behavior.txt"), "utf8"), "local work\n");
    assert.throws(() => syncUpstream(cache, source + "-different"), /different origin/);
});
