# 05 — Conventions, Definition of Done, Agent Protocol

[AGENTS.md](../../AGENTS.md) is the operating manual for every session and wins over this
file; this file only adds the ticket-level rules that the manual does not state. The
mechanics of running tickets (one at a time, in a worktree, verified by scripts) are in
[docs/harness/README.md](../harness/README.md).

## Branching & PRs

- `main` is protected; squash-merge only. A ticket `MV-NNN` is feature `F-NNN` in
  `feature_list.json`; the branch is `feat/F-NNN`, the PR title `feat(F-NNN): <title>`.
- One feature per PR. Conventional commits inside (commitlint enforces the subject; the body
  says why).
- PR body sections: user-visible behaviour · evidence lines · evaluator verdict · spec
  deviations · follow-ups. The loop driver renders these automatically.

## Definition of Done (every ticket)

Everything in AGENTS.md → Definition of done, plus:

1. All acceptance criteria in the ticket are met, or the deviation is recorded in
   [00-deviations.md](00-deviations.md).
2. The tests named in the ticket exist and are the feature's `verification[]` entries
   (`L1:` unit, `L2:` integration, `L3:` E2E); coverage for `src/lib/**` does not drop.
3. No new `any`, no `// @ts-ignore` without a comment referencing an issue.
4. New env vars are added to `.env.example`, `src/lib/env.ts` and the status table in
   `docs/TECH_STACK.md`.
5. New UI strings go to `src/i18n/fi.ts` once it exists (created by MV-041); no hard-coded
   Finnish in components after that.
6. Migrations are generated with `pnpm db:migrate:create <name>` (hand edits only for PostGIS
   statements), reviewed by hand, reversible where feasible.
7. Accessibility: interactive elements keyboard-reachable and labelled; new pages added to the
   axe E2E list.
8. Styling uses the design tokens in `src/app/globals.css`; the design-system rule in
   AGENTS.md is enforced by `pnpm lint`. The page or email follows the artboard linked in the
   feature's `design` field.

## Testing rules

- **Unit** (`tests/unit`, Vitest, no I/O): pure functions, schemas, reducers, email rendering,
  components with Testing Library (add `@testing-library/react` with the first component test).
  Mock HTTP with MSW only when a unit genuinely wraps `fetch`.
- **Integration** (`tests/integration`, Vitest + Testcontainers PostGIS): Payload Local API,
  Server Actions, Route Handlers, jobs. Real DB, mocked network (MSW). One throwaway database
  per run, `resetDatabase()` per file (see `tests/README.md`).
- **E2E** (`tests/e2e`, Playwright): user journeys against the app on port 3100, the WFS mock
  and Mailpit. Prefer roles/labels over `data-testid`. Tag the fast journeys `@smoke`.
- **Live** (`tests/live`): real WFS only, nightly. Never in PR CI.
- Fixtures: `tests/fixtures/wfs/<name>.json` recorded with `pnpm fixtures:record -- --bbox …`;
  MV-021 produces the named set (`inside`, `outside`, `borderline`, `changed-geometry`,
  `changed-attributes`, `empty`, `paged-1`/`paged-2`).
- Factories in `tests/factories/` (`userFactory`, `watchAreaFactory`, `declarationFactory`)
  from MV-037 on; no ad-hoc inserts after that.

## Code conventions

- Server-first: fetch in Server Components / Server Actions; client components only for
  interactivity (map, forms).
- Ownership checks in every Server Action and Route Handler (`assertOwner(user, resource)`),
  in addition to Payload access control.
- Errors: throw typed `AppError` subclasses (`NotFound`, `Forbidden`, `RateLimited`,
  `ExternalServiceError`, MV-010); map to responses in one place.
- Dates: store UTC, render with `Intl.DateTimeFormat('fi-FI', { timeZone: user.timezone })`.
- Geometry: GeoJSON in WGS84 at API boundaries; EPSG:3067 internally; never buffer in WGS84
  for anything authoritative; all PostGIS SQL in `src/lib/geo/spatial-queries.ts`.
- Logging: `logger.child({ task, runId })`; no `console.log` in committed code (the clean-state
  check rejects it).
- Feature flags: read from `env` only; document in `docs/TECH_STACK.md`.

## Agent protocol

- Work is sequential (WIP=1): `pnpm harness:feature next` picks the highest-priority ready
  ticket; `depends_on` in `feature_list.json` is the machine-readable form of the tickets'
  "Depends on" lines.
- Claim by activation (`pnpm harness:feature activate F-NNN`), not by opening a PR.
- Never skip or `.skip` a failing test to get green; fix it or block the feature with the
  reason (`pnpm harness:feature block`).
- If the spec is ambiguous, pick the simplest interpretation that satisfies the acceptance
  criteria, implement it, and record the choice in `PROGRESS.md` (and in
  `00-deviations.md` when it changes the spec).
- The swarm schedule in [04-delivery-plan.md](04-delivery-plan.md) describes phase 3 (parallel
  workers by area); it does not apply while WIP=1 is in force.
