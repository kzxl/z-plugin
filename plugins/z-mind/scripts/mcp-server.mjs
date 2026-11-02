#!/usr/bin/env node
/**
 * Z-Mind MCP Server (Model Context Protocol)
 * Lightweight stdio JSON-RPC 2.0 server delivering engineering invariants & audits on demand.
 */

import readline from "node:readline";
import { queryRules, auditPlan } from "./lib/rules.mjs";
import { bootstrapProjectRule } from "./lib/bootstrap.mjs";

const TOOLS = [
  {
    name: "zmind_init",
    description: "Bootstrap a standardized .project-rule.md in the current workspace. Automatically detects language stack (C#, React, Node, Go, Rust, Python, PHP), configures tailored z-mind rules and z-brain memory hooks, and protects the file in .gitignore.",
    inputSchema: {
      type: "object",
      properties: {
        targetDir: {
          type: "string",
          description: "Target workspace directory (default: current working directory)"
        },
        force: {
          type: "boolean",
          description: "Overwrite existing .project-rule.md if already present"
        }
      }
    }
  },
  {
    name: "zmind_rules",
    description: "Lookup engineering invariants, architecture rules, and TDD guidelines by topic or tag (e.g. 'core', 'tdd', 'perf', 'git', 'refactor', 'all').",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Rule code, topic, or keyword (default: 'all')"
        }
      }
    }
  },
  {
    name: "zmind_audit",
    description: "Audit a technical plan, commit message, or refactoring proposal against Z-Mind engineering invariants (TDD reproduction gate, Conventional Commits, R_PROOF).",
    inputSchema: {
      type: "object",
      properties: {
        content: {
          type: "string",
          description: "Plan or commit message text to audit"
        }
      },
      required: ["content"]
    }
  },
  {
    name: "zmind_status",
    description: "Inspect active Z-Mind engineering rules and loaded discipline skills.",
    inputSchema: {
      type: "object",
      properties: {}
    }
  }
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", (line) => {
  if (!line.trim()) return;

  let request;
  try {
    request = JSON.parse(line);
  } catch (err) {
    sendResponse(null, null, { code: -32700, message: "Parse error" });
    return;
  }

  const { id, method, params } = request;

  try {
    switch (method) {
      case "initialize":
        sendResponse(id, {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "z-mind", version: "1.0.0" }
        });
        break;

      case "notifications/initialized":
        // Notification, no response
        break;

      case "tools/list":
        sendResponse(id, { tools: TOOLS });
        break;

      case "tools/call":
        handleToolCall(id, params?.name, params?.arguments || {});
        break;

      default:
        sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
        break;
    }
  } catch (err) {
    sendResponse(id, null, { code: -32603, message: `Internal error: ${err.message}` });
  }
});

function handleToolCall(id, name, args) {
  switch (name) {
    case "zmind_init": {
      const targetDir = args.targetDir || process.cwd();
      const res = bootstrapProjectRule(targetDir, { force: Boolean(args.force) });
      const text = [
        res.success ? `✅ [Z-MIND INIT SUCCESS]` : `ℹ️ [Z-MIND INIT NOTICE]`,
        `Message: ${res.message}`,
        res.projectName ? `Project: ${res.projectName}` : null,
        res.language ? `Stack: ${res.language}` : null,
        res.rules ? `Enforced Rules: ${res.rules.join(", ")}` : null,
        `Path: ${res.path}`
      ].filter(Boolean).join("\n");
      sendResponse(id, {
        content: [{ type: "text", text }]
      });
      break;
    }

    case "zmind_rules": {
      const rules = queryRules(args.topic || "all");
      const text = rules.map(r => `[${r.code}] ${r.title} [${r.category || "general"}] (${(r.tags || []).join(", ")}):\n  ${r.summary}`).join("\n\n");
      sendResponse(id, {
        content: [{ type: "text", text: text || "No matching rules found." }]
      });
      break;
    }

    case "zmind_audit": {
      const res = auditPlan(args.content);
      const text = [
        `=== Z-MIND AUDIT REPORT ===`,
        `Status: ${res.passed ? "PASSED" : "WARNINGS DETECTED"}`,
        `Summary: ${res.summary}`,
        ``,
        res.warnings.length > 0 ? `⚠️ Warnings:\n` + res.warnings.map(w => ` - ${w}`).join("\n") : `✅ All invariant checks satisfied.`
      ].join("\n");
      sendResponse(id, {
        content: [{ type: "text", text }]
      });
      break;
    }

    case "zmind_status": {
      const rules = queryRules("all");
      const cats = {
        invariants: rules.filter(r => r.category === "invariants").length,
        lang: rules.filter(r => r.category === "lang").length,
        arch: rules.filter(r => r.category === "arch").length,
        cognition: rules.filter(r => r.category === "cognition").length,
        domain: rules.filter(r => r.category === "domain").length,
        ops: rules.filter(r => r.category === "ops").length
      };

      const text = [
        `🧠 Z-Mind Cognitive Engineering Status (v1.0.0):`,
        `  • Canonical Rules: ${rules.length} rules active across 6 pillars:`,
        `    - Invariants: ${cats.invariants} | Languages: ${cats.lang} | Architecture: ${cats.arch}`,
        `    - Cognition: ${cats.cognition} | Domain ERP: ${cats.domain} | Operations: ${cats.ops}`,
        `  • Audit Engine: zmind_audit (verifies R_TDD, R_PROOF, R_NEV, R_WPF, R_DB, R_PUB)`,
        `  • Project Bootstrapper: zmind_init (auto-stack detection & .project-rule.md generator)`,
        `  • Autonomous Agents: architect (Deep-module design), investigator (4-phase root cause), reviewer (Adversarial NEV)`,
        `  • Active Skills: z-mind, z-architecture, z-bugfix, z-refactor, z-teamwork`
      ].join("\n");

      sendResponse(id, {
        content: [{ type: "text", text }]
      });
      break;
    }

    default:
      sendResponse(id, null, { code: -32601, message: `Unknown tool: ${name}` });
  }
}

function sendResponse(id, result, error = null) {
  const response = { jsonrpc: "2.0", id };
  if (error) {
    response.error = error;
  } else {
    response.result = result;
  }
  process.stdout.write(JSON.stringify(response) + "\n");
}
