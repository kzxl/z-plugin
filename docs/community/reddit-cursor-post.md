# Reddit Post Template for r/Cursor & r/ClaudeAI

**Subreddit:** `r/Cursor` or `r/ClaudeAI`  
**Title:** I built a sub-1ms Call-Graph & Taint Analyzer for Cursor that cuts token consumption by 95% (Open Source)  
**Flair:** Project / Showcase / Discussion  

---

Hey r/Cursor!

Like many of you, I love Cursor / Claude Code for writing code, but on enterprise codebases (C#, TypeScript, Go, Python), I ran into two huge frustrations:

1. **Context Window Blowout & Cost:** An agent reading 4-5 large files or running unbounded greps easily burns 40k–80k tokens per turn, making sessions slow and expensive.
2. **Invisible Dependencies & Breaking Changes:** When refactoring or fixing a bug, the AI often modifies a method without realizing that 8 other services depend on it (or calls an unvalidated parameter straight into an SQL sink).

To solve this, I built **z-plugin (AEOS)**: a lightweight, zero-dependency engineering engine that plugs directly into Cursor via Model Context Protocol (MCP) and `.cursorrules`.

### ⚡ What it does:
* **Sub-2ms BFS Call-Graph (`tracePath`):** Finds the exact shortest path between any two symbols across the codebase (e.g. `OrderController` → `AuditLogEntry` in `0.97ms` SLA).
* **Interface & CQRS Seam Stitching:** Automatically bridges polymorphic interfaces (`IOrderService` ↔ `OrderService`) and MediatR/CQRS dispatchers (`Send(Command)` → `CommandHandler.Handle`).
* **Inter-Procedural Taint Tracking:** Traces untrusted caller parameters down to sensitive sinks (SQL Injection, Process.Start, File I/O) and recognizes early-return guard clauses (`if return`, `ThrowIfNull`) to prevent false positives.
* **Blast Radius & God Node Detection:** Computes dynamic risk scores and warns the AI when modifying high-centrality "God Nodes".
* **Context Diet:** Uses prefix-sharded symbol buckets to feed the AI compact method declarations instead of raw multi-megabyte files (saving up to 95% tokens).
* **Interactive Physics Topology Canvas:** Generates a pure SVG force-directed physics graph with Leiden domain community clustering that you can open in your browser.

### 🚀 1-Second Setup for Cursor:
You don't even need to configure MCP servers manually:

```bash
# In your project folder:
npx z-plugin init cursor
```
This automatically sets up `.cursorrules` and `.cursor/mcp.json`.

Repo is 100% open source under MIT:  
👉 **GitHub:** https://github.com/kzxl/z-plugin

Would love to hear your feedback or feature requests!
