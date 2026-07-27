// Checks the workshop's practical Simplified Technical English rules.
// This is a project style check. It is not an ASD-STE100 certification tool.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const files = [
  "README.md",
  "packages/workshop-harness/README.md",
  ...walk("workshop")
    .filter((path) => extname(path) === ".md")
    .filter((path) => !path.includes("/fixtures/"))
    .filter((path) => path !== "workshop/STE-STYLE.md"),
  "workshop/slides.html",
  "scripts/build-site.mjs",
].filter(existsSync);

const contractions =
  /\b(?:don't|doesn't|can't|won't|isn't|aren't|it's|that's|you'll|we'll|you've|we've|they're|there's|here's|what's|let's|didn't|wouldn't|shouldn't|couldn't)\b/i;

const blockedPhrases = [
  "under the hood",
  "of course",
  "game changer",
  "fire and forget",
  "kick off",
  "take it home",
  "talked around",
  "the whole point",
  "recovery cassette",
];

const failures: string[] = [];

for (const file of files) {
  const source = readFileSync(file, "utf8");
  const text = clean(file, source);

  for (const [index, line] of text.split("\n").entries()) {
    const contraction = contractions.exec(line);
    if (contraction) {
      failures.push(`${file}:${index + 1}: use the full form instead of "${contraction[0]}"`);
    }

    const lower = line.toLowerCase();
    for (const phrase of blockedPhrases) {
      if (lower.includes(phrase)) {
        failures.push(`${file}:${index + 1}: replace the phrase "${phrase}"`);
      }
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`Workshop language: ${failure}`);
  process.exit(1);
}

console.log(`Checked Simplified Technical English style in ${files.length} workshop files.`);

function clean(file: string, source: string): string {
  let text = source
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`[^`\n]+`/g, "")
    .replace(/https?:\/\/\S+/g, "");

  if (file.endsWith(".html")) {
    text = text
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<[^>]+>/g, " ");
  }

  return text;
}

function walk(path: string): string[] {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = join(path, entry.name);
    return entry.isDirectory() ? walk(child) : [child];
  });
}
