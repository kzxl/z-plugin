#!/usr/bin/env node
/**
 * PreToolUse Git Guard Hook for Z-Gate
 * Intercepts 'git commit' tool calls to audit staged diff and commit message (R_GIT, R_NEV, R_REUSE).
 */

import cp from 'node:child_process';
import { auditDiff } from './lib/nev-auditor.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
  });
}

async function main() {
  const raw = await readStdin();
  let ev;
  try {
    ev = JSON.parse(raw || '{}');
  } catch {
    return;
  }

  const tool = ev.tool_name || '';
  if (!['Bash', 'run_command'].includes(tool)) return;

  const input = ev.tool_input || {};
  const cmd = input.command || input.CommandLine || '';

  // Intercept git commit
  if (!/\bgit\s+commit\b/i.test(cmd)) return;

  // Extract commit message from command line if present (-m "...")
  const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
  const commitMsg = msgMatch ? msgMatch[1] : '';

  const cwd = ev.cwd || process.cwd();
  let diff = '';
  try {
    diff = cp.execSync('git diff --cached', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {}

  if (!diff || diff.trim().length === 0) return;

  const audit = auditDiff({ diff, commitMessage: commitMsg, cwd });

  if (!audit.passed) {
    const warningText = [
      `🛡️ [z-gate] Pre-Commit Gate flagged ${audit.warnings.length} violation(s) (NEV Score: ${audit.nevScore}/100):`,
      ...audit.warnings.map(w => `  • ${w}`),
      `💡 Resolve these invariants before proceeding with the commit (R_NEV, R_REUSE, R_GIT).`
    ].join('\n');

    const reminder = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: warningText
      }
    };
    process.stdout.write(JSON.stringify(reminder));
  }
}

main().catch(() => process.exit(0));
