# Commands, index maintenance, token observation

## Verification (narrow first, full before "done")

| Step | Command | Note |
|---|---|---|
| one test file | `npx vitest run src/<dir>/<file>.test.ts` | first thing after an edit |
| types | `npx tsc --noEmit` | only when types are in play |
| lint | `npm run lint` | `eslint . --max-warnings 0` |
| specs | `npm run spec:validate` | after editing `openspec/` |
| the gate | `npm run verify` | spec → lint → typecheck → tests, < 1 min, Node only. Required before any completion claim; quote its last lines. Run it alone, not in a pipe with `head`. |
| migration | `npm run db:generate` | from `src/db/schema.ts`; committed migrations are immutable |
| emulator | `scripts/android.sh up|shot|reset|logs` | smoke tests; never part of verify |

Noisy output: on success `... | tail -n 15` is enough; on failure read the full failure
block and stack before deciding what to omit. `set -o pipefail` semantics matter: never put
`verify` behind `head`.

## codedb-mcp

- Server: `scripts/codedb-mcp.sh` (registered in `.mcp.json` for Claude Code and
  `.codex/config.toml` for Codex). Config: `.codedb-mcp/codedb-mcp.toml`; index data next to
  it, gitignored.
- Scope: `ts, tsx, js, mjs, cjs` under the repo root, `.gitignore` respected, plus explicit
  exclusion of `.claude/worktrees`, `drizzle/`, `docs/`, `brag-output/`, `scripts/icon/`,
  `android/`, `ios/`, `node_modules`, `.expo`, `.cache`, `dist`, `coverage`. Kotlin is not a
  supported grammar.
- Refresh: automatic. The server watches the tree and applies changes every 5 s; editing the
  scan scope in the TOML triggers one background full reindex. Manual rebuild / status:

```bash
~/.local/bin/codedb-mcp --config .codedb-mcp/codedb-mcp.toml index .
~/.local/bin/codedb-mcp --config .codedb-mcp/codedb-mcp.toml --root . tool codedb_status '{}'
```

- Build (no macOS release exists; Rust via Homebrew):

```bash
brew install rust && git clone --depth 1 https://github.com/killop/codedb-mcp ~/.local/src/codedb-mcp && cd ~/.local/src/codedb-mcp && cargo build --release && install -m 755 target/release/codebase-mcp ~/.local/bin/codedb-mcp
```

- First use in Claude Code: `.mcp.json` servers wait as "Pending approval" until approved
  once in an interactive `claude` session (`claude mcp list` shows the state). Codex reads
  `.codex/config.toml` in this trusted checkout and lists `codedb-mcp` at once.

### What the index proves and what it does not (measured 2026-09-22)

| Question | Graph result vs. truth | Use |
|---|---|---|
| callers of `syncPorts` | `CALLS` 2 of 5 sites, `REFERENCES` 3 of 5; the misses sit inside anonymous callbacks (`defineTask`, `useEffect`) | graph first, then one `rg "syncPorts\("` |
| callees of `startSync` | 9 of 9 named callees, including the cross-module hop into `coordinator.syncLinkedAccounts` | graph |
| `syncLinkedAccounts` → `syncOneAccount` | 0 (the call is inside a closure) | `codedb_symbol` body or `rg` |
| files depending on `transactions-repo.ts` | `DEPENDS_ON` 14 (type/class identifier references only, never `import` lines); symbol `REFERENCES` 21 files | `rg "db/transactions-repo'"` for import-level impact |
| "which month an imported transaction lands in" (no symbol name) | `codedb_search` ranked `saldo/interpret.instantOf`, `coordinator.syncOneAccount`, `domain/transaction.isoDate` in the top 5; the actual decision (`dateOf` in `syncPorts`) needed the doc comment, i.e. a read | search → outline → symbol; keep `rg` for Ukrainian words |
| watcher | add/delete of a file visible in `codedb_status` and `codedb_symbol` within 5 s | nothing to do |

Index size: 471 files, 2 161 symbols, 500 file edges, cold build < 0.2 s, so a manual
`index .` is always cheap when freshness is in doubt.

### Query patterns that work here

```cypher
-- who calls a function
MATCH (t:Symbol {name:'composeProgress'})<-[c:CALLS]-(caller:Symbol)
RETURN caller.path, caller.name, c.line
-- what a file depends on / who depends on it
MATCH (f:File)-[:DEPENDS_ON]->(d:File) WHERE f.path='src/monobank/coordinator.ts' RETURN d.path
MATCH (d:File)-[:DEPENDS_ON]->(f:File) WHERE f.path='src/db/transactions-repo.ts' RETURN d.path
-- call path between two symbols
MATCH SHORTEST p=(a:Symbol)-[:CALLS*1..6]->(b:Symbol) WHERE a.name='startSync' AND b.name='fetchStatement' RETURN p
-- symbols by name fragment (use codedb_outline once the file is known)
MATCH (s:Symbol) WHERE s.name CONTAINS 'Reminder' RETURN s.name, s.path, s.kind LIMIT 30
```

## Token observation (diagnostic only)

Codex transcripts for this repo can be measured with the observer bundled in codedb-mcp:

```bash
node ~/.local/src/codedb-mcp/skills/codedb-mcp/scripts/codex-observe.mjs --project "$PWD" --since 7d --top 12
```

Add `--json > .codedb-mcp/observe-<date>.json` to keep a snapshot. Baseline captured
2026-09-22 over 30 days (14 Codex sessions, before codedb-mcp existed):
`.codedb-mcp/observe-baseline-2026-09-22.json` — model input 2.22 M tokens, cached input
56.3 M, output 224 k, zero codedb calls. Compare a future window against it by the same
metrics: cached-input growth per session, high-output calls, non-codedb shell/file lookups
after a codedb call, and repeated reads of unchanged files. The observer reads JSONL only and
changes nothing; it does not see Claude Code sessions (use `/explain-usage` there) and in
this Codex version it counts MCP/function outputs but not plain shell output.
