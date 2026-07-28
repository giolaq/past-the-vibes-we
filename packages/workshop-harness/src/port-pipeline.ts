import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import type { McpClient } from "@strands-agents/sdk";
import { extractAdbtProvenance, type AdbtContextProvider, type AdbtPortContext } from "./context-providers/adbt.js";
import type { AuditFinding } from "./contracts.js";
import { addModelUsage, EMPTY_MODEL_USAGE, mergeProviderCostSource, type ModelUsage, type ProviderCostSource } from "./model-telemetry.js";
import { ModelTranscriptStore } from "./model-transcript.js";
import { PortOutputSchema, parseJsonBlock } from "./port-contract.js";
import type { PortExecutor } from "./port-executor.js";
import { PORT_PLAN_APPROVAL_PATH, PORT_PLAN_PATH, PortPlanSchema, portPlanBriefFailures, renderPortPlanContract } from "./port-plan.js";
import { FOCUS_TEST_CHECK, verifyPort, type PortCheck } from "./port-verification.js";
import { runDeviceStages, type DeviceRun, type DeviceStage } from "./platform/vega.js";
import { WORKSHOP_BRIEF } from "./source-app.js";
import { injectedBuildFailureChecks } from "./workshop-failure.js";

/**
 * One phase of the port.
 * - `instruction` is the rule this harness writes into the prompt.
 * - `skills` names skill files the executor delivers to the model (see `skills.ts`).
 * - `checks` and `device` are the code that decides whether the phase passed — static file
 *   assertions and real device work respectively. Never the model.
 * - `verifyFirst` checks before calling the model, so a phase whose work is already correct
 *   uses no model tokens. The build and launch loops use it: they only prompt after a failure.
 * - `mcp` names the MCP servers whose tools this phase's model may call. The harness passes the
 *   client and Strands discovers its tools; nothing here hardcodes a tool name.
 */
export type PortPhase = {
  name: string;
  goal: string;
  instruction: string;
  skills: string[];
  checks: PortCheck[];
  device?: DeviceStage[];
  /** Device work that must run after this phase changes source code. */
  repairDevice?: DeviceStage[];
  verifyFirst?: boolean;
  maxAttempts?: number;
  mcp?: string[];
  /**
   * Files this phase's model may not write, on top of the always-protected paths. A phase that
   * works against an approved artifact names it here, so the model cannot move the goalposts by
   * rewriting the requirement it is being checked against.
   */
  readOnly?: string[];
};
export type PortResult = {
  /** failures holds the checks that failed on each earlier attempt, oldest first. */
  phases: { name: string; summary: string; attempts: number; checks: string[]; failures: string[][] }[];
  usage: ModelUsage;
  providerReportedCostUsd?: number;
  providerReportedCostSource?: ProviderCostSource;
  requestedModels: string[];
  actualModels: string[];
  adbt?: { mode: "live" | "replay"; documents: string[]; evidence: string };
};

export class PortTokenBudgetError extends Error {}

export async function runPortPipeline(options: { appDir: string; outDir: string; findings: AuditFinding[]; projectContext: string; briefSha256?: string; seed: string; maxTokens?: number; maxTurns?: number; maxAttempts?: number; plan?: PortPhase[]; phaseNames?: string[]; executor: PortExecutor; device?: DeviceRun; adbt?: AdbtContextProvider; mcpClients?: Record<string, McpClient>; liveMcp?: string[]; transcripts?: ModelTranscriptStore; beforePhase?: (phase: PortPhase) => void; onPhase?: (phase: string) => void; onPhaseComplete?: (phase: PortResult["phases"][number], snapshot: PortResult) => void; onUsage?: (snapshot: Pick<PortResult, "usage" | "providerReportedCostUsd" | "providerReportedCostSource" | "requestedModels" | "actualModels">) => void; onMessages?: (phase: string, messages: unknown[]) => void; onNotice?: (headline: string, failures: string[]) => void }): Promise<PortResult> {
  // maxAttempts: Infinity means "loop until the checks pass". The loop still terminates:
  // the token cap throws PortTokenBudgetError, and two identical failure sets in a row stop the
  // phase — repeating a failure the model cannot fix only spends tokens.
  const maxAttempts = options.maxAttempts ?? 2;
  mkdirSync(options.outDir, { recursive: true });
  const transcripts = options.transcripts ?? new ModelTranscriptStore(options.outDir);
  initializeGit(options.appDir);
  const result: PortResult = { phases: [], usage: { ...EMPTY_MODEL_USAGE }, requestedModels: [], actualModels: [] };
  const evidencePath = join(options.outDir, "adbt-port-context.json");
  try {
    for (const phase of selectPhases(options.plan ?? portPhases(), options.phaseNames)) {
      options.beforePhase?.(phase);
      transcripts.append(phase.name, {
        attempt: 0, executor: "harness", direction: "system", kind: "phase_start",
        payload: { goal: phase.goal, checks: phaseLabels(phase), verifyFirst: phase.verifyFirst === true },
      });
      options.onPhase?.(phase.name);
      // Live: hand the ADBT McpClient to the agent so it discovers and calls the ADBT tools
      // itself; provenance is reconstructed afterward from the agent's messages. Replay: no live
      // model, so load the recorded context and inject it as prompt text.
      const usesAdbt = phase.mcp?.includes(ADBT_SERVER) === true;
      const adbtClient = usesAdbt ? options.mcpClients?.[ADBT_SERVER] : undefined;
      const hasLiveAdbt = usesAdbt && Boolean(adbtClient || options.liveMcp?.includes(ADBT_SERVER));
      const replayContext = usesAdbt && !hasLiveAdbt && options.adbt ? await options.adbt.load() : undefined;
      const phaseAttempts = options.maxAttempts ?? phase.maxAttempts ?? maxAttempts;
      const start = gitHead(options.appDir);
      // Device blockers accumulate across the session; each attempt starts from this mark so a
      // rebuilt package is judged on its own failures, not the previous attempt's.
      const deviceMark = options.device?.blockers.length ?? 0;
      const rejected: string[][] = [];
      let failures: string[] = [];
      if (phase.verifyFirst) {
        transcripts.append(phase.name, {
          attempt: 0, executor: "harness", direction: "system", kind: "verification_start",
          payload: { checks: phaseLabels(phase), beforeModelCall: true },
        });
        failures = await verify(phase, options, deviceMark, false, 0);
        transcripts.append(phase.name, {
          attempt: 0, executor: "harness", direction: "system", kind: "verification_result",
          payload: { passed: failures.length === 0, failures },
        });
      }
      // The failure that provoked the fix is evidence too: record and report it before the
      // model is asked to do anything about it.
      if (failures.length) {
        rejected.push(failures);
        report(options, `${phase.name} needs a fix`, failures);
      }
      let previousFailures = failures.join("; ");
      let summary = "";
      let attempts = 0;
      let repairCandidate: Record<string, string> = {};
      try {
        // verifyFirst phases that already pass never reach the model: a green build uses no tokens.
        for (let attempt = 1; attempt <= phaseAttempts && !(phase.verifyFirst && attempt === 1 && failures.length === 0); attempt++) {
          if (attempt > 1 || phase.verifyFirst) reset(options.appDir, start);
          if (phase.verifyFirst && Object.keys(repairCandidate).length) {
            writeOutput(options.appDir, repairCandidate, phase.readOnly);
            transcripts.append(phase.name, {
              attempt, executor: "harness", direction: "system", kind: "repair_candidate_reapplied",
              payload: { paths: Object.keys(repairCandidate).sort() },
            });
          }
          attempts = attempt;
          const extraTools = (phase.mcp ?? []).map((name) => options.mcpClients?.[name]).filter((client): client is McpClient => Boolean(client));
          const remainingTokens = options.maxTokens === undefined
            ? undefined
            : options.maxTokens - result.usage.totalTokens;
          if (remainingTokens !== undefined && remainingTokens <= 0) {
            throw new PortTokenBudgetError(`Model token limit ${options.maxTokens} reached`);
          }
          const model = await options.executor.call(phase.name, prompt(phase, options, failures, replayContext), {
            extraTools,
            mcp: phase.mcp,
            skills: phase.skills,
            maxTokens: remainingTokens,
            maxTurns: options.maxTurns,
            attempt,
          });
          result.usage = addModelUsage(result.usage, model.usage);
          if (model.providerReportedCostUsd !== undefined) {
            result.providerReportedCostUsd = (result.providerReportedCostUsd ?? 0) + model.providerReportedCostUsd;
            result.providerReportedCostSource = mergeProviderCostSource(result.providerReportedCostSource, model.providerReportedCostSource ?? "provider");
          }
          if (model.requestedModel) result.requestedModels = [...new Set([...result.requestedModels, model.requestedModel])];
          result.actualModels = [...new Set([...result.actualModels, ...model.actualModels])];
          options.onUsage?.({
            usage: result.usage,
            providerReportedCostUsd: result.providerReportedCostUsd,
            providerReportedCostSource: result.providerReportedCostSource,
            requestedModels: result.requestedModels,
            actualModels: result.actualModels,
          });
          if (options.maxTokens !== undefined && result.usage.totalTokens > options.maxTokens) {
            throw new PortTokenBudgetError(`Model used ${result.usage.totalTokens} tokens, exceeding the ${options.maxTokens} token limit`);
          }
          options.onMessages?.(phase.name, model.messages ?? []);
          const output = parseJsonBlock(model.text, PortOutputSchema, phase.name);
          writeOutput(options.appDir, output.files, phase.readOnly);
          if (phase.verifyFirst) repairCandidate = { ...repairCandidate, ...output.files };
          summary = output.summary;
          // Record ADBT provenance: reconstructed from the model's tool calls (live) or the
          // recorded fixture (replay).
          // replayContext is only set when this phase uses ADBT without a live client.
          const adbtContext = hasLiveAdbt ? extractAdbtProvenance(model.messages ?? []) : replayContext;
          const provenanceFailures: string[] = [];
          if (adbtContext) {
            if (hasLiveAdbt && adbtContext.documents.length === 0) {
              provenanceFailures.push("ADBT MCP provenance: the model did not read an ADBT document");
            }
            if (adbtContext.documents.length) ensureAdbtNextSteps(options.appDir, adbtContext);
            writeFileSync(evidencePath, JSON.stringify(adbtContext, null, 2));
            result.adbt = { mode: adbtContext.mode, documents: adbtContext.documents.map((document) => document.name), evidence: evidencePath };
          }
          transcripts.append(phase.name, {
            attempt, executor: "harness", direction: "system", kind: "verification_start",
            payload: { checks: phaseLabels(phase), beforeModelCall: false },
          });
          failures = [...provenanceFailures, ...await verify(phase, options, deviceMark, true, attempt)];
          transcripts.append(phase.name, {
            attempt, executor: "harness", direction: "system", kind: "verification_result",
            payload: { passed: failures.length === 0, failures },
          });
          if (failures.length === 0) break;
          rejected.push(failures);
          report(options, `${phase.name} attempt ${attempt} failed`, failures);
          const signature = failures.join("; ");
          if (attempt === phaseAttempts) throw new Error(`${phase.name} failed after ${attempt} attempt${attempt === 1 ? "" : "s"}: ${signature}`);
          if (signature === previousFailures) throw new Error(`${phase.name} stopped after ${attempt} attempts: no progress, the same failures repeated: ${signature}`);
          previousFailures = signature;
        }
        // A verify-first phase may create deterministic evidence without calling a model.
        // Commit that evidence too, so every successful phase leaves the guarded tree clean.
        // commit() is a no-op when neither the model nor a check changed the tree.
        const commitSummary = summary || `Record verified ${phase.name} evidence`;
        const commitMessage = `workshop(${phase.name}): ${commitSummary.slice(0, 60)}`;
        const commitHash = commit(options.appDir, commitMessage);
        if (commitHash) transcripts.append(phase.name, {
          attempt: attempts, executor: "harness", direction: "system", kind: "commit",
          payload: { hash: commitHash, message: commitMessage },
        });
        const phaseResult = { name: phase.name, summary: summary || "already satisfied, no model call", attempts, checks: phaseLabels(phase), failures: rejected };
        result.phases.push(phaseResult);
        transcripts.append(phase.name, {
          attempt: attempts, executor: "harness", direction: "system", kind: "phase_complete",
          payload: { summary: phaseResult.summary, attempts, checks: phaseResult.checks, usage: result.usage, providerReportedCostUsd: result.providerReportedCostUsd, providerReportedCostSource: result.providerReportedCostSource, noModelCall: attempts === 0 },
        });
        options.onPhaseComplete?.(phaseResult, { ...result, phases: [...result.phases] });
      } catch (error) {
        transcripts.append(phase.name, {
          attempt: attempts, executor: "harness", direction: "system", kind: "phase_failed",
          payload: error,
        });
        reset(options.appDir, start);
        throw error;
      }
    }
  } finally {
    // Every client, not just ADBT: a client left connected leaks its stdio subprocess.
    await Promise.all(Object.values(options.mcpClients ?? {}).map((client) => client.disconnect()));
  }
  return result;
}

/**
 * What decides a phase: static file assertions plus, for the device phases, the build and the
 * device itself. Device work runs first — a package that did not build cannot be launched.
 */
async function verify(phase: PortPhase, options: Parameters<typeof runPortPipeline>[0], deviceMark: number, patched: boolean, attempt: number): Promise<string[]> {
  // Static checks first: one of them runs the focus test that writes the evidence the device
  // stage then reads. Build and launch have no static checks, so nothing waits on them.
  const staticFailures = await verifyPort(options.appDir, phase.checks);
  if (phase.name === "plan" && options.briefSha256) {
    staticFailures.push(...portPlanBriefFailures(options.appDir, options.briefSha256));
  }
  // Do not spend device time on source that already failed a deterministic host check. The
  // repair attempt reruns both sets, so a source fix still has to build, launch, and pass live.
  if (staticFailures.length) {
    const workshopFailures = phase.name === "build" ? injectedBuildFailureChecks(options.appDir, options.outDir) : [];
    return [...staticFailures, ...workshopFailures];
  }
  const deviceFailures: string[] = [];
  const stages = deviceStages(phase, patched);
  if (stages.length) {
    // Not a failure to hand the model: no patch can attach a device. Stop the run instead.
    if (!options.device) throw new Error(`${phase.name} needs a device session: pass --platform-replay or attach a VDA`);
    options.device.blockers.length = deviceMark;
    await runDeviceStages(options.device, stages, { appDir: join(options.appDir, "apps", "vega"), focusDir: options.appDir });
    deviceFailures.push(...options.device.blockers.slice(deviceMark));
  }
  const workshopFailures = phase.name === "build" ? injectedBuildFailureChecks(options.appDir, options.outDir) : [];
  return [...staticFailures, ...deviceFailures, ...workshopFailures];
}

// A retry that happens silently is a retry nobody can audit. stdout stays JSON-only, so this
// goes to stderr — and it is the exact text the next prompt carries.
function report(options: Parameters<typeof runPortPipeline>[0], headline: string, failures: string[]): void {
  if (options.onNotice) return options.onNotice(headline, failures);
  process.stderr.write(`${headline}:\n${failures.map((failure) => `  - ${failure}`).join("\n")}\n`);
}

/**
 * The launch phase rebuilds so a fix reaches the device — but only when there is a fix. Its
 * first check runs against the package the build phase just produced, and rebuilding an
 * unchanged tree would run another full build for nothing.
 */
function deviceStages(phase: PortPhase, patched: boolean): DeviceStage[] {
  const stages = patched && phase.repairDevice ? phase.repairDevice : phase.device ?? [];
  if (patched || stages.length < 2) return stages;
  return stages.filter((stage) => stage !== "build");
}

function phaseLabels(phase: PortPhase): string[] {
  const device = (phase.device ?? []).map((stage) => `device: ${stage}`);
  const repair = (phase.repairDevice ?? []).map((stage) => `device after repair: ${stage}`);
  return [...device, ...repair, ...phase.checks.map((check) => check.label)];
}

/** The MCP server names a phase can ask for. ADBT's provenance is recorded specially. */
export const ADBT_SERVER = "adbt";

/**
 * Order always follows the plan, whatever order the names arrive in — so `--phases test,analyze`
 * cannot accidentally run the pipeline backwards. Shared by every plan, not just the port.
 */
export function selectPhases(all: PortPhase[], only?: string[]): PortPhase[] {
  if (!only) return all;
  if (only.length === 0) throw new Error(`At least one phase is required; use ${all.map((phase) => phase.name).join(", ")}`);
  const unknown = only.filter((name) => !all.some((phase) => phase.name === name));
  if (unknown.length) throw new Error(`Unknown phase${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")}; use ${all.map((phase) => phase.name).join(", ")}`);
  return all.filter((phase) => only.includes(phase.name));
}

/**
 * The whole port plan. Pass `only` to run part of it — the lessons build the pipeline up one
 * phase at a time, and an operator re-running a single expensive phase wants the same thing.
 */
export function portPhases(): PortPhase[] {
  return [
    {
      name: "analyze",
      goal: "Read the guarded React Native app and write ANALYSIS.md describing its screens, components, data, and which parts are portable to Vega TV.",
      instruction: "Discovery first. Keep facts and assumptions separate. Read ADBT documents before making Vega portability claims. Do not change app code during analysis.",
      skills: [],
      mcp: [ADBT_SERVER],
      checks: [{ type: "contains", path: "ANALYSIS.md", value: "## Portable", label: "Portability analysis documented" }],
    },
    {
      name: "plan",
      goal: `Decide how this app becomes a TV app. Write ${PORT_PLAN_PATH} as the machine-checked screen, navigation, behavior, and evidence contract. Write VEGA_PORT.md for the human explanation and record ADBT sources and unsupported gaps in NextSteps.md.`,
      instruction: "Use ADBT documents for both Vega platform behavior and the 10-foot interaction model: what a remote can reach, where focus starts, and how Back restores it. Keep facts and assumptions separate. Define one vertical slice. A human must approve the structured plan before implementation starts.",
      skills: [],
      mcp: [ADBT_SERVER],
      checks: [
        { type: "json_schema", path: PORT_PLAN_PATH, schema: PortPlanSchema, label: "Structured port plan" },
        { type: "contains", path: "VEGA_PORT.md", value: "## TV Flow", label: "TV flow documented" },
        { type: "contains", path: "VEGA_PORT.md", value: "## Focus", label: "Focus model documented" },
        { type: "contains", path: "NextSteps.md", value: "ADBT", label: "ADBT gaps and sources" },
      ],
    },
    {
      name: "port",
      goal: `Write the port the approved ${PORT_PLAN_PATH} describes: the apps/vega package from the SDK shape, the shared focus-state module, stable testID values for every focusable control, the remote-only vertical slice, and the executable host-side focus contract.`,
      instruction: `Preserve portable JS/TSX and use one focus-state module from both the app and the verifier. Every focusable element must expose its approved focus id through React Native testID so device automation can identify real focus. Read the ADBT migration and build documents needed to decide every Vega-specific file and dependency. Follow ${PORT_PLAN_PATH} and VEGA_PORT.md. Do not change the approved plan.`,
      skills: [],
      mcp: [ADBT_SERVER],
      readOnly: [PORT_PLAN_PATH, PORT_PLAN_APPROVAL_PATH],
      checks: [
        { type: "contains", path: "apps/vega/manifest.toml", value: "schema-version = 1", label: "Vega manifest schema" },
        { type: "contains", path: "apps/vega/manifest.toml", value: "[[components.interactive]]", label: "Interactive component" },
        { type: "contains", path: "apps/vega/package.json", value: "build-vega", label: "Vega React Native build" },
        { type: "file_exists", path: "apps/vega/app.json", label: "Vega app registration" },
        { type: "file_exists", path: "apps/vega/metro.config.js", label: "Vega Metro boundary" },
        { type: "contains", path: "package.json", value: "vega:build", label: "Vega build script" },
        { type: "file_exists", path: "src/tv/focus-state.ts", label: "Focus state adapter" },
        { type: "contains", path: "src/App.tsx", value: "./tv/focus-state", label: "App uses shared focus state" },
        { type: "contains", path: "src/App.tsx", value: "testID", label: "Focusable controls expose stable ids" },
        { type: "file_exists", path: "tests/verify-tv-focus.ts", label: "Executable focus check written" },
      ],
    },
    {
      name: "build",
      goal: "Make the Vega package build. Read the compiler output in the failure above, fix the cause, and return only the files that change.",
      instruction: "The build is the judge. Do not weaken the app to satisfy it: fix the real cause the diagnostics name. Return complete file contents for every file you touch.",
      skills: [],
      mcp: [ADBT_SERVER],
      readOnly: [PORT_PLAN_PATH, PORT_PLAN_APPROVAL_PATH],
      device: ["build"],
      verifyFirst: true,
      maxAttempts: 5,
      checks: [],
    },
    {
      name: "launch",
      goal: "Make the app run on the device. Install it, launch it, and keep it alive — read the device log in the failure above and fix what crashed it.",
      instruction: "A launch that exits 0 is not a running app. Running-state samples and the device log decide whether the process stayed active. Fix the cause of the crash; the harness rebuilds and relaunches to check your work.",
      skills: [],
      mcp: [ADBT_SERVER],
      readOnly: [PORT_PLAN_PATH, PORT_PLAN_APPROVAL_PATH],
      device: ["build", "launch"],
      verifyFirst: true,
      maxAttempts: 3,
      checks: [],
    },
    {
      name: "test",
      goal: "Prove the remote-control contract holds: launch focus, movement boundaries, opening details, and Back restoring the originating card.",
      instruction: "Read ADBT documents before changing Vega focus behavior. The harness relaunches the app, injects D-pad keys, and reads the Automation Toolkit page source. Its observed focused test_id decides every transition. The host verifier covers focus-state logic but cannot replace device evidence.",
      skills: [],
      mcp: [ADBT_SERVER],
      device: ["launch", "focus"],
      repairDevice: ["build", "launch", "focus"],
      verifyFirst: true,
      maxAttempts: 3,
      readOnly: [PORT_PLAN_PATH, PORT_PLAN_APPROVAL_PATH],
      checks: [
        FOCUS_TEST_CHECK,
        { type: "contains", path: "TV_VERIFICATION.md", value: "originating card", label: "Focus restoration documented" },
      ],
    },
  ];
}

/** The port plan, optionally narrowed. Kept as the name the CLI and the lessons already use. */
export function phases(only?: string[]): PortPhase[] {
  return selectPhases(portPhases(), only);
}

function prompt(phase: PortPhase, options: Parameters<typeof runPortPipeline>[0], failures: string[], adbt?: AdbtPortContext): string {
  const checks = phase.checks.map((check) => {
    if (check.type === "command") return `- ${check.label}: ${check.command} ${check.args.join(" ")}`;
    if (check.type === "contains") return `- ${check.label}: ${check.path} contains ${check.value}`;
    if (check.type === "json_schema") return `- ${check.label}: ${check.path} must match its JSON schema`;
    return `- ${check.label}: ${check.path} exists`;
  }).join("\n");
  // Model-driven: instruct the agent to use the ADBT MCP tools itself. In replay (no live tools)
  // the recorded context is shown so the offline path still has authoritative guidance.
  const adbtGuidance = phase.mcp?.includes(ADBT_SERVER)
    ? adbt
      ? `\n\n## ADBT sources (recorded)\n${adbt.documents.map((d) => `### ${d.name}\n${d.excerpt}`).join("\n\n")}\n\nAll Vega-specific knowledge for this phase must come from these recorded ADBT sources. Do not invent Vega APIs or rely on an embedded scaffold. Write unsupported mappings to NextSteps.md and name the ADBT documents consulted.`
      : `\n\nAll Vega-specific knowledge for this phase must come from ADBT MCP. Use the adbt_list_documents and adbt_read_document tools to discover and read at least one relevant Vega document before proposing files. Do not invent Vega APIs or rely on an embedded scaffold. Write unsupported or uncertain mappings to NextSteps.md and name the ADBT documents you consulted.`
    : "";
  const planContract = phase.name === "plan" && options.briefSha256
    ? `\n\n## Structured plan contract\n${renderPortPlanContract(options.briefSha256)}`
    : "";
  return `You are porting the CURRENT guarded React Native app to Vega SDK 0.23.9221. Read existing files before proposing edits. Preserve unrelated work.\n\nPhase: ${phase.name}\nGoal: ${phase.goal}\nInstruction: ${phase.instruction}\nCreative seed: ${options.seed}\n\nProject input:\n${options.projectContext}\n\nPortability findings:\n${JSON.stringify(options.findings, null, 2)}${adbtGuidance}${planContract}\n\nRequired checks:\n${checks}\n${failures.length ? `\nPrevious attempt failed:\n${failures.map((f) => `- ${f}`).join("\n")}\nFix these exact failures.` : ""}\n\nReturn ONLY JSON: {"summary":"short commit summary","files":{"relative/path":"complete file contents"}}. Paths are relative to the app root. Do not include .git, node_modules, .env, absolute paths, or files outside the app.`;
}


function ensureAdbtNextSteps(appDir: string, context: AdbtPortContext) {
  const path = join(appDir, "NextSteps.md");
  const current = existsSync(path) ? readFileSync(path, "utf8").trimEnd() : "# Next Steps";
  if (current.includes("## ADBT sources")) return;
  const sources = context.documents.map((document) => `- ${document.name} (${document.sha256})`).join("\n");
  writeFileSync(path, `${current}\n\n## ADBT sources\n\n${sources}\n\n## Unsupported mappings\n\nAdd Vega gaps or manual work here during the port.\n`);
}
/** Paths the model may never write, however it spells them. */
const PROTECTED_PATHS = /(^|[\\/])(?:\.git|node_modules)(?:[\\/]|$)|(^|[\\/])\.env(?:\.|[\\/]|$)/;

// The write boundary of the whole harness: every model-proposed path must resolve inside the
// guarded app and must not touch Git, dependencies, environment files, or anything the phase
// declared read-only.
function writeOutput(appDir: string, files: Record<string, string>, readOnly: string[] = []) {
  const root = realpathSync(appDir);
  const locked = new Set([
    WORKSHOP_BRIEF,
    ".workshop-source.json",
    PORT_PLAN_APPROVAL_PATH,
    ...readOnly,
  ].map((name) => resolve(root, name)));
  for (const [name, content] of Object.entries(files)) {
    if (isAbsolute(name) || name.split(/[\\/]/).some((part) => part === "..")) throw new Error(`Unsafe model output path: ${name}`);
    const path = resolve(root, name);
    if (locked.has(path)) throw new Error(`Read-only in this phase: ${name}`);
    if (!path.startsWith(`${root}${sep}`) || PROTECTED_PATHS.test(name)) throw new Error(`Unsafe model output path: ${name}`);
    assertNoSymlink(root, name);
    mkdirSync(dirname(path), { recursive: true });
    const parent = realpathSync(dirname(path));
    if (parent !== root && !parent.startsWith(`${root}${sep}`)) throw new Error(`Unsafe model output path: ${name}`);
    writeFileSync(path, content);
  }
}

function assertNoSymlink(root: string, name: string): void {
  let cursor = root;
  for (const part of name.split(/[\\/]/).filter(Boolean)) {
    cursor = join(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error(`Unsafe model output path through symlink: ${name}`);
  }
}
function git(appDir: string, args: string[]) { return execFileSync("git", args, { cwd: appDir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim(); }
// Git is the rollback mechanism, not just the record: a failed attempt resets to the phase's
// starting commit. On a resumed run the repo already exists, so keep its history and commit
// nothing new.
function initializeGit(appDir: string) {
  const exists = existsSync(join(appDir, ".git"));
  if (!exists) {
    git(appDir, ["init"]);
    git(appDir, ["config", "user.email", "workshop@local"]);
    git(appDir, ["config", "user.name", "Workshop Harness"]);
  }
  configureGitExcludes(appDir);
  if (!exists) {
    git(appDir, ["add", "-A"]);
    git(appDir, ["commit", "-m", "workshop: import guarded source"]);
  }
}

const GENERATED_GIT_EXCLUDES = [
  "node_modules/",
  "/apps/vega/build/",
  "*.vpkg",
];

/** Live dependencies and compiler artifacts are evidence, not source-phase commit content. */
function configureGitExcludes(appDir: string): void {
  const path = join(appDir, ".git", "info", "exclude");
  mkdirSync(dirname(path), { recursive: true });
  const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
  const lines = new Set(existing.split(/\r?\n/));
  const missing = GENERATED_GIT_EXCLUDES.filter((pattern) => !lines.has(pattern));
  if (!missing.length) return;
  const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(path, `${existing}${prefix}${missing.join("\n")}\n`);
}
function gitHead(appDir: string) { return git(appDir, ["rev-parse", "HEAD"]); }
// Build output and dependencies are untracked but expensive to reproduce, and a retry that
// deleted them would rebuild from zero every attempt — and throw away the artifact it is
// trying to fix. Everything else the model wrote is cleaned.
const RETRY_KEEPS = ["build", "node_modules", "*.vpkg"];
function reset(appDir: string, head: string) {
  git(appDir, ["reset", "--hard", head]);
  git(appDir, ["clean", "-fd", ...RETRY_KEEPS.flatMap((pattern) => ["-e", pattern])]);
}
/** Commits whatever is in the tree. Exported so a caller can record an approved artifact. */
export function commitAll(appDir: string, message: string): void {
  commit(appDir, message);
}

// A patch can legitimately be identical to what is already on disk — a model re-sending a file
// it did not need to change. That is a pass with nothing to record, not a failure.
function commit(appDir: string, message: string) {
  git(appDir, ["add", "-A"]);
  if (!git(appDir, ["status", "--porcelain"])) return undefined;
  git(appDir, ["commit", "-m", message]);
  return gitHead(appDir).slice(0, 8);
}
