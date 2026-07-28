---
id: launch
number: "05"
nav: Run it on the device
time: 30 minutes
title: Start the app and verify that it stays active
lead: A successful start command proves only that the device accepted the command. A dwell is a fixed wait after start. A crash signature is known failure text in a device log.
objective: Use two running-state samples and the device log to distinguish an accepted command from a process that stays active.
evidence: The app reports running after launch and after the dwell. The device log contains no crash signature.
---

:::welcome Collect evidence after the start
`launch-app .. success` means that the device accepted the command.
The success message does not mean that the app stayed active.

An app can fail during its first render.

This phase waits five seconds.
The phase samples the running state before the wait.
The phase samples the running state after the wait.
The phase reads the device log.
The phase scans the device log.
The phase reuses an attached VDA or starts a VDA before installation.
:::

:::note A VDA installation is necessary {warning}
The harness checks for an attached VDA.
If no VDA is attached, the harness runs `vega virtual-device start --gui --timeout 60`
and checks the device list again.

The VDA in Vega SDK `0.23.9221` does not support the device screenshot command.
The harness does not call the screenshot command.
:::

## Know the device sequence

The `.vpkg` file from Lesson 4 is the installable Vega package.
The app ID is the unique name that Vega uses to start the installed app.
The package ID identifies the app in device logs.

:::flow
VDA | Reuse an attached VDA or start one
Install | Transfer the .vpkg package
Start | Start the app ID
State | Confirm that the app reports running
Wait | Wait five seconds
Logs | Find crash signatures
State | Confirm that the app still reports running
:::

The log query reads entries for this package.
The log query starts at the app start time.

The log scan rejects these signatures:

- `FATAL` reports a fatal runtime error.
- `SIGSEGV` reports invalid memory access.
- `has died` reports that the app process stopped.
- ANR means Application Not Responding.
- An unhandled JavaScript exception reports a JavaScript error that the app did not catch.

Liveness means that the app process continues to run.
The second state sample is liveness evidence.
An app that stopped during the dwell reports that it is not running.

## Trace Strands in the launch phase

The Vega adapter owns the platform commands.
The Vega adapter is the TypeScript component that runs and records Vega CLI commands.
A platform command builds, installs, starts, or inspects the app on Vega.
The launch phase calls Strands only when this sequence finds a repairable
failure.
A repairable failure is a source-code problem that a new patch can correct.
The repair call receives ADBT MCP.
The model must read current Vega guidance.
`stdout` is normal command output.
`stderr` is command error output.

:::snippet packages/workshop-harness/src/platform/vega.ts (simplified)
let devices = await probe(device, "device_status");
if (!hasAttachedDevice(devices.stdout)) {
  await run(device, "vda_start");
  devices = await run(device, "device_status");
}
await run(device, "install", device.packagePath);
device.launchStartedAt = formatLoggingctlSince(new Date());
await run(device, "launch", device.appId);
await recordRunningState(device, "app is running after launch");
await dwell();
const logs = await run(device, "logs", packageId, device.launchStartedAt);
const scan = scanDeviceLog(logs.stdout || logs.stderr);
await recordRunningState(device, "app remains running after dwell", logs.stdout);
if (scan.crashed) {
  device.blockers.push(`the app crashed after launch: ${scan.matches.join(" | ")}`);
}
>look: The snippet shows harness-controlled Vega CLI operations. The operations are not Strands tools.
:::

The `dwell()` operation performs the five-second wait.

| Owner | Launch action |
| --- | --- |
| Strands | Receives a failed platform check. Reads relevant ADBT guidance. Proposes a source repair. |
| ADBT MCP | Supplies current Vega device and runtime guidance to the repair model. |
| Harness and Vega CLI | Start or reuse the VDA. Build the app. Install the app. Start the app. Wait five seconds. Read logs. Query the running state twice. |
| Evidence | `vega-device.log`, `vega-platform-result.json`, and the launch commit |

:::note No model call is a valid result
If the package starts and stays active, the phase records evidence without
calling Strands or Claude Code.
If no repair is necessary, the phase does not call ADBT.
This verify-first result is valid because the device checks already passed.
:::

:::predict
The start command succeeds and the app fails two seconds later.
Which evidence identifies the failure?
:::

## Run the launch phase

:::yourturn
Start the app on the VDA.
Inspect the two state samples.
Inspect the filtered log.
:::

Use the same run ID.
The phase installs the package from Lesson 4.

:::command Install and start the app
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases launch --yes --run-id workshop
:::

:::note Use your workshop configuration
The command reads the model settings from `../../workshop.config.json`.
:::

## Inspect the device evidence

`vega-device.log` contains device log entries from this launch.
`vega-platform-result.json` contains every platform step and its pass or fail result.

:::steps
1. Open `out/workshop/vega-device.log`.
2. Find the entries after the app start time.
3. Open `out/workshop/vega-platform-result.json`.
4. Find the initial `device_status` step.
5. If the initial `device_status` found no device, find `vda_start` and the later `device_status` steps.
6. Find `app is running after launch`.
7. Verify that the check passed.
8. Find the log-scan result.
9. Verify that no crash signature was found.
10. Find `app remains running after dwell`.
11. Verify that the check passed.
12. If a repair ran, find the ADBT document read in `model-logs/launch.jsonl`.
:::

:::note A source repair requires a new build
A source change does not change the installed package.
The phase rebuilds after a source repair.
The phase installs the new package after the build.

The first verification attempt does not rebuild.
No source changed after Lesson 4.
:::

:::knowledge Why are two state samples necessary?
The first sample proves that the process was active after the start command.
The device log and second sample add evidence across the dwell.
The samples and log do not prove correct rendering or focus behavior.
:::

:::proof
claim: "The app started and stayed active"
gate: "Install and start pass. Both running-state samples pass. The log has no crash signature."
evidence: "vega-platform-result.json and vega-device.log"
limit: "Process and log evidence does not prove visual rendering or correct focus movement"
:::

:::done
For a live run, both running-state samples pass.
The device log contains no crash signature.
`vega-platform-result.json` contains `evidenceMode: live`.
:::
