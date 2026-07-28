# TV Verification Matrix

| Action | Expected result | Evidence |
| --- | --- | --- |
| Start | The featured action receives initial focus. | `launch-hero` transition |
| Down | Focus moves to the first rail. | `down-to-first-rail` transition |
| Left or right | Focus stays inside the rail. | Boundary transitions |
| Select | Details opens for the current card. | `open-details` transition |
| Back | Home opens with the originating card focused. | `back-restore` transition |

Run `tests/verify-tv-focus.ts` first. It writes `tv-focus-result.json`. The test
uses the same focus-state module as the app.

The local test proves the focus-state contract. Live VDA lifecycle evidence
proves that the package installs, launches, and stays active without a crash.
Neither result proves that the intended interface rendered correctly.
