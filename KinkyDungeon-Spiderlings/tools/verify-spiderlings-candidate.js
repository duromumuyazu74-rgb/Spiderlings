"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { run, packageVerificationCommand, verifyPackageCommit } = require("./delivery-commands.js");
const { parseReleaseVersion } = require("./release-version.js");

function verifyCandidate(options, execute = run) {
    const root = path.resolve(options.root || path.join(__dirname, "../.."));
    const reportPath = path.resolve(root, options.reportPath);
    const report = JSON.parse(fs.readFileSync(reportPath, "utf8").replace(/^\uFEFF/, ""));
    const required = ["build", "repository", "policy-tests", "public-tests", "package", "committed-atlas"];
    if (
        report.schemaVersion !== 1 ||
        report.mode !== "public" ||
        report.status !== "passed" ||
        report.source?.head !== options.commit ||
        report.source.dirty !== false ||
        report.sourceAfterChecks?.head !== options.commit ||
        report.sourceAfterChecks.dirty !== false ||
        report.sourceChanged !== false ||
        report.package?.verification !== "passed" ||
        !Array.isArray(report.errors) ||
        report.errors.length ||
        !required.every((id) =>
            report.checks?.some((check) => check.id === id && check.run && check.status === "passed"),
        )
    )
        throw new Error("Candidate needs a successful public build report for the clean reviewed commit.");
    const version = parseReleaseVersion(report.release?.version);
    const packagePath = path.resolve(root, options.packagePath || version.packageName);
    const before = fs.readFileSync(packagePath);
    const sha256 = createHash("sha256").update(before).digest("hex");
    if (
        path.basename(packagePath) !== version.packageName ||
        before.length !== report.package.size ||
        sha256 !== report.package.sha256
    )
        throw new Error("Candidate filename, size or SHA-256 differs from the build report.");
    const source = verifyPackageCommit(root, options.commit, execute);
    if (source.version !== version.version) throw new Error("Candidate version differs from the reviewed source.");
    const verify = packageVerificationCommand(root, packagePath);
    execute(root, verify[0], verify.slice(1));
    verifyPackageCommit(root, options.commit, execute);
    if (!before.equals(fs.readFileSync(packagePath))) throw new Error("Candidate changed during verification.");
    return {
        status: "passed",
        source,
        report: reportPath,
        ci: report.ci,
        package: { path: packagePath, size: before.length, sha256 },
        gameAcceptance: "not-run",
    };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2),
            options = {};
        const fields = { "--commit": "commit", "--report": "reportPath", "--package": "packagePath" };
        for (let index = 0; index < args.length; index++) {
            if (!fields[args[index]] || !args[index + 1] || args[index + 1].startsWith("--"))
                throw new Error(`Unknown option or missing value: ${args[index]}`);
            options[fields[args[index]]] = args[++index];
        }
        if (!options.reportPath) throw new Error("Use --commit SHA --report report.json [--package ZIP].");
        console.log(JSON.stringify(verifyCandidate(options), null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { verifyCandidate };
