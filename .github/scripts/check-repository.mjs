import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ESLint } from "eslint";
import * as prettier from "prettier";

const root = fileURLToPath(new URL("../../", import.meta.url));
const policy = JSON.parse(readFileSync(new URL("../repository-policy.json", import.meta.url), "utf8"));
const javascript = new Set([".js", ".mjs", ".cjs"]);

function git(...args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" });
}

export function validateFile(file) {
    const extension = path.posix.extname(file).toLowerCase();
    const legacy = policy.legacyFiles.includes(file);
    if (!legacy && !policy.extensions.includes(extension) && !policy.specialFiles.includes(path.posix.basename(file))) {
        return `${file}: unsupported file type; update the documented language policy before adding it`;
    }
    if (/^Spiderlings_0\.91\/(?!tools\/)/.test(file) && [".mjs", ".cjs", ".py", ".ps1"].includes(extension)) {
        return `${file}: executable Mod code must be a plain .js script; maintenance code belongs in tools/`;
    }
    return null;
}

export function validSubject(subject) {
    return /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9-]+\))?!?: [A-Za-z][^\r\n]+$/.test(
        subject,
    );
}

export function isDocumentationOnly(files) {
    return files.length > 0 && files.every((file) => /\.md$/i.test(file));
}

export function validateCommitSubject(sha, subject, files) {
    if (policy.grandfatheredCommits.includes(sha) || validSubject(subject) || isDocumentationOnly(files)) return [];
    return [`${sha}: commit subject must use type(scope): English summary`];
}

export function validatePullRequest(pr, files = []) {
    if (isDocumentationOnly(files)) return [];
    const errors = [];
    if (!validSubject(pr.title)) {
        errors.push(
            "PR title must use an English Conventional Commit subject, for example: fix(webbing): preserve escape progress",
        );
    }
    if (
        !/(?:refs|fixes|closes|resolves)\s+#\d+\b/i.test(pr.body ?? "") &&
        !/^Issue: none\s+-\s+\S.+/im.test(pr.body ?? "")
    ) {
        errors.push(
            "PR body must link an Issue with Refs #N, or explain a small maintenance exception with Issue: none - <reason>",
        );
    }
    return errors;
}

export function changedFiles(base) {
    // Include deletions and both sides of renames when deciding whether a change is documentation-only.
    const tracked = git("diff", "--no-renames", "--name-only", "-z", base, "--");
    const added = git("ls-files", "--others", "--exclude-standard", "-z");
    return [...new Set((tracked + added).split("\0").filter(Boolean))].sort();
}

async function main() {
    process.chdir(root);
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== "--base")) {
        throw new Error("Usage: npm run check -- --base <commit-or-ref>");
    }
    const event = process.env.GITHUB_EVENT_PATH ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8")) : {};
    const base = args[1] ?? event.pull_request?.base.sha ?? process.env.BASE_SHA ?? "origin/test";
    git("rev-parse", "--verify", `${base}^{commit}`);
    const changed = changedFiles(base);
    const files = changed.filter((file) => existsSync(file));
    const errors = files.map(validateFile).filter(Boolean);
    if (event.pull_request) errors.push(...validatePullRequest(event.pull_request, changed));
    const head = event.pull_request?.head.sha ?? "HEAD";
    const commits = git("log", "--format=%H%x00%s", "-z", `${base}..${head}`).split("\0").filter(Boolean);
    for (let index = 0; index < commits.length; index += 2) {
        const [sha, subject] = commits.slice(index, index + 2);
        if (policy.grandfatheredCommits.includes(sha) || validSubject(subject)) continue;
        const commitFiles = git(
            "diff-tree",
            "--root",
            "--no-commit-id",
            "--no-renames",
            "--name-only",
            "-r",
            "-m",
            "-z",
            sha,
            "--",
        )
            .split("\0")
            .filter(Boolean);
        errors.push(...validateCommitSubject(sha, subject, commitFiles));
    }

    const linter = new ESLint();
    const lintFiles = files.filter((file) => javascript.has(path.extname(file)));
    if (lintFiles.length) {
        const results = await linter.lintFiles(lintFiles);
        const report = (await linter.loadFormatter("stylish")).format(results);
        if (report) console.log(report);
        if (results.some((result) => result.errorCount || result.warningCount))
            errors.push("Changed JavaScript must pass ESLint without warnings");
    }
    for (const file of files) {
        const info = await prettier.getFileInfo(file, { ignorePath: ".prettierignore" });
        if (!info.ignored && info.inferredParser) {
            const options = await prettier.resolveConfig(file);
            if (!(await prettier.check(readFileSync(file, "utf8"), { ...options, filepath: file }))) {
                errors.push(
                    `${file}: run npx prettier --write on this file, in a separate formatting commit when changing existing code`,
                );
            }
        }
        if (file.endsWith(".py")) {
            execFileSync(
                "python",
                [
                    "-c",
                    "import ast, pathlib, sys; ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding='utf-8-sig'), filename=sys.argv[1])",
                    file,
                ],
                { stdio: "inherit" },
            );
        }
    }
    const powershellFiles = files.filter((file) => file.endsWith(".ps1"));
    if (powershellFiles.length) {
        execFileSync("pwsh", ["-NoProfile", "-File", ".github/scripts/check-powershell.ps1", ...powershellFiles], {
            stdio: "inherit",
        });
    }
    const english = readFileSync("README.md", "utf8");
    const chinese = readFileSync("README.zh-CN.md", "utf8");
    if (!english.split("\n").slice(0, 6).join("\n").includes("](README.zh-CN.md)"))
        errors.push("English README must link to Chinese at the top");
    if (!chinese.split("\n").slice(0, 6).join("\n").includes("](README.md)"))
        errors.push("Chinese README must link to English at the top");
    const manifest = JSON.parse(readFileSync("Spiderlings_0.91/mod.json", "utf8").replace(/^\uFEFF/, ""));
    for (const file of manifest.fileorder) {
        if (file.includes("..") || path.isAbsolute(file) || !existsSync(path.join("Spiderlings_0.91", file))) {
            errors.push(`Manifest entry is unsafe or missing: ${file}`);
        }
    }
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
        `Repository checks passed for ${files.length} changed files against ${base}. Full KD watcher validation remains a local delivery gate.`,
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
