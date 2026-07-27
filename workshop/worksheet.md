# Ten-Minute Harness Challenge

Work in a team of two or three. Use short, concrete answers. Start with one workflow that can
finish in a single session, then give this sheet to another team and ask them to break your proof.

## 1. Outcome

What should change?

```text
Example: Update one Android app module to a new API and produce a passing debug build.
```

What is outside scope?

```text
Example: Do not change server APIs, release signing, or other app modules.
```

## 2. Phases

List the smallest useful sequence: three phases at most for this exercise.

| Phase | Change made | Independent check |
| --- | --- | --- |
| Example: migrate client | Update one API client | `./gradlew :app:compileDebugKotlin` |
| | | |
| | | |

## 3. Required knowledge

What does the model need to know? Where will each fact come from?

| Fact or rule | Source | Include in which phase? |
| --- | --- | --- |
| | | |

## 4. Failure and retry

What exact failure text should be sent into the retry for each phase?

```text

```

If you loop until done instead of retrying once: what is the done predicate (a check, never the model's opinion), what budget stops the loop, and what counts as no progress?

```text

```

## 5. Human control

Where must a person review or approve the work?

```text

```

What is the time or cost cap?

```text

```

## 6. Evidence

What should the report contain so another developer can review the run?

```text
Example: plan, commits, commands, test output, costs, retries, and unresolved risks.
```

## 7. Attack the design

Another team completes this section. Describe one false positive: all the proposed checks pass,
but the intended outcome is still wrong.

```text

```

Which check should become stronger? Name the independent observer you would add.

```text

```

## 8. Your domain adapter

Replace the TV parts:

| TV workshop part | Your equivalent |
| --- | --- |
| TV adaptation skill | |
| Vega command adapter | |
| D-pad behavior check | |

## 9. Thirty-second report

| Say this | Your answer |
| --- | --- |
| The harness claims… | |
| We prove it with… | |
| This still does not prove… | |
