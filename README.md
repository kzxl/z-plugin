# 🔌 z-plugin — The Context-Saving & Quality Engine for AI Coding Agents

[![Version](https://img.shields.io/badge/version-1.11.0-blue.svg)](package.json)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js%2022+-339933?logo=node.js)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Cursor%20%7C%20Claude%20Code%20%7C%20Antigravity%20%7C%20ZCode%20%7C%20Qoder%20%7C%20Windsurf-FF6F00)](https://github.com/kzxl/z-plugin)
[![Protocol](https://img.shields.io/badge/Protocol-MCP%20JSON--RPC%202.0-8A2BE2)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/Tests-30%20passing%20%7C%20660%2B%20assertions-brightgreen)](package.json)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub stars](https://img.shields.io/github/stars/kzxl/z-plugin?style=social)](https://github.com/kzxl/z-plugin/stargazers)

[Tiếng Việt](README.vi.md) · [English](README.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)

> **Stop burning tokens, prevent breaking code regressions, and ban AI code slop.**  
> `z-plugin` is a lightweight, zero-dependency engineering toolkit and MCP server suite that turns **Cursor**, **Claude Code**, **Google Antigravity**, **ZCode**, **Qoder**, and **Windsurf** into disciplined senior engineers.

---

## ⚡ 30-Second Quick Start

No cloning or manual configuration required. Run directly in your project root:

```bash
# Set up Cursor (.cursorrules + .cursor/mcp.json)
npx @kzxl/z-plugin init cursor

# Or set up Claude Code (CLAUDE.md + .claude_mcp.json)
npx @kzxl/z-plugin init claude

# Or set up all supported AI agents at once (Cursor, Claude, Windsurf, Copilot, Cline)
npx @kzxl/z-plugin init all

# Run the AEOS Cognitive Router & unified multi-plugin pre-flight brief
npx @kzxl/z-plugin route "Fix stock transfer deadlock" --file src/StockService.cs

# Audit staged/unstaged changes (Security, NEV, Canonical Anti-Slop, Gotchas)
npx @kzxl/z-plugin review

# Lint UI files, git diff, or CSS token WCAG 2.1 AA contrast
npx @kzxl/z-plugin lint --diff
npx @kzxl/z-plugin lint --tokens src/styles/globals.css

# Run per-file pre-flight brief or workspace compliance doctor
npx @kzxl/z-plugin preflight src/OrderService.cs
npx @kzxl/z-plugin doctor

# Run the interactive visual capability demo
npx @kzxl/z-plugin demo

# Open the zero-daemon visual token telemetry & cost dashboard
npx @kzxl/z-plugin dashboard --open
```

For **Google Antigravity 2.0** and **ZCode**, synchronize all core plugins, native subagents, and MCP registrations:
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

For **Qoder Desktop**, download `z-plugin-qoder-<version>.zip` from the [latest release](https://github.com/kzxl/z-plugin/releases/latest) and import it through Qoder's Plugin installer (see [Qoder Desktop](#qoder-desktop)).

---

## 💥 Why `z-plugin`? (Before vs. After)

| Common AI Agent Pain Point | With `z-plugin` Active | Verified Impact |
| :--- | :--- | :---: |
| **Context Window Blowout:** Agent opens 5 large files or runs recursive `grep`, burning 40k–80k tokens per turn. | **AST Context Diet (`z-token`):** Extracts exact method signatures & targeted ranges; blocks oversized file reads. | **95.5% Token Saved** |
| **Hidden Regressions:** Refactoring method `A` silently breaks 6 distant services without the agent noticing. | **Sub-2ms Call-Graph (`z-token`):** Instant BFS traversal (`trace_path`) across interfaces and CQRS dispatchers. | **Zero Regressions** |
| **Silent Security Sinks:** Agent passes unsanitized user inputs straight into SQL queries or shell execs. | **Inter-Procedural Taint Engine (`z-gate`):** Traces data flow down to sensitive sinks with branch-guard detection. | **Taint Defense** |
| **AI Amnesia:** Repeating the exact same bug fix or gotcha explanation across different chat sessions. | **Episodic Memory Engine (`z-brain`):** Embedded SQLite WAL with hybrid BM25 + Trigram semantic recall. | **Continuous Learning** |
| **AI Slop & Gradients:** Agent generates random neon gradients, floaty shadows, and dead click handlers. | **Anti-Slop AST Linter (`z-craft`):** Enforces design tokens, clean enterprise surfaces, and a mandatory 4-state UX matrix. | **Craftsmanship $\ge$ 90/100** |

---

## 🧩 The 5 Core Superpowers

```
                    ┌──────────────────────────────────────────────┐
                    │      AI Coding Agent (Cursor / Claude / ...)  │
                    └──────────────────────┬───────────────────────┘
                                           │ MCP JSON-RPC / CLI
                    ┌──────────────────────▼───────────────────────┐
                    │          z-runtime (Cognitive Router)        │
                    └──────┬──────────┬──────────┬──────────┬──────┘
                           │          │          │          │
             ┌─────────────▼┐   ┌─────▼────────┐ │    ┌─────▼────────┐
             │   z-token    │   │   z-brain    │ │    │   z-craft    │
             │ Context Diet │   │ Episodic Mem │ │    │   Anti-Slop  │
             └──────────────┘   └──────────────┘ │    └──────────────┘
                                ┌────────────────▼───┐
                                │ z-mind  &  z-gate  │
                                │ Engineering Quality│
                                └────────────────────┘
```

### 1. 🛡️ `z-token` — Context Firewall & Call-Graph Engine
- **Token Protection:** Cuts context consumption by up to **95.5%** on large file inspections and **99.2%** on warning-heavy build logs.
- **Multiline AST Outline:** One-shot extraction of classes, interfaces, and methods with multiline C#/TypeScript signature folding across 16+ languages (`outline`).
- **Adaptive Sparse Search & Legacy Encoding:** Automatically trims context to 1 line when matches are sparse ($\le 10$) and falls back cleanly to `windows-1258` only when UTF-8 yields replacement chars on legacy ERP files.
- **Sub-2ms BFS Call-Graph:** Traces the shortest invocation path between any two symbols (`trace_path`) across polymorphic interfaces (`IService` ↔ `Service`) and MediatR/CQRS pipelines in $<1\text{ms}$.
- **Blast Radius & God Node Detection:** Identifies upstream dependents, downstream callees, and high-degree God Nodes before edits are made.

### 2. 🧠 `z-brain` — Episodic Memory & Semantic Gotchas
- **Persistent Knowledge:** Automatically saves and retrieves past debugging lessons, domain rules, and gotchas across chat sessions.
- **Cross-Lingual Hybrid Retrieval:** SQLite FTS5 BM25 combined with bilingual EN/VI engineering concept expansion and zero-dependency TF-IDF trigram cosine fallback (`100%` lexical Hit@1, `100%` paraphrase Recall@5, `p95 <= 1.26ms`).
- **Generational Compaction & Temporal Supersede (`zbrain_compact`):** Clusters recurring lessons ($\ge 3$) into canonical `verified_fact` blocks and marks superseded atoms (`superseded_by`) so stale gotchas stay out of default retrieval (`R_ACP`).
- **Progressive Disclosure:** Compact L0 index (~30 tokens/entry) for pre-task context sweep; fetches L2 detailed code fixes strictly on-demand.
- **Automatic Edit History:** Host hooks capture every file edit (tool, line counts, redacted patch) into `file_events`; a git-aware watcher and reconcile pass cover hosts without hooks, so no manual logging is needed.
- **Workspace File Index:** `file_index` tracks path, mtime, size, hash, language and symbol count; `zbrain_history`, `zbrain_changes` and `zbrain_impact` query what changed and what depends on it.
- **Pre-flight Brief:** `zbrain_impact(file, brief: true)` (or `z-brain preflight <file>`) returns a hard-capped ~300-token brief before an edit: 30-day churn, call-graph blast radius and God Nodes, co-edited files, impacted test files, past gotchas, and the matching `z-mind` invariant. Missing caches or plugins degrade gracefully.
- **One Memory, Every IDE:** the database lives at `~/.z-plugin/brain.sqlite` (override with `ZBRAIN_DB_PATH`), so knowledge harvested in Qoder, ZCode or Antigravity is shared. A pre-1.9 database is adopted automatically, `PRAGMA user_version` gates schema upgrades, and `z-brain db info|backup|restore|import` manages it.
- **Token-Capped Answers:** history views show the newest 10–12 events with at most two short patch previews, and timeline/file answers clip long summaries, so lookups stay cheap in context.
- **Async Write Queue:** Serializes concurrent SQLite write locks under multi-agent workloads with exponential backoff, with a JSONL spool fallback when the database is busy.

### 3. ⚖️ `z-mind` — Cognitive Framework & Live Orchestration
- **58+ Canonical Invariants:** Mechanically enforces SOLID (`R_CORE`), Test-Driven Development (`R_TDD`), Net Engineering Value (`R_NEV`), and Zero-Trust Empirical Proof (`R_PROOF`) with deduplicated Single Source of Truth (`AGENTS.md`) rules.
- **Live Cognitive Router (`zmind_route`):** Executes `z-runtime` `orchestrateTask()` in one call — classifying intent, budgeting tokens, and assembling matching invariants, `z-brain` gotchas, `z-token` blast radius, and `z-craft`/`z-gate` hints.
- **Autonomous 4-Tier Subagent Routing (`R_TEAM`):** Routes `scout` (`flash_lite`), parallel `self` coding workers (`flash`), and specialist `architect` / `investigator` / `reviewer` subagents (`pro` / `inherit`) under zero-collision file ownership contracts.
- **4-Phase Bugfix Diagnosis & Dynamic Rule Packs:** Structured root-cause isolation plus extensible domain rule packs (e.g., `dlc-erp`).

### 4. 🔍 `z-gate` — Asset Discovery, Taint Flow & Unified Pre-Commit Review
- **Codebase Asset Discovery (`R_REUSE`):** Scans existing utilities and extension methods to stop the agent from re-inventing existing helpers.
- **Inter-Procedural Taint Analysis (`trace_data_flow`):** Detects SQL injections, shell command executions, and path traversals with early-return guard awareness (`if return`, `ThrowIfNull`).
- **Unified Pre-Commit Diff Audit (`zgate_review`):** Catches wrapper hell (single-impl interfaces), sync-over-async deadlocks (`.Result`, `.Wait()`), production LOC bloat (excluding test files), cross-platform `dlc-erp` checks, and delegates UI diffs directly to `z-craft`'s canonical Anti-Slop linter.

### 5. ✨ `z-craft` — Canonical Anti-Slop Linter & UI Craftsmanship
- **Canonical Anti-AI-Slop Linter (`AS-01..AS-12`, `AS-C1..AS-C5`, `AS-I1`, `AS-S1`, `AS-D1..AS-D4`):** Enforces token discipline, flat surfaces, neutral elevation, one-shot compositor motion (`enterprise`/`expressive` GSAP allowlist), inline `anti-slop-ignore` suppressions, git `--diff` scoping, and **WCAG 2.1 AA CSS token contrast math** (`--tokens`).
- **Mandatory 4-State UX Matrix & Scaffolder (`zcraft_spec`, `zcraft_scaffold`):** Generates compliant Populated, Loading skeleton, Empty, and Error+Retry components across React/Tailwind, WPF XAML, and WinForms DevExpress.
- **Host-Aligned Interactive Previews & Real Topology Canvas (`zcraft_preview`, `z-plugin canvas`):** Renders Antigravity CSP-compliant (`gstatic` Tailwind + host CSS tokens + `<agent-embed>`) previews and force-directed SVG topology graphs from real indexed workspace symbols.
- **Vibe Time-Machine (`zcraft_checkpoint`):** 1-click snapshot checkpoints to safely experiment with UI redesigns without polluting Git history.

---

## 📦 Monorepo Modules & Extensions

| Component | Type | Version | Focus & Core Capabilities |
| :--- | :---: | :---: | :--- |
| [**`z-runtime`**](packages/z-runtime) | **Kernel** | `1.11.0` | **Core Micro-Kernel:** In-memory EventBus, Cross-Process Local IPC, <1ms Cognitive Router, Adaptive Token Budgeter, and <5ms Hot-Reload Manager. |
| [**`z-token`**](plugins/z-token) | **Plugin** | `1.11.0` | **Context Diet & Call-Graph:** Sub-2ms shortest-path BFS (`trace_path`), blast radius, AST outline, capped search, and lean build log filter. |
| [**`z-brain`**](plugins/z-brain) | **Plugin** | `1.11.0` | **Episodic Memory:** Embedded SQLite WAL, hybrid BM25 + Trigram search, code gotchas graph, async harvest queue, automatic edit history + workspace file index, token-capped pre-flight briefs, and one shared per-user database. |
| [**`z-mind`**](plugins/z-mind) | **Plugin** | `1.11.0` | **Cognitive OS & Invariants:** 58 canonical rules across 6 engineering pillars, 4-phase bug diagnosis, and Net Engineering Value refactor gate. |
| [**`z-gate`**](plugins/z-gate) | **Plugin** | `1.11.0` | **Safety & Review Gate:** Taint data-flow analysis, helper reuse discovery (`R_REUSE`), pre-commit diff audit, and Git PreToolUse hook. |
| [**`z-craft`**](plugins/z-craft) | **Plugin** | `1.11.0` | **UI Craftsmanship:** Anti-slop AST linter, 4-state UX micro-spec generator, interactive SVG topology canvas, and vibe time-machine. |
| [**`dlc-erp`**](extensions/dlc-erp) | **DLC** | `1.11.0` | **ERP Domain Extension:** Financial precision audits (`decimal` vs `double`), WMS handover validation, and SQL `UPDLOCK` enforcement. |

---

## 💻 Supported AI Agents & IDE Setup

### Cursor
Run `npx @kzxl/z-plugin init cursor`. This creates:
- `.cursorrules`: Instructs Cursor to follow `z-mind` engineering invariants and use token-saving tools.
- `.cursor/mcp.json`: Configures the MCP servers for `outline`, `search`, `trace_path`, `zbrain_fetch`, and `zgate_review`.

### Claude Code
Run `npx @kzxl/z-plugin init claude`. This creates:
- `CLAUDE.md`: Compact instructions and invariants for Claude Code CLI.
- `.claude_mcp.json`: MCP server endpoints.

### Google Antigravity 2.0 & ZCode
Run `powershell -ExecutionPolicy Bypass -File install.ps1`. This synchronizes all plugins to `~/.gemini/config/plugins/` (with native Antigravity subagent schemas) and `~/.zcode/plugins/` (automatically adapting subagent frontmatter for ZCode CLI), registers MCP servers, and activates `PreToolUse` / `PostToolUse` guards.

For a per-project Antigravity setup, run `node tools/agent-bridge.mjs export antigravity`. It merges (never overwrites) `.agents/hooks.json` under the `z-brain` group and registers MCP servers in `.agents/mcp_config.json`, so file edits are recorded automatically.

### Codex
Run `node tools/agent-bridge.mjs export codex`. This writes `AGENTS.md`, appends missing `[mcp_servers.z-*]` blocks to `.codex/config.toml` (existing tables are preserved), and installs `.codex/hooks.json` so `apply_patch` / file edits feed the z-brain observer.

### Qoder Desktop Project Hooks
The Qoder plugin package has no host hooks; z-brain automation still runs through the MCP server's watcher and git reconcile pass on first tool call. If you prefer project-level hooks, run `node tools/agent-bridge.mjs export qoder`. It deeply merges `.qoder/settings.json`, preserving existing `mcpServers` and hook groups.

### Qoder Desktop
Requires Node.js >=22.13 (with `node:sqlite`) and `node` on PATH. Build and verify the plugin ZIP:

```bash
npm run package:qoder
npm run test:qoder
```

This creates `dist/z-plugin-qoder-<version>.zip` (also attached to each GitHub Release). Import it through Qoder's Plugin installer. The package contains 5 MCP servers launched via `${QODER_PLUGIN_ROOT}` and 9 Qoder-adapted Skills. Tools work in the host process's current directory; set `Z_PLUGIN_WORKSPACE` to an absolute project path if Qoder does not start them in your workspace.

The Qoder package intentionally omits hooks, agents, commands, UI registration and the ERP DLC, and does not load extensions from Antigravity/ZCode directories. Do not use `install.ps1` for Qoder.

### Windsurf, Copilot, Cline, Codex, Qoder, Antigravity
Run `npx @kzxl/z-plugin init all` to scaffold Cursor, Claude Code, Windsurf, Cline, Copilot, Codex, Qoder and Antigravity in one step. Copilot receives instructions only (no MCP config). Continue and Roo Code are not yet supported.

---

## 📈 Zero-Daemon Visual Telemetry Dashboard

Inspect blocked context bloat, MCP tool efficiency (`Search` vs. `Symbol` ratio), permanent session context diet across both Antigravity (`~/.gemini/config`) and ZCode (`~/.zcode`), and `z-brain` SQLite FTS5 knowledge atoms without running a permanent background service (`0 MB` idle RAM):

```bash
# 1. Inside Antigravity / Claude / Cursor chat from ANY project (or no workspace):
/z-token dashboard

# 2. Global CLI from ANY folder on your machine (linked automatically by install.ps1):
z-plugin dashboard --open

# 3. Ephemeral local HTTP server (127.0.0.1) with live /api/metrics refresh (Ctrl+C to stop):
z-plugin dashboard --serve --open
```

Key dashboard capabilities:
- **Z-Brain Edit Activity:** Edits today, tracked files, 7-day churn leaders, and the latest file edits with operation and line deltas, read directly from SQLite with zero daemon and zero context cost.
- **Multi-Window Ledger Audit:** Toggle `24h`, `7d`, `30d`, and `All-Time` firewall blocks and compact tool call metrics from `~/.zero-token/ledger.jsonl`.
- **Frontier Model Cost & Cache Simulator:** Estimate compounded multi-turn USD savings and monthly session tax across **Gemini 4 Carbon**, **Gemini 4 Argon**, **Gemini 3.8 Flash**, and **Claude Fable 5.2** at `0%–95%` prefix cache hit rates.
- **4-State Anti-Slop UI (`100/100` `z-craft` Score):** Built with semantic host theme tokens and built-in `Populated`, `Loading`, `Empty`, and `Error` states.

---

## 📊 Real-World Empirical Benchmarks

*Measured on enterprise C# (.NET Framework & SDK-style) and TypeScript production codebases.*

| Scenario | Raw Agent (Before) | With `z-plugin` (After) | Token Savings |
| :--- | ---:| ---:| :---: |
| Inspecting 1 large service class (full read) | 38,749 tokens | 1,761 tokens (`outline`) | **95.5%** |
| Searching a symbol across repo (`grep -rn`) | 9,218 tokens | 1,698 tokens (`search`) | **81.6%** |
| Build log with multiple warnings | 55,783 tokens | 461 tokens (`build`) | **99.2%** |
| Real 59-project .NET Framework MSBuild solution | 27,258 tokens | 2,104 tokens | **92.3%** |
| Multi-hop Call-Path Traversal (`trace_path`) | Minutes of manual file browsing | **0.97 ms** (BFS cache) | **Instant** |

---

## 🧪 Testing & Empirical Verification (`R_PROOF`)

All modules are backed by rigorous automated test suites adhering to Level 3+ empirical verification:

```bash
# Check syntax across all packages & plugins
npm run check

# Run all 30 test suites (660+ passing assertions)
npm test

# Build and verify the Qoder plugin ZIP
npm run package:qoder
npm run test:qoder

# Run MCP server smoke tests
npm run smoke

# Run token-diet benchmark measurements
npm run bench

# Measure z-brain retrieval quality (generates bench/RETRIEVAL.md with --report)
npm run eval:retrieval

# Measure latency and empty-result rate on the real database
npm run eval:retrieval:live
```

---

## 📄 License

This monorepo is open source under the [MIT License](LICENSE).

---

If `z-plugin` saves you tokens or catches a breaking regression before commit, consider giving it a ⭐ on GitHub!
