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
  getKnowledgeByFile
} from './lib/db.mjs';
import { searchKnowledge } from './lib/search.mjs';
import {
  formatL0Progressive,
  formatDeepView,
  formatTerminalTable,
  formatTimeline,
  formatFileKnowledge
} from './lib/format.mjs';
import { harvestKnowledge } from './lib/harvest.mjs';

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
    name: 'zbrain_status',
    description:
      'Inspect Z-Brain health, total atom count, SQLite file size, and cache status.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function handleToolCall(name, args) {
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

    case 'zbrain_status': {
      const dbPath = path.resolve(__dirname, '..', 'data', 'zbrain.sqlite');
      let sizeBytes = 0;
      try { sizeBytes = fs.statSync(dbPath).size; } catch {}

      const stats = getDbStats(db);
      const payload = {
        name: 'z-brain',
        version: pluginMeta.version,
        backend: 'node:sqlite (in-process)',
        ftsEngine: 'FTS5 BM25',
        dbFile: dbPath,
        dbSize: `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`,
        status: 'online',
        summary: stats
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
    try {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const res = handleToolCall(toolName, toolArgs);
      send({ jsonrpc: '2.0', id, result: res });
    } catch (err) {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `[ERROR] ${err.message}` }],
          isError: true
        }
      });
    }
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
