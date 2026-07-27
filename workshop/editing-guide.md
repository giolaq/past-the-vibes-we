# Workshop Editing Guide

Use this guide when you change workshop text, the website, code, fixtures, or
checkpoints.

## Use a Separate Branch

Start from the repository root:

```sh
git switch main
git pull
git switch -c workshop/short-change-name
git status --short
yarn verify
```

The first `git status` result must be empty.
Do not mix a workshop change with unrelated work.

## Select an Editor

Use an editor that shows Git changes.
Visual Studio Code is a good default:

```sh
code .
```

Use the Source Control view to inspect changed lines.
Use the file history before you replace a large section.
Do not use a global replacement until you inspect every match.

## Edit the Source File

| Change | Edit this source | Do not edit |
| --- | --- | --- |
| Lesson text or website lesson content | `workshop/lessons/*.md` | `workshop/workshop.data.js` |
| Website layout | `workshop/index.html` and `workshop/workshop.css` | Generated lesson data |
| Website behavior | `workshop/workshop.js` | Generated lesson data |
| Speaker deck | `workshop/slides.html` | Website lesson data |
| Instructor procedure | `workshop/instructor-guide.md` or `workshop/dry-run.md` | Attendee lessons |
| Harness behavior | `packages/workshop-harness/src/*.ts` | Files under `out/` |
| Example app | `apps/pocket-cinema/` | A guarded copy under `out/` |
| Recorded fallback | `workshop/fixtures/` | A live run without scrubbing it |
| Recovery checkpoint | `workshop/checkpoints/` | An unverified run |
| Model selection | `workshop.config.json` | Credentials or API keys |

`workshop/workshop.data.js` is generated.
Run `yarn build:site` after you change a lesson.

Files under `out/` are temporary evidence.
Do not use them as source files.

## Edit a Lesson

Open one lesson source:

```sh
code workshop/lessons/03-port.md
```

Keep the front matter at the top.
Use the existing directives for commands, steps, expected results, evidence,
fallbacks, and completion criteria.
Copy the form of a nearby directive before you add a new one.

Run:

```sh
yarn build:site
yarn check:workshop
yarn check:ste
yarn check:site
yarn site
```

Open `http://localhost:4173`.
Open the changed module.
Run each changed command from `packages/workshop-harness`.
Check the desktop and narrow browser layouts.

## Edit Harness Code

Open the source file and its nearest test:

```sh
code packages/workshop-harness/src/port-verification.ts
code packages/workshop-harness/tests/core.test.ts
```

Run the package checks:

```sh
cd packages/workshop-harness
yarn typecheck
yarn test
cd ../..
yarn verify
```

Add or update a test when behavior changes.
Update the lesson command and expected result in the same branch.

## Edit JSON

Use an editor with JSON syntax checking.
After the edit, run:

```sh
node -e 'JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); console.log("valid JSON")' \
  path/to/file.json
```

Do not put credentials, local home paths, or live account data in a fixture.
Run the related recorded command after you edit a fixture.

## Update a Checkpoint

Create a checkpoint only from a passing guarded copy.
Run the complete related lesson before you package it.

From the repository root, run:

```sh
yarn package:checkpoint out/<runId>/app workshop/checkpoints/<name>/app
yarn verify
```

Inspect the new checkpoint.
Confirm that it contains no `.env`, `node_modules`, Git history, or local path.

## Review the Change

Run:

```sh
git diff --check
git status --short
git diff --stat
git diff
yarn verify
```

Read the complete diff.
Confirm that generated site data changed only when lesson content changed.
Open the website after the final site build.

## Undo a Manual Edit

Use the editor undo action while the file is open.
Use `git diff -- path/to/file` to inspect the change.

If the file had no work before your edit, restore it with:

```sh
git restore path/to/file
```

Do not run `git restore` if the file contains work that you must keep.
Copy the required lines to a temporary file first.

## Commit the Change

Run:

```sh
git add path/to/changed-file
git diff --cached
git commit -m "docs: describe the workshop change"
git push -u origin workshop/short-change-name
```

Add only the files that belong to the change.
Put the verification result in the pull request description.
