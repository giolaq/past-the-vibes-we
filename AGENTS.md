# Agent Guide

This repository contains only the Past the Vibes workshop. Keep attendee instructions short, direct, and runnable without credentials through replay.

This file is for agents maintaining or modifying the repository. If you are an agent asked to *take* the workshop, follow `workshop/AGENT_RUNBOOK.md` instead.

## Map

- `workshop/lessons/*.md`: the single source of truth for all lesson content (YAML frontmatter + `:::directive` blocks). Edit these to change the website.
- `workshop/workshop.data.js`: generated from `lessons/` by `scripts/build-site.mjs`. Do not edit by hand.
- `workshop/`: attendee website chrome (`index.html`, `workshop.css`, `workshop.js` — runtime only), fixtures, checkpoints, and instructor material.
- `packages/mini-harness/`: staged teaching implementation used in lessons 1-4.
- `packages/workshop-harness/`: guarded React Native-to-Vega pipeline used in lessons 5-9.
- `apps/pocket-cinema/`: prepared React Native target.
- `scripts/`: `build-site.mjs` (lessons → site data), workshop link checks, checkpoint packaging, and the static site server.

## Editing lesson content

Lesson content is authored only in `workshop/lessons/*.md`. After editing, run `node scripts/build-site.mjs` (or `yarn build:site`) and commit the regenerated `workshop/workshop.data.js`. `yarn verify` runs `check:site`, which fails if the committed data is stale. Never edit `workshop.data.js` or hand-write module content into `workshop.js`.

Note that a `lead:` containing `: ` must be quoted, or the YAML frontmatter parses it as a nested mapping and the build fails.

## Lesson voice

Lessons are written as the instructor speaking to a room of React Native developers. Warm because it addresses people directly, not because it is enthusiastic.

- Open each lesson with a `:::welcome` block: what we build here and why it matters.
- Mark the hand-off to hands-on work with `:::yourturn`, placed under the section heading it belongs to.
- "We" for the shared work and the concepts; "you" for the attendee's actions and evidence.
- Point at things: "Look at the output", "Open `out/checkpoint.json` and check the next phase."
- Short declarative sentences. Contractions are fine.

Do not use exclamation marks, and do not write *Great!, Awesome, Nice work, let's dive in, buckle up, magic, powerful, seamless, effortless, simply, just, obviously, of course, as you can see*. Do not congratulate before evidence exists — `:::done` declares completion, and it stays mechanical.

Voice edits apply to frames and hand-offs only. Never reword a `:::command` body, an `:::expected` block, a `:::done` criterion, a check label, a file path, or frontmatter `evidence`: attendees scan those mid-exercise, and the tests and link checker quote some of them.

Read every edit aloud. If it sounds like something you would say standing in front of the room, keep it. If it sounds like a product launch, cut it. A friendlier sentence that is only longer is not friendlier.

## Before changing workshop material

Run `yarn verify`. Preserve the key-free replay path. Do not make a live model, ADBT, Vega SDK, or device mandatory for the main learning outcome.

Every exercise must state:

1. What the attendee runs.
2. What they inspect.
3. What proves completion.
4. Which fixture or checkpoint to use when blocked.

Keep model authority narrow. The port agent receives read-only project tools and returns a typed patch. The harness owns writes, checks, retries, cost, commits, and reports.
