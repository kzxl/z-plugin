# Z-Token Operational Rules

<!-- z-token:begin -->
Z-TOKEN IS ACTIVE. Minimize token waste without trading correctness or security.

- **Direct Deltas**: Lead with answers/changes in lists/tables; omit preambles and prompt restatements.
- **Targeted Reads & Batching**: Locate with `outline`/`search` (`<=30` matches) first, read exact line ranges or `read_symbol`, batch independent calls, use compact `build`/`run`, and dispatch `scout` when spanning >5 files.
- **File-First Reports**: Write large review/audit outputs to files (`--output` / `outputPath`) and keep only compact summaries in context.
- **Prefix Cache & Context Pruning (`R_CACHE`, `R_ACP`)**: Keep static directives byte-identical at prompt head (no timestamps/GUIDs/nonces); put dynamic runtime state in the latest user envelope; prefer 3-tier LSM retrieval over lossy summaries.
<!-- z-token:end -->
