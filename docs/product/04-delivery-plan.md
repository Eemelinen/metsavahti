# 04 — Delivery Plan

## Phases

| Phase                      | Goal                                                      | Epics         | Exit criterion                                                                  |
| -------------------------- | --------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------- |
| **P0 Foundation**          | Repo runs, DB with PostGIS, CI green, test harness exists | E00           | `pnpm test:unit`, `test:integration`, `test:e2e` all pass on an empty app in CI |
| **P1 Data core**           | We can fetch, store, match and detect changes             | E01, E02      | Integration test: fake WFS → alerts created, second run creates none            |
| **P2 Accounts**            | Users can register, verify, log in, manage account        | E03, E04      | E2E: register → verify → login → change password                                |
| **P3 Product**             | Watch areas, map, alerts, notifications end to end        | E05, E06, E07 | E2E: create area → run pipeline → alert in feed → email in Mailpit              |
| **P4 Compliance & public** | Legal pages, consent, GDPR self-service, marketing site   | E08, E09, E10 | Privacy/terms/cookies live, export + delete work, axe passes                    |
| **P5 Launch**              | Ops, observability, deployment, hardening                 | E11, E12      | Production deploy with cron, monitoring, runbook                                |

## Epics and tickets

| Epic | Name                                     | Tickets       | Depends on              | Parallelisable with               |
| ---- | ---------------------------------------- | ------------- | ----------------------- | --------------------------------- |
| E00  | Bootstrap & tooling                      | MV-001…MV-012 | —                       | nothing (run first, single agent) |
| E01  | WFS client & geo library                 | MV-020…MV-029 | E00                     | E02, E03                          |
| E02  | Data model & migrations                  | MV-030…MV-037 | E00                     | E01, E03                          |
| E03  | Authentication                           | MV-040…MV-049 | E00                     | E01, E02                          |
| E04  | Account & settings                       | MV-050…MV-057 | E03                     | E05                               |
| E05  | Watch areas (CRUD + map)                 | MV-060…MV-069 | E02, E03, E01 (preview) | E04, E06                          |
| E06  | Pipeline jobs (fetch/match/notify)       | MV-070…MV-079 | E01, E02                | E05 UI work                       |
| E07  | Alerts feed & emails                     | MV-080…MV-087 | E05, E06                | E08                               |
| E08  | Consent, legal pages & GDPR self-service | MV-090…MV-099 | E03, E04                | E07, E09                          |
| E09  | Marketing site                           | MV-100…MV-105 | E00 (design tokens)     | anything                          |
| E10  | Accessibility & i18n hardening           | MV-110…MV-114 | E05, E07, E08, E09      | E11                               |
| E11  | Ops: deployment, cron, observability     | MV-120…MV-127 | E06                     | E10                               |
| E12  | Hardening, load & launch checklist       | MV-130…MV-135 | all                     | —                                 |

## Dependency graph

```
E00 ──┬── E01 ──┐
      ├── E02 ──┼── E06 ──┬── E07 ──┐
      ├── E03 ──┼── E05 ──┘         ├── E10 ── E12
      │         └── E04 ── E08 ─────┤
      └── E09 ──────────────────────┤
                E11 (after E06) ────┘
```

## Suggested swarm schedule (4–6 agents)

| Wave | Agents | Work                                                              |
| ---- | ------ | ----------------------------------------------------------------- |
| 1    | 1      | E00 entirely (sequential tickets, tight coupling)                 |
| 2    | 3      | E01 · E02 · E03 in parallel; E09 can take a 4th agent             |
| 3    | 3–4    | E06 (needs E01+E02) · E05 · E04                                   |
| 4    | 3      | E07 · E08 · E11 (E11 can start once E06 has `POST /api/jobs/run`) |
| 5    | 2      | E10 · remaining E11                                               |
| 6    | 1–2    | E12 launch checklist                                              |

Merge order inside an epic follows ticket numbers unless a ticket says otherwise. Tickets touching `payload.config.ts` or migrations should be merged one at a time to avoid migration conflicts (E02 owns migrations; other epics add migrations only via tickets that name the migration file).

Ticket numbers keep gaps: on 2026-09-20, 21 small or tightly coupled tickets were absorbed into their
neighbours ([00-deviations.md](00-deviations.md) P11) so that one driver-run session does one
meaningful unit of work. The ranges in the table are the epic's number space, not a count.

## Definition of "complete project"

All tickets in E00–E12 merged, CI green including nightly live contract test, production deployed with cron running, at least one real watch area receiving a real alert email, launch checklist (MV-135) signed off.
