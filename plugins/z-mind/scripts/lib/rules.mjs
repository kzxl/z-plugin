/**
 * Engineering Invariants & Standards Dictionary for Z-Mind
 * Complete SSoT containing 56 rules categorized across 6 engineering pillars.
 */

export const ENGINEERING_RULES = {
  "R_DOMAIN_FIN": {
    "title": "ERP Finance & Accounting Invariants",
    "category": "domain",
    "tags": [
        "finance",
        "accounting",
        "period-lock",
        "double-entry",
        "tax",
        "rounding",
        "ledger"
    ],
    "summary": "ERP Finance: Strict accounting period lock (strictly no retroactive edits to closed financial periods), double-entry balance verification (Total Debit == Total Credit on all posted vouchers), currency rounding discipline, and immutable posted general ledger transactions."
},
  "R_DOMAIN_WMS": {
    "title": "ERP Warehouse Management & Stock Handover",
    "category": "domain",
    "tags": [
        "wms",
        "warehouse",
        "handover",
        "location",
        "bin",
        "transfer",
        "two-step"
    ],
    "summary": "ERP WMS & Handover: Strict 2-step transfer gate (Dispatched -> In-Transit -> Received), bin/location capacity validation before storage assignment, and mandatory physical handover acknowledgment before stock ledger debit/credit."
},
  "R_CORE": {
    "title": "Universal Core & SOLID",
    "category": "invariants",
    "tags": [
      "core",
      "solid",
      "cohesion",
      "coupling",
      "deep-modules"
    ],
    "summary": "Universal Core: SOLID principles, high cohesion, low coupling, standard English naming and documentation, clear layer boundaries, no over-engineering."
  },
  "R_NODE": {
    "title": "Node.js Enterprise API Architecture",
    "category": "lang",
    "tags": [
      "node",
      "nodejs",
      "express",
      "javascript",
      "backend"
    ],
    "summary": "Node.js: Express REST APIs, Handler-Dispatcher architecture (canHandle/handle), Interceptor pipelines, Error boundaries, Mongoose/MongoDB/SQL, Service-layer business logic."
  },
  "R_REACT": {
    "title": "React & Frontend State Architecture",
    "category": "lang",
    "tags": [
      "react",
      "frontend",
      "ui",
      "web",
      "redux",
      "zustand"
    ],
    "summary": "React: Functional Components, Hooks (useState/useEffect/useMemo/useCallback), Redux Toolkit/Zustand, strict English RESTful routing, centralized apiClient, zero inline window.location redirects."
  },
  "R_CS": {
    "title": "C# .NET Standards & Patterns",
    "category": "lang",
    "tags": [
      "csharp",
      "dotnet",
      "cs",
      "backend",
      "async",
      "microsoft"
    ],
    "summary": "C# .NET: Modern C# syntax, Task/async naming suffixes (e.g. GetListAsync), pattern matching, native ArgumentNullException, <=40 lines/method, strong typing."
  },
  "R_WPF": {
    "title": "WinForms & WPF ERP Architecture",
    "category": "lang",
    "tags": [
      "wpf",
      "winforms",
      "desktop",
      "devexpress",
      "ui",
      "csharp",
      "erp"
    ],
    "summary": "WinForms/WPF ERP: STRICTLY NO BindingSource. BaseForm/XtraForm pattern, RunAfterShown delegate initialization, PopulateControls/CollectData 1-way manual mapping, safe async void exception catching."
  },
  "R_API": {
    "title": "Clean Architecture Web API",
    "category": "arch",
    "tags": [
      "api",
      "clean-arch",
      "webapi",
      "rest",
      "architecture",
      "dto"
    ],
    "summary": "Web API: Clean Architecture / Folder-per-feature, Autofac/Microsoft DI, Controller -> Service -> Repository layer separation, strict DTO localization."
  },
  "R_GO": {
    "title": "Go Concurrency & Service Architecture",
    "category": "lang",
    "tags": [
      "go",
      "golang",
      "backend",
      "channels",
      "goroutines"
    ],
    "summary": "Go: Goroutines, Channels, GoFlow toolkit, errgroup, typed worker pools (PoolWithFunc), explicit error handling, interface segregation."
  },
  "R_PHP": {
    "title": "Modern PHP 8+ Standards",
    "category": "lang",
    "tags": [
      "php",
      "backend",
      "laravel",
      "psr"
    ],
    "summary": "PHP 8+: strict_types=1, PSR-4 autoloading, PDO parameterized queries (LiteORM CLI), JWT/Crypto security, thin controllers."
  },
  "R_DB": {
    "title": "Database Reliability & Query Safety",
    "category": "domain",
    "tags": [
      "db",
      "database",
      "sql",
      "parameterized",
      "migration",
      "audit"
    ],
    "summary": "Database: Parameterized queries ONLY. Verify column mappings. Mandatory audit logging for writes. Schema modifications require isolated migration/rollback scripts."
  },
  "R_PUB": {
    "title": ".NET Lightweight Framework Publishing",
    "category": "ops",
    "tags": [
      "publish",
      "dotnet",
      "build",
      "singlefile",
      "lite"
    ],
    "summary": ".NET Publish: Lite configuration only (Framework-dependent, SingleFile, --self-contained false). Users install .NET Runtime on host machines to ensure fast builds and lightweight release packages."
  },
  "R_UNIVERSE": {
    "title": "Universe Modular Plugin Architecture",
    "category": "arch",
    "tags": [
      "universe",
      "plugin",
      "modular",
      "eventbus",
      "isolation"
    ],
    "summary": "Universe Plugin v4.0: Data sovereignty, indirect event communication (EventBus/MessageQueue), auto-registry, strict module isolation. Deleting a module folder must not break project build."
  },
  "R_EVT": {
    "title": "Event-Driven Architecture & Outbox",
    "category": "arch",
    "tags": [
      "event",
      "event-driven",
      "outbox",
      "messagequeue",
      "async"
    ],
    "summary": "Event-Driven: Decoupled domain events, Transactional Outbox pattern for dual-write safety, Idempotent consumers, asynchronous messaging."
  },
  "R_RES": {
    "title": "System Resilience & Fault Tolerance",
    "category": "arch",
    "tags": [
      "resilience",
      "circuit-breaker",
      "retry",
      "cache",
      "timeout"
    ],
    "summary": "Resilience: Circuit Breaker, Exponential Backoff with Jitter, explicit timeouts, Fallback cache (Stale-While-Revalidate), graceful degradation."
  },
  "R_TDD": {
    "title": "Test-Driven Development",
    "category": "invariants",
    "tags": [
      "tdd",
      "test",
      "reproduction",
      "red-green-refactor"
    ],
    "summary": "Test-Driven Development: Red-Green-Refactor cycle, reproduction test first, minimum production code, regression verification."
  },
  "R_PERF": {
    "title": "High Performance & Zero-Waste Allocation",
    "category": "invariants",
    "tags": [
      "perf",
      "performance",
      "memory",
      "allocations",
      "span",
      "simd"
    ],
    "summary": "High-Performance Compute: Span<T>, Memory<T>, ArrayPool<T>, NativeMemory, SIMD Vector128/256/512, cache alignment, zero GC allocations in tight loops."
  },
  "R_CPP": {
    "title": "Modern C++20 & Native Interop",
    "category": "lang",
    "tags": [
      "cpp",
      "cplusplus",
      "native",
      "interop",
      "cabi"
    ],
    "summary": "Modern C++ & Native Interop: C++20 standard, C-ABI export boundaries, [LibraryImport] Source Generators, Pinned memory, zero-copy pointer exchanges."
  },
  "R_PIPE": {
    "title": "Tiled Data Processing Pipelines",
    "category": "arch",
    "tags": [
      "pipeline",
      "streaming",
      "buffer",
      "channels",
      "tiled"
    ],
    "summary": "Tiled Data Pipeline: Producer-Consumer Channels, Bounded queues, Ring Buffers, Tile Partitioning for data exceeding physical RAM."
  },
  "R_STATE": {
    "title": "Execution State & Working Memory",
    "category": "arch",
    "tags": [
      "state",
      "memory",
      "working-memory",
      "context",
      "amnesia"
    ],
    "summary": "Execution State & Working Memory: Maintain explicit short-term state (Task goal, workspace delta/diff, diagnostic evidence, active hypotheses). Verify actual system feedback before/after actions. Prevent amnesia loops and repetitive failed fixes."
  },
  "R_ENG_OS": {
    "title": "Engineering Operating System (EngOS)",
    "category": "arch",
    "tags": [
      "eng-os",
      "cognitive-os",
      "architecture",
      "governance"
    ],
    "summary": "Engineering Operating System: 8-core engine (Knowledge, Memory L0-L4, State, Graph, Runtime, Risk, Evidence, Governance) governing the LLM as a Reasoning Core. Decouples state, memory tiers, and transactional regression gates from ephemeral prompts."
  },
  "R_ANDROID": {
    "title": "Android Jetpack Compose & NDK",
    "category": "lang",
    "tags": [
      "android",
      "mobile",
      "compose",
      "kotlin",
      "ndk"
    ],
    "summary": "Android & Jetpack Compose: Unidirectional Data Flow (UDF), StateFlow UI state immutability, Material 3 design tokens, Camera2/CameraX manual sensor stepping, NDK zero-copy DirectByteBuffer, non-blocking coroutine dispatching."
  },
  "R_ROUTE": {
    "title": "Skill & Toolchain Routing Protocol",
    "category": "arch",
    "tags": [
      "routing",
      "router",
      "toolchain",
      "dispatch",
      "supervision"
    ],
    "summary": "Skill Routing & Toolchain: Deterministic router-first dispatch. Never guess tool paths; verify against local tool-index SSoT. Auto-bootstrap missing capabilities. Enforce self-supervision <self_review> every 5 calls or after 2 identical failures to prevent amnesia and infinite loops."
  },
  "R_SEC": {
    "title": "Scope Authorization & Evidence Integrity",
    "category": "ops",
    "tags": [
      "security",
      "authorization",
      "evidence",
      "scope-gate"
    ],
    "summary": "Scope Gate & Evidence Chain: Strict authorization contract (auth.status=granted required before any intrusive action). Offline forensic sample isolation. Immutable Evidence-Finding-Path chain with cryptographic hash verification."
  },
  "R_GIT": {
    "title": "Git & Conventional Commits Discipline",
    "category": "invariants",
    "tags": [
      "git",
      "commit",
      "conventional-commits",
      "atomic"
    ],
    "summary": "Git & Commit Discipline: Atomic commits ONLY (1 feature/fix = 1 commit). Strictly follow Conventional Commits: <type>(<scope>): <subject>. Never bundle multiple independent controls/features into mega-commits. Keep documentation, refactoring, and releases isolated from functional feature commits."
  },
  "R_ACT": {
    "title": "Action-First Cognitive Ergonomics",
    "category": "cognition",
    "tags": [
      "action-first",
      "ux",
      "concise",
      "micro-action",
      "direct"
    ],
    "summary": "Action-First Cognitive UX: Zero preamble, lead with the immediate executable action on line 1, end each turn with ONE sub-2-minute micro-action, suppress non-blocking tangents, restate progress state on top, and format errors as Location -> Cause -> Fix."
  },
  "R_GAME": {
    "title": "Game Engine Architecture & Simulation",
    "category": "lang",
    "tags": [
      "game",
      "gamedev",
      "simulation",
      "physics"
    ],
    "summary": "Game Development & Engine Architecture: Server-authoritative logic, deterministic fixed-timestep simulation loop decoupled from rendering, object pooling, zero-allocation in hot tick paths, hierarchical state machines, spatial partitioning."
  },
  "R_GODOT": {
    "title": "Godot Engine & C# Architecture",
    "category": "lang",
    "tags": [
      "godot",
      "gamedev",
      "game",
      "csharp",
      "engine"
    ],
    "summary": "Godot Engine & .NET C#: Node composition over deep inheritance, typed [Export] properties, CanvasLayer UI separation, explicit signal unhooking on _ExitTree, PackedScene preloading, no GC allocations in _Process/_PhysicsProcess."
  },
  "R_EMBEDDED": {
    "title": "Embedded Systems & Bare-Metal RTOS",
    "category": "lang",
    "tags": [
      "embedded",
      "firmware",
      "rtos",
      "arm",
      "hardware",
      "dma"
    ],
    "summary": "Embedded & Bare-Metal RTOS: Linker-table auto-registration (FW_INIT_EXPORT), multi-tier memory hub with reserve margins, priority event hook interception (FW_HOOK_STOP), 2D strided DMA coprocessor, stack watermark canary profiling (0x5A5A5A5A), cross-gen CP15/DMB barriers, cache coherency contracts (clean/invalidate), boot-loop safe-mode recovery, zero heap in loops/ISR, compile with -Werror zero-warning discipline."
  },
  "R_LLM_GOV": {
    "title": "LLM Clean-Room & Provenance Governance",
    "category": "ops",
    "tags": [
      "llm-governance",
      "clean-room",
      "ip",
      "provenance",
      "transparency"
    ],
    "summary": "LLM Governance & Clean-Room IP: Strict transparency in AI contributions, Clean-Room protocol (learn & interpret, never blindly copy >15 lines per GNU copyright threshold), zero unverified MMIO/hardware registers without ROM/SSoT proof, human-in-the-loop architectural verification, mandatory provenance disclosure."
  },
  "R_LICENSE": {
    "title": "IP Governance & License Compliance",
    "category": "ops",
    "tags": [
      "license",
      "compliance",
      "mit",
      "gpl",
      "clean-room"
    ],
    "summary": "License Governance & IP Compliance: Mandatory LICENSE initialization (MIT by default). Strict license recognition & compatibility matrix (Permissive vs Copyleft/Viral GPL/AGPL). Absolute prohibition on copy-pasting proprietary/GPL code into sovereign/permissive codebases. Clean-room reimplementation only with zero-line verbatim contamination."
  },
  "R_BENCH": {
    "title": "Empirical Benchmarking & Provenance",
    "category": "ops",
    "tags": [
      "benchmark",
      "hardware-provenance",
      "performance",
      "latency"
    ],
    "summary": "Empirical Benchmarking & Hardware Provenance: Every performance claim, latency figure, or throughput metric MUST document the exact hardware testbed (CPU model, clock, core count, RAM, OS build, compiler version, optimization flags). Benchmark runners must log hardware provenance at startup. Unsubstantiated numbers without testbed context are rejected."
  },
  "R_RESEARCH": {
    "title": "Scientific Research & Hypothesis Testing",
    "category": "cognition",
    "tags": [
      "research",
      "scientific",
      "hypothesis",
      "ablation",
      "experiment"
    ],
    "summary": "Scientific Research & Empirical Methodology: Formulate explicit falsifiable hypotheses (H0 vs H1) before experimentation. Enforce Research Manager 5-way decision gate (Continue, Pivot, Merge, Discard, Stop). Dead hypotheses must be permanently registered DEAD in the Historian graveyard with immediate git rollback to prevent infinite dead loops. Mandate ablation studies and report statistical distributions (median, p95/p99, N>=30). Zero speculative claims."
  },
  "R_RES_MEM": {
    "title": "Research Memory & Negative Knowledge",
    "category": "cognition",
    "tags": [
      "research-memory",
      "negative-knowledge",
      "failed-approach",
      "evidence"
    ],
    "summary": "Research Memory & Negative Knowledge: Never rely solely on chat history. Maintain structured research memory (Hypothesis, Evidence, Experiment, Result, Failed Approach, Assumption, Contradiction, Decision). Mandatory check of failed_approaches ('Never repeat a verified failed approach') before touching code. Forbid repeating known failed approaches under identical constraints."
  },
  "R_DEAD_LOOP": {
    "title": "Dead-Loop Detection & Stagnation Breaker",
    "category": "cognition",
    "tags": [
      "dead-loop",
      "cycle-detection",
      "circuit-breaker",
      "stagnation"
    ],
    "summary": "Dead-Loop & Research Stagnation: Actively monitor execution graphs and query streams for loops. Enforce dual detection: (1) Graph Cycle Detector for structural state repeats (A -> B -> C -> A), (2) Semantic Similarity & Epistemic Entropy for subtle research stagnation (Search X -> Search synonym). Upon detection, immediately trip the circuit breaker, forbid synonym tweaking, and escalate to Research Manager for PIVOT or DISCARD."
  },
  "R_BUDGET": {
    "title": "Multi-Vector Resource Budget Governance",
    "category": "cognition",
    "tags": [
      "budget",
      "tokens",
      "cost",
      "governance",
      "stagnation"
    ],
    "summary": "Multi-Dimensional Research Budget: Replace naive 1D iteration limits (max_iterations=50) with multi-vector resource governance (Token, Time, Experiment, Search, Hypothesis, Stagnation budgets). Enforce hard stagnation budget limits: when K consecutive trials yield negligible information gain, trigger mandatory PIVOT. Never allow runaway token burn or open-ended searching."
  },
  "R_INFO_GAIN": {
    "title": "Expected Information Gain (EIG)",
    "category": "cognition",
    "tags": [
      "info-gain",
      "eig",
      "entropy",
      "epistemic-value"
    ],
    "summary": "Expected Information Gain (EIG): Never run an experiment without pre-evaluating its epistemic value. Ask: 'Will this experiment tell me something fundamentally new?' Forbid experiments where outcome is already predictable with high confidence (EIG ≈ 0). Prioritize experiments that maximize entropy reduction between competing hypotheses."
  },
  "R_QGEN": {
    "title": "Autonomous Question Generation",
    "category": "cognition",
    "tags": [
      "qgen",
      "question-generation",
      "decomposition",
      "critical-thinking"
    ],
    "summary": "Autonomous Question Generation: For high-level research problems, never jump directly to code. Actively decompose problems into foundational, skeptical, and orthogonal research questions (challenging premises, compiler optimizations, comparative trade-offs, alternative tech). Rank questions by foundational dependency and epistemic impact before formulating hypotheses."
  },
  "R_PENTEST": {
    "title": "Penetration Testing & Remediation",
    "category": "ops",
    "tags": [
      "pentest",
      "vulnerability",
      "cwe",
      "cvss",
      "security"
    ],
    "summary": "Application Security & Penetration Testing: Zero-unauthorized probing (authorized scope contract required). Non-destructive testing invariant (never cause data corruption or denial of service in testing). Mandatory CVSS v3.1/v4.0 scoring, CWE taxonomy mapping, and actionable remediation patch verification."
  },
  "R_PKG": {
    "title": "Dependency Portability & Package Integrity",
    "category": "ops",
    "tags": [
      "package",
      "nuget",
      "npm",
      "dependencies",
      "portability"
    ],
    "summary": "Package & Dependency Portability: STRICTLY FORBID hardcoded machine-specific absolute local paths in nuget.config, package.json, or project files. Dependencies MUST resolve via standard public online registries (nuget.org, npm, PyPI) or documented relative repo-local fallback folders. Cloned repositories must restore and build out-of-the-box on any machine or CI/CD runner without manual path reconfiguration."
  },
  "R_SEC_STD": {
    "title": "Universal Security & Zero Leakage",
    "category": "ops",
    "tags": [
      "security-standards",
      "credentials",
      "zero-leak",
      "sanitization"
    ],
    "summary": "Universal Security & Zero-Leakage: Zero hardcoded credentials, IPs, or connection strings in code/tests/commits. Automated test suites must run 100% isolated (in-memory/mocks). Mandatory parameterized queries, PII sanitization, and least privilege database access. Refer to standards/universal/security-standards.md."
  },
  "R_UI": {
    "title": "Universal UI Design System & Tokens",
    "category": "ops",
    "tags": [
      "ui",
      "design-system",
      "tokens",
      "wcag",
      "contrast",
      "layout"
    ],
    "summary": "Universal UI/UX Design System: 5-tier token hierarchy, 60-30-10 color balance, WCAG 2.1 AA contrast, Living Slate tinted neutrals, 8pt spatial rhythm, action-oriented button naming (1-3 words, <=20 chars), enterprise ERP ledger immutability (Deactivate over Delete), responsive multi-pane layouts, and multi-platform consistency (WPF, WinForms, Web, Mobile)."
  },
  "R_REVERSE": {
    "title": "Reverse Engineering & Binary Analysis",
    "category": "ops",
    "tags": [
      "reverse-engineering",
      "binary",
      "disassembly",
      "ghidra",
      "decompilation"
    ],
    "summary": "Reverse Engineering & Binary Analysis: Static and dynamic disassembly/decompilation (Ghidra, IDA, Binary Ninja, angr), control flow deobfuscation, cryptographic primitive extraction, protocol recovery, zero unauthorized tampering, clean-room documentation."
  },
  "R_COG_LOOP": {
    "title": "Empirical Cognitive Loop Workflow",
    "category": "cognition",
    "tags": [
      "cognitive-loop",
      "socratic",
      "hypothesis",
      "stress",
      "delta"
    ],
    "summary": "Empirical Cognitive Loop: Enforce a closed 5-phase cognitive loop for complex tasks: (1) Socratic Inquiry & boundary definition, (2) Baseline Inscription & falsifiable hypothesis (H1), (3) Targeted minimal implementation, (4) Grounded stress & empirical experimentation with new knowledge, (5) Comparative Delta (Delta After vs Before) evaluation before commit and knowledge consolidation."
  },
  "R_PRE_MORTEM": {
    "title": "Pre-Mortem Failure Analysis & Simulation",
    "category": "cognition",
    "tags": [
      "pre-mortem",
      "simulation",
      "failure-modes",
      "edge-case"
    ],
    "summary": "Pre-Mortem & User Persona Simulation: Run mental sandbox simulation before code generation or UI layout. Systematically analyze 3 worst-case failure modes, real-world user interaction ergonomics (e.g., misclicks, single-hand warehouse operation, network jitter), and extreme boundary data volumes (1M records vs 10 mock items) to eliminate latent design bugs."
  },
  "R_EPISTEMIC": {
    "title": "Epistemic Uncertainty Calibration",
    "category": "cognition",
    "tags": [
      "epistemic",
      "uncertainty",
      "probing",
      "spiking",
      "legacy"
    ],
    "summary": "Epistemic Calibration & Uncertainty Gate: Continuously quantify knowledge certainty. When touching high-uncertainty codebases (lacking tests, undocumented legacy, obscure domain boundaries), STRICTLY FORBID aggressive refactoring or speculative rewrite. Automatically downgrade execution to Probing/Spiking mode: execute read-only diagnostics, write reproduction tests, and establish baseline invariants first."
  },
  "R_NEV": {
    "title": "Net Engineering Value in Refactoring",
    "category": "invariants",
    "tags": [
      "nev",
      "refactor",
      "abstraction-tax",
      "pareto",
      "clean-code"
    ],
    "summary": "Multi-Objective Refactoring & Net Engineering Value (NEV): Functional equivalence is a baseline requirement, not a justification for code bloat or performance regression. Every refactoring must deliver a Pareto improvement across 4 dimensions: (1) Zero runtime regression (latency, memory allocations, query count), (2) Abstraction Tax limit (prohibit wrapper hell, single-impl speculative interfaces, and LOC inflation >30%), (3) Low cognitive complexity (nesting <=3, direct call paths), (4) 100% test contract preservation. If Net Engineering Value (NEV) <= 0, trigger mandatory rollback."
  },
  "R_PROOF": {
    "title": "Zero-Trust Empirical Proof",
    "category": "invariants",
    "tags": [
      "proof",
      "empirical",
      "zero-trust",
      "evidence",
      "verification"
    ],
    "summary": "Zero-Trust Empirical Proof & Anti-Aggrandizement: Strictly forbid subjective self-praise (e.g., 'clean', 'perfect', 'optimal') and unverified completion assertions. Every engineering claim must cite Level 3+ independent empirical proof (compiler exit code 0, passing automated tests with explicit assertion counts, or profiler logs). Agents must execute mandatory adversarial cross-examination (testing failure modes) before concluding any task."
  },
  "R_REUSE": {
    "title": "Asset-First Discovery & Zero Redundancy",
    "category": "invariants",
    "tags": [
      "reuse",
      "discovery",
      "existing-assets",
      "zero-duplication"
    ],
    "summary": "Asset-First Discovery & Zero-Redundancy Reuse: STRICTLY FORBID writing hand-rolled utility logic, custom helper classes, or duplicate extension methods without first surveying the repository. Before implementing any utility, parsing, formatting, or common business operation, the agent MUST grep the codebase for existing helpers (Helpers/, Extensions/, Utils/, Common/, Constants/). Reuse and compose existing project assets first. Writing redundant code when a project helper or standard library API already exists is an immediate regression."
  },
  "R_DOMAIN_INV": {
    "title": "ERP Inventory & Warehouse Invariants",
    "category": "domain",
    "tags": [
      "inventory",
      "warehouse",
      "erp",
      "stock",
      "locking",
      "fifo"
    ],
    "summary": "Inventory & Warehouse Invariants: Strict physical vs ledger reconciliation, transactional row-level stock locks (UPDLOCK, ROWLOCK), FIFO/LIFO ledger immutability, zero negative inventory unless explicit backorder configuration, atomic lot reservations."
  },
  "R_DOMAIN_PROD": {
    "title": "ERP Production & Lot Traceability",
    "category": "domain",
    "tags": [
      "production",
      "manufacturing",
      "lot",
      "serial",
      "traceability",
      "bom"
    ],
    "summary": "Production & Lot Traceability: End-to-end Lot/Serial traceability across BOM stages, immutable process sign-offs, ticket-to-journal stage transitions, zero unverified scrap or material substitution, continuous defect logging."
  },
  "R_DOMAIN_SALES": {
    "title": "ERP Sales Order & Packaging Flow",
    "category": "domain",
    "tags": [
      "sales",
      "order",
      "pricing",
      "packaging",
      "nkdg",
      "erp"
    ],
    "summary": "Sales & Packaging Flow: Deterministic price and discount calculation decoupled from UI, mandatory approval gate before warehouse stock-out, selective packing log (NKDG) generation, immutable audit journaling."
  },
  "R_DOMAIN_AUTH": {
    "title": "ERP Enterprise RBAC & Data Tenancy",
    "category": "domain",
    "tags": [
      "auth",
      "rbac",
      "permission",
      "security",
      "row-level-security"
    ],
    "summary": "Enterprise RBAC & Data Sovereignty: 2-tier authorization matrix (Feature-Action CRUD/Export/Approve + Row-Level Security tenancy filters), client UI signal delegation vs backend hard authorization filters, least-privilege service delegation."
  },
  "R_VER": {
    "title": "Semantic Versioning & Release Governance",
    "category": "ops",
    "tags": [
      "versioning",
      "semver",
      "release",
      "git-tag"
    ],
    "summary": "Semantic Versioning & Release Governance: Strict SemVer 2.0.0 (MAJOR.MINOR.PATCH.REVISION). SSoT in Directory.Build.props / package.json. Git tag format 'vX.Y.Z'. Atomic 'chore(release): bump version to x.y.z' commits. Non-destructive forward-only rollback protocol (never reuse released version numbers, yank/deprecate poisoned artifacts, increment patch/minor for revert commits). Refer to standards/universal/versioning-and-release-standards.md."
  },
  "R_RUST": {
    "title": "Rust Zero-Cost & Safety Standards",
    "category": "lang",
    "tags": [
      "rust",
      "native",
      "lowlevel",
      "cargo",
      "clippy"
    ],
    "summary": "Rust Standards: Clean separation into single-responsibility crates (<450 LOC/file), #![no_std] compatibility on core algorithms, zero runtime heap allocations in critical hot loops (pre-allocated pools/arenas, cacheline/page-aligned buffers), zero unhandled panics (explicit Result<T, E> error propagation), strict unsafe hygiene (mandatory /// # Safety docs), 100% warning-free builds (cargo clippy --all-targets -- -D warnings), and rustfmt formatting compliance. Refer to standards/rust/."
  },
  "R_PY": {
    "title": "Python AI & Async Web Services",
    "category": "lang",
    "tags": [
      "python",
      "py",
      "ai",
      "asyncio",
      "fastapi",
      "pydantic"
    ],
    "summary": "Python & AI Standards: Strict Python 3.10+ typing (mypy --strict, Union | syntax, Pydantic v2 schemas), non-blocking asyncio event-loop discipline (never run blocking I/O in async def without asyncio.to_thread, offload CPU-bound tasks to ProcessPoolExecutor), FastAPI lifespan management, SSE token streaming (sub-100ms TTFT, normalized event framing, X-Accel-Buffering: no), deterministic node-based workflow graphs with cycle limits (max_iterations <= 10), safe tool execution (zero unsanitized eval/exec), and structured TaskGroup concurrency. Refer to standards/python/."
  },
  "R_TEAM": {
    "title": "Multi-Agent Teamwork & File Ownership",
    "category": "invariants",
    "tags": [
      "team",
      "multi-agent",
      "teamwork",
      "file-ownership",
      "adversarial"
    ],
    "summary": "Multi-Agent Teamwork & Adversarial Orchestration: Partition complex engineering tasks across isolated subagent roles (Orchestrator, Explorer, Worker, Adversarial Reviewer, Empirical Challenger, Victory Auditor) with explicit Zero-Collision File Ownership contracts, structured handoff artifacts, and mandatory multi-stage verification gates before synthesis. Refer to architecture/multi-agent-teamwork-protocol.md."
  },
  "R_ANTI_SLOP": {
    "title": "Anti-AI-Slop & Dense Functional UI",
    "category": "ops",
    "tags": [
      "anti-slop",
      "clean-ui",
      "minimalism",
      "density",
      "no-fluff"
    ],
    "summary": "Quiet, dense UI and self-documenting code. Read standards/universal/ui-anti-ai-slop-standard.md before writing or reviewing UI styles, colors, motion, grids, badges, or UI copy, and before adding comments or abstractions."
  }
};

const KNOWN_CATEGORIES = new Set(["invariants", "lang", "arch", "cognition", "domain", "ops"]);

export function queryRules(topic = "all") {
  const q = String(topic || "all").trim().toLowerCase();
  if (q === "all" || q === "") {
    return Object.entries(ENGINEERING_RULES).map(([code, r]) => ({ code, ...r }));
  }

  // Exact category query support
  const cat = q.startsWith("cat:") ? q.slice(4).trim() : (KNOWN_CATEGORIES.has(q) ? q : null);
  if (cat) {
    return Object.entries(ENGINEERING_RULES)
      .filter(([_, r]) => (r.category && r.category.toLowerCase() === cat))
      .map(([code, r]) => ({ code, ...r }));
  }

  return Object.entries(ENGINEERING_RULES)
    .filter(([code, r]) => 
      code.toLowerCase() === q ||
      code.toLowerCase().includes(q) || 
      (Array.isArray(r.tags) && r.tags.some(t => t.toLowerCase() === q || t.toLowerCase().includes(q))) ||
      r.title.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q)
    )
    .map(([code, r]) => ({ code, ...r }));
}

export function auditPlan(text) {
  if (!text) return { passed: false, warnings: ["No text provided for audit."] };

  const warnings = [];
  const checks = [];

  // 1. Conventional Commits check if text looks like a commit or message
  if (text.includes("commit") || text.split("\n")[0].includes(":")) {
    const firstLine = text.trim().split("\n")[0];
    const isConventional = /^(feat|fix|refactor|test|docs|chore|perf|ci|style)(\([a-zA-Z0-9_\-\.\/]+\))?:\s.+/.test(firstLine);
    checks.push({ check: "Conventional Commit Format (R_GIT)", passed: isConventional });
    if (!isConventional && firstLine.length < 100 && /^[a-z0-9]/i.test(firstLine)) {
      warnings.push(`Commit title '${firstLine}' does not match Conventional Commits '<type>(<scope>): <subject>' (R_GIT).`);
    }
  }

  // 2. Bugfix without reproduction test (R_TDD)
  if (/bug|fix|error|crash|regression/i.test(text) && !/test|reproduce|assertion|verify|repro/i.test(text)) {
    warnings.push("Bugfix plan does not explicitly mention writing a deterministic reproduction test first (R_TDD).");
    checks.push({ check: "TDD Reproduction Gate (R_TDD)", passed: false });
  } else {
    checks.push({ check: "TDD Reproduction Gate (R_TDD)", passed: true });
  }

  // 3. Subjective self-praise check (R_PROOF)
  if (/\b(perfect|flawless|optimal|completely clean)\b/i.test(text)) {
    warnings.push("Plan uses subjective self-praise ('optimal', 'perfect'). Replace with Level 3+ empirical metrics (R_PROOF).");
    checks.push({ check: "Zero-Trust Empirical Proof (R_PROOF)", passed: false });
  } else {
    checks.push({ check: "Zero-Trust Empirical Proof (R_PROOF)", passed: true });
  }

  // 4. WinForms BindingSource violation (R_WPF)
  if (/BindingSource/i.test(text)) {
    warnings.push("WinForms/WPF invariant violation: STRICTLY NO BindingSource. Use BaseForm/XtraForm with PopulateControls/CollectData manual mapping (R_WPF).");
    checks.push({ check: "WinForms No BindingSource (R_WPF)", passed: false });
  }

  // 5. Raw SQL concatenation or unparameterized queries (R_DB, R_SEC_STD)
  if (/SELECT\s+.*\+\s*\$/i.test(text) || /\$\"SELECT\s+.*\{/i.test(text) || /SELECT\s+.*\+\s*[a-zA-Z0-9_]+/i.test(text)) {
    warnings.push("Potential SQL injection vulnerability: Parameterized queries ONLY (R_DB, R_SEC_STD).");
    checks.push({ check: "Database Parameterized Query Safety (R_DB)", passed: false });
  }

  // 6. Hardcoded machine-specific absolute paths (R_PKG)
  if (/[a-zA-Z]:\\(Users|Sources|Projects)\\[a-zA-Z0-9_\-\.]+/i.test(text) && !text.includes("install.ps1") && !text.includes("build-zmind")) {
    warnings.push("Machine-specific absolute local paths detected in plan/config. Dependencies must resolve via standard public registries or relative paths (R_PKG).");
    checks.push({ check: "Package & Path Portability (R_PKG)", passed: false });
  }

  // 7. Non-lite publish / full self-contained build (R_PUB)
  if (/--self-contained\s+true/i.test(text)) {
    warnings.push(".NET Publish: Lite configuration only (--self-contained false, Framework-dependent) to ensure fast builds and lightweight release packages (R_PUB).");
    checks.push({ check: ".NET Publish Lite (R_PUB)", passed: false });
  }

  // 8. Aggressive rewrite without probing (R_EPISTEMIC)
  if (/\b(complete rewrite|rewrite entire codebase|burn and rebuild)\b/i.test(text)) {
    warnings.push("Aggressive high-uncertainty rewrite detected. Epistemic calibration gate requires read-only diagnostics and reproduction tests first (R_EPISTEMIC).");
    checks.push({ check: "Epistemic Uncertainty Gate (R_EPISTEMIC)", passed: false });
  }

  return {
    passed: warnings.length === 0,
    checks,
    warnings,
    summary: warnings.length === 0 ? "Plan adheres to Z-Mind engineering invariants." : `Audit found ${warnings.length} invariant warning(s).`
  };
}
