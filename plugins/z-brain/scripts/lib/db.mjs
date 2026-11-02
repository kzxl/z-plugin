import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, 'zbrain.sqlite');

let _dbInstance = null;

export function getDb(customPath = null) {
  if (_dbInstance) return _dbInstance;

  const dbPath = customPath || process.env.ZBRAIN_DB_PATH || DEFAULT_DB_PATH;
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);

  // Performance & Concurrency Tuning
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA cache_size = -32000;'); // 32MB cache

  // Initialize Tables
  initSchema(db);

  _dbInstance = db;
  return db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_atoms (
      id INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT 'global',
      scope TEXT NOT NULL DEFAULT 'project',
      trust_level TEXT NOT NULL DEFAULT 'observation',
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      gotcha_fix TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      evidence TEXT DEFAULT '[]',
      category TEXT DEFAULT 'general',
      confidence REAL DEFAULT 0.5,
      pinned INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_atoms_project ON knowledge_atoms(project_id);
    CREATE INDEX IF NOT EXISTS idx_atoms_scope ON knowledge_atoms(scope);
    CREATE INDEX IF NOT EXISTS idx_atoms_trust ON knowledge_atoms(trust_level);

    CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
      question,
      answer,
      gotcha_fix,
      tags,
      content='knowledge_atoms',
      content_rowid='id'
    );

    -- Sync triggers between master table and FTS index
    CREATE TRIGGER IF NOT EXISTS trg_atoms_ai AFTER INSERT ON knowledge_atoms BEGIN
      INSERT INTO knowledge_fts(rowid, question, answer, gotcha_fix, tags)
      VALUES (new.id, new.question, new.answer, new.gotcha_fix, new.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_atoms_ad AFTER DELETE ON knowledge_atoms BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, question, answer, gotcha_fix, tags)
      VALUES ('delete', old.id, old.question, old.answer, old.gotcha_fix, old.tags);
    END;

    CREATE TRIGGER IF NOT EXISTS trg_atoms_au AFTER UPDATE ON knowledge_atoms BEGIN
      INSERT INTO knowledge_fts(knowledge_fts, rowid, question, answer, gotcha_fix, tags)
      VALUES ('delete', old.id, old.question, old.answer, old.gotcha_fix, old.tags);
      INSERT INTO knowledge_fts(rowid, question, answer, gotcha_fix, tags)
      VALUES (new.id, new.question, new.answer, new.gotcha_fix, new.tags);
    END;
  `);
}

export function insertAtom(db, atom) {
  const now = new Date().toISOString();
  const tagsJson = Array.isArray(atom.tags) ? JSON.stringify(atom.tags) : (atom.tags || '[]');
  const evidenceJson = Array.isArray(atom.evidence) ? JSON.stringify(atom.evidence) : (atom.evidence || '[]');

  const stmt = db.prepare(`
    INSERT INTO knowledge_atoms (
      id, project_id, scope, trust_level, question, answer, gotcha_fix,
      tags, evidence, category, confidence, pinned, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(id) DO UPDATE SET
      project_id=excluded.project_id,
      scope=excluded.scope,
      trust_level=excluded.trust_level,
      question=excluded.question,
      answer=excluded.answer,
      gotcha_fix=excluded.gotcha_fix,
      tags=excluded.tags,
      evidence=excluded.evidence,
      updated_at=excluded.updated_at
  `);

  stmt.run(
    atom.id ?? null,
    atom.project_id || atom.project || 'global',
    atom.scope || 'project',
    atom.trust_level || 'observation',
    atom.question,
    atom.answer,
    atom.gotcha_fix || extractGotchaFix(atom.answer),
    tagsJson,
    evidenceJson,
    atom.category || 'general',
    atom.confidence ?? 0.5,
    atom.pinned ? 1 : 0,
    atom.created_at || now,
    now
  );

  return atom.id || db.prepare('SELECT last_insert_rowid() as id').get().id;
}

export function extractGotchaFix(answerText) {
  if (!answerText) return null;
  const match = answerText.match(/(?:Gotcha\/Fix|Gotcha|Fix|Lưu ý|Khắc phục):\s*([^\n\r]+)/i);
  if (match) return match[1].trim();

  // If answer is short, use first line
  const lines = answerText.split('\n').map(l => l.trim()).filter(Boolean);
  return lines[0]?.slice(0, 160) || null;
}

export function getAtomById(db, id) {
  return db.prepare('SELECT * FROM knowledge_atoms WHERE id = ?').get(id);
}

export function countAtoms(db) {
  return db.prepare('SELECT count(*) as count FROM knowledge_atoms').get().count;
}
