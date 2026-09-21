// Scenario walkthrough recorder for the agreed prototype acceptance matrix.
// These are bounded experiments, not native-game combat or balance tests.
/* global SpinnerTopology, prototypeState, document, innerWidth */
import { readFile, writeFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import path from "node:path";
import "./engine.js";

const T = globalThis.SpinnerTopology,
    file = (name) => new URL(name, import.meta.url);
await mkdir(file("evidence"), { recursive: true });
const snapshots = JSON.parse(await readFile(file("native-snapshots.json"), "utf8"));
const report = {
    date: new Date().toISOString(),
    artifactSHA256: createHash("sha256")
        .update(await readFile(file("index.html")))
        .digest("hex"),
    scope: "Topology and disposable browser UI only; no runtime Mod integration",
    walkthroughs: [],
    experiments: [],
    browser: {
        status: "not-run",
        reason: "Set PLAYWRIGHT_MODULE to an external playwright-core entry to run optional browser checks",
        errors: [],
    },
};
function requireFact(ok, message) {
    if (!ok) throw Error(message);
}
function record(s, label, trace) {
    const v = T.inspect(s);
    requireFact(!v.violations.length, `${s.map.id}: illegal occupancy at ${label}`);
    trace.push({
        label,
        turn: s.turn,
        phases: s.fields.map((f) => f.phase),
        target: s.target.pos,
        blocked: v.physicalCells,
        exitReachable: !!v.exitPath.length,
        geometryReady: v.geometryReady,
    });
}
for (const m of [...T.fixedMaps(), ...snapshots.map(T.nativeMap)]) {
    const start = performance.now(),
        s = T.create(m, "spinner-01"),
        trace = [];
    record(s, "initial", trace);
    T.plan(s);
    if (m.overlap) T.overlap(s);
    // Record individual turns to expose invalid intermediate states.
    for (let i = 0; i < 450 && s.fields.length; i++) {
        T.step(s);
        record(s, "build", trace);
        if (s.fields.every((f) => ["ready", "barrier"].includes(f.phase))) break;
    }
    let debugLureVacated = false;
    if (m.kind === "native-generated" && s.fields.some((f) => !["ready", "barrier"].includes(f.phase))) {
        record(s, "waiting-for-fixed-lure", trace);
        requireFact(T.vacateLure(s), `${m.id}: no debug vacancy for fixed lure`);
        debugLureVacated = true;
        record(s, "debug-vacate-lure-no-ai-simulated", trace);
        for (let i = 0; i < 450; i++) {
            T.step(s);
            record(s, "build-after-vacancy", trace);
            if (s.fields.every((f) => ["ready", "barrier"].includes(f.phase))) break;
        }
    }
    if (m.id === "tight") requireFact(!s.fields.length, "Insufficient-space scene must decline a plan");
    else
        requireFact(
            s.fields.length && s.fields.every((f) => ["ready", "barrier"].includes(f.phase)),
            `${m.id}: builders did not reach ready`,
        );
    const prepTurns = s.turn;
    const snapshot = JSON.stringify(s),
        restored = JSON.parse(snapshot);
    T.step(s);
    T.step(restored);
    requireFact(JSON.stringify(s) === JSON.stringify(restored), `${m.id}: replay diverged after state roundtrip`);
    if (s.fields.some((f) => f.type !== "line")) {
        T.enterCore(s);
        record(s, "target-in-core", trace);
        for (let i = 0; i < 120; i++) {
            T.step(s);
            record(s, "sealing", trace);
            if (s.fields.every((f) => f.phase === "sealed")) break;
        }
        requireFact(
            s.fields.every((f) => f.phase === "sealed"),
            `${m.id}: failed to close`,
        );
        requireFact(T.inspect(s).geometryReady && !T.inspect(s).exitPath.length, `${m.id}: closed field leaked`);
        const f = s.fields[0],
            l =
                s.links[
                    f.links.find((id) => {
                        const trial = T.clone(s),
                            edge = trial.links[id];
                        T.attack(trial, edge.cells[Math.floor(edge.cells.length / 2)], 100);
                        return T.inspect(trial).fields.find((v) => v.id === f.id).escapePath.length;
                    }) || f.links[0]
                ],
            p = l.cells[Math.floor(l.cells.length / 2)];
        T.attack(s, p, 100);
        record(s, "inner-edge-broken", trace);
        if (m.nested) {
            requireFact(!T.inspect(s).exitPath.length, "Breaking inner edge must not open intact outer loop");
            const outer = s.fields[1],
                edge =
                    s.links[
                        outer.links.find((id) => {
                            const trial = T.clone(s),
                                e = trial.links[id];
                            T.attack(trial, e.cells[Math.floor(e.cells.length / 2)], 100);
                            return T.inspect(trial).fields.find((v) => v.id === outer.id).escapePath.length;
                        }) || outer.links[0]
                    ];
            T.attack(s, edge.cells[Math.floor(edge.cells.length / 2)], 100);
            record(s, "outer-edge-broken", trace);
        }
        requireFact(
            T.inspect(s)
                .fields.filter((f) => f.inside)
                .every((f) => f.escapePath.length > 0),
            `${m.id}: breached boundary should admit an outside path`,
        );
    }
    const entry = {
        id: m.id,
        kind: m.kind,
        candidates: s.analysis.candidates.length,
        selected: s.analysis.selected?.type || null,
        layers: s.fields.length,
        sharedLinks: T.inspect(s).sharedLinks,
        prebuildTurns: prepTurns,
        debugLureVacated,
        elapsedMs: Math.round(performance.now() - start),
        passed: true,
    };
    report.walkthroughs.push(entry);
    await writeFile(file(`evidence/trace-${m.id}.json`), JSON.stringify(trace, null, 2) + "\n");
    console.log(JSON.stringify(entry));
}
// Concave orthogonal closure, not merely a rectangle in an irregular room.
{
    const s = T.create(T.fixedMaps().find((m) => m.id === "irregular"));
    const c = s.analysis.candidates.find((c) => c.type === "orthogonal");
    requireFact(c, "No orthogonal L candidate");
    T.plan(s, c.id);
    T.settle(s);
    T.enterCore(s);
    T.settle(s);
    requireFact(T.inspect(s).geometryReady && !T.inspect(s).exitPath.length, "L-shaped loop leaked");
    report.experiments.push({ name: "concave-orthogonal-loop", passed: true, vertices: c.vertices });
}
// Independent arithmetic for a known 7-cell horizontal link. Center three cells: .7 + .55 + .7.
{
    const s = T.create(T.fixedMaps().find((m) => m.id === "room"));
    s.fields = [];
    s.links = {
        demo: {
            id: "demo",
            a: "10,5",
            b: "16,5",
            cells: T.segment([10, 5], [16, 5]),
            built: T.segment([10, 5], [16, 5]),
            hp: 20,
            max: 20,
            owners: [],
            cooldown: 0,
        },
    };
    T.attack(s, "13,5", 1, true);
    requireFact(Math.abs(s.links.demo.hp - 18.05) < 1e-8, "AoE per-cell attenuation arithmetic differs");
    report.experiments.push({
        name: "per-cell-aoe",
        expectedDamage: 1.95,
        actualDamage: s.lastDamage[0].damage,
        passed: true,
    });
}
{
    const s = T.create(T.fixedMaps().find((m) => m.id === "overlap"));
    T.plan(s);
    T.overlap(s);
    T.settle(s);
    const linkCount = Object.keys(s.links).length;
    requireFact(
        linkCount === s.fields[0].links.length && Object.values(s.links).every((l) => l.owners.length === 2),
        "Shared geometry duplicated",
    );
    const anchor = s.fields[0].anchors[0];
    T.attack(s, anchor, 2);
    requireFact(
        Object.values(s.links)
            .filter((l) => l.a === anchor || l.b === anchor)
            .every((l) => l.hp === 0),
        "Anchor destruction failed to break incident links",
    );
    report.experiments.push({
        name: "shared-anchor-destruction",
        physicalLinks: linkCount,
        fields: s.fields.length,
        passed: true,
    });
}
{
    const s = T.create(T.fixedMaps().find((m) => m.id === "room"));
    T.plan(s);
    const old = s.fields[0],
        k = s.links[old.links[0]].cells[1];
    s.map.walk = s.map.walk.filter((v) => v !== k);
    T.step(s);
    requireFact(old.retired, "Changed terrain did not invalidate active plan");
    requireFact(!T.inspect(s).violations.length, "Changed terrain produced illegal occupied tile");
    report.experiments.push({
        name: "dynamic-terrain-replan",
        old: old.id,
        new: s.fields.at(-1).id,
        shape: s.fields.at(-1).type,
        passed: true,
    });
}
{
    const s = T.create(T.fixedMaps().find((m) => m.id === "room"));
    T.plan(s);
    T.settle(s);
    for (const a of s.groups[0].actors) a.active = false;
    for (let i = 0; i < 19; i++) T.step(s);
    requireFact(T.solids(s).size > 0, "Ownerless field vanished before 20 turns");
    T.step(s);
    requireFact(T.solids(s).size === 0, "Ownerless field survived 20 turns");
    report.experiments.push({ name: "ownerless-20-turn-boundary", passed: true });
}
if (process.env.PLAYWRIGHT_MODULE) {
    const { chromium } = await import(pathToFileURL(path.resolve(process.env.PLAYWRIGHT_MODULE)).href);
    const browser = await chromium.launch({ headless: true });
    const temporary = await mkdtemp(path.join(tmpdir(), "spinner-prototype-"));
    try {
        const page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
        page.on("pageerror", (err) => report.browser.errors.push(err.message));
        await page.goto(file("index.html").href);
        await page.locator("#plan").click();
        await page.locator("#settle").click();
        await page.locator("#enter").click();
        await page.locator("#settle").click();
        const closed = await page.evaluate(() => SpinnerTopology.inspect(prototypeState));
        requireFact(closed.geometryReady, "Browser controls did not produce closure");
        await page.screenshot({ path: fileURLToPath(file("evidence/desktop.png")), fullPage: true });
        const breach = await page.evaluate(() => {
            const t = SpinnerTopology,
                s = prototypeState;
            const edge = Object.values(s.links).find((link) => {
                const trial = t.clone(s);
                t.attack(trial, link.cells[Math.floor(link.cells.length / 2)], 100);
                return t.inspect(trial).fields.some((field) => field.inside && field.escapePath.length);
            });
            return {
                point: t.point(edge.cells[Math.floor(edge.cells.length / 2)]),
                width: s.map.grid[0].length,
                height: s.map.grid.length,
            };
        });
        await page.locator("#mode").selectOption("attack");
        await page.locator("#damage").fill("100");
        const canvas = await page.locator("#map").boundingBox();
        await page.locator("#map").click({
            position: {
                x: ((breach.point[0] + 0.5) * canvas.width) / breach.width,
                y: ((breach.point[1] + 0.5) * canvas.height) / breach.height,
            },
        });
        requireFact(
            await page.evaluate(() =>
                SpinnerTopology.inspect(prototypeState).fields.some((field) => field.inside && field.escapePath.length),
            ),
            "Browser single-cell damage did not open room boundary",
        );
        await page.getByRole("button", { name: "内外双层", exact: true }).click();
        await page.getByRole("button", { name: "2. 完成预布", exact: true }).click();
        await page.getByRole("button", { name: "3. 入核心并封口", exact: true }).click();
        requireFact(
            await page.evaluate(
                () => SpinnerTopology.inspect(prototypeState).geometryReady && prototypeState.fields.length === 2,
            ),
            "Guided nested closure failed",
        );
        await page.getByRole("button", { name: "4. 破坏内层一边", exact: true }).click();
        requireFact(
            await page.evaluate(() => !SpinnerTopology.inspect(prototypeState).exitPath.length),
            "Inner breach unexpectedly opened intact outer field",
        );
        // Exercise a guided reset, shared ownership and file save/restore without a server.
        await page.getByRole("button", { name: "重叠与破网", exact: true }).click();
        await page.getByRole("button", { name: "2. 建立共享计划", exact: true }).click();
        requireFact(
            await page.evaluate(() => SpinnerTopology.inspect(prototypeState).sharedLinks > 0),
            "Guided shared plan failed",
        );
        const downloadPromise = page.waitForEvent("download");
        await page.locator("#export").click();
        const downloaded = await downloadPromise;
        const stateFile = path.join(temporary, "browser-export.json");
        await downloaded.saveAs(stateFile);
        const before = await page.evaluate(() => JSON.stringify(prototypeState));
        await page.locator("#step").click();
        await page.locator("#stateFile").setInputFiles(stateFile);
        await page.waitForFunction(() => document.getElementById("notice").textContent.includes("已恢复"));
        requireFact(
            (await page.evaluate(() => JSON.stringify(prototypeState))) === before,
            "Browser restore changed state",
        );
        await page.getByRole("button", { name: "4. 破坏共享锚点", exact: true }).click();
        requireFact(
            await page.evaluate(() => {
                const s = prototypeState,
                    anchor = s.fields[0].anchors[0];
                return Object.values(s.links)
                    .filter((link) => link.a === anchor || link.b === anchor)
                    .every((link) => link.hp === 0 && link.owners.length === 2);
            }),
            "Browser shared-anchor damage failed",
        );
        await page.getByRole("button", { name: "真实地图占位等待", exact: true }).click();
        await page.getByRole("button", { name: "2. 施工到占位等待", exact: true }).click();
        requireFact(
            await page.evaluate(() => prototypeState.fields[0].phase === "preparing"),
            "Fixed lure fixture did not wait",
        );
        await page.getByRole("button", { name: "3. 调试移开固定诱饵", exact: true }).click();
        await page.getByRole("button", { name: "4. 继续合法施工", exact: true }).click();
        requireFact(
            await page.evaluate(() => prototypeState.fields[0].phase === "barrier"),
            "Vacating lure did not resume construction",
        );
        await page.getByRole("button", { name: "内部地形变化", exact: true }).click();
        await page.getByRole("button", { name: "1. 重置并规划", exact: true }).click();
        await page.getByRole("button", { name: "2. 内部空格改墙", exact: true }).click();
        await page.getByRole("button", { name: "3. 下一施工行动验证", exact: true }).click();
        requireFact(
            await page.evaluate(() => prototypeState.fields[0].retired && prototypeState.fields.at(-1).type === "line"),
            "Interior edit did not retire invalid field",
        );
        await page.setViewportSize({ width: 390, height: 844 });
        await page.screenshot({ path: fileURLToPath(file("evidence/mobile.png")), fullPage: true });
        report.browser.mobileNoHorizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
        );
        requireFact(report.browser.mobileNoHorizontalOverflow, "Mobile page has horizontal overflow");
        requireFact(!report.browser.errors.length, "Browser JS errors");
        report.browser = {
            ...report.browser,
            status: "passed",
            reason: undefined,
            offline: true,
            guidedShared: true,
            stateRoundtrip: true,
            desktopClosure: true,
            roomBreach: true,
            nestedClosure: true,
            sharedDamage: true,
            fixedLureVacancy: true,
            interiorInvalidation: true,
        };
    } finally {
        await browser.close();
        await rm(temporary, { recursive: true, force: true });
    }
}
report.passed = report.walkthroughs.every((r) => r.passed) && report.experiments.every((r) => r.passed);
await writeFile(file("evidence/verification.json"), JSON.stringify(report, null, 2) + "\n");
console.log("VERIFICATION", report.passed);
