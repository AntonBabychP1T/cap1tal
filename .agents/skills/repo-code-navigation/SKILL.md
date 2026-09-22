---
name: repo-code-navigation
description: >-
  How to find code in cap1tal cheaply and correctly before changing it. Applies to every
  implementation, debugging, refactoring, architecture, impact-analysis or "where is X"
  task. Graph (codedb-mcp) for orientation and relationships, exact source before any edit,
  native grep/read as fallback and verification.
---

# Code navigation in cap1tal

Graph → exact source → targeted test. Never the reverse. Token economy is secondary to
correctness: if more code could change the conclusion, retrieve it.

## Tools

| Need | Use |
|---|---|
| Orientation, communities, entry/boundary files, deps, callers, call paths, impact | `codedb_graph_query` (Cypher-like; patterns in [references/verification.md](references/verification.md)) |
| One definition with its body | `codedb_symbol` `body=true max_results=1` |
| What is in one file | `codedb_outline` (never `Read` a whole file to find one function) |
| One exact range | `codedb_read` |
| Index health, before trusting a negative result | `codedb_status` |
| Literal strings, Ukrainian labels, specs, docs, configs, `.kt`, `drizzle/`, anything the index does not cover | native `grep`/`rg`, `Glob`, `Read` |

The index covers `*.ts, *.tsx, *.js, *.mjs, *.cjs` outside generated/vendored dirs
([references/verification.md](references/verification.md) lists the scope). It is a map, not the
territory: no behaviour claim from graph metadata alone when the claim drives an edit.

## Policy

**A. Symbol or module known.** Query it in the graph; pull only the relationships the task
needs (callers for a signature change, callees for a behaviour question); then read the actual
implementation with `codedb_symbol`; widen only as evidence demands.

**B. Location unknown.** Start from the module map in
[references/modules.md](references/modules.md) and the spec name in `openspec/specs/`; then
`codedb_outline` on the one or two candidate files, or a narrow graph query
(`Symbol` by `name`, `File` by `path` prefix). Broad native search only when index evidence is
insufficient or the term is a UI string.

**C. Before editing behaviour**, have in context: the implementation; the port/interface it
implements when there is one (`src/platform/<x>.ts` for `<x>-device.ts`, `SyncPorts` etc.);
the direct callers if the change can reach them; the colocated `*.test.ts`; the governing
spec under `openspec/specs/<capability>/spec.md`.

**D. Avoid** recursive directory reads for orientation; whole-file reads to locate one
function; re-reading unchanged files already in context; broad `MATCH (s:Symbol)` scans when a
`name`/`path` predicate exists; dumping full `verify`/test output on success.

**E. Fall back to native search immediately** when the graph cannot be trusted here
(measured on this repo, see references/verification.md):
- File-level `DEPENDS_ON` edges come from *type/class identifier* references, not from
  `import` lines, so "which files import X" is a `rg "from '@/db/x'"` question. Symbol-level
  `CALLS`/`REFERENCES` do resolve across `@/` alias imports.
- A call inside an anonymous callback (`TaskManager.defineTask(..., async () => …)`,
  `useEffect`, array callbacks) has no named owner and is missed by caller queries. After a
  caller query, confirm with one `rg "<name>\("`.
- expo-router: screens under `src/app/` are routes by file path; nothing imports them.
  `router.push('/x')` strings → grep.
- Ports and adapters: `*-device.ts` is chosen at the call site (`src/hooks/*-ports.ts`,
  `src/app/_layout.tsx`); the graph shows the port type, not the runtime adapter.
- Repositories are factories closed over `db` (`src/db/repos.ts`); screens call the exported
  instances, so edges land on the instance names, not on the factory.
- Kotlin in `modules/`, SQL/`migrations.js` in `drizzle/`, Ukrainian UI labels, spec text.
- A negative graph result never proves "unused": check `codedb_status` freshness, then `rg`.

## Output hygiene

Narrowest check first: `npx vitest run <file>` before `npm run test`; `npx tsc --noEmit` only
when types are in play. On a failure read the whole failure block before trimming anything.
Full `npm run verify` before reporting done (project rule, quote its last lines). Pipe big
successful outputs through `tail`; never pipe a failing one through `head`.

References: [architecture.md](references/architecture.md) (layers, entry points, data flow),
[modules.md](references/modules.md) (dir → responsibility → spec),
[verification.md](references/verification.md) (commands, index refresh, token observer).
