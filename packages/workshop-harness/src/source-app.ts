import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const EXCLUDED = new Set(["node_modules", ".git", ".env", ".env.local", "build", "dist", ".gradle", ".kepler", "coverage"]);
export const WORKSHOP_BRIEF = "workshop-brief.md";

export type SourceDiscovery = {
  source: string;
  name: string;
  scripts: Record<string, string>;
  dependencies: string[];
  hasGit: boolean;
  ignored: string[];
};

export type WorkshopBrief = {
  path: string;
  content: string;
  sha256: string;
};

export function discoverSource(path: string): SourceDiscovery {
  const source = resolve(path);
  const packagePath = join(source, "package.json");
  if (!existsSync(packagePath)) throw new Error(`Not a JavaScript project: ${source}`);
  const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as { name?: string; scripts?: Record<string, string>; dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  return {
    source,
    name: pkg.name ?? basename(source),
    scripts: pkg.scripts ?? {},
    dependencies: Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).sort(),
    hasGit: existsSync(join(source, ".git")),
    ignored: [...EXCLUDED],
  };
}

export function copySource(sourcePath: string, targetPath: string): SourceDiscovery {
  const discovery = discoverSource(sourcePath);
  const target = resolve(targetPath);
  mkdirSync(target, { recursive: true });
  cpSync(discovery.source, target, {
    recursive: true,
    filter: (path) => !EXCLUDED.has(basename(path)) && !basename(path).startsWith(".env."),
  });
  writeFileSync(join(target, ".workshop-source.json"), JSON.stringify({ schemaVersion: 1, ...discovery }, null, 2));
  return discovery;
}

export function loadWorkshopBrief(sourcePath: string): WorkshopBrief {
  const path = join(resolve(sourcePath), WORKSHOP_BRIEF);
  if (!existsSync(path)) throw new Error(`Missing ${WORKSHOP_BRIEF} in ${resolve(sourcePath)}`);
  const content = readFileSync(path, "utf8").trim();
  if (!content) throw new Error(`${WORKSHOP_BRIEF} must describe the port goal and required behavior`);
  if (content.length > 12_000) throw new Error(`${WORKSHOP_BRIEF} must be 12,000 characters or fewer`);
  return { path, content, sha256: sha256(content) };
}

/** Hashes the product input while excluding caches, secrets, and generated output. */
export function sourceFingerprint(sourcePath: string): string {
  const root = resolve(sourcePath);
  discoverSource(root);
  const hash = createHash("sha256");
  for (const path of sourceFiles(root)) {
    const relative = path.slice(root.length + 1);
    hash.update(relative).update("\0").update(readFileSync(path)).update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  const pending = [root];
  while (pending.length) {
    const dir = pending.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (EXCLUDED.has(entry.name) || entry.name.startsWith(".env.")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  return files.sort();
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
