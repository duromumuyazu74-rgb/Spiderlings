// Build the portable deliverable; no dependencies and no writes outside this directory.
import { readFile, writeFile } from "node:fs/promises";
const file = (name) => new URL(name, import.meta.url);
const [template, engine, ui, snapshots] = await Promise.all(
    ["page.html", "engine.js", "ui.js", "native-snapshots.json"].map((name) => readFile(file(name), "utf8")),
);
const safe = (value) => value.replace(/<\/script/gi, "<\\/script");
const html = template
    .replace("__SNAPSHOTS__", () => safe(snapshots))
    .replace("__ENGINE__", () => safe(engine))
    .replace("__UI__", () => safe(ui));
await writeFile(file("index.html"), html);
console.log("Built offline index.html", Buffer.byteLength(html), "bytes");
