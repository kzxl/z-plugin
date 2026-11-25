# z-plugin Roadmap

Current release: **v1.11.0+**. Every milestone below is grounded in measured repository benchmarks and test gates.

---

## Completed Milestones (v1.5 – v1.11+)

- **Cross-IDE Portability & Single Memory (v1.5 – v1.10)**: Shared `~/.z-plugin/brain.sqlite` with `PRAGMA user_version` schema guards, automatic legacy adoption, leader-leased observer, incremental git reconcile, and Qoder / Codex / Cursor / Claude / Antigravity exporters.
- **Pre-Flight Intelligence & Telemetry Dashboard (v1.7 – v1.8)**: Hard-capped ~300-token `zbrain_impact(file, brief: true)` pre-edit briefs and zero-daemon visual telemetry dashboard (`z-plugin dashboard`).
- **Retrieval Evaluation & Semantic Recall (v1.11+)**: Automated `bench/retrieval-eval.mjs` regression harness (`hit@3 >= 95%`, `recall@5 >= 90%`, `MRR >= 0.90`, `p95 <= 60ms`), cross-lingual EN/VI concept expansion + semantic fallback closing the paraphrase gap, and generational compaction (`zbrain_compact`, `superseded_by`).
- **Canonical Anti-AI-Slop & Unified Gate (v1.11+)**: Unified `AS-01..AS-12`, `AS-C1..AS-C5`, `AS-I1`, `AS-S1`, `AS-D1..AS-D4` taxonomy, WCAG 2.1 AA token contrast auditor, host CSP-compliant previews (`gstatic` Tailwind + `<agent-embed>`), and `z-gate` delegation to `z-craft` + Windows-safe DLC loading (`pathToFileURL`).
- **Token Search & Outline Precision (v1.11+)**: Adaptive sparse context (`contextSparse: 1` when matches `<= 10`), non-destructive `windows-1258` legacy encoding fallback, and multiline C#/TypeScript declaration folding in `outline`.
- **Live Cognitive Orchestration (v1.11+)**: `z-runtime` `orchestrateTask()` wired into `zmind_route` and the unified `z-plugin` CLI (`route`, `review`, `lint`, `preflight`, `doctor`, real-symbol `canvas`).

---

## Next Horizon (Measured Candidates)

1. **Optional Local Vector Index (Zero-Daemon Opt-In)**:
   - Support optional local ONNX INT8 embedding plugin for repositories exceeding 5,000+ knowledge atoms while keeping the default install 100% zero-dependency.
2. **Additional Domain DLC Packs**:
   - Extract `dlc-dotnet` (WinForms/WPF/MSBuild specifics) and `dlc-web` (Next.js/Tailwind/Accessibility) following the `extensions/dlc-erp` contract.
3. **Interactive Visual Regression Harness**:
   - Pair `zcraft_preview` + computed-style DOM checks for layout density, focal-point restraint, and overflow auditing.
4. **Ledger-Driven Threshold Calibration**:
   - Tune `guard.read.maxBytes` and `search.sparseThreshold` from 30-day `~/.zero-token/ledger.jsonl` block/miss distributions.

---

## Non-Goals (By Platform Design)

- Rewriting third-party tool outputs after they return to the host.
- Running permanent heavyweight background daemons (Docker, Neo4j, Qdrant) for local coding sessions.
- Sandboxing arbitrary user shell execution.

---

## Reproducing Measurements

```bash
npm run check
npm test
npm run eval:retrieval
npm run bench
```
