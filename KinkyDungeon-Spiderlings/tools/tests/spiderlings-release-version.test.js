"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { parseReleaseVersion } = require("../release-version.js");

test("future formal and test versions retain their own baseline and installable filename", () => {
    assert.deepEqual(parseReleaseVersion("1.2.30"), {
        version: "1.2.30",
        channel: "formal",
        baseline: "1.2.30",
        iteration: undefined,
        packageName: "Spiderlings_1.2.30.zip",
    });
    assert.deepEqual(parseReleaseVersion("0.92.36-test.12"), {
        version: "0.92.36-test.12",
        channel: "test",
        baseline: "0.92.36",
        iteration: 12,
        packageName: "Spiderlings_0.92.36-test.12.zip",
    });
    assert.equal(parseReleaseVersion("2.0.0-test.1").baseline, "2.0.0");
    assert.deepEqual(parseReleaseVersion("0.92.36-prison.alpha.1"), {
        version: "0.92.36-prison.alpha.1",
        channel: "prison-alpha",
        baseline: "0.92.36",
        iteration: 1,
        packageName: "Spiderlings_0.92.36-prison.alpha.1.zip",
    });
});

test("versions reject malformed iterations, ambiguous numbers and unsafe package paths", () => {
    for (const value of [
        null,
        1,
        "",
        "0.92",
        "v0.92.39",
        "0.92.039",
        "0.92.39-test.0",
        "0.92.39-test.01",
        "0.92.39-test.-1",
        "0.92.39-test.1.2",
        "0.92.39-prison.alpha.0",
        "0.92.39-prison.alpha.01",
        "0.92.39-prison.beta.1",
        "0.92.39-prison.alpha.1.2",
        "0.92.39-beta.1",
        "0.92.39\n",
        "0.92.39/../other",
        "0.92.39\\other",
        "9007199254740992.0.0",
        "0.92.39-test.9007199254740992",
        "0.92.39-prison.alpha.9007199254740992",
    ]) {
        assert.throws(() => parseReleaseVersion(value), /modbuild/, String(value));
    }
});
