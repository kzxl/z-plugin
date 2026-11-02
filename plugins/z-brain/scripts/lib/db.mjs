import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
const DEFAULT_DB_PATH = path.join(DEFAULT_DATA_DIR, 'zbrain.sqlite');

let _dbInstance = null;

export function getDb(customPath = null) {
  if (_dbInstance && !customPath) return _dbInstance;

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

  // Initialize Tables and Triggers automatically
  initSchema(db);

  if (!customPath) {
    _dbInstance = db;
  }
  return db;
}

export function closeDb() {
  if (_dbInstance) {
    try {
      _dbInstance.close();
    } catch {}
    _dbInstance = null;
  }
}

export function initSchema(db) {
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

    -- Session Observations Table (Short & Mid-term Activity & Architectural Decisions)
    CREATE TABLE IF NOT EXISTS session_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL DEFAULT 'default',
      project_id TEXT NOT NULL DEFAULT 'global',
      type TEXT NOT NULL DEFAULT 'observation',
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      files_touched TEXT DEFAULT '[]',
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_obs_project ON session_observations(project_id);
    CREATE INDEX IF NOT EXISTS idx_obs_session ON session_observations(session_id);
    CREATE INDEX IF NOT EXISTS idx_obs_created ON session_observations(created_at);
  `);

  // Non-destructive migration: Ensure files_touched exists on knowledge_atoms
  try {
    const cols = db.prepare('PRAGMA table_info(knowledge_atoms);').all().map(c => c.name);
    if (!cols.includes('files_touched')) {
      db.exec("ALTER TABLE knowledge_atoms ADD COLUMN files_touched TEXT DEFAULT '[]';");
    }
  } catch {}
}

export function insertAtom(db, atom) {
  const now = new Date().toISOString();
  const tagsJson = Array.isArray(atom.tags) ? JSON.stringify(atom.tags) : (atom.tags || '[]');
  const evidenceJson = Array.isArray(atom.evidence) ? JSON.stringify(atom.evidence) : (atom.evidence || '[]');
  const filesJson = Array.isArray(atom.files_touched) ? JSON.stringify(atom.files_touched) : (atom.files_touched || '[]');

  const stmt = db.prepare(`
    INSERT INTO knowledge_atoms (
      id, project_id, scope, trust_level, question, answer, gotcha_fix,
      tags, evidence, category, confidence, pinned, files_touched, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);

  const id = atom.id || getNextId(db);

  stmt.run(
    id,
    atom.project_id || 'global',
    atom.scope || 'project',
    atom.trust_level || 'observation',
    atom.question,
    atom.answer,
    atom.gotcha_fix || null,
    tagsJson,
    evidenceJson,
    atom.category || 'general',
    atom.confidence !== undefined ? atom.confidence : 0.5,
    atom.pinned ? 1 : 0,
    filesJson,
    atom.created_at || now,
    now
  );

  return id;
}

export function getAtomById(db, id) {
  const row = db.prepare('SELECT * FROM knowledge_atoms WHERE id = ?').get(id);
  if (!row) return null;
  return {
    ...row,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags || '[]') : (row.tags || []),
    evidence: typeof row.evidence === 'string' ? JSON.parse(row.evidence || '[]') : (row.evidence || []),
    files_touched: typeof row.files_touched === 'string' ? JSON.parse(row.files_touched || '[]') : (row.files_touched || [])
  };
}

export function insertObservation(db, obs) {
  const now = new Date().toISOString();
  const filesJson = Array.isArray(obs.files_touched) ? JSON.stringify(obs.files_touched) : (obs.files_touched || '[]');

  const stmt = db.prepare(`
    INSERT INTO session_observations (
      session_id, project_id, type, title, summary, files_touched, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    obs.session_id || 'default',
    obs.project_id || 'global',
    obs.type || 'observation',
    obs.title,
    obs.summary,
    filesJson,
    obs.created_at || now
  );

  const row = db.prepare('SELECT last_insert_rowid() as id').get();
  return row ? row.id : 1;
}

export function getRecentObservations(db, { project = null, limit = 10 } = {}) {
  let sql = 'SELECT * FROM session_observations';
  const params = [];
  if (project && project !== 'global') {
    sql += " WHERE project_id = ? OR project_id = 'global'";
    params.push(project.toLowerCase());
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    ...r,
    files_touched: typeof r.files_touched === 'string' ? JSON.parse(r.files_touched || '[]') : (r.files_touched || [])
  }));
}

export function getRecentAtoms(db, { project = null, limit = 10 } = {}) {
  let sql = 'SELECT * FROM knowledge_atoms';
  const params = [];
  if (project && project !== 'global') {
    sql += " WHERE project_id = ? OR project_id = 'global'";
    params.push(project.toLowerCase());
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    ...r,
    tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || []),
    evidence: typeof r.evidence === 'string' ? JSON.parse(r.evidence || '[]') : (r.evidence || []),
    files_touched: typeof r.files_touched === 'string' ? JSON.parse(r.files_touched || '[]') : (r.files_touched || [])
  }));
}

export function getKnowledgeByFile(db, filePath, { limit = 5 } = {}) {
  const normFile = path.basename(filePath).toLowerCase();
  const searchPattern = `%${normFile}%`;

  const atomRows = db.prepare(`
    SELECT * FROM knowledge_atoms
    WHERE files_touched LIKE ?
       OR question LIKE ?
       OR gotcha_fix LIKE ?
    ORDER BY id DESC LIMIT ?
  `).all(searchPattern, searchPattern, searchPattern, limit);

  const atoms = atomRows.map(r => ({
    ...r,
    tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || []),
    evidence: typeof r.evidence === 'string' ? JSON.parse(r.evidence || '[]') : (r.evidence || []),
    files_touched: typeof r.files_touched === 'string' ? JSON.parse(r.files_touched || '[]') : (r.files_touched || [])
  }));

  const obsRows = db.prepare(`
    SELECT * FROM session_observations
    WHERE files_touched LIKE ?
       OR title LIKE ?
       OR summary LIKE ?
    ORDER BY id DESC LIMIT ?
  `).all(searchPattern, searchPattern, searchPattern, limit);

  const observations = obsRows.map(r => ({
    ...r,
    files_touched: typeof r.files_touched === 'string' ? JSON.parse(r.files_touched || '[]') : (r.files_touched || [])
  }));

  return { atoms, observations };
}

export function updateAtom(db, id, updates) {
  const existing = getAtomById(db, id);
  if (!existing) return false;

  const now = new Date().toISOString();
  let trustLevel = updates.trust_level || existing.trust_level;
  if (updates.trust_level === 'verified_fact' || existing.trust_level === 'verified_fact') {
    trustLevel = 'verified_fact';
  }

  const existingTags = existing.tags || [];
  const newTags = Array.isArray(updates.tags) ? updates.tags : (updates.tags ? [updates.tags] : []);
  const mergedTags = [...new Set([...existingTags, ...newTags])];

  const existingEvidence = existing.evidence || [];
  const newEvidence = Array.isArray(updates.evidence) ? updates.evidence : (updates.evidence ? [updates.evidence] : []);
  const mergedEvidence = [...new Set([...existingEvidence, ...newEvidence])];

  const existingFiles = existing.files_touched || [];
  const newFiles = Array.isArray(updates.files_touched) ? updates.files_touched : (updates.files_touched ? [updates.files_touched] : []);
  const mergedFiles = [...new Set([...existingFiles, ...newFiles])];

  const stmt = db.prepare(`
    UPDATE knowledge_atoms
    SET trust_level = ?,
        tags = ?,
        evidence = ?,
        files_touched = ?,
        gotcha_fix = COALESCE(?, gotcha_fix),
        updated_at = ?
    WHERE id = ?
  `);

  stmt.run(
    trustLevel,
    JSON.stringify(mergedTags),
    JSON.stringify(mergedEvidence),
    JSON.stringify(mergedFiles),
    updates.gotcha_fix || null,
    now,
    id
  );

  return true;
}

export function countAtoms(db, projectId = null) {
  if (projectId) {
    const res = db.prepare('SELECT count(*) as count FROM knowledge_atoms WHERE project_id = ?').get(projectId);
    return res.count;
  }
  const res = db.prepare('SELECT count(*) as count FROM knowledge_atoms').get();
  return res.count;
}

export function getDbStats(db) {
  const total = db.prepare('SELECT count(*) as count FROM knowledge_atoms').get().count;
  const verified = db.prepare("SELECT count(*) as count FROM knowledge_atoms WHERE trust_level = 'verified_fact'").get().count;
  const observations = db.prepare("SELECT count(*) as count FROM knowledge_atoms WHERE trust_level = 'observation'").get().count;
  const hypotheses = db.prepare("SELECT count(*) as count FROM knowledge_atoms WHERE trust_level = 'hypothesis'").get().count;

  const projectCounts = db.prepare('SELECT project_id, count(*) as count FROM knowledge_atoms GROUP BY project_id ORDER BY count DESC LIMIT 8').all();
  const recent = db.prepare('SELECT id, project_id, trust_level, question, gotcha_fix, created_at FROM knowledge_atoms ORDER BY id DESC LIMIT 5').all();

  // Aggregate tags
  const rows = db.prepare('SELECT tags FROM knowledge_atoms').all();
  const tagCounts = {};
  for (const r of rows) {
    try {
      const tags = JSON.parse(r.tags || '[]');
      for (const t of tags) {
        const norm = String(t).trim().toLowerCase();
        if (norm) tagCounts[norm] = (tagCounts[norm] || 0) + 1;
      }
    } catch {}
  }
  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([tag, count]) => ({ tag, count }));

  return {
    total,
    trust: {
      verified_fact: verified,
      observation: observations,
      hypothesis: hypotheses
    },
    projectCounts,
    topTags,
    recent
  };
}

function getNextId(db) {
  const res = db.prepare('SELECT max(id) as max_id FROM knowledge_atoms').get();
  return (res && res.max_id) ? res.max_id + 1 : 1;
}
