import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AuditFinding } from "./contracts.js";
import type { SourceDiscovery } from "./source-app.js";

export function auditSource(source: SourceDiscovery): AuditFinding[] {
  const findings: AuditFinding[] = [];
  findings.push({ area: "framework", classification: source.dependencies.includes("react-native") ? "portable" : "manual", evidence: "package.json", recommendation: "Keep shared React Native product logic." });
  const nav = source.dependencies.filter((d) => /navigation|router/.test(d));
  findings.push({ area: "navigation", classification: nav.length ? "replace" : "manual", evidence: nav.join(", ") || "No navigation dependency detected", recommendation: "Define remote navigation, back, and focus restoration explicitly." });
  const risky = source.dependencies.filter((d) => /camera|location|maps|gesture|bluetooth|async-storage/i.test(d));
  for (const dependency of risky) findings.push({ area: "dependency", classification: "replace", evidence: dependency, recommendation: "Confirm Vega support or isolate behind an adapter." });
  const brief = join(source.source, "workshop-brief.md");
  const hasBrief = existsSync(brief);
  findings.push({ area: "product_scope", classification: hasBrief ? "portable" : "manual", evidence: hasBrief ? brief : "workshop-brief.md missing", recommendation: "Choose one bounded screen or flow before execution." });
  // discoverSource already proved package.json exists.
  if (/drm|billing/i.test(readFileSync(join(source.source, "package.json"), "utf8"))) {
    findings.push({ area: "protected_service", classification: "out_of_scope", evidence: "package.json", recommendation: "Use a workshop mock and plan production integration separately." });
  }
  findings.push({ area: "focus", classification: "replace", evidence: "Behavioral audit required", recommendation: "Add initial focus, directional movement, focus styling, back, and restoration checks." });
  return findings;
}

export function summarize(findings: AuditFinding[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of findings) counts[item.classification] = (counts[item.classification] ?? 0) + 1;
  return counts;
}
