export type ModelUsage = {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  cacheWriteInputTokens: number;
  totalTokens: number;
  calls: number;
  turns: number;
};

export type ProviderCostSource = "provider" | "recorded" | "mixed";

export type ModelTelemetry = {
  usage: ModelUsage;
  providerReportedCostUsd?: number;
  providerReportedCostSource?: ProviderCostSource;
  requestedModel?: string;
  actualModels: string[];
};

export const EMPTY_MODEL_USAGE: ModelUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheWriteInputTokens: 0,
  totalTokens: 0,
  calls: 0,
  turns: 0,
};

export function modelUsage(input: Partial<ModelUsage> = {}): ModelUsage {
  const usage = {
    inputTokens: finite(input.inputTokens),
    outputTokens: finite(input.outputTokens),
    cacheReadInputTokens: finite(input.cacheReadInputTokens),
    cacheWriteInputTokens: finite(input.cacheWriteInputTokens),
    calls: finite(input.calls),
    turns: finite(input.turns),
  };
  return {
    ...usage,
    totalTokens: usage.inputTokens + usage.outputTokens + usage.cacheReadInputTokens + usage.cacheWriteInputTokens,
  };
}

export function addModelUsage(left: ModelUsage, right: ModelUsage): ModelUsage {
  return modelUsage({
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadInputTokens: left.cacheReadInputTokens + right.cacheReadInputTokens,
    cacheWriteInputTokens: left.cacheWriteInputTokens + right.cacheWriteInputTokens,
    calls: left.calls + right.calls,
    turns: left.turns + right.turns,
  });
}

export function mergeProviderCostSource(left?: ProviderCostSource, right?: ProviderCostSource): ProviderCostSource | undefined {
  if (!left) return right;
  if (!right) return left;
  return left === right ? left : "mixed";
}

export function recordedUsage(value: unknown): ModelUsage {
  if (!value || typeof value !== "object") return { ...EMPTY_MODEL_USAGE };
  const usage = value as Record<string, unknown>;
  const hasTokens = ["inputTokens", "input_tokens", "outputTokens", "output_tokens", "totalTokens", "total_tokens"].some((name) => typeof usage[name] === "number");
  let inputTokens = numberField(usage, "inputTokens", "input_tokens");
  const outputTokens = numberField(usage, "outputTokens", "output_tokens");
  const cacheReadInputTokens = numberField(usage, "cacheReadInputTokens", "cache_read_input_tokens");
  const cacheWriteInputTokens = numberField(usage, "cacheWriteInputTokens", "cache_creation_input_tokens", "cache_write_input_tokens");
  if (inputTokens + outputTokens + cacheReadInputTokens + cacheWriteInputTokens === 0) {
    inputTokens = numberField(usage, "totalTokens", "total_tokens");
  }
  return modelUsage({
    inputTokens,
    outputTokens,
    cacheReadInputTokens,
    cacheWriteInputTokens,
    calls: numberField(usage, "calls") || (hasTokens ? 1 : 0),
    turns: numberField(usage, "turns") || (hasTokens ? 1 : 0),
  });
}

export function actualClaudeModels(event: unknown): string[] {
  if (!event || typeof event !== "object" || !("modelUsage" in event)) return [];
  const modelUsage = event.modelUsage;
  return modelUsage && typeof modelUsage === "object" ? Object.keys(modelUsage).sort() : [];
}

export function modelMatches(requested: string, actual: string): boolean {
  const wanted = normalizeClaudeModel(requested);
  const used = normalizeClaudeModel(actual);
  return wanted === used;
}

function normalizeClaudeModel(value: string): string {
  const normalized = value.toLowerCase().replace(/\[1m\]$/, "");
  const claude = normalized.indexOf("claude-");
  return claude >= 0 ? normalized.slice(claude).replace(/-v\d+(?::\d+)?$/, "") : normalized;
}

function numberField(value: Record<string, unknown>, ...names: string[]): number {
  for (const name of names) {
    if (typeof value[name] === "number") return finite(value[name]);
  }
  return 0;
}

function finite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
