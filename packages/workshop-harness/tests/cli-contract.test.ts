import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const cli = resolve(import.meta.dirname, "../src/index.ts");
const app = resolve(import.meta.dirname, "../../../apps/pocket-cinema");
const recording = resolve(import.meta.dirname, "../../../workshop/fixtures/port-recording.json");

test("code phases require review and approval of the structured plan", () => {
  const out = mkdtempSync(join(tmpdir(), "workshop-approval-"));
  const env = { ...process.env, WORKSHOP_OUT: out };

  const blocked = run(["run", app, "--replay", recording, "--phases", "port", "--yes", "--run-id", "approval-demo"], env);
  assert.equal(blocked.status, 1);
  assert.equal(lastJson(blocked.stdout).error.code, "plan_approval_required");
  assert.equal(JSON.parse(readFileSync(join(out, "approval-demo", "status.json"), "utf8")).state, "awaiting_approval");

  const planned = run(["run", app, "--replay", recording, "--phases", "analyze,plan", "--yes", "--run-id", "reviewed"], env);
  assert.equal(planned.status, 0, planned.stderr);

  const unapprovedMutation = run(["inject-build-failure", "reviewed", "--yes"], env);
  assert.equal(unapprovedMutation.status, 1);
  assert.equal(lastJson(unapprovedMutation.stdout).error.code, "plan_approval_required");

  const approved = run(["approve-plan", "reviewed", "--yes"], env);
  assert.equal(approved.status, 0, approved.stderr);
  assert.equal(lastJson(approved.stdout).command, "approve-plan");

  const ported = run(["run", app, "--replay", recording, "--phases", "port", "--yes", "--run-id", "reviewed"], env);
  assert.equal(ported.status, 0, ported.stderr);
  assert.deepEqual(lastJson(ported.stdout).phasesComplete, ["analyze", "plan", "port"]);
  assert.equal(execFileSync("git", ["-C", join(out, "reviewed", "app"), "status", "--porcelain"], { encoding: "utf8" }), "");
});

test("a resumed run refuses changed product input", () => {
  const out = mkdtempSync(join(tmpdir(), "workshop-source-change-"));
  const source = join(out, "source");
  cpSync(app, source, { recursive: true });
  const env = { ...process.env, WORKSHOP_OUT: out };
  const planned = run(["run", source, "--replay", recording, "--phases", "analyze,plan", "--yes", "--run-id", "fixed-input"], env);
  assert.equal(planned.status, 0, planned.stderr);

  writeFileSync(join(source, "workshop-brief.md"), "# Workshop Brief\n\nUse a different product flow.\n");
  const resumed = run(["run", source, "--replay", recording, "--phases", "port", "--yes", "--run-id", "fixed-input"], env);
  assert.equal(resumed.status, 1);
  assert.equal(lastJson(resumed.stdout).error.code, "source_changed");
});

function run(args: string[], env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ["--import", "tsx", cli, ...args], { encoding: "utf8", env });
}

function lastJson(stdout: string): any {
  return JSON.parse(stdout.trim().split("\n").at(-1) ?? "{}");
}
