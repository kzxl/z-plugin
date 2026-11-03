# 03. Comprehensive Architectural & Feature Comparison Matrix

## 1. Evaluation Dimensions

To evaluate the evolutionary leap from `z-plugin` v1.1.0 to the target **Agent Engineering Operating System (AEOS)**, this matrix compares seven dimensions against leading industry and open-source benchmarks:
1. **Context & Token Management** (Firewall, budgeting, oversized read guard).
2. **Code Perception & Structural Intelligence** (Regex heuristics vs Tree-sitter AST vs LSP).
3. **Memory Depth & Knowledge Recall** (Flat keyword FTS5 vs dense vector vs temporal graph).
4. **Engineering Governance & Quality Gates** (Invariants, Net Engineering Value, anti-slop, security).
5. **Multi-Agent Coordination & Concurrency** (Subagents, context pollution defense, workspace isolation).
6. **Runtime Architecture & Inter-Plugin Interop** (Loose coupling, lifecycle, contracts, event bus).
7. **Resource Efficiency & Local-First Autonomy** (Offline capability, zero-GPU requirement, zero vendor lock-in).

---

## 2. Master Feature Comparison Matrix

| Evaluation Dimension | `z-plugin` v1.1.0 (Current) | `obra/superpowers` | `oraios/serena` | `thedotmack/claude-mem` | `getzep/graphiti` | **Target AEOS (v2.0)** |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Context Firewall** | **PreToolUse hook** (Blocks large files & unbounded grep) | None (Relies on prompt compliance) | None (Relies on client prompting) | None | None | **PreToolUse + Dynamic Token Budgeter** |
| **Token Savings Ratio** | **81.6% – 99.2%** (Empirically verified) | Variable (High conversational turn cost) | ~70% on symbol edits | ~40% on historical lookups | ~50% on entity extraction | **85% – 98% guaranteed turn budget** |
| **Code Structure Perception** | Heuristic Regex (`scan.mjs`) | Markdown instructions | **Native LSP** (LSP client over JSON-RPC) | None | None | **Hybrid: WebAssembly Tree-sitter + Optional LSP** |
| **Memory Architecture** | Single SQLite table + FTS5 BM25 | None | Ephemeral session memory | Flat SQLite FTS5 + Optional Chroma | Temporal Knowledge Graph | **5-Tier Hierarchy: L0 to L4 + Temporal Relational Graph** |
| **Vector Retrieval** | None (Keyword only) | None | None | External Python / Chroma | Hybrid Vector + Graph | **Local CPU ONNX Vector Embeddings (`bge-small`)** |
| **Temporal Validity** | None (Static timestamps) | None | None | Session timestamps | **Bi-temporal intervals** ($t_{\text{from}}, t_{\text{to}}$) | **Bi-temporal edge invalidation & decay** |
| **Architecture Invariants** | **56 Rules** (`z-mind` catalog) | TDD & YAGNI prompt rules | None | None | None | **Core Rules + Domain DLC Packs** |
| **Net Engineering Value (NEV)** | **Mechanically Enforced** (`z-gate`) | Prompt-based review | None | None | None | **AST-backed NEV Diff Auditor** |
| **UI Software Craftsmanship** | Regex heuristics (`z-craft`) | None | None | None | None | **AST JSX/TSX & XAML anti-slop linter** |
| **Multi-Agent Isolation** | Conceptual markdown (`z-teamwork`) | Markdown subagent prompts | None | None | None | **Isolated Git Worktrees (`git worktree add`)** |
| **Plugin Interoperability** | Brittle relative dynamic imports | Shared prompt namespace | Stdio MCP tools | Standalone hook worker | Stdio API / Cloud service | **In-Memory EventBus + Service Registry** |
| **Runtime Lifecycle** | Unmanaged (Static file scripts) | Declarative skill files | Stdio process | Background Bun daemon | Python/FastAPI service | **9-State Deterministic Lifecycle Machine** |
| **Local-First & Offline** | **100% Local** (Node.js 22 built-ins) | **100% Local** (Prompts only) | Local (requires host LSPs) | Requires Bun + uv toolchain | Requires Neo4j or Python server | **100% Local (Node.js 22 + Wasm + ONNX CPU)** |
| **External Dependencies** | **Zero npm packages** | Zero dependencies | Node / Python LSPs | Bun runtime, Python uv | Python, Neo4j / Docker | **Zero external server daemons** |

---

## 3. Detailed Dimension Breakdown

### 3.1 Context & Token Management
- **Current `z-plugin`**: Strongest in raw token defense. The `guard.mjs` script blocks read operations exceeding 128KB, minified files, unbounded `grep -rn`, and verbose dotnet build dumps before they enter LLM context.
- **Shortcoming**: Lacks proactive turn budgeting. When multiple tools run, context still accumulates monotonically across long sessions.
- **AEOS Upgrade**: Introduces a **Context Budgeter** into the Cognitive Router. Each agent turn is assigned a strict token allowance (e.g., 8,000 tokens for context injection), distributed proportionally across memory recall, code symbols, and invariant rules.

### 3.2 Code Perception & Structural Intelligence
- **Current `z-plugin`**: `scan.mjs` uses 10 regex patterns to guess class and function definitions. Fails on multiline C# attributes, TypeScript exported arrow types, and generic trait implementations.
- **Benchmark Inspiration**: `oraios/serena` demonstrates compiler-grade precision using Language Servers, while `bloop` uses Tree-sitter.
- **AEOS Upgrade**: Embeds `web-tree-sitter` compiled to WebAssembly. This delivers native AST symbol extraction for 6 primary languages (C#, TypeScript/JS, Python, Go, Rust, Java) in $<5\text{ms}$ with zero host language toolchain requirements. When an LSP server is detected on the machine, AEOS transparently enables advanced cross-file reference tracking.

### 3.3 Memory Architecture & Knowledge Retrieval
- **Current `z-plugin`**: Fast FTS5 keyword matching, but completely blind to semantic synonyms not explicitly registered in its hardcoded dictionary. Deduplication uses a naive 45-character prefix check.
- **Benchmark Inspiration**: `thedotmack/claude-mem` captures observations passively on `PostToolUse`; `getzep/graphiti` maintains temporal graph validity windows.
- **AEOS Upgrade**: Implements a **5-Tier Memory Hierarchy** backed by SQLite FTS5 (BM25) combined with local ONNX Runtime vector embeddings (`bge-small-en-v1.5`, 384 dimensions) running on CPU. Reciprocal Rank Fusion (RRF) merges keyword and dense semantic scores. Graph edges model entity relations with temporal validity stamps directly in SQLite.

### 3.4 Engineering Governance & Quality Gates
- **Current `z-plugin`**: Exceptional conceptual rigor. The 56 rules and the NEV auditor enforce interface deletion tests (banning speculative single-impl interfaces) and line-of-code bloat limits.
- **Shortcoming**: Rules are statically baked into a single JSON file; the anti-slop linter uses regex string matching that produces false positives on SVG and legitimate color maps.
- **AEOS Upgrade**: Decomposes the rules engine into a core invariant engine with modular DLC rule packs. Upgrades `z-craft`'s anti-slop linter to perform AST-based JSX/TSX and XML inspection.

### 3.5 Inter-Plugin Communication & Lifecycle
- **Current `z-plugin`**: The critical architectural bottleneck. `z-gate` imports `z-brain` via `../../../z-brain/scripts/lib/db.mjs`. There is no central bus or service registration.
- **Benchmark Inspiration**: `eclipse-vertx` provides a lightweight, non-blocking asynchronous EventBus; `natemcmaster/DotNetCorePlugins` enforces formal contract interfaces.
- **AEOS Upgrade**: The **Z Core Runtime** provides an in-memory EventBus and typed Service Registry. Plugins communicate via pub/sub events (`event:code-modified`) or request-reply interfaces (`IKnowledgeService`), eliminating all filesystem path dependencies.

---

## 4. Trade-Off Analysis & Engineering Synthesis

```mermaid
quadrantChart
    title "Architectural Efficiency vs Implementation Complexity"
    x-axis "Low Implementation Complexity" --> "High Implementation Complexity"
    y-axis "Low Runtime Efficiency" --> "High Runtime Efficiency"
    quadrant-1 "Target AEOS (Optimum Sweet Spot)"
    quadrant-2 "Lightweight Pragmatism"
    quadrant-3 "Brittle / Naive Solutions"
    quadrant-4 "Bloated Enterprise Overkill"
    "z-plugin v1.1.0": [0.30, 0.72]
    "obra/superpowers": [0.15, 0.40]
    "oraios/serena": [0.65, 0.78]
    "thedotmack/claude-mem": [0.45, 0.65]
    "getzep/graphiti": [0.85, 0.60]
    "bloop (Rust+Qdrant)": [0.90, 0.82]
    "Target AEOS v2.0": [0.55, 0.95]
```

### Architectural Verdict
1. **Do NOT adopt bloop's full stack**: Compiling Rust binaries and running external Tantivy/Qdrant daemons introduces unbearable distribution and maintenance friction.
2. **Do NOT adopt graphiti's external graph engine**: Running external graph databases (Neo4j) violates local-first, zero-setup requirements. SQLite relational tables with recursive CTEs achieve identical graph traversal capabilities locally.
3. **DO adopt Serena's symbol-level editing philosophy** via WebAssembly Tree-sitter.
4. **DO adopt Vert.x's in-memory EventBus** to eradicate inter-plugin relative file coupling.
