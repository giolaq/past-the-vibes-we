import { Agent } from "@strands-agents/sdk";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { consumeStream, ModelTranscriptStore, serializable } from "../model-transcript.js";
import { createModel, type ModelConfig } from "../model-factory.js";
import type { ScreenshotJudge } from "./vega.js";

/**
 * The optional second opinion on a device frame. The deterministic gate in `screenshot.ts`
 * proves the frame is not a placeholder, a black screen, or one flat colour — it cannot tell
 * a rendered app from a rendered error dialog. A multimodal model can, so this asks one for a
 * bounded verdict. Opt in with `--evaluate-screenshot`; the key-free path never reaches here.
 */
export const ScreenshotReviewSchema = z.object({
  verdict: z.enum(["app", "not-app", "unclear"]).describe("app when the frame shows the running TV app, not-app when it shows a crash, error, launcher, or blank screen, unclear when you cannot tell"),
  visible: z.string().min(1).describe("What is actually on the screen, in one sentence"),
  problems: z.array(z.string()).default([]).describe("Error dialogs, missing content, or an obviously broken layout"),
  reasoning: z.string().min(1).describe("Why this verdict, citing what you saw"),
});

export type ScreenshotReview = z.infer<typeof ScreenshotReviewSchema>;

const PROMPT = `This is a screenshot pulled from a Fire TV (Vega) device moments after launching a ported React Native app.

Judge only what the pixels show. Answer these:
1. Is a TV application interface rendered, or is this a crash dialog, system error, launcher, or blank screen?
2. Is anything visibly broken: an error message, an empty screen where content belongs, text running off the edges?

Set verdict to "not-app" only when the frame clearly is not the running app. Use "unclear" when the frame is ambiguous rather than guessing.`;

export function createScreenshotJudge(config: ModelConfig, transcripts?: ModelTranscriptStore): ScreenshotJudge {
  return async (path: string, context = { phase: "test", attempt: 0 }) => {
    const systemPrompt = "You review device screenshots for a build harness. Report what is visible. Never assume the app works because it was supposed to.";
    const image = readFileSync(path);
    const agent = new Agent({
      name: "vega-screenshot-review",
      description: "Judges one device screenshot pulled after launching the ported app.",
      model: createModel(config),
      structuredOutputSchema: ScreenshotReviewSchema,
      systemPrompt,
      printer: false,
    });
    transcripts?.append(context.phase, {
      attempt: context.attempt, executor: "strands", direction: "to_model", kind: "screenshot_review_request",
      // Keep the exact text and a content-addressed image reference. The binary remains beside
      // the transcript; duplicating it as thousands of JSON integers would make tail unusable.
      payload: {
        model: `${config.provider}:${config.modelId}`,
        systemPrompt,
        messages: [{ text: PROMPT }, { image: { format: "png", path, bytes: image.length, sha256: createHash("sha256").update(image).digest("hex") } }],
      },
    });
    let result;
    try {
      result = await consumeStream(
        agent.stream(
          [{ text: PROMPT }, { image: { format: "png", source: { bytes: image } } }],
          { cancelSignal: AbortSignal.timeout(2 * 60_000), limits: { turns: 2, totalTokens: 8_000 } },
        ),
        (event) => {
          const payload = serializable(event);
          const type = payload && typeof payload === "object" && "type" in payload ? String(payload.type) : "stream_event";
          transcripts?.append(context.phase, {
            attempt: context.attempt,
            executor: "strands",
            direction: type.includes("Tool") || type.includes("tool") ? "tool" : type.includes("model") || type.includes("Model") || type.includes("contentBlock") || type === "agentResultEvent" ? "from_model" : "system",
            kind: `screenshot_${type}`,
            payload,
          });
        },
      );
    } catch (error) {
      transcripts?.append(context.phase, {
        attempt: context.attempt, executor: "strands", direction: "system", kind: "screenshot_review_error", payload: error,
      });
      throw error;
    }
    if (!result.structuredOutput) throw new Error("screenshot review returned no verdict");
    const review = ScreenshotReviewSchema.parse(result.structuredOutput);
    transcripts?.append(context.phase, {
      attempt: context.attempt, executor: "strands", direction: "from_model", kind: "screenshot_review_result",
      payload: { review, usage: result.metrics?.accumulatedUsage },
    });
    return { verdict: review.verdict, reasoning: `${review.visible} ${review.reasoning}${review.problems.length ? ` Problems: ${review.problems.join("; ")}.` : ""}`.trim() };
  };
}
