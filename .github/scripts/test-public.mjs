import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const tests = ["webbing-cutover", "webbing-cocoon", "webbing-enemy", "release-package"].map(
    (name) => `KinkyDungeon-Spiderlings/tools/tests/spiderlings-${name}.test.js`,
);
const spinner = "KinkyDungeon-Spiderlings/tools/tests/spiderlings-spinner-art.test.js";
if (existsSync(spinner)) tests.push(spinner);
execFileSync(process.execPath, ["--test", ...tests], { stdio: "inherit" });
