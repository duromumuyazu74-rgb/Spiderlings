"use strict";

function parseReleaseVersion(version) {
    if (typeof version !== "string") throw new Error("modbuild must be a string.");
    const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-test\.([1-9]\d*)|-prison\.alpha\.([1-9]\d*))?$/.exec(
        version,
    );
    if (
        !match ||
        match[0] !== version ||
        match.slice(1).some((part) => part !== undefined && !Number.isSafeInteger(Number(part)))
    ) {
        throw new Error(
            "modbuild must be major.minor.patch, optionally followed by -test.N or -prison.alpha.N with N >= 1.",
        );
    }
    const baseline = match.slice(1, 4).join(".");
    return {
        version,
        channel: match[4] !== undefined ? "test" : match[5] !== undefined ? "prison-alpha" : "formal",
        baseline,
        iteration: match[4] === undefined && match[5] === undefined ? undefined : Number(match[4] ?? match[5]),
        packageName: `Spiderlings_${version}.zip`,
    };
}

module.exports = { parseReleaseVersion };
