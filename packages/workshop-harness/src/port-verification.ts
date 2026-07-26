import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { runProcess } from "./process.js";

// `contains` requires its value: an optional one would let a check with no value pass
// forever, since "".includes("") is true — a green check that verifies nothing.
export type PortCheck =
  | { type: "file_exists"; path: string; label: string }
  | { type: "contains"; path: string; value: string; label: string }
  | { type: "command"; command: string; args: string[]; label: string; timeoutMs?: number };

/** Runs a TypeScript file with the tsx loader, the way the generated app's verifier expects. */
export const TSX_LOADER = createRequire(import.meta.url).resolve("tsx");

/** Default ceiling for a `command` check. A build gate passes its own, much longer. */
export const COMMAND_TIMEOUT_MS = 2 * 60_000;

/**
 * Executes the focus-transition verifier inside the app under test. Shared by the phase gate
 * and `tv-check` so the two can never disagree about how the check is run.
 */
export const FOCUS_TEST_CHECK: PortCheck = { type: "command", command: process.execPath, args: ["--import", TSX_LOADER, "tests/verify-tv-focus.ts"], label: "Executable focus transitions" };

// What "TV-ready" means, mechanically. The starter app fails every one of these
// by design; the ported output passes them all. `tv-check <dir>` runs this list
// so the before/after is provable instead of asserted.
export function tvReadyChecks(): PortCheck[] {
  return [
    { type: "file_exists", path: "src/tv/focus-state.ts", label: "Focus state module" },
    { type: "contains", path: "src/App.tsx", value: "./tv/focus-state", label: "App wires shared focus state" },
    { type: "contains", path: "src/App.tsx", value: "hasTVPreferredFocus", label: "Initial focus declared" },
    { type: "file_exists", path: "apps/vega/manifest.toml", label: "Vega package manifest" },
    { type: "contains", path: "apps/vega/manifest.toml", value: "schema-version = 1", label: "Vega manifest schema" },
    { type: "file_exists", path: "tests/verify-tv-focus.ts", label: "Executable focus check present" },
    FOCUS_TEST_CHECK,
  ];
}

export async function verifyPort(appDir: string, checks: PortCheck[]): Promise<string[]> {
  const failures: string[] = [];
  for (const check of checks) {
    if (check.type === "command") {
      const failure = await runCommandCheck(appDir, check);
      if (failure) failures.push(failure);
      continue;
    }
    const path = join(appDir, check.path);
    if (!existsSync(path)) { failures.push(`${check.label}: missing ${check.path}`); continue; }
    if (check.type === "contains" && !readFileSync(path, "utf8").includes(check.value)) failures.push(`${check.label}: ${check.path} must contain ${JSON.stringify(check.value)}`);
  }
  return failures;
}

/**
 * The command's own output is the point. A compiler's diagnostics are what the next attempt
 * needs, so the failure text carries them instead of "Command failed".
 */
async function runCommandCheck(appDir: string, check: Extract<PortCheck, { type: "command" }>): Promise<string | null> {
  const timeoutMs = check.timeoutMs ?? COMMAND_TIMEOUT_MS;
  try {
    const result = await runProcess(check.command, check.args, timeoutMs, appDir);
    if (result.timedOut) return `${check.label}: timed out after ${Math.round(timeoutMs / 1000)}s\n${output(result)}`;
    if (result.code === 0) return null;
    return `${check.label}: exited ${result.code}${result.signal ? ` (${result.signal})` : ""}\n${output(result)}`;
  } catch (error) {
    return `${check.label}: could not run ${check.command} — ${error instanceof Error ? error.message : String(error)}`;
  }
}

function output(result: { stdout: string; stderr: string }): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n") || "(no output)";
}
