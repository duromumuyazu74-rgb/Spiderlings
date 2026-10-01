"use strict";
/* global KDMapData */

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { remote, branch, hash, git, gameVersion, syncUpstream, compile } = require("./compatibility/prepare.js");
const { createRuntime, loadPackage } = require("./compatibility/runtime.js");
const { selectScenarios, parseArguments } = require("./compatibility/scenarios.js");
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

async function verifyLocales(game, packagePath, output, packageSha256, runtimeFactory) {
    const records = [];
    for (const language of languages) {
        const folder = path.join(output, "locales", language);
        fs.mkdirSync(folder, { recursive: true });
        const report = { game, packageSha256, language, status: "failed" };
        let runtime;
        try {
            runtime = await runtimeFactory(game, folder);
            await runtime.setContext({ scenario: `native-locales:${language}`, seed: null });
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
            report.errors = runtime?.errors;
            report.missing = runtime?.missing;
            if (runtime && !runtime.page.isClosed())
                report.diagnostics = [
                    ...runtime.diagnostics.events,
                    ...(await runtime.page.evaluate(() => globalThis.compatibilityDiagnostics)),
                ];
            await runtime?.close();
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

async function verifyGame(game, packagePath, output, selection = selectScenarios(), runtimeFactory = createRuntime) {
    fs.mkdirSync(output, { recursive: true });
    const { checks, ...verification } = selection;
    const report = { game, packageSha256: hash(packagePath), verification, checks: [] };
    let runtime, currentCheck;
    try {
        runtime = await runtimeFactory(game, output);
        const { page } = runtime;
        report.loaded = await loadPackage(page, packagePath);
        assert.equal(report.loaded.packageSha256, report.packageSha256, "ZIP changed during verification.");
        assert.equal(report.loaded.version, game.version);
        await page.evaluate(fs.readFileSync(path.join(__dirname, "escape-text-contract.js"), "utf8"));
        await runtime.setContext({ scenario: "package-loading", seed: null });
        await runtime.settleAssets();
        for (const { name, file, variant, kind } of checks) {
            currentCheck = name;
            await runtime.setContext({ scenario: name, seed: `compatibility-${name}` });
            if (kind === "locales") {
                const result = await verifyLocales(game, packagePath, output, report.packageSha256, runtimeFactory);
                report.checks.push({ name, status: result.status, result });
                fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
                assert.equal(result.status, "passed", "Native locale verification failed; see per-language evidence.");
                continue;
            }
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
                status: "passed",
                result,
                pageErrors: runtime.errors.slice(errorStart),
                missing: runtime.missing.slice(missingStart),
            });
            await page.screenshot({ path: path.join(output, `${name}.png`) });
            fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
            console.log(`${game.version}: ${name} passed`);
        }
        currentCheck = "runtime-errors";
        report.rejections = await page.evaluate("globalThis.compatibilityRejections");
        const errors = [...runtime.errors, ...report.rejections].filter(
            (e) => !e.startsWith("The play() request was interrupted by a call to pause()."),
        );
        assert.deepEqual(errors, []);
        currentCheck = "mod-assets";
        assert.deepEqual(
            runtime.missing.filter((url) => /Spiderlings|SpiderWeb|WebSpray/.test(url)),
            [],
        );
        report.status = "passed";
    } catch (error) {
        report.status = "failed";
        report.error = error.stack;
        report.failedCheck = currentCheck;
        if (runtime && !runtime.page.isClosed())
            report.failureTrace = await runtime.page.evaluate(() => ({
                trace: globalThis.normalTrace,
                context: globalThis.compatibilityContext,
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
        console.error(`${game.version}: ${error.message}`);
    } finally {
        report.errors = runtime?.errors;
        report.missing = runtime?.missing;
        if (runtime && !runtime.page.isClosed())
            report.diagnostics = [
                ...runtime.diagnostics.events,
                ...(await runtime.page.evaluate(() => globalThis.compatibilityDiagnostics)),
            ];
        fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
        await runtime?.close();
    }
    return report;
}

async function main() {
    const options = parseArguments(process.argv.slice(2));
    if (options.list) {
        for (const { name, dependencies } of selectScenarios().checks)
            console.log(`${name}${dependencies.length ? ` (requires ${dependencies.join(", ")})` : ""}`);
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
