"use strict";

const assert = require("node:assert/strict");
const { readdirSync, readFileSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const suite = process.argv[2] || "all";
assert.ok(["public", "all"].includes(suite), "Choose public or all tests.");
const suites = JSON.parse(readFileSync(path.join(__dirname, "test-suites.json"), "utf8"));
const registered = [...suites.public, ...suites.local];
const testRoot = path.join(__dirname, "tests");
const available = readdirSync(testRoot).filter((name) => name.endsWith(".test.js"));
assert.deepEqual(
    [...registered].sort(),
    available.sort(),
    "Register every test file exactly once in test-suites.json.",
);
const tests = (suite === "public" ? suites.public : registered).map((name) => path.join(testRoot, name));
const result = spawnSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
