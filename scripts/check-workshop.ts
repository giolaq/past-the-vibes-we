import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const root = "workshop";
const files = walk(root).filter((path) => path.endsWith(".md"));
const missing: string[] = [];
const android: string[] = [];

// Paths the port pipeline generates at run time (into out/<runId>/app/), so
// they do not exist in the committed tree. Same intent as skipping `<...>`
// template paths below — these are produced, not authored.
const generated = new Set(["apps/vega"]);

for (const file of files) {
  const text = readFileSync(file, "utf8");
  for (const match of text.matchAll(/`((?:packages|workshop|apps|scripts)\/[^`\n]+)`/g)) {
    const path = match[1].replace(/:\d+$/, "").replace(/[.,;:]$/, "");
    if (!path.includes("<") && !generated.has(path) && !existsSync(path)) missing.push(`${file}: ${path}`);
  }
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), target))) missing.push(`${file}: ${target}`);
  }
  if (/\b(Android lane|Android CLI lab|Gradle lab)\b/i.test(text)) android.push(file);
}

for (const asset of ["workshop/index.html", "workshop/workshop.css", "workshop/workshop.js"]) {
  if (!existsSync(asset)) missing.push(`Website asset: ${asset}`);
}

if (missing.length || android.length) {
  for (const item of missing) console.error(`Missing path: ${item}`);
  for (const item of android) console.error(`Forbidden Android workshop path: ${item}`);
  process.exit(1);
}
console.log(`Checked ${files.length} workshop documents.`);

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((entry) => walk(join(path, entry)));
}
