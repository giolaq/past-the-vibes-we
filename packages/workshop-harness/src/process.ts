import { spawn } from "node:child_process";

/** `signal` is set when the process was killed rather than exiting on its own. */
export type ProcessResult = { code: number; stdout: string; stderr: string; timedOut: boolean; signal?: string };

/**
 * How much of one stream survives. A failing build can print megabytes, and this output becomes
 * retry context for a model with a 40,000-token limit — so keep the start (what it was doing)
 * and the end (where it failed), and say how much was dropped in between.
 */
export const MAX_CAPTURED_CHARS = 8_000;

export function runProcess(command: string, args: string[], timeoutMs = 10_000, cwd?: string, maxCapturedChars = MAX_CAPTURED_CHARS): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env: process.env });
    const stdout = new BoundedCapture(maxCapturedChars / 2);
    const stderr = new BoundedCapture(maxCapturedChars / 2);
    let timedOut = false;
    child.stdout.on("data", (chunk) => { stdout.add(String(chunk)); });
    child.stderr.on("data", (chunk) => { stderr.add(String(chunk)); });
    child.on("error", reject);
    const timer = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, timeoutMs);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: code ?? 3, stdout: stdout.text(), stderr: stderr.text(), timedOut, signal: signal ?? undefined });
    });
  });
}

class BoundedCapture {
  private head = "";
  private tail = "";
  private dropped = 0;
  constructor(private half = MAX_CAPTURED_CHARS / 2) {}

  add(chunk: string): void {
    if (this.head.length < this.half) {
      const room = this.half - this.head.length;
      this.head += chunk.slice(0, room);
      chunk = chunk.slice(room);
    }
    if (!chunk) return;
    const merged = this.tail + chunk;
    this.dropped += Math.max(0, merged.length - this.half);
    this.tail = merged.slice(-this.half);
  }

  text(): string {
    if (!this.tail) return this.head;
    return `${this.head}\n… ${this.dropped} characters elided …\n${this.tail}`;
  }
}
