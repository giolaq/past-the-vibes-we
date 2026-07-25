import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { runProcess, type ProcessResult } from "../process.js";
import { scanDeviceLog } from "./device-log.js";
import { describeScreenshot, evaluateScreenshotFile } from "./screenshot.js";

export const VEGA_SDK_VERSION = "0.22.5875";
export const ADBT_PACKAGE = "@amazon-devices/amazon-devices-buildertools-mcp@1.0.5";

export type VegaCapability = "sdk_version" | "device_status" | "build" | "install" | "launch" | "logs" | "capture" | "pull";
export type VegaStep = { capability: VegaCapability; command: string[]; code: number; stdout: string; stderr: string };
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
    const turn = this.turns[this.index++];
    if (!turn || turn.capability !== capability) throw new Error(`Vega replay expected ${turn?.capability ?? "end"}, received ${capability}`);
    if (capability === "pull" && turn.result.code === 0 && values[1]) writeFileSync(values[1], this.screenshot);
    return turn.result;
  }
}

/**
 * Asked to judge one device screenshot with a multimodal model. Optional: the deterministic
 * pixel gate runs either way, and the key-free path never calls a model.
 */
export type ScreenshotJudge = (path: string) => Promise<{ verdict: "app" | "not-app" | "unclear"; reasoning: string }>;

export async function runVegaLifecycle(options: {
  adapter: VegaCommandAdapter;
  appDir: string;
  outDir: string;
  evidenceMode: "live" | "replay";
  packagePath?: string;
  appId?: string;
  focusDir?: string;
  /** Live runs wait; replay has nothing to wait for, so it defaults to no dwell. */
  dwellMs?: number;
  judge?: ScreenshotJudge;
}): Promise<VegaPlatformResult> {
  mkdirSync(options.outDir, { recursive: true });
  const logPath = join(options.outDir, "vega-device.log");
  const launchFrame = join(options.outDir, VEGA_LAUNCH_FRAME);
  const postLaunchFrame = join(options.outDir, VEGA_POSTLAUNCH_FRAME);
  const dwellMs = options.dwellMs ?? (options.evidenceMode === "live" ? LAUNCH_DWELL_MS : 0);
  rmSync(logPath, { force: true });
  rmSync(launchFrame, { force: true });
  rmSync(postLaunchFrame, { force: true });
  const steps: VegaStep[] = [];
  const blockers: string[] = [];
  const checks: VegaPlatformResult["checks"] = [];
  const screenshots: string[] = [];
  const run = async (capability: VegaCapability, ...values: string[]) => {
    const result = await options.adapter.execute(capability, ...values);
    steps.push({ capability, command: options.adapter.command(capability, ...values), code: result.code, stdout: result.stdout, stderr: result.stderr });
    if (result.code !== 0) blockers.push(`${capability} failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    return result;
  };

  /** capture writes the frame on the device, pull brings it back, the gate judges the pixels. */
  const captureFrame = async (name: string, path: string, note = ""): Promise<void> => {
    const capture = await run("capture", VEGA_SCREENSHOT_REMOTE);
    if (capture.code !== 0) return;
    const pull = await run("pull", VEGA_SCREENSHOT_REMOTE, path);
    if (pull.code !== 0) return;
    if (existsSync(path)) screenshots.push(path);
    const evaluation = evaluateScreenshotFile(path);
    checks.push({ name, passed: evaluation.renders, evidence: `${describeScreenshot(path, evaluation)}${note}` });
    if (!evaluation.renders) blockers.push(`${name} failed: ${evaluation.reasons.join("; ")}`);
  };

  const sdk = await run("sdk_version");
  if (sdk.code === 0 && !`${sdk.stdout}\n${sdk.stderr}`.includes(VEGA_SDK_VERSION)) {
    blockers.push(`sdk_version mismatch: expected ${VEGA_SDK_VERSION}`);
  }
  if (!blockers.length) {
    const devices = await run("device_status");
    if (devices.code === 0 && !hasAttachedDevice(devices.stdout)) blockers.push("device_status failed: no VDA device is attached");
  }
  let packagePath = options.packagePath ?? "";
  if (!blockers.length) {
    const build = await run("build");
    if (build.code === 0) packagePath ||= findVpkg(options.appDir);
    if (!packagePath) blockers.push("build produced no .vpkg package");
  }
  const appId = options.appId ?? readAppId(options.appDir);
  if (!appId) blockers.push("manifest contains no component id");
  if (!blockers.length) await run("install", packagePath);
  if (!blockers.length) await run("launch", appId);

  // The launch frame, then a dwell, then the log and a second frame. The pair is the liveness
  // evidence: an app that crashed on startup leaves a signature in the log and cannot render
  // the second frame.
  if (!blockers.length) await captureFrame("launch screenshot renders content", launchFrame);
  if (!blockers.length && dwellMs > 0) await new Promise((wake) => setTimeout(wake, dwellMs));

  let logRecorded = false;
  if (!blockers.length) {
    const logs = await run("logs");
    const text = logs.stdout || logs.stderr;
    writeFileSync(logPath, text);
    logRecorded = true;
    const scan = scanDeviceLog(text);
    checks.push({ name: "device log free of crash signatures", passed: !scan.crashed, evidence: scan.crashed ? scan.matches.join(" | ") : `vega-device.log: no crash signature in ${scan.lines} lines` });
    if (scan.crashed) blockers.push(`the app crashed after launch: ${scan.matches.join(" | ")}`);
  }

  if (!blockers.length) await captureFrame("post-launch screenshot renders content", postLaunchFrame, dwellMs > 0 ? ` (captured ${dwellMs}ms after launch)` : " (replayed frame, no dwell)");

  if (!blockers.length && options.judge) {
    const review = await options.judge(postLaunchFrame);
    checks.push({ name: "screenshot review", passed: review.verdict === "app", evidence: `${review.verdict}: ${review.reasoning}` });
    if (review.verdict === "not-app") blockers.push(`screenshot review rejected the frame: ${review.reasoning}`);
  }

  const focusResult = join(options.focusDir ?? options.appDir, "tv-focus-result.json");
  const requiredFocusTransitions = ["launch-hero", "down-to-first-rail", "left-boundary", "right-boundary", "open-details", "back-restore"];
  let focusPassed = false;
  if (existsSync(focusResult)) {
    try {
      const focus = JSON.parse(readFileSync(focusResult, "utf8")) as { passed?: boolean; transitions?: string[] };
      focusPassed = focus.passed === true && requiredFocusTransitions.every((transition) => focus.transitions?.includes(transition));
    } catch {
      blockers.push("focus transition result is not valid JSON");
    }
  }
  checks.push({ name: "focus transition suite", passed: focusPassed, evidence: focusResult });
  const result: VegaPlatformResult = {
    schemaVersion: 1,
    evidenceMode: options.evidenceMode,
    sdkVersion: VEGA_SDK_VERSION,
    adbtPackage: ADBT_PACKAGE,
    appId,
    packagePath,
    dwellMs,
    steps,
    checks,
    screenshots,
    logFiles: logRecorded ? [logPath] : [],
    blockers: focusPassed ? blockers : [...blockers, "focus transition suite did not pass every required transition"],
  };
  writeFileSync(join(options.outDir, "vega-platform-result.json"), JSON.stringify(result, null, 2));
  return result;
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
