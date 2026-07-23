# 8. Build and Test on Vega

## Goal

Use ADBT for Vega guidance, then save build and device evidence in the run report.

ADBT supplied the migration context during lesson 6's `plan` phase, and `build_test` already built the package and required a launch screenshot. The generated package uses the SDK template shape and React Native's `build-vega` command. Vega CLI installs and launches the package. VDA supplies device status, logs, and screenshots. This lesson runs that lifecycle on a real device so you can inspect the evidence. The harness runs the gates in order and stops when one fails.

## Do this

1. Use the `runId` from lesson 6 and print the lifecycle plan:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --plan --json
```

2. Read the plan before continuing. Check the app path, SDK, eight commands, and confirmation requirement.
3. Start the virtual device in a system terminal and leave that terminal open:

```sh
vega virtual-device start --gui
```

4. In a second terminal, wait until both commands show an attached device:

```sh
vega --version
vega virtual-device status
vega exec vda devices -l
```

5. Install the pinned Vega package dependencies in the guarded copy, then run the approved lifecycle on the device:

```sh
npm --prefix packages/workshop-harness/out/<runId>/app/apps/vega install
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> \
  --yes --json
```

If you use `checkpoints/vega-buildable/app`, run `npm ci` instead because that checkpoint includes the tested lockfile.

6. Open `out/<runId>/vega-platform-result.json`. Confirm it records:

- pinned ADBT and Vega SDK versions;
- device-status output;
- build, install, and launch results;
- logs and a screenshot path;
- the focus transition result;
- any remaining blocker.

The lifecycle stops at the first failed gate. An empty `devices -l` result is a device failure even when the command exits successfully.

> **Screenshot caveat.** On the current VDA image the screenshot tool segfaults at the capture gate, so a fully live run may fail there even when build, install, and launch pass. If you hit it, finish the lesson with the replay fallback below.

## Fallback: key-free lifecycle replay

If no VDA is attached (or the screenshot gate segfaults), run the recorded lifecycle — same eight gates, labeled `evidenceMode: "replay"`:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --json
```

## Why this matters

Platform commands should live behind a small adapter. ADBT provides versioned knowledge over MCP. Strands provides the client and agent loop. The harness keeps build, install, launch, and test results consistent.

## You are done when

For a live device claim, the result has eight successful lifecycle steps, the focus transition check, a log path, a screenshot path, and `evidenceMode: "live"` with a screenshot that came from the device. For the fallback, the same eight gates pass with `evidenceMode: "replay"`. Never present replay as device certification.

## If blocked

Try one device repair for no more than 10 minutes. Then use the platform replay command above to finish the lesson. Understanding the lifecycle and evidence is the required outcome; a working device is not.
