"use strict";
/* global KDMapData */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { remote, branch, hash, git, gameVersion, syncUpstream, compile } = require("./compatibility/prepare.js");
const { createRuntime, loadPackage } = require("./compatibility/runtime.js");
const { selectScenarios, stateGroups, parseArguments } = require("./compatibility/scenarios.js");
const { languages, inspectLocale } = require("./compatibility/locales.js");
const repository = path.resolve(__dirname, "../..");

function configured(name) {
    try {
        return git(repository, "config", "--get", name);
    } catch {
        return "";
    }
}

function outside(parent, child) {
    const relative = path.relative(parent, child);
    return path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`);
}

async function finishRuntime(record, runtime) {
    record.errors = runtime?.errors || [];
    record.missing = runtime?.missing || [];
    try {
        if (runtime && !runtime.page.isClosed())
            record.diagnostics = [
                ...runtime.diagnostics.events,
                ...(await runtime.page.evaluate(() => globalThis.compatibilityDiagnostics)),
            ];
    } catch (error) {
        record.diagnosticError = error.stack;
        if (record.status !== "failed") {
            record.status = "failed";
            record.failedCheck = "diagnostics";
            record.error = error.stack;
        }
    } finally {
        try {
            await runtime?.close();
        } catch (error) {
            record.teardownError = error.stack;
            if (record.status !== "failed") {
                record.status = "failed";
                record.failedCheck = "teardown";
                record.error = error.stack;
            }
        }
    }
}

async function checkRuntime(runtime, record) {
    record.rejections = await runtime.page.evaluate("globalThis.compatibilityRejections");
    assert.deepEqual(
        [...runtime.errors, ...record.rejections].filter(
            (error) => !error.startsWith("The play() request was interrupted by a call to pause()."),
        ),
        [],
    );
    assert.deepEqual(
        runtime.missing.filter((url) => /Spiderlings|SpiderWeb|WebSpray/.test(url)),
        [],
    );
}

async function verifyLocales(game, packagePath, output, packageSha256, runtimeFactory) {
    const records = [];
    for (const language of languages) {
        const folder = path.join(output, "locales", language);
        fs.mkdirSync(folder, { recursive: true });
        const report = { game, packageSha256, language, status: "failed" };
        let runtime;
        try {
            runtime = await runtimeFactory(game, folder);
            await runtime.setContext({ group: "native-locales", scenario: `native-locales:${language}`, seed: null });
            report.loaded = await loadPackage(runtime.page, packagePath, { language });
            assert.equal(report.loaded.packageSha256, packageSha256, "ZIP changed during locale verification.");
            assert.equal(report.loaded.version, game.version);
            assert.equal(report.loaded.language, language);
            assert.equal(
                report.loaded.locale.language,
                language,
                "Native CSV callback changed the requested language.",
            );
            report.result = inspectLocale(report.loaded.locale);
            await runtime.settleAssets();
            report.rejections = await runtime.page.evaluate("globalThis.compatibilityRejections");
            assert.deepEqual(
                [...runtime.errors, ...report.rejections].filter(
                    (error) => !error.startsWith("The play() request was interrupted by a call to pause()."),
                ),
                [],
            );
            assert.deepEqual(
                runtime.missing.filter((url) => /Spiderlings|SpiderWeb|WebSpray/.test(url)),
                [],
            );
            assert.deepEqual(report.result.errors, []);
            report.status = "passed";
        } catch (error) {
            report.error = error.stack;
        } finally {
            await finishRuntime(report, runtime);
            fs.writeFileSync(path.join(folder, "result.json"), JSON.stringify(report, null, 2) + "\n");
        }
        records.push({
            language,
            status: report.status,
            count: report.result?.count,
            evidence: `locales/${language}/result.json`,
            report,
        });
        console.log(`${game.version}: native-locales ${language} ${report.status}`);
    }
    return { status: records.every((record) => record.status === "passed") ? "passed" : "failed", records };
}

async function verifyGroup(game, packagePath, output, group, packageSha256, runtimeFactory, report) {
    const record = { id: group.id, scenarios: group.checks.map((check) => check.name), helpers: group.helpers };
    const folder = path.join(output, "groups", group.id);
    fs.mkdirSync(folder, { recursive: true });
    let runtime,
        currentCheck = "package-loading";
    try {
        runtime = await runtimeFactory(game, folder);
        const { page } = runtime;
        await runtime.setContext({ group: group.id, scenario: currentCheck, seed: null });
        record.loaded = await loadPackage(page, packagePath);
        report.loaded ||= record.loaded;
        assert.equal(record.loaded.packageSha256, packageSha256, "ZIP changed during verification.");
        assert.equal(record.loaded.version, game.version);
        await page.evaluate(fs.readFileSync(path.join(__dirname, "escape-text-contract.js"), "utf8"));
        await runtime.settleAssets();
        await checkRuntime(runtime, record);
        for (const helper of group.helpers) {
            currentCheck = `helper:${helper}`;
            await runtime.setContext({ group: group.id, scenario: currentCheck, seed: null });
            await page.evaluate(fs.readFileSync(path.join(__dirname, "compatibility/browser", helper), "utf8"));
            await runtime.settleAssets();
            await checkRuntime(runtime, record);
        }
        for (const { name, file, variant } of group.checks) {
            currentCheck = name;
            await runtime.setContext({ group: group.id, scenario: name, seed: `compatibility-${name}` });
            await page.evaluate((seed) => globalThis.compatibilitySetSeed(seed), `compatibility-${name}`);
            const errorStart = runtime.errors.length,
                missingStart = runtime.missing.length;
            if (variant)
                await page.evaluate((value) => {
                    globalThis.spinnerScenario = value;
                }, variant);
            const result = await page.evaluate(
                fs.readFileSync(path.join(__dirname, "compatibility/browser", file), "utf8"),
            );
            await runtime.settleAssets();
            await checkRuntime(runtime, record);
            if (result.images) {
                result.imageFiles = [];
                for (const [label, data] of Object.entries(result.images)) {
                    const filename = `${name}-${label}.png`;
                    fs.writeFileSync(path.join(output, filename), Buffer.from(data.split(",")[1], "base64"));
                    result.imageFiles.push(filename);
                }
                delete result.images;
            }
            report.checks.push({
                name,
                group: group.id,
                status: "passed",
                result,
                environment: await page.evaluate(() => globalThis.compatibilityEnvironment),
                pageErrors: runtime.errors.slice(errorStart),
                missing: runtime.missing.slice(missingStart),
            });
            await page.screenshot({ path: path.join(output, `${name}.png`) });
            fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
            console.log(`${game.version}: ${name} passed`);
        }
        await checkRuntime(runtime, record);
        record.status = "passed";
    } catch (error) {
        record.status = "failed";
        record.error = error.stack;
        record.failedCheck = currentCheck;
        try {
            if (runtime && !runtime.page.isClosed())
                record.failureTrace = await runtime.page.evaluate(() => ({
                    trace: globalThis.normalTrace,
                    context: globalThis.compatibilityContext,
                    environment: globalThis.compatibilityEnvironment,
                    entities:
                        typeof KDMapData === "undefined"
                            ? []
                            : KDMapData.Entities.map((actor) => ({
                                  id: actor.id,
                                  name: actor.Enemy?.name,
                                  x: actor.x,
                                  y: actor.y,
                              })),
                }));
        } catch (diagnosticError) {
            record.diagnosticError = diagnosticError.stack;
        }
        console.error(`${game.version}: ${error.message}`);
    } finally {
        await finishRuntime(record, runtime);
        fs.writeFileSync(path.join(folder, "result.json"), JSON.stringify(record, null, 2) + "\n");
    }
    return record;
}

async function verifyGame(game, packagePath, output, selection = selectScenarios(), runtimeFactory = createRuntime) {
    fs.mkdirSync(output, { recursive: true });
    const { checks, ...verification } = selection;
    const report = { game, packageSha256: hash(packagePath), verification, checks: [], groups: [] };
    for (const group of stateGroups(checks)) {
        let record;
        if (group.checks[0].kind === "locales") {
            const result = await verifyLocales(game, packagePath, output, report.packageSha256, runtimeFactory);
            report.checks.push({ name: group.id, group: group.id, status: result.status, result });
            record = { id: group.id, scenarios: [group.id], helpers: [], status: result.status };
            if (result.status !== "passed") {
                record.failedCheck = group.id;
                record.error = "Native locale verification failed; see per-language evidence.";
            }
        } else
            record = await verifyGroup(game, packagePath, output, group, report.packageSha256, runtimeFactory, report);
        report.groups.push(record);
        if (record.status !== "passed") {
            report.status = "failed";
            report.failedGroup = record.id;
            report.failedCheck = record.failedCheck;
            report.error = record.error;
            report.failureTrace = record.failureTrace;
            break;
        }
    }
    report.status ||= "passed";
    report.errors = report.groups.flatMap((group) => group.errors || []);
    report.missing = report.groups.flatMap((group) => group.missing || []);
    report.rejections = report.groups.flatMap((group) => group.rejections || []);
    report.diagnostics = report.groups.flatMap((group) => group.diagnostics || []);
    fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
    return report;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.list) {
        for (const { name, continues, helpers } of selectScenarios().checks)
            console.log(
                `${name}${continues.length ? ` (continues ${continues.join(", ")})` : ""}${helpers.length ? ` (helpers ${helpers.join(", ")})` : ""}`,
            );
        return;
    }
    const baseline = options.baseline || configured("spiderlings.baselineGame");
    const cache = options.cache || configured("spiderlings.compatibilityCache");
    if (![baseline, cache].every((file) => file && path.isAbsolute(file)))
        throw new Error(
            "Set absolute spiderlings.baselineGame and spiderlings.compatibilityCache Git configuration, or pass --baseline and --cache. See docs/DEVELOPMENT.md.",
        );
    const baselineRoot = fs.realpathSync(baseline),
        cacheRoot = path.resolve(cache);
    if (!outside(repository, cacheRoot) || !outside(baselineRoot, cacheRoot))
        throw new Error("Compatibility cache must be outside the Mod checkout and baseline game.");
    assert.equal(gameVersion(baselineRoot), "5.4.92", "Baseline must be exactly KD 5.4.92.");
    console.log(`Checking ${remote} branch ${branch}`);
    const upstream = syncUpstream(cacheRoot);
    console.log(`Using ${upstream.commit}; ${upstream.updated ? "updated" : "unchanged"}`);
    const latest = compile(upstream, cacheRoot);
    fs.writeFileSync(path.join(cacheRoot, "latest.json"), JSON.stringify({ ...upstream, ...latest }, null, 2) + "\n");
    if (options.prepareOnly) return;
    const version = JSON.parse(
        fs.readFileSync(path.join(repository, "KinkyDungeon-Spiderlings/mod.json"), "utf8"),
    ).modbuild;
    const packagePath = path.resolve(options.package || path.join(repository, `Spiderlings_${version}.zip`));
    const packageSha256 = hash(packagePath);
    const output = path.join(cacheRoot, "runs", `${new Date().toISOString().replace(/[:.]/g, "-")}-${version}`);
    fs.mkdirSync(output, { recursive: true });
    const games = [
        {
            id: "baseline",
            root: baselineRoot,
            version: "5.4.92",
            mainSha256: hash(path.join(baselineRoot, "out/main.js")),
        },
        { id: "github", ...upstream, ...latest },
    ];
    const records = [];
    for (const game of games) {
        const result = await verifyGame(game, packagePath, path.join(output, game.id), options.selection);
        records.push({
            gameVersion: game.version,
            status: result.status,
            scope: `${options.selection.mode} native compatibility: ${options.selection.executed.join(", ")}`,
            evidence: `${game.id}/result.json`,
            limitations: [
                "Controlled native scenarios in Chrome; online deployment, desktop shell, user saves and other Mods are not covered.",
                ...(options.selection.mode === "partial"
                    ? ["Selected scenarios only; not full delivery acceptance."]
                    : []),
                ...(game.commit
                    ? [
                          `GitHub ${branch} commit ${game.commit}; TypeScript transpilation does not assert upstream type-check cleanliness.`,
                      ]
                    : []),
            ],
        });
    }
    assert.equal(hash(packagePath), packageSha256, "ZIP changed during verification.");
    const status = records.every((record) => record.status === "passed") ? "passed" : "failed";
    const { checks: _checks, ...verification } = options.selection;
    fs.writeFileSync(
        path.join(output, "acceptance.json"),
        JSON.stringify({ schemaVersion: 1, packageSha256, upstream, verification, records }, null, 2) + "\n",
    );
    console.log(`Dual-version compatibility ${status} (${verification.mode}): ${output}`);
    if (status !== "passed") process.exitCode = 1;
}

if (require.main === module)
    main().catch((error) => {
        console.error(error.stack);
        process.exitCode = 1;
    });
module.exports = { verifyGame };
