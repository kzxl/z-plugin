#!/usr/bin/env node
/**
 * Z-Craft MCP Server (Model Context Protocol)
 * Lightweight, zero-overhead stdio JSON-RPC 2.0 server.
 * Enforces Canonical Anti-Slop (AS-01..AS-12, AS-C1..AS-C5, AS-I1, AS-D1..AS-D4, AS-S1),
 * WCAG 2.1 token contrast, UX Micro-Specs, 4-State Scaffolding, and Interactive Previews.
 */

import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  lintUiContent,
  lintUiFiles,
  lintDiff,
  auditTokens,
  SLOP_RULES
} from './lib/anti-slop-linter.mjs';
import { generateMicroSpec } from './lib/spec-generator.mjs';
import { generateCanvasWidget } from './lib/generative-canvas.mjs';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from './lib/time-machine.mjs';
import { scaffoldComponent } from './lib/scaffolder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let pluginMeta = { name: 'z-craft', version: '1.11.0' };
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
      'Generate a disciplined UX Micro-Contract & 4-State Matrix (Populated, Loading, Empty, Error) from a natural language prompt, cross-referenced with z-gate helpers and z-brain gotchas.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Feature description or UI prompt' },
        format: { type: 'string', enum: ['markdown', 'json'], description: 'Output format (default: markdown)' }
      },
      required: ['prompt']
    }
  },
  {
    name: 'zcraft_lint_ui',
    description:
      'Run the Canonical Anti-Slop Linter (AS-01..AS-12, AS-C1..AS-C5, AS-I1, AS-D1..AS-D4, AS-S1) on snippets, files/directories, git diff, or WCAG 2.1 CSS token sheets.',
    inputSchema: {
      type: 'object',
      properties: {
        targetPath: { type: 'string', description: 'Path to source file or directory to audit' },
        snippet: { type: 'string', description: 'Raw code snippet to lint if not reading from file' },
        filename: { type: 'string', description: 'Virtual filename for snippet (e.g. Component.tsx)' },
        diff: { type: 'boolean', description: 'Audit added lines of git staged/unstaged diff only' },
        tokensFile: { type: 'string', description: 'CSS file path to audit custom property contrast (WCAG 2.1 AA)' },
        profile: { type: 'string', enum: ['enterprise', 'expressive'], description: 'Motion profile override' }
      }
    }
  },
  {
    name: 'zcraft_preview',
    description:
      'Generate a self-contained, interactive HTML/Tailwind canvas widget compatible with Antigravity host theme tokens and <agent-embed>.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Component or feature title' },
        htmlContent: { type: 'string', description: 'Custom HTML/Tailwind markup (leave empty for enterprise 4-state prototype)' },
        savePath: { type: 'string', description: 'Optional file path to persist the preview HTML (emits <agent-embed> tag)' }
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
    name: 'zcraft_scaffold',
    description:
      'Scaffold a 4-state enterprise UI component satisfying R_UX_MATRIX and canonical Anti-Slop laws in React/Tailwind, WPF XAML, or WinForms DevExpress.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Component title or domain entity (e.g. InventoryManagement, OrderList)' },
        framework: { type: 'string', enum: ['react', 'wpf', 'winforms'], description: 'Target UI framework (default: react)' }
      },
      required: ['title']
    }
  },
  {
    name: 'zcraft_status',
    description:
      'Show active status of Z-Craft, active checkpoints, and canonical Anti-Slop rule catalog.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

function handleRpc(req) {
  const { id, method, params } = req;

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
        if (args.tokensFile) {
          const fullPath = path.isAbsolute(args.tokensFile) ? args.tokensFile : path.join(cwd, args.tokensFile);
          if (!fs.existsSync(fullPath)) {
            resultText = JSON.stringify({ error: `Token file not found: ${args.tokensFile}` });
          } else {
            const audit = auditTokens(fs.readFileSync(fullPath, 'utf8'));
            resultText = JSON.stringify({ file: path.relative(cwd, fullPath).replace(/\\/g, '/'), ...audit }, null, 2);
          }
        } else if (args.diff) {
          const report = lintDiff(cwd, { profile: args.profile });
          resultText = JSON.stringify(report, null, 2);
        } else if (args.snippet) {
          const report = lintUiContent(args.snippet, args.filename || 'snippet.tsx', { cwd, profile: args.profile });
          resultText = JSON.stringify(report, null, 2);
        } else if (args.targetPath) {
          const fullPath = path.isAbsolute(args.targetPath) ? args.targetPath : path.join(cwd, args.targetPath);
          const reports = lintUiFiles([fullPath], cwd, { profile: args.profile });
          resultText = JSON.stringify(reports, null, 2);
        } else {
          resultText = JSON.stringify({ error: 'Provide targetPath, snippet, diff: true, or tokensFile.' });
        }
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: resultText }] }
        };
      }

      if (name === 'zcraft_preview') {
        const outPath = args.savePath
          ? (path.isAbsolute(args.savePath) ? args.savePath : path.join(cwd, args.savePath))
          : null;
        const widget = generateCanvasWidget({
          title: args.title,
          htmlContent: args.htmlContent,
          savePath: outPath || ''
        });
        if (outPath) {
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
                text: `Z-Craft Interactive Preview: ${widget.title}\n\n${widget.previewBlock}`
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
          standard: 'AS-01..AS-12, AS-C1..AS-C5, AS-I1, AS-D1..AS-D4, AS-S1',
          activeRules: SLOP_RULES.map((r) => ({ id: r.id, name: r.name, severity: r.severity })),
          checkpointsCount: checkpoints.length,
          recentCheckpoints: checkpoints.slice(0, 5)
        };
        return {
          jsonrpc: '2.0',
          id,
          result: { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] }
        };
      }

      if (name === 'zcraft_scaffold') {
        const scaffold = scaffoldComponent(args.title, { framework: args.framework || 'react' });
        return {
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `[Z-CRAFT SCAFFOLD: ${scaffold.framework.toUpperCase()}]\nFile: ${scaffold.filename}\nStates verified: ${scaffold.states.join(', ')}\n\n\`\`\`${scaffold.framework === 'wpf' ? 'xml' : scaffold.framework === 'winforms' ? 'csharp' : 'tsx'}\n${scaffold.code}\n\`\`\``
              }
            ]
          }
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
