"use strict";

const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { auditRepository } = require("./check-spiderlings-modules.js");
const { selectAffected, validateMappings, collectChanges } = require("./test-impact.js");

const suite = process.argv[2] || "all";
assert.ok(
    ["public", "all", "affected", "preflight"].includes(suite),
    "Choose public, all, affected or preflight tests.",
);
const suites = JSON.parse(readFileSync(path.join(__dirname, "test-suites.json"), "utf8"));
const registered = [...suites.public, ...suites.local];
const testRoot = path.join(__dirname, "tests");
const available = readdirSync(testRoot).filter((name) => name.endsWith(".test.js"));
assert.deepEqual(
    [...registered].sort(),
    available.sort(),
    "Register every test file exactly once in test-suites.json.",
);
let selected = suite === "public" ? suites.public : registered;
let policyTests = false;
if (suite === "affected" || suite === "preflight") {
    const args = process.argv.slice(3);
    let base = "HEAD",
        planOnly = false,
        includeLocal = suite === "preflight";
    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--plan") planOnly = true;
        else if (args[i] === "--include-local") includeLocal = true;
        else if (args[i] === "--base" && args[i + 1] && !args[i + 1].startsWith("--")) base = args[++i];
        else throw Error("Use affected [--base <ref>] [--plan] [--include-local], or preflight [--base <ref>].");
    }
    const root = path.resolve(__dirname, "../..");
    if (suite === "preflight") {
        assert.ok(!planOnly, "Preflight executes checks; use affected --plan to preview selection.");
        const check = spawnSync(
            process.execPath,
            [path.join(root, ".github/scripts/check-repository.mjs"), "--base", base],
            {
                cwd: root,
                stdio: "inherit",
                windowsHide: true,
            },
        );
        if (check.error) throw check.error;
        if (check.status !== 0) process.exit(check.status ?? 1);
    }
    const manifest = JSON.parse(readFileSync(path.join(__dirname, "../mod.json"), "utf8").replace(/^\uFEFF/, ""));
    const errors = [...auditRepository(), ...validateMappings(suites, manifest)];
    assert.deepEqual(errors, [], errors.join("\n"));
    const selection = selectAffected(collectChanges(root, base), suites);
    if (planOnly) {
        console.log(
            JSON.stringify({ ...selection, base, localExecution: includeLocal ? "selected" : "reported" }, null, 2),
        );
        process.exit(selection.status === "ready" ? 0 : 2);
    }
    if (selection.unknown.length) {
        console.error(`Test mapping required for: ${selection.unknown.join(", ")}. No tests were launched.`);
        process.exit(2);
    }
    selected = [...selection.tests, ...(includeLocal ? selection.localTests : [])];
    policyTests = selection.policyTests;
    console.log(
        `Affected areas: ${selection.areas.join(", ") || "none"}; ${selection.tests.length} public and ${selection.localTests.length} local contract files.`,
    );
    for (const reason of selection.reasons)
        console.log(
            `${reason.file}: ${reason.kind}${reason.symbols?.length ? ` (${reason.symbols.join(", ")})` : ""} -> ${reason.profiles.join(", ") || reason.tests?.join(", ") || reason.kind}`,
        );
    console.log(
        selection.nativeScope === "full"
            ? "Native follow-up: full suite, because the mapped shared interface affects every state group."
            : `Native follow-up: ${selection.scenarios.join(", ") || "none"}.`,
    );
    console.log(
        "Native follow-up is a recommendation, not an executed game check; final delivery gates remain separate.",
    );
    if (!includeLocal && selection.localTests.length)
        console.log(`Local contracts not run; use --include-local: ${selection.localTests.join(", ")}`);
}
const tests = selected.map((name) => path.join(testRoot, name));
if (policyTests) tests.push(path.resolve(__dirname, "../../.github/scripts/check-repository.test.mjs"));
if (!tests.length) process.exit(0);
const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
