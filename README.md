# 🔌 z-plugin (AEOS) — Agent Engineering Operating System

[![Version](https://img.shields.io/badge/version-1.2.0-blue.svg)](package.json)
[![Runtime](https://img.shields.io/badge/Runtime-Node.js%2022+-339933?logo=node.js)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Antigravity%202.0%20%7C%20ZCode%20%7C%20Cursor%20%7C%20Claude%20Code%20%7C%20Windsurf-FF6F00)](https://github.com/kzxl/z-plugin)
[![Protocol](https://img.shields.io/badge/Protocol-MCP%20JSON--RPC%202.0-8A2BE2)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**z-plugin** is the official monorepo providing the **Agent Engineering Operating System (AEOS)**: a high-performance, context-efficient, zero-overhead engineering infrastructure for **Google Antigravity 2.0**, **ZCode**, and **any AI Coding Agent** (Cursor, Claude Code, Windsurf, Cline, Roo Code, Aider, OpenHands).

Consolidating specialized core plugins, extension DLCs, a micro-kernel runtime, and a universal agent bridge under a single repository, `z-plugin` enables sub-10ms cross-process synchronization, adaptive token budgeting, episodic memory recall, and mechanical anti-slop code quality enforcement.

---

## 📦 Shipped Modules & Extensions

| Component | Type | Version | Focus & Core Capabilities |
| :--- | :---: | :---: | :--- |
| [**`z-runtime`**](packages/z-runtime) | **Kernel** | `1.2.0` | **Core AEOS Micro-Kernel:** In-memory EventBus, Cross-Process Local IPC (`LocalIpcBridge`), <1ms Cognitive Router, Adaptive Dynamic Token Budgeter (3.5k-35k tokens), and <5ms Hot-Reload Manager. |
| [**`z-token`**](plugins/z-token) | **Plugin** | `1.2.0` | **Context Diet & Token Guard:** Multiline generic method signatures, code outline, capped search, lean .NET builds, oversized-read blocking gateway, repeated-call loop breaker. |
| [**`z-brain`**](plugins/z-brain) | **Plugin** | `1.2.0` | **Episodic Memory Engine:** Embedded SQLite WAL, FTS5 BM25 + Trigram Dice Semantic Hybrid Search, Temporal Knowledge Graph, and Asynchronous Write Queue (`AsyncHarvestQueue`) with retry backoff. |
| [**`z-mind`**](plugins/z-mind) | **Plugin** | `1.2.0` | **Cognitive OS & 58 Invariants:** 58 canonical rules across 6 engineering pillars, 4-phase bugfix diagnosis, Net Engineering Value (NEV) refactor gate, dynamic DLC rules pack hook. |
| [**`z-gate`**](plugins/z-gate) | **Plugin** | `1.2.0` | **Asset Discovery & NEV Gate:** Codebase helper discovery (`R_REUSE`), pre-commit diff audit against wrapper hell and LOC bloat, Git PreToolUse hook enforcing targeted staging (`R_GIT`). |
| [**`z-craft`**](plugins/z-craft) | **Plugin** | `1.2.0` | **Software Craftsmanship & Vibe Engine:** Anti-Slop AST Linter (`R_ANTI_SLOP`) with comment sanitization, 4-state UX micro-contract generator, live generative canvas, and vibe time-machine. |
| [**`dlc-erp`**](extensions/dlc-erp) | **DLC** | `1.2.0` | **ERP Domain Extension:** Financial precision audits (decimal vs double), WMS two-step handover validation, SQL UPDLOCK concurrency enforcement, and bilingual ERP terminology dictionary. |

---

## ⚡ Quick Start

### 1. One-Click Installation for Antigravity & ZCode

Link all core plugins simultaneously via zero-copy directory junctions:

```powershell
# From the z-plugin repository root
powershell -ExecutionPolicy Bypass -File install.ps1
```

### 2. Universal Agent Bridge (Cursor, Claude Code, Windsurf, Cline, Copilot)

Export standard Model Context Protocol (MCP) server configurations and engineering rules in 1 command:

```bash
# Export configs for all supported AI agents into current workspace
npm run agent:bridge -- export all

# Or export for a specific agent
npm run agent:bridge -- export cursor
npm run agent:bridge -- export claude
npm run agent:bridge -- export windsurf
npm run agent:bridge -- export cline
npm run agent:bridge -- export copilot
```

- **Cursor**: Generates `.cursorrules` and `.cursor/mcp.json`.
- **Claude Code**: Generates `CLAUDE.md` and `.claude_mcp.json`.
- **Windsurf**: Generates `.windsurfrules` and `.codeium_mcp.json`.
- **Copilot**: Generates `.github/copilot-instructions.md`.

### 3. Extension DLC Management

Scaffold, validate, and list modular domain extensions:

```bash
# List all active extension DLCs
npm run dlc -- list

# Scaffold a new extension DLC
npm run dlc -- create dlc-fintech

# Validate an existing extension DLC manifest
npm run dlc -- validate extensions/dlc-erp
```

---

## 🏛️ AEOS Architecture

```mermaid
flowchart TD
    subgraph Agents ["Supported AI Coding Agents"]
        AGY["🤖 Antigravity 2.0 / ZCode (Native)"]
        Cursor["💻 Cursor IDE (MCP + .cursorrules)"]
        Claude["⚡ Claude Code (MCP + CLAUDE.md)"]
        Windsurf["🌊 Windsurf (MCP + .windsurfrules)"]
        Cline["🔌 Cline / Roo Code (MCP)"]
        Aider["🛠️ Aider / OpenHands (CLI)"]
    end

    subgraph AEOSRuntime ["Z Core Runtime (packages/z-runtime)"]
        Router["🧭 Cognitive Router (<1ms Intent & Trigram Matcher)"]
        Budgeter["📊 Adaptive Token Budgeter (3.5k - 35k Scaling)"]
        DAG["📋 DAG Execution Planner (Parallel Partitioning)"]
        HotReload["🔥 HotReloadManager (<5ms In-Memory Cache Busting)"]
        IPC["📡 LocalIpcBridge (Atomic Stream ~/.zcode/ipc/)"]
    end

    subgraph CorePlugins ["Core Plugin Suite"]
        ZToken["🛡️ z-token (Context Firewall & AST Scan)"]
        ZBrain["🧠 z-brain (SQLite WAL + Hybrid Search + Async Queue)"]
        ZMind["⚖️ z-mind (58 Invariant Rules & Cognitive Plan)"]
        ZGate["🔍 z-gate (Asset Discovery & NEV Auditor)"]
        ZCraft["✨ z-craft (Anti-Slop Linter & 4-State Matrix)"]
    end

    subgraph Extensions ["Extension DLC Ecosystem"]
        DLC_ERP["📦 dlc-erp (WMS, Finance, Concurrency Locks)"]
        DLC_Custom["📦 Custom DLCs (dlc-*)"]
    end

    Agents <-->|"MCP JSON-RPC / CLI / IPC"| AEOSRuntime
    AEOSRuntime <--> CorePlugins
    CorePlugins <--> Extensions
```

---

## 🛠️ Core Capabilities

### 1. `z-runtime` (Kernel & Cognitive Router)
- **Deterministic Intent Routing:** Classifies intent (`bugfix`, `refactor`, `ui`, `review`, `architecture`, `feature`) in $<1\text{ms}$ using bilingual regular expressions and semantic trigram centroids.
- **Adaptive Token Budgeting:** Dynamically scales context allocation between 3,500 tokens (for simple typos) and 35,000 tokens (for monorepo refactoring), dynamically reallocating category weights (symbols vs history vs rules).
- **Cross-Process Local IPC:** Broadcasts atomic events across independent terminal sessions, Cursor, and Antigravity with sub-10ms delivery latency via `~/.zcode/ipc/event_stream.jsonl`.
- **Instant Hot-Reload:** Debounced file watcher (`fs.watch`) invalidates in-memory rule and synonym caches in $<5\text{ms}$ without requiring session restarts.

### 2. `z-token` (Context Firewall & Token Diet)
- **Token Reduction:** Up to **95.5% token reduction** on large file inspections and **99.2% reduction** on warning-heavy build logs.
- **AST Scan & Outline:** Generic method signature parsing, multiline signature lookahead, and backward modifier scanning without reading whole files.
- **Loop Breaker:** PostToolUse gateway detecting repeating commands and infinite tool loops.

### 3. `z-brain` (Episodic Memory & Hybrid Retrieval)
- **Hybrid Retrieval:** FTS5 BM25 search combined with Trigram Dice Semantic Similarity (+30pts) and 30-day temporal recency decay (+5pts).
- **Asynchronous Write Queue (`AsyncHarvestQueue`):** Serializes concurrent SQLite write locks under multi-agent workloads with exponential backoff and fallback logging (`~/.zcode/harvest-fallback.jsonl`).
- **Progressive Disclosure:** L0 compact index (~30 tokens/atom) for pre-task sweeps; L2 detailed experience fetched strictly on-demand.

### 4. `z-mind` (Cognitive OS & Invariants)
- **58 Canonical Engineering Invariants:** Enforcing SOLID (`R_CORE`), Test-Driven Development (`R_TDD`), Net Engineering Value (`R_NEV`), Zero-Trust Empirical Proof (`R_PROOF`), and Multi-Agent Collaboration (`R_TEAM`).
- **Dynamic Rule Packs:** Extensible `registerRulesPack` hook enabling Extension DLCs to contribute domain-specific rules dynamically.

### 5. `z-gate` (Asset Discovery & Quality Gate)
- **Asset Discovery (`R_REUSE`):** Scans existing codebase helpers and extension methods to eliminate redundant hand-rolled logic.
- **Pre-Commit Diff Audit:** Rejects single-implementation interfaces (Deletion Test), catches SQL injection, and prevents sync-over-async deadlock hazards (`.Result`, `.Wait()`).
- **Git Pre-Commit Hook:** Autonomous local guard blocking bad commits before pushing.

### 6. `z-craft` (Disciplined Vibe-Coding & Anti-Slop Engine)
- **Anti-AI-Slop AST Linter (`R_ANTI_SLOP`):** Eliminates neon gradients, arbitrary hex colors, floaty shadows, and dead click handlers across React, Tailwind, WPF, and WinForms.
- **Comment Sanitizer:** Line-preserving comment stripping preventing false-positive violations when code docstrings mention token names.
- **4-State UX Matrix:** Mandatory UI states: Default, Loading skeleton, Empty state, and Error with retry trigger.

---

## 🧪 Testing & Empirical Verification (`R_PROOF`)

All modules are backed by rigorous Level 3+ empirical automated test suites:

```bash
# Run syntax checks across all 49 modules
npm run check

# Run all 18 test suites (521+ passing assertions)
npm test

# Run MCP server smoke tests
npm run smoke

# Run token-diet benchmark measurements
npm run bench
```

---

## 📄 License

This monorepo is licensed under the [MIT License](LICENSE).
