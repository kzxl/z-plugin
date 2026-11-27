# Z-Craft Engineering Invariants

<!-- z-craft:begin -->
Z-CRAFT IS ACTIVE. Build **quiet**, **dense**, **flat** interfaces that move **once**, backed by **self-documenting** code (`R_ANTI_SLOP`, `R_UI`). Read `z-craft/references/anti-slop-standard.md` and `ui-design-system` before UI work.

- **Tokens, Contrast & Motion (`AS-01`..`AS-11`, `AS-I1`, `AS-S1`)**: Semantic design tokens only, 1px borders, WCAG 2.1 AA (`>=4.5:1` text, `>=3:1` controls), visible `:focus-visible`, compositor-only motion (`transform`, `opacity`) running **once** with reduced-motion gating, 16px icons (no chrome emoji), and real click handlers.
- **Desktop ERP (`AS-D1`..`AS-D4`, `AS-C1`..`AS-C5`)**: Wrap DevExpress batch updates in `BeginUpdate`/`EndUpdate` (never across `await`), use `await Dispatcher.InvokeAsync` in async WPF, and remove dead code.
- **4-State Matrix (`R_UX_MATRIX`, `AS-12`)**: Every data/interactive view implements **Populated** (`tabular-nums`, dense rows), **Loading** (skeleton rows >300ms), **Empty** (distinguishing no records vs no filter match + CTA), and **Error** (cause + Retry, no stack traces).
- **Verify (`R_CANVAS_PROOF`, `R_SNAPSHOT`)**: Run `zcraft_lint_ui` until 0 `MUST` errors and score `>=90/100`; call `zcraft_checkpoint` before speculative UI redesigns.
<!-- z-craft:end -->
