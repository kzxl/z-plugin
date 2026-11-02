#!/usr/bin/env node
/**
 * Z-Craft CLI Facade
 * Autonomous Software Craftsmanship & Disciplined Vibe-Coding Engine.
 */

import fs from 'node:fs';
import path from 'node:path';
import { lintUiContent, lintUiFiles } from './lib/anti-slop-linter.mjs';
import { generateMicroSpec } from './lib/spec-generator.mjs';
import { generateCanvasWidget } from './lib/generative-canvas.mjs';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from './lib/time-machine.mjs';

const [,, cmd, ...args] = process.argv;
const cwd = process.cwd();

function printHelp() {
  console.log(`
z-craft: Autonomous Software Craftsmanship & Disciplined Vibe-Coding Engine

Usage:
  node scripts/cli.mjs spec "<prompt>"           Generate UX micro-contract & 4-state matrix
  node scripts/cli.mjs lint [file/dir]           Run Anti-Slop AST Linter on code
  node scripts/cli.mjs preview "<title>" [out]   Generate self-contained interactive HTML widget
  node scripts/cli.mjs checkpoint create <name>  Create a shadow micro-checkpoint of modified files
  node scripts/cli.mjs checkpoint list           List existing checkpoints
  node scripts/cli.mjs checkpoint restore <id>   Restore working state from a checkpoint
  node scripts/cli.mjs status                    Show z-craft rules & status
`);
}

switch (cmd) {
  case 'spec': {
    const prompt = args.join(' ');
    if (!prompt) {
      console.error('Error: Please provide a prompt or vibe description.');
      process.exit(1);
    }
    const spec = generateMicroSpec(prompt, { format: 'markdown' });
    console.log(spec);
    break;
  }

  case 'lint': {
    const target = args[0] || '.';
    const fullPath = path.isAbsolute(target) ? target : path.join(cwd, target);
    if (!fs.existsSync(fullPath)) {
      console.error(`Error: Path '${target}' does not exist.`);
      process.exit(1);
    }

    const filesToLint = [];
    if (fs.statSync(fullPath).isDirectory()) {
      function walk(dir) {
        for (const item of fs.readdirSync(dir)) {
          if (['node_modules', '.git', 'bin', 'obj', 'dist', '.zero-token', '.zero-gate', '.zero-craft'].includes(item)) continue;
          const p = path.join(dir, item);
          if (fs.statSync(p).isDirectory()) {
            walk(p);
          } else if (/\.(tsx|jsx|html|vue|svelte|xaml)$/i.test(item)) {
            filesToLint.push(p);
          }
        }
      }
      walk(fullPath);
    } else {
      filesToLint.push(fullPath);
    }

    console.log(`z-craft: Linting ${filesToLint.length} UI file(s) for Anti-Slop compliance...`);
    const results = lintUiFiles(filesToLint, cwd);
    let totalErrors = 0;
    let totalWarnings = 0;

    for (const r of results) {
      if (r.violations.length > 0) {
        console.log(`\n📄 ${r.file} (Score: ${r.score}/100)`);
        for (const v of r.violations) {
          const icon = v.severity === 'error' ? '❌' : '⚠️';
          console.log(`  ${icon} Line ${v.line} [${v.ruleId} ${v.name}]: ${v.message}`);
          console.log(`     Fix: ${v.fixHint}`);
        }
      }
      totalErrors += r.errorCount;
      totalWarnings += r.warningCount;
    }

    console.log(`\nSummary: ${totalErrors} error(s), ${totalWarnings} warning(s) across ${filesToLint.length} file(s).`);
    process.exit(totalErrors > 0 ? 1 : 0);
  }

  case 'preview': {
    const title = args[0] || 'Feature Preview';
    const outPath = args[1] || path.join(cwd, '.zero-craft', 'preview.html');
    const widget = generateCanvasWidget({ title });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, widget.html, 'utf8');
    console.log(`✨ Generated interactive preview: ${outPath}`);
    break;
  }

  case 'checkpoint': {
    const sub = args[0] || 'list';
    if (sub === 'create') {
      const name = args[1] || 'vibe';
      const res = createCheckpoint(cwd, name, []);
      console.log(`Created checkpoint: ${res.snapshotId} (${res.name})`);
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
        console.log(`• [${c.id}] ${c.name} (${c.createdAt}) - ${c.fileCount} file(s)`);
      }
    }
    break;
  }

  case 'status': {
    const list = listCheckpoints(cwd);
    console.log(`z-craft: Active`);
    console.log(`• Total checkpoints: ${list.length}`);
    console.log(`• Anti-slop rules active: AS-1 to AS-7`);
    break;
  }

  default:
    printHelp();
    break;
}
