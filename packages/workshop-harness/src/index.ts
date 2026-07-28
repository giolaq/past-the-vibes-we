#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, watchFile, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { auditSource, summarize } from "./portability-audit.js";
import { FEASIBILITY_PHASE, loadFeasibilityResult, runFeasibility, type FeasibilityResult } from "./feasibility.js";
import { ADBT_PORT_WORKFLOWS, AdbtMcpContextProvider, AdbtContextError, AdbtReplayContextProvider, createAdbtCliMcpServer, createAdbtMcpClient, type AdbtContextProvider } from "./context-providers/adbt.js";
import { BEE_SERVER, BeeContextProvider, createBeeMcpClient, extractBeeProvenance, loadRecordedBeeContext, recordedBeeProvenance } from "./context-providers/bee.js";
import { BEE_APPLY_PHASE, BEE_SPEC_PHASE, beePhases } from "./bee-pipeline.js";
import { BEE_SPEC_MD, loadBeeSpec, renderBeeSpec } from "./bee-spec.js";
import { CliFailure, failure, json } from "./output.js";
import { applyProposal, loadMemory, loadSnapshot, propose } from "./project-memory.js";
import { addModelUsage, EMPTY_MODEL_USAGE, mergeProviderCostSource, modelUsage, type ModelTelemetry, type ModelUsage, type ProviderCostSource } from "./model-telemetry.js";
import { ModelTranscriptStore } from "./model-transcript.js";
import { createPortExecutor, PortExecutorError, resolveExecutorConfig } from "./port-executor.js";
import { PORT_PLAN_APPROVAL_PATH, PORT_PLAN_PATH, PortPlanApprovalError, approvePortPlan, assertPortPlanApproved } from "./port-plan.js";
import { ADBT_SERVER, PortTokenBudgetError, commitAll, phases, runPortPipeline, type PortResult } from "./port-pipeline.js";
import { tvReadyChecks, verifyPort } from "./port-verification.js";
import { ADBT_PACKAGE, VEGA_SDK_VERSION, VegaAdapter, VegaReplayAdapter, runVegaLifecycle, startDeviceRun, writeDeviceResult, type VegaCapability, type VegaReplayFixture } from "./platform/vega.js";
import { WORKSHOP_BRIEF, copySource, discoverSource, loadWorkshopBrief, sourceFingerprint } from "./source-app.js";
import { claudeModelAvailability, workshopDoctor } from "./workshop-doctor.js";
import { loadPortResult, loadRunTelemetry, loadVegaResult, mergePortResults, mergeVegaResults, type RunTelemetry } from "./run-state.js";
import { shouldUseTui, WorkshopTui } from "./tui.js";
import { runNaiveProbe } from "./naive-probe.js";
import { injectBuildFailure } from "./workshop-failure.js";
import { loadExecutorInput, retryAttemptOverride, turnLimitOverride } from "./workshop-config.js";

const args = process.argv.slice(2);
const command = args[0];
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const root = resolve(process.env.WORKSHOP_OUT ?? join(repositoryRoot, "out"));

async function main(): Promise<void> {
  if (!command || args.includes("--help") || command === "help") return help();
  const obsolete = ["--max-cost", "--input-rate", "--output-rate"].find((option) => args.includes(option));
  if (obsolete) failure("unsupported_option", `${obsolete} is no longer used.`, "Use --max-tokens for cumulative model usage. Provider-reported cost remains informational.");
  if (command === "doctor") return doctor();
  if (command === "naive") return naiveCommand();
  if (command === "plan") return planCommand();
  if (command === "approve-plan") return approvePlanCommand();
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
  if (!sourcePath) failure("missing_app", "App directory is required.", "Run naive <app> --yes after you configure workshop.config.json.");
  if (!args.includes("--yes")) failure("confirmation_required", "The one-shot probe calls the selected model.", "Show the command and token limit, then rerun with --yes.");
  const runId = flag("--run-id") ?? "naive-demo";
  const out = join(root, runId);
  if (existsSync(out)) failure("run_exists", `Run ${runId} already exists.`, "Choose a different --run-id so the comparison starts clean.");
  const appDir = join(out, "app");
  mkdirSync(out, { recursive: true });
  copySource(sourcePath, appDir);
  const config = selectedExecutorConfig();
  const transcripts = new ModelTranscriptStore(out);
  const executor = createPortExecutor({ appDir, outDir: out, config, transcripts, recordingName: "naive-recording.json" });
  const maxTokens = tokenLimit();
  const maxTurns = turnLimitOverride(args);
  const result = await runNaiveProbe(executor, maxTokens, maxTurns);
  if (maxTokens !== undefined && result.usage.totalTokens > maxTokens) {
    failure("token_limit_exceeded", `Model used ${result.usage.totalTokens} tokens, exceeding the ${maxTokens} token limit.`, "Choose a larger --max-tokens value before making another live call.", 4);
  }
  writeFileSync(join(out, "naive-proposal.json"), JSON.stringify({ schemaVersion: 1, ...result.proposal }, null, 2));
  const report = { schemaVersion: 1, runId, executor: executorName(config), maxTokens, maxTurns, usage: result.usage, providerReportedCostUsd: result.providerReportedCostUsd, providerReportedCostSource: result.providerReportedCostSource, requestedModel: result.requestedModel, actualModels: result.actualModels, proposedFiles: Object.keys(result.proposal.files).sort(), coverage: result.coverage, missingProof: result.missingProof };
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
  requirePortPlanApproval(appDir, runId);
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

async function buildPlan(sourcePath: string, outDir: string, transcripts?: ModelTranscriptStore, priorTokens = 0) {
  const source = discoverSource(sourcePath);
  const brief = loadWorkshopBrief(sourcePath);
  const findings = auditSource(source);
  const executorConfig = selectedExecutorConfig();
  const maxTokens = tokenLimit();
  const maxTurns = turnLimitOverride(args);
  const remainingTokens = maxTokens === undefined ? undefined : maxTokens - priorTokens;
  const cachedFeasibility = loadFeasibilityResult(join(outDir, "feasibility-report.json"));
  let feasibility = cachedFeasibility;
  let fallbackAdbtMode: "live" | "replay" | undefined;
  if (!feasibility) {
    if (remainingTokens !== undefined && remainingTokens <= 0) {
      throw new PortTokenBudgetError(`Run has already reached the ${maxTokens} token limit`);
    }

    // The audit interrogates ADBT and a bounded model to judge whether the port is possible
    // before the port phases use their token allowance. Live calls the model + ADBT MCP; replay reads fixtures.
    // It reads a disposable copy, so even a broken CLI cannot touch the attendee's source.
    const adbt = await resolveAdbtProvider(source.source).load();
    fallbackAdbtMode = adbt.mode;
    const feasibilityReplay = feasibilityReplayPath();
    const liveMcp = !feasibilityReplay;
    const feasibilityDir = mkdtempSync(join(tmpdir(), "workshop-feasibility-"));
    copySource(source.source, feasibilityDir);
    const feasibilityMcp = liveMcp && executorConfig.kind === "strands" ? createAdbtMcpClient({ cwd: feasibilityDir }) : undefined;
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
        maxTokens: remainingTokens,
        maxTurns,
        workshopBrief: brief.content,
      });
    } finally {
      await feasibilityMcp?.disconnect();
      rmSync(feasibilityDir, { recursive: true, force: true });
    }
    if (remainingTokens !== undefined && feasibility.usage.totalTokens > remainingTokens) {
      throw new PortTokenBudgetError(`Model used ${feasibility.usage.totalTokens} tokens with only ${remainingTokens} tokens remaining`);
    }
  }

  return {
    source,
    sourceFingerprint: sourceFingerprint(sourcePath),
    workshopBrief: { path: WORKSHOP_BRIEF, sha256: brief.sha256, content: brief.content },
    target: { platform: "firetv-vega", sdk: VEGA_SDK_VERSION },
    seed: flag("--seed") ?? "workshop-v1",
    maxTokens,
    maxTurns,
    executor: executorConfig,
    summary: summarize(findings),
    findings,
    feasibility,
    feasibilityReused: Boolean(cachedFeasibility),
    phaseContext: `## Workshop Brief\n\n${brief.content}`,
    adbt: {
      package: ADBT_PACKAGE,
      mode: feasibility.adbt?.mode ?? fallbackAdbtMode ?? "replay",
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
  if (!sourcePath) failure("missing_source", "A source app path is required.", "Run workshop-harness plan <app> --json.");
  const scratch = mkdtempSync(join(tmpdir(), "workshop-plan-"));
  try {
    const plan = await buildPlan(sourcePath, scratch);
    json({ command: "plan", plan });
    guardFeasibility(plan.feasibility);
  }
  catch (error) {
    if (error instanceof AdbtContextError) return failure("adbt_unavailable", String(error), "Run doctor once or use the recorded ADBT replay context.", 3);
    if (error instanceof PortTokenBudgetError) return failure("token_limit_exceeded", String(error), "Choose a larger --max-tokens value before making another live call.", 4);
    if (error instanceof CliFailure) throw error;
    failure("invalid_source", String(error), "Provide a React Native project containing package.json.");
  }
}

function approvePlanCommand(): void {
  const runId = args[1];
  if (!runId) failure("missing_run", "Run id is required.", "Run approve-plan <runId> --yes after the plan phase.");
  if (!args.includes("--yes")) failure("confirmation_required", "Plan approval requires an explicit human decision.", `Review out/${runId}/app/${PORT_PLAN_PATH}, then rerun approve-plan ${runId} --yes.`);
  const out = join(root, runId);
  const appDir = join(out, "app");
  const result = loadPortResult(join(out, "port-result.json"));
  if (!result.phases.some((phase) => phase.name === "plan")) {
    failure("plan_not_ready", `Run ${runId} has no completed plan phase.`, `Run the analyze and plan phases before approve-plan ${runId}.`);
  }
  try {
    const approval = approvePortPlan(appDir);
    commitAll(appDir, "workshop(plan): approve the structured port plan");
    const statusPath = join(out, "status.json");
    const status = existsSync(statusPath) ? JSON.parse(readFileSync(statusPath, "utf8")) as Record<string, unknown> : {};
    writeFileSync(statusPath, JSON.stringify({ ...status, schemaVersion: 1, runId, state: "approved", currentPhase: null }, null, 2));
    json({
      command: "approve-plan",
      runId,
      plan: join(appDir, PORT_PLAN_PATH),
      approval: join(appDir, PORT_PLAN_APPROVAL_PATH),
      planSha256: approval.planSha256,
      next: `run <app> --phases port --yes --run-id ${runId}`,
    });
  } catch (error) {
    if (error instanceof PortPlanApprovalError) {
      failure("plan_invalid", error.message, `Fix ${PORT_PLAN_PATH}, rerun the plan phase, and review it again.`);
    }
    throw error;
  }
}

function requirePortPlanApproval(appDir: string, runId: string): void {
  try {
    assertPortPlanApproved(appDir);
  } catch (error) {
    if (error instanceof PortPlanApprovalError) {
      failure(
        "plan_approval_required",
        error.message,
        `Review ${join(appDir, PORT_PLAN_PATH)}, then run approve-plan ${runId} --yes.`,
      );
    }
    throw error;
  }
}

async function runCommand(): Promise<void> {
  const sourcePath = args[1];
  if (!sourcePath) failure("missing_source", "A source app path is required.", "Run workshop-harness run <app> --yes --json.");
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
  const previousPort = reconcilePortTelemetry(loadPortResult(portResultPath), loadRunTelemetry(statusPath));
  let feasibilityTelemetry: ModelTelemetry | undefined;
  let invocationTelemetry = emptyRunTelemetry();
  let maxTokens: number | undefined;
  let maxTurns: number | undefined;
  let tui: WorkshopTui | undefined;
  const completedThisInvocation: string[] = [];
  // Read before the first status write: a resumed run must not forget the phases it already did.
  const alreadyComplete = completedPhases(statusPath);
  try {
    assertRunSourceUnchanged(sourcePath, out);
    const selected = phases(phaseNames());
    const executorConfig = selectedExecutorConfig();
    maxTokens = tokenLimit();
    maxTurns = turnLimitOverride(args);
    tui = shouldUseTui(args) ? new WorkshopTui({
      runId,
      executor: executorName(executorConfig),
      evidenceMode: flag("--replay") ? "recorded" : "live",
      seed: flag("--seed") ?? "workshop-v1",
      maxTokens,
      phases: [FEASIBILITY_PHASE, ...phases().map((phase) => phase.name)],
    }) : undefined;
    const transcripts = new ModelTranscriptStore(out, tui?.transcript);
    if (tui) transcripts.replayExisting(tui.transcript);
    tui?.start(FEASIBILITY_PHASE);
    for (const phase of alreadyComplete) tui?.phasePassed(phase, "completed in an earlier invocation", 0);
    const plan = await buildPlan(sourcePath, out, transcripts, previousPort.usage.totalTokens);
    feasibilityTelemetry = plan.feasibilityReused ? undefined : plan.feasibility;
    const basePort = plan.feasibilityReused
      ? previousPort
      : mergePortResults(previousPort, portResultFromTelemetry(plan.feasibility));
    if (plan.feasibilityReused) {
      transcripts.append(FEASIBILITY_PHASE, {
        attempt: 0,
        executor: "harness",
        direction: "system",
        kind: "phase_reused",
        payload: { report: join(out, "feasibility-report.json"), summary: plan.feasibility.summary },
      });
    }
    tui?.phasePassed(FEASIBILITY_PHASE, plan.feasibilityReused ? `${plan.feasibility.summary} (reused)` : plan.feasibility.summary);
    tui?.usage(basePort.usage, basePort.providerReportedCostUsd, basePort.providerReportedCostSource);
    if (plan.maxTokens !== undefined && basePort.usage.totalTokens > plan.maxTokens) {
      throw new PortTokenBudgetError(`Run used ${basePort.usage.totalTokens} tokens, exceeding the ${plan.maxTokens} token limit`);
    }
    writeFileSync(join(out, "feasibility-report.json"), JSON.stringify({ schemaVersion: 1, ...plan.feasibility }, null, 2));
    guardFeasibility(plan.feasibility);
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "running", currentPhase: selected[0].name, phasesComplete: alreadyComplete, ...telemetryFields(basePort, plan.maxTokens, plan.maxTurns), modelLogsDir: join(out, "model-logs") }, null, 2));
    const appDir = join(out, "app");
    // Resuming: `run --run-id <id> --phases build_test` continues in the guarded copy that
    // earlier phases already built and committed, so the source is copied only once per run id.
    const resuming = existsSync(appDir);
    if (!resuming) {
      copySource(sourcePath, appDir);
      // Approval belongs to this run, not to a file that happened to exist in the source app.
      rmSync(join(appDir, PORT_PLAN_APPROVAL_PATH), { force: true });
    }
    writeFileSync(join(out, "portability-report.json"), JSON.stringify({ schemaVersion: 1, ...plan }, null, 2));
    writeFileSync(join(out, "run-spec.json"), JSON.stringify({
      schemaVersion: 1,
      runId,
      source: {
        original: plan.source.source,
        guarded: appDir,
        fingerprint: plan.sourceFingerprint,
        brief: plan.workshopBrief,
      },
      target: plan.target,
      phases: plan.phases,
      seed: plan.seed,
      maxTokens: plan.maxTokens,
      maxTurns: plan.maxTurns,
      executor: plan.executor,
    }, null, 2));
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
    // No CLI override leaves each phase's declared retry limit intact.
    const maxAttempts = retryAttemptOverride(args);
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
      ...telemetryFields(mergePortResults(basePort, portResultFromRunTelemetry(invocationTelemetry)), plan.maxTokens, plan.maxTurns),
      modelLogsDir: transcripts.directory,
    }, null, 2));
    const invocation = await runPortPipeline({
      appDir,
      outDir: out,
      findings: plan.findings,
      projectContext: plan.phaseContext,
      briefSha256: plan.workshopBrief.sha256,
      seed: plan.seed,
      maxTokens: plan.maxTokens === undefined ? undefined : plan.maxTokens - basePort.usage.totalTokens,
      maxTurns: plan.maxTurns,
      maxAttempts,
      phaseNames: phaseNames(),
      executor,
      device,
      adbt,
      mcpClients,
      liveMcp: liveModel ? [ADBT_SERVER] : [],
      transcripts,
      beforePhase: (phase) => {
        if (["port", "build", "launch", "test"].includes(phase.name)) assertPortPlanApproved(appDir);
      },
      onPhase: (currentPhase) => {
        activePhase = currentPhase;
        tui?.phaseStart(currentPhase);
        writeRunningStatus();
      },
      onPhaseComplete: (phase, snapshot) => {
        tui?.phaseComplete(phase);
        completedThisInvocation.push(phase.name);
        const checkpoint = mergePortResults(basePort, snapshot);
        writeFileSync(portResultPath, JSON.stringify({ schemaVersion: 1, ...checkpoint }, null, 2));
        writeRunningStatus();
      },
      onUsage: (telemetry) => {
        invocationTelemetry = telemetry;
        const cumulative = mergePortResults(basePort, portResultFromRunTelemetry(telemetry));
        tui?.usage(cumulative.usage, cumulative.providerReportedCostUsd, cumulative.providerReportedCostSource);
        writeRunningStatus();
      },
      onNotice: tui?.notice,
    });
    const port = mergePortResults(basePort, invocation);
    writeFileSync(portResultPath, JSON.stringify({ schemaVersion: 1, ...port }, null, 2));
    if (device) writeCumulativeDeviceResult(device, out, loadPlatformReplay() ? "replay" : "live");

    const executionMode = replayPath ? "Replay (recorded model turns)" : plan.executor.kind === "strands" ? `Strands (${plan.executor.model.provider}:${plan.executor.model.modelId})` : `Claude Code (${plan.executor.model})`;
    const evidenceMode = replayPath ? "replay" : "live model";
    // A resumed run reports every phase this run id has completed, not only this invocation's.
    const phasesComplete = [...new Set([...alreadyComplete, ...port.phases.map((phase) => phase.name)])];
    let planApproved = false;
    if (phasesComplete.includes("plan")) {
      try { assertPortPlanApproved(appDir); planApproved = true; } catch (error) {
        if (!(error instanceof PortPlanApprovalError)) throw error;
      }
    }
    const finalState = phasesComplete.includes("plan") && !planApproved ? "awaiting_approval" : "complete";
    const next = finalState === "awaiting_approval"
      ? `Review ${join(appDir, PORT_PLAN_PATH)}, then run approve-plan ${runId} --yes.`
      : "Inspect the generated app. Only a Vega result marked evidenceMode: live proves build or device behavior.";
    const report = [
      `# Workshop Run ${runId}`,
      "",
      `- Target: Vega SDK ${VEGA_SDK_VERSION}`,
      `- Product input: source app and ${WORKSHOP_BRIEF}`,
      `- Source fingerprint: ${plan.sourceFingerprint}`,
      `- Workshop brief hash: ${plan.workshopBrief.sha256}`,
      `- Structured plan approval: ${planApproved ? "approved" : "required"}`,
      `- Evidence mode: ${evidenceMode}`,
      `- ADBT package: ${ADBT_PACKAGE}`,
      "- ADBT access: MCP for both Strands and Claude Code live executors",
      `- ADBT port context: ${port.adbt?.mode ?? "missing"} (${port.adbt?.documents.join(", ") ?? "none"})`,
      `- ADBT evidence: ${port.adbt?.evidence ?? "none"}`,
      `- Executor: ${executionMode}`,
      `- Requested model(s): ${port.requestedModels.join(", ") || "not recorded"}`,
      `- Actual model(s): ${port.actualModels.join(", ") || "not recorded"}`,
      `- Seed: ${plan.seed}`,
      `- Cumulative token limit: ${plan.maxTokens ?? "none"}`,
      `- Per-call turn limit: ${plan.maxTurns ?? "none"}`,
      `- Model usage: ${formatUsage(port.usage)}`,
      ...(port.providerReportedCostUsd === undefined ? [] : [`- ${costLabel(port.providerReportedCostSource)}: $${port.providerReportedCostUsd.toFixed(4)}`]),
      `- Model transcripts: ${transcripts.directory}`,
      `- Transcript files: ${transcripts.files().join(", ") || "none"}`,
      `- Guarded source initialized this invocation: ${resuming ? "no" : "yes"}`,
      `- Port phases: ${port.phases.map((phase) => `${phase.name} (${phase.attempts} attempt${phase.attempts === 1 ? "" : "s"})`).join(", ")}`,
      `- Next: ${next}`,
      "",
    ].join("\n");
    writeFileSync(join(out, "report.md"), report);
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: finalState, currentPhase: null, phasesComplete, ...telemetryFields(port, plan.maxTokens, plan.maxTurns), out, modelLogsDir: transcripts.directory, modelLogs: transcripts.files(), next }, null, 2));
    tui?.usage(port.usage, port.providerReportedCostUsd, port.providerReportedCostSource);
    await tui?.complete(finalState === "awaiting_approval"
      ? "Plan approval required. Review the plan after closing this dashboard with q."
      : undefined);
    if (tui) {
      humanRunComplete(runId, out, port, phasesComplete, transcripts.directory);
    } else {
      json({ event: "run_complete", runId, state: finalState, out, seed: plan.seed, ...telemetryFields(port, plan.maxTokens, plan.maxTurns), phasesComplete, modelLogsDir: transcripts.directory, modelLogs: transcripts.files(), next });
    }
  } catch (error) {
    tui?.fail(error instanceof Error ? error.message : String(error));
    tui?.finish();
    if (error instanceof CliFailure) throw error;
    const failedCall = error instanceof PortExecutorError ? portResultFromTelemetry(error.telemetry) : emptyPortResult();
    const cumulative = mergePortResults(
      previousPort,
      mergePortResults(
        feasibilityTelemetry ? portResultFromTelemetry(feasibilityTelemetry) : emptyPortResult(),
        mergePortResults(portResultFromRunTelemetry(invocationTelemetry), failedCall),
      ),
    );
    const tokenLimitReached = error instanceof PortTokenBudgetError;
    const adbtFailure = error instanceof AdbtContextError;
    const approvalRequired = error instanceof PortPlanApprovalError;
    writeFileSync(statusPath, JSON.stringify({
      schemaVersion: 1,
      runId,
      state: approvalRequired ? "awaiting_approval" : tokenLimitReached ? "aborted" : "failed",
      reason: tokenLimitReached ? "token_limit" : undefined,
      phasesComplete: [...new Set([...alreadyComplete, ...completedThisInvocation])],
      ...telemetryFields(cumulative, maxTokens, maxTurns),
      modelLogsDir: join(out, "model-logs"),
      error: String(error),
    }, null, 2));
    failure(
      approvalRequired ? "plan_approval_required" : tokenLimitReached ? "token_limit_exceeded" : adbtFailure ? "adbt_unavailable" : "run_failed",
      String(error),
      approvalRequired
        ? `Review ${out}/app/${PORT_PLAN_PATH}, then run approve-plan ${runId} --yes.`
        : adbtFailure
          ? "Run doctor once or use the recorded ADBT replay context."
          : `Inspect ${out}/run.log, model-logs/, and portability-report.json.`,
      approvalRequired ? 1 : tokenLimitReached ? 4 : adbtFailure ? 3 : 2,
    );
  }
}

function assertRunSourceUnchanged(sourcePath: string, out: string): void {
  const specPath = join(out, "run-spec.json");
  if (!existsSync(specPath)) return;
  try {
    const spec = JSON.parse(readFileSync(specPath, "utf8")) as { source?: { fingerprint?: string } };
    const expected = spec.source?.fingerprint;
    if (!expected) throw new Error("source fingerprint is missing");
    if (sourceFingerprint(sourcePath) !== expected) {
      failure(
        "source_changed",
        "The source app or workshop-brief.md changed after this run started.",
        "Start a new run ID so the plan, approval, and guarded app use one product input.",
      );
    }
  } catch (error) {
    if (error instanceof CliFailure) throw error;
    failure("invalid_run_spec", `Cannot read ${specPath}: ${String(error)}`, "Start a new run ID.");
  }
}

/** Load the recorded device lifecycle used by the key-free path. */
function loadPlatformReplay(): { fixture: VegaReplayFixture } | null {
  const replayPath = flag("--platform-replay");
  if (!replayPath) return null;
  const path = resolve(replayPath);
  const fixture = JSON.parse(readFileSync(path, "utf8")) as VegaReplayFixture;
  return { fixture };
}

/** The device session the build, launch, and test phases share. */
function openDeviceSession(out: string, appDir: string, preserveArtifacts = false) {
  const replay = loadPlatformReplay();
  const previous = loadVegaResult(join(out, "vega-platform-result.json"));
  return startDeviceRun({
    adapter: replay ? new VegaReplayAdapter(replay.fixture.turns) : new VegaAdapter(undefined, join(appDir, "apps", "vega")),
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
    adapter: replay ? new VegaReplayAdapter(replay.fixture.turns) : liveAdapter ?? new VegaAdapter(undefined, vegaDir),
    appDir: vegaDir,
    focusDir: appDir,
    outDir: out,
    evidenceMode: replay ? "replay" : "live",
    packagePath: replay?.fixture.packagePath,
    appId: replay?.fixture.appId,
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
  const resultPath = join(out, "bee-result.json");
  mkdirSync(out, { recursive: true });
  const previousPort = reconcilePortTelemetry(loadPortResult(resultPath), loadRunTelemetry(statusPath));
  let invocationTelemetry = emptyRunTelemetry();
  let maxTokens: number | undefined;
  let maxTurns: number | undefined;
  try {
    if (!existsSync(appDir)) copySource(sourcePath, appDir);
    // An unapproved spec is not a thing to build from: --apply reads what --propose wrote and
    // validates it before a single file changes.
    const spec = applying ? loadBeeSpec(appDir) : null;
    if (applying && !spec) failure("bee_spec_missing", `No approved ${BEE_SPEC_MD} in ${appDir}.`, "Run bee-run <app> --propose first, read the spec, then rerun with --apply --yes.");

    const replayPath = flag("--replay");
    const executorConfig = selectedExecutorConfig();
    maxTokens = tokenLimit();
    maxTurns = turnLimitOverride(args);
    if (maxTokens !== undefined && previousPort.usage.totalTokens >= maxTokens) {
      throw new PortTokenBudgetError(`Run has already used ${previousPort.usage.totalTokens} tokens, reaching the ${maxTokens} token limit`);
    }
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
    let activePhase = phaseNamesForRun[0];
    const writeBeeStatus = () => writeFileSync(statusPath, JSON.stringify({
      schemaVersion: 1,
      runId,
      state: "running",
      currentPhase: activePhase,
      phasesComplete: completedPhases(statusPath),
      ...telemetryFields(mergePortResults(previousPort, portResultFromRunTelemetry(invocationTelemetry)), maxTokens, maxTurns),
      modelLogsDir: transcripts.directory,
    }, null, 2));

    writeBeeStatus();
    const invocation = await runPortPipeline({
      appDir, outDir: out, findings: [], projectContext: beeContext(recordedBee), seed: flag("--seed") ?? "workshop-v1",
      maxTokens: maxTokens === undefined ? undefined : maxTokens - previousPort.usage.totalTokens,
      maxTurns, plan, phaseNames: phaseNamesForRun,
      executor, device, transcripts,
      mcpClients: beeClient ? { [BEE_SERVER]: beeClient } : undefined,
      onPhase: (currentPhase) => {
        activePhase = currentPhase;
        writeBeeStatus();
      },
      onPhaseComplete: (_phase, snapshot) => {
        writeFileSync(resultPath, JSON.stringify({ schemaVersion: 1, ...mergePortResults(previousPort, snapshot) }, null, 2));
      },
      onUsage: (telemetry) => {
        invocationTelemetry = telemetry;
        writeBeeStatus();
      },
      // Provenance without a transcript: what was consulted, and a hash proving it was not edited.
      // Live provenance is reconstructed from the agent's Bee tool calls; on the recorded path it
      // comes from the fixture's verified hash, so both halves leave the same evidence behind.
      onMessages: (phase, messages) => {
        if (phase !== BEE_SPEC_PHASE) return;
        const provenance = beeClient ? extractBeeProvenance(messages) : recordedBee ? recordedBeeProvenance(loadRecordedBeeContext(recordedBee)) : undefined;
        if (provenance) writeFileSync(join(out, "bee-context.json"), JSON.stringify(provenance, null, 2));
      },
    });
    const result = mergePortResults(previousPort, invocation);
    writeFileSync(resultPath, JSON.stringify({ schemaVersion: 1, ...result }, null, 2));
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
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: "complete", currentPhase: null, phasesComplete, ...telemetryFields(result, maxTokens, maxTurns), out, modelLogsDir: transcripts.directory, modelLogs: transcripts.files() }, null, 2));
    json({
      event: proposing ? "bee_spec_ready" : "bee_apply_complete",
      runId, state: "complete", out, ...telemetryFields(result, maxTokens, maxTurns), phasesComplete, modelLogsDir: transcripts.directory, modelLogs: transcripts.files(),
      review: proposing ? join(appDir, BEE_SPEC_MD) : undefined,
      next: proposing ? `Read ${join(appDir, BEE_SPEC_MD)}, then rerun with --apply --yes` : undefined,
    });
  } catch (error) {
    if (error instanceof CliFailure) throw error;
    const failedCall = error instanceof PortExecutorError ? portResultFromTelemetry(error.telemetry) : emptyPortResult();
    const cumulative = mergePortResults(previousPort, mergePortResults(portResultFromRunTelemetry(invocationTelemetry), failedCall));
    const tokenLimitReached = error instanceof PortTokenBudgetError;
    writeFileSync(statusPath, JSON.stringify({ schemaVersion: 1, runId, state: tokenLimitReached ? "aborted" : "failed", reason: tokenLimitReached ? "token_limit" : undefined, ...telemetryFields(cumulative, maxTokens, maxTurns), error: String(error), modelLogsDir: join(out, "model-logs") }, null, 2));
    failure(tokenLimitReached ? "token_limit_exceeded" : "bee_run_failed", String(error), `Inspect ${out} and the spec in ${appDir}.`, tokenLimitReached ? 4 : 2);
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
  if (!appDir || !existsSync(appDir)) failure("run_not_found", `Run ${runId ?? ""} was not found.`, "Use the run ID returned by the port pipeline.");
  if (!args.includes("--plan")) requirePortPlanApproval(appDir, runId!);
  if (!vegaDir || !existsSync(join(vegaDir, "package.json"))) failure("vega_app_missing", "The guarded run has no apps/vega package.", "Run the verified port pipeline before Vega execution.");
  const liveAdapter = new VegaAdapter(undefined, vegaDir);
  const capabilities: Array<{ capability: VegaCapability; values?: string[] }> = [
    { capability: "sdk_version" }, { capability: "device_status" }, { capability: "vda_start" },
    { capability: "device_status" }, { capability: "dependencies" }, { capability: "build" },
    { capability: "install", values: ["<build/*.vpkg>"] }, { capability: "launch", values: ["<component-id>"] },
    { capability: "app_status", values: ["<component-id>"] },
    { capability: "logs" },
    { capability: "app_status", values: ["<component-id>"] },
  ];
  if (args.includes("--plan")) return json({
    command: "vega_run_plan",
    runId,
    appDir,
    sdkVersion: VEGA_SDK_VERSION,
    adbtPackage: ADBT_PACKAGE,
    steps: capabilities.map((step, index) => ({
      capability: step.capability,
      command: liveAdapter.command(step.capability, ...(step.values ?? [])),
      conditional: index === 2
        ? "when no VDA is attached"
        : index === 3
          ? "after startup, repeated until the device is attached twice or 60 seconds elapse"
          : undefined,
    })),
    requiresConfirmation: true,
  });
  if (!args.includes("--yes")) failure("confirmation_required", "Vega execution requires explicit confirmation.", "Show vega-run --plan, then rerun with --yes.");
  const platformResult = await runLifecycle(out, appDir, liveAdapter);
  const state = platformResult.blockers.length === 0 ? "complete" : "failed";
  json({ event: "run_complete", runId, state, platformResult });
  if (state === "failed") process.exitCode = 2;
}

function flag(name: string): string | undefined { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; }
function selectedExecutorConfig() {
  const config = resolveExecutorConfig(loadExecutorInput(args));
  if (!args.includes("--replay") && config.kind === "claude-cli") {
    const availability = claudeModelAvailability(config.model);
    if (availability?.status === "repair") {
      failure("model_unavailable", availability.detail, availability.hint ?? "Choose an exact Claude model name before running a live model.");
    }
  }
  return config;
}
function executorName(config: ReturnType<typeof selectedExecutorConfig>): string {
  if (flag("--replay")) return "replay";
  return config.kind === "strands" ? `strands:${config.model.provider}/${config.model.modelId}` : `claude-cli:${config.model}`;
}
function tokenLimit(): number | undefined {
  const raw = flag("--max-tokens");
  if (raw === undefined) return undefined;
  return positiveIntegerFlag("--max-tokens", 1);
}
function positiveIntegerFlag(name: string, fallback: number): number {
  const raw = flag(name);
  const value = raw === undefined ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}
function emptyRunTelemetry(): RunTelemetry {
  return { usage: { ...EMPTY_MODEL_USAGE }, requestedModels: [], actualModels: [] };
}
function emptyPortResult(): PortResult {
  return { phases: [], ...emptyRunTelemetry() };
}
function portResultFromTelemetry(telemetry: ModelTelemetry): PortResult {
  return {
    phases: [],
    usage: telemetry.usage,
    providerReportedCostUsd: telemetry.providerReportedCostUsd,
    providerReportedCostSource: telemetry.providerReportedCostSource,
    requestedModels: telemetry.requestedModel ? [telemetry.requestedModel] : [],
    actualModels: telemetry.actualModels,
  };
}
function portResultFromRunTelemetry(telemetry: RunTelemetry): PortResult {
  return { phases: [], ...telemetry };
}
function reconcilePortTelemetry(saved: PortResult, status: RunTelemetry): PortResult {
  return {
    ...saved,
    usage: modelUsage({
      inputTokens: Math.max(saved.usage.inputTokens, status.usage.inputTokens),
      outputTokens: Math.max(saved.usage.outputTokens, status.usage.outputTokens),
      cacheReadInputTokens: Math.max(saved.usage.cacheReadInputTokens, status.usage.cacheReadInputTokens),
      cacheWriteInputTokens: Math.max(saved.usage.cacheWriteInputTokens, status.usage.cacheWriteInputTokens),
      calls: Math.max(saved.usage.calls, status.usage.calls),
      turns: Math.max(saved.usage.turns, status.usage.turns),
    }),
    providerReportedCostUsd: maxOptional(saved.providerReportedCostUsd, status.providerReportedCostUsd),
    providerReportedCostSource: mergeProviderCostSource(saved.providerReportedCostSource, status.providerReportedCostSource),
    requestedModels: [...new Set([...saved.requestedModels, ...status.requestedModels])],
    actualModels: [...new Set([...saved.actualModels, ...status.actualModels])],
  };
}
function maxOptional(left?: number, right?: number): number | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  return Math.max(left, right);
}
function telemetryFields(telemetry: RunTelemetry | PortResult, maxTokens?: number, maxTurns?: number) {
  return {
    usage: telemetry.usage,
    maxTokens,
    maxTurns,
    providerReportedCostUsd: telemetry.providerReportedCostUsd,
    providerReportedCostSource: telemetry.providerReportedCostSource,
    requestedModels: telemetry.requestedModels,
    actualModels: telemetry.actualModels,
  };
}
function costLabel(source?: ProviderCostSource): string {
  if (source === "recorded") return "Recorded provider cost metadata";
  if (source === "mixed") return "Mixed recorded/provider cost metadata";
  return "Provider-reported cost";
}
function formatUsage(usage: ModelUsage): string {
  return `${usage.totalTokens} tokens (${usage.inputTokens} input, ${usage.outputTokens} output, ${usage.cacheReadInputTokens} cache read, ${usage.cacheWriteInputTokens} cache write), ${usage.turns} turns, ${usage.calls} calls`;
}
function humanRunComplete(runId: string, out: string, telemetry: RunTelemetry, phasesComplete: string[], modelLogsDir: string): void {
  process.stdout.write(`Run ${runId} complete.\n`);
  process.stdout.write(`Phases: ${phasesComplete.join(", ")}\n`);
  process.stdout.write(`Usage: ${formatUsage(telemetry.usage)}\n`);
  if (telemetry.providerReportedCostUsd !== undefined) {
    process.stdout.write(`${costLabel(telemetry.providerReportedCostSource)}: $${telemetry.providerReportedCostUsd.toFixed(4)}\n`);
  }
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
  approve-plan <runId> --yes          Approve the structured plan before code phases
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
  workshop.config.json supplies the default executor, provider, model, and region.
  --config <file>                       Use a different configuration file
  --executor claude-cli                 Local Claude Code (default)
  --executor strands --provider <name>  Strands: bedrock, openai, or openrouter
  --model <id> [--region <aws-region>]  Exact provider model id; region is for Bedrock
  --replay <recording.json>             Key-free recorded model turns
  --adbt-replay <context.json>          Recorded ADBT context
  --adbt-live                           Call pinned ADBT while model output is replayed

Credentials:
  claude-cli uses the Claude Code login; bedrock uses AWS_PROFILE or AWS_ACCESS_KEY_ID;
  openai uses OPENAI_API_KEY; openrouter uses OPENROUTER_API_KEY.
  Command-line model flags override workshop.config.json. Credentials stay outside the file.

Pipeline:
  --phases analyze,plan                 Run part of the port (default: all six)
  --run-id <id>                         Continue the same guarded app and audit trail
  --seed <value>                        Fixed creative seed (default workshop-v1)
  --max-tokens <count>                  Optional cumulative token limit (no default limit)
  --max-turns <count>                   Optional per-call turn limit (no default)
  --max-attempts N | --until-done       Override each phase's retry limit
  --yes                                 Required confirmation for writes or device work
  --detach                              Run in the background; use status and logs
  --json                                JSON/NDJSON contract (the workshop CLI emits JSON)
  --tui                                 Interactive phase and message dashboard

Product input:
  The source app and its required workshop-brief.md are the product input.
  The plan phase writes port-plan.json. Port, build, launch, and test require a matching
  port-plan-approval.json created by approve-plan <runId> --yes.

Device evidence:
  --platform-replay <fixture.json>      Recorded lifecycle; proves control flow, not a device

Both live executors receive pinned ADBT as MCP. Claude is restricted to read/search plus the
named ADBT MCP tools; only the harness writes validated patches. Claude model aliases such as
sonnet are rejected: use an exact availableModels name. The CLI retains a $10 emergency ceiling
per Claude subprocess, but dollars are never estimated or used as the workshop control. A cost
is shown only when the provider reports one; replay labels fixture cost as recorded metadata.
Every phase appends complete requests, native model events, tool traffic, results, and checks
to out/<runId>/model-logs/<phase>.jsonl. Add --follow or use tail -f with jq.
Add --tui to each final-lesson run invocation. Use Up/Down and Enter to inspect a phase's
messages, then Escape to return to the phase list. A resumed dashboard loads earlier events.
In the message view, use Up/Down to select an event, PageUp/PageDown to scroll content, and
Tab to switch between checks/model/tools/all. Use f to follow the active phase and q to close
after completion. The dashboard is a filtered view; it never shortens the canonical logs.
Strands providers: bedrock, openai, openrouter
`);
}

main().catch((error) => { if (!(error instanceof CliFailure)) failure("unexpected_error", error instanceof Error ? error.message : String(error), "Read the workshop troubleshooting guide.", 3); });
