import { z } from "zod";

export const PortOutputSchema = z.object({
  summary: z.string().min(1).describe("Short summary used for the verified phase commit"),
  files: z.record(
    z.string().describe("Path relative to the guarded app root"),
    z.string().describe("Complete file contents"),
  ).describe("Files proposed by the agent; the harness validates and writes them"),
});

/**
 * Pulls the first JSON object out of a model response and validates it. Live models wrap JSON in
 * prose, so the extraction is necessary — but a response with no JSON at all is reported as
 * exactly that, instead of feeding "{}" to Zod and blaming the schema.
 */
export function parseJsonBlock<T extends z.ZodTypeAny>(text: string, schema: T, label: string): z.infer<T> {
  const block = text.match(/\{[\s\S]*\}/)?.[0];
  if (!block) throw new Error(`${label} returned no JSON object: ${text.slice(0, 200)}`);
  return schema.parse(JSON.parse(block));
}
