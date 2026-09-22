import js from "@eslint/js";
import globals from "globals";
import { readFileSync } from "node:fs";

const nativeGlobals = JSON.parse(readFileSync(new URL(".github/kd-globals.json", import.meta.url), "utf8"));

export default [
    { ignores: ["node_modules/**", ".scratch/**", "KinkiestDungeon-5.5/**"] },
    js.configs.recommended,
    {
        files: ["**/*.{js,mjs,cjs}"],
        languageOptions: { ecmaVersion: 2022 },
        rules: {
            "no-unused-vars": [
                "error",
                { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
            ],
            "no-debugger": "error",
            eqeqeq: ["error", "smart"],
        },
    },
    {
        files: ["**/*.mjs", "KinkyDungeon-Spiderlings/tools/**/*.js"],
        languageOptions: { globals: globals.node },
    },
    {
        files: ["KinkyDungeon-Spiderlings/tools/**/*.js"],
        languageOptions: { sourceType: "commonjs" },
    },
    {
        files: ["KinkyDungeon-Spiderlings/*.js"],
        languageOptions: {
            sourceType: "script",
            globals: { ...globals.browser, ...Object.fromEntries(nativeGlobals.map((name) => [name, "writable"])) },
        },
    },
    {
        files: ["docs/**/*.js"],
        languageOptions: { globals: globals.browser },
    },
];
