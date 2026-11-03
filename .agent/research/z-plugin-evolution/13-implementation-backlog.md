# 13. Component Disposition & Granular Implementation Backlog

## 1. Component Disposition Matrix (KEEP / IMPROVE / REFACTOR / REPLACE / DEFER)

To preserve what is empirically proven while systematically eliminating technical debt, all components of the existing `z-plugin` codebase are categorized according to architectural disposition:

| Target Component | File / Path | Current Tech | Disposition | Architectural Rationale & Empirical Justification | Priority |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **Context PreToolUse Guard** | `plugins/z-token/scripts/guard.mjs` | Node.js stdin/out | **KEEP** | Delivers 81.6%–99.2% token savings with $<5\text{ms}$ latency. Rock solid. | Baseline |
| **Build Log Condenser** | `plugins/z-token/scripts/lib/build.mjs` | Regex parser | **KEEP** | 99.2% log reduction on MSBuild/dotnet build without losing coded errors. | Baseline |
| **Loop Breaker Guard** | `plugins/z-token/scripts/loop-breaker.mjs` | In-memory hash | **IMPROVE** | Persist action hashes into active session context to survive multi-CLI invocations. | P2 |
| **Declaration Outline Engine** | `plugins/z-token/scripts/lib/scan.mjs` | Regex PATTERNS | **REPLACE** | Regex produces ~18% false negatives on multiline C# & TS. Replace with Tree-sitter Wasm. | P1 |
| **SQLite WAL Foundation** | `plugins/z-brain/scripts/lib/db.mjs` | `node:sqlite` WAL | **KEEP** | Excellent sub-millisecond local storage foundation. No external daemon needed. | Baseline |
| **FTS5 Keyword Search** | `plugins/z-brain/scripts/lib/search.mjs` | SQLite FTS5 | **IMPROVE** | Keep FTS5 BM25, but merge with local ONNX vector embeddings via RRF. | P1 |
| **Memory Deduplication** | `plugins/z-brain/scripts/lib/harvest.mjs` | 45-char prefix | **REPLACE** | 45-char prefix fails on semantic variations. Replace with vector cosine similarity. | P0 |
| **ERP Synonyms Dictionary** | `plugins/z-brain/scripts/lib/search.mjs` | Hardcoded map | **REFACTOR** | Extract ERP terms from core memory into `dlc-erp/synonyms.json`. | P1 |
| **Invariant Rules Engine** | `plugins/z-mind/rules/rules.json` | 56-rule JSON | **REFACTOR** | Decompose into universal core invariants + modular extension DLC rule packs. | P1 |
| **Workspace Health Doctor** | `plugins/z-mind/scripts/lib/doctor.mjs` | Literal strings | **IMPROVE** | Replace raw string matching (`DbContext`) with AST linter checks. | P2 |
| **Net Engineering Value Auditor**| `plugins/z-gate/scripts/lib/nev-auditor.mjs`| Diff line counts | **IMPROVE** | Exclude test files (`*Tests.cs`, `*.spec.*`) from refactoring LOC inflation checks. | P1 |
| **Brain File Gotcha Lookup** | `plugins/z-gate/scripts/lib/code-reviewer.mjs`| Relative import | **REFACTOR** | Eliminate `../../../z-brain` relative file path; use Runtime Service Registry. | P0 |
| **Software Craftsmanship Linter**| `plugins/z-craft/scripts/lib/anti-slop-linter.mjs`| Regex patterns | **REPLACE** | Replace regex pattern matching with true AST parser for TSX/JSX and XML for XAML. | P1 |
| **Generative Canvas Preview** | `plugins/z-craft/scripts/lib/generative-canvas.mjs`| Tailwind CDN | **IMPROVE** | Bundle local CSS reset and design tokens to maintain 100% offline-first capability. | P2 |
| **Directory Mirroring Installer**| `install.ps1` | `robocopy /MIR` | **REFACTOR** | Replace physical file mirroring with NTFS symlinks / in-place dev runner. | P1 |
| **Heavy Rust Tantivy/Qdrant** | bloop / Qdrant architecture | Rust / C++ daemons | **DEFER** | Unbearable build and distribution friction; violates lightweight Node.js standard. | N/A |
| **Neo4j Graph Database** | Graphiti architecture | Java / Docker daemon| **DEFER** | Unnecessary infrastructure burden; SQLite recursive CTEs handle graph locally. | N/A |

---

## 2. Granular Implementation Backlog

### Epic 1: Standardization & Architectural Decoupling (Phase 1)

#### Task 1.1: Author Formal Manifest v2 JSON Schema & Templates
- **ID**: `AEOS-101`
- **Component**: Core Infrastructure
- **Input**: Current `plugin.json` and Anthropic plugin standards.
- **Output**: `schemas/manifest-v2.schema.json` and updated `plugins/*/z-plugin.manifest.json`.
- **Definition of Done (DoD)**: All 5 plugins validate against the JSON Schema with zero errors using `tools/validate-manifests.mjs`.
- **Effort**: 3 Days.

#### Task 1.2: Eradicate Relative Filesystem Dynamic Imports
- **ID**: `AEOS-102`
- **Component**: `z-gate` & `z-craft`
- **Input**: `plugins/z-gate/scripts/lib/code-reviewer.mjs` line 20, `plugins/z-craft/scripts/lib/spec-generator.mjs` line 10.
- **Output**: Temporary in-memory Service Provider shim (`src/compat/service-shim.mjs`).
- **DoD**: Zero occurrences of `../../../` across the entire codebase. `npm test` passes 100%.
- **Effort**: 4 Days.

#### Task 1.3: Refactor Installer to Support Native In-Place & Symlink Development
- **ID**: `AEOS-103`
- **Component**: Root Tooling (`install.ps1`)
- **Input**: Existing robocopy mirroring logic.
- **Output**: Updated `install.ps1` with `-Development` flag creating NTFS symlinks when developer mode is active.
- **DoD**: Modifications in `plugins/` reflect immediately in Antigravity without running `install.ps1`.
- **Effort**: 3 Days.

---

### Epic 2: Z Core Runtime Micro-Kernel (Phase 2)

#### Task 2.1: Implement In-Memory Asynchronous EventBus
- **ID**: `AEOS-201`
- **Component**: `packages/z-runtime/src/event-bus.mjs`
- **Input**: Native Node.js `EventEmitter`.
- **Output**: Pub/Sub broker with error boundaries, wildcard subscriptions, and request-reply timeouts.
- **DoD**: Unit test `bench/event-bus-test.mjs` demonstrates 50,000 events/sec with zero uncaught exceptions.
- **Effort**: 5 Days.

#### Task 2.2: Implement Typed Service Registry & Dependency Resolver
- **ID**: `AEOS-202`
- **Component**: `packages/z-runtime/src/service-registry.mjs`
- **Input**: Topological sorting algorithm (Tarjan's).
- **Output**: Service registration and dynamic lookup container with cycle detection.
- **DoD**: Plugins declare capabilities in manifest and register typed service implementations during boot.
- **Effort**: 6 Days.

#### Task 2.3: Build 9-State Lifecycle Machine Runner
- **ID**: `AEOS-203`
- **Component**: `packages/z-runtime/src/lifecycle-machine.mjs`
- **Input**: Formal state machine specification (DISCOVER to DISPOSE).
- **Output**: Deterministic lifecycle runner handling boot, graceful degradation, and resource cleanup.
- **DoD**: If a simulated plugin crashes in `INITIALIZE`, remaining plugins activate cleanly and log diagnostic.
- **Effort**: 7 Days.

---

### Epic 3: Semantic Intelligence & Memory Evolution (Phase 3)

#### Task 3.1: Integrate WebAssembly Tree-sitter for Symbol Outlining
- **ID**: `AEOS-301`
- **Component**: `plugins/z-token/src/ast/`
- **Input**: `web-tree-sitter` and pre-compiled Wasm grammars for C#, TypeScript, Python, and Go.
- **Output**: `tree-sitter-runner.mjs` replacing heuristic regex in `scan.mjs`.
- **DoD**: `bench/ast-benchmark.mjs` demonstrates symbol extraction recall $\ge 98.5\%$ across 100 enterprise test files.
- **Effort**: 8 Days.

#### Task 3.2: Implement Local ONNX Vector Embeddings on CPU
- **ID**: `AEOS-302`
- **Component**: `plugins/z-brain/src/embeddings/`
- **Input**: Quantized INT8 `bge-small-en-v1.5` ONNX model (32MB).
- **Output**: Local inference runner producing 384-dimensional vector blobs on CPU.
- **DoD**: Inference latency $<25\text{ms}$ per sentence on standard CPU; zero Python dependencies.
- **Effort**: 7 Days.

#### Task 3.3: Implement Reciprocal Rank Fusion & Temporal Graph Tables
- **ID**: `AEOS-303`
- **Component**: `plugins/z-brain/src/search/`
- **Input**: SQLite `knowledge_fts` + Vector index + Entity relational schema.
- **Output**: Hybrid RRF ranking algorithm and temporal validity interval tracking.
- **DoD**: Semantic query returns relevant atoms even with zero exact keyword overlap; outdated atoms marked `superseded_by`.
- **Effort**: 7 Days.

---

### Epic 4: Cognitive Router & Multi-Agent Coordination (Phase 4)

#### Task 4.1: Implement Deterministic Intent Classifier & DAG Planner
- **ID**: `AEOS-401`
- **Component**: `packages/cognitive-router/`
- **Input**: Natural language user prompts and workspace context.
- **Output**: High-speed lexical classifier and task execution DAG compiler.
- **DoD**: $>90\%$ of standard prompts classified in $<1\text{ms}$ without invoking external LLMs.
- **Effort**: 6 Days.

#### Task 4.2: Build Dynamic Context Token Budgeter
- **ID**: `AEOS-402`
- **Component**: `packages/cognitive-router/src/token-budgeter.mjs`
- **Input**: Configurable token limits (e.g., 10,000 tokens/turn).
- **Output**: Dynamic context allocator prioritizing active task requirements and enforcing hard ceilings.
- **DoD**: Simulated 20-turn conversation stays within $\pm 5\%$ of budgeted token thresholds.
- **Effort**: 5 Days.

#### Task 4.3: Implement Automated Git Worktree Subagent Isolation
- **ID**: `AEOS-403`
- **Component**: `plugins/z-mind/src/worktree-manager.mjs`
- **Input**: Subagent task allocations.
- **Output**: Automated Git worktree provisioning (`git worktree add`) and cleanup.
- **DoD**: Concurrent subagents edit files on separate worktrees simultaneously without file locks or conflicts.
- **Effort**: 6 Days.

---

### Epic 5: DLC Ecosystem & Marketplace SDK (Phase 5)

#### Task 5.1: Extract Domain DLC-ERP
- **ID**: `AEOS-501`
- **Component**: `extensions/dlc-erp/`
- **Input**: ERP rules from `z-mind`, ERP synonyms from `z-brain`, and ERP gate checks from `z-gate`.
- **Output**: Decoupled, independently versioned `dlc-erp` package.
- **DoD**: Core `z-plugin` repository contains zero ERP domain references; adding `dlc-erp` restores all tests.
- **Effort**: 5 Days.

#### Task 5.2: Extract Domain DLC-DotNet
- **ID**: `AEOS-502`
- **Component**: `extensions/dlc-dotnet/`
- **Input**: C# / WinForms / DevExpress / WPF rules and MSBuild condensers.
- **Output**: Decoupled, independently versioned `dlc-dotnet` package.
- **DoD**: DotNet engineering invariants load dynamically into `z-mind` and `z-gate` when activated.
- **Effort**: 5 Days.

#### Task 5.3: Publish AEOS Developer SDK & Documentation
- **ID**: `AEOS-503`
- **Component**: Documentation & Tooling (`tools/dlc-cli.mjs`)
- **Input**: Manifest v2, lifecycle contracts, and event schemas.
- **Output**: `npx z-plugin dlc create <name>` CLI scaffolding tool and developer guides.
- **DoD**: External developer can scaffold, test, and package a custom DLC in $<15\text{ minutes}$.
- **Effort**: 4 Days.
