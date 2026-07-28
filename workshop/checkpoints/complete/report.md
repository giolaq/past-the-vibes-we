# Pocket Cinema Vega Lifecycle

- Evidence mode: recorded fallback
- Target: Vega SDK `0.23.9221`
- Seed: `workshop-v1`
- ADBT package: `@amazon-devices/amazon-devices-buildertools-mcp@1.0.5`
- ADBT context: `fixtures/adbt-port-context.json`
- Source: `fixtures/vega-lifecycle.json`
- Cost: `$0`

## Results

1. The SDK version check passed.
2. The VDA device check passed.
3. The debug build check passed.
4. The recording supplied a `.vpkg` path.
5. The install check passed.
6. The start check passed for `com.tvbuild.pocketcinema.main`.
7. The first running-state sample passed.
8. The log had no crash signature.
9. The post-dwell running-state sample passed.
10. The focus suite passed start, boundaries, details, Back, and restoration.

This evidence proves lifecycle control and report format. It does not certify a
live device or prove visual rendering.

A live run must produce `evidenceMode: "live"`. It must also keep the actual
VDA log and pass both running-state samples.
