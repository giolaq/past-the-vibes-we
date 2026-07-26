import { McpClient } from "@strands-agents/sdk";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";
import { snapshotHash } from "../project-memory.js";
import { runProcess } from "../process.js";
import type { ContextSnapshot } from "../contracts.js";
import type { ContextCandidate, ContextProvider } from "./types.js";

type BeeConversation = { id: string; recordedAt?: string; title?: string; summary?: string; decisions?: string[]; constraints?: string[]; openQuestions?: string[] };

export class BeeContextProvider implements ContextProvider {
  constructor(private command = process.env.BEE_BIN ?? "bee") {}

  async search(query: string): Promise<ContextCandidate[]> {
    const result = await runProcess(this.command, ["conversations", "search", query, "--json"], 5_000);
    if (result.code !== 0) throw new Error(`Bee search failed: ${result.stderr.trim() || `exit ${result.code}`}`);
    const parsed = JSON.parse(result.stdout) as { conversations?: BeeConversation[] } | BeeConversation[];
    const rows = Array.isArray(parsed) ? parsed : parsed.conversations ?? [];
    return rows.map((row) => ({ id: row.id, recordedAt: row.recordedAt ?? "unknown", title: row.title ?? "Bee conversation", summary: row.summary }));
  }

  async snapshot(ids: string[], query: string): Promise<ContextSnapshot> {
    const rows: BeeConversation[] = [];
    for (const id of ids) {
      const result = await runProcess(this.command, ["conversations", "get", id, "--json"], 5_000);
      if (result.code !== 0) throw new Error(`Bee conversation ${id} failed: ${result.stderr.trim() || `exit ${result.code}`}`);
      rows.push(JSON.parse(result.stdout) as BeeConversation);
    }
    const base = {
      schemaVersion: 1 as const,
      provider: "bee" as const,
      capturedAt: new Date().toISOString(),
      query,
      sources: rows.map((row) => ({ id: row.id, recordedAt: row.recordedAt ?? "unknown" })),
      decisions: rows.flatMap((row) => row.decisions ?? []),
      constraints: rows.flatMap((row) => row.constraints ?? []),
      openQuestions: rows.flatMap((row) => row.openQuestions ?? []),
    };
    return { ...base, summaryHash: snapshotHash(base) };
  }
}

/** `bee mcp serve` speaks MCP over stdio. Override the binary with BEE_BIN. */
export const BEE_SERVER = "bee";

/**
 * Model-driven Bee access, the same shape as ADBT: the harness hands the client to the agent
 * and Strands discovers the tools (`bee_search`, the conversation readers, and whatever else the
 * installed version exposes). The harness names none of them — the published tool list is
 * explicitly partial, so discovery is the only honest option.
 *
 * Authentication happens outside the harness: `bee login`, or `bee login --token-stdin`.
 */
export function createBeeMcpClient(options: { command?: string; commandArgs?: string[]; cwd?: string } = {}): McpClient {
  return new McpClient({
    applicationName: "Past the Vibes Workshop",
    applicationVersion: "0.1.0",
    transport: new StdioClientTransport({
      command: options.command ?? process.env.BEE_BIN ?? "bee",
      args: options.commandArgs ?? ["mcp", "serve"],
      cwd: options.cwd,
      stderr: "pipe",
    }),
  });
}

/** What was consulted, and proof it was not altered — with none of what was said. */
export type BeeRead = { tool: string; reference: string; sha256: string };
export type BeeProvenance = { schemaVersion: 1; mode: "live" | "replay"; capturedAt: string; reads: BeeRead[] };

/**
 * Provenance for a conversation, deliberately unlike ADBT's. ADBT excerpts are vendor
 * documentation and safe to keep; a conversation is not. So this records the tool, the reference
 * it was called with, and a hash of what came back — enough to prove what the run consulted and
 * that nobody edited it afterwards, and not enough to reconstruct a word of it.
 */
export function extractBeeProvenance(messages: unknown[]): BeeProvenance {
  const uses = new Map<string, { tool: string; reference: string }>();
  const reads: BeeRead[] = [];
  for (const message of messages) {
    const content = (message as { content?: unknown[] } | null)?.content ?? [];
    for (const block of content) {
      const use = (block as { toolUse?: { toolUseId: string; name: string; input?: unknown } }).toolUse;
      if (use && stripPrefix(use.name).startsWith("bee")) {
        const input = use.input as Record<string, unknown> | undefined;
        const reference = ["conversation_id", "id", "query"].map((key) => input?.[key]).find((value) => typeof value === "string");
        uses.set(use.toolUseId, { tool: stripPrefix(use.name), reference: (reference as string) ?? "" });
      }
      const result = (block as { toolResult?: { toolUseId: string; content?: unknown[] } }).toolResult;
      const pending = result && uses.get(result.toolUseId);
      if (result && pending) {
        const text = resultText(result.content ?? []);
        if (text) reads.push({ ...pending, sha256: `sha256:${createHash("sha256").update(text).digest("hex")}` });
      }
    }
  }
  return { schemaVersion: 1, mode: "live", capturedAt: new Date().toISOString(), reads };
}

/** The recorded conversation the key-free run reads instead of calling Bee. */
export type RecordedBeeConversation = { id: string; recordedAt: string; transcript: string[] };
export type RecordedBeeContext = { query: string; sha256: string; conversations: RecordedBeeConversation[] };

const RecordedContextSchema = z.object({
  schemaVersion: z.literal(1),
  query: z.string().min(1),
  sha256: z.string().regex(/^sha256:[0-9a-f]{64}$/, "must be sha256:<64 hex digits>"),
  conversations: z.array(z.object({
    id: z.string().min(1),
    recordedAt: z.string().min(1),
    transcript: z.array(z.string()).min(1),
  })).min(1),
});

/** Hashes the conversations only, so the fixture's own prose can be edited without breaking it. */
export function beeConversationHash(conversations: RecordedBeeConversation[]): string {
  const canonical = conversations.map((conversation) => [conversation.id, conversation.recordedAt, ...conversation.transcript].join("\n")).join("\n\n");
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

/**
 * Loads a recorded conversation and verifies its hash. A recording is an input the model acts on,
 * so it gets the same treatment as any other: if the bytes do not match what was reviewed, the run
 * stops rather than quietly working from an edited transcript.
 */
export function loadRecordedBeeContext(path: string): RecordedBeeContext {
  const parsed = RecordedContextSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  const actual = beeConversationHash(parsed.conversations);
  if (actual !== parsed.sha256) throw new Error(`Recorded conversation ${path} does not match its hash: declared ${parsed.sha256}, computed ${actual}`);
  return { query: parsed.query, sha256: parsed.sha256, conversations: parsed.conversations };
}

/** Replay provenance: the same shape as the live path, from the hash the fixture declares. */
export function recordedBeeProvenance(context: RecordedBeeContext): BeeProvenance {
  return {
    schemaVersion: 1,
    mode: "replay",
    capturedAt: new Date().toISOString(),
    reads: context.conversations.map((conversation) => ({ tool: "recorded_conversation", reference: conversation.id, sha256: context.sha256 })),
  };
}

function stripPrefix(name: string): string { return name.includes("___") ? name.split("___").pop()! : name; }
function resultText(content: unknown[]): string {
  return content.flatMap((item) => (item && typeof item === "object" && "text" in item && typeof (item as { text: unknown }).text === "string" ? [(item as { text: string }).text] : [])).join("\n");
}
