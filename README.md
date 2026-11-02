# 🔌 z-plugin — Unified Plugin Suite for Antigravity & ZCode

[![Runtime](https://img.shields.io/badge/Runtime-Node.js%2022+-339933?logo=node.js)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Antigravity%202.0%20%7C%20ZCode-FF6F00)](https://github.com/kzxl/z-plugin)
[![Protocol](https://img.shields.io/badge/Protocol-MCP%20JSON--RPC%202.0-8A2BE2)](https://modelcontextprotocol.io)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**z-plugin** is the official monorepo providing high-performance, context-efficient, zero-overhead plugins for **Google Antigravity 2.0** and **ZCode** autonomous AI coding environments.

Consolidating multiple specialized plugins under a single repository, `z-plugin` enables one-command installation, unified versioning, and shared cross-platform tooling.

---

## 📦 Shipped Plugins

| Plugin | Version | Focus | Core Capabilities |
| :--- | :---: | :--- | :--- |
| [**`z-token`**](plugins/z-token) | `1.0.0` | **Context Diet & Token Guard** | Code outline, capped search, lean .NET builds, oversized-read blocking gateway, repeated-call loop breaker. |
| [**`z-brain`**](plugins/z-brain) | `1.2.0` | **Episodic Memory Engine** | Pure local embedded SQLite WAL, FTS5 BM25 search, L0 compact index (~30 tokens), on-demand L2 deep view. |

---

## ⚡ Quick Start: One-Click Installation

Link all plugins simultaneously into both **Antigravity** and **ZCode**:

```powershell
# From the z-plugin repository root
powershell -ExecutionPolicy Bypass -File install.ps1
```

The installer automatically detects local environments and establishes zero-copy directory junctions:
- **Antigravity**: `~/.gemini/config/plugins/<plugin-name>`
- **ZCode**: `~/.zcode/plugins/<plugin-name>`

### Selective Installation

```powershell
# Install only z-token
powershell -ExecutionPolicy Bypass -File install.ps1 -Plugin z-token

# Install only z-brain
powershell -ExecutionPolicy Bypass -File install.ps1 -Plugin z-brain

# Unlink all plugins
powershell -ExecutionPolicy Bypass -File install.ps1 -Uninstall
```

---

## 🏛️ Ecosystem Overview

```mermaid
flowchart TD
    subgraph IDE ["AI Coding Environment"]
        Agent["🤖 AI Agent (Antigravity 2.0 / ZCode)"]
    end

    subgraph ZPluginSuite ["z-plugin Monorepo"]
        subgraph ZToken ["z-token Plugin"]
            Guard["🛡️ PreToolUse Gateway (Blocks >200 lines / raw dumps)"]
            Loop["🔁 PostToolUse Loop Breaker"]
            ToolsToken["⚙️ outline | search | build | run | diet"]
        end

        subgraph ZBrain ["z-brain Plugin"]
            MCPBrain["🧠 MCP Memory Server"]
            SQLite[("💾 zbrain.sqlite (FTS5 BM25)")]
            ToolsBrain["🔍 zbrain_fetch | zbrain_view | zbrain_harvest"]
        end
    end

    Agent <-->|"Hooks & MCP"| ZToken
    Agent <-->|"MCP stdio"| ZBrain
    ZBrain <--> SQLite
```

---

## 🛠️ Plugin Details

### 1. `z-token` (Context Firewall & Token Diet)
- **Problem Solved:** Prevents coding agents from burning 40,000+ tokens on whole-file reads, unbounded recursive greps, and raw build logs.
- **Measured Savings:** Up to **95.5% token reduction** on large file inspections and **99.2% reduction** on warning-heavy build logs.
- **MCP Tools:**
  - `outline`: Extracts high-level AST and declarations without dumping file bodies.
  - `search`: Grep with strict 30-match / 8 KB ceilings.
  - `build`: Compact MSBuild and `dotnet build` errors & grouped warning codes.
  - `run`: Compact test and task runner for npm, cargo, go, maven, gradle, pytest.
  - `diet`: Analyzes active plugins/skills to report permanent context overhead.
- See full documentation: [plugins/z-token/README.md](plugins/z-token/README.md)

### 2. `z-brain` (Pure Local Episodic Memory Engine)
- **Problem Solved:** Replaces remote PostgreSQL and background memory daemons with a zero-cost, 100% offline embedded SQLite engine.
- **Progressive Disclosure:**
  - **L0 Index:** Pre-task context sweeps deliver ~30 tokens per item (`[#ID] Problem › Gotcha/Fix`).
  - **L2 Deep View:** Full root-cause analysis and code snippets are fetched strictly on demand.
- **MCP Tools:**
  - `zbrain_fetch`: Fast FTS5 pre-task context sweep.
  - `zbrain_view`: Detailed inspection by ID.
  - `zbrain_harvest`: Direct recording of verified engineering lessons.
  - `zbrain_query`: Multi-angle filtered search with trust levels.
  - `zbrain_status`: SQLite database statistics and atom counts.
- See full documentation: [plugins/z-brain/README.md](plugins/z-brain/README.md)

---

## 🧪 Testing & Verification

Run automated test suites across all plugins and tooling:

```bash
# Run syntax checks
npm run check

# Run full test suite (guard, language heuristic, build parser, filesystem, runner, panel)
npm test
```

---

## 📄 License

This monorepo is licensed under the [MIT License](LICENSE).
