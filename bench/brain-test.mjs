// Test suite for z-brain episodic memory engine
// Verifies first-run automatic database creation, schema setup, FTS5 sync, and progressive disclosure
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

// 1. Isolate test with a brand new, non-existent temporary database
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zbrain-first-run-"));
const tempDbPath = path.join(tempDir, "data", "zbrain.sqlite");

process.env.ZBRAIN_DB_PATH = tempDbPath;

console.log("z-brain: first-run auto-initialization (no existing db)");
ok(!fs.existsSync(tempDbPath), "database file does not exist initially");

const { getDb, countAtoms, closeDb, getDbStats } = await import("../plugins/z-brain/scripts/lib/db.mjs");
const { searchKnowledge } = await import("../plugins/z-brain/scripts/lib/search.mjs");
const { harvestKnowledge } = await import("../plugins/z-brain/scripts/lib/harvest.mjs");
const { formatL0Progressive, formatDeepView } = await import("../plugins/z-brain/scripts/lib/format.mjs");
const { harvestFromGit } = await import("../plugins/z-brain/scripts/lib/git-harvester.mjs");

const db = getDb();
ok(fs.existsSync(tempDbPath), "database file created automatically on first getDb() call");
const initialCount = countAtoms(db);
ok(initialCount === 0, `fresh database starts with 0 atoms (verified: ${initialCount})`);

console.log("z-brain: schema & virtual table triggers");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')").all();
const tableNames = tables.map(t => t.name);
ok(tableNames.includes("knowledge_atoms"), "knowledge_atoms table created");
ok(tableNames.includes("knowledge_fts"), "knowledge_fts virtual table created");

console.log("z-brain: atomic harvest & indexing");
const h1 = harvestKnowledge({
  input: "Database Deadlock | Missing index on RefId | Added composite index",
  project: "erp",
  tags: ["inventory", "db"],
  trust_level: "verified_fact",
  evidence: "build:ok"
});
ok(h1.success === true && h1.id === 1, "first atom harvested with ID #1");

const h2 = harvestKnowledge({
  input: [
    { question: "WPF async deadlock", answer: "Use ConfigureAwait(false)", tags: ["wpf"] },
    { question: "LiteSql SQLite sync", answer: "WAL mode zero lock contention", tags: ["sqlite"] }
  ],
  project: "global"
});
ok(h2.success === true && h2.count === 2, "batch harvest created 2 atoms");

ok(countAtoms(db) === 3, "total count is now 3 atoms");

console.log("z-brain: FTS5 search & progressive disclosure");
const searchRes = searchKnowledge({ query: "deadlock", project: "erp", limit: 5 });
ok(searchRes.length > 0, "FTS5 search finds deadlock atom");
ok(searchRes[0].project_id === "erp", "scoping matches erp project");

const l0 = formatL0Progressive(searchRes, "deadlock query");
ok(l0.includes("Gotcha/Fix:"), "L0 output includes Gotcha/Fix line");
ok(l0.includes("[#1]"), "L0 references atom #1");

const deep = formatDeepView(searchRes[0]);
ok(deep.includes("QUESTION / PROBLEM:"), "deep view formatted correctly");
ok(deep.includes("Added composite index"), "deep view contains fix");

console.log("z-brain: smart deduplication on harvest");
const hDup = harvestKnowledge({
  input: "Database Deadlock | Missing index on RefId | Added composite index",
  project: "erp",
  tags: ["inventory", "db", "verified"],
  trust_level: "verified_fact",
  evidence: "test:passed"
});
ok(hDup.deduplicated === true, "atom with identical question was deduplicated");
ok(hDup.id === 1, "deduplicated atom retained existing ID #1");
ok(countAtoms(db) === 3, "total atom count did not inflate (still 3)");

console.log("z-brain: rich stats & tag aggregation");
const stats = getDbStats(db);
ok(stats.total === 3, "getDbStats total matches count");
ok(stats.trust.verified_fact === 1, "verified_fact count matches");
ok(stats.topTags.some(t => t.tag === "inventory"), "topTags aggregates inventory tag");

console.log("z-brain: enhanced search with compound words & tags");
const compSearch = searchKnowledge({ query: "dead-lock", tags: ["inventory"], project: "erp" });
ok(compSearch.length > 0, "finds deadlock with hyphenated dead-lock query");
ok(compSearch[0].tags.includes("inventory"), "matches inventory tag");

console.log("z-brain: session observations & timeline (claude-mem inspired)");
const { insertObservation, getRecentObservations, getKnowledgeByFile } = await import("../plugins/z-brain/scripts/lib/db.mjs");
const { formatTerminalTable, formatTimeline, formatFileKnowledge } = await import("../plugins/z-brain/scripts/lib/format.mjs");

const obsId = insertObservation(db, {
  session_id: "sess-01",
  project_id: "erp",
  type: "decision",
  title: "Adopted in-terminal dashboard instead of separate Web UI",
  summary: "Eliminates persistent background daemon overhead and port collisions",
  files_touched: ["src/OrderService.cs", "scripts/cli.mjs"]
});
ok(obsId === 1, "observation inserted with ID #1");

const recentObs = getRecentObservations(db, { project: "erp", limit: 5 });
ok(recentObs.length === 1, "found 1 recent observation for erp");
ok(recentObs[0].title.includes("in-terminal dashboard"), "observation title preserved");

const timelineStr = formatTimeline(recentObs);
ok(timelineStr.includes("[decision]"), "timeline format contains type tag");

console.log("z-brain: file-centric intelligence lookup");
const fileRes = getKnowledgeByFile(db, "OrderService.cs");
ok(fileRes.observations.length === 1, "found 1 observation associated with OrderService.cs");

const fileView = formatFileKnowledge("OrderService.cs", fileRes.atoms, fileRes.observations);
ok(fileView.includes("OrderService.cs"), "file knowledge output contains target file name");

console.log("z-brain: ERP synonym expansion & git auto-harvest (v1.1.0)");
// Test ERP synonym expansion: Query "tồn kho" matches inventory atom
const erpSearchRes = searchKnowledge({ query: "tồn kho", project: "erp" });
ok(erpSearchRes.length > 0, "ERP synonym 'tồn kho' matched inventory atom");

// Test git auto-harvest
const gitHarvestRes = harvestFromGit(db, { cwd: process.cwd(), commit: "HEAD" });
ok(gitHarvestRes.success, "harvestFromGit extracted atom from recent commit");
ok(Boolean(gitHarvestRes.atom.id), "harvested atom received database ID");
ok(gitHarvestRes.atom.tags.includes("auto_harvest"), "harvested atom has auto_harvest tag");

// Cleanup
closeDb();
fs.rmSync(tempDir, { recursive: true, force: true });

console.log("\nall z-brain tests passed (first-run auto-init verified)");
