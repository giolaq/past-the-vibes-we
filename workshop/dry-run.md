# Dry Run: test everything, then rehearse

For the instructor, the day before the session. Work through the 33 steps in
order — each one is a command, the output you should see, and a pass criterion
you can tick. Budget **3 hours** for parts A–E and **15 minutes** on the
morning for part F. Two colleague briefs are steps 30–32.

Every expected output below was produced by running the command against this
repository. Where a claim has not been earned live, the step says so instead of
implying it.

How to read a step:

- **Run** — the exact command.
- **Expect** — what the terminal shows when it works.
- **Pass** — the box you tick. If you cannot tick it, stop and fix before
  moving on; every later step assumes the earlier ones.

---

## Part A · Machine check, from a clean clone (~30 min)

Do this on the machine you will teach from. A stale `out/` directory hides
more problems than it causes, so start clean.

### Step 1 — Clone and install

**Run:**

```
git clone <this repo> /tmp/ptv-rehearsal && cd /tmp/ptv-rehearsal
corepack enable
yarn setup
```

**Pass:** install completes with no errors. Do not run `npm audit fix --force`
anywhere in this repo — the Vega SDK template pins React Native 0.72-era
dependencies on purpose.

### Step 2 — The full test suite

**Run:** `yarn verify`

**Expect:** the harness suite (92 tests, 0 failures), the app suite (2 tests),
then `Checked 36 workshop documents and 57 command paths.` and
`workshop.data.js is up to date with workshop/lessons/*.md.` The counts move
when documents change; zero failures is the criterion.

**Pass:** every suite green, no stale-site warning.

### Step 3 — Doctor

**Run:** `yarn doctor`

**Expect:** `state: ready`, with `adbt`, `vega`, and `bee` reported as
`optional` — that is correct for replay mode, not a problem to fix.

**Pass:** `state: ready`.

### Step 4 — The "before" photo

**Run:**

```
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema
```

**Expect:** `tvReady: false` with six failures — the focus module, the App
wiring, the initial focus prop, the manifest (twice), and the missing focus
test. The seventh check, the executable one, is skipped because the test file
does not exist yet.

**Pass:** six failures, and you can say the sentence that goes with them:
*this list is the workshop's to-do list — lesson 6 closes it.*

### Step 5 — Slides

**Run:** open `workshop/slides.html` in a browser and arrow through it.

**Expect:** 19 slides, ending on the close. Confirm the two lesson-8 slides
are present: the optional panel ("a conversation becomes code") and the
second-pipeline slide with the propose/approve/apply flow.

**Pass:** all 19 render, reveal animations fire, the counter reads `19 / 19`
at the end.

### Step 6 — Website

**Run:** `yarn site`, then open the printed URL.

**Expect:** 10 modules in the navigation, lesson 8 titled "A conversation
becomes code, with a gate in the middle". Leave the server running for the
rest of the rehearsal.

**Pass:** every module opens; no raw directive markers visible.

### Step 7 — Optional: live ADBT

Only if you plan to demo the live MCP call in lesson 2.

**Run:**

```
yarn --cwd packages/workshop-harness tsx src/index.ts doctor --adbt-live --json
```

**Expect:** `adbt` reports `native MCP: 2 Vega port workflows available`.

**Pass:** or skip — replay covers the lesson.

### Step 8 — Start clean

**Run:** `rm -rf out/*`

**Pass:** the run directory is empty. Every demo below starts from nothing,
the way it will in the room.

---

## Part B · Device go/no-go (decide now, not during lesson 4)

### Step 9 — SDK

**Run:** `vega --version`

**Pass:** prints `0.22.5875`.

### Step 10 — Start the device

**Run:** in a dedicated system terminal you will keep open all day:

```
vega virtual-device start --gui
```

**Pass:** the device window appears and the terminal stays attached.

### Step 11 — Confirm attachment, twice

**Run:** in a second terminal:

```
vega virtual-device status
vega exec vda devices -l
```

**Expect:** `running: true` and a listed device. An empty device list is a
failure even when the command exits 0. Re-run both **after 20 minutes idle** —
the failure mode on record is the device detaching later, not refusing to
start.

**Pass:** both commands green, both times.

### Step 12 — Decide the device posture

| Outcome of steps 9–11 | What you teach |
| --- | --- |
| All green, still green after 20 min | Lessons 4–6 live, replay as the per-attendee fallback |
| Attached, but the screenshooter segfaults | Lesson 4 live, 5–6 on `--platform-replay`, and say which claim you lost |
| Device will not stay attached | All of 4–6 on replay; state up front the device claim is not on the table today |

`workshop/live-rehearsal.md` records the last live attempt: SDK, ADBT,
manifest validation, bundling, and `.vpkg` generation passed; install, launch,
logs, and real screenshots did not, because VDA would not stay attached. Read
it before you promise anyone a device.

**Pass:** you have picked a row and told your co-hosts which one.

---

## Part C · Demo-by-demo test pass (~60 min)

Run every demo you will show, in lesson order, and check the output against
what the lesson promises. All commands below are the replay path — the one
most of the room will run. If step 12 said live, run the live variant first,
then this one anyway.

From here on, work in the harness directory:

```
cd packages/workshop-harness
```

### Step 13 — Lesson 1: analyze

**Run:**

```
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases analyze --yes --run-id rehearsal
```

**Expect:** `phasesComplete: ["analyze"]`, and `out/rehearsal/app/ANALYSIS.md`
exists.

**Pass:** `git status apps/pocket-cinema` (from the repo root) is clean — the
model worked in the guarded copy. Rehearse the sentence: *the model is a
contractor with read-only access; the harness is the foreman.* Then pick your
three claims in `ANALYSIS.md` that nothing has checked — you need them ready
if the room is quiet.

### Step 14 — Lesson 2: plan

**Run:** the same command with `--phases plan`.

**Expect:** `out/rehearsal/app/VEGA_PORT.md` contains both `## TV Flow` and
`## Focus`, and `out/rehearsal/adbt-port-context.json` names hashed ADBT
documents.

**Pass:** both sections present. Rehearse the two-sources beat: the focus
skill answers *where does focus start and what does Back do*; ADBT answers
*which Vega API replaces this*. The model chose its own documents; the harness
hashed what it read — that is how the run stays reproducible without the
harness pre-picking docs.

### Step 15 — Lesson 3: port

**Run:** the same command with `--phases port`.

**Expect:** nine checks pass, the guarded copy gains `apps/vega/` and
`src/tv/focus-state.ts`, and a `workshop(port)` commit lands.

**Pass:** `git -C out/rehearsal/app log --oneline` shows the phase commit.
Open `tvReadyChecks()` in `src/port-verification.ts` and rehearse the line: *a
check is a value in a list, not a clever function.*

### Step 16 — Lesson 3: the retry demo

**Run:**

```
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes
```

**Expect:**

```
plan attempt 1 failed:
  - TV flow documented: VEGA_PORT.md must contain "## TV Flow"
  - Focus model documented: VEGA_PORT.md must contain "## Focus"
```

then `run_complete`, and `attempts: 2` in that run's `port-result.json` with
the rejected attempt's failures kept.

**Pass:** the run recovers. This fixture was stale until this rehearsal cycle
— it is now generated by `scripts/build-port-fixtures.mjs`, so if you ever
change `phases()`, re-run that script or this demo breaks silently.

### Step 17 — Lesson 3: the assignment, then revert

**Run:** add the assignment's check to `tvReadyChecks()` in
`src/port-verification.ts` — a `contains` on `TV_VERIFICATION.md` with value
`originating card` — then:

```
yarn tsx src/index.ts tv-check ../../apps/pocket-cinema
yarn tsx src/index.ts tv-check ../../workshop/checkpoints/vega-buildable/app
```

**Expect:** your rule fails on the starter and passes on the checkpoint.

**Pass:** red then green. Then **revert the edit** —
`git checkout -- src/port-verification.ts` — or step 2's suite fails tomorrow
morning and you will spend the pre-session window debugging yourself.

### Step 18 — Lesson 4: build on replay

**Run:**

```
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --phases build --yes --run-id rehearsal
```

**Expect:** the build passes from the recording and the result labels itself
`evidenceMode: replay`.

**Pass:** green, and you can say what it does and does not prove.

### Step 19 — Lesson 4: the build-repair demo

The single most useful command in the rehearsal — all six phases, one run,
with a failure in the middle.

**Run:**

```
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --platform-replay ../../workshop/fixtures/build-retry/vega-lifecycle.json \
  --yes
```

**Expect:** `build needs a fix:` carrying the compiler's own lines —

```
src/tv/focus-state.ts(18,24): error TS2551: Property 'preferedFocus' does not exist on type 'FocusState'. Did you mean 'preferredFocus'?
```

— then `phasesComplete` naming all six phases. In `port-result.json`: `build`
records the failure and one model call; `launch` and `test` record
`attempts: 0`.

**Pass:** all six complete. Rehearse the three sentences that go with it: the
harness sends the model *the compiler's diagnostics*, not "try again"; a green
check costs no model call (`verifyFirst` — that is the `attempts: 0`); and the
retry keeps `build/` and `node_modules/`, or every retry would be a cold
build. Note this run's id — step 22 uses its output.

### Step 20 — Lesson 5: break the crash gate

Copy the lifecycle fixture **into its own directory** — a copy elsewhere
cannot resolve the recording's relative frame path and dies with an unrelated
`ENOENT` in front of the room.

**Run:**

```
cp ../../workshop/fixtures/vega-lifecycle.json ../../workshop/fixtures/crash-demo.json
# edit crash-demo.json: append "FATAL EXCEPTION: main" to the logs turn's stdout
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/crash-demo.json \
  --phases launch --yes --run-id crashdemo
```

**Expect:**

```
launch needs a fix:
  - the app crashed after launch: fatal exception: FATAL EXCEPTION: main
```

then exit code 2, with a final line saying the replay has no turn left.

**Pass:** the gate names the exact log line. Rehearse the sentence for that
last line, because without it the demo looks broken: *a live run would rebuild
and retry here — the recording has nothing left to give.*

### Step 21 — Lesson 5: break the pixel gate

**Run:** same as step 20, but the copy (`noshot-demo.json`) has its
`screenshot` line deleted.

**Expect:**

```
launch screenshot renders content failed: frame is 1x1, smaller than the
640x360 minimum for a device screen; frame holds 1 distinct colour, under the
12 a rendered screen shows; 100% of the frame is one flat colour; frame is
black (mean luminance 0.000)
```

**Pass:** exit 2, and neither break-it run reached `test`. Then delete both
copies — they must not be lying around in `workshop/fixtures/` tomorrow:

```
rm ../../workshop/fixtures/crash-demo.json ../../workshop/fixtures/noshot-demo.json
```

### Step 22 — Lesson 6: the before/after

`--phases test` alone cannot work on replay — the happy-path recording has no
`test` turn and a fresh copy has no port artifacts. Use step 19's completed
six-phase run instead.

**Run:** `yarn tsx src/index.ts tv-check out/<step-19-runId>/app`

**Expect:** `tvReady: true`, `failures: []`, and in that run's app directory,
`tv-focus-result.json` with `"passed": true` and all six transitions including
`back-restore`.

**Pass:** put this output and step 4's `tvReady: false` on screen **at the
same time**. That pair is the workshop's before-and-after photo, and it lands
much harder side by side than sequentially.

### Step 23 — Lesson 7: memory (optional lesson, rehearse anyway)

**Run:** from the repo root:

```
WORKSHOP_INPUTS="/tmp/past-the-vibes-pocket-cinema-inputs"
rm -rf "$WORKSHOP_INPUTS"
cp -R workshop/fixtures/pocket-cinema-inputs "$WORKSHOP_INPUTS"
yarn --cwd packages/workshop-harness tsx src/index.ts memory apply \
  /tmp/past-the-vibes-pocket-cinema-inputs \
  --from ../../workshop/fixtures/bee-context/snapshot.json --yes --json
```

**Expect:** four entries — two product decisions, one constraint, one open
question — each naming its source id.

**Pass:** `PROJECT_CONTEXT.md` exists in the copy and every entry has a
source. The committed fixture is unchanged.

### Step 24 — Lesson 8: both halves and the refusal

**Run:** the propose half:

```
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json --propose
```

**Expect:** `bee_spec_ready` pointing at `out/bee/app/BEE_SPEC.md`.

Read the spec out loud — the **Deliberately excluded** section especially: the
travel and family material is there, and so is search, because nobody agreed
what it searches. Check that
`git -C out/bee/app diff --name-only HEAD~2 HEAD` names two files only: the
spec and its rendering. No source changed. Then `out/bee/bee-context.json`
holds a hash and a conversation id and not a word of transcript. The separate
`out/bee/model-logs/bee_spec.jsonl` is intentionally complete and therefore
contains the synthetic conversation used by this exercise. Treat a live one
as private and delete or scrub it before sharing the run directory.

**Run:** the apply half:

```
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json --apply --yes
```

**Expect:** first the spec's own checks failing (`bee_apply needs a fix:` —
that failure is recorded evidence, not a bug), then
`phasesComplete: ["bee_spec","bee_apply","build","launch"]`.

**Run:** the refusal, so you have seen it once:

```
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --run-id bee-neg --apply --yes
```

**Expect:** `bee_spec_missing`, exit 1 — an unapproved spec is not a thing to
build from. Clean up with `rm -rf out/bee-neg`.

**Pass:** all three behave as above. The beat to rehearse: *you approve the
acceptance criteria before the code exists*, and `build` and `launch` in the
output are lesson 4 and lesson 5's phases, unchanged.

---

## Part D · Teaching rehearsal (~45 min)

### Step 25 — Run the clock once

Talk through the session against the schedule, out loud, with a timer. You do
not need to re-run commands — the point is discovering which transitions you
fumble.

| Time | Lesson | Minutes |
| --- | --- | --- |
| 00:00 | Setup, app choice, doctor | 20 |
| 00:20 | 1 · Analyze | 25 |
| 00:45 | 2 · Plan | 30 |
| 01:15 | 3 · Port | 30 |
| 01:45 | **Break** | 10 |
| 01:55 | 4 · Build | 30 |
| 02:25 | 5 · Launch | 30 |
| 02:55 | **Break** | 10 |
| 03:05 | 6 · Test | 25 |
| 03:30 | 9 · Full-run TUI, then take it home | 20 |

Slack lives in two places only: the 10-minute repair rule and the per-lesson
assignments — an attendee who falls behind drops the assignment first. Check
the room's Vega setup during the **first** break, not during lesson 4.

### Step 26 — The eight predict prompts

Each lesson opens hands-on work with a `:::predict`. Rehearse your own answer
to each, because you will be asked "well, what is it then":

1. **L1** — an analysis claim that reads confident but is unchecked: e.g. "the
   catalog logic ports cleanly" — nothing has compiled or run anything yet.
2. **L2** — the focus skill answers where focus starts and what Back does;
   ADBT answers which Vega API replaces what.
3. **L3** — an invented-but-plausible manifest passes every lesson-3 check;
   `file_exists` and `contains` cannot catch it. That is the cliffhanger for
   lesson 4, where the check becomes a compiler.
4. **L4** — the harness may send the compiler's diagnostics, verbatim.
   "Try again" and a paraphrase of the error are useless.
5. **L5** — an app that throws two seconds after its first frame is caught by
   the log scan and the second frame, not the first screenshot.
6. **L6** — Back restoring focus to the originating card: looks identical in a
   screenshot, broken for a real remote user.
7. **L7** — auto-importing every remembered sentence turns private or wrong
   material into trusted context with no reviewer.
8. **L8** — the flight and the family visit go to *excluded*; so does search,
   because nobody agreed what it searches; the rail and the runtime become
   requests with checks.

### Step 27 — The claims list

Rehearse until each is one sentence. Every one is a place where overclaiming
gets caught by someone in the room.

Say:

- Replay proves command order, stop conditions, and the report shape — and
  labels itself `evidenceMode: replay`. It is not device evidence.
- Every device turn in the fixtures is synthetic. Nobody's device produced
  them.
- The six-phase pipeline has not run end to end against a live model and a
  real device. Proven live so far: SDK discovery, ADBT over MCP, manifest
  validation, bundling, `.vpkg` generation.
- The focus test drives the focus module, not the device's input system. It
  does not press a button.
- Lesson 8's Bee path is replay-verified here; the live path needs an account
  and `bee login`, outside the harness.
- A model reporting on its own work is another generated claim.

Do not claim:

- That the device path is certified — not until install, launch, logs, and a
  real screenshot pass against an attached VDA.
- That any lesson requires a live model. None does.
- That the harness prevents bad code. It prevents *unchecked* code — checks
  are only as strong as their shape.

### Step 28 — The four-things rule

Before every exercise, state: what they run, what they inspect, what proves
completion, and which fixture or checkpoint to use when blocked. Practice
saying all four for lesson 4 in under thirty seconds — it is the lesson where
the room is most likely to fork into live and replay halves.

### Step 29 — The failure drill

Pick one demo and break it on purpose in front of your co-hosts — unplug the
device mid-lesson-5, or point a command at a missing fixture. Practice the
recovery: name the boundary that failed, switch to the replay command, keep
talking. Doing that calmly, once, teaches the workshop's actual thesis better
than a green run does.

---

## Part E · Brief your co-hosts (~20 min)

One owns the device, one owns the room. Neither teaches — you keep one voice
at the front.

### Step 30 — Colleague A: device and build

Before the session:

- Start VDA in a dedicated terminal and keep it alive. Re-check
  `vega exec vda devices -l` at the top of every lesson and at both breaks.
- Unpack `workshop/checkpoints/vega-buildable/` and
  `workshop/checkpoints/complete/` on a machine that can reach the projector.
- Confirm `init-context --force` installed the `amazon-devices-vega-*` skills
  on the demo machine.

During:

- Run every lesson's command **one lesson ahead** of the room, on their own
  machine, and report failures immediately. You should never be the first
  person to find out a command is broken.
- When the device drops, say so quietly and hand you the replay command. No
  repair longer than 10 minutes.
- Keep the ledger of "what claim have we earned" — live vs replay, per lesson.
  You will be asked, and the answer must be immediate.

### Step 31 — Colleague B: room and fallbacks

Before the session:

- Collect each attendee's executor status — Claude Code ready, Strands +
  Bedrock ready, or needs replay — and bring the count before you start.
- Hold the replay command for every lesson in a paste buffer.

During:

- Float. Triage blockers with a visible 10-minute timer, then move the person
  to replay and note what failed. The rule is theirs to enforce, not yours.
- Track the measurement list from the instructor guide: lessons completed,
  port completed, TV behavior understood, live run completed, fallback used,
  cost, help requests.
- Watch the clock against step 25's table and hand-signal at five minutes over
  on any lesson.

### Step 32 — The adversarial drill

During the rehearsal, each colleague picks three questions from this list and
asks them cold, mid-demo:

1. Isn't this a shell script with extra steps?
2. Why not point Claude Code at the repo and ask it to port the app?
3. The model wrote the plan and the model wrote the code. Who checked the plan?
4. Replay is fake. What has this actually proven?
5. What stops it deleting my repo?
6. Your check greps for `## Focus`. I can satisfy that with an empty heading.
   What is that check worth?
7. It failed twice and gave up. Isn't a real agent supposed to keep going?

Have crisp answers for the last two especially. The grep-able check is a real
weakness and the honest answer is the teaching point: reach for the strongest
shape the requirement allows — `command` beats `contains` beats `file_exists`
— which is exactly why lessons 4–6 stop asserting and start executing. The
give-up question: the loop has three exits and none of them is the model's
opinion — checks pass, budget runs out, or the same failure repeats twice.

---

## Part F · Morning of (15 min)

### Step 33 — The final sweep

```
cd /tmp/ptv-rehearsal
git pull
yarn verify
yarn doctor
rm -rf out/*
yarn site
```

Then, in the dedicated terminal: `vega virtual-device start --gui`, confirm
`status` and `devices -l`, and re-confirm the step 12 posture with both
colleagues. Slides open in a browser tab, checkpoints unpacked on colleague
A's machine, timer visible for colleague B.

**Pass:** verify green, doctor ready, `out/` empty, device posture agreed, and
the two outputs from step 22 — `tvReady: false` and `tvReady: true` — ready to
put side by side.
