#!/usr/bin/env node
/**
 * Z-Craft CLI Facade
 * Canonical Anti-Slop Linter, WCAG Token Auditor, UX Spec Generator, Preview & Checkpoints.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  lintUiFiles,
  lintDiff,
  auditTokens,
  SLOP_RULES
} from './lib/anti-slop-linter.mjs';
import { generateMicroSpec } from './lib/spec-generator.mjs';
import { generateCanvasWidget } from './lib/generative-canvas.mjs';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from './lib/time-machine.mjs';
import { scaffoldComponent } from './lib/scaffolder.mjs';

const [, , cmd, ...args] = process.argv;
const cwd = process.cwd();

function printHelp() {
  console.log(`
z-craft: Autonomous Software Craftsmanship & Canonical Anti-Slop Engine

Usage:
  node scripts/cli.mjs spec "<prompt>"                      Generate 4-state UX micro-contract
  node scripts/cli.mjs scaffold <Title> [react|wpf|winforms] Generate 4-state component boilerplate
  node scripts/cli.mjs lint --diff [--profile enterprise|expressive] [--json]
  node scripts/cli.mjs lint --tokens <css-file> [--json]    Audit WCAG 2.1 AA token contrast
  node scripts/cli.mjs lint [file/dir] [--profile ...] [--json]
  node scripts/cli.mjs preview "<title>" [out]              Generate interactive HTML widget
  node scripts/cli.mjs checkpoint create <name> [files...]  Create shadow micro-checkpoint
  node scripts/cli.mjs checkpoint list                      List existing checkpoints
  node scripts/cli.mjs checkpoint restore <id|name>         Restore working state from checkpoint
  node scripts/cli.mjs status                               Show canonical rules & checkpoint count
`);
}

function getModifiedGitFiles(dir) {
  const res = spawnSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8', windowsHide: true });
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => line.slice(3).trim().replace(/^"(.*)"$/, '$1'))
    .filter((p) => fs.existsSync(path.join(dir, p)) && fs.statSync(path.join(dir, p)).isFile());
}

function parseLintFlags(rawArgs) {
  let diff = false;
  let tokensFile = null;
  let profile = undefined;
  let asJson = false;
  const positional = [];

  for (let i = 0; i < rawArgs.length; i++) {
    const a = rawArgs[i];
    if (a === '--diff') diff = true;
    else if (a === '--json') asJson = true;
    else if (a === '--tokens') tokensFile = rawArgs[++i] || '';
    else if (a === '--profile') profile = rawArgs[++i];
    else positional.push(a);
  }
  return { diff, tokensFile, profile, asJson, positional };
}

switch (cmd) {
  case 'spec': {
    const prompt = args.join(' ');
    if (!prompt) {
      console.error('Error: Please provide a prompt or feature description.');
      process.exit(1);
    }
    console.log(generateMicroSpec(prompt, { format: 'markdown' }));
    break;
  }

  case 'scaffold': {
    const title = args[0];
    const framework = args[1] || 'react';
    if (!title) {
      console.error('Error: Please provide a component title.');
      process.exit(1);
    }
    const res = scaffoldComponent(title, { framework });
    console.log(`// File: ${res.filename} (${res.framework})\n${res.code}`);
    break;
  }

  case 'lint': {
    const { diff, tokensFile, profile, asJson, positional } = parseLintFlags(args);

    if (tokensFile !== null) {
      const fullPath = path.isAbsolute(tokensFile) ? tokensFile : path.join(cwd, tokensFile);
      if (!tokensFile || !fs.existsSync(fullPath)) {
        console.error(`Error: Token file '${tokensFile}' not found.`);
        process.exit(2);
      }
      const audit = auditTokens(fs.readFileSync(fullPath, 'utf8'));
      if (asJson) {
        console.log(JSON.stringify({ mode: 'tokens', file: tokensFile, ...audit }, null, 2));
      } else {
        console.log(`z-craft token contrast audit: ${tokensFile} (text >= 4.5:1, input/focus >= 3.0:1)`);
        for (const f of audit.failures) {
          console.log(`  ERROR AS-08 ${f.text} on ${f.surface}: ${f.ratio.toFixed(2)}:1 (needs ${f.minimum}:1) [${f.scope}]`);
        }
        console.log(`Summary: ${audit.checked.length} pair(s) checked, ${audit.failures.length} failure(s).`);
      }
      process.exit(audit.passed ? 0 : 1);
    }

    if (diff) {
      const report = lintDiff(cwd, { profile });
      if (asJson) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`z-craft diff lint (${report.source}, profile ${report.profile}): ${report.fileCount} file(s)`);
        for (const r of report.files) {
          if (r.violations.length === 0) continue;
          console.log(`\n${r.file} (Score: ${r.score}/100)`);
          for (const v of r.violations) {
            console.log(`  [${v.severity.toUpperCase()}] Line ${v.line} [${v.ruleId} ${v.name}]: ${v.message}`);
            console.log(`     Fix: ${v.fixHint}`);
          }
        }
        console.log(`\nSummary: ${report.errorCount} error(s), ${report.warningCount} warning(s) across ${report.fileCount} file(s).`);
      }
      process.exit(report.passed ? 0 : 1);
    }

    const target = positional[0] || '.';
    const fullPath = path.isAbsolute(target) ? target : path.join(cwd, target);
    if (!fs.existsSync(fullPath)) {
      console.error(`Error: Path '${target}' does not exist.`);
      process.exit(1);
    }

    const results = lintUiFiles([fullPath], cwd, { profile });
    const totalErrors = results.reduce((acc, r) => acc + r.errorCount, 0);
    const totalWarnings = results.reduce((acc, r) => acc + r.warningCount, 0);

    if (asJson) {
      console.log(JSON.stringify({ files: results, errorCount: totalErrors, warningCount: totalWarnings }, null, 2));
    } else {
      console.log(`z-craft: Linted ${results.length} file(s) for Canonical Anti-Slop compliance...`);
      for (const r of results) {
        if (r.violations.length > 0) {
          console.log(`\n${r.file} (Score: ${r.score}/100)`);
          for (const v of r.violations) {
            console.log(`  [${v.severity.toUpperCase()}] Line ${v.line} [${v.ruleId} ${v.name}]: ${v.message}`);
            console.log(`     Fix: ${v.fixHint}`);
          }
        }
      }
      console.log(`\nSummary: ${totalErrors} error(s), ${totalWarnings} warning(s) across ${results.length} file(s).`);
    }
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  case 'preview': {
    const title = args[0] || 'Feature Preview';
    const outPath = args[1] || path.join(cwd, '.zero-craft', 'preview.html');
    const widget = generateCanvasWidget({ title, savePath: outPath });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, widget.html, 'utf8');
    console.log(`Generated interactive preview: ${outPath}`);
    break;
  }

  case 'checkpoint': {
    const sub = args[0] || 'list';
    if (sub === 'create') {
      const name = args[1] || 'vibe';
      const explicitFiles = args.slice(2);
      const filesToSave = explicitFiles.length > 0 ? explicitFiles : getModifiedGitFiles(cwd);
      const res = createCheckpoint(cwd, name, filesToSave);
      console.log(`Created checkpoint: ${res.snapshotId} (${res.name}, ${res.fileCount} file(s))`);
    } else if (sub === 'restore') {
      const idOrName = args[1];
      if (!idOrName) {
        console.error('Error: Please provide snapshot ID or name to restore.');
        process.exit(1);
      }
      const res = restoreCheckpoint(cwd, idOrName);
      if (!res.success) {
        console.error(res.message);
        process.exit(1);
      }
      console.log(res.message);
    } else {
      const list = listCheckpoints(cwd);
      console.log(`z-craft: Found ${list.length} checkpoint(s):`);
      for (const c of list) {
        console.log(`- [${c.id}] ${c.name} (${c.createdAt}) - ${c.fileCount} file(s)`);
      }
    }
    break;
  }

  case 'status': {
    const list = listCheckpoints(cwd);
    console.log(`z-craft: Active`);
    console.log(`- Total checkpoints: ${list.length}`);
    console.log(`- Canonical anti-slop rules active (${SLOP_RULES.length}): ${SLOP_RULES.map((r) => r.id).join(', ')}`);
    break;
  }

  default:
    printHelp();
    break;
}
