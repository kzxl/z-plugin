---
name: ui-anti-ai-slop-standard
description: Canonical Anti-AI-Slop Standard for UI and code craftsmanship. Defines AS-01..AS-12 (UI), AS-C1..AS-C5 (Code Hygiene), AS-I1 (Interaction Integrity), AS-D1..AS-D4 (Desktop ERP Runtime), AS-S1 (Structural Discipline), motion profiles, and completion criteria.
desc: Canonical Anti-AI-Slop Standard — quiet, dense, flat UI and self-documenting code
rules: [R_CORE, R_UI, R_ANTI_SLOP]
---

# Anti-AI-Slop Standard (Canonical)

Target: **quiet**, **dense**, **flat** interfaces that move **once**, and **self-documenting** code.

- Concrete token values (hex, px, ms) live only in `ui-design-system/references/tokens.md`. This standard references token names.
- Severity: `MUST` = blocking error (linter exit code 1). `SHOULD` = warning (reviewer decides).

---

## 1. Leading Words

| Word | Region it anchors | Laws |
| :--- | :--- | :--- |
| **quiet** | Color, shadow, ornament restraint | AS-01, AS-02, AS-05, AS-10, AS-11 |
| **dense** | Row height, padding, data per screen | AS-07, AS-12, AS-S1 |
| **flat** | Surfaces, progress bars | AS-06 |
| **once** | Motion & compositor discipline | AS-03 |
| **self-documenting** | Names over narrating comments | AS-C1, AS-C3 |
| **responsive & honest** | Real interactions, desktop UI thread safety | AS-I1, AS-D1..AS-D4 |
| *Dead Code*, *Middle Man*, *Speculative Generality* | Code bloat (Fowler) | AS-C2, AS-C4, AS-C5 |

---

## 2. Canonical Laws

### 2.1 UI Visual, Motion & Ergonomics (`AS-01`..`AS-12`)

| ID | Law | Severity | Why |
| :--- | :--- | :---: | :--- |
| `AS-01` | One brand accent (`--brand-primary`). Semantic states use `--{state}-fg`, `-solid`, `-bg`, `-border` with HSL saturation `<= 60%`. Map all UI colors to design tokens; zero arbitrary hardcoded hex literals outside token/theme files. | MUST | Operators read enterprise screens for hours; saturated and ad-hoc colors compete with data and break themes. |
| `AS-02` | Elevation comes exclusively from `--elevation-0`, `--elevation-1`, `--elevation-overlay` (neutral black only) and crisp 1px borders (`--border-default`). Hierarchy comes from size, weight, and text tokens. No `text-shadow`, no colored shadows, no zero-offset glow, no oversized ambient shadows. | MUST | Colored glow blurs edges and reads as decorative noise. |
| `AS-03` | Motion runs **once** in response to a user action or active I/O, on compositor-only properties (`transform`, `opacity`), using motion tokens (`--duration-fast/base/data`), reduced-motion gating in CSS and JS, and a cleanup path (checklist in §4.3). | MUST | Idle loops pull attention away from data; layout transitions cause jank. |
| `AS-04` | Corner radius comes from `--radius-xs`, `--radius-sm`, `--radius-md`, `--radius-lg`. Pill radius (`--radius-pill`) is restricted to avatars, notification counts, and active spinners. | MUST | Rectangular rhythm aligns with grid columns. |
| `AS-05` | Icons come from the project icon set at `16px`, stroke `1.75`, on navigation and action bars only. UI chrome uses plain words; no emoji. | MUST | Icons are functional anchors, not decorative filler. |
| `AS-06` | Surfaces are **flat**: `--bg-canvas`, `--bg-surface`, `--bg-elevated`. Containers, cards, and progress bars use one solid fill; no gradients. | MUST | Flat fills keep text contrast predictable across modes. |
| `AS-07` | Rows stay **dense** within the platform band (§3). Zebra striping (`AS-07z`) is off by default; opt in only on read-only grids with `>= 8` visible columns using `--bg-elevated`. | SHOULD | Higher data density reduces scrolling and visual fatigue. |
| `AS-08` | Text contrast `>= 4.5:1` and non-text UI (`--border-input`, focus indicators, icons) `>= 3:1` against actual background (WCAG 2.1 AA). Surface opacity `>= 90%`; no `backdrop-blur` glassmorphism. | MUST | Blur degrades legibility and fails WCAG contrast guarantees. |
| `AS-09` | Web keeps visible `:focus-visible` outline (`2px solid var(--brand-primary)`, `outline-offset: 2px`). Desktop keeps native focus cues. Removing an outline requires an explicit replacement in the same file. | MUST | Keyboard-driven operators require clear focus tracking. |
| `AS-10` | Charts use `<= 6` muted categorical hues in one S/L band (`S 35-55%`), one highlighted series in `--brand-primary`, others neutral; flat 2D, area opacity `<= 20%`. | SHOULD | One clear analytical story per chart. |
| `AS-11` | UI copy uses verb-first labels (`1-3` words, `<= 20` chars), cause + action errors, single active language (no bilingual parentheticals), realistic domain sample data (no dummy placeholders), and no exclamation marks in system messages. | SHOULD | Copy is an operational instrument, not marketing pitch. |
| `AS-12` | Mandatory 4-State Matrix: Populated (dense, tabular numbers), Loading (`> 300ms`: skeleton rows at real row height, static under reduced motion), Empty (one muted line icon `<= 32px` + one sentence distinguishing no-data vs no-match + optional action), Error (cause + explicit Retry trigger). | SHOULD | Prevents blank screens, layout shift, and dead ends. |

### 2.2 Interaction & Structural Discipline (`AS-I1`, `AS-S1`)

| ID | Law | Severity | Why |
| :--- | :--- | :---: | :--- |
| `AS-I1` | No dead interactions: every interactive button or link wires to a real handler, loading state, or explicit disabled state with tooltip explanation. | MUST | Dead controls erode operator trust immediately. |
| `AS-S1` | Structural restraint: keep card containment to one level (no nested `<Card><Card>`), avoid repetitive 4-KPI banner templates when data calls for a focused table/summary, and keep at most one primary CTA per visual quadrant. | SHOULD | Eliminates Gen-2 structural AI slop and visual clutter. |

### 2.3 Desktop ERP Runtime Craft (`AS-D1`..`AS-D4`)

| ID | Law | Severity | Why |
| :--- | :--- | :---: | :--- |
| `AS-D1` | Batch updates on DevExpress `GridControl`/`GridView` inside loops must be wrapped in `BeginUpdate()` / `try { ... } finally { EndUpdate(); }`. Never hold `BeginUpdate()` across an `await`. | MUST | Prevents 10x repaint stalls and frozen grid surfaces during async I/O. |
| `AS-D2` | Async background work (`Task.Run`, `BackgroundWorker`) inside WinForms forms/controls should display a non-blocking wait indicator (`SplashScreenManager.ShowOverlayForm` / `ShowWaitForm`). | SHOULD | Keeps operators informed during long-running operations. |
| `AS-D3` | Never call blocking `Dispatcher.Invoke(...)` inside an `async` method in WPF; use `await Dispatcher.InvokeAsync(...)`. | MUST | Eliminates UI thread deadlocks. |
| `AS-D4` | Avoid instantiating hardcoded `new Font(...)` outside centralized theme/designer definitions; inherit from `WindowsFormsSettings.DefaultFont` or theme resources. | SHOULD | Preserves DPI scaling and skin consistency. |

### 2.4 Code Hygiene (`AS-C1`..`AS-C5`)

| ID | Law | Severity | Why |
| :--- | :--- | :---: | :--- |
| `AS-C1` | **Self-documenting** names carry intent. Comments state only a non-obvious WHY in one line or match the allowlist (§5.1). Diff-scoped to added/modified lines. | SHOULD | Narrating comments drift from code. |
| `AS-C2` | *Dead Code*: delete obsolete code; never leave commented-out code blocks. | MUST | Git preserves full version history. |
| `AS-C3` | Provenance lives in git: no AI/agent attribution tags, author lines, or changelog dates in source files. | MUST | Source describes present behavior; git tracks history. |
| `AS-C4` | *Middle Man* / *Speculative Generality*: every abstraction passes the deletion test or crosses a real variation seam (two adapters or runtime plugin contract). | SHOULD | Indirection without variation adds maintenance tax. |
| `AS-C5` | Zero unused imports, variables, or files. | MUST | Noise obscures live execution paths. |

---

## 3. Platform Row Bands (`AS-07`)

| Platform | Band | Default |
| :--- | :---: | :---: |
| Desktop (WinForms / WPF) | `24-28px` | `28px` |
| Web data table | `32-40px` | `36px` (compact `32px`) |
| Mobile list | `>= 48dp` | `48dp` |

- Right-align numeric columns with `font-variant-numeric: tabular-nums`.
- Separate rows with `1px solid var(--border-subtle)` dividers and `--bg-hover` on hover.

---

## 4. Motion (`AS-03`)

### 4.1 Profiles

Declare once per repository in `.project-rule.md` frontmatter: `ui_profile: enterprise` (default) or `ui_profile: expressive`.

| Profile | Scope | Allowed Ladder Levels |
| :--- | :--- | :--- |
| `enterprise` (default) | ERP, HelpDesk, internal tools, WinForms/WPF, admin dashboards | `L0-L2`; `L3` only from enterprise allowlist (§4.4) |
| `expressive` | Marketing, landing pages, onboarding, games | `L0-L3` full toolset; §4.3 items 2-7 and `AS-08` remain binding |

### 4.2 Motion Decision Ladder

| Level | Mechanism | Use for |
| :---: | :--- | :--- |
| `L0` | No animation | Data refresh, static content |
| `L1` | CSS transition (`--duration-fast` / `--duration-base`) on `transform`, `opacity`, `color` | Hover, focus, expand, tab switch |
| `L2` | CSS keyframes or WAAPI, `<= 200ms`, runs once | Overlay enter/exit, toast |
| `L3` | GSAP within profile allowlist | Reorder, drag, coordinated multi-step, chart transition |

### 4.3 `AS-03` Checklist

1. **Once**: triggered by user action or active I/O; stops when complete.
2. **Compositor-only** (`AS-03a`): animate `transform` and `opacity`; progress uses `transform: scaleX(var(--progress))`.
3. **Tokens**: durations strictly from `--duration-fast`, `--duration-base`, `--duration-data`.
4. **Reduced motion** (`AS-03c`): gate both CSS (`@media (prefers-reduced-motion: reduce)`) and JS (`matchMedia` / `gsap.matchMedia()`).
5. **Cleanup** (`AS-03d`): revert JS animations on unmount or route change (`useGSAP`, `ctx.revert()`, `kill()`).
6. **Non-interactive when hidden**: opacity `0` pairs with `visibility: hidden` (or `autoAlpha`).
7. **Scoped `will-change`** (`AS-03f`): never set on global selectors (`*`, `html`, `body`, `:root`).

### 4.4 GSAP Enterprise Allowlist (`AS-03e`)

- **Allowed**: one-shot `gsap.to`/`from`/`timeline` (`<= --duration-data`), `Flip`, `Draggable`, `gsap.utils`, `quickTo`.
- **Forbidden in `enterprise`**: `ScrollSmoother`, `ScrollTrigger` `pin`/`scrub`, `SplitText`, `ScrambleTextPlugin`, `MorphSVGPlugin`, `DrawSVGPlugin`, `CustomBounce`, `CustomWiggle`, `Physics2DPlugin`, and endless `repeat: -1` loops (`AS-03b`).

---

## 5. Code Hygiene & Suppressions

### 5.1 Comment Allowlist (`AS-C1`)
1. Section banners (`// ── Query ──`).
2. Public API docstrings (`///` or `/** ... */`) stating WHAT and WHY.
3. Single-line non-obvious workaround notes (optionally citing a ticket ID).

### 5.2 Inline Suppression
Append `anti-slop-ignore <ID>: <reason>` on the same line (comma-separated IDs allowed). A non-empty reason is mandatory; suppressions without a reason fail with `AS-SUPPRESS`.

---

## 6. Completion Criteria

| Criterion | Verified by |
| :--- | :--- |
| Zero `MUST` errors on changed lines | `zcraft_lint_ui(diff: true)` or `node scripts/cli.mjs lint --diff` (exit `0`) |
| Every text/surface token pair `>= 4.5:1` and non-text `>= 3:1` | `zcraft_lint_ui(tokensFile: ...)` or `node scripts/cli.mjs lint --tokens <file>` |
| All 4 UI states implemented (Populated, Loading, Empty, Error) | `zcraft_spec` contract + reviewer |
| Every suppression carries an explicit reason | Linter suppression summary |
