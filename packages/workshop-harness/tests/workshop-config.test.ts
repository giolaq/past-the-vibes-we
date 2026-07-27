import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadExecutorInput } from "../src/workshop-config.js";

function configFile(value: unknown): string {
  const directory = mkdtempSync(join(tmpdir(), "workshop-config-"));
  const path = join(directory, "workshop.config.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}

test("loads the executor and model from one configuration file", () => {
  const path = configFile({
    executor: "strands",
    provider: "bedrock",
    model: "anthropic.test",
    region: "eu-west-1",
  });
  assert.deepEqual(loadExecutorInput([], path), {
    executor: "strands",
    provider: "bedrock",
    model: "anthropic.test",
    region: "eu-west-1",
  });
});

test("command-line values override the configuration file", () => {
  const path = configFile({ executor: "claude-cli", model: "sonnet" });
  assert.deepEqual(loadExecutorInput(["--executor", "strands", "--provider", "openai", "--model", "gpt-4.1"], path), {
    executor: "strands",
    provider: "openai",
    model: "gpt-4.1",
  });
});

test("rejects a Strands configuration without a provider", () => {
  const path = configFile({ executor: "strands", model: "gpt-4.1" });
  assert.throws(() => loadExecutorInput([], path), /provider is required/);
});

test("rejects unknown configuration fields", () => {
  const path = configFile({ executor: "claude-cli", model: "sonnet", apiKey: "do-not-store-secrets" });
  assert.throws(() => loadExecutorInput([], path), /Unrecognized key/);
});

test("reports a missing explicit configuration file", () => {
  assert.throws(() => loadExecutorInput(["--config", "/missing/workshop.json"]), /Workshop config not found/);
});
