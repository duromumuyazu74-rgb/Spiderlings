"use strict";

const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");
const { auditRepository, selectAffected } = require("./check-spiderlings-modules.js");

const suite = process.argv[2] || "all";
assert.ok(["public", "all", "affected"].includes(suite), "Choose public, all or affected tests.");
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
if (suite === "affected") {
    const args = process.argv.slice(3);
    assert.ok(!args.length || (args.length === 2 && args[0] === "--base"), "Use affected [--base <ref>].");
    const root = path.resolve(__dirname, "../.."),
        base = args[1] || "HEAD";
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" });
    git("rev-parse", "--verify", `${base}^{commit}`);
    const changed = (
        git("diff", "--name-only", "--no-renames", "-z", base, "--") +
        git("ls-files", "--others", "--exclude-standard", "-z")
    )
        .split("\0")
        .filter(Boolean);
    const errors = auditRepository();
    assert.deepEqual(errors, [], errors.join("\n"));
    const selection = selectAffected(changed, suites);
    selected = selection.tests;
    console.log(`Affected areas: ${selection.areas.join(", ") || "none"}; ${selected.length} public test files.`);
    if (selection.unknown.length) console.log(`Full public fallback for: ${selection.unknown.join(", ")}`);
    console.log(
        selection.nativeScope === "full"
            ? "Native follow-up: complete compatibility suite (shared or unclassified changes)."
            : `Native follow-up: ${selection.scenarios.join(", ") || "none for this change"}.`,
    );
    console.log("Focused checks do not replace final full same-ZIP dual-version acceptance.");
}
const tests = selected.map((name) => path.join(testRoot, name));
if (!tests.length) process.exit(0);
const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
