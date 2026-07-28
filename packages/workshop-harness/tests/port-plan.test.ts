import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  PORT_PLAN_APPROVAL_PATH,
  PORT_PLAN_PATH,
  PortPlanApprovalError,
  PortPlanSchema,
  approvePortPlan,
  assertPortPlanApproved,
} from "../src/port-plan.js";
import { loadWorkshopBrief, sourceFingerprint } from "../src/source-app.js";

test("the structured plan requires declared screens, select, back, and mapped evidence", () => {
  const plan = fixturePlan();
  assert.equal(PortPlanSchema.parse(plan).screens.length, 2);
  assert.equal(PortPlanSchema.safeParse({
    ...plan,
    navigation: [{ fromScreenId: "home", action: "select", toScreenId: "missing", focusResult: "none" }],
  }).success, false);
  assert.equal(PortPlanSchema.safeParse({
    ...plan,
    screens: [{ ...plan.screens[0], initialFocusId: "missing" }, plan.screens[1]],
  }).success, false);
  assert.equal(PortPlanSchema.safeParse({
    ...plan,
    verification: [],
  }).success, false);
});

test("human approval is bound to the exact plan and workshop brief", () => {
  const app = fixtureApp();
  writeFileSync(join(app, PORT_PLAN_PATH), JSON.stringify(fixturePlan(), null, 2));
  const approval = approvePortPlan(app);
  assert.equal(assertPortPlanApproved(app).planSha256, approval.planSha256);
  assert.equal(JSON.parse(readFileSync(join(app, PORT_PLAN_APPROVAL_PATH), "utf8")).schemaVersion, 1);

  writeFileSync(join(app, PORT_PLAN_PATH), `${readFileSync(join(app, PORT_PLAN_PATH), "utf8")}\n`);
  assert.throws(() => assertPortPlanApproved(app), /changed after human approval/);
});

test("changing the brief invalidates approval", () => {
  const app = fixtureApp();
  writeFileSync(join(app, PORT_PLAN_PATH), JSON.stringify(fixturePlan(), null, 2));
  approvePortPlan(app);
  writeFileSync(join(app, "workshop-brief.md"), "# Workshop Brief\n\nA different approved goal.\n");
  assert.throws(() => assertPortPlanApproved(app), PortPlanApprovalError);
});

test("the source fingerprint includes the brief but excludes generated caches", () => {
  const app = fixtureApp();
  const before = sourceFingerprint(app);
  mkdirSync(join(app, "node_modules"));
  writeFileSync(join(app, "node_modules", "cache.txt"), "generated");
  assert.equal(sourceFingerprint(app), before);
  writeFileSync(join(app, "workshop-brief.md"), "# Workshop Brief\n\nChanged behavior.\n");
  assert.notEqual(sourceFingerprint(app), before);
});

test("the committed buildable checkpoint has a current plan approval", () => {
  const checkpoint = resolve(import.meta.dirname, "../../../workshop/checkpoints/vega-buildable/app");
  assert.doesNotThrow(() => assertPortPlanApproved(checkpoint));
});

function fixtureApp(): string {
  const app = mkdtempSync(join(tmpdir(), "workshop-plan-"));
  writeFileSync(join(app, "package.json"), JSON.stringify({ name: "fixture" }));
  writeFileSync(join(app, "workshop-brief.md"), "# Workshop Brief\n\nOpen details and return to the same card.\n");
  return app;
}

function fixturePlan() {
  const app = fixtureApp();
  return {
    schemaVersion: 1,
    briefSha256: loadWorkshopBrief(app).sha256,
    target: { platform: "firetv-vega", sdk: "0.23.9221" },
    verticalSlice: "Browse from home to details and back.",
    entryScreenId: "home",
    screens: [
      { id: "home", source: "App home", purpose: "Browse titles", initialFocusId: "featured-action", focusableIds: ["featured-action", "first-card"] },
      { id: "details", source: "App details", purpose: "Read details", initialFocusId: "back-action", focusableIds: ["back-action"] },
    ],
    navigation: [
      { fromScreenId: "home", action: "select", toScreenId: "details", focusResult: "Back action receives focus." },
      { fromScreenId: "details", action: "back", toScreenId: "home", focusResult: "The originating card regains focus." },
    ],
    preservedBehaviors: [{ id: "open-details", requirement: "Open details and return to the originating card." }],
    deferredBehaviors: ["Playback"],
    verification: [{ behaviorId: "open-details", evidence: "Executable focus transition test." }],
    openQuestions: [],
  };
}
