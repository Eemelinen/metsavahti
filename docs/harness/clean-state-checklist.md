# Clean-state checklist

Run through this at clock-out, before committing. A session is not finished until every
box is ticked; `/clock-out` in Claude Code walks the same list, and the loop driver refuses
to open a PR until the machine-checked part passes.

## Machine-checked — `scripts/clean-state-check.sh`

`pnpm harness:clean-state` (alias for the script) exits 0 only when all of these hold.
Flags: `--allow-state-dirty` (state files may be uncommitted), `--quick` (skip `init.sh`,
used by the Stop hook), `--require-terminal` (no feature may be left `in_progress`; used
for driver-run sessions), `--base <ref>` (diff base, default `origin/main`).

- [ ] Working tree is clean (or only `feature_list.json`, `PROGRESS.md`, `docs/harness/**` are dirty).
- [ ] `feature_list.json` is valid: `pnpm harness:check` exits 0 (WIP=1, evidence before `passing`, dependencies resolve).
- [ ] No `.only` / `.skip` was added under `tests/` and no coverage threshold in `vitest.config.ts` was removed.
- [ ] No `console.log` was added under `src/`.
- [ ] `PROGRESS.md` was updated on this branch.
- [ ] `.env` is neither tracked nor staged.
- [ ] The `<!-- BEGIN:nextjs-agent-rules -->` block in `AGENTS.md` is intact.
- [ ] The standard startup path still works: `FAST=1 ./init.sh` exits 0.
- [ ] (driver-run) The active feature ended `passing` or `blocked`, not `in_progress`.

## Judgement — checked by the person or agent clocking out

- [ ] The standard verification path ran for the feature: `pnpm check`, plus L2/L3 when the feature lists them (`pnpm harness:verify` records the evidence).
- [ ] `PROGRESS.md` content is truthful: Current Verified State, session entry, concrete Next Steps.
- [ ] No half-finished step is left undocumented (notes on the feature, or a handoff in `docs/harness/session-handoff.md`).
- [ ] No debug artefacts: temporary files, commented-out code, stray logging.
- [ ] Secrets did not land in `.env.test` or fixtures.
- [ ] Generated files were regenerated, not edited: `pnpm generate:types` after collection changes, `pnpm generate:importmap` after admin component changes.
- [ ] Docs affected by the change were updated in the same commit (README, `src/ARCHITECTURE.md`, `docs/DECISIONS.md`, `docs/product/00-deviations.md` when the spec is deviated from).
- [ ] Commit subject follows conventional commits and the body explains why.
- [ ] The next session can continue without manual repair.
