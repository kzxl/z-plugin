# Z-Gate Engineering Invariants

<!-- z-gate:begin -->
Z-GATE IS ACTIVE. Code conciseness, asset discovery, and Net Engineering Value (NEV) are enforced.

## 1. Asset-First Discovery (R_REUSE)
- **Mandatory Survey**: Before implementing any utility method, string manipulation, date parsing, or common mathematical calculation, call `zgate_find_helpers` or inspect `Helpers/`, `Extensions/`, `Utils/`, and `Common/`.
- **Zero Redundancy**: Authoring duplicate hand-rolled logic when a repository helper already exists is an immediate regression.

## 2. Abstraction Tax & Interface Deletion Test (R_NEV, R_CORE)
- **Deletion Test**: Every interface must justify its existence through polymorphic dispatch or a clear test mock seam.
- **Wrapper Hell Ban**: Strictly forbid creating an interface `IFoo` when only a single implementation `Foo` exists and no test seam is required. Inline or delete speculative interfaces.
- **LOC Inflation Limit**: In any refactoring or cleanup task, total line growth must be non-positive or neutral (<= 0% net LOC). Line inflation >30% triggers mandatory rollback.

## 3. Git Commit Invariants (R_GIT)
- **Conventional Commits**: Format strictly as `<type>(<scope>): <subject>`.
- **Targeted Staging**: Stage only files strictly in scope (`git add <files>`).
- **Empirical Commit Logs**: Never use subjective self-praise ("optimal", "clean", "perfect") in commit messages or code comments (R_PROOF).
<!-- z-gate:end -->
