"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { collectDelivery } = require("../report-spiderlings-delivery.js");

const testRoot = path.resolve(__dirname, "../../../.scratch/delivery-evidence-tests");
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function fixture(t) {
    fs.mkdirSync(testRoot, { recursive: true });
    const root = fs.mkdtempSync(path.join(testRoot, "case-"));
    t.after(() => {
        assert.ok(fs.realpathSync(root).startsWith(fs.realpathSync(testRoot) + path.sep));
        fs.rmSync(root, { recursive: true, force: true });
    });
    const write = (name, content) => {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
        return file;
    };
    const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
    write(".gitignore", ".scratch/\n*.zip\n");
    write(".gitattributes", "* text=auto eol=lf\n");
    write("tracked.txt", "source\n");
    write("KinkyDungeon-Spiderlings/mod.json", JSON.stringify({ modbuild: "1.2.3-test.1", fileorder: ["Example.js"] }));
    write("KinkyDungeon-Spiderlings/Example.js", "// fixture runtime\n");
    write(
        ".github/scripts/check-repository.mjs",
        `import fs from 'node:fs';
if (fs.existsSync('fail-repository')) { console.error('fixture source check failed'); process.exit(4); }
if (fs.existsSync('change-during-check')) fs.appendFileSync('tracked.txt', 'changed during verification\\n');
console.log('fixture repository check passed');
`,
    );
    write(
        ".github/scripts/check-repository.test.mjs",
        "import test from 'node:test'; test('fixture policy', () => {});\n",
    );
    write("KinkyDungeon-Spiderlings/tools/run-spiderlings-tests.js", "console.log('fixture public suite passed');\n");
    write(
        "KinkyDungeon-Spiderlings/tools/watch-spiderlings-mod.ps1",
        "Write-Output 'fixture local watcher passed'\nexit 0\n",
    );
    write(
        "KinkyDungeon-Spiderlings/tools/build-spiderlings-release.ps1",
        `param([switch]$VerifyOnly, [string]$PackagePath = "")
$ErrorActionPreference = "Stop"
$defaultZip = Join-Path (Get-Location) "Spiderlings_1.2.3-test.1.zip"
if (!$VerifyOnly) {
    if (Test-Path -LiteralPath $defaultZip) { throw "Existing package must be preserved" }
    [IO.File]::WriteAllText($defaultZip, "fixture package")
} else {
    if (!(Test-Path -LiteralPath $PackagePath)) { throw "Package missing" }
    if ([IO.File]::ReadAllText($PackagePath) -ne "fixture package") { throw "Package differs from source" }
}
Write-Output 'fixture package verified'
`,
    );
    const packagePath = write("Spiderlings_1.2.3-test.1.zip", "fixture package");
    git("init", "-q");
    git("add", ".");
    git(
        "-c",
        "user.name=Evidence tests",
        "-c",
        "user.email=evidence@example.invalid",
        "commit",
        "-qm",
        "fixture source",
    );
    const collect = (options = {}) => collectDelivery({ root, base: "HEAD", mode: "public", ...options });
    return { root, write, git, packagePath, collect };
}

test("public reports bind to the clean commit and existing ZIP while marking omitted checks", (t) => {
    const f = fixture(t),
        result = f.collect();
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.source.head, f.git("rev-parse", "HEAD"));
    assert.equal(result.report.source.dirty, false);
    assert.equal(result.report.sourceChanged, false);
    assert.equal(result.report.release.baseline, "1.2.3");
    assert.equal(result.report.package.sha256, hash("fixture package"));
    assert.equal(result.report.package.verification, "passed");
    assert.equal(result.report.checks.find((c) => c.id === "local-watcher").status, "not-run");
    assert.equal(result.report.gameAcceptance.status, "not-run");
    const reportFile = path.join(result.output, "REPORT.md"),
        before = fs.readFileSync(reportFile);
    const full = f.collect({ mode: "full" });
    assert.equal(full.exitCode, 0);
    assert.equal(full.report.checks.find((c) => c.id === "local-watcher").status, "passed");
    assert.notEqual(full.output, result.output);
    assert.deepEqual(fs.readFileSync(reportFile), before);
    assert.equal(JSON.parse(fs.readFileSync(path.join(result.output, "report.json"))).status, "passed");
});

test("failed checks and wrong ZIP bytes preserve logs and fail the report", (t) => {
    const f = fixture(t);
    f.write("fail-repository", "yes");
    fs.writeFileSync(f.packagePath, "wrong package");
    const result = f.collect();
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.checks.find((c) => c.id === "repository").exitCode, 4);
    assert.equal(result.report.checks.find((c) => c.id === "package").status, "failed");
    assert.equal(result.report.package.verification, "failed");
    assert.match(fs.readFileSync(path.join(result.output, "repository.log"), "utf8"), /fixture source check failed/);
    assert.match(fs.readFileSync(path.join(result.output, "package.log"), "utf8"), /Package differs from source/);
    assert.equal(result.report.checks.find((c) => c.id === "public-tests").status, "passed");
});

test("dirty paths include staged renames and untracked filenames without certifying a clean commit", (t) => {
    const f = fixture(t);
    f.git("mv", "tracked.txt", "moved name.txt");
    f.write("new name.txt", "untracked");
    const { report, exitCode } = f.collect();
    assert.equal(exitCode, 0);
    assert.equal(report.source.dirty, true);
    assert.ok(report.source.changes.some((c) => c.path === "moved name.txt" && c.originalPath === "tracked.txt"));
    assert.ok(report.source.changes.some((c) => c.path === "new name.txt" && c.status === "??"));
});

test("an already dirty file changing during checks invalidates successful command results", (t) => {
    const f = fixture(t);
    f.write("tracked.txt", "dirty before verification\n");
    f.write("change-during-check", "yes");
    const { report, exitCode } = f.collect();
    assert.equal(exitCode, 1);
    assert.equal(report.sourceChanged, true);
    assert.equal(report.package.verification, "invalidated");
    assert.ok(report.checks.filter((c) => c.run).every((c) => c.status === "passed"));
    assert.deepEqual(
        report.source.changes.map((c) => c.path),
        report.sourceAfterChecks.changes.map((c) => c.path),
    );
});

test("native evidence accepts uppercase ZIP hashes and retains its scope, limitations and proof", (t) => {
    const f = fixture(t);
    const proof = f.write(".scratch/native/result.json", JSON.stringify({ native: true }));
    const input = f.write(
        ".scratch/native/acceptance.json",
        JSON.stringify({
            schemaVersion: 1,
            packageSha256: hash("fixture package").toUpperCase(),
            records: [
                {
                    gameVersion: "5.4.92",
                    status: "passed",
                    scope: "Native loading",
                    evidence: "result.json",
                    limitations: ["No complete visual review"],
                },
                { gameVersion: "5.5.3", status: "not-run", scope: "Save reload", limitations: ["Not exercised"] },
            ],
        }),
    );
    const result = f.collect({ evidencePath: input });
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.gameAcceptance.status, "reported");
    const record = result.report.gameAcceptance.records[0];
    assert.equal(record.reportedStatus, "passed");
    assert.deepEqual(record.limitations, ["No complete visual review"]);
    assert.deepEqual(fs.readFileSync(path.join(result.output, record.evidence.file)), fs.readFileSync(proof));
    assert.equal(record.evidence.sha256, hash(fs.readFileSync(proof)));
    assert.equal(result.report.gameAcceptance.records[1].reportedStatus, "not-run");
});

test("stale acceptance hashes and missing proof files cannot become passing evidence", (t) => {
    const f = fixture(t);
    const input = f.write(
        ".scratch/acceptance.json",
        JSON.stringify({
            schemaVersion: 1,
            packageSha256: "0".repeat(64),
            records: [
                {
                    gameVersion: "5.5.3",
                    status: "passed",
                    scope: "Native loading",
                    evidence: "missing.json",
                    limitations: [],
                },
            ],
        }),
    );
    const stale = f.collect({ evidencePath: input });
    assert.equal(stale.exitCode, 1);
    assert.equal(stale.report.gameAcceptance.status, "invalid");
    assert.match(stale.report.errors.join(" "), /exact selected ZIP/);
    const validHash = JSON.parse(fs.readFileSync(input));
    validHash.packageSha256 = hash("fixture package");
    fs.writeFileSync(input, JSON.stringify(validHash));
    const missing = f.collect({ evidencePath: input });
    assert.equal(missing.exitCode, 1);
    assert.equal(missing.report.gameAcceptance.status, "invalid");
});

test("explicit builds preserve existing ZIPs and a missing package still produces a failed report", (t) => {
    const f = fixture(t),
        preserved = f.collect({ build: true });
    assert.equal(preserved.exitCode, 1);
    assert.equal(preserved.report.checks.find((c) => c.id === "build").status, "failed");
    assert.equal(fs.readFileSync(f.packagePath, "utf8"), "fixture package");
    fs.unlinkSync(f.packagePath);
    const missing = f.collect();
    assert.equal(missing.exitCode, 1);
    assert.ok(fs.existsSync(path.join(missing.output, "REPORT.md")));
    assert.match(missing.report.errors.join(" "), /ZIP is missing/);
    const built = f.collect({ build: true });
    assert.equal(built.exitCode, 0);
    assert.equal(built.report.checks.find((c) => c.id === "build").status, "passed");
    assert.equal(built.report.package.verification, "passed");
});

test("invalid comparison refs preserve a diagnostic report without claiming checks ran", (t) => {
    const f = fixture(t),
        result = f.collect({ base: "missing-ref" });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.checks.length, 0);
    assert.equal(result.report.gameAcceptance.status, "not-run");
    assert.ok(fs.existsSync(path.join(result.output, "report.json")));
});

test("a selected downloaded ZIP is verified independently of the canonical local package", (t) => {
    const f = fixture(t);
    const selected = f.write(".scratch/download/other.zip", "wrong package");
    const result = f.collect({ packagePath: selected });
    assert.equal(result.exitCode, 1);
    assert.equal(result.report.package.path, selected);
    assert.equal(result.report.checks.find((c) => c.id === "package").status, "failed");
    assert.equal(fs.readFileSync(f.packagePath, "utf8"), "fixture package");
});

test("a reported failed native acceptance fails the command despite passing automatic checks", (t) => {
    const f = fixture(t);
    f.write(".scratch/failure.txt", "Native capture failed");
    const input = f.write(
        ".scratch/acceptance.json",
        JSON.stringify({
            schemaVersion: 1,
            packageSha256: hash("fixture package"),
            records: [
                { gameVersion: "5.4.92", status: "failed", scope: "Capture", evidence: "failure.txt", limitations: [] },
            ],
        }),
    );
    const { report, exitCode } = f.collect({ evidencePath: input });
    assert.equal(exitCode, 1);
    assert.ok(report.checks.filter((c) => c.run).every((c) => c.status === "passed"));
    assert.equal(report.gameAcceptance.status, "reported");
    assert.equal(report.gameAcceptance.records[0].reportedStatus, "failed");
});
