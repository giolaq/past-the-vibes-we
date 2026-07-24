# Past the Vibes

Build a small coding harness with [AWS Strands Agents SDK](https://github.com/strands-agents/harness-sdk), then use it to port a React Native flow to Vega TV. The harness is the deliverable: swap its skills, its MCP server, or its executor — run it with the CLI coding agent you already use, or directly with Strands + Bedrock — and reuse it for your own work. Owning the harness — instead of driving a coding agent by prompt — gives you control over every write, check, and dollar, and observability over every model turn, document read, and commit.

This repository contains everything used in the workshop:

- `packages/mini-harness`: four runnable stages, from one model call to phases, checks, skills, executors, checkpoints, and replay;
- `packages/workshop-harness`: the complete guarded porting pipeline built with Strands Agents SDK;
- `apps/pocket-cinema`: the prepared React Native app used by every exercise;
- `workshop`: the attendee guide, web app, fixtures, checkpoints, troubleshooting, and instructor notes.

The standard path uses committed recordings. You do not need a model account, API key, Vega SDK, or device to complete the core workshop.

## Start here

Install Node.js 20 or newer and Git — Corepack will install the repository's pinned Yarn 4.12 — then run:

```sh
git clone https://github.com/giolaq/past-the-vibes-we.git
cd past-the-vibes-we
corepack enable
yarn setup
yarn verify
yarn site
```

Open `http://localhost:4173`. Follow **Start here** in the web app before lesson 1.

If you do not want to start a server, open `workshop/index.html` directly.

Push `main` to GitHub and enable Pages with **GitHub Actions** as its source to publish the same site. The included workflow deploys only `workshop/`.

### Yarn reports that this directory is not part of another project

Run commands from the `past-the-vibes-we` directory, which contains this README and the root `yarn.lock`:

```sh
yarn verify
```

The root lockfile marks this clone as an independent Yarn project, even when you clone it inside another directory that also contains a `package.json` or `yarn.lock`.

## Useful commands

```sh
yarn setup          # install all three workshop packages
yarn verify         # typecheck, test, and validate workshop links
yarn replay         # run the first key-free mini-harness exercise
yarn doctor         # check the key-free workshop path
yarn site           # serve the workshop web app on port 4173
```

Run `yarn setup` before any lesson command. If `npx` asks to download `tsx`, stop: the workshop uses its pinned local copy and the package dependencies are not ready yet.

If Node warns that `NODE_TLS_REJECT_UNAUTHORIZED=0`, remove that unsafe override before installing anything:

```sh
unset NODE_TLS_REJECT_UNAUTHORIZED
```

Do not disable TLS certificate verification to work around a network or proxy problem.

Live model and Vega device paths are optional; read [Before You Arrive](workshop/lessons/00-welcome.md) before configuring them.

## Repository map

| Path | Purpose |
| --- | --- |
| `workshop/index.html` | Interactive attendee guide and progress tracker |
| `workshop/lessons/*.md` | Lesson source of truth; the web app is generated from these |
| `workshop/workshop.data.js` | Generated from `lessons/` by `scripts/build-site.mjs` (do not edit by hand) |
| `workshop/instructor-guide.md` | Timing, fallbacks, evidence rules, and teaching notes |
| `workshop/strands-constructs.md` | Every Strands construct used by the workshop |
| `workshop/fixtures` | Key-free recordings and context snapshots |
| `workshop/checkpoints` | Known-good recovery points |
| `packages/mini-harness/steps` | The architecture built in lessons 1-4 |
| `packages/workshop-harness/src` | The complete workshop pipeline |
| `apps/pocket-cinema` | Prepared React Native target |

## What is intentionally absent

This is the workshop repository, not the full TV Build product repository. It excludes release tooling, statistical verification packages, unrelated examples, production CLI commands, and historical implementation plans. The included code is the code attendees inspect and run.

## License

MIT No Attribution. See [LICENSE](LICENSE).
