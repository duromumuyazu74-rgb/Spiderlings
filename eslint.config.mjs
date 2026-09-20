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
        files: ["**/*.mjs", "Spiderlings_0.91/tools/**/*.js"],
        languageOptions: { globals: globals.node },
    },
    {
        files: ["Spiderlings_0.91/tools/**/*.js"],
        languageOptions: { sourceType: "commonjs" },
    },
    {
        files: ["Spiderlings_0.91/*.js", "Spiderlings_0.91/tools/displacement-prototype/*.js"],
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
