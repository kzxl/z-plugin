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

export const SUPPORTED_AGENTS = ['cursor', 'claude', 'windsurf', 'cline', 'copilot', 'codex', 'qoder', 'antigravity'];

const EDIT_TOOL_MATCHER = 'Edit|Write|MultiEdit|edit_file|write_file|write_to_file|create_file|search_replace|apply_patch|replace_file_content|multi_replace_file_content|multi_edit';

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

export function resolveObserverScript(rootDir = ROOT_DIR) {
  const local = path.join(rootDir, "plugins", "z-brain", "scripts", "observe.mjs");
  if (fs.existsSync(local)) return local;

  const home = os.homedir();
  for (const dir of [".gemini/config/plugins", ".zcode/plugins", ".qoder/plugins"]) {
    const candidate = path.join(home, ...dir.split("/"), "z-brain", "scripts", "observe.mjs");
    if (fs.existsSync(candidate)) return candidate;
  }

  return local;
}

function quoteArg(value) {
  return /\s/.test(value) ? `"${value}"` : value;
}

function nodeCommand(scriptPath, ...extra) {
  return [process.execPath, scriptPath, ...extra].map(quoteArg).join(" ");
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function mergeMcpServers(filePath, servers) {
  const config = readJson(filePath) || {};
  config.mcpServers = { ...(config.mcpServers || {}), ...servers };
  writeJson(filePath, config);
}

function mergeHookEventList(list, groups) {
  const target = Array.isArray(list) ? list : [];
  for (const group of groups) {
    const commands = (group.hooks || []).map((h) => h.command || "").filter(Boolean);
    const already = target.some((existing) =>
      (existing.hooks || []).some((h) => commands.includes(h.command))
    );
    if (!already) target.push(group);
  }
  return target;
}

/**
 * Merge hook events into a Claude/Qoder/Codex-style `{ hooks: { Event: [...] } }` object.
 * Existing user hooks are preserved; ours are only appended once.
 */
function mergeHookEvents(config, hooks) {
  const target = config && typeof config === "object" ? config : {};
  target.hooks = target.hooks && typeof target.hooks === "object" ? target.hooks : {};
  for (const [event, groups] of Object.entries(hooks || {})) {
    target.hooks[event] = mergeHookEventList(target.hooks[event], groups);
  }
  return target;
}

/**
 * Antigravity keys hooks by group name: `{ "z-brain": { "PostToolUse": [...] } }`.
 */
function mergeNamedHookGroup(config, groupName, events) {
  const target = config && typeof config === "object" ? config : {};
  const group = target[groupName] && typeof target[groupName] === "object" ? target[groupName] : {};
  for (const [event, groups] of Object.entries(events)) {
    group[event] = mergeHookEventList(group[event], groups);
  }
  target[groupName] = group;
  return target;
}

export function generateHostHooks(rootDir = ROOT_DIR, timeout = 10) {
  const script = resolveObserverScript(rootDir);
  const record = nodeCommand(script, "record");
  const flush = nodeCommand(script, "flush", "--quiet");
  return {
    PostToolUse: [
      {
        matcher: EDIT_TOOL_MATCHER,
        hooks: [{ type: "command", command: record, timeout }]
      }
    ],
    SessionEnd: [
      {
        hooks: [{ type: "command", command: flush, timeout }]
      }
    ]
  };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function mcpTomlBlocks(servers) {
  return Object.entries(servers)
    .map(([name, cfg]) => {
      const args = (cfg.args || []).map(tomlString).join(", ");
      return `[mcp_servers.${name}]\ncommand = ${tomlString(cfg.command)}\nargs = [${args}]\n`;
    })
    .join("\n");
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

  if (norm === 'codex') {
    const agentsPath = path.join(targetDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, rulesContent, 'utf8');

    const codexDir = path.join(targetDir, '.codex');
    if (!fs.existsSync(codexDir)) fs.mkdirSync(codexDir, { recursive: true });
    const configPath = path.join(codexDir, 'config.toml');
    const existing = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf8') : '';
    const missing = Object.entries(mcpServers).filter(([name]) => !existing.includes(`[mcp_servers.${name}]`));
    if (missing.length) {
      const blocks = mcpTomlBlocks(Object.fromEntries(missing));
      fs.writeFileSync(configPath, `${existing.trimEnd()}\n\n${blocks}`.trimStart(), 'utf8');
    }

    const hooksPath = path.join(codexDir, 'hooks.json');
    writeJson(hooksPath, mergeHookEvents(readJson(hooksPath), generateHostHooks()));

    return { agent: 'codex', files: [agentsPath, configPath, hooksPath] };
  }

  if (norm === 'qoder') {
    const agentsPath = path.join(targetDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, rulesContent, 'utf8');

    const settingsPath = path.join(targetDir, '.qoder', 'settings.json');
    const settings = mergeHookEvents(readJson(settingsPath), generateHostHooks());
    settings.mcpServers = { ...(settings.mcpServers || {}), ...mcpServers };
    writeJson(settingsPath, settings);

    return { agent: 'qoder', files: [agentsPath, settingsPath] };
  }

  if (norm === 'antigravity') {
    const agentsPath = path.join(targetDir, 'AGENTS.md');
    fs.writeFileSync(agentsPath, rulesContent, 'utf8');

    const agentsDir = path.join(targetDir, '.agents');
    if (!fs.existsSync(agentsDir)) fs.mkdirSync(agentsDir, { recursive: true });

    const hooksPath = path.join(agentsDir, 'hooks.json');
    writeJson(hooksPath, mergeNamedHookGroup(readJson(hooksPath), 'z-brain', generateHostHooks()));

    const mcpPath = path.join(agentsDir, 'mcp_config.json');
    mergeMcpServers(mcpPath, mcpServers);

    return { agent: 'antigravity', files: [agentsPath, hooksPath, mcpPath] };
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
