import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const BUILD_FAILURE_FILE = "src/workshop-build-break.ts";
export const BUILD_FAILURE_MARKER = "workshop-build-failure.json";
const IMPORT = 'import "./workshop-build-break";';

export function injectBuildFailure(appDir: string, outDir: string): { files: string[]; expectedDiagnostic: string } {
  const appPath = join(appDir, "src", "App.tsx");
  if (!existsSync(appPath)) throw new Error(`Cannot inject the workshop build failure: missing ${appPath}`);
  const breakPath = join(appDir, BUILD_FAILURE_FILE);
  if (existsSync(breakPath)) throw new Error("The workshop build failure is already present");
  writeFileSync(breakPath, `// Workshop fault: remove this file and its App import.\nexport const workshopBuildBreak: string = 42;\n`);
  writeFileSync(appPath, `${IMPORT}\n${readFileSync(appPath, "utf8")}`);
  writeFileSync(join(outDir, BUILD_FAILURE_MARKER), JSON.stringify({ schemaVersion: 1, kind: "build", files: [BUILD_FAILURE_FILE, "src/App.tsx"] }, null, 2));
  return { files: [BUILD_FAILURE_FILE, "src/App.tsx"], expectedDiagnostic: "Type 'number' is not assignable to type 'string'" };
}

export function injectedBuildFailureChecks(appDir: string, outDir: string): string[] {
  if (!existsSync(join(outDir, BUILD_FAILURE_MARKER))) return [];
  const failures: string[] = [];
  if (existsSync(join(appDir, BUILD_FAILURE_FILE))) failures.push(`Workshop fault removed: delete ${BUILD_FAILURE_FILE}`);
  const appPath = join(appDir, "src", "App.tsx");
  if (existsSync(appPath) && readFileSync(appPath, "utf8").includes(IMPORT)) failures.push(`Workshop fault import removed: delete ${IMPORT} from src/App.tsx`);
  return failures;
}
