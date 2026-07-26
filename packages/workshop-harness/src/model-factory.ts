import type { Model } from "@strands-agents/sdk";
import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";

export type RemoteProvider = "bedrock" | "openai" | "openrouter";
export type ModelConfig = { provider: RemoteProvider; modelId: string; region?: string };

const MAX_TOKENS = 8192;

export function createModel(config: ModelConfig): Model {
  if (config.provider === "bedrock") return new BedrockModel({ modelId: config.modelId, region: config.region ?? "us-west-2", maxTokens: MAX_TOKENS });
  if (config.provider === "openrouter") {
    if (!process.env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY is not set");
    process.env.OPENAI_API_KEY = process.env.OPENROUTER_API_KEY;
    return new OpenAIModel({ modelId: config.modelId, maxTokens: MAX_TOKENS, clientConfig: { baseURL: "https://openrouter.ai/api/v1" } });
  }
  return new OpenAIModel({ modelId: config.modelId, maxTokens: MAX_TOKENS });
}

export function defaultModel(provider: RemoteProvider): string {
  if (provider === "bedrock") return "anthropic.claude-3-5-sonnet-20241022-v2:0";
  if (provider === "openai") return "gpt-4.1";
  return "anthropic/claude-sonnet-4";
}
