# Complete Checkpoint

Use this checkpoint when Vega SDK, ADBT, or VDA blocks lessons 4 to 6. Open `report.md` and `vega-platform-result.json`. Trace the expected SDK, device, build, install, launch, capture, pull, log, second capture, second pull, and focus evidence, and read the four named checks with their evidence.

`live-build-result.json` records the successful SDK build rehearsal. Device evidence remains replay-only.

This is generated from the key-free platform replay. It proves that the workshop adapter, gate ordering, evidence files, and report shape work. `01-launch.png` and `02-postlaunch.png` are the same rendered frame from the replay fixture, not device output: replay has no process, so there is nothing to dwell for and both captures return the recorded image. This checkpoint does not claim that a live Vega device passed.

For device certification, repeat the lesson with Vega SDK `0.22.5875` and an attached VDA target, then retain a result marked `evidenceMode: "live"`, the device log, and the real screenshot. See [the live rehearsal record](../../live-rehearsal.md) for the current tested boundary.
