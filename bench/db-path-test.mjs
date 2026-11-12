// Verifies the global z-brain database location, schema versioning,
// legacy adoption and the db admin commands (info/backup/restore/import).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbModuleUrl = pathToFileURL(path.join(root, 'plugins/z-brain/scripts/lib/db.mjs')).href;
const adminModuleUrl = pathToFileURL(path.join(root, 'plugins/z-brain/scripts/lib/db-admin.mjs')).href;

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  ok  ', msg);
}

function run(code, env) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, ...env },
    encoding: 'utf8',
  });
}

function isolatedHome(env = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'zbrain-home-'));
  const base = { ...process.env, HOME: home, USERPROFILE: home, ...env };
  delete base.ZBRAIN_DB_PATH;
  delete base.ZBRAIN_DATA_DIR;
  delete base.ZBRAIN_LEGACY_DB;
  delete base.ZBRAIN_ADOPT_LEGACY;
  return { home, env: { ...base, ...env } };
}

const { getDb, getDbPath, insertAtom, closeDb, SCHEMA_VERSION } = await import(dbModuleUrl);
const { dbInfo, formatDbInfo, backupDb, restoreDb, importDbFromPath } = await import(adminModuleUrl);

console.log('z-brain db: default location is per-user');
{
  const { home, env } = isolatedHome();
  const res = run(`import { getDbPath } from '${dbModuleUrl}'; console.log(getDbPath());`, env);
  ok(res.status === 0, 'child process resolves the default database path');
  ok(path.resolve(res.stdout.trim()) === path.resolve(path.join(home, '.z-plugin', 'brain.sqlite')),
    'default path is <home>/.z-plugin/brain.sqlite');
}

console.log('z-brain db: explicit overrides win');
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zbrain-data-'));
  const res = run(`import { getDbPath } from '${dbModuleUrl}'; console.log(getDbPath());`, { ZBRAIN_DATA_DIR: dir });
  ok(path.resolve(res.stdout.trim()) === path.resolve(path.join(dir, 'brain.sqlite')), 'ZBRAIN_DATA_DIR overrides the home directory');

  const custom = path.join(dir, 'custom.sqlite');
  const res2 = run(`import { getDbPath } from '${dbModuleUrl}'; console.log(getDbPath());`, { ZBRAIN_DATA_DIR: dir, ZBRAIN_DB_PATH: custom });
  ok(path.resolve(res2.stdout.trim()) === path.resolve(custom), 'ZBRAIN_DB_PATH overrides ZBRAIN_DATA_DIR');
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zbrain-admin-'));
const dbPath = path.join(work, 'data', 'zbrain.sqlite');
const db = getDb(dbPath);

console.log('z-brain db: schema version gate');
ok(Number(db.prepare('PRAGMA user_version').get().user_version) === SCHEMA_VERSION,
  `fresh database is stamped with schema v${SCHEMA_VERSION}`);
{
  const future = path.join(work, 'future.sqlite');
  const raw = new DatabaseSync(future);
  raw.exec('PRAGMA user_version = 99;');
  raw.close();
  const res = run(`import { getDb } from '${dbModuleUrl}'; getDb();`, { ZBRAIN_DB_PATH: future });
  ok(res.status !== 0 && /newer than this plugin/.test(res.stderr || ''),
    'a database written by a newer plugin is rejected instead of mutated');
}

console.log('z-brain db: legacy adoption');
{
  const { home, env } = isolatedHome();
  const legacy = path.join(home, '.zcode', 'plugins', 'z-brain', 'data', 'zbrain.sqlite');
  fs.mkdirSync(path.dirname(legacy), { recursive: true });
  const old = getDb(legacy);
  insertAtom(old, { question: 'legacy one', answer: 'from zcode', project_id: 'z-plugin' });
  insertAtom(old, { question: 'legacy two', answer: 'from zcode', project_id: 'z-plugin' });
  old.close();

  const res = run(`
    import { getDb, getDbPath } from '${dbModuleUrl}';
    const db = getDb();
    console.log(JSON.stringify({ path: getDbPath(), atoms: db.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c }));
  `, { ...env, ZBRAIN_LEGACY_DB: legacy });

  ok(res.status === 0, 'first run with a legacy database succeeds');
  const out = JSON.parse(res.stdout.trim().split('\n').pop());
  ok(path.resolve(out.path) === path.resolve(path.join(home, '.z-plugin', 'brain.sqlite')), 'adopted data lands in the global path');
  ok(out.atoms === 2, `legacy atoms are adopted (verified: ${out.atoms})`);
  ok(fs.existsSync(legacy), 'legacy database is left untouched as a safety copy');

  const off = isolatedHome({ ZBRAIN_ADOPT_LEGACY: '0' });
  const legacy2 = path.join(off.home, '.zcode', 'plugins', 'z-brain', 'data', 'zbrain.sqlite');
  fs.mkdirSync(path.dirname(legacy2), { recursive: true });
  const old2 = getDb(legacy2);
  insertAtom(old2, { question: 'should stay put', answer: 'nope' });
  old2.close();
  const res2 = run(`
    import { getDb } from '${dbModuleUrl}';
    const db = getDb();
    console.log(db.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c);
  `, { ...off.env, ZBRAIN_LEGACY_DB: legacy2 });
  ok(res2.status === 0 && res2.stdout.trim() === '0', 'ZBRAIN_ADOPT_LEGACY=0 disables automatic adoption');
}

console.log('z-brain db: info, backup, import, restore');
insertAtom(db, { question: 'how to flush spool', answer: 'flushSpool(db)', project_id: 'z-plugin', trust_level: 'verified_fact' });
insertAtom(db, { question: 'how to cap briefs', answer: 'pass budget', project_id: 'other-project' });

const info = dbInfo(db);
ok(info.atoms === 2 && info.version === SCHEMA_VERSION, 'db info reports atom count and schema version');
ok(info.projects.some((p) => p.project_id === 'z-plugin') && info.projects.some((p) => p.project_id === 'other-project'),
  'db info groups atoms by project');
ok(info.legacy.every((entry) => path.resolve(entry.path) !== path.resolve(dbPath)), 'db info never lists the active database as legacy');
ok(/Database|Atoms/.test(formatDbInfo(info)), 'formatDbInfo renders a readable summary');

const backupPath = path.join(work, 'backup', 'snapshot.sqlite');
const backup = backupDb(db, backupPath);
ok(fs.existsSync(backup.path) && backup.bytes > 0, 'backup writes a snapshot file');
{
  const copy = new DatabaseSync(backup.path, { readOnly: true });
  ok(copy.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c === 2, 'backup contains the same atoms');
  copy.close();
}
ok(spawnSync(process.execPath, ['--check', backup.path]).status !== 0, 'backup file is a database, not a text copy');

{
  const otherPath = path.join(work, 'other.sqlite');
  const other = getDb(otherPath);
  insertAtom(other, { question: 'how to flush spool', answer: 'duplicate wording', project_id: 'z-plugin' });
  insertAtom(other, { question: 'unique lesson', answer: 'only in the second db', project_id: 'z-plugin' });
  const imported = importDbFromPath(db, otherPath);
  other.close();
  ok(imported.atoms === 1, `import merges only new questions (verified: ${imported.atoms})`);
  ok(db.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c === 3, 'database now holds the merged set');
  const meta = db.prepare("SELECT value FROM observer_meta WHERE key LIKE 'legacy_merged:%'").all();
  ok(meta.length === 1, 'import records a merge marker to avoid repeated work');
  let rejected = false;
  try { importDbFromPath(db, dbPath); } catch { rejected = true; }
  ok(rejected, 'import refuses to merge the active database into itself');
}

{
  insertAtom(db, { question: 'temporary lesson', answer: 'added after backup' });
  const before = db.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c;
  const restored = restoreDb(db, backupPath);
  ok(fs.existsSync(restored.backup), 'restore backs up the current database before replacing it');
  const reopened = getDb(dbPath);
  const after = reopened.prepare('SELECT count(*) AS c FROM knowledge_atoms').get().c;
  ok(before === 4 && after === 2, `restore returns to the snapshot atom count (before ${before}, after ${after})`);
  reopened.close();
  closeDb();
}

console.log('all z-brain db path tests passed!');
