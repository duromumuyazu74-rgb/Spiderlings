"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function nativeCodec(file) {
    const context = { module: { exports: {} } };
    vm.runInNewContext(fs.readFileSync(file, "utf8"), context, { filename: file });
    return context.module.exports;
}

function decodeSave(content, codec) {
    if (content && typeof content === "object") return content;
    if (typeof content !== "string" || !content.trim()) throw Error("Empty save content.");
    const text = content.trim();
    if (text.startsWith("{")) return JSON.parse(text);
    if (!codec) throw Error("Encoded saves need --codec <native Scripts/lib/LZString.js>.");
    const decoded = codec.decompressFromBase64(text);
    if (!decoded) throw Error("Native save decoding failed.");
    return JSON.parse(decoded);
}

const enemyName = (actor) => (typeof actor.Enemy === "string" ? actor.Enemy : actor.Enemy?.name);
const position = (point) => point && { x: point.x, y: point.y };

function mapSummary(map, location, room, current = false) {
    const entities = map.Entities || [];
    const encounter = map.SpiderlingsSpinnerEncounter;
    const plans = Object.values(encounter?.ai?.plans || {});
    const spinners = entities.filter((actor) => enemyName(actor) === "Spinner" && actor.hp > 0);
    const nests = entities.filter((actor) => enemyName(actor) === "NestEntrance" && actor.hp > 0);
    const objective = map.SpiderlingsHuntingGrounds || map.SpiderlingsInfestation;
    return {
        location,
        room,
        current,
        mapMod: map.MapMod,
        escapeMethod: map.EscapeMethod,
        dimensions: { width: map.GridWidth, height: map.GridHeight },
        entities: entities.length,
        spinners: spinners.length,
        nests: nests.length,
        spinnerAI: Object.fromEntries(
            [...new Set(spinners.map((actor) => actor.AI || actor.Enemy?.AI || "unknown"))].map((ai) => [
                ai,
                spinners.filter((actor) => (actor.AI || actor.Enemy?.AI || "unknown") === ai).length,
            ]),
        ),
        projects: plans.map((plan) => ({
            id: plan.id,
            center: position(plan.center),
            status: plan.status,
            phases: (plan.fieldIds || []).map((id) => encounter.topology?.fields?.[id]?.phase),
        })),
        objective: objective && {
            status: objective.status,
            reason: objective.reason,
            target: objective.target,
            destroyed: objective.destroyedIds?.length || 0,
            complete: objective.complete,
            liveTargets: entities.filter((actor) => actor.hp > 0 && objective.targetIds?.includes(actor.id)).length,
        },
    };
}

function inventorySave(save) {
    const maps = [];
    const currentLocation =
        typeof save.KDCurrentWorldSlot === "object"
            ? `${save.KDCurrentWorldSlot.x},${save.KDCurrentWorldSlot.y}`
            : save.KDCurrentWorldSlot || `${save.KDGameData?.JourneyX || 0},${save.KDGameData?.JourneyY ?? save.level}`;
    if (save.KDMapData) maps.push(mapSummary(save.KDMapData, currentLocation, save.KDMapData.RoomType || "", true));
    for (const [location, world] of Object.entries(save.KDWorldMap || {}))
        for (const [room, map] of Object.entries(world.data || {}))
            if (map && map !== save.KDMapData) maps.push(mapSummary(map, location, room));
    return { level: save.level, gameVersion: save.version, currentLocation, maps };
}

function saveSlots(input, codec) {
    return (Array.isArray(input.slots) ? input.slots : [{ content: input }]).map((slot, index) => {
        try {
            return { slot: index + 1, save: decodeSave(slot.content, codec) };
        } catch (error) {
            return { slot: index + 1, error: error.message };
        }
    });
}

function readSaveInput(file) {
    const text = fs
        .readFileSync(file, "utf8")
        .replace(/^\uFEFF/, "")
        .trim();
    return text.startsWith("{") ? JSON.parse(text) : text;
}

function selectMap(save, location, room = "") {
    const map = save.KDWorldMap?.[location]?.data?.[room];
    if (!map) throw Error(`No visited map at ${location}, room ${room || "ordinary"}.`);
    return map;
}

function inspectSaves(input, codec) {
    const slots = saveSlots(input, codec).map((entry) =>
        entry.save ? { slot: entry.slot, ...inventorySave(entry.save) } : entry,
    );
    const usable = slots.some((entry) => !entry.error);
    return { status: !usable ? "failed" : slots.some((entry) => entry.error) ? "partial" : "passed", slots };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2),
            file = args.shift();
        let codec;
        if (args[0] === "--codec" && args[1]) {
            codec = nativeCodec(path.resolve(args[1]));
            args.splice(0, 2);
        }
        if (!file || args.length)
            throw Error("Usage: node tools/save-diagnostics.js <save-or-slots> [--codec <native-codec.js>]");
        const result = inspectSaves(readSaveInput(file), codec);
        console.log(JSON.stringify(result, null, 2));
        if (result.status === "failed") process.exitCode = 1;
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = {
    nativeCodec,
    decodeSave,
    mapSummary,
    inventorySave,
    saveSlots,
    readSaveInput,
    selectMap,
    inspectSaves,
};
