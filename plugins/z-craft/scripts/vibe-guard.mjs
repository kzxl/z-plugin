#!/usr/bin/env node
/**
 * PostToolUse Vibe Guard Hook for Z-Craft
 * Intercepts UI file modifications to audit for AI-slop violations and prompt self-correction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { lintUiContent } from './lib/anti-slop-linter.mjs';

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
  const input = ev.tool_input || {};

  // Extract file path & content if available
  let filePath = input.path || input.Path || input.file_path || '';
  let content = input.content || input.Content || input.replacement || input.Replacement || '';

  // Check if target is a UI file
  const isUiFile = /\.(tsx|jsx|html|vue|svelte|xaml)$/i.test(filePath);
  if (!isUiFile) return;

  // If content is not in input, try reading from disk
  if (!content && filePath && fs.existsSync(filePath)) {
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return;
    }
  }

  if (!content) return;

  const report = lintUiContent(content, path.basename(filePath));
  if (report.violations.length > 0 && report.errorCount > 0) {
    const errorDetails = report.violations
      .filter(v => v.severity === 'error')
      .slice(0, 3)
      .map(v => `• [${v.ruleId}] Line ${v.line}: ${v.message} (${v.fixHint})`)
      .join('\n');

    const reminder = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: `✨ [z-craft] Anti-Slop Alert on ${path.basename(filePath)}:\n${errorDetails}\nRun 'zcraft_lint_ui' to audit full software craftsmanship.`
      }
    };
    process.stdout.write(JSON.stringify(reminder));
  }
}

main().catch(() => {});
