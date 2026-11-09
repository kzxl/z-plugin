# Z-Mind Engineering Invariants

<!-- z-mind:begin -->
Z-MIND COGNITIVE ENGINEERING RULES ARE ACTIVE. Every technical action, code modification, refactoring, and bug fix must satisfy these invariants.

## 1. Core Architecture & SOLID (R_CORE)
- **Single Responsibility**: Every class, module, and method must have one well-defined reason to change.
- **Deep Modules**: Prefer deep modules (simple interfaces hiding profound implementation complexity) over shallow modules (thin wrappers adding cognitive overhead).
- **Interface Justification (Deletion Test)**: Every interface must earn its place. If an interface has only one implementation and no polymorphic dispatch or test mock seam is needed, inline or delete it.
- **Strict English Conventions**: All code symbols, classes, methods, variables, and documentation must use clean standard English in PascalCase / camelCase.

## 2. Test-Driven Development & Zero Regression (R_TDD)
- **Reproduction First**: For any bug fix, write a deterministic reproduction test demonstrating the failure BEFORE modifying production code.
- **Red-Green-Refactor**: Verify the test fails (Red), implement the minimum code to pass (Green), and refactor cleanly.
- **100% Contract Preservation**: Refactoring must never alter existing observable behavior or break passing test suites.

## 3. High Performance & Zero-Waste Allocation (R_PERF)
- **Zero GC in Tight Loops**: Avoid heap allocations in hot tick paths, loops, and stream processing. Use `Span<T>`, `Memory<T>`, `ArrayPool<T>`, and object pooling.
- **Database Access**: Parameterized queries ONLY. Enforce indexed lookups, row-level locks, and connection pool discipline.
- **Async Discipline**: Always pass cancellation tokens where supported, avoid `async void` (except UI event handlers with top-level `try/catch`), and prevent UI thread deadlocks with `ConfigureAwait(false)`.

## 4. Net Engineering Value in Refactoring (R_NEV)
- Every refactoring must deliver a Pareto improvement across 4 dimensions:
  1. **Zero runtime regression** (latency, memory allocations, query count).
  2. **Zero wrapper hell** (no speculative passthrough layers or redundant DTO duplication).
  3. **Low cognitive complexity** (nesting <= 3, direct call paths).
  4. **100% test contract preservation**.
- If Net Engineering Value (NEV) <= 0, trigger immediate rollback.

## 5. Zero-Trust Empirical Proof (R_PROOF)
- Forbid subjective self-praise ("clean", "optimal", "perfect") and unverified completion claims.
- Every claim must cite Level 3+ independent empirical proof: compiler exit code 0, passing test assertion counts, or profiler benchmarks.

## 6. Asset-First Discovery & Zero Redundancy (R_REUSE)
- Before writing any new utility, parser, formatter, or helper, grep the repository (`Helpers/`, `Utils/`, `Common/`, `Extensions/`).
- Writing redundant code when an existing helper or standard library API exists is an immediate regression.

## 7. Git & Commit Discipline (R_GIT)
- **Atomic Commits**: 1 feature / 1 bug fix = 1 commit.
- **Conventional Commits**: Format strictly as `<type>(<scope>): <subject>`.
- **Targeted Staging**: Stage only files strictly in scope (`git add <files>`). Never use lazy `git add -A` that inadvertently sweeps in local config/rules.

## 8. Multi-Agent Teamwork (R_TEAM)
- Subagent teams must maintain **zero-collision file ownership contracts**.
- Parallelize research and execution partitions; enforce adversarial review gates before merging branches.

## 9. Prefix Cache Invariance & Active Context Pruning (R_CACHE, R_ACP)
- **Immutable Left-to-Right Prefix**: All prompts and agent workflows must place static directives, invariants, and tool definitions at the head of the system prompt. Never insert volatile timestamps (e.g. `DateTime.Now:HH:mm:ss`) or random nonces at the top.
- **Ephemeral User Envelope**: Encapsulate dynamic runtime metadata (current screen, active document ID, server clock) inside the latest user message envelope to preserve >=90-95% KV-cache hit rate.
- **LSM-Tree Context Hierarchy**: Replace blunt history truncation and monolithic lossy rolling summaries with 3-tier LSM architecture: T1 Raw Active Window, T2 Frozen Immutable Blocks, and T3 Cold Searchable Archive. Provide internal on-demand retrieval tools for lossless context exploration.
<!-- z-mind:end -->
