# z-craft

Autonomous Software Craftsmanship & Disciplined Vibe-Coding Engine for autonomous AI coding agents (**Antigravity 2.0** & **ZCode**).

`z-craft` enforces the canonical **Anti-AI-Slop Standard** (`AS-01..AS-12`, `AS-C1..AS-C5`, `AS-I1`, `AS-D1..AS-D4`, `AS-S1`), synthesizes 4-state UX micro-contracts, audits WCAG 2.1 AA token contrast, scaffolds compliant multi-platform components, and provides interactive previews and non-destructive micro-checkpoints.

---

## Components

| Component | What it does |
| :--- | :--- |
| MCP tool `zcraft_spec` | Synthesizes natural language prompts into a 4-state UX Micro-Contract with `z-gate` helper reuse and `z-brain` gotcha recall |
| MCP tool `zcraft_scaffold` | Generates 4-state enterprise components (`react`, `wpf`, `winforms`) passing all canonical anti-slop rules |
| MCP tool `zcraft_lint_ui` | Canonical Anti-Slop linter supporting snippets, files/directories, git `--diff`, motion profiles (`enterprise`/`expressive`), inline suppressions, and WCAG 2.1 token contrast audits (`tokensFile`) |
| MCP tool `zcraft_preview` | Generates self-contained interactive HTML/Tailwind previews themed with Antigravity host semantic tokens |
| MCP tool `zcraft_checkpoint` | Manages non-destructive shadow snapshots in `.zero-craft/snapshots/` for 1-click rollback |
| MCP tool `zcraft_status` | Reports active craftsmanship rule catalog and checkpoint inventory |
| CLI `scripts/cli.mjs` | Standalone CLI facade (`spec`, `lint`, `preview`, `checkpoint`, `status`) |
| Skill `z-craft` + `references/anti-slop-standard.md` | Canonical standard and workflow instructions |
| Rules `rules/AGENTS.md` | Positive-first universal invariants for UI craftsmanship |

---

## Canonical Rule Taxonomy

| Group | Rule IDs | Scope |
| :--- | :--- | :--- |
| **UI Visual, Motion & Ergonomics** | `AS-01`..`AS-12` | Token discipline (no arbitrary hex), neutral black elevation, one-shot compositor motion & GSAP allowlist (`AS-03a..f`), rectangular radius, icon/no-emoji chrome, flat surfaces (no gradients), dense row bands & zebra opt-in (`AS-07z`), WCAG 2.1 AA contrast & no `backdrop-blur`, `:focus-visible` & native desktop focus, chart restraint, verb-first copy & no placeholders, 4-state matrix |
| **Interaction & Structure** | `AS-I1`, `AS-S1` | No dead click handlers/links; no nested `<Card><Card>` wrappers |
| **Desktop ERP Runtime** | `AS-D1`..`AS-D4` | DevExpress `BeginUpdate`/`EndUpdate` wrapping around loop mutations, WinForms wait indicator on async work, WPF `Dispatcher.InvokeAsync` inside `async` methods, centralized font definitions |
| **Code Hygiene** | `AS-C1`..`AS-C5` | Self-documenting names (diff-scoped), no commented-out dead code, no AI attribution metadata in source |

---

## CLI Usage

```bash
# Generate UX micro-contract from a prompt
node scripts/cli.mjs spec "Warehouse stock reconciliation screen with lot filter"

# Lint git diff (added lines only, default enterprise profile)
node scripts/cli.mjs lint --diff

# Lint a file or directory across web, CSS, XAML, and C#
node scripts/cli.mjs lint src/components --profile enterprise

# Audit CSS custom properties for WCAG 2.1 AA contrast (>= 4.5:1 text, >= 3:1 input/focus)
node scripts/cli.mjs lint --tokens src/styles/globals.css

# Generate interactive preview widget
node scripts/cli.mjs preview "Inventory Dashboard"

# Create, list, and restore shadow checkpoints
node scripts/cli.mjs checkpoint create before_card_redesign src/components/Table.tsx
node scripts/cli.mjs checkpoint list
node scripts/cli.mjs checkpoint restore before_card_redesign

# Check status and active rules
node scripts/cli.mjs status
```

---

## Testing & Verification

```bash
node bench/craft-test.mjs
```
