#!/usr/bin/env bash
# Starts the codedb-mcp server for this checkout (stdio). Both agents call this one script:
# Claude Code through .mcp.json, Codex through .codex/config.toml. The binary is built from
# https://github.com/killop/codedb-mcp (Rust, no macOS release) and installed as
# ~/.local/bin/codedb-mcp; .agents/skills/repo-code-navigation/references/verification.md
# has the build steps. Extra arguments (e.g. --no-watch) are passed through before `mcp`.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BIN="${CODEDB_MCP_BIN:-}"
if [ -z "$BIN" ]; then
  for candidate in "$HOME/.local/bin/codedb-mcp" "$(command -v codedb-mcp 2>/dev/null || true)" "$(command -v codebase-mcp 2>/dev/null || true)"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then BIN="$candidate"; break; fi
  done
fi
if [ -z "$BIN" ]; then
  echo "codedb-mcp binary not found; see .agents/skills/repo-code-navigation/references/verification.md" >&2
  exit 127
fi
exec "$BIN" --config "$ROOT/.codedb-mcp/codedb-mcp.toml" "$@" mcp "$ROOT"
