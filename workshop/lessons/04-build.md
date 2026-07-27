---
id: build
number: "04"
nav: Build until it compiles
time: 30 minutes
title: Use the compiler as an independent check
lead: Run a real Vega build. Send the exact compiler diagnostics to the next model attempt.
objective: Use a produced package as the pass condition. Trace compiler output into the repair request.
evidence: A .vpkg file and a phase result that records the repaired compiler failure.
---

:::welcome Use an executable check
The earlier phases can pass when files contain the required text.
A compiler uses stronger evidence.

The build either produces a `.vpkg` file or it does not.
If the build fails, the compiler identifies the cause.
The harness sends this exact diagnostic to the model.
:::

:::note Vega SDK is necessary {warning}
This lesson requires Vega SDK version `0.22.5875`.
Lessons 5 and 6 also require an attached VDA.

If the SDK is not available, use the recorded fallback.
The fallback verifies control flow only.
It does not produce a local package.
:::

## Know the build loop

:::flow
Verify | Run the build first
Fail | Keep compiler output
Prompt | Add exact diagnostics
Patch | Apply a typed repair
Verify | Build again
:::

The build process has a 15-minute time limit.
The harness limits the amount of build output in the prompt.
It keeps the start and end of long output.

The phase runs the build before it calls the model.
If the build passes, the phase does not call the model.

:::predict
The compiler reports `Type 'number' is not assignable to type 'string'`.
What text must the model receive?
Why is `The build failed` insufficient?
:::

## Add the known build failure

The injector changes only `out/workshop/app`.
It does not change `apps/pocket-cinema`.

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

## Inspect the repair evidence

:::steps
1. Find the first build failure in the terminal.
2. Open `out/workshop/model-logs/build.jsonl`.
3. Find the failed `verification_result`.
4. Find the next model request.
5. Verify that the request contains the compiler diagnostic.
6. Open `out/workshop/port-result.json`.
7. Find the rejected failure.
8. Find the passing attempt and its cost.
9. Run `git -C ../../out/workshop/app status --porcelain`.
10. Verify that the result is empty.
11. Find the `.vpkg` file in `out/workshop/app/apps/vega/build/`.
12. Find the build-phase commit.
:::

:::note The failure is deterministic
`inject-build-failure` adds one invalid TypeScript file.
It also adds one import to `src/App.tsx`.
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

For a recorded fallback, do not make a local-build claim.
:::

:::fallback
If the Vega SDK is not available, run the recorded repair in a new run:
:::

:::command Recorded compiler repair
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --phases analyze,plan --run-id build-fallback --yes
yarn tsx src/index.ts approve-plan build-fallback --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --platform-replay ../../workshop/fixtures/build-retry/vega-lifecycle.json \
  --phases port,build,launch,test --run-id build-fallback --yes
:::
