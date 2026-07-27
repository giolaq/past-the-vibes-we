# TV Verification Matrix

| Action | Expected result | Evidence |
| --- | --- | --- |
| Start | The featured action has visible focus. | VDA frame `01-launch.png` |
| Down | Focus moves to the first rail. | D-pad transition |
| Left or right | Focus stays inside the rail. | Transition log |
| Select | Details opens for the current card. | VDA frame `02-details.png` |
| Back | Home opens with the source card focused. | VDA frame `03-restored.png` |

Run `tests/verify-tv-focus.ts` first. It writes `tv-focus-result.json`. The test
uses the same focus-state module as the app.

The local test proves the focus rules. Live VDA evidence must prove that the
rendered app and device apply those rules.
