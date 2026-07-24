import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { appSourceBlock } from "../app-source.js";
import { createSkillsPlugin, injectSkillText } from "../model-runtime.js";
import { buildPhasePrompt } from "../steps/04-skills/phase-context.js";
import { loadSkills } from "../steps/04-skills/skills.js";

// Mimics the ADBT skill layout: <skills dir>/<name>/SKILL.md with a plain
// Markdown body (no frontmatter), as installed by `init-context`.
const skillsDir = mkdtempSync(join(tmpdir(), "mini-skills-"));
writeSkill("amazon-devices-vega-focus-management", "# Focus Management\n\nFocus moves to the closest item in the D-Pad direction.");
writeSkill("amazon-devices-vega-build-and-run", "# Build and Run Vega App\n\nBuild the .vpkg before deploying to a device.");

const skills = loadSkills(["amazon-devices-vega-focus-management", "amazon-devices-vega-build-and-run"], skillsDir);

test("plain-Markdown ADBT skills load with derived names and descriptions", () => {
  assert.deepEqual(skills.map((skill) => skill.name), ["amazon-devices-vega-focus-management", "amazon-devices-vega-build-and-run"]);
  assert.equal(skills[0].description, "Focus Management");
});

test("a missing skill is skipped instead of failing the run", () => {
  const loaded = loadSkills(["amazon-devices-vega-focus-management", "not-installed"], skillsDir);
  assert.deepEqual(loaded.map((skill) => skill.name), ["amazon-devices-vega-focus-management"]);
});

test("Claude CLI prompt injection includes full skill instructions", () => {
  const prompt = injectSkillText("Plan the port", skills);
  assert.match(prompt, /Skills:/);
  assert.match(prompt, /closest item in the D-Pad direction/);
  assert.match(prompt, /\.vpkg before deploying/);
});

test("Strands AgentSkills receives the selected skills", async () => {
  const plugin = createSkillsPlugin(skills);
  const available = await plugin.getAvailableSkills();
  assert.deepEqual(available.map((skill) => skill.name), ["amazon-devices-vega-focus-management", "amazon-devices-vega-build-and-run"]);
});

test("base phase prompt does not duplicate skill bodies", () => {
  const prompt = buildPhasePrompt(
    { name: "plan", prompt: "Plan the port", skills: ["amazon-devices-vega-focus-management"], verify: { type: "file_exists", path: "out/TV_PORT_PLAN.md" } },
    { outDir: "out", summaries: [], costUsd: 0 },
  );
  assert.doesNotMatch(prompt, /closest item in the D-Pad direction/);
});

test("the phase prompt embeds the whole app source", () => {
  const appDir = mkdtempSync(join(tmpdir(), "mini-app-"));
  mkdirSync(join(appDir, "src"));
  writeFileSync(join(appDir, "src", "App.tsx"), "export const App = 1;");
  writeFileSync(join(appDir, "notes.md"), "ignore me");
  const prompt = buildPhasePrompt(
    { name: "analyze", prompt: "Analyze.", skills: [], verify: { type: "file_exists", path: "out/ANALYSIS.md" } },
    { outDir: appDir, summaries: [], costUsd: 0 },
  );
  assert.match(prompt, /## Current app source/);
  assert.match(prompt, /src\/App\.tsx/);
  assert.match(prompt, /export const App = 1;/);
  assert.doesNotMatch(prompt, /ignore me/);
  assert.equal(appSourceBlock(join(appDir, "does-not-exist")), "");
});

function writeSkill(name: string, body: string): void {
  mkdirSync(join(skillsDir, name), { recursive: true });
  writeFileSync(join(skillsDir, name, "SKILL.md"), body);
}
