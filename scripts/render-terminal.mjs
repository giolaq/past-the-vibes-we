#!/usr/bin/env node
// Renders a terminal illustration for the workshop site from a committed spec, so the images
// in workshop/assets are reproducible instead of hand-captured. Each PNG has a sibling
// <name>.terminal.json holding the exact lines; edit that and re-run this.
//
// The lines must be real output. If you change what a command prints, re-run the command,
// paste the new output into the spec, and regenerate.
//
// Usage: node scripts/render-terminal.mjs workshop/assets/retry-terminal.terminal.json
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const specPath = resolve(process.argv[2] ?? "");
if (!existsSync(specPath)) {
  process.stderr.write("Usage: node scripts/render-terminal.mjs <spec.terminal.json>\n");
  process.exit(1);
}
const spec = JSON.parse(readFileSync(specPath, "utf8"));
const out = resolve(spec.out ?? specPath.replace(/\.terminal\.json$/, ".png"));
const width = spec.width ?? 1280;
const height = spec.height ?? 720;

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const chrome = CHROME_CANDIDATES.find((path) => existsSync(path));
if (!chrome) {
  process.stderr.write(`No Chromium found. Set CHROME_BIN.\nTried:\n${CHROME_CANDIDATES.map((path) => `  ${path}`).join("\n")}\n`);
  process.exit(3);
}

const escape = (text) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const line = (entry) => {
  if (typeof entry === "string") return `<div class="row">${escape(entry)}</div>`;
  if (entry.blank) return '<div class="row">&nbsp;</div>';
  const label = entry.label ? `<span class="${entry.tone ?? "plain"}">${escape(entry.label)}</span>` : "";
  return `<div class="row">${label}${escape(entry.text ?? "")}</div>`;
};

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: ${width}px; height: ${height}px; overflow: hidden; background: #dfe4e9; padding: 40px 44px; font-family: "DejaVu Sans Mono", monospace; }
  .window { background: #0d1117; border-radius: 8px; overflow: hidden; box-shadow: 0 18px 40px #1b2a3a33; }
  .bar { display: flex; align-items: center; gap: 8px; background: #1c2733; padding: 13px 18px; }
  .dot { width: 11px; height: 11px; border-radius: 50%; }
  .title { margin-left: 12px; color: #cfd9e2; font-family: "DejaVu Sans", Arial, sans-serif; font-size: 13px; font-weight: 700; }
  .body { padding: 26px 30px; color: #e6edf2; font-size: 16px; line-height: 1.75; }
  .row { white-space: pre-wrap; }
  .prompt { color: #F6C453; }
  .phase { color: #7ee2a8; }
  .fail { color: #ef8a7a; }
  .note { color: #79b8ff; }
  .dim { color: #8b98a5; }
</style>
<div class="window">
  <div class="bar">
    <span class="dot" style="background:#ec6a5e"></span><span class="dot" style="background:#f4bf4f"></span><span class="dot" style="background:#61c554"></span>
    <span class="title">${escape(spec.title ?? "")}</span>
  </div>
  <div class="body">${spec.lines.map(line).join("")}</div>
</div>
`;

const page = join(mkdtempSync(join(tmpdir(), "terminal-")), "terminal.html");
writeFileSync(page, html);
const result = spawnSync(chrome, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--force-device-scale-factor=1", `--window-size=${width},${height}`,
  `--screenshot=${out}`, pathToFileURL(page).href,
], { stdio: ["ignore", "ignore", "pipe"] });
if (result.status !== 0 || !existsSync(out)) {
  process.stderr.write(`Chromium failed: ${result.stderr?.toString().slice(0, 800) ?? `exit ${result.status}`}\n`);
  process.exit(2);
}
process.stdout.write(`${out}\n`);
