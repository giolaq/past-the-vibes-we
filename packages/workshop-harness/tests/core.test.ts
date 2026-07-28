import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { auditSource, summarize } from "../src/portability-audit.js";
import { FOCUS_TEST_CHECK, tvReadyChecks, verifyPort } from "../src/port-verification.js";
import { parseJsonBlock } from "../src/port-contract.js";
import { applyProposal, loadMemory, loadSnapshot, propose, renderMemory, snapshotHash } from "../src/project-memory.js";
import { copySource, discoverSource } from "../src/source-app.js";
import { assembleProjectContext } from "../src/phase-context.js";

function temp(): string { return mkdtempSync(join(tmpdir(), "workshop-harness-")); }

function app(root = temp()): string {
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "my app", dependencies: { "react-native": "1", "react-native-camera": "1" }, scripts: { test: "test" } }));
  writeFileSync(join(root, "workshop-brief.md"), "# Brief");
  writeFileSync(join(root, ".env"), "SECRET=do-not-copy");
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "node_modules", "cache"), "no");
  return root;
}

test("discovers scripts and dependencies", () => {
  const result = discoverSource(app());
  assert.equal(result.name, "my app");
  assert.equal(result.scripts.test, "test");
  assert.ok(result.dependencies.includes("react-native"));
});

test("rejects a directory without package.json", () => assert.throws(() => discoverSource(temp()), /Not a JavaScript project/));

test("copies source while excluding secrets and caches", () => {
  const target = join(temp(), "copy");
  copySource(app(), target);
  assert.equal(readFileSync(join(target, "workshop-brief.md"), "utf8"), "# Brief");
  assert.throws(() => readFileSync(join(target, ".env")));
  assert.throws(() => readFileSync(join(target, "node_modules", "cache")));
});

test("audit identifies reusable framework and replacement dependencies", () => {
  const findings = auditSource(discoverSource(app()));
  assert.ok(findings.some((item) => item.area === "framework" && item.classification === "portable"));
  assert.ok(findings.some((item) => item.evidence === "react-native-camera" && item.classification === "replace"));
});

test("audit summary counts each classification", () => {
  const summary = summarize(auditSource(discoverSource(app())));
  assert.ok(summary.portable >= 1);
  assert.ok(summary.replace >= 1);
});

test("empty project memory is deterministic", () => {
  const memory = loadMemory(temp());
  assert.equal(memory.schemaVersion, 1);
  assert.deepEqual(memory.entries, []);
});

test("snapshot proposal keeps questions separate from decisions", () => {
  const snapshot = fixtureSnapshot(temp());
  const entries = propose(loadSnapshot(snapshot));
  assert.equal(entries.find((item) => item.text === "What about profiles?")?.section, "open_question");
  assert.equal(entries.find((item) => item.text === "Hero starts focused")?.section, "product_decision");
});

test("approved proposal writes human and machine-readable memory", () => {
  const dir = temp();
  const entries = propose(loadSnapshot(fixtureSnapshot(temp())));
  const memory = applyProposal(dir, entries);
  assert.equal(loadMemory(dir).entries.length, memory.entries.length);
  assert.match(readFileSync(join(dir, "PROJECT_CONTEXT.md"), "utf8"), /Open Questions/);
});

test("memory rendering includes provenance", () => {
  const memory = applyProposal(temp(), propose(loadSnapshot(fixtureSnapshot(temp()))));
  assert.match(renderMemory(memory), /bee:c1/);
});

test("phase context injects only approved relevant entries", () => {
  const memory = applyProposal(temp(), propose(loadSnapshot(fixtureSnapshot(temp()))));
  memory.entries[0].tags = ["vega_port"];
  memory.entries[1].tags = ["other_phase"];
  const context = assembleProjectContext(memory, "vega_port");
  assert.ok(context.entryIds.includes(memory.entries[0].id));
  assert.ok(!context.entryIds.includes(memory.entries[1].id));
  assert.match(context.text, /Approved Project Context/);
});

test("snapshot hashes change when context changes", () => {
  const base = { schemaVersion: 1 as const, provider: "bee" as const, capturedAt: new Date(0).toISOString(), query: "q", sources: [], decisions: ["a"], constraints: [], openQuestions: [] };
  assert.notEqual(snapshotHash(base), snapshotHash({ ...base, decisions: ["b"] }));
});

function fixtureSnapshot(root: string): string {
  const base = { schemaVersion: 1, provider: "bee", capturedAt: new Date(0).toISOString(), query: "product", sources: [{ id: "c1", recordedAt: "2026-01-01" }], decisions: ["Hero starts focused"], constraints: ["No account"], openQuestions: ["What about profiles?"] };
  const path = join(root, "snapshot.json");
  writeFileSync(path, JSON.stringify({ ...base, summaryHash: snapshotHash(base as Parameters<typeof snapshotHash>[0]) }));
  return path;
}

test("tv-ready checks fail on a touch-first app and pass on a ported one", async () => {
  const starter = temp();
  mkdirSync(join(starter, "src"));
  writeFileSync(join(starter, "src", "App.tsx"), "export const App = () => null;");
  const staticChecks = tvReadyChecks().filter((check) => check.type !== "command");
  const before = await verifyPort(starter, staticChecks);
  assert.equal(before.length, staticChecks.length);

  const ported = temp();
  mkdirSync(join(ported, "src", "tv"), { recursive: true });
  mkdirSync(join(ported, "apps", "vega"), { recursive: true });
  mkdirSync(join(ported, "tests"));
  writeFileSync(join(ported, "src", "tv", "focus-state.ts"), "export const focus = true;");
  writeFileSync(join(ported, "src", "App.tsx"), "import './tv/focus-state.js'; export const tv = 'hasTVPreferredFocus'; export const testID = 'featured-action';");
  writeFileSync(join(ported, "apps", "vega", "manifest.toml"), "schema-version = 1");
  writeFileSync(join(ported, "tests", "verify-tv-focus.ts"), "process.exit(0);");
  assert.deepEqual(await verifyPort(ported, staticChecks), []);
});

test("tv-check and the test phase run the focus verifier the same way", async () => {
  const { phases } = await import("../src/port-pipeline.js");
  const gate = phases().find((phase) => phase.name === "test")!.checks.find((check) => check.type === "command");
  assert.deepEqual(gate, FOCUS_TEST_CHECK);
  assert.ok(tvReadyChecks().includes(FOCUS_TEST_CHECK));
});

test("parseJsonBlock names the phase instead of blaming the schema", () => {
  const schema = z.object({ summary: z.string() });
  assert.deepEqual(parseJsonBlock('prose {"summary":"ok"} tail', schema, "analyze"), { summary: "ok" });
  assert.throws(() => parseJsonBlock("I cannot do that.", schema, "analyze"), /analyze returned no JSON object/);
});
