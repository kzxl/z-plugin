# Z-Mind Engineering Invariants

<!-- z-mind:begin -->
Z-MIND IS ACTIVE. Consult `engineering-rules.md` or `zmind_rules` for full catalog.

- **SOLID & Deep Modules (`R_CORE`)**: Single responsibility, simple interfaces over deep logic, standard English identifiers.
- **TDD (`R_TDD`)**: Failing reproduction test first before fixing bugs; preserve 100% contracts during refactors.
- **Perf & Async (`R_PERF`)**: Avoid hot-path GC allocations (`Span<T>`, `ArrayPool<T>`), parameterized indexed DB queries with row locks, propagate `CancellationToken`, `ConfigureAwait(false)` in libs, no `async void` outside top-level handlers.
- **Zero-Trust Proof (`R_PROOF`)**: Back completion claims with exit code `0`, test counts, or benchmark deltas; omit self-praise.
- **Multi-Agent Tier Routing (`R_TEAM`)**: For multi-file tasks (>=4 modified or >5 explored), dispatch `scout` (`flash_lite`), `research` (`flash`), disjoint `self` coders (`flash`, $P_1 \cap P_2 = \emptyset$), and `architect`/`investigator`/security-core `reviewer` (`pro` or `inherit`); escalate `flash` after 2 consecutive failures. Batch `invoke_subagent`, rely on reactive wakeup, and clean up via `manage_subagents`.
<!-- z-mind:end -->
