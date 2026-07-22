#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditSource, summarize } from "./portability-audit.js";
import { runFeasibility, type FeasibilityResult } from "./feasibility.js";
import { ADBT_PORT_WORKFLOWS, AdbtMcpContextProvider, AdbtContextError, AdbtReplayContextProvider, createAdbtAgentTools, type AdbtContextProvider } from "./context-providers/adbt.js";
import { BeeContextProvider } from "./context-providers/bee.js";
import { CliFailure, failure, json } from "./output.js";
import { applyProposal, loadMemory, loadSnapshot, propose } from "./project-memory.js";
import { assembleProjectContext } from "./phase-context.js";
import { createPortExecutor, resolveExecutorConfig } from "./port-executor.js";
import { PortBudgetError, runPortPipeline } from "./port-pipeline.js";
import { ADBT_PACKAGE, VEGA_SDK_VERSION, VegaAdapter, VegaReplayAdapter, runVegaLifecycle, type VegaCapability } from "./platform/vega.js";
import { copySource, discoverSource } from "./source-app.js";
import { workshopDoctor } from "./workshop-doctor.js";

const args = process.argv.slice(2);
const command = args[0];
const root = resolve(process.env.WORKSHOP_OUT ?? "out");

async function main(): Promise<void> {
  if (command === "doctor") return doctor();
  if (command === "plan") return planCommand();
  if (command === "run") return runCommand();
  if (command === "status") return statusCommand();
  if (command === "logs") return logsCommand();
  if (command === "memory") return memoryCommand();
  if (command === "context") return contextCommand();
  if (command === "vega-run") return vegaRunCommand();
  help();
}

async function doctor(): Promise<void> {
  const checks = await workshopDoctor();
  json({ command: "doctor", state: checks.some((c) => c.status === "repair") ? "repairable" : "ready", checks });
  if (checks.some((c) => c.status === "repair")) process.exitCode = 3;
}

function resolveAdbtProvider(cwd: string): AdbtContextProvider {
  const adbtReplay = args.includes("--adbt-live") ? undefined : flag("--adbt-replay") ?? adbtReplayBesideReplay();
  return adbtReplay ? new AdbtReplayContextProvider(resolve(adbtReplay)) : new AdbtMcpContextProvider({ cwd });
}

function adbtReplayBesideReplay(): string | undefined {
  const replayPath = flag("--replay");
  return replayPath ? join(dirname(resolve(replayPath)), "adbt-port-context.json") : undefined;
}

function feasibilityReplayPath(): string | undefined {
  const replayPath = flag("--replay");
  return flag("--feasibility-replay") ?? (replayPath ? join(dirname(resolve(replayPath)), "feasibility-recording.json") : undefined);
}

async function buildPlan(sourcePath: string, outDir: string) {
  const source = discoverSource(sourcePath);
  const findings = auditSource(source);
  const inputDir = flag("--inputs");
  const memory = loadMemory(inputDir ?? sourcePath);
  const phaseContext = assembleProjectContext(memory, "vega_port");
  const executorConfig = resolveExecutorConfig({ executor: flag("--executor"), provider: flag("--provider"), model: flag("--model"), region: flag("--region") });
  const adbtMode = !flag("--replay") || args.includes("--adbt-live") ? "live" : "replay";

  // The audit interrogates ADBT and a bounded model to judge whether the port is possible
  // before any spec/port budget is spent. Live path calls the model + ADBT MCP; replay reads fixtures.
  const adbt = await resolveAdbtProvider(source.source).load();
  const feasibilityExecutor = createPortExecutor({ appDir: source.source, outDir, replayPath: feasibilityReplayPath(), recordingName: "feasibility-recording.json", config: executorConfig });
  const feasibility = await runFeasibility({ source, findings, adbt, executor: feasibilityExecutor });

  return {
    source,
    target: { platform: "firetv-vega", sdk: VEGA_SDK_VERSION },
    seed: flag("--seed") ?? "workshop-v1",
    maxCostUsd: Number(flag("--max-cost") ?? 10),
    executor: executorConfig,
    summary: summarize(findings),
    findings,
    feasibility,
    contextEntryIds: phaseContext.entryIds,
    phaseContext: phaseContext.text,
    adbt: { package: ADBT_PACKAGE, mode: adbtMode, phase: "analyze (feasibility) + plan", workflows: ADBT_PORT_WORKFLOWS },
    phases: ["analyze", "plan", "build_test"],
  };
}

function guardFeasibility(feasibility: FeasibilityResult): void {
  if (feasibility.verdict !== "blocked") return;
  const blockers = feasibility.dependencies.filter((dependency) => dependency.status === "blocking").map((dependency) => `${dependency.name}: ${dependency.reasoning}`);
  failure("port_infeasible", `ADBT audit judged the port blocked: ${feasibility.summary}`, `Resolve blocking dependencies before porting:\n${blockers.join("\n") || "See feasibility-report.json."}`, 5);
}

async function planCommand(): Promise<void> {
  const sourcePath = args[1];
  if (!sourcePath) failure("missing_source", "A source app path is required.", "Run workshop-harness plan <app> --inputs <dir> --json.");
  const scratch = mkdtempSync(join(tmpdir(), "workshop-plan-"));
  try {
    const plan = await buildPlan(sourcePath, scratch);
    json({ command: "plan", plan });
    guardFeasibility(plan.feasibility);
  }
  catch (error) {
    if (error instanceof AdbtContextError) return failure("adbt_unavailable", String(error), "Run doctor once or use the recorded ADBT replay context.", 3);
    if (error instanceof CliFailure) throw error;
    failure("invalid_source", String(error), "Provide a React Native project containing package.json.");
  }
}

async function runCommand(): Promise<void> {
  const sourcePath = args[1];
  if (!sourcePath) failure("missing_source", "A source app path is required.", "Run workshop-harness run <app> --inputs <dir> --yes --json.");
  if (!args.includes("--yes")) failure("confirmation_required", "Run requires explicit confirmation.", "Show the plan, then rerun with --yes.");
  if (args.includes("--detach") && !args.includes("--child")) return detach(sourcePath);
  await executeRun(sourcePath, flag("--run-id") ?? randomUUID().slice(0, 8));
}

function detach(sourcePath: string): void {
  const runId = randomUUID().slice(0, 8);
  const out = join(root, runId);
  mkdirSync(out, { recursive: true });
  const log = join(out, "run.log");
  const fd = BunFreeOpen(log);
  const forwarded = args.concat(["--child", "--run-id", runId]).filter((arg) => arg !== "--detach");
  const childArgs = ["--import", "tsx", fileURLToPath(import.meta.url), ...forwarded];
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  writeFileSync(join(out, "pid"), String(child.pid));
  writeFileSync(join(out, "status.json"), JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: "analyze" }, null, 2));
  json({ command: "detach", runId, pid: child.pid, out });
}

async function executeRun(sourcePath: string, runId: string): Promise<void> {
  const out = join(root, runId);
  mkdirSync(out, { recursive: true });
  const statusPath = join(out, "status.json");
  try {
    const plan = await buildPlan(sourcePath, out);
    writeFileSync(join(out, "feasibility-report.json"), JSON.stringify({ schemaVersion: 1, ...plan.feasibility }, null, 2));
    guardFeasibility(plan.feasibility);
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: "analyze", phasesComplete: [] }, null, 2));
    const appDir = join(out, "app");
    copySource(sourcePath, appDir);
    const inputs = flag("--inputs");
    if (inputs && existsSync(resolve(inputs))) cpSync(resolve(inputs), join(out, "inputs"), { recursive: true });
    writeFileSync(join(out, "portability-report.json"), JSON.stringify({ schemaVersion: 1, ...plan }, null, 2));
    writeFileSync(join(out, "tv-build-inputs.json"), JSON.stringify({ schemaVersion: 1, sourceApp: join(out, "app"), target: "firetv-vega", seed: plan.seed, maxCostUsd: plan.maxCostUsd }, null, 2));
    const replayPath = flag("--replay");
    const executor = createPortExecutor({ appDir, outDir: out, replayPath, config: plan.executor });
    // Model-driven ADBT: with a live Strands model, hand the ADBT MCP read tools to the agent so
    // it discovers workflows itself. With a replayed or CLI model there is no in-process agent loop
    // to call them, so fall back to the recorded/live context provider.
    const liveStrands = !replayPath && plan.executor.kind === "strands";
    const adbtTools = liveStrands ? createAdbtAgentTools({ cwd: appDir }) : undefined;
    const adbt = adbtTools ? undefined : resolveAdbtProvider(appDir);
    const port = await runPortPipeline({ appDir, outDir: out, findings: plan.findings, projectContext: plan.phaseContext, seed: plan.seed, maxCostUsd: plan.maxCostUsd - plan.feasibility.costUsd, executor, adbt, adbtTools, onPhase: (currentPhase) => writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase, phasesComplete: [] }, null, 2)) });
    port.costUsd += plan.feasibility.costUsd;
    writeFileSync(join(out, "port-result.json"), JSON.stringify({ schemaVersion: 1, ...port }, null, 2));

    // build_test requires device evidence: build, launch, and a real screenshot.
    // Replay fixture keeps the workshop key-free; otherwise it runs live against the VDA.
    const platform = await runBuildTestLifecycle(out, appDir);
    if (platform.screenshots.length === 0 || platform.blockers.length > 0) {
      throw new Error(`build_test screenshot evidence missing: ${platform.blockers.join("; ") || "no screenshot captured"}`);
    }

    const executionMode = replayPath ? "Replay (recorded model turns)" : plan.executor.kind === "strands" ? `Strands (${plan.executor.model.provider}:${plan.executor.model.modelId})` : `Claude Code (${plan.executor.model})`;
    const report = `# Workshop Run ${runId}\n\n- Target: Vega SDK ${VEGA_SDK_VERSION}\n- ADBT package: ${ADBT_PACKAGE}\n- ADBT port context: ${port.adbt?.mode ?? "missing"} (${port.adbt?.documents.join(", ") ?? "none"})\n- ADBT evidence: ${port.adbt?.evidence ?? "none"}\n- Executor: ${executionMode}\n- Seed: ${plan.seed}\n- Cost cap: $${plan.maxCostUsd}\n- Port cost: $${port.costUsd.toFixed(4)}\n- Source copied: yes\n- Port phases: ${port.phases.map((phase) => `${phase.name} (${phase.attempts} attempt${phase.attempts === 1 ? "" : "s"})`).join(", ")}\n- Next: inspect the generated app, then run vega-run for build and device evidence.\n`;
    writeFileSync(join(out, "report.md"), report);
    const phasesComplete = port.phases.map((phase) => phase.name);
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "complete", currentPhase: null, phasesComplete, costUsd: port.costUsd, out }, null, 2));
    json({ event: "run_complete", runId, state: "complete", out, seed: plan.seed, costUsd: port.costUsd, phasesComplete });
  } catch (error) {
    if (error instanceof CliFailure) throw error;
    const budget = error instanceof PortBudgetError;
    const adbtFailure = error instanceof AdbtContextError;
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: budget ? "aborted" : "failed", reason: budget ? "budget" : undefined, error: String(error) }, null, 2));
    failure(budget ? "budget_exceeded" : adbtFailure ? "adbt_unavailable" : "run_failed", String(error), adbtFailure ? "Run doctor once or use the recorded ADBT replay context." : `Inspect ${out}/run.log and portability-report.json.`, budget ? 4 : adbtFailure ? 3 : 2);
  }
}

async function runBuildTestLifecycle(out: string, appDir: string) {
  const vegaDir = join(appDir, "apps", "vega");
  const replayPath = flag("--platform-replay");
  const replay = replayPath ? JSON.parse(readFileSync(resolve(replayPath), "utf8")) as { packagePath: string; appId: string; turns: Array<{ capability: VegaCapability; result: { code: number; stdout: string; stderr: string; timedOut: boolean } }> } : null;
  return runVegaLifecycle({
    adapter: replay ? new VegaReplayAdapter(replay.turns) : new VegaAdapter(process.env.VEGA_BIN ?? "vega", vegaDir),
    appDir: vegaDir,
    focusDir: appDir,
    outDir: out,
    evidenceMode: replay ? "replay" : "live",
    packagePath: replay?.packagePath,
    appId: replay?.appId,
  });
}

function statusCommand(): void {
  const runId = args[1];
  const path = runId && join(root, runId, "status.json");
  if (!path || !existsSync(path)) failure("run_not_found", `Run ${runId ?? ""} was not found.`, "Use the runId returned by run --detach.");
  process.stdout.write(`${readFileSync(path, "utf8").trim()}\n`);
}

function logsCommand(): void {
  const path = join(root, args[1] ?? "", "run.log");
  if (!existsSync(path)) failure("log_not_found", "Run log was not found.", "Check status with the runId first.");
  process.stdout.write(readFileSync(path, "utf8"));
}

function memoryCommand(): void {
  const action = args[1];
  const dir = args[2];
  if (!dir) failure("missing_memory_dir", "Memory directory is required.", "Run memory show <inputs>.");
  if (action === "show") return json({ command: "memory_show", memory: loadMemory(dir) });
  const from = flag("--from");
  if (action === "propose" && from) return json({ command: "memory_propose", proposal: propose(loadSnapshot(from)) });
  if (action === "apply" && from && args.includes("--yes")) return json({ command: "memory_apply", memory: applyProposal(dir, propose(loadSnapshot(from))) });
  failure("invalid_memory_command", "Memory command is incomplete.", "Use show, propose --from, or apply --from --yes.");
}

async function contextCommand(): Promise<void> {
  if (args[1] === "adbt" && args[2] === "port") {
    const replay = flag("--adbt-replay");
    const provider = replay ? new AdbtReplayContextProvider(resolve(replay)) : new AdbtMcpContextProvider({ cwd: root });
    return json({ command: "context_adbt_port", context: await provider.load() });
  }
  if (args[1] !== "bee") failure("unknown_provider", "Use the ADBT port context or optional Bee provider.", "Use context adbt port, context bee search, or context bee snapshot.");
  const provider = new BeeContextProvider();
  if (args[2] === "search") return json({ command: "context_search", candidates: await provider.search(args[3] ?? "") });
  if (args[2] === "snapshot") {
    const out = flag("--out");
    if (!out) failure("missing_output", "Snapshot output path is required.", "Add --out candidate-context.json.");
    const ids = args.slice(3, args.indexOf("--out"));
    const snapshot = await provider.snapshot(ids, flag("--query") ?? "workshop product context");
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), JSON.stringify(snapshot, null, 2));
    return json({ command: "context_snapshot", out: resolve(out), snapshot });
  }
  failure("invalid_context_command", "Context command is incomplete.", "Use context bee search <query> or snapshot <ids> --out <file>.");
}

async function vegaRunCommand(): Promise<void> {
  const runId = args[1];
  const out = runId && join(root, runId);
  const appDir = out && join(out, "app");
  const vegaDir = appDir && join(appDir, "apps", "vega");
  if (!vegaDir || !existsSync(join(vegaDir, "package.json"))) failure("vega_app_missing", "The guarded run has no apps/vega package.", "Run the verified port pipeline before Vega execution.");
  const liveAdapter = new VegaAdapter(process.env.VEGA_BIN ?? "vega", vegaDir);
  const capabilities: Array<{ capability: VegaCapability; values?: string[] }> = [
    { capability: "sdk_version" }, { capability: "device_status" }, { capability: "build" },
    { capability: "install", values: ["<build/*.vpkg>"] }, { capability: "launch", values: ["<component-id>"] },
    { capability: "logs" }, { capability: "capture", values: ["/tmp/tv-build-launch.png"] },
    { capability: "pull", values: ["/tmp/tv-build-launch.png", "<run>/01-launch.png"] },
  ];
  if (args.includes("--plan")) return json({ command: "vega_run_plan", runId, appDir, sdkVersion: VEGA_SDK_VERSION, adbtPackage: ADBT_PACKAGE, steps: capabilities.map((step) => ({ capability: step.capability, command: liveAdapter.command(step.capability, ...(step.values ?? [])) })), requiresConfirmation: true });
  if (!args.includes("--yes")) failure("confirmation_required", "Vega execution requires explicit confirmation.", "Show vega-run --plan, then rerun with --yes.");
  const replayPath = flag("--platform-replay");
  const replay = replayPath ? JSON.parse(readFileSync(resolve(replayPath), "utf8")) as { packagePath: string; appId: string; turns: Array<{ capability: VegaCapability; result: { code: number; stdout: string; stderr: string; timedOut: boolean } }> } : null;
  const platformResult = await runVegaLifecycle({
    adapter: replay ? new VegaReplayAdapter(replay.turns) : liveAdapter,
    appDir: vegaDir,
    focusDir: appDir,
    outDir: out,
    evidenceMode: replay ? "replay" : "live",
    packagePath: replay?.packagePath,
    appId: replay?.appId,
  });
  const state = platformResult.blockers.length === 0 ? "complete" : "failed";
  json({ event: "run_complete", runId, state, platformResult });
  if (state === "failed") process.exitCode = 2;
}

function flag(name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function BunFreeOpen(path: string): number { mkdirSync(dirname(path), { recursive: true }); return openSync(path, "a"); }
function help(): void { process.stdout.write("Workshop Harness\n\nCommands: doctor, plan, run, status, logs, memory, context adbt, context bee, vega-run\n\nModel execution:\n  --executor claude-cli                 Local Claude Code (default)\n  --executor strands --provider <name>  Remote model through Strands\n  --model <id> [--region <aws-region>]  Provider model settings\n  --replay <recording.json>             No-model workshop path\n  --adbt-replay <context.json>          Recorded ADBT context (otherwise inferred beside replay)\n  --adbt-live                           Call pinned ADBT even when model output uses replay\n\nLive ports call pinned ADBT workflows at runtime during analyze and plan.\nStrands providers: bedrock, openai, openrouter\n"); }

main().catch((error) => { if (!(error instanceof CliFailure)) failure("unexpected_error", error instanceof Error ? error.message : String(error), "Read the workshop troubleshooting guide.", 3); });
