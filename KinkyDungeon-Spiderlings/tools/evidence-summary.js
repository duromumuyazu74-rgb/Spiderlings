"use strict";

const { readJson } = require("./task-runner.js");
const text = (value) => (typeof value === "string" ? value.slice(0, 160) : undefined);
const scalar = (value) => (typeof value === "number" || typeof value === "boolean" ? value : text(value));

function summarizeRow(row) {
    const output = {};
    for (const key of [
        "name",
        "status",
        "seed",
        "zone",
        "floor",
        "modifier",
        "method",
        "canEscape",
        "mapMod",
        "guardAI",
        "page",
        "rows",
        "cancelled",
        "reason",
        "paid",
        "paidTurns",
        "capture",
        "phase",
        "generationMs",
        "firstTurnMs",
        "initialProjects",
        "count",
        "turn",
        "i",
    ])
        if (row[key] !== undefined) output[key] = scalar(row[key]);
    if (Array.isArray(row.phases)) output.phases = row.phases.slice(0, 10).map(text);
    if (row.objective)
        output.objective = Object.fromEntries(
            ["status", "reason", "target", "destroyed", "complete"]
                .filter((key) => row.objective[key] !== undefined)
                .map((key) => [key, scalar(row.objective[key])]),
        );
    if (Array.isArray(row.imageFiles)) {
        output.evidence = row.imageFiles.slice(0, 20).map(text);
        output.evidenceOmitted = Math.max(0, row.imageFiles.length - 20);
    }
    return output;
}

function summarizeResult(result) {
    if (!result || typeof result !== "object") return {};
    if (Array.isArray(result))
        return {
            count: result.length,
            rows: result.slice(0, 12).map(summarizeRow),
            omitted: Math.max(0, result.length - 12),
        };
    const output = summarizeRow(result);
    for (const key of ["before", "after"]) if (result[key]) output[key] = summarizeRow(result[key]);
    for (const key of ["paidActions", "pickups", "target", "destroyed", "complete", "turns", "attempts"])
        if (result[key] !== undefined && !Array.isArray(result[key])) output[key] = scalar(result[key]);
    if (Array.isArray(result.turns)) {
        output.paidTurns = result.turns.length;
        output.last = summarizeRow(result.turns.at(-1) || {});
        output.phaseChanges = result.turns
            .filter((row, index, rows) => JSON.stringify(row.phases) !== JSON.stringify(rows[index - 1]?.phases))
            .slice(0, 20)
            .map(summarizeRow);
    }
    if (Array.isArray(result.staffing)) output.staffing = result.staffing.slice(0, 12).map(summarizeRow);
    if (Array.isArray(result.pages)) output.pages = result.pages.slice(0, 12).map(summarizeRow);
    return output;
}

function summarizeEvidence(input, scenario) {
    const checks = Array.isArray(input.checks) ? input.checks : null;
    if (scenario && !checks?.some((check) => check.name === scenario)) throw Error(`No scene named ${scenario}.`);
    const output = {
        status: input.status,
        gameVersion: input.game?.version || input.gameVersion,
        packageSha256: input.packageSha256,
        upstreamCommit: input.upstream?.commit || input.game?.commit,
        mode: input.verification?.mode,
        recordedErrors: Array.isArray(input.errors) ? input.errors.length : undefined,
    };
    if (checks)
        output.scenes = checks
            .filter((check) => !scenario || check.name === scenario)
            .map((check) => ({ name: text(check.name), status: text(check.status), ...summarizeResult(check.result) }));
    else output.result = summarizeResult(input);
    return output;
}

if (require.main === module) {
    try {
        const [file, scenario, extra] = process.argv.slice(2);
        if (!file || extra) throw Error("Usage: node tools/evidence-summary.js <result.json> [scene]");
        console.log(JSON.stringify({ file, ...summarizeEvidence(readJson(file), scenario) }, null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { summarizeEvidence, summarizeResult };
