import { readFileSync } from "node:fs";
import { join } from "node:path";
import { XMLParser } from "fast-xml-parser";
import { PortPlanSchema } from "../port-plan.js";

export const REQUIRED_FOCUS_TRANSITIONS = [
  "launch-hero",
  "down-to-first-rail",
  "left-boundary",
  "right-boundary",
  "open-details",
  "back-restore",
] as const;

export type FocusTransitionName = typeof REQUIRED_FOCUS_TRANSITIONS[number] | "right";

export type FocusObservation = {
  name: FocusTransitionName;
  key?: string;
  expected: string;
  observed: string;
  passed: boolean;
};

export type FocusEvidence = {
  schemaVersion: 1;
  evidenceMode: "live" | "replay";
  appId: string;
  passed: boolean;
  transitions: string[];
  observations: FocusObservation[];
  failure?: string;
};

export type FocusContract = {
  initialFocusId: string;
  firstRailFocusId: string;
  detailFocusId: string;
  homeFocusableIds: string[];
};

/** The approved plan owns product behavior; the harness owns how that behavior is exercised. */
export function readFocusContract(appDir: string): FocusContract {
  const plan = PortPlanSchema.parse(JSON.parse(readFileSync(join(appDir, "port-plan.json"), "utf8")));
  const home = plan.screens.find((screen) => screen.id === plan.entryScreenId);
  if (!home) throw new Error(`port-plan.json has no entry screen ${plan.entryScreenId}`);
  const firstRailFocusId = home.focusableIds.find((id) => id !== home.initialFocusId);
  if (!firstRailFocusId) throw new Error(`entry screen ${home.id} needs a focus target after ${home.initialFocusId}`);
  const select = plan.navigation.find((navigation) => navigation.fromScreenId === home.id && navigation.action === "select");
  if (!select) throw new Error(`entry screen ${home.id} has no select navigation`);
  const details = plan.screens.find((screen) => screen.id === select.toScreenId);
  if (!details) throw new Error(`select navigation targets missing screen ${select.toScreenId}`);
  return {
    initialFocusId: home.initialFocusId,
    firstRailFocusId,
    detailFocusId: details.initialFocusId,
    homeFocusableIds: home.focusableIds,
  };
}

/**
 * Extracts the stable test id of the focused element from Automation Toolkit getPageSource.
 * Releases have returned both JSON trees and XML strings, so both structured forms are accepted.
 */
export function focusedTestIdFromPageSource(output: string): string {
  const envelope = parseJson(output, "Automation Toolkit response");
  if (isRecord(envelope) && envelope.error) {
    throw new Error(`Automation Toolkit RPC failed: ${JSON.stringify(envelope.error)}`);
  }
  const source = isRecord(envelope) && "result" in envelope ? envelope.result : envelope;
  const tree = parsePageSource(source);
  const focused = collectFocusedTestIds(tree);
  if (focused.ids.length > 1) {
    throw new Error(`Automation Toolkit reported multiple focused elements: ${focused.ids.join(", ")}`);
  }
  if (focused.ids.length === 1) return focused.ids[0];
  if (focused.withoutTestId) {
    throw new Error("the focused element exposes no stable test_id; add testID to every focusable React Native element");
  }
  const runtimeError = pageSourceRuntimeError(tree);
  if (runtimeError) throw new Error(`Automation Toolkit page source reports runtime error: ${runtimeError}`);
  throw new Error("Automation Toolkit page source contains no focused element");
}

function parsePageSource(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const text = value.trim();
  if (!text) throw new Error("Automation Toolkit returned an empty page source");
  if (text.startsWith("{") || text.startsWith("[")) return parsePageSource(parseJson(text, "page source"));
  if (!text.startsWith("<")) throw new Error("Automation Toolkit returned an unsupported page-source format");
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
  }).parse(text);
}

function parseJson(text: string, label: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function collectFocusedTestIds(value: unknown): { ids: string[]; withoutTestId: boolean } {
  const ids = new Set<string>();
  let withoutTestId = false;

  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (typeof candidate === "string") {
      const text = candidate.trim();
      if (text.startsWith("<") || text.startsWith("{") || text.startsWith("[")) {
        try {
          visit(parsePageSource(text));
        } catch {
          // Ordinary UI text can begin with punctuation. It is not a nested page source.
        }
      }
      return;
    }
    if (!isRecord(candidate)) return;

    const attributes = scalarAttributes(candidate);
    if (truthy(attributes.get("focused")) || truthy(attributes.get("isfocused"))) {
      const id = attributes.get("testid");
      if (typeof id === "string" && id.trim()) ids.add(id.trim());
      else withoutTestId = true;
    }
    Object.values(candidate).forEach(visit);
  };

  visit(value);
  return { ids: [...ids], withoutTestId };
}

function pageSourceRuntimeError(value: unknown): string {
  const matches = new Set<string>();
  const visit = (candidate: unknown): void => {
    if (typeof candidate === "string") {
      if (/\b(?:uncaught error|has not been registered|module failed to load|fatal exception)\b/i.test(candidate)) {
        matches.add(candidate.trim());
      }
      return;
    }
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    Object.values(candidate).forEach(visit);
  };
  visit(value);
  return [...matches].slice(0, 3).join(" | ");
}

function scalarAttributes(candidate: Record<string, unknown>): Map<string, unknown> {
  const attributes = new Map<string, unknown>();
  const add = (record: Record<string, unknown>) => {
    for (const [key, value] of Object.entries(record)) {
      if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
        attributes.set(normalize(key), value);
      }
    }
  };
  add(candidate);
  for (const [key, value] of Object.entries(candidate)) {
    if (["attributes", "attrs", "properties"].includes(normalize(key)) && isRecord(value)) add(value);
  }
  return attributes;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function truthy(value: unknown): boolean {
  return value === true || value === 1 || (typeof value === "string" && ["true", "1"].includes(value.toLowerCase()));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
