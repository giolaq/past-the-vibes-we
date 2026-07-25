/**
 * The lifecycle already captured the device log; until now nothing read it. An app that dies
 * a second after launch still leaves `launch-app .. success` on stdout, so the log is the only
 * place the crash is visible. These are the signatures a Vega/Android runtime writes when a
 * process aborts, hangs, or throws out of the JS bundle.
 */
const CRASH_SIGNATURES: Array<{ label: string; pattern: RegExp }> = [
  { label: "fatal exception", pattern: /\bFATAL\b/ },
  { label: "native signal", pattern: /\b(SIGSEGV|SIGABRT|SIGBUS|SIGILL|signal 6|signal 11)\b/ },
  { label: "process died", pattern: /\b(has died|process has died|Process .* died)\b/ },
  { label: "not responding", pattern: /\bANR in\b/i },
  { label: "unhandled javascript error", pattern: /unhandled (js|javascript) exception|unhandled promise rejection/i },
  { label: "uncaught exception", pattern: /terminating app due to uncaught exception|beginning of crash/i },
];

/** Cap the report so one crash loop cannot fill the result file. */
const MAX_MATCHES = 5;

export type DeviceLogScan = { crashed: boolean; lines: number; matches: string[] };

export function scanDeviceLog(text: string): DeviceLogScan {
  const lines = text.split("\n");
  const matches: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const signature = CRASH_SIGNATURES.find((candidate) => candidate.pattern.test(trimmed));
    if (!signature) continue;
    const match = `${signature.label}: ${trimmed.slice(0, 240)}`;
    if (!matches.includes(match)) matches.push(match);
    if (matches.length === MAX_MATCHES) break;
  }
  return { crashed: matches.length > 0, lines: lines.filter((line) => line.trim()).length, matches };
}
