---
id: launch
number: '05'
nav: Run it on the VDA
time: 30 minutes
title: Install the app and prove that runs correctly
lead: We will start or reuse a Vega Virtual Device, install the package, start the app, and check that the process stays active.
objective: A Succesful start command of the ported app.
evidence: The app reports running after launch and the device log contains no crash signature.
---

:::welcome Check the process after start
A successful start command proves that the device accepted the command.
It does not prove that the app stayed active.

We will use the launch phase to check the process immediately after start.
The phase will wait five seconds, read the device log, and check the process
again.
:::

## Prepare the VDA

The Vega Virtual Device (VDA) must be installed.
You can start it before the phase:

```sh
vega virtual-device start --gui
```

If no device is attached, the harness starts the VDA.
The harness then waits for two stable device checks.
This wait can take up to 60 seconds.

The app can appear in the VDA before the phase command returns.
This is normal.
The harness still has to complete the dwell, log scan, and final state check.

## Know the launch sequence

:::flow
SDK | Require Vega SDK 0.23.9221
VDA | Reuse an attached device or start one
Install | Install the .vpkg from Lesson 04
Start | Start the app ID
State | Confirm that the process is running
Wait | Wait five seconds
Logs | Reject crash signatures
State | Confirm that the process is still running
:::

The log scan rejects fatal errors, segmentation faults, dead processes,
Application Not Responding errors, and unhandled JavaScript exceptions.

The phase does not use screenshots.
Process and log checks are the launch evidence.

## Important harness code

The Vega adapter defines each platform command.

:::snippet packages/workshop-harness/src/platform/vega.ts (simplified)
device_status: ["vega", "exec", "vda", "devices", "-l"],
vda_start: ["vega", "virtual-device", "start", "--gui", "--timeout", "60"],
install: ["vega", "device", "install-app", "--packagePath", packagePath],
launch: ["vega", "device", "launch-app", "--appName", appId],
app_status: ["vega", "device", "is-app-running", "--appName", appId],

>look: The harness owns these commands. They are not model tools.
:::

After start, the harness records two state samples:

:::snippet packages/workshop-harness/src/platform/vega.ts (simplified)
await recordRunningState(device, "app is running after launch");
await wait(5_000);

const logs = await readDeviceLogs();
const scan = scanDeviceLog(logs);

await recordRunningState(
device,
"app remains running after dwell",
logs,
);

>look: The second sample can find an app that started and then stopped.
:::

The launch phase also uses `verifyFirst`.
It calls the model only when the device checks find a repairable source
failure.

If the model changes source code, the harness rebuilds the package, installs
it, and runs all launch checks again.

## Run the launch phase

Use the package from Lesson 04 and the same run ID.

:::yourturn
Start the launch phase.
Watch the VDA.
Wait for the final state and log checks after the app appears.
:::

:::command Install and start the app
yarn tsx src/index.ts run ../../apps/pocket-cinema \
 --phases launch --yes --run-id workshop
:::

Expect the final JSON to contain:

```json
{
  "state": "complete",
  "phasesComplete": ["analyze", "plan", "port", "build", "launch"]
}
```

If all device checks pass, the phase records `attempts: 0`.
This value means that the phase did not call a model.

If the app crashes, the terminal prints `launch needs a fix`.
The repair model receives the log and the failed state check.

## Inspect the device evidence

:::steps

1. Open `out/workshop/vega-platform-result.json`.
2. Confirm that `evidenceMode` is `live`.
3. Find the first `device_status` step.
4. If the device was not attached, find `vda_start`.
5. Find the passing `install` step.
6. Find the passing `launch` step.
7. Find `app is running after launch`.
8. Confirm that the check passed.
9. Find `device log free of crash signatures`.
10. Confirm that the check passed.
11. Find `app remains running after dwell`.
12. Confirm that the check passed.
13. Open `out/workshop/vega-device.log`.
14. Confirm that the log contains no fatal error for the app.
15. Open `out/workshop/port-result.json`.
16. Find the launch `attempts` value.
    :::

`vega-platform-result.json` also records each command, exit code, standard
output, and standard error.

:::proof
claim: "The app started and stayed active"
gate: "Install and start pass, both state samples pass, and the log has no crash signature"
evidence: "vega-platform-result.json and vega-device.log"
limit: "Process and log evidence does not prove visual rendering or focus behavior"
:::

:::knowledge What happened?
The harness reused or started the VDA.
The harness installed and started the app.
The harness checked the process before and after a five-second wait.
The model did not run when all device checks passed.
:::

:::done
For a live run, both running-state samples pass.
The device log contains no crash signature.
`vega-platform-result.json` contains `evidenceMode: live`.
:::
