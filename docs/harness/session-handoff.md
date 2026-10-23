# Session handoff

Compact handoff for the next session. Fill it in at clock-out when the session was long or
touched several areas; for a short single-feature session the `PROGRESS.md` entry is enough.
Copy the template below into the top of this file (newest first) and fill every line.

### Handoff — 2026-09-06 · session 002 (harness phase 2, F-013…F-016) → next: first live loop run

#### Verified now

- What is currently working: `pnpm harness:feature` / `harness:verify` / `harness:clean-state` / `harness:loop --dry-run` / `harness:import-tickets`; Stop hook and loop-mode guard simulated; design-system lint fires on violations; `pnpm check` (46 unit tests) and `pnpm test:e2e` (29 checks) green on the F-016 tree.
- What verification actually ran: L1 after every commit; L3 for F-016; `harness:verify` with `--allow-manual` for the manual steps performed by hand (documented in each feature's evidence).

#### Changed this session

- Code or behaviour added: `src/app/globals.css` theme (forest palette, Figtree, default palette removed), `src/lib/design-tokens.ts`, map/email colours from tokens, shadcn button/card arbitrary values replaced. No runtime logic changed.
- Infrastructure or harness changes: everything under Session 002 in `PROGRESS.md`; docs moved to `docs/product`, `docs/README.md` index, `docs/design/`, `docs/harness/README.md`, D-008.

#### Broken or unverified

- Known defect: none known.
- Unverified path: a live `pnpm harness:loop` run (needs `gh`); `--agent evaluator` with `--json-schema` in `-p` mode; `next/font` download in an offline environment.
- Risk for the next session: generated `verification[]` lines name test files that do not exist yet (by design: the session creates them); review them before a feature runs.

#### Next best step

- Highest-priority unfinished feature: F-010 (typed errors) is the lowest ready id; F-020 (CRS module) is the cheapest first loop run.
- Why it is next: unit-only, small, exercises the whole driver chain with minimal cost.
- What counts as passing: the feature's `verification[]` plus an evaluator Accept and a merged PR.
- What must not change during that step: `harness.config.json` caps and the allowlist; tune only after reading the trace.

#### Commands

- Startup: `./init.sh` (`FAST=1` to skip the baseline)
- Verification: `pnpm check` · `pnpm test:integration` · `pnpm test:e2e` · `pnpm harness:verify F-NNN`
- Focused debug command: `pnpm harness:loop --dry-run --no-docker --feature F-020` · `pnpm harness:report` · `pnpm harness:feature list`

---

### Handoff — 2026-09-06 · feature F-000 (harness bootstrap) → next F-001

#### Verified now

- What is currently working: phase-1 harness committed as `091168f` (manual, state files, init.sh, validator, docs/harness templates, .claude wiring). Tree clean after commit.
- What verification actually ran: `pnpm check` (green, 27 unit tests), `pnpm harness:check`, `FAST=1 ./init.sh`, hook scripts with simulated inputs, Next's `writeAgentFiles()` → `AGENTS.md` unchanged, PreToolUse guard fired live.

#### Changed this session

- Code or behaviour added: none in `src/` (only `src/ARCHITECTURE.md`).
- Infrastructure or harness changes: everything listed in `PROGRESS.md` → Session 001.

#### Broken or unverified

- Known defect: none known. Commitlint warned "footer must have leading blank line" on the harness commit (warning only).
- Unverified path: skills `/clock-in`, `/verify-feature`, `/clock-out`, the `evaluator` subagent, and the SessionStart / PostToolUse hooks in a live session.
- Risk for the next session: guard hook is regex-based on the command text and can block commands that merely mention a forbidden pattern.

#### Next best step

- Highest-priority unfinished feature: F-001 (enable `noUncheckedIndexedAccess`; 0 type errors today). It is a product feature, not a harness task; run it through the loop to exercise the skills.
- Why it is next: cheapest full dry-run of clock-in → verify → clock-out.
- What counts as passing: `feature_list.json` → F-001 → `verification`.
- What must not change during that step: the harness files; if a skill or hook misbehaves, record it in `PROGRESS.md` and fix it as part of phase 2 planning (`docs/harness/phase-2-automated-loop.md`).

#### Commands

- Startup: `./init.sh` (`FAST=1` to skip the baseline)
- Verification: `pnpm check` · `pnpm test:integration` · `pnpm test:e2e`
- Focused debug command: `pnpm harness:check` · `pnpm test:watch`

---

## Template

### Handoff — YYYY-MM-DD · feature F-NNN

#### Verified now

- What is currently working:
- What verification actually ran (commands + result):

#### Changed this session

- Code or behaviour added:
- Infrastructure or harness changes:

#### Broken or unverified

- Known defect:
- Unverified path:
- Risk for the next session:

#### Next best step

- Highest-priority unfinished feature:
- Why it is next:
- What counts as passing (from `feature_list.json` → `verification`):
- What must not change during that step:

#### Commands

- Startup: `./init.sh` (add `RUN_START_COMMAND=1` to start `pnpm db:up && pnpm dev`)
- Verification: `pnpm check` (L1) · `pnpm test:integration` (L2) · `pnpm test:e2e` (L3)
- Focused debug command: `pnpm test:watch` · `pnpm test:e2e:ui` · `pnpm jobs:run`
