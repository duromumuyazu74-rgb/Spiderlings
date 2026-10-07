"use strict";
/* global KinkyDungeonDressPlayer, UpdateModels, KinkyDungeonPlayer, LZString, KDToggles, KDWorldMap,
          MiniGameKinkyDungeonLevel: writable, KinkyDungeonCreateMap, KinkyDungeonMapParams,
          MiniGameKinkyDungeonCheckpoint, Spiderlings, KDMovePlayer, KinkyDungeonPlayerEntity,
          KDMapData, KDRemoveEntity, KDGetEscapeMethod, KDCanEscape, KDGetEscapeMinimapText */

const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { createRuntime, loadPackage } = require("./compatibility/runtime.js");
const { nativeCodec, readSaveInput, saveSlots, selectMap, inventorySave } = require("./save-diagnostics.js");
const { readJson, writeJson } = require("./task-runner.js");
const { summarizeResult } = require("./evidence-summary.js");

const root = path.resolve(__dirname, "../..");

function parseReplayArguments(args) {
    const options = { slot: 1, turns: 0, room: "" };
    for (let index = 0; index < args.length; index++) {
        const key = args[index].replace(/^--/, "");
        if (key === "isolate-mobile-npcs") options.isolate = true;
        else if (
            ["save", "slot", "runtime", "package", "location", "room", "center", "turns", "output"].includes(key) &&
            args[index + 1] !== undefined
        )
            options[key] = args[++index];
        else throw Error(`Unknown or incomplete replay argument ${args[index]}.`);
    }
    options.slot = Number(options.slot);
    options.turns = Number(options.turns);
    if (
        !options.save ||
        !options.runtime ||
        !options.package ||
        !Number.isSafeInteger(options.slot) ||
        options.slot < 1 ||
        !Number.isSafeInteger(options.turns) ||
        options.turns < 0
    )
        throw Error("Replay needs save, runtime, package, a positive slot and nonnegative turns.");
    if (options.location && !/^-?\d+,-?\d+$/.test(options.location)) throw Error("Location must be x,y.");
    if (options.center && !/^\d+,\d+$/.test(options.center)) throw Error("Center must be x,y.");
    return options;
}

async function replaySave(options) {
    const game = readJson(options.runtime).game;
    if (!game?.root) throw Error("Runtime input must be a compatibility result containing game.root.");
    const codec = nativeCodec(path.join(game.root, "Scripts/lib/LZString.js"));
    const slot = saveSlots(readSaveInput(options.save), codec)[options.slot - 1];
    if (!slot?.save) throw Error(slot?.error || "No save in the requested slot.");
    if (options.location) selectMap(slot.save, options.location, options.room);
    const scratch = path.join(root, ".scratch");
    const output = path.resolve(options.output || path.join(scratch, "save-replay", randomUUID()));
    const relative = path.relative(scratch, output);
    if (!relative || path.isAbsolute(relative) || relative.startsWith(".."))
        throw Error("Replay output belongs in this checkout's .scratch directory.");
    if (fs.existsSync(output)) throw Error("Replay output already exists; choose a new evidence directory.");
    fs.mkdirSync(output, { recursive: true });
    const runtime = await createRuntime(game, output);
    try {
        const loaded = await loadPackage(runtime.page, path.resolve(options.package));
        await runtime.page.evaluate(
            fs.readFileSync(path.join(__dirname, "compatibility/browser/normal-helpers.js"), "utf8"),
        );
        const result = await runtime.page.evaluate(
            async ({ save, options }) => {
                const { setup, frame, restore, turn } = globalThis.normalAcceptance;
                setup("saved-map-replay");
                KinkyDungeonDressPlayer();
                UpdateModels(KinkyDungeonPlayer);
                await frame();
                restore(LZString.compressToBase64(JSON.stringify(save)));
                KDToggles.Sound = false;
                if (options.location) {
                    const [x, y] = options.location.split(",").map(Number);
                    const map = KDWorldMap[options.location].data[options.room];
                    MiniGameKinkyDungeonLevel = y;
                    KinkyDungeonCreateMap(
                        KinkyDungeonMapParams[map.MapType || MiniGameKinkyDungeonCheckpoint],
                        options.room,
                        map.MapMod,
                        y,
                        false,
                        false,
                        map.MapFaction,
                        { x, y },
                        true,
                    );
                    await frame();
                }
                const encounter = Spiderlings.SpinnerNativeField.state();
                const center = options.center?.split(",").map(Number);
                const plan =
                    center &&
                    Object.values(encounter?.ai?.plans || {}).find(
                        (entry) => entry.center?.x === center[0] && entry.center?.y === center[1],
                    );
                if (center && !plan) throw Error("No saved project at the requested center.");
                if (center) {
                    KDMovePlayer(center[0], center[1], false);
                    Spiderlings.SpinnerNativeField.onEntry(KinkyDungeonPlayerEntity);
                }
                let removed = 0;
                if (options.isolate)
                    for (const actor of [...KDMapData.Entities])
                        if (
                            !actor.Enemy.tags?.spiderlings &&
                            actor.Enemy.name !== "NestEntrance" &&
                            !actor.Enemy.immobile
                        ) {
                            KDRemoveEntity(actor, false, false);
                            removed++;
                        }
                const snapshot = () => {
                    const method = KDGetEscapeMethod(MiniGameKinkyDungeonLevel);
                    const objective = KDMapData.SpiderlingsHuntingGrounds || KDMapData.SpiderlingsInfestation;
                    return {
                        level: MiniGameKinkyDungeonLevel,
                        mapMod: KDMapData.MapMod,
                        method,
                        canEscape: KDCanEscape(method),
                        hint: KDGetEscapeMinimapText(method),
                        objective: objective && {
                            status: objective.status,
                            reason: objective.reason,
                            complete: objective.complete,
                            target: objective.target,
                            destroyed: objective.destroyedIds?.length || 0,
                        },
                        phases: plan?.fieldIds.map((id) => encounter.topology.fields[id].phase),
                        capture: Spiderlings.SpinnerCapture.state()?.phase,
                    };
                };
                const before = snapshot(),
                    turns = [];
                for (let step = 0; step < options.turns; step++) {
                    await turn();
                    turns.push({ i: step, ...snapshot() });
                    if (turns.at(-1).capture) break;
                }
                return { before, removed, turns, after: snapshot() };
            },
            { save: slot.save, options },
        );
        const evidence = {
            gameVersion: game.version,
            packageSha256: loaded.packageSha256,
            input: inventorySave(slot.save),
            ...result,
        };
        writeJson(path.join(output, "result.json"), evidence);
        await runtime.page.screenshot({ path: path.join(output, "final.png") });
        return {
            output,
            gameVersion: game.version,
            packageSha256: loaded.packageSha256,
            before: result.before,
            after: result.after,
            removed: result.removed,
            ...summarizeResult(result),
        };
    } finally {
        await runtime.close();
    }
}

if (require.main === module) {
    Promise.resolve()
        .then(() => replaySave(parseReplayArguments(process.argv.slice(2))))
        .then((result) => console.log(JSON.stringify(result, null, 2)))
        .catch((error) => {
            console.error(error.message);
            process.exitCode = 1;
        });
}

module.exports = { parseReplayArguments, replaySave };
