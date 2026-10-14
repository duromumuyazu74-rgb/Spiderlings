"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { verifyPublication } = require("../verify-spiderlings-publication.js");
const { verifyCandidate } = require("../verify-spiderlings-candidate.js");
const { verifyPackageCommit } = require("../delivery-commands.js");

function fixture(t, version = "1.2.3-test.1") {
    const parent = path.resolve(__dirname, "../../../.scratch/publication-tests");
    fs.mkdirSync(parent, { recursive: true });
    const root = fs.mkdtempSync(path.join(parent, "case-"));
    t.after(() => {
        assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(parent) + path.sep));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const notes = "## English\n\nTest update.\n\n## 简体中文\n\n测试更新。\n";
    fs.writeFileSync(path.join(root, "notes.md"), notes);
    const packageName = `Spiderlings_${version}.zip`;
    fs.writeFileSync(path.join(root, packageName), "accepted ZIP");
    const options = { root, tag: `v${version}`, commit: "a".repeat(40), latest: "v1.2.4", notesPath: "notes.md" };
    const mod = path.join(root, "KinkyDungeon-Spiderlings");
    fs.mkdirSync(mod);
    const manifest = { modbuild: version, fileorder: ["Example.js", "Example.png"] };
    const saveManifest = () => fs.writeFileSync(path.join(mod, "mod.json"), JSON.stringify(manifest));
    saveManifest();
    fs.writeFileSync(path.join(mod, "Example.js"), "// runtime\n");
    fs.writeFileSync(path.join(mod, "Example.png"), Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]));
    for (const locale of ["CN", "DE", "ES", "JP", "KR", "PL", "RU"])
        fs.writeFileSync(path.join(mod, `Spiderlings${locale}.csv`), "key,value\n");
    fs.writeFileSync(path.join(root, ".gitattributes"), "* -text\n");
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
    git("init", "-q");
    const commit = () => {
        git("add", "KinkyDungeon-Spiderlings", ".gitattributes");
        git("-c", "user.name=Delivery tests", "-c", "user.email=delivery@example.invalid", "commit", "-qm", "fixture");
        options.commit = git("rev-parse", "HEAD");
    };
    commit();
    const release = {
        tag_name: options.tag,
        body: notes,
        draft: false,
        prerelease: true,
        html_url: `https://github.com/owner/mod/releases/tag/v${version}`,
        assets: [{ name: packageName, size: 12 }],
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
        if (command === "git" && ["rev-parse", "ls-tree", "hash-object"].includes(args[0]))
            return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true });
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
        mod,
        manifest,
        saveManifest,
        commit,
        set: (changes) => {
            latest = changes.latest ?? latest;
            tagCommit = changes.tagCommit ?? tagCommit;
            download = changes.download ?? download;
            failDownload = changes.failDownload ?? failDownload;
            formalIntegrated = changes.formalIntegrated ?? formalIntegrated;
        },
    };
}

test("prison alpha publication verifies as a prerelease and preserves formal Latest", (t) => {
    const f = fixture(t, "1.2.3-prison.alpha.1");
    const result = verifyPublication(f.options, f.execute);
    assert.equal(result.status, "passed");
    assert.equal(result.latest, "v1.2.4");
    f.release.prerelease = false;
    assert.throws(() => verifyPublication(f.options, f.execute), /Release channel/);
    f.release.prerelease = true;
    f.set({ latest: f.options.tag });
    assert.throws(() => verifyPublication(f.options, f.execute), /Formal Latest/);
});

test("prison alpha publication requires the expected formal Latest before reading GitHub", (t) => {
    const f = fixture(t, "1.2.3-prison.alpha.1");
    delete f.options.latest;
    assert.throws(() => verifyPublication(f.options, f.execute), /formal Latest/);
    assert.equal(f.calls.length, 0);
});

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
    f.manifest.modbuild = "1.2.3";
    f.saveManifest();
    f.commit();
    f.set({ latest: f.options.tag, tagCommit: f.options.commit });
    assert.equal(verifyPublication(f.options, f.execute).status, "passed");
    f.set({ formalIntegrated: false });
    assert.throws(() => verifyPublication(f.options, f.execute), /not integrated into main/);
});

test("publication rejects a package source changed after the reviewed commit, including raw PNG bytes", (t) => {
    const f = fixture(t);
    fs.appendFileSync(path.join(f.mod, "Example.png"), Buffer.from([4]));
    assert.throws(() => verifyPublication(f.options, f.execute), /source differs.*Example.png/);
    assert.ok(!f.calls.some((call) => call[0] === "gh"), "Fail before reading or downloading a Release");
});

test("commit binding ignores unrelated docs but rejects normalized text and uncommitted manifest entries", (t) => {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.options.root, "notes.md"), "unrelated documentation");
    assert.equal(verifyPackageCommit(f.options.root, f.options.commit).entries, 10);
    fs.writeFileSync(path.join(f.mod, "Example.js"), "// runtime\r\n");
    assert.throws(() => verifyPackageCommit(f.options.root, f.options.commit), /source differs.*Example.js/);
    fs.writeFileSync(path.join(f.mod, "Example.js"), "// runtime\n");
    f.manifest.fileorder.push("New.png");
    fs.writeFileSync(path.join(f.mod, "New.png"), "new asset");
    f.saveManifest();
    assert.throws(() => verifyPackageCommit(f.options.root, f.options.commit), /absent from the reviewed commit/);
});

test("candidate verification binds the downloaded bytes to a successful build and source commit", (t) => {
    const f = fixture(t);
    const reportPath = path.join(f.options.root, "report.json");
    const report = {
        schemaVersion: 1,
        mode: "public",
        status: "passed",
        errors: [],
        source: { head: f.options.commit, dirty: false },
        sourceAfterChecks: { head: f.options.commit, dirty: false },
        sourceChanged: false,
        release: { version: "1.2.3-test.1" },
        package: {
            verification: "passed",
            size: 12,
            sha256: createHash("sha256").update("accepted ZIP").digest("hex"),
        },
        checks: ["build", "repository", "policy-tests", "public-tests", "package", "committed-atlas"].map((id) => ({
            id,
            run: true,
            status: "passed",
        })),
    };
    const verify = () => {
        fs.writeFileSync(reportPath, JSON.stringify(report));
        return verifyCandidate({ ...f.options, reportPath }, f.execute);
    };
    assert.equal(verify().status, "passed");
    assert.equal(verify().gameAcceptance, "not-run");
    report.source.head = "b".repeat(40);
    assert.throws(verify, /clean reviewed commit/);
    report.source.head = f.options.commit;
    report.checks[0].status = "failed";
    assert.throws(verify, /successful public build/);
    report.checks[0].status = "passed";
    report.source.dirty = true;
    assert.throws(verify, /clean reviewed commit/);
    report.source.dirty = false;
    fs.writeFileSync(path.join(f.options.root, "Spiderlings_1.2.3-test.1.zip"), "changed! ZIP");
    assert.throws(verify, /differs from the build report/);
});
