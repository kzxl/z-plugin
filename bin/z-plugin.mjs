#!/usr/bin/env node
/**
 * z-plugin CLI — Agent Engineering Operating System (AEOS)
 *
 * Universal developer command-line interface unifying all 5 core plugins + z-runtime:
 * - `z-plugin init [agent]`       Configure AI coding agent (cursor/claude/codex/qoder/antigravity/all)
 * - `z-plugin route "<prompt>"`   Run AEOS Cognitive Router & unified multi-plugin pre-flight brief
 * - `z-plugin review [--unstaged]` Run z-gate differential code review (security, NEV, anti-slop, gotchas)
 * - `z-plugin lint [path|--diff|--tokens <file>]` Run z-craft canonical anti-slop & WCAG 2.1 linter
 * - `z-plugin preflight <file>`   Run z-brain pre-edit brief (churn, blast radius, gotchas, invariants)
 * - `z-plugin doctor [dir]`       Run z-mind workspace compliance & architecture health audit
 * - `z-plugin graph <from> <to>`  Trace shortest invocation path across repo (<2ms BFS)
 * - `z-plugin blast <symbol>`     Inspect blast radius, upstream dependents, and God Node risk
 * - `z-plugin taint <entry>`      Trace untrusted parameter data-flow to sensitive sinks
 * - `z-plugin canvas [out.html]`  Generate interactive SVG topology canvas from real workspace symbols
 * - `z-plugin dashboard [opts]`   Generate zero-daemon telemetry & cost dashboard
 * - `z-plugin demo`               Run visual capability benchmark showcase
 */

import path from 'node:path';
import fs from 'node:fs';
import cp from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { exportAgentConfig, SUPPORTED_AGENTS } from '../tools/agent-bridge.mjs';
import {
  tracePath,
  traceDataFlow,
  getBlastRadius,
  indexWorkspace
} from '../plugins/z-token/scripts/lib/symbol-cache.mjs';
import { generateGraphCanvasWidget } from '../plugins/z-craft/scripts/lib/generative-canvas.mjs';
import {
  lintUiFiles,
  lintDiff,
  auditTokens
} from '../plugins/z-craft/scripts/lib/anti-slop-linter.mjs';
import { orchestrateTask } from '../packages/z-runtime/src/orchestrator.mjs';
import {
  collectDashboardMetrics,
  renderDashboardHtml,
  startDashboardServer
} from '../tools/dashboard.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

let CLI_VERSION = '1.11.0';
try {
  CLI_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package.json'), 'utf8')).version || CLI_VERSION;
} catch {}

const args = process.argv.slice(2);
const command = args[0] ? args[0].toLowerCase() : 'help';

function showHelp() {
  console.log(`
\x1b[1m\x1b[36mz-plugin (AEOS)\x1b[0m — Agent Engineering Operating System (v${CLI_VERSION})
Universal Infrastructure for AI Coding Agents (Cursor, Claude Code, Antigravity, ZCode, Qoder, Codex)

\x1b[1mUsage:\x1b[0m
  z-plugin <command> [options]

\x1b[1mCommands:\x1b[0m
  \x1b[32minit [agent]\x1b[0m           Configure AI Coding Agent in current directory
                          Agents: \x1b[33mcursor, claude, windsurf, cline, copilot, codex, qoder, antigravity, all\x1b[0m
  \x1b[32mroute "<prompt>"\x1b[0m       Run AEOS Cognitive Router & unified multi-plugin pre-flight brief
                          Options: \x1b[33m--file <path> --symbol <name> --json\x1b[0m
  \x1b[32mreview [--unstaged]\x1b[0m    Run z-gate multi-dimensional diff review (Security, NEV, Anti-Slop, Gotchas)
  \x1b[32mlint [target]\x1b[0m          Run z-craft canonical Anti-Slop & WCAG linter (\x1b[33m--diff | --tokens <css>\x1b[0m)
  \x1b[32mpreflight <file>\x1b[0m       Run z-brain token-capped pre-edit impact brief
  \x1b[32mdoctor [dir]\x1b[0m           Run z-mind workspace compliance & architecture doctor (\x1b[33m--arch\x1b[0m)
  \x1b[32mgraph <from> <to>\x1b[0m      Trace shortest invocation path across repo (<2ms BFS)
  \x1b[32mblast <symbol>\x1b[0m         Inspect blast radius, upstream dependents, and God Node risk
  \x1b[32mtaint <entry>\x1b[0m          Trace untrusted parameter data-flow to sensitive sinks
  \x1b[32mcanvas [output.html]\x1b[0m   Generate interactive SVG topology canvas from real indexed workspace symbols
  \x1b[32mdashboard [out.html]\x1b[0m   Generate visual token telemetry & cost dashboard (\x1b[33m--serve --open\x1b[0m)
  \x1b[32mdemo\x1b[0m                   Run full visual benchmark and capability showcase
  \x1b[32mhelp\x1b[0m                   Display this help message
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

async function runRoute(cliArgs = []) {
  let file = null;
  let symbol = null;
  let asJson = false;
  const promptParts = [];

  for (let i = 0; i < cliArgs.length; i++) {
    const a = cliArgs[i];
    if (a === '--file') file = cliArgs[++i];
    else if (a === '--symbol') symbol = cliArgs[++i];
    else if (a === '--json') asJson = true;
    else promptParts.push(a);
  }
  const prompt = promptParts.join(' ').trim();
  if (!prompt) {
    console.error('\x1b[31mError:\x1b[0m Provide a task prompt. Example: z-plugin route "Fix stock deadlock"');
    process.exit(1);
  }
  const res = await orchestrateTask(prompt, { cwd: process.cwd(), targetFile: file, targetSymbol: symbol });
  if (asJson) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(res.briefMarkdown);
    console.log(`\n\x1b[90mRouted in ${res.durationMs}ms\x1b[0m`);
  }
}

async function runReview(cliArgs = []) {
  const cwd = process.cwd();
  const unstaged = cliArgs.includes('--unstaged');
  const asJson = cliArgs.includes('--json');
  let diff = '';
  try {
    diff = cp.execSync(unstaged ? 'git diff' : 'git diff --cached', {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    if (!diff.trim() && !unstaged) {
      diff = cp.execSync('git diff', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    }
  } catch {}

  if (!diff.trim()) {
    console.log('\x1b[32m[Z-GATE]\x1b[0m No staged or unstaged changes to review.');
    return;
  }
  const { reviewCode } = await import(pathToFileURL(path.join(ROOT_DIR, 'plugins', 'z-gate', 'scripts', 'lib', 'code-reviewer.mjs')).href);
  const { formatReviewReport } = await import(pathToFileURL(path.join(ROOT_DIR, 'plugins', 'z-gate', 'scripts', 'lib', 'review-formatter.mjs')).href);
  const report = await reviewCode({ diff, cwd });
  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReviewReport(report, 'markdown'));
  }
  if (report.status === 'FAIL') process.exit(1);
}

async function runLint(cliArgs = []) {
  const cwd = process.cwd();
  const asJson = cliArgs.includes('--json');
  const diffMode = cliArgs.includes('--diff');
  const tokensIdx = cliArgs.indexOf('--tokens');
  const profileIdx = cliArgs.indexOf('--profile');
  const profile = profileIdx >= 0 ? cliArgs[profileIdx + 1] : undefined;

  if (tokensIdx >= 0) {
    const tokensFile = cliArgs[tokensIdx + 1];
    if (!tokensFile || !fs.existsSync(path.resolve(cwd, tokensFile))) {
      console.error(`\x1b[31mError:\x1b[0m Token CSS file not found: ${tokensFile || '(missing)'}`);
      process.exit(2);
    }
    const audit = auditTokens(fs.readFileSync(path.resolve(cwd, tokensFile), 'utf8'));
    if (asJson) console.log(JSON.stringify(audit, null, 2));
    else {
      console.log(`[Z-CRAFT WCAG] ${tokensFile}: ${audit.checked.length} pairs checked, ${audit.failures.length} failure(s)`);
      for (const f of audit.failures) {
        console.log(`  ERROR AS-08 ${f.text} on ${f.surface}: ${f.ratio.toFixed(2)}:1 (needs ${f.minimum}:1) [${f.scope}]`);
      }
    }
    process.exit(audit.passed ? 0 : 1);
  }

  if (diffMode) {
    const report = lintDiff(cwd, { profile });
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`[Z-CRAFT DIFF] ${report.source} (${report.profile}): ${report.errorCount} error(s), ${report.warningCount} warning(s) across ${report.fileCount} file(s)`);
      for (const f of report.files) {
        for (const v of f.violations) {
          console.log(`  [${v.severity.toUpperCase()}] ${f.file}:${v.line} [${v.ruleId}] ${v.message}`);
        }
      }
    }
    process.exit(report.passed ? 0 : 1);
  }

  const target = cliArgs.find((a, idx) => !a.startsWith('--') && idx !== profileIdx + 1) || '.';
  const results = lintUiFiles([path.resolve(cwd, target)], cwd, { profile });
  const errors = results.reduce((s, r) => s + r.errorCount, 0);
  const warnings = results.reduce((s, r) => s + r.warningCount, 0);
  if (asJson) console.log(JSON.stringify({ files: results, errorCount: errors, warningCount: warnings }, null, 2));
  else {
    console.log(`[Z-CRAFT LINT] ${results.length} file(s): ${errors} error(s), ${warnings} warning(s)`);
    for (const r of results) {
      for (const v of r.violations) {
        console.log(`  [${v.severity.toUpperCase()}] ${r.file}:${v.line} [${v.ruleId}] ${v.message}`);
      }
    }
  }
  process.exit(errors > 0 ? 1 : 0);
}

async function runPreflight(file) {
  if (!file) {
    console.error('\x1b[31mError:\x1b[0m Target file path is required. Example: z-plugin preflight src/OrderService.cs');
    process.exit(1);
  }
  const { buildPreflightBrief } = await import(pathToFileURL(path.join(ROOT_DIR, 'plugins', 'z-brain', 'scripts', 'lib', 'preflight.mjs')).href);
  const brief = await buildPreflightBrief({ file, cwd: process.cwd() });
  console.log(typeof brief === 'string' ? brief : (brief.markdown || JSON.stringify(brief, null, 2)));
}

async function runDoctor(cliArgs = []) {
  const arch = cliArgs.includes('--arch');
  const targetDir = cliArgs.find((a) => !a.startsWith('--')) || process.cwd();
  if (arch) {
    const { auditArchitecture } = await import(pathToFileURL(path.join(ROOT_DIR, 'plugins', 'z-mind', 'scripts', 'lib', 'arch-doctor.mjs')).href);
    console.log(JSON.stringify(auditArchitecture(targetDir), null, 2));
  } else {
    const { runDoctor: execDoctor } = await import(pathToFileURL(path.join(ROOT_DIR, 'plugins', 'z-mind', 'scripts', 'lib', 'doctor.mjs')).href);
    console.log(JSON.stringify(execDoctor(targetDir), null, 2));
  }
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
  console.log(`\x1b[36m[CANVAS]\x1b[0m Indexing workspace and generating interactive topology canvas...`);
  const outPath = path.resolve(cwd, outFile);

  indexWorkspace(cwd);
  // Let generateGraphCanvasWidget load real indexed symbols from .z-plugin/cache/symbols/
  const res = generateGraphCanvasWidget({
    title: `${path.basename(cwd)} — Architecture Topology`,
    workspaceRoot: cwd,
    savePath: outPath
  });

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, res.html, 'utf8');
  console.log(`  \x1b[32m✓ Saved Interactive Canvas (${res.nodeCount} nodes, ${res.edgeCount} edges, ${res.communities.length} domains):\x1b[0m ${outPath}`);
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
  const portArg = cliArgs.find((a) => a.startsWith('--port='));
  const port = portArg ? parseInt(portArg.slice('--port='.length), 10) : 0;
  const outFlagEq = cliArgs.find((a) => a.startsWith('--out='));
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
    case 'route':
      await runRoute(args.slice(1));
      break;
    case 'review':
      await runReview(args.slice(1));
      break;
    case 'lint':
      await runLint(args.slice(1));
      break;
    case 'preflight':
      await runPreflight(args[1]);
      break;
    case 'doctor':
      await runDoctor(args.slice(1));
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

main().catch((err) => {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${err.message}`);
  process.exit(1);
});
