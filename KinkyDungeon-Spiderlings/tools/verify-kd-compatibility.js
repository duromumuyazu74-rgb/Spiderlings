"use strict";

const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { remote, branch, hash, git, gameVersion, syncUpstream, compile } = require("./compatibility/prepare.js");
const { createRuntime, loadPackage } = require("./compatibility/runtime.js");
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

async function verifyGame(game, packagePath, output) {
    fs.mkdirSync(output, { recursive: true });
    const report = { game, packageSha256: hash(packagePath), checks: [] };
    let runtime;
    try {
        runtime = await createRuntime(game, output);
        const { page } = runtime;
        report.loaded = await loadPackage(page, packagePath);
        assert.equal(report.loaded.version, game.version);
        const checks = [
            ["basic", "basic.js"],
            ["wall", "wall.js"],
            ["spinner-outside", "spinner.js", "outside"],
            ["spinner-inside", "spinner.js", "inside"],
            ["spinner-art", "spinner-art.js"],
            ["webcaster", "webcaster.js"],
            ["rune-hit", "01-rune-hit.js"],
            ["target-overlay", "02-target-overlay.js"],
            ["orphan-spray", "orphan-spray.js"],
            ["friendly-mage", "friendly-mage.js"],
            ["hidden-wrapping", "hidden-wrapping.js"],
            ["nest-weights", "nest-weights.js"],
            ["squad-perk", "squad-perk.js"],
            ["mage-body", "mage-body.js"],
            ["weapons", "weapons.js"],
            ["owned-effects", "owned-effects.js"],
        ];
        for (const [name, file, scenario] of checks) {
            if (scenario)
                await page.evaluate((value) => {
                    globalThis.spinnerScenario = value;
                }, scenario);
            const result = await page.evaluate(
                fs.readFileSync(path.join(__dirname, "compatibility/browser", file), "utf8"),
            );
            if (result.images) {
                result.imageFiles = [];
                for (const [label, data] of Object.entries(result.images)) {
                    const filename = `${name}-${label}.png`;
                    fs.writeFileSync(path.join(output, filename), Buffer.from(data.split(",")[1], "base64"));
                    result.imageFiles.push(filename);
                }
                delete result.images;
            }
            report.checks.push({ name, status: "passed", result });
            await page.screenshot({ path: path.join(output, `${name}.png`) });
            fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
            console.log(`${game.version}: ${name} passed`);
        }
        report.rejections = await page.evaluate("globalThis.compatibilityRejections");
        const errors = [...runtime.errors, ...report.rejections].filter(
            (e) => !e.startsWith("The play() request was interrupted by a call to pause()."),
        );
        assert.deepEqual(errors, []);
        assert.deepEqual(
            runtime.missing.filter((url) => /Spiderlings|SpiderWeb|WebSpray/.test(url)),
            [],
        );
        report.status = "passed";
    } catch (error) {
        report.status = "failed";
        report.error = error.stack;
        console.error(`${game.version}: ${error.message}`);
    } finally {
        report.errors = runtime?.errors;
        report.missing = runtime?.missing;
        fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2) + "\n");
        await runtime?.close();
    }
    return report;
}

async function main() {
    const args = process.argv.slice(2),
        options = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--prepare-only") options.prepareOnly = true;
        else if (["--baseline", "--cache", "--package"].includes(args[i]) && args[i + 1])
            options[args[i].slice(2)] = args[++i];
        else throw new Error(`Unknown or incomplete argument: ${args[i]}`);
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
        { id: "github", ...latest },
    ];
    const records = [];
    for (const game of games) {
        const result = await verifyGame(game, packagePath, path.join(output, game.id));
        records.push({
            gameVersion: game.version,
            status: result.status,
            scope: "Native ZIP loading, Webbing progression and save/reload, Spinner lure/capture/wall traversal and seven-stage artwork with completion tween/save reload, WebCaster visuals and orphaned hits, Rune impacts and caster ownership, friendly Mage targeting, target overlays and hidden NPC wrapping, saved nest weights, six-member squad perk, Mage body layers, player weapon combat/save/loot and exclusion of the Spinner leash from generic restraint selection",
            evidence: `${game.id}/result.json`,
            limitations: [
                "Controlled native scenarios in Chrome; online deployment, desktop shell, user saves and other Mods are not covered.",
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
    fs.writeFileSync(
        path.join(output, "acceptance.json"),
        JSON.stringify({ schemaVersion: 1, packageSha256, upstream, records }, null, 2) + "\n",
    );
    console.log(`Dual-version compatibility ${status}: ${output}`);
    if (status !== "passed") process.exitCode = 1;
}

if (require.main === module)
    main().catch((error) => {
        console.error(error.stack);
        process.exitCode = 1;
    });
module.exports = { verifyGame };
