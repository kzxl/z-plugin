#!/usr/bin/env node
/**
 * Z-Gate MCP Server (Model Context Protocol)
 * Lightweight, zero-overhead stdio JSON-RPC 2.0 server.
 * Enforces Net Engineering Value (R_NEV), Asset-First Discovery (R_REUSE), and Git Invariants (R_GIT).
 */

import readline from 'node:readline';
import cp from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { findHelpers } from './lib/helper-discovery.mjs';
import { auditDiff } from './lib/nev-auditor.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pluginMeta = { name: 'z-gate', version: '1.0.0' };
try {
  const metaPath = path.resolve(__dirname, '..', 'plugin.json');
  if (fs.existsSync(metaPath)) {
    pluginMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  }
} catch {}

function getStagedDiff(cwd) {
  try {
    return cp.execSync('git diff --cached', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

function getUnstagedDiff(cwd) {
  try {
    return cp.execSync('git diff', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
}

const TOOLS = [
  {
    name: 'zgate_find_helpers',
    description:
      'Asset-First Discovery: Grep codebase Helpers, Extensions, Utils, and Common modules for reusable methods before writing redundant hand-rolled logic (R_REUSE).',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Keyword or intent to search (e.g. "format date", "parse decimal", "barcode", "empty string")' },
        language: { type: 'string', description: 'Optional file extension filter (e.g. ".cs", ".ts", ".py")' },
        directory: { type: 'string', description: 'Root directory to inspect (defaults to current working directory)' },
        maxMatches: { type: 'number', description: 'Max results (default: 15)' }
      },
      required: ['query']
    }
  },
  {
    name: 'zgate_audit_diff',
    description:
      'Pre-commit & refactor auditor: Verifies git diff against Net Engineering Value (R_NEV: wrapper hell, LOC bloat >30%), Asset Reuse (R_REUSE), and invariants (R_WPF, R_DB, R_PROOF, R_GIT).',
    inputSchema: {
      type: 'object',
      properties: {
        staged: { type: 'boolean', description: 'If true, inspects git staged diff (git diff --cached). Default: true.' },
        diff: { type: 'string', description: 'Explicit unified diff text to audit (optional, overrides git diff)' },
        commitMessage: { type: 'string', description: 'Proposed commit message to verify Conventional Commits format' },
        isRefactor: { type: 'boolean', description: 'Whether the task is a refactoring/cleanup (enforces strict LOC delta)' }
      }
    }
  },
  {
    name: 'zgate_status',
    description:
      'Inspect Z-Gate operational status, active invariants, and asset discovery index.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function handleToolCall(name, args) {
  const cwd = process.cwd();

  switch (name) {
    case 'zgate_find_helpers': {
      const results = findHelpers({
        query: args.query,
        cwd: args.directory || cwd,
        language: args.language,
        maxMatches: args.maxMatches || 15
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `No existing helpers found matching "${args.query}". You may proceed to author new logic, keeping it deep and concise.`
            }
          ]
        };
      }

      const formatted = [
        `🔍 Reusable Codebase Helpers Found (${results.length} matches):`,
        `💡 Review these existing assets before writing custom utility logic (R_REUSE):\n`,
        ...results.map(
          (r, idx) =>
            `${idx + 1}. [${r.file}:${r.line}]\n   Signature: \`${r.signature}\`${r.summary ? `\n   Summary: ${r.summary}` : ''}`
        )
      ].join('\n');

      return { content: [{ type: 'text', text: formatted }] };
    }

    case 'zgate_audit_diff': {
      let diffText = args.diff;
      if (!diffText) {
        diffText = args.staged !== false ? getStagedDiff(cwd) : getUnstagedDiff(cwd);
      }

      if (!diffText || diffText.trim().length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: 'No diff detected to audit (working tree / staging clean).'
            }
          ]
        };
      }

      const audit = auditDiff({
        diff: diffText,
        commitMessage: args.commitMessage,
        cwd,
        isRefactor: args.isRefactor
      });

      return {
        content: [{ type: 'text', text: JSON.stringify(audit, null, 2) }]
      };
    }

    case 'zgate_status': {
      const stats = {
        name: 'z-gate',
        version: pluginMeta.version,
        role: 'Net Engineering Value & Asset Discovery Gate',
        invariants: ['R_NEV', 'R_REUSE', 'R_CORE', 'R_PROOF', 'R_GIT', 'R_WPF', 'R_DB'],
        features: [
          'Asset-First Discovery (scans Helpers/, Extensions/, Utils/)',
          'Wrapper Hell & Interface Deletion Test',
          'LOC Inflation Guard (>30% line bloat limit on refactor)',
          'Pre-commit Invariant Checker'
        ],
        status: 'online'
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }]
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

// JSON-RPC 2.0 stdio loop
const rl = readline.createInterface({ input: process.stdin, terminal: false });

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', (line) => {
  if (!line.trim()) return;

  let req;
  try {
    req = JSON.parse(line);
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
        capabilities: { tools: {} },
        serverInfo: { name: 'z-gate', version: pluginMeta.version }
      }
    });
    return;
  }

  if (method === 'notifications/initialized') return;

  if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools: TOOLS } });
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
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        }
      });
    }
    return;
  }

  send({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
});
