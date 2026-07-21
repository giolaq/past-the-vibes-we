# Agent Guide

This repository contains only the Past the Vibes workshop. Keep attendee instructions short, direct, and runnable without credentials through replay.

## Map

- `workshop/`: attendee website, lessons, fixtures, checkpoints, and instructor material.
- `packages/mini-harness/`: staged teaching implementation used in lessons 1-4.
- `packages/workshop-harness/`: guarded React Native-to-Vega pipeline used in lessons 5-9.
- `apps/pocket-cinema/`: prepared React Native target.
- `scripts/`: workshop link checks, checkpoint packaging, and the static site server.

## Before changing workshop material

Run `yarn verify`. Preserve the key-free replay path. Do not make a live model, ADBT, Vega SDK, or device mandatory for the main learning outcome.

Every exercise must state:

1. What the attendee runs.
2. What they inspect.
3. What proves completion.
4. Which fixture or checkpoint to use when blocked.

Keep model authority narrow. The port agent receives read-only project tools and returns a typed patch. The harness owns writes, checks, retries, cost, commits, and reports.
