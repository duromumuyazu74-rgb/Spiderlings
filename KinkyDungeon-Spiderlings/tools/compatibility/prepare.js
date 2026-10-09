"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const ts = require("typescript");

const remote = "https://github.com/Ada18980/KinkiestDungeon.git";
const branch = "5.5";
const hash = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function git(cwd, ...args) {
    return execFileSync(
        "git",
        [
            ...(process.platform === "win32" ? ["-c", "http.sslBackend=openssl"] : []),
            "-c",
            "http.version=HTTP/1.1",
            "-c",
            "http.lowSpeedLimit=1024",
            "-c",
            "http.lowSpeedTime=30",
            ...args,
        ],
        {
            cwd,
            encoding: "utf8",
            windowsHide: true,
            stdio: ["ignore", "pipe", "pipe"],
        },
    ).trim();
}

function gameVersion(root) {
    const text = fs.readFileSync(path.join(root, "Screens/MiniGame/KinkyDungeon/Text_KinkyDungeon.csv"), "utf8");
    const version = /^KDVersionStr,"?([^"\r\n]+)"?\r?$/m.exec(text)?.[1];
    if (!version) throw new Error(`No KDVersionStr in ${root}`);
    return version;
}

function syncUpstream(cache, source = remote, ref = branch) {
    fs.mkdirSync(cache, { recursive: true });
    const root = path.join(cache, "upstream");
    let previousCommit = null;
    if (fs.existsSync(root)) {
        if (git(root, "remote", "get-url", "origin") !== source)
            throw new Error("Upstream cache has a different origin.");
        if (git(root, "status", "--porcelain", "--untracked-files=all"))
            throw new Error("Upstream cache has local changes; preserve them before syncing.");
        previousCommit = git(root, "rev-parse", "HEAD");
        git(root, "fetch", "--depth", "1", "origin", `+refs/heads/${ref}:refs/remotes/origin/${ref}`);
    } else {
        git(cache, "clone", "--depth", "1", "--single-branch", "--branch", ref, source, root);
    }
    const commit = git(root, "rev-parse", `refs/remotes/origin/${ref}`);
    git(root, "checkout", "--detach", commit);
    return {
        root,
        remote: source,
        branch: ref,
        commit,
        previousCommit,
        updated: previousCommit !== commit,
        checkedAt: new Date().toISOString(),
    };
}

function compile(upstream, cache) {
    const output = path.join(cache, "builds", upstream.commit);
    const receipt = path.join(output, "prepared.json");
    if (fs.existsSync(receipt)) return JSON.parse(fs.readFileSync(receipt, "utf8"));
    fs.mkdirSync(output, { recursive: true });
    const configPath = path.join(upstream.root, "tsconfig.json");
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, upstream.root, {
        outFile: path.join(output, "out/main.js"),
        noCheck: true,
        sourceMap: false,
        inlineSources: false,
        declaration: false,
        noEmit: false,
    });
    const program = ts.createProgram(parsed.fileNames, parsed.options);
    const emitted = program.emit();
    const diagnostics = [...parsed.errors, ...emitted.diagnostics];
    if (emitted.emitSkipped || diagnostics.length)
        throw new Error(
            ts.formatDiagnosticsWithColorAndContext(diagnostics, {
                getCanonicalFileName: (f) => f,
                getCurrentDirectory: () => upstream.root,
                getNewLine: () => "\n",
            }),
        );
    const executable = path.join(
        upstream.root,
        "tools",
        process.platform === "win32" ? "wtxpck.exe" : process.platform === "darwin" ? "wtxpck_osx" : "wtxpck",
    );
    for (const name of ["displacement", "game", "models", "models_mobile"]) {
        const original = fs.readFileSync(path.join(upstream.root, "tools", `wtxpck.${name}.conf`), "utf8");
        const rewritten = original
            .replace(
                /^input=(.*);/gm,
                (_all, input) => `input=${path.resolve(upstream.root, "tools", input).replaceAll("\\", "/")}/;`,
            )
            .replace(/^output=.*;/gm, `output=${path.join(output, "TextureAtlas").replaceAll("\\", "/")}/;`);
        const file = path.join(output, `wtxpck.${name}.conf`);
        fs.writeFileSync(file, rewritten);
        const fd = fs.openSync(path.join(output, `pack-${name}.log`), "w");
        try {
            execFileSync(executable, [file], { cwd: output, windowsHide: true, stdio: ["ignore", fd, fd] });
        } finally {
            fs.closeSync(fd);
        }
        if (!fs.existsSync(path.join(output, "TextureAtlas", `${name}_0000.json`))) {
            throw new Error(`Upstream ${name} atlas was not generated; inspect pack-${name}.log.`);
        }
    }
    const result = {
        root: upstream.root,
        overlay: output,
        version: gameVersion(upstream.root),
        commit: upstream.commit,
        compiler: ts.version,
        compilerMode: "noCheck transpilation; native runtime acceptance follows",
        mainSha256: hash(path.join(output, "out/main.js")),
    };
    fs.writeFileSync(receipt, JSON.stringify(result, null, 2) + "\n");
    return result;
}

module.exports = { remote, branch, hash, git, gameVersion, syncUpstream, compile };
