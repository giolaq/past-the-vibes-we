# Live Vega Rehearsal

Date: 20 July 2026

This file records the evidence from one live rehearsal. The current harness
gives the same pinned ADBT MCP server to Strands and Claude Code.

## Passed Checks

- Vega SDK `0.22.5875` was available.
- ADBT `1.0.5` ran as a standard-input/output MCP server.
- The harness found `list_documents` and `read_document`.
- The harness loaded two React Native port workflows.
- The harness recorded the document hashes.
- The harness disconnected from ADBT.
- The app used the SDK-generated structure as its reference.
- `npm run build:debug` completed with `react-native build-vega`.
- The manifest passed validation.
- The build produced `.vpkg` files for `aarch64`, `armv7`, and `x86_64`.
- The JavaScript bundle included Pocket Cinema and the focus-state module.

## Blocked Checks

The Vega Virtual Device did not stay attached in the automation session.
`vega virtual-device status` returned `running: false`.

The harness stopped at `device_status`. It did not use old logs or
screenshots. This is the correct result when no target is attached.

These live checks remain incomplete:

- Install the package.
- Start the app.
- Scan device logs.
- Capture two device frames.
- Apply the launch dwell check.
- Apply the crash check.
- Apply the screenshot pixel check.

Unit tests and recorded data cover these checks. A live device does not yet
cover them.

For the next rehearsal:

1. Start VDA in a system terminal.
2. Keep that terminal open.
3. Run both commands before the lifecycle.

```sh
vega virtual-device status
vega exec vda devices -l
```

Do not replace the recorded checkpoint until all live checks pass.

## Dependency Limit

The SDK 0.22 template uses React Native 0.72-era packages. `npm install`
reported 10 audit findings.

Keep this package isolated for workshop use. Use the pinned versions. Do not
run `npm audit fix --force`. That command can break SDK compatibility.

## Evidence Limit

The recorded fixture proves:

- Adapter order.
- Failure handling.
- Focus checks.
- Screenshot and crash checks.
- Report format.

The live rehearsal proves:

- SDK discovery.
- Manifest validation.
- Bundling.
- Package generation.

This is not live-device certification. Certification needs install, start,
logs, and screenshots from an attached VDA target.
