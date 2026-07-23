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
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const lessonsDir = join(here, "..", "workshop", "lessons");
const outFile = join(here, "..", "workshop", "workshop.data.js");

// ---------------------------------------------------------------------------
// Inline + block Markdown rendering
// ---------------------------------------------------------------------------

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

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

  while (i < lines.length) {
    let line = lines[i];

    // Blank line: skip.
    if (!line.trim()) { i++; continue; }

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
    if (/^\s*<(div|section|figure|aside|table|ul|ol|nav|p|h[1-6]|pre|blockquote)\b/.test(line)) {
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
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(inline(lines[i].replace(/^\s*\d+\.\s+/, "").trim()));
        i++;
      }
      parts.push(`<ol class="tasks">${items.map((t) => `<li>${t}</li>`).join("")}</ol>`);
      continue;
    }

    // Unordered list.
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
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
      !/^(#{1,4})\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !isTableRow(lines[i])
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
  note: (title, text, type = "") =>
    `<aside class="note ${type}"><strong>${inline(title)}</strong><br>${inline(text)}</aside>`,
  predict: (text) =>
    `<aside class="predict"><p class="eyebrow">Pause before running</p><strong>Make a prediction</strong><p>${inline(text)}</p></aside>`,
  knowledge: (question, answer) =>
    `<section class="knowledge"><p class="eyebrow">Check your understanding</p><details><summary>${inline(question)}</summary><p>${inline(answer)}</p></details></section>`,
  done: (text) => comp.note("You are done when", text, "success"),
  fallback: (text) => comp.note("If blocked", text, "warning"),
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
    `<h2>One skill, two delivery paths</h2>
    ${comp_table(["Executor", "How the selected skill arrives"], [
      ["Claude CLI", "<code>injectSkillText()</code> appends the complete skill body to the subprocess prompt."],
      ["Strands", "<code>Skill</code> objects enter an <code>AgentSkills</code> plugin. Metadata appears first; the agent activates instructions with the <code>skills</code> tool."],
      ["Replay", "No model runs. A recorded response replaces the live executor while the same phase plan remains visible."],
    ])}
    ${comp.note("Why Strands gets three turns", "With a selected skill, the mini agent needs room to discover the skill, activate it, and return JSON. Without skills it keeps the one-turn limit.")}`,
  strandsConstructs: () =>
    `<h2>Strands constructs used here</h2>
    <p>Read this table from setup to result. These are the Strands APIs the workshop uses — and everything in it is SDK-supplied: one dependency provides the loop, providers, validated tools, enforced schemas, limits, and metrics, while writes, checks, retries, cost, and commits stay in workshop code.</p>
    ${comp_table(["Construct", "What it does here", "Where to find it"], [
      ["<code>Agent</code>", "Runs the model-and-tool loop for one phase. <code>name</code> and <code>description</code> identify its job.", "<code>port-executor.ts</code>"],
      ["<code>Model</code>, <code>BedrockModel</code>, <code>OpenAIModel</code>", "Hide provider-specific model calls. OpenRouter uses <code>OpenAIModel</code> with an OpenAI-compatible base URL.", "<code>model-factory.ts</code>"],
      ["<code>systemPrompt</code>", "Sets durable operating rules: inspect first, use read-only evidence, and return a complete patch.", "<code>port-executor.ts</code>"],
      ["<code>tool()</code>", "Turns a named callback into a model-callable capability. The description tells the model when to use it.", "<code>port-tools.ts</code>"],
      ["<code>inputSchema</code>", "Uses Zod to validate tool arguments and type the callback input before project code runs.", "<code>port-tools.ts</code>"],
      ["<code>tools</code>", "Registers only list, read, and literal search. No write or shell capability enters the agent loop.", "<code>port-executor.ts</code>"],
      ["<code>Skill</code>", "Represents one selected mini-harness instruction with a name, description, and full body.", "<code>model-runtime.ts</code>"],
      ["<code>AgentSkills</code>", "Adds progressive skill disclosure and the model-callable <code>skills</code> activation tool.", "<code>model-runtime.ts</code>"],
      ["<code>plugins</code>", "Registers <code>AgentSkills</code> on the Strands agent. Claude CLI does not use this field.", "<code>model-runtime.ts</code>"],
      ["<code>structuredOutputSchema</code>", "Requires the final answer to match <code>{ summary, files }</code>. Strands validates it and can feed schema failures back to the model.", "<code>port-contract.ts</code>"],
      ["<code>printer: false</code>", "Disables Strands' automatic console renderer so the CLI keeps stdout reserved for versioned JSON events.", "<code>port-executor.ts</code>"],
      ["<code>agent.invoke()</code>", "Starts one bounded run with the assembled phase prompt.", "<code>port-executor.ts</code>"],
      ["<code>limits.turns</code> / <code>limits.totalTokens</code>", "Bound the loop. The mini-harness allows three turns with skills and one without; the port allows 8 turns and 40,000 tokens.", "<code>port-executor.ts</code>, <code>model-runtime.ts</code>"],
      ["<code>cancelSignal</code>", "Lets a native ten-minute <code>AbortSignal</code> cancel the invocation at Strands cancellation points.", "<code>port-executor.ts</code>"],
      ["<code>AgentResult</code>", "Carries validated <code>structuredOutput</code>, messages, stop state, and metrics after invocation.", "returned by <code>invoke()</code>"],
      ["<code>StructuredOutputError</code>", "Makes a missing structured patch an explicit executor failure.", "<code>port-executor.ts</code>"],
      ["<code>metrics.accumulatedUsage</code>", "Reports input and output tokens. The harness records them and applies its own cost rates.", "<code>port-executor.ts</code>"],
    ])}
    ${comp.note("Keep the boundary visible", "Zod supplies schemas, native <code>AbortSignal</code> supplies cancellation, and the harness supplies cost policy and verification. Strands consumes those inputs and runs the bounded agent loop.")}`,
  fullHarnessStrandsConstructs: () =>
    `<h2>Why the workshop uses invoke</h2>
    <p>The workshop uses <code>agent.invoke()</code> so one phase has one visible request, one typed result, and one metrics object. A larger CLI can use <code>agent.stream()</code> and <code>AgentStreamEvent</code> for progress without changing the pipeline boundary.</p>
    ${comp.note("Features still outside the design", "The repository does not use Strands hooks, Graph, Swarm, agent-as-tool, SDK session or memory managers, custom conversation managers, or SDK-provided write and shell tools.")}`,
  mcpConstructs: () =>
    `<h2>Strands MCP constructs used here</h2>
    ${comp_table(["Construct", "Role in the ADBT path"], [
      ["<code>McpClient</code>", "Strands client wrapper that connects lazily, exposes MCP tools, calls them, and cleans up the connection."],
      ["<code>applicationName</code> / <code>applicationVersion</code>", "Identify Past the Vibes Workshop to the MCP server during connection setup."],
      ["<code>listTools()</code>", "Strands calls this for the passed <code>McpClient</code> to discover ADBT's tools dynamically, then exposes them to the model. The harness does not require or pre-pick tool names."],
      ["<code>Agent({ tools: [...projectTools, adbtClient] })</code>", "The <code>McpClient</code> is passed into the agent's tools. Strands invokes ADBT's tools for the model during the agent loop; the harness does not call them."],
      ["<code>agent.messages</code>", "After the phase, the harness walks the tool-use and tool-result blocks to reconstruct which ADBT docs the model read, then hashes them into <code>adbt-port-context.json</code>."],
      ["<code>disconnect()</code>", "Closes the child server and transport in <code>finally</code>, including failure paths."],
    ])}
    ${comp.note("The transport is a separate layer", "<code>StdioClientTransport</code> comes from the official Model Context Protocol SDK, not Strands. It starts pinned ADBT as a child process. The harness passes the <code>McpClient</code> into the agent's tools so the model can call ADBT itself; provenance is reconstructed from the message history afterward.")}`,
};

// Table builder used by partials (headers/rows are pre-formatted HTML, so no
// inline() re-processing — matches the old workshop.js table() helper exactly).
function comp_table(headers, rows) {
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
      return comp.expected(content.replace(/^\n+|\n+$/g, ""));
    case "command":
      return comp.command(header, content.replace(/^\n+|\n+$/g, ""));
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
    case "snippet": {
      // Content: code, then optional line starting with `>look:` for the note.
      const src = content.replace(/^\n+|\n+$/g, "");
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
      return content.replace(/^\n+|\n+$/g, "");
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
  return `${banner}window.WORKSHOP_MODULES = ${JSON.stringify(modules)};\n`;
}

function build() {
  const output = render();
  writeFileSync(outFile, output);
  console.log(`Built ${output.match(/,"body":/g)?.length ?? 0} modules -> workshop/workshop.data.js`);
}

// --check: fail (nonzero exit) if the committed workshop.data.js is stale
// relative to the lesson sources. Wired into `yarn verify` so the generated
// site can never silently drift from its single source of truth.
function check() {
  const expected = render();
  if (!existsSync(outFile) || readFileSync(outFile, "utf8") !== expected) {
    console.error(
      "workshop/workshop.data.js is out of date. Run `node scripts/build-site.mjs` and commit the result."
    );
    process.exit(1);
  }
  console.log("workshop/workshop.data.js is up to date with workshop/lessons/*.md.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.argv.includes("--check") ? check() : build();
}
