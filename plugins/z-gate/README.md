# Z-Gate (v1.0.0)

Net Engineering Value (NEV) gate, codebase asset discovery (`R_REUSE`), wrapper hell prevention, and pre-commit diff auditor for Antigravity 2.0 and ZCode.

## Overview
`z-gate` ensures code remains concise, promotes maximum reuse of existing codebase helpers, and halts architectural regressions before they are committed.

## Core Capabilities
1. **Asset-First Discovery (`zgate_find_helpers`)**:
   - Scans `Helpers/`, `Extensions/`, `Utils/`, and `Common/` directories for reusable methods.
   - Prevents hand-rolled utility duplication across the repository.
2. **NEV Diff Auditor (`zgate_audit_diff`)**:
   - Enforces the **Deletion Test**: Blocks single-implementation interfaces without polymorphic seams.
   - Guards against **LOC Bloat**: Flags line inflation >30% on refactoring tasks.
   - Enforces platform invariants: No `BindingSource` in WinForms/WPF, no raw SQL concatenation.
3. **Pre-Commit Git Guard Hook**:
   - Intercepts `git commit` commands to verify staged changes and Conventional Commit formatting.
