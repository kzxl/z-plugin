import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

import {
  SCHEMA_VERSION,
  getDbPath,
  legacyDbCandidates,
  closeDb,
  setMeta,
  hashPath,
} from './db.mjs';

const ATOM_COLUMNS = [
  'project_id', 'scope', 'trust_level', 'question', 'answer', 'gotcha_fix',
  'tags', 'evidence', 'category', 'confidence', 'pinned', 'files_touched',
  'valid_from', 'valid_to', 'superseded_by', 'created_at', 'updated_at',
];
const INDEX_COLUMNS = [
  'project_id', 'workspace', 'path', 'mtime', 'size', 'hash', 'lang',
  'symbol_count', 'status', 'last_event_id', 'updated_at',
];
const EVENT_COLUMNS = [
  'project_id', 'workspace', 'session_id', 'path', 'op', 'tool', 'source',
  'lines_added', 'lines_removed', 'old_hash', 'new_hash', 'patch', 'redacted',
  'created_at', 'updated_at', 'harvested_commit',
];

function sqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

// The open handle is the source of truth: getDbPath() only knows the default/env
// location, while callers (and tests) may open an explicit path.
function activeDbPath(db) {
  try {
    const row = db.prepare('PRAGMA database_list').all().find((entry) => entry.name === 'main');
    if (row && row.file) return path.resolve(row.file);
  } catch {}
  return getDbPath();
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function countAtomsInFile(file) {
  let db = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return db.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c;
  } catch {
    return null;
  } finally {
    try { db?.close(); } catch {}
  }
}

function tableColumns(db, schema, table) {
  try {
    return new Set(db.prepare(`PRAGMA ${schema}.table_info(${table})`).all().map((c) => c.name));
  } catch {
    return new Set();
  }
}

function spoolPending(db) {
  const file = path.join(path.dirname(activeDbPath(db)), 'spool', 'edits.jsonl');
  try {
    return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

export function dbInfo(db) {
  const dbPath = activeDbPath(db);
  const size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
  const version = Number(db.prepare('PRAGMA user_version').get()?.user_version || 0);
  const atoms = db.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c;
  const events = db.prepare('SELECT count(*) AS c FROM file_events').get().c;
  const files = db.prepare('SELECT count(*) AS c FROM file_index').get().c;
  const projects = db.prepare(
    'SELECT project_id, count(*) AS atoms FROM knowledge_atoms GROUP BY project_id ORDER BY atoms DESC LIMIT 8'
  ).all();
  const adopted = (() => {
    try { return JSON.parse(db.prepare("SELECT value FROM observer_meta WHERE key = 'legacy_adopted_from'").get()?.value || 'null'); } catch { return null; }
  })();
  const legacy = legacyDbCandidates()
    .filter((file) => path.resolve(file) !== path.resolve(dbPath))
    .map((file) => ({
      path: file,
      atoms: countAtomsInFile(file),
      merged: path.resolve(file) === path.resolve(adopted?.from || '')
        || Boolean(db.prepare('SELECT 1 FROM observer_meta WHERE key = ?').get(`legacy_merged:${hashPath(file)}`)),
    }));
  return {
    path: dbPath,
    size,
    version,
    schema: SCHEMA_VERSION,
    atoms,
    events,
    files,
    projects,
    legacy,
    spoolPending: spoolPending(db),
  };
}

export function formatDbInfo(info) {
  const lines = [
    '🧠 Z-Brain Database',
    `  • Path: ${info.path}`,
    `  • Size: ${(info.size / (1024 * 1024)).toFixed(2)} MB`,
    `  • Schema: v${info.version} (plugin expects v${info.schema})`,
    `  • Atoms: ${info.atoms} · Files tracked: ${info.files} · Edit events: ${info.events}`,
    `  • Spool pending: ${info.spoolPending}`,
  ];
  if (info.projects.length > 0) {
    lines.push(`  • Projects: ${info.projects.map((p) => `${p.project_id}(${p.atoms})`).join(', ')}`);
  }
  if (info.legacy.length === 0) {
    lines.push('  • Legacy databases: none');
  } else {
    lines.push('  • Legacy databases found:');
    for (const entry of info.legacy) {
      const state = entry.merged ? 'already imported' : (entry.atoms === null ? 'unreadable' : `${entry.atoms} atoms`);
      lines.push(`      - ${entry.path} (${state})`);
    }
    if (info.legacy.some((entry) => !entry.merged && entry.atoms > 0)) {
      lines.push('    Import with: z-brain db import <path>');
    }
  }
  return lines.join('\n');
}

export function backupDb(db, destPath = null) {
  const dest = path.resolve(destPath || path.join(path.dirname(activeDbPath(db)), 'backups', `zbrain-${stamp()}.sqlite`));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest)) throw new Error(`backup target already exists: ${dest}`);
  const tmp = `${dest}.tmp`;
  try {
    db.exec(`VACUUM INTO '${sqlLiteral(tmp)}'`);
    fs.renameSync(tmp, dest);
  } catch (err) {
    try { fs.rmSync(tmp, { force: true }); } catch {}
    throw err;
  }
  return { path: dest, bytes: fs.statSync(dest).size };
}

export function restoreDb(db, srcPath) {
  const src = path.resolve(String(srcPath || ''));
  if (!fs.existsSync(src)) throw new Error(`restore source not found: ${src}`);
  const atoms = countAtomsInFile(src);
  if (atoms === null) throw new Error(`restore source is not a z-brain database: ${src}`);

  const backup = backupDb(db);
  const target = activeDbPath(db);
  try { db.close(); } catch {}
  try { closeDb(); } catch {}
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.rmSync(target + suffix, { force: true }); } catch {}
  }
  fs.copyFileSync(src, target);
  return { restored: target, atoms, backup: backup.path };
}

export function importDbFromPath(db, srcPath) {
  const src = path.resolve(String(srcPath || ''));
  if (!fs.existsSync(src)) throw new Error(`import source not found: ${src}`);
  const target = activeDbPath(db);
  if (src === path.resolve(target)) throw new Error('import source is the active database');

  const result = { atoms: 0, files: 0, events: 0, observations: 0 };
  db.exec(`ATTACH DATABASE '${sqlLiteral(src)}' AS legacy`);
  try {
    const atomCols = tableColumns(db, 'legacy', 'knowledge_atoms');
    if (atomCols.has('question') && atomCols.has('answer')) {
      const cols = ATOM_COLUMNS.filter((c) => atomCols.has(c));
      result.atoms = db.prepare(`
        INSERT INTO knowledge_atoms (${cols.join(',')})
        SELECT ${cols.map((c) => `l.${c}`).join(',')}
        FROM legacy.knowledge_atoms l
        WHERE NOT EXISTS (
          SELECT 1 FROM knowledge_atoms m
          WHERE m.project_id = COALESCE(l.project_id, 'global')
            AND lower(m.question) = lower(l.question)
        )
      `).run().changes;
    }

    const indexCols = tableColumns(db, 'legacy', 'file_index');
    if (indexCols.has('workspace') && indexCols.has('path')) {
      const cols = INDEX_COLUMNS.filter((c) => indexCols.has(c));
      result.files = db.prepare(`
        INSERT INTO file_index (${cols.join(',')})
        SELECT ${cols.map((c) => `l.${c}`).join(',')}
        FROM legacy.file_index l
        WHERE NOT EXISTS (
          SELECT 1 FROM file_index m WHERE m.workspace = l.workspace AND m.path = l.path
        )
      `).run().changes;
    }

    const eventCols = tableColumns(db, 'legacy', 'file_events');
    if (eventCols.has('workspace') && eventCols.has('path') && eventCols.has('created_at')) {
      const cols = EVENT_COLUMNS.filter((c) => eventCols.has(c));
      result.events = db.prepare(`
        INSERT INTO file_events (${cols.join(',')})
        SELECT ${cols.map((c) => `l.${c}`).join(',')}
        FROM legacy.file_events l
        WHERE NOT EXISTS (
          SELECT 1 FROM file_events m
          WHERE m.workspace = l.workspace
            AND m.path = l.path
            AND m.session_id = COALESCE(l.session_id, 'default')
            AND m.created_at = l.created_at
            AND COALESCE(m.new_hash, '') = COALESCE(l.new_hash, '')
        )
      `).run().changes;
    }

    const obsCols = tableColumns(db, 'legacy', 'session_observations');
    if (obsCols.has('title')) {
      const cols = ['project_id', 'session_id', 'type', 'title', 'summary', 'files_touched', 'created_at']
        .filter((c) => obsCols.has(c));
      result.observations = db.prepare(`
        INSERT INTO session_observations (${cols.join(',')})
        SELECT ${cols.map((c) => `l.${c}`).join(',')}
        FROM legacy.session_observations l
        WHERE NOT EXISTS (
          SELECT 1 FROM session_observations m
          WHERE m.title = l.title AND m.created_at = l.created_at
        )
      `).run().changes;
    }
  } finally {
    try { db.exec('DETACH DATABASE legacy'); } catch {}
  }

  setMeta(db, `legacy_merged:${hashPath(src)}`, new Date().toISOString());
  return result;
}
