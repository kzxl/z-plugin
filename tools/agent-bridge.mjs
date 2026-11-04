/**
 * Universal Agent Bridge & MCP Configuration Exporter
 * Agent Engineering Operating System (AEOS)
 *
 * Enables ANY AI Coding Agent (Cursor, Claude Code, Windsurf, Cline, Roo Code,
 * Aider, Zed, Continue, Copilot, OpenHands) to leverage AEOS plugins seamlessly.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ENGINEERING_RULES } from '../plugins/z-mind/scripts/lib/rules.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

export const SUPPORTED_AGENTS = ['cursor', 'claude', 'windsurf', 'cline', 'continue', 'copilot'];

export function generateMcpServerConfigs(rootDir = ROOT_DIR) {
  const nodeBin = process.execPath;
  return {
    "z-token": {
      "command": nodeBin,
      "args": [path.join(rootDir, "plugins", "z-token", "scripts", "mcp-server.mjs")]
    },
    "z-brain": {
      "command": nodeBin,
      "args": [path.join(rootDir, "plugins", "z-brain", "scripts", "mcp-server.mjs")]
    },
    "z-mind": {
      "command": nodeBin,
      "args": [path.join(rootDir, "plugins", "z-mind", "scripts", "mcp-server.mjs")]
    },
    "z-gate": {
      "command": nodeBin,
      "args": [path.join(rootDir, "plugins", "z-gate", "scripts", "mcp-server.mjs")]
    },
    "z-craft": {
      "command": nodeBin,
      "args": [path.join(rootDir, "plugins", "z-craft", "scripts", "mcp-server.mjs")]
    }
  };
}

export function generateUniversalRules(targetFormat = 'markdown') {
  const ruleEntries = Object.entries(ENGINEERING_RULES);
  const header = `# AEOS Universal Agent Engineering Rules\n# Generated automatically from z-mind SSoT\n\n`;

  let body = '';
  for (const [code, r] of ruleEntries) {
    body += `## [${code}] ${r.title}\n`;
    body += `- Category: ${r.category}\n`;
    if (r.tags && r.tags.length) {
      body += `- Tags: ${r.tags.join(', ')}\n`;
    }
    body += `- Invariant: ${r.summary}\n\n`;
  }

  return header + body;
}

export function exportAgentConfig(agentName, targetDir = process.cwd()) {
  const norm = String(agentName || '').trim().toLowerCase();
  const mcpServers = generateMcpServerConfigs();

  if (norm === 'cursor') {
    const cursorRulesPath = path.join(targetDir, '.cursorrules');
    fs.writeFileSync(cursorRulesPath, generateUniversalRules('cursor'), 'utf8');

    const cursorMcpDir = path.join(targetDir, '.cursor');
    if (!fs.existsSync(cursorMcpDir)) fs.mkdirSync(cursorMcpDir, { recursive: true });
    const cursorMcpPath = path.join(cursorMcpDir, 'mcp.json');
    fs.writeFileSync(cursorMcpPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

    return { agent: 'cursor', files: [cursorRulesPath, cursorMcpPath] };
  }

  if (norm === 'claude') {
    const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, generateUniversalRules('claude'), 'utf8');

    const claudeMcpPath = path.join(targetDir, '.claude_mcp.json');
    fs.writeFileSync(claudeMcpPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

    return { agent: 'claude', files: [claudeMdPath, claudeMcpPath] };
  }

  if (norm === 'windsurf') {
    const windsurfRulesPath = path.join(targetDir, '.windsurfrules');
    fs.writeFileSync(windsurfRulesPath, generateUniversalRules('windsurf'), 'utf8');

    const windsurfMcpPath = path.join(targetDir, '.codeium_mcp.json');
    fs.writeFileSync(windsurfMcpPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

    return { agent: 'windsurf', files: [windsurfRulesPath, windsurfMcpPath] };
  }

  if (norm === 'cline') {
    const clineMcpPath = path.join(targetDir, 'cline_mcp_settings.json');
    fs.writeFileSync(clineMcpPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');
    return { agent: 'cline', files: [clineMcpPath] };
  }

  if (norm === 'copilot') {
    const githubDir = path.join(targetDir, '.github');
    if (!fs.existsSync(githubDir)) fs.mkdirSync(githubDir, { recursive: true });
    const copilotPath = path.join(githubDir, 'copilot-instructions.md');
    fs.writeFileSync(copilotPath, generateUniversalRules('copilot'), 'utf8');
    return { agent: 'copilot', files: [copilotPath] };
  }

  throw new Error(`Unsupported agent '${agentName}'. Supported: ${SUPPORTED_AGENTS.join(', ')}`);
}

// CLI Execution Support
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const command = process.argv[2] || 'list';
  const target = process.argv[3] || 'all';

  if (command === 'list') {
    console.log('AEOS Universal Agent Bridge');
    console.log('Supported AI Coding Agents:', SUPPORTED_AGENTS.join(', '));
    console.log('\nUsage:');
    console.log('  node tools/agent-bridge.mjs export <agent> [targetDir]');
    console.log('  node tools/agent-bridge.mjs export all [targetDir]');
  } else if (command === 'export') {
    const targetDir = process.argv[4] || process.cwd();
    if (target === 'all') {
      for (const a of SUPPORTED_AGENTS) {
        const res = exportAgentConfig(a, targetDir);
        console.log(`[AEOS] Exported config for ${res.agent}: ${res.files.join(', ')}`);
      }
    } else {
      const res = exportAgentConfig(target, targetDir);
      console.log(`[AEOS] Exported config for ${res.agent}: ${res.files.join(', ')}`);
    }
  }
}
