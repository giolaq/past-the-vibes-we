// Fails the build when workshop material points at something that does not exist.
//
// Two matchers, because the material names files two different ways:
//   1. Backticked paths and Markdown links, resolved from the repository root.
//   2. Paths inside runnable command blocks, which are written relative to the block's
//      own `--cwd` (for example `yarn --cwd packages/workshop-harness tsx src/index.ts …`).
//      Without (2), renaming a step directory keeps `yarn verify` green while every
//      lesson command breaks.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, normalize, resolve } from "node:path";

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

/** Markdown directly inside a directory. Avoids fs.globSync, which needs Node 22. */
function markdownIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(dir, entry.name));
}

// Attendee material plus the contributor-facing docs that also carry runnable paths —
// a stale command in the mini README is exactly as broken as one in a lesson.
const files = [
  ...walk("workshop"),
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  ...markdownIn("docs"),
  ...readdirSync("packages", { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => markdownIn(join("packages", entry.name))),
].filter((path) => path.endsWith(".md") && existsSync(path));

const missing: string[] = [];
const android: string[] = [];
let commandPaths = 0;

// Directories the port pipeline generates at run time (into out/<runId>/app/), so they do
// not exist in the committed tree. Matched by prefix so children are exempt too.
const generated = ["apps/vega"];

/** Templates (`<runId>`) and globs (`lessons/*.md`) are patterns, not paths. */
function isPattern(path: string): boolean {
  return path.includes("<") || path.includes("*");
}

function isGenerated(path: string): boolean {
  return path.includes("/out/") || generated.some((dir) => path === dir || path.startsWith(`${dir}/`));
}

// Whole whitespace-delimited tokens that look like a file path. Matching whole tokens
// matters: a pattern anchored on `steps/…` would match the tail of
// `../../workshop/fixtures/x.json` and silently drop the `../../`.
const commandToken = /(?:^|\s)((?:\.{1,2}\/|[\w.-]+\/)[\w./-]*\.(?:tsx|ts|mjs|json|js|md))(?=\s|$|\\)/gm;

for (const file of files) {
  const text = readFileSync(file, "utf8");

  for (const match of text.matchAll(/`((?:packages|workshop|apps|scripts)\/[^`\n]+)`/g)) {
    const path = match[1].replace(/:\d+$/, "").replace(/[.,;:]$/, "");
    if (!isPattern(path) && !isGenerated(path) && !existsSync(path)) missing.push(`${file}: ${path}`);
  }

  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1].split("#")[0];
    if (!target || /^(?:https?:|mailto:)/.test(target)) continue;
    if (!existsSync(resolve(dirname(file), target))) missing.push(`${file}: ${target}`);
  }

  for (const block of commandBlocks(text)) {
    const cwd = /--cwd\s+(\S+)/.exec(block);
    if (!cwd) continue;
    for (const match of block.matchAll(commandToken)) {
      const path = match[1];
      if (isPattern(path) || isGenerated(path)) continue;
      commandPaths++;
      const full = normalize(join(cwd[1], path));
      if (!isGenerated(full) && !existsSync(full)) missing.push(`${file}: ${path} (relative to ${cwd[1]})`);
    }
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
console.log(`Checked ${files.length} workshop documents and ${commandPaths} command paths.`);

/** `:::command` directive bodies plus fenced shell blocks. */
function commandBlocks(text: string): string[] {
  return [
    ...[...text.matchAll(/:::command[^\n]*\n([\s\S]*?)\n:::/g)].map((match) => match[1]),
    ...[...text.matchAll(/```sh\n([\s\S]*?)\n```/g)].map((match) => match[1]),
  ];
}

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === "node_modules" || entry.name === ".git") return [];
    const child = join(path, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}
