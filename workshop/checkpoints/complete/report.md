# Pocket Cinema Vega Lifecycle Replay

- Evidence mode: replay
- Target: Vega SDK `0.22.5875`
- Seed: `workshop-v1`
- ADBT package: `@amazon-devices/amazon-devices-buildertools-mcp@1.0.5`
- ADBT port context: replay from `fixtures/adbt-port-context.json`
- ADBT workflows: `port_tv_app_to_vega.md`, `port_tv_app_to_vega_fos_rn_app.md`
- Source fixture: `fixtures/vega-lifecycle.json`
- Cost: `$0`

## Evidence

1. SDK version check passed.
2. VDA device-status check passed.
3. Debug build passed and produced the recorded `.vpkg` path.
4. Install passed.
5. Launch passed for `com.tvbuild.pocketcinema.main`.
6. The launch frame was captured, pulled, and passed the pixel gate at 1280x720.
7. The device log was written and holds no crash signature.
8. The post-launch frame was captured, pulled, and passed the same gate.
9. The executable focus suite passed launch, boundaries, details, Back, and restoration.

Replay evidence demonstrates the harness lifecycle and report contract. It is not a live-device certification. A live rehearsal must replace replay outputs with a result marked `evidenceMode: "live"`, the actual VDA log, and two real device frames captured five seconds apart. The current SDK build evidence and remaining device boundary are recorded in `../../live-rehearsal.md`.
