import { execFileSync } from "node:child_process";

export function unchangedPackageMoves(base, directory) {
    const entries = execFileSync("git", ["diff", "--find-renames=100%", "--name-status", "-z", base, "--"], {
        cwd: directory,
        encoding: "utf8",
    })
        .split("\0")
        .filter(Boolean);
    const unchanged = new Set();
    for (let index = 0; index < entries.length; ) {
        const status = entries[index++],
            previous = entries[index++];
        if (!status.startsWith("R")) continue;
        const current = entries[index++];
        if (
            status === "R100" &&
            previous.startsWith("Spiderlings_0.91/") &&
            current === previous.replace("Spiderlings_0.91/", "KinkyDungeon-Spiderlings/")
        ) {
            unchanged.add(current);
        }
    }
    return unchanged;
}

export function firstPrivateCommit(directory, files, ref = "HEAD") {
    if (!files.length) return "";
    return execFileSync("git", ["rev-list", "--max-count=1", ref, "--", ...files], {
        cwd: directory,
        encoding: "utf8",
    }).trim();
}
