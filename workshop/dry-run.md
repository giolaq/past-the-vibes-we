# Dry Run: rehearsing Past the Vibes

For the instructor, the day before. Assumes you rehearse alone or with your two
co-hosts, then teach the real session later. Budget **3 hours**. Nothing here is
attendee material — this is the run-through, the things most likely to fail on
stage, and the two colleague briefs.

Everything below has been executed from this repository. Where a claim has not
been earned live, this document says so instead of implying it.

---

## Block 0 · Environment, from a clean clone (30 min)

Do this first, on the machine you will teach from. A stale `out/` directory
hides more problems than it causes.

```sh
git clone <this repo> /tmp/ptv-rehearsal && cd /tmp/ptv-rehearsal
corepack enable
yarn setup
yarn verify
yarn doctor
```

Expected: `yarn verify` prints 92 harness tests, 2 app tests, `Checked 35
workshop documents and 57 command paths`, and `workshop.data.js is up to date`.
`yarn doctor` reports `state: ready` with `adbt`, `vega`, and `bee` as
`optional` — that is correct for replay.

Then the "before" evidence, which opens the workshop:

```sh
yarn --cwd packages/workshop-harness tsx src/index.ts tv-check ../../apps/pocket-cinema
```

`tvReady: false` with seven failures. **That list is the workshop's to-do
list** — say exactly that when you show it, because lesson 6 closes it.

Last, start the website and leave it up:

```sh
yarn site
```

### Go / no-go for the device path

Run these in a system terminal you leave open for the whole session:

```sh
vega --version
vega virtual-device start --gui
vega virtual-device status
vega exec vda devices -l
```

Live Vega is ready only when all three are true: SDK prints `0.22.5875`,
status reports `running: true`, and `devices -l` lists an attached device.
Decide now, not during lesson 4:

| Outcome | What you teach |
| --- | --- |
| All three green, still green after 20 minutes idle | Lessons 4–6 live, replay as the per-attendee fallback |
| Device attaches but the screenshooter segfaults | Lessons 4 live, 5–6 on `--platform-replay`, and say which claim you lost |
| Device will not stay attached | All of 4–6 on replay; state up front that the device claim is not on the table today |

`workshop/live-rehearsal.md` records the last rehearsal: SDK, ADBT, manifest
validation, bundling, and `.vpkg` generation passed; install, launch, logs, and
real screenshot capture did not, because VDA would not stay attached. **Read it
before you promise anyone a device.**

---

## Block 1 · Lessons 1–3, out loud, on replay (35 min)

Run each command and narrate as if the room were there. The point of this block
is the talk track, not the output — you have already seen the output.

```sh
cd packages/workshop-harness

# Lesson 1
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases analyze --yes --run-id rehearsal

# Lesson 2
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases plan --yes --run-id rehearsal

# Lesson 3
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --phases port --yes --run-id rehearsal
```

Rehearse these four beats, in this order, because each one sets up the next:

1. **Lesson 1, after the run.** `git status apps/pocket-cinema` is clean. The
   model worked in `out/rehearsal/app`. Say the sentence: *the model is a
   contractor with read-only access; the harness is the foreman.*
2. **Lesson 1's honest limit.** Ask the room for three claims in `ANALYSIS.md`
   that nothing has checked. Have your own three ready — you need them if the
   room is quiet.
3. **Lesson 2, the two knowledge sources.** The focus skill answers *where does
   focus start and what does Back do*; ADBT answers *which Vega API replaces
   this*. Then show `out/rehearsal/adbt-port-context.json`: the model chose its
   own documents and the harness hashed what it read. Reproducibility does not
   require the harness to pre-pick the docs.
4. **Lesson 3, the nine checks.** Open `tvReadyChecks()` in
   `src/port-verification.ts` on screen. A check is a value in a list, not a
   clever function. Then the assignment: add the `TV_VERIFICATION.md` /
   `originating card` check and run `tv-check` on the starter app and on
   `workshop/checkpoints/vega-buildable/app` — red then green.

### The retry demo, which is the money shot of lesson 3

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-retry/port-recording.json \
  --phases analyze,plan --yes
```

You should see `plan attempt 1 failed:` naming both `## TV Flow` and `##
Focus`, then the run completing, and `attempts: 2` in `port-result.json` with
the rejected attempt's failures kept.

> This fixture was stale until today — its second attempt did not satisfy the
> focus check the six-phase redesign added, so the demo failed after two
> attempts instead of recovering. It is now generated by
> `scripts/build-port-fixtures.mjs` along with the others. If you ever change
> `phases()`, re-run that script or this demo breaks again silently.

---

## Block 2 · The device path, twice (45 min)

Run it live first if your go/no-go said you could. Then run the recorded path,
because that is what most of the room will run.

```sh
# Lesson 4, key-free
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json \
  --phases build --yes --run-id rehearsal
```

Then the build-repair demo, which teaches more than a green build:

```sh
yarn tsx src/index.ts run ../../apps/pocket-cinema \
  --inputs ../../workshop/fixtures/pocket-cinema-inputs \
  --replay ../../workshop/fixtures/build-retry/port-recording.json \
  --platform-replay ../../workshop/fixtures/build-retry/vega-lifecycle.json \
  --yes
```

This runs all six phases in one run id and is the single most useful command in
the rehearsal. It prints `build needs a fix:` carrying the compiler's real
`TS2551` line, calls the model once, and finishes with `launch` and `test` at
`attempts: 0`.

Three things to say while it runs:

- **What the harness is allowed to send the model.** The compiler's own
  diagnostics. Not "try again", and not a summary of the error.
- **`verifyFirst`.** `launch` and `test` show `attempts: 0` — a green check
  costs no model call. That is why the build phase checks before it prompts.
- **The retry keeps `build/` and `node_modules/`.** A reset that deleted them
  would make every retry a cold build.

### Lesson 6 on replay needs a full run, not `--phases test`

`--phases test` against a fresh or stale copy fails: the port artifacts are not
there and the happy-path recording has no `test` turn to offer. Use the
six-phase run above, then:

```sh
yarn tsx src/index.ts tv-check out/<runId>/app     # tvReady: true, failures: []
```

That pairs with the `tvReady: false` from Block 0. **Have both outputs on
screen at once** — it is the workshop's before-and-after photo, and it lands
much harder side by side than sequentially.

### The two break-it demos (lesson 5)

Copy `workshop/fixtures/vega-lifecycle.json` **into that same directory**, or
the frame path stops resolving and you get an unrelated `ENOENT` in front of the
room. Both of these are verified:

- Add `FATAL EXCEPTION: main` to the `logs` turn's stdout →
  `the app crashed after launch: fatal exception: FATAL EXCEPTION: main`
- Delete the `screenshot` line → `frame is 1x1, smaller than the 640x360
  minimum for a device screen; frame holds 1 distinct colour; 100% of the frame
  is one flat colour; frame is black (mean luminance 0.000)`

Both exit 2 and neither reaches `test`. The line after the gate says the
recording ran out of turns — say why: a live run would rebuild and retry here,
and a recording has nothing left to give. Rehearse that sentence, because
without it the last line of output looks like the demo broke.

---

## Block 3 · The optional lessons and the close (30 min)

Lessons 7 and 8 are outside the four-hour path. Rehearse them anyway — they are
what you reach for if a lesson finishes early, and lesson 8 is the strongest
answer to *is this reusable*.

```sh
# Lesson 7
WORKSHOP_INPUTS="/tmp/past-the-vibes-pocket-cinema-inputs"
rm -rf "$WORKSHOP_INPUTS"
cp -R workshop/fixtures/pocket-cinema-inputs "$WORKSHOP_INPUTS"
yarn --cwd packages/workshop-harness tsx src/index.ts memory apply \
  /tmp/past-the-vibes-pocket-cinema-inputs \
  --from ../../workshop/fixtures/bee-context/snapshot.json --yes --json
```

```sh
# Lesson 8, both halves
cd packages/workshop-harness
yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json --propose

yarn tsx src/index.ts bee-run ../../apps/pocket-cinema \
  --replay ../../workshop/fixtures/bee-run/port-recording.json \
  --platform-replay ../../workshop/fixtures/vega-lifecycle.json --apply --yes
```

Read `out/bee/app/BEE_SPEC.md` out loud — the excluded section especially. The
beat that matters: **you approve the acceptance criteria before the code
exists**, so when the apply phase passes it passed a bar you set. Then point at
`build` and `launch` in the output and say they are lesson 4 and lesson 5's
phases, unchanged.

For the close (lesson 9), pick one domain from your own work and fill in
`workshop/worksheet.md` yourself, in front of them, in five minutes. A worked
example beats an instruction to go and work.

---

## Block 4 · Brief your co-hosts (20 min)

Two colleagues is the right number for this workshop, and the split that works
is **one owns the device, one owns the room**. Neither should be teaching — you
have one voice at the front.

### Colleague A — device and build

Owns everything that can fail for infrastructure reasons.

Before the session:
- Start VDA in a dedicated terminal and keep it alive. Re-check
  `vega exec vda devices -l` at the top of every lesson and at both breaks.
- Have `workshop/checkpoints/vega-buildable/` and `workshop/checkpoints/complete/`
  already unpacked on a machine that can be plugged into the projector.
- Confirm `init-context --force` has installed the `amazon-devices-vega-*`
  skills on the demo machine.

During the session:
- Run every lesson's command **one lesson ahead** of the room, on their own
  machine, and tell you immediately if something fails. You should never be the
  first person to find out a command is broken.
- When the device drops, say so quietly and hand you the replay command. Do not
  attempt a repair longer than 10 minutes.
- Keep the running answer to "what claim have we actually earned" — live vs
  replay, per lesson. You will be asked.

### Colleague B — room and fallbacks

Owns attendee flow, so you never stop teaching to debug one laptop.

Before the session:
- Collect each attendee's executor status: Claude Code ready, Strands + Bedrock
  ready, or needs replay. Bring you the count before you start.
- Have the replay command for every lesson in a paste buffer.

During the session:
- Float. Triage blockers with a visible 10-minute timer, then move that person
  to replay and note what failed. The rule is theirs to enforce, not yours.
- Track the measurement list from `workshop/instructor-guide.md`: lessons
  completed, port completed, TV behavior understood, live run completed,
  fallback used, cost, help requests.
- Watch the clock against the schedule below and give you a hand signal at
  five minutes over on any lesson.

### Both, during the rehearsal itself

Give them the useful adversarial job. Ask each to pick three questions from
this list and ask them cold, mid-demo:

- Isn't this just a shell script with extra steps?
- Why not point Claude Code at the repo and ask it to port the app?
- The model wrote the plan and the model wrote the code. Who checked the plan?
- Replay is fake. What has this actually proven?
- What stops it deleting my repo?
- You added a check that greps for `## Focus`. I can satisfy that with an empty
  heading. What is that check worth?
- It failed twice and gave up. Isn't a real agent supposed to keep going?

The last two are the ones to have crisp answers for. The grep-able check is a
real weakness and the honest answer is the teaching point: reach for the
strongest check shape the requirement allows — `command` beats `contains` beats
`file_exists` — which is exactly why lessons 4–6 stop asserting and start
executing. The give-up question: three exits, none of them the model's opinion
— checks pass, budget runs out, or the same failure repeats twice.

---

## The clock

From `workshop/instructor-guide.md`. Core path is 205 minutes; two 10-minute
breaks and a 15-minute close make four hours.

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
| 03:30 | 9 · Take it home | 15 |

Slack lives in two places only: the 10-minute repair rule, and the per-lesson
assignments. An attendee who falls behind drops the assignment first. Check the
room's Vega setup during the **first** break, not during lesson 4.

---

## What you must say out loud, and what you must not claim

Rehearse these until they are one sentence each. Every one of them is a place
where overclaiming would be caught by someone in the room.

**Say:**

- Replay proves command order, stop conditions, and the report shape. It is not
  evidence that a device built or launched anything, and it labels itself
  `evidenceMode: replay`.
- Every device turn in the fixtures is synthetic. Nobody's device produced them.
- The six-phase pipeline in this repository has not been run end to end against
  a live model and a real device. The parts that have been proven live are SDK
  discovery, ADBT over MCP, manifest validation, bundling, and `.vpkg`
  generation.
- The focus test drives the focus module, not the device's input system. It does
  not press a button.
- Lesson 8's Bee path is replay-verified here; the live path needs an account
  and `bee login`, outside the harness.
- A model reporting on its own work is another generated claim.

**Do not claim:**

- That the device path is certified. It is not, until install, launch, logs, and
  a real screenshot pass against an attached VDA.
- That any lesson requires a live model. None does.
- That the harness prevents bad code. It prevents *unchecked* code — the checks
  are only as strong as their shape.

If a live step fails in front of the room, name the boundary that failed and
continue on replay. Doing that calmly, once, teaches the workshop's actual
thesis better than a green run does.
