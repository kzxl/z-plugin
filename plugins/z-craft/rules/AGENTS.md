# Z-Craft Engineering Invariants

<!-- z-craft:begin -->
Z-CRAFT IS ACTIVE. Build **quiet**, **dense**, **flat** interfaces that move **once**, backed by **self-documenting** code (`R_ANTI_SLOP`, `R_UI`).

## 1. Canonical Craftsmanship Invariants (`AS-01`..`AS-12`, `AS-I1`, `AS-D1`..`AS-D4`, `AS-C1`..`AS-C5`)
- **Quiet Surfaces & Token SSoT (`AS-01`, `AS-06`)**: Map every color to semantic design tokens (`--bg-canvas`, `--bg-surface`, `--bg-elevated`, `--border-default`, `--text-primary`, `--brand-primary`, or mapped Tailwind tokens). Keep surfaces flat and solid; use at most one primary accent per quadrant.
- **Crisp Elevation & Contrast (`AS-02`, `AS-08`, `AS-09`)**: Express hierarchy via typography scale, weight, 1px borders, and neutral black elevation tokens (`--elevation-0/1/overlay`). Maintain WCAG 2.1 AA contrast (`>= 4.5:1` text, `>= 3:1` inputs/focus), opaque surfaces (`>= 90%`), and visible `:focus-visible` outlines.
- **Disciplined Motion (`AS-03`)**: Run motion **once** on compositor properties (`transform`, `opacity`) using duration tokens (`--duration-fast/base/data`), reduced-motion gating in CSS and JS, and explicit unmount cleanup.
- **Honest Chrome & Interactions (`AS-04`, `AS-05`, `AS-11`, `AS-I1`, `AS-S1`)**: Use rectangular radii (`--radius-xs/sm/md/lg`), plain verb-first single-language copy with domain-realistic sample data, 16px project icons (no emoji in chrome), real click handlers, and single-level card containment.
- **Desktop ERP Runtime & Code Hygiene (`AS-D1`..`AS-D4`, `AS-C1`..`AS-C5`)**: Wrap DevExpress batch mutations in `BeginUpdate`/`EndUpdate` (never across `await`), use `await Dispatcher.InvokeAsync` in async WPF methods, delete dead code, and keep provenance in git.

## 2. Mandatory 4-State Matrix (`R_UX_MATRIX`, `AS-12`)
Every interactive screen or data view must handle all 4 states:
1. **Populated (Default)**: Dense tabular layout (`24-28px` desktop, `32-40px` web), right-aligned `tabular-nums`, pagination or virtualization.
2. **Loading (Async > 300ms)**: Skeleton rows matching real row height and column structure (static under reduced motion).
3. **Empty (Zero Data)**: Muted icon (`<= 32px`) + concise single-language message distinguishing "no records yet" vs "no filter match" + actionable CTA.
4. **Error (Failure)**: Clear cause + actionable Retry trigger without leaking raw stack traces.

## 3. Verification & Snapshots (`R_CANVAS_PROOF`, `R_SNAPSHOT`)
- Audit UI changes with `zcraft_lint_ui` (diff-scoped or file/directory) and WCAG token checks (`tokensFile`) until zero `MUST` errors remain and craftsmanship score `>= 90/100`.
- Save a shadow checkpoint via `zcraft_checkpoint(action: "create", name: "...")` before speculative UI restructurings.
<!-- z-craft:end -->
