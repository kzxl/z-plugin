---
name: z-gate
description: Unified Quality, Security & Code Review Gate. Enforces Net Engineering Value (R_NEV), Security Invariants (SQLi, Secrets), Concurrency Deadlock Defense, Asset Reuse (R_REUSE), and z-brain historical gotcha cross-referencing. Triggered by /z-gate [review|find|audit|status].
---

# 🛡️ Z-Gate: Unified Quality, Security & Code Review Gate

Z-Gate is the comprehensive gatekeeper for software changes. It combines deterministic static analysis, security leak detection, concurrency defense, Net Engineering Value (R_NEV), and cross-plugin memory mesh to ensure clean, secure, and regression-free commits.

---

## 1. Unified Code Review (`/z-gate review` & `zgate_review`)

Run deep multi-dimensional reviews across staged diffs, working changes, or branches:

```bash
# Terminal table report of staged changes
z-gate review

# Review against main branch or specific commit
z-gate review --branch=main --format=table
z-gate review --commit=HEAD~1 --format=markdown

# Focus on specific pillars
z-gate review --focus=security
z-gate review --focus=concurrency
z-gate review --focus=architecture
```

Or via MCP Tool in pair programming sessions:
```json
{
  "name": "zgate_review",
  "arguments": {
    "staged": true,
    "focus": "all",
    "format": "markdown"
  }
}
```

### Review Pillars & Severity Tiers

| Severity | Category | What is Checked |
| :--- | :--- | :--- |
| **🔴 P0 (Critical Blocker)** | **Security & Core Invariants** | • Raw SQL string concatenation / injection (`R_DB`)<br>• Hardcoded secrets, API keys, tokens, passwords<br>• Shell command injection via string concatenation<br>• WinForms / WPF `BindingSource` violation (`R_WPF`) |
| **🟡 P1 (Warning)** | **Concurrency & Deadlocks** | • Sync-over-async blocking calls: `.Result`, `.GetAwaiter().GetResult()`, `.Wait()` (`R_CS`)<br>• `async void` methods that swallow exceptions and crash processes<br>• `Thread.Sleep` inside async workflows<br>• Single-implementation interfaces without seams (Wrapper Hell - `R_NEV`)<br>• LOC expansion > 30% on refactoring tasks |
| **🟣 P2 (Rule Violation)** | **Craftsmanship & Gotchas** | • Cross-references modified files against past gotchas in `z-brain`<br>• UI Anti-Slop (neon gradients, dead click handlers - `R_ANTI_SLOP`) |
| **⚪ P3 (Nitpick)** | **Clean Code & Git** | • Deep nesting & cognitive complexity (indentation depth ≥ 5 levels)<br>• Conventional Commit syntax violations (`R_GIT`) |

---

## 2. Asset-First Helper Discovery (`/z-gate find`)

Before writing any custom date formatting, string truncation, or parsing utility, scan existing repository helpers:
```bash
z-gate find "<intent or keyword>"
```

Or via MCP Tool:
```json
{
  "name": "zgate_find_helpers",
  "arguments": { "query": "format date" }
}
```

---

## 3. Pre-Commit & Zero-Leak Credentials Hook (`R_GIT`, `R_SEC`)

The `PreToolUse` hook intercepts `run_command` / `git`:
- **Targeted Staging**: Rejects lazy `git add -A` / `git add .` (`R_GIT`).
- **P0 Blocker**: Rejects commits with critical security leaks, SQL injection, or sync-over-async deadlocks.
- **Zero-Leak Credentials (`R_SEC`)**: Blocks direct `.env` reads (`cat .env`, `Get-Content .env`), full environment dumps (`printenv`, `Get-ChildItem Env:`), and secret variable echoing. Read [references/safe-credentials.md](references/safe-credentials.md) for silent presence checks (`Select-String -Quiet` / `grep -sq`) and masked-input user prompts.

## 4. File-First Reports (`--output` / `outputPath`)

For large reviews or audits, pass `--output=<path>` (CLI) or `outputPath` (`zgate_review`) to persist the full report on disk and keep only the compact score/counts summary in context.
