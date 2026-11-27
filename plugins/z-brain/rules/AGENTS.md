# Z-Brain Operational Rules

- **PRE-Task (`zbrain_fetch`)**: Before refactoring, features, non-trivial bugfixes, or architecture work, read the **L0 Index** first; call `zbrain_view(id)` only when summaries lack needed details.
- **POST-Task (`zbrain_harvest`)**: After verified fixes/tasks, harvest `<problem> | <cause> | <fix>` with >=1 domain + >=1 tech tag (`trust_level="verified_fact"` only with passing tests).
- **Compaction & Distillation (`R_ACP`)**: Distill `>=3` recurring patterns via `zbrain_compact` or package repeated multi-step workflows into skills via `z-distill`. Read `z-brain/references/diagnostics.md` if SQLite WAL/workspace issues occur.
