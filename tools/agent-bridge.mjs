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

function resolvePluginScript(pluginName, rootDir = ROOT_DIR) {
  const local = path.join(rootDir, "plugins", pluginName, "scripts", "mcp-server.mjs");
  if (fs.existsSync(local)) return local;

  const home = os.homedir();
  const agy = path.join(home, ".gemini", "config", "plugins", pluginName, "scripts", "mcp-server.mjs");
  if (fs.existsSync(agy)) return agy;

  const zcode = path.join(home, ".zcode", "plugins", pluginName, "scripts", "mcp-server.mjs");
  if (fs.existsSync(zcode)) return zcode;

  return local;
}

export function generateMcpServerConfigs(rootDir = ROOT_DIR) {
  const nodeBin = process.execPath;
  return {
    "z-token": {
      "command": nodeBin,
      "args": [resolvePluginScript("z-token", rootDir)]
    },
    "z-brain": {
      "command": nodeBin,
      "args": [resolvePluginScript("z-brain", rootDir)]
    },
    "z-mind": {
      "command": nodeBin,
      "args": [resolvePluginScript("z-mind", rootDir)]
    },
    "z-gate": {
      "command": nodeBin,
      "args": [resolvePluginScript("z-gate", rootDir)]
    },
    "z-craft": {
      "command": nodeBin,
      "args": [resolvePluginScript("z-craft", rootDir)]
    }
  };
}

export function generateUniversalRules(mode = 'compact') {
  if (mode === 'full') {
    const ruleEntries = Object.entries(ENGINEERING_RULES);
    const header = `# AEOS Universal Agent Engineering Rules\n# Generated automatically from z-mind SSoT (Full Unabridged)\n\n`;

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

  // Default: Context Diet Compact Index (~300 tokens instead of ~6,500 tokens)
  return `# AEOS Universal Engineering Invariants
# Generated automatically from z-mind SSoT (Progressive Disclosure Mode)

Canonical invariants are strictly enforced via the \`z-mind\` and \`z-gate\` MCP servers:
- **Core & Invariants:** [R_CORE] SOLID & Deep Modules, [R_TDD] Bugfix Reproduction Test First, [R_NEV] Net Engineering Value & Deletion Test, [R_PERF] Zero-Waste Allocations, [R_PROOF] Level 3+ Empirical Verification, [R_REUSE] Asset-First Discovery, [R_GIT] Conventional Commits & Targeted Staging.
- **Languages & Frameworks:** [R_CSHARP], [R_NODE], [R_REACT], [R_TS], [R_WPF], [R_WINFORMS], [R_GO], [R_PY], [R_RUST], [R_PHP].
- **UI & Software Craftsmanship:** [R_ANTI_SLOP] Zero AI Slop & Token Discipline, [R_UX_MATRIX] 4-State UX (Default, Loading skeleton, Empty data, Error with retry).
- **Domain Invariants (ERP & WMS):** [R_DOMAIN_FIN] Accounting Period Lock, [R_DOMAIN_WMS] Two-Step Handover, [R_DOMAIN_INV] Physical Stock Sync.

> **Instruction to AI Agent:** Adhere to canonical invariants during execution. Fetch full invariant details, rationale, and examples dynamically on-demand using MCP tool \`mcp__z-mind__zmind_rules(topic: "<rule_or_topic>")\`. Audit plans or diffs via \`mcp__z-mind__zmind_audit\`.
`;
}

export function exportAgentConfig(agentName, targetDir = process.cwd(), mode = 'compact') {
  const norm = String(agentName || '').trim().toLowerCase();
  const mcpServers = generateMcpServerConfigs();
  const rulesContent = generateUniversalRules(mode);

  if (norm === 'cursor') {
    const cursorRulesPath = path.join(targetDir, '.cursorrules');
    fs.writeFileSync(cursorRulesPath, rulesContent, 'utf8');

    const cursorMcpDir = path.join(targetDir, '.cursor');
    if (!fs.existsSync(cursorMcpDir)) fs.mkdirSync(cursorMcpDir, { recursive: true });
    const cursorMcpPath = path.join(cursorMcpDir, 'mcp.json');
    fs.writeFileSync(cursorMcpPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

    return { agent: 'cursor', files: [cursorRulesPath, cursorMcpPath] };
  }

  if (norm === 'claude') {
    const claudeMdPath = path.join(targetDir, 'CLAUDE.md');
    fs.writeFileSync(claudeMdPath, rulesContent, 'utf8');

    const claudeMcpPath = path.join(targetDir, '.claude_mcp.json');
    fs.writeFileSync(claudeMcpPath, JSON.stringify({ mcpServers }, null, 2), 'utf8');

    return { agent: 'claude', files: [claudeMdPath, claudeMcpPath] };
  }

  if (norm === 'windsurf') {
    const windsurfRulesPath = path.join(targetDir, '.windsurfrules');
    fs.writeFileSync(windsurfRulesPath, rulesContent, 'utf8');

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
    fs.writeFileSync(copilotPath, rulesContent, 'utf8');
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
