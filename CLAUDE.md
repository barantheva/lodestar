# CLAUDE.md

Project rules for any agent (Claude Code or otherwise) working in this repo. Full detail lives in `README.md`/`impl.md`/`architecture.md` — this file is the enforced summary, not a duplicate.

## Status
Design + a static dashboard mock (`mock-ui.html`), zero implementation. Read `README.md` first for the map of every doc; don't start writing `src/` code without checking `impl.md` §3 for which phase you're in and its done-when check.

## Non-negotiable architectural rules
1. **Layered dependency direction**: `features/*/ui` → `features/*/use-cases` → `services/*` → `data-access/*`/`adapters/*`. Never skip a layer, never reverse it. (`impl.md` §1a)
2. **No cross-feature imports.** A feature reacting to another feature's event subscribes via `core/event-bus.ts` — never imports another feature's `use-cases/`/`ui/` directly.
3. **`shared/` and `core/` are leaves.** They never import from `features/` or `services/`.
4. **Knowledge backend is one contract, two implementations** (`loadstonenexus`/`obsidian`, `KNOWLEDGE_BACKEND` env var). Never special-case a backend outside `services/memory-service/`.
5. **Fleet DB (instance-local) vs. knowledge backend (project knowledge) is a hard boundary** — never let one leak into the other.
6. **Guard 1 and Guard 3 are structural, not configurable off.** `TEAM_MODE`/`ALLOW_AUTONOMOUS_INCIDENT_DECLARATION` change *who signs* / *whether Guard 1 can be reached autonomously*, never whether a Guard runs.
7. **`mock-ui.html` is the dashboard's executable spec.** A dashboard screen isn't done until it matches the mock's markup/components and reads real data (`impl.md` §4).
8. **Release tags/changelog filenames are always derived** (`dd-mm-yyyy-<short SHA>` / `change-log-<tag>.md`), never hand-typed (`architecture.md` §10).

## Coding conventions
- kebab-case filenames, PascalCase types, camelCase functions/vars, `SCREAMING_SNAKE_CASE` env vars.
- One export focus per file.
- **Comments: default to none.** When warranted (non-obvious business rule, workaround, surprising decision), max 3 lines, explain *why* not *what*. Doesn't apply to `.md` files; never strip a required license header or tool directive (`// eslint-disable`, `@ts-expect-error`, etc).
- No speculative abstractions — build what the current `impl.md` phase needs, nothing ahead of it.
- Tests co-located: `<name>.test.ts` next to the file it tests, run via `bun test`. Cross-feature E2E tests live in top-level `e2e/`.

## Known open decisions
- All initial design gaps (spec directory convention, analyst/lead dashboard UI, OpenAI adapter, and campaign setup screen) are resolved per `impl.md` §6.

## When docs and this file disagree
Docs (`architecture.md`, `plan.md`, `screen-list.md`) are edited concurrently and are the source of truth for design intent — if this file drifts from them, trust the docs and flag the drift rather than the reverse.
