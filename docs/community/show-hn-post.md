# Show HN Submission Template

**URL:** https://news.ycombinator.com/submit  
**Title:** Show HN: Z-Plugin (AEOS) – Open-source engineering infrastructure for AI coding agents  
**URL Field:** https://github.com/kzxl/z-plugin  
**Text Field:**

Hi HN!

Over the past year, as AI coding agents (Cursor, Claude Code, Windsurf, Aider) became daily drivers, we ran into fundamental scaling limits on production enterprise repos:
1. Context window burnout: Monolithic file reads and recursive greps consume 50k–100k tokens per turn, inflating latency and API bills.
2. Architecture amnesia: Agents modify code without topological awareness of callers, triggering ripple effects across distant dependencies or passing untrusted parameters into SQL sinks.

We built **AEOS (Agent Engineering Operating System)** to act as a zero-overhead local operating system for AI agents.

Key technical design choices:
- **Sub-2ms BFS Call-Graph Engine:** Rather than heavy C++ compiler daemon platforms (like Roslyn or CodeQL), we built a 2-char prefix-sharded symbol cache with mtime freshness caching in pure Node.js. Finding the shortest multi-hop invocation path takes `<1.0ms` across thousands of symbols.
- **Seam Stitching:** Automatically bridges polymorphic interfaces (`I{Service}` ↔ `{Service}`) and CQRS/MediatR dispatchers (`Send` → `Handler.Handle`) to prevent dependency blind spots.
- **Inter-Procedural Taint & Branch Guards:** Traces data flows down to sensitive sinks (SQL injection, exec, file writes) while detecting early-return guard clauses (`if return`, `ThrowIfNull`) to prevent false-positive alerts.
- **Episodic Memory Engine:** Embedded SQLite WAL with hybrid BM25 + Trigram Dice semantic search and an asynchronous write queue with exponential backoff.
- **Zero AI Slop:** AST linter blocking neon gradients, arbitrary hex colors, and dead click handlers.
- **Universal Agent Bridge:** Exports standard Model Context Protocol (MCP) server configurations and engineering rules to Cursor, Claude Code, Windsurf, Cline, and Copilot in 1 command (`npx z-plugin init`).

The repo is fully open source under the MIT license, with 22 test suites and 580+ empirical assertions.

GitHub: https://github.com/kzxl/z-plugin

We'd love your thoughts, critique on the architecture, and ideas for further static analysis heuristics!
