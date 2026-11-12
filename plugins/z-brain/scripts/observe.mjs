#!/usr/bin/env node
/**
 * z-brain observer entrypoint.
 *
 * Hook mode (default): reads a host hook payload from stdin and records the edit.
 * CLI mode: flush | reconcile | watch | status | history | changes | impact | preflight.
 *
 * Hooks must never block or break the host, so every failure exits 0.
 */

import fs from 'node:fs';

import {
  getDb,
  getFileIndexEntry,
  getKnowledgeByFile,
  getFileHistory,
  getRecentFileEvents,
  getFileObserverStats,
} from './lib/db.mjs';
import {
  ensureObserver,
  flushSpool,
  getObserverStatus,
  maybeReconcile,
  reconcile,
  recordHookInput,
  startWatcher,
} from './lib/edit-observer.mjs';
import { resolveWorkspace } from './lib/workspace.mjs';
import { formatFileHistory, formatRecentChanges, formatImpact } from './lib/format.mjs';
import { buildPreflight } from './lib/preflight.mjs';

function readStdin() {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve('');
    let raw = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('end', () => resolve(raw));
    process.stdin.on('error', () => resolve(raw));
    process.stdin.on('data', (chunk) => (raw += chunk));
    setTimeout(() => resolve(raw), 1500).unref?.();
  });
}

function out(text) {
  try {
    fs.writeSync(1, text);
  } catch {}
}

function flag(args, name, fallback = null) {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] && !args[0].startsWith('--') ? args[0] : 'record';
  const db = getDb();
  const cwd = flag(args, 'root') || process.env.Z_PLUGIN_WORKSPACE || process.cwd();

  switch (command) {
    case 'record': {
      const raw = await readStdin();
      let payload = {};
      try {
        payload = JSON.parse(raw || '{}');
      } catch {}
      recordHookInput(db, payload);
      return;
    }

    case 'flush': {
      const res = flushSpool(db);
      if (!args.includes('--quiet')) {
        out(JSON.stringify(res) + '\n');
      }
      return;
    }

    case 'reconcile': {
      const res = reconcile(db, {
        cwd,
        budgetMs: Number(flag(args, 'budget', 2000)),
        maxFiles: Number(flag(args, 'max-files', 20000)),
        sessionId: flag(args, 'session', 'reconcile'),
      });
      if (!args.includes('--quiet')) {
        out(JSON.stringify(res, null, 2) + '\n');
      }
      return;
    }

    case 'watch': {
      const state = startWatcher(db, { cwd });
      if (!state) {
        out('[z-brain] watcher disabled by ZBRAIN_WATCH/ZBRAIN_OBSERVER=0\n');
        return;
      }
      out(`[z-brain] watching ${state.root} (${state.mode})\n`);
      const stop = () => {
        state.stop();
        process.exit(0);
      };
      process.on('SIGINT', stop);
      process.on('SIGTERM', stop);
      await new Promise(() => {});
    }

    case 'status': {
      const root = resolveWorkspace(cwd);
      const payload = {
        ...getObserverStatus(db, { cwd: root }),
        stats: getFileObserverStats(db, { workspace: root }),
      };
      out(JSON.stringify(payload, null, 2) + '\n');
      return;
    }

    case 'history': {
      const file = args[1];
      if (!file) throw new Error('Usage: observe.mjs history <file> [--limit=20]');
      const root = resolveWorkspace(cwd);
      const events = getFileHistory(db, { workspace: root, file, limit: Number(flag(args, 'limit', 12)) });
      out(formatFileHistory(file, events) + '\n');
      return;
    }

    case 'changes': {
      const root = resolveWorkspace(cwd);
      const events = getRecentFileEvents(db, { workspace: root, limit: Number(flag(args, 'limit', 10)) });
      out(formatRecentChanges(events, root) + '\n');
      return;
    }

    case 'impact': {
      const file = args[1];
      if (!file) throw new Error('Usage: observe.mjs impact <file>');
      const root = resolveWorkspace(cwd);
      const rel = file.replace(/\\/g, '/').replace(new RegExp(`^${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/`), '');
      const entry = getFileIndexEntry(db, root, rel);
      const events = getFileHistory(db, { workspace: root, file, limit: 10 });
      const knowledge = getKnowledgeByFile(db, file, { limit: 5 });
      out(formatImpact(file, entry, events, knowledge.atoms, knowledge.observations) + '\n');
      return;
    }

    case 'preflight': {
      const file = args[1];
      if (!file) throw new Error('Usage: observe.mjs preflight <file> [--budget=300] [--symbol=Name]');
      flushSpool(db);
      const brief = await buildPreflight({
        db,
        workspace: resolveWorkspace(cwd),
        file,
        symbol: flag(args, 'symbol'),
        budget: Number(flag(args, 'budget', 300)),
      });
      out(brief.text + '\n');
      return;
    }

    case 'init': {
      ensureObserver(db, { cwd });
      maybeReconcile(db, { cwd, intervalMs: 0, budgetMs: 3000 });
      const root = resolveWorkspace(cwd);
      out(JSON.stringify({ ...getObserverStatus(db, { cwd: root }), stats: getFileObserverStats(db, { workspace: root }) }, null, 2) + '\n');
      return;
    }

    default:
      throw new Error(`Unknown command: ${command}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    if (process.argv[2] && process.argv[2] !== 'record') {
      process.stderr.write(`[z-brain] ${err.message}\n`);
    }
    process.exit(0);
  });
