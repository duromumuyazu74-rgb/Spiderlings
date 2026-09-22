import { fileURLToPath } from "node:url";

export function checkRequiredJobs(jobs) {
    const entries = Object.entries(jobs ?? {});
    if (!entries.length) throw new Error("Required job results are missing.");
    const failed = entries.filter(([, job]) => job?.result !== "success");
    if (failed.length) {
        throw new Error(failed.map(([name, job]) => `${name}: ${job?.result ?? "missing"}`).join("\n"));
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    try {
        checkRequiredJobs(JSON.parse(process.env.REQUIRED_JOB_RESULTS ?? "null"));
        console.log("All required jobs succeeded.");
    } catch (error) {
        console.error(error.message);
        process.exitCode = 1;
    }
}
