---
id: build
number: "04"
nav: Build until it compiles
time: 30 minutes
title: Use the compiler as an independent check
lead: Run a real Vega build. A compiler diagnostic is the exact error reported during compilation. A .vpkg file is an installable Vega app package.
objective: Use a produced package as the pass condition. Trace compiler output into the repair request.
evidence: A .vpkg file and a phase result that records the repaired compiler failure.
---

:::welcome Use an executable check
The earlier phases can pass when files contain the required text.
A compiler uses stronger evidence.
A compiler converts source code into an installable package.
An executable check runs a program and uses its success or failure as evidence.

The build either produces a `.vpkg` file or it does not.
If the build fails, the compiler identifies the cause.
The harness sends this exact diagnostic to the model.
:::

:::note Vega SDK is necessary {warning}
This lesson requires Vega SDK version `0.23.9221`.
Lesson 5 requires an installed VDA.
The harness starts the VDA when necessary.

If the SDK is not available, inspect:

`workshop/checkpoints/complete/live-build-result.json`

This checkpoint does not prove a build on your computer.
:::

## Know the build loop

:::flow
Verify | Run the build first
Fail | Keep compiler output
Prompt | Add exact diagnostics
Patch | Apply a typed repair
Verify | Build again
:::

Before each live build attempt, the harness runs `npm install --include=dev`
inside the guarded `apps/vega` package.
The command installs the declared development dependencies and Vega build command.
The command installs dependency changes from a repair.
If installation fails, the harness does not start the compiler.

Dependency installation and the build process each have a 15-minute time limit.
The harness limits the amount of build output in the prompt.
The harness keeps the start and end of long output.

The phase runs the build before it calls the model.
If the build passes, the phase does not call the model.
If the build fails, the repair call receives ADBT MCP as well as the compiler
diagnostic. The model must read an ADBT document before proposing a live repair.

## Trace Strands in the build phase

The harness runs the compiler first.
Strands receives a prompt only when the compiler reports a failure.
A verify-first phase runs its independent check before it considers a model call.

:::snippet packages/workshop-harness/src/port-pipeline.ts (simplified)
if (phase.verifyFirst) {
  failures = await verify(phase, options, deviceMark, false, 0);
}
if (failures.length) {
  report(options, `${phase.name} needs a fix`, failures);
}
const model = await options.executor.call(
  phase.name,
  prompt(phase, options, failures),
  { mcp: phase.mcp, attempt },
);
>look: `prompt()` includes the exact compiler failure. `mcp` gives the repair access to current ADBT documents. A passing pre-check skips the model call.
:::

A Hermes bundle is the compiled JavaScript code included in the Vega package.
Fresh means that the current build created the file.

| Owner | Build action |
| --- | --- |
| Strands | Receives the compiler diagnostic. Reads relevant ADBT guidance. Proposes a typed repair. |
| ADBT MCP | Supplies current Vega build and package guidance to the repair model. |
| Harness and Vega CLI | Install declared dependencies. Run the build. Require a fresh Hermes bundle and `.vpkg`. Apply the repair. Build again. |
| Evidence | Compiler output, `.vpkg`, `vega-platform-result.json`, and the build commit |

:::note No model call is a valid result
If the build passes before repair, Strands does not run.
The Claude CLI path follows the same verify-first rule.
:::

:::predict
The compiler reports `Type 'number' is not assignable to type 'string'`.
What text must the model receive?
Why is `The build failed` insufficient?
:::

## Add the known build failure

The injector is a workshop command that adds one controlled TypeScript error.
The injector changes only `out/workshop/app`.
The injector does not change `apps/pocket-cinema`.

:::yourturn
Add the controlled compiler error to the guarded copy.
Run the build phase and watch the harness send the exact diagnostic to the repair model.
:::

:::command Add the workshop build failure
yarn tsx src/index.ts inject-build-failure workshop --yes
:::

:::expected
"expectedDiagnostic":"Type 'number' is not assignable to type 'string'"
:::

## Run the live repair

Use the same executor that you used in the earlier lessons.

:::command Run the build phase
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases build --yes --run-id workshop
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
:::

:::expected
build needs a fix:
  - build failed: react-native build-vega exited with code 2
src/workshop-build-break.ts(2,14): error TS2322: Type 'number' is not assignable to type 'string'.
:::

`TS2322` identifies a TypeScript type-assignment error.

## Inspect the repair evidence

The `--porcelain` Git option prints a compact working-tree status.
Empty output means that no uncommitted file change remains.

:::steps
1. Find the first build failure in the terminal.
2. Open `out/workshop/model-logs/build.jsonl`.
3. Find the failed `verification_result`.
4. Find the next model request.
5. Verify that the request contains the compiler diagnostic.
6. Find the ADBT document read in the model events.
7. Open `out/workshop/port-result.json`.
8. Find the recorded failed attempt.
9. Find the passing attempt and its token and turn usage.
10. Run `git -C ../../out/workshop/app status --porcelain`.
11. Verify that the result is empty.
12. Find the `.vpkg` file in `out/workshop/app/apps/vega/build/`.
13. Find the build-phase commit.
:::

:::note The command creates a repeatable failure
`inject-build-failure` adds one invalid TypeScript file.
`inject-build-failure` adds one import to `src/App.tsx`.
The command commits these changes only in the guarded copy.

The build phase requires the file and import to be absent.
The normal Vega build must also pass.
Each live provider receives the same compiler failure.
:::

:::knowledge Why does the phase verify before the model call?
Most passing builds do not require a repair.
A model call before the build would spend money without a failure.
The compiler diagnostic gives the model a specific repair target.
:::

For this lesson, `evidenceMode: live` means that the current Vega compiler produced the evidence.

:::proof
claim: "The Vega app builds"
gate: "The Vega build exits successfully and produces a .vpkg file"
evidence: "vega-platform-result.json and apps/vega/build/*.vpkg"
limit: "A package can compile and fail after start"
:::

:::done
For a live run, the build directory contains a `.vpkg` file.
`vega-platform-result.json` contains `evidenceMode: live`.
The Git working tree is clean.
:::
