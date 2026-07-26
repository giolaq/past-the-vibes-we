import { Agent } from "@strands-agents/sdk";
import { readFileSync } from "node:fs";
import { z } from "zod";
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

export function createScreenshotJudge(config: ModelConfig): ScreenshotJudge {
  return async (path: string) => {
    const agent = new Agent({
      name: "vega-screenshot-review",
      description: "Judges one device screenshot pulled after launching the ported app.",
      model: createModel(config),
      structuredOutputSchema: ScreenshotReviewSchema,
      systemPrompt: "You review device screenshots for a build harness. Report what is visible. Never assume the app works because it was supposed to.",
      printer: false,
    });
    const result = await agent.invoke(
      [{ text: PROMPT }, { image: { format: "png", source: { bytes: readFileSync(path) } } }],
      { cancelSignal: AbortSignal.timeout(2 * 60_000), limits: { turns: 2, totalTokens: 8_000 } },
    );
    if (!result.structuredOutput) throw new Error("screenshot review returned no verdict");
    const review = ScreenshotReviewSchema.parse(result.structuredOutput);
    return { verdict: review.verdict, reasoning: `${review.visible} ${review.reasoning}${review.problems.length ? ` Problems: ${review.problems.join("; ")}.` : ""}`.trim() };
  };
}
