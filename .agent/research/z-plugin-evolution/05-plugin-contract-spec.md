# 05. Plugin Contract & Manifest Specification (v2.0)

## 1. Specification Overview

The **Plugin Contract Specification v2.0** defines the formal interfaces, manifest structure, capability schemas, and lifecycle hooks governing all plugins and DLC extensions operating within the Agent Engineering Operating System (AEOS).

This specification replaces legacy unstructured `plugin.json` files with a validated, strongly typed manifest: `z-plugin.manifest.json`.

---

## 2. Standard Plugin Manifest Schema (`z-plugin.manifest.json`)

Every plugin and extension module must place a `z-plugin.manifest.json` file at its root directory.

```json
{
  "$schema": "https://raw.githubusercontent.com/kzxl/z-plugin/main/schemas/manifest-v2.schema.json",
  "id": "z-brain",
  "name": "Z-Brain Knowledge Engine",
  "version": "2.0.0",
  "description": "5-tier hybrid episodic, semantic, and temporal knowledge retrieval engine.",
  "author": "kzxl",
  "license": "MIT",
  "kind": "domain-module",
  "main": "./src/index.mjs",
  
  "runtime": {
    "node": ">=22.0.0",
    "aeos": "^2.0.0",
    "os": ["win32", "linux", "darwin"]
  },

  "capabilities": {
    "provides": [
      {
        "id": "capability:knowledge-engine",
        "version": "2.0.0",
        "description": "Provides hybrid BM25 + ONNX vector knowledge retrieval and harvesting.",
        "contract": "./contracts/IKnowledgeEngine.d.ts"
      },
      {
        "id": "capability:session-observer",
        "version": "1.0.0",
        "description": "Captures automated developer observations across tool executions."
      }
    ],
    "requires": [
      {
        "id": "capability:token-budgeter",
        "version": "^2.0.0",
        "optional": true
      }
    ]
  },

  "dependencies": {
    "plugins": {
      "z-token": "^2.0.0"
    }
  },

  "events": {
    "subscribes": [
      "code.modified",
      "review.completed",
      "session.started"
    ],
    "publishes": [
      "memory.harvested",
      "memory.invalidated"
    ]
  },

  "permissions": {
    "filesystem": {
      "read": ["${WORKSPACE}", "${PLUGIN_DATA}"],
      "write": ["${PLUGIN_DATA}"]
    },
    "process": {
      "exec": ["git"]
    },
    "network": {
      "outbound": []
    }
  },

  "configurationSchema": {
    "type": "object",
    "properties": {
      "maxRecallAtK": {
        "type": "integer",
        "default": 5,
        "minimum": 1,
        "maximum": 20
      },
      "vectorSearchEnabled": {
        "type": "boolean",
        "default": true
      },
      "temporalDecayDays": {
        "type": "integer",
        "default": 90
      }
    }
  },

  "mcp": {
    "server": {
      "command": "node",
      "args": ["${PLUGIN_ROOT}/src/mcp-server.mjs"],
      "tools": [
        "zbrain_fetch",
        "zbrain_view",
        "zbrain_harvest",
        "zbrain_query",
        "zbrain_timeline"
      ]
    }
  },

  "hooks": {
    "SessionStart": [
      {
        "handler": "src/hooks/on-session-start.mjs",
        "timeout": 3
      }
    ],
    "PostToolUse": [
      {
        "matcher": "read_file|write_file|edit_file|run_command",
        "handler": "src/hooks/on-post-tool.mjs",
        "timeout": 5
      }
    ]
  }
}
```

---

## 3. Core Contract Interfaces

All inter-plugin method invocations must target formal TypeScript/ES-Doc interface contracts rather than concrete classes.

### 3.1 Plugin Entry Point Contract (`IZPlugin`)
```typescript
export interface IZPlugin {
  readonly id: string;
  readonly version: string;

  /**
   * Called during INITIALIZE phase.
   * Bind services, setup local SQLite connections, apply schema migrations.
   */
  initialize(context: IPluginContext): Promise<void>;

  /**
   * Called during ACTIVATE phase.
   * Register EventBus subscriptions and publish capabilities.
   */
  activate(context: IPluginContext): Promise<void>;

  /**
   * Called during DEACTIVATE phase.
   * Drain active operations, flush caches.
   */
  deactivate(): Promise<void>;

  /**
   * Called during DISPOSE phase.
   * Close database file descriptors and free unmanaged resources.
   */
  dispose(): Promise<void>;
}
```

### 3.2 Knowledge Engine Contract (`IKnowledgeEngine`)
```typescript
export interface IKnowledgeEngine {
  /**
   * Executes two-tier hybrid search: BM25 (FTS5) + Dense Vector (ONNX) + RRF.
   */
  query(params: {
    query: string;
    projectId?: string;
    tags?: string[];
    limit?: number;
    threshold?: number;
    asOfDate?: Date;
  }): Promise<KnowledgeSearchResult>;

  /**
   * Harvests an atomic lesson into the multi-tier memory store.
   */
  harvest(lesson: {
    problem: string;
    cause: string;
    fix: string;
    projectId: string;
    tags: string[];
    evidence?: string[];
    trustLevel?: 'observation' | 'verified_fact' | 'architectural_decision';
  }): Promise<HarvestResult>;

  /**
   * Retrieves historical gotchas associated with specific files touched in diff.
   */
  lookupByFiles(files: string[], limitPerFile?: number): Promise<FileGotcha[]>;
}
```

### 3.3 Quality & Diff Review Contract (`IZGateEngine`)
```typescript
export interface IZGateEngine {
  /**
   * Audits unified git diff against Net Engineering Value and Invariants.
   */
  reviewDiff(options: {
    diff: string;
    commitMessage?: string;
    isRefactor?: boolean;
    focusArea?: 'all' | 'security' | 'nev' | 'concurrency';
  }): Promise<AuditReport>;

  /**
   * Discovers existing codebase helpers matching a natural language query.
   */
  findHelpers(query: string, scopeDirectory?: string): Promise<DiscoveredHelper[]>;
}
```

---

## 4. Event Bus Protocol & Payload Schemas

Plugins communicate asynchronously via structured events over the runtime EventBus.

### Event Naming Conventions
- Format: `<domain>.<entity>.<action>` (e.g., `code.diff.generated`, `quality.review.failed`, `memory.atom.harvested`).

### Standard Event Payloads

#### 1. `quality.review.completed`
```typescript
export interface QualityReviewCompletedEvent {
  correlationId: string;
  filesModified: string[];
  netLineChange: number;
  passed: boolean;
  score: number; // 0 to 100
  criticalViolationsCount: number; // P0 issues
  warningsCount: number;
  summary: string;
  timestamp: number;
}
```

#### 2. `memory.atom.harvested`
```typescript
export interface MemoryAtomHarvestedEvent {
  atomId: number;
  projectId: string;
  problem: string;
  trustLevel: 'observation' | 'verified_fact' | 'architectural_decision';
  tags: string[];
  timestamp: number;
}
```

---

## 5. Permissions Enforcement Matrix

| Scope | Capability Check | Default Policy | Violation Action |
| :--- | :--- | :--- | :--- |
| `fs:read` | Target path under `${WORKSPACE}` or `${PLUGIN_DATA}` | Allowed | Deny read, emit audit log |
| `fs:write` | Target path under `${PLUGIN_DATA}` only | Denied for root OS | Deny write, throw `SecurityException` |
| `process:exec` | Executable exists in whitelisted `process.exec` array | Denied | Block spawn, alert agent |
| `net:outbound` | Target host declared in `network.outbound` | Denied (Offline default) | Block socket connection |
| `bus:publish` | Topic declared in manifest `events.publishes` | Allowed | Block event dispatch |

---

## 6. Backward Compatibility & Legacy Migration Bridge

To ensure that existing tools continue working without breaking changes:
1. **Manifest Translation Adapter**: If an older plugin has only `plugin.json` without `z-plugin.manifest.json`, the Manifest Manager automatically generates an in-memory v2.0 manifest using safe default values.
2. **Path Alias Shims**: Legacy hooks invoking `node ./scripts/guard.mjs` receive simulated environment variables (`${CLAUDE_PLUGIN_ROOT}`, `${Z_TOKEN_ROOT}`) to maintain 100% execution compatibility.
