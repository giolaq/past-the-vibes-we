import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type TranscriptExecutor = "strands" | "claude-cli" | "replay" | "harness";
export type TranscriptDirection = "to_model" | "from_model" | "tool" | "system";

export type TranscriptEntry = {
  schemaVersion: 1;
  timestamp: string;
  sequence: number;
  phase: string;
  attempt: number;
  executor: TranscriptExecutor;
  direction: TranscriptDirection;
  kind: string;
  payload: unknown;
};

type EntryInput = Omit<TranscriptEntry, "schemaVersion" | "timestamp" | "sequence" | "phase">;

/**
 * Append-only JSONL makes every model exchange readable while the phase is still running:
 *
 *   tail -f out/<runId>/model-logs/plan.jsonl | jq .
 *
 * Payloads are never shortened. Each append is one physical line, so a tailing reader never
 * observes half an event. Existing files are continued on resume rather than overwritten.
 */
export class ModelTranscriptStore {
  readonly directory: string;
  private sequences = new Map<string, number>();

  constructor(outDir: string, private onEntry?: (entry: TranscriptEntry) => void) {
    this.directory = join(outDir, "model-logs");
    mkdirSync(this.directory, { recursive: true });
  }

  pathFor(phase: string): string {
    return join(this.directory, `${safePhaseName(phase)}.jsonl`);
  }

  append(phase: string, input: EntryInput): TranscriptEntry {
    const entry: TranscriptEntry = {
      schemaVersion: 1,
      timestamp: new Date().toISOString(),
      sequence: this.nextSequence(phase),
      phase,
      ...input,
    };
    appendFileSync(this.pathFor(phase), `${JSON.stringify(entry, jsonReplacer)}\n`);
    this.onEntry?.(entry);
    return entry;
  }

  files(): string[] {
    if (!existsSync(this.directory)) return [];
    return readdirSync(this.directory)
      .filter((name) => name.endsWith(".jsonl"))
      .sort()
      .map((name) => join(this.directory, name));
  }

  /** Replays durable events into a resumed observer such as the interactive dashboard. */
  replayExisting(onEntry: (entry: TranscriptEntry) => void): void {
    for (const path of this.files()) {
      for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
        try {
          const entry = JSON.parse(line) as Partial<TranscriptEntry>;
          if (
            entry.schemaVersion === 1 &&
            typeof entry.timestamp === "string" &&
            typeof entry.sequence === "number" &&
            typeof entry.phase === "string" &&
            typeof entry.attempt === "number" &&
            typeof entry.executor === "string" &&
            typeof entry.direction === "string" &&
            typeof entry.kind === "string"
          ) {
            onEntry(entry as TranscriptEntry);
          }
        } catch {
          // Keep a damaged line on disk for inspection without breaking the dashboard.
        }
      }
    }
  }

  private nextSequence(phase: string): number {
    const known = this.sequences.get(phase);
    if (known !== undefined) {
      this.sequences.set(phase, known + 1);
      return known + 1;
    }
    const path = this.pathFor(phase);
    let last = 0;
    if (existsSync(path)) {
      for (const line of readFileSync(path, "utf8").split("\n").filter(Boolean)) {
        try {
          const sequence = Number((JSON.parse(line) as { sequence?: number }).sequence);
          if (Number.isFinite(sequence)) last = Math.max(last, sequence);
        } catch {
          // Preserve a damaged log for inspection; continue with a monotonic sequence.
        }
      }
    }
    this.sequences.set(phase, last + 1);
    return last + 1;
  }
}

/** Consumes an async generator without losing its return value, recording every yielded event. */
export async function consumeStream<TEvent, TResult>(
  stream: AsyncGenerator<TEvent, TResult, undefined>,
  onEvent: (event: TEvent) => void,
): Promise<TResult> {
  while (true) {
    const next = await stream.next();
    if (next.done) return next.value;
    onEvent(next.value);
  }
}

export function serializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, jsonReplacer));
}

function safePhaseName(phase: string): string {
  const safe = phase.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return safe || "unknown";
}

function jsonReplacer(_key: string, value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack };
  return value;
}
