import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runProcess, type ProcessResult } from "../process.js";
import { scanDeviceLog } from "./device-log.js";
import {
  focusedTestIdFromPageSource,
  readFocusContract,
  REQUIRED_FOCUS_TRANSITIONS,
  type FocusEvidence,
  type FocusObservation,
} from "./focus.js";

export const VEGA_SDK_VERSION = "0.23.9221";
export const ADBT_PACKAGE = "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5";

export type VegaCapability =
  | "sdk_version"
  | "device_status"
  | "vda_start"
  | "dependencies"
  | "build"
  | "install"
  | "launch"
  | "app_status"
  | "logs"
  | "automation_enable"
  | "page_source"
  | "key_press";
export type VegaStep = { capability: VegaCapability; command: string[]; code: number; stdout: string; stderr: string; timedOut?: boolean };
export type VegaPlatformResult = {
  schemaVersion: 1;
  evidenceMode: "live" | "replay";
  sdkVersion: string;
  adbtPackage: string;
  appId: string;
  packagePath: string;
  /** How long the harness left the app running before it read the log and sampled state again. */
  dwellMs: number;
  steps: VegaStep[];
  checks: { name: string; passed: boolean; evidence: string }[];
  logFiles: string[];
  blockers: string[];
};

export interface VegaCommandAdapter {
  command(capability: VegaCapability, ...values: string[]): string[];
  execute(capability: VegaCapability, ...values: string[]): Promise<ProcessResult>;
}

/**
 * How long a live run leaves the app running before reading the log and sampling state again.
 * A crash on startup needs time to happen and reach the device log.
 */
export const LAUNCH_DWELL_MS = 5_000;
/** The Vega CLI waits this long for a newly started virtual device to become ready. */
export const VDA_START_TIMEOUT_SECONDS = 60;
/** A started VDA can appear briefly before its device connection settles. */
export const VDA_READY_TIMEOUT_MS = 60_000;
export const VDA_READY_POLL_MS = 1_000;
export const VDA_READY_STABLE_CHECKS = 2;
export const FOCUS_POLL_TIMEOUT_MS = 10_000;
export const FOCUS_POLL_INTERVAL_MS = 250;
export const FOCUS_KEY_SETTLE_MS = 350;
export const AUTOMATION_TOOLKIT_TRIGGER = "/tmp/automation-toolkit.enable";
export const AUTOMATION_TOOLKIT_RPC = "http://127.0.0.1:8383/jsonrpc";
const PAGE_SOURCE_REQUEST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getPageSource", params: {} });
const PAGE_SOURCE_SHELL_WORD = PAGE_SOURCE_REQUEST.replace(/[{}"]/g, (character) => "\\".repeat(3) + character);
const PAGE_SOURCE_CAPTURE_CHARS = 1_000_000;
const VEGA_REMOTE_KEYS = new Set(["KEY_UP", "KEY_DOWN", "KEY_LEFT", "KEY_RIGHT", "KEY_ENTER", "KEY_BACK", "KEY_HOMEPAGE"]);

/**
 * Shape of a `--platform-replay` fixture: recorded results for each lifecycle capability.
 */
export type VegaReplayFixture = { packagePath: string; appId: string; turns: Array<{ capability: VegaCapability; result: ProcessResult }> };

export class VegaAdapter implements VegaCommandAdapter {
  constructor(private vega = process.env.VEGA_BIN ?? "vega", private cwd?: string) {}

  command(capability: VegaCapability, ...values: string[]): string[] {
    const value = values[0] ?? "";
    const commands: Record<VegaCapability, string[]> = {
      sdk_version: [this.vega, "--version"],
      device_status: [this.vega, "exec", "vda", "devices", "-l"],
      vda_start: [this.vega, "virtual-device", "start", "--gui", "--timeout", String(VDA_START_TIMEOUT_SECONDS)],
      dependencies: [process.env.NPM_BIN ?? "npm", "install", "--include=dev"],
      build: [process.env.NPM_BIN ?? "npm", "run", "build:debug"],
      install: [this.vega, "device", "install-app", "--packagePath", value],
      launch: [this.vega, "device", "launch-app", "--appName", value],
      app_status: [this.vega, "device", "is-app-running", "--appName", value],
      logs: [
        this.vega, "exec", "vda", "shell", "loggingctl", "log",
        ...(value ? ["-v", value] : []),
        ...(values[1] ? ["-S", values[1]] : []),
        "-o", "short_precise",
      ],
      automation_enable: [this.vega, "exec", "vda", "shell", "touch", AUTOMATION_TOOLKIT_TRIGGER],
      page_source: [
        this.vega, "exec", "vda", "shell", "curl",
        "--silent", "--show-error", "--max-time", "10",
        "--header", "Content-Type:application/json",
        "--data", PAGE_SOURCE_SHELL_WORD,
        AUTOMATION_TOOLKIT_RPC,
      ],
      key_press: [this.vega, "exec", "vda", "shell", "inputd-cli", "button_press", value],
    };
    return commands[capability];
  }

  execute(capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
    const timeout = capability === "build" || capability === "dependencies"
      ? 15 * 60_000
      : capability === "vda_start"
        ? (VDA_START_TIMEOUT_SECONDS + 15) * 1_000
        : 30_000;
    const [command, ...args] = this.command(capability, ...values);
    return runProcess(command, args, timeout, this.cwd, capability === "page_source" ? PAGE_SOURCE_CAPTURE_CHARS : undefined);
  }
}

export class VegaReplayAdapter implements VegaCommandAdapter {
  private index = 0;
  constructor(private turns: Array<{ capability: VegaCapability; result: ProcessResult }>) {}
  command(capability: VegaCapability, ...values: string[]): string[] { return ["replay", capability, ...values]; }
  async execute(capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
    // A fixture records a whole device session. A phase run on its own — `--phases launch` —
    // asks for only part of it, so skip forward past capabilities this run is not exercising.
    // Order within a capability is preserved, which is what lets a recorded rebuild replay.
    while (this.index < this.turns.length && this.turns[this.index].capability !== capability) this.index++;
    const turn = this.turns[this.index++];
    if (!turn) throw new Error(`Vega replay has no turn left for ${capability}`);
    return turn.result;
  }
}

/**
 * One device session, accumulated across stages. The stages are separately callable so a
 * pipeline phase can own one of them — build in one phase, install and launch in the next —
 * and still produce a single evidence file at the end.
 */
export type DeviceRun = {
  adapter: VegaCommandAdapter;
  outDir: string;
  evidenceMode: "live" | "replay";
  dwellMs: number;
  steps: VegaStep[];
  checks: VegaPlatformResult["checks"];
  logFiles: string[];
  blockers: string[];
  packagePath: string;
  appId: string;
  launchStartedAt?: string;
};

/** Clears last run's artifacts. Once per device session, never per stage. */
export function startDeviceRun(options: { adapter: VegaCommandAdapter; outDir: string; evidenceMode: "live" | "replay"; dwellMs?: number; packagePath?: string; appId?: string; preserveArtifacts?: boolean }): DeviceRun {
  mkdirSync(options.outDir, { recursive: true });
  if (!options.preserveArtifacts) {
    rmSync(join(options.outDir, "vega-device.log"), { force: true });
  }
  return {
    adapter: options.adapter,
    outDir: options.outDir,
    evidenceMode: options.evidenceMode,
    // Live runs wait for a crash to happen; replay has no process, so it defaults to no dwell.
    dwellMs: options.dwellMs ?? (options.evidenceMode === "live" ? LAUNCH_DWELL_MS : 0),
    steps: [], checks: [], logFiles: [], blockers: [],
    packagePath: options.packagePath ?? "",
    appId: options.appId ?? "",
  };
}

async function run(device: DeviceRun, capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
  const result = await recordStep(device, capability, ...values);
  // The command's own output is the evidence a retry needs, so keep both streams — a compiler
  // writes most of its diagnostics to stdout.
  if (result.code !== 0) device.blockers.push(`${capability} failed: ${result.timedOut ? "timed out" : failureOutput(result)}`);
  return result;
}

/** Records a recoverable probe without turning its first failure into a phase blocker. */
async function probe(device: DeviceRun, capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
  return recordStep(device, capability, ...values);
}

async function recordStep(device: DeviceRun, capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
  const result = await device.adapter.execute(capability, ...values);
  device.steps.push({ capability, command: device.adapter.command(capability, ...values), code: result.code, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut });
  return result;
}

function failureOutput(result: ProcessResult): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n") || `exit ${result.code}`;
}

export type VdaReadinessOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  stableChecks?: number;
};

/** Pre-flight. A device phase reuses an attached VDA or starts one and waits for stable attachment. */
export async function checkToolchain(device: DeviceRun, requireDevice = true, readiness: VdaReadinessOptions = {}): Promise<void> {
  const sdk = await run(device, "sdk_version");
  if (sdk.code === 0 && !`${sdk.stdout}\n${sdk.stderr}`.includes(VEGA_SDK_VERSION)) {
    device.blockers.push(`sdk_version mismatch: expected ${VEGA_SDK_VERSION}`);
  }
  if (!requireDevice || device.blockers.length) return;
  const existing = await probe(device, "device_status");
  if (existing.code === 0 && hasAttachedDevice(existing.stdout)) return;
  const started = await run(device, "vda_start");
  if (started.code !== 0) return;
  await waitForStableDevice(device, readiness);
}

async function waitForStableDevice(device: DeviceRun, options: VdaReadinessOptions): Promise<void> {
  const timeoutMs = options.timeoutMs ?? VDA_READY_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? VDA_READY_POLL_MS;
  const stableChecks = options.stableChecks ?? VDA_READY_STABLE_CHECKS;
  const deadline = Date.now() + timeoutMs;
  let consecutive = 0;
  let last: ProcessResult | undefined;

  do {
    last = await probe(device, "device_status");
    consecutive = last.code === 0 && hasAttachedDevice(last.stdout) ? consecutive + 1 : 0;
    if (consecutive >= stableChecks) return;
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await new Promise((wake) => setTimeout(wake, Math.min(pollIntervalMs, remaining)));
  } while (true);

  const detail = last && last.code !== 0 ? `: ${failureOutput(last)}` : "";
  device.blockers.push(`device_status failed: VDA did not remain attached for ${stableChecks} checks within ${Math.ceil(timeoutMs / 1_000)}s${detail}`);
}

/** Builds the Vega package and finds the .vpkg it produced. */
export async function buildPackage(device: DeviceRun, appDir: string): Promise<void> {
  if (device.blockers.length) return;
  if (device.evidenceMode === "live") {
    const dependencies = await run(device, "dependencies");
    if (dependencies.code !== 0) return;
    removeGeneratedBundles(appDir);
  }
  const build = await run(device, "build");
  if (build.code === 0) device.packagePath ||= findVpkg(appDir);
  if (!device.packagePath) device.blockers.push("build produced no .vpkg package");
  if (build.code === 0 && device.evidenceMode === "live" && !hasGeneratedBundle(appDir)) {
    device.blockers.push("build produced no non-empty index.hermes.bundle");
  }
  device.appId ||= readAppId(appDir);
  if (!device.appId) device.blockers.push("manifest contains no component id");
}

/**
 * Installs, launches, and proves the process survived: running state at launch, a dwell, a
 * device log scan for crash signatures, and running state after the dwell.
 *
 * These checks do not prove that the app rendered the intended interface.
 */
export async function installAndLaunch(device: DeviceRun): Promise<void> {
  if (device.blockers.length) return;
  const install = await run(device, "install", device.packagePath);
  if (install.code !== 0) return;
  device.launchStartedAt = formatLoggingctlSince(new Date());
  const launch = await run(device, "launch", device.appId);
  if (launch.code !== 0) return;
  await recordRunningState(device, "app is running after launch", "immediately after launch");
  if (device.dwellMs > 0) await new Promise((wake) => setTimeout(wake, device.dwellMs));

  const logPath = join(device.outDir, "vega-device.log");
  const packageId = device.appId.replace(/\.main$/, "");
  const logs = await run(device, "logs", packageId, device.launchStartedAt ?? "");
  const text = logs.stdout || logs.stderr;
  writeFileSync(logPath, text);
  device.logFiles.push(logPath);
  const scan = scanDeviceLog(text);
  device.checks.push({ name: "device log free of crash signatures", passed: !scan.crashed, evidence: scan.crashed ? scan.matches.join(" | ") : `vega-device.log: no crash signature in ${scan.lines} lines` });
  if (scan.crashed) device.blockers.push(`the app crashed after launch: ${scan.matches.join(" | ")}`);

  await recordRunningState(
    device,
    "app remains running after dwell",
    device.dwellMs > 0 ? `after ${device.dwellMs}ms dwell` : "after replay dwell",
    text,
  );
}

async function recordRunningState(device: DeviceRun, name: string, timing: string, log = ""): Promise<void> {
  const status = await run(device, "app_status", device.appId);
  if (status.code !== 0) return;
  const running = reportsRunning(status);
  device.checks.push({ name, passed: running, evidence: `${timing}: ${failureOutput(status)}` });
  if (!running) {
    const diagnostic = runtimeDiagnostic(log);
    device.blockers.push(`${name} check failed${diagnostic ? `: ${diagnostic}` : ""}`);
  }
}

/** Reads the harness-owned result produced from VDA key input and page-source observations. */
export function checkFocusEvidence(device: DeviceRun, focusDir: string): void {
  const focusResult = join(focusDir, "tv-focus-result.json");
  let passed = false;
  if (existsSync(focusResult)) {
    try {
      const focus = JSON.parse(readFileSync(focusResult, "utf8")) as FocusEvidence;
      passed = focus.passed === true && REQUIRED_FOCUS_TRANSITIONS.every((transition) => focus.transitions?.includes(transition));
    } catch {
      device.blockers.push("focus transition result is not valid JSON");
    }
  }
  device.checks.push({ name: "focus transition suite", passed, evidence: focusResult });
  if (!passed) device.blockers.push("focus transition suite did not pass every required transition");
}

export type FocusRunOptions = {
  timeoutMs?: number;
  pollIntervalMs?: number;
  settleMs?: number;
};

/**
 * Drives the approved focus contract on the VDA. The model cannot author commands or expected
 * values: keys are fixed here and expected ids come from the human-approved port plan.
 */
export async function runFocusTest(device: DeviceRun, focusDir: string, options: FocusRunOptions = {}): Promise<void> {
  const resultPath = join(focusDir, "tv-focus-result.json");
  rmSync(resultPath, { force: true });
  const observations: FocusObservation[] = [];
  let failure = "";
  let contract: ReturnType<typeof readFocusContract>;

  const fail = (message: string) => {
    failure ||= message;
    if (!device.blockers.includes(message)) device.blockers.push(message);
  };
  const observe = (observation: FocusObservation) => {
    observations.push(observation);
    if (!observation.passed) fail(`${observation.name} focus check failed: expected ${observation.expected}, observed ${observation.observed}`);
  };
  const writeResult = () => {
    const transitions = observations.filter((observation) => observation.passed).map((observation) => observation.name);
    const evidence: FocusEvidence = {
      schemaVersion: 1,
      evidenceMode: device.evidenceMode,
      appId: device.appId,
      passed: !failure && REQUIRED_FOCUS_TRANSITIONS.every((name) => transitions.includes(name)),
      transitions: [...new Set(transitions)],
      observations,
      ...(failure ? { failure } : {}),
    };
    writeFileSync(resultPath, JSON.stringify(evidence, null, 2));
  };

  try {
    contract = readFocusContract(focusDir);
  } catch (error) {
    fail(`focus contract is invalid: ${error instanceof Error ? error.message : String(error)}`);
    writeResult();
    checkFocusEvidence(device, focusDir);
    return;
  }

  const enabled = await run(device, "automation_enable");
  if (enabled.code !== 0) {
    writeResult();
    checkFocusEvidence(device, focusDir);
    return;
  }

  const initial = await waitForFocusedId(device, contract.initialFocusId, options);
  observe({
    name: "launch-hero",
    expected: contract.initialFocusId,
    observed: initial.id,
    passed: initial.id === contract.initialFocusId,
  });
  if (failure) {
    if (initial.error) fail(initial.error);
    writeResult();
    checkFocusEvidence(device, focusDir);
    return;
  }

  const down = await pressAndWait(device, "KEY_DOWN", contract.firstRailFocusId, options);
  observe({
    name: "down-to-first-rail",
    key: "KEY_DOWN",
    expected: contract.firstRailFocusId,
    observed: down.id,
    passed: down.id === contract.firstRailFocusId,
  });
  if (failure) {
    if (down.error) fail(down.error);
    writeResult();
    checkFocusEvidence(device, focusDir);
    return;
  }

  const left = await pressAndWait(device, "KEY_LEFT", contract.firstRailFocusId, options);
  observe({
    name: "left-boundary",
    key: "KEY_LEFT",
    expected: contract.firstRailFocusId,
    observed: left.id,
    passed: left.id === contract.firstRailFocusId,
  });
  if (failure) {
    if (left.error) fail(left.error);
    writeResult();
    checkFocusEvidence(device, focusDir);
    return;
  }

  let origin = contract.firstRailFocusId;
  let movedRight = false;
  let foundRightBoundary = false;
  for (let index = 0; index <= contract.homeFocusableIds.length; index++) {
    const right = await pressAndRead(device, "KEY_RIGHT", options);
    if (!right.id) {
      fail(right.error || "right movement produced no focused test_id");
      break;
    }
    if (!contract.homeFocusableIds.includes(right.id)) {
      fail(`right movement focused ${right.id}, which is not declared on the entry screen`);
      break;
    }
    if (right.id === origin) {
      foundRightBoundary = movedRight;
      observe({
        name: "right-boundary",
        key: "KEY_RIGHT",
        expected: origin,
        observed: right.id,
        passed: foundRightBoundary,
      });
      break;
    }
    movedRight = true;
    origin = right.id;
    observe({ name: "right", key: "KEY_RIGHT", expected: "a different declared home target", observed: right.id, passed: true });
  }
  if (!foundRightBoundary && !failure) fail("right-boundary focus check failed: focus never settled at a boundary");
  if (failure) {
    writeResult();
    checkFocusEvidence(device, focusDir);
    return;
  }

  const details = await pressAndWait(device, "KEY_ENTER", contract.detailFocusId, options);
  observe({
    name: "open-details",
    key: "KEY_ENTER",
    expected: contract.detailFocusId,
    observed: details.id,
    passed: details.id === contract.detailFocusId,
  });
  if (failure) {
    if (details.error) fail(details.error);
    writeResult();
    checkFocusEvidence(device, focusDir);
    return;
  }

  const restored = await pressAndWait(device, "KEY_BACK", origin, options);
  observe({
    name: "back-restore",
    key: "KEY_BACK",
    expected: origin,
    observed: restored.id,
    passed: restored.id === origin,
  });
  if (restored.error) fail(restored.error);
  writeResult();
  checkFocusEvidence(device, focusDir);
}

async function pressAndWait(device: DeviceRun, key: string, expected: string, options: FocusRunOptions) {
  const pressed = await pressKey(device, key);
  if (!pressed) return { id: "", error: `${key} injection failed` };
  await delay(options.settleMs ?? FOCUS_KEY_SETTLE_MS);
  return waitForFocusedId(device, expected, options);
}

async function pressAndRead(device: DeviceRun, key: string, options: FocusRunOptions) {
  const pressed = await pressKey(device, key);
  if (!pressed) return { id: "", error: `${key} injection failed` };
  await delay(options.settleMs ?? FOCUS_KEY_SETTLE_MS);
  return waitForFocusedId(device, undefined, options);
}

async function pressKey(device: DeviceRun, key: string): Promise<boolean> {
  if (!VEGA_REMOTE_KEYS.has(key)) throw new Error(`Unsupported Vega remote key ${key}`);
  return (await run(device, "key_press", key)).code === 0;
}

async function waitForFocusedId(device: DeviceRun, expected: string | undefined, options: FocusRunOptions) {
  const timeoutMs = options.timeoutMs ?? FOCUS_POLL_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs ?? FOCUS_POLL_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;
  let lastId = "";
  let lastError = "";
  do {
    const page = await probe(device, "page_source");
    if (page.code === 0) {
      try {
        lastId = focusedTestIdFromPageSource(page.stdout);
        lastError = "";
        if (!expected || lastId === expected) return { id: lastId, error: "" };
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastError = failureOutput(page);
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    await delay(Math.min(pollIntervalMs, remaining));
  } while (true);
  const wanted = expected ? ` ${expected}` : "";
  return {
    id: lastId,
    error: `timed out waiting for focused test_id${wanted}${lastError ? `: ${lastError}` : ""}`,
  };
}

function delay(milliseconds: number): Promise<void> {
  return milliseconds > 0 ? new Promise((wake) => setTimeout(wake, milliseconds)) : Promise.resolve();
}

export function writeDeviceResult(device: DeviceRun, evidenceMode: "live" | "replay"): VegaPlatformResult {
  const result: VegaPlatformResult = {
    schemaVersion: 1,
    evidenceMode,
    sdkVersion: VEGA_SDK_VERSION,
    adbtPackage: ADBT_PACKAGE,
    appId: device.appId,
    packagePath: device.packagePath,
    dwellMs: device.dwellMs,
    steps: device.steps,
    checks: device.checks,
    logFiles: device.logFiles,
    blockers: device.blockers,
  };
  writeFileSync(join(device.outDir, "vega-platform-result.json"), JSON.stringify(result, null, 2));
  return result;
}

/**
 * A pipeline phase names the device work it must clear. `build` needs the SDK but no target;
 * everything after it reuses an attached device or starts a VDA.
 */
export type DeviceStage = "build" | "launch" | "focus";

export async function runDeviceStages(device: DeviceRun, stages: DeviceStage[], options: { appDir: string; focusDir?: string }): Promise<void> {
  if (stages.includes("build")) {
    await checkToolchain(device, false);
    await buildPackage(device, options.appDir);
  }
  if (stages.includes("launch")) {
    await checkToolchain(device, true);
    await installAndLaunch(device);
  }
  if (stages.includes("focus") && device.blockers.length === 0) {
    await runFocusTest(device, options.focusDir ?? options.appDir);
  }
}

/** The whole device session in order, for `vega-run` and for anyone wanting one call. */
export async function runVegaLifecycle(options: {
  adapter: VegaCommandAdapter;
  appDir: string;
  outDir: string;
  evidenceMode: "live" | "replay";
  packagePath?: string;
  appId?: string;
  focusDir?: string;
  dwellMs?: number;
}): Promise<VegaPlatformResult> {
  const device = startDeviceRun(options);
  await checkToolchain(device);
  await buildPackage(device, options.appDir);
  await installAndLaunch(device);
  await runFocusTest(device, options.focusDir ?? options.appDir);
  return writeDeviceResult(device, options.evidenceMode);
}

function hasAttachedDevice(output: string): boolean {
  return output.split("\n").map((line) => line.trim()).some((line) => /\sdevice(?:\s|$)/.test(line));
}

/** loggingctl --since accepts dot-separated dates with no whitespace. */
export function formatLoggingctlSince(value: Date): string {
  return value.toISOString().replaceAll("-", ".").replace(/\.\d{3}Z$/, "");
}

function reportsRunning(result: ProcessResult): boolean {
  const output = `${result.stdout}\n${result.stderr}`;
  return /\bis running(?:\s+on)?\b/i.test(output) && !/\bis not running\b/i.test(output);
}

function runtimeDiagnostic(log: string): string {
  const lines = log.split("\n").map((line) => line.trim()).filter(Boolean);
  const errors = lines.filter((line) => /\b(?:error|fatal|invalid|unable to|exception)\b/i.test(line));
  return (errors.length ? errors : lines).slice(-5).join(" | ");
}

function bundlePaths(root: string): string[] {
  const build = join(root, "build");
  if (!existsSync(build)) return [];
  const pending = [build];
  const bundles: string[] = [];
  while (pending.length) {
    const dir = pending.shift()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name === "index.hermes.bundle") bundles.push(path);
    }
  }
  return bundles;
}

function removeGeneratedBundles(root: string): void {
  for (const path of bundlePaths(root)) rmSync(path, { force: true });
}

function hasGeneratedBundle(root: string): boolean {
  return bundlePaths(root).some((path) => statSync(path).size > 0);
}

function findVpkg(root: string): string {
  const build = join(root, "build");
  if (!existsSync(build)) return "";
  const pending = [build];
  const packages: string[] = [];
  while (pending.length) {
    const dir = pending.shift()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (entry.name.endsWith(".vpkg")) packages.push(resolve(path));
    }
  }
  const architecture = process.arch === "arm64" ? "aarch64" : process.arch === "x64" ? "x86_64" : "armv7";
  return packages.find((path) => path.includes(`/${architecture}-debug/`)) ?? packages.find((path) => path.includes(`/${architecture}/Debug/`)) ?? packages[0] ?? "";
}

function readAppId(root: string): string {
  const manifest = join(root, "manifest.toml");
  if (!existsSync(manifest)) return "";
  const ids = [...readFileSync(manifest, "utf8").matchAll(/^id\s*=\s*"([^"]+)"/gm)].map((match) => match[1]);
  return ids.find((id) => id.endsWith(".main")) ?? ids[0] ?? "";
}
