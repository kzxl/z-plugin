# z-brain

Zero-overhead, 100% offline episodic knowledge engine and IDE plugin for autonomous AI coding agents (Antigravity 2.0 & ZCode).

It replaces remote PostgreSQL databases and background memory daemons with a pure local embedded SQLite WAL engine with FTS5 BM25 indexing.

## Components

| Component | What it does |
|---|---|
| MCP tool `zbrain_fetch` | Compact PRE-task context sweep delivering L0 1-line index (~30 tokens/atom) |
| MCP tool `zbrain_view` | On-demand L2 deep inspection of root causes, code fixes, and evidence |
| MCP tool `zbrain_harvest` | POST-task atomic lesson recording (`<problem> \| <cause> \| <fix>` or JSON) with smart deduplication |
| MCP tool `zbrain_query` | Multi-angle filtered search with project scope and trust levels |
| MCP tool `zbrain_status` | SQLite database statistics, atom counts, and engine status |
| MCP tools `zbrain_history`, `zbrain_changes`, `zbrain_impact` | Per-file edit history, recent workspace changes, and file impact context |
| MCP tool `zbrain_impact(..., brief: true)` | Hard-capped ~300-token pre-flight brief: churn, blast radius, co-edits, impacted tests, gotchas, invariant |
| Hook `harvest-advisor` | PostToolUse hook that prompts the agent to harvest lessons after successful test runs |
| CLI `scripts/cli.mjs` | Standalone CLI facade for terminal workflows (`status`, `fetch`, `view`, `harvest`, `preflight`, `db`) |
| Skill `z-brain` | Teaches agents to perform progressive disclosure sweeps before writing code |
| Rules `rules/z-brain-rules.md` | Universal invariant rules for episodic memory management |
| Database `~/.z-plugin/brain.sqlite` | One WAL-mode SQLite database per user (FTS5 + triggers), shared by every IDE; override with `ZBRAIN_DB_PATH` |

## Architecture & Storage

- **Storage Backend**: Embedded `node:sqlite` (Node.js 22+ native synchronous binding).
- **Zero Server**: No PostgreSQL, no Docker, no background memory daemon running.
- **Shared Location**: The database lives at `~/.z-plugin/brain.sqlite` (`ZBRAIN_DATA_DIR` / `ZBRAIN_DB_PATH` override it), so lessons learned in Qoder, ZCode or Antigravity are visible everywhere. On first run the richest pre-1.9 database is adopted automatically (`ZBRAIN_ADOPT_LEGACY=0` disables it) and the old file is kept untouched.
- **Schema Gate**: `PRAGMA user_version` is stamped; a database written by a newer plugin is rejected instead of being mutated by an older host.
- **Concurrency**: `PRAGMA journal_mode = WAL`, `synchronous = NORMAL` and an 8s `busy_timeout` for non-blocking concurrent reads and writes across hosts and hooks. Writes run in batched `BEGIN IMMEDIATE` transactions and retry `SQLITE_BUSY` with exponential jitter.
- **Leader Lease**: per-workspace watcher and reconcile run under a 90s lease in `observer_meta`, so only one host scans while every host keeps recording hook edits.
- **Stable Project Identity**: `project_registry` maps each workspace root to a `project_id`, preferring the git origin so clones share history and folder renames or same-named repositories do not collide. Legacy basename ids are retained.
- **Incremental Reconcile**: steady-state passes use `git status` plus an index-vs-listing diff; a moved `HEAD`, a non-git workspace or a 10-minute safety window trigger a full sweep.
- **FTS Engine**: SQLite FTS5 with BM25 ranking and automatic triggers keeping index in sync with `knowledge_atoms`.

## Smart Episodic Features

1. **Auto Project Scoping**: `project_registry` resolves each workspace from its git origin and path, keeping legacy `erp`, `zero_universe` and `z-plugin` ids, so history stays stable without manual flags.
2. **Smart Deduplication & Upsert**: When harvesting lessons with identical or near-identical problem definitions, `z-brain` updates and enriches the existing record instead of inserting redundant rows.
3. **Post-Test Harvest Hook**: Monitors test execution tools and reminds agents to capture verified solutions when tests transition to green.

## Progressive Disclosure (L0 vs L2)

To prevent blowing the conversation context window:
1. **L0 Index (`zbrain_fetch`)**: Outputs compact 1-line signatures (`[#ID] Problem › Gotcha/Fix`) at only ~30–50 tokens per atom.
2. **L2 Deep View (`zbrain_view`)**: Agent explicitly calls this only when deep implementation details, code snippets, or historical provenance are needed.

## CLI Usage

```bash
# Check status
node scripts/cli.mjs status

# Fetch context for a task
node scripts/cli.mjs fetch "Fix database deadlock during inventory sync"

# Inspect specific atom
node scripts/cli.mjs view 4362

# Harvest new lesson
node scripts/cli.mjs harvest "Deadlock on RefInId | Missing composite index | Added composite index"

# Pre-edit brief (churn, blast radius, gotchas, invariant)
node scripts/cli.mjs preflight src/OrderService.cs

# Inspect the shared database and adopt an older copy
node scripts/cli.mjs db info
node scripts/cli.mjs db import "C:/Users/me/.zcode/plugins/z-brain/data/zbrain.sqlite"

# Snapshot and roll back
node scripts/cli.mjs db backup
node scripts/cli.mjs db restore "$HOME/.z-plugin/backups/zbrain-2026-11-12T08-00-00.sqlite"
```
