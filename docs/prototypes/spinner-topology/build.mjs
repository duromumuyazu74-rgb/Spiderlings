// Build the portable deliverable; no dependencies and no writes outside this directory.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const file = (name) => new URL(name, import.meta.url);
const [template, engine, ui, snapshots] = await Promise.all(
    ["page.html", "engine.js", "ui.js", "native-snapshots.json"].map((name) => readFile(file(name), "utf8")),
);
const safe = (value) => value.replace(/<\/script/gi, "<\\/script");
const pacing = JSON.parse(await readFile(file("evidence/pacing/summary.json"), "utf8"));
const durability = JSON.parse(await readFile(file("evidence/durability/summary.json"), "utf8"));
const engineSHA256 = createHash("sha256").update(engine).digest("hex");
if (pacing.engineSHA256 !== engineSHA256) throw Error("Run measure-pacing.mjs after changing the engine, then build.");
if (durability.engineSHA256 !== engineSHA256)
    throw Error("Run replay-durability.mjs after changing the engine, then build.");
const timing = [2, 4, 8].map((count) => ({
    count,
    travel: pacing.cases.find((c) => c.id === `room-${count}-prebuild`).outcome.turns,
    onsite: pacing.cases.find((c) => c.id === `room-${count}-onsite`).outcome.turns,
}));
const html = template
    .replace("__SNAPSHOTS__", () => safe(snapshots))
    .replace("__PACING__", () => JSON.stringify(timing))
    .replace("__ENGINE__", () => safe(engine))
    .replace("__UI__", () => safe(ui));
await writeFile(file("index.html"), html);
console.log("Built offline index.html", Buffer.byteLength(html), "bytes");
