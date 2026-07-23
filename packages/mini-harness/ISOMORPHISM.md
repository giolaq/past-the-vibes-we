# Mini Harness Isomorphism

Step 04 uses the same boundaries as the complete workshop harness. The mini version is small enough to read line by line; the workshop version applies those boundaries to a guarded React Native port.

| mini module | workshop module path | one-line shared role | what the workshop version adds |
| --- | --- | --- | --- |
| `index.ts` | `packages/workshop-harness/src/index.ts` | Parses commands and starts a run. | Plan approval, doctor, status, memory, context, and Vega lifecycle commands. |
| `harness-config.ts` | `packages/workshop-harness/src/port-pipeline.ts` | Defines the phase plan and per-phase checks. | The same three phases (`analyze` → `plan` → `build_test`) applied to a React Native-to-Vega port with ADBT context and platform evidence. |
| `pipeline-engine.ts` | `packages/workshop-harness/src/port-pipeline.ts` | Runs phases in order with retry and verification. | Guarded writes, rollback, budget enforcement, ADBT context, commits, and reports. |
| `run-context.ts` | `packages/workshop-harness/src/source-app.ts` | Creates an isolated working copy for a run. | Source discovery, exclusions, provenance metadata, and source immutability. |
| `phase-context.ts` | `packages/workshop-harness/src/phase-context.ts` | Assembles the prompt for one phase. | Project facts, portability findings, seed, approved ADBT excerpts, and discovery-first rules. |
| `executor.ts` | `packages/workshop-harness/src/port-executor.ts` | Puts replay, local Claude Code, or remote Strands behind an interface. | Read-only project tools, structured patch output, token limits, cost, and recording. |
| `checkpoint.ts` | `packages/workshop-harness/src/contracts.ts` | Defines resumable run state. | Versioned phase results, run status, ADBT provenance, and platform evidence. |
| `recorder.ts` | `packages/workshop-harness/src/port-recorder.ts` | Records and replays model turns. | Phase matching, usage and cost, and committed port fixtures. |
| `skills.ts` | `packages/workshop-harness/skills/react-native-tv-adaptation/SKILL.md` | Keeps domain instructions separate from pipeline code. The mini loads vendor ADBT `amazon-devices-vega-*` skills. | Ships its own discovery, TV adaptation, and Vega portability skills written for the harness's checks. |
| `verify.ts` | `packages/workshop-harness/src/port-verification.ts` | Runs mechanical checks after a model edit. | Guarded path checks, TypeScript/build checks, focus behavior, and structured results. |
