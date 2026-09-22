"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawnSync, execFileSync } = require("node:child_process");
const { parseReleaseVersion } = require("./release-version.js");

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
const now = () => new Date().toISOString();
const relative = (root, file) => path.relative(root, file).split(path.sep).join("/");
const powershell = process.platform === "win32" ? "powershell.exe" : "pwsh";

function git(root, ...args) {
    return execFileSync("git", args, {
        cwd: root,
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
    });
}

function captureSource(root, base) {
    const status = git(root, "status", "--porcelain=v1", "-z", "--untracked-files=all");
    const fields = status.split("\0").filter(Boolean);
    const changes = [];
    for (let index = 0; index < fields.length; index += 1) {
        const entry = fields[index];
        const change = { status: entry.slice(0, 2), path: entry.slice(3) };
        if (/[RC]/.test(change.status)) change.originalPath = fields[++index];
        const file = path.join(root, change.path);
        change.sha256 = fs.existsSync(file) && fs.statSync(file).isFile() ? sha256(fs.readFileSync(file)) : null;
        changes.push(change);
    }
    const head = git(root, "rev-parse", "HEAD").trim();
    const indexHash = sha256(git(root, "ls-files", "--stage", "-z"));
    return {
        head,
        branch: git(root, "branch", "--show-current").trim() || "detached",
        base,
        dirty: changes.length > 0,
        changes,
        fingerprint: sha256(JSON.stringify({ head, indexHash, changes })),
    };
}

function fileIdentity(file) {
    const bytes = fs.readFileSync(file);
    return { path: file, size: bytes.length, sha256: sha256(bytes) };
}

function versionOf(command, args) {
    const result = spawnSync(command, args, { encoding: "utf8", windowsHide: true });
    return result.status === 0 ? result.stdout.trim() || result.stderr.trim() : "unavailable";
}

function checkPlan(root, options, base, packagePath) {
    const tool = (name) => path.join(root, "KinkyDungeon-Spiderlings/tools", name);
    const ps = (script, ...args) => [
        powershell,
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        tool(script),
        ...args,
    ];
    return [
        {
            id: "build",
            command: ps("build-spiderlings-release.ps1"),
            run: options.build,
            reason: "Existing ZIP selected; no build requested.",
        },
        {
            id: "repository",
            command: [process.execPath, path.join(root, ".github/scripts/check-repository.mjs"), "--base", base],
            run: true,
        },
        {
            id: "policy-tests",
            command: [process.execPath, "--test", path.join(root, ".github/scripts/check-repository.test.mjs")],
            run: true,
        },
        { id: "public-tests", command: [process.execPath, tool("run-spiderlings-tests.js"), "public"], run: true },
        {
            id: "local-watcher",
            command: ps("watch-spiderlings-mod.ps1", "-Once"),
            run: options.mode === "full",
            reason: "Public mode omits private KD and original-art checks.",
        },
        {
            id: "package",
            command: ps("build-spiderlings-release.ps1", "-VerifyOnly", "-PackagePath", packagePath),
            run: true,
        },
        {
            id: "committed-atlas",
            command: ["git", "diff", "--exit-code", "HEAD", "--", "KinkyDungeon-Spiderlings/TextureAtlas"],
            run: options.build && options.mode === "public",
            reason: "CI public builds require generated atlas bytes to match the commit.",
        },
    ].map((step) => ({ ...step, status: "not-run" }));
}

function runCheck(root, output, step) {
    step.startedAt = now();
    step.log = `${step.id}.log`;
    const fd = fs.openSync(path.join(output, step.log), "wx");
    try {
        const result = spawnSync(step.command[0], step.command.slice(1), {
            cwd: root,
            stdio: ["ignore", fd, fd],
            windowsHide: true,
        });
        step.exitCode = result.status;
        step.signal = result.signal;
        step.status = result.status === 0 && !result.error ? "passed" : "failed";
        if (result.error) {
            step.error = result.error.message;
            fs.writeSync(fd, `${step.error}\n`);
        }
    } finally {
        fs.closeSync(fd);
        step.finishedAt = now();
    }
    delete step.reason;
}

function importAcceptance(inputPath, packageHash, output) {
    if (!inputPath) return { status: "not-run", records: [] };
    const inputBytes = fs.readFileSync(inputPath);
    const supplied = JSON.parse(inputBytes.toString("utf8").replace(/^\uFEFF/, ""));
    if (
        supplied.schemaVersion !== 1 ||
        !/^[a-f0-9]{64}$/.test(packageHash || "") ||
        typeof supplied.packageSha256 !== "string" ||
        supplied.packageSha256.toLowerCase() !== packageHash
    ) {
        throw new Error("Game acceptance must use schemaVersion 1 and the exact selected ZIP's packageSha256.");
    }
    if (!Array.isArray(supplied.records) || !supplied.records.length) {
        throw new Error("Game acceptance records must be a non-empty array.");
    }
    const records = supplied.records.map((entry, index) => {
        if (
            typeof entry.gameVersion !== "string" ||
            !entry.gameVersion.trim() ||
            typeof entry.scope !== "string" ||
            !entry.scope.trim() ||
            !["passed", "failed", "not-run"].includes(entry.status)
        ) {
            throw new Error(`Game acceptance record ${index + 1} needs gameVersion, scope and a valid status.`);
        }
        if (!Array.isArray(entry.limitations) || entry.limitations.some((value) => typeof value !== "string")) {
            throw new Error(`Game acceptance record ${index + 1} needs a limitations array.`);
        }
        const record = {
            gameVersion: entry.gameVersion,
            scope: entry.scope,
            reportedStatus: entry.status,
            limitations: entry.limitations,
        };
        if (entry.status !== "not-run") {
            if (typeof entry.evidence !== "string" || !entry.evidence)
                throw new Error("Executed game acceptance needs an evidence file.");
            const file = path.resolve(path.dirname(inputPath), entry.evidence);
            const bytes = fs.readFileSync(file);
            const attachment = `evidence-${index + 1}${path.extname(file)}`;
            fs.writeFileSync(path.join(output, attachment), bytes, { flag: "wx" });
            record.evidence = { file: attachment, originalPath: file, sha256: sha256(bytes) };
        }
        return record;
    });
    fs.writeFileSync(path.join(output, "acceptance-input.json"), inputBytes, { flag: "wx" });
    return {
        status: "reported",
        input: { path: inputPath, size: inputBytes.length, sha256: sha256(inputBytes) },
        records,
    };
}

function markdown(report) {
    const text = (value) =>
        String(value ?? "unknown")
            .replaceAll("|", "\\|")
            .replace(/[\r\n]+/g, " ");
    const lines = [
        "# Spiderlings delivery evidence",
        "",
        `Automated verification: **${report.status}**. Game acceptance: **${report.gameAcceptance.status}**.`,
        "",
        `- Generated: ${report.finishedAt || report.startedAt}`,
        `- Mode: ${report.mode}`,
        `- Version: ${report.release?.version || "unknown"}; formal baseline: ${report.release?.baseline || "unknown"}`,
        `- Source: ${report.source?.head || "unknown"} (${text(report.source?.branch)})`,
        `- Candidate: ${report.source?.dirty ? "worktree with uncommitted changes" : report.source ? "clean commit" : "unknown"}`,
        `- Comparison: ${text(report.base?.ref)} (${report.base?.sha || "unknown"})`,
        `- Source changed during checks: ${report.sourceChanged === undefined ? "unknown" : report.sourceChanged}`,
        `- ZIP: ${text(report.package?.path)}`,
        `- ZIP SHA-256: ${report.package?.sha256 || "unavailable"}`,
        `- ZIP size: ${report.package?.size ?? "unknown"} bytes`,
        `- ZIP content verification: ${report.package?.verification || "not-run"}`,
        `- Node: ${report.environment.node}; Git: ${text(report.environment.git)}`,
        `- PowerShell: ${text(report.environment.powershell)}; Python: ${text(report.environment.python)}`,
        `- Platform: ${report.environment.platform}/${report.environment.arch}`,
        "",
        "## Checks",
        "",
        "| Check | Result | Exit code | Log |",
        "| --- | --- | --- | --- |",
    ];
    for (const check of report.checks) {
        lines.push(
            `| ${check.id} | ${check.status} | ${check.exitCode ?? "—"} | ${check.log ? `[log](${check.log})` : text(check.reason)} |`,
        );
    }
    lines.push("", "Commands and timestamps are recorded in report.json.", "", "## Uncommitted changes", "");
    if (!report.source?.changes.length) lines.push(report.source ? "None." : "Source state unavailable.");
    else
        for (const change of report.source.changes)
            lines.push(
                `- ${text(change.status)} ${text(change.path)}${change.originalPath ? ` (from ${text(change.originalPath)})` : ""}`,
            );
    lines.push("", "## Game acceptance", "");
    if (report.gameAcceptance.status === "not-run") lines.push("No game acceptance records were supplied.");
    else if (report.gameAcceptance.status === "invalid")
        lines.push("Supplied evidence could not be accepted. See errors below.");
    else {
        lines.push(
            "These results were supplied by the named evidence files. This command records their package binding and file hashes.",
            "",
        );
        for (const record of report.gameAcceptance.records) {
            lines.push(
                `- ${text(record.gameVersion)}: reported ${record.reportedStatus}. Scope: ${text(record.scope)}`,
            );
            if (record.evidence)
                lines.push(`  Evidence: [file](${record.evidence.file}); SHA-256 ${record.evidence.sha256}.`);
            for (const limitation of record.limitations) lines.push(`  Limitation: ${text(limitation)}`);
        }
    }
    if (report.errors.length) lines.push("", "## Errors", "", ...report.errors.map((error) => `- ${text(error)}`));
    return lines.join("\n") + "\n";
}

function saveReport(output, report) {
    fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(path.join(output, "REPORT.md"), markdown(report));
}

function collectDelivery(options = {}) {
    const root = path.resolve(options.root || path.join(__dirname, "../.."));
    options = { mode: "full", build: false, ...options };
    const reports = path.join(root, ".scratch/delivery");
    fs.mkdirSync(reports, { recursive: true });
    const output = fs.mkdtempSync(path.join(reports, `${now().replace(/[:.]/g, "-")}-`));
    const report = {
        schemaVersion: 1,
        startedAt: now(),
        mode: options.mode,
        status: "in-progress",
        environment: {
            node: process.version,
            platform: process.platform,
            arch: process.arch,
            git: versionOf("git", ["--version"]),
            python: versionOf("python", ["--version"]),
            powershell: versionOf(powershell, ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"]),
        },
        checks: [],
        gameAcceptance: { status: "not-run", records: [] },
        errors: [],
    };
    saveReport(output, report);
    try {
        if (!["full", "public"].includes(options.mode)) throw new Error("Mode must be full or public.");
        const event = process.env.GITHUB_EVENT_PATH ? readJson(process.env.GITHUB_EVENT_PATH) : {};
        if (process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID) {
            report.ci = {
                repository: process.env.GITHUB_REPOSITORY,
                runUrl: `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`,
                attempt: process.env.GITHUB_RUN_ATTEMPT,
                event: process.env.GITHUB_EVENT_NAME,
                pullRequestHead: event.pull_request?.head.sha,
            };
        }
        const baseRef = options.base || event.pull_request?.base.sha || process.env.BASE_SHA || "origin/test";
        const baseSha = git(root, "rev-parse", "--verify", "--end-of-options", `${baseRef}^{commit}`).trim();
        report.base = { ref: baseRef, sha: baseSha };
        report.release = parseReleaseVersion(readJson(path.join(root, "KinkyDungeon-Spiderlings/mod.json")).modbuild);
        const packagePath = path.resolve(root, options.packagePath || report.release.packageName);
        report.package = { path: packagePath, verification: "not-run" };
        if (options.build && packagePath !== path.join(root, report.release.packageName)) {
            throw new Error(
                "--build writes the default versioned ZIP; use --package without --build to verify another path.",
            );
        }
        report.checks = checkPlan(root, options, baseSha, packagePath);
        report.sourceBeforeBuild = captureSource(root, baseSha);
        const build = report.checks[0];
        if (build.run) runCheck(root, output, build);
        // A requested build may regenerate tracked atlases. Tests bind to the resulting source.
        report.source = captureSource(root, baseSha);
        const beforePackage = fs.existsSync(packagePath) ? fileIdentity(packagePath) : null;
        if (beforePackage) Object.assign(report.package, beforePackage);
        saveReport(output, report);
        for (const check of report.checks.slice(1)) {
            if (check.run) runCheck(root, output, check);
            saveReport(output, report);
        }
        report.sourceAfterChecks = captureSource(root, baseSha);
        report.sourceChanged = report.source.fingerprint !== report.sourceAfterChecks.fingerprint;
        if (report.sourceChanged)
            report.errors.push("Source or index changed during checks; rerun against a stable snapshot.");
        const afterPackage = fs.existsSync(packagePath) ? fileIdentity(packagePath) : null;
        if (!afterPackage) report.errors.push("Selected installable ZIP is missing.");
        else {
            Object.assign(report.package, afterPackage);
            if (!beforePackage || beforePackage.sha256 !== afterPackage.sha256) {
                report.errors.push("Selected ZIP changed during checks; rerun against the final file.");
            }
        }
        const verified = report.checks.find((check) => check.id === "package").status;
        report.package.verification = report.sourceChanged || report.errors.length ? "invalidated" : verified;
        if (options.evidencePath) {
            report.gameAcceptance.status = "invalid";
            report.gameAcceptance = importAcceptance(
                path.resolve(root, options.evidencePath),
                afterPackage?.sha256,
                output,
            );
            if (report.gameAcceptance.records.some((record) => record.reportedStatus === "failed")) {
                report.errors.push("Supplied game acceptance reports a failure.");
            }
        }
    } catch (error) {
        report.errors.push(error.message);
    }
    report.status =
        report.errors.length || report.checks.some((check) => check.run && check.status !== "passed")
            ? "failed"
            : "passed";
    report.finishedAt = now();
    saveReport(output, report);
    return { report, output, exitCode: report.status === "passed" ? 0 : 1 };
}

function parseArguments(args) {
    const options = {};
    const values = { "--base": "base", "--mode": "mode", "--package": "packagePath", "--evidence": "evidencePath" };
    for (let index = 0; index < args.length; index += 1) {
        const argument = args[index];
        if (argument === "--build") options.build = true;
        else if (values[argument] && args[index + 1] && !args[index + 1].startsWith("--"))
            options[values[argument]] = args[++index];
        else throw new Error(`Unknown option or missing value: ${argument}`);
    }
    return options;
}

if (require.main === module) {
    if (process.argv.includes("--help")) {
        console.log(
            "npm run report:delivery -- [--mode full|public] [--base origin/test] [--build] [--package ZIP] [--evidence JSON]",
        );
    } else {
        try {
            const result = collectDelivery(parseArguments(process.argv.slice(2)));
            console.log(
                `Delivery evidence ${result.report.status}: ${relative(process.cwd(), path.join(result.output, "REPORT.md"))}`,
            );
            process.exitCode = result.exitCode;
        } catch (error) {
            console.error(error.message);
            process.exitCode = 1;
        }
    }
}

module.exports = { collectDelivery };
