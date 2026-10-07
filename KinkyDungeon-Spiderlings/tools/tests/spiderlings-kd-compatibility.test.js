"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { git, gameVersion, syncUpstream } = require("../compatibility/prepare.js");
const vm = require("node:vm");
const { selectScenarios, parseArguments } = require("../compatibility/scenarios.js");
const { createDiagnostics, browserDiagnostics } = require("../compatibility/diagnostics.js");

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

test("native locale evidence checks the loaded ZIP, rendered text and placeholders", () => {
    const { inspectLocale } = require("../compatibility/locales.js");
    const csv = 'Label,Du versuchst TargetRestraint.\r\nCounter,"CURRENT/TARGET · {count}"\n';
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
                english: "CURRENT/TARGET · {count}",
                source: "CURRENT/TARGET · {count}",
                rendered: "CURRENT/TARGET · {count}",
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
        assert.equal(opened.length, 8);
        assert.equal(events.filter((event) => event.type === "closed").length, 8);
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

test("selected scenes include their actual dependencies and preserve full-run ordering", () => {
    const escape = selectScenarios(["native-escape"]);
    assert.equal(escape.mode, "partial");
    assert.deepEqual(escape.executed, ["normal-helpers", "native-escape"]);
    assert.deepEqual(selectScenarios(["spinner-art"]).executed, ["spinner-inside", "spinner-art"]);
    assert.deepEqual(selectScenarios(["target-overlay"]).executed, ["rune-hit", "target-overlay"]);
    const combined = selectScenarios(["native-escape", "player-recovery", "native-escape"]);
    assert.equal(combined.executed.filter((name) => name === "normal-helpers").length, 1);
    const full = selectScenarios();
    assert.equal(full.mode, "full");
    assert.equal(full.total, full.executed.length);
    assert.equal(full.checks.find((scenario) => scenario.name === "native-locales").kind, "locales");
    for (const scenario of full.checks) {
        if (scenario.kind === "locales") continue;
        const source = fs.readFileSync(path.join(__dirname, "../compatibility/browser", scenario.file), "utf8");
        if (scenario.name !== "normal-helpers" && source.includes("globalThis.normalAcceptance"))
            assert.ok(scenario.dependencies.includes("normal-helpers"));
        for (const dependency of scenario.dependencies)
            assert.ok(full.executed.indexOf(dependency) < full.executed.indexOf(scenario.name));
    }
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
