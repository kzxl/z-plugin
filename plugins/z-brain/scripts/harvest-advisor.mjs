#!/usr/bin/env node
/**
 * PostToolUse Harvest Advisor Hook for Z-Brain
 * Monitors test execution (dotnet test, npm test, pytest, cargo test, go test).
 * When test suites pass with exit code 0, reminds the agent to harvest verified knowledge (R_TDD / R_PROOF).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
  });
}

const TEST_COMMAND_REGEX = /\b(dotnet\s+test|npm\s+(test|run\s+test)|pytest|cargo\s+test|go\s+test|mvn\s+test)\b/i;

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
  const command = input.command || input.CommandLine || '';
  if (!TEST_COMMAND_REGEX.test(command)) return;

  // Check result / exit code
  const result = ev.tool_result || {};
  const exitCode = typeof result.exit_code === 'number' ? result.exit_code : (result.exitCode ?? 0);
  const output = typeof result === 'string' ? result : (result.output || result.stdout || '');

  // Verify success (exit code 0 and no reported test failures)
  const hasFailures = exitCode !== 0 ||
    /\b(build failed|test run failed)\b/i.test(output) ||
    /\b(?:failed|failures?)\s*[:=]\s*[1-9]\d*/i.test(output);
  if (hasFailures) return;

  // Rate-limiting / deduplication: advise at most once per session per 10 minutes
  const session = String(ev.session_id || 'default').replace(/[^\w.-]/g, '_');
  const dir = path.join(os.tmpdir(), 'z-brain');
  const cacheFile = path.join(dir, `harvest-advised-${session}.json`);

  let state = { lastAdvised: 0 };
  try {
    state = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  } catch {}

  const now = Date.now();
  if (now - state.lastAdvised < 10 * 60 * 1000) {
    return; // Don't spam if already advised recently
  }

  state.lastAdvised = now;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(state));
  } catch {}

  const reminder = {
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        '[z-brain] Test suite passed with exit code 0! If you just resolved a bug or completed a refactoring, remember to satisfy R_TDD and R_PROOF by harvesting your lesson via zbrain_harvest(lesson: "<problem> | <cause> | <fix>", project: "<project>", tags: ["<domain>", "<tech>"]).'
    }
  };

  process.stdout.write(JSON.stringify(reminder));
}

main().catch(() => process.exit(0));
