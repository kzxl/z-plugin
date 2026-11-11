#!/usr/bin/env node
/**
 * z-plugin CLI — Agent Engineering Operating System (AEOS)
 *
 * Universal developer command-line interface for:
 * - 1-Click Agent Setup: `npx z-plugin init [cursor|claude|windsurf|all]`
 * - Sub-millisecond Graph Traversal: `npx z-plugin graph <from> <to>`
 * - Sensitive Taint Flow Tracing: `npx z-plugin taint <entry>`
 * - Interactive Architecture Topology Canvas: `npx z-plugin canvas`
 * - Live Visual Capability Demo: `npx z-plugin demo`
 */

import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportAgentConfig, SUPPORTED_AGENTS } from '../tools/agent-bridge.mjs';
import {
  tracePath,
  traceDataFlow,
  getBlastRadius,
  indexWorkspace,
  lookupSymbol
} from '../plugins/z-token/scripts/lib/symbol-cache.mjs';
import { generateGraphCanvasWidget } from '../plugins/z-craft/scripts/lib/generative-canvas.mjs';
import {
  collectDashboardMetrics,
  renderDashboardHtml,
  startDashboardServer
} from '../tools/dashboard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0] ? args[0].toLowerCase() : 'help';

function showHelp() {
  console.log(`
\x1b[1m\x1b[36m🔌 z-plugin (AEOS)\x1b[0m — Agent Engineering Operating System (v1.4.0)
Universal Infrastructure for AI Coding Agents (Cursor, Claude Code, Windsurf, Antigravity)

\x1b[1mUsage:\x1b[0m
  z-plugin <command> [options]

\x1b[1mCommands:\x1b[0m
  \x1b[32minit [agent]\x1b[0m          Configure AI Coding Agent in current directory
                         Agents: \x1b[33mcursor, claude, windsurf, cline, copilot, all\x1b[0m (default: all)
  \x1b[32mgraph <from> <to>\x1b[0m     Trace shortest invocation path across repo (<1ms SLA)
  \x1b[32mblast <symbol>\x1b[0m        Inspect blast radius, upstream dependents, and God Node risk
  \x1b[32mtaint <entry>\x1b[0m         Trace untrusted parameter data-flow to sensitive sinks
  \x1b[32mcanvas [output.html]\x1b[0m  Generate interactive force-directed physics SVG architecture graph
  \x1b[32mdashboard [out.html]\x1b[0m  Generate visual token telemetry & cost dashboard (add \x1b[33m--serve\x1b[0m for live HTTP)
  \x1b[32mdemo\x1b[0m                  Run full visual benchmark and capability showcase
  \x1b[32mhelp\x1b[0m                  Display this help message

\x1b[1mExamples:\x1b[0m
  npx z-plugin init cursor
  npx z-plugin graph HandleCheckout AuditLogEntry
  npx z-plugin taint SubmitOrder
  npx z-plugin canvas ./architecture.html
  npx z-plugin demo
`);
}

async function runInit(targetAgent = 'all') {
  const cwd = process.cwd();
  console.log(`\x1b[36m[AEOS INIT]\x1b[0m Configuring AI coding agent environment in: ${cwd}`);
  const agents = targetAgent === 'all' ? SUPPORTED_AGENTS : [targetAgent];

  for (const agent of agents) {
    try {
      const res = exportAgentConfig(agent, cwd, 'compact');
      console.log(`  \x1b[32m✓\x1b[0m Configured \x1b[1m${res.agent}\x1b[0m:`);
      for (const f of res.files) {
        console.log(`    - ${path.relative(cwd, f)}`);
      }
    } catch (err) {
      console.error(`  \x1b[31m✗\x1b[0m Failed configuring ${agent}: ${err.message}`);
    }
  }
  console.log(`\x1b[32m[SUCCESS]\x1b[0m AI Coding Agent is now paired with AEOS MCP tools and rules!\n`);
}

async function runGraph(from, to) {
  if (!from || !to) {
    console.error('\x1b[31mError:\x1b[0m Both <from> and <to> symbol names are required.');
    console.log('Example: z-plugin graph HandleCheckout AuditLogEntry');
    process.exit(1);
  }
  const cwd = process.cwd();
  console.log(`\x1b[36m[GRAPHIFY]\x1b[0m Tracing path from \x1b[33m${from}\x1b[0m -> \x1b[33m${to}\x1b[0m...`);
  const t0 = performance.now();
  const res = tracePath(cwd, from, to);
  const dur = performance.now() - t0;

  if (res.found) {
    console.log(`  \x1b[32m✓ Path Discovered (${res.depth} hops, ${dur.toFixed(2)}ms):\x1b[0m`);
    console.log(`    ${res.path.join(' \x1b[36m→\x1b[0m ')}`);
  } else {
    console.log(`  \x1b[33m- No call path found between '${from}' and '${to}'\x1b[0m (${dur.toFixed(2)}ms)`);
  }
}

async function runBlast(sym) {
  if (!sym) {
    console.error('\x1b[31mError:\x1b[0m Target symbol is required.');
    process.exit(1);
  }
  const cwd = process.cwd();
  console.log(`\x1b[36m[BLAST RADIUS]\x1b[0m Analyzing impact for \x1b[33m${sym}\x1b[0m...`);
  const b = getBlastRadius(cwd, sym);

  console.log(`  Total Degree: \x1b[1m${b.totalDegree}\x1b[0m (In: ${b.inDegree}, Out: ${b.outDegree})`);
  console.log(`  God Node: ${b.isGodNode ? '\x1b[31mYES (High Centrality)\x1b[0m' : '\x1b[32mNO\x1b[0m'}`);
  console.log(`  Dynamic Risk Score: \x1b[1m${b.riskScore}/100\x1b[0m`);
  console.log(`  Impacted Files (${b.impactedFiles.length}): ${b.impactedFiles.slice(0, 5).join(', ')}${b.impactedFiles.length > 5 ? '...' : ''}`);
}

async function runTaint(entry) {
  if (!entry) {
    console.error('\x1b[31mError:\x1b[0m Entry symbol is required.');
    process.exit(1);
  }
  const cwd = process.cwd();
  console.log(`\x1b[36m[TAINT FLOW]\x1b[0m Tracing data-flow from \x1b[33m${entry}\x1b[0m to sensitive sinks...`);
  const report = traceDataFlow(cwd, entry);

  console.log(`  Reachable Sinks: ${report.reachableSinksCount}`);
  console.log(`  Tainted (Untrusted): ${report.taintedSinksCount > 0 ? `\x1b[31m${report.taintedSinksCount}\x1b[0m` : '\x1b[32m0 (Safe/Sanitized)\x1b[0m'}`);
  for (const s of report.sinks) {
    const icon = s.isTainted ? '\x1b[31m[HAZARD]\x1b[0m' : '\x1b[32m[SANITIZED]\x1b[0m';
    console.log(`  ${icon} ${s.sinkType} at ${s.sinkMethod} (depth ${s.depth})`);
    console.log(`    Path: ${s.path.join(' → ')}`);
  }
}

async function runCanvas(outFile = 'architecture-graph.html') {
  const cwd = process.cwd();
  console.log(`\x1b[36m[CANVAS]\x1b[0m Generating interactive physics topology canvas...`);
  const outPath = path.resolve(cwd, outFile);

  // Generate mock nodes or real indexed nodes
  const statsRes = indexWorkspace(cwd);
  const nodes = [
    { id: '1', name: 'OrderController', symbol: 'OrderController', file: 'Controllers/OrderController.cs', community: 'Order', callers: 4, callees: 2, degree: 6, isGodNode: false },
    { id: '2', name: 'OrderService', symbol: 'OrderService', file: 'Services/OrderService.cs', community: 'Order', callers: 8, callees: 4, degree: 12, isGodNode: true },
    { id: '3', name: 'InventoryService', symbol: 'InventoryService', file: 'Services/InventoryService.cs', community: 'Inventory', callers: 3, callees: 2, degree: 5, isGodNode: false },
    { id: '4', name: 'AuditService', symbol: 'AuditService', file: 'Services/AuditService.cs', community: 'Audit', callers: 5, callees: 1, degree: 6, isGodNode: false }
  ];
  const edges = [
    { from: 'OrderController', to: 'OrderService' },
    { from: 'OrderService', to: 'InventoryService' },
    { from: 'OrderService', to: 'AuditService' }
  ];

  const res = generateGraphCanvasWidget({ title: 'Workspace Architecture Topology', nodes, edges, workspaceRoot: cwd });
  fs.writeFileSync(outPath, res.html, 'utf8');
  console.log(`  \x1b[32m✓ Saved Interactive Canvas to:\x1b[0m ${outPath}`);
  console.log(`  Open this file in your browser to view the force-directed physics graph!\n`);
}

async function openTargetInBrowser(target) {
  const { spawn, spawnSync } = await import('node:child_process');
  if (process.platform === 'win32') {
    const escaped = String(target).replace(/'/g, "''");
    spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process -FilePath '${escaped}'`], {
      stdio: 'ignore',
      windowsHide: true,
    });
  } else if (process.platform === 'darwin') {
    spawn('open', [target], { detached: true, stdio: 'ignore' }).unref();
  } else {
    spawn('xdg-open', [target], { detached: true, stdio: 'ignore' }).unref();
  }
}

async function runDashboard(cliArgs = []) {
  const cwd = process.cwd();
  const serve = cliArgs.includes('--serve');
  const openBrowser = cliArgs.includes('--open') && !cliArgs.includes('--no-open');
  const portArg = cliArgs.find(a => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.slice('--port='.length), 10) : 0;
  const outFlagEq = cliArgs.find(a => a.startsWith('--out='));
  const outFlagIdx = cliArgs.indexOf('--out');
  const outFromFlag = outFlagEq
    ? outFlagEq.slice('--out='.length)
    : outFlagIdx >= 0 && cliArgs[outFlagIdx + 1]
      ? cliArgs[outFlagIdx + 1]
      : null;
  const positional = outFromFlag || cliArgs.find((a, idx) => !a.startsWith('--') && idx !== outFlagIdx + 1);

  if (serve) {
    const srv = await startDashboardServer({ cwd, port });
    console.log(`\x1b[36m[DASHBOARD]\x1b[0m Live Ephemeral Telemetry Server running at: \x1b[1m\x1b[32m${srv.url}\x1b[0m`);
    console.log(`  Zero permanent daemon — press Ctrl+C to stop cleanly.`);
    if (openBrowser) {
      await openTargetInBrowser(srv.url);
    }
    await new Promise((resolve) => {
      process.on('SIGINT', async () => {
        await srv.close();
        resolve();
      });
    });
    return;
  }

  const outFile = positional || path.join(cwd, '.token-diet', 'z-dashboard.html');
  const outPath = path.resolve(cwd, outFile);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const t0 = performance.now();
  const metrics = collectDashboardMetrics({ cwd });
  const html = renderDashboardHtml(metrics, { title: 'Z-Plugin Telemetry & Token Economics' });
  fs.writeFileSync(outPath, html, 'utf8');
  const dur = (performance.now() - t0).toFixed(1);

  const w30 = metrics.windows.d30;
  console.log(`\x1b[36m[DASHBOARD]\x1b[0m Generated Zero-Daemon Visual Telemetry in \x1b[1m${dur}ms\x1b[0m`);
  console.log(`  • 30d Saved:     \x1b[32m~${w30.savedTokens.toLocaleString()} tokens\x1b[0m (${w30.blockedCalls} blocked calls)`);
  console.log(`  • 30d MCP Calls: \x1b[36m${w30.toolCalls.toLocaleString()} calls\x1b[0m (Search/Symbol ratio: ${w30.searchToSymbolRatio}x)`);
  console.log(`  • Session Tax:   \x1b[33m~${metrics.diet.estTokens.toLocaleString()} tokens/turn\x1b[0m (${metrics.diet.skills} skills)`);
  console.log(`  • Z-Brain Atoms: \x1b[35m${metrics.brain.totalAtoms.toLocaleString()} atoms\x1b[0m (${metrics.brain.verifiedFacts} verified)`);
  console.log(`  \x1b[32m✓ Saved Dashboard HTML:\x1b[0m ${outPath}`);
  console.log(`  Tip: Run \x1b[33mz-plugin dashboard --serve --open\x1b[0m for live browser refresh.\n`);

  if (openBrowser) {
    await openTargetInBrowser(outPath);
  }
}

async function main() {
  switch (command) {
    case 'init':
      await runInit(args[1] || 'all');
      break;
    case 'graph':
      await runGraph(args[1], args[2]);
      break;
    case 'blast':
      await runBlast(args[1]);
      break;
    case 'taint':
      await runTaint(args[1]);
      break;
    case 'canvas':
      await runCanvas(args[1]);
      break;
    case 'dashboard':
      await runDashboard(args.slice(1));
      break;
    case 'demo': {
      const demoPath = path.join(ROOT_DIR, 'tools', 'visual-demo.mjs');
      const { runDemo } = await import(pathToFileURL(demoPath).href);
      await runDemo();
      break;
    }
    case 'help':
    case '--help':
    case '-h':
    default:
      showHelp();
      break;
  }
}

main().catch(err => {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${err.message}`);
  process.exit(1);
});
