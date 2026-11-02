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
| MCP tool `zmind_rules` | Query engineering invariants by topic (`core`, `tdd`, `perf`, `git`, `refactor`) |
| MCP tool `zmind_audit` | Audit technical plans or commit messages against engineering rules |
| Rules `engineering-invariants.md` | Core engineering laws: SOLID, TDD, zero-allocation loops, conventional commits |

## Core Invariants

1. **Reproduction Before Production**: Never modify production logic for a reported bug without an automated failing test first.
2. **Net Engineering Value**: Refactoring must deliver Pareto improvement (performance, zero wrapper hell, low complexity, 100% test contract preservation).
3. **Zero-Trust Empirical Proof**: Forbid subjective assertions ("clean", "optimal"). Require Level 3+ empirical proof: compiler exit code 0, test assertion counts, or profiler logs.
4. **Zero Redundancy**: Always inspect existing repository utilities before writing custom helpers.

## CLI Usage

```bash
# View active invariants
node scripts/cli.mjs rules

# Lookup specific topic
node scripts/cli.mjs rules tdd

# Audit a plan or commit message
node scripts/cli.mjs audit "fix(auth): handle token expiration without reproduction test"
```
