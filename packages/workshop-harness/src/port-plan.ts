import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { loadWorkshopBrief } from "./source-app.js";

export const PORT_PLAN_PATH = "port-plan.json";
export const PORT_PLAN_APPROVAL_PATH = "port-plan-approval.json";

const IdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/, "use a lowercase kebab-case id");
const ShaSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const PortPlanSchema = z.object({
  schemaVersion: z.literal(1),
  briefSha256: ShaSchema,
  target: z.object({
    platform: z.literal("firetv-vega"),
    sdk: z.literal("0.22.5875"),
  }).strict(),
  verticalSlice: z.string().min(1),
  entryScreenId: IdSchema,
  screens: z.array(z.object({
    id: IdSchema,
    source: z.string().min(1),
    purpose: z.string().min(1),
    initialFocusId: IdSchema,
    focusableIds: z.array(IdSchema).min(1),
  }).strict()).min(1),
  navigation: z.array(z.object({
    fromScreenId: IdSchema,
    action: z.enum(["up", "down", "left", "right", "select", "back"]),
    toScreenId: IdSchema,
    focusResult: z.string().min(1),
  }).strict()).min(2),
  preservedBehaviors: z.array(z.object({
    id: IdSchema,
    requirement: z.string().min(1),
  }).strict()).min(1),
  deferredBehaviors: z.array(z.string()),
  verification: z.array(z.object({
    behaviorId: IdSchema,
    evidence: z.string().min(1),
  }).strict()).min(1),
  openQuestions: z.array(z.string()),
}).strict().superRefine((plan, context) => {
  const screens = new Set(plan.screens.map((screen) => screen.id));
  if (screens.size !== plan.screens.length) {
    context.addIssue({ code: "custom", path: ["screens"], message: "screen ids must be unique" });
  }
  if (!screens.has(plan.entryScreenId)) {
    context.addIssue({ code: "custom", path: ["entryScreenId"], message: "must identify a declared screen" });
  }
  plan.screens.forEach((screen, index) => {
    const focusableIds = new Set(screen.focusableIds);
    if (focusableIds.size !== screen.focusableIds.length) {
      context.addIssue({ code: "custom", path: ["screens", index, "focusableIds"], message: "focusable ids must be unique" });
    }
    if (!focusableIds.has(screen.initialFocusId)) {
      context.addIssue({ code: "custom", path: ["screens", index, "initialFocusId"], message: "must identify a focusable id on this screen" });
    }
  });
  plan.navigation.forEach((edge, index) => {
    if (!screens.has(edge.fromScreenId)) context.addIssue({ code: "custom", path: ["navigation", index, "fromScreenId"], message: "must identify a declared screen" });
    if (!screens.has(edge.toScreenId)) context.addIssue({ code: "custom", path: ["navigation", index, "toScreenId"], message: "must identify a declared screen" });
  });
  for (const action of ["select", "back"] as const) {
    if (!plan.navigation.some((edge) => edge.action === action)) {
      context.addIssue({ code: "custom", path: ["navigation"], message: `must define a ${action} transition` });
    }
  }
  const behaviors = new Set(plan.preservedBehaviors.map((behavior) => behavior.id));
  if (behaviors.size !== plan.preservedBehaviors.length) {
    context.addIssue({ code: "custom", path: ["preservedBehaviors"], message: "behavior ids must be unique" });
  }
  const verifiedBehaviors = new Set(plan.verification.map((check) => check.behaviorId));
  plan.verification.forEach((check, index) => {
    if (!behaviors.has(check.behaviorId)) context.addIssue({ code: "custom", path: ["verification", index, "behaviorId"], message: "must identify a preserved behavior" });
  });
  plan.preservedBehaviors.forEach((behavior, index) => {
    if (!verifiedBehaviors.has(behavior.id)) {
      context.addIssue({ code: "custom", path: ["preservedBehaviors", index, "id"], message: "must have a verification item" });
    }
  });
});

export const PortPlanApprovalSchema = z.object({
  schemaVersion: z.literal(1),
  planSha256: ShaSchema,
  briefSha256: ShaSchema,
  approvedAt: z.string().datetime(),
}).strict();

export type PortPlan = z.infer<typeof PortPlanSchema>;
export type PortPlanApproval = z.infer<typeof PortPlanApprovalSchema>;

export class PortPlanApprovalError extends Error {}

export function renderPortPlanContract(briefSha256: string): string {
  return `Write ${PORT_PLAN_PATH} with this exact JSON contract:
{
  "schemaVersion": 1,
  "briefSha256": "${briefSha256}",
  "target": { "platform": "firetv-vega", "sdk": "0.22.5875" },
  "verticalSlice": "one sentence",
  "entryScreenId": "home",
  "screens": [{ "id": "home", "source": "source screen or component", "purpose": "viewer goal", "initialFocusId": "featured-action", "focusableIds": ["featured-action"] }],
  "navigation": [{ "fromScreenId": "home", "action": "select", "toScreenId": "details", "focusResult": "where focus moves" }, { "fromScreenId": "details", "action": "back", "toScreenId": "home", "focusResult": "which prior item regains focus" }],
  "preservedBehaviors": [{ "id": "open-details", "requirement": "observable behavior" }],
  "deferredBehaviors": ["explicit non-goal"],
  "verification": [{ "behaviorId": "open-details", "evidence": "independent check or device evidence" }],
  "openQuestions": []
}
Every screen id must be unique. Each initial focus id must appear in that screen's focusable ids. Navigation may reference only declared screens and must include select and back. Every preserved behavior must have a verification item.`;
}

export function portPlanFailures(appDir: string, expectedBriefSha256: string): string[] {
  const path = join(appDir, PORT_PLAN_PATH);
  if (!existsSync(path)) return [`Structured port plan: missing ${PORT_PLAN_PATH}`];
  try {
    const plan = PortPlanSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    return plan.briefSha256 === expectedBriefSha256
      ? []
      : [`Structured port plan: briefSha256 must equal ${expectedBriefSha256}`];
  } catch (error) {
    return [`Structured port plan: ${PORT_PLAN_PATH} ${zodMessage(error)}`];
  }
}

/** The JSON-schema check reports shape errors; this adds only the dynamic brief binding. */
export function portPlanBriefFailures(appDir: string, expectedBriefSha256: string): string[] {
  const path = join(appDir, PORT_PLAN_PATH);
  if (!existsSync(path)) return [];
  try {
    const parsed = PortPlanSchema.safeParse(JSON.parse(readFileSync(path, "utf8")));
    if (!parsed.success || parsed.data.briefSha256 === expectedBriefSha256) return [];
    return [`Structured port plan: briefSha256 must equal ${expectedBriefSha256}`];
  } catch {
    // The json_schema check reports malformed JSON with the rest of the plan failures.
    return [];
  }
}

export function approvePortPlan(appDir: string): PortPlanApproval {
  const brief = loadWorkshopBrief(appDir);
  const failures = portPlanFailures(appDir, brief.sha256);
  if (failures.length) throw new PortPlanApprovalError(failures.join("; "));
  const planText = readFileSync(join(appDir, PORT_PLAN_PATH), "utf8");
  const plan = PortPlanSchema.parse(JSON.parse(planText));
  const approval = PortPlanApprovalSchema.parse({
    schemaVersion: 1,
    planSha256: sha256(planText),
    briefSha256: plan.briefSha256,
    approvedAt: new Date().toISOString(),
  });
  writeFileSync(join(appDir, PORT_PLAN_APPROVAL_PATH), JSON.stringify(approval, null, 2));
  return approval;
}

export function assertPortPlanApproved(appDir: string): PortPlanApproval {
  const approvalPath = join(appDir, PORT_PLAN_APPROVAL_PATH);
  if (!existsSync(approvalPath)) {
    throw new PortPlanApprovalError(`Human approval is required. Review ${PORT_PLAN_PATH}, then run approve-plan <runId> --yes.`);
  }
  let approval: PortPlanApproval;
  try {
    approval = PortPlanApprovalSchema.parse(JSON.parse(readFileSync(approvalPath, "utf8")));
  } catch (error) {
    throw new PortPlanApprovalError(`${PORT_PLAN_APPROVAL_PATH} ${zodMessage(error)}`);
  }
  const brief = loadWorkshopBrief(appDir);
  const planPath = join(appDir, PORT_PLAN_PATH);
  if (!existsSync(planPath)) throw new PortPlanApprovalError(`${PORT_PLAN_PATH} is missing`);
  const planText = readFileSync(planPath, "utf8");
  const failures = portPlanFailures(appDir, brief.sha256);
  if (failures.length) throw new PortPlanApprovalError(failures.join("; "));
  if (approval.planSha256 !== sha256(planText)) throw new PortPlanApprovalError(`${PORT_PLAN_PATH} changed after human approval`);
  if (approval.briefSha256 !== brief.sha256) throw new PortPlanApprovalError(`workshop-brief.md changed after human approval`);
  return approval;
}

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function zodMessage(error: unknown): string {
  if (error instanceof z.ZodError) return error.issues.map((issue) => `${issue.path.join(".") || "(root)"} ${issue.message}`).join("; ");
  return error instanceof Error ? error.message : String(error);
}
