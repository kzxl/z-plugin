---
name: z-distill
description: Distills a completed multi-step workflow or recurring z-brain pattern into a reusable executable skill or instruction workflow. Use when asked to turn a workflow into a skill, package a repeated procedure, or promote >=3 recurring z-brain atoms into an automated skill. Do not use for single one-off lessons; use zbrain_harvest instead.
---

# Z-Distill — Workflow-to-Skill Distiller

Transforms proven multi-step interactions or compacted `z-brain` patterns into lean, verifiable Antigravity skills.

## Decision Table

| Workflow Nature | Do | Never Do | Verify |
| :--- | :--- | :--- | :--- |
| Needs API calls, file I/O, or computation | Build Node ESM CLI skill (`--output` file + required `--limit`) | Dump raw payloads to stdout or hardcode silent caps | `node --check` exit `0` + sample run writes output file |
| Pure orchestration / reasoning protocol | Write concise instruction-only `SKILL.md` with decision tables | Invent dummy scripts when zero code is needed | Every step ends on a checkable criterion |
| Overlaps existing `z-*` tool or repo helper | Reference existing skill / `zgate_find_helpers` match | Reimplement existing MCP or helper logic | Zero duplicate utilities (`R_REUSE`) |

## Phase 1: Pattern & Reuse Survey

1. Query `zbrain_query` / `zbrain_timeline` (and `zbrain_compact` if >=3 recurring atoms exist) to extract exact inputs, edge cases, and failure modes.
2. Call `zgate_find_helpers` to ensure existing repository utilities are reused rather than duplicated.
- **Done when:** Steps, inputs, outputs, and reusable dependencies are listed without gaps.

## Phase 2: Scope & Error-Policy Alignment

Ask at most 2–3 focused questions per turn if any boundary is unclear:
1. Rigid vs. flexible steps (fail fast vs. fallback cascade).
2. Explicit required flags (e.g. `--limit`, `--output`) so partial results are never mistaken for complete datasets.
3. Placement: project-local (`.agents/skills/<name>/`) vs. global (`~/.gemini/config/skills/<name>/` or plugin `skills/<name>/`).
- **Done when:** Placement, error policy, and CLI/instruction shape are confirmed.

## Phase 3: Implementation

Follow [references/cli-skill-template.md](references/cli-skill-template.md) for CLI-backed skills:
- **File-First Output:** Write full data to `--output <path>`; print only status + file path to stdout.
- **Cross-Process Rate Limiting:** Use file-lock pacing when parallel subagents share external endpoints or local caches.
- **Actionable Errors:** Surface full HTTP/CLI error bodies on failure so the agent can self-correct without guessing.
- **Done when:** `SKILL.md` (with sharp `description`, decision table, and checkable criteria) and any script files are written.

## Phase 4: Empirical Verification

1. Run `node --check <script>` (or runtime syntax check) and execute one representative invocation.
2. Record the new skill milestone with `zbrain_observe(type: "milestone", title: "...", summary: "...")`.
- **Done when:** Syntax check and sample run exit `0` and output file is non-empty on disk.
