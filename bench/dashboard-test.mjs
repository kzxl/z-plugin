import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";

console.log("z-plugin: visual telemetry dashboard test suite (TDD)");

const tempDir = path.join(os.tmpdir(), `zplugin-dash-test-${Date.now()}`);
fs.mkdirSync(tempDir, { recursive: true });

try {
  // 1. Seed synthetic ledger.jsonl
  const ledgerFile = path.join(tempDir, "ledger.jsonl");
  const now = Date.now();
  const sampleLedger = [
    { at: now - 3600_000, t: "deny", event: "read", bytes: 144000, file: "OrderService.cs", reason: "Blocked full read of OrderService.cs" },
    { at: now - 7200_000, t: "deny", event: "grep", bytes: 32768, file: "", reason: "Blocked unbounded recursive grep" },
    { at: now - 5 * 86400_000, t: "deny", event: "cat", bytes: 72000, file: "InventoryForm.Designer.cs", reason: "Blocked dumping Designer file" },
    { at: now - 1800_000, t: "tool", tool: "search", outChars: 7200, inChars: 80, ms: 24 },
    { at: now - 1700_000, t: "tool", tool: "search", outChars: 5400, inChars: 65, ms: 18 },
    { at: now - 1500_000, t: "tool", tool: "outline", outChars: 1800, inChars: 45, ms: 12 },
    { at: now - 1200_000, t: "tool", tool: "read_symbol", outChars: 900, inChars: 52, ms: 4 },
  ];
  fs.writeFileSync(ledgerFile, sampleLedger.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");

  // 2. Seed synthetic zbrain.sqlite
  const brainDbFile = path.join(tempDir, "zbrain.sqlite");
  const db = new DatabaseSync(brainDbFile);
  db.exec(`
    CREATE TABLE knowledge_atoms (
      id INTEGER PRIMARY KEY,
      project_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      trust_level TEXT NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      gotcha_fix TEXT,
      tags TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE session_observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      files_touched TEXT,
      created_at TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO knowledge_atoms (id, project_id, scope, trust_level, question, answer, gotcha_fix, tags, created_at, updated_at)
    VALUES (1, 'z-plugin', 'project', 'verified_fact', 'Avoid Web UI background daemons', 'Use ephemeral snapshot + on-demand HTTP', 'Zero idle RAM', '["architecture","z-brain"]', ?, ?)
  `).run(new Date().toISOString(), new Date().toISOString());
  db.prepare(`
    INSERT INTO session_observations (session_id, project_id, type, title, summary, files_touched, created_at)
    VALUES ('s1', 'erp-wms', 'decision', 'Switched search to read_symbol', 'Cut token output by 82%', '["OrderService.cs"]', ?)
  `).run(new Date().toISOString());
  db.close();

  // Import target module under test
  const {
    collectDashboardMetrics,
    renderDashboardHtml,
    startDashboardServer,
  } = await import("../tools/dashboard.mjs");

  const metrics = collectDashboardMetrics({
    cwd: tempDir,
    ledgerFile,
    brainDbFile,
  });

  // Verify multi-window ledger aggregation
  assert.strictEqual(metrics.windows.d1.blockedCalls, 2, "24h window should count 2 blocks");
  assert.strictEqual(metrics.windows.d30.blockedCalls, 3, "30d window should count 3 blocks");
  assert.strictEqual(metrics.windows.d30.blockedBytes, 144000 + 32768 + 72000);
  assert.strictEqual(metrics.windows.d30.toolCalls, 4);
  assert.ok(metrics.windows.d30.savedTokens > 60000, "Saved tokens should reflect blocked bytes / 3.6");

  // Verify cost models exist for Carbon, Argon, Flash 3.8, Fable 5.2
  assert.ok(metrics.costModels.carbon, "Must include Gemini 4 Carbon pricing model");
  assert.ok(metrics.costModels.argon, "Must include Gemini 4 Argon pricing model");
  assert.ok(metrics.costModels.flash38, "Must include Gemini 3.8 Flash pricing model");
  assert.ok(metrics.costModels.fable52, "Must include Claude Fable 5.2 pricing model");

  // Verify z-brain SQLite integration
  assert.strictEqual(metrics.brain.available, true);
  assert.strictEqual(metrics.brain.totalAtoms, 1);
  assert.strictEqual(metrics.brain.verifiedFacts, 1);
  assert.strictEqual(metrics.brain.totalObservations, 1);

  // Verify Diet report integration (Antigravity + ZCode)
  assert.ok(typeof metrics.diet.estTokens === "number");
  assert.ok(Array.isArray(metrics.diet.groups));

  // Verify HTML rendering & 4-State Matrix + Anti-Slop invariants
  const html = renderDashboardHtml(metrics, { title: "Z-Plugin Telemetry Dashboard" });
  assert.ok(html.includes('id="state-populated"'), "Must render Populated state");
  assert.ok(html.includes('id="state-loading"'), "Must render Loading skeleton state");
  assert.ok(html.includes('id="state-empty"'), "Must render Empty state");
  assert.ok(html.includes('id="state-error"'), "Must render Error state");
  assert.strictEqual(/#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/.test(html), false, "Must contain ZERO hardcoded hex colors (R_ANTI_SLOP)");

  // Compile embedded inline <script> via vm.Script to guarantee zero browser JS syntax errors
  const inlineScripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(inlineScripts.length, 1, "Must include 1 inline dashboard controller script");
  new vm.Script(inlineScripts[0][1]);

  // Verify ephemeral HTTP server (/ and /api/metrics) with clean shutdown
  const srv = await startDashboardServer({
    port: 0,
    host: "127.0.0.1",
    cwd: tempDir,
    ledgerFile,
    brainDbFile,
  });
  try {
    const resHtml = await fetch(`${srv.url}/`);
    assert.strictEqual(resHtml.status, 200);
    const bodyHtml = await resHtml.text();
    assert.ok(bodyHtml.includes("Z-Plugin"));

    const resJson = await fetch(`${srv.url}/api/metrics`);
    assert.strictEqual(resJson.status, 200);
    const liveData = await resJson.json();
    assert.strictEqual(liveData.windows.d30.blockedCalls, 3);
  } finally {
    await srv.close();
  }

  // Verify workspace-independent MCP integration: diet(scope="dashboard") + /z-token dashboard skill
  const { spawn } = await import("node:child_process");
  const mcpPath = path.resolve("plugins/z-token/scripts/mcp-server.mjs");
  const outHtmlPath = path.join(tempDir, "mcp-dashboard-out.html");
  const mcpRes = await new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [mcpPath], { stdio: ["pipe", "pipe", "pipe"] });
    let stdoutBuf = "";
    proc.stdout.on("data", (chunk) => {
      stdoutBuf += chunk;
      for (const line of stdoutBuf.split("\n")) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed.id === 2) {
            proc.kill();
            resolve(parsed);
          }
        } catch {}
      }
    });
    proc.on("error", reject);
    proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) + "\n");
    proc.stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "diet", arguments: { scope: "dashboard", open: false, out: outHtmlPath } },
      }) + "\n"
    );
  });

  const mcpText = mcpRes.result?.content?.[0]?.text || "";
  assert.ok(fs.existsSync(outHtmlPath), "MCP diet(scope='dashboard') must generate HTML file from any workspace");
  assert.ok(mcpText.includes(outHtmlPath), "MCP diet(scope='dashboard') response must include saved HTML path");

  const skillMd = fs.readFileSync(path.resolve("plugins/z-token/skills/z-token/SKILL.md"), "utf8");
  assert.ok(skillMd.includes("/z-token dashboard"), "z-token SKILL.md must document /z-token dashboard command");

  console.log("  ok   multi-window ledger, model cost calculator, z-brain SQLite, 4-state anti-slop HTML, ephemeral HTTP server, and MCP diet(scope='dashboard') verified");
  console.log("\ndashboard test passed");
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
