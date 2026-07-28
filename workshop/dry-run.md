# Instructor Rehearsal

Use this guide to test the workshop and practice the teaching.

## Select a Rehearsal

| Rehearsal          | When to use it                 | Time       | Work                                                                       |
| ------------------ | ------------------------------ | ---------- | -------------------------------------------------------------------------- |
| Technical check    | After a code or lesson change  | 60 minutes | Do steps 1, 2, 4 through 8, 16, and 19 through 23.                         |
| Teaching rehearsal | Before the final week          | 3 hours    | Do parts A through E. Speak each explanation.                              |
| Dress rehearsal    | On the day before the workshop | 4 hours    | Teach the full schedule. Use the live model and selected device procedure. |

Do the technical check first.
Do the teaching rehearsal after the technical check passes.
Do one dress rehearsal from a clean clone.

Allow 15 minutes for the session-day check in part F.

Each step has three parts:

- **Run:** Do the action.
- **Expect:** Compare the result.
- **Pass:** Confirm the result before you continue.

Do the steps in order. A later step can depend on an earlier step.

Record these values before you start:

| Item                   | Value                    |
| ---------------------- | ------------------------ |
| Date                   |                          |
| Git commit             |                          |
| Machine                |                          |
| Executor and model     |                          |
| Device procedure       | Live, mixed, or recorded |
| Start time             |                          |
| End time               |                          |
| Failed step and action |                          |

Use [the workshop editing guide](editing-guide.md) when you change a lesson,
the website, a fixture, or harness code.

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

**Run**

```sh
cd packages/workshop-harness
yarn tsx src/index.ts doctor --json
cd ../..
```

The command reads `workshop.config.json`.

**Expect:** The top level doctor state should be `state: ready`.

**Pass:** The state is ready. Vega and Bee can remain optional
until their lessons.

### Step 4: Record the Initial TV Result

**Run**

```sh
cd packages/workshop-harness
yarn tsx src/index.ts tv-check ../../apps/pocket-cinema
cd ../..
```

**Expect:** `tvReady: false` with six failures. The executable focus check is
skipped because its file does not exist.

**Pass:** Keep this result. Lesson 6 supplies the comparison result.

### Step 5: Check the Slides

**Run:** Open `workshop/slides.html`. Use the arrow keys.

**Expect:** All 21 slides render. The final counter reads `21 / 21`.

**Pass:** Check the evidence slide, operator view, and both appendix A1 slides.

### Step 6: Check the Website

Use a second terminal from the repository root.

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
cd packages/workshop-harness
yarn tsx src/index.ts doctor --adbt-live --json
cd ../..
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

**Pass:** The command prints `0.23.9221`.

### Step 10: Start the Device

Use a dedicated system terminal.
This prewarms the VDA for the rehearsal.
The launch phase also runs this command when no device is attached.

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

**Pass:** Both checks pass.

During the launch phase, inspect `vega-platform-result.json`.
If no VDA was attached, it must contain `device_status`, `vda_start`, then a
second passing `device_status` before `install`.

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
  --max-tokens 1000000 --run-id naive-rehearsal --yes

yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases analyze --yes --run-id rehearsal
```

**Expect:** The first result lists five missing proofs and changes no source.
The second result completes `analyze` and writes `ANALYSIS.md`.

**Pass:** Run:

```sh
git -C ../.. status --short apps/pocket-cinema
```

The command must print no source changes.
Select three unchecked claims in `../../out/rehearsal/app/ANALYSIS.md`.

### Step 14: Test Lesson 2

**Run**

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases plan --yes --run-id rehearsal
```

Open `../../out/rehearsal/app/port-plan.json`.
Review the screens, Select actions, Back actions, preserved behavior, deferred
behavior, and evidence.

Test the approval boundary:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port --yes --run-id rehearsal
```

**Expect:** The command reports `plan_approval_required` and exits with code 1.
The command does not start the `port` phase.

Approve the reviewed plan:

```sh
yarn tsx src/index.ts approve-plan rehearsal --yes
```

**Expect:** `port-plan.json` identifies the screens, Select, Back, preserved
behavior, and evidence. `VEGA_PORT.md` contains `## TV Flow` and `## Focus`.
`adbt-port-context.json` contains ADBT document hashes.
`port-plan-approval.json` contains the plan and brief hashes.

**Pass:** Explain this division:

- ADBT supplies Vega focus behavior and current platform APIs.
- The model selects documents.
- The harness records the selected sources.
- The schema checks plan references.
- A person approves product decisions.

### Step 15: Test Lesson 3

**Run**

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --phases port --yes --run-id rehearsal
```

**Expect:** Nine checks pass. The guarded copy gets `apps/vega/` and
`src/tv/focus-state.ts`. Git gets a `workshop(port)` commit.

**Pass:** Run:

```sh
git -C ../../out/rehearsal/app log --oneline
```

Confirm the phase commit.

### Step 16: Test the Plan Retry

**Run**

```sh
rm -rf ../../out/retry-rehearsal
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes --run-id retry-rehearsal
```

**Expect:** Attempt 1 reports missing `## TV Flow` and `## Focus`. Attempt 2
passes. `port-result.json` records two attempts.

**Pass:** Open `../../out/retry-rehearsal/port-result.json`.
Confirm that attempt 2 receives both failure messages.

### Step 17: Test the New Check Exercise

Save the original file:

```sh
cp src/port-verification.ts /tmp/port-verification.ts.before
```

Add the lesson check to `tvReadyChecks()` in `src/port-verification.ts`. Add a
`contains` check for `originating card` in `TV_VERIFICATION.md`.

**Run**

```sh
yarn tsx src/index.ts tv-check ../../apps/pocket-cinema
yarn tsx src/index.ts tv-check ../../workshop/checkpoints/vega-buildable/app
```

**Expect:** The first command fails. The second command passes.

**Pass:** Review and restore only this rehearsal change:

```sh
git diff -- src/port-verification.ts
cp /tmp/port-verification.ts.before src/port-verification.ts
rm /tmp/port-verification.ts.before
yarn typecheck
```

### Step 18: Test the Live Compiler Repair

**Run**

```sh
yarn tsx src/index.ts inject-build-failure rehearsal --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
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
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --phases analyze,plan --run-id build-recovery --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --phases port --run-id build-recovery --yes
```

**Expect:** The second command reports `plan_approval_required` and exits with
code 1.

**Run**

```sh
yarn tsx src/index.ts approve-plan build-recovery --yes
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --platform-replay ../../workshop/fixtures/build-retry/vega-lifecycle.json \
  --phases port,build,launch,test --run-id build-recovery --yes
```

**Expect:** The build retry receives compiler error `TS2551`. All six phases
complete. `build` records one model call. `launch` and `test` record
`attempts: 0`.

**Pass:** Keep run ID `build-recovery`. Step 22 uses it.

Explain three facts:

- The retry receives the compiler text.
- A passed pre-check does not call the model.
- The retry keeps build caches.

### Step 20: Test the Crash Check

**Run**

```sh
rm -rf /tmp/past-the-vibes-crash-demo
mkdir -p /tmp/past-the-vibes-crash-demo
cp ../../workshop/fixtures/vega-lifecycle.json \
  /tmp/past-the-vibes-crash-demo/vega-lifecycle.json
cp -R ../../workshop/fixtures/vega-lifecycle \
  /tmp/past-the-vibes-crash-demo/vega-lifecycle
```

Add `FATAL EXCEPTION: main` to the `logs` result in
`/tmp/past-the-vibes-crash-demo/vega-lifecycle.json`.

Confirm that the edited file contains valid JSON:

```sh
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log("valid JSON")' \
  /tmp/past-the-vibes-crash-demo/vega-lifecycle.json
```

**Run**

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay /tmp/past-the-vibes-crash-demo/vega-lifecycle.json \
  --phases launch --yes --run-id build-recovery
```

**Expect:** The command names the fatal exception and exits with code 2.

**Pass:** Confirm that the lifecycle stops before `test`.

### Step 21: Test the Post-Dwell State Check

**Run**

```sh
rm -rf /tmp/past-the-vibes-stopped-demo
mkdir -p /tmp/past-the-vibes-stopped-demo
cp ../../workshop/fixtures/vega-lifecycle.json \
  /tmp/past-the-vibes-stopped-demo/vega-lifecycle.json
```

Change the final `app_status` result to report that the app is not running:

```sh
node -e 'const fs=require("node:fs"); const p=process.argv[1]; const v=JSON.parse(fs.readFileSync(p,"utf8")); const s=v.turns.filter((t)=>t.capability==="app_status").at(-1); s.result.stdout="com.tvbuild.pocketcinema.main is not running on emulator-5554\n"; fs.writeFileSync(p,JSON.stringify(v,null,2)+"\n")' \
  /tmp/past-the-vibes-stopped-demo/vega-lifecycle.json
```

Confirm that the edited file contains valid JSON:

```sh
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log("valid JSON")' \
  /tmp/past-the-vibes-stopped-demo/vega-lifecycle.json
```

**Run**

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay /tmp/past-the-vibes-stopped-demo/vega-lifecycle.json \
  --phases launch --yes --run-id build-recovery
```

**Expect:** The command reports `app remains running after dwell check failed`
and exits with code 2.

**Pass:** Remove both temporary files:

```sh
rm -rf /tmp/past-the-vibes-crash-demo /tmp/past-the-vibes-stopped-demo
```

### Step 22: Compare Before and After

Use the completed run from step 19.

**Run**

```sh
yarn tsx src/index.ts tv-check ../../out/build-recovery/app
```

**Expect:** `tvReady: true` and `failures: []`. The focus result contains all
six transitions.

**Pass:** Put this result next to the `tvReady: false` result from step 4.

### Step 23: Test Appendix A1

Remove the output from an earlier rehearsal:

```sh
rm -rf ../../out/bee ../../out/bee-neg
```

**Run the proposal**

```sh
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --propose --run-id bee
```

**Expect:** The command writes `BEE_SPEC.md` and changes no source. The context
file contains a hash and conversation ID. It contains no transcript.

**Run the approved application**

```sh
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --apply --yes --run-id bee
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

```sh
rm -rf ../../out/bee-neg
```

## Part D: Rehearse the Teaching

### Step 24: Check the Schedule

Speak through the complete workshop with a timer.

| Start | Lesson                       | Minutes |
| ----- | ---------------------------- | ------- |
| 00:00 | Setup and doctor             | 20      |
| 00:20 | 1. Analyze                   | 25      |
| 00:45 | 2. Plan                      | 30      |
| 01:15 | 3. Port                      | 30      |
| 01:45 | Break                        | 10      |
| 01:55 | 4. Build                     | 30      |
| 02:25 | 5. Launch                    | 30      |
| 02:55 | Break                        | 10      |
| 03:05 | 6. Test                      | 25      |
| 03:30 | 7. Control and team exercise | 30      |

Remove optional exercises first if the session is late. Check the Vega device
during the first break.

### Step 25: Prepare the Prediction Answers

Prepare one short answer for each prediction:

1. A proposed patch does not prove build or behavior.
2. An analysis claim is not checked evidence.
3. ADBT supplies both Vega interaction guidance and current platform APIs.
4. A text check can accept a false manifest.
5. A useful retry includes the exact compiler text.
6. Two running-state samples and a log scan can detect a delayed crash.
7. One visual observation cannot prove focus restoration.

### Step 26: Prepare the Evidence Statements

State these limits:

- A model response is a claim until an independent check passes.
- The TUI is a summary. Logs, checks, commits, packages, and state samples are evidence.
- Device results in fixtures are synthetic.
- The complete pipeline has not passed with both a live model and live device.
- The host check covers the focus module. The device check injects D-pad keys and reads focused `test_id` values from Automation Toolkit.
- Running-state and log evidence does not prove visual rendering.
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
- Confirm that the pinned ADBT MCP server can start.

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
cd packages/workshop-harness
yarn tsx src/index.ts doctor --json
cd ../..
rm -rf out/*
yarn site
```

Confirm that `workshop.config.json` selects the path that you will teach.

Start VDA in its dedicated terminal. Check status and device attachment.
Confirm the selected device procedure with both co-hosts.

**Pass:** Tests pass. Doctor reports ready. `out/` is empty. The site is open.
The initial and final TV results are ready for comparison.

## Finish the Rehearsal

Record the actual duration for each lesson.
Record each failed step and the action that fixed it.
Record the selected fallback for each live dependency.

Do not change workshop files during the live session.
Make the change after the session on a separate branch.
Use [the workshop editing guide](editing-guide.md).
