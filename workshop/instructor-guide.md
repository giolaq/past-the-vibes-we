# Instructor Guide

Rehearsing before you teach? [The dry run](dry-run.md) is the timed run-through:
every demo command with its verified output, the demos most likely to fail on
stage, the go/no-go for the device path, and briefs for two co-hosts.

## Before the workshop

1. Send [setup](lessons/00-welcome.md) 48 hours early.
2. Open the [speaker deck](slides.html) (`workshop/slides.html`, also served at `/slides.html` by `yarn site`). It carries the intro plus one slide per teaching beat: the boundary, each lesson's key idea, the Strands and ADBT highlights, and the close. Arrow keys or swipe to navigate; print to PDF from the browser for a handout.
3. Use one live executor as the room-wide path. Ask attendees to report **Claude Code ready** or their chosen **Strands provider ready** before lesson 1. Keep recordings and checkpoints ready for individual recovery.
4. Test the live path and every recorded/checkpoint fallback from a clean clone.
5. Rehearse ADBT `1.0.5`, Vega SDK `0.22.5875`, and the target VDA image. Confirm pinned `init-context --force` installed the `amazon-devices-vega-*` skills on live demo machines. The harness supplies ADBT MCP explicitly to both Strands and Claude Code; it does not rely on global MCP settings.
6. Read [the latest live rehearsal](live-rehearsal.md), and don't present the device path as ready until the VDA stays attached.
7. Start VDA in a separate system terminal, keep it open, and confirm `vega virtual-device status` plus `vega exec vda devices -l` before attendees arrive.
8. Keep the completed TV app hidden until the TV exercise ends.

Open with the one-shot anti-demo, not the architecture. Let the proposal look convincing, then
read its five missing proofs. Put the claim-versus-proof board on screen and keep returning to it.
Only then name the boundary: Strands supplies the model loop, typed tools, structured output, MCP
client, limits, and metrics. The harness supplies phases, approval, writes, checks, retry, commits,
budget, and evidence. Show `port-tools.ts`, `port-contract.ts`, and `context-providers/adbt.ts` after
attendees have felt the missing boundary.

During lesson 2, trace one ADBT skill (for example `amazon-devices-vega-focus-management`) through both routes: full-text prompt injection for Claude CLI, then `Skill` → `AgentSkills` → `plugins` → `skills` tool for Strands. Point out that the skills are Amazon's, installed by `init-context` — the harness consumes vendor knowledge without owning it. Then contrast skills with runtime MCP: the harness passes the same pinned ADBT stdio server explicitly to Claude Code and to Strands' native `McpClient`. Continue with provider `Model`, `Agent`, `systemPrompt`, `invoke()` limits, `AgentResult` metrics, typed `tool()` callbacks, structured output, `listTools()`, `callTool()`, and `disconnect()`. State that Zod, native `AbortSignal`, and `StdioClientTransport` are adjacent dependencies, not Strands APIs. Keep [the construct reference](strands-constructs.md) open for questions.

## Four-hour schedule

| Time | Attendees do | If blocked |
| --- | --- | --- |
| 00:00 | Set up, choose an app, and validate one live executor | Use Pocket Cinema; move a blocked attendee to the recorded fallback after one repair |
| 00:20 | Lesson 1: one-shot anti-demo, analyze, and cross-provider comparison | Skip the anti-demo model call; inspect the instructor result, then run recorded analyze |
| 00:45 | Lesson 2: the focus skill and ADBT, then the team-skill assignment | Run the assignment on replay and explain which artifact replay honors |
| 01:15 | Lesson 3: write the port, then trace a failed check into one retry | Use `fixtures/port-retry/` and the check assignment |
| 01:45 | **Break** | Keep it a full 10 minutes |
| 01:55 | Lesson 4: inject one guarded type error and repair it live from compiler output | Use `fixtures/build-retry/` — it fails and repairs on purpose |
| 02:25 | Lesson 5: install and launch on the VDA, then break each gate on purpose | Fall back to platform replay or the complete checkpoint |
| 02:55 | **Break** | Keep it a full 10 minutes |
| 03:05 | Lesson 6: run the focus contract and close the loop with `tv-check` | Use the focus fixture and the vega-buildable checkpoint |
| 03:30 | Lesson 7: inspect the live run in the TUI, then trade and attack team harness designs | Use the completed checkpoint if the attendee has no full run |

Appendix A1 — the Bee-to-spec pipeline — is outside the four-hour path. Run it only if a lesson finishes early and the room has explicit consent, account access, and time. Otherwise use the synthetic case study or skip it.

For lesson 2, show the five boundaries on screen: native ADBT MCP connection, the model's own document choice, `plan` prompt context, `NextSteps.md`, and the verified phase commit. Use `--adbt-live` with the recorded model response to demonstrate the real MCP call without spending model budget.

The scheduled work, two breaks, and the 20-minute close take 230 minutes. Keep the final 10
minutes as recovery and questions. Lessons 4 to 6 need the Vega SDK and a device for their live
claim, so check the room's setup during the first break — an attendee without it runs the
recorded fallback and says which claim they earned. The 10-minute rule and the per-lesson
fallbacks are the slack; an attendee who falls behind drops the assignment first.

## Teaching rule

State four things before each exercise:

1. What attendees will run.
2. What file or output they will inspect.
3. What proves the exercise is complete.
4. Which recording or checkpoint to use if blocked.

After each exercise, ask for three short statements: the claim, its independent proof, and what
that proof still cannot establish. Do not accept “the model said so” in the proof column.

Do not let model, device, or account setup consume the workshop. Try one repair for no more than 10 minutes, then move to the fallback.

## What to measure

Track these separately:

- core harness lessons completed;
- guarded React Native port completed;
- TV behavior understood;
- live Vega run completed;
- fallback used;
- time and model cost;
- help requests.

The teaching path uses a live model and prefers real Vega evidence. Recovery material prevents an
external account or device failure from erasing the learning outcome; it must never be presented as
equivalent evidence. Bee remains optional appendix A1.

## Live Vega evidence

Keep replay and live results visually separate. Replay proves command order, stop conditions, and report shape. A live claim requires all of these:

- SDK `0.22.5875` reported;
- VDA listed as attached;
- manifest validation and `.vpkg` build passed;
- install and launch passed;
- device logs were saved;
- a real screenshot was pulled;
- the focus transition suite passed.

If any item is missing, say which boundary failed and continue with replay.
