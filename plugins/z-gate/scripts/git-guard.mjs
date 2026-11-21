#!/usr/bin/env node
/**
 * PreToolUse Git Guard Hook for Z-Gate
 * Intercepts 'git commit' tool calls to audit staged diff against:
 *  - P0 Blocker Invariants (SQL injection, Hardcoded Secrets, Sync-over-async deadlocks)
 *  - Net Engineering Value (Wrapper hell, LOC bloat, R_NEV)
 *  - Conventional Commits & Empirical Proof (R_GIT, R_PROOF)
 */

import cp from 'node:child_process';
import { auditDiff } from './lib/nev-auditor.mjs';
import { reviewCode } from './lib/code-reviewer.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
  });
}

function emit(isAntigravity, decision, text = '') {
  if (isAntigravity) {
    const out = text ? { decision, reason: text } : { decision };
    process.stdout.write(JSON.stringify(out));
    return;
  }
  if (text) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext: text
        }
      })
    );
  }
}

async function main() {
  const raw = await readStdin();
  let ev;
  try {
    ev = JSON.parse(raw || '{}');
  } catch {
    return;
  }

  const isAntigravity = Boolean(ev.toolCall || ev.hookEventName || ev.workspacePaths);
  const tool = ev.toolCall?.name || ev.tool_name || ev.toolName || '';
  if (!['Bash', 'run_command'].includes(tool)) {
    if (isAntigravity) emit(true, 'allow');
    return;
  }

  const input = ev.toolCall?.args || ev.tool_input || {};
  const cmd = input.command || input.CommandLine || '';

  // 1. Intercept lazy git add -A / git add . (R_GIT)
  if (/\bgit\s+add\s+(-A|--all|\.)(?:\s+|$)/i.test(cmd)) {
    emit(
      isAntigravity,
      'deny',
      "🛡️ [z-gate] Lazy staging detected ('git add -A' / 'git add .'). Invariant R_GIT mandates Targeted Staging: Stage only files strictly in scope (e.g. 'git add <file1> <file2>'). Never bundle unverified files, local rules, or config into staging."
    );
    return;
  }

  // 2. Intercept git commit
  if (!/\bgit\s+commit\b/i.test(cmd)) {
    if (isAntigravity) emit(true, 'allow');
    return;
  }

  // Extract commit message from command line if present (-m "...")
  const msgMatch = cmd.match(/-m\s+["']([^"']+)["']/);
  const commitMsg = msgMatch ? msgMatch[1] : '';

  const cwd = ev.cwd || ev.workspacePaths?.[0] || process.cwd();
  let diff = '';
  try {
    diff = cp.execSync('git diff --cached', { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
  } catch {}

  if (!diff || diff.trim().length === 0) {
    if (isAntigravity) emit(true, 'allow');
    return;
  }

  // Run deep review
  const review = await reviewCode({ diff, commitMessage: commitMsg, cwd });
  const p0Blockers = review.findings.filter(f => f.severity === 'P0');

  if (p0Blockers.length > 0) {
    const blockText = [
      `🛑 [z-gate CRITICAL BLOCKER] Pre-Commit Review detected ${p0Blockers.length} P0 violation(s):`,
      ...p0Blockers.map(b => `  • [${b.rule}] ${b.file}:${b.line}: ${b.message} (Action: ${b.suggestion})`),
      `❌ Action Required: Fix all P0 security leaks / deadlocks before committing (R_NEV, R_DB, R_WPF).`
    ].join('\n');

    emit(isAntigravity, 'deny', blockText);
    return;
  }

  // Check general NEV audit warnings
  const audit = auditDiff({ diff, commitMessage: commitMsg, cwd });
  if (!audit.passed) {
    const warningText = [
      `🛡️ [z-gate] Pre-Commit Gate flagged ${audit.warnings.length} NEV violation(s) (Score: ${audit.nevScore}/100):`,
      ...audit.warnings.map(w => `  • ${w}`),
      `💡 Resolve these invariants before proceeding with the commit (R_NEV, R_REUSE, R_GIT).`
    ].join('\n');

    emit(isAntigravity, 'ask', warningText);
    return;
  }

  if (isAntigravity) emit(true, 'allow');
}

main().catch(() => process.exit(0));
