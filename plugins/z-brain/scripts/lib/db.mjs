import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { projectIdentity } from './workspace.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(__dirname, '..', '..');
const DB_FILENAME = 'brain.sqlite';
// Pre-1.9 releases kept one database inside every host's plugin copy.
const LEGACY_DB_FILENAMES = ['brain.sqlite', 'zbrain.sqlite'];

// Bump when a migration step is added. Databases newer than this code are rejected
// instead of being silently mutated by an older host.
export const SCHEMA_VERSION = 3;

let _dbInstance = null;

export function defaultDataDir() {
  return process.env.ZBRAIN_DATA_DIR || path.join(os.homedir(), '.z-plugin');
}

export function hashPath(filePath) {
  return createHash('sha1').update(path.resolve(filePath).toLowerCase()).digest('hex').slice(0, 12);
}

function defaultDbPath() {
  return path.join(defaultDataDir(), DB_FILENAME);
}

function countAtomsInFile(file) {
  let db = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    return db.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c;
  } catch {
    return 0;
  } finally {
    try { db?.close(); } catch {}
  }
}

export function legacyDbCandidates() {
  if (process.env.ZBRAIN_LEGACY_DB) {
    return process.env.ZBRAIN_LEGACY_DB
      .split(path.delimiter)
      .map((entry) => path.resolve(entry.trim()))
      .filter((entry) => entry && fs.existsSync(entry));
  }
  const home = os.homedir();
  const dirs = [
    path.join(defaultDataDir()),
    path.join(PLUGIN_ROOT, 'data'),
    path.join(home, '.zcode', 'plugins', 'z-brain', 'data'),
    path.join(home, '.gemini', 'config', 'plugins', 'z-brain', 'data'),
  ];
  const qoderCache = path.join(home, '.qoder', 'plugins', 'cache', 'local', 'z-plugin');
  try {
    for (const version of fs.readdirSync(qoderCache)) {
      dirs.push(path.join(qoderCache, version, 'plugins', 'z-brain', 'data'));
    }
  } catch {}
  const candidates = dirs.flatMap((dir) => LEGACY_DB_FILENAMES.map((name) => path.join(dir, name)));
  return [...new Set(candidates.map((entry) => path.resolve(entry)))]
    .filter((entry) => fs.existsSync(entry));
}

// One-time adoption of the richest pre-1.9 database. Copies a consistent snapshot
// (VACUUM INTO) and links it into place, so concurrent hooks can never observe a
// half-written file and later adoptions see it already exists.
function adoptLegacyDb(dbPath) {
  if (fs.existsSync(dbPath) || process.env.ZBRAIN_ADOPT_LEGACY === '0') return null;
  const best = legacyDbCandidates()
    .filter((file) => path.resolve(file) !== path.resolve(dbPath))
    .map((file) => ({ file, atoms: countAtomsInFile(file) }))
    .filter((candidate) => candidate.atoms > 0)
    .sort((a, b) => b.atoms - a.atoms)[0];
  if (!best) return null;

  const tmp = path.join(path.dirname(dbPath), `.adopt-${process.pid}-${Date.now()}.tmp`);
  let source = null;
  try {
    source = new DatabaseSync(best.file);
    source.exec('PRAGMA busy_timeout = 5000;');
    source.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
    try {
      fs.linkSync(tmp, dbPath);
    } catch (err) {
      if (err.code !== 'EEXIST') fs.copyFileSync(tmp, dbPath, fs.constants.COPYFILE_EXCL);
    }
    return { from: best.file, atoms: best.atoms };
  } catch {
    return null;
  } finally {
    try { source?.close(); } catch {}
    try { fs.rmSync(tmp, { force: true }); } catch {}
  }
}

function applySchemaVersion(db) {
  const current = Number(db.prepare('PRAGMA user_version').get()?.user_version || 0);
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `z-brain database schema v${current} is newer than this plugin (v${SCHEMA_VERSION}). `
      + 'Update z-plugin or point ZBRAIN_DB_PATH at another database.'
    );
  }
  if (current === SCHEMA_VERSION) return;
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  try {
    if (current > 0) setMeta(db, 'schema_upgraded_from', current);
    setMeta(db, 'schema_version', SCHEMA_VERSION);
  } catch {}
}

export function getDb(customPath = null) {
  if (_dbInstance && !customPath) return _dbInstance;

  const dbPath = path.resolve(customPath || process.env.ZBRAIN_DB_PATH || defaultDbPath());
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const adopt = (!customPath && !process.env.ZBRAIN_DB_PATH) ? adoptLegacyDb(dbPath) : null;

  const db = new DatabaseSync(dbPath);

  // Performance & Concurrency Tuning
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA cache_size = -32000;'); // 32MB cache
  db.exec('PRAGMA busy_timeout = 8000;'); // Multiple hosts and hooks may write concurrently

  // Initialize Tables and Triggers automatically
  initSchema(db);
  applySchemaVersion(db);

  if (adopt) {
    try {
      setMeta(db, 'legacy_adopted_from', JSON.stringify(adopt));
      setMeta(db, `legacy_merged:${hashPath(adopt.from)}`, new Date().toISOString());
    } catch {}
  }

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

    -- Automatic file edit history (append-only, coalesced per session window)
    CREATE TABLE IF NOT EXISTS file_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL DEFAULT 'global',
      workspace TEXT NOT NULL DEFAULT '',
      session_id TEXT NOT NULL DEFAULT 'default',
      path TEXT NOT NULL,
      op TEXT NOT NULL DEFAULT 'update',
      tool TEXT,
      source TEXT NOT NULL DEFAULT 'hook',
      lines_added INTEGER NOT NULL DEFAULT 0,
      lines_removed INTEGER NOT NULL DEFAULT 0,
      old_hash TEXT,
      new_hash TEXT,
      patch TEXT,
      redacted INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      harvested_commit TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_events_project_time ON file_events(project_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_workspace_path ON file_events(workspace, path, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_events_session ON file_events(session_id, created_at DESC);

    -- Persistent file inventory (one row per file seen in a workspace)
    CREATE TABLE IF NOT EXISTS file_index (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL DEFAULT 'global',
      workspace TEXT NOT NULL DEFAULT '',
      path TEXT NOT NULL,
      mtime REAL NOT NULL DEFAULT 0,
      size INTEGER NOT NULL DEFAULT 0,
      hash TEXT,
      lang TEXT,
      symbol_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'clean',
      last_event_id INTEGER,
      updated_at TEXT NOT NULL,
      UNIQUE(workspace, path)
    );
    CREATE INDEX IF NOT EXISTS idx_index_project_mtime ON file_index(project_id, mtime DESC);
    CREATE INDEX IF NOT EXISTS idx_index_workspace ON file_index(workspace);

    -- Observer bookkeeping (baseline marker, retention timestamps, leader leases)
    CREATE TABLE IF NOT EXISTS observer_meta (
      key TEXT PRIMARY KEY,
      value TEXT,
      updated_at TEXT NOT NULL
    );

    -- Stable project identity per workspace root and git remote
    CREATE TABLE IF NOT EXISTS project_registry (
      root TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      remote TEXT,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_project_registry_id ON project_registry(project_id);
    CREATE INDEX IF NOT EXISTS idx_project_registry_remote ON project_registry(remote);

    -- Knowledge Graph (L3 Memory Hierarchy): Entity Nodes and Relational Edges
    CREATE TABLE IF NOT EXISTS entity_nodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL DEFAULT 'global',
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL DEFAULT 'concept',
      description TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_entity_project_name ON entity_nodes(project_id, name);

    CREATE TABLE IF NOT EXISTS entity_edges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL DEFAULT 'global',
      source_node_id INTEGER NOT NULL,
      target_node_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      confidence REAL DEFAULT 1.0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_edges_source_target ON entity_edges(source_node_id, target_node_id);
  `);

  // Non-destructive migration: Ensure files_touched and temporal validity columns exist on knowledge_atoms
  try {
    const cols = db.prepare('PRAGMA table_info(knowledge_atoms);').all().map(c => c.name);
    if (!cols.includes('files_touched')) {
      db.exec("ALTER TABLE knowledge_atoms ADD COLUMN files_touched TEXT DEFAULT '[]';");
    }
    if (!cols.includes('valid_from')) {
      db.exec("ALTER TABLE knowledge_atoms ADD COLUMN valid_from TEXT;");
    }
    if (!cols.includes('valid_to')) {
      db.exec("ALTER TABLE knowledge_atoms ADD COLUMN valid_to TEXT;");
    }
    if (!cols.includes('superseded_by')) {
      db.exec("ALTER TABLE knowledge_atoms ADD COLUMN superseded_by INTEGER;");
    }
  } catch {}
}

export function insertAtom(db, atom) {
  const now = new Date().toISOString();
  const tagsJson = Array.isArray(atom.tags) ? JSON.stringify(atom.tags) : (atom.tags || '[]');
  const evidenceJson = Array.isArray(atom.evidence) ? JSON.stringify(atom.evidence) : (atom.evidence || '[]');
  const filesJson = Array.isArray(atom.files_touched) ? JSON.stringify(atom.files_touched) : (atom.files_touched || '[]');
  const validFrom = atom.valid_from || atom.created_at || now;
  const validTo = atom.valid_to || null;
  const supersededBy = atom.superseded_by || null;

  const stmt = db.prepare(`
    INSERT INTO knowledge_atoms (
      id, project_id, scope, trust_level, question, answer, gotcha_fix,
      tags, evidence, category, confidence, pinned, files_touched,
      valid_from, valid_to, superseded_by, created_at, updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?
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
    validFrom,
    validTo,
    supersededBy,
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

/**
 * Graphify: Query Knowledge Atoms and Relational Edges mapped to a specific code symbol
 */
export function getKnowledgeBySymbol(db, symbolName, { project = null, limit = 5 } = {}) {
  const cleanSym = String(symbolName || '').trim();
  if (!cleanSym) return { symbol: '', atoms: [], edges: [] };

  const pattern = `%${cleanSym}%`;
  let sql = `
    SELECT * FROM knowledge_atoms
    WHERE (tags LIKE ? OR question LIKE ? OR gotcha_fix LIKE ?)
  `;
  const params = [pattern, pattern, pattern];
  if (project && project !== 'global') {
    sql += " AND (project_id = ? OR project_id = 'global')";
    params.push(project.toLowerCase());
  }
  sql += ' ORDER BY id DESC LIMIT ?';
  params.push(limit);

  const atomRows = db.prepare(sql).all(...params);
  const atoms = atomRows.map(r => ({
    ...r,
    tags: typeof r.tags === 'string' ? JSON.parse(r.tags || '[]') : (r.tags || []),
    evidence: typeof r.evidence === 'string' ? JSON.parse(r.evidence || '[]') : (r.evidence || []),
    files_touched: typeof r.files_touched === 'string' ? JSON.parse(r.files_touched || '[]') : (r.files_touched || [])
  }));

  const edges = queryEntityGraph(db, { name: cleanSym, limit: 10 });

  return {
    symbol: cleanSym,
    atoms,
    edges
  };
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

/**
 * Mark an older atom as superseded by a newer verified atom (L2 Temporal Memory)
 */
export function supersedeAtom(db, oldId, newId) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE knowledge_atoms
    SET valid_to = ?, superseded_by = ?, updated_at = ?
    WHERE id = ?
  `).run(now, newId, now, oldId);
  return true;
}

/**
 * Insert an Entity Node into the Knowledge Graph (L3 Memory Hierarchy)
 */
export function insertEntityNode(db, node) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO entity_nodes (project_id, name, entity_type, description, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run(
    node.project_id || 'global',
    node.name,
    node.entity_type || 'concept',
    node.description || null,
    now
  );
  const row = db.prepare('SELECT last_insert_rowid() as id').get();
  return row ? row.id : 1;
}

/**
 * Insert a Relational Edge between two Entity Nodes
 */
export function insertEntityEdge(db, edge) {
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO entity_edges (project_id, source_node_id, target_node_id, relation_type, confidence, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    edge.project_id || 'global',
    edge.source_node_id,
    edge.target_node_id,
    edge.relation_type,
    edge.confidence !== undefined ? edge.confidence : 1.0,
    typeof edge.metadata === 'object' ? JSON.stringify(edge.metadata) : (edge.metadata || '{}'),
    now
  );
  const row = db.prepare('SELECT last_insert_rowid() as id').get();
  return row ? row.id : 1;
}

/**
 * Query Knowledge Graph relations by project, entity name, or relationship type
 */
export function queryEntityGraph(db, { project = null, name = null, relation = null, limit = 20 } = {}) {
  let sql = `
    SELECT e.id, e.project_id, e.relation_type, e.confidence, e.metadata, e.created_at,
           s.name as source_name, s.entity_type as source_type,
           t.name as target_name, t.entity_type as target_type
    FROM entity_edges e
    JOIN entity_nodes s ON e.source_node_id = s.id
    JOIN entity_nodes t ON e.target_node_id = t.id
    WHERE 1=1
  `;
  const params = [];
  if (project && project !== 'global') {
    sql += " AND (e.project_id = ? OR e.project_id = 'global')";
    params.push(project.toLowerCase());
  }
  if (name) {
    sql += " AND (s.name LIKE ? OR t.name LIKE ?)";
    params.push(`%${name}%`, `%${name}%`);
  }
  if (relation) {
    sql += " AND e.relation_type = ?";
    params.push(relation);
  }
  sql += " ORDER BY e.id DESC LIMIT ?";
  params.push(limit);

  return db.prepare(sql).all(...params);
}

// ---------------------------------------------------------------- File observer store

export function getDbPath() {
  return path.resolve(process.env.ZBRAIN_DB_PATH || defaultDbPath());
}

export function getDataDir() {
  return path.dirname(getDbPath());
}

export function getMeta(db, key) {
  const row = db.prepare('SELECT value FROM observer_meta WHERE key = ?').get(key);
  return row ? row.value : null;
}

export function setMeta(db, key, value) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO observer_meta (key, value, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, value == null ? null : String(value), now);
}

/**
 * Stable project id for a workspace root.
 *
 * The registry is the source of truth once written, so the id never drifts when a
 * folder is renamed or moved. A clone of the same repository (matching remote)
 * reuses the first id, while two different repositories sharing a folder name get
 * distinct fingerprinted ids. Legacy basename ids are preserved when this root
 * already owns them in file_index, so pre-1.10 history stays attached.
 */
export function resolveProjectId(db, root) {
  const identity = projectIdentity(root);
  const known = db.prepare('SELECT project_id FROM project_registry WHERE root = ?').get(identity.root);
  if (known) return known.project_id;

  let projectId = null;
  if (identity.slug === 'global') {
    // Generic roots intentionally share one bucket; salting it would split history.
    projectId = 'global';
  } else if (identity.remote) {
    const sameRemote = db.prepare(
      'SELECT project_id FROM project_registry WHERE remote = ? ORDER BY updated_at ASC LIMIT 1'
    ).get(identity.remote);
    if (sameRemote) projectId = sameRemote.project_id;
  }
  if (!projectId) {
    const claimedByRegistry = db.prepare(
      'SELECT 1 FROM project_registry WHERE project_id = ? AND root <> ? LIMIT 1'
    ).get(identity.slug, identity.root);
    const ownedByOtherRoot = db.prepare(
      'SELECT 1 FROM file_index WHERE project_id = ? AND workspace <> ? LIMIT 1'
    ).get(identity.slug, identity.root);
    const ownLegacyRows = db.prepare(
      'SELECT 1 FROM file_index WHERE project_id = ? AND workspace = ? LIMIT 1'
    ).get(identity.slug, identity.root);
    projectId = (ownLegacyRows || (!claimedByRegistry && !ownedByOtherRoot))
      ? identity.slug
      : `${identity.slug}-${identity.fingerprint}`;
  }

  try {
    db.prepare(`
      INSERT INTO project_registry (root, project_id, remote, updated_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(root) DO UPDATE SET
        project_id = excluded.project_id,
        remote = excluded.remote,
        updated_at = excluded.updated_at
    `).run(identity.root, projectId, identity.remote, new Date().toISOString());
  } catch {}
  return projectId;
}

export function isBusyError(err) {
  return /SQLITE_BUSY|SQLITE_LOCKED|database is locked|database table is locked/i.test(String(err?.message || err));
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Several IDE hosts and hooks share one database; WAL still returns busy when a
// writer holds the lock, so writes retry with capped exponential jitter.
export function withBusyRetry(fn, { retries = 5, baseMs = 20, maxMs = 400 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      return fn();
    } catch (err) {
      if (!isBusyError(err) || attempt >= retries) throw err;
      sleepSync(Math.min(maxMs, baseMs * 2 ** attempt) + Math.floor(Math.random() * baseMs));
      attempt++;
    }
  }
}

export function transact(db, fn) {
  return withBusyRetry(() => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      try {
        db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  });
}

export function upsertFileIndex(db, entry) {
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO file_index (
      project_id, workspace, path, mtime, size, hash, lang,
      symbol_count, status, last_event_id, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(workspace, path) DO UPDATE SET
      project_id = excluded.project_id,
      mtime = excluded.mtime,
      size = excluded.size,
      hash = excluded.hash,
      lang = excluded.lang,
      symbol_count = excluded.symbol_count,
      status = excluded.status,
      last_event_id = COALESCE(excluded.last_event_id, file_index.last_event_id),
      updated_at = excluded.updated_at
  `).run(
    entry.project_id || 'global',
    entry.workspace || '',
    entry.path,
    entry.mtime || 0,
    entry.size || 0,
    entry.hash || null,
    entry.lang || null,
    entry.symbol_count || 0,
    entry.status || 'clean',
    entry.last_event_id || null,
    entry.updated_at || now
  );
}

export function getFileIndexEntry(db, workspace, relPath) {
  return db.prepare('SELECT * FROM file_index WHERE workspace = ? AND path = ?').get(workspace, relPath) || null;
}

export function listFileIndex(db, { workspace = null, project = null, limit = 500 } = {}) {
  let sql = 'SELECT * FROM file_index WHERE 1=1';
  const params = [];
  if (workspace) {
    sql += ' AND workspace = ?';
    params.push(workspace);
  }
  if (project && project !== 'global') {
    sql += ' AND project_id = ?';
    params.push(project.toLowerCase());
  }
  sql += ' ORDER BY updated_at DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function deleteFileIndexEntry(db, workspace, relPath) {
  return db.prepare('DELETE FROM file_index WHERE workspace = ? AND path = ?').run(workspace, relPath).changes > 0;
}

export function insertFileEvent(db, ev) {
  const now = new Date().toISOString();
  const res = db.prepare(`
    INSERT INTO file_events (
      project_id, workspace, session_id, path, op, tool, source,
      lines_added, lines_removed, old_hash, new_hash, patch, redacted,
      created_at, updated_at, harvested_commit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ev.project_id || 'global',
    ev.workspace || '',
    ev.session_id || 'default',
    ev.path,
    ev.op || 'update',
    ev.tool || null,
    ev.source || 'hook',
    ev.lines_added || 0,
    ev.lines_removed || 0,
    ev.old_hash || null,
    ev.new_hash || null,
    ev.patch || null,
    ev.redacted ? 1 : 0,
    ev.created_at || now,
    ev.updated_at || ev.created_at || now,
    ev.harvested_commit || null
  );
  return Number(res.lastInsertRowid);
}

export function findCoalescibleEvent(db, { workspace, path, session_id, source, op, sinceIso }) {
  return db.prepare(`
    SELECT * FROM file_events
    WHERE workspace = ? AND path = ? AND session_id = ? AND source = ? AND op = ?
      AND created_at >= ?
    ORDER BY id DESC LIMIT 1
  `).get(workspace, path, session_id, source, op, sinceIso) || null;
}

export function updateFileEvent(db, id, updates) {
  db.prepare(`
    UPDATE file_events
    SET lines_added = ?, lines_removed = ?, new_hash = ?,
        patch = ?, redacted = ?, updated_at = ?
    WHERE id = ?
  `).run(
    updates.lines_added || 0,
    updates.lines_removed || 0,
    updates.new_hash || null,
    updates.patch || null,
    updates.redacted ? 1 : 0,
    updates.updated_at || new Date().toISOString(),
    id
  );
}

export function getFileHistory(db, { workspace = null, project = null, file, limit = 20 } = {}) {
  const norm = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!norm) return [];
  const suffix = `%${norm}%`;
  let sql = `
    SELECT * FROM file_events
    WHERE (path = ? OR path LIKE ?)
  `;
  const params = [norm, suffix];
  if (workspace) {
    sql += ' AND workspace = ?';
    params.push(workspace);
  } else if (project && project !== 'global') {
    sql += ' AND project_id = ?';
    params.push(project.toLowerCase());
  }
  sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function getRecentFileEvents(db, { workspace = null, project = null, limit = 15 } = {}) {
  let sql = 'SELECT * FROM file_events WHERE 1=1';
  const params = [];
  if (workspace) {
    sql += ' AND workspace = ?';
    params.push(workspace);
  } else if (project && project !== 'global') {
    sql += ' AND project_id = ?';
    params.push(project.toLowerCase());
  }
  sql += ' ORDER BY created_at DESC, id DESC LIMIT ?';
  params.push(limit);
  return db.prepare(sql).all(...params);
}

export function getFileObserverStats(db, { workspace = null } = {}) {
  const filter = workspace ? ' WHERE workspace = ?' : '';
  const params = workspace ? [workspace] : [];
  const total = db.prepare(`SELECT count(*) AS c FROM file_events${filter}`).get(...params).c;
  const today = db.prepare(
    `SELECT count(*) AS c FROM file_events${workspace ? ' WHERE workspace = ? AND' : ' WHERE'} created_at >= ?`
  ).get(...params, new Date(Date.now() - 86400000).toISOString()).c;
  const tracked = db.prepare(`SELECT count(*) AS c FROM file_index${filter}`).get(...params).c;
  const last = db.prepare(`SELECT created_at FROM file_events${filter} ORDER BY id DESC LIMIT 1`).get(...params);
  return { totalEvents: total, eventsToday: today, trackedFiles: tracked, lastEventAt: last ? last.created_at : null };
}

export function pruneFileEvents(db, { patchDays = 30, eventDays = 365, maxRows = 100000 } = {}) {
  const now = Date.now();
  const patchCutoff = new Date(now - patchDays * 86400000).toISOString();
  const eventCutoff = new Date(now - eventDays * 86400000).toISOString();

  const patchesCleared = db.prepare(
    'UPDATE file_events SET patch = NULL WHERE patch IS NOT NULL AND created_at < ?'
  ).run(patchCutoff).changes;
  const eventsDeleted = db.prepare('DELETE FROM file_events WHERE created_at < ?').run(eventCutoff).changes;

  const total = db.prepare('SELECT count(*) AS c FROM file_events').get().c;
  const rowsCapped = total > maxRows
    ? db.prepare('DELETE FROM file_events WHERE id IN (SELECT id FROM file_events ORDER BY id ASC LIMIT ?)').run(total - maxRows).changes
    : 0;

  return { patchesCleared, eventsDeleted, rowsCapped };
}
