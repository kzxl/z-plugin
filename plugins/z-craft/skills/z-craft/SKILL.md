---
name: z-craft
description: Autonomous Software Craftsmanship & Disciplined Vibe-Coding Engine. Translates natural language vibes into anti-slop, production-grade frontend & desktop software with UX micro-contracts, WCAG & canonical anti-slop linting, 4-state scaffolding, and live canvas preview.
---

# Z-Craft: Autonomous Software Craftsmanship

Use `z-craft` when building or refining user interfaces, web applications, dashboards, or desktop UI (React, Tailwind, WPF XAML, WinForms DevExpress).

Before writing or auditing UI code, consult the canonical rules in [references/anti-slop-standard.md](references/anti-slop-standard.md) and concrete token values in the `ui-design-system` skill.

## When to Use

1. **Create or redesign a UI screen from a prompt**:
   - Call `zcraft_spec` to synthesize the prompt into a 4-state UX micro-contract (cross-referenced with `z-gate` helpers and `z-brain` gotchas).
   - Optionally call `zcraft_scaffold` (`react`, `wpf`, or `winforms`) for a clean 4-state starting component.
2. **Generate an interactive visual preview**:
   - Call `zcraft_preview` to generate a self-contained HTML/Tailwind widget themed with Antigravity host CSS variables (`gstatic` Tailwind CDN).
3. **Validate code & tokens against canonical Anti-Slop laws**:
   - Run `zcraft_lint_ui` on a snippet, file, directory, git `--diff` (`diff: true`), or CSS token sheet (`tokensFile`) to verify `AS-01..AS-12`, `AS-C1..AS-C5`, `AS-I1`, `AS-D1..AS-D4`, `AS-S1`, and WCAG 2.1 AA contrast.
   - Fix all `MUST` errors before finalizing.
4. **Before speculative visual redesigns**:
   - Call `zcraft_checkpoint(action: "create", name: "experiment_name")` for 1-click rollback without dirtying git history.

## Core MCP Tools

- `zcraft_spec`: Generate 4-state UX micro-contract (Populated, Loading, Empty, Error) + edge-case defenses + `z-gate`/`z-brain` mesh insights.
- `zcraft_scaffold`: Scaffold a 4-state enterprise UI component (`react`, `wpf`, `winforms`) passing all canonical anti-slop checks.
- `zcraft_lint_ui`: Canonical Anti-Slop linter supporting snippets, files/directories, git diff mode, `enterprise`/`expressive` motion profiles, inline `anti-slop-ignore` suppressions, and WCAG 2.1 token contrast audits.
- `zcraft_preview`: Generate an interactive HTML/Tailwind widget compatible with Antigravity `<agent-embed>` and host light/dark theme tokens.
- `zcraft_checkpoint`: Non-destructive shadow snapshots (`create`, `list`, `restore`).
- `zcraft_status`: Report active craftsmanship rule catalog and checkpoints.

## Engineering Invariants

1. **Five Leading Words (`R_ANTI_SLOP`)**: Quiet, dense, flat interfaces that move once, and self-documenting code (`AS-01..AS-12`, `AS-C1..AS-C5`).
2. **Mandatory 4-State Matrix (`R_UX_MATRIX`)**: Always implement Populated, Loading skeleton, Empty + CTA, and Error + Retry.
3. **High Density & Single Language**: Compact enterprise rhythm (`24-28px` desktop, `32-40px` web), `tabular-nums`, single active language, and real interactive handlers (`AS-I1`).
