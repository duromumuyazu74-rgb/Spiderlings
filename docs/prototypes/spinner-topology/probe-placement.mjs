// Bounded geometry experiments for #22. No native AI, combat or player-save loading.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import vm from "node:vm";
import "./engine.js";

const T = globalThis.SpinnerTopology;
const file = (name) => new URL(name, import.meta.url);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const snapshots = JSON.parse(await readFile(file("native-snapshots.json"), "utf8"));
const report = {
    baselineCommit: "27dca6dce33310c016a4f36037ee3a47936233fe",
    engineSHA256: hash(await readFile(file("engine.js"))),
    snapshotsSHA256: hash(await readFile(file("native-snapshots.json"))),
    templates: "5/7/9 rectangles; one orientation of a 9x9 concave orthogonal template; short narrow-cut lines",
    cases: [],
    nativeMasks: [],
    nativeAccessibility: [],
};
function fact(ok, message) {
    if (!ok) throw Error(message);
}
function record(name, result) {
    report.cases.push({ name, ...result });
}
function scene(id) {
    return T.clone(T.fixedMaps().find((m) => m.id === id));
}
function finish(s) {
    T.settle(s);
    T.enterCore(s);
    T.settle(s);
    fact(T.inspect(s).geometryReady, "Fixture did not close");
}
function prebuilt(s, c, group = s.groups[0]) {
    const f = T.addField(s, c, group);
    for (const id of f.links) s.links[id].built = [...s.links[id].cells];
    for (const k of f.anchors) s.anchors[k].placed = true;
    T.update(s);
    return f;
}
for (const [i, snapshot] of snapshots.entries()) {
    const base = T.nativeMap(snapshot, i),
        origin = base.spawns[0] || base.start;
    const semantic = snapshot.protectedCells
        .filter((p) => p.reasons.some((r) => r !== "tile-metadata"))
        .map((p) => T.key(p.x, p.y));
    const variants = {
        conservative: base,
        noMetadataOnly: { ...base, protected: semantic },
        noOccupancy: { ...base, occupied: [] },
        noMetadataOrOccupancy: { ...base, protected: semantic, occupied: [] },
        allPlacementMasksRemoved: { ...base, protected: [], occupied: [] },
        upperBoundDoorsUnlocked: { ...base, protected: [], occupied: [], locked: [] },
    };
    const rows = {};
    for (const [name, map] of Object.entries(variants)) {
        const a = T.analyze(map, origin, "spinner-01", "g1");
        rows[name] = {
            rectangle: a.candidates.filter((c) => c.type === "rectangle").length,
            orthogonal: a.candidates.filter((c) => c.type === "orthogonal").length,
            line: a.candidates.filter((c) => c.type === "line").length,
            selected: a.selected?.id,
            reasons: a.selected?.reasons,
        };
    }
    const selected = T.analyze(base, origin, "spinner-01", "g1");
    fact(
        selected.selected?.id === T.analyze(T.clone(base), origin, "spinner-01", "g1").selected?.id,
        "Seed replay changed",
    );
    if (i !== 3)
        fact(
            rows.upperBoundDoorsUnlocked.rectangle + rows.upperBoundDoorsUnlocked.orthogonal === 0,
            "Five original fallbacks gained enclosure under relaxed masks",
        );
    report.nativeMasks.push({
        version: snapshot.version,
        seed: snapshot.seed,
        bundleSHA256: snapshot.bundleSHA256,
        rows,
    });
}
{
    const map = scene("room"),
        vertices = [
            [20, 5],
            [24, 5],
            [24, 9],
            [20, 9],
        ];
    const c = T.shape(map, vertices, "rectangle");
    fact(c, "Expected free core");
    const cell = T.key(...c.core);
    fact(!T.shape({ ...map, occupied: [cell] }, vertices, "rectangle"), "Foreign occupant accepted in only 3x3 core");
    fact(
        !T.shape({ ...map, protected: [...map.protected, cell] }, vertices, "rectangle"),
        "Protected interaction accepted in only 3x3 core",
    );
    record("free-3x3-core", { core: c.core, foreignOccupantRejected: true, protectedInteractionRejected: true });
}
{
    const s = T.create(scene("room"));
    T.plan(s);
    const f = s.fields[0],
        cell = f.interior.find((k) => !s.groups[0].actors.some((a) => T.key(...a.pos) === k));
    fact(T.editTerrain(s, cell), "Terrain edit refused");
    fact(
        !T.floor(s.map, ...T.point(cell)) && s.map.grid[T.point(cell)[1]][T.point(cell)[0]] === "#",
        "Grid and traversal diverged",
    );
    fact(!T.inspect(s).geometryReady, "Invalid interior kept capture eligibility");
    T.step(s);
    fact(f.retired && s.fields.at(-1).type === "line", "Interior obstruction did not degrade to line");
    record("interior-terrain-invalidation", {
        cell,
        oldPhase: f.phase,
        replacement: s.fields.at(-1).type,
        logs: s.log.slice(-3),
    });
}
{
    const s = T.create(scene("door"));
    T.plan(s);
    const f = s.fields[0],
        cell = f.anchors[0];
    s.target.pos = T.point(cell);
    for (let i = 0; i < 20; i++) T.step(s);
    fact(!s.anchors[cell].placed, "Target was overwritten");
    s.target.pos = [...s.map.start];
    T.settle(s);
    fact(s.anchors[cell].placed, "Vacated target cell never built");
    const occupied = f.anchors[1];
    s.map.occupied.push(occupied);
    T.step(s);
    fact(f.retired && s.map.occupied.includes(occupied), "Foreign occupancy was deleted or ignored");
    record("target-waits-foreign-occupancy-invalidates", {
        targetCell: cell,
        foreignCell: occupied,
        retired: f.retired,
        replacement: s.fields.at(-1).type,
    });
}
{
    const s = T.create(scene("door"));
    T.plan(s);
    const before = T.clone(s.groups[0].actors[1].pos);
    s.map.occupied.push(...s.map.walk.filter((k) => T.distance(T.point(k), before) === 1));
    for (let i = 0; i < 8; i++) T.step(s);
    fact(JSON.stringify(before) === JSON.stringify(s.groups[0].actors[1].pos), "Blocked builder teleported");
    record("unreachable-builder-waits", { position: before, action: s.groups[0].actors[1].last });
}
{
    const map = scene("nested");
    const routes = [];
    for (const start of [
        [4, 10],
        [26, 10],
        [15, 2],
        [15, 18],
    ]) {
        const a = T.analyze({ ...map, start }, map.spawns[0], "spinner-01", "g1", true);
        const c = a.selected;
        fact(c?.outer && c.entrancePath?.length, "Nested route missing");
        fact(
            c.entrancePath.some((p) => T.key(...p) === c.gate) &&
                c.entrancePath.some((p) => T.key(...p) === c.outer.gate),
            "Approach bypassed a gate",
        );
        fact(
            c.outer.bounds[2] - c.outer.bounds[0] + 1 <= 13 && c.outer.bounds[3] - c.outer.bounds[1] + 1 <= 13,
            "Nested footprint exceeds 13",
        );
        routes.push({ start, innerGate: c.gate, outerGate: c.outer.gate, path: c.entrancePath });
    }
    const s = T.create(map);
    T.plan(s);
    finish(s);
    const inner = s.fields[0],
        l = s.links[inner.links[0]];
    T.attack(s, l.cells[Math.floor(l.cells.length / 2)], 100);
    const v = T.inspect(s);
    fact(
        v.fields[0].escapePath.length && !v.fields[1].escapePath.length && !v.exitPath.length,
        "Inner breach opened outer enclosure",
    );
    record("nested-gates-and-inner-only-breach", { routes, innerEscape: true, outerEscape: false, floorExit: false });
}
{
    const map = scene("room"),
        vertices = [
            [10, 5],
            [14, 5],
            [14, 9],
            [18, 9],
            [18, 13],
            [10, 13],
        ];
    const c = T.shape(map, vertices, "orthogonal");
    fact(c, "Concave fixture unavailable");
    // Isolate the concave notch from the floor exit with ordinary walls, outside the polygon only.
    for (const k of [...map.walk]) {
        const [x, y] = T.point(k);
        if ((y === 5 && x >= 15 && x <= 18) || (x === 18 && y >= 5 && y <= 8))
            map.walk = map.walk.filter((v) => v !== k);
    }
    const s = T.create(map);
    const f = prebuilt(s, c);
    s.target.pos = [13, 7];
    const edge = s.links[f.links[1]];
    T.attack(s, edge.cells[2], 100);
    const v = T.inspect(s);
    fact(v.fields[0].escapePath.length > 0, "Polygon escape incorrectly requires bbox exit");
    fact(!v.exitPath.length, "Isolated notch unexpectedly reaches floor exit");
    record("concave-notch-is-outside-not-floor-exit", { escapePath: v.fields[0].escapePath, floorExit: false });
}
{
    const s = T.create(scene("room"));
    const first = T.shape(
        s.map,
        [
            [10, 5],
            [16, 5],
            [16, 11],
            [10, 11],
        ],
        "rectangle",
    );
    const second = T.shape(
        s.map,
        [
            [13, 5],
            [19, 5],
            [19, 11],
            [13, 11],
        ],
        "rectangle",
    );
    prebuilt(s, first);
    prebuilt(s, second);
    s.target.pos = [14, 8];
    const v = T.inspect(s),
        sharedCell = "14,5";
    const links = Object.values(s.links).filter((l) => l.cells.includes(sharedCell));
    fact(links.length === 2 && !v.geometryReady, "Partial overlap incorrectly captures");
    const before = links.map((l) => l.hp);
    T.attack(s, sharedCell, 1);
    fact(
        links.every((l, i) => l.hp < before[i]),
        "Shared cell damage missed an owner link",
    );
    record("partial-shared-edge", {
        physicalCellInstances: v.solid.filter((k) => k === sharedCell).length,
        captureEligible: v.geometryReady,
        damage: s.lastDamage,
        limitation:
            "Distinct endpoint links retain separate HP. One physical cell is deduplicated and hit forwards to both links; arbitrary partial segments are not normalized into shared HP pieces.",
    });
    const cross = T.create(scene("room"));
    prebuilt(
        cross,
        T.shape(
            cross.map,
            [
                [10, 8],
                [18, 8],
            ],
            "line",
        ),
    );
    prebuilt(
        cross,
        T.shape(
            cross.map,
            [
                [14, 5],
                [14, 12],
            ],
            "line",
        ),
    );
    fact(
        !T.inspect(cross).geometryReady && T.inspect(cross).solid.filter((k) => k === "14,8").length === 1,
        "Crossing lines create capture or duplicate solid",
    );
    T.attack(cross, "14,8", 1);
    fact(cross.lastDamage.length === 2, "Crossing damage missed incident link");
    record("crossing-lines", { geometryReady: false, physicalCrossingInstances: 1, damage: cross.lastDamage });
}
{
    const s = T.create(scene("nested"));
    T.plan(s);
    T.enterCore(s);
    let checked = 0;
    for (let i = 0; i < 250; i++) {
        T.step(s);
        const [inner, outer] = s.fields;
        const outerStarted = outer.anchors.some((k) => s.anchors[k].placed);
        if (outerStarted) {
            fact(inner.phase === "sealed", "Early target bypassed inner-first construction");
            checked++;
            break;
        }
    }
    fact(checked, "Nested fixture never started outer field");
    record("early-entry-preserves-inner-first", { turn: s.turn });
}
{
    const s = T.create(scene("room"));
    T.plan(s);
    T.settle(s);
    const f = s.fields[0],
        l = s.links[f.links[0]],
        cell = l.cells[Math.floor(l.cells.length / 2)];
    f.retired = true;
    s.groups[0].actors.forEach((a, i) => (a.active = i === 1));
    s.groups[0].actors[1].pos = T.point(cell);
    T.attack(s, cell, 0.5);
    const hp = l.hp;
    for (let i = 0; i < 20; i++) T.step(s);
    fact(l.hp === hp, "Retired-only structure repaired");
    record("retired-roadblock-not-repaired", { hpBefore: hp, hpAfter: l.hp });
}
{
    const map = scene("corridor"),
        origin = [2, 9];
    const a = T.analyze(map, origin, "far-floor", "g1");
    const far = a.candidates.find((c) => c.core[0] > 22);
    fact(far?.approachSteps > 10, "Full-floor candidate not reachable beyond local group radius");
    map.locked = ["15,9", "15,10"];
    const blocked = T.analyze(map, origin, "far-floor", "g1");
    fact(
        !blocked.candidates.some((c) => c.core[0] > 16),
        "Unreachable candidates retained behind locked cross-section",
    );
    const s = T.create(scene("room"));
    const chosen = s.analysis.selected.id;
    s.target.pos = [23, 15];
    fact(
        T.analyze(s.map, s.groups[0].actors[0].pos, s.seed, "g1").selected.id === chosen,
        "Selection reads unseen target",
    );
    record("full-floor-reachability-and-unknown-target", {
        far: far.id,
        approachSteps: far.approachSteps,
        lockedBarrierRejected: true,
        targetIndependent: true,
    });
}
{
    const s = T.create(scene("door"));
    T.plan(s);
    T.settle(s);
    fact(!T.inspect(s).exitPath.length, "Single-door blockade failed");
    const edge = Object.values(s.links)[0];
    T.attack(s, edge.cells[1], 100);
    fact(T.inspect(s).exitPath.length, "Single-door breach does not reach exit");
    const tight = T.create(scene("tight"));
    T.plan(tight);
    fact(!tight.fields.length, "Insufficient-space scene must abandon");
    record("sole-exit-blockade-and-insufficient-space", {
        fullBlockadeAllowed: true,
        breachReachesFloorExit: true,
        noPlanInTight: true,
    });
}
{
    const s = T.create(scene("overlap"));
    T.plan(s);
    T.overlap(s);
    T.settle(s);
    s.groups[0].actors.forEach((a) => (a.active = false));
    for (let i = 0; i < 10; i++) T.step(s);
    s.groups[1].actors.forEach((a) => (a.active = false));
    for (let i = 0; i < 19; i++) T.step(s);
    fact(T.solids(s).size, "Shared structure disappeared before last-owner +20");
    T.step(s);
    fact(!T.solids(s).size, "Shared structure survived last-owner +20");
    record("shared-owner-countdown", { firstOwnerLost: 0, lastOwnerLost: 10, stillSolidAt: 29, goneAt: 30 });
}
// Optional isolated native accessibility replay. Supply [{version,path}] through KD_NATIVE_BUNDLES.
// The report keeps hashes and exact versions, never input filesystem paths.
const nativeFixtures = [
    ["diagonal", ["11111", "10111", "11011", "11111"], {}, [1, 1], [2, 2], true],
    ["unlocked-door", ["1111111", "100D001", "1111111"], { "3,1": { Type: "Door" } }, [1, 1], [5, 1], true],
    [
        "locked-open-door",
        ["1111111", "100d001", "1111111"],
        { "3,1": { Type: "Door", Lock: "Red" } },
        [1, 1],
        [5, 1],
        false,
    ],
    ["chest-not-transit", ["1111111", "100C001", "1111111"], {}, [1, 1], [5, 1], false],
];
for (const input of JSON.parse(process.env.KD_NATIVE_BUNDLES || "[]")) {
    const bytes = await readFile(input.path),
        source = bytes.toString();
    const fn = source.match(/^function KinkyDungeonGetAccessible\([^]*?^}/m)?.[0];
    fact(fn, "Native accessibility function not found");
    const expected = snapshots.find((s) => s.version === input.version)?.bundleSHA256;
    fact(hash(bytes) === expected, "Native runtime fingerprint differs from retained snapshot");
    for (const [name, grid, tiles, start, goal, reachable] of nativeFixtures) {
        const enemy = "023wW][?/HB@l;SsRrdzTgLcNVvt5";
        const ctx = {
            KDMapData: { GridWidth: grid[0].length, GridHeight: grid.length },
            KinkyDungeonMapGet: (x, y) => grid[y]?.[x] || "1",
            KinkyDungeonTilesGet: (k) => tiles[k],
            KDInteractableTiles: "OPCAMG$Y+=-F67D" + enemy,
            KinkyDungeonMovableTilesSmartEnemy: "D" + enemy,
        };
        vm.createContext(ctx);
        vm.runInContext(fn, ctx);
        const actual = !!ctx.KinkyDungeonGetAccessible(...start)[T.key(...goal)];
        const map = {
            grid,
            walk: grid.flatMap((r, y) => [...r].flatMap((c, x) => (("D" + enemy).includes(c) ? [T.key(x, y)] : []))),
            locked: Object.entries(tiles)
                .filter(([, v]) => v.Lock)
                .map(([k]) => k),
        };
        const modeled = T.flood(map, start).cells.has(T.key(...goal));
        fact(actual === reachable && modeled === actual, "Native geometry mismatch");
        report.nativeAccessibility.push({
            version: input.version,
            bundleSHA256: hash(bytes),
            name,
            native: actual,
            model: modeled,
        });
    }
}
report.nativeReplay = report.nativeAccessibility.length
    ? "executed-isolated-accessibility"
    : "not-run; set KD_NATIVE_BUNDLES to replay exact external runtimes";
await writeFile(file("evidence/placement.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
    JSON.stringify({
        cases: report.cases.length,
        nativeMaps: report.nativeMasks.length,
        nativeProbes: report.nativeAccessibility.length,
    }),
);
