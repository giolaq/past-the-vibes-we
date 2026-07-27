# Vega Lifecycle Fixture

Use `../vega-lifecycle.json` if the Vega SDK or VDA is unavailable.

The fixture supplies recorded results for ten checks:

1. SDK.
2. Device.
3. Build.
4. Install.
5. Start.
6. Capture.
7. Pull.
8. Logs.
9. Second capture.
10. Second pull.

`launch-frame.png` is the recorded frame. The pixel check reads the real
1280x720 image data. `scripts/render-tv-frame.mjs` creates this repository-owned
image.

The fixture proves lifecycle control and report format. It does not prove that
an app passed on a live device. Both captures use the same frame because no
live process exists.
