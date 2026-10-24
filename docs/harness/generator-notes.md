- Before implementing, read the `spec` section `pnpm harness:feature show` names and every `design`
  artboard it lists (open the `.dc.html` file and read the route or screen it names). The
  design-system rule in AGENTS.md applies to every page.
- Record a deviation from the spec in `docs/product/00-deviations.md`.
- Never run `pnpm db:up`, `pnpm db:down` or `docker compose …`: the Docker services are already
  running for the whole loop.
- Never launch the `harness:evaluator` agent yourself, and never wait for one: the driver runs the
  evaluator in its own session after yours ends and hands its findings to the next attempt. A
  self-run review duplicates that cost and keeps the session idle.
