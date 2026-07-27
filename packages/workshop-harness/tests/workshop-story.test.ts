import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NAIVE_PHASE, runNaiveProbe } from "../src/naive-probe.js";
import type { PortExecutor } from "../src/port-executor.js";
import { BUILD_FAILURE_FILE, injectBuildFailure, injectedBuildFailureChecks } from "../src/workshop-failure.js";

test("the one-shot probe saves a plausible patch but marks every claim unproven", async () => {
  let seenPhase = "";
  let seenPrompt = "";
  const executor: PortExecutor = {
    async call(phase, prompt) {
      seenPhase = phase;
      seenPrompt = prompt;
      return {
        text: JSON.stringify({
          summary: "Port everything in one pass",
          files: { "apps/vega/manifest.toml": "schema-version = 1", "src/tv/focus-state.ts": "export {}" },
        }),
        costUsd: 0.02,
      };
    },
  };
  const result = await runNaiveProbe(executor);
  assert.equal(seenPhase, NAIVE_PHASE);
  assert.doesNotMatch(seenPrompt, /Required checks|ADBT|retry/i);
  assert.equal(result.coverage.find((item) => item.claim === "Vega package boundary")?.proposed, true);
  assert.ok(result.coverage.every((item) => item.proven === false));
  assert.ok(result.missingProof.includes("No static check or compiler ran"));
});

test("the deterministic build fault is isolated to the guarded app and has an explicit cleanup gate", () => {
  const root = mkdtempSync(join(tmpdir(), "workshop-story-"));
  const app = join(root, "app");
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "src", "App.tsx"), "export default function App() { return null; }\n");
  const result = injectBuildFailure(app, root);
  assert.match(result.expectedDiagnostic, /number.*string/);
  assert.match(readFileSync(join(app, "src", "App.tsx"), "utf8"), /workshop-build-break/);
  assert.equal(injectedBuildFailureChecks(app, root).length, 2);

  rmSync(join(app, BUILD_FAILURE_FILE));
  writeFileSync(join(app, "src", "App.tsx"), "export default function App() { return null; }\n");
  assert.deepEqual(injectedBuildFailureChecks(app, root), []);
});

test("fault injection refuses to hide a second mutation in the same run", () => {
  const root = mkdtempSync(join(tmpdir(), "workshop-story-repeat-"));
  const app = join(root, "app");
  mkdirSync(join(app, "src"), { recursive: true });
  writeFileSync(join(app, "src", "App.tsx"), "export default null;\n");
  injectBuildFailure(app, root);
  assert.throws(() => injectBuildFailure(app, root), /already present/);
});
