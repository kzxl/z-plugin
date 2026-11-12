// Test suite for automatic file edit history and inventory (z-brain observer).
// Covers schema, hook normalization for Claude/Qoder/Antigravity/Codex shapes,
// redaction, coalescing, no-op suppression, git reconcile, deletions and formatting.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import cp from "node:child_process";

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "zbrain-observer-"));
const repo = path.join(tempDir, "repo");
fs.mkdirSync(path.join(repo, "src"), { recursive: true });
fs.writeFileSync(path.join(repo, "src", "app.ts"), "export const value = 1;\n", "utf8");

const git = (...args) => cp.execFileSync("git", ["-c", "user.name=test", "-c", "user.email=test@example.com", ...args], {
  cwd: repo,
  encoding: "utf8",
  stdio: ["ignore", "pipe", "ignore"],
});
git("init");
git("add", ".");
git("commit", "-m", "init");

process.env.ZBRAIN_DB_PATH = path.join(tempDir, "data", "zbrain.sqlite");
process.env.ZBRAIN_SPOOL_DIR = path.join(tempDir, "spool");
process.env.ZBRAIN_WATCH = "0";

const dbApi = await import("../plugins/z-brain/scripts/lib/db.mjs");
const observer = await import("../plugins/z-brain/scripts/lib/edit-observer.mjs");
const workspace = await import("../plugins/z-brain/scripts/lib/workspace.mjs");
const format = await import("../plugins/z-brain/scripts/lib/format.mjs");

const db = dbApi.getDb();

console.log("z-brain observer: schema");
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name);
ok(tables.includes("file_events"), "file_events table exists");
ok(tables.includes("file_index"), "file_index table exists");
ok(tables.includes("observer_meta"), "observer_meta table exists");

console.log("z-brain observer: ignore rules");
ok(workspace.isIgnored("node_modules/pkg/index.js"), "node_modules is ignored");
ok(workspace.isIgnored(".env.local"), ".env files are ignored");
ok(workspace.isIgnored("src/app.ts") === false, "source files are tracked");

console.log("z-brain observer: baseline reconcile");
const baseline = observer.reconcile(db, { cwd: repo, budgetMs: 5000 });
ok(baseline.baseline === true, "first reconcile establishes a baseline");
ok(baseline.indexed >= 1, "baseline indexes existing files");
const tracked = dbApi.getFileIndexEntry(db, workspace.resolveWorkspace(repo), "src/app.ts");
ok(tracked !== null, "app.ts is present in the file index");

console.log("z-brain observer: hook normalization across hosts");
const claude = observer.normalizeHookEvent({
  hook_event_name: "PostToolUse",
  tool_name: "Edit",
  tool_input: { file_path: "src/app.ts", old_string: "a", new_string: "b" },
  cwd: repo,
  session_id: "sess-claude",
});
ok(claude.host === "claude" && claude.filePath === "src/app.ts", "Claude/Qoder Edit payload normalizes");
ok(claude.sessionId === "sess-claude", "session id is preserved");

const qoder = observer.normalizeHookEvent({
  tool_name: "search_replace",
  tool_input: { file_path: "src/app.ts" },
  cwd: repo,
}, { QODER_SESSION_ID: "sess-qoder", QODER_CWD: repo });
ok(qoder.host === "qoder" && qoder.sessionId === "sess-qoder", "Qoder env payload normalizes");

const antigravity = observer.normalizeHookEvent({
  toolCall: { name: "replace_file_content", args: { path: "src/app.ts", old_string: "a", new_string: "b" } },
  conversationId: "sess-ag",
  workspacePaths: [repo],
});
ok(antigravity.host === "antigravity" && antigravity.filePath === "src/app.ts", "Antigravity toolCall payload normalizes");

const codex = observer.normalizeHookEvent({
  tool_name: "apply_patch",
  tool_input: { path: "src/app.ts" },
  cwd: repo,
  session_id: "sess-codex",
});
ok(codex.filePath === "src/app.ts" && codex.sessionId === "sess-codex", "Codex payload normalizes");

console.log("z-brain observer: redaction");
const redacted = observer.redactText('const api_key = "sk-abcdefghijklmnop1234";');
ok(!redacted.text.includes("sk-abcdefghijklmnop1234"), "API keys are redacted");
ok(redacted.redacted === true, "redaction flag is set");

console.log("z-brain observer: record + coalesce + no-op");
const now = new Date("2026-11-12T10:00:00.000Z");
fs.writeFileSync(path.join(repo, "src", "app.ts"), "export const value = 1;\nexport const api_key = \"sk-abcdefghijklmnop1234\";\n", "utf8");
const first = observer.recordEdit(db, {
  ...claude,
  content: "export const api_key = \"sk-abcdefghijklmnop1234\";",
  oldString: "export const value = 1;",
}, { source: "hook", now });
ok(first.op === "update" && first.eventId > 0, "edit event recorded");

let history = dbApi.getFileHistory(db, { workspace: workspace.resolveWorkspace(repo), file: "src/app.ts" });
ok(history.length === 1, "one history row after first edit");
ok(!history[0].patch.includes("sk-abcdefghijklmnop1234"), "stored patch is redacted");
ok(history[0].patch.includes("[REDACTED]"), "stored patch contains redaction marker");

fs.writeFileSync(path.join(repo, "src", "app.ts"), "export const api_key = \"sk-abcdefghijklmnop1234\";\nexport const value = 2;\n", "utf8");
const second = observer.recordEdit(db, {
  ...claude,
  content: "export const api_key = \"sk-abcdefghijklmnop1234\";\nexport const value = 2;",
  oldString: "export const value = 1;",
}, { source: "hook", now: new Date(now.getTime() + 10000) });
ok(second.coalesced === true, "edit within the window coalesces");

history = dbApi.getFileHistory(db, { workspace: workspace.resolveWorkspace(repo), file: "src/app.ts" });
ok(history.length === 1, "coalescing does not add a second row");
ok(history[0].lines_added >= 2, "coalesced line counts accumulate");

const noop = observer.recordEdit(db, { ...claude }, { source: "hook", now: new Date(now.getTime() + 20000) });
ok(noop.skipped === "unchanged", "unchanged content is suppressed");

console.log("z-brain observer: reconcile detects create/update/delete");
const createdFile = path.join(repo, "src", "new.ts");
fs.writeFileSync(createdFile, "export const created = true;\n", "utf8");
let rec = observer.reconcile(db, { cwd: repo, budgetMs: 5000 });
ok(rec.changes.created === 1, "reconcile detects a new file");

fs.writeFileSync(path.join(repo, "src", "app.ts"), "export const value = 3;\n", "utf8");
rec = observer.reconcile(db, { cwd: repo, budgetMs: 5000 });
ok(rec.changes.updated === 1, "reconcile detects an external update");

fs.unlinkSync(createdFile);
rec = observer.reconcile(db, { cwd: repo, budgetMs: 5000 });
ok(rec.changes.deleted === 1, "reconcile detects a deletion");

const recent = dbApi.getRecentFileEvents(db, { workspace: workspace.resolveWorkspace(repo), limit: 10 });
ok(recent.some((e) => e.op === "delete"), "deletion appears in recent changes");

console.log("z-brain observer: formatting");
const historyText = format.formatFileHistory("src/app.ts", history);
ok(historyText.includes("src/app.ts"), "history formatter includes the file path");
const changesText = format.formatRecentChanges(recent, repo);
ok(changesText.includes("Recent file changes"), "changes formatter renders a header");

const stats = dbApi.getFileObserverStats(db, { workspace: workspace.resolveWorkspace(repo) });
ok(stats.totalEvents >= 3, "observer stats count events");
ok(stats.trackedFiles >= 1, "observer stats count indexed files");

dbApi.closeDb();
fs.rmSync(tempDir, { recursive: true, force: true });

console.log("\nall z-brain observer tests passed");
