# z-mind

Cognitive engineering framework & thinking discipline for autonomous AI coding agents (**Antigravity 2.0** & **ZCode**).

It equips agents with senior engineering rigor: 4-phase bug diagnosis, zero-regression refactoring with Net Engineering Value (NEV) gates, deep-module architecture, and zero-collision multi-agent teamwork.

## Components

| Component | What it does |
|---|---|
| Skill `z-mind` | Central cognitive router (`/z-mind rules`, `/z-mind investigate`, `/z-mind refactor`, `/z-mind team`) |
| Skill `z-bugfix` | 4-phase diagnosis protocol: Sensory Sweep $\rightarrow$ Socratic Inquiry $\rightarrow$ Pre-Mortem $\rightarrow$ Root Cause Fix |
| Skill `z-refactor` | Zero-regression refactoring strictly gated by the Net Engineering Value (NEV) equation |
| Skill `z-architecture` | Deep-module interface design, information hiding, and the Deletion Test |
| Skill `z-teamwork` | Subagent orchestration with zero-collision file ownership contracts |
| Agent `architect` | System Architect persona for boundary design and trade-off evaluation |
| Agent `investigator` | Dedicated bugfix diagnosis sub-agent |
| Agent `reviewer` | Adversarial Code Reviewer persona checking invariants and regressions |
| MCP tool `zmind_init` | Bootstrap a standard `.project-rule.md` tailored to current workspace stack and protect in `.gitignore` |
| MCP tool `zmind_rules` | Query engineering invariants by topic (`core`, `tdd`, `perf`, `git`, `refactor`) |
| MCP tool `zmind_audit` | Audit technical plans or commit messages against engineering rules |
| MCP tool `zmind_doctor` | Run architectural health-checks and rule compliance audits across the repository |
| Rules `engineering-rules.md` | Full catalog of 58 engineering standards across 6 pillars (Invariants, Languages, Architecture, Cognition, Domain ERP, Ops) |
| Rules `rules.json` | Machine-readable SSoT dictionary containing all 58 rules with titles, tags, and summaries |

## The 6 Pillars of Engineering Rules (58 Rules)

1. **Universal Invariants (8 rules):** `R_CORE` (SOLID), `R_TDD` (Reproduction first), `R_PERF` (Zero-allocation), `R_NEV` (Refactor gate), `R_PROOF` (Level 3+ proof), `R_REUSE` (Grep before write), `R_GIT` (Conventional commits), `R_TEAM` (File ownership contracts).
2. **Languages & Runtime Stacks (13 rules):** `R_CS` (.NET C#), `R_WPF` (WinForms/WPF ERP), `R_NODE`, `R_REACT`, `R_GO`, `R_PHP`, `R_RUST`, `R_PY`, `R_CPP`, `R_ANDROID`, `R_GODOT`, `R_GAME`, `R_EMBEDDED`.
3. **Architecture & Patterns (8 rules):** `R_API` (Clean Arch), `R_UNIVERSE` (Plugin v4.0), `R_EVT` (Transactional Outbox), `R_RES` (Resilience & Breakers), `R_PIPE` (Tiled Data Pipeline), `R_ENG_OS` (EngOS 8-core), `R_ROUTE` (Toolchain router), `R_STATE` (Working memory).
4. **Cognitive Disciplines & Empirical Research (10 rules):** `R_COG_LOOP` (5-phase loop), `R_PRE_MORTEM` (Failure simulation), `R_EPISTEMIC` (Uncertainty gate), `R_RESEARCH` (Falsifiable hypotheses), `R_RES_MEM` (Negative knowledge), `R_DEAD_LOOP` (Cycle detector), `R_BUDGET` (Multi-vector budget), `R_INFO_GAIN` (EIG), `R_QGEN` (Autonomous questions), `R_ACT` (Action-first UX).
5. **ERP & Enterprise Domains (7 rules):** `R_DOMAIN_INV` (Inventory row locks), `R_DOMAIN_PROD` (Lot/BOM traceability), `R_DOMAIN_SALES` (Deterministic pricing & packaging), `R_DOMAIN_FIN` (Ledger closing & double-entry balance), `R_DOMAIN_WMS` (Two-step transfer & bin location mapping), `R_DOMAIN_AUTH` (Enterprise RBAC), `R_DB` (Parameterized queries & rollback scripts).
6. **Operations, Governance, UI & Security (12 rules):** `R_PUB` (.NET Publish Lite), `R_PKG` (Registry portability), `R_VER` (SemVer 2.0), `R_SEC` (Scope contract), `R_SEC_STD` (Zero credential leaks), `R_PENTEST` (Non-destructive CVSS), `R_REVERSE` (Clean-room disassembly), `R_LICENSE` (IP compliance), `R_LLM_GOV` (Clean-room provenance), `R_BENCH` (Hardware provenance), `R_UI` (5-tier design tokens), `R_ANTI_SLOP` (Dense functional UI).

## CLI Usage

```bash
# Bootstrap standardized .project-rule.md in current workspace
node scripts/cli.mjs init

# Run repository health-check and rule compliance inspection
node scripts/cli.mjs doctor

# List all 58 rules
node scripts/cli.mjs rules

# Lookup by category: invariants, lang, arch, cognition, domain, ops
node scripts/cli.mjs rules lang

# Lookup by keyword or tag: csharp, wpf, tdd, inventory, react, anti-slop
node scripts/cli.mjs rules csharp

# Audit a plan or proposal
node scripts/cli.mjs audit "fix(db): handle crash with raw SELECT + id string"
```
