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

## Before changing workshop material

Run `yarn verify`. Preserve the key-free replay path. Do not make a live model, ADBT, Vega SDK, or device mandatory for the main learning outcome.

Every exercise must state:

1. What the attendee runs.
2. What they inspect.
3. What proves completion.
4. Which fixture or checkpoint to use when blocked.

Keep model authority narrow. The port agent receives read-only project tools and returns a typed patch. The harness owns writes, checks, retries, cost, commits, and reports.
