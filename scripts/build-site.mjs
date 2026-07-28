// Build the workshop website from Markdown lesson sources.
//
// Single source of truth: workshop/lessons/*.md
//   - YAML frontmatter carries module metadata (id, number, nav, time, title,
//     lead, objective, evidence).
//   - The body is Markdown plus `:::directive` fenced blocks for the workshop's
//     rich components (concept, note, command, steps, ...).
//
// Output: workshop/workshop.data.js — `window.WORKSHOP_MODULES`, an array of
// { id, number, nav, time, title, lead, objective, evidence, body } with the
// body pre-rendered to the exact HTML the runtime expects. No runtime Markdown
// parsing, no network fetch: the site stays static.
//
// Run: node scripts/build-site.mjs   (also wired into `yarn verify`)

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const lessonsDir = join(here, "..", "workshop", "lessons");
const outFile = join(here, "..", "workshop", "workshop.data.js");

// ---------------------------------------------------------------------------
// Inline + block Markdown rendering
// ---------------------------------------------------------------------------

const trimBlankLines = (value) => value.replace(/^\n+|\n+$/g, "");

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// Inline Markdown -> HTML. Raw HTML the author wrote is preserved verbatim, so
// existing inline tags (<code>, <a>, <strong>, <em>) keep working. We only
// translate the small set of Markdown inline forms the lessons use.
function inline(text) {
  let out = text;
  // Links: [label](url) -> external anchor (matches the site convention).
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
    const external = /^https?:\/\//.test(href);
    const attrs = external ? ' target="_blank" rel="noopener"' : "";
    return `<a href="${href}"${attrs}>${label}</a>`;
  });
  // Bold: **text** -> <strong>
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Inline code: `code` -> <code> (escaped). Skip if already inside a tag.
  out = out.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeHtml(code)}</code>`);
  return out;
}

// Render a Markdown fragment (used for prose between directives and for
// directive bodies that are prose). Supports: headings, paragraphs, ordered and
// unordered lists, GFM tables, raw HTML block passthrough, and blank-line
// separation. Returns compact HTML with no inter-tag whitespace.
function markdown(src) {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const parts = [];
  let i = 0;

  const isTableRow = (line) => /^\s*\|.*\|\s*$/.test(line);
  const isDivider = (line) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");
  // Block starters. Used both to dispatch below and to terminate a paragraph, so the two
  // can never drift apart.
  const isHeading = (line) => /^(#{1,4})\s+/.test(line);
  const isFence = (line) => /^```[\w-]*\s*$/.test(line);
  const isOrdered = (line) => /^\s*\d+\.\s+/.test(line);
  const isUnordered = (line) => /^\s*[-*]\s+/.test(line);
  const isRawBlock = (line) => /^\s*<(div|section|figure|aside|table|ul|ol|nav|p|h[1-6]|pre|blockquote)\b/.test(line);
  const startsBlock = (line) => isFence(line) || isHeading(line) || isOrdered(line) || isUnordered(line) || isRawBlock(line) || isTableRow(line);

  while (i < lines.length) {
    let line = lines[i];

    // Blank line: skip.
    if (!line.trim()) { i++; continue; }

    // Fenced code block.
    const fence = /^```([\w-]*)\s*$/.exec(line);
    if (fence) {
      i++;
      const code = [];
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++;
      const language = fence[1] ? ` class="language-${escapeHtml(fence[1])}"` : "";
      parts.push(`<pre><code${language}>${escapeHtml(code.join("\n"))}</code></pre>`);
      continue;
    }

    // Headings.
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      parts.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // Raw HTML block: a line starting with a block-level tag. Passed through
    // verbatim until a blank line. Lets lessons drop in bespoke markup.
    if (isRawBlock(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim()) { buf.push(lines[i]); i++; }
      parts.push(buf.join("\n"));
      continue;
    }

    // GFM table.
    if (isTableRow(line) && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const header = splitRow(line);
      i += 2; // header + divider
      const rows = [];
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      parts.push(renderTable(header, rows));
      continue;
    }

    // Ordered list.
    if (isOrdered(line)) {
      const items = [];
      while (i < lines.length && isOrdered(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+\.\s+/, "").trim()));
        i++;
      }
      parts.push(`<ol class="tasks">${items.map((t) => `<li>${t}</li>`).join("")}</ol>`);
      continue;
    }

    // Unordered list.
    if (isUnordered(line)) {
      const items = [];
      while (i < lines.length && isUnordered(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*[-*]\s+/, "").trim()));
        i++;
      }
      parts.push(`<ul>${items.map((t) => `<li>${t}</li>`).join("")}</ul>`);
      continue;
    }

    // Paragraph: gather until blank line or a block starter.
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !startsBlock(lines[i])
    ) {
      buf.push(lines[i].trim());
      i++;
    }
    parts.push(`<p>${inline(buf.join(" "))}</p>`);
  }

  return parts.join("");
}

const splitRow = (line) =>
  line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

function renderTable(headers, rows) {
  const head = headers.map((h) => `<th>${inline(h)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${row.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Component helpers (ported verbatim from the old workshop.js so output matches)
// ---------------------------------------------------------------------------

const comp = {
  concept: (title, text) =>
    `<section class="concept"><p class="eyebrow">Concept</p><h2>${inline(title)}</h2><p>${inline(text)}</p></section>`,
  // The lesson opener: what we build here and why it matters.
  welcome: (title, text) =>
    `<section class="welcome"><p class="eyebrow">Lesson goal</p><h2>${inline(title)}</h2><p>${inline(text)}</p></section>`,
  // Marks the moment the attendee stops reading and starts running things.
  yourturn: (text) =>
    `<aside class="yourturn"><p class="eyebrow">Exercise</p><strong>Do this task</strong><p>${inline(text)}</p></aside>`,
  note: (title, text, type = "") =>
    `<aside class="note ${type}"><strong>${inline(title)}</strong><br>${inline(text)}</aside>`,
  predict: (text) =>
    `<aside class="predict"><p class="eyebrow">Before you run the command</p><strong>Predict the result</strong><p>${inline(text)}</p></aside>`,
  knowledge: (question, answer) =>
    `<section class="knowledge"><p class="eyebrow">Check your understanding</p><details><summary>${inline(question)}</summary><p>${inline(answer)}</p></details></section>`,
  done: (text) => comp.note("Completion check", text, "success"),
  fallback: (text) => comp.note("If the live path is blocked", text, "warning"),
  expected: (text) =>
    `<div class="expected"><strong>Find this evidence</strong><pre><code>${escapeHtml(text)}</code></pre></div>`,
  command: (title, code) =>
    `<div class="command"><header><span>${inline(title)}</span><button class="copy">Copy command</button></header><pre><code>${escapeHtml(code)}</code></pre></div>`,
  steps: (items) =>
    `<ol class="tasks">${items.map((item) => `<li>${inline(item)}</li>`).join("")}</ol>`,
  snippet: (caption, code, look) =>
    `<figure class="snippet"><figcaption>${inline(caption)}</figcaption><pre><code>${escapeHtml(code)}</code></pre>${look ? `<p class="look"><strong>Where to look:</strong> ${inline(look)}</p>` : ""}</figure>`,
  visual: ({ src, alt, caption, label = "Workshop visual" }) =>
    `<figure class="lesson-visual"><div class="visual-label">${inline(label)}</div><img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}" loading="lazy"><figcaption>${inline(caption)}</figcaption></figure>`,
  flow: (items) =>
    `<div class="flow">${items.map((item, index) => `${index ? "<i>→</i>" : ""}<div><b>${inline(item[0])}</b><span>${inline(item[1])}</span></div>`).join("")}</div>`,
  proof: (spec) =>
    `<section class="proof"><div class="proof-title"><span>Claim → evidence</span><strong>${inline(spec.claim)}</strong></div><dl><dt>Independent check</dt><dd>${inline(spec.gate)}</dd><dt>Evidence</dt><dd><code>${escapeHtml(spec.evidence)}</code></dd>${spec.limit ? `<dt>Limit</dt><dd>${inline(spec.limit)}</dd>` : ""}</dl></section>`,
};

function phaseCard(opts) {
  const tags = (opts.tags || [])
    .map((tag) => `<span class="tag ${tag.kind || ""}">${inline(tag.label)}</span>`)
    .join("");
  const rows = Object.entries(opts.rows)
    .map(([term, def]) => `<dt>${inline(term)}</dt><dd>${inline(def)}</dd>`)
    .join("");
  return `<section class="phase"><h3><span class="num">${opts.num}</span><code>${escapeHtml(opts.name)}</code>${tags}</h3><dl>${rows}</dl></section>`;
}

// ---------------------------------------------------------------------------
// Reusable static partials (no per-lesson variation). Emitted via :::include.
// ---------------------------------------------------------------------------

const partials = {
  skillDelivery: () =>
    `<h2>Skill delivery</h2>
    ${rawTable(["Executor", "Method"], [
      ["Claude CLI", "<code>injectSkillText()</code> adds the complete skill body to the process prompt."],
      ["Strands", "<code>AgentSkills</code> registers each <code>Skill</code> as a plugin. The agent activates instructions with the <code>skills</code> tool."],
    ])}
    ${comp.note("Missing skill", "<code>loadSkills()</code> reports and skips a missing skill. The run continues without that knowledge.")}`,
  strandsConstructs: () =>
    `<h2>Strands constructs used here</h2>
    <p>Read the table from setup to result. Strands supplies the model and tool loop. Workshop code supplies writes, checks, retries, cost control, and commits.</p>
    ${rawTable(["Construct", "What it does here", "Where to find it"], [
      ["<code>Agent</code>", "Runs one model and tool loop. <code>name</code> and <code>description</code> identify the phase.", "<code>port-executor.ts</code>"],
      ["<code>Model</code>, <code>BedrockModel</code>, <code>OpenAIModel</code>", "Provide one interface for supported model providers. OpenRouter uses the OpenAI-compatible interface.", "<code>model-factory.ts</code>"],
      ["<code>systemPrompt</code>", "Requires discovery, read-only evidence, and a complete patch.", "<code>port-executor.ts</code>"],
      ["<code>tool()</code>", "Makes a named callback available to the model.", "<code>port-tools.ts</code>"],
      ["<code>inputSchema</code>", "Uses Zod to validate tool arguments.", "<code>port-tools.ts</code>"],
      ["<code>tools</code>", "Registers list, read, and literal search. It does not register write or shell.", "<code>port-executor.ts</code>"],
      ["<code>Skill</code>", "Contains one selected phase instruction.", "<code>skills.ts</code>"],
      ["<code>AgentSkills</code>", "Supplies progressive skill activation through the <code>skills</code> tool.", "<code>skills.ts</code>"],
      ["<code>plugins</code>", "Registers <code>AgentSkills</code> on the Strands agent.", "<code>port-executor.ts</code>"],
      ["<code>structuredOutputSchema</code>", "Requires <code>{ summary, files }</code> and reports schema failures.", "<code>port-contract.ts</code>"],
      ["<code>printer: false</code>", "Keeps SDK text out of the CLI JSON stream.", "<code>port-executor.ts</code>"],
      ["<code>agent.stream()</code>", "Starts one bounded run and returns native stream events.", "<code>port-executor.ts</code>"],
      ["<code>limits.turns</code> / <code>limits.totalTokens</code>", "Limit one phase to 8 turns and 40,000 tokens.", "<code>port-executor.ts</code>"],
      ["<code>cancelSignal</code>", "Stops the call after ten minutes or an external abort.", "<code>port-executor.ts</code>"],
      ["<code>AgentResult</code>", "Contains structured output, messages, stop data, and metrics.", "returned by <code>stream()</code>"],
      ["<code>StructuredOutputError</code>", "Reports a missing structured patch.", "<code>port-executor.ts</code>"],
      ["<code>metrics.accumulatedUsage</code>", "Reports input and output tokens. The harness records them and applies its own cost rates.", "<code>port-executor.ts</code>"],
    ])}
    ${comp.note("Control boundary", "Strands runs the bounded agent loop. The harness controls cost and verification.")}`,
  fullHarnessStrandsConstructs: () =>
    `<h2>Why the workshop uses stream</h2>
    <p>The workshop uses <code>agent.stream()</code> to record model and tool events during a phase. <code>consumeStream()</code> keeps the final <code>AgentResult</code>. The harness boundary does not change.</p>
    ${comp.note("Features outside the design", "The repository does not use Strands hooks, Graph, Swarm, agent-as-tool, SDK session or memory managers, custom conversation managers, or SDK write and shell tools.")}`,
  mcpConstructs: () =>
    `<h2>Strands MCP constructs used here</h2>
    ${rawTable(["Construct", "Function in the ADBT path"], [
      ["<code>McpClient</code>", "Connects to ADBT and exposes its tools."],
      ["<code>applicationName</code> / <code>applicationVersion</code>", "Identify the workshop to ADBT."],
      ["<code>listTools()</code>", "Discovers ADBT tools. The harness does not preselect document tools."],
      ["<code>Agent({ tools: [...projectTools, adbtClient] })</code>", "Registers ADBT as an agent tool source."],
      ["<code>agent.messages</code>", "Records which ADBT documents the model read. The harness hashes these sources."],
      ["<code>disconnect()</code>", "Closes the server and child process on success or failure."],
    ])}
    ${comp.note("MCP transport", "<code>StdioClientTransport</code> comes from the Model Context Protocol SDK. It starts pinned ADBT as a child process. The harness gets source evidence from agent message history.")}`,
};

// Table builder used by partials (headers/rows are pre-formatted HTML, so no
// inline() re-processing — matches the old workshop.js table() helper exactly).
function rawTable(headers, rows) {
  return `<table><thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

// ---------------------------------------------------------------------------
// Directive parsing: :::name [title] {modifier} ... :::
// ---------------------------------------------------------------------------

function renderBody(body) {
  const lines = body.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let prose = [];

  const flushProse = () => {
    if (prose.length) {
      const rendered = markdown(prose.join("\n"));
      if (rendered) out.push(rendered);
      prose = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const open = /^:::(\w+)(?:\s+(.*?))?\s*$/.exec(lines[i]);
    if (open) {
      flushProse();
      const name = open[1];
      let header = (open[2] || "").trim();
      // Extract a trailing {modifier} from the header (e.g. {warning}).
      let modifier = "";
      const mod = /\{(\w+)\}\s*$/.exec(header);
      if (mod) { modifier = mod[1]; header = header.replace(/\{\w+\}\s*$/, "").trim(); }

      const content = [];
      i++;
      while (i < lines.length && lines[i].trim() !== ":::") { content.push(lines[i]); i++; }
      i++; // consume closing :::
      out.push(renderDirective(name, header, modifier, content.join("\n")));
      continue;
    }
    prose.push(lines[i]);
    i++;
  }
  flushProse();
  return out.join("");
}

function renderDirective(name, header, modifier, content) {
  const listItems = () =>
    content
      .split("\n")
      .map((l) => l.replace(/^\s*(?:\d+\.|[-*])\s+/, "").trim())
      .filter(Boolean);

  switch (name) {
    case "concept":
      return comp.concept(header, content.trim());
    case "welcome":
      return comp.welcome(header, content.trim());
    case "yourturn":
      return comp.yourturn(content.trim());
    case "note":
      return comp.note(header, content.trim(), modifier);
    case "predict":
      return comp.predict(content.trim());
    case "knowledge":
      return comp.knowledge(header, content.trim());
    case "done":
      return comp.done(content.trim());
    case "fallback":
      return comp.fallback(content.trim());
    case "expected":
      return comp.expected(trimBlankLines(content));
    case "command":
      return comp.command(header, trimBlankLines(content));
    case "steps":
      return comp.steps(listItems());
    case "flow":
      // Each line: "Label | Sub"
      return comp.flow(
        content
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean)
          .map((l) => l.split("|").map((s) => s.trim()))
      );
    case "proof": {
      const spec = parseYaml(content);
      if (!spec?.claim || !spec?.gate || !spec?.evidence) throw new Error(":::proof requires claim, gate, and evidence");
      return comp.proof(spec);
    }
    case "snippet": {
      // Content: code, then optional line starting with `>look:` for the note.
      const src = trimBlankLines(content);
      const lookMatch = /\n>look:\s*([\s\S]*)$/.exec(src);
      const code = lookMatch ? src.slice(0, lookMatch.index) : src;
      const look = lookMatch ? lookMatch[1].trim() : "";
      return comp.snippet(header, code, look);
    }
    case "phase": {
      // Content is YAML: name, tags: [{label,kind}], rows: {term: def}
      const spec = parseYaml(content);
      return phaseCard({ num: header, name: spec.name, tags: spec.tags, rows: spec.rows });
    }
    case "visual": {
      const spec = parseYaml(content);
      if (!spec?.src || !spec?.alt || !spec?.caption) throw new Error(":::visual requires src, alt, and caption");
      if (!existsSync(join(lessonsDir, "..", spec.src))) throw new Error(`Missing visual asset: ${spec.src}`);
      return comp.visual(spec);
    }
    case "raw":
      return trimBlankLines(content);
    case "include": {
      const partial = partials[header];
      if (!partial) throw new Error(`Unknown partial :::include ${header}`);
      return partial();
    }
    default:
      throw new Error(`Unknown directive :::${name}`);
  }
}

// ---------------------------------------------------------------------------
// Frontmatter + build
// ---------------------------------------------------------------------------

export function parseLesson(raw) {
  const fm = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!fm) throw new Error("Lesson is missing YAML frontmatter");
  const meta = parseYaml(fm[1]);
  const body = renderBody(fm[2]);
  return { ...meta, body };
}

const banner =
  "// GENERATED by scripts/build-site.mjs from workshop/lessons/*.md — do not edit by hand.\n";

function render() {
  const files = readdirSync(lessonsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();
  const modules = files.map((f) => {
    try {
      return parseLesson(readFileSync(join(lessonsDir, f), "utf8"));
    } catch (err) {
      throw new Error(`${f}: ${err.message}`);
    }
  });
  return { modules, output: `${banner}window.WORKSHOP_MODULES = ${JSON.stringify(modules)};\n` };
}

function build() {
  const { modules, output } = render();
  writeFileSync(outFile, output);
  console.log(`Built ${modules.length} modules -> workshop/workshop.data.js`);
}

// --check: fail (nonzero exit) if the committed workshop.data.js is stale
// relative to the lesson sources. Wired into `yarn verify` so the generated
// site can never silently drift from its single source of truth.
function check() {
  const { output: expected } = render();
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== expected) {
    console.error(
      "workshop/workshop.data.js is out of date. Run `node scripts/build-site.mjs` and commit the result."
    );
    process.exit(1);
  }
  console.log("workshop/workshop.data.js is up to date with workshop/lessons/*.md.");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.argv.includes("--check") ? check() : build();
}
