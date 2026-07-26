---
id: launch
number: "05"
nav: Run it on the device
time: 30 minutes
title: Make it run, and prove it stayed running
lead: "A launch command that exits 0 tells you the device accepted it. This phase finds out what happened next."
objective: Distinguish a launch that was accepted from an app that is actually running, using the log and the frames.
evidence: The device log holds no crash signature after the dwell, and two captured frames both render content.
---

:::welcome Accepted is not survived
`launch-app .. success` means the device took the command. An app that throws in its first render prints exactly the same line, and the screenshot that follows is a black rectangle — a file, which a weaker gate would happily accept. This phase waits, reads the device log, and looks at the pixels. It is the clearest example in the workshop of the difference between an exit code and evidence.
:::

:::note This lesson needs an attached device {warning}
Start the Vega Virtual Device before you begin, and leave that terminal open. On the current VDA image the screenshot tool can segfault at the capture step; if that happens, finish on the recorded fallback and say which claim you earned.
:::

:::command Start VDA and confirm it is attached
# Run these in a system terminal and leave it open.
vega virtual-device start --gui
vega exec vda devices -l
:::

## What the phase actually does

:::flow
Install | Transfer the vpkg
Launch | Start the app id
Capture | First frame
Dwell | Wait 5 seconds
Logs | Scan for crash signatures
Capture | Second frame
:::

:::concept Three ways this phase catches a dead app
The **log query** asks `loggingctl` only for this package and only for entries since the harness launched it. The **log scan** (`src/platform/device-log.ts`) then refuses `FATAL`, `SIGSEGV`, `has died`, ANR, and unhandled JS exceptions, reporting the matching line rather than the word "crashed". The **pixel gate** (`src/platform/screenshot.ts`) decodes each pulled PNG and refuses a frame under 640x360, one flat colour, or pinned black or white. The **second frame** is the liveness proof: an app that died on startup cannot produce it.
:::

:::predict
The app launches, renders one frame, and then throws in a rail component two seconds later. Which of the three catches it?
:::

## Run the launch phase

:::yourturn
Run phase 5 onto the same run id. It installs the package phase 4 built — and if your fix touches source, it rebuilds first so what runs is what you wrote.
:::

:::note Keep your executor choice
The command shows Claude Code. If you selected Strands, replace only
`--executor claude-cli --model sonnet` with your provider and model flags from lesson 0.
:::

:::command Install, launch, and prove it is alive
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases launch --yes --run-id workshop
:::

:::steps
1. Open `out/workshop/01-launch.png` and `02-postlaunch.png`. Both must look like a rendered screen; the second is the one that proves the app was still alive after the dwell.
2. Open `out/workshop/vega-device.log` and read what the app said about itself.
3. In `vega-platform-result.json`, read the named checks and their evidence — frame size, colour count, and mean luminance for a screenshot; the crash line itself when the log fails.
:::

:::note Rebuilding is part of this check
A crash fix usually touches source, and source that is not rebuilt never reaches the device. So a retry in this phase rebuilds before it reinstalls. The first check does not rebuild, because nothing has changed since phase 4 — that is the difference between one build and two on every attempt.
:::

## Try breaking it

:::yourturn
A gate you have never seen fail is a gate you are trusting on faith. Break each one on purpose and read what comes back.
:::

:::steps
1. Copy `workshop/fixtures/vega-lifecycle.json` into that same directory, so its `screenshot` path still resolves. In your copy, add `FATAL EXCEPTION: main` to the `logs` turn's stdout. Run with `--platform-replay` pointed at the copy: the run fails naming that exact line.
2. In another copy, delete the `screenshot` line. The replay falls back to a 1x1 pixel and the run fails with `frame is 1x1, smaller than the 640x360 minimum for a device screen`.
3. Both end at exit code 2. Neither reaches the test phase. The line after the gate says the recording ran out of turns — a live run would rebuild and retry here, and the recording has nothing left to give.
:::

:::knowledge Why is a screenshot alone not enough here?
A screenshot proves something rendered at the moment it was taken. It cannot prove the app survived the next second, and it cannot tell a rendered home screen from a rendered error dialog. The log covers the first gap; the next lesson covers the second.
:::

:::done
Live: both frames pass the pixel gate, the package-and-launch-time-filtered log has no crash signature, and `vega-platform-result.json` says `evidenceMode: live`. Replay: the same gates and failure paths execute with recorded evidence, and the result stays labeled `evidenceMode: replay`.
:::

:::fallback
Without an attached device, run the recorded lifecycle. Same gates, same failures available to provoke, labeled `evidenceMode: replay` — which proves the control flow and nothing about a device:
:::

:::command Fallback: recorded device results
yarn --cwd packages/workshop-harness tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --phases launch --yes --run-id workshop
:::
