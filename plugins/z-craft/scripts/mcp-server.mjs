#!/usr/bin/env node
/**
 * Z-Craft MCP Server (Model Context Protocol)
 * Lightweight, zero-overhead stdio JSON-RPC 2.0 server.
 * Enforces Software Craftsmanship, Anti-Slop (R_ANTI_SLOP), UX Micro-Specs, and Generative UI Previews.
 */

import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import { lintUiContent, lintUiFiles, SLOP_RULES } from './lib/anti-slop-linter.mjs';
import { generateMicroSpec } from './lib/spec-generator.mjs';
import { generateCanvasWidget } from './lib/generative-canvas.mjs';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from './lib/time-machine.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pluginMeta = { name: 'z-craft', version: '1.0.0' };
try {
  const metaPath = path.resolve(__dirname, '..', 'plugin.json');
  if (fs.existsSync(metaPath)) {
    pluginMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
  }
} catch {}

const TOOLS = [
  {
    name: 'zcraft_spec',
    description:
      'Generate a disciplined UX Micro-Contract & State Matrix (Default, Loading, Empty, Error) from a natural language vibe prompt to prevent missing edge cases and blank screens.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Vibe prompt or feature description (e.g. "Màn hình quản lý tồn kho vật tư có lọc theo kho")' },
        format: { type: 'string', enum: ['markdown', 'json'], description: 'Output format (default: markdown)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'zcraft_lint_ui',
    description:
      'Run the Anti-Slop AST Linter on code snippets or frontend files (React, Tailwind, HTML, XAML) to detect arbitrary hex colors, neon gradients, dead clicks, and missing states (R_ANTI_SLOP).',
    inputSchema: {
      type: 'object',
      properties: {
        targetPath: { type: 'string', description: 'Path to source file or directory to audit' },
        snippet: { type: 'string', description: 'Raw code snippet to lint if not reading from file' },
        filename: { type: 'string', description: 'Virtual filename for snippet (e.g. Component.tsx)' }
      }
    }
  },
  {
    name: 'zcraft_preview',
    description:
      'Generate a self-contained, interactive HTML/Tailwind canvas widget for live visual verification of UI components in Antigravity chat.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Component or feature title' },
        htmlContent: { type: 'string', description: 'Custom HTML/Tailwind markup (leave empty for crafted enterprise prototype)' },
        savePath: { type: 'string', description: 'Optional file path to persist the preview HTML' }
      },
      required: ['title']
    }
  },
  {
    name: 'zcraft_checkpoint',
    description:
      'Manage non-destructive vibe micro-checkpoints (create, list, or restore working UI state in 1 click without dirtying git log).',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'restore'], description: 'Action to perform' },
        name: { type: 'string', description: 'Checkpoint label (e.g. "before_tab_refactor")' },
        id: { type: 'string', description: 'Snapshot ID to restore' },
        files: { type: 'array', items: { type: 'string' }, description: 'File paths to include in snapshot (for create)' }
      },
      required: ['action']
    }
  },
  {
    name: 'zcraft_status',
    description:
      'Show active status of Z-Craft, active checkpoints, and Anti-Slop rules catalog.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function handleRpc(req) {
  const { id, method, params } = req;

  // JSON-RPC 2.0 notifications MUST NOT produce any response
  if (!method || method.startsWith('notifications/')) {
    return null;
  }

  if (method === 'ping') {
    return { jsonrpc: '2.0', id, result: {} };
  }

  if (method === 'initialize') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: pluginMeta.name, version: pluginMeta.version }
      }
    };
  }

  if (method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: { tools: TOOLS }
    };
  }

  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params || {};
    const cwd = process.cwd();

    try {
      if (name === 'zcraft_spec') {
        const spec = generateMicroSpec(args.prompt, { format: args.format || 'markdown' });
        const content = typeof spec === 'string' ? spec : JSON.stringify(spec, null, 2);
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: content }] }
        };
      }

      if (name === 'zcraft_lint_ui') {
        let resultText = '';
        if (args.snippet) {
          const report = lintUiContent(args.snippet, args.filename || 'snippet.tsx');
          resultText = JSON.stringify(report, null, 2);
        } else if (args.targetPath) {
          const fullPath = path.isAbsolute(args.targetPath) ? args.targetPath : path.join(cwd, args.targetPath);
          const reports = lintUiFiles([fullPath], cwd);
          resultText = JSON.stringify(reports, null, 2);
        } else {
          resultText = JSON.stringify({ error: 'Please provide either targetPath or snippet to lint.' });
        }
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: resultText }] }
        };
      }

      if (name === 'zcraft_preview') {
        const widget = generateCanvasWidget({
          title: args.title,
          htmlContent: args.htmlContent
        });
        if (args.savePath) {
          const outPath = path.isAbsolute(args.savePath) ? args.savePath : path.join(cwd, args.savePath);
          fs.mkdirSync(path.dirname(outPath), { recursive: true });
          fs.writeFileSync(outPath, widget.html, 'utf8');
        }
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `✨ Z-Craft Interactive Preview: ${widget.title}\n\n${widget.previewBlock}`
              }
            ]
          }
        };
      }

      if (name === 'zcraft_checkpoint') {
        const action = args.action || 'list';
        let res;
        if (action === 'create') {
          res = createCheckpoint(cwd, args.name || 'vibe', args.files || []);
        } else if (action === 'restore') {
          res = restoreCheckpoint(cwd, args.id || args.name);
        } else {
          res = listCheckpoints(cwd);
        }
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] }
        };
      }

      if (name === 'zcraft_status') {
        const checkpoints = listCheckpoints(cwd);
        const status = {
          plugin: pluginMeta.name,
          version: pluginMeta.version,
          activeRules: SLOP_RULES.map(r => ({ id: r.id, name: r.name, severity: r.severity })),
          checkpointsCount: checkpoints.length,
          recentCheckpoints: checkpoints.slice(0, 5)
        };
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
        };
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `Tool not found: ${name}` }],
          isError: true
        }
      };
    } catch (err) {
      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text', text: `[ERROR] ${err.message || String(err)}` }],
          isError: true
        }
      };
    }
  }

  return {
    jsonrpc: '2.0',
    id,
    error: { code: -32601, message: `Method not found: ${method}` }
  };
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  try {
    const req = JSON.parse(trimmed);
    const res = handleRpc(req);
    if (res) {
      process.stdout.write(JSON.stringify(res) + '\n');
    }
  } catch (err) {
    process.stdout.write(
      JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32700, message: 'Parse error', data: String(err) }
      }) + '\n'
    );
  }
});
