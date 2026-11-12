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
| CLI `scripts/cli.mjs` | Standalone CLI facade for terminal workflows (`status`, `fetch`, `view`, `harvest`) |
| Skill `z-brain` | Teaches agents to perform progressive disclosure sweeps before writing code |
| Rules `rules/z-brain-rules.md` | Universal invariant rules for episodic memory management |
| Database `data/zbrain.sqlite` | WAL-mode SQLite database with FTS5 virtual table and synchronization triggers |

## Architecture & Storage

- **Storage Backend**: Embedded `node:sqlite` (Node.js 22+ native synchronous binding).
- **Zero Server**: No PostgreSQL, no Docker, no background memory daemon running.
- **Concurrency**: `PRAGMA journal_mode = WAL` and `PRAGMA synchronous = NORMAL` for non-blocking concurrent reads and writes across Antigravity and ZCode.
- **FTS Engine**: SQLite FTS5 with BM25 ranking and automatic triggers keeping index in sync with `knowledge_atoms`.

## Smart Episodic Features

1. **Auto Project Scoping**: Automatically detects git repository identity (`erp`, `zero_universe`, `z-plugin`) to scope queries and lessons without manual flags.
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
```
