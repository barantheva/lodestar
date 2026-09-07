# Code Review: `session-memory.ts` + Knowledge Backends

**Status: all 5 findings fixed.** Suite now 94/94 passing (`bun test`), no type errors (`tsc --noEmit`). Findings below kept as-written (historical record); see the end of each for what changed.

Review scope: `src/plugins/memory/session-memory.ts`, `src/plugins/memory/session-memory.test.ts`, and the two `KnowledgeBackend` implementations it depends on (`src/services/memory-service/loadstonenexus-backend.ts`, `obsidian-backend.ts`). Findings ranked most-severe first.

---

## 1. Obsidian backend loses any record whose id contains `/` — CONFIRMED

**Where**: `src/services/memory-service/obsidian-backend.ts:85` (`retrieve_knowledge`), triggered by `persist_knowledge`'s write path (line ~39).

`ObsidianBackend.retrieve_knowledge` does a single-level `fs.readdir` of the collection directory. `persist_knowledge` writes to `${id}.json` inside that same directory without sanitizing `id` — an id containing `/` becomes an extra directory level the flat `readdir` never descends into.

**Failure scenario**: `SessionMemory.updateMemoryBank('apache/casbin-gateway', 'activeContext', 'x')` calls `persist_knowledge('memory-banks', {id: 'apache/casbin-gateway', ...})`, which writes to `<vault>/knowledge/memory-banks/apache/casbin-gateway.json` (`path.join` treats the slash as a separator). `retrieve_knowledge('memory-banks')` then does `fs.readdir('<vault>/knowledge/memory-banks')` and gets back `['apache']` — a directory, filtered out by the `.endsWith('.json')` check. The actual file is invisible. `getMemoryBank('apache/casbin-gateway')` silently returns `{}` forever on the Obsidian backend, even though the write succeeded.

Not an edge case: `owner/repo` is the standard repo-identifier format used everywhere else in this project (`GITHUB_REPO`, `mock-ui.html`, docs) — any real repo name breaks this path.

---

## 2. Unsynchronized read-modify-write loses concurrent updates — CONFIRMED

**Where**: `src/plugins/memory/session-memory.ts:23` (`updateMemoryBank`).

`updateMemoryBank` does an unsynchronized read-modify-write (`getMemoryBank` then `persist_knowledge`) with no lock or transaction, so two concurrent updates to the same repo's memory bank can lose one write.

**Failure scenario**: two workers both handling tracks against the same repo call `updateMemoryBank(repo, 'activeContext', A)` and `updateMemoryBank(repo, 'progress', B)` at roughly the same time. Both read the same pre-update snapshot via `getMemoryBank`, then both write back a full merged object — whichever `persist_knowledge` call lands second overwrites the other's section change, silently dropping it. This system explicitly runs multiple concurrent named workers (`AGENT_COUNT`), so this isn't hypothetical concurrency, it's the normal operating mode.

---

## 3. Empty-string memory-bank values round-trip as `undefined` — CONFIRMED

**Where**: `src/plugins/memory/session-memory.ts:52` (`getMemoryBank`).

`getMemoryBank` reconstructs each section with `(item.x as string) || undefined`, which coerces an intentionally-stored empty string to `undefined`, indistinguishable from "never set."

**Failure scenario**: `updateMemoryBank(repo, 'activeContext', '')` is called to deliberately clear a section (e.g. a track finished, clearing "what's in progress"). `getMemoryBank(repo)` reads it back as `activeContext: undefined` rather than `''` — any caller distinguishing "cleared" from "never touched" gets the wrong answer. Should be `??` instead of `||`.

---

## 4. `SessionMemory` tests never exercise the Obsidian backend — CONFIRMED

**Where**: `src/plugins/memory/session-memory.test.ts:14`.

The suite only instantiates `SessionMemory` against `LoadstoneNexusBackend`. `SessionMemory` is written against the shared `KnowledgeBackend` interface specifically so it works with either configured backend, but nothing here runs the same assertions against `ObsidianBackend`.

**Failure scenario**: the Obsidian id/path bug above (finding 1) exists entirely within the backend this test suite never exercises, so this suite is green while `KNOWLEDGE_BACKEND=obsidian` silently loses data. A shared test helper parametrized over both backend implementations would have caught it.

---

## 5. Stale "source of truth" comment; only SQLite is read — CONFIRMED (minor)

**Where**: `src/services/memory-service/loadstonenexus-backend.ts:93`.

The comment "Also persist as file for source of truth" is inaccurate — `retrieve_knowledge` only ever queries SQLite (line 106), so the JSON file mirror is currently write-only and not actually a read path for anything in this file.

**Failure scenario**: not a runtime bug, but misleading — a future reader may assume the markdown/JSON file under `$DATA_DIR/knowledge/` is authoritative and safe to hand-edit or rely on for recovery, when in fact SQLite is what every read in this class actually uses.

---

## Suggested fixes (not yet applied)

1. Sanitize/hash any id or collection segment before using it as a filesystem path in `ObsidianBackend` (or reject ids containing `/` at the `KnowledgeBackend` interface boundary so both backends agree on what's a legal id).
2. Give `updateMemoryBank` a single-round-trip upsert (e.g. a per-repo file lock, or push section updates through `persist_knowledge`'s `INSERT OR REPLACE` with a narrower per-section key) instead of read-then-write.
3. Swap `||` for `??` in `getMemoryBank`'s field reconstruction.
4. Parametrize `session-memory.test.ts` over both `LoadstoneNexusBackend` and `ObsidianBackend`.
5. Either start reading the JSON mirror in `LoadstoneNexusBackend.retrieve_knowledge` as a fallback, or fix the comment to say what the file is actually for (audit trail / manual inspection, not a read path).
