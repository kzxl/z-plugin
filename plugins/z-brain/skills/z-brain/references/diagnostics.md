# Z-Brain Diagnostic & Troubleshooting Guide

| Error / Symptom | Root Cause | Remediation |
| :--- | :--- | :--- |
| `SQLITE_BUSY` / database locked across agents | Concurrent write without waiting for WAL checkpoint or stale spool | Retry once after `100ms`; run `zbrain_status` to check DB path and spool queue; avoid deleting `-wal`/`-shm` while MCP server is active |
| `zbrain_history` / `zbrain_impact` points to wrong folder | `ZBRAIN_WORKSPACE` inherited `"."` or IDE install directory | Unset `ZBRAIN_WORKSPACE` or pass explicit workspace path; `resolveWorkspace()` rejects IDE install paths (`antigravity`, `Programs`) |
| `zbrain_fetch` returns irrelevant or noisy older atoms | Duplicate/superseded lessons not yet compacted | Run `zbrain_compact(action: "scan")` then `zbrain_compact(action: "apply")` or mark old atom superseded |
| Hooks do not record edits (`edit-observer`) | Spool flushed lazily or file outside workspace root | Call `zbrain_changes` (triggers `flushSpool` + `maybeReconcile`) and confirm target file is under active `workspacePaths` |
| Recurring `>=3` lessons stay passive | Knowledge stayed in SQLite instead of becoming a workflow/skill | Use the `z-distill` skill to package recurring procedures into an executable CLI or instruction skill |
