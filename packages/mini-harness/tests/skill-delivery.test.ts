import assert from "node:assert/strict";
import test from "node:test";
import { createSkillsPlugin, injectSkillText } from "../model-runtime.js";
import { buildPhasePrompt } from "../steps/04-skills/phase-context.js";
import { loadSkills } from "../steps/04-skills/skills.js";

const skills = loadSkills(["react-native-analysis", "tv-build-test"]);

test("Claude CLI prompt injection includes full skill instructions", () => {
  const prompt = injectSkillText("Analyze the app", skills);
  assert.match(prompt, /Skills:/);
  assert.match(prompt, /Read the current screens/);
  assert.match(prompt, /Record a screenshot as evidence/);
});

test("Strands AgentSkills receives the selected skills", async () => {
  const plugin = createSkillsPlugin(skills);
  const available = await plugin.getAvailableSkills();
  assert.deepEqual(available.map((skill) => skill.name), ["react-native-analysis", "tv-build-test"]);
});

test("base phase prompt does not duplicate skill bodies", () => {
  const prompt = buildPhasePrompt(
    { name: "build_test", prompt: "Build and test", skills: ["tv-build-test"], verify: { type: "file_exists", path: "out/BUILD_TEST.md" } },
    { outDir: "out", summaries: [], costUsd: 0 },
  );
  assert.doesNotMatch(prompt, /Record a screenshot as evidence/);
});
