import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// The reduced Pocket Cinema app is a few KB, so the whole source fits in every
// prompt. The complete workshop harness replaces this with read-only tools:
// pasting stops scaling long before a real app does.
// The harness writes checkpoint.json and recording.json into the same directory. They are
// bookkeeping, not app source — and recording.json holds every earlier prompt, so including it
// would make each phase's prompt embed the previous ones.
const BOOKKEEPING = /(^|[\\/])(checkpoint|recording)\.json$/;

export function appSourceBlock(root: string): string {
  if (!existsSync(root)) return "";
  const files = walk(root).filter((path) => /\.(tsx?|js|json)$/.test(path) && !BOOKKEEPING.test(path));
  const sections = files.map((path) => `### ${relative(root, path)}\n\n${readFileSync(path, "utf-8").trimEnd()}`);
  return `## Current app source\n\n${sections.join("\n\n")}`;
}

function walk(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name !== "node_modules" && name !== ".git" && name !== "build")
    .flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    })
    .sort();
}
