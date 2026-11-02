# Z-Craft Engineering Invariants

<!-- z-craft:begin -->
Z-CRAFT IS ACTIVE. Disciplined vibe-coding, software craftsmanship, and anti-slop standards are mechanically enforced.

## 1. Zero AI Slop (R_ANTI_SLOP, R_UI)
- **Design Token Discipline**: Never hardcode arbitrary hex colors (`#7c3aed`, `#8b5cf6`, `#ec4899`) directly in JSX, TSX, HTML, or CSS classes. Map all colors to design system tokens (`bg-background`, `text-foreground`, `border-border`, or CSS variables).
- **No Gratuitous AI Gradients**: Strictly forbid neon purple/pink/indigo ambient gradient blobs (`bg-gradient-to-r from-purple-500 to-indigo-500`). Use clean, crisp, solid enterprise surfaces.
- **Crisp Surface Elevation**: Avoid floaty oversized drop-shadows (`shadow-2xl`). Use 1px subtle borders (`border border-border`) and low-elevation shadows (`shadow-xs`, `shadow-sm`).
- **No Dead Interactions**: Never ship dead handlers (`onClick={() => {}}` or `href="#"`). Wire up realistic mock actions, loading spinners, or clear disabled tooltips.

## 2. Mandatory 4-State Matrix (R_UX_MATRIX)
Every interactive screen or data component must account for 4 distinct UI states:
1. **Populated (Default)**: Clean data display, compact row heights (36-40px in enterprise apps), pagination or virtualization.
2. **Loading (Async)**: Skeleton shimmers matching the target layout. Never leave a blank screen or a single unstyled spinning circle.
3. **Empty (Zero Data)**: Clear explanation distinguishing between "no items created yet" and "no search match", paired with an actionable CTA button.
4. **Error (Failure)**: User-friendly diagnostic message with an explicit "Retry" trigger. Never leak raw unformatted HTTP 500 error dumps.

## 3. Generative Visual Proof (R_CANVAS_PROOF)
- Before presenting UI modifications to the user, verify visual fidelity via `zcraft_preview` or `zcraft_lint_ui`.
- Ensure software craftsmanship score $\ge 90/100$.

## 4. Vibe Time-Machine (R_SNAPSHOT)
- Before executing speculative UI restructurings or radical redesign prompts, save a shadow checkpoint via `zcraft_checkpoint(action: "create", name: "...")` to allow 1-click rollback without dirtying git commit history.
<!-- z-craft:end -->
