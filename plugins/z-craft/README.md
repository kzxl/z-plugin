# z-craft

Autonomous Software Craftsmanship & Disciplined Vibe-Coding Engine for autonomous AI coding agents (**Antigravity 2.0** & **ZCode**).

`z-craft` transforms natural language prompts into production-grade frontend & product software with zero AI slop, disciplined UX state contracts, interactive generative canvas widgets, and non-destructive micro-checkpoints.

---

## 📦 Components

| Component | What it does |
|---|---|
| MCP tool `zcraft_spec` | Synthesizes natural language vibes into a 4-state UX Micro-Contract (Default, Loading, Empty, Error) |
| MCP tool `zcraft_lint_ui` | Scans React, Tailwind, HTML, and XAML for arbitrary hex colors, neon gradients, dead clicks, and missing states (`R_ANTI_SLOP`) |
| MCP tool `zcraft_preview` | Generates a self-contained, interactive HTML/Tailwind canvas widget for live visual verification |
| MCP tool `zcraft_checkpoint` | Manages non-destructive shadow snapshots in `.zero-craft/snapshots/` for 1-click rollback without polluting git history |
| MCP tool `zcraft_status` | Reports active craftsmanship metrics, checkpoint counts, and rule catalog |
| PostToolUse Hook | Audits UI file modifications in real-time and warns against AI-slop patterns |
| CLI `scripts/cli.mjs` | Standalone CLI facade for terminal workflows (`spec`, `lint`, `preview`, `checkpoint`, `status`) |
| Skill `z-craft` | Teaches agents to establish micro-contracts, eliminate slop, and provide visual proof |
| Rules `rules/AGENTS.md` | Universal engineering invariants for software craftsmanship and UI quality |

---

## 🏛️ Core Capabilities

### 1. Vibe-to-Spec Engine (`zcraft_spec`)
Translates casual user prompts into explicit UX state contracts:
- **Mandatory 4-State Matrix**:
  - **Populated (Default)**: Normal data display with compact row heights and pagination.
  - **Loading (Async)**: High-fidelity skeleton shimmers (never blank screens or single generic spinners).
  - **Empty (Zero Data)**: Clear explanation distinguishing between 'no data created' vs 'no search match', with an actionable CTA button.
  - **Error (Failure)**: User-friendly diagnostic message paired with a "Retry" button.
- **Edge Case Defenses**: Pre-planned mitigations for high-volume data (virtualization), text truncation (tooltips), and responsive collapse.

### 2. Mechanical Anti-AI-Slop AST Linter (`zcraft_lint_ui`)
Eliminates amateurish AI-generated UI:
- **AS-1 (Arbitrary Hex Colors)**: Rejects hardcoded arbitrary hex codes; mandates semantic design system tokens.
- **AS-2 (Neon Gradients)**: Blocks gratuitous purple/pink/indigo ambient gradient blobs.
- **AS-3 (Floaty Shadows)**: Replaces oversized ambient drop-shadows with crisp 1px borders.
- **AS-4 (Generic Placeholders)**: Catches "Lorem ipsum" and dummy data in production components.
- **AS-5 (Dead Interactions)**: Forbids dead click handlers (`onClick={() => {}}` or `href="#"`).
- **AS-6 (Low Contrast)**: Enforces WCAG AAA compliance.
- **AS-7 (XAML/WinForms Slop)**: Flags unskinned raw colors in desktop apps.

### 3. Interactive Generative Canvas (`zcraft_preview`)
- Produces self-contained interactive HTML/Tailwind widgets that render directly in chat via Antigravity Generative UI.
- Allows developers to click buttons, switch states, and test responsive layouts before saving files to disk.

### 4. Vibe Time-Machine (`zcraft_checkpoint`)
- Saves lightweight file snapshots in `.zero-craft/snapshots/` prior to radical visual redesigns.
- Instant 1-click restore (`zcraft_checkpoint restore <id>`) without creating dangling git commits or rebases.

---

## ⚡ CLI Usage

```bash
# Generate UX micro-contract from a prompt
node scripts/cli.mjs spec "Màn hình quản lý kho có scan barcode và cảnh báo tồn"

# Lint UI files for Anti-Slop violations
node scripts/cli.mjs lint src/components

# Generate interactive preview widget
node scripts/cli.mjs preview "Inventory Dashboard"

# Create a shadow checkpoint before refactoring
node scripts/cli.mjs checkpoint create before_card_redesign

# List all checkpoints
node scripts/cli.mjs checkpoint list

# Restore working state from a checkpoint
node scripts/cli.mjs checkpoint restore before_card_redesign

# Check status
node scripts/cli.mjs status
```

---

## 🧪 Testing & Verification

Run the dedicated test suite:

```bash
node bench/craft-test.mjs
```
