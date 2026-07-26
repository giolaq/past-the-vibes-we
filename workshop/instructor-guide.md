# Instructor Guide

## Before the workshop

1. Send [setup](lessons/00-welcome.md) 48 hours early.
2. Open the [speaker deck](slides.html) (`workshop/slides.html`, also served at `/slides.html` by `yarn site`). It carries the intro plus one slide per teaching beat: the boundary, each lesson's key idea, the Strands and ADBT highlights, and the close. Arrow keys or swipe to navigate; print to PDF from the browser for a handout.
3. Ask each attendee to report their live-executor status: **Claude Code ready**, **Strands + Bedrock ready**, or **needs replay fallback**. The workshop runs from scratch against a live model; replay is the safety net.
4. Test both the live path and every replay/checkpoint fallback from a clean clone.
5. Rehearse ADBT `1.0.5`, Vega SDK `0.22.5875`, and the target VDA image. Confirm `init-context --force` has installed the `amazon-devices-vega-*` skills into `~/.claude/skills` on every demo machine — lesson 4's live runs load them.
6. Read [the latest live rehearsal](live-rehearsal.md), and don't present the device path as ready until the VDA stays attached.
7. Start VDA in a separate system terminal, keep it open, and confirm `vega virtual-device status` plus `vega exec vda devices -l` before attendees arrive.
8. Keep the completed TV app hidden until the TV exercise ends.

Open with this boundary: Strands supplies the model loop, typed tools, structured output, MCP client, limits, and metrics. The harness supplies the phases, approval, writes, checks, retry, commits, budget, and evidence. Show `port-tools.ts`, `port-contract.ts`, and `context-providers/adbt.ts` before any live model demo.

During lesson 2, trace one ADBT skill (for example `amazon-devices-vega-focus-management`) through both routes: full-text prompt injection for Claude CLI, then `Skill` → `AgentSkills` → `plugins` → `skills` tool for Strands. Point out that the skills are Amazon's, installed by `init-context` — the harness consumes vendor knowledge without owning it. Continue with provider `Model`, `Agent`, `systemPrompt`, `invoke()` limits, and `AgentResult` metrics. Next show what the full harness adds: `AnthropicModel`, `stream()`, and `AgentStreamEvent`. During lesson 3, add `tool()` schemas and callbacks, structured output, `McpClient`, `listTools()`, `callTool()`, and `disconnect()`. State that Zod, native `AbortSignal`, and `StdioClientTransport` are adjacent dependencies, not Strands APIs. Keep [the construct reference](strands-constructs.md) open for questions.

## Four-hour schedule

| Time | Attendees do | If blocked |
| --- | --- | --- |
| 00:00 | Set up, choose an app, and run doctor | Use Pocket Cinema and replay |
| 00:20 | Lesson 1: analyze the app, list what the answer cannot prove | Run `--phases analyze` on the recording |
| 00:45 | Lesson 2: the focus skill and ADBT, then the team-skill assignment | Run the assignment on replay and explain which artifact replay honors |
| 01:15 | Lesson 3: write the port, then trace a failed check into one retry | Use `fixtures/port-retry/` and the check assignment |
| 01:45 | **Break** | Keep it a full 10 minutes |
| 01:55 | Lesson 4: build until it compiles, with the compiler driving the retry | Use `fixtures/build-retry/` — it fails and repairs on purpose |
| 02:25 | Lesson 5: install and launch on the VDA, then break each gate on purpose | Fall back to platform replay or the complete checkpoint |
| 02:55 | **Break** | Keep it a full 10 minutes |
| 03:05 | Lesson 6: run the focus contract and close the loop with `tv-check` | Use the focus fixture and the vega-buildable checkpoint |
| 03:30 | Lesson 9: draft a harness for another domain | Use the worksheet example |

Lessons 7 and 8 — project memory and Bee context — are outside the four-hour path. Run one only if a lesson finishes early, and only if setup, consent, and time allow.

For lesson 2, show the five boundaries on screen: native ADBT MCP connection, the model's own document choice, `plan` prompt context, `NextSteps.md`, and the verified phase commit. Use `--adbt-live` with the recorded model response to demonstrate the real MCP call without spending model budget.

The core path takes 205 minutes; two 10-minute breaks and a 15-minute close bring the session to four hours. Lessons 4 to 6 need the Vega SDK and a device for their live claim, so check the room's setup during the first break — an attendee without it runs the recorded fallback and says which claim they earned. The 10-minute rule and the per-lesson fallbacks are the slack; an attendee who falls behind drops the assignment first.

## Teaching rule

State four things before each exercise:

1. What attendees will run.
2. What file or output they will inspect.
3. What proves the exercise is complete.
4. Which replay or checkpoint to use if blocked.

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

The main learning outcome must not depend on a live model, Vega device, or Bee.

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
