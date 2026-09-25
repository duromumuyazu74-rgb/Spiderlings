"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");

const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";
const testRoot = path.resolve(__dirname, "../../../.scratch/release-package-tests");

function fixture() {
    fs.mkdirSync(testRoot, { recursive: true });
    const root = fs.mkdtempSync(path.join(testRoot, "case-"));
    const mod = path.join(root, "KinkyDungeon-Spiderlings");
    const tools = path.join(mod, "tools");
    fs.mkdirSync(tools, { recursive: true });
    const manifest = { modbuild: "1.2.3-test.1", fileorder: ["Example.js", "Example.png"] };
    const saveManifest = () => fs.writeFileSync(path.join(mod, "mod.json"), JSON.stringify(manifest));
    saveManifest();
    fs.writeFileSync(path.join(mod, "Example.js"), "// runtime fixture\n");
    fs.writeFileSync(path.join(mod, "Example.png"), Buffer.from([137, 80, 78, 71, 0, 1, 2, 3]));
    for (const locale of ["CN", "DE", "ES", "JP", "KR", "PL", "RU"]) {
        fs.writeFileSync(path.join(mod, `Spiderlings${locale}.csv`), "key,value\n");
    }
    const script = path.join(tools, "build-spiderlings-release.ps1");
    fs.copyFileSync(path.join(__dirname, "../build-spiderlings-release.ps1"), script);
    fs.writeFileSync(
        path.join(tools, "build-spiderlings-atlas.py"),
        "from pathlib import Path\nPath(__file__).with_name('atlas-ran').write_text('built')\n",
    );
    fs.writeFileSync(
        path.join(tools, "watch-spiderlings-mod.ps1"),
        `param([switch]$Once)
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$zip = Join-Path $root 'Spiderlings_1.2.3-test.1.zip'
if (!(Test-Path -LiteralPath $zip)) { Write-Error 'Final ZIP is missing'; exit 9 }
if (Test-Path -LiteralPath (Join-Path $root 'fail-watcher')) { exit 7 }
Set-Content -LiteralPath (Join-Path $root 'checked-size') -Value ([IO.File]::ReadAllBytes($zip).Length)
exit 0
`,
    );
    const run = (...args) => {
        const result = spawnSync(powershell, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args], {
            cwd: root,
            encoding: "utf8",
            windowsHide: true,
        });
        assert.ifError(result.error);
        return { ...result, output: result.stdout + result.stderr };
    };
    return { root, mod, tools, manifest, saveManifest, run, zip: path.join(root, "Spiderlings_1.2.3-test.1.zip") };
}

test("the builder checks the final ZIP and propagates a failed watcher", () => {
    const f = fixture();
    const result = f.run("-RunCheck");
    assert.equal(result.status, 0, result.output);
    assert.equal(Number(fs.readFileSync(path.join(f.root, "checked-size"), "utf8").trim()), fs.statSync(f.zip).size);
    const verify = f.run("-VerifyOnly");
    assert.equal(verify.status, 0, verify.output);
    fs.writeFileSync(path.join(f.root, "fail-watcher"), "");
    const failed = f.run("-RunCheck", "-Force");
    assert.notEqual(failed.status, 0, failed.output);
    assert.match(failed.output, /check failed with exit code 7/);
});

test("the builder gives the prison alpha channel its own package name", () => {
    const f = fixture();
    f.manifest.modbuild = "1.2.3-prison.alpha.1";
    f.saveManifest();
    const zip = path.join(f.root, "Spiderlings_1.2.3-prison.alpha.1.zip");
    const built = f.run();
    assert.equal(built.status, 0, built.output);
    assert.equal(fs.existsSync(zip), true);
    assert.equal(f.run("-VerifyOnly").status, 0);
});

test("invalid versions fail before atlas generation or package writes", () => {
    const f = fixture();
    for (const version of [
        "1.2",
        "1.2.03",
        "1.2.3-test.0",
        "1.2.3-prison.alpha.0",
        "1.2.3-prison.alpha.01",
        "1.2.3\n",
        "1.2.3/../../outside",
        "9007199254740992.0.0",
    ]) {
        f.manifest.modbuild = version;
        f.saveManifest();
        const result = f.run("-NoPackage");
        assert.notEqual(result.status, 0, version);
        assert.match(result.output, /modbuild/, result.output);
        assert.equal(fs.existsSync(path.join(f.tools, "atlas-ran")), false);
        assert.equal(fs.existsSync(f.zip), false);
    }
});

test("refusing an existing ZIP preserves both its bytes and generated inputs", () => {
    const f = fixture();
    fs.writeFileSync(f.zip, "previous delivery");
    const result = f.run();
    assert.notEqual(result.status, 0, result.output);
    assert.match(result.output, /already exists/);
    assert.equal(fs.readFileSync(f.zip, "utf8"), "previous delivery");
    assert.equal(fs.existsSync(path.join(f.tools, "atlas-ran")), false);
});

test("package verification rejects stale PNG bytes, duplicates, missing and extra entries", () => {
    const f = fixture();
    const built = f.run();
    assert.equal(built.status, 0, built.output);
    for (const mutation of ["png", "duplicate", "missing", "extra"]) {
        const candidate = path.join(f.root, `${mutation}.zip`);
        execFileSync(
            "python",
            [
                "-c",
                `import sys, zipfile
source, target, mutation = sys.argv[1:]
with zipfile.ZipFile(source) as original, zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as output:
    for name in original.namelist():
        if mutation == 'missing' and name == 'Example.png': continue
        data = b'changed PNG' if mutation == 'png' and name == 'Example.png' else original.read(name)
        output.writestr(name, data)
    if mutation == 'duplicate': output.writestr('Example.png', original.read('Example.png'))
    if mutation == 'extra': output.writestr('tools/private.js', 'unshipped')
`,
                f.zip,
                candidate,
                mutation,
            ],
            { stdio: "pipe", windowsHide: true },
        );
        const result = f.run("-VerifyOnly", "-PackagePath", candidate);
        assert.notEqual(result.status, 0, `${mutation}: ${result.output}`);
        assert.match(result.output, /differs from source|entries; expected|Duplicate|Unexpected|Missing release entry/);
    }
});
