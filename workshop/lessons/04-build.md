---
id: build
number: '04'
nav: Build the ported app
time: 30 minutes
title: Build the Vega package and repair one compiler failure
lead: We will run a real Vega build against the guarded copy and give exact compiler diagnostics to the model only after a failed build.
objective: Observe the verify-first build loop. Confirm that the repaired build produces a fresh Hermes bundle and an installable .vpkg package.
evidence: A .vpkg file and a phase result that records the repaired compiler failure.
---

:::welcome Let the compiler decide
The port checks verified files and required text.
They did not run the Vega compiler.

In this lesson, we will add one controlled TypeScript error.
The build phase will find the error, send the exact diagnostic to the model,
and run the build again.
:::

:::note Prepare the Vega SDK {warning}
This lesson requires Vega SDK version `0.23.9221`.
Run `vega --version` before you continue.
Stop if the version is different.
:::

## Know the build sequence

The phase performs this sequence:

:::flow
Install | Install declared development dependencies
Build | Run npm run build:debug
Check | Require a fresh Hermes bundle and .vpkg file
Repair | Call the model only after a failed build
Build | Run the complete build again
:::

A Hermes bundle contains the compiled JavaScript for the Vega package.
A `.vpkg` file is the installable Vega application package.

The dependency install and build each have a 15-minute time limit.
The model call has no elapsed-time limit.
The command can appear quiet while the model works.

Use this command in a second terminal to watch the phase:

```sh
cd packages/workshop-harness
yarn tsx src/index.ts logs workshop --phase build --follow
```

## Important harness code

The build phase uses `verifyFirst`.

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
{
name: "build",
mcp: [ADBT_SERVER],
device: ["build"],
verifyFirst: true,
maxAttempts: 5,
}

if (phase.verifyFirst) {
failures = await verify(phase);
}

if (failures.length > 0) {
const model = await executor.call(
phase.name,
prompt(phase, failures),
{ mcp: phase.mcp, attempt },
);
}

>look: The compiler runs before the model. A passing build uses no model call.
:::

The Vega adapter owns the actual commands:

:::snippet packages/workshop-harness/src/platform/vega.ts (simplified)
dependencies: ["npm", "install", "--include=dev"],
build: ["npm", "run", "build:debug"],

if (build.code === 0) {
packagePath = findVpkg(appDir);
}
if (!hasGeneratedBundle(appDir)) {
blockers.push("build produced no non-empty index.hermes.bundle");
}

>look: A successful command is not enough. The harness also requires the package and JavaScript bundle.
:::

## Add the controlled failure

The injector changes only `out/workshop/app`.
It adds one invalid TypeScript file and one import.
It does not change `apps/pocket-cinema`.

:::yourturn
Add the controlled error.
Confirm that the injector reports the expected TypeScript diagnostic.
:::

:::command Add the workshop build failure
yarn tsx src/index.ts inject-build-failure workshop --yes
:::

:::expected
"expectedDiagnostic":"Type 'number' is not assignable to type 'string'"
:::

## Run the build phase

:::yourturn
Run the build.
Find the first compiler failure.
Wait for the model repair and the second build.
:::

:::command Run the build phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases build --yes --run-id workshop
:::

:::expected
build needs a fix:

- build failed: react-native build-vega exited with code 2
  src/workshop-build-break.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.
  :::

The failure is expected.
`TS2322` identifies the controlled TypeScript error.

After this message, the harness performs these operations:

1. Starts the configured model.
2. Supplies the exact compiler text.
3. Supplies ADBT MCP.
4. Applies the proposed repair.
5. Runs dependency installation and the build again.
6. Checks the Hermes bundle and `.vpkg` file.
7. Commits the passing repair.

The final JSON must include `build` in `phasesComplete`.

## Inspect the build evidence

:::steps

1. Open `out/workshop/model-logs/build.jsonl`.
2. Find the failed `verification_result`.
3. Find the next model request.
4. Confirm that the request contains `TS2322`.
5. Find the ADBT document operation.
6. Open `out/workshop/vega-platform-result.json`.
7. Find the `dependencies` step.
8. Find the failed and passing `build` steps.
9. Confirm that `evidenceMode` is `live`.
10. Open `out/workshop/port-result.json`.
11. Find the build attempt count and earlier failure.
12. Find the `.vpkg` file under `out/workshop/app/apps/vega/build/`.
13. Find `index.hermes.bundle` under the same build directory.
14. Run `git -C ../../out/workshop/app status --short`.
15. Confirm that the Git status is empty.
    :::

The first failure remains in the phase result.
The passing repair does not erase the failed evidence.

:::proof
claim: "The guarded Vega app builds"
gate: "The Vega build passes and creates a fresh Hermes bundle and .vpkg file"
evidence: "vega-platform-result.json, the build files, model-logs/build.jsonl, and the build commit"
limit: "A package can compile and still fail when it starts"
:::

:::knowledge What happened?
The harness ran the compiler before it called the model.
The compiler supplied a specific repair target.
The model used ADBT and proposed a repair.
The harness accepted the repair only after the complete build passed.
:::

:::done
For a live run, the build directory contains a `.vpkg` file.
`vega-platform-result.json` contains `evidenceMode: live`.
The Git working tree is clean.
:::
