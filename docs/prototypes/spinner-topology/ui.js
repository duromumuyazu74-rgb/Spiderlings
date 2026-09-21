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
    build: {
        label: "预布与封口",
        desc: "从规则房间开始。预布完成时入口仍开放；将目标放入核心，再观察封闭与出口路径消失。",
        scene: "room",
        steps: [
            ["重置房间", () => load("room")],
            [
                "选择并预布",
                () => {
                    T.plan(state);
                    T.settle(state);
                },
            ],
            ["目标进入核心", () => T.enterCore(state)],
            ["逐格闭合", () => T.settle(state)],
        ],
    },
    nested: {
        label: "内外双层",
        desc: "四只 Spinner 才有第二层。先织内层，再织外层；进入共同核心后从内向外封口。",
        scene: "nested",
        steps: [
            ["重置双层", () => load("nested")],
            [
                "完成预布",
                () => {
                    T.plan(state);
                    T.settle(state);
                },
            ],
            [
                "入核心并封口",
                () => {
                    T.enterCore(state);
                    T.settle(state);
                },
            ],
            [
                "破坏内层一边",
                () => {
                    const f = state.fields[0],
                        l = state.links[f.links[0]];
                    T.attack(state, l.cells[Math.floor(l.cells.length / 2)], 100);
                },
            ],
        ],
    },
    shared: {
        label: "重叠与破网",
        desc: "第二群复用物理结构。点击范围伤害可见同一连接的逐格累加；摧毁共享锚点会影响所有关联场地。",
        scene: "overlap",
        steps: [
            ["重置重叠", () => load("overlap")],
            [
                "建立共享计划",
                () => {
                    T.plan(state);
                    T.overlap(state);
                    T.settle(state);
                },
            ],
            [
                "入核心并封口",
                () => {
                    T.enterCore(state);
                    T.settle(state);
                },
            ],
            ["破坏共享锚点", () => T.attack(state, state.fields[0].anchors[0], 2, true)],
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
    $("count").value = m.nested || m.overlap ? 4 : m.spawns.length || 2;
    const started = performance.now();
    state = T.create(m, $("seed").value, Number($("count").value));
    preview = state.analysis.selected;
    selected = null;
    text("notice", `候选分析 ${(performance.now() - started).toFixed(0)} ms。`);
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
            `${c.outer ? "双层 / " : ""}${c.type} · ${c.core.join(",")} · ${c.score.toFixed(1)}`,
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
    text("candidateSummary", `${state.analysis.candidates.length} 个候选 · ${state.analysis.fallback}`);
    text(
        "score",
        preview
            ? Object.entries(preview.reasons)
                  .map(
                      ([k, v]) =>
                          `${{ exit: "出口", choke: "窄口", route: "主路线", nest: "巢穴", travel: "距离", space: "空间", shape: "正交适配" }[k]} ${v.toFixed(1)}`,
                  )
                  .join(" · ")
            : "没有合法地点，保持放弃状态。",
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
                ctx.fillText("入口", x * cell + 3, y * cell + 19);
            }
        }
    }
    for (const l of Object.values(state.links))
        if (l.hp > 0)
            for (const k of l.built) {
                const [x, y] = T.point(k);
                ctx.fillStyle = "#cbd1b7";
                ctx.fillRect(x * cell + 9, y * cell + 9, 12, 12);
            }
    for (const l of Object.values(state.links))
        if (l.hp > 0) {
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
            ctx.fillText(i === 0 ? "诱" : String(i), (a.pos[0] + 0.5) * cell, (a.pos[1] + 0.5) * cell + 4);
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
        ["数据来源", state.map.kind === "native-generated" ? "KD 原生地图" : "手工边界场景"],
        ["场地 / 群体", `${state.fields.length} / ${state.groups.length}`],
        ["已放锚点", view.anchorCount],
        ["实际阻挡格", view.physicalCells],
        ["共享连接", view.sharedLinks],
        ["目标到出口", view.exitPath.length ? `${view.exitPath.length - 1} 步` : "无路径"],
        ["几何捕获准入", view.geometryReady ? "具备闭合条件" : "不成立"],
    ]) {
        dl.append(element("dt", k), element("dd", v));
    }
    $("status").append(dl);
    for (const f of state.fields) {
        const v = view.fields.find((v) => v.id === f.id);
        $("status").append(
            element(
                "p",
                `${f.id} · ${f.group} · 层 ${f.layer + 1} · ${T.phaseName(f.phase)}${v.inside ? ` · 场外路径 ${v.escapePath.length ? "已打通" : "未打通"}` : ""}`,
                "muted",
            ),
        );
    }
    $("checks").replaceChildren(
        element(
            "div",
            view.violations.length ? `非法占格 ${view.violations.join(" ")}` : "施工未覆盖保护格 / 墙体 / 原生实体",
            `check ${view.violations.length ? "warning" : "ok"}`,
        ),
    );
    text(
        "admission",
        view.geometryReady
            ? "场地已提供准入。还需要至少两只合法 Spinner 与原生近战命中，才能进入被捕获状态。"
            : "几何仅用于捕获准入。既有 Capture strands 不因破网自动解除。",
    );
    const table = $("actors");
    table.replaceChildren();
    for (const g of state.groups)
        for (let i = 0; i < g.actors.length; i++) {
            const a = g.actors[i],
                row = element("tr");
            for (const v of [
                `${g.id} / ${i === 0 ? "诱饵" : "施工"}${a.active ? "" : "（移除）"}`,
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
        pane.append(element("p", `格 ${selected}`));
        const a = state.anchors[selected];
        if (a) pane.append(element("p", `锚点 HP ${a.hp.toFixed(2)} / ${a.max} · ${a.owners.join(" / ")}`));
        for (const l of Object.values(state.links).filter((l) => l.cells.includes(selected))) {
            const d = Math.min(
                T.distance(T.point(selected), T.point(l.a)),
                T.distance(T.point(selected), T.point(l.b)),
            );
            pane.append(
                element(
                    "p",
                    `连接 HP ${l.hp.toFixed(2)} / ${l.max} · 伤害倍率 ${Math.max(0.25, 1 - 0.15 * d).toFixed(2)} · ${l.owners.join(" / ")}`,
                ),
            );
        }
    } else text("selection", "点击地图查看连接生命和共享归属。");
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
            load(g.scene);
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
action("removeActor", () => {
    const a = state.groups
        .flatMap((g) => g.actors)
        .filter((a) => a.active)
        .at(-1);
    if (a) {
        a.active = false;
        state.log.push({ turn: state.turn, message: `移除 ${a.id}，检查施工和无主计时。` });
    }
});
$("reset").onclick = () => {
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
        const actor = state.groups.flatMap((g) => g.actors).some((a) => a.active && T.key(...a.pos) === selected);
        if (
            state.map.protected.includes(selected) ||
            state.map.occupied.includes(selected) ||
            actor ||
            T.key(...state.target.pos) === selected
        )
            text("notice", "保护格或实体占用，拒绝改墙。");
        else {
            if (state.map.walk.includes(selected)) state.map.walk = state.map.walk.filter((k) => k !== selected);
            else state.map.walk.push(selected);
            const rows = state.map.grid.map((r) => [...r]);
            rows[y][x] = state.map.walk.includes(selected) ? "." : "#";
            state.map.grid = rows.map((r) => r.join(""));
            for (const l of Object.values(state.links))
                if (l.cells.includes(selected) && !state.map.walk.includes(selected)) {
                    l.hp = 0;
                    l.built = [];
                    l.cooldown = 4;
                }
            if (state.anchors[selected] && !state.map.walk.includes(selected)) state.anchors[selected].placed = false;
            state.analysis = T.analyze(
                state.map,
                state.groups[0].actors[0]?.pos || state.map.start,
                state.seed,
                "g1",
                state.map.nested,
            );
            preview = state.analysis.selected;
            state.log.push({ turn: state.turn, message: "地形变化，候选重新分析；施工会重新验证目标格。" });
            T.update(state);
        }
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
            throw Error("不是本原型的状态文件");
        state = saved;
        current = saved.map.id;
        preview = state.analysis.selected;
        selected = null;
        render();
        text("notice", "已恢复原型状态。此操作不是 KD 存档兼容测试。");
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
                throw Error("需要 extract-native.mjs 格式的快照");
            const m = T.nativeMap(r, maps.length);
            maps.push(m);
        }
        load(maps.at(-1).id);
    } catch (e) {
        text("notice", e.message);
    }
};
load();
