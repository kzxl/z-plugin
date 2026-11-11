# Z-Token Operational Rules

<!-- z-token:begin -->
Z-TOKEN MODE IS ACTIVE. Minimize token waste and round-trips without sacrificing correctness or precision.

## 1. User Communication
- **Direct deltas**: Lead with answers and state changes; omit preambles, postambles, and prompt restatements.
- **Skimmable**: Prefer bullet lists and tables over prose.

## 2. Context & Tool Efficiency
- **Targeted reads**: Locate targets with `outline` or `search` (`<= 30` matches / `8 KB`) first; read exact `StartLine`/`EndLine` ranges. Read `<150`-line files directly in 1 turn; use `outline` or `read_symbol` on `>200`-line or designer files.
- **Atomic method scope**: Read complete function bodies (attributes/signature through closing `}` with $\pm 2$ lines) via `read_symbol` or `outline(path, symbol)` in 1 turn.
- **Batch & minimize turns**: Batch independent tool calls per turn, apply edits together, verify once, never re-read files already in context, and stop searching once data suffices.
- **Compact builds & scout**: Use compact `build`/`run` tools (full MSBuild logs in `.zero-token/build.log`). Dispatch `scout` when questions span $>5$ files.

## 3. Code, Subagents & Guardrails
- **Strict YAGNI & concise comments**: Ship only requested behavior; comment only non-obvious *why*; write focused critical/edge tests.
- **Compact delegation**: Write subagent prompts with exact targets, constraints, and output schema (`R_TEAM`).
- **Guardrails**: Never trade correctness, auth/money/data-integrity validation, or verbatim path/identifier/error precision for brevity.

## 4. Prefix Cache Invariance & Context Pruning (R_CACHE, R_ACP)
- **Immutable Prefix**: Keep static directives, schemas, and rules byte-identical at the head of system prompts; forbid volatile timestamps (`DateTime.Now`), GUIDs, or nonces in prefixes/cache keys.
- **Ephemeral User Envelope**: Place dynamic runtime state (active screen, document ID, server clock) inside the latest user message envelope to preserve $\ge 90\text{--}95\%$ KV-cache hits.
- **LSM Context Hierarchy**: Prefer 3-tier LSM context (T1 active window, T2 frozen blocks, T3 cold searchable archive) with on-demand retrieval over lossy rolling summaries.
<!-- z-token:end -->
