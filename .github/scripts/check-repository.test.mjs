import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";
import { checkRequiredJobs } from "./check-workflow-needs.mjs";
import {
    isDocumentationOnly,
    validateCommitSubject,
    validateFile,
    validatePullRequest,
    validSubject,
} from "./check-repository.mjs";

test("the required CI gate rejects failed, skipped, cancelled and missing prerequisites", () => {
    assert.doesNotThrow(() => checkRequiredJobs({ windows: { result: "success" }, delivery: { result: "success" } }));
    for (const result of ["failure", "skipped", "cancelled", undefined]) {
        for (const name of ["windows", "delivery"]) {
            const jobs = { windows: { result: "success" }, delivery: { result: "success" } };
            jobs[name].result = result;
            assert.throws(() => checkRequiredJobs(jobs), new RegExp(name));
        }
    }
    for (const jobs of [null, {}]) assert.throws(() => checkRequiredJobs(jobs), /missing/);
});

test("the reported README edit needs no commit prefix or Issue boilerplate", () => {
    const files = ["README.md"];
    assert.deepEqual(validatePullRequest({ title: "Update README.md", body: "## Change\n\nFix Readme" }, files), []);
    assert.deepEqual(validateCommitSubject("1c91c913a626fa136ac881d8ccbd1760859fb391", "Update README.md", files), []);
});

test("documentation commits remain valid when carried into a mixed implementation PR", () => {
    const pr = { title: "fix: preserve escape progress", body: "Refs #12" };
    assert.deepEqual(validatePullRequest(pr, ["README.md", "Spiderlings_0.91/SpiderlingsWebbing.js"]), []);
    assert.deepEqual(validateCommitSubject("docs-sha", "Update README.md", ["README.md"]), []);
    assert.equal(
        validateCommitSubject("code-sha", "Update code", ["Spiderlings_0.91/SpiderlingsWebbing.js"]).length,
        1,
    );
});

test("mixed changes, deleted code and code renamed to Markdown do not gain the documentation exception", () => {
    for (const files of [
        [],
        ["README.md", ".github/workflows/repository-checks.yml"],
        ["deleted.js", "README.md"],
        ["old.py", "docs/new.md"],
    ]) {
        assert.equal(isDocumentationOnly(files), false);
        assert.equal(validatePullRequest({ title: "Update README.md", body: "" }, files).length, 2);
    }
    assert.equal(isDocumentationOnly(["README.md", "docs/removed.md"]), true);
});

test("commit subjects use Conventional Commits without multiline metadata", () => {
    assert.equal(validSubject("style: format README tables"), true);
    assert.equal(validSubject("fix(webbing)!: update the save contract"), true);
    assert.equal(validSubject("update files"), false);
    assert.equal(validSubject("fix: first line\nsecond line"), false);
});

test("commit and PR summaries accept natural languages without an English prefix", () => {
    for (const title of ["fix: 修正文档链接", "docs: ドキュメントを更新", "fix: إصلاح الرابط", "fix: 修"]) {
        assert.deepEqual(validateCommitSubject("new-code", title, [".github/scripts/check-repository.mjs"]), []);
        assert.deepEqual(
            validatePullRequest({ title, body: "Refs #12" }, [".github/scripts/check-repository.mjs"]),
            [],
        );
    }
    for (const title of ["fix: ", "fix:    ", "fix: 修复\n", "fix: 修复\r\n", "fix: 修复\n更多内容"]) {
        assert.equal(validSubject(title), false, title);
    }
});

test("runtime code is JavaScript and tools retain the approved languages", () => {
    for (const file of [
        "Spiderlings_0.91/New.js",
        "Spiderlings_0.91/tools/new.py",
        ".github/scripts/new.ps1",
        "docs/guide.zh-CN.md",
        "Spiderlings_0.91/SpiderlingsJP.csv",
    ]) {
        assert.equal(validateFile(file), null, file);
    }
    for (const file of [
        "Spiderlings_0.91/New.py",
        "Spiderlings_0.91/New.mjs",
        "Spiderlings_0.91/New.ps1",
        "tools/new.ts",
        "tools/new.sh",
        "tools/new.cmd",
    ]) {
        assert.ok(validateFile(file), file);
    }
});

test("PR metadata accepts issue-backed changes and explained maintenance exceptions", () => {
    assert.deepEqual(
        validatePullRequest({
            title: "fix(webbing): preserve escape progress",
            body: "Refs #12\n\nChecked the lifecycle regression.",
        }),
        [],
    );
    assert.deepEqual(
        validatePullRequest({
            title: "docs: correct an installation link",
            body: "Issue: none - correct a typo in the download URL",
        }),
        [],
    );
    assert.equal(validatePullRequest({ title: "misc", body: "Refs #" }).length, 2);
    assert.equal(validatePullRequest({ title: "feat: add a feature", body: "Issue: none" }).length, 1);
});

test("lint accepts declared KD globals but rejects an unknown identifier and assignment mistake", async () => {
    const linter = new ESLint();
    const valid = await linter.lintText('"use strict"; KinkyDungeonSendTextMessage(1, "message", "white", 1);', {
        filePath: "Spiderlings_0.91/New.js",
    });
    assert.equal(valid[0].errorCount, 0);
    const invalid = await linter.lintText('"use strict"; if (missing = 1) KinkyDungeonTypo();', {
        filePath: "Spiderlings_0.91/New.js",
    });
    assert.ok(invalid[0].messages.some((message) => message.ruleId === "no-undef"));
    assert.ok(invalid[0].messages.some((message) => message.ruleId === "no-cond-assign"));
});
