import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

import {
  initSchema,
  insertAtom,
  getAtomById,
  insertObservation,
  getRecentObservations,
  getRecentAtoms,
  getKnowledgeByFile
} from '../scripts/lib/db.mjs';

import {
  formatTerminalTable,
  formatTimeline,
  formatFileKnowledge
} from '../scripts/lib/format.mjs';

test('Z-Brain Schema and File/Observation features', async (t) => {
  // Use temporary SQLite file
  const tmpDbPath = path.join(os.tmpdir(), `zbrain-test-${Date.now()}.sqlite`);
  const db = new DatabaseSync(tmpDbPath);

  t.after(() => {
    try {
      db.close();
      fs.unlinkSync(tmpDbPath);
    } catch {}
  });

  await t.test('initSchema creates knowledge_atoms and session_observations', () => {
    initSchema(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    assert.ok(tables.includes('knowledge_atoms'), 'knowledge_atoms must exist');
    assert.ok(tables.includes('session_observations'), 'session_observations must exist');

    // Check files_touched column exists in knowledge_atoms
    const cols = db.prepare('PRAGMA table_info(knowledge_atoms)').all().map(r => r.name);
    assert.ok(cols.includes('files_touched'), 'files_touched column must exist in knowledge_atoms');
  });

  await t.test('insertObservation and getRecentObservations', () => {
    const obsId = insertObservation(db, {
      session_id: 'test-session-1',
      project_id: 'agentic-core',
      type: 'decision',
      title: 'Decided to adopt Terminal Dashboard instead of Web UI',
      summary: 'Avoided wrapper hell and persistent daemon overhead by using in-terminal table view.',
      files_touched: ['scripts/cli.mjs', 'scripts/lib/format.mjs']
    });

    assert.ok(obsId > 0, 'Observation ID should be a positive number');

    const recent = getRecentObservations(db, { project: 'agentic-core', limit: 5 });
    assert.equal(recent.length, 1);
    assert.equal(recent[0].title, 'Decided to adopt Terminal Dashboard instead of Web UI');
    assert.deepEqual(recent[0].files_touched, ['scripts/cli.mjs', 'scripts/lib/format.mjs']);
  });

  await t.test('insertAtom with files_touched and getKnowledgeByFile', () => {
    const atomId = insertAtom(db, {
      project_id: 'agentic-core',
      scope: 'project',
      trust_level: 'verified_fact',
      question: 'How to avoid port collision in z-brain?',
      answer: 'Use CLI commands and SQLite WAL directly rather than running an HTTP server on port 37777.',
      gotcha_fix: 'HTTP server introduces port conflict and idle RAM consumption.',
      tags: ['csharp', 'architecture'],
      files_touched: ['src/Server.cs', 'scripts/cli.mjs']
    });

    assert.ok(atomId > 0);

    // Search by file: 'scripts/cli.mjs'
    const res = getKnowledgeByFile(db, 'cli.mjs');
    assert.ok(res.atoms.length >= 1, 'Should find at least 1 atom matching cli.mjs');
    assert.ok(res.observations.length >= 1, 'Should find at least 1 observation matching cli.mjs');
  });

  await t.test('Formatting functions: formatTerminalTable, formatTimeline, formatFileKnowledge', () => {
    const recent = getRecentAtoms(db, { limit: 5 });
    const tableStr = formatTerminalTable(recent);
    assert.ok(tableStr.includes('ID'), 'Table should contain ID header');
    assert.ok(tableStr.includes('How to avoid port collision in z-brain?'), 'Table should contain question');

    const observations = getRecentObservations(db, { limit: 5 });
    const timelineStr = formatTimeline(observations);
    assert.ok(timelineStr.includes('[decision]'), 'Timeline should show type tag');
    assert.ok(timelineStr.includes('Decided to adopt Terminal Dashboard'), 'Timeline should show title');

    const fileRes = getKnowledgeByFile(db, 'cli.mjs');
    const fileViewStr = formatFileKnowledge('cli.mjs', fileRes.atoms, fileRes.observations);
    assert.ok(fileViewStr.includes('cli.mjs'), 'File view should mention file name');
  });
});
