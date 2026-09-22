"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync, spawnSync } = require("node:child_process");
const { referenceInput, assertNoSharedInputLinks } = require("../reference-inputs.js");
const repository = path.resolve(__dirname, "../../..");
const cleanup = path.resolve(__dirname, "../remove-safe-worktree.ps1");

function fixture(t) {
    const scratch = path.join(repository, ".scratch/worktree-safety");
    fs.mkdirSync(scratch, { recursive: true });
    const root = fs.mkdtempSync(path.join(scratch, "case-"));
    t.diagnostic(`Disposable fixture retained at ${root}`);
    const primary = path.join(root, "primary repo");
    const linked = path.join(root, "linked checkout");
    const inputs = path.join(root, "external inputs");
    fs.mkdirSync(primary);
    fs.mkdirSync(inputs);
    const env = { ...process.env };
    for (const key of Object.keys(env)) if (/^GIT_/i.test(key) || key === "SPIDERLINGS_REFERENCE_ROOT") delete env[key];
    env.GIT_CONFIG_NOSYSTEM = "1";
    env.GIT_CONFIG_GLOBAL = path.join(root, "empty-config");
    fs.writeFileSync(env.GIT_CONFIG_GLOBAL, "");
    const git = (args, cwd = primary) =>
        execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.name", "Worktree safety test"]);
    git(["config", "user.email", "worktree-test@example.invalid"]);
    fs.writeFileSync(path.join(primary, ".gitignore"), "ignored/\n");
    fs.writeFileSync(path.join(primary, "tracked.txt"), "keep\n");
    git(["add", "."]);
    git(["commit", "-qm", "fixture"]);
    git(["worktree", "add", "--detach", linked, "HEAD"]);
    const options = { repositoryRoot: linked, env };
    const run = (target = linked, args = []) =>
        spawnSync(
            "powershell.exe",
            ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", cleanup, "-Worktree", target, ...args],
            { env, encoding: "utf8" },
        );
    return { primary, linked, inputs, env, git, options, run };
}

test("external input configuration is shared by worktrees and environment override is explicit", (t) => {
    const f = fixture(t);
    const game = path.join(f.inputs, "KinkiestDungeon-5.5");
    fs.mkdirSync(game);
    assert.throws(() => referenceInput("KinkiestDungeon-5.5", f.options), /Set SPIDERLINGS_REFERENCE_ROOT/);
    f.git(["config", "--local", "spiderlings.referenceRoot", f.inputs]);
    assert.equal(referenceInput("KinkiestDungeon-5.5", f.options), fs.realpathSync(game));
    const other = path.join(f.inputs, "override");
    fs.mkdirSync(path.join(other, "KinkiestDungeon-5.5"), { recursive: true });
    assert.equal(
        referenceInput("KinkiestDungeon-5.5", { ...f.options, env: { ...f.env, SPIDERLINGS_REFERENCE_ROOT: other } }),
        fs.realpathSync(path.join(other, "KinkiestDungeon-5.5")),
    );
    assert.throws(
        () =>
            referenceInput("KinkiestDungeon-5.5", {
                ...f.options,
                env: { ...f.env, SPIDERLINGS_REFERENCE_ROOT: "relative" },
            }),
        /absolute external/,
    );
    assert.throws(
        () =>
            referenceInput("KinkiestDungeon-5.5", {
                ...f.options,
                env: { ...f.env, SPIDERLINGS_REFERENCE_ROOT: f.linked },
            }),
        /outside the checkout/,
    );
});

test("repository checks reject shared input and dependency links without following or deleting targets", (t) => {
    const f = fixture(t);
    const sentinel = path.join(f.inputs, "sentinel.txt");
    fs.writeFileSync(sentinel, "retain external content\n");
    for (const name of ["KinkiestDungeon-5.5", "T‘s NEW Webbing LV1", "T‘s NEW Webbing LV2", "node_modules"]) {
        const link = path.join(f.linked, name);
        fs.symlinkSync(f.inputs, link, process.platform === "win32" ? "junction" : "dir");
        try {
            assert.throws(() => assertNoSharedInputLinks(f.linked), /Shared input link is unsafe/);
            assert.equal(fs.readFileSync(sentinel, "utf8"), "retain external content\n");
        } finally {
            // unlink removes the link itself. No recursive deletion is used in these fixtures.
            fs.unlinkSync(link);
        }
        assert.equal(fs.readFileSync(sentinel, "utf8"), "retain external content\n");
    }
});

test(
    "Windows cleanup refuses junctions including nested ignored links and linked ancestors",
    { skip: process.platform !== "win32" },
    (t) => {
        const f = fixture(t);
        const sentinel = path.join(f.inputs, "sentinel.txt");
        fs.writeFileSync(sentinel, "preserved");
        fs.mkdirSync(path.join(f.linked, "ignored"));
        const link = path.join(f.linked, "ignored/shared");
        fs.symlinkSync(f.inputs, link, "junction");
        try {
            for (const args of [[], ["-Execute", "-KeepRef", "refs/heads/main"]]) {
                const result = f.run(f.linked, args);
                assert.notEqual(result.status, 0);
                assert.match(result.stderr + result.stdout, /Refusing linked entry/);
                assert.equal(fs.readFileSync(sentinel, "utf8"), "preserved");
                assert.ok(fs.existsSync(path.join(f.linked, "tracked.txt")));
            }
        } finally {
            fs.unlinkSync(link);
        }
        const ancestor = path.join(f.inputs, "checkout-alias");
        fs.symlinkSync(f.linked, ancestor, "junction");
        try {
            const result = f.run(ancestor, ["-Execute", "-KeepRef", "refs/heads/main"]);
            assert.notEqual(result.status, 0);
            assert.match(result.stderr + result.stdout, /Refusing reparse-point ancestor/);
        } finally {
            fs.unlinkSync(ancestor);
        }
        assert.equal(fs.readFileSync(sentinel, "utf8"), "preserved");
    },
);

test(
    "Windows cleanup preserves primary, dirty, ignored and unretained work",
    { skip: process.platform !== "win32" },
    (t) => {
        const f = fixture(t);
        const check = (target, pattern, args = ["-Execute", "-KeepRef", "refs/heads/main"]) => {
            const result = f.run(target, args);
            assert.notEqual(result.status, 0);
            assert.match(result.stderr + result.stdout, pattern);
            assert.ok(fs.existsSync(path.join(f.linked, "tracked.txt")));
        };
        check(f.primary, /primary working directory/);
        fs.writeFileSync(path.join(f.linked, "tracked.txt"), "changed\n");
        check(f.linked, /modified or untracked/);
        f.git(["add", "tracked.txt"], f.linked);
        check(f.linked, /modified or untracked/);
        f.git(["commit", "-qm", "unmerged fixture change"], f.linked);
        check(f.linked, /does not contain/);
        fs.mkdirSync(path.join(f.linked, "ignored"));
        fs.writeFileSync(path.join(f.linked, "ignored/output.txt"), "do not discard");
        check(f.linked, /Refusing ignored files/);
    },
);

test(
    "Windows cleanup is dry-run by default and removes only a verified retained checkout",
    { skip: process.platform !== "win32" },
    (t) => {
        const f = fixture(t);
        const preview = f.run();
        assert.equal(preview.status, 0, preview.stderr);
        assert.ok(fs.existsSync(path.join(f.linked, "tracked.txt")));
        const missing = f.run(f.linked, ["-Execute"]);
        assert.notEqual(missing.status, 0);
        assert.match(missing.stderr + missing.stdout, /KeepRef is required/);
        f.git(["worktree", "lock", f.linked]);
        const locked = f.run(f.linked, ["-Execute", "-KeepRef", "refs/heads/main"]);
        assert.notEqual(locked.status, 0);
        assert.ok(fs.existsSync(path.join(f.linked, "tracked.txt")));
        f.git(["worktree", "unlock", f.linked]);
        const result = f.run(f.linked, ["-Execute", "-KeepRef", "refs/heads/main"]);
        assert.equal(result.status, 0, result.stderr);
        assert.equal(fs.existsSync(f.linked), false);
        assert.equal(fs.readFileSync(path.join(f.primary, "tracked.txt"), "utf8"), "keep\n");
        assert.ok(f.git(["show", "refs/heads/main:tracked.txt"]).includes("keep"));
    },
);
