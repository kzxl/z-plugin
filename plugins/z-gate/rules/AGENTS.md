# Z-Gate Engineering Invariants

<!-- z-gate:begin -->
Z-GATE IS ACTIVE. Asset reuse, Net Engineering Value (NEV), and commit hygiene are enforced.

## 1. Asset-First Discovery (R_REUSE)
- **Mandatory Survey**: Before writing any utility, parser, formatter, or calculation helper, call `zgate_find_helpers` or inspect `Helpers/`, `Extensions/`, `Utils/`, and `Common/`.
- **Zero Redundancy**: Duplicate hand-rolled logic when a repository or stdlib helper exists is an immediate regression.

## 2. Net Engineering Value & Deletion Test (R_NEV, R_CORE)
- **Pareto Gate**: Refactorings must preserve 100% test contracts, avoid runtime/allocation regressions, keep nesting $\le 3$, and yield net LOC $\le 0\%$ ($>30\%$ LOC inflation or NEV $\le 0$ triggers rollback).
- **Deletion Test**: Every interface must earn its place via polymorphic dispatch or an explicit test mock seam; inline or delete single-implementation `IFoo` wrappers.

## 3. Git Commit Invariants (R_GIT)
- **Atomic & Conventional**: 1 feature or fix = 1 commit formatted as `<type>(<scope>): <subject>`.
- **Targeted Staging**: Stage only in-scope files (`git add <files>`); never run `git add -A`.
- **Empirical Logs**: Omit subjective self-praise ("optimal", "clean", "perfect") in commit messages and comments (`R_PROOF`).
<!-- z-gate:end -->
