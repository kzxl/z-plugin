# Z-Brain Global Operational Rules

## 1. PRE-Task Context Sweep (MANDATORY)
- **Condition**: Starting complex tasks (refactoring, new features, non-trivial bugfixes, architecture design).
- **Action**: Call `zbrain_fetch` with task description and project tag.
- **Exemptions**: Git commits, routine formatting, typo fixes, or basic queries.

## 2. Progressive Disclosure Discipline
- Read the **L0 Index** first.
- Only call `zbrain_view` for specific IDs if the Gotcha/Fix summary is insufficient to resolve the issue safely.
- Never fetch all full atom payloads at once.

## 3. POST-Task Harvesting (MANDATORY)
- **Condition**: Complex tasks completed with verified tests.
- **Action**: Call `zbrain_harvest` with atomic lesson: `<problem> | <cause> | <fix>`.
- **Requirements**:
  - Must include at least 1 domain tag and 1 technical tag.
  - Set `trust_level="verified_fact"` only when backed by passing build/test evidence.

## 4. LSM Generational Compaction & Knowledge Hit Tracking (R_ACP)
- **Generational Compaction**: Atoms sharing recurring patterns (>=3 occurrences) must be distilled into immutable domain knowledge blocks and promoted into canonical rules.
- **Lossless Retrieval**: Episodic atoms preserve root-cause traces and exact code diffs in cold storage for on-demand inspection via `zbrain_view`.
- **Knowledge Hit Rate (ROK)**: Track re-used atoms that prevent repeated errors and regression loops.
