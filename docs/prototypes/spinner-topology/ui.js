/* global SpinnerTopology */
"use strict";
const T = SpinnerTopology,
    $ = (id) => document.getElementById(id);
const nativeSnapshots = JSON.parse($("native-data").textContent);
const maps = [...T.fixedMaps(), ...nativeSnapshots.map(T.nativeMap)];
let current = "room",
    state,
    preview,
    selected,
    guide = "build";
const guides = {
    blocked: {
        label: "Native occupancy wait",
        desc: "An alerted, stationary lure blocks a planned anchor in KD 5.5.0 sample 3. Explicit debug relocation resumes work; native bait movement is not simulated.",
        scene: "native-5",
        steps: [
            ["Reset sample 3", () => load("native-5")],
            [
                "Build until blocked",
                () => {
                    state.aware = true;
                    T.plan(state);
                    T.settle(state);
                },
            ],
            ["Vacate lure (debug)", () => T.vacateLure(state)],
            ["Resume legal work", () => T.settle(state)],
        ],
    },
    terrain: {
        label: "Interior terrain change",
        desc: "Turn an unoccupied interior cell into a wall after planning. The next action retires and replaces the invalid plan without clearing foreign objects.",
        scene: "room",
        steps: [
            [
                "Reset and plan",
                () => {
                    load("room");
                    T.plan(state);
                },
            ],
            [
                "Block interior cell",
                () => {
                    const cell = state.fields[0]?.interior.find(
                        (k) => !state.groups.some((g) => g.actors.some((a) => T.key(...a.pos) === k)),
                    );
                    if (cell) T.editTerrain(state, cell);
                },
            ],
            ["Validate next action", () => T.step(state)],
        ],
    },
    build: {
        label: "Prebuild and seal",
        desc: "Start in the regular room. Prebuild leaves an entrance; place the target in the core and observe closure and route changes.",
        scene: "room",
        steps: [
            ["Reset room", () => load("room")],
            [
                "Plan and prebuild",
                () => {
                    T.plan(state);
                    T.settle(state);
                },
            ],
            ["Enter the core", () => T.enterCore(state)],
            ["Seal incrementally", () => T.settle(state)],
        ],
    },
    nested: {
        label: "Nested fields",
        desc: "Four Spinners are required for a second layer. Build inner before outer, then seal in that order after core entry.",
        scene: "nested",
        steps: [
            ["Reset nested fields", () => load("nested")],
            [
                "Complete prebuild",
                () => {
                    T.plan(state);
                    T.settle(state);
                },
            ],
            [
                "Enter and seal",
                () => {
                    T.enterCore(state);
                    T.settle(state);
                },
            ],
            [
                "Breach inner edge",
                () => {
                    const f = state.fields[0],
                        l = state.links[f.links[0]];
                    T.attack(state, l.cells[Math.floor(l.cells.length / 2)], 100);
                },
            ],
        ],
    },
    durability: {
        label: "Partial overlap durability",
        desc: "Two adjacent closed boundaries partially share one collinear span. The shared span has one HP pool; graph splits are not anchors unless an original endpoint placed one there.",
        scene: "durability-partial",
        steps: [
            ["Load physical graph", () => loadDurability("partial")],
            ["Hit shared cell", () => T.attack(state, "15,10", 1, false)],
            ["Cover three cells", () => T.attack(state, "15,10", 1, true)],
            ["Break real anchor", () => T.attack(state, "13,10", 1, false)],
            [
                "Remove first owner",
                () => {
                    loadDurability("partial");
                    state.groups[0].actors.forEach((actor) => (actor.active = false));
                    for (let i = 0; i < 20; i++) T.step(state);
                },
            ],
            [
                "Remove final owner",
                () => {
                    state.groups[1].actors.forEach((actor) => (actor.active = false));
                    for (let i = 0; i < 20; i++) T.step(state);
                },
            ],
        ],
    },
    shared: {
        label: "Shared fields and breach",
        desc: "A second group reuses the same structures. Area damage accumulates per cell; destroying a shared anchor affects every owner.",
        scene: "overlap",
        steps: [
            ["Reset shared fields", () => load("overlap")],
            [
                "Build shared plan",
                () => {
                    T.plan(state);
                    T.overlap(state);
                    T.settle(state);
                },
            ],
            [
                "Enter and seal",
                () => {
                    T.enterCore(state);
                    T.settle(state);
                },
            ],
            ["Break shared anchor", () => T.attack(state, state.fields[0].anchors[0], 2, true)],
        ],
    },
};
function text(id, value) {
    $(id).textContent = value;
}
function element(tag, value, cls) {
    const e = document.createElement(tag);
    if (value !== undefined) e.textContent = value;
    if (cls) e.className = cls;
    return e;
}
function load(id = current) {
    current = id;
    const m = maps.find((m) => m.id === id);
    $("count").value = m.nested || m.overlap ? 4 : m.id === "room" ? 2 : m.spawns.length || 2;
    const started = performance.now();
    state = T.create(m, $("seed").value, Number($("count").value));
    preview = state.analysis.selected;
    selected = null;
    text("notice", `Candidate analysis ${(performance.now() - started).toFixed(0)} ms.`);
    render();
}
function loadDurability(kind) {
    current = `durability-${kind}`;
    state = T.durabilityFixture(kind);
    preview = null;
    selected = kind === "partial" ? "15,10" : null;
    $("count").value = 2;
    text("notice", "Loaded the settled physical-segment graph. Damage remains a debug injection.");
    render();
}
function candidateList() {
    const select = $("candidateSelect");
    select.replaceChildren();
    const ranked = [...state.analysis.candidates];
    if (preview) ranked.sort((a, b) => (b.id === preview.id) - (a.id === preview.id));
    for (const c of ranked.slice(0, 100)) {
        const option = element(
            "option",
            `${c.outer ? "Nested / " : ""}${c.type} · ${c.core.join(",")} · ${c.score.toFixed(1)}`,
        );
        option.value = c.id;
        option.selected = c.id === preview?.id;
        select.append(option);
    }
    const body = $("candidates");
    body.replaceChildren();
    for (const c of state.analysis.candidates.slice(0, 12)) {
        const row = element("tr", undefined, c.id === preview?.id ? "chosen" : "");
        for (const v of [c.type, c.core.join(","), c.score.toFixed(1)]) row.append(element("td", v));
        row.onclick = () => {
            preview = c;
            render();
        };
        body.append(row);
    }
    text(
        "candidateSummary",
        `${state.analysis.candidates.length} candidates · ${state.analysis.fallback} · This prototype prefers enclosures, then ranks sites; it falls back to lines when no enclosure fits.`,
    );
    text(
        "score",
        preview
            ? Object.entries(preview.reasons)
                  .map(
                      ([k, v]) =>
                          `${{ exit: "Exit", choke: "Choke", route: "Main route", nest: "Nest", travel: "Distance", space: "Space", shape: "Orthogonal fit" }[k]} ${v.toFixed(1)}`,
                  )
                  .join(" · ")
            : "No legal site; planning is abandoned.",
    );
}
function draw(view) {
    const canvas = $("map"),
        ctx = canvas.getContext("2d"),
        w = state.map.grid[0].length,
        h = state.map.grid.length;
    const cell = 30;
    canvas.width = w * cell;
    canvas.height = h * cell;
    const walk = new Set(state.map.walk),
        protectedCells = new Set(state.map.protected),
        occupied = new Set(state.map.occupied),
        reach = new Set(view.reachable),
        solid = new Set(view.solid);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const k = T.key(x, y);
            ctx.fillStyle = walk.has(k) ? ($("showReach").checked && reach.has(k) ? "#355443" : "#26382e") : "#111c17";
            ctx.fillRect(x * cell, y * cell, cell, cell);
            ctx.strokeStyle = "#1b2b22";
            ctx.strokeRect(x * cell, y * cell, cell, cell);
            if (protectedCells.has(k) && walk.has(k)) {
                ctx.strokeStyle = "#b48191";
                ctx.strokeRect(x * cell + 5, y * cell + 5, cell - 10, cell - 10);
            }
            if (occupied.has(k)) {
                ctx.fillStyle = "#8a7c6a";
                ctx.fillRect(x * cell + 9, y * cell + 9, 12, 12);
            }
        }
    const line = (path, color, width = 2, dash = []) => {
        if (!path.length) return;
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.setLineDash(dash);
        ctx.beginPath();
        path.forEach((p, i) => ctx[i ? "lineTo" : "moveTo"]((p[0] + 0.5) * cell, (p[1] + 0.5) * cell));
        ctx.stroke();
        ctx.setLineDash([]);
    };
    if (!state.fields.length && preview) {
        for (const c of [preview, ...(preview.outer ? [preview.outer] : [])])
            for (const e of c.edges) line(e.map(T.point), "#aaaa67", 2, [5, 6]);
    }
    for (const f of state.fields) {
        const color = f.layer ? "#83b6a1" : "#c7c979";
        for (const id of f.links) line(state.links[id].cells.map(T.point), color, 1, [3, 5]);
        if (f.type !== "line") {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect((f.core[0] - 1) * cell, (f.core[1] - 1) * cell, cell * 3, cell * 3);
            if (f.gate && !solid.has(f.gate)) {
                const [x, y] = T.point(f.gate);
                ctx.fillStyle = "#d7d78a";
                ctx.font = "11px sans-serif";
                ctx.fillText("Gate", x * cell + 3, y * cell + 19);
            }
        }
    }
    for (const l of Object.values(state.links))
        if (l.hp > 0 && l.started !== false)
            for (const k of l.built) {
                const [x, y] = T.point(k);
                ctx.fillStyle = "#cbd1b7";
                ctx.fillRect(x * cell + 9, y * cell + 9, 12, 12);
            }
    for (const l of Object.values(state.links))
        if (l.hp > 0 && l.started !== false) {
            for (let i = 1; i < l.cells.length; i++)
                if (l.built.includes(l.cells[i - 1]) && l.built.includes(l.cells[i]))
                    line([T.point(l.cells[i - 1]), T.point(l.cells[i])], "#eeeedd", 3);
        }
    for (const a of Object.values(state.anchors))
        if (a.placed) {
            const [x, y] = T.point(a.k);
            ctx.fillStyle = "#d7d78a";
            ctx.beginPath();
            ctx.moveTo((x + 0.5) * cell, y * cell + 5);
            ctx.lineTo(x * cell + 25, (y + 0.5) * cell);
            ctx.lineTo((x + 0.5) * cell, y * cell + 25);
            ctx.lineTo(x * cell + 5, (y + 0.5) * cell);
            ctx.fill();
        }
    for (const junction of Object.values(state.junctions || {})) {
        const [x, y] = T.point(junction.k);
        ctx.strokeStyle = "#efb995";
        ctx.lineWidth = 2;
        ctx.strokeRect(x * cell + 10, y * cell + 10, 10, 10);
    }
    line(view.exitPath, "#69a8b0", 2);
    for (const f of view.fields.filter((f) => f.inside)) line(f.escapePath, "#ebbc87", 2, [4, 4]);
    for (const g of state.groups)
        for (let i = 0; i < g.actors.length; i++) {
            const a = g.actors[i];
            if (!a.active) continue;
            if ($("showPaths").checked) line(a.path || [], "#7cac85", 1, [3, 3]);
            ctx.fillStyle = g.id === "g1" ? "#84c1a2" : "#92a5d0";
            ctx.beginPath();
            ctx.arc((a.pos[0] + 0.5) * cell, (a.pos[1] + 0.5) * cell, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#13221a";
            ctx.font = "bold 12px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(
                state.aware &&
                    a.id ===
                        (
                            g.actors.find((actor) => actor.active && actor.id === g.lureId) ||
                            g.actors.find((actor) => actor.active)
                        )?.id
                    ? "L"
                    : String(i + 1),
                (a.pos[0] + 0.5) * cell,
                (a.pos[1] + 0.5) * cell + 4,
            );
            ctx.textAlign = "left";
        }
    const [x, y] = state.target.pos;
    ctx.fillStyle = "#eda585";
    ctx.beginPath();
    ctx.arc((x + 0.5) * cell, (y + 0.5) * cell, 8, 0, Math.PI * 2);
    ctx.fill();
    for (const [p, label] of [
        [state.map.start, "S"],
        [state.map.end, "E"],
    ]) {
        ctx.fillStyle = "#efead9";
        ctx.font = "bold 16px monospace";
        ctx.fillText(label, p[0] * cell + 10, p[1] * cell + 21);
    }
    if (selected) {
        const [x, y] = T.point(selected);
        ctx.strokeStyle = "#efb995";
        ctx.lineWidth = 3;
        ctx.strokeRect(x * cell + 1, y * cell + 1, cell - 2, cell - 2);
    }
}
function render() {
    $("aware").checked = !!state.aware;
    const view = T.inspect(state);
    candidateList();
    draw(view);
    text("sceneTitle", state.map.name);
    text("sceneDesc", state.map.desc);
    text("turn", `T ${String(state.turn).padStart(3, "0")}`);
    for (const parent of ["scenes", "nativeScenes"]) {
        $(parent).replaceChildren();
        for (const m of maps.filter((m) => (m.kind === "native-generated") === (parent === "nativeScenes"))) {
            const b = element("button", m.name, m.id === current ? "active" : "");
            b.onclick = () => load(m.id);
            $(parent).append(b);
        }
    }
    $("status").replaceChildren();
    const dl = element("dl");
    for (const [k, v] of [
        ["Input source", state.map.kind === "native-generated" ? "Native KD map" : "Authored edge case"],
        ["Fields / groups", `${state.fields.length} / ${state.groups.length}`],
        ["Placed anchors", view.anchorCount],
        ["Graph junctions", view.junctionCount],
        ["Blocked cells", view.physicalCells],
        ["Shared links", view.sharedLinks],
        ["Target to exit", view.exitPath.length ? `${view.exitPath.length - 1} steps` : "No path"],
        ["Geometry admission", view.geometryReady ? "Closed geometry" : "Not eligible"],
    ]) {
        dl.append(element("dt", k), element("dd", v));
    }
    $("status").append(dl);
    for (const f of state.fields) {
        const v = view.fields.find((v) => v.id === f.id);
        $("status").append(
            element(
                "p",
                `${f.id} · ${f.group} · Layer ${f.layer + 1} · ${T.phaseName(f.phase)}${v.inside ? ` · Outside-field path ${v.escapePath.length ? "Open" : "Blocked"}` : ""}`,
                "muted",
            ),
        );
    }
    $("checks").replaceChildren(
        element(
            "div",
            view.violations.length
                ? `Illegal placement ${view.violations.join(" ")}`
                : "No protected, wall or foreign-entity cells overwritten",
            `check ${view.violations.length ? "warning" : "ok"}`,
        ),
    );
    text(
        "admission",
        view.geometryReady
            ? "Geometry is ready. Capture still requires two legal Spinners and a native melee hit."
            : "Geometry only controls admission. Breaking webs does not cancel existing Capture strands.",
    );
    const table = $("actors");
    table.replaceChildren();
    for (const g of state.groups)
        for (let i = 0; i < g.actors.length; i++) {
            const a = g.actors[i],
                row = element("tr");
            for (const v of [
                `${g.id} / ${state.aware && a.id === (g.actors.find((actor) => actor.active && actor.id === g.lureId) || g.actors.find((actor) => actor.active))?.id ? "Lure" : "Builder"}${a.active ? "" : " (removed)"}`,
                a.pos.join(","),
                a.last,
                a.task?.k || "—",
            ])
                row.append(element("td", v));
            table.append(row);
        }
    const list = $("log");
    list.replaceChildren();
    for (const l of [...state.log].reverse()) {
        const li = element("li");
        li.append(element("time", `T${l.turn}`), document.createTextNode(l.message));
        list.append(li);
    }
    const pane = $("selection");
    pane.replaceChildren();
    if (selected) {
        pane.append(element("p", `Cell ${selected}`));
        const metadata = state.map.snapshot?.protectedCells.find((p) => T.key(p.x, p.y) === selected);
        if (metadata) pane.append(element("p", `Protection reasons: ${metadata.reasons.join(" / ")}`));
        if (state.map.locked?.includes(selected))
            pane.append(
                element(
                    "p",
                    "Locked cell: blocked in this model. Faction-specific lock access needs native verification.",
                ),
            );
        const a = state.anchors[selected];
        if (a) pane.append(element("p", `Anchor HP ${a.hp.toFixed(2)} / ${a.max} · ${a.owners.join(" / ")}`));
        const junction = state.junctions?.[selected];
        if (junction)
            pane.append(
                element(
                    "p",
                    `Graph ${junction.kind}; no anchor HP or anchor propagation · ${junction.owners.join(" / ")}`,
                ),
            );
        for (const l of Object.values(state.links).filter((l) => l.cells.includes(selected))) {
            pane.append(
                element(
                    "p",
                    `Link HP ${l.hp.toFixed(2)} / ${l.max} · Damage multiplier ${T.damageMultiplier(state, l, selected).toFixed(2)} · ${l.owners.join(" / ")}`,
                ),
            );
        }
    } else text("selection", "Select a cell to inspect link HP and ownership.");
    text(
        "raw",
        JSON.stringify(
            {
                mapSource: state.map.snapshot
                    ? {
                          version: state.map.snapshot.version,
                          seed: state.map.snapshot.seed,
                          sha256: state.map.snapshot.bundleSHA256,
                      }
                    : state.map.kind,
                seed: state.seed,
                fields: state.fields,
                anchors: state.anchors,
                junctions: state.junctions,
                links: state.links,
                lastDamage: state.lastDamage,
            },
            null,
            2,
        ),
    );
    $("guideTabs").replaceChildren();
    for (const [k, g] of Object.entries(guides)) {
        const b = element("button", g.label, k === guide ? "active" : "");
        b.onclick = () => {
            guide = k;
            if (g.scene.startsWith("durability-")) loadDurability(g.scene.slice("durability-".length));
            else load(g.scene);
        };
        $("guideTabs").append(b);
    }
    text("guideDesc", guides[guide].desc);
    $("guideSteps").replaceChildren();
    guides[guide].steps.forEach(([name, action], i) => {
        const b = element("button", `${i + 1}. ${name}`);
        b.onclick = () => {
            action();
            render();
        };
        $("guideSteps").append(b);
    });
    globalThis.prototypeState = state;
}
function action(id, fn) {
    $(id).onclick = () => {
        fn();
        render();
    };
}
action("plan", () => T.plan(state, preview?.id));
action("step", () => T.step(state));
action("settle", () => T.settle(state));
action("enter", () => T.enterCore(state));
action("overlap", () => T.overlap(state));
action("vacateLure", () => T.vacateLure(state));
action("removeActor", () => {
    const a = state.groups
        .flatMap((g) => g.actors)
        .filter((a) => a.active)
        .at(-1);
    if (a) {
        a.active = false;
        state.log.push({ turn: state.turn, message: `Remove ${a.id}, inspecting construction and ownership timers.` });
    }
});
$("reset").onclick = () => {
    if (current.startsWith("durability-")) {
        loadDurability(current.slice("durability-".length));
        return;
    }
    state = T.create(
        maps.find((m) => m.id === current),
        $("seed").value,
        Number($("count").value),
    );
    preview = state.analysis.selected;
    selected = null;
    render();
};
$("candidateSelect").onchange = () => {
    preview = state.analysis.candidates.find((c) => c.id === $("candidateSelect").value);
    render();
};
$("showReach").onchange = render;
$("aware").onchange = () => {
    state.aware = $("aware").checked;
    render();
};
$("showPaths").onchange = render;
$("map").onclick = (event) => {
    const rect = $("map").getBoundingClientRect(),
        x = Math.floor(((event.clientX - rect.left) / rect.width) * state.map.grid[0].length),
        y = Math.floor(((event.clientY - rect.top) / rect.height) * state.map.grid.length);
    selected = T.key(x, y);
    const mode = $("mode").value;
    if (mode === "attack" || mode === "aoe")
        T.attack(state, selected, Math.max(0.1, Number($("damage").value) || 1), mode === "aoe");
    if (mode === "move") T.move(state, [x, y]);
    if (mode === "obstacle") {
        if (!T.editTerrain(state, selected)) text("notice", "Protected or occupied cell; terrain edit rejected.");
        else preview = state.analysis.selected;
    }
    render();
};
function download(name, data) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () => download("spinner-topology-state.json", state);
$("restore").onclick = () => $("stateFile").click();
$("stateFile").onchange = async () => {
    try {
        const saved = JSON.parse(await $("stateFile").files[0].text());
        if (saved.schema !== 1 || !saved.map?.walk || !saved.groups?.length || !saved.links)
            throw Error("Not a valid prototype state file");
        state = saved;
        current = saved.map.id;
        preview = state.analysis.selected;
        selected = null;
        render();
        text("notice", "Restored prototype state. This does not test KD save compatibility.");
    } catch (e) {
        text("notice", e.message);
    }
};
$("importMap").onclick = () => $("mapFile").click();
$("mapFile").onchange = async () => {
    try {
        const input = JSON.parse(await $("mapFile").files[0].text());
        const rows = Array.isArray(input) ? input : [input];
        for (const r of rows) {
            if (!r.grid?.length || !r.movable || !r.protectedCells || !r.start || !r.end || !r.entities)
                throw Error("Expected an extract-native.mjs snapshot");
            const m = T.nativeMap(r, maps.length);
            maps.push(m);
        }
        load(maps.at(-1).id);
    } catch (e) {
        text("notice", e.message);
    }
};
const timing = JSON.parse($("pacing-data").textContent);
text(
    "timingComparison",
    timing.map((r) => `${r.count} actors: ${r.travel} turns including arrival / ${r.onsite} turns on site`).join(" · "),
);
load();
