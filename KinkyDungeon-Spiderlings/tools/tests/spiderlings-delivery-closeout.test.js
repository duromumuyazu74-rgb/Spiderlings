"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const {
    auditCloseout,
    collectCloseout,
    closeoutMarkdown,
    collectAuditResult,
} = require("../audit-delivery-closeout.js");

test("structured collection distinguishes unavailable reads from unmet acceptance", () => {
    const { input } = fixture();
    const unavailable = collectAuditResult(".", input, () => {
        throw Error("network EOF");
    });
    assert.equal(unavailable.status, "unavailable");
    assert.equal(unavailable.phase, "read");
    assert.match(unavailable.errors[0], /EOF/);
    assert.equal(collectAuditResult(".", {}).status, "invalid-input");
});

test("CLI writes structured input failures and refuses to overwrite its input", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "spiderlings-closeout-"));
    try {
        const input = path.join(directory, "input.json"),
            output = path.join(directory, "result.json");
        fs.writeFileSync(input, "{broken", "utf8");
        const cli = path.resolve(__dirname, "../audit-delivery-closeout.js");
        const failed = spawnSync(process.execPath, [cli, input, "--output", output], { encoding: "utf8" });
        assert.equal(failed.status, 2);
        assert.deepEqual(JSON.parse(failed.stdout), JSON.parse(fs.readFileSync(output, "utf8")));
        assert.equal(JSON.parse(failed.stdout).status, "invalid-input");
        const refused = spawnSync(process.execPath, [cli, input, "--output", input], { encoding: "utf8" });
        assert.equal(refused.status, 2);
        assert.match(JSON.parse(refused.stdout).errors[0], /overwrite/);
        assert.equal(fs.readFileSync(input, "utf8"), "{broken");
    } finally {
        assert.equal(path.dirname(fs.realpathSync(directory)), fs.realpathSync(os.tmpdir()));
        assert.ok(path.basename(directory).startsWith("spiderlings-closeout-"));
        fs.rmSync(directory, { recursive: true });
    }
});

function fixture() {
    const input = {
        schemaVersion: 1,
        repository: "owner/mod",
        pr: 10,
        head: "a".repeat(40),
        targetBranch: "test",
        issues: [
            {
                number: 1,
                disposition: "completed",
                acceptanceSatisfied: true,
                requiresIntegration: false,
                condition: "Deliver a tested package",
                evidence: ["package acceptance"],
                reason: "Package accepted",
                nextAction: "None",
            },
            {
                number: 2,
                disposition: "pending-integration",
                acceptanceSatisfied: true,
                requiresIntegration: true,
                implementationCommit: "b".repeat(40),
                condition: "Merge into test",
                evidence: ["PR10"],
                reason: "PR is draft",
                nextAction: "Integrate the reviewed PR",
            },
        ],
    };
    const snapshot = {
        repository: "owner/mod",
        pr: { number: 10, headRefOid: input.head, baseRefName: "test", body: "Refs #1\nRefs #2", isDraft: true },
        issues: [
            { number: 1, state: "CLOSED", labels: [] },
            { number: 2, state: "OPEN", labels: [{ name: "ready-for-human" }] },
        ],
        target: "c".repeat(40),
        integrated: { 2: false },
    };
    return { input, snapshot };
}

test("closeout separates satisfied delivery from unfinished integration and renders every disposition", () => {
    const { input, snapshot } = fixture();
    const result = auditCloseout(input, snapshot);
    assert.equal(result.status, "passed");
    assert.match(closeoutMarkdown(result), /#1.*completed.*Package accepted/);
    assert.match(closeoutMarkdown(result), /#2.*pending-integration.*Integrate the reviewed PR/);
});

test("missing PR references and duplicate Issue dispositions fail closeout", () => {
    const { input, snapshot } = fixture();
    input.issues.pop();
    assert.match(auditCloseout(input, snapshot).errors.join(" "), /Missing disposition.*#2/);
    input.issues.push(input.issues[0]);
    assert.match(auditCloseout(input, snapshot).errors.join(" "), /exactly one/);
});

test("changed heads and targets cannot reuse a review closeout", () => {
    const { input, snapshot } = fixture();
    snapshot.pr.headRefOid = "d".repeat(40);
    snapshot.pr.baseRefName = "main";
    assert.match(auditCloseout(input, snapshot).errors.join(" "), /head changed.*target branch changed/);
});

test("completed work cannot retain implementation labels or silently miss its required merge", () => {
    const { input, snapshot } = fixture();
    snapshot.issues[0].labels = [{ name: "ready-for-agent" }];
    assert.match(auditCloseout(input, snapshot).errors.join(" "), /pending-work label/);
    snapshot.issues[1].labels = [{ name: "ready-for-agent" }];
    assert.match(auditCloseout(input, snapshot).errors.join(" "), /pending-implementation label/);
    input.issues[1].disposition = "completed";
    snapshot.issues[1].state = "CLOSED";
    assert.match(auditCloseout(input, snapshot).errors.join(" "), /not in target branch/);
});

test("an open completed ticket, unaccepted claim and omitted remaining action fail independently", () => {
    const { input, snapshot } = fixture();
    snapshot.issues[0].state = "OPEN";
    input.issues[0].acceptanceSatisfied = false;
    input.issues[0].nextAction = "";
    const errors = auditCloseout(input, snapshot).errors.join(" ");
    assert.match(errors, /nextAction/);
    assert.match(errors, /remains open/);
    assert.match(errors, /lacks acceptance/);
});

test("invalid evidence still renders a failure report instead of losing the diagnostic", () => {
    const { input, snapshot } = fixture();
    delete input.issues[0].evidence;
    const result = auditCloseout(input, snapshot);
    assert.equal(result.status, "failed");
    assert.match(closeoutMarkdown(result), /at least one evidence reference/);
});

test("live collection derives origin, reads omitted references and compares the actual target without writes", () => {
    const { input, snapshot } = fixture(),
        calls = [];
    const execute = (_root, command, args) => {
        calls.push([command, ...args]);
        if (command === "git") return "git@github.com:owner/mod.git\n";
        if (args[0] === "pr") return JSON.stringify(snapshot.pr);
        if (args[0] === "issue")
            return JSON.stringify(snapshot.issues.find((issue) => issue.number === Number(args[2])));
        if (args[1].includes("/commits/")) return JSON.stringify({ sha: snapshot.target });
        if (args[1].includes("/compare/")) return JSON.stringify({ status: "diverged" });
        throw new Error(`Unexpected command: ${args.join(" ")}`);
    };
    const result = collectCloseout(".", input, execute);
    assert.equal(result.status, "passed");
    assert.ok(calls.some((call) => call.includes(`repos/owner/mod/compare/${"b".repeat(40)}...${snapshot.target}`)));
    assert.ok(
        calls.every(
            (call) => !call.some((arg) => ["edit", "close", "create", "POST", "PATCH", "DELETE"].includes(arg)),
        ),
    );
    input.issues.pop();
    assert.match(collectCloseout(".", input, execute).errors.join(" "), /Missing disposition.*#2/);
});
