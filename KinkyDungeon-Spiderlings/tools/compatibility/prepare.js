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

function containsImage(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .some((entry) =>
            entry.isDirectory()
                ? containsImage(path.join(directory, entry.name))
                : entry.name.toLowerCase().endsWith(".png"),
        );
}

// Upstream loads one model atlas per Models folder once its generator exists. Its own
// script writes configs into the checkout, so derive the same packs here instead.
function modelFolders(upstream) {
    if (!fs.existsSync(path.join(upstream.root, "tools", "gen_model_atlas_confs.py"))) return undefined;
    const models = path.join(upstream.root, "Models");
    return fs
        .readdirSync(models, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && containsImage(path.join(models, entry.name)))
        .map((entry) => entry.name)
        .sort();
}

function packModelFolders(upstream, output, executable, folders) {
    const fd = fs.openSync(path.join(output, "pack-model-folders.log"), "w");
    try {
        for (const [name, directory] of [
            ["models", "models"],
            ["models_mobile", "mobile"],
        ]) {
            const base = fs.readFileSync(path.join(upstream.root, "tools", `wtxpck.${name}.conf`), "utf8"),
                atlases = path.join(output, "TextureAtlas", directory),
                configs = path.join(output, "model-folders", directory);
            fs.mkdirSync(atlases, { recursive: true });
            fs.mkdirSync(configs, { recursive: true });
            for (const folder of folders) {
                const file = path.join(configs, `wtxpck.${name}.${folder}.conf`);
                fs.writeFileSync(
                    file,
                    base
                        .replace(
                            /^input=.*;/gm,
                            `input=${path.join(upstream.root, "Models", folder).replaceAll("\\", "/")}/;`,
                        )
                        .replace(/^prefix=.*;/gm, `prefix=Models/${folder};`)
                        .replace(/^output=.*;/gm, `output=${atlases.replaceAll("\\", "/")}/;`)
                        .replace(/^atlas_prefix=.*;/gm, `atlas_prefix=${name}_${folder}_;`),
                );
                execFileSync(executable, [file], { cwd: configs, windowsHide: true, stdio: ["ignore", fd, fd] });
                if (!fs.existsSync(path.join(atlases, `${name}_${folder}_0000.json`)))
                    throw new Error(
                        `Upstream ${name} atlas for ${folder} was not generated; inspect pack-model-folders.log.`,
                    );
            }
        }
    } finally {
        fs.closeSync(fd);
    }
}

function compile(upstream, cache) {
    const output = path.join(cache, "builds", upstream.commit);
    const receipt = path.join(output, "prepared.json");
    const folders = modelFolders(upstream);
    if (fs.existsSync(receipt)) {
        const prepared = JSON.parse(fs.readFileSync(receipt, "utf8"));
        // A build prepared before per-folder atlases were packed is incomplete for this commit.
        if (!folders || prepared.modelFolderAtlases === folders.length) return prepared;
    }
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
    if (folders) packModelFolders(upstream, output, executable, folders);
    const result = {
        root: upstream.root,
        overlay: output,
        version: gameVersion(upstream.root),
        commit: upstream.commit,
        compiler: ts.version,
        compilerMode: "noCheck transpilation; native runtime acceptance follows",
        mainSha256: hash(path.join(output, "out/main.js")),
        ...(folders ? { modelFolderAtlases: folders.length } : {}),
    };
    fs.writeFileSync(receipt, JSON.stringify(result, null, 2) + "\n");
    return result;
}

module.exports = { remote, branch, hash, git, gameVersion, syncUpstream, compile };
