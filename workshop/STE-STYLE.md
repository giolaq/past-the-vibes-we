# Workshop Writing Standard

Use these rules for all workshop instructions.

This project uses the principles of ASD-STE100 Simplified Technical English.
It does not claim certified ASD-STE100 compliance.
A certified check also requires the official controlled dictionary.

## Rules

1. Use American English.
2. Use one term for one meaning.
3. Use short sentences.
4. Put one topic in each sentence.
5. Use the active voice.
6. Use the imperative form for work steps.
7. Put a condition before the action that depends on it.
8. Do not use idioms, jokes, or metaphors in instructions.
9. Do not omit articles when they make a sentence clearer.
10. Do not use a pronoun if its noun is not clear.
11. Keep commands, file names, JSON keys, model IDs, and API names unchanged.
12. Treat product names and software terms as technical nouns.

## Standard Terms

Use these terms consistently:

| Use | Do not use as a synonym |
| --- | --- |
| start | begin, launch into |
| stop | halt, terminate, give up |
| select | pick, choose between |
| run | execute, fire, kick off |
| do a check | check, validate informally |
| recorded fallback | replay path, recovery cassette |
| guarded copy | sandbox, safe clone |
| model response | answer, guess, output prose |
| phase result | outcome, verdict |
| independent check | judge, observer, gatekeeper |

Technical nouns can include `executor`, `provider`, `MCP`, `ADBT`, `VDA`,
`McpClient`, `JSONL`, `.vpkg`, and file paths.

## Work Steps

Write one action in each numbered step.

Write:

1. Open `port-result.json`.
2. Find the `attempts` value.
3. Record the value.

Do not write:

1. Open the result, find the attempt count, and write it down.

## Evidence Statements

Separate a claim from its evidence.

Write:

- **Claim:** The app stayed active.
- **Independent check:** The harness reads the device log after five seconds.
- **Evidence:** `vega-device.log`
- **Limit:** This evidence does not prove remote-control behavior.

## Source

The official ASD Simplified Technical English Maintenance Group publishes
ASD-STE100 Simplified Technical English Issue 9.
See <https://www.asd-ste100.org/>.
