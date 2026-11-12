// Test suite for the z-brain Pre-flight Brief.
// Verifies churn, call-graph blast radius, co-edits, gotchas, invariants,
// the hard token cap, and graceful degradation without z-token cache.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  ok  ', msg);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zbrain-preflight-'));
const repo = path.join(tempDir, 'repo');
fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
fs.writeFileSync(
  path.join(repo, 'src', 'order.ts'),
  [
    'export function helper(value: number): number {',
    '  return value + 1;',
    '}',
    '',
    'export class OrderService {',
    '  process(id: number): number {',
    '    return helper(id);',
    '  }',
    '}',
    '',
  ].join('\n'),
  'utf8'
);
fs.writeFileSync(
  path.join(repo, 'src', 'app.ts'),
  [
    'import { helper } from "./order";',
    '',
    'export function main(): number {',
    '  return helper(2);',
    '}',
    '',
  ].join('\n'),
  'utf8'
);
fs.writeFileSync(
  path.join(repo, 'src', 'order.test.ts'),
  [
    'import { helper } from "./order";',
    '',
    'export function testHelper(): number {',
    '  return helper(1);',
    '}',
    '',
  ].join('\n'),
  'utf8'
);

process.env.ZBRAIN_DB_PATH = path.join(tempDir, 'data', 'zbrain.sqlite');
process.env.ZBRAIN_SPOOL_DIR = path.join(tempDir, 'spool');
process.env.ZBRAIN_WATCH = '0';
process.env.ZBRAIN_WORKSPACE = repo;

const dbApi = await import('../plugins/z-brain/scripts/lib/db.mjs');
const workspaceApi = await import('../plugins/z-brain/scripts/lib/workspace.mjs');
const { buildPreflight } = await import('../plugins/z-brain/scripts/lib/preflight.mjs');
const { harvestKnowledge } = await import('../plugins/z-brain/scripts/lib/harvest.mjs');
const tokenApi = await import('../plugins/z-token/scripts/lib/symbol-cache.mjs');

const db = dbApi.getDb();
const root = workspaceApi.resolveWorkspace(repo);

console.log('z-brain preflight: fixture');
const indexed = tokenApi.indexWorkspace(repo);
ok(indexed.indexedFiles >= 2, `symbol cache indexed ${indexed.indexedFiles} files`);
ok(tokenApi.getCallers(repo, 'helper').some((c) => c.caller === 'main'), 'call graph knows main -> helper');

const now = new Date().toISOString();
for (let i = 0; i < 3; i++) {
  dbApi.insertFileEvent(db, {
    project_id: 'preflight-test',
    workspace: root,
    session_id: 'session-a',
    path: 'src/order.ts',
    op: 'update',
    tool: 'Edit',
    source: 'hook',
    lines_added: 4 + i,
    lines_removed: 1,
    created_at: new Date(Date.now() - i * 3600000).toISOString(),
  });
}
dbApi.insertFileEvent(db, {
  project_id: 'preflight-test',
  workspace: root,
  session_id: 'session-a',
  path: 'src/app.ts',
  op: 'update',
  tool: 'Write',
  source: 'hook',
  lines_added: 2,
  lines_removed: 0,
  created_at: now,
});
dbApi.upsertFileIndex(db, {
  project_id: 'preflight-test',
  workspace: root,
  path: 'src/order.ts',
  mtime: fs.statSync(path.join(repo, 'src', 'order.ts')).mtimeMs,
  size: fs.statSync(path.join(repo, 'src', 'order.ts')).size,
  lang: 'typescript',
  symbol_count: 3,
  status: 'clean',
});
harvestKnowledge({
  input: 'Order total drift | helper truncated decimals | use cent-based rounding before helper',
  project: 'preflight-test',
  tags: ['types', 'rounding'],
  trust_level: 'verified_fact',
  files_touched: ['src/order.ts'],
});

console.log('z-brain preflight: brief content');
const brief = await buildPreflight({ db, workspace: root, file: 'src/order.ts' });
const text = brief.text;
ok(text.includes('[Z-BRAIN PREFLIGHT] src/order.ts'), 'header identifies the file');
ok(text.includes('typescript'), 'header reports language from index');
ok(text.includes('Churn: 3 edits/30d'), 'churn counts the seeded edits');
ok(text.includes('Recent:'), 'recent edit deltas are included');
ok(/Graph: .*callers:[1-9]/.test(text), 'call graph reports an upstream caller');
ok(text.includes('helper'), 'graph names the impacted symbol');
ok(text.includes('src/app.ts'), 'co-edited file is detected from the shared session');
ok(text.includes('Tests: src/order.test.ts'), 'impacted test file is selected from the call graph');
ok(text.includes('Gotcha: [#1 FACT]'), 'verified gotcha is surfaced');
ok(text.includes('cent-based rounding'), 'gotcha body is included');
ok(text.includes('Invariant [R_NODE]'), 'language invariant is included');
ok(text.length <= 300 * 4, `default brief stays within 1200 chars (actual ${text.length})`);
ok(brief.stats.tokens <= 300, `default brief stays within 300 estimated tokens (actual ${brief.stats.tokens})`);
ok(brief.stats.durationMs < 1000, `brief builds quickly (${brief.stats.durationMs}ms)`);

console.log('z-brain preflight: budget + degradation');
const small = await buildPreflight({ db, workspace: root, file: 'src/order.ts', budget: 60 });
ok(small.text.length <= 60 * 4, `budget=60 caps the brief (actual ${small.text.length} chars)`);
ok(small.text.includes('[Z-BRAIN PREFLIGHT]'), 'header survives a small budget');

const missing = await buildPreflight({ db, workspace: root, file: 'src/missing.ts' });
ok(missing.text.includes('not readable'), 'missing file degrades without throwing');

const bare = path.join(tempDir, 'bare');
fs.mkdirSync(path.join(bare, 'src'), { recursive: true });
fs.writeFileSync(path.join(bare, 'src', 'bare.ts'), 'export function alone() { return 1; }\n', 'utf8');
const noCache = await buildPreflight({ db, workspace: bare, file: 'src/bare.ts' });
ok(noCache.text.includes('symbol_cache(action:"index")'), 'missing cache suggests indexing');
ok(!noCache.text.includes('[ERROR]'), 'missing cache does not fail the brief');

console.log('z-brain preflight: MCP zbrain_impact brief');
const server = path.resolve(here, '..', 'plugins', 'z-brain', 'scripts', 'mcp-server.mjs');
const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
  { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'zbrain_impact', arguments: { file: 'src/order.ts', brief: true } } },
].map((r) => JSON.stringify(r)).join('\n') + '\n';
const raw = cp.execFileSync(process.execPath, [server], {
  input: requests,
  encoding: 'utf8',
  timeout: 20000,
  env: { ...process.env, ZBRAIN_DB_PATH: process.env.ZBRAIN_DB_PATH, Z_PLUGIN_WORKSPACE: repo },
});
const responses = raw.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const toolsList = responses.find((r) => r.id === 2)?.result?.tools || [];
const impactTool = toolsList.find((t) => t.name === 'zbrain_impact');
ok(Boolean(impactTool?.inputSchema?.properties?.brief), 'zbrain_impact exposes the brief option');
const mcpBrief = responses.find((r) => r.id === 3)?.result?.content?.[0]?.text || '';
ok(mcpBrief.includes('[Z-BRAIN PREFLIGHT]'), 'MCP returns the pre-flight brief');
ok(/callers:[1-9]/.test(mcpBrief), 'MCP brief includes blast radius');

console.log('z-brain preflight: all assertions passed');
