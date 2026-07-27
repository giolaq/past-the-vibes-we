# Instructor Guide

Use [the dry run](dry-run.md) before you teach.
It contains each demonstration command and its expected result.

## Prepare the workshop

1. Send [Lesson 00](lessons/00-welcome.md) 48 hours before the workshop.
2. Open [the speaker deck](slides.html).
3. Select one live executor for the main demonstration.
4. Ask each attendee to report the selected executor status.
5. Test the live path from a clean clone.
6. Test each recorded fallback.
7. Verify ADBT version `1.0.5`.
8. Verify Vega SDK version `0.22.5875`.
9. Verify the target VDA image.
10. Run the pinned ADBT `init-context` command.
11. Verify the `amazon-devices-vega-*` skills.
12. Read [the live rehearsal record](live-rehearsal.md).
13. Start VDA in a separate system terminal.
14. Keep the VDA terminal open.
15. Run `vega virtual-device status`.
16. Run `vega exec vda devices -l`.
17. Keep the completed TV app hidden until Lesson 6.

## Start with the one-call example

Do not start with the architecture diagram.
Run the one-call example from Lesson 1.
Let attendees inspect the proposal.
Then show the five missing proofs.

Show the claim and evidence table.
Use this table after each lesson.

After the example, explain the boundary:

- Strands supplies the model loop, tools, schema, MCP client, limits, and metrics.
- The harness supplies phases, writes, checks, retries, commits, costs, and evidence.

Show these files:

- `port-tools.ts`
- `port-contract.ts`
- `context-providers/adbt.ts`

## Explain skills and MCP

In Lesson 2, trace `amazon-devices-vega-focus-management`.

For Claude Code:

1. Show the full skill text in the prompt.
2. Show the explicit ADBT MCP configuration.

For Strands:

1. Show the `Skill`.
2. Show `AgentSkills`.
3. Show the `plugins` property.
4. Show the `skills` activation tool.
5. Show the native ADBT `McpClient`.

Explain that Amazon supplies the skill content.
The harness selects the skills.

Then explain these Strands constructs:

- `Model`
- `Agent`
- `systemPrompt`
- Invocation limits
- `AgentResult`
- Usage metrics
- Typed `tool()` callbacks
- Structured output
- `listTools()`
- `callTool()`
- `disconnect()`

State that Zod, `AbortSignal`, and `StdioClientTransport` are not Strands APIs.
Keep [the construct reference](strands-constructs.md) open.

## Four-hour schedule

| Time | Attendee work | Recovery |
| --- | --- | --- |
| 00:00 | Setup and live executor verification | Use Pocket Cinema |
| 00:20 | Lesson 1: one-call example and analyze | Use the instructor proposal and recorded analyze |
| 00:45 | Lesson 2: skill and ADBT plan | Use recorded plan |
| 01:15 | Lesson 3: port and retry | Use `fixtures/port-retry/` |
| 01:45 | Break | Use the full 10 minutes |
| 01:55 | Lesson 4: compiler repair | Use `fixtures/build-retry/` |
| 02:25 | Lesson 5: device start and failure tests | Use platform replay or checkpoint |
| 02:55 | Break | Use the full 10 minutes |
| 03:05 | Lesson 6: focus contract | Use the focus fixture and checkpoint |
| 03:30 | Lesson 7: TUI and team design | Use the completed checkpoint |

Appendix A1 is outside the four-hour schedule.
Run it only with consent, account access, and sufficient time.

Keep 10 minutes for recovery and questions.
If an attendee is behind, remove the optional assignment first.

## State five items before each exercise

1. State the command.
2. State the file or output to inspect.
3. State the independent completion check.
4. State the remaining limit.
5. State the recorded fallback or checkpoint.

After the exercise, ask for these statements:

1. The claim.
2. The independent evidence.
3. The remaining limit.

Do not accept a model statement as independent evidence.

## Use the 10-minute recovery rule

Try one repair for a live dependency.
Use no more than 10 minutes.
Then use the recorded fallback or checkpoint.

Do not let account, device, or SDK setup consume the workshop.

## Record workshop results

Record these values separately:

- Core lessons completed
- React Native port completed
- TV behavior understood
- Live Vega run completed
- Recorded fallback used
- Time
- Model cost
- Help requests

## State the live evidence accurately

Recorded data verifies control flow and report shape.
It is not live evidence.

A live Vega claim requires:

- SDK version `0.22.5875`
- Attached VDA
- Valid manifest
- Successful `.vpkg` build
- Successful install
- Successful app start
- Saved device log
- Two device screenshots
- Passing focus-transition test

If an item is missing, identify the failed boundary.
Then continue with the recorded fallback.
