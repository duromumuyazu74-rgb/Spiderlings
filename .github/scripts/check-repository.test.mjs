import assert from "node:assert/strict";
import test from "node:test";
import { ESLint } from "eslint";
import { validateFile, validatePullRequest, validSubject } from "./check-repository.mjs";

test("commit subjects use Conventional Commits without multiline metadata", () => {
    assert.equal(validSubject("style: format README tables"), true);
    assert.equal(validSubject("fix(webbing)!: update the save contract"), true);
    assert.equal(validSubject("update files"), false);
    assert.equal(validSubject("fix: first line\nsecond line"), false);
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
