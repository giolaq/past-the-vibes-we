#!/usr/bin/env node
// Renders the ported Pocket Cinema home screen to a 1280x720 PNG for the key-free Vega replay.
// The fixture screenshot has to survive the harness screenshot gate, so it must be a real
// rendered frame rather than a placeholder. Layout and colours mirror src/App.tsx and
// src/catalog.ts in workshop/checkpoints/vega-buildable/app.
//
// The PNG is 1280x720, but Chromium only paints the top ~633px of a 720px window, so the
// layout is kept inside that band. The rest is body background, the same #101214, so the
// frame has no seam. If you change the layout, re-render and look at the result.
//
// Usage: node scripts/render-tv-frame.mjs [--out <file.png>]
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const flag = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const out = resolve(flag("--out") ?? join(root, "workshop/fixtures/vega-lifecycle/launch-frame.png"));

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
  process.stderr.write(`No Chromium found. Set CHROME_BIN to a Chrome or Chromium binary.\nTried:\n${CHROME_CANDIDATES.map((path) => `  ${path}`).join("\n")}\n`);
  process.exit(3);
}

const movies = [
  { id: "signal", title: "Signal Coast", year: 2026, genre: "Mystery", color: "#176B87", description: "A radio host follows a transmission across a fogbound coastline." },
  { id: "orbit", title: "Small Orbit", year: 2025, genre: "Drama", color: "#5B4B8A" },
  { id: "paper", title: "Paper City", year: 2024, genre: "Adventure", color: "#C05746" },
  { id: "seconds", title: "Borrowed Seconds", year: 2026, genre: "Thriller", color: "#2D6A4F" },
  { id: "garden", title: "The Quiet Garden", year: 2023, genre: "Documentary", color: "#6A7B53" },
  { id: "lantern", title: "Lantern Weather", year: 2025, genre: "Comedy", color: "#D18B28" },
  { id: "frame", title: "Outside the Frame", year: 2024, genre: "Drama", color: "#7A3E65" },
  { id: "north", title: "Northbound", year: 2026, genre: "Adventure", color: "#326273" },
];

const featured = movies[0];
const byId = (id) => movies.find((movie) => movie.id === id);
const rails = [
  { title: "New this week", movies: ["orbit", "paper", "seconds", "garden"].map(byId), focusedId: "orbit" },
  { title: "Stories to settle into", movies: ["lantern", "frame", "north"].map(byId), focusedId: null },
];
const card = (movie, focused) => `
  <div class="card${focused ? " focused" : ""}">
    <div class="poster" style="background:${movie.color}"><span>${movie.title.slice(0, 1)}</span></div>
    <p class="card-title">${movie.title}</p>
    <p class="meta">${movie.genre} &middot; ${movie.year}</p>
  </div>`;

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1280px; height: 720px; overflow: hidden; background: #101214; font-family: "DejaVu Sans", Arial, sans-serif; padding: 28px 32px; }
  .brand { color: #F6C453; font-size: 15px; font-weight: 800; letter-spacing: 1px; margin-bottom: 14px; }
  .hero { background: ${featured.color}; border-radius: 6px; padding: 22px 26px; height: 176px; display: flex; flex-direction: column; justify-content: flex-end; }
  .eyebrow { color: #fff; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
  .hero-title { color: #fff; font-size: 36px; font-weight: 800; margin-top: 4px; }
  .description { color: #ECEFF1; font-size: 16px; line-height: 22px; margin-top: 8px; max-width: 560px; }
  .button { align-self: flex-start; background: #F6C453; color: #101214; font-size: 14px; font-weight: 800; border-radius: 4px; margin-top: 16px; padding: 11px 20px; border: 3px solid transparent; }
  .rail-title { color: #fff; font-size: 20px; font-weight: 700; margin: 18px 0 10px; }
  .rail { display: flex; gap: 15px; }
  .card { width: 175px; border: 3px solid transparent; padding-bottom: 5px; }
  .card.focused { border-color: #fff; transform: scale(1.04); }
  .poster { height: 92px; display: flex; align-items: center; justify-content: center; }
  .poster span { color: #fff; font-size: 43px; font-weight: 900; }
  .card-title { color: #fff; font-size: 15px; font-weight: 700; margin-top: 7px; }
  .meta { color: #A8B0B7; font-size: 12px; margin-top: 2px; }
</style>
<p class="brand">POCKET CINEMA</p>
<div class="hero">
  <p class="eyebrow">FEATURED TONIGHT</p>
  <p class="hero-title">${featured.title}</p>
  <p class="description">${featured.description}</p>
  <div class="button">View details</div>
</div>
${rails.map((rail) => `<p class="rail-title">${rail.title}</p>
<div class="rail">${rail.movies.map((movie) => card(movie, movie.id === rail.focusedId)).join("")}</div>`).join("\n")}
`;

const scratch = mkdtempSync(join(tmpdir(), "tv-frame-"));
const page = join(scratch, "frame.html");
writeFileSync(page, html);
mkdirSync(dirname(out), { recursive: true });

const result = spawnSync(chrome, [
  "--headless=new", "--disable-gpu", "--no-sandbox", "--hide-scrollbars",
  "--force-device-scale-factor=1", "--window-size=1280,720",
  `--screenshot=${out}`, pathToFileURL(page).href,
], { stdio: ["ignore", "ignore", "pipe"] });

if (result.status !== 0 || !existsSync(out)) {
  process.stderr.write(`Chromium failed to render the frame: ${result.stderr?.toString().slice(0, 800) ?? `exit ${result.status}`}\n`);
  process.exit(2);
}
process.stdout.write(`${out}\n`);
