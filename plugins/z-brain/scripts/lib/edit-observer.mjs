/**
 * Automatic file edit history and inventory.
 *
 * Two capture paths feed the same store:
 *  1. Host hooks (`record`) for tool-level precision (Edit/Write delta + tool name).
 *  2. A workspace watcher plus git reconcile started by the MCP server, so hosts
 *     without hooks (or edits made while the host was closed) still get captured.
 *
 * The store is append-only `file_events` plus one row per file in `file_index`.
 * Writes are coalesced per session window, patches are capped and redacted, and
 * the hook falls back to a JSONL spool when SQLite is locked by the MCP server.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  getDbPath,
  getFileIndexEntry,
  upsertFileIndex,
  deleteFileIndexEntry,
  insertFileEvent,
  updateFileEvent,
  findCoalescibleEvent,
  listFileIndex,
  getMeta,
  setMeta,
  pruneFileEvents,
  resolveProjectId,
  transact,
} from './db.mjs';

import {
  MAX_INDEX_BYTES,
  countLines,
  gitHead,
  gitNumstat,
  gitStatusChanges,
  hashText,
  isIgnored,
  languageOf,
  listWorkspaceFiles,
  normalizeRel,
  readTextFile,
  resolveWorkspace,
  statFile,
  toWorkspaceRel,
} from './workspace.mjs';

import {
  DEFAULT_LEASE_TTL_MS,
  acquireLease,
  defaultOwner,
  leaseStatus,
  releaseLease,
} from './leader.mjs';

const COALESCE_WINDOW_MS = 120000;
const PATCH_CAP = 4096;
const MAX_EVENTS_PER_RECONCILE = 200;
const MAX_SPOOL_LINES = 5000;
const RETENTION_INTERVAL_MS = 86400000;
const FULL_SWEEP_MS = 10 * 60 * 1000;
const LEASE_TTL_MS = DEFAULT_LEASE_TTL_MS;
const LEASE_RENEW_MS = 30000;
const WRITE_BATCH = 400;

const FILE_KEYS = [
  'file_path', 'filePath', 'path', 'Path', 'absolute_path', 'absolutePath',
  'target_file', 'targetFile', 'filename', 'fileName', 'file',
];
const CONTENT_KEYS = ['content', 'Content', 'new_string', 'newString', 'new_str', 'replacement', 'text', 'newCode', 'code_edit'];
const OLD_KEYS = ['old_string', 'oldString', 'old_str', 'original', 'oldText'];

const SECRET_RULES = [
  [/(api[_-]?key|secret|token|password|passwd|pwd|authorization|client[_-]?secret)(\s*[:=]\s*)(['"]?)([^\s'"]{4,})/gi, '$1$2$3[REDACTED]'],
  [/(bearer\s+)[A-Za-z0-9._~+\/-]{8,}=*/gi, '$1[REDACTED]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]'],
  [/\b(sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,})/g, '[REDACTED]'],
  [/((?:server|data source|host)=[^;\n]*?;\s*(?:password|pwd)=)[^;\n]+/gi, '$1[REDACTED]'],
];

const observerState = { started: false, watchers: new Map(), timer: null, leader: false, lease: null, leaseKey: null, leaseTimer: null, owner: null };

export function redactText(input) {
  if (!input) return { text: input || '', redacted: false };
  let text = String(input);
  for (const [source, replacement] of SECRET_RULES) {
    const re = new RegExp(source.source, source.flags);
    text = text.replace(re, replacement);
  }
  return { text, redacted: text !== String(input) };
}

function truncate(text, max = 1500) {
  if (!text) return '';
  const str = String(text);
  return str.length <= max ? str : `${str.slice(0, max)}\n... [truncated]`;
}

function parseInput(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function pickValue(input, keys) {
  for (const key of keys) {
    if (typeof input[key] === 'string' && input[key]) return input[key];
  }
  if (input.args && typeof input.args === 'object') return pickValue(input.args, keys);
  return '';
}

export function normalizeHookEvent(raw = {}, env = process.env) {
  const tool = raw.tool_name || raw.toolName || raw.toolCall?.name || raw.function_call?.name || env.QODER_TOOL_NAME || '';
  const input = parseInput(raw.tool_input || raw.toolCall?.args || raw.arguments || raw.args || raw.input);
  const filePath = pickValue(input, FILE_KEYS) || env.QODER_TOOL_INPUT_FILE_PATH || '';
  const content = pickValue(input, CONTENT_KEYS);
  const oldString = pickValue(input, OLD_KEYS);

  let edits = [];
  const editList = Array.isArray(input.edits) ? input.edits : (Array.isArray(input.edits_list) ? input.edits_list : null);
  if (editList) {
    edits = editList
      .map((e) => ({
        old: e.old_string || e.oldString || e.old_str || e.oldText || '',
        next: e.new_string || e.newString || e.new_str || e.newText || e.content || '',
      }))
      .filter((e) => e.old || e.next);
  }

  return {
    host: env.QODER_SESSION_ID || env.QODER_CWD ? 'qoder'
      : (raw.toolCall || raw.workspacePaths ? 'antigravity'
        : (raw.hook_event_name || env.CLAUDE_SESSION_ID ? 'claude' : 'generic')),
    tool,
    filePath,
    content,
    oldString,
    edits,
    sessionId: raw.session_id || raw.sessionId || raw.conversationId
      || env.QODER_SESSION_ID || env.CLAUDE_SESSION_ID || env.CODEX_SESSION_ID || env.GEMINI_SESSION_ID
      || 'default',
    cwd: raw.cwd || raw.workspacePaths?.[0] || env.QODER_CWD || env.CLAUDE_PROJECT_DIR || env.CODEX_CWD || process.cwd(),
  };
}

function buildPatch(normalized) {
  const hunks = [];
  let added = 0;
  let removed = 0;

  for (const edit of normalized.edits) {
    hunks.push(`-${truncate(edit.old)}\n+${truncate(edit.next)}`);
    added += countLines(edit.next);
    removed += countLines(edit.old);
  }

  if (hunks.length === 0 && normalized.oldString && normalized.content) {
    hunks.push(`-${truncate(normalized.oldString)}\n+${truncate(normalized.content)}`);
    added = countLines(normalized.content);
    removed = countLines(normalized.oldString);
  }

  // A full-file Write is not stored: it duplicates the file and can leak secrets.
  if (hunks.length === 0 && normalized.content) {
    added = countLines(normalized.content);
  }

  const raw = hunks.join('\n---\n').slice(0, PATCH_CAP);
  const clean = redactText(raw);
  return { patch: clean.text || null, redacted: clean.redacted, added, removed };
}

function mergePatches(existing, next) {
  const merged = [existing, next].filter(Boolean).join('\n---\n');
  return merged.length <= PATCH_CAP ? merged : merged.slice(merged.length - PATCH_CAP);
}

export function spoolPath() {
  if (process.env.ZBRAIN_SPOOL_DIR) return path.join(process.env.ZBRAIN_SPOOL_DIR, 'edits.jsonl');
  return path.join(path.dirname(getDbPath()), 'spool', 'edits.jsonl');
}

function isObserverInternal(absPath) {
  const resolved = path.resolve(absPath);
  for (const dir of [path.dirname(getDbPath()), path.dirname(spoolPath())]) {
    const base = path.resolve(dir);
    if (resolved === base || resolved.startsWith(`${base}${path.sep}`)) return true;
  }
  return false;
}

export function appendSpool(event) {
  try {
    const file = spoolPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let lines = [];
    try {
      lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
    } catch {}
    lines.push(JSON.stringify(event));
    if (lines.length > MAX_SPOOL_LINES) lines = lines.slice(lines.length - MAX_SPOOL_LINES);
    fs.writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}

export function flushSpool(db, { limit = 500 } = {}) {
  const file = spoolPath();
  let lines = [];
  try {
    lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return { flushed: 0, remaining: 0 };
  }
  if (lines.length === 0) return { flushed: 0, remaining: 0 };

  const failures = [];
  let flushed = 0;
  const batch = lines.slice(0, limit);
  try {
    transact(db, () => {
      for (const line of batch) {
        const ev = JSON.parse(line);
        if (ev.path) insertFileEvent(db, ev);
        flushed++;
      }
    });
  } catch {
    // A malformed line aborts the batch; retry line by line so one bad event
    // does not block the rest of the spool.
    flushed = 0;
    for (const line of batch) {
      try {
        const ev = JSON.parse(line);
        transact(db, () => {
          if (ev.path) insertFileEvent(db, ev);
        });
        flushed++;
      } catch {
        failures.push(line);
      }
    }
  }
  const rest = lines.slice(limit);
  const remaining = [...failures, ...rest];
  try {
    if (remaining.length === 0) fs.unlinkSync(file);
    else fs.writeFileSync(file, `${remaining.join('\n')}\n`, 'utf8');
  } catch {}

  applyRetention(db);
  return { flushed, remaining: remaining.length };
}

export function applyRetention(db, { force = false } = {}) {
  const last = getMeta(db, 'observer:last_prune');
  if (!force && last && Date.now() - new Date(last).getTime() < RETENTION_INTERVAL_MS) return null;
  const result = pruneFileEvents(db);
  setMeta(db, 'observer:last_prune', new Date().toISOString());
  try {
    db.exec('PRAGMA optimize;');
  } catch {}
  return result;
}

function resolveTarget(normalized, db) {
  const root = resolveWorkspace(normalized.cwd);
  const abs = path.isAbsolute(normalized.filePath)
    ? normalized.filePath
    : path.resolve(root, normalized.filePath);
  const rel = toWorkspaceRel(root, abs) || normalizeRel(normalized.filePath);
  return { root, abs, rel, project: resolveProjectId(db, root) };
}

export function recordEdit(db, normalized, { source = 'hook', now = new Date() } = {}) {
  if (!normalized.filePath) return { skipped: 'no-file' };
  const { root, abs, rel, project } = resolveTarget(normalized, db);
  if (!rel || isIgnored(rel)) return { skipped: 'ignored' };
  if (isObserverInternal(abs)) return { skipped: 'internal' };

  const existing = getFileIndexEntry(db, root, rel);
  const st = statFile(abs);
  const text = st && st.size <= MAX_INDEX_BYTES ? readTextFile(abs) : null;
  if (st && st.size <= MAX_INDEX_BYTES && text === null) return { skipped: 'binary-or-unreadable' };

  const op = !st ? 'delete' : (existing ? 'update' : 'create');
  const newHash = text != null ? hashText(text) : null;
  const oldHash = existing ? existing.hash : null;

  if (op !== 'delete' && oldHash && newHash && oldHash === newHash) {
    if (st) {
      upsertFileIndex(db, {
        project_id: project, workspace: root, path: rel,
        mtime: st.mtimeMs, size: st.size, hash: newHash,
        lang: languageOf(rel), status: 'clean',
      });
    }
    return { skipped: 'unchanged', path: rel };
  }

  const built = buildPatch(normalized);
  let linesAdded = built.added;
  let linesRemoved = built.removed;
  if (op === 'create' && linesAdded === 0 && text) linesAdded = countLines(text);
  if (op === 'delete') {
    linesAdded = 0;
    linesRemoved = 0;
  }

  const event = {
    project_id: project,
    workspace: root,
    session_id: normalized.sessionId || 'default',
    path: rel,
    op,
    tool: normalized.tool || null,
    source,
    lines_added: linesAdded,
    lines_removed: linesRemoved,
    old_hash: oldHash,
    new_hash: newHash,
    patch: built.patch,
    redacted: built.redacted,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  try {
    return transact(db, () => {
      const sinceIso = new Date(now.getTime() - COALESCE_WINDOW_MS).toISOString();
      let eventId;
      if (op !== 'delete') {
        const prior = findCoalescibleEvent(db, {
          workspace: root, path: rel, session_id: event.session_id, source, op, sinceIso,
        });
        if (prior) {
          eventId = prior.id;
          updateFileEvent(db, prior.id, {
            lines_added: Number(prior.lines_added || 0) + linesAdded,
            lines_removed: Number(prior.lines_removed || 0) + linesRemoved,
            new_hash: newHash,
            patch: mergePatches(prior.patch, built.patch),
            redacted: Boolean(prior.redacted) || built.redacted,
            updated_at: event.updated_at,
          });
          event.coalesced = true;
        } else {
          eventId = insertFileEvent(db, event);
        }
      } else {
        eventId = insertFileEvent(db, event);
      }

      if (op === 'delete') {
        deleteFileIndexEntry(db, root, rel);
      } else if (st) {
        upsertFileIndex(db, {
          project_id: project, workspace: root, path: rel,
          mtime: st.mtimeMs, size: st.size, hash: newHash,
          lang: languageOf(rel), status: 'clean',
          last_event_id: eventId, updated_at: event.updated_at,
        });
      }
      return { path: rel, op, eventId, coalesced: Boolean(event.coalesced), redacted: built.redacted };
    });
  } catch (err) {
    // SQLite locked by another process: keep the event, flush on the next MCP call.
    appendSpool(event);
    return { path: rel, op, spooled: true, error: err.message };
  }
}

export function recordHookInput(db, raw, { env = process.env } = {}) {
  return recordEdit(db, normalizeHookEvent(raw, env), { source: 'hook' });
}

const indexEntry = (project, root, rel, st, hash, status = 'clean') => ({
  project_id: project, workspace: root, path: rel,
  mtime: st.mtimeMs, size: st.size, hash,
  lang: languageOf(rel), status,
});

function applyIndexWrites(db, writes) {
  for (let i = 0; i < writes.length; i += WRITE_BATCH) {
    const batch = writes.slice(i, i + WRITE_BATCH);
    transact(db, () => {
      for (const entry of batch) upsertFileIndex(db, entry);
    });
  }
}

function applyIndexDeletes(db, root, deletes) {
  for (let i = 0; i < deletes.length; i += WRITE_BATCH) {
    const batch = deletes.slice(i, i + WRITE_BATCH);
    transact(db, () => {
      for (const rel of batch) deleteFileIndexEntry(db, root, rel);
    });
  }
}

function applyEvents(db, events, { emit, project, root, sessionId, nowIso }) {
  if (!emit || events.length === 0) return;
  if (events.length > MAX_EVENTS_PER_RECONCILE) {
    transact(db, () => insertFileEvent(db, {
      project_id: project, workspace: root, session_id: sessionId,
      path: '.', op: 'bulk', tool: null, source: 'reconcile',
      patch: `Bulk change: ${events.length} file(s)`, created_at: nowIso,
    }));
    return;
  }
  for (let i = 0; i < events.length; i += WRITE_BATCH) {
    const batch = events.slice(i, i + WRITE_BATCH);
    transact(db, () => {
      for (const ev of batch) {
        insertFileEvent(db, {
          project_id: project, workspace: root, session_id: sessionId,
          source: 'reconcile', ...ev, patch: null, created_at: nowIso,
        });
      }
    });
  }
}

function scanIncremental(db, { root, project, budgetMs, maxFiles, startedAt }) {
  const statusChanges = gitStatusChanges(root);
  if (!statusChanges) return null;
  const events = [];
  const indexWrites = [];
  const indexDeletes = [];
  let numstat = null;
  const diffOf = (rel) => (numstat ??= gitNumstat(root)).get(rel) || { added: 0, removed: 0 };
  let timedOut = false;
  let skipped = 0;

  for (const [rel, kind] of statusChanges) {
    if (Date.now() - startedAt > budgetMs) {
      timedOut = true;
      break;
    }
    const abs = path.join(root, rel);
    if (isObserverInternal(abs)) continue;
    const prev = getFileIndexEntry(db, root, rel);
    const st = kind === 'deleted' ? null : statFile(abs);

    if (!st) {
      if (!prev) continue;
      events.push({
        path: rel, op: 'delete', old_hash: prev.hash, new_hash: null,
        lines_added: 0, lines_removed: 0,
      });
      indexDeletes.push(rel);
      continue;
    }

    if (st.size > MAX_INDEX_BYTES) {
      indexWrites.push(indexEntry(project, root, rel, st, null, 'skipped-large'));
      continue;
    }

    const text = readTextFile(abs);
    const hash = text != null ? hashText(text) : null;
    if (!prev) {
      events.push({
        path: rel, op: 'create', old_hash: null, new_hash: hash,
        lines_added: text ? countLines(text) : 0, lines_removed: 0,
      });
      indexWrites.push(indexEntry(project, root, rel, st, hash));
      continue;
    }
    if (prev.hash && hash && prev.hash === hash) {
      if (Math.abs(prev.mtime - st.mtimeMs) > 5 || prev.size !== st.size) {
        indexWrites.push(indexEntry(project, root, rel, st, hash));
      }
      skipped++;
      continue;
    }

    const diff = diffOf(rel);
    events.push({
      path: rel, op: 'update', old_hash: prev.hash, new_hash: hash,
      lines_added: diff.added, lines_removed: diff.removed,
    });
    indexWrites.push(indexEntry(project, root, rel, st, hash));
  }

  // Untracked files deleted since the last pass leave no git status entry, so
  // reconcile the index against the current file list to catch them.
  if (!timedOut) {
    const listed = listWorkspaceFiles(root, { limit: maxFiles });
    if (!listed.truncated) {
      const present = new Set(listed.files);
      const removed = new Set(indexDeletes);
      for (const prev of listFileIndex(db, { workspace: root, limit: maxFiles + 1000 })) {
        if (present.has(prev.path) || removed.has(prev.path) || isIgnored(prev.path)) continue;
        events.push({
          path: prev.path, op: 'delete', old_hash: prev.hash, new_hash: null,
          lines_added: 0, lines_removed: 0,
        });
        indexDeletes.push(prev.path);
      }
    }
  }

  return { events, indexWrites, indexDeletes, timedOut, skipped, source: 'git-status' };
}

function scanFull(db, { root, project, baselineDone, budgetMs, maxFiles, startedAt }) {
  const listed = listWorkspaceFiles(root, { limit: maxFiles });
  const indexed = listFileIndex(db, { workspace: root, limit: maxFiles + 1000 });
  const prevMap = new Map(indexed.map((row) => [row.path, row]));
  const exists = new Set();
  const events = [];
  const indexWrites = [];
  const indexDeletes = [];
  const numstat = baselineDone ? gitNumstat(root) : new Map();
  let timedOut = false;
  let skipped = 0;

  for (const rel of listed.files) {
    if (Date.now() - startedAt > budgetMs) {
      timedOut = true;
      break;
    }
    const abs = path.join(root, rel);
    if (isObserverInternal(abs)) continue;
    const st = statFile(abs);
    if (!st) continue;
    exists.add(rel);

    if (st.size > MAX_INDEX_BYTES) {
      indexWrites.push(indexEntry(project, root, rel, st, null, 'skipped-large'));
      continue;
    }

    const prev = prevMap.get(rel);
    if (!baselineDone) {
      indexWrites.push(indexEntry(project, root, rel, st, null));
      continue;
    }
    if (!prev) {
      const text = readTextFile(abs);
      const hash = text != null ? hashText(text) : null;
      events.push({
        path: rel, op: 'create', old_hash: null, new_hash: hash,
        lines_added: text ? countLines(text) : 0, lines_removed: 0,
      });
      indexWrites.push(indexEntry(project, root, rel, st, hash));
      continue;
    }

    const mtimeChanged = Math.abs(prev.mtime - st.mtimeMs) > 5;
    const sizeChanged = prev.size !== st.size;
    if (!mtimeChanged && !sizeChanged) {
      skipped++;
      continue;
    }

    const text = readTextFile(abs);
    const hash = text != null ? hashText(text) : null;
    if (prev.hash && hash && prev.hash === hash) {
      indexWrites.push(indexEntry(project, root, rel, st, hash));
      skipped++;
      continue;
    }

    const diff = numstat.get(rel) || { added: 0, removed: 0 };
    events.push({
      path: rel, op: 'update', old_hash: prev.hash, new_hash: hash,
      lines_added: diff.added, lines_removed: diff.removed,
    });
    indexWrites.push(indexEntry(project, root, rel, st, hash));
  }

  if (baselineDone) {
    for (const prev of indexed) {
      if (exists.has(prev.path) || isIgnored(prev.path)) continue;
      events.push({
        path: prev.path, op: 'delete', old_hash: prev.hash, new_hash: null,
        lines_added: 0, lines_removed: 0,
      });
      indexDeletes.push(prev.path);
    }
  }

  return {
    events, indexWrites, indexDeletes, timedOut, skipped,
    source: listed.source,
    indexedCount: listed.files.length,
    truncated: listed.truncated,
  };
}

export function reconcile(db, {
  cwd = process.cwd(),
  sessionId = 'reconcile',
  budgetMs = 1500,
  maxFiles = 20000,
  emit = true,
  forceFull = false,
} = {}) {
  const root = resolveWorkspace(cwd);
  const project = resolveProjectId(db, root);
  const rootKey = hashText(root);
  const baselineKey = `baseline:${rootKey}`;
  const baselineDone = Boolean(getMeta(db, baselineKey));
  const startedAt = Date.now();

  const lastFull = getMeta(db, `last_full:${rootKey}`);
  const head = gitHead(root);
  const headMoved = baselineDone && (getMeta(db, `head:${rootKey}`) || 'none') !== (head || 'none');
  const fullSweep = forceFull || !baselineDone || headMoved
    || !lastFull || Date.now() - new Date(lastFull).getTime() > FULL_SWEEP_MS;

  const scanOptions = { root, project, baselineDone, budgetMs, maxFiles, startedAt };
  const scan = (fullSweep ? scanFull : scanIncremental)(db, scanOptions)
    || scanFull(db, scanOptions);

  const nowIso = new Date().toISOString();
  applyEvents(db, scan.events, { emit, project, root, sessionId, nowIso });
  applyIndexWrites(db, scan.indexWrites);
  applyIndexDeletes(db, root, scan.indexDeletes);

  if (!baselineDone) {
    if (!scan.timedOut && !scan.truncated) {
      setMeta(db, baselineKey, nowIso);
      setMeta(db, `last_full:${rootKey}`, nowIso);
      setMeta(db, `head:${rootKey}`, head || 'none');
    }
    setMeta(db, `last_reconcile:${rootKey}`, nowIso);
    return {
      baseline: true,
      mode: 'full',
      indexed: scan.indexedCount,
      partial: scan.timedOut || Boolean(scan.truncated),
      source: scan.source,
      durationMs: Date.now() - startedAt,
    };
  }

  setMeta(db, `last_reconcile:${rootKey}`, nowIso);
  if (fullSweep && !scan.timedOut) {
    setMeta(db, `last_full:${rootKey}`, nowIso);
    setMeta(db, `head:${rootKey}`, head || 'none');
  }

  return {
    baseline: false,
    mode: fullSweep ? 'full' : 'incremental',
    changes: {
      created: scan.events.filter((e) => e.op === 'create').length,
      updated: scan.events.filter((e) => e.op === 'update').length,
      deleted: scan.events.filter((e) => e.op === 'delete').length,
      total: scan.events.length,
    },
    skipped: scan.skipped,
    partial: scan.timedOut || Boolean(scan.truncated),
    source: scan.source,
    durationMs: Date.now() - startedAt,
  };
}

export function maybeReconcile(db, { cwd = process.cwd(), intervalMs = 60000, ...opts } = {}) {
  const root = resolveWorkspace(cwd);
  const last = getMeta(db, `last_reconcile:${hashText(root)}`);
  if (last && Date.now() - new Date(last).getTime() < intervalMs) return { skipped: true };
  return reconcile(db, { cwd: root, ...opts });
}

function recordWatchedPath(db, { root, rel, sessionId }) {
  const existing = getFileIndexEntry(db, root, rel);
  const abs = path.join(root, rel);
  if (isObserverInternal(abs)) return;
  const st = statFile(abs);
  const nowIso = new Date().toISOString();
  const project = resolveProjectId(db, root);

  if (!st) {
    if (!existing) return;
    transact(db, () => {
      insertFileEvent(db, {
        project_id: project, workspace: root, session_id: sessionId,
        path: rel, op: 'delete', source: 'watch', old_hash: existing.hash,
        created_at: nowIso,
      });
      deleteFileIndexEntry(db, root, rel);
    });
    return;
  }
  if (st.size > MAX_INDEX_BYTES) return;

  const text = readTextFile(abs);
  if (text === null) return;
  const hash = hashText(text);

  if (existing && existing.hash === hash) {
    if (Math.abs(existing.mtime - st.mtimeMs) > 5 || existing.size !== st.size) {
      upsertFileIndex(db, {
        project_id: project, workspace: root, path: rel,
        mtime: st.mtimeMs, size: st.size, hash, lang: languageOf(rel), status: 'clean',
      });
    }
    return;
  }

  transact(db, () => {
    const eventId = insertFileEvent(db, {
      project_id: project, workspace: root, session_id: sessionId,
      path: rel, op: existing ? 'update' : 'create', source: 'watch',
      old_hash: existing ? existing.hash : null, new_hash: hash,
      created_at: nowIso,
    });
    upsertFileIndex(db, {
      project_id: project, workspace: root, path: rel,
      mtime: st.mtimeMs, size: st.size, hash, lang: languageOf(rel),
      status: 'clean', last_event_id: eventId,
    });
  });
}

export function startWatcher(db, { cwd = process.cwd(), debounceMs = 500, sessionId = 'watch' } = {}) {
  if (process.env.ZBRAIN_OBSERVER === '0' || process.env.ZBRAIN_WATCH === '0') return null;
  const root = resolveWorkspace(cwd);
  if (observerState.watchers.has(root)) return observerState.watchers.get(root);

  const state = { root, pending: new Set(), mode: 'watch', watcher: null, timer: null, pollTimer: null };
  const flush = () => {
    const paths = [...state.pending].slice(0, 100);
    state.pending.clear();
    for (const rel of paths) {
      try {
        recordWatchedPath(db, { root, rel, sessionId });
      } catch {}
    }
  };
  const schedule = () => {
    clearTimeout(state.timer);
    state.timer = setTimeout(flush, debounceMs);
    state.timer.unref?.();
  };

  try {
    state.watcher = fs.watch(root, { recursive: true, persistent: false }, (_event, filename) => {
      if (!filename) return;
      const rel = normalizeRel(filename);
      if (!rel || isIgnored(rel)) return;
      if (isObserverInternal(path.join(root, rel))) return;
      state.pending.add(rel);
      schedule();
    });
    state.watcher.on?.('error', () => {});
  } catch {
    state.mode = 'poll';
    state.pollTimer = setInterval(() => {
      try {
        maybeReconcile(db, { cwd: root, intervalMs: 120000, budgetMs: 1000 });
      } catch {}
    }, 120000);
    state.pollTimer.unref?.();
  }

  const stop = () => {
    clearTimeout(state.timer);
    clearInterval(state.pollTimer);
    try {
      state.watcher?.close();
    } catch {}
    observerState.watchers.delete(root);
  };
  state.stop = stop;
  observerState.watchers.set(root, state);
  return state;
}

export function ensureObserver(db, { cwd = process.cwd(), watch = true } = {}) {
  const root = resolveWorkspace(cwd);
  if (observerState.started) return observerState;
  observerState.started = true;
  observerState.owner = defaultOwner();
  observerState.leaseKey = `observer:${hashText(root)}`;

  const becomeLeader = () => {
    if (observerState.leader) return;
    observerState.leader = true;
    try {
      flushSpool(db);
    } catch {}
    if (watch) {
      try {
        startWatcher(db, { cwd: root });
      } catch {}
    }
    observerState.timer = setTimeout(() => {
      try {
        maybeReconcile(db, { cwd: root, intervalMs: 15000, budgetMs: 2000 });
      } catch {}
    }, 50);
    observerState.timer.unref?.();
  };

  const stepDown = () => {
    observerState.leader = false;
    clearTimeout(observerState.timer);
    observerState.timer = null;
    try {
      observerState.watchers.get(root)?.stop?.();
    } catch {}
  };

  observerState.lease = acquireLease(db, observerState.leaseKey, {
    owner: observerState.owner, ttlMs: LEASE_TTL_MS,
  });
  if (observerState.lease.leader) becomeLeader();

  observerState.leaseTimer = setInterval(() => {
    try {
      const lease = acquireLease(db, observerState.leaseKey, {
        owner: observerState.owner, ttlMs: LEASE_TTL_MS,
      });
      if (lease.leader) {
        if (!observerState.leader) becomeLeader();
      } else if (observerState.leader) {
        stepDown();
      }
    } catch {}
  }, LEASE_RENEW_MS);
  observerState.leaseTimer.unref?.();

  process.once('exit', () => {
    try {
      releaseLease(db, observerState.leaseKey, { owner: observerState.owner });
    } catch {}
  });

  return observerState;
}

export function getObserverStatus(db, { cwd = process.cwd() } = {}) {
  const root = resolveWorkspace(cwd);
  const state = observerState.watchers.get(root);
  const lease = observerState.leaseKey
    ? leaseStatus(db, observerState.leaseKey)
    : { owner: null, expiresAt: 0, active: false };
  return {
    workspace: root,
    mode: state ? state.mode : (observerState.started ? 'idle' : 'stopped'),
    leader: observerState.leader,
    leaseOwner: lease.owner,
    leaseExpiresAt: lease.expiresAt ? new Date(lease.expiresAt).toISOString() : null,
    baseline: Boolean(getMeta(db, `baseline:${hashText(root)}`)),
    lastReconcile: getMeta(db, `last_reconcile:${hashText(root)}`),
    spoolFile: spoolPath(),
    spoolPending: (() => {
      try {
        return fs.readFileSync(spoolPath(), 'utf8').split('\n').filter(Boolean).length;
      } catch {
        return 0;
      }
    })(),
  };
}
