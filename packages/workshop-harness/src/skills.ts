import { AgentSkills, Skill } from "@strands-agents/sdk/vended-plugins/skills";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

/**
 * A skill is domain knowledge the model reads; a check is code the harness runs. They live in
 * different files on purpose. Each phase in `port-pipeline.ts` names the skills it wants, and
 * the executor delivers them the way its model expects — text in the prompt for a CLI agent,
 * the AgentSkills plugin for Strands.
 */
export type ModelSkill = { name: string; description: string; body: string };

/** ADBT's `init-context` installs its amazon-devices-vega-* skills here. */
const DEFAULT_SKILLS_DIR = join(homedir(), ".claude", "skills");
const INSTALL_HINT = "npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force";

export function skillsDirectory(): string {
  return process.env.WORKSHOP_SKILLS_DIR ?? DEFAULT_SKILLS_DIR;
}

/** A missing skill is reported and skipped: an uninstalled skill must never block a run. */
export function loadSkills(names: string[], directory = skillsDirectory()): ModelSkill[] {
  return names.map((name) => loadSkill(name, directory)).filter((skill): skill is ModelSkill => skill !== null);
}

function loadSkill(name: string, directory: string): ModelSkill | null {
  const path = resolve(directory, name, "SKILL.md");
  if (!existsSync(path)) {
    process.stderr.write(`skill "${name}" not found in ${directory} — the run proceeds without it. Install the ADBT skills with: ${INSTALL_HINT}\n`);
    return null;
  }
  const raw = readFileSync(path, "utf8");
  // ADBT skill bodies are plain Markdown; some agent installers add YAML frontmatter.
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter = match?.[1] ?? "";
  const body = (match?.[2] ?? raw).trim();
  const declared = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? name;
  const description = frontmatter.match(/^description:\s*["']?(.+?)["']?$/m)?.[1]?.trim()
    ?? body.match(/^#\s+(.+)$/m)?.[1]?.trim()
    ?? `Instructions for ${declared}`;
  return { name: declared, description, body };
}

/** Claude CLI path: a subprocess has no in-process plugin, so the text goes in the prompt. */
export function injectSkillText(prompt: string, skills: ModelSkill[]): string {
  if (!skills.length) return prompt;
  return `${prompt}\n\nSkills:\n${skills.map((skill) => `## ${skill.name}\n${skill.body}`).join("\n\n")}`;
}

/** Strands path: the agent sees skill metadata and loads the instructions it decides it needs. */
export function createSkillsPlugin(skills: ModelSkill[]): AgentSkills {
  return new AgentSkills({
    skills: skills.map((skill) => new Skill({ name: skill.name, description: skill.description, instructions: skill.body })),
    strict: true,
  });
}
