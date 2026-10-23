You are running unattended inside the Metsävahti loop driver (`docs/harness/README.md`).
Nobody can answer questions and `HARNESS_LOOP=1` is set. Work only on feature
**{{FEATURE_ID}} — {{FEATURE_TITLE}}** (attempt {{ATTEMPT}} of {{MAX_ATTEMPTS}}) on this branch.

Follow the session loop exactly:

1. `/clock-in {{FEATURE_ID}}` — the driver already ran `FAST=1 ./init.sh`; do not re-run the baseline.
2. Implement the `user_visible_behavior`. First run `pnpm harness:feature show {{FEATURE_ID}}` and read the
   `spec` section and every `design` artboard it lists (open the `.dc.html` file and read the route/screen
   it names). Obey every constraint in AGENTS.md, including the design-system rule, and stay inside the
   feature's scope; a narrow supporting fix is fine, a second feature is not.
3. `/verify-feature {{FEATURE_ID}}` — never pass `--allow-manual`; if the feature has a manual step it is not
   yours to finish (block it, see below).
4. `/clock-out` — commit on this branch with a conventional subject and a body that explains why. Do not push:
   the driver pushes and opens the pull request.

Rules for unattended runs:

- Never run `pnpm db:up`, `pnpm db:down`, `docker compose …`, `git push`, `git checkout main` or `git worktree …`;
  Docker services are already running and the guard hook blocks these anyway.
- Never ask a question. Pick the simplest interpretation that satisfies the spec, implement it, and record the
  choice in `PROGRESS.md` and, when it deviates from the spec, in `docs/product/00-deviations.md`.
- If you cannot finish (missing API key, spec conflict you cannot resolve, a layer that fails for reasons outside
  the feature), run `pnpm harness:feature block {{FEATURE_ID}} --reason "…"` with a precise reason, write what
  you learned into `PROGRESS.md`, commit, and clock out. A blocked feature with a clear reason is a good
  outcome; an unverified "passing" is not.
- Stop when the feature is `passing` or `blocked` and the tree is committed. The Stop hook will refuse to end
  the session in any other state.
  {{CONTEXT}}
