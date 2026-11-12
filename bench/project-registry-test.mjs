// Stable project identity across workspaces, clones and renamed folders.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zbrain-project-'));
process.env.ZBRAIN_DB_PATH = path.join(tempDir, 'data', 'brain.sqlite');
process.env.ZBRAIN_SPOOL_DIR = path.join(tempDir, 'spool');

const { getDb, resolveProjectId, closeDb } = await import('../plugins/z-brain/scripts/lib/db.mjs');
const { projectIdentity } = await import('../plugins/z-brain/scripts/lib/workspace.mjs');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  passed++;
  console.log('  ok  ', msg);
}

function makeRepo(name, remote) {
  const root = path.join(tempDir, name);
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'index.js'), 'export const x = 1;\n', 'utf8');
  const git = (...args) => cp.execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  git('init');
  if (remote) git('remote', 'add', 'origin', remote);
  return root;
}

const db = getDb();

console.log('z-brain project: identity inputs');
{
  const repo = makeRepo('api-a', 'https://github.com/acme/api-a.git');
  const identity = projectIdentity(repo);
  ok(identity.slug === 'api-a', 'slug comes from the folder name');
  ok(identity.remote === 'https://github.com/acme/api-a.git', 'git origin is detected');
  ok(/^[0-9a-f]{6}$/.test(identity.fingerprint), 'fingerprint is a short stable hash');
  const again = projectIdentity(repo);
  ok(again.fingerprint === identity.fingerprint, 'fingerprint is deterministic');
}

console.log('z-brain project: registry keeps ids stable');
{
  const repo = makeRepo('erp-app', 'https://github.com/acme/erp-app.git');
  const first = resolveProjectId(db, repo);
  const second = resolveProjectId(db, repo);
  ok(first === 'erp', 'legacy slug is preserved for a new repository');
  ok(second === first, 'repeat calls return the same id');
  const row = db.prepare('SELECT project_id, remote FROM project_registry WHERE root = ?').get(path.resolve(repo));
  ok(row && row.project_id === first, 'workspace is registered in the database');
  ok(row.remote === 'https://github.com/acme/erp-app.git', 'registry records the git remote');
}

console.log('z-brain project: clones share one id');
{
  const repo = makeRepo('clone-one', 'https://github.com/acme/shared.git');
  const clone = makeRepo('clone-two', 'https://github.com/acme/shared.git');
  const a = resolveProjectId(db, repo);
  const b = resolveProjectId(db, clone);
  ok(a === b, 'a clone with the same remote reuses the project id');
}

console.log('z-brain project: same folder name, different repositories');
{
  const repo = makeRepo('api', 'https://github.com/acme/one.git');
  const other = makeRepo('nested/api', 'https://github.com/acme/two.git');
  const first = resolveProjectId(db, repo);
  const second = resolveProjectId(db, other);
  ok(first === 'api', 'first repository keeps the readable slug');
  ok(second !== first, 'second repository does not inherit the first id');
  ok(second.startsWith('api-'), 'second repository gets a fingerprinted id');
}

console.log('z-brain project: legacy history is preserved');
{
  const repo = makeRepo('legacy-shop', 'https://github.com/acme/legacy-shop.git');
  const root = path.resolve(repo);
  db.prepare(`
    INSERT INTO file_index (project_id, workspace, path, mtime, size, hash, status, updated_at)
    VALUES ('legacy-shop', ?, 'src/index.js', 0, 0, NULL, 'clean', ?)
  `).run(root, new Date().toISOString());
  ok(resolveProjectId(db, repo) === 'legacy-shop', 'existing file_index rows keep their project id');
}

console.log('z-brain project: non-git workspaces');
{
  const one = path.join(tempDir, 'plain-one', 'source');
  const two = path.join(tempDir, 'plain-two', 'source');
  fs.mkdirSync(one, { recursive: true });
  fs.mkdirSync(two, { recursive: true });
  const a = resolveProjectId(db, one);
  const b = resolveProjectId(db, two);
  ok(a === 'global', 'generic folder names use the shared global bucket');
  ok(b === a, 'the global bucket is stable across generic folders');
}

closeDb();
fs.rmSync(tempDir, { recursive: true, force: true });
console.log(`\nz-brain project registry: ${passed} assertions passed`);
