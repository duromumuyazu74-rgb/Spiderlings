"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { git, gameVersion, syncUpstream } = require("../compatibility/prepare.js");

test("upstream sync follows new commits even when the gameplay version does not change, preserving local edits", () => {
    const parent = path.resolve(__dirname, "../../../.scratch/compatibility-tests");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "sync-"));
    const source = path.join(root, "official"),
        cache = path.join(root, "cache");
    fs.mkdirSync(source);
    git(source, "init", "-b", "5.5");
    const writeVersion = () => {
        const file = path.join(source, "Screens/MiniGame/KinkyDungeon/Text_KinkyDungeon.csv");
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, 'KDVersionStr,"5.5.3"\n');
    };
    const commit = () => {
        git(source, "add", ".");
        git(
            source,
            "-c",
            "user.name=Compatibility test",
            "-c",
            "user.email=test@example.invalid",
            "commit",
            "-m",
            "fixture",
        );
        return git(source, "rev-parse", "HEAD");
    };
    writeVersion();
    fs.writeFileSync(path.join(source, "behavior.txt"), "first\n");
    const first = commit();
    const initial = syncUpstream(cache, source);
    assert.equal(initial.commit, first);
    assert.equal(gameVersion(initial.root), "5.5.3");
    assert.equal(syncUpstream(cache, source).updated, false);
    fs.writeFileSync(path.join(source, "behavior.txt"), "second\n");
    const second = commit();
    const updated = syncUpstream(cache, source);
    assert.equal(updated.commit, second);
    assert.equal(updated.previousCommit, first);
    assert.equal(updated.updated, true);
    assert.equal(fs.readFileSync(path.join(updated.root, "behavior.txt"), "utf8").trim(), "second");
    fs.writeFileSync(path.join(updated.root, "behavior.txt"), "local work\n");
    assert.throws(() => syncUpstream(cache, source), /local changes/);
    assert.equal(fs.readFileSync(path.join(updated.root, "behavior.txt"), "utf8"), "local work\n");
    assert.throws(() => syncUpstream(cache, source + "-different"), /different origin/);
});
