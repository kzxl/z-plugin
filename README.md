# 🔌 z-plugin — The Context-Saving & Quality Engine for AI Coding Agents

[![Version](https://img.shields.io/badge/version-1.4.0-blue.svg)](package.json)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js%2022+-339933?logo=node.js)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Cursor%20%7C%20Claude%20Code%20%7C%20Antigravity%20%7C%20Windsurf-FF6F00)](https://github.com/kzxl/z-plugin)
[![Protocol](https://img.shields.io/badge/Protocol-MCP%20JSON--RPC%202.0-8A2BE2)](https://modelcontextprotocol.io)
[![Tests](https://img.shields.io/badge/Tests-24%20passing%20%7C%20620%2B%20assertions-brightgreen)](package.json)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[Tiếng Việt](README.vi.md) · [English](README.md) · [Roadmap](ROADMAP.md) · [Changelog](CHANGELOG.md)

> **Stop burning tokens, prevent breaking code regressions, and ban AI code slop.**  
> `z-plugin` is a lightweight, zero-dependency engineering toolkit and MCP server suite that turns **Cursor**, **Claude Code**, **Google Antigravity**, and **Windsurf** into disciplined senior engineers.

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

# Run the interactive visual capability demo
npx @kzxl/z-plugin demo

# Open the zero-daemon visual token telemetry & cost dashboard
npx @kzxl/z-plugin dashboard --open
```

For **Google Antigravity 2.0** and **ZCode**, synchronize all core plugins, native subagents, and MCP registrations:
```powershell
powershell -ExecutionPolicy Bypass -File install.ps1
```

---

## 💥 Why z-plugin? (Before vs. After)

| Common AI Agent Pain Point | With `z-plugin` Active | Verified Impact |
| :--- | :--- | :---: |
| **Context Window Blowout:** Agent opens 5 large files or runs recursive `grep`, burning 40k–80k tokens per turn. | **AST Context Diet (`z-token`):** Extracts exact method signatures & targeted ranges; blocks oversized file reads. | **95.5% Token Saved** |
| **Hidden Regressions:** Refactoring method `A` silently breaks 6 distant services without the agent noticing. | **Sub-2ms Call-Graph (`z-token`):** Instant BFS traversal (`tracePath`) across interfaces and CQRS dispatchers. | **Zero Regressions** |
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
- **AST Outline:** One-shot extraction of classes, interfaces, and methods with line numbers across 16+ languages (`outline`).
- **Sub-2ms BFS Call-Graph:** Traces the shortest invocation path between any two symbols (`tracePath`) across polymorphic interfaces (`IService` ↔ `Service`) and MediatR/CQRS pipelines in $<1\text{ms}$.
- **Blast Radius & God Node Detection:** Identifies upstream dependents, downstream callees, and high-degree God Nodes before edits are made.

### 2. 🧠 `z-brain` — Episodic Memory & Semantic Gotchas
- **Persistent Knowledge:** Automatically saves and retrieves past debugging lessons, domain rules, and gotchas across chat sessions.
- **Hybrid Retrieval:** FTS5 BM25 search combined with Trigram semantic similarity and recency decay.
- **Progressive Disclosure:** Compact L0 index (~30 tokens/entry) for pre-task context sweep; fetches L2 detailed code fixes strictly on-demand.
- **Async Write Queue:** Serializes concurrent SQLite write locks under multi-agent workloads with exponential backoff.

### 3. ⚖️ `z-mind` — Cognitive Framework & Engineering Discipline
- **58 Canonical Invariants:** Mechanically enforces SOLID (`R_CORE`), Test-Driven Development (`R_TDD`), Net Engineering Value (`R_NEV`), and Zero-Trust Empirical Proof (`R_PROOF`) with deduplicated Single Source of Truth (`AGENTS.md`) rules.
- **Autonomous 4-Tier Subagent Routing (`R_TEAM`):** Routes `scout` (`flash_lite`), parallel `self` coding workers (`flash`), and specialist `architect` / `investigator` / `reviewer` subagents (`pro` / `inherit`) under zero-collision file ownership contracts.
- **4-Phase Bugfix Diagnosis:** Structured root-cause isolation before touching production code.
- **Dynamic Rule Packs:** Extensible rule packs for domain-specific projects (e.g. ERP, Fintech, Healthcare).

### 4. 🔍 `z-gate` — Asset Discovery, Taint Flow & Pre-Commit Review
- **Codebase Asset Discovery (`R_REUSE`):** Scans existing utilities and extension methods to stop the agent from re-inventing existing helpers.
- **Inter-Procedural Taint Analysis (`trace_data_flow`):** Detects SQL injections, shell command executions, and path traversals with early-return guard awareness (`if return`, `ThrowIfNull`).
- **Pre-Commit Diff Audit:** Automatically catches wrapper hell (single-impl interfaces), sync-over-async deadlocks (`.Result`, `.Wait()`), and excessive LOC bloat.

### 5. ✨ `z-craft` — Anti-Slop Linter & UI Craftsmanship
- **Anti-AI-Slop AST Linter (`R_ANTI_SLOP`):** Eliminates neon gradients, arbitrary hex colors, floaty shadows, and dead click handlers across React, Tailwind, WPF, and WinForms.
- **Mandatory 4-State UX Matrix:** Enforces default, loading skeleton, empty state, and error handling with retry triggers.
- **Interactive Force Physics Canvas:** Generates zero-dependency SVG topology graphs with Leiden community clustering to visualize architecture.
- **Vibe Time-Machine:** 1-click snapshot checkpoints to safely experiment with UI redesigns without polluting Git history.

---

## 📦 Monorepo Modules & Extensions

| Component | Type | Version | Focus & Core Capabilities |
| :--- | :---: | :---: | :--- |
| [**`z-runtime`**](packages/z-runtime) | **Kernel** | `1.4.0` | **Core Micro-Kernel:** In-memory EventBus, Cross-Process Local IPC, <1ms Cognitive Router, Adaptive Token Budgeter, and <5ms Hot-Reload Manager. |
| [**`z-token`**](plugins/z-token) | **Plugin** | `1.4.0` | **Context Diet & Call-Graph:** Sub-2ms shortest-path BFS (`tracePath`), blast radius, AST outline, capped search, and lean build log filter. |
| [**`z-brain`**](plugins/z-brain) | **Plugin** | `1.4.0` | **Episodic Memory:** Embedded SQLite WAL, hybrid BM25 + Trigram search, code gotchas graph, and async harvest queue. |
| [**`z-mind`**](plugins/z-mind) | **Plugin** | `1.4.0` | **Cognitive OS & Invariants:** 58 canonical rules across 6 engineering pillars, 4-phase bug diagnosis, and Net Engineering Value refactor gate. |
| [**`z-gate`**](plugins/z-gate) | **Plugin** | `1.4.0` | **Safety & Review Gate:** Taint data-flow analysis, helper reuse discovery (`R_REUSE`), pre-commit diff audit, and Git PreToolUse hook. |
| [**`z-craft`**](plugins/z-craft) | **Plugin** | `1.4.0` | **UI Craftsmanship:** Anti-slop AST linter, 4-state UX micro-spec generator, interactive SVG topology canvas, and vibe time-machine. |
| [**`dlc-erp`**](extensions/dlc-erp) | **DLC** | `1.4.0` | **ERP Domain Extension:** Financial precision audits (`decimal` vs `double`), WMS handover validation, and SQL `UPDLOCK` enforcement. |

---

## 💻 Supported AI Agents & IDE Setup

### Cursor
Run `npx @kzxl/z-plugin init cursor`. This creates:
- `.cursorrules`: Instructs Cursor to follow `z-mind` engineering invariants and use token-saving tools.
- `.cursor/mcp.json`: Configures the MCP servers for `outline`, `search`, `tracePath`, `zbrain_fetch`, and `zgate_review`.

### Claude Code
Run `npx @kzxl/z-plugin init claude`. This creates:
- `CLAUDE.md`: Compact instructions and invariants for Claude Code CLI.
- `.claude_mcp.json`: MCP server endpoints.

### Google Antigravity 2.0 & ZCode
Run `powershell -ExecutionPolicy Bypass -File install.ps1`. This synchronizes all plugins to `~/.gemini/config/plugins/` (with native Antigravity subagent schemas) and `~/.zcode/plugins/` (automatically adapting subagent frontmatter for ZCode CLI), registers MCP servers, and activates `PreToolUse` / `PostToolUse` guards.

### Windsurf, Copilot, Cline, Roo Code
Run `npx @kzxl/z-plugin init all` to scaffold configurations for all supported agents in a single step.

---

## 📈 Zero-Daemon Visual Telemetry Dashboard

Inspect blocked context bloat, MCP tool efficiency (`Search` vs. `Symbol` ratio), permanent session context diet across both Antigravity (`~/.gemini/config`) and ZCode (`~/.zcode`), and `z-brain` SQLite FTS5 knowledge atoms without running a permanent background service (`0 MB` idle RAM):

```bash
# 1. Static HTML snapshot (<60ms) saved to .token-diet/z-dashboard.html and opened in browser
npx @kzxl/z-plugin dashboard --open

# 2. Ephemeral local HTTP server (127.0.0.1) with live /api/metrics refresh (Ctrl+C to stop)
npx @kzxl/z-plugin dashboard --serve --open

# 3. Run via npm scripts inside the z-plugin repository
npm run dashboard:open
npm run dashboard:live
```

Key dashboard capabilities:
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
| Multi-hop Call-Path Traversal (`tracePath`) | Minutes of manual file browsing | **0.97 ms** (BFS cache) | **Instant** |

---

## 🧪 Testing & Empirical Verification (`R_PROOF`)

All modules are backed by rigorous automated test suites adhering to Level 3+ empirical verification:

```bash
# Check syntax across all packages & plugins
npm run check

# Run all 24 test suites (620+ passing assertions)
npm test

# Run MCP server smoke tests
npm run smoke

# Run token-diet benchmark measurements
npm run bench
```

---

## 📄 License

This monorepo is open source under the [MIT License](LICENSE).
