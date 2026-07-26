import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";
import { containedPath, type PortCheck } from "./port-verification.js";

/**
 * What the harness extracts from a conversation, for a human to approve before any code exists.
 *
 * Two properties carry the privacy argument. `request` is the harness's paraphrase plus a source
 * id — never quoted transcript, so the approved artifact can be committed. And `excluded` records
 * what was deliberately left behind, which is the part a reviewer should read hardest.
 *
 * Each request carries the check that will prove it. The criteria are frozen and signed off
 * before the code is written, so the model never grades its own work.
 */
export const BeeSpecCheckSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("file_exists"), path: z.string().min(1), label: z.string().min(1) }),
  z.object({ type: z.literal("contains"), path: z.string().min(1), value: z.string().min(1), label: z.string().min(1) }),
]);

export const BeeRequestSchema = z.object({
  id: z.string().min(1).describe("Short stable slug for this request"),
  request: z.string().min(1).describe("What the conversation asked for, in your own words. Never quote the transcript."),
  rationale: z.string().min(1).describe("Why you believe the conversation asked for this"),
  source: z.object({
    conversationId: z.string().min(1),
    recordedAt: z.string().min(1),
  }).describe("Which conversation this came from, so a reviewer can go back to it"),
  check: BeeSpecCheckSchema.describe("The file assertion that will prove this request was implemented"),
});

export const BeeSpecSchema = z.object({
  schemaVersion: z.literal(1),
  capturedAt: z.string().min(1),
  query: z.string().min(1),
  conversations: z.array(z.object({ id: z.string().min(1), recordedAt: z.string().min(1) })).min(1),
  requests: z.array(BeeRequestSchema).min(1),
  excluded: z.array(z.string()).default([]).describe("Anything discussed that you deliberately did not bring across, and why"),
});

export type BeeSpec = z.infer<typeof BeeSpecSchema>;

export const BEE_SPEC_JSON = "bee-spec.json";
export const BEE_SPEC_MD = "BEE_SPEC.md";

export function loadBeeSpec(appDir: string): BeeSpec | null {
  const path = `${appDir}/${BEE_SPEC_JSON}`;
  if (!existsSync(path)) return null;
  return BeeSpecSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

/**
 * Turns the approved requests into checks the harness runs. Only file assertions are allowed
 * through — a model-authored command line is a different kind of authority from a model-authored
 * assertion, and a human approving it does not make it safe. Paths must stay inside the app.
 */
export function beeChecks(spec: BeeSpec, appDir: string): PortCheck[] {
  return spec.requests.map((request) => {
    if (!containedPath(appDir, request.check.path)) {
      throw new Error(`Bee spec request ${request.id} points at ${request.check.path}, which resolves outside the app`);
    }
    const label = `${request.check.label} (${request.id}, from ${request.source.conversationId})`;
    return request.check.type === "file_exists"
      ? { type: "file_exists", path: request.check.path, label }
      : { type: "contains", path: request.check.path, value: request.check.value, label };
  });
}

/** The document a human actually reads before approving. No transcript, by construction. */
export function renderBeeSpec(spec: BeeSpec): string {
  const requests = spec.requests.map((request) => [
    `### ${request.id}`,
    "",
    request.request,
    "",
    `- Source: ${request.source.conversationId} (${request.source.recordedAt})`,
    `- Why: ${request.rationale}`,
    `- Proven by: ${request.check.type === "contains" ? `${request.check.path} contains ${JSON.stringify(request.check.value)}` : `${request.check.path} exists`}`,
  ].join("\n"));
  const excluded = spec.excluded.length ? spec.excluded.map((item) => `- ${item}`).join("\n") : "_Nothing was excluded._";
  return [
    "# Bee Spec",
    "",
    `Extracted ${spec.capturedAt} for the query ${JSON.stringify(spec.query)}.`,
    `Conversations: ${spec.conversations.map((item) => `${item.id} (${item.recordedAt})`).join(", ")}.`,
    "",
    "This document is a paraphrase with source ids, never a transcript. Read it before approving:",
    "each request below becomes code, and the check beside it becomes the bar that code must clear.",
    "",
    "## Requests",
    "",
    requests.join("\n\n"),
    "",
    "## Deliberately excluded",
    "",
    excluded,
    "",
  ].join("\n");
}
