"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { verifyPublication } = require("../verify-spiderlings-publication.js");

function fixture(t) {
    const parent = path.resolve(__dirname, "../../../.scratch/publication-tests");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "case-"));
    t.after(() => {
        assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(parent) + path.sep));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const notes = "## English\n\nTest update.\n\n## 简体中文\n\n测试更新。\n";
    fs.writeFileSync(path.join(root, "notes.md"), notes);
    fs.writeFileSync(path.join(root, "Spiderlings_1.2.3-test.1.zip"), "accepted ZIP");
    const options = { root, tag: "v1.2.3-test.1", commit: "a".repeat(40), latest: "v1.2.4", notesPath: "notes.md" };
    const release = {
        tag_name: options.tag,
        body: notes,
        draft: false,
        prerelease: true,
        html_url: "https://github.com/owner/mod/releases/tag/v1.2.3-test.1",
        assets: [{ name: "Spiderlings_1.2.3-test.1.zip", size: 12 }],
    };
    let latest = options.latest,
        tagCommit = options.commit,
        download = "accepted ZIP",
        failDownload = false,
        formalIntegrated = true;
    const calls = [];
    const execute = (_cwd, command, args) => {
        calls.push([command, ...args]);
        if (["powershell.exe", "pwsh"].includes(command)) {
            assert.ok(args.includes("-VerifyOnly") && args.includes("-PackagePath"));
            assert.ok(!args.includes("-RunCheck"));
            return "verified";
        }
        if (command === "git")
            return args[0] === "remote"
                ? "https://github.com/owner/mod.git\n"
                : `${tagCommit}\trefs/tags/${options.tag}^{}\n`;
        if (args[0] === "api" && args[1].includes("/compare/"))
            return JSON.stringify({ status: formalIntegrated ? "ahead" : "diverged" });
        if (args[0] === "api") return JSON.stringify(args[1].endsWith("/latest") ? { tag_name: latest } : release);
        if (args[0] === "release" && args[1] === "download") {
            if (failDownload) throw new Error("download failed");
            fs.writeFileSync(path.join(args[args.indexOf("--dir") + 1], release.assets[0].name), download);
            return "";
        }
        throw new Error(`Unexpected command: ${command} ${args.join(" ")}`);
    };
    return {
        options,
        release,
        execute,
        calls,
        set: (changes) => {
            latest = changes.latest ?? latest;
            tagCommit = changes.tagCommit ?? tagCommit;
            download = changes.download ?? download;
            failDownload = changes.failDownload ?? failDownload;
            formalIntegrated = changes.formalIntegrated ?? formalIntegrated;
        },
    };
}

test("publication verification derives the repository and awaits download before comparing exact bytes", (t) => {
    const f = fixture(t),
        result = verifyPublication(f.options, f.execute);
    assert.equal(result.status, "passed");
    assert.equal(result.latest, "v1.2.4");
    assert.equal(result.package.size, 12);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, "verification.json"))).commit, f.options.commit);
    assert.ok(f.calls.some((call) => call.includes("repos/owner/mod/releases/tags/v1.2.3-test.1")));
});

test("publication rejects wrong commit, modified notes, wrong channel and changed formal Latest", (t) => {
    const f = fixture(t);
    f.set({ tagCommit: "b".repeat(40) });
    assert.throws(() => verifyPublication(f.options, f.execute), /reviewed commit/);
    f.set({ tagCommit: f.options.commit, latest: f.options.tag });
    assert.throws(() => verifyPublication(f.options, f.execute), /Latest/);
    f.set({ latest: f.options.latest });
    f.release.body += "Unexpected text";
    assert.throws(() => verifyPublication(f.options, f.execute), /notes differ/);
    f.release.body = fs.readFileSync(path.join(f.options.root, "notes.md"), "utf8");
    f.release.prerelease = false;
    assert.throws(() => verifyPublication(f.options, f.execute), /channel/);
});

test("failed and same-size corrupt downloads cannot produce passing verification records", (t) => {
    const f = fixture(t);
    f.set({ failDownload: true });
    assert.throws(() => verifyPublication(f.options, f.execute), /download failed/);
    f.set({ failDownload: false, download: "corrupt! ZIP" });
    assert.throws(() => verifyPublication(f.options, f.execute), /Downloaded attachment differs/);
    for (const directory of fs.readdirSync(path.join(f.options.root, ".scratch/publication")))
        assert.ok(!fs.existsSync(path.join(f.options.root, ".scratch/publication", directory, "verification.json")));
});

test("missing formal Latest and incomplete bilingual notes fail before any remote command", (t) => {
    const f = fixture(t);
    assert.throws(() => verifyPublication({ ...f.options, latest: undefined }, f.execute), /expected formal Latest/);
    fs.writeFileSync(path.join(f.options.root, "notes.md"), "## English\n\nOnly English.\n");
    assert.throws(() => verifyPublication(f.options, f.execute), /complete English/);
    assert.equal(f.calls.length, 0);
});

test("UTF-8 notes with Windows line endings compare by content", (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.options.root, "notes.md"), "\uFEFF" + f.release.body.replaceAll("\n", "\r\n"));
    assert.equal(verifyPublication(f.options, f.execute).status, "passed");
});

test("formal publication requires Latest and integration into main", (t) => {
    const f = fixture(t);
    f.options.tag = "v1.2.3";
    f.release.tag_name = f.options.tag;
    f.release.prerelease = false;
    f.release.assets[0].name = "Spiderlings_1.2.3.zip";
    fs.writeFileSync(path.join(f.options.root, f.release.assets[0].name), "accepted ZIP");
    f.set({ latest: f.options.tag });
    assert.equal(verifyPublication(f.options, f.execute).status, "passed");
    f.set({ formalIntegrated: false });
    assert.throws(() => verifyPublication(f.options, f.execute), /not integrated into main/);
});
