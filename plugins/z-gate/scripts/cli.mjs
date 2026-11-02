#!/usr/bin/env node
/**
 * Z-Gate CLI Command Runner
 * Usage:
 *   node cli.mjs find "format date"
 *   node cli.mjs audit [--staged]
 *   node cli.mjs status
 */

import cp from 'node:child_process';
import { findHelpers } from './lib/helper-discovery.mjs';
import { auditDiff } from './lib/nev-auditor.mjs';

const [,, cmd, ...args] = process.argv;

function printHelp() {
  console.log(`
Usage: z-gate <command> [arguments]

Commands:
  find <query>           Scan repository helpers and utils for existing logic (R_REUSE)
  audit [--staged]       Audit git diff against Net Engineering Value and invariants (R_NEV)
  status                 Show Z-Gate operational status and rules
  help                   Show this help
`);
}

switch (cmd) {
  case 'find': {
    const query = args.join(' ');
    if (!query) {
      console.error('Error: Search query required. Example: z-gate find "format date"');
      process.exit(1);
    }
    const results = findHelpers({ query, cwd: process.cwd() });
    if (results.length === 0) {
      console.log(`No existing helpers found matching "${query}".`);
    } else {
      console.log(`\n🔍 Found ${results.length} reusable helper method(s) (R_REUSE):\n`);
      results.forEach((r, idx) => {
        console.log(`${idx + 1}. [${r.file}:${r.line}]`);
        console.log(`   Signature: ${r.signature}`);
        if (r.summary) console.log(`   Summary:   ${r.summary}`);
        console.log('');
      });
    }
    break;
  }

  case 'audit': {
    const isStaged = !args.includes('--unstaged');
    let diff = '';
    try {
      diff = cp.execSync(isStaged ? 'git diff --cached' : 'git diff', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    } catch {}

    if (!diff || diff.trim().length === 0) {
      console.log('No diff to audit (clean tree).');
      process.exit(0);
    }

    const audit = auditDiff({ diff, cwd: process.cwd() });
    console.log(`\n🛡️  Z-Gate Diff Audit Report:`);
    console.log(`  • NEV Score: ${audit.nevScore}/100 [${audit.passed ? 'PASS' : 'FAIL'}]`);
    console.log(`  • Net Change: ${audit.metrics.netChange >= 0 ? '+' : ''}${audit.metrics.netChange} LOC (+${audit.metrics.addedLines} / -${audit.metrics.deletedLines})`);

    if (audit.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${audit.warnings.length}):`);
      audit.warnings.forEach(w => console.log(`  - ${w}`));
      process.exit(1);
    } else {
      console.log(`  • Status: All Net Engineering Value invariants preserved.`);
      process.exit(0);
    }
    break;
  }

  case 'status': {
    console.log(`\n🛡️  Z-Gate: Net Engineering Value & Asset Discovery Gate (v1.0.0)`);
    console.log(`  • Invariants: R_NEV (Wrapper Hell, LOC Bloat), R_REUSE (Discovery-First), R_GIT (Conventional Commits)`);
    console.log(`  • Target: Keep codebase concise, prevent single-impl interfaces, and eliminate redundant hand-rolled logic.\n`);
    break;
  }

  case 'help':
  case '--help':
  case '-h':
  default:
    printHelp();
    break;
}
