# Documentation index

Start here. Each document below is authoritative for exactly one thing; when two disagree,
the table says which one wins and where the disagreement is recorded.

| Question                                                                 | Read                                                                                          | Authority                                                                                                             |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| How do I work in this repo as an agent or human?                         | [AGENTS.md](../AGENTS.md) (router), [CLAUDE.md](../CLAUDE.md) (Claude Code wiring)            | The operating manual. Constraints carry `why:` and `source:`.                                                         |
| What is done, what is next?                                              | [PROGRESS.md](../PROGRESS.md), [feature_list.json](../feature_list.json)                      | State files; the loop reads only these. Change them through `pnpm harness:*`.                                         |
| What should the product do?                                              | [product/](product/) — technical description, pages, design brief, delivery plan, tickets     | **Target product spec.** Wins for routes, pages, collections, fields, emails, copy.                                   |
| Where does the spec deviate from what is built?                          | [product/00-deviations.md](product/00-deviations.md)                                          | The single conflict ledger. A ticket that implements a deviating line follows the ledger, not the original spec text. |
| Why was an architecture choice made?                                     | [DECISIONS.md](DECISIONS.md) (D-001 …)                                                        | **Wins over the spec for architecture** (framework versions, geometry storage, migrations, harness).                  |
| What is the code layout and its boundary rules?                          | [../src/ARCHITECTURE.md](../src/ARCHITECTURE.md)                                              | Module map for `src/`; the `MUST` rules in AGENTS.md cite it.                                                         |
| Which stack is installed, and how does it differ from the original spec? | [TECH_STACK.md](TECH_STACK.md)                                                                | Original setup spec plus the status table of deviations. Planned-but-uninstalled services are listed there.           |
| How do the tests work?                                                   | [../tests/README.md](../tests/README.md)                                                      | Suites, environments, fixtures.                                                                                       |
| What does it look like?                                                  | [design/](design/) — Claude Design artboards, `tokens.js`, `design-map.json`, styling rules   | Visual source of truth; `design-map.json` links every ticket to its artboard; the tokens are the Tailwind theme.      |
| How does the agent harness and the automated loop work?                  | [harness/README.md](harness/README.md), then `harness/` (checklist, rubric, handoff, quality) | Explains the parts, the flow, the safeguards and how to run `pnpm harness:loop`.                                      |

Conventions for this folder: files are Markdown, English, Prettier-formatted (`pnpm format`).
Relative links must resolve from the file's own directory (`pnpm check` does not verify links;
the reviewer does). A new document gets a row here in the same commit.
