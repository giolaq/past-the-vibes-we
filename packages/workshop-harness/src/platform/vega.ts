import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runProcess, type ProcessResult } from "../process.js";
import { scanDeviceLog } from "./device-log.js";
import { describeScreenshot, evaluateScreenshotFile } from "./screenshot.js";

export const VEGA_SDK_VERSION = "0.22.5875";
export const ADBT_PACKAGE = "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5";

export type VegaCapability = "sdk_version" | "device_status" | "build" | "install" | "launch" | "logs" | "capture" | "pull";
export type VegaStep = { capability: VegaCapability; command: string[]; code: number; stdout: string; stderr: string; timedOut?: boolean };
export type VegaPlatformResult = {
  schemaVersion: 1;
  evidenceMode: "live" | "replay";
  sdkVersion: string;
  adbtPackage: string;
  appId: string;
  packagePath: string;
  /** How long the harness left the app running before it read the log and captured again. */
  dwellMs: number;
  steps: VegaStep[];
  checks: { name: string; passed: boolean; evidence: string }[];
  screenshots: string[];
  logFiles: string[];
  blockers: string[];
};

export interface VegaCommandAdapter {
  command(capability: VegaCapability, ...values: string[]): string[];
  execute(capability: VegaCapability, ...values: string[]): Promise<ProcessResult>;
}

/** Where the device writes the launch screenshot before the harness pulls it. */
export const VEGA_SCREENSHOT_REMOTE = "/tmp/tv-build-launch.png";
/** The frame taken as soon as the app id is launched. */
export const VEGA_LAUNCH_FRAME = "01-launch.png";
/** The frame taken after the dwell — an app that died on startup cannot produce it. */
export const VEGA_POSTLAUNCH_FRAME = "02-postlaunch.png";
/**
 * How long a live run leaves the app running before reading the log and capturing again.
 * A crash on startup needs time to happen and reach the device log.
 */
export const LAUNCH_DWELL_MS = 5_000;

/**
 * Shape of a `--platform-replay` fixture: recorded results for each lifecycle capability, plus
 * the frame the recorded `pull` writes (a path relative to the fixture file).
 */
export type VegaReplayFixture = { packagePath: string; appId: string; screenshot?: string; turns: Array<{ capability: VegaCapability; result: ProcessResult }> };

export class VegaAdapter implements VegaCommandAdapter {
  constructor(private vega = process.env.VEGA_BIN ?? "vega", private cwd?: string) {}

  command(capability: VegaCapability, ...values: string[]): string[] {
    const value = values[0] ?? "";
    const commands: Record<VegaCapability, string[]> = {
      sdk_version: [this.vega, "--version"],
      device_status: [this.vega, "exec", "vda", "devices", "-l"],
      build: [process.env.NPM_BIN ?? "npm", "run", "build:debug"],
      install: [this.vega, "device", "install-app", "--packagePath", value],
      launch: [this.vega, "device", "launch-app", "--appName", value],
      logs: [this.vega, "exec", "vda", "shell", "loggingctl", "log", "-o", "short-precise"],
      capture: [this.vega, "exec", "vda", "shell", "gwsi-tool-screenshooter", value],
      pull: [this.vega, "exec", "vda", "pull", value, values[1] ?? ""],
    };
    return commands[capability];
  }

  execute(capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
    const timeout = capability === "build" ? 15 * 60_000 : 30_000;
    const [command, ...args] = this.command(capability, ...values);
    return runProcess(command, args, timeout, this.cwd);
  }
}

/**
 * A 1x1 black pixel. It is what a replay wrote before the screenshot gate existed, and it is
 * exactly what the gate must now refuse — kept so a test can prove that.
 */
export const PLACEHOLDER_PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");

export class VegaReplayAdapter implements VegaCommandAdapter {
  private index = 0;
  constructor(private turns: Array<{ capability: VegaCapability; result: ProcessResult }>, private screenshot: Buffer = PLACEHOLDER_PIXEL_PNG) {}
  command(capability: VegaCapability, ...values: string[]): string[] { return ["replay", capability, ...values]; }
  async execute(capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
    // A fixture records a whole device session. A phase run on its own — `--phases launch` —
    // asks for only part of it, so skip forward past capabilities this run is not exercising.
    // Order within a capability is preserved, which is what lets a recorded rebuild replay.
    while (this.index < this.turns.length && this.turns[this.index].capability !== capability) this.index++;
    const turn = this.turns[this.index++];
    if (!turn) throw new Error(`Vega replay has no turn left for ${capability}`);
    if (capability === "pull" && turn.result.code === 0 && values[1]) writeFileSync(values[1], this.screenshot);
    return turn.result;
  }
}

/**
 * Asked to judge one device screenshot with a multimodal model. Optional: the deterministic
 * pixel gate runs either way, and the key-free path never calls a model.
 */
export type ScreenshotJudge = (path: string) => Promise<{ verdict: "app" | "not-app" | "unclear"; reasoning: string }>;

/**
 * One device session, accumulated across stages. The stages are separately callable so a
 * pipeline phase can own one of them — build in one phase, install and launch in the next —
 * and still produce a single evidence file at the end.
 */
export type DeviceRun = {
  adapter: VegaCommandAdapter;
  outDir: string;
  dwellMs: number;
  steps: VegaStep[];
  checks: VegaPlatformResult["checks"];
  screenshots: string[];
  logFiles: string[];
  blockers: string[];
  packagePath: string;
  appId: string;
};

/** Clears last run's artifacts. Once per device session, never per stage. */
export function startDeviceRun(options: { adapter: VegaCommandAdapter; outDir: string; evidenceMode: "live" | "replay"; dwellMs?: number; packagePath?: string; appId?: string }): DeviceRun {
  mkdirSync(options.outDir, { recursive: true });
  for (const name of ["vega-device.log", VEGA_LAUNCH_FRAME, VEGA_POSTLAUNCH_FRAME]) rmSync(join(options.outDir, name), { force: true });
  return {
    adapter: options.adapter,
    outDir: options.outDir,
    // Live runs wait for a crash to happen; replay has no process, so it defaults to no dwell.
    dwellMs: options.dwellMs ?? (options.evidenceMode === "live" ? LAUNCH_DWELL_MS : 0),
    steps: [], checks: [], screenshots: [], logFiles: [], blockers: [],
    packagePath: options.packagePath ?? "",
    appId: options.appId ?? "",
  };
}

async function run(device: DeviceRun, capability: VegaCapability, ...values: string[]): Promise<ProcessResult> {
  const result = await device.adapter.execute(capability, ...values);
  device.steps.push({ capability, command: device.adapter.command(capability, ...values), code: result.code, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut });
  // The command's own output is the evidence a retry needs, so keep both streams — a compiler
  // writes most of its diagnostics to stdout.
  if (result.code !== 0) device.blockers.push(`${capability} failed: ${result.timedOut ? "timed out" : failureOutput(result)}`);
  return result;
}

function failureOutput(result: ProcessResult): string {
  return [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n") || `exit ${result.code}`;
}

/** capture writes the frame on the device, pull brings it back, the gate judges the pixels. */
async function captureFrame(device: DeviceRun, name: string, path: string, note = ""): Promise<void> {
  const capture = await run(device, "capture", VEGA_SCREENSHOT_REMOTE);
  if (capture.code !== 0) return;
  const pull = await run(device, "pull", VEGA_SCREENSHOT_REMOTE, path);
  if (pull.code !== 0) return;
  if (existsSync(path)) device.screenshots.push(path);
  const evaluation = evaluateScreenshotFile(path);
  device.checks.push({ name, passed: evaluation.renders, evidence: `${describeScreenshot(path, evaluation)}${note}` });
  if (!evaluation.renders) device.blockers.push(`${name} failed: ${evaluation.reasons.join("; ")}`);
}

/** Pre-flight. `requireDevice` is false for a build, which needs the SDK but no target. */
export async function checkToolchain(device: DeviceRun, requireDevice = true): Promise<void> {
  const sdk = await run(device, "sdk_version");
  if (sdk.code === 0 && !`${sdk.stdout}\n${sdk.stderr}`.includes(VEGA_SDK_VERSION)) {
    device.blockers.push(`sdk_version mismatch: expected ${VEGA_SDK_VERSION}`);
  }
  if (!requireDevice || device.blockers.length) return;
  const devices = await run(device, "device_status");
  if (devices.code === 0 && !hasAttachedDevice(devices.stdout)) device.blockers.push("device_status failed: no VDA device is attached");
}

/** Builds the Vega package and finds the .vpkg it produced. */
export async function buildPackage(device: DeviceRun, appDir: string): Promise<void> {
  if (device.blockers.length) return;
  const build = await run(device, "build");
  if (build.code === 0) device.packagePath ||= findVpkg(appDir);
  if (!device.packagePath) device.blockers.push("build produced no .vpkg package");
  device.appId ||= readAppId(appDir);
  if (!device.appId) device.blockers.push("manifest contains no component id");
}

/**
 * Installs, launches, and proves the app survived: a frame at launch, a dwell, the device log
 * scanned for crash signatures, and a second frame. An app that died on startup leaves a
 * signature in the log and cannot render the second frame.
 */
export async function installAndLaunch(device: DeviceRun): Promise<void> {
  if (device.blockers.length) return;
  await run(device, "install", device.packagePath);
  if (!device.blockers.length) await run(device, "launch", device.appId);
  if (!device.blockers.length) await captureFrame(device, "launch screenshot renders content", join(device.outDir, VEGA_LAUNCH_FRAME));
  if (!device.blockers.length && device.dwellMs > 0) await new Promise((wake) => setTimeout(wake, device.dwellMs));
  if (device.blockers.length) return;

  const logPath = join(device.outDir, "vega-device.log");
  const logs = await run(device, "logs");
  const text = logs.stdout || logs.stderr;
  writeFileSync(logPath, text);
  device.logFiles.push(logPath);
  const scan = scanDeviceLog(text);
  device.checks.push({ name: "device log free of crash signatures", passed: !scan.crashed, evidence: scan.crashed ? scan.matches.join(" | ") : `vega-device.log: no crash signature in ${scan.lines} lines` });
  if (scan.crashed) device.blockers.push(`the app crashed after launch: ${scan.matches.join(" | ")}`);

  if (!device.blockers.length) await captureFrame(device, "post-launch screenshot renders content", join(device.outDir, VEGA_POSTLAUNCH_FRAME), device.dwellMs > 0 ? ` (captured ${device.dwellMs}ms after launch)` : " (replayed frame, no dwell)");
}

/** The optional model review of the frame the app was still rendering after the dwell. */
export async function reviewScreenshot(device: DeviceRun, judge?: ScreenshotJudge): Promise<void> {
  if (device.blockers.length || !judge) return;
  const review = await judge(join(device.outDir, VEGA_POSTLAUNCH_FRAME));
  device.checks.push({ name: "screenshot review", passed: review.verdict === "app", evidence: `${review.verdict}: ${review.reasoning}` });
  if (review.verdict === "not-app") device.blockers.push(`screenshot review rejected the frame: ${review.reasoning}`);
}

const REQUIRED_FOCUS_TRANSITIONS = ["launch-hero", "down-to-first-rail", "left-boundary", "right-boundary", "open-details", "back-restore"];

/**
 * Reads the executable focus test's result. Host-side on purpose: a screenshot shows where
 * focus is, never whether it moved correctly.
 */
export function checkFocusEvidence(device: DeviceRun, focusDir: string): void {
  const focusResult = join(focusDir, "tv-focus-result.json");
  let passed = false;
  if (existsSync(focusResult)) {
    try {
      const focus = JSON.parse(readFileSync(focusResult, "utf8")) as { passed?: boolean; transitions?: string[] };
      passed = focus.passed === true && REQUIRED_FOCUS_TRANSITIONS.every((transition) => focus.transitions?.includes(transition));
    } catch {
      device.blockers.push("focus transition result is not valid JSON");
    }
  }
  device.checks.push({ name: "focus transition suite", passed, evidence: focusResult });
  if (!passed) device.blockers.push("focus transition suite did not pass every required transition");
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
    screenshots: device.screenshots,
    logFiles: device.logFiles,
    blockers: device.blockers,
  };
  writeFileSync(join(device.outDir, "vega-platform-result.json"), JSON.stringify(result, null, 2));
  return result;
}

/**
 * A pipeline phase names the device work it must clear. `build` needs the SDK but no target;
 * everything after it needs an attached device.
 */
export type DeviceStage = "build" | "launch" | "review" | "focus";

export async function runDeviceStages(device: DeviceRun, stages: DeviceStage[], options: { appDir: string; focusDir?: string; judge?: ScreenshotJudge }): Promise<void> {
  if (stages.includes("build")) {
    await checkToolchain(device, false);
    await buildPackage(device, options.appDir);
  }
  if (stages.includes("launch")) {
    await checkToolchain(device, true);
    await installAndLaunch(device);
  }
  if (stages.includes("review")) await reviewScreenshot(device, options.judge);
  if (stages.includes("focus")) checkFocusEvidence(device, options.focusDir ?? options.appDir);
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
  judge?: ScreenshotJudge;
}): Promise<VegaPlatformResult> {
  const device = startDeviceRun(options);
  await checkToolchain(device);
  await buildPackage(device, options.appDir);
  await installAndLaunch(device);
  await reviewScreenshot(device, options.judge);
  checkFocusEvidence(device, options.focusDir ?? options.appDir);
  return writeDeviceResult(device, options.evidenceMode);
}

function hasAttachedDevice(output: string): boolean {
  return output.split("\n").map((line) => line.trim()).some((line) => line && line !== "List of devices attached" && !line.startsWith("* daemon"));
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
