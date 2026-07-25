---
id: vega
number: "08"
nav: Run the Vega lifecycle
time: 25 minutes
title: Hand the guarded app to Vega tools
lead: Time to hand the app to real Vega tools — ten gates on a live device, with recorded replay standing by if no device is attached.
objective: Distinguish reproducible lifecycle rehearsal from evidence produced by a real Vega device.
evidence: Ten lifecycle gates pass, with evidenceMode labeled replay or live.
---

:::welcome Two kinds of evidence, never mixed
This lesson is about honesty as much as tooling. The harness will run ten gates against a real device, and it labels what it can actually prove — so by the end you'll be able to say precisely which claims your run earned and which it didn't. A live VDA run proves this app built, installed, launched, stayed running, and rendered a screen on an attached device. Replay proves you can study the lifecycle and its contracts without one. Keep those claims separate.
:::

:::note Device screenshot caveat {warning}
On the current VDA image the screenshot tool segfaults at the capture gate, so a fully live run may fail there even when build, install, and launch pass. The repo records this in the rehearsal note. If you hit it, use the replay fallback to finish the lesson.
:::

Five gates get the app onto the device:

:::flow
SDK | Require 0.22.5875
Device | Require an attached target
Build | Produce the vpkg
Install | Transfer to the target
Launch | Start the app id
:::

Five more prove it is actually running:

:::flow
Capture | Create a device image
Pull | Save the launch frame
Logs | Read after a 5s dwell
Capture | Create a second image
Pull | Save the post-launch frame
:::

:::concept Launch accepted is not launch survived
`launch-app .. success` means the device accepted the command. An app that throws in its first render still prints it, and the screenshot that follows is a black rectangle — a file, so the old gate passed. Three checks close that hole. The harness waits five seconds, then reads the device log for crash signatures (`FATAL`, `SIGSEGV`, `has died`, ANR, an unhandled JS exception), and it judges both frames as pixels: a screen smaller than 640x360, all one flat colour, or pinned black or white is not a rendered app. An app that died on startup cannot produce the second frame.
:::

:::raw
<div class="links"><a href="live-rehearsal.md">Read the rehearsal record</a></div>
:::

:::predict
If the SDK build passes but the device list is empty, which lifecycle gates must the harness refuse to claim?
:::

## Run the lifecycle on a live VDA

:::yourturn
Start the virtual device, show the plan, then run the lifecycle. Keep an eye on which gates pass — that list is your evidence.
:::

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

## You can claim live evidence only when

:::steps
1. The SDK reports `0.22.5875`.
2. VDA reports `running: true` and lists an attached device.
3. Build, install, launch, logs, and both capture/pull pairs all pass.
4. The device log holds no crash signature after the dwell.
5. Both frames pass the pixel gate.
6. The result says `evidenceMode: live` and the screenshots came from the device.
:::

## Inspect all ten gates yourself

:::yourturn
Open the result and read it as a sequence. The interesting part is not that it says complete — it is which named check earned that word.
:::

:::steps
1. Confirm SDK version and device status were checked before build.
2. Find build, install, launch, both capture/pull pairs, and the log read between them.
3. Read each gate's exact command, exit code, and output.
4. In `checks`, read the four device claims: `launch screenshot renders content`, `device log free of crash signatures`, `post-launch screenshot renders content`, `focus transition suite`. Each carries its own evidence — frame size, colour count, and mean luminance for a screenshot; the crash line itself when the log fails.
5. Open `01-launch.png` and `02-postlaunch.png`. The second frame is the one that proves the app was still alive after the dwell.
:::

:::visual
src: assets/vega-lifecycle-terminal.png
alt: Terminal summary showing all Vega lifecycle gates passing in replay mode
label: Actual replay output
caption: "The replay exercises the complete evidence contract. It is deliberately labeled evidenceMode: replay and must not be presented as proof of a live VDA session."
:::

:::knowledge What turns lifecycle output into trustworthy evidence?
The harness records the exact command, outcome, artifact, and evidence mode for each gate, and it judges the artifact rather than trusting that it exists. A successful process exit alone is not enough — neither is a screenshot file.
:::

:::note Try breaking it {warning}
A gate you have never seen fail is a gate you are trusting on faith. Copy `fixtures/vega-lifecycle.json`, delete its `screenshot` line, and run the lifecycle against your copy: the replay falls back to a 1x1 pixel and the run fails with `frame is 1x1, smaller than the 640x360 minimum for a device screen`. Then put the line back and add `FATAL EXCEPTION: main` to the `logs` turn — the run fails naming that line. Both end at exit code 2.
:::

:::done
All ten gates pass on an attached VDA, the result says `evidenceMode: live`, and both device frames pass the pixel gate.
:::

:::fallback
If no VDA is attached or the screenshot gate segfaults, run the recorded lifecycle instead — same ten gates, labeled evidenceMode: replay:
:::

:::command Fallback: key-free lifecycle replay
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --yes --json
:::

## Optional: ask a model what the screen shows

The pixel gate is deterministic and cheap, and it stops at what pixels can prove. It cannot tell a rendered home screen from a rendered error dialog — both are colourful. If you have a multimodal model configured, add one bounded call that looks at the post-launch frame:

:::command Add the model review to the lifecycle
yarn --cwd packages/workshop-harness tsx src/index.ts vega-run <runId> \
  --executor strands --provider bedrock \
  --evaluate-screenshot --yes --json
:::

The verdict lands in `checks` as `screenshot review`, and only a clear `not-app` blocks the run. Note where the authority sits: the model reports what it sees, your harness decides what that means. The deterministic gate runs either way, so a missing key costs you the opinion, not the check.
