/**
 * Pre-flight brief: compact, pre-edit context for a single file.
 *
 * Combines the z-token call graph (optional), z-brain edit churn/gotchas and
 * z-mind invariants (optional) into a hard-capped brief (~300 tokens default).
 * Every external surface is optional: a missing plugin degrades to a shorter
 * brief instead of failing the host.
 */

import fs from 'node:fs';
import path from 'node:path';

import {
  getFileHistory,
  getRecentFileEvents,
  getFileIndexEntry,
  getKnowledgeByFile,
} from './db.mjs';
import {
  normalizeRel,
  resolvePath,
  languageOf,
  readTextFile,
  toWorkspaceRel,
} from './workspace.mjs';

const DAY = 86400000;
const DEFAULT_BUDGET = 300;
const LANG_RULE = {
  cs: 'R_CS', fs: 'R_CS', vb: 'R_CS',
  ts: 'R_NODE', js: 'R_NODE', mjs: 'R_NODE', cjs: 'R_NODE',
  tsx: 'R_REACT', jsx: 'R_REACT', vue: 'R_REACT', svelte: 'R_REACT',
  py: 'R_PY', go: 'R_GO', php: 'R_PHP', rs: 'R_RUST',
  cpp: 'R_CPP', cc: 'R_CPP', cxx: 'R_CPP', h: 'R_CPP', hpp: 'R_CPP',
  java: 'R_API', kt: 'R_ANDROID', sql: 'R_DB',
};

const TEST_PATH_RE = new RegExp(
  '(^|/)(__tests__|tests?|specs?)(/|$)'
  + '|(^|/)[^/]+[._-](test|spec)\\.[a-z0-9]+$'
  + '|(^|/)[A-Za-z0-9_]+(Test|Tests|Spec)\\.(cs|java|kt|fs)$'
  + '|(^|/)test_[^/]+\\.py$',
  'i'
);

function isTestPath(file) {
  return TEST_PATH_RE.test(String(file || ''));
}

async function optionalImport(relativeUrl) {
  try {
    return await import(new URL(relativeUrl, import.meta.url).href);
  } catch {
    return null;
  }
}

function oneLine(value, max) {
  const text = String(value || '').replace(/[\r\n]+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function ago(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const seconds = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function capLines(lines, maxChars) {
  const out = [];
  let used = 0;
  for (const line of lines) {
    const cost = line.length + 1;
    if (used + cost > maxChars) {
      const footer = '… (brief capped; raise budget for more)';
      if (out.length > 0 && used + footer.length + 1 <= maxChars) out.push(footer);
      break;
    }
    out.push(line);
    used += cost;
  }
  return out.join('\n');
}

function pickSymbols(fileSymbols, requested) {
  if (requested) return [String(requested).trim()].filter(Boolean);
  const candidates = (fileSymbols || [])
    .filter((s) => ['type', 'func', 'method'].includes(s.kind) && !String(s.name).startsWith('_'));
  const types = candidates.filter((s) => s.kind === 'type');
  const rest = candidates.filter((s) => s.kind !== 'type');
  return [...types, ...rest].slice(0, 3);
}

function graphLines(workspace, sourceOk, fileSymbols, tokenApi, requested, maxSymbols) {
  if (!sourceOk) return { lines: ['Graph: file not readable (missing, binary, or larger than 2MB)'], tests: [] };
  if (!tokenApi?.getBlastRadius) return { lines: ['Graph: unavailable (z-token not installed)'], tests: [] };
  const cacheDir = path.join(workspace, '.z-plugin', 'cache', 'symbols');
  if (!fs.existsSync(cacheDir)) {
    return {
      lines: ['Graph: not indexed — call z-token symbol_cache(action:"index") for blast radius'],
      tests: [],
    };
  }

  const symbols = pickSymbols(fileSymbols, requested);
  if (symbols.length === 0) return { lines: ['Graph: no extractable symbols in this file'], tests: [] };

  const rows = [];
  const tests = new Set();
  for (const sym of symbols.slice(0, maxSymbols)) {
    let radius = null;
    try {
      radius = tokenApi.getBlastRadius(workspace, sym.name, { maxDepth: 1 });
    } catch {}
    if (!radius || radius.error) continue;
    const defining = new Set(radius.definingFiles || []);
    const files = new Set([...defining, ...(radius.impactedFiles || [])]);
    for (const file of files) {
      if (!defining.has(file) && isTestPath(file)) tests.add(file);
    }
    rows.push({
      name: sym.name,
      inDegree: radius.inDegree || 0,
      files: files.size,
      risk: radius.riskScore || 0,
      god: Boolean(radius.isGodNode),
    });
  }
  if (rows.length === 0) return { lines: ['Graph: no blast radius available'], tests: [] };

  rows.sort((a, b) => b.risk - a.risk || b.inDegree - a.inDegree);
  if (rows.every((r) => r.inDegree === 0 && r.files === 0)) {
    return {
      lines: [`Graph: no callers indexed for ${rows.map((r) => r.name).join(', ')} — z-token symbol_cache(action:"index") may help`],
      tests: [],
    };
  }
  const parts = rows.slice(0, 2).map((r) => {
    if (r.inDegree === 0 && r.files === 0) return `${r.name} {no callers indexed}`;
    return `${r.name} {callers:${r.inDegree}, files:${r.files}, risk:${r.risk}${r.god ? ', GOD' : ''}}`;
  });
  return { lines: [`Graph: ${parts.join('; ')}`], tests: [...tests].sort() };
}

function churnLines(history) {
  if (history.length === 0) return ['Churn: no recorded edits (observer may not be hooked)'];
  const cutoff = Date.now() - 30 * DAY;
  let edits = 0;
  let added = 0;
  let removed = 0;
  for (const ev of history) {
    if (Date.parse(ev.created_at) < cutoff) continue;
    edits += 1;
    added += Number(ev.lines_added) || 0;
    removed += Number(ev.lines_removed) || 0;
  }
  const lines = [
    `Churn: ${plural(edits, 'edit')}/30d · +${added}/-${removed} · last ${ago(history[0].created_at) || 'unknown'}`,
  ];
  const recent = history.slice(0, 2).map((ev) => (
    `${ago(ev.created_at)} ${ev.op === 'create' ? '+' : (ev.op === 'delete' ? '-' : '~')}`
    + ` +${Number(ev.lines_added) || 0}/-${Number(ev.lines_removed) || 0} [${ev.tool || ev.source || 'watcher'}]`
  ));
  lines.push(`Recent: ${recent.join('; ')}`);
  return lines;
}

function coEditLine(db, workspace, rel, history) {
  const sessions = new Set(
    history.slice(0, 6).map((ev) => ev.session_id).filter((id) => id && id !== 'default')
  );
  if (sessions.size === 0) return null;
  const counts = new Map();
  for (const ev of getRecentFileEvents(db, { workspace, limit: 300 })) {
    if (!sessions.has(ev.session_id) || ev.path === rel || ev.op === 'delete') continue;
    counts.set(ev.path, (counts.get(ev.path) || 0) + 1);
  }
  if (counts.size === 0) return null;
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return `Co-edited: ${top.map(([file, n]) => `${oneLine(file, 70)} (${n})`).join(', ')}`;
}

function knowledgeLines(db, rel, project) {
  const { atoms, observations } = getKnowledgeByFile(db, rel, { limit: 5 });
  const ranked = atoms
    .filter((a) => (project && project !== 'global') ? (a.project_id === project || a.project_id === 'global') : true)
    .sort((a, b) => (b.trust_level === 'verified_fact') - (a.trust_level === 'verified_fact'));
  const lines = [];
  for (const atom of ranked.slice(0, 2)) {
    const trust = atom.trust_level === 'verified_fact' ? 'FACT' : (atom.trust_level === 'observation' ? 'OBS' : 'HYP');
    const body = atom.gotcha_fix || atom.question || atom.answer;
    lines.push(`Gotcha: [#${atom.id} ${trust}] ${oneLine(body, 150)}`);
  }
  if (lines.length === 0) {
    for (const obs of observations.slice(0, 1)) {
      lines.push(`Decision: [${obs.type || 'obs'}] ${oneLine(obs.title, 120)}`);
    }
  }
  return lines;
}

function invariantLine(mindApi, rel) {
  if (!mindApi?.ENGINEERING_RULES) return null;
  const ext = path.extname(rel).slice(1).toLowerCase();
  const code = LANG_RULE[ext];
  if (!code) return null;
  const rule = mindApi.ENGINEERING_RULES[code];
  if (!rule) return null;
  const summary = String(rule.summary || rule.title || '');
  const firstSentence = summary.split(/(?<=\.)\s/)[0] || summary;
  return `Invariant [${code}]: ${oneLine(firstSentence, 160)}`;
}

export async function buildPreflight({
  db,
  workspace,
  file,
  symbol = null,
  project = null,
  budget = DEFAULT_BUDGET,
  maxSymbols = 2,
} = {}) {
  const started = Date.now();
  const root = path.resolve(workspace || process.cwd());
  const requested = normalizeRel(file);
  const abs = resolvePath(root, requested);
  const rel = (abs && toWorkspaceRel(root, abs)) || requested;
  const safeBudget = Math.min(800, Math.max(60, Number(budget) || DEFAULT_BUDGET));
  const maxChars = safeBudget * 4;
  const safeMaxSymbols = Math.min(3, Math.max(1, Number(maxSymbols) || 2));

  const entry = getFileIndexEntry(db, root, rel);
  const history = getFileHistory(db, { workspace: root, file: rel, limit: 200 });
  const source = abs ? readTextFile(abs) : null;
  const tokenApi = source ? await optionalImport('../../../z-token/scripts/lib/symbol-cache.mjs') : null;
  const mindApi = await optionalImport('../../../z-mind/scripts/lib/rules.mjs');
  const fileSymbols = (source && tokenApi?.extractFileSymbols) ? tokenApi.extractFileSymbols(source) : [];

  const info = [
    entry?.lang || languageOf(rel) || path.extname(rel).slice(1) || 'unknown',
    source ? plural(fileSymbols.length || entry?.symbol_count || 0, 'symbol') : null,
    entry ? `inventory:${entry.status || 'clean'}` : 'inventory:untracked',
  ].filter(Boolean).join(' · ');

  const lines = [`[Z-BRAIN PREFLIGHT] ${rel} · ${info}`];
  lines.push(...churnLines(history));
  const graph = graphLines(root, Boolean(source), fileSymbols, tokenApi, symbol, safeMaxSymbols);
  lines.push(...graph.lines);
  if (graph.tests.length > 0) {
    const shown = graph.tests.slice(0, 3);
    const more = graph.tests.length > shown.length ? ` (+${graph.tests.length - shown.length})` : '';
    lines.push(`Tests: ${shown.join(', ')}${more}`);
  }
  const coEdit = coEditLine(db, root, rel, history);
  if (coEdit) lines.push(coEdit);
  lines.push(...knowledgeLines(db, rel, project));
  const invariant = invariantLine(mindApi, rel);
  if (invariant) lines.push(invariant);

  const text = capLines(lines, maxChars);
  return {
    text,
    stats: {
      file: rel,
      edits: history.length,
      symbols: fileSymbols.length || entry?.symbol_count || 0,
      chars: text.length,
      tokens: Math.ceil(text.length / 4),
      budget: safeBudget,
      durationMs: Date.now() - started,
    },
  };
}
