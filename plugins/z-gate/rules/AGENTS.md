# Z-Gate Engineering Invariants

<!-- z-gate:begin -->
Z-GATE IS ACTIVE.

## 1. Asset-First Discovery (R_REUSE)
- Call `zgate_find_helpers` or inspect `Helpers/`, `Extensions/`, `Utils/`, and `Common/` before writing any utility or formatter.

## 2. Net Engineering Value (R_NEV, R_CORE)
- Keep nesting <=3, preserve 100% test contracts, avoid >30% LOC bloat on refactors, and delete single-implementation `IFoo` wrappers.

## 3. Git & Safe Credentials (R_GIT, R_SEC)
- Atomic Conventional Commits (`<type>(<scope>): <subject>`), targeted `git add <files>` only (never `git add -A`), and no subjective self-praise (`R_PROOF`).
- Never read `.env` or dump secret env vars into context; read `z-gate/references/safe-credentials.md` for silent exit-code checks and masked user prompts.
<!-- z-gate:end -->
