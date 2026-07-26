import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSkillsPlugin, injectSkillText, loadSkills } from "../src/skills.js";

// Mimics the ADBT skill layout: <skills dir>/<name>/SKILL.md with a plain Markdown body
// (no frontmatter), as `init-context` installs it.
const skillsDir = mkdtempSync(join(tmpdir(), "workshop-skills-"));
writeSkill("amazon-devices-vega-focus-management", "# Focus Management\n\nFocus moves to the closest item in the D-Pad direction.");
writeSkill("amazon-devices-vega-build-and-run", "# Build and Run Vega App\n\nBuild the .vpkg before deploying to a device.");
writeSkill("team-open-questions", "---\nname: team-open-questions\ndescription: One team rule\n---\n\nEnd every document with ## Open Questions.");

const skills = loadSkills(["amazon-devices-vega-focus-management", "amazon-devices-vega-build-and-run"], skillsDir);

test("plain-Markdown ADBT skills load with derived names and descriptions", () => {
  assert.deepEqual(skills.map((skill) => skill.name), ["amazon-devices-vega-focus-management", "amazon-devices-vega-build-and-run"]);
  assert.equal(skills[0].description, "Focus Management");
});

test("frontmatter overrides the derived name and description", () => {
  const [skill] = loadSkills(["team-open-questions"], skillsDir);
  assert.equal(skill.name, "team-open-questions");
  assert.equal(skill.description, "One team rule");
  assert.equal(skill.body, "End every document with ## Open Questions.");
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
  // No skills selected means the prompt is untouched.
  assert.equal(injectSkillText("Plan the port", []), "Plan the port");
});

test("Strands AgentSkills receives the selected skills", async () => {
  const plugin = createSkillsPlugin(skills);
  const available = await plugin.getAvailableSkills();
  assert.deepEqual(available.map((skill) => skill.name), ["amazon-devices-vega-focus-management", "amazon-devices-vega-build-and-run"]);
});

function writeSkill(name: string, body: string): void {
  mkdirSync(join(skillsDir, name), { recursive: true });
  writeFileSync(join(skillsDir, name, "SKILL.md"), body);
}
