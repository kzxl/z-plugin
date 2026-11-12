# Changelog

## 1.9.0

- **One memory for every IDE**: z-brain now stores its database at `~/.z-plugin/brain.sqlite` (override with `ZBRAIN_DB_PATH` or `ZBRAIN_DATA_DIR`) instead of inside each host's plugin copy. Knowledge harvested in Qoder, ZCode or Antigravity is visible to all of them.
- **Automatic legacy adoption**: on first run the richest pre-1.9 database (own plugin data, ZCode, Antigravity or Qoder caches) is snapshotted with `VACUUM INTO` and linked into place; the source file is kept untouched. Disable with `ZBRAIN_ADOPT_LEGACY=0`.
- **Schema versioning**: `PRAGMA user_version` is stamped and a database written by a newer plugin is rejected instead of being silently mutated by an older host.
- **Database admin commands**: `z-brain db info` (path, schema, atoms, projects, legacy databases, spool), `db backup`, `db restore` (auto-backs up first) and `db import <file>` (deduplicated merge of atoms, file index, edit events and observations).
- **Higher write timeout**: `busy_timeout` raised to 8s so several hosts and hooks can share one database.

## 1.8.0

- **Pre-flight Brief**: `zbrain_impact(file, brief: true)`, `z-brain preflight <file>` and `observe.mjs preflight <file>` return a hard-capped (~300-token) pre-edit brief: 30-day churn with recent deltas, call-graph blast radius and God Nodes from the z-token symbol cache, co-edited files from the same sessions, impacted test files, verified gotchas, and the matching z-mind invariant.
- **Graceful degradation**: a missing symbol cache, missing z-token/z-mind install, unreadable file or empty history shortens the brief instead of failing. `budget` is clamped to 60–800 tokens.
- **Async MCP dispatch**: `tools/call` now awaits async handlers so pre-flight can lazily load optional engines without blocking other tool calls.

## 1.7.0

- **Dashboard Edit Activity panel**: edits today, tracked files, 7-day churn leaders, and latest edits with operation, tool and line deltas, read directly from SQLite with zero daemon and zero context cost.
- **Token-capped history output**: `zbrain_history` and `observe history` default to 12 events, `zbrain_changes` to 10, `zbrain_impact` to 6; only the newest two events include a two-line patch preview, with an explicit truncation footer.
- **Token-capped summaries**: timeline and file-knowledge views clip long titles, summaries and gotcha text, and cap listed files, so retrieval answers stay compact.
- **Dashboard resilience**: databases without the new observer tables render the edit panel as empty instead of failing.

## 1.6.0

- **Automatic file-edit history**: new `file_events` table records every edit (path, operation, tool, line counts, redacted patch, session, workspace). Claude/ZCode hooks and the Codex/Qoder/Antigravity exporters feed it automatically.
- **Workspace file index**: new `file_index` table tracks path, mtime, size, hash, language and symbol count. A git-aware watcher plus a budgeted reconcile pass keep it current for hosts without hooks.
- **New MCP tools**: `zbrain_history`, `zbrain_changes` and `zbrain_impact` expose per-file edit history, recent workspace changes and dependency context.
- **No secrets in history**: `.env`, key files and lockfiles are ignored; API keys, tokens, passwords and connection strings are redacted before storage; patches are capped at 4 KB.
- **Resilient writes**: `busy_timeout`, 2-minute edit coalescing, no-op suppression, JSONL spool fallback, and daily retention (30-day patches, 365-day events).
- **Universal Agent Bridge**: `export codex` writes `AGENTS.md`, `.codex/config.toml` and `.codex/hooks.json`; `export qoder` deep-merges `.qoder/settings.json`; `export antigravity` merges a `z-brain` group in `.agents/hooks.json` and MCP config. Existing user configuration is preserved.
- **Qoder package**: ships the new observer libraries, so automation still works without host hooks via the MCP watcher and reconcile pass.

## 1.5.0

- **Qoder Desktop support**: `npm run package:qoder` builds a Qoder plugin ZIP (`.qoder-plugin/plugin.json`, `.mcp.json` with 5 MCP servers via `${QODER_PLUGIN_ROOT}`, 9 Qoder-adapted Skills).
- `npm run test:qoder` verifies the ZIP structure, runtime syntax, MCP handshake, tool listing and a basic tool call per server in an isolated environment.
- `Z_PLUGIN_WORKSPACE` overrides the workspace directory for packaged MCP servers.
- The Qoder package omits hooks, agents, commands, UI registration and the ERP DLC, and does not auto-load extensions from Antigravity/ZCode directories.

## 1.4.0

- **Prefix Cache Invariance (`R_CACHE`)**: Canonical rule and automated audit checks preventing volatile tokens (dynamic timestamps, random nonces, session GUIDs) from breaking LLM KV-cache.
- **Active Context Pruning (`R_ACP`)**: LSM-Tree multi-tier memory architecture (T1 Raw Active Window, T2 Frozen Blocks, T3 Cold Archive) with on-demand retrieval tools replacing blunt history truncation.
- **Z-Gate AST Linter**: Added `[P1] Cache Invalidation Trap Detection` into code reviewer engine to flag anti-patterns in C# and TypeScript codebases.
- **Z-Brain Generational Compaction**: Structured guidelines for distilling recurring atomic lessons into immutable canonical domain knowledge blocks.
- **Z-Token Prefix Preservation**: Standardized left-to-right deterministic prefix layout across all prompt templates and agent workflows.

## 0.7.0

- Rebrand: Renamed project from `token-diet` to `zero-token`.
- Universal Dual-Platform Support: Full native integration with **Google Antigravity 2.0** alongside **ZCode**.
- Universal Guard Adapter: `guard.mjs` normalizes and intercepts both ZCode (`Read`, `Bash`) and Antigravity 2.0 (`read_file`, `run_command`).
- Antigravity 2.0 Hook & Plugin Manifest: Shipped `plugins/zero-token/plugin.json`, `hooks/hooks.json` matcher for `read_file|run_command`, and always-on rules `rules/AGENTS.md`.
- Universal PowerShell Installer: `install.ps1` sets up NTFS Junctions for both `~/.gemini/config/plugins/zero-token` and `~/.zcode/plugins/zero-token` automatically.
- Unified Configuration & Ledger Storage: Default shared directory `~/.zero-token/`, environment variable `ZERO_TOKEN_*` with backwards compatibility fallback to `TOKEN_DIET_*`.

## 0.6.0

- Panel: Reload button and auto-refresh interval (off / 3s / 5s / 10s / 30s,
  remembered in localStorage). Refresh calls `diet({scope:"panel"})` through the
  MCP Apps bridge and re-renders in place.
- `diet scope=panel` returns structured metrics for the panel.
- Panel refreshes are not written to the ledger, so watching the dashboard does
  not inflate its own numbers.

## 0.5.4

- The panel now speaks the MCP Apps handshake: it sends `ui/initialize` to the
  host, waits for the response, then sends `ui/notifications/initialized` and a
  size notification. Without it the host timed out with
  "plugin-ui: ui/initialize handshake timed out".

## 0.5.3

- Panel redesign: headline tokens kept out of context with a per-file average;
  compact blocks/files/tool calls/tool output; labelled pattern denials instead
  of a meaningless 0; update time; the per-tool list removed as noise.
- Guard ignores heredoc bodies and quoted strings when matching shell patterns,
  so a commit message mentioning a patch log command is not blocked.

## 0.5.2

- The panel asks for inline display (`_meta.ui.showInline` and
  `preferredDisplayMode: "inline"`), so `/saved` renders it in the conversation
  instead of requiring the side panel to be opened manually.

## 0.5.1

- `diet({scope:"savings"})` returns MCP Apps metadata
  (`_meta["ui/resourceUri"]`), so the host can render the panel when `/saved`
  runs. The manifest surface alone did not surface in the side panel.

## 0.5.0

- Experimental MCP App panel (`ui://token-diet/panel.html`) declared through
  `ui.surfaces`: blocked calls, tokens kept out, tool calls and tool output for
  the last 24 hours. No conversation tokens; reopening refreshes it.
- The MCP server now advertises `resources` and implements `resources/list` and
  `resources/read`.

## 0.4.0

- Local savings ledger: every blocked call and MCP tool call is appended to
  `~/.zcode/token-diet/ledger.jsonl` (`TOKEN_DIET_DATA` overrides the directory),
  and `diet({scope:"savings"})` / `/saved` summarises it.
- Guard checks every path argument of `cat`/`type`, not only the last one.
- Minified files (`.min.js`, or >20 KB with almost no newlines) get a quarter of
  the read budget, so a 49 KB bundle is blocked like a large source file.
- Per-repository config at `<repo>/.token-diet.json`, merged over the user file.
- Search header reports "at least N matches" when the 8 KB output cap stopped the
  scan, instead of implying the exact count.
- New benchmarks: `repo-bench.mjs` (nine real repositories across C, C#, Go,
  PHP, TypeScript, Rust, Kotlin, Python) and `hook-bench.mjs` (hook latency).

## 0.3.0

- `search` honours `.gitignore` and caches the file list and decoded text
  between calls (`search.respectGitignore`, `search.cacheTtlMs`,
  `search.cacheMaxBytes`).
- UTF-16 without a BOM is detected from NUL-byte parity instead of being
  treated as binary.
- New `run` tool: build/test/lint for npm/pnpm/yarn, cargo, go, maven, gradle,
  make and pytest, with per-ecosystem error extraction and `dryRun`.
- Tests: gitignore rules, UTF-16 without BOM, cache behaviour, ecosystem
  detection, command planning and log compaction (tsc, rustc, go, pytest, npm,
  maven, gradle).

## 0.2.1

- `outline` also recognises unmodified class and object methods in JS/TS
  (`run() {`, `async load(): Promise<void> {`), which 0.2.0 missed.

## 0.2.0

- Guard checks the value of `limit`, not just its presence: `limit=99999` on a
  large file is blocked like a full read (`guard.read.maxLimitLines`, default 400).
- Guard also blocks `rg` without a cap, `findstr /s` without `/m`, and
  PowerShell `[IO.File]::ReadAllText` on large files.
- Build parser no longer drops code-less errors (`error : ...`), deduplicates
  identical error lines with a count, and shows the log tail when a failed build
  produced no recognizable error line. Spawn failures are reported instead of
  producing a misleading empty summary.
- `search` is language-agnostic: no extension allowlist by default, binary
  files and NUL bytes are skipped, and an optional `search.extensions` filter
  can be set. UTF-16BE/LE sources are decoded instead of mangled.
- `outline` recognises declarations in C-family, JS/TS, Python, Ruby, PHP, Go,
  Rust, Swift/Kotlin, Scala, Dart, shell, Lua, Perl and SQL.
- User-level config override at `~/.zcode/token-diet.config.json` (or
  `$TOKEN_DIET_CONFIG`) survives plugin updates.
- New regression tests: `npm test` covers guard branches, config override,
  loop breaker, multi-language outline and UTF-16 search.

## 0.1.2

- `build` tool picks its toolchain from project style: legacy .NET Framework
  (`ToolsVersion`, `TargetFrameworkVersion`, msbuild 2003 xmlns) runs MSBuild.exe,
  SDK-style projects run `dotnet build`.
- MSBuild discovery: `build.msbuildPath`, then VS 2019 Build Tools, then Visual
  Studio 2022/18 installs, then `vswhere`.
- New `build` parameters: `toolchain`, `configuration`, `platform`, `timeoutMs`.
  The configured platform applies to the MSBuild path only.
- Guard message for oversized reads now includes a Bash fallback for agents that
  have no MCP tools.
- Agent references use the namespaced form `token-diet:scout`.
- MCP server reports its version from the manifest instead of a hardcoded string.

## 0.1.1

- Documentation fixes: namespaced agent name, branch-aware build rules.

## 0.1.0

- First working version: MCP tools `outline`, `search`, `build`, `diet`; `scout`
  agent; PreToolUse guard and PostToolUse loop breaker; `token-diet` skill;
  `/build` and `/diet` commands; local dev marketplace.
