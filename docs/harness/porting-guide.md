# Porting the harness to a new project

This guide explains exactly how the Metsävahti agent harness works and how to install a copy of
it in another repository. It is written so that a coding agent can do the whole port unattended:
give it the prompt in [§ 9](#9-the-prompt-to-give-an-agent) and this file.

The source repository is the reference implementation. Copy files from it; do not rewrite them
from this description. This guide says which files to copy as they are, which to adapt and how,
and which to write fresh for each project. § 2.1 points to worked examples in the reference repo
for everything you write fresh.

**Reading the reference.** In this guide `<REF>` is the absolute path of the Metsävahti checkout
(on the author's machine `C:\Users\Eemeli\Desktop\projects\metsavahti`; online at
https://github.com/Eemelinen/metsavahti). Read files at the git tag **`harness-reference`**, not
the working tree, so the examples do not change under you while that repository keeps moving:

```bash
git -C <REF> show harness-reference:scripts/harness-loop.ts          # one file
git -C <REF> ls-tree -r --name-only harness-reference .claude scripts   # what exists
git -C <REF> archive harness-reference .claude scripts | tar -x -C .    # copy a set of files
```

The tag marks the commit where the harness was last deliberately improved. Re-tag it there after
changing the harness on purpose, never for ordinary feature work.

---

## 0. Why this harness exists

Read this section before porting anything. Each part of the harness counters one specific way
coding agents fail. An agent that knows which failure a file prevents can adapt the file to a new
stack without losing its purpose, and can skip what the new project does not need.

### 0.1 Background and sources

The harness implements the course **Learn Harness Engineering** by walkinglabs, lectures 1–13,
on Claude Code. That course is based on two Anthropic engineering articles.

| Source                                                                                                                                                                   | What it contributes                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [learn-harness-engineering (GitHub)](https://github.com/walkinglabs/learn-harness-engineering) · [course site](https://walkinglabs.github.io/learn-harness-engineering/) | 14 lectures (`docs/en/lectures/lecture-NN-*/`); starter templates for `AGENTS.md`, `feature_list.json`, `init.sh` and a progress file (`docs/en/resources/templates/`); the `skills/harness-creator/` skill; `tools/audit-harness.sh` |
| [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) (Anthropic, Nov 2025)                   | Initializer session + `init.sh` + progress file + JSON feature list; one feature per session; commit and leave a clean state; the session-start routine; end-to-end testing like a user                                               |
| [Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps) (Anthropic, Mar 2026)                  | Separate generator and evaluator; context resets with structured handoff instead of compaction; agreeing on "done" before work starts; removing harness parts as models improve                                                       |

You do not need to read these sources to port the harness; this guide carries what matters.
Read them when a design question comes up that the guide does not answer.

### 0.2 Failure modes and the part that counters each

| Failure mode (course lecture)                                                         | Counter-measure in this harness                                                                                                                                                           |
| ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A strong model still fails on real tasks because the environment is unclear (L01–L02) | The whole harness: explicit instructions, state, verification and lifecycle                                                                                                               |
| Knowledge lives in the chat and is lost at the next session (L03)                     | Repo files are the only memory: `AGENTS.md`, `PROGRESS.md`, `feature_list.json`, `docs/DECISIONS.md`                                                                                      |
| One giant instruction file is ignored or contradicts itself (L04)                     | `AGENTS.md` is a short router with constraints carrying `why:`/`source:`, and links out to detail                                                                                         |
| Long tasks lose continuity across context windows (L05)                               | Clock-in reads state and clock-out writes it; `PROGRESS.md` has Current Verified State and Next Steps; the session-start hook prints them; the driver gives every feature a fresh session |
| Setup is redone or broken in every session (L06)                                      | `init.sh` is the single startup path, and `FAST=1 ./init.sh` must always exit 0 (the clean-state check enforces it)                                                                       |
| The agent overreaches: starts several things and finishes none (L07)                  | WIP=1, enforced by `validate-feature-list.ts` and `harness-feature activate`; features sized for one session; the evaluator scores scope                                                  |
| Work has no shared, machine-readable definition (L08)                                 | `feature_list.json`: a JSON queue with `depends_on`, `verification` and `evidence`, changed only by scripts                                                                               |
| The agent declares victory early (L09)                                                | `passing` requires evidence that `harness:verify` writes itself; the driver post-check and a fresh-context evaluator re-check the claim                                                   |
| Unit tests pass but the feature does not work (L10)                                   | Named layers L1 → L2 → L3, run in order and never skipped; L3 is required when a change crosses components                                                                                |
| Nobody can tell afterwards what the agent did (L11)                                   | `.harness/traces/*.jsonl`, `.harness/runs.jsonl`, `pnpm harness:report`, evidence lines and PR bodies                                                                                     |
| A session leaves the repo dirty or half-done (L12)                                    | `clean-state-check.sh` at clock-out, in the Stop hook and in the driver post-check; the commit gates                                                                                      |
| A human has to keep prompting the agent (L13)                                         | `harness-loop.ts`: preflight → worktree → generator → post-check → evaluator → PR → merge → next                                                                                          |
| The agent grades its own work too kindly (Anthropic, 2026)                            | The evaluator is a separate read-only session with a strict rubric and a JSON verdict; its tuning log calibrates it against human judgement                                               |
| An unattended agent does something destructive (D-008)                                | Deny list, `guard.sh`, auto-mode classifier with `--permission-prompts none`, caps, a PR per feature with CI as the merge gate                                                            |

### 0.3 Principles to keep when adapting

These are what make the harness work. A port that drops one of them is not the same harness.

1. **Gates are scripts, not prose.** If a rule matters, a script with an exit code enforces it,
   and skills, hooks, the driver and CI call that same script.
2. **State changes only through scripts.** Nobody hand-edits a feature's `status`, whether human
   or agent.
3. **Evidence over confidence.** The status `passing` is a consequence of commands that ran,
   never a judgement call.
4. **One feature, one session, one PR.** Small units keep context, review and rollback cheap.
5. **The interactive path and the unattended path are the same path.** The driver runs the
   same skills and scripts a human would, plus stricter stop conditions.
6. **Fail closed.** Unknown verdicts count as Revise, `manual:` steps are never waived
   unattended, and missing Docker fails verification instead of skipping a layer.
7. **Every constraint states its reason.** A rule whose `why:` no longer holds can be removed
   safely; a rule without one cannot.

### 0.4 What to build first

Build it in this order, so the port is useful at every step:

1. **Phase 1 (agent-followed loop):** `AGENTS.md`, `PROGRESS.md`, `feature_list.json`,
   `init.sh`, the three harness scripts (validate, feature, verify), `clean-state-check.sh`,
   `.claude/` settings, hooks and skills, and the commit gates. This alone fixes L03–L12.
2. **Phase 2 (driver-run loop):** `harness.config.json`, `harness-loop.ts`, the prompts, the
   evaluator agent and rubric, CI with required checks, and branch protection. Add it once
   phase 1 has run cleanly for a few interactive sessions.
3. **Optional:** a ticket importer, a quality document, design-system lint, and a Docker
   services preflight. Add them only when the project has the matching need.

Small projects without integration or end-to-end tests can ship phase 1 with only L1. Skip what
the project does not need, but never keep a gate that is weakened to always pass.

---

## 1. What the harness is

The harness lets a coding agent work on a repository one feature at a time without drifting. It
can also run those sessions unattended, one PR per feature. It rests on four ideas:

1. **The repository is the memory, not the chat.** Every session starts from the same files
   (`AGENTS.md`, `PROGRESS.md`, `feature_list.json`) and ends by updating them.
2. **One feature at a time (WIP=1).** `feature_list.json` is a dependency-ordered queue. Only
   scripts change a feature's status, and a script refuses a second `in_progress` feature.
3. **Done means evidence.** A feature lists the exact commands that prove it, grouped in layers
   (`L1` static and unit, `L2` runtime and integration, `L3` end-to-end, `manual:` human-only).
   `harness:verify` runs them in order and only then sets `passing`, with dated evidence lines.
4. **Every gate is a script with an exit code.** Skills, hooks, the loop driver and CI all call
   the same scripts, so the interactive path and the automated path behave identically.

### 1.1 The session loop (interactive)

```
/clock-in [F-NNN]   read PROGRESS.md → pick next ready feature → ./init.sh baseline → activate (WIP=1)
  implement         read the feature's spec, obey AGENTS.md constraints
/verify-feature     pnpm harness:verify F-NNN → L1 → L2 → L3 (stop at first failure) → evidence → passing
/clock-out          clean-state check → PROGRESS.md entry → pnpm check → (evaluator) → commit
```

### 1.2 The driver loop (unattended, `pnpm harness:loop`)

For each ready feature (lowest `priority`, `not_started`, all `depends_on` passing, no `manual:`
step, no branch already on `origin`), the driver:

1. **Preflight**, which fails fast if any check fails:
   - the driver is on `main` with a clean tree, and `main` matches `origin/main`
   - `harness:check` passes
   - `claude --version` works, and one probe request per configured model succeeds
   - `gh auth status` works (warning only)
   - Docker is running, then `pnpm db:up`
2. **Worktree:** creates `git worktree add -b feat/F-NNN ../<repo>-worktrees/F-NNN main`, then runs
   `FAST=1 ./init.sh` there.
3. **Generator session:** runs `claude -p <docs/harness/prompts/generator.md>` with these settings:
   - `--permission-mode auto --permission-prompts none`, so anything that would prompt is denied
   - `--allowedTools` from `harness.config.json`
   - turn, budget and wall-clock caps
   - `--output-format stream-json --include-hook-events`, streamed to `.harness/traces/*.jsonl`
   - env `HARNESS_LOOP=1 HARNESS_STOP_GUARD=1 HARNESS_FEATURE=F-NNN`

   The session itself runs `/clock-in` → implement → `/verify-feature` → `/clock-out` and commits
   on the branch. The Stop hook will not let it end while the clean-state check fails.

4. **Post-check (deterministic):**
   - the feature is `passing` or `blocked`
   - `clean-state-check.sh --quick --require-terminal --base main` passes
   - the branch has at least one commit ahead of `main`

   On failure the driver records an attempt (`harness:feature attempt`, which auto-blocks at
   `maxAttempts`) and retries with the failure appended to the prompt.

5. **Evaluator session:** a fresh context runs `claude -p` with the body of
   `.claude/agents/evaluator.md` as `--append-system-prompt`, its `tools` as `--tools`, and
   `--json-schema evaluator-schema.json`, on `git diff origin/main...HEAD`. (`--agent evaluator`
   would be simpler, but it ignores `--json-schema` and returns prose.) It returns one of:
   - **Accept** → step 6
   - **Revise**, or no verdict → retry with the findings appended
   - **Block** → `harness:feature block`, push the branch, notify
6. **Publish:**
   - `git push -u origin feat/F-NNN` and `gh pr create` (body: behaviour, evidence, verdict
     table, cost, trace path)
   - with `merge: "auto"`, `gh pr merge --auto --squash --delete-branch`
   - waits until the PR is merged, then removes the worktree, runs `git pull --ff-only` and moves
     to the next feature
7. **Stop conditions:**
   - queue empty
   - `maxConsecutiveFailures`
   - `--once`
   - Ctrl-C (the current session finishes first)

### 1.3 Safeguards and what each one catches

| Layer                                     | Catches                                                                                                                                                                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.claude/settings.json` allow list        | Lets the known-good commands run without prompts                                                                                                                                                                                             |
| `.claude/settings.json` deny list         | Secrets, generated files, the lockfile, destructive DB and git commands, in every mode                                                                                                                                                       |
| `guard.sh` (PreToolUse)                   | Wrong package manager, bare test runners, destructive commands, invalid `feature_list.json` on `git commit`, and (only when `HARNESS_LOOP=1`) `git push`, Docker up/down, leaving the branch, worktree commands, writes outside the worktree |
| `validate-feature-list.ts`                | Two `in_progress`, `passing` without evidence, `blocked` without notes, unknown or cyclic `depends_on`, `in_progress` with unmet dependencies                                                                                                |
| `verify-feature.ts`                       | Layers skipped or out of order, Docker missing for L2/L3, `manual:` steps waived unattended                                                                                                                                                  |
| `clean-state-check.sh`                    | Dirty tree, added `.only`/`.skip`, lowered coverage thresholds, `console.log`, missing PROGRESS.md update, tracked `.env`, broken `init.sh`                                                                                                  |
| `stop-guard.sh` (Stop, loop only)         | An unattended session ending unverified or uncommitted (blocks at most 3×)                                                                                                                                                                   |
| Driver post-check                         | A transcript that claims success while the branch says otherwise                                                                                                                                                                             |
| Evaluator (fresh context, rubric, schema) | Work that passes its own tests but misses the behaviour, scope creep, stale evidence                                                                                                                                                         |
| Caps (`harness.config.json`)              | Runaway sessions: turns, USD, minutes, attempts, consecutive failures                                                                                                                                                                        |
| CI + branch protection                    | Everything again on a clean runner before GitHub merges                                                                                                                                                                                      |
| Husky `pre-commit` / `commit-msg`         | Lint-staged (including the feature-list validator), typecheck, conventional commits, no AI attribution trailers                                                                                                                              |

---

## 2. File inventory and porting class

Each file is in one of four classes:

- **COPY:** copy byte-for-byte. Only the project name in comments changes.
- **ADAPT:** copy, then change the lines listed in § 4.
- **WRITE:** author it fresh for the new project, using the skeleton in § 5.
- **SKIP:** project-specific; do not copy.

| Path (source repo)                                                                            | Class                  | Role                                                                                             |
| --------------------------------------------------------------------------------------------- | ---------------------- | ------------------------------------------------------------------------------------------------ |
| `AGENTS.md`                                                                                   | WRITE (keep structure) | Operating manual: clock-in, layers, constraints with `why:`, working rules, DoD, clock-out       |
| `CLAUDE.md`                                                                                   | ADAPT                  | `@AGENTS.md` import + Claude Code specifics (permissions, hooks, skills, driver)                 |
| `PROGRESS.md`                                                                                 | WRITE                  | Current Verified State · Next Steps · Session Log                                                |
| `feature_list.json`                                                                           | WRITE                  | The queue                                                                                        |
| `harness.config.json`                                                                         | ADAPT                  | Driver caps, models, `allowedTools`, worktree root, merge policy                                 |
| `init.sh`                                                                                     | ADAPT                  | Standard startup path: tooling checks, install, L1 baseline (`FAST=1` skips)                     |
| `scripts/validate-feature-list.ts`                                                            | ADAPT                  | Schema + rules + shared helpers (`nextReadyFeature`, `writeFeatureList`, …)                      |
| `scripts/harness-feature.ts`                                                                  | COPY                   | State transitions: `next/show/list/activate/block/unblock/attempt`                               |
| `scripts/verify-feature.ts`                                                                   | COPY                   | Runs layers in order, records evidence, sets `passing`                                           |
| `scripts/clean-state-check.sh`                                                                | ADAPT                  | Machine-checkable clock-out gate                                                                 |
| `scripts/harness-loop.ts`                                                                     | ADAPT                  | Unattended driver                                                                                |
| `scripts/harness-events.ts`                                                                   | COPY                   | Turns the session's stream-json into the readable loop log (tool calls, milestones, hook blocks) |
| `scripts/import-tickets.ts`                                                                   | SKIP (optional ADAPT)  | Parses `docs/product/tickets/*.md` (MV-NNN format) into `feature_list.json`                      |
| `.claude/settings.json`                                                                       | ADAPT                  | Allow/deny permissions + hook registration                                                       |
| `.claude/hooks/guard.sh`                                                                      | ADAPT                  | PreToolUse guard                                                                                 |
| `.claude/hooks/session-start.sh`                                                              | ADAPT                  | Prints state summary into context                                                                |
| `.claude/hooks/stop-guard.sh`                                                                 | COPY                   | Loop-only Stop guard                                                                             |
| `.claude/hooks/format.sh`                                                                     | COPY (if Prettier)     | PostToolUse formatter                                                                            |
| `.claude/skills/{clock-in,clock-out,verify-feature}/SKILL.md`                                 | ADAPT (names only)     | Slash commands that run the loop steps                                                           |
| `.claude/agents/evaluator.md`                                                                 | ADAPT (names only)     | Read-only fresh-context reviewer                                                                 |
| `docs/harness/README.md`                                                                      | ADAPT                  | How the harness works (human-facing)                                                             |
| `docs/harness/prompts/generator.md`                                                           | ADAPT                  | Unattended session prompt (`{{FEATURE_ID}}` etc. placeholders)                                   |
| `docs/harness/prompts/evaluator.md`, `evaluator-schema.json`                                  | COPY                   | Evaluator prompt and JSON verdict schema                                                         |
| `docs/harness/evaluator-rubric.md`                                                            | ADAPT                  | Six categories 0–2; empty the tuning log                                                         |
| `docs/harness/clean-state-checklist.md`                                                       | ADAPT                  | Machine + judgement checklist; must match `clean-state-check.sh`                                 |
| `docs/harness/session-handoff.md`, `quality-document.md`                                      | WRITE (§ 5.5)          | Long-session handoff, quality grades                                                             |
| `docs/harness/phase-2-automated-loop.md`, this file                                           | SKIP                   | History / meta                                                                                   |
| `docs/DECISIONS.md` D-007, D-008                                                              | ADAPT                  | Record the harness decisions in the new repo's decision log                                      |
| `tests/unit/harness/feature-list.test.ts`, `verify-feature.test.ts`, `harness-events.test.ts` | COPY                   | Unit tests for the scripts; `feature-list.test.ts` also validates the real file                  |
| `.gitattributes`                                                                              | COPY                   | Keeps `*.sh` and `.husky/*` at LF line endings on Windows                                        |
| `tests/unit/harness/import-tickets.test.ts`                                                   | SKIP                   | Only with `import-tickets.ts`                                                                    |
| `.husky/pre-commit`, `.husky/commit-msg`, `.lintstagedrc.mjs`, `commitlint.config.mjs`        | COPY                   | Commit gates                                                                                     |
| `.github/workflows/ci.yml`                                                                    | WRITE                  | CI running the same layers; job names become required checks                                     |
| `.gitignore` entry `.harness/`                                                                | COPY                   | Traces, run log, stop-hook counters                                                              |
| `package.json` scripts `check`, `check:full`, `harness:*`, `prepare`                          | ADAPT                  | See § 4.1                                                                                        |

### 2.1 Reference examples in Metsävahti

Worked examples of how the harness is used in practice. Read each at the `harness-reference`
tag. **Learn the shape, not the content.** Every example is about Metsävahti (Payload, PostGIS,
Finnish UI, Metsäkeskus data); none of its constraints, decisions or features belong in another
project.

| To write                               | Look at (`<REF>`, tag `harness-reference`)                                                                                   | Learn from it                                                                                                                                                            | Ignore                                                                                      |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `AGENTS.md`                            | `AGENTS.md`, whole file                                                                                                      | Length (about 120 lines), section order, the router style (each section links out), every constraint as `MUST … why: … source: …`, the working rules and DoD wording     | The constraints themselves, the stack paragraph, the Next.js marker block at the end        |
| `CLAUDE.md`                            | `CLAUDE.md`                                                                                                                  | `@AGENTS.md` first, then only what Claude Code does automatically (permissions, hooks, skills, driver)                                                                   | The specific allow/deny entries                                                             |
| A `feature_list.json` entry (finished) | `feature_list.json`, feature `F-046`                                                                                         | Field order; a `user_visible_behavior` that states observable outcomes; one `verification` step per layer; evidence lines with date, command, result and commit; `notes` | Route names, the `ticket`/`epic`/`design` fields if the project has no tickets or artboards |
| A `feature_list.json` entry (queued)   | `feature_list.json`, features `F-048` (unattended) and `F-021` (human-only)                                                  | `depends_on`; focused test commands without `--`; how a `manual:` step makes a feature human-only                                                                        | Their content                                                                               |
| The bootstrap feature                  | `feature_list.json`, feature `F-000`                                                                                         | What "harness bootstrap" verifies and how its evidence reads                                                                                                             | The Next.js marker step                                                                     |
| `PROGRESS.md`                          | `PROGRESS.md`: `## Current Verified State`, `## Next Steps`, `### Session 028` (driver-run), `### Session 027` (interactive) | How dense the state section is, a session entry's fields (goal, completed, choices made without a human, environment notes, verification run, known risk, next step)     | Every fact in it                                                                            |
| A decision record                      | `docs/DECISIONS.md`: `D-007`, `D-008` (harness), `D-020` (a feature-level decision)                                          | Context → Decision → Consequences; dated headings; amending an older decision in place with the reason                                                                   | The decisions                                                                               |
| Spec deviations ledger                 | `docs/product/00-deviations.md`, rows `P11` and `R19`                                                                        | Recording where the repo knowingly differs from the spec, and who wins                                                                                                   | The rows                                                                                    |
| Tickets that become features           | `docs/product/tickets/E03-auth.md`, `### MV-046`                                                                             | `**Goal:**`, `**Tests:**`, `**Acceptance:**`, `**Depends on:**`, the format `import-tickets.ts` parses                                                                   | Only needed if you port the importer                                                        |
| Session handoff                        | `docs/harness/session-handoff.md`, `### Handoff — 2026-09-06 · session 002`                                                  | A filled-in handoff: what ran, what is unverified, what must not change next                                                                                             | The content                                                                                 |
| Rubric tuning log                      | `docs/harness/evaluator-rubric.md`, `## Tuning log`                                                                          | One row per calibration: what the evaluator said, whether a human agreed, what changed                                                                                   | Their rows; start the port with only "Initial version"                                      |
| Guard rules                            | `.claude/hooks/guard.sh`                                                                                                     | The block/decide helpers, the generic rules, the `HARNESS_LOOP=1` section, Windows-safe path handling                                                                    | The Payload paths, `ALLOW_TESTS_ON_PORT_5432`, `db:reset`                                   |
| Loop log                               | `scripts/harness-events.ts`, `tests/unit/harness/harness-events.test.ts`                                                     | What a readable driver log contains and how it is tested                                                                                                                 | —                                                                                           |
| A driver-made pull request             | https://github.com/Eemelinen/metsavahti/pull/1 (F-046)                                                                       | The PR body (behaviour, evidence, verdict table, cost), the two required checks, squash auto-merge                                                                       | The code in it                                                                              |
| Commit messages                        | `git -C <REF> log --format='%s%n%n%b' -5 harness-reference`                                                                  | Conventional subject, a body that says why; no AI attribution                                                                                                            | —                                                                                           |

---

## 3. Prerequisites in the new project

- **Node:** Node ≥ 20 with `"type": "module"` in `package.json` (the scripts use ESM and `import.meta.url`).
- **Package manager:** pnpm via `packageManager`. Another manager works, but every `pnpm` in the
  scripts, hooks, skills and config must change (§ 4.11 lists all of them).
- **Dev dependencies:**
  - `zod@^4` (the scripts use `z.prettifyError`)
  - `tsx`
  - `husky`
  - `lint-staged`
  - `@commitlint/cli`, `@commitlint/config-conventional`
  - `prettier`
  - a unit test runner (the copied tests use `vitest`)
- **A single command for each layer** (§ 4.1). The harness does not care what the commands do,
  only that they exit 0 or non-zero.
- **Machine tools:**
  - `git` ≥ 2.20 (for worktrees)
  - `bash` (on Windows, Git Bash)
  - `gh`, logged in
  - `claude` CLI, logged in
  - Docker, only if a layer needs it
- **GitHub:** a remote named `origin` with default branch `main`. Settings in § 6.

### 3.1 Hidden dependencies

None of these are files you copy, but the harness breaks without them.

1. **Worktrees contain only committed files.** The driver builds every feature in a fresh
   `git worktree`, which has no `.env`, no local config and no untracked fixtures. Every layer
   command must therefore pass using committed files only.
   - Put test configuration in a committed, secret-free file and wrap the test scripts with it.
     Metsävahti uses `.env.test` and `dotenv -e .env.test -- vitest …`.
   - If a layer truly needs a secret, mark the feature `manual:` (human-only), or extend
     `ensureWorktree()` in `harness-loop.ts` to copy the file into the worktree before
     `init.sh`.
   - Dependencies are installed per worktree by `FAST=1 ./init.sh` (`pnpm install
--frozen-lockfile`). pnpm's shared store keeps that fast; other package managers may need
     a cache.
   - Docker services are started once, from the main checkout (`pnpm db:up` in preflight), and
     shared by all worktrees. `guard.sh` blocks starting or stopping them inside a session.
2. **Claude Code requirements for unattended runs.**
   - The driver passes `--permission-mode auto --permission-prompts none`. Auto mode must be
     available to the logged-in account. Without it, change `generator.permissionMode` to
     `dontAsk` or `acceptEdits` and widen `allowedTools`, because anything not allowed is then
     denied.
   - The CLI must support the models in `harness.config.json`. Preflight sends one probe request
     per model and stops if one fails; update the CLI (`claude update`) when that happens.
   - Sessions are billed to whatever `claude` is logged in with (subscription or API key). The
     caps in `harness.config.json` are the spending limit per session.
   - Skills are invoked in print mode (`claude -p`). A skill with `disable-model-invocation: true`
     can only run when the prompt starts with its `/name`; see § 4.10 for the consequence.
3. **Hooks need `bash` and `node` on PATH.** All four hooks are bash scripts that parse their
   JSON input with `node -e`. On Windows, Claude Code runs them through Git Bash. If either tool
   is missing, a hook fails: the guard and Stop hook then stop protecting the session, and only
   the deny list in `settings.json` still applies. Test with acceptance check 6 (§ 8).
4. **The unit test command must pick up the harness tests.** `tests/unit/harness/feature-list.test.ts`
   validates the real `feature_list.json`. That is what makes `pnpm check` fail when the queue is
   invalid, so the unit test runner's include pattern must cover `tests/unit/harness/`.
   Metsävahti does this with a Vitest workspace: `vitest.config.ts` lists `projects`, and
   `vitest.unit.config.ts` includes `tests/unit/**`. `pnpm test:unit` runs
   `vitest run --project unit`.
5. **Focused test commands must really be focused.** A step such as
   `L2: pnpm test:integration tests/integration/x.int.test.ts` is meant to run one file. Do not
   write `pnpm test:integration -- <file>`: pnpm passes the `--` through literally, and Vitest and
   Playwright then ignore the file and run the whole suite. The reference's validator rejects that
   form for features that have not passed yet. In a port, check once that `pnpm <test script>
<file>` runs only that file.
6. **Git and Node line endings and permissions on Windows.** Shell scripts must keep LF line
   endings (add `*.sh text eol=lf` to `.gitattributes`) and the executable bit
   (`git update-index --chmod=+x`), or `./init.sh` and the hooks fail on the next clone.

---

## 4. Adaptation points (exact edits)

### 4.1 `package.json` scripts

```jsonc
{
  "scripts": {
    // L1: the only command a session needs to be "consistent". Must include the unit tests,
    // because tests/unit/harness/feature-list.test.ts validates feature_list.json.
    "check": "pnpm lint && pnpm typecheck && pnpm format:check && pnpm test:unit",
    "check:full": "pnpm check && pnpm test:integration && pnpm build",
    "harness:check": "tsx scripts/validate-feature-list.ts",
    "harness:feature": "tsx scripts/harness-feature.ts",
    "harness:verify": "tsx scripts/verify-feature.ts",
    "harness:clean-state": "bash scripts/clean-state-check.sh",
    "harness:loop": "tsx scripts/harness-loop.ts",
    "harness:report": "tsx scripts/harness-loop.ts --report",
    "prepare": "husky",
  },
}
```

`knip` is optional. If the project has no `knip`, drop it from `check`, from `allowedTools` and
from the settings allow list. If it does have `knip`, add the `scripts/*.ts` entry points to the
knip config.

### 4.2 `scripts/validate-feature-list.ts`

- Edit the `ticket` regex `^MV-\d{3}$`: change the prefix, or delete the field.
- Edit the `epic` regex `^E\d{2}$`: change it, or delete the field.
- Edit the `design` field: keep it only if the project has design artboards.
- Remove deleted fields from `featureKeyOrder` too.
- Keep everything else: the status enum, the `rules` literals, the layer regex
  `^(L1|L2|L3|manual): `, the WIP and evidence rules, and the helpers.

### 4.3 `scripts/clean-state-check.sh`

Keep sections 1, 2 and 5 (working tree, feature list, `FAST=1 ./init.sh`) unchanged. In section 3,
fix the paths:

- `tests` → the project's test directory
- `vitest.config.ts` → the file that holds the coverage thresholds (delete the check if none)
- `src` → the source directory for the `console.log` check (change the pattern for other
  languages, e.g. `print(` or `dbg!`)

Keep the PROGRESS.md-updated-on-branch check. In section 4, keep the `.env` check and delete the
`nextjs-agent-rules` marker check unless the project is Next.js ≥ 16 (where `next dev` writes
that block into `AGENTS.md`). Update `docs/harness/clean-state-checklist.md` to list the same
checks.

### 4.4 `.claude/hooks/guard.sh`

- **Keep (generic):**
  - npm/yarn/npx block (change it to match the project's package manager)
  - `git push --force`, `git reset --hard`, `git checkout -- .` and `git clean -f` blocks
  - the `rm -rf` block, with its allowlist of build directories
  - the whole `HARNESS_LOOP=1` block, including the rule against Bash writes into the home
    directory
  - the `git commit` → `harness:check` gate
  - for Edit/Write: the repo-relative path computed with node (it handles Windows backslash
    paths), the loop-only deny for files outside the worktree and the temp directory, and the
    lockfile and `.env*` denies
- **Replace (project-specific):**
  - the bare `vitest`/`playwright` block (keep it if the tests need an env wrapper, and change
    the tool names)
  - `ALLOW_TESTS_ON_PORT_5432`
  - `pnpm db:reset`
  - `docker compose down -v` (keep it if the project uses compose volumes)
  - every Payload generated-file path, the migrations `ask` and the `AGENTS.md` marker `ask`

  Add the new project's generated files (`deny`) and its hand-edit-with-care files (`ask`).

- In the `HARNESS_LOOP=1` block, change `pnpm (run )?db:(up|down)` to the project's service
  start/stop scripts, or delete it if there are none.

### 4.5 `.claude/settings.json`

- **`permissions.allow`:** one entry per layer command, plus `pnpm harness:*`,
  `scripts/clean-state-check.sh*`, read-only git (`status`, `log`, `diff`, `show`) and
  `docker ps*`/`docker info*`.
- **`permissions.deny`:**
  - `Read`/`Edit`/`Write` of `./.env`
  - `Edit`/`Write` of the lockfile and the generated files
  - destructive DB and compose commands
  - `git push --force*`, `git push -f*`, `git reset --hard*`
- **`hooks`:** copy the block unchanged (SessionStart, PreToolUse Bash + Edit|Write → guard.sh,
  PostToolUse Edit|Write → format.sh, Stop → stop-guard.sh). Commands use
  `"$CLAUDE_PROJECT_DIR"/.claude/hooks/<name>.sh`.

Mark the hook files executable: `git update-index --chmod=+x .claude/hooks/*.sh scripts/*.sh init.sh`.
This is required on Windows, where `chmod` is not stored in git.

### 4.6 `.claude/hooks/session-start.sh`

Change the heading `## Metsävahti session state`. Keep or delete the `.env` and Docker lines to
suit the project. Its WARNING about uncommitted `src/` changes uses `src/`, so change it to the
project's source directory.

### 4.7 `harness.config.json`

```json
{
  "caps": {
    "maxAttempts": 2,
    "maxTurns": 200,
    "maxBudgetUsd": 15,
    "wallClockMin": 60,
    "maxConsecutiveFailures": 2
  },
  "generator": { "model": "claude-opus-5-5", "permissionMode": "auto", "effort": "high" },
  "evaluator": {
    "model": "claude-opus-5-5",
    "effort": "high",
    "maxTurns": 60,
    "maxBudgetUsd": 4,
    "wallClockMin": 15
  },
  "allowedTools": [
    "Bash(pnpm check*)",
    "…every layer command…",
    "Bash(pnpm harness:*)",
    "Bash(scripts/clean-state-check.sh*)",
    "Bash(FAST=1 ./init.sh)",
    "Bash(git status*)",
    "Bash(git log*)",
    "Bash(git diff*)",
    "Bash(git show*)",
    "Bash(git add *)",
    "Bash(git commit *)",
    "Bash(git worktree list)"
  ],
  "worktreeRoot": "../<repo-name>-worktrees",
  "merge": "auto",
  "traceDir": ".harness/traces",
  "runsLog": ".harness/runs.jsonl"
}
```

Start with the smaller caps above (Metsävahti raised them to 300 turns, 25 USD and 90 min after
measuring). Use `merge: "auto"` only after branch protection exists (§ 6); otherwise use
`"wait"`. Never set `permissionMode` to `bypassPermissions` on a host with real data.

### 4.8 `scripts/harness-loop.ts`

Most of the file is generic. Change these points:

- **Docker services:** in `preflight()`, `must('pnpm', ['db:up'], …)` is the project's service
  start command. Change it or delete it. `--no-docker` skips it.
- **Prompt paths:** `docs/harness/prompts/*` is hard-coded. Keep the same paths.
- **Branch and PR names:** branch `main`, `feat/${id}` and the PR title `feat(${id}): ${title}`
  are hard-coded. Change them only if the default branch is not `main`.
- **PR body:** `feature.ticket` and `feature.spec` are optional, so leave them alone.
- **Notifications:** `notify()` only notifies on macOS. Add a `win32` branch if wanted, for
  example a PowerShell `New-BurntToastNotification` call, or leave it as console output.
- **Evaluator:** keep `evaluatorAgent()`, which reads `.claude/agents/evaluator.md` and passes its
  body and tools as `--append-system-prompt` / `--tools`. Do not switch back to `--agent`: that
  drops the JSON verdict.
- **Logging:** keep the `logFile` handling and the `describeEvent()` / `heartbeat()` wiring from
  `harness-events.ts`. Every run then leaves a readable `.harness/traces/F-NNN-<time>.log`.
- **Windows:** keep `resolveCommand()`. It runs `pnpm` through `node $npm_execpath`, because
  spawnSync cannot run `pnpm.cmd` without a shell.

### 4.9 `scripts/verify-feature.ts`, `scripts/validate-feature-list.ts`: Windows

- `verify-feature.ts` runs each layer command with `sh -c`. That works when the driver or
  session runs from Git Bash. From PowerShell, `sh` may be missing.
- Anything that spawns `pnpm` without a shell must use the `npm_execpath` trick on Windows, as
  `resolveCommand()` does. The reference applies it in `writeFeatureList()` (Prettier after each
  write) and in `tests/helpers/db.ts` (`payload migrate` for L2/L3). Search a port's scripts and
  test helpers for `spawnSync('pnpm'` and `execFileSync('pnpm'`.

### 4.10 Skills, evaluator, prompts, docs

- **Skills and evaluator:** replace "Metsävahti" with the project name. Remove "design artboard"
  steps if the project has no `design` field.
- **`/clock-out` in unattended sessions:** `clock-out/SKILL.md` has
  `disable-model-invocation: true`, so that in interactive work Claude never commits unless you
  type `/clock-out`. Claude Code blocks Skill-tool calls to such a skill and tells Claude not to
  reproduce its steps another way. A skill named mid-prompt cannot run, so step 4 of the
  reference `generator.md` tells the session to follow AGENTS.md → Clock-out and the skill file
  itself, and says the prompt is the user's request to do so. Keep the flag and that wording.
  `/clock-in` and `/verify-feature` have no such flag and work when named in the prompt.
- **`generator.md`:** keep the four-step loop and the unattended rules. Change the line about the
  design-system rule and the deviations ledger path (`docs/product/00-deviations.md`) to the
  project's equivalent, or delete it.
- **`evaluator-rubric.md`:** the Maintainability row references `src/ARCHITECTURE.md` and knip.
  Point it at the project's architecture doc. Empty the tuning log except for an "Initial
  version" row.
- **`docs/harness/README.md`:** copy it, then change the project name, layer commands, ports,
  prerequisites and caps.
- **`CLAUDE.md`:** keep `@AGENTS.md` as the first line, then the "Claude Code specifics" section
  with the new allow/deny summary.

### 4.11 Changing the package manager

`pnpm` is hard-coded in all of these. Replace each occurrence. For spawned commands in the
TypeScript scripts, use the new manager's run syntax, e.g. `npm run harness:feature -- …`.

| File                                                          | What uses `pnpm`                                                                                 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `scripts/harness-loop.ts`                                     | `sh('pnpm', …)` for `harness:check`, `harness:feature`, `db:up`; `resolveCommand()`; log strings |
| `scripts/harness-feature.ts`, `scripts/verify-feature.ts`     | Usage and error messages                                                                         |
| `scripts/validate-feature-list.ts`                            | `writeFeatureList()` spawns `pnpm exec prettier`                                                 |
| `scripts/clean-state-check.sh`                                | `pnpm --silent harness:check`                                                                    |
| `.claude/hooks/guard.sh`                                      | The package-manager block, test-runner block, `db:*` blocks, the commit gate                     |
| `.claude/hooks/format.sh`, `session-start.sh`                 | `pnpm exec prettier`; printed commands                                                           |
| `.claude/skills/*/SKILL.md`, `.claude/agents/evaluator.md`    | `allowed-tools` entries and the steps                                                            |
| `.claude/settings.json`, `harness.config.json`                | `Bash(pnpm …)` allow rules                                                                       |
| `init.sh`, `.husky/pre-commit`, `.husky/commit-msg`           | Install, `check`, `lint-staged`, `typecheck`, `commitlint`                                       |
| `docs/harness/prompts/generator.md`, `AGENTS.md`, `CLAUDE.md` | Commands in the instructions                                                                     |

Search with `grep -rn pnpm scripts .claude .husky init.sh harness.config.json docs/harness AGENTS.md CLAUDE.md`
afterwards; only intentional mentions should remain.

---

## 5. Skeletons for WRITE files

### 5.1 `AGENTS.md`

Keep these sections, in this order. Each constraint carries a `why:` and a `source:`.

```markdown
# <Project> — agent operating manual

<2–4 sentences: what the product does, stack, languages, any legal must-haves.>
This file is a router, not a manual. The repository, not the chat, is the system of record.

## Clock-in (session start)

1. `pwd` · 2. read PROGRESS.md · 3. `pnpm harness:feature next --include-manual`, then `show F-NNN`
2. `git log --oneline -5` · 5. `./init.sh` · 6. red baseline → fix first · 7. `pnpm harness:feature activate F-NNN`

## Verification layers

| Layer | Command | Covers | Needs |
| L1 | `pnpm check` | … | nothing |
| L2 | `pnpm test:integration` | … | … |
| L3 | `pnpm test:e2e` | … | … |
Rules: in order; never skip a listed layer; `pnpm check` exit 0 = consistent state.

## Constraints

- MUST … why: … source: …

## Working rules

WIP=1 · state machine not_started → in_progress → passing | blocked (notes) · status only via
`pnpm harness:*` · one session per feature (split otherwise) · scope · evidence format
`YYYY-MM-DD <command> → pass (commit <hash>)` · context anxiety → checkpoint · escalation order;
in `HARNESS_LOOP=1` pick the simplest reading, record it, or block.

## Definition of done

A feature is done only when all of these are true:

- [ ] The `user_visible_behavior` is implemented.
- [ ] Every listed verification layer actually ran, in order, and passed.
- [ ] Evidence is recorded in `feature_list.json` and the status is `passing`.
- [ ] `PROGRESS.md` is updated (Current Verified State, session entry, Next Steps).
- [ ] Affected docs are updated in the same commit.
- [ ] The tree is committed and clean, and `FAST=1 ./init.sh` still exits 0.

## Clock-out (session end)

1. `scripts/clean-state-check.sh --allow-state-dirty`, then the judgement items of
   docs/harness/clean-state-checklist.md.
2. Update `PROGRESS.md`; `feature_list.json` is already updated by `pnpm harness:verify`
   (or `pnpm harness:feature block`); `pnpm harness:check`.
3. `pnpm check` (plus the feature's L2/L3).
4. Optional: score the diff with docs/harness/evaluator-rubric.md (Claude Code: `evaluator`
   subagent). Revise before committing if any category is below 2.
5. Commit; for long sessions also fill docs/harness/session-handoff.md.
6. Leave a clean restart path: the next session must be able to run `./init.sh` immediately.

## Driver-run sessions

`pnpm harness:loop` runs the same loop unattended: one fresh session per ready feature in its
own worktree, `pnpm harness:verify` as the gate, a fresh-context evaluator, then a PR. Inside
such a session `HARNESS_LOOP=1` is set, questions cannot be asked, `manual:` steps are never
waived and the driver (not the session) pushes. Details: docs/harness/README.md.

## State artefacts and further reading
```

### 5.2 `PROGRESS.md`

```markdown
# Progress log

Repository-local session log. Read it at clock-in, update it at clock-out (AGENTS.md).

## Current Verified State

- Repository root: `<repo>/`.
- Standard startup path: `./init.sh` (`FAST=1` skips the baseline).
- Standard verification path: L1 `pnpm check` · L2 … · L3 … Per feature: `pnpm harness:verify F-NNN`.
- Last verified commit: <hash> — `pnpm check` green on <date>.
- Current blocker: none.

## Next Steps

1. …

## Session Log

### Session 001 — YYYY-MM-DD (harness bootstrap)

- Goal / Completed / Verification / Evidence / Commits / Known risk / Next best step
```

The clean-state check requires `PROGRESS.md` to change on every branch, and the session-start
hook prints the `## Current Verified State` section. Keep that heading text exactly.

### 5.3 `feature_list.json`

```json
{
  "project": "<repo-name>",
  "last_updated": "YYYY-MM-DD",
  "rules": {
    "single_active_feature": true,
    "passing_requires_evidence": true,
    "do_not_skip_verification": true
  },
  "status_legend": {
    "not_started": "Work has not begun.",
    "in_progress": "The feature is the current active task (at most one at a time).",
    "blocked": "Work cannot continue until the blocker in `notes` is resolved.",
    "passing": "Required verification ran and the evidence is recorded."
  },
  "features": [
    {
      "id": "F-000",
      "priority": 0,
      "area": "harness",
      "title": "Agent harness bootstrap",
      "user_visible_behavior": "A fresh agent session can answer what the repo does, how to start it, how to verify it, what is unfinished and what to do next, using only AGENTS.md, PROGRESS.md and this file.",
      "status": "passing",
      "depends_on": [],
      "verification": ["L1: pnpm check", "L1: pnpm harness:check"],
      "evidence": [
        "YYYY-MM-DD pnpm check → pass (commit <sha>)",
        "YYYY-MM-DD pnpm harness:check → pass"
      ],
      "attempts": 0,
      "notes": "Ported from the Metsävahti harness."
    }
  ]
}
```

Rules for writing features:

- **Size:** one feature is completable in one session (≤ ~100 turns).
- **`user_visible_behavior`:** an observable outcome, not a task list.
- **Verification commands:** run exactly as written by `sh -c`. A trailing ` (description)` is
  stripped before running. Name a focused test file where possible, e.g.
  `L1: pnpm test:unit -- tests/unit/x.test.ts (what it proves)`.
- **Human-only features:** anything needing network, credentials or a person gets a `manual:`
  step. The driver then skips the feature.
- **Dependencies:** `depends_on` must be acyclic. `priority` breaks ties: lowest first.

### 5.4 CI (`.github/workflows/ci.yml`)

Run the same layers as the harness on `pull_request` and on `push` to `main`. Give each job a
stable `name:`; those names become the required status checks in § 6. Metsävahti uses two jobs:

- `Lint · typecheck · unit · integration · build`
- `E2E (Playwright)`, with service containers for Postgres and Mailpit

### 5.5 `docs/harness/session-handoff.md` and `quality-document.md`

`session-handoff.md` is filled in at clock-out after long or multi-area sessions, newest entry
first. For a short single-feature session the `PROGRESS.md` entry is enough.

```markdown
# Session handoff

Compact handoff for the next session. Copy the template into the top of this file (newest
first) and fill every line.

### Handoff — YYYY-MM-DD · session NNN (<feature or topic>) → next: <next step>

#### Verified now

- What is currently working:
- What verification actually ran:

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
- What counts as passing:
- What must not change during that step:

#### Commands

- Startup: `./init.sh` (`FAST=1` to skip the baseline)
- Verification: `pnpm check` · … · `pnpm harness:verify F-NNN`
- Focused debug command:
```

`quality-document.md` grades each product area and architectural layer. Read it at clock-in to
see where the codebase is weakest, update it when a session changes a grade, and regrade it in
the monthly sweep.

```markdown
# Quality document

**Grades:** **A** all verification passing, clean boundaries, agent-legible, stable tests ·
**B** verification passing, minor gaps · **C** partially working, known gaps, hard for an
agent to follow · **D** not working or major structural issues.

## Product domains

| Domain | Grade | Verification | Agent legibility | Test stability | Key gaps | Last updated |
| ------ | ----- | ------------ | ---------------- | -------------- | -------- | ------------ |

## Architectural layers

| Layer | Grade | Boundary enforcement | Agent legibility | Key gaps | Last updated |
| ----- | ----- | -------------------- | ---------------- | -------- | ------------ |

## Change history

### YYYY-MM-DD

- Changes: initial snapshot at harness bootstrap.
```

---

## 6. GitHub setup (once per repo)

1. Settings → General → Pull Requests: enable **Allow auto-merge** and **Allow squash merging**.
2. Push one commit to `main` so CI runs once; GitHub only offers a check as "required" after it
   has run.
3. Protect `main` with the CI job names as required checks, no review requirement (so the driver
   can merge) and admins exempt:

   ```json
   {
     "required_status_checks": { "strict": false, "contexts": ["<job name 1>", "<job name 2>"] },
     "enforce_admins": false,
     "required_pull_request_reviews": null,
     "restrictions": null
   }
   ```

   Then run `gh api -X PUT repos/<owner>/<repo>/branches/main/protection --input protection.json`.
   Without protection, `gh pr merge --auto` merges immediately, before CI. A person usually has
   to run this command: agent permission classifiers often refuse branch-protection changes.

4. `gh auth login` (HTTPS is enough; the token needs `repo` and `workflow`).

---

## 7. Machine setup

| Tool          | macOS                                             | Windows (PowerShell)                                                                               |
| ------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| gh            | `brew install gh`                                 | `winget install --id GitHub.cli`                                                                   |
| claude CLI    | `curl -fsSL https://claude.ai/install.sh \| bash` | `irm https://claude.ai/install.ps1 \| iex`, then add `%USERPROFILE%\.local\bin` to the user `Path` |
| bash          | built in                                          | Git for Windows; **run the driver from Git Bash**                                                  |
| Docker        | Docker Desktop                                    | Docker Desktop                                                                                     |
| Notifications | `osascript` (built in)                            | none (console only)                                                                                |

After installing, open a new terminal and restart the editor so the new `Path` is picked up.
Check with `gh auth status` and `claude --version`.

---

## 8. Acceptance checks for a finished port

Run these in order. All must pass before the port counts as done.

1. `pnpm install` runs the husky `prepare` script, so `.husky/` hooks are active.
2. `pnpm harness:check` prints `feature_list.json OK — … VCR 1/1`.
3. `pnpm check` exits 0, and the copied `tests/unit/harness/*.test.ts` pass.
4. `./init.sh` and `FAST=1 ./init.sh` exit 0.
5. Commit the port, then run `scripts/clean-state-check.sh`. It exits 0 (all `[ok]` or `[skip]`).
6. Hooks fire:
   - a Claude Code session in the repo prints the session-start summary
   - `npm install x` is blocked by `guard.sh`
   - editing the lockfile is denied, also when the path uses Windows backslashes
   - with `HARNESS_LOOP=1`, a Write outside the repo and `mkdir -p ~/x` are denied (feed
     `guard.sh` a JSON input built with `node -e 'console.log(JSON.stringify({tool_name, tool_input}))'`;
     hand-written JSON with Windows paths usually has broken escapes)
7. Commit gates work:
   - `git commit -m "bad message"` is rejected by commitlint
   - a commit with an invalid `feature_list.json` is rejected
8. Add a trivial unattended feature, e.g. `F-001` "README badge" with `L1: pnpm check`. Then:
   - `pnpm harness:feature next` prints `F-001`
   - `pnpm harness:loop --dry-run --no-docker` passes preflight and prints the worktree and
     `claude` commands
9. A worktree works with committed files only (§ 3.1, point 1): run
   `git worktree add ../port-check -b port-check`, then `FAST=1 ./init.sh` and the L1 command
   (and L2/L3 if Docker is running) inside it. All must pass. Then clean up with
   `git worktree remove ../port-check` and `git branch -D port-check`.
10. `pnpm harness:loop --once --no-docker` (or with Docker) produces a worktree, a commit on
    `feat/F-001`, an evaluator verdict, a PR and, with `merge: "auto"`, a merge after CI. Then
    `pnpm harness:report` shows one `merged` row.
11. Record the port as D-00N in `docs/DECISIONS.md` and as a session entry in `PROGRESS.md`.

---

## 9. The prompt to give an agent

Run this in a Claude Code session opened in the **new** repository. The source repository
(Metsävahti) must be readable at the path you give.

```text
Port the agent harness from the reference repository REF=<ABSOLUTE PATH TO metsavahti> into this
repository. Read every reference file at the git tag harness-reference, never from REF's working
tree: `git -C <REF> show harness-reference:<path>`. Start with
`git -C <REF> show harness-reference:docs/harness/porting-guide.md` and follow it exactly:

1. Read the guide in full. § 0 explains which failure each part prevents and the principles to
   keep: use it to decide how to adapt a file, and what this project can skip (§ 0.4). Then read
   every source file listed in § 2 from the reference repo. Copy files byte-for-byte where the
   class is COPY; apply only the § 4 edits where it is ADAPT; write WRITE files from the § 5
   skeletons using what you learn about this repository. Before writing each WRITE file, read its
   worked example from § 2.1 and copy the shape, never the Metsävahti-specific content. Consult
   the course and articles linked in § 0.1 only for questions the guide does not answer.
2. Before writing AGENTS.md, inspect this repository: stack, package manager, existing lint /
   typecheck / test / build / e2e commands, generated files, secrets files, services (Docker),
   source and test directories. Define L1/L2/L3 from commands that already exist; if a layer has
   no command yet, add the script to package.json or leave the layer out — do not invent tests.
3. Build feature_list.json: F-000 harness bootstrap (passing, with evidence from commands you
   actually ran), then the project's remaining work as features. Source: <PATH TO SPEC / ISSUE
   LIST / "the TODOs in README.md">. Keep each feature one-session sized, give it concrete
   verification commands, add `manual:` steps where network, credentials or a human are needed,
   and set depends_on.
4. Wire package.json scripts, husky, lint-staged, commitlint, .gitignore (.harness/), and mark
   the shell scripts executable in git (git update-index --chmod=+x).
5. Run the § 8 acceptance checks 1–9 and fix every failure. Do not weaken checks to get green.
6. Commit in logical steps with conventional-commit messages whose bodies explain why.
7. Stop and report: what was copied/adapted/written, the layer commands, the feature count, the
   acceptance-check results, and the GitHub steps from § 6 that I must do by hand (auto-merge
   setting, branch protection with the CI job names, gh auth login). Do not run
   pnpm harness:loop for real; I will start it.
```

Fill in the `<…>` placeholders. If the reference checkout is not on the machine, replace the
first paragraph with "clone https://github.com/Eemelinen/metsavahti into a temporary directory,
check out the tag harness-reference, and use that directory as REF". For a brand-new, empty project, give the agent the product
spec as the feature source and let it scaffold the stack first. The harness assumes
`pnpm check` already runs; in an empty repo, create the scaffold and the `check` script before
`feature_list.json`.

---

## 10. Known gaps in the reference implementation

- **Sequential only:** L3 uses fixed ports, so one feature runs at a time. Parallel workers need
  per-worktree ports (see README § 5, "Phase 3").
- **Not a sandbox:** sessions run on the host. The deny list, `guard.sh` and the auto-mode
  classifier are the boundary. Containerise the driver before loosening the allowlist.
- **State-file conflicts:** every PR touches `feature_list.json` and `PROGRESS.md`. Waiting for
  each merge avoids conflicts; `--no-wait` with dependent features does not.
- **Passing features keep the old test form:** features that passed before the `--` fix still
  list `pnpm test:unit -- <file>` steps, because their evidence names those commands. Re-running
  such a step runs the whole suite.
- **Bash write guard is a heuristic:** `guard.sh` recognises `mkdir`/`cp`/`mv`/`ln`/`touch`/`tee`
  and redirects into the home directory. A session can still change the host by other means
  (a script, an installer), so the prompt rule against touching the host matters too.
- **Workspace trust:** until someone accepts Claude Code's trust dialog for the repository once,
  the `permissions.allow` list in `.claude/settings.json` is ignored and sessions rely on
  `allowedTools` from `harness.config.json` alone.
- **Windows stop on timeout:** on wall-clock expiry the driver sends `SIGINT` to the child
  `claude.exe`; Node maps that to a hard kill on Windows. The trace may end without a `result`
  line. The post-check still catches the bad state.
