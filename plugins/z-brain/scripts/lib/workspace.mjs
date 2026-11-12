/**
 * Workspace resolution, ignore rules and file listing shared by the observer.
 * Git-first: `git ls-files` is far cheaper than walking node_modules and already
 * honours .gitignore. The recursive walk is only a fallback for non-git folders.
 */

import cp from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const MAX_INDEX_BYTES = 2 * 1024 * 1024;

const IGNORED_DIRS = new Set([
  'node_modules', '.git', '.hg', '.svn', '.z-plugin', '.zero-craft',
  '.qoder', '.agents', '.codex', '.gemini', '.claude', '.cursor',
  '.vs', '.idea', '.vscode', '.next', '.nuxt', '.angular', '.svelte-kit',
  '.output', '.gradle', '.terraform', '__pycache__', '.venv', 'venv',
  'dist', 'build', 'out', 'coverage', '.nyc_output', 'TestResults',
  'artifacts', 'obj', 'target',
]);

const IGNORED_FILE_RE = /(^|\/)(\.env(\..*)?|\.npmrc|\.netrc|.*\.(pem|key|p12|pfx|sqlite|sqlite3|sqlite-wal|sqlite-shm|db|db-wal|db-shm|log|lock|snap|map|min\.js))$/i;
const LOCKFILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'composer.lock', 'Cargo.lock', 'poetry.lock']);

const LANG_BY_EXT = {
  '.ts': 'typescript', '.tsx': 'typescript', '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.rb': 'ruby',
  '.go': 'go', '.rs': 'rust', '.java': 'java', '.kt': 'kotlin', '.cs': 'csharp',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.h': 'c', '.hpp': 'cpp', '.c': 'c',
  '.php': 'php', '.swift': 'swift', '.dart': 'dart', '.scala': 'scala',
  '.sh': 'shell', '.bash': 'shell', '.ps1': 'powershell', '.psm1': 'powershell',
  '.sql': 'sql', '.vue': 'vue', '.svelte': 'svelte', '.html': 'html',
  '.css': 'css', '.scss': 'scss', '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml',
  '.md': 'markdown', '.toml': 'toml', '.xml': 'xml', '.xaml': 'xaml',
};

const rootCache = new Map();
const originCache = new Map();
const ORIGIN_TTL_MS = 5 * 60 * 1000;

function git(root, args, { timeout = 3000, maxBuffer = 64 * 1024 * 1024 } = {}) {
  return cp.execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    maxBuffer,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

export function resolveWorkspace(cwd = process.cwd()) {
  const base = process.env.Z_PLUGIN_WORKSPACE || process.env.ZBRAIN_WORKSPACE || cwd || process.cwd();
  const key = path.resolve(base);
  if (rootCache.has(key)) return rootCache.get(key);

  let root = key;
  try {
    const top = git(key, ['rev-parse', '--show-toplevel'], { timeout: 1500 }).trim();
    if (top) root = path.resolve(top);
  } catch {}

  rootCache.set(key, root);
  rootCache.set(root, root);
  return root;
}

export function gitOrigin(root) {
  const key = path.resolve(root);
  const cached = originCache.get(key);
  if (cached && Date.now() - cached.at < ORIGIN_TTL_MS) return cached.remote;
  let remote = null;
  try {
    remote = git(key, ['config', '--get', 'remote.origin.url'], { timeout: 1500, maxBuffer: 1024 * 1024 }).trim() || null;
  } catch {}
  originCache.set(key, { remote, at: Date.now() });
  return remote;
}

export function gitHead(root) {
  try {
    return git(root, ['rev-parse', 'HEAD'], { timeout: 1500, maxBuffer: 1024 * 1024 }).trim() || null;
  } catch {
    return null;
  }
}

// Working-tree delta, O(changes) instead of O(files). Returns null outside git.
export function gitStatusChanges(root) {
  let out;
  try {
    out = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--no-renames']);
  } catch {
    return null;
  }
  const changes = new Map();
  for (const entry of out.split('\0')) {
    if (entry.length < 4) continue;
    const code = entry.slice(0, 2);
    const rel = normalizeRel(entry.slice(3));
    if (!rel || isIgnored(rel)) continue;
    changes.set(rel, code.includes('D') ? 'deleted' : 'changed');
  }
  return changes;
}

// Stable project identity: the slug keeps legacy history readable, the fingerprint
// separates unrelated repositories that happen to share a folder name.
export function projectIdentity(root) {
  const resolved = path.resolve(root);
  const remote = gitOrigin(resolved);
  const base = path.basename(resolved).toLowerCase().replace(/[^a-z0-9_-]/g, '_');
  let slug;
  if (!base || ['repos', 'source', 'desktop', 'documents', 'c', 'e'].includes(base)) slug = 'global';
  else if (base.includes('erp')) slug = 'erp';
  else if (base.includes('zero_universe') || base.includes('zerouniverse')) slug = 'zero_universe';
  else if (base.includes('z-plugin') || base.includes('zplugin')) slug = 'z-plugin';
  else slug = base;
  const fingerprint = crypto.createHash('sha1')
    .update(remote ? `remote:${remote.toLowerCase()}` : `path:${resolved.toLowerCase()}`)
    .digest('hex')
    .slice(0, 6);
  return { root: resolved, remote, slug, fingerprint };
}

export function normalizeRel(relPath) {
  return String(relPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isIgnored(relPath) {
  const rel = normalizeRel(relPath);
  if (!rel || rel.startsWith('../')) return true;
  const parts = rel.split('/');
  for (const part of parts.slice(0, -1)) {
    if (IGNORED_DIRS.has(part)) return true;
  }
  const name = parts[parts.length - 1];
  if (LOCKFILES.has(name)) return true;
  return IGNORED_FILE_RE.test(rel);
}

export function isWithin(root, absPath) {
  const rel = path.relative(path.resolve(root), path.resolve(absPath));
  return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel);
}

export function hashText(text) {
  return crypto.createHash('sha1').update(text, 'utf8').digest('hex').slice(0, 16);
}

export function statFile(absPath) {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile()) return null;
    return st;
  } catch {
    return null;
  }
}

export function readTextFile(absPath, maxBytes = MAX_INDEX_BYTES) {
  try {
    const st = fs.statSync(absPath);
    if (!st.isFile() || st.size > maxBytes) return null;
    const buf = fs.readFileSync(absPath);
    if (buf.includes(0)) return null;
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

export function languageOf(relPath) {
  const base = path.basename(relPath).toLowerCase();
  if (base === 'dockerfile') return 'docker';
  if (base === 'makefile') return 'make';
  return LANG_BY_EXT[path.extname(base)] || null;
}

export function countLines(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

export function resolvePath(root, relOrAbs) {
  if (!relOrAbs) return null;
  const abs = path.isAbsolute(relOrAbs) ? relOrAbs : path.join(root, relOrAbs);
  return path.resolve(abs);
}

export function toWorkspaceRel(root, absPath) {
  if (!absPath) return null;
  const rel = path.relative(path.resolve(root), path.resolve(absPath));
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return normalizeRel(rel);
}

export function listWorkspaceFiles(root, { limit = 20000, timeoutMs = 4000 } = {}) {
  try {
    const out = cp.execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const files = out.split('\0').filter(Boolean).map(normalizeRel).filter((p) => !isIgnored(p));
    return { files: files.slice(0, limit), truncated: files.length > limit, source: 'git' };
  } catch {}

  const files = [];
  const stack = [''];
  while (stack.length > 0 && files.length < limit) {
    const relDir = stack.pop();
    let entries = [];
    try {
      entries = fs.readdirSync(path.join(root, relDir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (isIgnored(rel)) continue;
      if (entry.isDirectory()) {
        stack.push(rel);
      } else if (entry.isFile()) {
        files.push(rel);
        if (files.length >= limit) break;
      }
    }
  }
  return { files, truncated: files.length >= limit, source: 'walk' };
}

export function gitNumstat(root) {
  const map = new Map();
  const run = (args) => {
    try {
      return cp.execFileSync('git', args, {
        cwd: root,
        encoding: 'utf8',
        timeout: 3000,
        maxBuffer: 16 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      return '';
    }
  };
  let out = run(['diff', '--numstat', 'HEAD']);
  if (!out) out = run(['diff', '--numstat']);
  for (const line of out.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [added, removed, ...rest] = line.split('\t');
    const file = normalizeRel(rest.join('\t'));
    if (!file) continue;
    const a = Number.parseInt(added, 10);
    const d = Number.parseInt(removed, 10);
    map.set(file, { added: Number.isFinite(a) ? a : 0, removed: Number.isFinite(d) ? d : 0 });
  }
  return map;
}
