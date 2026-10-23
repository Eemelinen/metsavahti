# The Metsävahti harness

Metsävahti uses the shared agent harness from [Eemelinen/harness](https://github.com/Eemelinen/harness).
It lets a coding agent work on this repository one feature at a time without drifting, and lets a
driver run those sessions unattended, one PR per feature. This page covers what is specific to
Metsävahti. How the harness works in general — the parts, one feature end to end, every safeguard,
operating and reading the loop — is in the harness docs:
[how it works](https://github.com/Eemelinen/harness/blob/main/docs/how-it-works.md),
[configuration](https://github.com/Eemelinen/harness/blob/main/docs/config.md),
[why each part exists](https://github.com/Eemelinen/harness/blob/main/docs/why.md).
The decisions behind it are D-007, D-008 and D-022 in [../DECISIONS.md](../DECISIONS.md).

## What lives where

| Shared (pinned release)                                                                                                                                              | In this repository                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@eemelinen/harness` in `devDependencies`: the `harness` CLI behind `pnpm harness:*` (check, feature, verify, clean-state, loop, report, doctor)                     | [harness.config.json](../../harness.config.json): ticket format (`MV-NNN`, `epic`, `design`), guard rules, clean-state checks, Docker services, session-start lines, models, caps |
| Plugin `harness@eemelinen-harness` in [.claude/settings.json](../../.claude/settings.json): skills, `harness:evaluator`, guard / session-start / format / Stop hooks | [AGENTS.md](../../AGENTS.md), [CLAUDE.md](../../CLAUDE.md), [PROGRESS.md](../../PROGRESS.md), [feature_list.json](../../feature_list.json), [init.sh](../../init.sh)              |
| Generator and evaluator prompts, verdict schema                                                                                                                      | [generator-notes.md](generator-notes.md) (appended to the generator prompt), [evaluator-rubric.md](evaluator-rubric.md) with its tuning log                                       |
|                                                                                                                                                                      | [clean-state-checklist.md](clean-state-checklist.md), [session-handoff.md](session-handoff.md), [quality-document.md](quality-document.md), `scripts/import-tickets.ts`           |

Both pins name the same tag. `pnpm harness:doctor` (also run by `./init.sh`) fails when they
differ. To update: install the new tag
(`pnpm add -D "@eemelinen/harness@github:Eemelinen/harness#vX.Y.Z"`), set the marketplace `ref`
in `.claude/settings.json`, run `pnpm harness:doctor` and `pnpm check`, and commit as
`chore(harness): update to vX.Y.Z`. A change to the harness itself is made in the harness
repository, never here.

## Metsävahti specifics

- **Layers.**
  - L1 is `pnpm check`: lint, typecheck, knip, format, `harness:check` and unit tests.
  - L2 is `pnpm test:integration` (Testcontainers).
  - L3 is `pnpm test:e2e` (Playwright).
  - L2 and L3 need Docker. `harness verify` refuses to run them without it, and `services.up`
    (`pnpm db:up`) runs once in the driver preflight.
  - In CI, L3 evidence notes `CI=1: next start on the last build, retries 2`.
- **Guard rules beyond the core.**
  - Bare `vitest`/`playwright` (the `pnpm test:*` scripts wrap `dotenv -e .env.test`) and
    `ALLOW_TESTS_ON_PORT_5432` are blocked.
  - `pnpm db:reset` and `docker compose down -v` are blocked.
  - In loop sessions, `db:up/down` and `docker compose` are blocked.
  - Edits to `src/payload-types.ts`, the import map and `.env*` are denied.
  - The guard asks before edits to generated Payload routes, migrations and the Next.js marker
    block in AGENTS.md.
- **Clean-state checks beyond the core.**
  - no `.only`/`.skip` added under `tests/`
  - no coverage threshold removed from `vitest.config.ts`
  - no `console.log` added under `src/`
  - the AGENTS.md marker block is intact
- **Tickets.** `pnpm harness:import-tickets [--write]` re-imports `docs/product/tickets` after a
  ticket edit. It never touches `in_progress` or `passing` features.

## Operating the loop here

**Prerequisites (once):**

- Docker Desktop running.
- `gh` logged in.
- `main` clean and in sync with `origin/main`.
- Playwright browsers installed (`pnpm exec playwright install chromium webkit`).
- On Windows, run the driver from Git Bash.
- Run `claude` in the repository once and accept the trust dialog and the plugin marketplace.

**Merging.** `merge: "auto"` relies on branch protection. The required checks are the CI job names
`Lint · typecheck · unit · integration · build` and `E2E (Playwright)`.

**Commands.** Start with `pnpm harness:loop --dry-run --no-docker`, then `pnpm harness:loop --once`.
`pnpm harness:report` shows past runs.

**Cost.** The caps are 300 turns / 25 USD / 90 minutes per generator session and
60 turns / 4 USD for the evaluator. F-046, the first run on Windows, took two attempts,
140 minutes and about 14 USD.

**Sequential only.** L3 uses fixed ports (3100, 3200, 5433, 8025) and `.next-e2e`, and Docker
Compose uses fixed container names. So one feature runs at a time, and `pnpm db:up` runs only from
the main checkout. The swarm schedule in
[../product/04-delivery-plan.md](../product/04-delivery-plan.md) is the target shape for parallel
workers.
