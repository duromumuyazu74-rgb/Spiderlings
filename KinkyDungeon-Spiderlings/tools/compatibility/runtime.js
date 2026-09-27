"use strict";
/* global KDLoadMod, KDExecuteMods, Spiderlings,
          KinkyDungeonRefreshRestraintsCache, KinkyDungeonRefreshEnemiesCache, TextGet */

const fs = require("node:fs/promises");
const path = require("node:path");
const { createServer } = require("node:http");
const { chromium } = require("playwright");

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
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("response", (response) => {
            if (response.status() === 404) missing.push(new URL(response.url()).pathname);
        });
        await page.addInitScript(
            `globalThis.compatibilityRejections = []; window.addEventListener('unhandledrejection', e => compatibilityRejections.push(e.reason?.message || String(e.reason))); localStorage.setItem('KDResolution', '10'); localStorage.setItem('PlayerName', 'Spiderlings compatibility');`,
        );
        await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
            `typeof KDLoadMod === 'function' && typeof KDExecuteMods === 'function' && typeof window.zip?.ZipWriter === 'function' && KDLoadingFinished && ['Intro','Menu','CConsent','Consent'].includes(KinkyDungeonState)`,
        );
        return {
            page,
            errors,
            missing,
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

async function loadPackage(page, filename) {
    const base64 = (await fs.readFile(filename)).toString("base64");
    await page.evaluate("KDExecuted = false; TranslationLanguage = 'EN';");
    return page.evaluate(
        async ({ base64, filename }) => {
            await KDLoadMod([
                new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], filename, {
                    type: "application/zip",
                }),
            ]);
            await KDExecuteMods();
            await Spiderlings.loadSpiderlingsTextureAtlases?.();
            await Spiderlings.preloadSpiderlingsDisplacementTextures?.(true);
            KinkyDungeonRefreshRestraintsCache();
            KinkyDungeonRefreshEnemiesCache();
            return { version: TextGet("KDVersionStr") };
        },
        { base64, filename: path.basename(filename) },
    );
}

module.exports = { createRuntime, loadPackage };
