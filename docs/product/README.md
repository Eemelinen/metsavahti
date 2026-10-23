# Product specification

The target product, written before implementation (2026-09-06) and imported into
`feature_list.json` ticket by ticket (`pnpm harness:import-tickets`). Read in this order:

1. [01-technical-description.md](01-technical-description.md) — pipeline, data model, jobs, API, security, environments.
2. [03-pages.md](03-pages.md) — every route with auth level, data, components and required tests; [03b-ui-design-brief.md](03b-ui-design-brief.md) — the brief the designs in [../design/](../design/) were made from.
3. [04-delivery-plan.md](04-delivery-plan.md) — phases P0–P5 and epics E00–E12.
4. [05-conventions.md](05-conventions.md) — ticket-level definition of done on top of AGENTS.md.
5. [tickets/](tickets/) — one file per epic, one `### MV-NNN` heading per ticket. Feature `F-NNN` in `feature_list.json` is ticket `MV-NNN`; its `spec` field points at the heading.

**Status and precedence.** This is the plan, not a description of the code. Where it names a
stack version, a storage mechanism or a process that a recorded decision in
[../DECISIONS.md](../DECISIONS.md) settled differently, the decision wins; where it names
routes, pages, collections, fields, emails or copy, the spec wins and the code follows it.
Every known difference is listed once in [00-deviations.md](00-deviations.md) with its
resolution; a ticket that touches a listed line implements the resolution, not the original
text. When you find a new difference, add a row there in the same commit.

The stack itself is documented in [../TECH_STACK.md](../TECH_STACK.md) (the earlier
`02-tech-stack.md` was a copy of it and was removed).
