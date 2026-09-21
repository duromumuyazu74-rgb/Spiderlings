// Disposable snapshot extractor. Explicit read-only inputs and a separate output directory.
/* global KDLoadingFinished, KinkyDungeonStartNewGame, KDsetSeed, KinkyDungeonCreateMap, KinkyDungeonMapParams,
KDMapData, KinkyDungeonMapGet, KinkyDungeonTilesGet, KinkyDungeonMovableTilesEnemy, TextGet */
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
function required(name) {
    if (!process.env[name]) throw new Error(`Missing ${name}. See README.md snapshot reproduction inputs.`);
    return path.resolve(process.env[name]);
}
const output = required("SNAPSHOT_OUTPUT");
const versions = [
    { version: "5.4.92", root: required("KD54_ROOT"), source: "official-packaged-runtime/out/main.js" },
    {
        version: "5.5.0",
        root: required("KD55_ROOT"),
        bundle: required("KD55_BUNDLE"),
        source: "isolated-compiled-runtime/main.js",
    },
];
const playwrightModule = required("PLAYWRIGHT_MODULE");
const within = (child, parent) => {
    const relative = path.relative(parent, child);
    return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
};
// Reject unsafe output before mkdir, including an existing symlink/junction ancestor.
let existing = output;
const tail = [];
while (true) {
    try {
        existing = await realpath(existing);
        break;
    } catch (error) {
        if (error.code !== "ENOENT") throw error;
        tail.unshift(path.basename(existing));
        existing = path.dirname(existing);
    }
}
const resolvedOutput = path.join(existing, ...tail);
for (const spec of versions) {
    spec.root = await realpath(spec.root);
    spec.bundle = await realpath(spec.bundle || path.join(spec.root, "out/main.js"));
    if (within(resolvedOutput, spec.root))
        throw new Error("SNAPSHOT_OUTPUT must be outside official game directories.");
}
if (within(resolvedOutput, here)) throw new Error("Choose a disposable SNAPSHOT_OUTPUT outside this review baseline.");
const { chromium } = await import(pathToFileURL(playwrightModule).href);
const snapshots = [];
await mkdir(path.join(output, "evidence"), { recursive: true });
for (const spec of versions) {
    const bundle = spec.bundle || path.join(spec.root, "out/main.js");
    const hash = createHash("sha256")
        .update(await readFile(bundle))
        .digest("hex");
    const roots = [spec.root, ...[1, 2, 3, 4, 5].map((n) => path.join(spec.root, "M" + n))].map((p) => path.resolve(p));
    const server = createServer(async (req, res) => {
        const relative = decodeURIComponent(new URL(req.url, "http://localhost").pathname).slice(1) || "index.html";
        const files =
            relative === "out/main.js"
                ? [bundle]
                : relative === "Logo.png"
                  ? [path.join(spec.root, "Backgrounds/Logo.png")]
                  : roots.map((root) => path.resolve(root, relative));
        for (const file of files) {
            if (file !== bundle && !roots.some((root) => file.startsWith(root + path.sep))) continue;
            try {
                const bytes = await readFile(file);
                const mime = {
                    ".js": "application/javascript",
                    ".html": "text/html",
                    ".css": "text/css",
                    ".png": "image/png",
                    ".json": "application/json",
                };
                res.writeHead(200, { "content-type": mime[path.extname(file)] || "application/octet-stream" });
                res.end(bytes);
                return;
            } catch {
                /* Read-only fallback to another asset root. */
            }
        }
        res.writeHead(404).end();
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const browser = await chromium.launch({
        headless: true,
        args: ["--use-angle=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"],
    });
    const errors = [];
    try {
        const page = await browser.newPage();
        page.on("pageerror", (err) => errors.push(err.message));
        await page.addInitScript(() => {
            localStorage.setItem("PlayerName", "Topology snapshot");
            localStorage.setItem("KDResolution", "10");
        });
        await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: "domcontentloaded" });
        await page.waitForFunction(
            () =>
                typeof KDLoadingFinished !== "undefined" &&
                KDLoadingFinished &&
                typeof KinkyDungeonStartNewGame === "function",
            null,
            { timeout: 60000 },
        );
        await page.evaluate(() => {
            KinkyDungeonStartNewGame(false);
            globalThis.KinkyDungeonState = "ModConfig";
        });
        for (let i = 0; i < 3; i++) {
            const seed = "spinner-topology-20260921-" + i;
            const data = await page.evaluate(
                ({ seed }) => {
                    globalThis.MiniGameKinkyDungeonLevel = 3;
                    KDsetSeed(seed);
                    KinkyDungeonCreateMap(
                        KinkyDungeonMapParams.grv,
                        "",
                        "",
                        3,
                        false,
                        false,
                        undefined,
                        { x: 0, y: 3 },
                        false,
                    );
                    const grid = KDMapData.Grid.trimEnd().split("\n");
                    const movable = [],
                        protectedCells = [];
                    for (let y = 0; y < KDMapData.GridHeight; y++)
                        for (let x = 0; x < KDMapData.GridWidth; x++) {
                            const c = KinkyDungeonMapGet(x, y),
                                tile = KinkyDungeonTilesGet(x + "," + y);
                            if (KinkyDungeonMovableTilesEnemy.includes(c)) movable.push([x, y]);
                            const reasons = [];
                            if ("sSH".includes(c)) reasons.push("stairs");
                            if (tile && Object.keys(tile).length) reasons.push("tile-metadata");
                            if (!"012dD".includes(c)) reasons.push("non-floor-feature");
                            if (reasons.length) protectedCells.push({ x, y, reasons });
                        }
                    for (const p of [
                        KDMapData.StartPosition,
                        KDMapData.EndPosition,
                        ...Object.values(KDMapData.ShortcutPositions || {}),
                    ])
                        if (p && Number.isFinite(p.x)) protectedCells.push({ x: p.x, y: p.y, reasons: ["entry-exit"] });
                    return {
                        version: TextGet("KDVersionStr"),
                        seed,
                        grid,
                        movable,
                        protectedCells,
                        start: KDMapData.StartPosition,
                        end: KDMapData.EndPosition,
                        tiles: KDMapData.Tiles,
                        specialAreas: KDMapData.SpecialAreas,
                        roomType: KDMapData.RoomType,
                        entities: KDMapData.Entities.map((e) => ({
                            x: e.x,
                            y: e.y,
                            name: e.Enemy.name,
                            id: e.id,
                            immobile: !!e.Enemy.immobile,
                        })),
                    };
                },
                { seed },
            );
            snapshots.push({
                ...data,
                bundleSHA256: hash,
                source: spec.source,
                mapInputs: { checkpoint: "grv", level: 3, roomType: "", mapMod: "", worldLocation: { x: 0, y: 3 } },
                capturedAt: new Date().toISOString(),
                kind: "native-generated",
                mods: [],
                notes: "Isolated vanilla map generation. All tile metadata conservatively protected; not a complete semantic protection registry.",
            });
            console.log(spec.version, seed, data.grid[0].length, data.grid.length);
        }
    } finally {
        await browser.close();
        await new Promise((resolve) => server.close(resolve));
        await writeFile(
            path.join(output, "evidence", `native-${spec.version}-errors.json`),
            JSON.stringify(errors, null, 2),
        );
    }
}
await writeFile(path.join(output, "native-snapshots.json"), JSON.stringify(snapshots, null, 2));
console.log("Captured", snapshots.length, "native maps.");
