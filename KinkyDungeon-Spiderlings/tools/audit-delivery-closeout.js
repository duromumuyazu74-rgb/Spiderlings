"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { run, repository } = require("./delivery-commands.js");
const { writeJson } = require("./task-runner.js");

function referencedIssues(body) {
    return [...new Set([...body.matchAll(/\b(?:Refs|Fixes|Closes|Resolves)\s+#(\d+)\b/gi)].map((m) => Number(m[1])))];
}

function auditCloseout(input, snapshot) {
    const errors = [];
    if (input.schemaVersion !== 1 || !Array.isArray(input.issues) || !input.issues.length)
        throw new Error("Closeout needs schemaVersion 1 and a non-empty issues array.");
    if (input.repository !== snapshot.repository) errors.push("Configured repository differs from closeout input.");
    if (input.pr !== snapshot.pr.number) errors.push("PR number differs from closeout input.");
    if (input.head !== snapshot.pr.headRefOid) errors.push("PR head changed; review the new commit before closeout.");
    if (input.targetBranch !== snapshot.pr.baseRefName) errors.push("PR target branch changed.");
    const numbers = input.issues.map((entry) => entry.number);
    if (new Set(numbers).size !== numbers.length) errors.push("Each Issue must have exactly one disposition.");
    for (const number of referencedIssues(snapshot.pr.body))
        if (!numbers.includes(number)) errors.push(`Missing disposition for PR reference #${number}.`);
    for (const entry of input.issues) {
        const issue = snapshot.issues.find((candidate) => candidate.number === entry.number);
        if (!issue) {
            errors.push(`Issue #${entry.number} was not read from GitHub.`);
            continue;
        }
        const fail = (text) => errors.push(`#${entry.number}: ${text}`);
        if (!entry.condition?.trim() || !entry.reason?.trim() || !entry.nextAction?.trim())
            fail("condition, reason and nextAction are required.");
        if (!Array.isArray(entry.evidence) || !entry.evidence.length || entry.evidence.some((item) => !item?.trim()))
            fail("at least one evidence reference is required.");
        if (typeof entry.acceptanceSatisfied !== "boolean" || typeof entry.requiresIntegration !== "boolean")
            fail("acceptanceSatisfied and requiresIntegration must be explicit booleans.");
        const labels = issue.labels.map((label) => label.name);
        if (["completed", "superseded"].includes(entry.disposition)) {
            if (issue.state !== "CLOSED") fail("closeout is unfinished: Issue remains open.");
            if (
                labels.some((label) =>
                    ["ready-for-agent", "ready-for-human", "needs-info", "needs-triage"].includes(label),
                )
            )
                fail("completed disposition retains a pending-work label.");
            if (entry.disposition === "completed" && !entry.acceptanceSatisfied) fail("completion lacks acceptance.");
            if (entry.requiresIntegration && !snapshot.integrated[entry.number])
                fail("required commit is not in target branch.");
        } else if (
            ["pending-integration", "pending-acceptance", "pending-implementation"].includes(entry.disposition)
        ) {
            if (issue.state !== "OPEN") fail("pending disposition disagrees with closed Issue.");
            if (entry.disposition === "pending-integration") {
                if (!entry.acceptanceSatisfied || !entry.requiresIntegration)
                    fail("integration pending needs accepted work and an integration condition.");
                if (snapshot.integrated[entry.number])
                    fail("commit is already integrated; reevaluate the remaining condition.");
            }
            if (entry.acceptanceSatisfied && labels.includes("ready-for-agent"))
                fail("accepted work still carries the pending-implementation label.");
            if (entry.disposition !== "pending-integration" && entry.acceptanceSatisfied)
                fail("accepted work contradicts the pending implementation or acceptance disposition.");
        } else fail("unknown disposition.");
    }
    return { status: errors.length ? "failed" : "passed", errors, issues: input.issues, snapshot };
}

function collectCloseout(root, input, execute = run) {
    const repo = repository(root, execute);
    const gh = (args) => JSON.parse(execute(root, "gh", args));
    const pr = gh([
        "pr",
        "view",
        String(input.pr),
        "--repo",
        repo,
        "--json",
        "number,body,headRefOid,baseRefName,state,isDraft,mergedAt",
    ]);
    const numbers = [...new Set([...input.issues.map((entry) => entry.number), ...referencedIssues(pr.body)])];
    const issues = numbers.map((number) =>
        gh(["issue", "view", String(number), "--repo", repo, "--json", "number,title,state,body,labels,comments,url"]),
    );
    const target = gh([
        "api",
        `repos/${repo}/commits/${encodeURIComponent(pr.baseRefName)}`,
        "--method",
        "GET",
        "--jq",
        "{sha: .sha}",
    ]).sha;
    const integrated = {},
        comparisons = new Map();
    for (const entry of input.issues) {
        if (!entry.requiresIntegration) continue;
        if (!/^[a-f0-9]{40}$/.test(entry.implementationCommit || ""))
            throw new Error(`#${entry.number}: integration condition needs a full implementationCommit.`);
        if (!comparisons.has(entry.implementationCommit))
            comparisons.set(
                entry.implementationCommit,
                gh([
                    "api",
                    `repos/${repo}/compare/${entry.implementationCommit}...${target}`,
                    "--method",
                    "GET",
                    "--jq",
                    "{status: .status}",
                ]),
            );
        const comparison = comparisons.get(entry.implementationCommit);
        integrated[entry.number] = ["ahead", "identical"].includes(comparison.status);
    }
    return auditCloseout(input, {
        repository: repo,
        pr,
        issues,
        target,
        integrated,
        checkedAt: new Date().toISOString(),
    });
}

function closeoutMarkdown(result) {
    const text = (value) =>
        String(value)
            .replaceAll("|", "\\|")
            .replace(/[\r\n]+/g, " ");
    return (
        [
            `## Issue closeout: ${result.status}`,
            "",
            `PR #${result.snapshot.pr.number}; head ${result.snapshot.pr.headRefOid}; target ${result.snapshot.pr.baseRefName} at ${result.snapshot.target}.`,
            "",
            "| Issue | Disposition | Completion condition | Evidence | Reason | Next action |",
            "| --- | --- | --- | --- | --- | --- |",
            ...result.issues.map(
                (entry) =>
                    `| #${entry.number} | ${entry.disposition} | ${text(entry.condition)} | ${text(Array.isArray(entry.evidence) ? entry.evidence.join(", ") : "missing")} | ${text(entry.reason)} | ${text(entry.nextAction)} |`,
            ),
            "",
            ...result.errors.map((error) => `- ${text(error)}`),
        ].join("\n") + "\n"
    );
}

function collectAuditResult(root, input, execute = run) {
    if (input?.schemaVersion !== 1 || !Array.isArray(input.issues) || !input.issues.length)
        return { status: "invalid-input", phase: "input", errors: ["Closeout requires schemaVersion 1 and issues."] };
    try {
        return collectCloseout(root, input, execute);
    } catch (error) {
        return { status: "unavailable", phase: "read", errors: [error.message] };
    }
}

if (require.main === module) {
    let output;
    let result;
    try {
        const [inputPath, flag, destination, extra] = process.argv.slice(2);
        output = flag === "--output" ? destination : undefined;
        if (!inputPath || extra || (flag && (!output || flag !== "--output")))
            throw new Error("Usage: npm run audit:closeout -- closeout.json [--output result.json]");
        if (output && path.resolve(output) === path.resolve(inputPath)) {
            output = undefined;
            throw Error("Audit output cannot overwrite input.");
        }
        const input = JSON.parse(fs.readFileSync(inputPath, "utf8").replace(/^\uFEFF/, ""));
        result = collectAuditResult(path.resolve(__dirname, "../.."), input);
    } catch (error) {
        result = { status: "invalid-input", phase: "input", errors: [error.message] };
    }
    if (output) {
        try {
            writeJson(output, result);
        } catch (error) {
            result = { status: "unavailable", phase: "output", errors: [error.message] };
        }
    }
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.status === "passed" ? 0 : result.status === "failed" ? 1 : 2;
}

module.exports = { auditCloseout, collectCloseout, closeoutMarkdown, collectAuditResult };
