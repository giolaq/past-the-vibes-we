# Vega Lifecycle Fixture

Use `../vega-lifecycle.json` when Vega SDK or VDA is unavailable. It replays successful results for all ten gates — SDK, device, build, install, launch, capture, pull, logs, capture, pull — through the same lifecycle runner as a live command.

`launch-frame.png` is the frame the recorded `pull` writes, referenced by the fixture's `screenshot` field. The harness judges every pulled frame as pixels, so a placeholder cannot stand in: this is a real 1280x720 render of the ported home screen, produced by `scripts/render-tv-frame.mjs`. Re-run that script if the app's layout or catalog changes.

The fixture is synthetic. It proves the workshop control flow and report contract, not that your app passed on a real device. The same frame is written for both captures, which is why the replay says `no dwell` — there is no process to wait for.
