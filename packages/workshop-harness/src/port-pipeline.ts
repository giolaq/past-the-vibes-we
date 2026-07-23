import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import type { McpClient } from "@strands-agents/sdk";
import { extractAdbtProvenance, type AdbtContextProvider, type AdbtPortContext } from "./context-providers/adbt.js";
import type { AuditFinding } from "./contracts.js";
import { PortOutputSchema } from "./port-contract.js";
import type { PortExecutor } from "./port-executor.js";
import { verifyPort, type PortCheck } from "./port-verification.js";

const tsxLoader = createRequire(import.meta.url).resolve("tsx");
export type PortPhase = { name: string; goal: string; skill: string; checks: PortCheck[] };
export type PortResult = {
  phases: { name: string; summary: string; attempts: number; checks: string[] }[];
  costUsd: number;
  adbt?: { mode: "live" | "replay"; documents: string[]; evidence: string };
};

export class PortBudgetError extends Error {}

export async function runPortPipeline(options: { appDir: string; outDir: string; findings: AuditFinding[]; projectContext: string; seed: string; maxCostUsd: number; maxAttempts?: number; executor: PortExecutor; adbt?: AdbtContextProvider; adbtClient?: McpClient; onPhase?: (phase: string) => void }): Promise<PortResult> {
  // maxAttempts: Infinity means "loop until the checks pass". The loop still terminates:
  // the cost cap throws PortBudgetError, and two identical failure sets in a row stop the
  // phase — repeating a failure the model cannot fix only spends budget.
  const maxAttempts = options.maxAttempts ?? 2;
  mkdirSync(options.outDir, { recursive: true });
  initializeGit(options.appDir);
  const result: PortResult = { phases: [], costUsd: 0 };
  const evidencePath = join(options.outDir, "adbt-port-context.json");
  try {
    for (const phase of phases()) {
      options.onPhase?.(phase.name);
      // Live: hand the ADBT McpClient to the agent so it discovers and calls the ADBT tools
      // itself; provenance is reconstructed afterward from the agent's messages. Replay: no live
      // model, so load the recorded context and inject it as prompt text.
      const usesAdbt = phase.name === ADBT_PHASE;
      const replayContext = usesAdbt && !options.adbtClient && options.adbt ? await options.adbt.load() : undefined;
      const start = gitHead(options.appDir);
      let failures: string[] = [];
      let previousFailures = "";
      try {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          if (attempt > 1) reset(options.appDir, start);
          const extraTools = usesAdbt && options.adbtClient ? [options.adbtClient] : undefined;
          const model = await options.executor.call(phase.name, prompt(phase, options, failures, replayContext), undefined, extraTools);
          result.costUsd += model.costUsd;
          if (result.costUsd > options.maxCostUsd) throw new PortBudgetError(`Port cost $${result.costUsd.toFixed(2)} exceeded $${options.maxCostUsd.toFixed(2)}`);
          const output = parseOutput(model.text);
          writeOutput(options.appDir, output.files);
          // Record ADBT provenance: reconstructed from the model's tool calls (live) or the
          // recorded fixture (replay).
          const adbtContext = usesAdbt
            ? (options.adbtClient ? extractAdbtProvenance(model.messages ?? []) : replayContext)
            : undefined;
          if (adbtContext) {
            ensureAdbtNextSteps(options.appDir, adbtContext);
            writeFileSync(evidencePath, JSON.stringify(adbtContext, null, 2));
            result.adbt = { mode: adbtContext.mode, documents: adbtContext.documents.map((document) => document.name), evidence: evidencePath };
          }
          failures = verifyPort(options.appDir, phase.checks);
          if (failures.length === 0) {
            commit(options.appDir, `workshop(${phase.name}): ${output.summary.slice(0, 60)}`);
            result.phases.push({ name: phase.name, summary: output.summary, attempts: attempt, checks: phase.checks.map((check) => check.label) });
            break;
          }
          const signature = failures.join("; ");
          if (attempt === maxAttempts) throw new Error(`${phase.name} failed after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${signature}`);
          if (signature === previousFailures) throw new Error(`${phase.name} stopped after ${attempt} attempts: no progress, the same failures repeated: ${signature}`);
          previousFailures = signature;
        }
      } catch (error) {
        reset(options.appDir, start);
        throw error;
      }
    }
  } finally {
    await options.adbtClient?.disconnect();
  }
  return result;
}

export const ADBT_PHASE = "plan";

export function phases(): PortPhase[] {
  return [
    { name: "analyze", goal: "Read the guarded React Native app and write ANALYSIS.md describing its screens, components, data, and which parts are portable to Vega TV.", skill: "Discovery first. Keep facts and assumptions separate. Do not change app code during analysis.", checks: [{ type: "contains", path: "ANALYSIS.md", value: "## Portable", label: "Portability analysis documented" }] },
    { name: "plan", goal: "Plan the Vega TV port. Write VEGA_PORT.md describing preserved product behavior, Vega replacements, and the exact remote flow, and record ADBT sources and gaps in NextSteps.md.", skill: "Use the ADBT tools to discover and read the Vega migration workflows before making Vega claims. Keep facts and assumptions separate, port one vertical slice, and record unsupported gaps instead of inventing APIs.", checks: [{ type: "contains", path: "VEGA_PORT.md", value: "## TV Flow", label: "TV flow documented" }, { type: "contains", path: "NextSteps.md", value: "ADBT", label: "ADBT gaps and sources" }] },
    { name: "build_test", goal: "Build the apps/vega package from the SDK shape, wire the remote-only home-to-details flow, and prove its focus transitions with an executable check.", skill: "Preserve portable JS/TSX, start from the Vega template shape, use one focus-state module from both the app and the verifier, and verify launch, movement boundaries, details, back, and restoration.", checks: [{ type: "contains", path: "apps/vega/manifest.toml", value: "schema-version = 1", label: "Vega manifest schema" }, { type: "contains", path: "apps/vega/manifest.toml", value: "[[components.interactive]]", label: "Interactive component" }, { type: "contains", path: "apps/vega/package.json", value: "build-vega", label: "Vega React Native build" }, { type: "file_exists", path: "apps/vega/app.json", label: "Vega app registration" }, { type: "file_exists", path: "apps/vega/metro.config.js", label: "Vega Metro boundary" }, { type: "contains", path: "package.json", value: "vega:build", label: "Vega build script" }, { type: "file_exists", path: "src/tv/focus-state.ts", label: "Focus state adapter" }, { type: "contains", path: "src/App.tsx", value: "./tv/focus-state", label: "App uses shared focus state" }, { type: "command", command: process.execPath, args: ["--import", tsxLoader, "tests/verify-tv-focus.ts"], label: "Executable focus transitions" }, { type: "contains", path: "tv-focus-result.json", value: "\"passed\": true", label: "Focus evidence report" }, { type: "contains", path: "TV_VERIFICATION.md", value: "originating card", label: "Focus restoration documented" }] },
  ];
}

function prompt(phase: PortPhase, options: Parameters<typeof runPortPipeline>[0], failures: string[], adbt?: AdbtPortContext): string {
  const checks = phase.checks.map((check) => check.type === "command" ? `- ${check.label}: ${check.command} ${check.args.join(" ")}` : `- ${check.label}: ${check.path}${check.value ? ` contains ${check.value}` : " exists"}`).join("\n");
  // Model-driven: instruct the agent to use the ADBT MCP tools itself. In replay (no live tools)
  // the recorded context is shown so the offline path still has authoritative guidance.
  const adbtGuidance = phase.name === ADBT_PHASE
    ? adbt
      ? `\n\n## ADBT sources (recorded)\n${adbt.documents.map((d) => `### ${d.name}\n${d.excerpt}`).join("\n\n")}\n\nUse these ADBT sources for Vega-specific decisions. Do not invent Vega APIs. Write unsupported mappings to NextSteps.md and name the ADBT documents consulted.`
      : `\n\nUse the adbt_list_documents and adbt_read_document tools to discover and read the Vega migration workflows you need. Do not invent Vega APIs. Write unsupported or uncertain mappings to NextSteps.md and name the ADBT documents you consulted.`
    : "";
  return `You are porting the CURRENT guarded React Native app to Vega SDK 0.22.5875. Read existing files before proposing edits. Preserve unrelated work.\n\nPhase: ${phase.name}\nGoal: ${phase.goal}\nSkill: ${phase.skill}\nCreative seed: ${options.seed}\n\nApproved context:\n${options.projectContext}\n\nPortability findings:\n${JSON.stringify(options.findings, null, 2)}${adbtGuidance}\n\nRequired checks:\n${checks}\n${failures.length ? `\nPrevious attempt failed:\n${failures.map((f) => `- ${f}`).join("\n")}\nFix these exact failures.` : ""}\n\nReturn ONLY JSON: {"summary":"short commit summary","files":{"relative/path":"complete file contents"}}. Paths are relative to the app root. Do not include .git, node_modules, .env, absolute paths, or files outside the app.`;
}

function parseOutput(text: string) { return PortOutputSchema.parse(JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? "{}")); }
function ensureAdbtNextSteps(appDir: string, context: AdbtPortContext) {
  const path = join(appDir, "NextSteps.md");
  const current = existsSync(path) ? readFileSync(path, "utf8").trimEnd() : "# Next Steps";
  if (current.includes("## ADBT sources")) return;
  const sources = context.documents.map((document) => `- ${document.name} (${document.sha256})`).join("\n");
  writeFileSync(path, `${current}\n\n## ADBT sources\n\n${sources}\n\n## Unsupported mappings\n\nAdd Vega gaps or manual work here during the port.\n`);
}
function writeOutput(appDir: string, files: Record<string, string>) { const root = resolve(appDir); for (const [name, content] of Object.entries(files)) { const path = resolve(root, name); if (!path.startsWith(`${root}${sep}`) || /(^|[\\/])(?:\.git|node_modules)(?:[\\/]|$)|(^|[\\/])\.env(?:\.|[\\/]|$)/.test(name)) throw new Error(`Unsafe model output path: ${name}`); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, content); } }
function git(appDir: string, args: string[]) { return execFileSync("git", args, { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
function initializeGit(appDir: string) { git(appDir, ["init"]); git(appDir, ["config", "user.email", "workshop@local"]); git(appDir, ["config", "user.name", "Workshop Harness"]); git(appDir, ["add", "-A"]); git(appDir, ["commit", "-m", "workshop: import guarded source"]); }
function gitHead(appDir: string) { return git(appDir, ["rev-parse", "HEAD"]); }
function reset(appDir: string, head: string) { git(appDir, ["reset", "--hard", head]); git(appDir, ["clean", "-fd"]); }
function commit(appDir: string, message: string) { git(appDir, ["add", "-A"]); git(appDir, ["commit", "-m", message]); }
