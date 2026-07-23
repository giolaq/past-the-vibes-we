# 7. TV as the Stress Test

## Goal

A passing build says the app compiles. Check whether a user can complete one flow with a remote.

## Do this

1. Open `packages/workshop-harness/skills/react-native-tv-adaptation/SKILL.md`.
2. In `packages/workshop-harness`, run the executable focus check against your guarded app:

```sh
(cd packages/workshop-harness/out/<runId>/app && \
  node --import tsx tests/verify-tv-focus.ts)
cat packages/workshop-harness/out/<runId>/app/tv-focus-result.json
```

3. Open `TV_VERIFICATION.md` in the guarded app.
4. Trace this flow through the verifier and the app code:

```text
launch -> featured action has focus
       -> down enters the first rail
       -> left and right stop at boundaries
       -> select opens details
       -> back returns to the same card
```

5. Open `workshop/fixtures/focus-failure/README.md`.
6. Find the failed focus-restoration evidence and explain what should be sent into a retry.
7. Find `hasTVPreferredFocus`, the `onFocus` handlers, and their shared `focus-state.ts` module. These focus props come from React Native's TV support — see [react-native-tvos](https://github.com/react-native-tvos/react-native-tvos) for the general TV story. This workshop targets Vega, not that fork, but the focus model is the same.

## Why this matters

A screenshot shows one moment. It cannot prove that controls are reachable, boundaries work, or focus returns after Back.

## You are done when

`tv-focus-result.json` says `passed: true`, and you can point to the shared state function that proves each transition.

## If blocked

Use the focus-failure fixture and `checkpoints/vega-buildable/`. A virtual device is not required for this lesson.
