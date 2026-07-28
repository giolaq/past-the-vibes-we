import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runProcess } from "./process.js";
import { AdbtMcpContextProvider } from "./context-providers/adbt.js";
import { resolveExecutorConfig } from "./port-executor.js";
import { ADBT_PACKAGE, VEGA_SDK_VERSION } from "./platform/vega.js";
import { loadExecutorInput } from "./workshop-config.js";

export type DoctorCheck = { name: string; status: "pass" | "repair" | "optional"; detail: string; hint?: string };

export async function workshopDoctor(): Promise<DoctorCheck[]> {
  const replay = process.argv.includes("--replay");
  const liveAdbt = !replay || process.argv.includes("--adbt-live");
  const checks: DoctorCheck[] = [{ name: "node", status: Number(process.versions.node.split(".")[0]) >= 20 ? "pass" : "repair", detail: process.version, hint: "Install Node 20 or newer." }];
  checks.push(await executorCheck());
  if (!liveAdbt) {
    checks.push({ name: "adbt", status: "optional", detail: `${ADBT_PACKAGE} is not needed for replay` });
  } else {
    checks.push(await adbtCheck());
  }
  if (replay) {
    checks.push({ name: "vega", status: "optional", detail: `SDK ${VEGA_SDK_VERSION} is not needed for replay` });
  } else {
    checks.push(await commandCheck("vega", process.env.VEGA_BIN ?? "vega", ["--version"], `Install and select Vega SDK ${VEGA_SDK_VERSION}.`));
  }
  checks.push(await commandCheck("bee", process.env.BEE_BIN ?? "bee", ["--version"], "Optional: install/configure Bee or use the file fixture.", true));
  return checks;
}

async function adbtCheck(): Promise<DoctorCheck> {
  try {
    const context = await new AdbtMcpContextProvider({ commandArgs: ["-y", ADBT_PACKAGE], timeoutMs: 15_000 }).load();
    return { name: "adbt", status: "pass", detail: `native MCP: ${context.documents.length} Vega port workflows available` };
  } catch (error) {
    return { name: "adbt", status: "repair", detail: error instanceof Error ? error.message.slice(0, 500) : "MCP unavailable", hint: "Use the recorded ADBT context or repair the pinned package." };
  }
}

async function executorCheck(): Promise<DoctorCheck> {
  if (process.argv.includes("--replay")) return { name: "model-executor", status: "pass", detail: "replay (no model required)" };
  // Same resolution the port uses, so doctor can never green-light a different executor.
  const config = resolveExecutorConfig(loadExecutorInput(process.argv.slice(2)));
  if (config.kind === "claude-cli") {
    const availability = claudeModelAvailability(config.model);
    if (availability?.status === "repair") return availability;
    const command = await commandCheck("model-executor", config.command, ["--version"], "Install Claude Code or select Strands in workshop.config.json.");
    if (command.status === "pass" && availability) command.detail = `${command.detail}; model ${config.model} is available`;
    return command;
  }
  const provider = config.model.provider;
  const key = provider === "openai" ? "OPENAI_API_KEY" : provider === "openrouter" ? "OPENROUTER_API_KEY" : "AWS_PROFILE";
  const ready = Boolean(process.env[key] || (provider === "bedrock" && process.env.AWS_ACCESS_KEY_ID));
  return { name: "model-executor", status: ready ? "pass" : "repair", detail: `Strands ${provider}: ${config.model.modelId}`, hint: ready ? undefined : `Configure ${key}, select Claude Code in workshop.config.json, or use --replay.` };
}

export function claudeModelAvailability(model: string, settingsPath = join(homedir(), ".claude", "settings.json")): DoctorCheck | undefined {
  if (["default", "sonnet", "opus", "haiku"].includes(model.toLowerCase())) {
    return {
      name: "model-executor",
      status: "repair",
      detail: `Claude model ${model} is an alias, not an exact model name`,
      hint: `Set workshop.config.json model to an exact name${existsSync(settingsPath) ? " from ~/.claude/settings.json availableModels" : ", for example claude-sonnet-4-6"}.`,
    };
  }
  if (!existsSync(settingsPath)) return undefined;
  try {
    const settings = JSON.parse(readFileSync(settingsPath, "utf8")) as { enforceAvailableModels?: unknown; availableModels?: unknown };
    if (settings.enforceAvailableModels !== true || !Array.isArray(settings.availableModels)) return undefined;
    const available = settings.availableModels.filter((value): value is string => typeof value === "string");
    if (available.includes(model)) return { name: "model-executor", status: "pass", detail: `Claude model ${model} is in the enforced availableModels list` };
    return {
      name: "model-executor",
      status: "repair",
      detail: `Claude model ${model} is not in the enforced availableModels list`,
      hint: `Set workshop.config.json model to one exact available name: ${available.join(", ")}`,
    };
  } catch (error) {
    return {
      name: "model-executor",
      status: "repair",
      detail: `Cannot validate Claude model settings: ${error instanceof Error ? error.message : String(error)}`,
      hint: `Repair ${settingsPath} or select Strands in workshop.config.json.`,
    };
  }
}

async function commandCheck(name: string, command: string, args: string[], hint: string, optional = false, timeoutMs = 2_000): Promise<DoctorCheck> {
  try {
    const result = await runProcess(command, args, timeoutMs);
    if (result.code === 0) return { name, status: "pass", detail: (result.stdout.trim() || "available").slice(0, 500) };
    return { name, status: optional ? "optional" : "repair", detail: result.timedOut ? "timed out" : `exit ${result.code}`, hint };
  } catch {
    return { name, status: optional ? "optional" : "repair", detail: "not found", hint };
  }
}
