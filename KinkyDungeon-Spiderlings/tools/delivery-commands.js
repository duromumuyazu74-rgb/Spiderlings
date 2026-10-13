"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");

function run(root, command, args) {
    return execFileSync(command, args, { cwd: root, encoding: "utf8", windowsHide: true });
}

function repository(root, execute = run) {
    const origin = execute(root, "git", ["remote", "get-url", "origin"]).trim();
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([^/]+\/[^/]+?)(?:\.git)?$/.exec(origin);
    if (!match) throw new Error("The configured origin must identify a GitHub repository.");
    return match[1];
}

function packageVerificationCommand(root, packagePath) {
    return [
        process.platform === "win32" ? "powershell.exe" : "pwsh",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        path.join(root, "KinkyDungeon-Spiderlings/tools/build-spiderlings-release.ps1"),
        "-VerifyOnly",
        "-PackagePath",
        path.resolve(root, packagePath),
    ];
}

function verifyPackageCommit(root, commit, execute = run) {
    if (!/^[a-f0-9]{40}$/.test(commit || "")) throw new Error("Package verification needs a full source commit.");
    const resolved = execute(root, "git", ["rev-parse", "--verify", `${commit}^{commit}`]).trim();
    if (resolved !== commit) throw new Error("Source commit does not identify a commit object.");
    const mod = "KinkyDungeon-Spiderlings";
    const manifest = JSON.parse(fs.readFileSync(path.join(root, mod, "mod.json"), "utf8").replace(/^\uFEFF/, ""));
    const files = [
        "mod.json",
        ...manifest.fileorder,
        ...["CN", "DE", "ES", "JP", "KR", "PL", "RU"].map((locale) => `Spiderlings${locale}.csv`),
    ];
    const committed = new Map(
        execute(root, "git", ["ls-tree", "-r", "-z", "--full-tree", commit, "--", mod])
            .split("\0")
            .filter(Boolean)
            .map((entry) => {
                const [metadata, filename] = entry.split("\t");
                return [filename, metadata.split(" ")];
            }),
    );
    const paths = files.map((file) => {
        if (typeof file !== "string" || file.includes("\\") || file.split("/").some((part) => !part || part === ".."))
            throw new Error(`Invalid package source path: ${file}`);
        const filename = `${mod}/${file}`;
        const entry = committed.get(filename);
        if (!entry || entry[1] !== "blob" || !["100644", "100755"].includes(entry[0]))
            throw new Error(`Package source is absent from the reviewed commit: ${filename}`);
        if (!fs.lstatSync(path.join(root, filename)).isFile())
            throw new Error(`Package source is not a regular file: ${filename}`);
        return filename;
    });
    // Hash raw bytes, bypassing Git clean filters and line-ending normalization.
    // Small batches stay below Windows' command-line limit without one process per image.
    for (let index = 0; index < paths.length; index += 32) {
        const batch = paths.slice(index, index + 32);
        const hashes = execute(root, "git", ["hash-object", "--no-filters", "--", ...batch])
            .trim()
            .split(/\r?\n/);
        for (const [offset, filename] of batch.entries()) {
            if (hashes[offset] !== committed.get(filename)[2])
                throw new Error(`Package source differs from the reviewed commit: ${filename}`);
        }
    }
    return { commit, version: manifest.modbuild, entries: paths.length };
}

module.exports = { run, repository, packageVerificationCommand, verifyPackageCommit };
