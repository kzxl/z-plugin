#!/usr/bin/env node
/**
 * SessionStart Auto-Recall Hook for Z-Brain
 * Automatically injects an ultra-lean L0 continuity summary (<60 tokens)
 * when a session begins, referencing recent decisions and key gotchas for the current project.
 */

import { getDb, getRecentObservations, getRecentAtoms, getRecentFileEvents } from './lib/db.mjs';
import { detectCurrentProject } from './lib/search.mjs';
import { reconcile } from './lib/edit-observer.mjs';
import { isNonProjectSystemDir, resolveWorkspace } from './lib/workspace.mjs';

function readStdin() {
  return new Promise((resolve) => {
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (raw += c));
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
  });
}

function finish(isAntigravity, contextMessage = null) {
  if (isAntigravity) {
    const out = contextMessage
      ? { injectSteps: [{ systemMessage: { systemMessage: contextMessage } }] }
      : {};
    process.stdout.write(JSON.stringify(out));
    process.exit(0);
  }
  if (contextMessage) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'SessionStart',
          additionalContext: contextMessage
        }
      })
    );
  }
  process.exit(0);
}

async function main() {
  let ev = {};
  try {
    const raw = await readStdin();
    if (raw && raw.trim()) {
      ev = JSON.parse(raw);
    }
  } catch {}

  const isAntigravity = Boolean(ev.hookEventName || ev.workspacePaths || ev.conversationId);
  const cwd = ev.cwd || ev.workspacePaths?.[0] || process.cwd();
  if (isNonProjectSystemDir(cwd)) {
    finish(isAntigravity, null);
  }

  const project = detectCurrentProject(cwd);

  if (!project || project === 'global') {
    // Zero context overhead if not in a recognized project directory
    finish(isAntigravity, null);
  }

  const db = getDb();
  const workspace = resolveWorkspace(cwd);
  try {
    reconcile(db, { cwd: workspace, budgetMs: 900, maxFiles: 800, sessionId: 'session-start' });
  } catch {}

  const recentObs = getRecentObservations(db, { project, limit: 2 });
  const recentAtoms = getRecentAtoms(db, { project, limit: 2 });
  const recentChanges = getRecentFileEvents(db, { workspace, limit: 3 });

  if (recentObs.length === 0 && recentAtoms.length === 0 && recentChanges.length === 0) {
    finish(isAntigravity, null);
  }

  const parts = [];

  if (recentObs.length > 0) {
    const latest = recentObs[0];
    parts.push(`Recent decision/milestone: [${latest.type}] ${latest.title}`);
  }

  if (recentAtoms.length > 0) {
    const gotchas = recentAtoms
      .map(a => `[#${a.id}] ${a.gotcha_fix || a.question}`)
      .join('; ');
    parts.push(`Key gotchas: ${gotchas}`);
  }

  if (recentChanges.length > 0) {
    parts.push(`Recent edits: ${recentChanges.map(e => `${e.path} (${e.op})`).join(', ')}`);
  }

  const contextMessage = `[z-brain continuity: project "${project}"] ${parts.join(' | ')}.`;
  finish(isAntigravity, contextMessage);
}

main().catch(() => process.exit(0));
