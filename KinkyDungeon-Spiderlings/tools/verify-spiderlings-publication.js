"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { run, repository, packageVerificationCommand } = require("./delivery-commands.js");
const { parseReleaseVersion } = require("./release-version.js");

function identity(file) {
    const bytes = fs.readFileSync(file);
    return { name: path.basename(file), size: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") };
}

function verifyPublication(options, execute = run) {
    const root = path.resolve(options.root || path.join(__dirname, "../.."));
    const version = parseReleaseVersion(options.tag?.replace(/^v/, ""));
    if (options.tag !== `v${version.version}` || !/^[a-f0-9]{40}$/.test(options.commit || ""))
        throw new Error("Publication verification needs a version tag and full reviewed commit.");
    if (version.channel === "test" && !options.latest)
        throw new Error("Test publication needs the expected formal Latest tag.");
    const packagePath = path.resolve(root, options.packagePath || version.packageName);
    const expected = identity(packagePath);
    if (expected.name !== version.packageName) throw new Error("Installable package filename differs from the tag.");
    const notes = fs
        .readFileSync(path.resolve(root, options.notesPath), "utf8")
        .replace(/^\uFEFF/, "")
        .replace(/\r\n/g, "\n");
    const englishHeading = "## English\n",
        chineseHeading = "## 简体中文\n";
    const english = notes.indexOf(englishHeading),
        chinese = notes.indexOf(chineseHeading);
    if (
        english < 0 ||
        chinese <= english ||
        !notes.slice(english + englishHeading.length, chinese).trim() ||
        !notes.slice(chinese + chineseHeading.length).trim()
    )
        throw new Error("Notes need complete English then Simplified Chinese sections.");
    const verify = packageVerificationCommand(root, packagePath);
    execute(root, verify[0], verify.slice(1));
    const repo = repository(root, execute);
    const gh = (endpoint) => JSON.parse(execute(root, "gh", ["api", `repos/${repo}/${endpoint}`, "--method", "GET"]));
    const release = gh(`releases/tags/${options.tag}`);
    if (release.draft || release.prerelease !== (version.channel === "test"))
        throw new Error("Published Release channel differs from the version.");
    if (
        release.tag_name !== options.tag ||
        release.body.replace(/\r\n/g, "\n").trimEnd() !== notes.replace(/\r\n/g, "\n").trimEnd()
    )
        throw new Error("Published tag or notes differ from the reviewed content.");
    const refs = execute(root, "git", [
        "ls-remote",
        "origin",
        `refs/tags/${options.tag}`,
        `refs/tags/${options.tag}^{}`,
    ])
        .trim()
        .split(/\r?\n/);
    const commit = (
        refs.find((line) => line.endsWith("^{}")) || refs.find((line) => line.endsWith(`/${options.tag}`))
    )?.split(/\s+/)[0];
    if (commit !== options.commit) throw new Error("Remote release tag does not point to the reviewed commit.");
    const latest = gh("releases/latest").tag_name;
    if (latest !== (version.channel === "test" ? options.latest : options.tag))
        throw new Error("Formal Latest tag differs from expectation.");
    if (version.channel === "formal" && !["ahead", "identical"].includes(gh(`compare/${commit}...main`).status))
        throw new Error("Formal release commit is not integrated into main.");
    const assets = release.assets.filter((asset) => asset.name === expected.name);
    if (assets.length !== 1 || assets[0].size !== expected.size)
        throw new Error("Release attachment is missing, duplicated or has the wrong size.");
    const parent = path.join(root, ".scratch/publication");
    fs.mkdirSync(parent, { recursive: true });
    const output = fs.mkdtempSync(path.join(parent, `${version.version}-`));
    // execFileSync returns only after gh has completed and closed the attachment file.
    execute(root, "gh", [
        "release",
        "download",
        options.tag,
        "--repo",
        repo,
        "--pattern",
        expected.name,
        "--dir",
        output,
    ]);
    const downloaded = identity(path.join(output, expected.name));
    if (downloaded.size !== expected.size || downloaded.sha256 !== expected.sha256)
        throw new Error("Downloaded attachment differs from the accepted ZIP.");
    const result = {
        status: "passed",
        repository: repo,
        tag: options.tag,
        commit,
        latest,
        url: release.html_url,
        package: downloaded,
    };
    fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify(result, null, 2) + "\n");
    return { ...result, output };
}

if (require.main === module) {
    try {
        const args = process.argv.slice(2),
            options = {};
        const fields = {
            "--tag": "tag",
            "--commit": "commit",
            "--package": "packagePath",
            "--notes": "notesPath",
            "--latest": "latest",
        };
        for (let index = 0; index < args.length; index++) {
            if (!fields[args[index]] || !args[index + 1] || args[index + 1].startsWith("--"))
                throw new Error(`Unknown option or missing value: ${args[index]}`);
            options[fields[args[index]]] = args[++index];
        }
        console.log(JSON.stringify(verifyPublication(options), null, 2));
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}

module.exports = { verifyPublication };
