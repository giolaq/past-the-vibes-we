#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, watchFile, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditSource, summarize } from "./portability-audit.js";
import { FEASIBILITY_PHASE, runFeasibility, type FeasibilityResult } from "./feasibility.js";
import { ADBT_PORT_WORKFLOWS, AdbtMcpContextProvider, AdbtContextError, AdbtReplayContextProvider, createAdbtCliMcpServer, createAdbtMcpClient, type AdbtContextProvider } from "./context-providers/adbt.js";
import { BEE_SERVER, BeeContextProvider, createBeeMcpClient, extractBeeProvenance, loadRecordedBeeContext, recordedBeeProvenance } from "./context-providers/bee.js";
import { BEE_APPLY_PHASE, BEE_SPEC_PHASE, beePhases } from "./bee-pipeline.js";
import { BEE_SPEC_MD, loadBeeSpec, renderBeeSpec } from "./bee-spec.js";
import { CliFailure, failure, json } from "./output.js";
import { applyProposal, loadMemory, loadSnapshot, propose } from "./project-memory.js";
import { assembleProjectContext } from "./phase-context.js";
import { ModelTranscriptStore } from "./model-transcript.js";
import { createPortExecutor, resolveExecutorConfig } from "./port-executor.js";
import { ADBT_SERVER, PortBudgetError, commitAll, phases, runPortPipeline } from "./port-pipeline.js";
import { tvReadyChecks, verifyPort } from "./port-verification.js";
import { createScreenshotJudge } from "./platform/screenshot-vision.js";
import { ADBT_PACKAGE, VEGA_LAUNCH_FRAME, VEGA_POSTLAUNCH_FRAME, VEGA_SCREENSHOT_REMOTE, VEGA_SDK_VERSION, VegaAdapter, VegaReplayAdapter, runVegaLifecycle, startDeviceRun, writeDeviceResult, type ScreenshotJudge, type VegaCapability, type VegaReplayFixture } from "./platform/vega.js";
import { copySource, discoverSource } from "./source-app.js";
import { workshopDoctor } from "./workshop-doctor.js";
import { loadPortResult, loadRunCost, loadVegaResult, mergePortResults, mergeVegaResults } from "./run-state.js";
import { shouldUseTui, WorkshopTui } from "./tui.js";
import { runNaiveProbe } from "./naive-probe.js";
import { injectBuildFailure } from "./workshop-failure.js";

const args = process.argv.slice(2);
const command = args[0];
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const root = resolve(process.env.WORKSHOP_OUT ?? join(repositoryRoot, "out"));

async function main(): Promise<void> {
  if (!command || args.includes("--help") || command === "help") return help();
  if (command === "doctor") return doctor();
  if (command === "naive") return naiveCommand();
  if (command === "plan") return planCommand();
  if (command === "run") return runCommand();
  if (command === "status") return statusCommand();
  if (command === "logs") return logsCommand();
  if (command === "memory") return memoryCommand();
  if (command === "context") return contextCommand();
  if (command === "vega-run") return vegaRunCommand();
  if (command === "tv-check") return tvCheckCommand();
  if (command === "bee-run") return beeRunCommand();
  if (command === "inject-build-failure") return injectBuildFailureCommand();
  help();
}

async function naiveCommand(): Promise<void> {
  const sourcePath = args[1];
  if (!sourcePath) failure("missing_app", "App directory is required.", "Run naive <app> --yes with your executor flags.");
  if (!args.includes("--yes")) failure("confirmation_required", "The one-shot probe spends model budget.", "Show the command and cost cap, then rerun with --yes.");
  const runId = flag("--run-id") ?? "naive-demo";
  const out = join(root, runId);
  if (existsSync(out)) failure("run_exists", `Run ${runId} already exists.`, "Choose a different --run-id so the comparison starts clean.");
  const appDir = join(out, "app");
  mkdirSync(out, { recursive: true });
  copySource(sourcePath, appDir);
  const config = selectedExecutorConfig();
  const transcripts = new ModelTranscriptStore(out);
  const executor = createPortExecutor({ appDir, outDir: out, config, transcripts, recordingName: "naive-recording.json" });
  const maxCostUsd = Number(flag("--max-cost") ?? 1);
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new Error("--max-cost must be a positive number");
  const result = await runNaiveProbe(executor, maxCostUsd);
  writeFileSync(join(out, "naive-proposal.json"), JSON.stringify({ schemaVersion: 1, ...result.proposal }, null, 2));
  const report = { schemaVersion: 1, runId, executor: executorName(config), costUsd: result.costUsd, proposedFiles: Object.keys(result.proposal.files).sort(), coverage: result.coverage, missingProof: result.missingProof };
  writeFileSync(join(out, "naive-result.json"), JSON.stringify(report, null, 2));
  json({ command: "naive", ...report, proposal: join(out, "naive-proposal.json"), transcript: transcripts.pathFor("one_shot_port") });
}

function injectBuildFailureCommand(): void {
  const runId = args[1];
  if (!runId) failure("missing_run", "Run id is required.", "Run inject-build-failure <runId> --yes after the port phase.");
  if (!args.includes("--yes")) failure("confirmation_required", "Fault injection changes the guarded app.", "Confirm the workshop exercise, then rerun with --yes.");
  const out = join(root, runId);
  const appDir = join(out, "app");
  if (!existsSync(appDir)) failure("run_not_found", `No guarded app exists for ${runId}.`, "Complete the port phase first, using the same --run-id.");
  const injected = injectBuildFailure(appDir, out);
  commitAll(appDir, "workshop: inject the deterministic build exercise");
  json({ command: "inject-build-failure", runId, appDir, ...injected, next: `run --run-id ${runId} --phases build` });
}

// Runs the mechanical TV-readiness checks against any app directory. Red on the
// touch-first starter, green on the ported output — the workshop's before/after.
async function tvCheckCommand(): Promise<void> {
  const target = resolve(args[1] ?? ".");
  // Skip executing the focus test when its script is absent — the file_exists
  // check already reports that, and running it would only add a stack trace.
  const checks = tvReadyChecks().filter((check) => check.type !== "command" || existsSync(join(target, "tests/verify-tv-focus.ts")));
  const failures = await verifyPort(target, checks);
  json({ command: "tv-check", target, tvReady: failures.length === 0, failures });
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

async function buildPlan(sourcePath: string, outDir: string, transcripts?: ModelTranscriptStore) {
  const source = discoverSource(sourcePath);
  const findings = auditSource(source);
  const inputDir = flag("--inputs");
  const memory = loadMemory(inputDir ?? sourcePath);
  const phaseContext = assembleProjectContext(memory, "vega_port");
  const executorConfig = selectedExecutorConfig();
  const maxCostUsd = Number(flag("--max-cost") ?? 10);
  if (!Number.isFinite(maxCostUsd) || maxCostUsd <= 0) throw new Error("--max-cost must be a positive number");

  // The audit interrogates ADBT and a bounded model to judge whether the port is possible
  // before any spec/port budget is spent. Live path calls the model + ADBT MCP; replay reads fixtures.
  // It reads a disposable copy, so even a broken CLI cannot touch the attendee's source.
  const adbt = await resolveAdbtProvider(source.source).load();
  const feasibilityReplay = feasibilityReplayPath();
  const liveMcp = !feasibilityReplay;
  const feasibilityDir = mkdtempSync(join(tmpdir(), "workshop-feasibility-"));
  copySource(source.source, feasibilityDir);
  const feasibilityMcp = liveMcp && executorConfig.kind === "strands" ? createAdbtMcpClient({ cwd: feasibilityDir }) : undefined;
  let feasibility: FeasibilityResult;
  try {
    const feasibilityExecutor = createPortExecutor({
      appDir: feasibilityDir,
      outDir,
      replayPath: feasibilityReplay,
      recordingName: "feasibility-recording.json",
      config: executorConfig,
      cliMcpServers: liveMcp ? { [ADBT_SERVER]: createAdbtCliMcpServer() } : undefined,
      transcripts,
    });
    feasibility = await runFeasibility({
      source: { ...source, source: feasibilityDir },
      findings,
      adbt,
      executor: feasibilityExecutor,
      liveMcp,
      mcpClient: feasibilityMcp,
      maxCostUsd,
    });
  } finally {
    await feasibilityMcp?.disconnect();
    rmSync(feasibilityDir, { recursive: true, force: true });
  }

  return {
    source,
    target: { platform: "firetv-vega", sdk: VEGA_SDK_VERSION },
    seed: flag("--seed") ?? "workshop-v1",
    maxCostUsd,
    executor: executorConfig,
    summary: summarize(findings),
    findings,
    feasibility,
    contextEntryIds: phaseContext.entryIds,
    phaseContext: phaseContext.text,
    adbt: {
      package: ADBT_PACKAGE,
      mode: feasibility.adbt?.mode ?? adbt.mode,
      phase: "feasibility + plan",
      workflows: feasibility.adbt?.documents.map((document) => document.name) ?? ADBT_PORT_WORKFLOWS,
    },
    phases: phases(phaseNames()).map((phase) => phase.name),
  };
}

/** --phases analyze,plan runs part of the pipeline; omitted means the whole port. */
function phaseNames(): string[] | undefined {
  return flag("--phases")?.split(",").map((name) => name.trim()).filter(Boolean);
}

/** Phases an earlier invocation of this run id already finished. */
function completedPhases(statusPath: string): string[] {
  if (!existsSync(statusPath)) return [];
  try {
    return (JSON.parse(readFileSync(statusPath, "utf8")) as { phasesComplete?: string[] }).phasesComplete ?? [];
  } catch {
    return [];
  }
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
  // Reject a bad --phases before the run directory or the feasibility call exists.
  try { phases(phaseNames()); } catch (error) { failure("unknown_phase", String(error), `Use --phases with any of ${phases().map((phase) => phase.name).join(", ")}.`); }
  if (args.includes("--detach") && !args.includes("--child")) return detach();
  await executeRun(sourcePath, flag("--run-id") ?? randomUUID().slice(0, 8));
}

function detach(): void {
  const runId = randomUUID().slice(0, 8);
  const out = join(root, runId);
  mkdirSync(out, { recursive: true });
  const log = join(out, "run.log");
  const fd = openLogFile(log);
  const forwarded = args.concat(["--child", "--run-id", runId]).filter((arg) => arg !== "--detach");
  const childArgs = ["--import", "tsx", fileURLToPath(import.meta.url), ...forwarded];
  const child = spawn(process.execPath, childArgs, { detached: true, stdio: ["ignore", fd, fd] });
  child.unref();
  writeFileSync(join(out, "pid"), String(child.pid));
  const modelLogsDir = join(out, "model-logs");
  writeFileSync(join(out, "status.json"), JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: "vega_portability_audit", modelLogsDir }, null, 2));
  json({ command: "detach", runId, pid: child.pid, out, modelLogsDir });
}

async function executeRun(sourcePath: string, runId: string): Promise<void> {
  const out = join(root, runId);
  mkdirSync(out, { recursive: true });
  const statusPath = join(out, "status.json");
  const portResultPath = join(out, "port-result.json");
  const savedPort = loadPortResult(portResultPath);
  const previousPort = { ...savedPort, costUsd: Math.max(savedPort.costUsd, loadRunCost(statusPath)) };
  let feasibilityCost = 0;
  let invocationCost = 0;
  let budgetUsd: number | undefined;
  let tui: WorkshopTui | undefined;
  const completedThisInvocation: string[] = [];
  // Read before the first status write: a resumed run must not forget the phases it already did.
  const alreadyComplete = completedPhases(statusPath);
  try {
    const selected = phases(phaseNames());
    const executorConfig = selectedExecutorConfig();
    const initialBudget = Number(flag("--max-cost") ?? 10);
    tui = shouldUseTui(args) ? new WorkshopTui({
      runId,
      executor: executorName(executorConfig),
      evidenceMode: flag("--replay") ? "recorded" : "live",
      seed: flag("--seed") ?? "workshop-v1",
      budgetUsd: initialBudget,
      phases: [FEASIBILITY_PHASE, ...selected.map((phase) => phase.name)],
    }) : undefined;
    const transcripts = new ModelTranscriptStore(out, tui?.transcript);
    tui?.start(FEASIBILITY_PHASE);
    for (const phase of alreadyComplete) tui?.phasePassed(phase, "completed in an earlier invocation", 0);
    const plan = await buildPlan(sourcePath, out, transcripts);
    feasibilityCost = plan.feasibility.costUsd;
    budgetUsd = plan.maxCostUsd;
    tui?.phasePassed(FEASIBILITY_PHASE, plan.feasibility.summary);
    tui?.cost(previousPort.costUsd + plan.feasibility.costUsd);
    if (previousPort.costUsd + plan.feasibility.costUsd > plan.maxCostUsd) {
      throw new PortBudgetError(`Run cost $${(previousPort.costUsd + plan.feasibility.costUsd).toFixed(2)} exceeded $${plan.maxCostUsd.toFixed(2)}`);
    }
    writeFileSync(join(out, "feasibility-report.json"), JSON.stringify({ schemaVersion: 1, ...plan.feasibility }, null, 2));
    guardFeasibility(plan.feasibility);
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: selected[0].name, phasesComplete: alreadyComplete, costUsd: previousPort.costUsd + plan.feasibility.costUsd, budgetUsd: plan.maxCostUsd, modelLogsDir: join(out, "model-logs") }, null, 2));
    const appDir = join(out, "app");
    // Resuming: `run --run-id <id> --phases build_test` continues in the guarded copy that
    // earlier phases already built and committed, so the source is copied only once per run id.
    const resuming = existsSync(appDir);
    if (!resuming) copySource(sourcePath, appDir);
    const inputs = flag("--inputs");
    if (inputs && existsSync(resolve(inputs))) cpSync(resolve(inputs), join(out, "inputs"), { recursive: true });
    writeFileSync(join(out, "portability-report.json"), JSON.stringify({ schemaVersion: 1, ...plan }, null, 2));
    writeFileSync(join(out, "tv-build-inputs.json"), JSON.stringify({ schemaVersion: 1, sourceApp: join(out, "app"), target: "firetv-vega", seed: plan.seed, maxCostUsd: plan.maxCostUsd }, null, 2));
    const replayPath = flag("--replay");
    const liveModel = !replayPath;
    const executor = createPortExecutor({
      appDir,
      outDir: out,
      replayPath,
      config: plan.executor,
      cliMcpServers: liveModel ? { [ADBT_SERVER]: createAdbtCliMcpServer() } : undefined,
      transcripts,
    });
    // Both live executors receive the same pinned ADBT stdio MCP server. Strands receives its
    // McpClient in-process; Claude receives an explicit --mcp-config for this invocation.
    const liveStrands = liveModel && plan.executor.kind === "strands";
    const adbtClient = liveStrands ? createAdbtMcpClient({ cwd: appDir }) : undefined;
    const adbt = liveModel ? undefined : resolveAdbtProvider(appDir);
    const mcpClients = adbtClient ? { [ADBT_SERVER]: adbtClient } : undefined;
    // --until-done removes the attempt cap; the cost cap and the no-progress rule still stop the loop.
    const maxAttempts = args.includes("--until-done") ? Infinity : Number(flag("--max-attempts") ?? 2);
    // The build, launch, and test phases execute against a device. One session spans them, so
    // the package phase 4 produced is the one phase 5 installs. A partial run that stops before
    // them opens no session and claims no device evidence.
    const preserveDeviceArtifacts = selected.every((phase) => phase.name === "test");
    const device = selected.some((phase) => phase.device?.length) ? openDeviceSession(out, appDir, preserveDeviceArtifacts) : undefined;
    let activePhase = selected[0].name;
    const completedForStatus = () => [...new Set([...alreadyComplete, ...completedThisInvocation])];
    const writeRunningStatus = () => writeFileSync(statusPath, JSON.stringify({
      schemaVersion: 1,
      runId,
      state: "running",
      currentPhase: activePhase,
      phasesComplete: completedForStatus(),
      costUsd: previousPort.costUsd + plan.feasibility.costUsd + invocationCost,
      budgetUsd: plan.maxCostUsd,
      modelLogsDir: transcripts.directory,
    }, null, 2));
    const invocation = await runPortPipeline({
      appDir,
      outDir: out,
      findings: plan.findings,
      projectContext: plan.phaseContext,
      seed: plan.seed,
      maxCostUsd: plan.maxCostUsd - previousPort.costUsd - plan.feasibility.costUsd,
      maxAttempts,
      phaseNames: phaseNames(),
      executor,
      device,
      judge: screenshotJudge(out, transcripts),
      adbt,
      mcpClients,
      liveMcp: liveModel ? [ADBT_SERVER] : [],
      transcripts,
      onPhase: (currentPhase) => {
        activePhase = currentPhase;
        tui?.phaseStart(currentPhase);
        writeRunningStatus();
      },
      onPhaseComplete: (phase, snapshot) => {
        tui?.phaseComplete(phase);
        completedThisInvocation.push(phase.name);
        const checkpoint = mergePortResults(previousPort, { ...snapshot, costUsd: snapshot.costUsd + plan.feasibility.costUsd });
        writeFileSync(portResultPath, JSON.stringify({ schemaVersion: 1, ...checkpoint }, null, 2));
        writeRunningStatus();
      },
      onCost: (costUsd) => {
        invocationCost = costUsd;
        tui?.cost(previousPort.costUsd + plan.feasibility.costUsd + costUsd);
        writeRunningStatus();
      },
      onNotice: tui?.notice,
    });
    invocation.costUsd += plan.feasibility.costUsd;
    const port = mergePortResults(previousPort, invocation);
    writeFileSync(portResultPath, JSON.stringify({ schemaVersion: 1, ...port }, null, 2));
    if (device) writeCumulativeDeviceResult(device, out, loadPlatformReplay() ? "replay" : "live");

    const executionMode = replayPath ? "Replay (recorded model turns)" : plan.executor.kind === "strands" ? `Strands (${plan.executor.model.provider}:${plan.executor.model.modelId})` : `Claude Code (${plan.executor.model})`;
    const evidenceMode = replayPath ? "replay" : "live model";
    const report = `# Workshop Run ${runId}\n\n- Target: Vega SDK ${VEGA_SDK_VERSION}\n- Evidence mode: ${evidenceMode}\n- ADBT package: ${ADBT_PACKAGE}\n- ADBT access: MCP for both Strands and Claude Code live executors\n- ADBT port context: ${port.adbt?.mode ?? "missing"} (${port.adbt?.documents.join(", ") ?? "none"})\n- ADBT evidence: ${port.adbt?.evidence ?? "none"}\n- Executor: ${executionMode}\n- Seed: ${plan.seed}\n- Cost cap: $${plan.maxCostUsd}\n- Cumulative model cost: $${port.costUsd.toFixed(4)}\n- Model transcripts: ${transcripts.directory}\n- Transcript files: ${transcripts.files().join(", ") || "none"}\n- Guarded source initialized this invocation: ${resuming ? "no" : "yes"}\n- Port phases: ${port.phases.map((phase) => `${phase.name} (${phase.attempts} attempt${phase.attempts === 1 ? "" : "s"})`).join(", ")}\n- Next: inspect the generated app. Only a Vega result marked evidenceMode: live proves build or device behavior.\n`;
    writeFileSync(join(out, "report.md"), report);
    // A resumed run reports every phase this run id has completed, not only this invocation's.
    const phasesComplete = [...new Set([...alreadyComplete, ...port.phases.map((phase) => phase.name)])];
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "complete", currentPhase: null, phasesComplete, costUsd: port.costUsd, budgetUsd: plan.maxCostUsd, out, modelLogsDir: transcripts.directory, modelLogs: transcripts.files() }, null, 2));
    tui?.cost(port.costUsd);
    await tui?.complete();
    if (tui) {
      humanRunComplete(runId, out, port.costUsd, phasesComplete, transcripts.directory);
    } else {
      json({ event: "run_complete", runId, state: "complete", out, seed: plan.seed, costUsd: port.costUsd, budgetUsd: plan.maxCostUsd, phasesComplete, modelLogsDir: transcripts.directory, modelLogs: transcripts.files() });
    }
  } catch (error) {
    tui?.fail(error instanceof Error ? error.message : String(error));
    tui?.finish();
    if (error instanceof CliFailure) throw error;
    const budget = error instanceof PortBudgetError;
    const adbtFailure = error instanceof AdbtContextError;
    writeFileSync(statusPath, JSON.stringify({
      schemaVersion: 1,
      runId,
      state: budget ? "aborted" : "failed",
      reason: budget ? "budget" : undefined,
      phasesComplete: [...new Set([...alreadyComplete, ...completedThisInvocation])],
      costUsd: previousPort.costUsd + feasibilityCost + invocationCost,
      budgetUsd,
      modelLogsDir: join(out, "model-logs"),
      error: String(error),
    }, null, 2));
    failure(budget ? "budget_exceeded" : adbtFailure ? "adbt_unavailable" : "run_failed", String(error), adbtFailure ? "Run doctor once or use the recorded ADBT replay context." : `Inspect ${out}/run.log, model-logs/, and portability-report.json.`, budget ? 4 : adbtFailure ? 3 : 2);
  }
}

/** The fixture plus the frame its recorded `pull` writes, resolved beside the fixture file. */
function loadPlatformReplay(): { fixture: VegaReplayFixture; screenshot?: Buffer } | null {
  const replayPath = flag("--platform-replay");
  if (!replayPath) return null;
  const path = resolve(replayPath);
  const fixture = JSON.parse(readFileSync(path, "utf8")) as VegaReplayFixture;
  return { fixture, screenshot: fixture.screenshot ? readFileSync(resolve(dirname(path), fixture.screenshot)) : undefined };
}

/**
 * The optional model review of the device frame. Needs a multimodal model, so it requires the
 * Strands executor — the Claude CLI wrapper here only passes text.
 */
function screenshotJudge(out?: string, transcripts = out ? new ModelTranscriptStore(out) : undefined): ScreenshotJudge | undefined {
  if (!args.includes("--evaluate-screenshot")) return undefined;
  const config = selectedExecutorConfig();
  if (config.kind !== "strands") failure("screenshot_review_unavailable", "--evaluate-screenshot needs a multimodal model.", "Add --executor strands --provider bedrock, or drop --evaluate-screenshot and keep the deterministic pixel gate.");
  return createScreenshotJudge(config.model, transcripts);
}

/** The device session the build, launch, and test phases share. */
function openDeviceSession(out: string, appDir: string, preserveArtifacts = false) {
  const replay = loadPlatformReplay();
  const previous = loadVegaResult(join(out, "vega-platform-result.json"));
  return startDeviceRun({
    adapter: replay ? new VegaReplayAdapter(replay.fixture.turns, replay.screenshot) : new VegaAdapter(undefined, join(appDir, "apps", "vega")),
    outDir: out,
    evidenceMode: replay ? "replay" : "live",
    packagePath: replay?.fixture.packagePath ?? previous?.packagePath,
    appId: replay?.fixture.appId ?? previous?.appId,
    preserveArtifacts,
  });
}

function writeCumulativeDeviceResult(device: ReturnType<typeof startDeviceRun>, out: string, evidenceMode: "live" | "replay"): void {
  const path = join(out, "vega-platform-result.json");
  const previous = loadVegaResult(path);
  const current = writeDeviceResult(device, evidenceMode);
  writeFileSync(path, JSON.stringify(mergeVegaResults(previous, current), null, 2));
}

/** The whole lifecycle in one call, for the vega-run command. */
function runLifecycle(out: string, appDir: string, liveAdapter?: VegaAdapter) {
  const vegaDir = join(appDir, "apps", "vega");
  const replay = loadPlatformReplay();
  return runVegaLifecycle({
    adapter: replay ? new VegaReplayAdapter(replay.fixture.turns, replay.screenshot) : liveAdapter ?? new VegaAdapter(undefined, vegaDir),
    appDir: vegaDir,
    focusDir: appDir,
    outDir: out,
    evidenceMode: replay ? "replay" : "live",
    packagePath: replay?.fixture.packagePath,
    appId: replay?.fixture.appId,
    judge: screenshotJudge(out),
  });
}

/**
 * The Bee pipeline, in two halves with a human in between.
 *
 *   bee-run <app> --propose        the conversation becomes a reviewable spec; no code written
 *   bee-run <app> --apply --yes    the approved spec becomes code, then builds and launches
 *
 * Both halves share a --run-id, so --apply continues in the guarded copy --propose created.
 */
async function beeRunCommand(): Promise<void> {
  const sourcePath = args[1];
  if (!sourcePath) failure("missing_source", "A source app path is required.", "Run workshop-harness bee-run <app> --propose.");
  const proposing = args.includes("--propose");
  const applying = args.includes("--apply");
  if (proposing === applying) failure("bee_mode_required", "Choose one half of the Bee run.", "Use --propose to extract a spec, then --apply --yes to implement it.");
  if (applying && !args.includes("--yes")) failure("confirmation_required", "Applying a conversation to your app requires explicit confirmation.", "Read BEE_SPEC.md, then rerun with --apply --yes.");

  const runId = flag("--run-id") ?? "bee";
  const out = join(root, runId);
  const appDir = join(out, "app");
  const statusPath = join(out, "status.json");
  mkdirSync(out, { recursive: true });
  try {
    if (!existsSync(appDir)) copySource(sourcePath, appDir);
    // An unapproved spec is not a thing to build from: --apply reads what --propose wrote and
    // validates it before a single file changes.
    const spec = applying ? loadBeeSpec(appDir) : null;
    if (applying && !spec) failure("bee_spec_missing", `No approved ${BEE_SPEC_MD} in ${appDir}.`, "Run bee-run <app> --propose first, read the spec, then rerun with --apply --yes.");

    const replayPath = flag("--replay");
    const executorConfig = selectedExecutorConfig();
    const transcripts = new ModelTranscriptStore(out);
    const executor = createPortExecutor({ appDir, outDir: out, replayPath, config: executorConfig, recordingName: "bee-recording.json", transcripts });
    // Live: hand the Bee client to the agent and let Strands discover its tools. Replay: the
    // recorded conversation context is injected as prompt text instead.
    const liveBee = !replayPath && executorConfig.kind === "strands" && proposing;
    const beeClient = liveBee ? createBeeMcpClient() : undefined;
    const recordedBee = beeClient ? undefined : beeReplayPath(replayPath);
    const plan = beePhases(spec, appDir);
    const phaseNamesForRun = proposing ? [BEE_SPEC_PHASE] : plan.map((phase) => phase.name).filter((name) => name !== BEE_SPEC_PHASE);
    const device = applying ? openDeviceSession(out, appDir) : undefined;

    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: phaseNamesForRun[0], phasesComplete: completedPhases(statusPath), modelLogsDir: transcripts.directory }, null, 2));
    const result = await runPortPipeline({
      appDir, outDir: out, findings: [], projectContext: beeContext(recordedBee), seed: flag("--seed") ?? "workshop-v1",
      maxCostUsd: Number(flag("--max-cost") ?? 3), plan, phaseNames: phaseNamesForRun,
      executor, device, judge: screenshotJudge(out, transcripts), transcripts,
      mcpClients: beeClient ? { [BEE_SERVER]: beeClient } : undefined,
      onPhase: (currentPhase) => writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase, phasesComplete: completedPhases(statusPath), modelLogsDir: transcripts.directory }, null, 2)),
      // Provenance without a transcript: what was consulted, and a hash proving it was not edited.
      // Live provenance is reconstructed from the agent's Bee tool calls; on the recorded path it
      // comes from the fixture's verified hash, so both halves leave the same evidence behind.
      onMessages: (phase, messages) => {
        if (phase !== BEE_SPEC_PHASE) return;
        const provenance = beeClient ? extractBeeProvenance(messages) : recordedBee ? recordedBeeProvenance(loadRecordedBeeContext(recordedBee)) : undefined;
        if (provenance) writeFileSync(join(out, "bee-context.json"), JSON.stringify(provenance, null, 2));
      },
    });
    writeFileSync(join(out, "bee-result.json"), JSON.stringify({ schemaVersion: 1, ...result }, null, 2));
    if (device) writeDeviceResult(device, loadPlatformReplay() ? "replay" : "live");

    // The review document is rendered by the harness from the validated spec, so the prose a
    // human approves can never disagree with the requests the apply phase will implement.
    if (proposing) {
      const written = loadBeeSpec(appDir);
      if (written) {
        writeFileSync(join(appDir, BEE_SPEC_MD), renderBeeSpec(written));
        // Committed, not left untracked: it is the artifact you approve, and the apply phase's
        // first reset would otherwise clean it away.
        commitAll(appDir, "workshop(bee_spec): render the spec for review");
      }
    }

    const phasesComplete = [...new Set([...completedPhases(statusPath), ...result.phases.map((phase) => phase.name)])];
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "complete", currentPhase: null, phasesComplete, costUsd: result.costUsd, out, modelLogsDir: transcripts.directory, modelLogs: transcripts.files() }, null, 2));
    json({
      event: proposing ? "bee_spec_ready" : "bee_apply_complete",
      runId, state: "complete", out, costUsd: result.costUsd, phasesComplete, modelLogsDir: transcripts.directory, modelLogs: transcripts.files(),
      review: proposing ? join(appDir, BEE_SPEC_MD) : undefined,
      next: proposing ? `Read ${join(appDir, BEE_SPEC_MD)}, then rerun with --apply --yes` : undefined,
    });
  } catch (error) {
    if (error instanceof CliFailure) throw error;
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "failed", error: String(error), modelLogsDir: join(out, "model-logs") }, null, 2));
    failure("bee_run_failed", String(error), `Inspect ${out} and the spec in ${appDir}.`, 2);
  }
}

function beeReplayPath(replayPath?: string): string | undefined {
  const path = flag("--bee-replay") ?? (replayPath ? join(dirname(resolve(replayPath)), "bee-conversation.json") : undefined);
  return path && existsSync(path) ? path : undefined;
}

/**
 * The recorded conversation, injected as prompt text when no live Bee client is available. Loading
 * verifies the fixture's hash, so an edited transcript stops the run instead of reaching the model.
 */
function beeContext(path?: string): string {
  if (!path) return "## Conversation context\n\nNo recorded conversation. Use the Bee tools to find it.";
  const recorded = loadRecordedBeeContext(path);
  const conversations = recorded.conversations.map((conversation) => `### ${conversation.id} (${conversation.recordedAt})\n${conversation.transcript.join("\n")}`);
  return `## Conversation context (recorded)\n\nQuery: ${recorded.query}\n\n${conversations.join("\n\n")}`;
}

function statusCommand(): void {
  const runId = args[1];
  const path = runId && join(root, runId, "status.json");
  if (!path || !existsSync(path)) failure("run_not_found", `Run ${runId ?? ""} was not found.`, "Use the runId returned by run --detach.");
  process.stdout.write(`${readFileSync(path, "utf8").trim()}\n`);
}

function logsCommand(): void {
  const runId = args[1];
  const out = runId && join(root, runId);
  if (!out || !existsSync(out)) failure("run_not_found", `Run ${runId ?? ""} was not found.`, "Check status with the runId first.");
  const phase = flag("--phase");
  const transcripts = new ModelTranscriptStore(out);
  const path = phase ? transcripts.pathFor(phase) : join(out, "run.log");
  if (!existsSync(path)) {
    const available = transcripts.files().map((file) => file.split("/").at(-1)?.replace(/\.jsonl$/, "")).filter(Boolean);
    failure(
      "log_not_found",
      phase ? `No model transcript exists for phase ${phase}.` : "The detached run log was not found.",
      available.length ? `Use logs ${runId} --phase <name>. Available phases: ${available.join(", ")}.` : "Start the run, then check status with the runId.",
    );
  }
  let contents = readFileSync(path);
  process.stdout.write(contents);
  if (!args.includes("--follow")) return;
  let offset = contents.length;
  watchFile(path, { interval: 250 }, () => {
    contents = readFileSync(path);
    if (contents.length < offset) offset = 0;
    if (contents.length > offset) process.stdout.write(contents.subarray(offset));
    offset = contents.length;
  });
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
  const liveAdapter = new VegaAdapter(undefined, vegaDir);
  const capabilities: Array<{ capability: VegaCapability; values?: string[] }> = [
    { capability: "sdk_version" }, { capability: "device_status" }, { capability: "build" },
    { capability: "install", values: ["<build/*.vpkg>"] }, { capability: "launch", values: ["<component-id>"] },
    { capability: "capture", values: [VEGA_SCREENSHOT_REMOTE] },
    { capability: "pull", values: [VEGA_SCREENSHOT_REMOTE, `<run>/${VEGA_LAUNCH_FRAME}`] },
    { capability: "logs" },
    { capability: "capture", values: [VEGA_SCREENSHOT_REMOTE] },
    { capability: "pull", values: [VEGA_SCREENSHOT_REMOTE, `<run>/${VEGA_POSTLAUNCH_FRAME}`] },
  ];
  if (args.includes("--plan")) return json({ command: "vega_run_plan", runId, appDir, sdkVersion: VEGA_SDK_VERSION, adbtPackage: ADBT_PACKAGE, steps: capabilities.map((step) => ({ capability: step.capability, command: liveAdapter.command(step.capability, ...(step.values ?? [])) })), requiresConfirmation: true });
  if (!args.includes("--yes")) failure("confirmation_required", "Vega execution requires explicit confirmation.", "Show vega-run --plan, then rerun with --yes.");
  const platformResult = await runLifecycle(out, appDir, liveAdapter);
  const state = platformResult.blockers.length === 0 ? "complete" : "failed";
  json({ event: "run_complete", runId, state, platformResult });
  if (state === "failed") process.exitCode = 2;
}

function flag(name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function selectedExecutorConfig() {
  return resolveExecutorConfig({
    executor: flag("--executor"),
    provider: flag("--provider"),
    model: flag("--model"),
    region: flag("--region"),
    inputRate: flag("--input-rate"),
    outputRate: flag("--output-rate"),
  });
}
function executorName(config: ReturnType<typeof selectedExecutorConfig>): string {
  if (flag("--replay")) return "replay";
  return config.kind === "strands" ? `strands:${config.model.provider}/${config.model.modelId}` : `claude-cli:${config.model}`;
}
function humanRunComplete(runId: string, out: string, costUsd: number, phasesComplete: string[], modelLogsDir: string): void {
  process.stdout.write(`Run ${runId} complete.\n`);
  process.stdout.write(`Phases: ${phasesComplete.join(", ")}\n`);
  process.stdout.write(`Cost: $${costUsd.toFixed(4)}\n`);
  process.stdout.write(`Output: ${out}\n`);
  process.stdout.write(`Full model logs: ${modelLogsDir}\n`);
}
function openLogFile(path: string): number { mkdirSync(dirname(path), { recursive: true }); return openSync(path, "a"); }
function help(): void {
  process.stdout.write(`Workshop Harness

Commands:
  doctor                              Check the selected replay or live environment
  naive <app>                         One unverified model call; saves but never applies its patch
  plan <app>                          Audit feasibility and show the six-phase plan
  run <app>                           Run all or selected port phases
  status <runId> | logs <runId>       Inspect a run
  logs <runId> --phase <name>          Read one complete model transcript as JSONL
  tv-check <dir>                      Run the mechanical TV-readiness checks
  vega-run <runId>                    Build/install/launch and retain device evidence
  bee-run <app> --propose|--apply     Optional conversation-to-code pipeline
  inject-build-failure <runId> --yes  Add the deterministic live compiler-repair exercise
  memory show|propose|apply           Review project memory
  context adbt port | context bee     Inspect context providers

Model execution:
  --executor claude-cli                 Local Claude Code (default)
  --executor strands --provider <name>  Strands: bedrock, openai, or openrouter
  --model <id> [--region <aws-region>]  Exact provider model id; region is for Bedrock
  --input-rate N --output-rate N        Required for models absent from the pricing table
  --replay <recording.json>             Key-free recorded model turns
  --adbt-replay <context.json>          Recorded ADBT context
  --adbt-live                           Call pinned ADBT while model output is replayed

Credentials:
  claude-cli uses the Claude Code login; bedrock uses AWS_PROFILE or AWS_ACCESS_KEY_ID;
  openai uses OPENAI_API_KEY; openrouter uses OPENROUTER_API_KEY.
  Keep the same executor/provider/model flags for doctor, plan, and run.

Pipeline:
  --phases analyze,plan                 Run part of the port (default: all six)
  --run-id <id>                         Continue the same guarded app and audit trail
  --seed <value>                        Fixed creative seed (default workshop-v1)
  --max-cost <usd>                      Cumulative run cap, including resumed phases
  --max-attempts N | --until-done       Retry budget per phase (default 2)
  --yes                                 Required confirmation for writes or device work
  --detach                              Run in the background; use status and logs
  --json                                JSON/NDJSON contract (the workshop CLI emits JSON)
  --tui                                 Final-lesson phase dashboard; q exits after review

Device evidence:
  --platform-replay <fixture.json>      Recorded lifecycle; proves control flow, not a device
  --evaluate-screenshot                 Optional Strands multimodal review; pixel gate still runs

Both live executors receive pinned ADBT as MCP. Claude is restricted to read/search plus the
named ADBT MCP tools; only the harness writes validated patches.
Every phase appends complete requests, native model events, tool traffic, results, and checks
to out/<runId>/model-logs/<phase>.jsonl. Add --follow or use tail -f with jq.
Add --tui for the final-lesson phase dashboard. Use up/down to select a phase, Tab to switch
between checks/model/tools/all, f to follow the active phase, and q to close after completion.
The dashboard is a filtered view; it never shortens the canonical logs.
Strands providers: bedrock, openai, openrouter
`);
}

main().catch((error) => { if (!(error instanceof CliFailure)) failure("unexpected_error", error instanceof Error ? error.message : String(error), "Read the workshop troubleshooting guide.", 3); });
