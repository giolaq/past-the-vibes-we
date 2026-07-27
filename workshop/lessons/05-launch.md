---
id: launch
number: "05"
nav: Run it on the device
time: 30 minutes
title: Start the app and verify that it stays active
lead: A successful start command proves only that the device accepted the command. Collect evidence after the start.
objective: Use the device log and two frames to distinguish an accepted command from an active app.
evidence: The device log contains no crash signature. Two device frames contain rendered content.
---

:::welcome Collect evidence after the start
`launch-app .. success` means that the device accepted the command.
It does not mean that the app stayed active.

An app can fail during its first render.
The first frame can also be black.

This phase waits five seconds.
It reads the device log.
It analyzes two screenshots.
:::

:::note An attached device is necessary {warning}
Start the VDA before this lesson.
Keep the VDA terminal open.

The screenshot tool can fail on some VDA images.
If it fails, use the recorded fallback.
State which evidence came from recorded data.
:::

:::command Start VDA and list devices
vega virtual-device start --gui
vega exec vda devices -l
:::

## Know the device sequence

:::flow
Install | Transfer the vpkg
Start | Start the app id
Capture | Save the first frame
Wait | Wait five seconds
Logs | Find crash signatures
Capture | Save the second frame
:::

The log query reads entries for this package.
It reads entries from the app start time.

The log scan rejects these signatures:

- `FATAL`
- `SIGSEGV`
- `has died`
- ANR
- Unhandled JavaScript exception

The pixel check rejects these frames:

- Frame smaller than 640x360
- One flat color
- Black frame
- White frame

The second frame is liveness evidence.
An app that stopped cannot produce a valid second frame.

:::predict
The app renders one frame and fails two seconds later.
Which evidence identifies the failure?
:::

## Run the launch phase

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

:::steps
1. Open `out/workshop/01-launch.png`.
2. Verify that it shows rendered content.
3. Open `out/workshop/02-postlaunch.png`.
4. Verify that it shows rendered content.
5. Open `out/workshop/vega-device.log`.
6. Find the entries after the app start time.
7. Open `out/workshop/vega-platform-result.json`.
8. Find the frame dimensions.
9. Find the color count.
10. Find the mean luminance.
11. Find the log-scan result.
:::

:::note A source repair requires a new build
A source change does not change the installed package.
The phase rebuilds after a source repair.
It then installs the new package.

The first verification attempt does not rebuild.
No source changed after Lesson 4.
:::

## Cause two controlled failures

Use copies of the lifecycle fixture.
Keep the copies in the same directory as the source fixture.

:::steps
1. Copy `workshop/fixtures/vega-lifecycle.json`.
2. Add `FATAL EXCEPTION: main` to the copied `logs` output.
3. Run the launch phase with `--platform-replay` and the copied file.
4. Verify that the failure includes the exact crash line.
5. Make a second copy of the lifecycle fixture.
6. Delete the `screenshot` line from the second copy.
7. Run the launch phase with the second copy.
8. Verify that the result reports a 1x1 frame.
9. Verify that both commands exit with code 2.
10. Delete the temporary fixture copies.
:::

The recorded file has no additional repair response.
A live run can call the model and try the repair.

:::knowledge Why are two screenshots necessary?
The first screenshot proves that content rendered at one time.
It does not prove that the app stayed active.
The device log and second frame add liveness evidence.
They do not prove correct focus behavior.
:::

:::proof
claim: "The app started and stayed active"
gate: "Install and start pass. The log has no crash signature. Two frames contain rendered pixels."
evidence: "vega-platform-result.json, vega-device.log, 01-launch.png, and 02-postlaunch.png"
limit: "Rendered frames do not prove correct focus movement"
:::

:::done
For a live run, both frames pass the pixel check.
The device log contains no crash signature.
`vega-platform-result.json` contains `evidenceMode: live`.

For a recorded fallback, the result contains `evidenceMode: replay`.
:::

:::fallback
If no device is attached, run the recorded device sequence:
:::

:::command Recorded device sequence
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --phases launch --yes --run-id workshop
:::
