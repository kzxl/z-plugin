# z-gate

Net Engineering Value (NEV) gate, codebase asset discovery (`R_REUSE`), wrapper hell prevention, and pre-commit diff auditor for autonomous AI coding agents (**Antigravity 2.0** & **ZCode**).

`z-gate` ensures code remains concise, enforces maximum reuse of existing codebase helpers before authoring new utilities, and halts architectural regressions before they are staged or committed.

---

## 📦 Components

| Component | What it does |
|---|---|
| MCP tool `zgate_find_helpers` | Searches `Helpers/`, `Extensions/`, `Utils/`, `Common/`, and `Shared/` for reusable methods (<5ms disk cache) |
| MCP tool `zgate_audit_diff` | Audits staged unified git diffs against NEV, the Deletion Test, LOC inflation, and platform invariants |
| MCP tool `zgate_status` | Reports indexed helper counts, cache file stats, and recent gate audit metrics |
| PreToolUse Hook | Blocks `git add -A` / `git add .` (enforcing targeted staging per `R_GIT`) and bare `git diff` commands |
| CLI `scripts/cli.mjs` | Standalone CLI facade for terminal workflows (`find`, `audit`, `status`) |
| Skill `z-gate` | Teaches agents to execute asset-first surveys before creating utility functions |
| Rules `rules/AGENTS.md` | Universal engineering invariants for code conciseness, reuse, and diff auditing |

---

## 🏛️ Core Capabilities

### 1. Asset-First Discovery (`R_REUSE`)
Before implementing any utility function (string parsing, date formatting, currency calculation, collection transforms), agents query `zgate_find_helpers`.
- **Deep Heuristic Inspection**: Scans source files across standard helper directories (`Helpers/`, `Extensions/`, `Utils/`, `Common/`, `Shared/`).
- **C# Extension Method Detection**: Identifies extension methods using the `(this ...)` parameter syntax and maps them to target types.
- **Sub-5ms Disk Cache**: Caches scanned symbols in `.zero-gate/helpers-cache.json` with TTL validation to eliminate redundant filesystem traversal.

### 2. Net Engineering Value Diff Auditor (`R_NEV`)
Audits git diffs before commits to prevent code rot:
- **Wrapper Hell Ban (Deletion Test)**: Detects newly introduced single-implementation interfaces (`IFoo` with only `Foo`). Interfaces must justify their existence via polymorphic dispatch or test mock seams.
- **LOC Inflation Guard**: Flags net line inflation >30% on refactoring or cleanup tasks (enforcing non-positive or neutral net LOC).
- **ERP & Platform Invariants**:
  - `R_WPF`: Blocks `BindingSource` usage in WinForms/WPF (mandating `BindingList<T>` or `ObservableCollection<T>`).
  - `R_DB`: Blocks raw SQL string concatenation (mandating parameterized queries).
  - `R_PROOF`: Catches subjective self-praise in commit messages or docstrings ("clean", "optimal", "perfect").

### 3. PreToolUse Git Guard Hook (`R_GIT`)
Intercepts bash / PowerShell commands:
- **Targeted Staging**: Strictly blocks `git add -A`, `git add .`, and `git commit -a`. Forces agents to explicitly stage only relevant files (`git add <files>`).
- **Conventional Commits**: Validates commit message structure against `<type>(<scope>): <subject>`.

---

## ⚡ CLI Usage

```bash
# Find existing helpers for date formatting
node scripts/cli.mjs find "format date"

# Find C# extension methods for grids or collections
node scripts/cli.mjs find "grid"

# Audit current git diff against NEV and platform invariants
node scripts/cli.mjs audit

# Audit a specific unified diff file
node scripts/cli.mjs audit path/to/patch.diff

# Check status of indexed helpers and cache
node scripts/cli.mjs status
```

---

## 🧪 Testing & Verification

Run the dedicated test suite:

```bash
node bench/gate-test.mjs
```
