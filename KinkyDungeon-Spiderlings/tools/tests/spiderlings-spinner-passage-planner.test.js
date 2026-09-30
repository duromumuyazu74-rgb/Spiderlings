"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { modRoot } = require("./helpers/lifecycle-runtime.js");

function rules() {
    const context = { Spiderlings: {} };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.join(modRoot, "SpiderlingsSpinnerPassagePlanner.js"), "utf8"), context);
    return context.Spiderlings.SpinnerPassagePlanner;
}

function ascii(lines) {
    const cells = [],
        entrances = [],
        exits = [];
    for (const [row, line] of lines.entries())
        for (const [column, tile] of [...line].entries()) {
            const x = column + 1,
                y = row + 1;
            cells.push({
                x,
                y,
                tile: tile === "D" ? "D" : tile === "#" ? "1" : "0",
                floor: tile !== "#" && tile !== "D",
                walkable: tile !== "#",
                wall: tile === "#",
                protected: ["S", "E", "D", "L", "P"].includes(tile),
                locked: tile === "L",
            });
            if (tile === "S") entrances.push({ x, y });
            if (tile === "E") exits.push({ x, y });
        }
    return { width: lines[0].length + 2, height: lines.length + 2, cells, entrances, exits };
}

test("one-cell corridor supplies two paid gates and a proved unavoidable route", () => {
    const planner = rules(),
        snapshot = ascii(["###############", "#S...........E#", "###############"]);
    const index = planner.buildIndex(snapshot),
        selected = planner.candidates(index);
    assert.ok(selected.length);
    assert.equal(selected[0].type, "passage");
    assert.equal(selected[0].proof.kind, "mandatory");
    assert.equal(selected[0].proof.detourDistance, null);
    assert.equal(selected[0].gates.length, 2);
    assert.ok(selected[0].nativeWallCells.length);
    assert.ok(index.articulationKeys.size);
    assert.equal(planner.distance(index, snapshot.entrances[0], snapshot.exits[0]), 12);
});

test("two-cell corridors are recognized without inventing single-vertex articulation", () => {
    const planner = rules(),
        snapshot = ascii(["###############", "#S............#", "#............E#", "###############"]);
    const index = planner.buildIndex(snapshot),
        selected = planner.candidates(index);
    assert.equal(index.articulationKeys.size, 0);
    const passage = selected.find((candidate) => candidate.proof.kind === "mandatory");
    assert.ok(passage);
    assert.equal(passage.gates.length, 2);
    assert.ok(passage.gates.every((gate) => gate.cells.length === 2));
});

test("a parallel loop remains a detour rather than a mandatory passage", () => {
    const planner = rules(),
        snapshot = ascii([
            "#################",
            "#S.............E#",
            "#.#############.#",
            "#.#############.#",
            "#...............#",
            "#################",
        ]);
    const selected = planner.candidates(planner.buildIndex(snapshot));
    assert.ok(selected.length);
    assert.ok(selected.every((candidate) => candidate.proof.kind !== "mandatory"));
    assert.ok(
        selected.some(
            (candidate) =>
                candidate.proof.kind === "detour" && candidate.proof.detourDistance > candidate.proof.baselineDistance,
        ),
    );
});

test("T junctions retain three independently closable mouths", () => {
    const planner = rules(),
        snapshot = ascii([
            "###############",
            "#######.#######",
            "#######.#######",
            "#S...........E#",
            "###############",
        ]);
    const selected = planner.candidates(planner.buildIndex(snapshot), { maxCandidates: 24 });
    assert.ok(
        selected.some((candidate) => candidate.gates.length === 3 && candidate.core.x === 8 && candidate.core.y === 4),
    );
});

test("closing a T junction is not proof that open traffic must enter its one-cell interior", () => {
    const planner = rules(),
        snapshot = ascii([
            "###############",
            "#######.#######",
            "#######.#######",
            "#S...........E#",
            "###############",
        ]);
    const selected = planner.candidates(planner.buildIndex(snapshot), { maxCandidates: 24 });
    const junction = selected.find(
        (candidate) =>
            candidate.core.x === 8 &&
            candidate.core.y === 4 &&
            candidate.interiorCells.length === 1 &&
            candidate.gates.length === 3,
    );
    assert.ok(junction);
    assert.equal(junction.proof.blockedGateDistance, null, "The closed mouths do stop all through traffic");
    assert.equal(
        junction.proof.interiorBypassDistance,
        junction.proof.baselineDistance,
        "West-mouth to north-mouth to east-mouth diagonal steps can bypass the open core",
    );
    assert.equal(junction.proof.kind, "local", "A player need not enter the native capture interior");
    assert.equal(junction.proof.detourDistance, junction.proof.baselineDistance);
});

test("door-adjacent fields keep the native door out of their interior and gates", () => {
    const planner = rules(),
        snapshot = ascii(["#################", "#S.....D.......E#", "#################"]);
    const selected = planner.candidates(planner.buildIndex(snapshot));
    assert.ok(selected.some((candidate) => candidate.doorway));
    assert.ok(selected.every((candidate) => candidate.cells.every((cell) => cell.x !== 8 || cell.y !== 2)));
    assert.ok(selected.every((candidate) => candidate.nativeWallCells.every((cell) => cell.x !== 8 || cell.y !== 2)));
    assert.ok(
        selected.some((candidate) => candidate.proof.kind === "mandatory"),
        "A closed unlocked door remains part of the route graph",
    );
});

test("locked doors, protected floor and unspecified nonfloor never become reusable walls", () => {
    const planner = rules();
    for (const symbol of ["L", "P"]) {
        const snapshot = ascii(["###########", `#S...${symbol}...E#`, "###########"]);
        const selected = planner.candidates(planner.buildIndex(snapshot));
        assert.ok(selected.every((candidate) => candidate.cells.every((cell) => cell.x !== 6 || cell.y !== 2)));
        assert.ok(
            selected.every((candidate) => candidate.nativeWallCells.every((cell) => cell.x !== 6 || cell.y !== 2)),
        );
    }
    const snapshot = ascii(["###########", "#S.......E#", "###########"]);
    for (const cell of snapshot.cells) if (cell.wall) delete cell.wall;
    assert.equal(planner.candidates(planner.buildIndex(snapshot)).length, 0);
});

test("eight-neighbor diagonal bypasses prevent false mandatory claims", () => {
    const planner = rules(),
        snapshot = ascii(["###########", "#S.......E#", "#.#######.#", "##.......##", "###########"]);
    const index = planner.buildIndex(snapshot),
        selected = planner.candidates(index);
    assert.ok(selected.length);
    assert.ok(selected.every((candidate) => candidate.proof.kind !== "mandatory"));
});

test("a route ending inside a field is never proof that the field intercepts through traffic", () => {
    const planner = rules(),
        snapshot = ascii(["###############", "#S...........E#", "###############"]);
    const index = planner.buildIndex(snapshot),
        selected = planner.candidates(index, {
            routes: [{ from: { x: 7, y: 2 }, to: { x: 8, y: 2 } }],
            maxCandidates: 24,
        });
    assert.ok(
        selected
            .filter((candidate) => candidate.cells.some((cell) => cell.x === 8 && cell.y === 2))
            .every((candidate) => candidate.proof.kind === "local"),
    );
});

test("map analysis, candidate proof and source distances are reused across workers", () => {
    const planner = rules(),
        snapshot = ascii(["###################", "#S...............E#", "###################"]);
    const index = planner.buildIndex(snapshot),
        first = planner.candidates(index);
    const checks = index.metrics.routeChecks,
        builds = index.metrics.distanceFieldBuilds;
    for (let n = 0; n < 8; n++) {
        assert.equal(JSON.stringify(planner.candidates(index)), JSON.stringify(first));
        planner.distance(index, snapshot.entrances[0], first[n % first.length].core);
    }
    assert.equal(index.metrics.analysisBuilds, 1);
    assert.equal(index.metrics.visited, index.nodes.length);
    assert.equal(index.metrics.routeChecks, checks);
    assert.equal(index.metrics.distanceFieldBuilds, builds);
    assert.ok(checks <= planner.MAX_VALIDATIONS);
    assert.equal(index.metrics.routeSearches, checks * 2);
    assert.equal(index.metrics.candidateCacheHits, 8);
    first[0].gates[0].cells.length = 0;
    assert.ok(planner.candidates(index)[0].gates[0].cells.length);
});

test("long corridors use iterative cut analysis and bounded exact candidate verification", () => {
    const planner = rules(),
        width = 12002;
    const snapshot = ascii(["#".repeat(width), "#S" + ".".repeat(width - 4) + "E#", "#".repeat(width)]);
    const index = planner.buildIndex(snapshot),
        selected = planner.candidates(index);
    assert.ok(selected.length);
    assert.equal(index.metrics.visited, width - 2);
    assert.ok(index.metrics.routeChecks <= planner.MAX_VALIDATIONS);
    assert.ok(selected.every((candidate) => candidate.interiorCells.length <= 9));
});

test("blocked planned cells are filtered without changing shared static connectivity", () => {
    const planner = rules(),
        snapshot = ascii(["###############", "#S...........E#", "###############"]);
    const index = planner.buildIndex(snapshot),
        selected = planner.candidates(index, { blockedKeys: ["7,2", "8,2"] });
    assert.ok(selected.length);
    assert.ok(
        selected.every((candidate) => candidate.cells.every((cell) => !["7,2", "8,2"].includes(`${cell.x},${cell.y}`))),
    );
    assert.equal(index.metrics.analysisBuilds, 1);
});

test("an explicit changed-geometry index replaces an obsolete bottleneck proof", () => {
    const planner = rules(),
        before = ascii(["###############", "#S...........E#", "###############", "###############"]);
    assert.ok(planner.candidates(planner.buildIndex(before)).some((candidate) => candidate.proof.kind === "mandatory"));
    const after = ascii([
        "###############",
        "#S...........E#",
        "#.###########.#",
        "#.............#",
        "###############",
    ]);
    assert.ok(planner.candidates(planner.buildIndex(after)).every((candidate) => candidate.proof.kind !== "mandatory"));
});

test("moving origins cannot retain an unbounded number of whole-map distance fields", () => {
    const planner = rules(),
        snapshot = ascii(["#".repeat(100), "#S" + ".".repeat(96) + "E#", "#".repeat(100)]);
    const index = planner.buildIndex(snapshot);
    for (let x = 2; x < 82; x++) assert.ok(Number.isFinite(planner.distance(index, { x, y: 2 }, snapshot.exits[0])));
    assert.equal(index.distanceFields.size, 64);
    assert.equal(index.metrics.distanceFieldBuilds, 80);
});

test("candidate identities and ordering are independent of snapshot enumeration order", () => {
    const planner = rules(),
        snapshot = ascii(["###############", "#S...........E#", "###############"]);
    const forward = planner.candidates(planner.buildIndex(snapshot));
    const reversed = planner.candidates(planner.buildIndex({ ...snapshot, cells: [...snapshot.cells].reverse() }));
    assert.equal(JSON.stringify(forward), JSON.stringify(reversed));
});

test("the topology accepts all emitted one-width, two-width, door and junction passage declarations", () => {
    const context = { Spiderlings: {} };
    vm.createContext(context);
    for (const file of ["SpiderlingsSpinnerTopology.js", "SpiderlingsSpinnerPassagePlanner.js"])
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context);
    const planner = context.Spiderlings.SpinnerPassagePlanner,
        topology = context.Spiderlings.SpinnerTopology;
    for (const lines of [
        ["###############", "#S...........E#", "###############"],
        ["###############", "#S............#", "#............E#", "###############"],
        ["#################", "#S.....D.......E#", "#################"],
        ["###############", "#######.#######", "#######.#######", "#S...........E#", "###############"],
    ]) {
        const snapshot = ascii(lines),
            selected = planner.candidates(planner.buildIndex(snapshot), { maxCandidates: 24 });
        assert.ok(selected.length);
        const map = {
            width: snapshot.width,
            height: snapshot.height,
            floor: snapshot.cells.filter((cell) => cell.walkable).map((cell) => `${cell.x},${cell.y}`),
            walls: snapshot.cells.filter((cell) => cell.wall).map((cell) => `${cell.x},${cell.y}`),
            protected: snapshot.cells.filter((cell) => cell.protected).map((cell) => `${cell.x},${cell.y}`),
            locked: [],
            occupied: [],
        };
        for (const candidate of selected) {
            const input = {
                ...candidate,
                compositeId: "planner-contract",
                fieldId: "planned-field",
                groupId: "workers",
                owners: [1],
                map,
            };
            const checked = topology.validatePassage(input);
            assert.equal(checked.valid, true, `${candidate.id}: ${checked.reason}`);
            const created = topology.createPassage(input);
            assert.equal(created.kind, "passage");
            assert.equal(created.fields["planned-field"].gates.length, candidate.gates.length);
            assert.equal(topology.solidCells(created).length, 0, "Planning must not grant paid web cells");
        }
    }
});

test("static 17-origin working set reuses distances across twenty turns", () => {
    const planner = rules();
    const cells = Array.from({ length: 625 }, (_, i) => ({ x: i % 25, y: Math.floor(i / 25), floor: true }));
    const index = planner.buildIndex({ width: 25, height: 25, cells });
    for (let turn = 0; turn < 20; turn++)
        for (let x = 0; x < 17; x++)
            assert.equal(planner.distance(index, { x, y: 1 }, { x: 24, y: 24 }), Math.max(24 - x, 23));
    assert.equal(index.metrics.distanceFieldBuilds, 17);
    assert.equal(index.distanceFields.size, 17);
});

test("large maps keep distance payloads within one MiB and retain LRU reuse", () => {
    const planner = rules();
    const cells = Array.from({ length: 10000 }, (_, i) => ({ x: i % 100, y: Math.floor(i / 100), floor: true }));
    const index = planner.buildIndex({ width: 100, height: 100, cells });
    for (let x = 0; x < 30; x++) planner.distance(index, { x, y: 1 }, { x: 99, y: 99 });
    assert.equal(index.distanceFields.size, 26);
    assert.ok([...index.distanceFields.values()].reduce((bytes, field) => bytes + field.byteLength, 0) <= 1024 * 1024);
    planner.distance(index, { x: 29, y: 1 }, { x: 99, y: 99 });
    assert.equal(index.metrics.distanceFieldBuilds, 30);
    planner.distance(index, { x: 0, y: 1 }, { x: 99, y: 99 });
    assert.equal(index.metrics.distanceFieldBuilds, 31);
});
