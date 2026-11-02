---
name: z-gate
description: Net Engineering Value (NEV) gate, codebase asset discovery (R_REUSE), wrapper hell prevention, and pre-commit diff auditor. Triggered by /z-gate [find|audit|status].
---

# Z-Gate: Net Engineering Value & Asset Discovery Gate

Use `z-gate` to keep codebase concise, prevent wrapper hell, and maximize reuse of existing codebase helpers.

## Commands & Workflows

### 1. Asset-First Helper Discovery (`/z-gate find`)
Before writing any new utility logic, scan existing repository helpers:
```bash
node ~/.gemini/config/plugins/z-gate/scripts/cli.mjs find "<query>"
```
Or via MCP Tool:
```json
{
  "name": "zgate_find_helpers",
  "arguments": { "query": "format date" }
}
```

### 2. Pre-Commit NEV Diff Audit (`/z-gate audit`)
Inspect staged git changes against wrapper hell, LOC bloat, and invariants:
```bash
node ~/.gemini/config/plugins/z-gate/scripts/cli.mjs audit --staged
```
Or via MCP Tool:
```json
{
  "name": "zgate_audit_diff",
  "arguments": { "staged": true, "commitMessage": "refactor(erp): simplify invoice processing" }
}
```

### 3. Verification Gates Checked
1. **Interface Deletion Test**: Blocks single-implementation interfaces without seams.
2. **LOC Bloat**: Flags line inflation >30% on refactoring tasks.
3. **Asset Reuse**: Flags duplicate hand-rolled helpers when repository helpers exist.
4. **Platform Invariants**: Enforces `R_WPF` (no BindingSource) and `R_DB` (parameterized queries).
5. **Conventional Commits**: Enforces `<type>(<scope>): <subject>` syntax.
