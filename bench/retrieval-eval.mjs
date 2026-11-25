#!/usr/bin/env node
// Retrieval quality harness for z-brain.
// Fixture mode (default) seeds a labeled corpus into a temp DB and measures
// hit@k, recall@k, MRR, nDCG against the production search path. It also runs a
// raw-FTS5 baseline so ranking/tuning regressions are attributable.
// Live mode (--live) measures latency and empty-result rate on the real DB.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const FIXED_TS = "2026-01-15T00:00:00.000Z";
const K = 5;
const LATENCY_RUNS = 15;

const FLOORS = {
  hitAt3: 0.95,
  recallAt5: 0.9,
  mrr: 0.9,
  emptyRate: 0.05,
  p95Ms: 60,
};

const CORPUS = [
  { key: "erp-deadlock-refid", project: "erp", tags: ["db", "inventory"], question: "Database deadlock on RefId when saving goods receipt", answer: "Missing composite index on RefId and WarehouseId", gotcha_fix: "Add composite index and retry SaveChanges inside a transaction" },
  { key: "erp-deadlock-orderid", project: "erp", tags: ["db", "orders"], question: "Database deadlock on OrderId during batch approval", answer: "Two sessions lock header and lines in reverse order", gotcha_fix: "Order lock acquisition by ascending Id and use UPDLOCK hint" },
  { key: "erp-stock-negative", project: "erp", tags: ["inventory"], question: "Inventory quantity goes negative after stock reservation", answer: "Reservation decrements on-hand without checking available", gotcha_fix: "Check reserved quantity before decrement and add a non-negative constraint" },
  { key: "erp-stock-ledger-drift", project: "erp", tags: ["inventory", "ledger"], question: "Tồn kho lệch giữa kho và sổ cái sau khi đồng bộ", answer: "Sync job writes stock but skips ledger entries", gotcha_fix: "Emit ledger entries in the same transaction as stock updates" },
  { key: "erp-goods-receipt", project: "erp", tags: ["inventory", "purchase"], question: "Phiếu nhập không cộng tồn kho khi duyệt", answer: "Approval handler only flips status", gotcha_fix: "Apply receipt lines to stock on approval and record lot numbers" },
  { key: "erp-order-cancel", project: "erp", tags: ["orders"], question: "CancelOrder leaves reserved stock locked", answer: "Cancellation skips reservation release", gotcha_fix: "Release reservations before setting status to Cancelled" },
  { key: "erp-order-rounding", project: "erp", tags: ["orders", "money"], question: "Order total differs by 0.01 after discount rounding", answer: "Discount and tax rounded separately", gotcha_fix: "Round once at the end using decimal and MidpointRounding.AwayFromZero" },
  { key: "erp-vat-rounding", project: "erp", tags: ["invoice", "money"], question: "VAT rounding mismatch between invoice and ledger", answer: "Invoice prints per-line tax, ledger stores header tax", gotcha_fix: "Compute tax per line and sum for the ledger total" },
  { key: "erp-sqlite-wal", project: "erp", tags: ["sqlite", "concurrency"], question: "SQLite WAL mode lock contention when two agents write", answer: "Two processes write without busy timeout", gotcha_fix: "Set busy_timeout and keep transactions short" },
  { key: "erp-sqlite-busy", project: "erp", tags: ["sqlite"], question: "SQLITE_BUSY on concurrent harvest writes", answer: "Write batch holds the write lock too long", gotcha_fix: "Batch writes in transactions of 400 with exponential jitter retry" },
  { key: "erp-efcore-nplus1", project: "erp", tags: ["dotnet", "efcore"], question: "EF Core N+1 queries on Order lines", answer: "Lazy loading enabled on the lines navigation", gotcha_fix: "Use Include or projection and disable lazy loading" },
  { key: "erp-efcore-stale", project: "erp", tags: ["dotnet", "efcore"], question: "EF Core change tracker returns stale entity", answer: "Context is long lived and tracked values are cached", gotcha_fix: "Query with AsNoTracking for reads and use a scoped context" },
  { key: "erp-wpf-freeze", project: "erp", tags: ["wpf"], question: "WPF binding freezes UI on large collection", answer: "ObservableCollection without virtualization raises change storms", gotcha_fix: "Enable row virtualization and use VirtualizingStackPanel" },
  { key: "erp-devexpress-grid", project: "erp", tags: ["winforms", "devexpress"], question: "DevExpress grid loses selection after refresh", answer: "Refresh rebuilds the data source without BeginUpdate", gotcha_fix: "Wrap refresh in BeginUpdate and EndUpdate and restore the key selection" },
  { key: "erp-winforms-dpi", project: "erp", tags: ["winforms"], question: "WinForms form scaled wrong on 150% DPI", answer: "AutoScaleMode is Font while layout uses pixels", gotcha_fix: "Set AutoScaleMode to Dpi and enable per-monitor DPI awareness" },
  { key: "erp-cs0246", project: "erp", tags: ["build"], question: "MSBuild error CS0246 missing IPrinter reference", answer: "Project reference dropped when the file moved", gotcha_fix: "Add the IPrinter project reference and restore packages" },
  { key: "erp-nu1603", project: "erp", tags: ["build", "nuget"], question: "NU1603 package version downgrade warning", answer: "Resolved version is older than the requested minimum", gotcha_fix: "Pin the package version centrally and update the transitive dependency" },
  { key: "erp-jwt-expiry", project: "erp", tags: ["auth"], question: "JWT expires during long invoice print", answer: "Token lifetime is shorter than the print batch", gotcha_fix: "Refresh the token before batch print and add a refresh token flow" },
  { key: "erp-redis-lock", project: "erp", tags: ["concurrency", "redis"], question: "Redis distributed lock released by another node", answer: "Lock release does not compare the owner token", gotcha_fix: "Compare the ownership token with a Lua script before deleting the key" },
  { key: "erp-barcode", project: "erp", tags: ["inventory", "ui"], question: "Barcode scanner double-enters quantity", answer: "Scanner sends Enter and the handler also submits", gotcha_fix: "Debounce scanner input and ignore the trailing Enter key" },
  { key: "erp-print-invoice", project: "erp", tags: ["invoice", "printing"], question: "Invoice printer cuts off footer on A5 paper", answer: "Page margins assume A4 height", gotcha_fix: "Set A5 page size and recalculate margins before printing" },
  { key: "erp-timezone", project: "erp", tags: ["reports"], question: "DateTime stored as local time breaks reports", answer: "Values are stored without UTC conversion", gotcha_fix: "Store DateTime in UTC and convert at the presentation layer" },
  { key: "erp-money-float", project: "erp", tags: ["money"], question: "Money stored as float loses precision", answer: "Float columns round beyond two decimals", gotcha_fix: "Use decimal(18,2) and never float for currency" },
  { key: "erp-multitenant", project: "erp", tags: ["security"], question: "Tenant filter missing on raw SQL query", answer: "Global query filter does not apply to raw SQL", gotcha_fix: "Append the tenant predicate to every raw SQL statement" },
  { key: "erp-audit-trail", project: "erp", tags: ["db", "audit"], question: "Audit log misses deletes because trigger disabled", answer: "Sync migration dropped the delete trigger", gotcha_fix: "Recreate the delete trigger and assert it exists at startup" },
  { key: "erp-i18n-pdf", project: "erp", tags: ["invoice", "i18n"], question: "Tiếng Việt bị lỗi font khi xuất PDF", answer: "PDF export uses a font without Vietnamese glyphs", gotcha_fix: "Embed a Unicode font with Vietnamese coverage" },
  { key: "erp-bg-email", project: "erp", tags: ["jobs"], question: "Background job retries duplicate invoice email", answer: "Retry is not idempotent", gotcha_fix: "Deduplicate by invoice id and store a sent marker" },
  { key: "erp-warehouse-transfer", project: "erp", tags: ["inventory", "ledger"], question: "Warehouse transfer does not create ledger entries", answer: "Transfer moves stock without two-sided ledger postings", gotcha_fix: "Post debit and credit ledger entries in the transfer transaction" },
  { key: "erp-permission-cache", project: "erp", tags: ["security", "auth"], question: "Role permission cache not invalidated after change", answer: "Cache key ignores the role version", gotcha_fix: "Include a role version in the cache key and bump it on change" },
  { key: "erp-excel-import", project: "erp", tags: ["import"], question: "Excel import skips rows with merged cells", answer: "Reader treats merged cells as empty", gotcha_fix: "Forward-fill merged values before validating rows" },
  { key: "brain-fts-hyphen", project: "global", tags: ["search"], question: "FTS5 search returns nothing for hyphenated query", answer: "Hyphen is parsed as a column filter by FTS5", gotcha_fix: "Strip punctuation and expand hyphenated terms before MATCH" },
  { key: "brain-synonym-vn", project: "global", tags: ["search", "i18n"], question: "Tồn kho query misses inventory atoms", answer: "Query uses Vietnamese while atoms are English", gotcha_fix: "Expand synonyms across languages before searching" },
  { key: "brain-dedupe", project: "global", tags: ["harvest"], question: "Harvest creates duplicate atoms for reworded questions", answer: "Dedupe compares only a 45 character prefix", gotcha_fix: "Compare normalized question similarity before inserting" },
  { key: "brain-lease", project: "global", tags: ["observer"], question: "Two observers write at once after a crash", answer: "In-memory leader flag dies with the process", gotcha_fix: "Lease leadership in the database with a TTL and pid probe" },
  { key: "brain-schema", project: "global", tags: ["db"], question: "DB schema downgrade corrupts newer database", answer: "Older client opens a newer schema blindly", gotcha_fix: "Gate on PRAGMA user_version and refuse newer schemas" },
  { key: "brain-registry", project: "global", tags: ["observer"], question: "Same repo cloned twice gets different project ids", answer: "Project id derives from the folder name only", gotcha_fix: "Resolve identity from git remote and keep a project registry" },
  { key: "brain-spool", project: "global", tags: ["observer"], question: "Edits lost when hook crashes before DB write", answer: "Hook writes only to the database", gotcha_fix: "Append to a spool file first and replay it on next start" },
  { key: "brain-reconcile", project: "global", tags: ["observer"], question: "Deleted untracked file still listed in inventory", answer: "git status has no entry for a deleted untracked file", gotcha_fix: "Diff the index against git ls-files on every reconcile" },
  { key: "token-outline-multiline", project: "global", tags: ["outline"], question: "Outline misses multiline C# declarations", answer: "Regex only matches single-line signatures", gotcha_fix: "Parse declarations with a real syntax tree" },
  { key: "token-guard-grep", project: "global", tags: ["guard"], question: "Guard blocks grep -rn without a match limit", answer: "Unbounded recursive grep can flood the context", gotcha_fix: "Use grep -rn -m 5 or z-token search instead" },
  { key: "token-loop-state", project: "global", tags: ["guard"], question: "Loop breaker state lost between CLI invocations", answer: "Action hashes live only in process memory", gotcha_fix: "Persist hashes in the active session context" },
  { key: "token-build-errors", project: "global", tags: ["build"], question: "Build log condenser drops coded errors", answer: "Grouping keeps only warnings when the log is huge", gotcha_fix: "Always keep CS/NU error lines before grouping warnings" },
  { key: "gate-loc-inflation", project: "global", tags: ["gate"], question: "Gate blocks refactor because tests inflate LOC", answer: "LOC delta counts test files as production growth", gotcha_fix: "Exclude test and spec files from the LOC delta calculation" },
  { key: "gate-relative-import", project: "global", tags: ["gate"], question: "Gate breaks when z-brain is installed separately", answer: "Gate imports z-brain through a relative file path", gotcha_fix: "Resolve z-brain through the runtime service registry" },
  { key: "craft-cdn-offline", project: "global", tags: ["craft"], question: "Canvas preview blank offline because of Tailwind CDN", answer: "Preview depends on a remote stylesheet", gotcha_fix: "Bundle a local CSS reset and design tokens" },
  { key: "craft-slop-fp", project: "global", tags: ["craft"], question: "Anti-slop linter false positive on TSX fragments", answer: "Regex treats fragments as empty components", gotcha_fix: "Parse TSX with an AST before reporting slop" },
  { key: "host-qoder-hook", project: "global", tags: ["host"], question: "Qoder hook payload uses tool_name differently", answer: "Qoder sends search_replace tool names", gotcha_fix: "Normalize tool names per host in the adapter" },
  { key: "host-antigravity-hook", project: "global", tags: ["host"], question: "Antigravity sends toolCall args instead of tool_input", answer: "Payload nests arguments under toolCall.args", gotcha_fix: "Read both shapes and fall back to workspacePaths" },
  { key: "mind-erp-rules-leak", project: "global", tags: ["rules"], question: "ERP rules load in an unrelated project", answer: "Domain rules ship in the core rule pack", gotcha_fix: "Load ERP invariants only when the dlc-erp pack is active" },
  { key: "brain-mcp-timeout", project: "global", tags: ["mcp"], question: "MCP tool call times out on a large repo outline", answer: "Full outline walks node_modules", gotcha_fix: "Use git ls-files and cap the response size" },
];

const QUERIES = [
  { q: "database deadlock khi lưu phiếu nhập", project: "erp", expect: ["erp-deadlock-refid"] },
  { q: "deadlock order approval reverse lock order", project: "erp", expect: ["erp-deadlock-orderid"] },
  { q: "inventory negative after reservation", project: "erp", expect: ["erp-stock-negative"] },
  { q: "đồng bộ tồn kho lệch sổ cái", project: "erp", expect: ["erp-stock-ledger-drift", "erp-warehouse-transfer"] },
  { q: "phiếu nhập không cộng tồn kho khi duyệt", project: "erp", expect: ["erp-goods-receipt"] },
  { q: "cancel order still reserves stock", project: "erp", expect: ["erp-order-cancel"] },
  { q: "order total lệch 1 xu do làm tròn", project: "erp", expect: ["erp-order-rounding"] },
  { q: "VAT rounding invoice vs ledger", project: "erp", expect: ["erp-vat-rounding"] },
  { q: "sqlite wal lock contention two agents", project: "erp", expect: ["erp-sqlite-wal"] },
  { q: "SQLITE_BUSY concurrent writes retry", project: "erp", expect: ["erp-sqlite-busy"] },
  { q: "EF Core N+1 order lines", project: "erp", expect: ["erp-efcore-nplus1"] },
  { q: "EF Core stale entity AsNoTracking", project: "erp", expect: ["erp-efcore-stale"] },
  { q: "WPF UI freeze large collection virtualization", project: "erp", expect: ["erp-wpf-freeze"] },
  { q: "DevExpress grid mất selection sau refresh", project: "erp", expect: ["erp-devexpress-grid"] },
  { q: "WinForms 150% DPI scaling wrong", project: "erp", expect: ["erp-winforms-dpi"] },
  { q: "CS0246 IPrinter not found", project: "erp", expect: ["erp-cs0246"] },
  { q: "NU1603 package downgrade warning", project: "erp", expect: ["erp-nu1603"] },
  { q: "JWT expires during invoice print", project: "erp", expect: ["erp-jwt-expiry"] },
  { q: "redis lock released by another node", project: "erp", expect: ["erp-redis-lock"] },
  { q: "barcode scanner nhập đúp số lượng", project: "erp", expect: ["erp-barcode"] },
  { q: "A5 invoice footer cut off", project: "erp", expect: ["erp-print-invoice"] },
  { q: "DateTime local time breaks reports", project: "erp", expect: ["erp-timezone"] },
  { q: "money float precision decimal", project: "erp", expect: ["erp-money-float"] },
  { q: "tenant filter raw SQL query", project: "erp", expect: ["erp-multitenant"] },
  { q: "audit log misses deletes trigger", project: "erp", expect: ["erp-audit-trail"] },
  { q: "tiếng Việt lỗi font PDF", project: "erp", expect: ["erp-i18n-pdf"] },
  { q: "background job duplicate invoice email", project: "erp", expect: ["erp-bg-email"] },
  { q: "warehouse transfer missing ledger entries", project: "erp", expect: ["erp-warehouse-transfer"] },
  { q: "permission cache stale after role change", project: "erp", expect: ["erp-permission-cache"] },
  { q: "excel import merged cells skipped", project: "erp", expect: ["erp-excel-import"] },
  { q: "hyphenated query FTS5 returns nothing", project: "global", expect: ["brain-fts-hyphen"] },
  { q: "tồn kho", project: "erp", expect: ["erp-stock-ledger-drift", "erp-goods-receipt"] },
  { q: "harvest duplicate reworded question", project: "global", expect: ["brain-dedupe"] },
  { q: "two observers write after crash lease", project: "global", expect: ["brain-lease"] },
  { q: "schema version downgrade newer database", project: "global", expect: ["brain-schema"] },
  { q: "clone repo different project id", project: "global", expect: ["brain-registry"] },
  { q: "hook crash spool replay edits", project: "global", expect: ["brain-spool"] },
  { q: "deleted file still in inventory", project: "global", expect: ["brain-reconcile"] },
  { q: "outline misses multiline declarations", project: "global", expect: ["token-outline-multiline"] },
  { q: "guard blocks grep without limit", project: "global", expect: ["token-guard-grep"] },
  { q: "loop breaker state between invocations", project: "global", expect: ["token-loop-state"] },
  { q: "build log drops coded errors", project: "global", expect: ["token-build-errors"] },
  { q: "gate blocks refactor tests inflate LOC", project: "global", expect: ["gate-loc-inflation"] },
  { q: "gate breaks z-brain installed separately", project: "global", expect: ["gate-relative-import"] },
  { q: "canvas blank offline tailwind cdn", project: "global", expect: ["craft-cdn-offline"] },
  { q: "anti-slop false positive TSX fragment", project: "global", expect: ["craft-slop-fp"] },
  { q: "Qoder hook tool_name payload", project: "global", expect: ["host-qoder-hook"] },
  { q: "Antigravity toolCall args hook", project: "global", expect: ["host-antigravity-hook"] },
  { q: "ERP rules loaded in unrelated project", project: "global", expect: ["mind-erp-rules-leak"] },
  { q: "MCP tool timeout large repo outline", project: "global", expect: ["brain-mcp-timeout"] },
];

// Paraphrases with little or no lexical overlap with the atom text.
// FTS5 is lexical, so these quantify the gap that embeddings would close.
// Informational only: not gated, because a lexical index cannot pass them.
const SEMANTIC_QUERIES = [
  { q: "hàng trong kho bị trừ hai lần khi quét mã vạch", project: "erp", expect: ["erp-barcode"] },
  { q: "huỷ đơn nhưng hàng vẫn bị giữ chỗ", project: "erp", expect: ["erp-order-cancel"] },
  { q: "tổng tiền đơn hàng bị lệch một đồng", project: "erp", expect: ["erp-order-rounding"] },
  { q: "hai luồng ghi cùng lúc thì một luồng bị khoá", project: "erp", expect: ["erp-sqlite-wal"] },
  { q: "giao diện bị treo khi hiển thị danh sách dài", project: "erp", expect: ["erp-wpf-freeze"] },
  { q: "bộ lọc theo công ty bị bỏ qua khi viết SQL tay", project: "erp", expect: ["erp-multitenant"] },
  { q: "trùng lặp ký ức khi nạp lại nội dung diễn đạt khác", project: "global", expect: ["brain-dedupe"] },
  { q: "lãnh đạo bị mất khi tiến trình chết", project: "global", expect: ["brain-lease"] },
];

const LIVE_QUERIES = [
  "database deadlock RefId goods receipt",
  "tồn kho âm khi giữ hàng",
  "phiếu nhập không cộng tồn kho",
  "SQLite WAL lock contention",
  "EF Core N+1 query",
  "WPF UI freeze virtualization",
  "DevExpress grid selection refresh",
  "JWT hết hạn khi in hoá đơn",
  "redis distributed lock owner",
  "DateTime UTC reports",
  "decimal money precision",
  "tenant filter raw SQL",
  "tiếng Việt lỗi font PDF",
  "leader lease observer crash",
  "project registry clone",
  "schema user_version downgrade",
  "outline multiline C#",
  "guard grep unbounded",
  "loop breaker repeated command",
  "tailwind cdn offline canvas",
];

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function score(ranked, expected, k) {
  const rel = new Set(expected);
  const top = ranked.slice(0, k);
  const hits = top.filter((id) => rel.has(id));
  const dcg = top.reduce((sum, id, i) => sum + (rel.has(id) ? 1 / Math.log2(i + 2) : 0), 0);
  const idealCount = Math.min(rel.size, k);
  let idcg = 0;
  for (let i = 0; i < idealCount; i++) idcg += 1 / Math.log2(i + 2);
  return {
    hitAt1: top[0] !== undefined && rel.has(top[0]) ? 1 : 0,
    hitAt3: top.slice(0, 3).some((id) => rel.has(id)) ? 1 : 0,
    hitAt5: hits.length > 0 ? 1 : 0,
    recallAt5: rel.size === 0 ? 0 : hits.length / rel.size,
    precisionAt5: top.length === 0 ? 0 : hits.length / top.length,
    mrr: hits.length === 0 ? 0 : 1 / (top.indexOf(hits[0]) + 1),
    ndcg: idcg === 0 ? 0 : dcg / idcg,
  };
}

function mean(rows, field) {
  if (rows.length === 0) return 0;
  return rows.reduce((sum, row) => sum + row[field], 0) / rows.length;
}

function evaluate(systemName, runQuery, queries, idByKey) {
  const rows = [];
  const misses = [];
  const rankErrors = [];
  const latencies = [];
  for (const item of queries) {
    const expected = item.expect.map((key) => idByKey.get(key));
    const started = performance.now();
    const ranked = runQuery(item);
    latencies.push(performance.now() - started);
    const metrics = score(ranked, expected, K);
    rows.push(metrics);
    if (metrics.hitAt5 === 0) {
      misses.push({ query: item.q, expect: item.expect, got: ranked.slice(0, K) });
    } else if (metrics.hitAt1 === 0) {
      const top1 = ranked[0] === undefined ? "(none)" : ranked[0];
      rankErrors.push({ query: item.q, expect: item.expect, top1 });
    }
  }
  return {
    system: systemName,
    queries: rows.length,
    hitAt1: mean(rows, "hitAt1"),
    hitAt3: mean(rows, "hitAt3"),
    hitAt5: mean(rows, "hitAt5"),
    recallAt5: mean(rows, "recallAt5"),
    precisionAt5: mean(rows, "precisionAt5"),
    mrr: mean(rows, "mrr"),
    ndcg: mean(rows, "ndcg"),
    emptyRate: misses.length / rows.length,
    p50Ms: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    misses,
    rankErrors,
  };
}

function reportTable(results) {
  const lines = [
    "| System | Hit@1 | Hit@3 | Hit@5 | Recall@5 | P@5 | MRR | nDCG@5 | Miss | p50 | p95 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
  ];
  for (const r of results) {
    lines.push(
      `| ${r.system} | ${pct(r.hitAt1)} | ${pct(r.hitAt3)} | ${pct(r.hitAt5)} | ${pct(r.recallAt5)} | ${pct(r.precisionAt5)} | ${r.mrr.toFixed(3)} | ${r.ndcg.toFixed(3)} | ${pct(r.emptyRate)} | ${r.p50Ms.toFixed(2)}ms | ${r.p95Ms.toFixed(2)}ms |`
    );
  }
  return lines;
}

async function runFixture({ writeReport }) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zbrain-retrieval-"));
  process.env.ZBRAIN_DB_PATH = path.join(tempDir, "brain.sqlite");
  process.env.ZBRAIN_WATCH = "0";

  const dbApi = await import("../plugins/z-brain/scripts/lib/db.mjs");
  const searchApi = await import("../plugins/z-brain/scripts/lib/search.mjs");
  const db = dbApi.getDb();

  const idByKey = new Map();
  for (const atom of CORPUS) {
    const id = dbApi.insertAtom(db, {
      project_id: atom.project,
      scope: atom.project === "global" ? "global" : "project",
      trust_level: "verified_fact",
      question: atom.question,
      answer: atom.answer,
      gotcha_fix: atom.gotcha_fix,
      tags: atom.tags,
      created_at: FIXED_TS,
      valid_from: FIXED_TS,
    });
    idByKey.set(atom.key, id);
  }

  const idByAtomId = new Map([...idByKey].map(([key, id]) => [id, key]));

  const hybrid = (item) =>
    searchApi
      .searchKnowledge({ query: item.q, project: item.project, limit: K })
      .map((row) => row.id);

  const ftsOnly = (item) => {
    const ftsQuery = searchApi.sanitizeFtsQuery(item.q);
    if (!ftsQuery) return [];
    const rows = db
      .prepare(
        `SELECT a.id FROM knowledge_fts f JOIN knowledge_atoms a ON a.id = f.rowid
         WHERE knowledge_fts MATCH ?
           AND (a.project_id = ? OR a.scope = 'global' OR a.project_id = 'global')
         ORDER BY f.rank ASC LIMIT ?`
      )
      .all(ftsQuery, item.project, K);
    return rows.map((row) => row.id);
  };

  for (const item of QUERIES) hybrid(item);
  for (const item of QUERIES) ftsOnly(item);
  for (const item of SEMANTIC_QUERIES) hybrid(item);

  const results = [
    evaluate("hybrid (production)", hybrid, QUERIES, idByKey),
    evaluate("raw FTS5", ftsOnly, QUERIES, idByKey),
  ];
  const [prod] = results;
  const semantic = [
    evaluate("hybrid (production)", hybrid, SEMANTIC_QUERIES, idByKey),
    evaluate("raw FTS5", ftsOnly, SEMANTIC_QUERIES, idByKey),
  ];

  const nameOf = (id) => idByAtomId.get(id) || `#${id}`;
  const failures = [];
  if (prod.hitAt3 < FLOORS.hitAt3) failures.push(`hit@3 ${pct(prod.hitAt3)} < floor ${pct(FLOORS.hitAt3)}`);
  if (prod.recallAt5 < FLOORS.recallAt5) failures.push(`recall@5 ${pct(prod.recallAt5)} < floor ${pct(FLOORS.recallAt5)}`);
  if (prod.mrr < FLOORS.mrr) failures.push(`MRR ${prod.mrr.toFixed(3)} < floor ${FLOORS.mrr}`);
  if (prod.emptyRate > FLOORS.emptyRate) failures.push(`miss rate ${pct(prod.emptyRate)} > ceiling ${pct(FLOORS.emptyRate)}`);
  if (prod.p95Ms > FLOORS.p95Ms) failures.push(`p95 ${prod.p95Ms.toFixed(2)}ms > ceiling ${FLOORS.p95Ms}ms`);

  const lift = (field) => (prod[field] - results[1][field]) * 100;
  const mrrLift = prod.mrr - results[1].mrr;

  console.log(`z-brain retrieval evaluation: ${CORPUS.length} atoms, ${QUERIES.length} labeled queries, k=${K}`);
  console.log("  lexical set (gated):");
  for (const r of results) {
    console.log(
      `    ${r.system.padEnd(22)} hit@1 ${pct(r.hitAt1)}  hit@3 ${pct(r.hitAt3)}  recall@5 ${pct(r.recallAt5)}  MRR ${r.mrr.toFixed(3)}  nDCG ${r.ndcg.toFixed(3)}  miss ${pct(r.emptyRate)}  p50 ${r.p50Ms.toFixed(2)}ms  p95 ${r.p95Ms.toFixed(2)}ms`
    );
  }
  console.log(`    ranking lift over raw FTS5: hit@3 ${lift("hitAt3").toFixed(1)}pp, recall@5 ${lift("recallAt5").toFixed(1)}pp, MRR ${mrrLift >= 0 ? "+" : ""}${mrrLift.toFixed(3)}`);
  if (prod.rankErrors.length > 0) {
    console.log("    ranking errors (relevant atom not at #1):");
    for (const rank of prod.rankErrors) {
      console.log(`      - "${rank.query}" expected [${rank.expect.join(", ")}] but #1 was [${nameOf(rank.top1)}]`);
    }
  }
  if (prod.misses.length > 0) {
    console.log("    misses (hybrid):");
    for (const miss of prod.misses) {
      const got = miss.got.map(nameOf).join(", ") || "(none)";
      console.log(`      - "${miss.query}" expected [${miss.expect.join(", ")}] got [${got}]`);
    }
  }

  console.log("  paraphrase set (informational, no lexical overlap):");
  for (const r of semantic) {
    console.log(
      `    ${r.system.padEnd(22)} hit@1 ${pct(r.hitAt1)}  hit@3 ${pct(r.hitAt3)}  recall@5 ${pct(r.recallAt5)}  MRR ${r.mrr.toFixed(3)}  miss ${pct(r.emptyRate)}`
    );
  }
  for (const miss of semantic[0].misses) {
    console.log(`      - miss "${miss.query}" expected [${miss.expect.join(", ")}]`);
  }

  const latencies = [];
  for (const item of QUERIES) {
    for (let i = 0; i < LATENCY_RUNS; i++) {
      const started = performance.now();
      hybrid(item);
      latencies.push(performance.now() - started);
    }
  }
  prod.p50Ms = percentile(latencies, 50);
  prod.p95Ms = percentile(latencies, 95);
  console.log(`  steady-state hybrid latency over ${latencies.length} runs: p50 ${prod.p50Ms.toFixed(2)}ms, p95 ${prod.p95Ms.toFixed(2)}ms`);

  if (writeReport) {
    const lines = ["# z-brain retrieval quality", ""];
    lines.push(`Generated ${new Date().toISOString()}`);
    lines.push(`Corpus: ${CORPUS.length} atoms (${CORPUS.filter((a) => a.project === "erp").length} erp, ${CORPUS.filter((a) => a.project === "global").length} global) | Labeled queries: ${QUERIES.length} | k=${K}`);
    lines.push("");
    lines.push("## Lexical set (gated regression)");
    lines.push("");
    lines.push(...reportTable(results));
    lines.push("");
    lines.push(`Ranking lift of the re-rank layer over raw FTS5: hit@3 ${lift("hitAt3").toFixed(1)}pp, recall@5 ${lift("recallAt5").toFixed(1)}pp, MRR ${mrrLift >= 0 ? "+" : ""}${mrrLift.toFixed(3)}.`);
    if (prod.rankErrors.length > 0) {
      lines.push("");
      lines.push("### Ranking errors (relevant atom present but not at #1)");
      lines.push("");
      for (const rank of prod.rankErrors) {
        lines.push(`- "${rank.query}" expected [${rank.expect.join(", ")}] but #1 was [${nameOf(rank.top1)}]`);
      }
    }
    if (prod.misses.length > 0) {
      lines.push("");
      lines.push("### Misses (not in top 5)");
      lines.push("");
      for (const miss of prod.misses) {
        lines.push(`- "${miss.query}" expected [${miss.expect.join(", ")}] got [${miss.got.map(nameOf).join(", ") || "(none)"}]`);
      }
    }
    lines.push("");
    lines.push("## Paraphrase set (cross-lingual / zero lexical overlap)");
    lines.push("");
    lines.push(...reportTable(semantic));
    lines.push("");
    lines.push("These queries express the same problem without reusing the atom's words. Raw FTS5 struggles on them; the bilingual concept + character-trigram TF-IDF fallback closes the recall gap without external embeddings.");
    lines.push("");
    lines.push("## Notes");
    lines.push("");
    lines.push("- `hybrid (production)` = `searchKnowledge()`: FTS5 BM25 with field weights (question 6x), LIKE fallback, and a zero-dependency bilingual EN<->VI concept + character-trigram TF-IDF cosine semantic fallback when FTS5 returns fewer than `limit` strong matches.");
    lines.push("- `raw FTS5` = same sanitized query, BM25 order only. The gap is the value of the re-rank layer; on unambiguous lexical queries both saturate, so the layer is a policy (scope/trust) rather than an accuracy gain.");
    lines.push("- Corpus holds near-duplicate distractors (deadlock on RefId vs OrderId, WAL vs SQLITE_BUSY) so ranking, not just matching, is measured.");
    lines.push("- Multi-relevance queries (e.g. stock drift + warehouse transfer) make recall@5 meaningful.");
    lines.push(`- Floors enforced by the test: hit@3 >= ${pct(FLOORS.hitAt3)}, recall@5 >= ${pct(FLOORS.recallAt5)}, MRR >= ${FLOORS.mrr}, miss <= ${pct(FLOORS.emptyRate)}, p95 <= ${FLOORS.p95Ms}ms.`);
    lines.push(`- Measured hybrid latency: p50 ${prod.p50Ms.toFixed(2)}ms, p95 ${prod.p95Ms.toFixed(2)}ms on this machine.`);
    fs.writeFileSync(path.join(here, "RETRIEVAL.md"), lines.join("\n") + "\n");
    fs.writeFileSync(
      path.join(here, "retrieval.json"),
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          corpus: CORPUS.length,
          queries: QUERIES.length,
          k: K,
          floors: FLOORS,
          results: results.map(({ misses, rankErrors, ...rest }) => rest),
          misses: prod.misses,
          rankingErrors: prod.rankErrors,
          paraphrase: semantic.map(({ misses, rankErrors, ...rest }) => rest),
          paraphraseMisses: semantic[0].misses,
        },
        null,
        2
      ) + "\n"
    );
  }

  dbApi.closeDb();
  fs.rmSync(tempDir, { recursive: true, force: true });

  if (failures.length > 0) {
    for (const failure of failures) console.error(`FAIL: ${failure}`);
    process.exit(1);
  }
  console.log("all retrieval floors met");
}

async function runLive() {
  const searchApi = await import("../plugins/z-brain/scripts/lib/search.mjs");
  const dbApi = await import("../plugins/z-brain/scripts/lib/db.mjs");
  const db = dbApi.getDb();
  console.log(`z-brain retrieval (live DB): ${dbApi.getDbPath ? dbApi.getDbPath() : "resolved default"}`);

  // Leave-one-out sanity: every atom is queried with its own question and must
  // rank itself first. Duplicate or noisy atoms show up as offenders.
  const allIds = db.prepare("SELECT id FROM knowledge_atoms ORDER BY id").all().map((row) => row.id);
  const step = Math.max(1, Math.floor(allIds.length / 200));
  const sampleIds = allIds.filter((_, index) => index % step === 0).slice(0, 200);
  const latencies = [];
  const offenders = [];
  let selfHit1 = 0;
  let selfHit5 = 0;
  let empty = 0;
  for (const id of sampleIds) {
    const atom = db.prepare("SELECT id, project_id, question FROM knowledge_atoms WHERE id = ?").get(id);
    if (!atom) continue;
    const started = performance.now();
    const rows = searchApi.searchKnowledge({ query: atom.question, project: atom.project_id, limit: K });
    latencies.push(performance.now() - started);
    if (rows.length === 0) empty += 1;
    const rank = rows.findIndex((row) => row.id === id);
    if (rank === 0) selfHit1 += 1;
    if (rank >= 0) selfHit5 += 1;
    if (rank !== 0) {
      offenders.push({ id, question: atom.question, top: rows[0] ? rows[0].question : "(none)" });
    }
  }
  const total = sampleIds.length;
  console.log(
    `  self-retrieval (${total} sampled atoms): hit@1 ${pct(selfHit1 / total)}, hit@5 ${pct(selfHit5 / total)}, empty ${pct(empty / total)}, p50 ${percentile(latencies, 50).toFixed(2)}ms, p95 ${percentile(latencies, 95).toFixed(2)}ms`
  );
  for (const bad of offenders.slice(0, 8)) {
    console.log(`    - #${bad.id} "${String(bad.question).slice(0, 60)}" -> "${String(bad.top).slice(0, 60)}"`);
  }
  if (offenders.length > 8) console.log(`    ... ${offenders.length - 8} more`);

  const probeLatencies = [];
  let probeEmpty = 0;
  for (const query of LIVE_QUERIES) {
    searchApi.searchKnowledge({ query, limit: K });
    const started = performance.now();
    const top = searchApi.searchKnowledge({ query, limit: K });
    probeLatencies.push(performance.now() - started);
    if (top.length === 0) probeEmpty += 1;
  }
  console.log(
    `  curated probes: ${LIVE_QUERIES.length} queries, empty ${pct(probeEmpty / LIVE_QUERIES.length)}, p50 ${percentile(probeLatencies, 50).toFixed(2)}ms, p95 ${percentile(probeLatencies, 95).toFixed(2)}ms`
  );
  dbApi.closeDb();
}

if (process.argv.includes("--live")) {
  await runLive();
} else {
  await runFixture({ writeReport: process.argv.includes("--report") });
}
