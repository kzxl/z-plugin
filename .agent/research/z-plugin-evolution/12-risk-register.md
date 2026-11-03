# 12. Engineering Risk Register & Contingency Matrix

## 1. Risk Evaluation Methodology

Risks are categorized across five engineering domains and scored using standard qualitative risk scoring:
$$\text{Risk Score} = \text{Likelihood} (1\text{--}5) \times \text{Impact} (1\text{--}5)$$

- **Low Risk (1–6)**: Managed via standard development discipline.
- **Medium Risk (8–12)**: Requires dedicated architectural guardrails and telemetry.
- **High / Critical Risk (15–25)**: Requires mandatory pre-flight proof and documented rollback procedures.

---

## 2. Master Engineering Risk Matrix

| Risk ID | Category | Risk Description | Likelihood | Impact | Score | Mitigation Strategy | Rollback / Fallback Contingency |
| :--- | :--- | :--- | :---: | :---: | :---: | :--- | :--- |
| **RSK-01** | Performance | **ONNX CPU Embedding Latency Spikes**: Embedding extraction on low-end CPUs causes agent turn lag $>100\text{ms}$. | 3 (Med) | 4 (High) | **12** | Quantize model to INT8 (`bge-small-en-v1.5`, 32MB); cache embeddings by text hash in SQLite. | Fallback to pure SQLite FTS5 BM25 keyword matching if CPU inference exceeds 40ms. |
| **RSK-02** | Concurrency | **SQLite WAL Lock Contention in Multi-Agent Workflows**: Concurrent subagents writing to `zbrain.sqlite` encounter `SQLITE_BUSY`. | 3 (Med) | 4 (High) | **12** | Enable `PRAGMA busy_timeout = 5000;`; route all memory writes through single-writer AsyncQueue in Z-Runtime. | Retry with exponential jitter; buffer observations in memory if database is locked. |
| **RSK-03** | Memory | **WebAssembly Tree-sitter Memory Leak**: Wasm AST instances not garbage-collected during repetitive scans of large repositories. | 2 (Low) | 5 (Crit) | **10** | Explicitly call `parser.delete()` and `tree.delete()` in `finally` blocks; limit concurrent Wasm parser pools. | Revert scan tool to native regex heuristic scanner (`scan.mjs`). |
| **RSK-04** | Compatibility | **Agent Harness Hook Protocol Breaking Changes**: Upstream Antigravity or Claude Code alters stdin/stdout JSON hook contract. | 3 (Med) | 4 (High) | **12** | Isolate hook protocol parsing inside `src/compat/harness-adapter.mjs`; maintain comprehensive integration smoke tests. | Emit pass-through `{ permissionDecision: "allow" }` to prevent blocking developer workflows if contract fails. |
| **RSK-05** | Complexity | **DLC Extension Slot Over-Engineering**: Creating overly complex dynamic slot interfaces that third-party authors cannot easily build. | 3 (Med) | 3 (Med) | **9** | Enforce strictly declarative JSON contribution slots (`contributions.rules`, `contributions.synonyms`) rather than complex code hooks. | Consolidate core DLCs back into standard repository directories. |
| **RSK-06** | Quality | **False Positive Blocks in Quality Gate**: Refactoring tasks blocked due to strict LOC ratios when legitimate unit tests are added. | 4 (High) | 3 (Med) | **12** | Exclude test files (`*test*`, `*spec*`, `*Tests.cs`) from production LOC delta calculations; allow manual bypass flag `--force-gate`. | Developers use `--no-gate` or commit with explicit empirical proof tags. |
| **RSK-07** | OS / Filesystem | **Windows Path & Reparse Point Incompatibilities**: NTFS symlinks require elevated permissions; Go language servers reject junctions. | 3 (Med) | 4 (High) | **12** | Detect Windows developer mode via PowerShell; fall back gracefully to physical directory sync or in-place environment paths. | Maintain legacy `robocopy /MIR` fallback script in installer. |

---

## 3. Deep Dive: High-Priority Risk Mitigations

### 3.1 RSK-01: ONNX CPU Embedding Latency
- **Root Cause**: Running neural network forward passes in JavaScript can saturate single-threaded event loops if unoptimized.
- **Preventative Guardrail**:
  1. The embedding pipeline is executed in a detached background worker thread (`worker_threads`), preventing any UI or CLI freezing.
  2. LRU memory cache stores up to 2,000 recent query embeddings in RAM.
  3. Pre-computed embedding tables avoid re-inferencing unchanged knowledge atoms.
- **Circuit Breaker**: If `onnxruntime` initialization fails or CPU load $>90\%$, `z-brain` automatically trips a circuit breaker and executes pure BM25 FTS5 retrieval.

### 3.2 RSK-02: SQLite Lock Contention with Multi-Agent Teams
- **Root Cause**: Multiple subagents executing in parallel Git worktrees attempting simultaneous writes to `~/.gemini/config/plugins/z-brain/data/zbrain.sqlite`.
- **Preventative Guardrail**:
  ```javascript
  // Single-writer asynchronous queue in Z-Runtime
  class SQLiteWriteQueue {
    constructor(db) {
      this.db = db;
      this.queue = Promise.resolve();
    }
    push(transactionFn) {
      return new Promise((resolve, reject) => {
        this.queue = this.queue.then(async () => {
          try {
            const result = transactionFn(this.db);
            resolve(result);
          } catch (err) {
            reject(err);
          }
        });
      });
    }
  }
  ```
- **Result**: Zero concurrent write collisions. All write operations are serialized deterministically while reads continue concurrently in WAL mode.

### 3.3 RSK-04: Upstream Agent Hook Changes
- **Root Cause**: Fast evolution of Antigravity and Claude Code agent CLI platforms may alter hook arguments or environment variable names (`CLAUDE_PLUGIN_ROOT` vs `ANTIGRAVITY_PLUGIN_ROOT`).
- **Preventative Guardrail**:
  - The runtime uses a universal environment resolver:
    ```javascript
    export const PLUGIN_ROOT = process.env.ANTIGRAVITY_PLUGIN_ROOT || 
                                process.env.CLAUDE_PLUGIN_ROOT || 
                                path.resolve(__dirname, '..');
    ```
  - If a hook payload cannot be parsed as JSON, the guard emits exit code 0 and logs a quiet diagnostic rather than crashing the developer's terminal.
