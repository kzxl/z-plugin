#!/usr/bin/env node
/**
 * Z-Brain MCP Server (Model Context Protocol)
 * Lightweight, zero-overhead stdio JSON-RPC 2.0 server.
 * Optimized for context preservation and sub-millisecond retrieval via local SQLite FTS5.
 */

import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  getDb,
  getAtomById,
  countAtoms,
  getDbStats,
  getRecentAtoms,
  getRecentObservations,
  insertObservation,
  getKnowledgeByFile,
  getFileIndexEntry,
  getFileHistory,
  getRecentFileEvents,
  getFileObserverStats
} from './lib/db.mjs';
import { searchKnowledge } from './lib/search.mjs';
import {
  formatL0Progressive,
  formatDeepView,
  formatTerminalTable,
  formatTimeline,
  formatFileKnowledge,
  formatFileHistory,
  formatRecentChanges,
  formatImpact
} from './lib/format.mjs';
import { harvestKnowledge } from './lib/harvest.mjs';
import { harvestFromGit } from './lib/git-harvester.mjs';
import {
  ensureObserver,
  flushSpool,
  maybeReconcile,
  getObserverStatus
} from './lib/edit-observer.mjs';
import { resolveWorkspace, toWorkspaceRel } from './lib/workspace.mjs';
import { buildPreflight } from './lib/preflight.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Read plugin metadata
let pluginMeta = { name: 'z-brain', version: '1.0.0' };
try {
  const metaPath = path.resolve(__dirname, '..', 'plugin.json');
  if (fs.existsSync(metaPath)) {
    pluginMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  }
} catch {}

const db = getDb();

const TOOLS = [
  {
    name: 'zbrain_fetch',
    description:
      'Compact PRE-task context sweep. Returns progressive disclosure L0 index (Gotcha/Fix) with minimal token overhead (~30-50 tokens/item). Call before complex coding/refactoring tasks.',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description or context query' },
        project: { type: 'string', description: 'Project name (e.g. agentic-core, ua, erp). Defaults to current project or global.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Optional tag filters (e.g. ["tech:ua", "pattern:architecture"])' },
        limit: { type: 'number', description: 'Maximum number of items to return (default: 5)' }
      },
      required: ['task']
    }
  },
  {
    name: 'zbrain_view',
    description:
      'Inspect full details, code snippet, and evidence for a specific knowledge atom by ID. Use only when deep implementation details from L0 index are required.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'Knowledge atom ID to view' }
      },
      required: ['id']
    }
  },
  {
    name: 'zbrain_harvest',
    description:
      'POST-task knowledge harvesting. Save atomic lesson into local SQLite brain without token waste. Format: "<problem> | <cause> | <fix>".',
    inputSchema: {
      type: 'object',
      properties: {
        lesson: { type: 'string', description: 'Lesson string in "<problem> | <cause> | <fix>" format' },
        project: { type: 'string', description: 'Project name (e.g. agentic-core, erp, ua)' },
        tags: { type: 'array', items: { type: 'string' }, description: 'At least 2 tags: 1 domain, 1 tech tag' },
        trust_level: { type: 'string', enum: ['verified_fact', 'observation', 'hypothesis'], description: 'Trust level (default: observation)' },
        evidence: { type: 'string', description: 'Verification evidence (e.g. "build:ok", test logs)' },
        files: { type: 'array', items: { type: 'string' }, description: 'Associated files affected by this lesson' }
      },
      required: ['lesson', 'tags']
    }
  },
  {
    name: 'zbrain_query',
    description:
      'Search knowledge items using FTS5 keyword matching and trust-weighted ranking.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or question' },
        project: { type: 'string', description: 'Optional project scope' },
        limit: { type: 'number', description: 'Max results (default: 5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'zbrain_timeline',
    description:
      'Inspect recent project decisions, architectural choices, and activity milestones chronologically.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project scope' },
        limit: { type: 'number', description: 'Max items (default: 10)' }
      }
    }
  },
  {
    name: 'zbrain_file',
    description:
      'Look up knowledge atoms, past gotchas, and architectural decisions associated with a specific file or path.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path or file name to inspect' },
        limit: { type: 'number', description: 'Max items (default: 5)' }
      },
      required: ['file']
    }
  },
  {
    name: 'zbrain_history',
    description:
      'Inspect the automatic edit history of a file: operation, tool, line delta and redacted patch. Captured by host hooks plus the workspace watcher/reconcile.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path or file name to inspect' },
        project: { type: 'string', description: 'Optional project scope' },
        limit: { type: 'number', description: 'Max events (default: 12, capped in output for token diet)' }
      },
      required: ['file']
    }
  },
  {
    name: 'zbrain_changes',
    description:
      'List recent file changes captured automatically in the current workspace, newest first.',
    inputSchema: {
      type: 'object',
      properties: {
        project: { type: 'string', description: 'Optional project scope' },
        limit: { type: 'number', description: 'Max events (default: 10, capped in output for token diet)' }
      }
    }
  },
  {
    name: 'zbrain_impact',
    description:
      'Impact summary for a file: index metadata (size/language/hash), recent edit events, and related knowledge atoms and observations. Pass brief=true before editing to get a hard-capped pre-flight brief with call-graph blast radius, churn, co-edited files, impacted test files, gotchas and language invariants.',
    inputSchema: {
      type: 'object',
      properties: {
        file: { type: 'string', description: 'File path or file name to inspect' },
        project: { type: 'string', description: 'Optional project scope' },
        limit: { type: 'number', description: 'Max related items (default: 5)' },
        brief: { type: 'boolean', description: 'Return the compact pre-edit brief instead of the full impact summary (default: false)' },
        symbol: { type: 'string', description: 'Optional symbol to focus the blast radius; defaults to the file\'s types/functions' },
        budget: { type: 'number', description: 'Brief token budget (default: 300, clamped 60-800)' }
      },
      required: ['file']
    }
  },
  {
    name: 'zbrain_observe',
    description:
      'Record a technical decision, milestone, or architectural discovery for the current project into episodic memory.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Concise title of the decision or discovery' },
        summary: { type: 'string', description: 'Brief rationale or summary' },
        project: { type: 'string', description: 'Project name' },
        type: { type: 'string', enum: ['decision', 'milestone', 'discovery', 'refactor', 'bugfix'], description: 'Category' },
        files: { type: 'array', items: { type: 'string' }, description: 'Associated file paths' }
      },
      required: ['title', 'summary']
    }
  },
  {
    name: 'zbrain_harvest_git',
    description:
      'Auto-distill knowledge atom [Problem -> Cause -> Fix] from recent Git commit(s) or staged changes and store into SQLite FTS5 database.',
    inputSchema: {
      type: 'object',
      properties: {
        commit: { type: 'string', description: 'Git commit ref (default: HEAD)' },
        project: { type: 'string', description: 'Project name override' }
      }
    }
  },
  {
    name: 'zbrain_status',
    description:
      'Inspect Z-Brain health, total atom count, SQLite file size, and cache status.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

async function handleToolCall(name, args) {
  try {
    flushSpool(db);
  } catch {}
  try {
    maybeReconcile(db, { intervalMs: 120000, budgetMs: 800 });
  } catch {}

  switch (name) {
    case 'zbrain_fetch': {
      const results = searchKnowledge({
        query: args.task,
        project: args.project,
        tags: args.tags,
        limit: args.limit || 5
      });
      const text = formatL0Progressive(results, args.task);
      return {
        content: [{ type: 'text', text }]
      };
    }

    case 'zbrain_view': {
      const atom = getAtomById(db, Number(args.id));
      const text = formatDeepView(atom);
      return {
        content: [{ type: 'text', text }]
      };
    }

    case 'zbrain_harvest': {
      const res = harvestKnowledge({
        input: args.lesson,
        project: args.project || 'global',
        tags: args.tags || [],
        trust_level: args.trust_level || 'observation',
        evidence: args.evidence,
        files_touched: args.files || []
      });
      return {
        content: [{ type: 'text', text: JSON.stringify(res, null, 2) }]
      };
    }

    case 'zbrain_observe': {
      const id = insertObservation(db, {
        project_id: args.project || 'global',
        type: args.type || 'decision',
        title: args.title,
        summary: args.summary,
        files_touched: args.files || []
      });
      return {
        content: [{ type: 'text', text: `✅ Recorded observation #${id} for project [${args.project || 'global'}].` }]
      };
    }

    case 'zbrain_timeline': {
      const obs = getRecentObservations(db, {
        project: args.project,
        limit: args.limit || 10
      });
      const text = formatTimeline(obs);
      return {
        content: [{ type: 'text', text }]
      };
    }

    case 'zbrain_file': {
      const res = getKnowledgeByFile(db, args.file, {
        limit: args.limit || 5
      });
      const text = formatFileKnowledge(args.file, res.atoms, res.observations);
      return {
        content: [{ type: 'text', text }]
      };
    }

    case 'zbrain_history': {
      const workspace = resolveWorkspace(process.env.Z_PLUGIN_WORKSPACE || process.cwd());
      const events = getFileHistory(db, {
        workspace,
        project: args.project,
        file: args.file,
        limit: args.limit || 12
      });
      return {
        content: [{ type: 'text', text: formatFileHistory(args.file, events) }]
      };
    }

    case 'zbrain_changes': {
      const workspace = resolveWorkspace(process.env.Z_PLUGIN_WORKSPACE || process.cwd());
      const events = getRecentFileEvents(db, {
        workspace,
        project: args.project,
        limit: args.limit || 10
      });
      return {
        content: [{ type: 'text', text: formatRecentChanges(events, workspace) }]
      };
    }

    case 'zbrain_impact': {
      const workspace = resolveWorkspace(process.env.Z_PLUGIN_WORKSPACE || process.cwd());
      if (args.brief) {
        const brief = await buildPreflight({
          db,
          workspace,
          file: args.file,
          symbol: args.symbol,
          project: args.project,
          budget: args.budget,
        });
        return {
          content: [{ type: 'text', text: brief.text }]
        };
      }
      const abs = path.isAbsolute(args.file) ? args.file : path.join(workspace, args.file);
      const rel = toWorkspaceRel(workspace, abs) || args.file;
      const entry = getFileIndexEntry(db, workspace, rel);
      const events = getFileHistory(db, { workspace, file: args.file, limit: 6 });
      const knowledge = getKnowledgeByFile(db, args.file, { limit: args.limit || 5 });
      return {
        content: [{
          type: 'text',
          text: formatImpact(args.file, entry, events, knowledge.atoms, knowledge.observations)
        }]
      };
    }

    case 'zbrain_query': {
      const results = searchKnowledge({
        query: args.query,
        project: args.project,
        limit: args.limit || 5
      });
      const text = formatL0Progressive(results, args.query);
      return {
        content: [{ type: 'text', text }]
      };
    }

    case 'zbrain_harvest_git': {
      const res = harvestFromGit(db, {
        commit: args.commit || 'HEAD',
        project: args.project
      });
      return {
        content: [{ type: 'text', text: res.message || JSON.stringify(res, null, 2) }]
      };
    }

    case 'zbrain_status': {
      const dbPath = path.resolve(__dirname, '..', 'data', 'zbrain.sqlite');
      let sizeBytes = 0;
      try { sizeBytes = fs.statSync(dbPath).size; } catch {}

      const stats = getDbStats(db);
      const workspace = resolveWorkspace(process.env.Z_PLUGIN_WORKSPACE || process.cwd());
      const payload = {
        name: 'z-brain',
        version: pluginMeta.version,
        backend: 'node:sqlite (in-process)',
        ftsEngine: 'FTS5 BM25',
        dbFile: dbPath,
        dbSize: `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`,
        status: 'online',
        summary: stats,
        observer: {
          ...getObserverStatus(db, { cwd: workspace }),
          ...getFileObserverStats(db, { workspace })
        }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC 2.0 stdio Loop
const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', (line) => {
  const str = line.trim();
  if (!str) return;

  let req;
  try {
    req = JSON.parse(str);
  } catch (err) {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }

  const { id, method, params } = req;

  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        serverInfo: { name: 'z-brain', version: pluginMeta.version },
        capabilities: { tools: {} }
      }
    });
    return;
  }

  if (method === 'notifications/initialized') {
    return; // Ack
  }

  if (method === 'tools/list') {
    send({
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    });
    return;
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const toolArgs = params?.arguments || {};
    Promise.resolve()
      .then(() => handleToolCall(toolName, toolArgs))
      .then((res) => send({ jsonrpc: '2.0', id, result: res }))
      .catch((err) => send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `[ERROR] ${err.message}` }],
          isError: true
        }
      }));
    return;
  }

  // Ping or unhandled
  if (method === 'ping') {
    send({ jsonrpc: '2.0', id, result: {} });
    return;
  }

  send({
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  });
});

// Start automatic capture after the handshake path is wired: watcher + baseline reconcile.
setTimeout(() => {
  try {
    ensureObserver(db);
  } catch {}
}, 0).unref?.();
