#!/usr/bin/env node
/**
 * Z-Gate CLI Command Runner
 * Usage:
 *   node cli.mjs review [--staged | --unstaged | --commit=HEAD | --branch=main] [--format=table|markdown|json]
 *   node cli.mjs find "format date"
 *   node cli.mjs audit [--staged]
 *   node cli.mjs status
 */

import cp from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { findHelpers } from './lib/helper-discovery.mjs';
import { auditDiff } from './lib/nev-auditor.mjs';
import { reviewCode } from './lib/code-reviewer.mjs';
import { formatReviewReport } from './lib/review-formatter.mjs';

const [,, cmd, ...args] = process.argv;

function getArgValue(prefix) {
  const match = args.find(a => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function writeReportFile(outPath, content) {
  const resolved = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, content, 'utf8');
  return resolved;
}

function printHelp() {
  console.log(`
🛡️  Z-Gate: Unified Quality, Security & Code Review Gate

Usage: z-gate <command> [arguments]

Commands:
  review [options]       Deep multi-dimensional code review across Security, Concurrency, NEV, and Gotchas
                         Options:
                           --staged          Review staged git changes (default)
                           --unstaged        Review unstaged working tree changes
                           --commit=<hash>   Review changes from specific commit
                           --branch=<branch> Review diff against base branch (e.g. main)
                           --format=<type>   Output format: table (default), markdown, json
                           --focus=<pillar>  Focus: all (default), security, performance, architecture
                           --output=<path>   Write full report to file and print compact summary
  find <query>           Scan repository helpers and utils for existing logic (R_REUSE)
  audit [options]        Fast pre-commit check on LOC metrics and single-impl interfaces (--staged, --unstaged, --output=<path>)
  status                 Show Z-Gate operational status and rules
  help                   Show this help
`);
}

async function main() {
  switch (cmd) {
    case 'review': {
      let diff = '';
      const isUnstaged = args.includes('--unstaged');
      const commitHash = getArgValue('--commit=');
      const branchName = getArgValue('--branch=');
      const format = getArgValue('--format=') || 'table';
      const focus = getArgValue('--focus=') || 'all';
      const outPath = getArgValue('--output=');

      try {
        if (commitHash) {
          diff = cp.execSync(`git show ${commitHash}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        } else if (branchName) {
          diff = cp.execSync(`git diff ${branchName}...HEAD`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        } else if (isUnstaged) {
          diff = cp.execSync('git diff', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
        } else {
          // Default: staged diff; if staged is empty, fallback to working directory diff
          diff = cp.execSync('git diff --cached', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
          if (!diff || diff.trim().length === 0) {
            diff = cp.execSync('git diff', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
          }
        }
      } catch (err) {
        console.error(`Failed to retrieve git diff: ${err.message}`);
        process.exit(1);
      }

      if (!diff || diff.trim().length === 0) {
        console.log('Clean working tree — no code changes to review.');
        process.exit(0);
      }

      const review = await reviewCode({
        diff,
        cwd: process.cwd(),
        focus
      });

      const report = formatReviewReport(review, format);
      if (outPath) {
        const resolvedOut = writeReportFile(outPath, report);
        console.log(`Z-Gate Review: ${review.status} (Score: ${review.score}/100) | P0:${review.summary.p0Count} P1:${review.summary.p1Count} P2:${review.summary.p2Count} P3:${review.summary.p3Count}`);
        console.log(`Report written to: ${resolvedOut}`);
      } else {
        console.log(report);
      }

      if (review.status === 'FAIL') {
        process.exit(1);
      }
      break;
    }

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
      const outPath = getArgValue('--output=');
      let diff = '';
      try {
        diff = cp.execSync(isStaged ? 'git diff --cached' : 'git diff', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      } catch {}

      if (!diff || diff.trim().length === 0) {
        console.log('No diff to audit (clean tree).');
        process.exit(0);
      }

      const audit = auditDiff({ diff, cwd: process.cwd() });
      if (outPath) {
        const resolvedOut = writeReportFile(outPath, JSON.stringify(audit, null, 2));
        console.log(`Z-Gate Audit: ${audit.passed ? 'PASS' : 'FAIL'} (NEV: ${audit.nevScore}/100, Warnings: ${audit.warnings.length})`);
        console.log(`Report written to: ${resolvedOut}`);
        if (!audit.passed) process.exit(1);
        break;
      }

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
      console.log(`\n🛡️  Z-Gate: Unified Quality, Security & Code Review Gate (v1.1.0)`);
      console.log(`  • Invariants: R_NEV (Wrapper Hell, LOC Bloat), R_REUSE (Discovery-First), R_GIT (Conventional Commits)`);
      console.log(`  • Review Engine: Security (SQLi, Secrets), Concurrency (.Result, deadlocks), UI Anti-Slop, z-brain Gotcha Cross-Referencing`);
      console.log(`  • Target: Prevent technical debt, block security leaks, and preserve Net Engineering Value.\n`);
      break;
    }

    case 'help':
    case '--help':
    case '-h':
    default:
      printHelp();
      break;
  }
}

main().catch(err => {
  console.error(`Error: ${err.message}`);
  process.exit(1);
});
