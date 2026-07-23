import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { ModelSkill } from "../../model-runtime.js";

export type Skill = ModelSkill;

// ADBT's `init-context` installs its amazon-devices-vega-* skills here.
// Override with MINI_SKILLS_DIR when your agent keeps skills elsewhere.
const DEFAULT_SKILLS_DIR = join(homedir(), ".claude", "skills");

export function loadSkills(names: string[], skillsDir = process.env.MINI_SKILLS_DIR ?? DEFAULT_SKILLS_DIR): Skill[] {
  return names.map((name) => loadSkill(name, skillsDir)).filter((skill): skill is Skill => Boolean(skill));
}

function loadSkill(name: string, skillsDir: string): Skill | null {
  const path = resolve(skillsDir, name, "SKILL.md");
  if (!existsSync(path)) {
    console.error(`skill "${name}" not found in ${skillsDir} - live runs proceed without it. Install the ADBT skills with: npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force`);
    return null;
  }
  const raw = readFileSync(path, "utf-8");
  // ADBT skill bodies are plain Markdown; agent installers may add YAML frontmatter.
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  const frontmatter = match?.[1] ?? "";
  const body = (match?.[2] ?? raw).trim();
  const declared = frontmatter.match(/^name:\s*(.+)$/m)?.[1]?.trim() ?? name;
  const description = frontmatter.match(/^description:\s*["']?(.+?)["']?$/m)?.[1]?.trim()
    ?? body.match(/^#\s+(.+)$/m)?.[1]?.trim()
    ?? `Instructions for ${declared}`;
  return { name: declared, description, body };
}
