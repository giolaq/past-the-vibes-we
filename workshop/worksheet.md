# Ten-Minute Harness Exercise

Work in a team of two or three people.
Use short answers.
Select one task that can finish in one session.

Give the completed worksheet to another team.
Ask that team to find a false positive.

## 1. Define the required result

What must change?

```text
Example: Update one Android module to a new API.
Produce a passing debug build.
```

What must not change?

```text
Example: Do not change server APIs.
Do not change release signing.
Do not change other app modules.
```

## 2. Define the phases

Use no more than three phases.

| Phase                   | Change                | Independent check                   |
| ----------------------- | --------------------- | ----------------------------------- |
| Example: migrate client | Update one API client | `./gradlew :app:compileDebugKotlin` |
|                         |                       |                                     |
|                         |                       |                                     |

## 3. Identify required knowledge

What facts or rules does the model require?

| Fact or rule | Source | Phase |
| ------------ | ------ | ----- |
|              |        |       |
|              |        |       |

## 4. Define failure and retry

What exact failure text enters the retry?

```text

```

What independent check defines completion?

```text

```

What stops the retry loop?

```text
Attempt limit:
Cumulative token limit:
Per-call turn limit:
No-progress rule:
```

## 5. Define human control

Where must a person approve the work?

```text

```

What is the time limit?

```text

```

What are the token and turn limits?

```text

```

## 6. Define retained evidence

What must the report contain?

```text
Example:
- Plan
- Commits
- Commands
- Test output
- Token, turn, and call usage
- Provider-reported cost, if supplied
- Retry failures
- Unresolved risks
```

## 7. Find a false positive

Another team completes this section.

How can all checks pass while the required result is incorrect?

```text

```

Which check must become stronger?

```text

```

Which independent component will supply the stronger evidence?

```text

```

## 8. Replace the TV components

| TV workshop component | Your component |
| --------------------- | -------------- |
| TV adaptation skill   |                |
| Vega command adapter  |                |
| Focus behavior check  |                |

## 9. Prepare the 30-second report

| Statement                   | Your answer |
| --------------------------- | ----------- |
| The harness claims          |             |
| The independent evidence is |             |
| The evidence does not prove |             |
