---
trigger: model_decision
description: Complete catalog of 56 engineering rules and standards across invariants, languages, architecture, cognition, domain ERP, and operations.
---

# Engineering Rules & Invariants Reference (Z-Mind)

This document contains the complete canonical catalog of **56 engineering rules and standards** enforced by **z-mind**.
These rules govern coding standards, architectural invariants, cognitive disciplines, and domain logic for autonomous coding agents across **Antigravity 2.0** and **ZCode**.

---

## 1. Universal Core Invariants (Mandatory Invariants)

### `R_CORE`: Universal Core & SOLID
- **Category:** `invariants`
- **Tags:** `core`, `solid`, `cohesion`, `coupling`, `deep-modules`
- **Definition:**
  > Universal Core: SOLID principles, high cohesion, low coupling, standard English naming and documentation, clear layer boundaries, no over-engineering.

### `R_TDD`: Test-Driven Development
- **Category:** `invariants`
- **Tags:** `tdd`, `test`, `reproduction`, `red-green-refactor`
- **Definition:**
  > Test-Driven Development: Red-Green-Refactor cycle, reproduction test first, minimum production code, regression verification.

### `R_PERF`: High Performance & Zero-Waste Allocation
- **Category:** `invariants`
- **Tags:** `perf`, `performance`, `memory`, `allocations`, `span`, `simd`
- **Definition:**
  > High-Performance Compute: Span<T>, Memory<T>, ArrayPool<T>, NativeMemory, SIMD Vector128/256/512, cache alignment, zero GC allocations in tight loops.

### `R_GIT`: Git & Conventional Commits Discipline
- **Category:** `invariants`
- **Tags:** `git`, `commit`, `conventional-commits`, `atomic`
- **Definition:**
  > Git & Commit Discipline: Atomic commits ONLY (1 feature/fix = 1 commit). Strictly follow Conventional Commits: <type>(<scope>): <subject>. Never bundle multiple independent controls/features into mega-commits. Keep documentation, refactoring, and releases isolated from functional feature commits.

### `R_NEV`: Net Engineering Value in Refactoring
- **Category:** `invariants`
- **Tags:** `nev`, `refactor`, `abstraction-tax`, `pareto`, `clean-code`
- **Definition:**
  > Multi-Objective Refactoring & Net Engineering Value (NEV): Functional equivalence is a baseline requirement, not a justification for code bloat or performance regression. Every refactoring must deliver a Pareto improvement across 4 dimensions: (1) Zero runtime regression (latency, memory allocations, query count), (2) Abstraction Tax limit (prohibit wrapper hell, single-impl speculative interfaces, and LOC inflation >30%), (3) Low cognitive complexity (nesting <=3, direct call paths), (4) 100% test contract preservation. If Net Engineering Value (NEV) <= 0, trigger mandatory rollback.

### `R_PROOF`: Zero-Trust Empirical Proof
- **Category:** `invariants`
- **Tags:** `proof`, `empirical`, `zero-trust`, `evidence`, `verification`
- **Definition:**
  > Zero-Trust Empirical Proof & Anti-Aggrandizement: Strictly forbid subjective self-praise (e.g., 'clean', 'perfect', 'optimal') and unverified completion assertions. Every engineering claim must cite Level 3+ independent empirical proof (compiler exit code 0, passing automated tests with explicit assertion counts, or profiler logs). Agents must execute mandatory adversarial cross-examination (testing failure modes) before concluding any task.

### `R_REUSE`: Asset-First Discovery & Zero Redundancy
- **Category:** `invariants`
- **Tags:** `reuse`, `discovery`, `existing-assets`, `zero-duplication`
- **Definition:**
  > Asset-First Discovery & Zero-Redundancy Reuse: STRICTLY FORBID writing hand-rolled utility logic, custom helper classes, or duplicate extension methods without first surveying the repository. Before implementing any utility, parsing, formatting, or common business operation, the agent MUST grep the codebase for existing helpers (Helpers/, Extensions/, Utils/, Common/, Constants/). Reuse and compose existing project assets first. Writing redundant code when a project helper or standard library API already exists is an immediate regression.

### `R_TEAM`: Multi-Agent Teamwork & File Ownership
- **Category:** `invariants`
- **Tags:** `team`, `multi-agent`, `teamwork`, `file-ownership`, `adversarial`
- **Definition:**
  > Multi-Agent Teamwork & Adversarial Orchestration: Partition complex engineering tasks across isolated subagent roles (Orchestrator, Explorer, Worker, Adversarial Reviewer, Empirical Challenger, Victory Auditor) with explicit Zero-Collision File Ownership contracts, structured handoff artifacts, and mandatory multi-stage verification gates before synthesis. Refer to architecture/multi-agent-teamwork-protocol.md.

## 2. Languages & Runtime Stacks

### `R_NODE`: Node.js Enterprise API Architecture
- **Category:** `lang`
- **Tags:** `node`, `nodejs`, `express`, `javascript`, `backend`
- **Definition:**
  > Node.js: Express REST APIs, Handler-Dispatcher architecture (canHandle/handle), Interceptor pipelines, Error boundaries, Mongoose/MongoDB/SQL, Service-layer business logic.

### `R_REACT`: React & Frontend State Architecture
- **Category:** `lang`
- **Tags:** `react`, `frontend`, `ui`, `web`, `redux`, `zustand`
- **Definition:**
  > React: Functional Components, Hooks (useState/useEffect/useMemo/useCallback), Redux Toolkit/Zustand, strict English RESTful routing, centralized apiClient, zero inline window.location redirects.

### `R_CS`: C# .NET Standards & Patterns
- **Category:** `lang`
- **Tags:** `csharp`, `dotnet`, `cs`, `backend`, `async`, `microsoft`
- **Definition:**
  > C# .NET: Modern C# syntax, Task/async naming suffixes (e.g. GetListAsync), pattern matching, native ArgumentNullException, <=40 lines/method, strong typing.

### `R_WPF`: WinForms & WPF ERP Architecture
- **Category:** `lang`
- **Tags:** `wpf`, `winforms`, `desktop`, `devexpress`, `ui`, `csharp`, `erp`
- **Definition:**
  > WinForms/WPF ERP: STRICTLY NO BindingSource. BaseForm/XtraForm pattern, RunAfterShown delegate initialization, PopulateControls/CollectData 1-way manual mapping, safe async void exception catching.

### `R_GO`: Go Concurrency & Service Architecture
- **Category:** `lang`
- **Tags:** `go`, `golang`, `backend`, `channels`, `goroutines`
- **Definition:**
  > Go: Goroutines, Channels, GoFlow toolkit, errgroup, typed worker pools (PoolWithFunc), explicit error handling, interface segregation.

### `R_PHP`: Modern PHP 8+ Standards
- **Category:** `lang`
- **Tags:** `php`, `backend`, `laravel`, `psr`
- **Definition:**
  > PHP 8+: strict_types=1, PSR-4 autoloading, PDO parameterized queries (LiteORM CLI), JWT/Crypto security, thin controllers.

### `R_CPP`: Modern C++20 & Native Interop
- **Category:** `lang`
- **Tags:** `cpp`, `cplusplus`, `native`, `interop`, `cabi`
- **Definition:**
  > Modern C++ & Native Interop: C++20 standard, C-ABI export boundaries, [LibraryImport] Source Generators, Pinned memory, zero-copy pointer exchanges.

### `R_ANDROID`: Android Jetpack Compose & NDK
- **Category:** `lang`
- **Tags:** `android`, `mobile`, `compose`, `kotlin`, `ndk`
- **Definition:**
  > Android & Jetpack Compose: Unidirectional Data Flow (UDF), StateFlow UI state immutability, Material 3 design tokens, Camera2/CameraX manual sensor stepping, NDK zero-copy DirectByteBuffer, non-blocking coroutine dispatching.

### `R_GAME`: Game Engine Architecture & Simulation
- **Category:** `lang`
- **Tags:** `game`, `gamedev`, `simulation`, `physics`
- **Definition:**
  > Game Development & Engine Architecture: Server-authoritative logic, deterministic fixed-timestep simulation loop decoupled from rendering, object pooling, zero-allocation in hot tick paths, hierarchical state machines, spatial partitioning.

### `R_GODOT`: Godot Engine & C# Architecture
- **Category:** `lang`
- **Tags:** `godot`, `gamedev`, `game`, `csharp`, `engine`
- **Definition:**
  > Godot Engine & .NET C#: Node composition over deep inheritance, typed [Export] properties, CanvasLayer UI separation, explicit signal unhooking on _ExitTree, PackedScene preloading, no GC allocations in _Process/_PhysicsProcess.

### `R_EMBEDDED`: Embedded Systems & Bare-Metal RTOS
- **Category:** `lang`
- **Tags:** `embedded`, `firmware`, `rtos`, `arm`, `hardware`, `dma`
- **Definition:**
  > Embedded & Bare-Metal RTOS: Linker-table auto-registration (FW_INIT_EXPORT), multi-tier memory hub with reserve margins, priority event hook interception (FW_HOOK_STOP), 2D strided DMA coprocessor, stack watermark canary profiling (0x5A5A5A5A), cross-gen CP15/DMB barriers, cache coherency contracts (clean/invalidate), boot-loop safe-mode recovery, zero heap in loops/ISR, compile with -Werror zero-warning discipline.

### `R_RUST`: Rust Zero-Cost & Safety Standards
- **Category:** `lang`
- **Tags:** `rust`, `native`, `lowlevel`, `cargo`, `clippy`
- **Definition:**
  > Rust Standards: Clean separation into single-responsibility crates (<450 LOC/file), #![no_std] compatibility on core algorithms, zero runtime heap allocations in critical hot loops (pre-allocated pools/arenas, cacheline/page-aligned buffers), zero unhandled panics (explicit Result<T, E> error propagation), strict unsafe hygiene (mandatory /// # Safety docs), 100% warning-free builds (cargo clippy --all-targets -- -D warnings), and rustfmt formatting compliance. Refer to standards/rust/.

### `R_PY`: Python AI & Async Web Services
- **Category:** `lang`
- **Tags:** `python`, `py`, `ai`, `asyncio`, `fastapi`, `pydantic`
- **Definition:**
  > Python & AI Standards: Strict Python 3.10+ typing (mypy --strict, Union | syntax, Pydantic v2 schemas), non-blocking asyncio event-loop discipline (never run blocking I/O in async def without asyncio.to_thread, offload CPU-bound tasks to ProcessPoolExecutor), FastAPI lifespan management, SSE token streaming (sub-100ms TTFT, normalized event framing, X-Accel-Buffering: no), deterministic node-based workflow graphs with cycle limits (max_iterations <= 10), safe tool execution (zero unsanitized eval/exec), and structured TaskGroup concurrency. Refer to standards/python/.

## 3. Architecture & Design Patterns

### `R_API`: Clean Architecture Web API
- **Category:** `arch`
- **Tags:** `api`, `clean-arch`, `webapi`, `rest`, `architecture`, `dto`
- **Definition:**
  > Web API: Clean Architecture / Folder-per-feature, Autofac/Microsoft DI, Controller -> Service -> Repository layer separation, strict DTO localization.

### `R_UNIVERSE`: Universe Modular Plugin Architecture
- **Category:** `arch`
- **Tags:** `universe`, `plugin`, `modular`, `eventbus`, `isolation`
- **Definition:**
  > Universe Plugin v4.0: Data sovereignty, indirect event communication (EventBus/MessageQueue), auto-registry, strict module isolation. Deleting a module folder must not break project build.

### `R_EVT`: Event-Driven Architecture & Outbox
- **Category:** `arch`
- **Tags:** `event`, `event-driven`, `outbox`, `messagequeue`, `async`
- **Definition:**
  > Event-Driven: Decoupled domain events, Transactional Outbox pattern for dual-write safety, Idempotent consumers, asynchronous messaging.

### `R_RES`: System Resilience & Fault Tolerance
- **Category:** `arch`
- **Tags:** `resilience`, `circuit-breaker`, `retry`, `cache`, `timeout`
- **Definition:**
  > Resilience: Circuit Breaker, Exponential Backoff with Jitter, explicit timeouts, Fallback cache (Stale-While-Revalidate), graceful degradation.

### `R_PIPE`: Tiled Data Processing Pipelines
- **Category:** `arch`
- **Tags:** `pipeline`, `streaming`, `buffer`, `channels`, `tiled`
- **Definition:**
  > Tiled Data Pipeline: Producer-Consumer Channels, Bounded queues, Ring Buffers, Tile Partitioning for data exceeding physical RAM.

### `R_STATE`: Execution State & Working Memory
- **Category:** `arch`
- **Tags:** `state`, `memory`, `working-memory`, `context`, `amnesia`
- **Definition:**
  > Execution State & Working Memory: Maintain explicit short-term state (Task goal, workspace delta/diff, diagnostic evidence, active hypotheses). Verify actual system feedback before/after actions. Prevent amnesia loops and repetitive failed fixes.

### `R_ENG_OS`: Engineering Operating System (EngOS)
- **Category:** `arch`
- **Tags:** `eng-os`, `cognitive-os`, `architecture`, `governance`
- **Definition:**
  > Engineering Operating System: 8-core engine (Knowledge, Memory L0-L4, State, Graph, Runtime, Risk, Evidence, Governance) governing the LLM as a Reasoning Core. Decouples state, memory tiers, and transactional regression gates from ephemeral prompts.

### `R_ROUTE`: Skill & Toolchain Routing Protocol
- **Category:** `arch`
- **Tags:** `routing`, `router`, `toolchain`, `dispatch`, `supervision`
- **Definition:**
  > Skill Routing & Toolchain: Deterministic router-first dispatch. Never guess tool paths; verify against local tool-index SSoT. Auto-bootstrap missing capabilities. Enforce self-supervision <self_review> every 5 calls or after 2 identical failures to prevent amnesia and infinite loops.

## 4. Cognitive Disciplines & Empirical Research

### `R_ACT`: Action-First Cognitive Ergonomics
- **Category:** `cognition`
- **Tags:** `action-first`, `ux`, `concise`, `micro-action`, `direct`
- **Definition:**
  > Action-First Cognitive UX: Zero preamble, lead with the immediate executable action on line 1, end each turn with ONE sub-2-minute micro-action, suppress non-blocking tangents, restate progress state on top, and format errors as Location -> Cause -> Fix.

### `R_RESEARCH`: Scientific Research & Hypothesis Testing
- **Category:** `cognition`
- **Tags:** `research`, `scientific`, `hypothesis`, `ablation`, `experiment`
- **Definition:**
  > Scientific Research & Empirical Methodology: Formulate explicit falsifiable hypotheses (H0 vs H1) before experimentation. Enforce Research Manager 5-way decision gate (Continue, Pivot, Merge, Discard, Stop). Dead hypotheses must be permanently registered DEAD in the Historian graveyard with immediate git rollback to prevent infinite dead loops. Mandate ablation studies and report statistical distributions (median, p95/p99, N>=30). Zero speculative claims.

### `R_RES_MEM`: Research Memory & Negative Knowledge
- **Category:** `cognition`
- **Tags:** `research-memory`, `negative-knowledge`, `failed-approach`, `evidence`
- **Definition:**
  > Research Memory & Negative Knowledge: Never rely solely on chat history. Maintain structured research memory (Hypothesis, Evidence, Experiment, Result, Failed Approach, Assumption, Contradiction, Decision). Mandatory check of failed_approaches ('Never repeat a verified failed approach') before touching code. Forbid repeating known failed approaches under identical constraints.

### `R_DEAD_LOOP`: Dead-Loop Detection & Stagnation Breaker
- **Category:** `cognition`
- **Tags:** `dead-loop`, `cycle-detection`, `circuit-breaker`, `stagnation`
- **Definition:**
  > Dead-Loop & Research Stagnation: Actively monitor execution graphs and query streams for loops. Enforce dual detection: (1) Graph Cycle Detector for structural state repeats (A -> B -> C -> A), (2) Semantic Similarity & Epistemic Entropy for subtle research stagnation (Search X -> Search synonym). Upon detection, immediately trip the circuit breaker, forbid synonym tweaking, and escalate to Research Manager for PIVOT or DISCARD.

### `R_BUDGET`: Multi-Vector Resource Budget Governance
- **Category:** `cognition`
- **Tags:** `budget`, `tokens`, `cost`, `governance`, `stagnation`
- **Definition:**
  > Multi-Dimensional Research Budget: Replace naive 1D iteration limits (max_iterations=50) with multi-vector resource governance (Token, Time, Experiment, Search, Hypothesis, Stagnation budgets). Enforce hard stagnation budget limits: when K consecutive trials yield negligible information gain, trigger mandatory PIVOT. Never allow runaway token burn or open-ended searching.

### `R_INFO_GAIN`: Expected Information Gain (EIG)
- **Category:** `cognition`
- **Tags:** `info-gain`, `eig`, `entropy`, `epistemic-value`
- **Definition:**
  > Expected Information Gain (EIG): Never run an experiment without pre-evaluating its epistemic value. Ask: 'Will this experiment tell me something fundamentally new?' Forbid experiments where outcome is already predictable with high confidence (EIG ≈ 0). Prioritize experiments that maximize entropy reduction between competing hypotheses.

### `R_QGEN`: Autonomous Question Generation
- **Category:** `cognition`
- **Tags:** `qgen`, `question-generation`, `decomposition`, `critical-thinking`
- **Definition:**
  > Autonomous Question Generation: For high-level research problems, never jump directly to code. Actively decompose problems into foundational, skeptical, and orthogonal research questions (challenging premises, compiler optimizations, comparative trade-offs, alternative tech). Rank questions by foundational dependency and epistemic impact before formulating hypotheses.

### `R_COG_LOOP`: Empirical Cognitive Loop Workflow
- **Category:** `cognition`
- **Tags:** `cognitive-loop`, `socratic`, `hypothesis`, `stress`, `delta`
- **Definition:**
  > Empirical Cognitive Loop: Enforce a closed 5-phase cognitive loop for complex tasks: (1) Socratic Inquiry & boundary definition, (2) Baseline Inscription & falsifiable hypothesis (H1), (3) Targeted minimal implementation, (4) Grounded stress & empirical experimentation with new knowledge, (5) Comparative Delta (Delta After vs Before) evaluation before commit and knowledge consolidation.

### `R_PRE_MORTEM`: Pre-Mortem Failure Analysis & Simulation
- **Category:** `cognition`
- **Tags:** `pre-mortem`, `simulation`, `failure-modes`, `edge-case`
- **Definition:**
  > Pre-Mortem & User Persona Simulation: Run mental sandbox simulation before code generation or UI layout. Systematically analyze 3 worst-case failure modes, real-world user interaction ergonomics (e.g., misclicks, single-hand warehouse operation, network jitter), and extreme boundary data volumes (1M records vs 10 mock items) to eliminate latent design bugs.

### `R_EPISTEMIC`: Epistemic Uncertainty Calibration
- **Category:** `cognition`
- **Tags:** `epistemic`, `uncertainty`, `probing`, `spiking`, `legacy`
- **Definition:**
  > Epistemic Calibration & Uncertainty Gate: Continuously quantify knowledge certainty. When touching high-uncertainty codebases (lacking tests, undocumented legacy, obscure domain boundaries), STRICTLY FORBID aggressive refactoring or speculative rewrite. Automatically downgrade execution to Probing/Spiking mode: execute read-only diagnostics, write reproduction tests, and establish baseline invariants first.

## 5. ERP & Enterprise Domains

### `R_DB`: Database Reliability & Query Safety
- **Category:** `domain`
- **Tags:** `db`, `database`, `sql`, `parameterized`, `migration`, `audit`
- **Definition:**
  > Database: Parameterized queries ONLY. Verify column mappings. Mandatory audit logging for writes. Schema modifications require isolated migration/rollback scripts.

### `R_DOMAIN_INV`: ERP Inventory & Warehouse Invariants
- **Category:** `domain`
- **Tags:** `inventory`, `warehouse`, `erp`, `stock`, `locking`, `fifo`
- **Definition:**
  > Inventory & Warehouse Invariants: Strict physical vs ledger reconciliation, transactional row-level stock locks (UPDLOCK, ROWLOCK), FIFO/LIFO ledger immutability, zero negative inventory unless explicit backorder configuration, atomic lot reservations.

### `R_DOMAIN_PROD`: ERP Production & Lot Traceability
- **Category:** `domain`
- **Tags:** `production`, `manufacturing`, `lot`, `serial`, `traceability`, `bom`
- **Definition:**
  > Production & Lot Traceability: End-to-end Lot/Serial traceability across BOM stages, immutable process sign-offs, ticket-to-journal stage transitions, zero unverified scrap or material substitution, continuous defect logging.

### `R_DOMAIN_SALES`: ERP Sales Order & Packaging Flow
- **Category:** `domain`
- **Tags:** `sales`, `order`, `pricing`, `packaging`, `nkdg`, `erp`
- **Definition:**
  > Sales & Packaging Flow: Deterministic price and discount calculation decoupled from UI, mandatory approval gate before warehouse stock-out, selective packing log (NKDG) generation, immutable audit journaling.

### `R_DOMAIN_AUTH`: ERP Enterprise RBAC & Data Tenancy
- **Category:** `domain`
- **Tags:** `auth`, `rbac`, `permission`, `security`, `row-level-security`
- **Definition:**
  > Enterprise RBAC & Data Sovereignty: 2-tier authorization matrix (Feature-Action CRUD/Export/Approve + Row-Level Security tenancy filters), client UI signal delegation vs backend hard authorization filters, least-privilege service delegation.

## 6. Operations, Security, UI & Governance

### `R_PUB`: .NET Lightweight Framework Publishing
- **Category:** `ops`
- **Tags:** `publish`, `dotnet`, `build`, `singlefile`, `lite`
- **Definition:**
  > .NET Publish: Lite configuration only (Framework-dependent, SingleFile, --self-contained false). Users install .NET Runtime on host machines to ensure fast builds and lightweight release packages.

### `R_SEC`: Scope Authorization & Evidence Integrity
- **Category:** `ops`
- **Tags:** `security`, `authorization`, `evidence`, `scope-gate`
- **Definition:**
  > Scope Gate & Evidence Chain: Strict authorization contract (auth.status=granted required before any intrusive action). Offline forensic sample isolation. Immutable Evidence-Finding-Path chain with cryptographic hash verification.

### `R_LLM_GOV`: LLM Clean-Room & Provenance Governance
- **Category:** `ops`
- **Tags:** `llm-governance`, `clean-room`, `ip`, `provenance`, `transparency`
- **Definition:**
  > LLM Governance & Clean-Room IP: Strict transparency in AI contributions, Clean-Room protocol (learn & interpret, never blindly copy >15 lines per GNU copyright threshold), zero unverified MMIO/hardware registers without ROM/SSoT proof, human-in-the-loop architectural verification, mandatory provenance disclosure.

### `R_LICENSE`: IP Governance & License Compliance
- **Category:** `ops`
- **Tags:** `license`, `compliance`, `mit`, `gpl`, `clean-room`
- **Definition:**
  > License Governance & IP Compliance: Mandatory LICENSE initialization (MIT by default). Strict license recognition & compatibility matrix (Permissive vs Copyleft/Viral GPL/AGPL). Absolute prohibition on copy-pasting proprietary/GPL code into sovereign/permissive codebases. Clean-room reimplementation only with zero-line verbatim contamination.

### `R_BENCH`: Empirical Benchmarking & Provenance
- **Category:** `ops`
- **Tags:** `benchmark`, `hardware-provenance`, `performance`, `latency`
- **Definition:**
  > Empirical Benchmarking & Hardware Provenance: Every performance claim, latency figure, or throughput metric MUST document the exact hardware testbed (CPU model, clock, core count, RAM, OS build, compiler version, optimization flags). Benchmark runners must log hardware provenance at startup. Unsubstantiated numbers without testbed context are rejected.

### `R_PENTEST`: Penetration Testing & Remediation
- **Category:** `ops`
- **Tags:** `pentest`, `vulnerability`, `cwe`, `cvss`, `security`
- **Definition:**
  > Application Security & Penetration Testing: Zero-unauthorized probing (authorized scope contract required). Non-destructive testing invariant (never cause data corruption or denial of service in testing). Mandatory CVSS v3.1/v4.0 scoring, CWE taxonomy mapping, and actionable remediation patch verification.

### `R_PKG`: Dependency Portability & Package Integrity
- **Category:** `ops`
- **Tags:** `package`, `nuget`, `npm`, `dependencies`, `portability`
- **Definition:**
  > Package & Dependency Portability: STRICTLY FORBID hardcoded machine-specific absolute local paths in nuget.config, package.json, or project files. Dependencies MUST resolve via standard public online registries (nuget.org, npm, PyPI) or documented relative repo-local fallback folders. Cloned repositories must restore and build out-of-the-box on any machine or CI/CD runner without manual path reconfiguration.

### `R_SEC_STD`: Universal Security & Zero Leakage
- **Category:** `ops`
- **Tags:** `security-standards`, `credentials`, `zero-leak`, `sanitization`
- **Definition:**
  > Universal Security & Zero-Leakage: Zero hardcoded credentials, IPs, or connection strings in code/tests/commits. Automated test suites must run 100% isolated (in-memory/mocks). Mandatory parameterized queries, PII sanitization, and least privilege database access. Refer to standards/universal/security-standards.md.

### `R_UI`: Universal UI Design System & Tokens
- **Category:** `ops`
- **Tags:** `ui`, `design-system`, `tokens`, `wcag`, `contrast`, `layout`
- **Definition:**
  > Universal UI/UX Design System: 5-tier token hierarchy, 60-30-10 color balance, WCAG 2.1 AA contrast, Living Slate tinted neutrals, 8pt spatial rhythm, action-oriented button naming (1-3 words, <=20 chars), enterprise ERP ledger immutability (Deactivate over Delete), responsive multi-pane layouts, and multi-platform consistency (WPF, WinForms, Web, Mobile).

### `R_REVERSE`: Reverse Engineering & Binary Analysis
- **Category:** `ops`
- **Tags:** `reverse-engineering`, `binary`, `disassembly`, `ghidra`, `decompilation`
- **Definition:**
  > Reverse Engineering & Binary Analysis: Static and dynamic disassembly/decompilation (Ghidra, IDA, Binary Ninja, angr), control flow deobfuscation, cryptographic primitive extraction, protocol recovery, zero unauthorized tampering, clean-room documentation.

### `R_VER`: Semantic Versioning & Release Governance
- **Category:** `ops`
- **Tags:** `versioning`, `semver`, `release`, `git-tag`
- **Definition:**
  > Semantic Versioning & Release Governance: Strict SemVer 2.0.0 (MAJOR.MINOR.PATCH.REVISION). SSoT in Directory.Build.props / package.json. Git tag format 'vX.Y.Z'. Atomic 'chore(release): bump version to x.y.z' commits. Non-destructive forward-only rollback protocol (never reuse released version numbers, yank/deprecate poisoned artifacts, increment patch/minor for revert commits). Refer to standards/universal/versioning-and-release-standards.md.

### `R_ANTI_SLOP`: Anti-AI-Slop & Dense Functional UI
- **Category:** `ops`
- **Tags:** `anti-slop`, `clean-ui`, `minimalism`, `density`, `no-fluff`
- **Definition:**
  > Quiet, dense UI and self-documenting code. Read standards/universal/ui-anti-ai-slop-standard.md before writing or reviewing UI styles, colors, motion, grids, badges, or UI copy, and before adding comments or abstractions.

