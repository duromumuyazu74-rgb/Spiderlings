"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { run } = require("./delivery-commands.js");

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(file, value) {
    writeText(file, JSON.stringify(value, null, 2) + "\n");
}

function writeText(file, value) {
    fs.writeFileSync(file, value, "utf8");
}

function failure(code, step, cause) {
    const error = new Error(`${step}: ${code}`, { cause });
    error.code = code;
    error.step = step;
    return error;
}

function commandValid(command) {
    return (
        typeof command?.command === "string" &&
        Array.isArray(command.args) &&
        command.args.every((arg) => typeof arg === "string")
    );
}

function runSteps(root, plan, execute = run) {
    if (!Array.isArray(plan.steps) || !plan.steps.length) throw Error("A nonempty steps array is required.");
    for (const step of plan.steps) {
        if (!step.id || !commandValid(step)) throw Error("Each step needs id, command and string args.");
        if (step.githubAccount && !step.verify)
            throw Error("GitHub writes require a readback command and expected JSON fields.");
        if (
            step.verify &&
            (!commandValid(step.verify) ||
                (!step.verify.expected && !step.verify.expectedFile) ||
                (step.verify.expectedFile && typeof step.verify.expectedFile !== "string") ||
                (step.verify.expected &&
                    (typeof step.verify.expected !== "object" ||
                        Array.isArray(step.verify.expected) ||
                        !Object.keys(step.verify.expected).length)))
        )
            throw Error("Readback requires a command and expected JSON fields.");
    }
    const preparation = plan.prepare || [];
    if (!Array.isArray(preparation)) throw Error("prepare must be a file-script array.");
    for (const stage of preparation) {
        if (
            !stage.id ||
            typeof stage.script !== "string" ||
            !/\.(?:cjs|mjs|js)$/.test(stage.script) ||
            (stage.args && (!Array.isArray(stage.args) || stage.args.some((arg) => typeof arg !== "string")))
        )
            throw Error("Preparation requires id, JavaScript script and optional string args.");
    }
    // Check every preparation file before executing any of them, including later generators.
    for (const stage of preparation) {
        try {
            execute(root, process.execPath, ["--check", path.resolve(root, stage.script)]);
        } catch (error) {
            throw failure("preparation-syntax-failed", stage.id, error);
        }
    }
    for (const stage of preparation) {
        try {
            execute(root, process.execPath, [path.resolve(root, stage.script), ...(stage.args || [])]);
        } catch (error) {
            throw failure("preparation-failed", stage.id, error);
        }
    }
    const expectedFiles = new Map();
    for (const step of plan.steps) {
        if (!step.verify?.expectedFile) continue;
        let expected;
        try {
            expected = readJson(path.resolve(root, step.verify.expectedFile));
        } catch (error) {
            throw failure("expected-read-failed", step.id, error);
        }
        if (!expected || typeof expected !== "object" || Array.isArray(expected) || !Object.keys(expected).length)
            throw failure("expected-invalid", step.id);
        expectedFiles.set(step.id, expected);
    }
    const completed = [];
    for (const step of plan.steps) {
        if (step.githubAccount) {
            let identity;
            try {
                identity = execute(root, "gh", ["api", "user", "--jq", ".login"]).trim();
            } catch (error) {
                throw failure("identity-read-failed", step.id, error);
            }
            if (identity !== step.githubAccount) throw failure("identity-mismatch", step.id);
        }
        try {
            execute(root, step.command, step.args);
        } catch (error) {
            throw failure("command-failed", step.id, error);
        }
        if (step.verify) {
            let actual;
            try {
                actual = JSON.parse(execute(root, step.verify.command, step.verify.args));
            } catch (error) {
                throw failure("readback-failed", step.id, error);
            }
            for (const [key, expected] of Object.entries(expectedFiles.get(step.id) || step.verify.expected)) {
                const value = key.split(".").reduce((object, part) => object?.[part], actual);
                if (JSON.stringify(value) !== JSON.stringify(expected)) throw failure("readback-mismatch", step.id);
            }
        }
        completed.push({ id: step.id, status: "passed" });
    }
    return {
        status: "passed",
        preparation: preparation.map((stage) => ({ id: stage.id, status: "passed" })),
        steps: completed,
    };
}

if (require.main === module) {
    try {
        if (process.argv.length !== 3) throw Error("Usage: node tools/task-runner.js <plan.json>");
        const file = path.resolve(process.argv[2]);
        console.log(JSON.stringify(runSteps(process.cwd(), readJson(file)), null, 2));
    } catch (error) {
        console.error(
            JSON.stringify({
                status: "failed",
                code: error.code || "invalid-plan",
                step: error.step,
                message: error.message,
            }),
        );
        process.exitCode = 1;
    }
}

module.exports = { readJson, writeJson, writeText, runSteps };
