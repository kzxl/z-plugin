# Z-Mind Engineering Invariants

<!-- z-mind:begin -->
Z-MIND COGNITIVE ENGINEERING RULES ARE ACTIVE.

## 1. Core Architecture & SOLID (R_CORE)
- **Single Responsibility**: Every class, module, and method has one well-defined reason to change.
- **Deep Modules**: Prefer simple interfaces hiding deep implementation logic over shallow passthrough wrappers.
- **English Conventions**: Name all symbols, classes, methods, variables, and technical docs in standard English (`PascalCase` / `camelCase`).

## 2. Test-Driven Development (R_TDD)
- **Reproduction First**: Before fixing any bug or regression, write a deterministic failing test (Red), implement minimal code to pass (Green), then refactor.
- **Contract Preservation**: Refactoring must preserve 100% of observable behavior and existing test suites.

## 3. High Performance & Async Discipline (R_PERF)
- **Zero Hot-Path GC**: Avoid heap allocations in tight loops and stream ticks; use `Span<T>`, `Memory<T>`, `ArrayPool<T>`, and pooling.
- **Database Access**: Parameterized queries only, backed by indexed lookups, row-level locks, and connection pool discipline.
- **Async Safety**: Propagate `CancellationToken`, use `ConfigureAwait(false)` in library/service layers, and forbid `async void` outside top-level `try/catch` UI handlers.

## 4. Zero-Trust Empirical Proof (R_PROOF)
- Forbid subjective self-praise ("clean", "optimal", "perfect") and unverified completion claims.
- Back every completion claim with Level 3+ proof: compiler exit code `0`, passing assertion counts, or benchmark deltas.

## 5. Multi-Agent Teamwork & Autonomous Tier Routing (R_TEAM)
- **Lead Orchestrator**: Primary agent (`inherit`) orchestrates multi-file tasks ($\ge 4$ modified or $> 5$ explored files):
  - **Recon (`flash_lite` / `flash`)**: Dispatch `scout` (`Model: "flash_lite"`) for `file:line` pointers and `research` (`Model: "flash"`) for flow summaries.
  - **Parallel Coding (`flash`)**: Dispatch disjoint `self` workers (`Model: "flash"`) under strict zero-collision file ownership ($P_1 \cap P_2 = \emptyset$).
  - **Specialist & Escalation (`pro` / `inherit`)**: Route `architect`, `investigator`, and security/concurrency/core `reviewer` passes to `Model: "pro"` (or `inherit`). Escalate any `flash` worker after 2 consecutive build/test failures.
- **Lifecycle**: Batch `invoke_subagent` calls in one turn, rely on reactive wakeup (never poll), steer via `send_message`, and terminate redundant workers via `manage_subagents`.
<!-- z-mind:end -->
