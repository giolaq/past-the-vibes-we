# Past the Vibes

Build a small coding harness, then use it to adapt a React Native flow for Vega TV.

This repository contains everything used in the workshop:

- `packages/mini-harness`: four runnable stages, from one model call to phases, checks, skills, executors, checkpoints, and replay;
- `packages/workshop-harness`: the complete guarded porting pipeline built with Strands Agents SDK;
- `apps/pocket-cinema`: the prepared React Native app used by every exercise;
- `workshop`: the attendee guide, web app, fixtures, checkpoints, troubleshooting, and instructor notes.

The standard path uses committed recordings. You do not need a model account, API key, Vega SDK, or device to complete the core workshop.

## Start here

Install Node.js 20 or newer, Yarn 1.22, and Git. Then run:

```sh
git clone https://github.com/giolaq/past-the-vibes-we.git
cd past-the-vibes-we
yarn setup
yarn verify
yarn site
```

Open `http://localhost:4173`. Follow **Start here** in the web app before lesson 1.

If you do not want to start a server, open `workshop/index.html` directly.

Push `main` to GitHub and enable Pages with **GitHub Actions** as its source to publish the same site. The included workflow deploys only `workshop/`.

## Useful commands

```sh
yarn setup          # install all three workshop packages
yarn verify         # typecheck, test, and validate workshop links
yarn replay         # run the first key-free mini-harness exercise
yarn doctor         # check the key-free workshop path
yarn site           # serve the workshop web app on port 4173
```

Live model and Vega device paths are optional. Read [Before You Arrive](workshop/00-before-you-arrive.md) before configuring them.

## Repository map

| Path | Purpose |
| --- | --- |
| `workshop/index.html` | Interactive attendee guide and progress tracker |
| `workshop/00-*.md` through `10-*.md` | Written lesson sequence |
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
