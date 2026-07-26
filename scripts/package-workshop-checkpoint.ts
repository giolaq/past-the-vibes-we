// Packages a guarded run directory into a committed workshop checkpoint under
// workshop/checkpoints/, so a blocked attendee can pick up from known-good output.
//
// Two jobs: copy the app without Git history, dependencies, or environment files, and
// scrub the absolute source path out of .workshop-source.json (it names the packager's
// machine, not anything an attendee should see). Git provides content integrity for the
// committed result, so there is no separate hash manifest.
//
// Run: yarn package:checkpoint <source> <target>

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// Arguments are repo-root relative whatever directory yarn ran this from.
process.chdir(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

const source = resolve(process.argv[2] ?? "");
const target = resolve(process.argv[3] ?? "");
if (!existsSync(source) || !process.argv[3]) {
  console.error("Usage: yarn package:checkpoint <source> <target>");
  process.exit(1);
}
mkdirSync(target, { recursive: true });
cpSync(source, target, { recursive: true, filter: (path) => !/[\\/](?:node_modules|\.git)(?:[\\/]|$)|[\\/]\.env(?:\.|[\\/]|$)/.test(path) });
const sourceMetadata = join(target, ".workshop-source.json");
if (existsSync(sourceMetadata)) {
  const metadata = JSON.parse(readFileSync(sourceMetadata, "utf8")) as Record<string, unknown>;
  metadata.source = "<WORKSHOP_SOURCE>";
  writeFileSync(sourceMetadata, JSON.stringify(metadata, null, 2));
}
console.log(`Packaged checkpoint: ${target}`);
