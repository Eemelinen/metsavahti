# Quality document

A quality snapshot per product domain and architectural layer. Read it at clock-in to see
where the codebase is weakest; update it at clock-out when the session changed a grade.

**Update cadence:** after each significant session, and during the periodic (monthly) sweep.

**Grades:** **A** all verification passing, clean boundaries, agent-legible, stable tests ·
**B** verification passing, minor gaps in legibility or coverage · **C** partially working,
known gaps, hard for an agent to follow · **D** not working or major structural issues.

## Product domains

| Domain                    | Grade | Verification                                     | Agent legibility                               | Test stability              | Key gaps                                                      | Last updated |
| ------------------------- | ----- | ------------------------------------------------ | ---------------------------------------------- | --------------------------- | ------------------------------------------------------------- | ------------ |
| WFS ingestion (`lib/wfs`) | A     | Unit (fixture snapshot) + nightly live contract  | Schemas are the contract; file headers explain | Stable; live test is opt-in | Hakkuutapa labels not verified against the code list (F-009)  | 2026-09-06   |
| Geo / spatial (`lib/geo`) | A     | Unit + integration (generated column, GIST)      | All SQL in one file with doc comments          | Stable                      | No 3067→4326 helper for MultiPolygon overlays yet (F-007)     | 2026-09-06   |
| Pipeline & alerts         | B     | Integration: new → idempotent → changed geometry | Job steps injected via `JobContext`            | Stable (Testcontainers)     | Geometry-only change detection (F-008); no run-history UI     | 2026-09-06   |
| Auth & access control     | B     | Integration access-control tests; e2e login      | Access helpers centralised in `payload/access` | Stable                      | No sign-up / verification flow in the frontend (F-002, F-003) | 2026-09-06   |
| Dashboard & map           | C     | e2e: redirect, auth, map renders, axe            | Small; MapLibre island documented              | Stable, chromium+webkit     | No watch-area creation, alert list or overlay (F-004…F-007)   | 2026-09-06   |
| Email                     | B     | Unit render + Mailpit assertions in integration  | React Email template with attribution          | Stable                      | Resend path untested outside production                       | 2026-09-06   |

## Architectural layers

| Layer                       | Grade | Boundary enforcement                                   | Agent legibility                         | Key gaps                                      | Last updated |
| --------------------------- | ----- | ------------------------------------------------------ | ---------------------------------------- | --------------------------------------------- | ------------ |
| Payload collections & jobs  | B     | Access helpers + thin task wrappers; no lint rule      | Finnish labels, English code; documented | No architectural lint (import boundaries) yet | 2026-09-06   |
| `lib/*` (domain logic)      | A     | 91 % line coverage on `src/lib`, thresholds on geo/wfs | File-header docs; pure functions         | —                                             | 2026-09-06   |
| Frontend (`app/(frontend)`) | C     | Server Components by default                           | Thin; few components                     | Most roadmap UI missing; no component tests   | 2026-09-06   |
| Tests & environments        | A     | `.env.test` wrapping, db-guard, separate dist dir      | `tests/README.md` explains every suite   | Live suite depends on upstream availability   | 2026-09-06   |

## Change history

### 2026-09-06

- Changes: initial snapshot at harness bootstrap (commit `9bd9f80` baseline).
- Domains promoted: —
- Demoted: —
- New gaps identified: see Key gaps; all tracked as features in `feature_list.json`.
- Gaps closed: —
