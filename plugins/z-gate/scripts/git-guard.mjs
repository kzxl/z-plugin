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

const SAFE_ENV_TEMPLATES = /^\.env\.(example|sample|template|dist)$/i;

export function detectSecretLeakCommand(cmd) {
  if (!cmd || typeof cmd !== 'string') return null;

  // 1. Direct file-content reads on real .env files (allow .env.example/.sample/.template/.dist)
  const readEnvRe = /\b(?:cat|type|head|tail|more|less|Get-Content|gc)\b[^\n|;&]*?(?:^|[\s"'/\\~])(\.env(?:\.[a-z0-9_-]+)?)(?=$|[\s"'|;&])/gi;
  for (const m of cmd.matchAll(readEnvRe)) {
    if (!SAFE_ENV_TEMPLATES.test(m[1])) {
      return `🔐 [z-gate] Blocked direct read of secret file '${m[1]}' (R_SEC). Never print .env contents into agent context. Use a silent exit-code check instead: Select-String -Path ${m[1]} -Pattern "^KEY=" -Quiet (PowerShell) or grep -sq "^KEY=" ${m[1]} (Bash).`;
    }
  }

  // 2. Non-quiet grep / Select-String printing matching secret lines from .env
  for (const seg of cmd.split(/[|;&\r\n]+/)) {
    const searchCmd = seg.match(/\b(grep|Select-String)\b/i);
    if (!searchCmd) continue;
    const envMatches = [...seg.matchAll(/(?:^|[\s"'/\\~])(\.env(?:\.[a-z0-9_-]+)?)(?=$|[\s"'|;&])/gi)];
    const realEnv = envMatches.find(m => !SAFE_ENV_TEMPLATES.test(m[1]));
    if (!realEnv) continue;
    const isQuiet = /^grep$/i.test(searchCmd[1])
      ? /(?:^|\s)-[a-zA-Z]*q\b/.test(seg)
      : /(?:^|\s)-Quiet\b/i.test(seg);
    if (!isQuiet) {
      return `🔐 [z-gate] Blocked non-quiet search on '${realEnv[1]}' (R_SEC). Pass -q/-sq (grep) or -Quiet (Select-String) so secret values never print to stdout.`;
    }
  }

  // 3. Full environment variable dumps
  if (/(?:^|[;&|]\s*)(?:printenv|env|set)\s*(?=$|[;&|])/i.test(cmd) || /\b(?:Get-ChildItem|gci|ls|dir)\s+env:/i.test(cmd)) {
    return `🔐 [z-gate] Blocked full environment dump (R_SEC). Avoid printenv/env/Get-ChildItem Env: which leak secrets into context.`;
  }

  // 4. Echoing sensitive environment variables
  if (/\b(?:echo|printf|Write-Output|Write-Host)\b[^\n]*(?:\$\{?(?:env:)?[A-Za-z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE)[A-Za-z0-9_]*\}?)/i.test(cmd)) {
    return `🔐 [z-gate] Blocked printing sensitive environment variable (R_SEC). Verify key presence via silent exit-code check instead.`;
  }

  return null;
}

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

  // 0. Zero-Leak Safe Credentials Guard (R_SEC)
  const leakReason = detectSecretLeakCommand(cmd);
  if (leakReason) {
    emit(isAntigravity, 'deny', leakReason);
    return;
  }

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
