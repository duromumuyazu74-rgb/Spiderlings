"use strict";
/* global KDChangeStamina: writable, KDChangeWill: writable, KinkyDungeonLastAction: writable,
          KDMapData, KinkyDungeonMapSet, KinkyDungeonTilesDelete, KDMovePlayer, KDGameData,
          KinkyDungeonAllWeapon, KinkyDungeonInventoryRemove, KinkyDungeonInventoryGetWeapon,
          KinkyDungeonInventoryAddWeapon, KDSetWeapon, KDPerkStart, KinkyDungeonAddRestraint,
          KinkyDungeonGetRestraintByName, Spiderlings, KinkyDungeonUpdateStats,
          KinkyDungeonGetPlayerWeaponDamage, KinkyDungeonCanUseWeapon, KinkyDungeonAllRestraintDynamic,
          KinkyDungeonStatStamina, KinkyDungeonStatWill, KDAddEvent, KDEventMapGeneric,
          KDSendInput, KDRestraint, KinkyDungeonStruggle, KinkyDungeonSeed,
          KDPushSpell, KinkyDungeonFindSpell, KinkyDungeonHasMana, KinkyDungeonGetManaCost,
          KinkyDungeonStatMana, KDPlayer */

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRuntime, loadPackage } = require("./compatibility/runtime.js");
const { hash, git } = require("./compatibility/prepare.js");
const { nativeCodec, readSaveInput, saveSlots } = require("./save-diagnostics.js");
const { readJson, writeJson, writeText } = require("./task-runner.js");
const { prepareMaturePrison, runPrisonRoute } = require("./escape-prison.js");

const root = path.resolve(__dirname, "../..");
const methods = ["Cut", "Remove", "Struggle"];
const parameterFields = ["escapeChance", "speedMult", "struggleMinSpeed", "limitChance"];

function parseArguments(args) {
    const options = { slot: 1 };
    for (let index = 0; index < args.length; index++) {
        const key = args[index].replace(/^--/, "");
        if (!["runtime", "package", "plan", "output", "save", "slot"].includes(key) || !args[index + 1])
            throw Error(`Unknown or incomplete argument: ${args[index]}`);
        options[key] = args[++index];
    }
    options.slot = Number(options.slot);
    if (!["runtime", "package", "plan"].every((key) => options[key]))
        throw Error("Escape analysis needs --runtime, --package and --plan. See docs/research/escape-model/usage.md.");
    if (!Number.isSafeInteger(options.slot) || options.slot < 1) throw Error("Slot must be a positive integer.");
    return options;
}

function expandPlan(plan, saved = false) {
    if (plan.preparation !== undefined && plan.preparation !== "mature-prison")
        throw Error("Unknown experiment preparation.");
    saved ||= plan.preparation === "mature-prison";
    if (!Array.isArray(plan.cases) || !plan.cases.length) throw Error("Plan needs nonempty cases.");
    if (!Array.isArray(plan.seeds) || !plan.seeds.length || plan.seeds.some((seed) => typeof seed !== "string"))
        throw Error("Plan needs explicit string seeds.");
    if (!Number.isSafeInteger(plan.maxTurns) || plan.maxTurns < 1) throw Error("maxTurns must be positive.");
    return plan.cases.flatMap((entry) => {
        if (!entry.label || typeof entry.id !== "string" || !methods.includes(entry.method))
            throw Error("Each case needs label, restraint id and Cut/Remove/Struggle method.");
        if (!Number.isSafeInteger(entry.quietTurns ?? 0) || (entry.quietTurns ?? 0) < 0)
            throw Error("quietTurns must be a nonnegative integer.");
        if ((entry.quietTurns ?? 0) >= plan.maxTurns) throw Error("Quiet preparation exhausts the turn budget.");
        if (!Number.isSafeInteger(entry.precasts ?? 0) || (entry.precasts ?? 0) < 0)
            throw Error("precasts must be a nonnegative integer.");
        if ((entry.precasts || entry.route) && plan.preparation !== "mature-prison")
            throw Error("Prison spells/routes need mature-prison preparation.");
        if (entry.precasts && entry.spell !== "Fireball") throw Error("Prepared Mage trials use native Fireball.");
        if (saved && ["equipment", "density", "knife"].some((key) => entry[key] !== undefined))
            throw Error("Saved trials retain their own equipment, density and tools; omit fixture overrides.");
        if (!saved && !["single", "full"].includes(entry.equipment))
            throw Error("Controlled trials need single or full equipment.");
        if (!saved && (!Number.isFinite(entry.density) || entry.density < 0))
            throw Error("Controlled trials need a nonnegative density.");
        if (entry.knife !== undefined && typeof entry.knife !== "boolean") throw Error("knife must be boolean.");
        for (const [field, values] of Object.entries(entry.overrides || {})) {
            if (!parameterFields.includes(field) || !values || typeof values !== "object")
                throw Error(`Unsupported candidate parameter: ${field}`);
            for (const [method, value] of Object.entries(values))
                if (!methods.includes(method) || !Number.isFinite(value)) throw Error("Invalid candidate value.");
        }
        return plan.seeds.map((seed) => ({ quietTurns: 0, ...entry, seed, maxTurns: plan.maxTurns }));
    });
}

function summarize(rows) {
    const groups = new Map();
    for (const row of rows) {
        if (!groups.has(row.label)) groups.set(row.label, []);
        groups.get(row.label).push(row);
    }
    return [...groups].map(([label, trials]) => ({
        label,
        samples: trials.length,
        escaped: trials.filter((row) => row.outcome === "escaped").length,
        returnedToSource: trials.filter((row) => row.route?.outcome === "returned-to-source").length,
        routes: trials
            .filter((row) => row.route)
            .map(({ seed, route }) => ({ seed, outcome: route.outcome, turns: route.turns })),
        outcomes: trials.map(({ seed, outcome, turns }) => ({ seed, outcome, turns })),
        observedTurns: [Math.min(...trials.map((row) => row.turns)), Math.max(...trials.map((row) => row.turns))],
        actions: trials.map((row) => row.actions),
        staminaSpent: trials.map((row) => row.costs.stamina),
        willSpent: trials.map((row) => row.costs.will),
    }));
}

// Serialized into an isolated native game. All progress, costs and decay use the loaded ZIP's implementation.
async function runCase({ spec, saved, fields }) {
    const { setup, frame, restore, expect } = globalThis.normalAcceptance;
    setup(spec.seed);
    if (saved) {
        restore(saved);
        // Native loading restores the saved/map seed; apply the requested paired seed afterwards.
        globalThis.compatibilitySetSeed(spec.seed);
        expect(KinkyDungeonSeed === spec.seed, "Native save loading replaced the paired seed.");
    } else {
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(10, 10, false);
        KDGameData.DelayedActions = [];
        if (spec.knife === false) {
            for (const item of KinkyDungeonAllWeapon()) KinkyDungeonInventoryRemove(item);
            KDGameData.PreviousWeapon = [];
        } else if (!KinkyDungeonInventoryGetWeapon("Knife")) KinkyDungeonInventoryAddWeapon("Knife");
        KDSetWeapon(spec.knife === false ? null : "Knife");
        if (spec.equipment === "full") KDPerkStart.SpiderlingsCocoonStart();
        else KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName(spec.id), 0, false, "");
        // Match the existing full-set calibration's available sharp surface.
        if (spec.knife !== false) KinkyDungeonMapSet(10, 10, "/");
        Spiderlings.SilkDensity.state().value = spec.density;
        Spiderlings.SilkDensity.state().bareTurns = 0;
        Spiderlings.SilkDensity.state().contacted = false;
    }
    KinkyDungeonUpdateStats(0);
    KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
    const template = KinkyDungeonGetRestraintByName(spec.id);
    expect(template, `Unknown restraint: ${spec.id}`);
    const originals = Object.fromEntries(fields.map((field) => [field, template[field]]));
    for (const [field, value] of Object.entries(spec.overrides || {}))
        template[field] = { ...template[field], ...value };
    const worn = () => KinkyDungeonAllRestraintDynamic();
    const target = () => worn().find(({ item }) => item.name === spec.id)?.item;
    expect(target(), `Trial does not wear ${spec.id}`);
    let turns = 0,
        actions = 0,
        restTurns = 0;
    const costs = { stamina: 0, will: 0 };
    const originalStamina = KDChangeStamina,
        originalWill = KDChangeWill;
    KDChangeStamina = function (...args) {
        const before = KinkyDungeonStatStamina;
        const result = originalStamina.apply(this, args);
        costs.stamina += Math.max(0, before - KinkyDungeonStatStamina);
        return result;
    };
    KDChangeWill = function (...args) {
        const before = KinkyDungeonStatWill;
        const result = originalWill.apply(this, args);
        costs.will += Math.max(0, before - KinkyDungeonStatWill);
        return result;
    };
    KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsEscapeAnalysis", (_event, data) => {
        if (data.delta > 0) turns += data.delta;
    });
    const snapshot = () => {
        const item = target();
        return {
            turns,
            density: Spiderlings.SilkDensity.state().value,
            quietAge: Spiderlings.SilkDensity.state().bareTurns,
            stamina: KinkyDungeonStatStamina,
            will: KinkyDungeonStatWill,
            mana: KinkyDungeonStatMana,
            present: !!item,
            cut: item?.cutProgress || 0,
            struggle: item?.struggleProgress || 0,
            remaining: worn().length,
            room: KDGameData.RoomType,
            lastAction: KinkyDungeonLastAction,
            layers:
                Spiderlings.SpinnerNativeField.compositeById(Spiderlings.PrisonConstruction.COMPOSITE)?.layerIds
                    .length || 0,
        };
    };
    const trace = [],
        initial = snapshot();
    const wait = async (reason) => {
        const before = turns;
        KinkyDungeonLastAction = "Wait";
        const result = KDSendInput("tick", { delta: 1 });
        await frame();
        trace.push({ action: reason, result, ...snapshot() });
        return turns > before;
    };
    let outcome = "turn-budget";
    try {
        if (spec.spell) KDPushSpell(KinkyDungeonFindSpell(spec.spell, true));
        for (let n = 0; n < (spec.precasts || 0) && turns < spec.maxTurns; n++) {
            const spell = KinkyDungeonFindSpell(spec.spell, true);
            if (!KinkyDungeonHasMana(KinkyDungeonGetManaCost(spell))) break;
            const before = snapshot();
            const result = KDSendInput("tryCastSpell", {
                tx: n % 2 ? 11 : 14,
                ty: 22,
                spellname: spec.spell,
                player: KDPlayer(),
            });
            await frame();
            trace.push({ action: "prepared-cast", result, before, ...snapshot() });
        }
        for (let n = 0; n < spec.quietTurns && target() && turns < spec.maxTurns; n++)
            if (!(await wait("quiet"))) throw Error("Native quiet input did not advance time.");
        const afterQuiet = snapshot();
        while (target() && turns < spec.maxTurns) {
            const linked = worn().filter(({ item }) => KDRestraint(item).Group === template.Group);
            const index = linked.findIndex(({ item }) => item === target());
            const data = {};
            const query = KinkyDungeonStruggle(template.Group, spec.method, index, true, data);
            if (spec.method === "Cut" && !data.canCut && !data.hasAffinity) {
                outcome = "missing-tool";
                break;
            }
            if (KinkyDungeonStatStamina < -data.cost || query === "Will") {
                restTurns++;
                if (!(await wait("rest"))) {
                    outcome = "blocked";
                    break;
                }
                continue;
            }
            const before = turns;
            const result = KDSendInput("struggle", { group: template.Group, type: spec.method, index });
            await frame();
            actions++;
            trace.push({ action: spec.method, result, query, effectiveRate: data.escapeChance, ...snapshot() });
            if (turns === before) {
                outcome = "blocked";
                break;
            }
            while (target() && KDGameData.DelayedActions.length && turns < spec.maxTurns)
                if (!(await wait("delayed"))) throw Error("Native delayed action did not advance time.");
        }
        if (!target()) outcome = "escaped";
        return {
            ...spec,
            rngSeed: KinkyDungeonSeed,
            outcome,
            turns,
            actions,
            restTurns,
            costs,
            initial,
            afterQuiet,
            final: snapshot(),
            parameters: Object.fromEntries(fields.map((field) => [field, template[field]])),
            trace,
        };
    } finally {
        KDChangeStamina = originalStamina;
        KDChangeWill = originalWill;
        delete KDEventMapGeneric.tickAfter.SpiderlingsEscapeAnalysis;
        for (const field of fields) template[field] = originals[field];
    }
}

function markdown(report) {
    return [
        "# Spiderlings 原生脱困实验",
        "",
        `游戏 ${report.game.version}，Mod ${report.loaded.build}，ZIP SHA-256 ${report.loaded.packageSha256}。`,
        `游戏提交或 bundle：${report.game.commit || report.game.mainSha256}。`,
        `状态：${report.status}。全部样本与逐步轨迹保存在 result.json。`,
        "",
        "| 场景 | 目标拘束移除/样本 | 拘束阶段观察回合，含截尾 | 脱困行动数 | 拘束阶段精力支出，Stat 单位 |",
        "| --- | --- | --- | --- | --- |",
        ...summarize(report.rows).map(
            (row) =>
                `| ${row.label} | ${row.escaped}/${row.samples} | ${row.observedTurns.join("–")} | ${row.actions.join(", ")} | ${row.staminaSpent.map((value) => value.toFixed(2)).join(", ")} |`,
        ),
        ...(report.fixture
            ? [
                  "",
                  "| 场景 | 种子 | 拘束阶段结果 | 完整路线结果 | 总世界回合 |",
                  "| --- | --- | --- | --- | --- |",
                  ...report.rows.map(
                      (row) =>
                          `| ${row.label} | ${row.seed} | ${row.outcome} | ${row.route?.outcome || "cocoon-not-removed"} | ${row.turns + (row.route?.turns || 0)} |`,
                  ),
              ]
            : []),
        "",
        ...report.limitations.map((line) => `- ${line}`),
        "",
    ].join("\n");
}

async function analyze(options) {
    const input = readJson(options.runtime),
        game = input.game || input;
    if (!game.root || !game.version || !game.mainSha256) throw Error("Runtime needs root, version and mainSha256.");
    if (hash(path.join(game.overlay || game.root, "out/main.js")) !== game.mainSha256)
        throw Error("Runtime bundle changed. Prepare the intended game again.");
    if (game.commit && git(game.root, "rev-parse", "HEAD") !== game.commit)
        throw Error("Runtime source/assets moved to another commit. Use the current latest.json.");
    let saved;
    if (options.save) {
        const codec = nativeCodec(path.join(game.root, "Scripts/lib/LZString.js"));
        const slot = saveSlots(readSaveInput(options.save), codec)[options.slot - 1];
        if (!slot?.save) throw Error(slot?.error || "Requested save slot is missing.");
        saved = codec.compressToBase64(JSON.stringify(slot.save));
    }
    const plan = readJson(options.plan),
        cases = expandPlan(plan, !!saved),
        scratch = path.join(root, ".scratch"),
        output = path.resolve(options.output || path.join(scratch, "escape-analysis", randomUUID())),
        relative = path.relative(scratch, output);
    if (options.save && plan.preparation) throw Error("Choose a saved input or generated preparation, not both.");
    if (!relative || path.isAbsolute(relative) || relative === ".." || relative.startsWith(`..${path.sep}`))
        throw Error("Analysis output belongs in this checkout's .scratch directory.");
    if (fs.existsSync(output)) throw Error("Output already exists; choose a new experiment directory.");
    fs.mkdirSync(output, { recursive: true });
    const report = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        sourceCommit: git(root, "rev-parse", "HEAD"),
        analysisSha256: hash(__filename),
        prisonAnalysisSha256: plan.preparation ? hash(path.join(__dirname, "escape-prison.js")) : null,
        game,
        inputSaveSha256: options.save ? hash(options.save) : null,
        inputSlot: options.save ? options.slot : null,
        resourceUnits: "Native KinkyDungeonStatStamina / KinkyDungeonStatWill units, not HUD-scaled numbers.",
        plan,
        rows: [],
        status: "running",
        limitations: [
            plan.preparation === "mature-prison"
                ? "真实四层施工与敌人保留的监牢样本；准备阶段维持资源，正式尝试只使用存档起始资源与原生恢复。"
                : saved
                  ? "从复制的原生存档分别重载各样本。仅执行指定拘束的脱困与等待，不搜索完整离场路线。"
                  : "空房受控实验，装备、工具和初始密度按计划准备；没有敌人、修补、攻击或围场。",
            "资源只在开始时由 fixture 或存档提供，之后遵循原生支出与等待恢复。回合包括准备等待、休息和延迟结算。",
            "未脱困和预算耗尽样本保留。小样本用于配对校准，不估算玩家总体成功率或尾部分位数。",
            "脚本使用已知地图的固定路线与有限战术；失败不证明玩家无解。实验输出不是完整兼容验收或维护者玩法验收。",
        ],
    };
    const runtime = await createRuntime(game, output);
    try {
        report.loaded = await loadPackage(runtime.page, path.resolve(options.package));
        if (report.loaded.version !== game.version) throw Error("Loaded game version differs from runtime input.");
        await runtime.page.evaluate(
            fs.readFileSync(path.join(__dirname, "compatibility/browser/normal-helpers.js"), "utf8"),
        );
        if (plan.preparation === "mature-prison") {
            const fixture = await runtime.page.evaluate(prepareMaturePrison);
            saved = fixture.saved;
            writeText(path.join(output, "mature-save.txt"), saved);
            delete fixture.saved;
            report.fixture = { ...fixture, saveSha256: hash(path.join(output, "mature-save.txt")) };
            writeJson(path.join(output, "result.json"), report);
            console.log(
                `${game.version}: prepared ${fixture.layers} closed layers in ${fixture.preparationTurns} turns`,
            );
        }
        for (const spec of cases) {
            await runtime.setContext({ group: "escape-analysis", scenario: spec.label, seed: spec.seed });
            const { route: followRoute, ...caseSpec } = spec;
            const row = await runtime.page.evaluate(runCase, { spec: caseSpec, saved, fields: parameterFields });
            if (followRoute && row.outcome === "escaped")
                row.route = await runtime.page.evaluate(runPrisonRoute, {
                    source: report.fixture.source,
                    prisonRoom: report.fixture.prisonRoom,
                    maxTurns: Math.max(0, spec.maxTurns - row.turns),
                    spell: spec.spell,
                });
            else if (followRoute) row.route = { outcome: "cocoon-not-removed", turns: 0 };
            report.rows.push(row);
            writeJson(path.join(output, "result.json"), report);
            console.log(
                `${game.version} ${spec.label} ${spec.seed}: ${row.outcome}, ${row.turns} turns${row.route ? `; route ${row.route.outcome}, ${row.route.turns} turns` : ""}`,
            );
        }
        await runtime.settleAssets();
        report.errors = [
            ...runtime.errors,
            ...(await runtime.page.evaluate(() => globalThis.compatibilityRejections)),
        ].filter((error) => !error.startsWith("The play() request was interrupted by a call to pause()."));
        report.missing = runtime.missing.filter((url) => /Spiderlings|SpiderWeb|WebSpray/.test(url));
        if (report.errors.length || report.missing.length) throw Error("Native runtime or Mod assets failed.");
        report.status = "completed";
    } catch (error) {
        report.status = "failed";
        report.error = error.stack;
        throw error;
    } finally {
        writeJson(path.join(output, "result.json"), report);
        if (report.loaded) writeText(path.join(output, "REPORT.md"), markdown(report));
        await runtime.close();
    }
    return { output, status: report.status, rows: report.rows.length, summary: summarize(report.rows) };
}

if (require.main === module)
    analyze(parseArguments(process.argv.slice(2)))
        .then(({ output, status, rows }) => console.log(JSON.stringify({ output, status, rows })))
        .catch((error) => {
            console.error(error.stack);
            process.exitCode = 1;
        });

module.exports = { parseArguments, expandPlan, summarize, runCase, analyze };
