---
id: vega
number: "08"
nav: Run the Vega lifecycle
time: 25 minutes
title: Hand the guarded app to Vega tools
lead: Run the complete lifecycle against a live Vega SDK and VDA, with recorded replay as the fallback when no device is attached.
objective: Distinguish reproducible lifecycle rehearsal from evidence produced by a real Vega device.
evidence: Eight lifecycle gates pass, with evidenceMode labeled replay or live.
---

:::concept Two kinds of evidence
A live VDA run proves this app built, installed, launched, and produced a screenshot on an attached device. Replay proves you can study the lifecycle and its contracts without one. Keep those claims separate.
:::

:::note Device screenshot caveat {warning}
On the current VDA image the screenshot tool segfaults at the capture gate, so a fully live run may fail there even when build, install, and launch pass. The repo records this in the rehearsal note. If you hit it, use the replay fallback to finish the lesson.
:::

:::flow
SDK | Require 0.22.5875
Device | Require an attached target
Build | Produce the vpkg
Install | Transfer to the target
Launch | Start the app id
Logs | Capture runtime evidence
Capture | Create a device image
Pull | Save it with the run
:::

:::raw
<div class="links"><a href="live-rehearsal.md">Read the rehearsal record</a></div>
:::

:::predict
If the SDK build passes but the device list is empty, which lifecycle gates must the harness refuse to claim?
:::

## Run the lifecycle on a live VDA

:::steps
1. Replace `<runId>` with the id from lesson 6.
:::

:::command Start VDA and keep this terminal open
# Run this in a system terminal and leave it open.
vega virtual-device start --gui
:::

:::command Confirm the SDK and attached device
# Run this in a second system terminal.
vega --version
vega virtual-device status
vega exec vda devices -l
:::

:::command Show the Vega plan
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --plan --json
:::

:::command Run with Vega SDK and VDA
npm --prefix packages/workshop-harness/out/<runId>/app/apps/vega install
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> --yes --json
:::

## Claim live evidence only when

:::steps
1. The SDK reports `0.22.5875`.
2. VDA reports `running: true` and lists an attached device.
3. Build, install, launch, logs, capture, and pull all pass.
4. The result says `evidenceMode: live` and the screenshot came from the device.
:::

## Inspect all eight gates

:::steps
1. Confirm SDK version and device status were checked before build.
2. Find build, install, launch, logs, capture, and pull results.
3. Read each gate's exact command, exit code, and output.
:::

:::visual
src: assets/vega-lifecycle-terminal.png
alt: Terminal summary showing all eight Vega lifecycle gates passing in replay mode
label: Actual replay output
caption: "The replay exercises the complete evidence contract. It is deliberately labeled evidenceMode: replay and must not be presented as proof of a live VDA session."
:::

:::knowledge What turns lifecycle output into trustworthy evidence?
The harness records the exact command, outcome, artifact, and evidence mode for each gate. A successful process exit alone is not enough when no device is attached.
:::

:::done
All eight gates pass on an attached VDA and the result says `evidenceMode: live` with a device screenshot.
:::

:::fallback
If no VDA is attached or the screenshot gate segfaults, run the recorded lifecycle instead — same eight gates, labeled evidenceMode: replay:
:::

:::command Fallback: key-free lifecycle replay
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --json
:::
