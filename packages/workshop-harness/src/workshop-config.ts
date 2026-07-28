import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ExecutorInput } from "./port-executor.js";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
export const DEFAULT_WORKSHOP_CONFIG = resolve(repositoryRoot, "workshop.config.json");

const WorkshopConfigSchema = z.object({
  executor: z.enum(["claude-cli", "strands"]),
  provider: z.enum(["bedrock", "openai", "openrouter"]).optional(),
  model: z.string().min(1),
  region: z.string().min(1).optional(),
}).strict().superRefine((config, context) => {
  if (config.executor === "strands" && !config.provider) {
    context.addIssue({ code: "custom", path: ["provider"], message: "provider is required for the Strands executor" });
  }
});

export function loadExecutorInput(args = process.argv.slice(2), configPath?: string): ExecutorInput {
  const explicitPath = flag(args, "--config");
  const path = resolve(configPath ?? explicitPath ?? process.env.WORKSHOP_CONFIG ?? DEFAULT_WORKSHOP_CONFIG);
  const file = loadFile(path, Boolean(configPath || explicitPath || process.env.WORKSHOP_CONFIG));
  return {
    ...file,
    ...defined({
      executor: flag(args, "--executor"),
      provider: flag(args, "--provider"),
      model: flag(args, "--model"),
      region: flag(args, "--region"),
    }),
  };
}

export function retryAttemptOverride(args = process.argv.slice(2)): number | undefined {
  if (args.includes("--until-done")) return Infinity;
  const raw = flag(args, "--max-attempts");
  if (raw === undefined) return undefined;
  const attempts = Number(raw);
  if (!Number.isSafeInteger(attempts) || attempts < 1) {
    throw new Error("--max-attempts must be a positive integer");
  }
  return attempts;
}

export function turnLimitOverride(args = process.argv.slice(2)): number | undefined {
  const raw = flag(args, "--max-turns");
  if (raw === undefined) return undefined;
  const turns = Number(raw);
  if (!Number.isSafeInteger(turns) || turns < 1) {
    throw new Error("--max-turns must be a positive integer");
  }
  return turns;
}

function loadFile(path: string, required: boolean): ExecutorInput {
  if (!existsSync(path)) {
    if (required) throw new Error(`Workshop config not found: ${path}`);
    return {};
  }
  let value: unknown;
  try {
    value = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Workshop config is not valid JSON: ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = WorkshopConfigSchema.safeParse(value);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "config"}: ${issue.message}`).join("; ");
    throw new Error(`Workshop config is invalid: ${path}: ${issues}`);
  }
  return parsed.data;
}

function flag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function defined(input: ExecutorInput): ExecutorInput {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as ExecutorInput;
}
