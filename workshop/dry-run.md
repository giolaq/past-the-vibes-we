# Instructor Rehearsal

Use this procedure on the day before the workshop.

Allow three hours for parts A through E. Allow 15 minutes for part F.

Each step has three parts:

- **Run:** Do the action.
- **Expect:** Compare the result.
- **Pass:** Confirm the result before you continue.

Do the steps in order. A later step can depend on an earlier step.

## Part A: Check the Machine

### Step 1: Install

**Run**

```sh
git clone <this repo> /tmp/ptv-rehearsal
cd /tmp/ptv-rehearsal
corepack enable
yarn setup
```

**Pass:** Installation completes without an error.

Do not run `npm audit fix --force`. The Vega template uses pinned React Native
0.72-era dependencies.

### Step 2: Run All Tests

**Run**

```sh
yarn verify
```

**Expect:** All code and document checks pass. The command reports that
`workshop.data.js` is current.

**Pass:** The command exits with code 0.

### Step 3: Check the Live Executor

**Run this command for Claude Code**

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor \
  --executor claude-cli --model sonnet --json
```

For Strands, use your selected provider and model.

**Expect:** The selected executor and credential report `state: ready`.

**Pass:** The selected live path is ready. Vega and Bee can remain optional
until their lessons.

### Step 4: Record the Initial TV Result

**Run**

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema
```

**Expect:** `tvReady: false` with six failures. The executable focus check is
skipped because its file does not exist.

**Pass:** Keep this result. Lesson 6 supplies the comparison result.

### Step 5: Check the Slides

**Run:** Open `workshop/slides.html`. Use the arrow keys.

**Expect:** All 21 slides render. The final counter reads `21 / 21`.

**Pass:** Check the evidence slide, operator view, and both appendix A1 slides.

### Step 6: Check the Website

**Run**

```sh
yarn site
```

Open the printed address.

**Expect:** The site shows nine modules. No directive source text is visible.

**Pass:** Open every module. Keep the server running.

### Step 7: Check Live ADBT

Do this step only if you will show the live MCP call.

**Run**

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json
```

**Expect:** ADBT reports two Vega port workflows.

**Pass:** ADBT passes, or you select the recorded fallback before the session.

### Step 8: Remove Old Output

**Run**

```sh
rm -rf out/*
```

**Pass:** `out/` is empty.

## Part B: Select the Device Path

### Step 9: Check the SDK

**Run**

```sh
vega --version
```

**Pass:** The command prints `0.22.5875`.

### Step 10: Start the Device

Use a dedicated system terminal.

**Run**

```sh
vega virtual-device start --gui
```

**Pass:** The device window opens. Keep the terminal open.

### Step 11: Check the Device Twice

Use a second terminal.

**Run**

```sh
vega virtual-device status
vega exec vda devices -l
```

**Expect:** Status reports `running: true`. The second command lists a device.

Wait 20 minutes. Run both commands again.

**Pass:** Both checks pass before and after the wait.

### Step 12: Select the Device Procedure

| Result | Workshop procedure |
| --- | --- |
| All checks pass twice. | Run lessons 4 through 6 on the live device. |
| The device stays attached but screenshot capture fails. | Run lesson 4 live. Use platform recording for lessons 5 and 6. |
| The device does not stay attached. | Use recorded platform data for lessons 4 through 6. |

Read `workshop/live-rehearsal.md`. Do not claim live device evidence if the
device checks do not pass.

**Pass:** Tell both co-hosts which procedure you selected.

## Part C: Test Each Demonstration

Change to the harness directory:

```sh
cd packages/workshop-harness
```

Use one live executor for all live model commands.

### Step 13: Test Lesson 1

**Run**

```sh
yarn tsx src/index.ts naive ../../apps/pocket-cinema \
  --executor claude-cli --model sonnet \
  --max-cost 1 --run-id naive-rehearsal --yes

yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases analyze --yes --run-id rehearsal
```

**Expect:** The first result lists five missing proofs and changes no source.
The second result completes `analyze` and writes `ANALYSIS.md`.

**Pass:** Run `git status apps/pocket-cinema` from the repository root. The
source must be unchanged. Select three unchecked claims in `ANALYSIS.md`.

### Step 14: Test Lesson 2

Run the lesson command with `--phases plan`.

**Expect:** `VEGA_PORT.md` contains `## TV Flow` and `## Focus`.
`adbt-port-context.json` contains ADBT document hashes.

**Pass:** Explain this division:

- The focus skill defines focus behavior.
- ADBT identifies current Vega APIs.
- The model selects documents.
- The harness records the selected sources.

### Step 15: Test Lesson 3

Run the lesson command with `--phases port`.

**Expect:** Nine checks pass. The guarded copy gets `apps/vega/` and
`src/tv/focus-state.ts`. Git gets a `workshop(port)` commit.

**Pass:** Run:

```sh
git -C out/rehearsal/app log --oneline
```

Confirm the phase commit.

### Step 16: Test the Plan Retry

**Run**

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes
```

**Expect:** Attempt 1 reports missing `## TV Flow` and `## Focus`. Attempt 2
passes. `port-result.json` records two attempts.

**Pass:** Confirm that attempt 2 receives both failure messages.

### Step 17: Test the New Check Exercise

Add the lesson check to `tvReadyChecks()` in `src/port-verification.ts`. Add a
`contains` check for `originating card` in `TV_VERIFICATION.md`.

**Run**

```sh
yarn tsx src/index.ts tv-check ../../apps/pocket-cinema
yarn tsx src/index.ts tv-check ../../workshop/checkpoints/vega-buildable/app
```

**Expect:** The first command fails. The second command passes.

**Pass:** Restore the source file after the test:

```sh
git checkout -- src/port-verification.ts
```

### Step 18: Test the Live Compiler Repair

**Run**

```sh
yarn tsx src/index.ts inject-build-failure rehearsal --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --executor claude-cli --model sonnet \
  --phases build --yes --run-id rehearsal
```

**Expect:** The compiler reports TS2322 in
`src/workshop-build-break.ts`. The model request contains that line. The repair
removes the injected file and import. The build produces a `.vpkg`.

**Pass:** The guarded copy is clean. `port-result.json` keeps the failed check.
The Git log contains the build commit.

### Step 19: Test the Build Recovery

This command is a recovery test. It is not the main demonstration.

**Run**

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --platform-replay ../../workshop/fixtures/build-retry/vega-lifecycle.json \
  --yes
```

**Expect:** The build retry receives compiler error `TS2551`. All six phases
complete. `build` records one model call. `launch` and `test` record
`attempts: 0`.

**Pass:** Record the run ID. Step 22 uses it.

Explain three facts:

- The retry receives the compiler text.
- A passed pre-check does not call the model.
- The retry keeps build caches.

### Step 20: Test the Crash Check

**Run**

```sh
cp ../../workshop/fixtures/vega-lifecycle.json ../../workshop/fixtures/crash-demo.json
```

Add `FATAL EXCEPTION: main` to the `logs` result in `crash-demo.json`.

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/crash-demo.json \
  --phases launch --yes --run-id crashdemo
```

**Expect:** The command names the fatal exception and exits with code 2.

**Pass:** Confirm that the lifecycle stops before `test`.

### Step 21: Test the Pixel Check

Copy the lifecycle file to `noshot-demo.json`. Remove its `screenshot` line.
Run the same command with the new file.

**Expect:** The command reports that the frame is 1x1, flat, and black. It
exits with code 2.

**Pass:** Remove both temporary files:

```sh
rm ../../workshop/fixtures/crash-demo.json ../../workshop/fixtures/noshot-demo.json
```

### Step 22: Compare Before and After

Use the completed run from step 19.

**Run**

```sh
yarn tsx src/index.ts tv-check out/<step-19-runId>/app
```

**Expect:** `tvReady: true` and `failures: []`. The focus result contains all
six transitions.

**Pass:** Put this result next to the `tvReady: false` result from step 4.

### Step 23: Test Appendix A1

**Run the proposal**

```sh
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json --propose
```

**Expect:** The command writes `BEE_SPEC.md` and changes no source. The context
file contains a hash and conversation ID. It contains no transcript.

**Run the approved application**

```sh
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json --apply --yes
```

**Expect:** The first `bee_apply` check fails. The retry repairs the change.
`bee_spec`, `bee_apply`, `build`, and `launch` complete.

**Run the refusal**

```sh
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --run-id bee-neg --apply --yes
```

**Expect:** The command reports `bee_spec_missing` and exits with code 1.

**Pass:** Remove `out/bee-neg`. State that source changes require an approved
specification.

## Part D: Rehearse the Teaching

### Step 24: Check the Schedule

Speak through the complete workshop with a timer.

| Start | Lesson | Minutes |
| --- | --- | --- |
| 00:00 | Setup and doctor | 20 |
| 00:20 | 1. Analyze | 25 |
| 00:45 | 2. Plan | 30 |
| 01:15 | 3. Port | 30 |
| 01:45 | Break | 10 |
| 01:55 | 4. Build | 30 |
| 02:25 | 5. Launch | 30 |
| 02:55 | Break | 10 |
| 03:05 | 6. Test | 25 |
| 03:30 | 7. Control and team exercise | 30 |

Remove optional exercises first if the session is late. Check the Vega device
during the first break.

### Step 25: Prepare the Prediction Answers

Prepare one short answer for each prediction:

1. A proposed patch does not prove build or behavior.
2. An analysis claim is not checked evidence.
3. Skills define behavior. ADBT supplies current platform APIs.
4. A text check can accept a false manifest.
5. A useful retry includes the exact compiler text.
6. Two frames and a log scan can detect a delayed crash.
7. A screenshot cannot prove focus restoration.

### Step 26: Prepare the Evidence Statements

State these limits:

- A model response is a claim until an independent check passes.
- The TUI is a summary. Logs, checks, commits, packages, and frames are evidence.
- Device results in fixtures are synthetic.
- The complete pipeline has not passed with both a live model and live device.
- The focus test checks the focus module. It does not press a device button.
- Bee needs a live account and user consent.
- Recorded data proves control flow. It does not prove live model or device behavior.

Do not claim live device certification. Do not claim that a recording is live
evidence. Do not claim that checks prevent all bad code.

### Step 27: Use the Five-Item Exercise Brief

Before each exercise, state:

1. The command.
2. The file or result to inspect.
3. The completion evidence.
4. The remaining limit.
5. The recovery command.

Practice the lesson 4 brief in less than 30 seconds.

### Step 28: Rehearse One Failure

Cause one planned failure. Name the failed boundary. Use the recorded fallback.
Continue the lesson.

Do not spend more than 10 minutes on a live repair during the workshop.

## Part E: Brief the Co-hosts

### Step 29: Device and Build Co-host

Before the session:

- Start VDA in a dedicated terminal.
- Check the device before every device lesson.
- Prepare both checkpoints.
- Confirm that ADBT skills are installed.

During the session:

- Run each command one lesson before the attendees.
- Report a failure immediately.
- Provide the recovery command if the device disconnects.
- Record which claims have live or recorded evidence.

### Step 30: Room Co-host

Before the session:

- Record each attendee executor choice.
- Prepare every recorded fallback command.

During the session:

- Apply the 10-minute recovery limit.
- Record completion, fallback use, cost, and help requests.
- Give a five-minute warning when a lesson exceeds its time.

### Step 31: Ask Adversarial Questions

Ask at least three questions during rehearsal:

1. Why is this more than a shell script?
2. Why not give an agent direct repository access?
3. Who checks the model-written plan?
4. What does recorded data prove?
5. What prevents deletion of the source repository?
6. Can an empty `## Focus` heading pass the check?
7. Why does the harness stop after two failed attempts?

Prepare direct answers. A stronger requirement needs a stronger check. A
command check is stronger than a text check. A text check is stronger than a
file-presence check.

The loop stops when checks pass, the budget ends, or the same failure reaches
the retry limit.

## Part F: Session Day

### Step 32: Run the Final Check

```sh
cd /tmp/ptv-rehearsal
git pull
yarn verify
yarn --cwd packages/workshop-harness tsx src/index.ts doctor \
  --executor claude-cli --model sonnet --json
rm -rf out/*
yarn site
```

Use the Strands provider and model flags if you teach that path.

Start VDA in its dedicated terminal. Check status and device attachment.
Confirm the selected device procedure with both co-hosts.

**Pass:** Tests pass. Doctor reports ready. `out/` is empty. The site is open.
The initial and final TV results are ready for comparison.
