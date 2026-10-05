"use strict";

const path = require("node:path");
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

module.exports = { run, repository, packageVerificationCommand };
