import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const tests = ["webbing-cutover", "webbing-cocoon", "webbing-enemy", "release-package"].map(
    (name) => `Spiderlings_0.91/tools/tests/spiderlings-${name}.test.js`,
);
const spinner = "Spiderlings_0.91/tools/tests/spiderlings-spinner-art.test.js";
if (existsSync(spinner)) tests.push(spinner);
execFileSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
