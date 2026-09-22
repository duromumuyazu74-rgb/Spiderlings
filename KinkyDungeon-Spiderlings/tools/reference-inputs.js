"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const repositoryRoot = path.resolve(__dirname, "../..");
const inputNames = ["KinkiestDungeon-5.5", "T‘s NEW Webbing LV1", "T‘s NEW Webbing LV2"];

function assertNoSharedInputLinks(root = repositoryRoot) {
    for (const name of [...inputNames, "node_modules"]) {
        const entry = fs.lstatSync(path.join(root, name), { throwIfNoEntry: false });
        if (entry?.isSymbolicLink())
            throw new Error(`Shared input link is unsafe inside a checkout: ${name}. See docs/DEVELOPMENT.md.`);
    }
}

function within(root, candidate) {
    const relative = path.relative(root, candidate);
    return (
        relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`))
    );
}

function referenceInput(name, options = {}) {
    if (!inputNames.includes(name)) throw new Error(`Unknown reference input: ${name}`);
    const root = options.repositoryRoot || repositoryRoot;
    assertNoSharedInputLinks(root);
    const env = options.env || process.env;
    let configured = env.SPIDERLINGS_REFERENCE_ROOT;
    if (!configured) {
        const result = spawnSync("git", ["config", "--get", "spiderlings.referenceRoot"], {
            cwd: root,
            encoding: "utf8",
            env,
        });
        if (result.error) throw result.error;
        if (result.status !== 0 && result.status !== 1)
            throw new Error(result.stderr || "Cannot read reference configuration.");
        configured = result.stdout.trim();
    }
    if (!configured || !path.isAbsolute(configured)) {
        throw new Error(
            "Set SPIDERLINGS_REFERENCE_ROOT or git config spiderlings.referenceRoot to an absolute external input directory. See docs/DEVELOPMENT.md; do not create junctions.",
        );
    }
    const candidate = path.join(configured, name);
    const actualRoot = fs.realpathSync(root);
    if (within(root, candidate) || within(actualRoot, fs.realpathSync(configured))) {
        throw new Error("Reference inputs must be outside the checkout.");
    }
    if (!fs.lstatSync(candidate).isDirectory() || fs.lstatSync(candidate).isSymbolicLink()) {
        throw new Error(`Reference input must be a real directory, not a junction or symlink: ${candidate}`);
    }
    const actual = fs.realpathSync(candidate);
    if (within(actualRoot, actual)) throw new Error("Reference inputs must be outside the checkout.");
    return actual;
}

const gamePath = (...parts) => path.join(referenceInput(inputNames[0]), ...parts);
function artworkPath(level, ...parts) {
    if (level !== 1 && level !== 2) throw new Error("Artwork level must be 1 or 2.");
    return path.join(referenceInput(inputNames[level]), ...parts);
}

module.exports = { referenceInput, gamePath, artworkPath, assertNoSharedInputLinks };
