"use strict";
/* global KDLoadMod, KDExecuteMods, Spiderlings,
          KinkyDungeonRefreshRestraintsCache, KinkyDungeonRefreshEnemiesCache, TextGet,
          TranslationLanguage: writable, TextLoad, textProvider, KDToggles,
          KDMods, KDModInfo, KDModLoadOrder, KDLoadTranslations: writable, model, AvaliableLanguages */

const fs = require("node:fs/promises");
const path = require("node:path");
const { createServer } = require("node:http");
const { createHash } = require("node:crypto");
const { chromium } = require("playwright");
const { createDiagnostics, browserDiagnostics } = require("./diagnostics.js");
const { languages } = require("./locales.js");

async function createRuntime(game, output) {
    const roots = [game.overlay, game.root, ...[1, 2, 3, 4, 5].map((n) => path.join(game.root, `M${n}`))]
        .filter(Boolean)
        .map((root) => path.resolve(root));
    const types = {
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
        ".json": "application/json",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".ogg": "audio/ogg",
        ".woff2": "font/woff2",
    };
    const server = createServer(async (request, response) => {
        const relative =
            decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname).replace(/^\//, "") || "index.html";
        for (const root of roots) {
            // The source checkout keeps the menu logo under Backgrounds; deployed builds also expose /Logo.png.
            for (const requested of relative === "Logo.png" ? [relative, "Backgrounds/Logo.png"] : [relative]) {
                const file = path.resolve(root, requested);
                if (!file.startsWith(root + path.sep)) continue;
                try {
                    if (!(await fs.stat(file)).isFile()) continue;
                    const bytes = await fs.readFile(file);
                    response.writeHead(200, {
                        "content-type": types[path.extname(file)] || "application/octet-stream",
                    });
                    response.end(bytes);
                    return;
                } catch {
                    /* Try the next directory belonging to this game version. */
                }
            }
        }
        response.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const temporary = path.join(output, "browser-temp");
    await fs.mkdir(temporary, { recursive: true });
    let browser;
    try {
        browser = await chromium.launch({
            headless: true,
            channel: "chrome",
            env: { ...process.env, TEMP: temporary, TMP: temporary },
            args: ["--enable-webgl", "--ignore-gpu-blocklist"],
        });
        const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
        page.setDefaultTimeout(60000);
        const errors = [],
            missing = [];
        const diagnostics = createDiagnostics();
        page.on("pageerror", (error) => {
            errors.push(error.message);
            diagnostics.record("page-error", { message: error.message, stack: error.stack });
        });
        page.on("console", (message) => {
            const text = message.text();
            if (text.startsWith("SpiderlingsCompatibilityContext:"))
                diagnostics.setContext(JSON.parse(text.slice("SpiderlingsCompatibilityContext:".length)));
        });
        page.on("request", (request) => diagnostics.startRequest(request, request.url(), request.resourceType()));
        page.on("response", (response) => {
            if (response.status() === 404) missing.push(new URL(response.url()).pathname);
            diagnostics.response(response.request(), response.status());
        });
        page.on("requestfinished", (request) => diagnostics.finishRequest(request));
        page.on("requestfailed", (request) =>
            diagnostics.finishRequest(request, { error: request.failure()?.errorText }),
        );
        await page.addInitScript(browserDiagnostics);
        await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
            `typeof KDLoadMod === 'function' && typeof KDExecuteMods === 'function' && typeof window.zip?.ZipWriter === 'function' && KDLoadingFinished && ['Intro','Menu','CConsent','Consent'].includes(KinkyDungeonState)`,
        );
        return {
            page,
            errors,
            missing,
            diagnostics,
            async setContext(context) {
                diagnostics.setContext(context);
                await page.evaluate((value) => {
                    globalThis.compatibilityContext = value;
                }, context);
            },
            async settleAssets() {
                // Resource completion and the following render frames belong to the originating scene.
                const deadline = Date.now() + 15000;
                while (Date.now() < deadline) {
                    await page.evaluate(async () => {
                        for (let i = 0; i < 2; i++)
                            await new Promise((resolve) => globalThis.requestAnimationFrame(resolve));
                    });
                    if (!diagnostics.pendingAssets().length) return;
                }
                throw new Error(`Assets did not settle: ${JSON.stringify(diagnostics.pendingAssets())}`);
            },
            async close() {
                await browser.close();
                await new Promise((resolve) => server.close(resolve));
            },
        };
    } catch (error) {
        await browser?.close();
        await new Promise((resolve) => server.close(resolve));
        throw error;
    }
}

async function loadPackage(page, filename, { language = "EN" } = {}) {
    if (language !== "EN" && !languages.includes(language)) throw new Error(`Unsupported Mod locale: ${language}`);
    const bytes = await fs.readFile(filename);
    const packageSha256 = createHash("sha256").update(bytes).digest("hex");
    try {
        await page.evaluate("KDExecuted = false;");
        const loaded = await page.evaluate(
            async ({ base64, filename, language }) => {
                TranslationLanguage = language;
                if (language !== "EN") {
                    TextLoad();
                    await textProvider.readyAll();
                    KDToggles.Sound = false;
                }
                await KDLoadMod([
                    new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], filename, {
                        type: "application/zip",
                    }),
                ]);
                if (language !== "EN") {
                    const csvFile = `Spiderlings${language}.csv`;
                    const entries = await model.getEntries(KDMods[filename], {});
                    const matching = entries.filter((entry) => entry.filename === csvFile);
                    if (matching.length !== 1) throw new Error(`ZIP must contain exactly one ${csvFile}`);
                    const url = await model.getURL(matching[0], {});
                    const csv = await fetch(url).then((response) => response.text());
                    const keys = csv
                        .replace(/\r\n?/g, "\n")
                        .trim()
                        .split("\n")
                        .map((line) => line.slice(0, line.indexOf(",")));
                    globalThis.compatibilityLocaleLoad = { csvFile, csv, keys, english: {}, nativeLoads: [] };
                    globalThis.compatibilityNativeTranslations = KDLoadTranslations;
                    KDLoadTranslations = function (...args) {
                        const state = globalThis.compatibilityLocaleLoad;
                        const selected = args[0] === state.csv;
                        if (selected) {
                            const source = textProvider.getGroupManager().getGroup("default");
                            state.english = Object.fromEntries(state.keys.map((key) => [key, source.get(key)]));
                        }
                        const result = globalThis.compatibilityNativeTranslations.apply(this, args);
                        state.nativeLoads.push({ language: TranslationLanguage, matchingSelectedZIPCSV: selected });
                        return result;
                    };
                }
                await KDExecuteMods();
                await Spiderlings.loadSpiderlingsTextureAtlases?.();
                await Spiderlings.preloadSpiderlingsDisplacementTextures?.(true);
                KinkyDungeonRefreshRestraintsCache();
                KinkyDungeonRefreshEnemiesCache();
                return {
                    version: TextGet("KDVersionStr"),
                    language: TranslationLanguage,
                    build: KDModInfo[filename]?.modbuild,
                };
            },
            { base64: bytes.toString("base64"), filename: path.basename(filename), language },
        );
        if (language !== "EN") {
            // KDExecuteMods returns before its native CSV FileReader callback finishes.
            await page.waitForFunction(() =>
                globalThis.compatibilityLocaleLoad.nativeLoads.some((entry) => entry.matchingSelectedZIPCSV),
            );
            loaded.locale = await page.evaluate(() => {
                const state = globalThis.compatibilityLocaleLoad;
                const source = textProvider.getGroupManager().getGroup("default");
                return {
                    language: TranslationLanguage,
                    csvFile: state.csvFile,
                    csv: state.csv,
                    nativeLoads: state.nativeLoads,
                    nativeBaseLanguageAvailable: AvaliableLanguages.includes(TranslationLanguage),
                    nativeCSVFiles: KDModLoadOrder.flatMap((mod) =>
                        mod.fileorder.filter((file) => file.endsWith(".csv")),
                    ),
                    values: state.keys.map((key) => ({
                        key,
                        english: state.english[key],
                        source: source.get(key),
                        rendered: TextGet(key),
                    })),
                };
            });
        }
        return { ...loaded, packageSha256 };
    } finally {
        if (language !== "EN" && !page.isClosed())
            await page.evaluate(() => {
                if (globalThis.compatibilityNativeTranslations) {
                    KDLoadTranslations = globalThis.compatibilityNativeTranslations;
                    delete globalThis.compatibilityNativeTranslations;
                }
            });
    }
}

module.exports = { createRuntime, loadPackage };
