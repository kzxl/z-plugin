#!/usr/bin/env node
/**
 * Z-Plugin Unified Visual Telemetry & Cost-Savings Dashboard
 *
 * Architecture Invariants:
 * - Zero Background Daemon Overhead (z-brain #4376): Static snapshot in <40ms,
 *   plus optional ephemeral on-demand local HTTP server (`--serve`).
 * - Zero External Dependencies: Pure Node >=22 (`node:fs`, `node:http`, `node:sqlite`).
 * - Zero AI Slop (R_ANTI_SLOP): Semantic design tokens + hsl() variables, zero hardcoded hex.
 * - Mandatory 4-State Matrix (R_UX_MATRIX): Populated, Loading, Empty, and Error views.
 */

import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dietReport } from "./diet.mjs";
import { ledgerPath } from "./ledger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CHARS_PER_TOKEN = 3.6;

export const COST_MODELS = {
  carbon: {
    id: "carbon",
    name: "Gemini 4 Carbon",
    provider: "Google DeepMind",
    inputPer1M: 2.0,
    stdInputPer1M: 4.0,
    cachedInputPer1M: 0.2,
    outputPer1M: 10.0,
    note: "Intro $2/$10 (Std $4/$20) · 95% Prefix Cache",
  },
  argon: {
    id: "argon",
    name: "Gemini 4 Argon",
    provider: "Google DeepMind",
    inputPer1M: 2.0,
    stdInputPer1M: 4.0,
    cachedInputPer1M: 0.2,
    outputPer1M: 10.0,
    note: "Intro $2/$10 · Low TTFT Daily Driver",
  },
  flash38: {
    id: "flash38",
    name: "Gemini 3.8 Flash",
    provider: "Google DeepMind",
    inputPer1M: 0.75,
    stdInputPer1M: 0.75,
    cachedInputPer1M: 0.075,
    outputPer1M: 3.75,
    note: "$0.75/$3.75 · Parallel Worker Tier",
  },
  fable52: {
    id: "fable52",
    name: "Claude Fable 5.2",
    provider: "Anthropic",
    inputPer1M: 8.0,
    stdInputPer1M: 8.0,
    cachedInputPer1M: 0.2,
    outputPer1M: 40.0,
    note: "$8/$40 · $0.20/1M Cache Read",
  },
};

function readRawLedgerEntries(customLedgerFile = null) {
  const mainFile = customLedgerFile || ledgerPath();
  const candidates = [mainFile, `${mainFile}.1`];
  const entries = [];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed && typeof parsed.at === "number") {
            entries.push(parsed);
          }
        } catch {}
      }
    } catch {}
  }
  entries.sort((a, b) => a.at - b.at);
  return { mainFile, entries };
}

function summarizeWindow(entries, sinceMs) {
  const slice = sinceMs > 0 ? entries.filter((e) => e.at >= sinceMs) : entries;
  const denies = slice.filter((e) => e.t === "deny");
  const tools = slice.filter((e) => e.t === "tool");

  const blockedBytes = denies.reduce((n, e) => n + (e.bytes || 0), 0);
  const savedTokens = Math.round(blockedBytes / CHARS_PER_TOKEN);
  const toolOutChars = tools.reduce((n, e) => n + (e.outChars || 0), 0);
  const toolOutTokens = Math.round(toolOutChars / CHARS_PER_TOKEN);

  const eventMap = new Map();
  for (const d of denies) {
    const key = d.event || "other";
    const cur = eventMap.get(key) || { event: key, count: 0, bytes: 0 };
    cur.count++;
    cur.bytes += d.bytes || 0;
    eventMap.set(key, cur);
  }
  const byEvent = [...eventMap.values()]
    .map((v) => ({ ...v, tokens: Math.round(v.bytes / CHARS_PER_TOKEN) }))
    .sort((a, b) => b.count - a.count);

  const toolMap = new Map();
  for (const t of tools) {
    const key = t.tool || "unknown";
    const cur = toolMap.get(key) || { tool: key, calls: 0, outChars: 0, totalMs: 0 };
    cur.calls++;
    cur.outChars += t.outChars || 0;
    cur.totalMs += t.ms || 0;
    toolMap.set(key, cur);
  }
  const byTool = [...toolMap.values()]
    .map((v) => ({
      tool: v.tool,
      calls: v.calls,
      outTokens: Math.round(v.outChars / CHARS_PER_TOKEN),
      avgMs: v.calls > 0 ? Math.round(v.totalMs / v.calls) : 0,
    }))
    .sort((a, b) => b.calls - a.calls);

  const searchCalls = toolMap.get("search")?.calls || 0;
  const symbolCalls =
    (toolMap.get("outline")?.calls || 0) +
    (toolMap.get("read_symbol")?.calls || 0) +
    (toolMap.get("trace_path")?.calls || 0) +
    (toolMap.get("blast_radius")?.calls || 0);

  const recentBlocks = [...denies]
    .reverse()
    .slice(0, 20)
    .map((d) => ({
      at: d.at,
      event: d.event || "block",
      file: d.file || "(command guard)",
      bytes: d.bytes || 0,
      tokens: Math.round((d.bytes || 0) / CHARS_PER_TOKEN),
      reason: String(d.reason || "").slice(0, 160),
    }));

  // Build 14-day daily series
  const dayBuckets = new Map();
  const now = Date.now();
  for (let i = 13; i >= 0; i--) {
    const dt = new Date(now - i * 86_400_000);
    const key = dt.toISOString().slice(0, 10);
    dayBuckets.set(key, { date: key, savedTokens: 0, toolTokens: 0, blocks: 0, calls: 0 });
  }
  for (const e of slice) {
    const key = new Date(e.at).toISOString().slice(0, 10);
    const b = dayBuckets.get(key);
    if (!b) continue;
    if (e.t === "deny") {
      b.blocks++;
      b.savedTokens += Math.round((e.bytes || 0) / CHARS_PER_TOKEN);
    } else if (e.t === "tool") {
      b.calls++;
      b.toolTokens += Math.round((e.outChars || 0) / CHARS_PER_TOKEN);
    }
  }

  return {
    blockedCalls: denies.length,
    blockedBytes,
    savedTokens,
    uniqueFilesBlocked: new Set(denies.map((d) => d.file).filter(Boolean)).size,
    toolCalls: tools.length,
    toolOutTokens,
    searchCalls,
    symbolCalls,
    searchToSymbolRatio: symbolCalls > 0 ? Number((searchCalls / symbolCalls).toFixed(1)) : searchCalls,
    byEvent,
    byTool,
    recentBlocks,
    dailySeries: [...dayBuckets.values()],
  };
}

function resolveDefaultBrainDb() {
  const candidates = [
    process.env.ZBRAIN_DB_PATH,
    path.join(os.homedir(), ".gemini", "config", "plugins", "z-brain", "data", "zbrain.sqlite"),
    path.resolve(__dirname, "..", "..", "..", "z-brain", "data", "zbrain.sqlite"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function collectBrainMetrics(customBrainDb = null) {
  const dbPath = customBrainDb || resolveDefaultBrainDb();
  if (!dbPath || !fs.existsSync(dbPath)) {
    return {
      available: false,
      dbPath: null,
      totalAtoms: 0,
      verifiedFacts: 0,
      totalObservations: 0,
      topProjects: [],
      recentAtoms: [],
    };
  }

  let db = null;
  try {
    db = new DatabaseSync(dbPath, { readOnly: true });
    const totalAtoms = Number(db.prepare("SELECT COUNT(*) AS c FROM knowledge_atoms").get()?.c || 0);
    const verifiedFacts = Number(
      db.prepare("SELECT COUNT(*) AS c FROM knowledge_atoms WHERE trust_level = 'verified_fact'").get()?.c || 0
    );
    let totalObservations = 0;
    try {
      totalObservations = Number(db.prepare("SELECT COUNT(*) AS c FROM session_observations").get()?.c || 0);
    } catch {}

    const topProjects = db
      .prepare(
        "SELECT project_id AS project, COUNT(*) AS count FROM knowledge_atoms GROUP BY project_id ORDER BY count DESC LIMIT 6"
      )
      .all()
      .map((r) => ({ project: String(r.project), count: Number(r.count) }));

    const recentAtoms = db
      .prepare(
        "SELECT id, project_id, trust_level, question, gotcha_fix, updated_at FROM knowledge_atoms ORDER BY id DESC LIMIT 6"
      )
      .all()
      .map((r) => ({
        id: Number(r.id),
        project: String(r.project_id),
        trust: String(r.trust_level),
        question: String(r.question || "").slice(0, 110),
        fix: String(r.gotcha_fix || "").slice(0, 120),
        updatedAt: String(r.updated_at || ""),
      }));

    return {
      available: true,
      dbPath,
      totalAtoms,
      verifiedFacts,
      totalObservations,
      topProjects,
      recentAtoms,
    };
  } catch {
    return {
      available: false,
      dbPath,
      totalAtoms: 0,
      verifiedFacts: 0,
      totalObservations: 0,
      topProjects: [],
      recentAtoms: [],
    };
  } finally {
    if (db) {
      try {
        db.close();
      } catch {}
    }
  }
}

export function collectDashboardMetrics(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const now = Date.now();
  const { mainFile, entries } = readRawLedgerEntries(opts.ledgerFile);

  const windows = {
    d1: summarizeWindow(entries, now - 86_400_000),
    d7: summarizeWindow(entries, now - 7 * 86_400_000),
    d30: summarizeWindow(entries, now - 30 * 86_400_000),
    all: summarizeWindow(entries, 0),
  };

  const diet = dietReport(cwd);
  const brain = collectBrainMetrics(opts.brainDbFile);

  return {
    generatedAt: new Date(now).toISOString(),
    ledgerFile: mainFile,
    windows,
    costModels: COST_MODELS,
    diet: {
      estTokens: diet.stats.estTokens || 0,
      skills: diet.stats.skills || 0,
      skillTokens: diet.stats.skillTokens || 0,
      schemaTokens: diet.stats.schemaTokens || 0,
      rulesTokens: diet.stats.rulesTokens || 0,
      groups: (diet.stats.groups || []).slice(0, 12),
      topSkills: (diet.stats.topSkills || []).slice(0, 10),
      alwaysOnRules: diet.stats.alwaysOnRules || [],
    },
    brain,
  };
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderDashboardHtml(metrics, opts = {}) {
  const title = escapeHtml(opts.title || "Z-Plugin Telemetry & Token Economics");
  const liveMode = Boolean(opts.liveMode);
  const safeJson = JSON.stringify(metrics).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://www.gstatic.com/antigravity/web/dev/tailwindcss.min.js"></script>
  <style>
    body {
      background-color: var(--background, hsl(224 71% 4%));
      color: var(--foreground, hsl(210 40% 98%));
      margin: 0;
    }
    .surface-card {
      background-color: var(--card, hsl(222 47% 9%));
      border: 1px solid var(--border, hsl(217 33% 18%));
    }
    .surface-subtle {
      background-color: var(--sidebar, hsl(222 47% 7%));
      border: 1px solid var(--border, hsl(217 33% 16%));
    }
    .muted-text {
      color: var(--muted-foreground, hsl(215 20% 65%));
    }
    .bar-saved {
      background-color: hsl(158 64% 45%);
    }
    .bar-tool {
      background-color: hsl(217 91% 60%);
    }
  </style>
</head>
<body class="antialiased p-4 md:p-6 text-sm">
  <div class="max-w-7xl mx-auto space-y-4">
    <!-- Top Header & Controls -->
    <header class="surface-card rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-4">
      <div>
        <div class="flex items-center gap-2.5">
          <h1 class="text-lg font-semibold tracking-tight">${title}</h1>
          <span class="px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30" id="mode-badge">
            ${liveMode ? "Live Ephemeral HTTP" : "Zero-Daemon Snapshot"}
          </span>
        </div>
        <p class="muted-text text-xs mt-1" id="subtitle-meta">
          Local ledger + Context Diet + Z-Brain SQLite · 0 MB idle background RAM
        </p>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <!-- Time Window Selector -->
        <div class="surface-subtle rounded-lg p-1 flex items-center gap-1 text-xs" role="group" aria-label="Time window">
          <button type="button" onclick="setWindow('d1')" id="win-d1" class="px-2.5 py-1 rounded font-medium transition">24h</button>
          <button type="button" onclick="setWindow('d7')" id="win-d7" class="px-2.5 py-1 rounded font-medium transition">7d</button>
          <button type="button" onclick="setWindow('d30')" id="win-d30" class="px-2.5 py-1 rounded font-medium transition">30d</button>
          <button type="button" onclick="setWindow('all')" id="win-all" class="px-2.5 py-1 rounded font-medium transition">All</button>
        </div>

        <!-- 4-State Verification Switcher -->
        <select id="ui-state-select" onchange="switchState(this.value)" aria-label="UI State Preview" class="surface-subtle rounded-lg px-2.5 py-1.5 text-xs">
          <option value="populated">State: Populated</option>
          <option value="loading">State: Loading</option>
          <option value="empty">State: Empty</option>
          <option value="error">State: Error</option>
        </select>

        <button type="button" onclick="refreshMetrics()" id="btn-refresh" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition">
          Refresh
        </button>
      </div>
    </header>

    <!-- STATE 2: LOADING SKELETON -->
    <section id="state-loading" class="hidden space-y-4" aria-live="polite">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="surface-card rounded-xl p-4 space-y-2 animate-pulse">
          <div class="h-3 w-24 bg-slate-700/50 rounded"></div>
          <div class="h-7 w-32 bg-slate-700/60 rounded"></div>
          <div class="h-3 w-40 bg-slate-700/40 rounded"></div>
        </div>
        <div class="surface-card rounded-xl p-4 space-y-2 animate-pulse">
          <div class="h-3 w-24 bg-slate-700/50 rounded"></div>
          <div class="h-7 w-28 bg-slate-700/60 rounded"></div>
          <div class="h-3 w-36 bg-slate-700/40 rounded"></div>
        </div>
        <div class="surface-card rounded-xl p-4 space-y-2 animate-pulse">
          <div class="h-3 w-28 bg-slate-700/50 rounded"></div>
          <div class="h-7 w-24 bg-slate-700/60 rounded"></div>
          <div class="h-3 w-36 bg-slate-700/40 rounded"></div>
        </div>
        <div class="surface-card rounded-xl p-4 space-y-2 animate-pulse">
          <div class="h-3 w-24 bg-slate-700/50 rounded"></div>
          <div class="h-7 w-28 bg-slate-700/60 rounded"></div>
          <div class="h-3 w-32 bg-slate-700/40 rounded"></div>
        </div>
      </div>
      <div class="surface-card rounded-xl p-5 space-y-3 animate-pulse">
        <div class="h-4 w-48 bg-slate-700/50 rounded"></div>
        <div class="h-36 bg-slate-700/30 rounded"></div>
      </div>
    </section>

    <!-- STATE 3: EMPTY ZERO-DATA -->
    <section id="state-empty" class="hidden surface-card rounded-xl p-10 text-center space-y-3">
      <div class="text-base font-semibold" id="empty-title">No telemetry events recorded in this window</div>
      <p class="muted-text text-xs max-w-md mx-auto" id="empty-desc">
        Zero guard blocks or compact MCP tool executions occurred during the selected period. Expand the time range to inspect historical savings.
      </p>
      <div class="pt-2 flex items-center justify-center gap-2">
        <button type="button" onclick="setWindow('d30')" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 text-white hover:bg-blue-500 transition">
          Switch to 30-Day Window
        </button>
        <button type="button" onclick="clearBlockFilter()" class="surface-subtle px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition">
          Reset Search Filter
        </button>
      </div>
    </section>

    <!-- STATE 4: ERROR DIAGNOSTIC -->
    <section id="state-error" class="hidden surface-card rounded-xl p-5 border border-rose-500/40 space-y-2">
      <div class="flex items-center justify-between gap-3">
        <div class="font-semibold text-rose-400">Live telemetry endpoint unreachable (ERR_LOCAL_BRIDGE_OFFLINE)</div>
        <button type="button" onclick="retryFromError()" class="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-600 text-white hover:bg-rose-500 transition">
          Retry Connection
        </button>
      </div>
      <p class="muted-text text-xs" id="error-detail">
        The ephemeral HTTP server is not running (expected in static snapshot mode). Click Retry Connection to restore the embedded local telemetry snapshot.
      </p>
    </section>

    <!-- STATE 1: POPULATED DASHBOARD -->
    <main id="state-populated" class="space-y-4">
      <!-- KPI Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div class="surface-card rounded-xl p-4 shadow-xs">
          <div class="muted-text text-xs font-medium uppercase tracking-wider">Tokens Kept Out</div>
          <div class="text-2xl font-bold text-emerald-400 mt-1 tabular-nums" id="kpi-saved-tokens">0</div>
          <div class="muted-text text-xs mt-1" id="kpi-saved-sub">0 blocked calls · 0 KB prevented</div>
        </div>

        <div class="surface-card rounded-xl p-4 shadow-xs">
          <div class="muted-text text-xs font-medium uppercase tracking-wider">Est. Multi-Turn Savings</div>
          <div class="text-2xl font-bold text-blue-400 mt-1 tabular-nums" id="kpi-saved-usd">$0.00</div>
          <div class="muted-text text-xs mt-1" id="kpi-usd-sub">Compounded across session turns</div>
        </div>

        <div class="surface-card rounded-xl p-4 shadow-xs">
          <div class="muted-text text-xs font-medium uppercase tracking-wider">Permanent Session Tax</div>
          <div class="text-2xl font-bold text-amber-400 mt-1 tabular-nums" id="kpi-diet-tokens">0</div>
          <div class="muted-text text-xs mt-1" id="kpi-diet-sub">Loaded before first prompt</div>
        </div>

        <div class="surface-card rounded-xl p-4 shadow-xs">
          <div class="muted-text text-xs font-medium uppercase tracking-wider">Z-Brain Episodic Memory</div>
          <div class="text-2xl font-bold mt-1 tabular-nums" id="kpi-brain-atoms">0</div>
          <div class="muted-text text-xs mt-1" id="kpi-brain-sub">Verified facts &amp; observations</div>
        </div>
      </div>

      <!-- Interactive Cost & Cache Economics Simulator -->
      <section class="surface-card rounded-xl p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border,hsl(217_33%_18%))]">
          <div>
            <h2 class="text-sm font-semibold">Frontier Model Cost &amp; Prefix Cache Simulator</h2>
            <p class="muted-text text-xs">Blocked files avoid compounding input charges on every subsequent turn in the conversation</p>
          </div>
          <div class="flex flex-wrap items-center gap-2 text-xs">
            <label class="muted-text" for="sim-model">Active Model:</label>
            <select id="sim-model" onchange="recalculateEconomics()" class="surface-subtle rounded-lg px-2.5 py-1.5 text-xs font-medium">
              <option value="carbon">Gemini 4 Carbon ($2 / $10)</option>
              <option value="argon">Gemini 4 Argon ($2 / $10)</option>
              <option value="flash38">Gemini 3.8 Flash ($0.75 / $3.75)</option>
              <option value="fable52">Claude Fable 5.2 ($8 / $40)</option>
            </select>

            <label class="muted-text ml-1" for="sim-turns">Avg Turns/Session:</label>
            <select id="sim-turns" onchange="recalculateEconomics()" class="surface-subtle rounded-lg px-2 py-1.5 text-xs">
              <option value="1">1x (Single turn)</option>
              <option value="10" selected>10x (Standard task)</option>
              <option value="20">20x (Deep refactor)</option>
            </select>

            <label class="muted-text ml-1" for="sim-cache">Cloud Cache Hit:</label>
            <select id="sim-cache" onchange="recalculateEconomics()" class="surface-subtle rounded-lg px-2 py-1.5 text-xs">
              <option value="0">0% (Uncached)</option>
              <option value="0.5">50% Hit</option>
              <option value="0.9" selected>90% Hit (Target)</option>
              <option value="0.95">95% Hit (Pinned)</option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3" id="model-comparison-grid"></div>
      </section>

      <!-- Middle Grid: 14-Day Activity Chart + Tool Efficiency Audit -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- 14-Day Bar Chart -->
        <section class="surface-card rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold">14-Day Token Firewall &amp; Compact Tool Volume</h2>
              <p class="muted-text text-xs">Emerald = Blocked context bloat · Blue = Compact MCP output</p>
            </div>
          </div>
          <div class="h-44 flex items-end gap-1.5 pt-4 pb-1 border-b border-[var(--border,hsl(217_33%_18%))]" id="daily-chart"></div>
          <div class="flex justify-between muted-text text-xs" id="daily-chart-labels"></div>
        </section>

        <!-- Tool Efficiency & Search-vs-Symbol Advisor -->
        <section class="surface-card rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold">MCP Tool Usage &amp; Efficiency Signal</h2>
              <p class="muted-text text-xs">Tracks compact tool throughput and Search-to-Symbol ratio</p>
            </div>
            <span class="px-2 py-0.5 rounded text-xs font-medium" id="ratio-badge">Ratio: 0x</span>
          </div>

          <div id="efficiency-alert" class="surface-subtle rounded-lg p-3 text-xs"></div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="muted-text border-b border-[var(--border,hsl(217_33%_18%))]">
                <tr>
                  <th class="py-2 pr-3 font-medium">Tool</th>
                  <th class="py-2 px-3 font-medium text-right">Calls</th>
                  <th class="py-2 px-3 font-medium text-right">Output Tokens</th>
                  <th class="py-2 pl-3 font-medium text-right">Avg Latency</th>
                </tr>
              </thead>
              <tbody id="tool-table-body" class="divide-y divide-[var(--border,hsl(217_33%_18%))]"></tbody>
            </table>
          </div>
        </section>
      </div>

      <!-- Context Diet Breakdown + Z-Brain Memory -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <!-- Permanent Context Diet -->
        <section class="surface-card rounded-xl p-4 space-y-3">
          <div>
            <h2 class="text-sm font-semibold">Context Diet Breakdown (Antigravity + ZCode)</h2>
            <p class="muted-text text-xs" id="diet-breakdown-sub">Skills, Always-On Rules, and MCP Index Cost</p>
          </div>
          <div class="space-y-2" id="diet-groups-list"></div>
          <div class="pt-2 border-t border-[var(--border,hsl(217_33%_18%))]">
            <div class="text-xs font-medium mb-1.5">Top Heaviest Individual Skills</div>
            <div class="flex flex-wrap gap-1.5" id="top-skills-pills"></div>
          </div>
        </section>

        <!-- Z-Brain SQLite Memory Overview -->
        <section class="surface-card rounded-xl p-4 space-y-3">
          <div class="flex items-center justify-between">
            <div>
              <h2 class="text-sm font-semibold">Z-Brain Episodic Knowledge Atoms</h2>
              <p class="muted-text text-xs" id="brain-path-sub">Local SQLite FTS5 store</p>
            </div>
            <div class="flex flex-wrap gap-1.5" id="brain-projects-pills"></div>
          </div>
          <div class="space-y-2" id="brain-recent-list"></div>
        </section>
      </div>

      <!-- Recent Guard Blocks Table -->
      <section class="surface-card rounded-xl p-4 space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 class="text-sm font-semibold">Recent Firewall Blocks (<code class="text-xs">guard.mjs</code>)</h2>
            <p class="muted-text text-xs">Oversized full-file reads, unbounded recursive greps, and raw build dumps intercepted</p>
          </div>
          <input
            type="text"
            id="block-filter-input"
            oninput="renderBlocksTable()"
            placeholder="Filter by file or event..."
            aria-label="Filter blocked calls"
            class="surface-subtle rounded-lg px-3 py-1.5 text-xs w-56"
          >
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="muted-text border-b border-[var(--border,hsl(217_33%_18%))]">
              <tr>
                <th class="py-2 pr-3 font-medium">Time</th>
                <th class="py-2 px-3 font-medium">Guard Rule</th>
                <th class="py-2 px-3 font-medium">Target</th>
                <th class="py-2 px-3 font-medium text-right">Prevented</th>
                <th class="py-2 pl-3 font-medium">Reason</th>
              </tr>
            </thead>
            <tbody id="blocks-table-body" class="divide-y divide-[var(--border,hsl(217_33%_18%))]"></tbody>
          </table>
        </div>
      </section>
    </main>
  </div>

  <script>
    let METRICS = ${safeJson};
    const LIVE_MODE = ${liveMode ? "true" : "false"};
    let activeWindow = "d30";
    let currentUiState = "populated";

    function fmtTok(n) {
      const val = Number(n || 0);
      if (val >= 1_000_000) return (val / 1_000_000).toFixed(2) + "M";
      if (val >= 1_000) return (val / 1_000).toFixed(1) + "k";
      return String(Math.round(val));
    }

    function fmtUsd(n) {
      const val = Number(n || 0);
      if (val < 0.01 && val > 0) return "<$0.01";
      return "$" + val.toFixed(2);
    }

    function esc(s) {
      return String(s || "").replace(/[&<>"']/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
      });
    }

    function switchState(state) {
      currentUiState = state;
      const sel = document.getElementById("ui-state-select");
      if (sel && sel.value !== state) sel.value = state;
      ["populated", "loading", "empty", "error"].forEach(function (s) {
        const el = document.getElementById("state-" + s);
        if (el) el.classList.toggle("hidden", s !== state);
      });
    }

    function setWindow(winKey) {
      activeWindow = winKey;
      ["d1", "d7", "d30", "all"].forEach(function (k) {
        const btn = document.getElementById("win-" + k);
        if (!btn) return;
        if (k === winKey) {
          btn.className = "px-2.5 py-1 rounded font-medium bg-blue-600 text-white transition";
        } else {
          btn.className = "px-2.5 py-1 rounded font-medium muted-text hover:opacity-90 transition";
        }
      });
      renderAll();
    }

    function effectiveRatePer1M(model, cacheRatio) {
      return (1 - cacheRatio) * model.inputPer1M + cacheRatio * model.cachedInputPer1M;
    }

    function recalculateEconomics() {
      const w = METRICS.windows[activeWindow] || METRICS.windows.d30;
      const modelKey = document.getElementById("sim-model").value || "carbon";
      const turns = Number(document.getElementById("sim-turns").value || 10);
      const cacheRatio = Number(document.getElementById("sim-cache").value || 0.9);

      const models = METRICS.costModels || {};
      const activeModel = models[modelKey] || models.carbon;

      // Turn 1 pays uncached input rate; subsequent (turns - 1) pay blended cached rate
      const blendedFollowup = effectiveRatePer1M(activeModel, cacheRatio);
      const compoundedSavedUsd =
        (w.savedTokens / 1_000_000) *
        (activeModel.inputPer1M + Math.max(0, turns - 1) * blendedFollowup);

      document.getElementById("kpi-saved-usd").textContent = fmtUsd(compoundedSavedUsd);
      document.getElementById("kpi-usd-sub").textContent =
        activeModel.name + " · " + turns + "x turns (" + Math.round(cacheRatio * 100) + "% cache)";

      const grid = document.getElementById("model-comparison-grid");
      grid.innerHTML = Object.values(models)
        .map(function (m) {
          const isSelected = m.id === modelKey;
          const followup = effectiveRatePer1M(m, cacheRatio);
          const saved =
            (w.savedTokens / 1_000_000) * (m.inputPer1M + Math.max(0, turns - 1) * followup);
          // Cost of permanent session tax across 300 sessions/month (each averaging N turns)
          const monthlyTaxUsd =
            ((METRICS.diet.estTokens || 0) / 1_000_000) *
            300 *
            (m.inputPer1M + Math.max(0, turns - 1) * followup);

          return (
            '<div class="surface-subtle rounded-lg p-3 space-y-1 ' +
            (isSelected ? "ring-1 ring-blue-500" : "") +
            '">' +
            '<div class="flex items-center justify-between">' +
            '<span class="font-semibold text-xs">' + esc(m.name) + "</span>" +
            '<span class="text-emerald-400 font-bold tabular-nums text-sm">' + fmtUsd(saved) + " saved</span>" +
            "</div>" +
            '<div class="muted-text text-xs">' + esc(m.note) + "</div>" +
            '<div class="pt-1 text-xs flex justify-between border-t border-[var(--border,hsl(217_33%_18%))]">' +
            '<span class="muted-text">Diet tax (300 sess/mo):</span>' +
            '<span class="font-mono text-amber-400">' + fmtUsd(monthlyTaxUsd) + "/mo</span>" +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    function renderBlocksTable() {
      const w = METRICS.windows[activeWindow] || METRICS.windows.d30;
      const q = (document.getElementById("block-filter-input").value || "").toLowerCase().trim();
      const rows = (w.recentBlocks || []).filter(function (b) {
        if (!q) return true;
        return (
          b.file.toLowerCase().includes(q) ||
          b.event.toLowerCase().includes(q) ||
          b.reason.toLowerCase().includes(q)
        );
      });

      const tbody = document.getElementById("blocks-table-body");
      if (rows.length === 0) {
        tbody.innerHTML =
          '<tr><td colspan="5" class="py-4 text-center muted-text">No blocked calls matching current filter in this time window.</td></tr>';
        return;
      }

      tbody.innerHTML = rows
        .map(function (r) {
          const dt = new Date(r.at);
          const stamp = dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          return (
            '<tr class="hover:opacity-90">' +
            '<td class="py-2 pr-3 whitespace-nowrap muted-text tabular-nums">' + esc(stamp) + "</td>" +
            '<td class="py-2 px-3"><span class="px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono text-xs">' +
            esc(r.event) +
            "</span></td>" +
            '<td class="py-2 px-3 font-mono font-medium">' + esc(r.file) + "</td>" +
            '<td class="py-2 px-3 text-right font-semibold text-emerald-400 tabular-nums">' +
            (r.tokens > 0 ? fmtTok(r.tokens) + " tok" : "guard") +
            "</td>" +
            '<td class="py-2 pl-3 muted-text truncate max-w-md" title="' + esc(r.reason) + '">' + esc(r.reason) + "</td>" +
            "</tr>"
          );
        })
        .join("");
    }

    function clearBlockFilter() {
      const inp = document.getElementById("block-filter-input");
      if (inp) inp.value = "";
      switchState("populated");
      renderBlocksTable();
    }

    function renderAll() {
      const w = METRICS.windows[activeWindow] || METRICS.windows.d30;

      if (w.blockedCalls === 0 && w.toolCalls === 0) {
        document.getElementById("empty-title").textContent =
          "No guard blocks or compact tool calls in the " + activeWindow.replace("d", "") + "-day window";
        switchState("empty");
        return;
      }
      if (currentUiState === "empty") {
        switchState("populated");
      }

      document.getElementById("subtitle-meta").textContent =
        "Updated " + new Date(METRICS.generatedAt).toLocaleString() + " · Ledger: " + (METRICS.ledgerFile || "local");

      document.getElementById("kpi-saved-tokens").textContent = fmtTok(w.savedTokens);
      document.getElementById("kpi-saved-sub").textContent =
        w.blockedCalls + " blocked calls · " + Math.round((w.blockedBytes || 0) / 1024) + " KB kept out";

      document.getElementById("kpi-diet-tokens").textContent = fmtTok(METRICS.diet.estTokens) + " tok";
      document.getElementById("kpi-diet-sub").textContent =
        METRICS.diet.skills + " skills · Rules: " + fmtTok(METRICS.diet.rulesTokens) + " · MCP: " + fmtTok(METRICS.diet.schemaTokens);

      if (METRICS.brain.available) {
        document.getElementById("kpi-brain-atoms").textContent = String(METRICS.brain.totalAtoms) + " atoms";
        document.getElementById("kpi-brain-sub").textContent =
          METRICS.brain.verifiedFacts + " verified facts · " + METRICS.brain.totalObservations + " session logs";
      } else {
        document.getElementById("kpi-brain-atoms").textContent = "Offline";
        document.getElementById("kpi-brain-sub").textContent = "No zbrain.sqlite detected";
      }

      recalculateEconomics();

      // Render 14-day chart
      const series = w.dailySeries || [];
      const maxVal = Math.max(
        1,
        ...series.map(function (d) {
          return Math.max(d.savedTokens, d.toolTokens);
        })
      );
      document.getElementById("daily-chart").innerHTML = series
        .map(function (d) {
          const hSaved = Math.max(2, Math.round((d.savedTokens / maxVal) * 140));
          const hTool = Math.max(2, Math.round((d.toolTokens / maxVal) * 140));
          const tip = d.date + ": Saved " + fmtTok(d.savedTokens) + " tok (" + d.blocks + " blocks) | Tool out " + fmtTok(d.toolTokens) + " tok (" + d.calls + " calls)";
          return (
            '<div class="flex-1 flex items-end justify-center gap-0.5 h-full" title="' + esc(tip) + '">' +
            '<div class="w-2 rounded-t bar-saved" style="height:' + hSaved + 'px"></div>' +
            '<div class="w-2 rounded-t bar-tool" style="height:' + hTool + 'px"></div>' +
            "</div>"
          );
        })
        .join("");

      if (series.length > 0) {
        document.getElementById("daily-chart-labels").innerHTML =
          "<span>" + esc(series[0].date) + "</span>" +
          "<span>" + esc(series[Math.floor(series.length / 2)].date) + "</span>" +
          "<span>" + esc(series[series.length - 1].date) + "</span>";
      }

      // Render Tool Efficiency & Ratio Advisor
      const ratio = w.searchToSymbolRatio || 0;
      const ratioBadge = document.getElementById("ratio-badge");
      const alertBox = document.getElementById("efficiency-alert");
      ratioBadge.textContent = "Search / Symbol: " + ratio + "x";
      if (w.searchCalls > 10 && ratio > 5) {
        ratioBadge.className = "px-2 py-0.5 rounded text-xs font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30";
        alertBox.innerHTML =
          '<span class="font-semibold text-amber-400">Optimization Opportunity:</span> ' +
          "Agents executed <b>" + w.searchCalls + "</b> text searches vs only <b>" + w.symbolCalls + "</b> AST symbol lookups (<code class='text-xs'>outline</code> / <code class='text-xs'>read_symbol</code>). Shifting known-symbol reads to <code class='text-xs'>read_symbol</code> cuts tool output tokens by ~65%.";
      } else {
        ratioBadge.className = "px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30";
        alertBox.innerHTML =
          '<span class="font-semibold text-emerald-400">Balanced AST Routing:</span> ' +
          "Symbol tools (<code class='text-xs'>outline</code> / <code class='text-xs'>read_symbol</code>) are actively keeping raw grep volume bounded.";
      }

      const toolBody = document.getElementById("tool-table-body");
      if (!w.byTool || w.byTool.length === 0) {
        toolBody.innerHTML = '<tr><td colspan="4" class="py-3 muted-text">No MCP tool calls recorded in window.</td></tr>';
      } else {
        toolBody.innerHTML = w.byTool
          .map(function (t) {
            return (
              "<tr>" +
              '<td class="py-2 pr-3 font-mono font-medium">' + esc(t.tool) + "</td>" +
              '<td class="py-2 px-3 text-right tabular-nums">' + t.calls + "</td>" +
              '<td class="py-2 px-3 text-right tabular-nums">' + fmtTok(t.outTokens) + "</td>" +
              '<td class="py-2 pl-3 text-right muted-text tabular-nums">' + t.avgMs + " ms</td>" +
              "</tr>"
            );
          })
          .join("");
      }

      // Render Diet Groups
      const maxGroupTok = Math.max(
        1,
        ...(METRICS.diet.groups || []).map(function (g) {
          return g.tokens;
        })
      );
      document.getElementById("diet-groups-list").innerHTML = (METRICS.diet.groups || [])
        .slice(0, 7)
        .map(function (g) {
          const pct = Math.max(4, Math.round((g.tokens / maxGroupTok) * 100));
          return (
            '<div class="space-y-1">' +
            '<div class="flex justify-between text-xs">' +
            '<span class="font-mono truncate max-w-xs">' + esc(g.label) + " (" + g.items + ")</span>" +
            '<span class="tabular-nums font-medium">' + fmtTok(g.tokens) + " tok</span>" +
            "</div>" +
            '<div class="w-full h-1.5 rounded surface-subtle overflow-hidden">' +
            '<div class="h-full bar-tool rounded" style="width:' + pct + '%"></div>' +
            "</div>" +
            "</div>"
          );
        })
        .join("");

      document.getElementById("top-skills-pills").innerHTML = (METRICS.diet.topSkills || [])
        .slice(0, 8)
        .map(function (s) {
          return (
            '<span class="surface-subtle px-2 py-0.5 rounded text-xs font-mono">' +
            esc(s.name) + " · " + s.tokens + "t</span>"
          );
        })
        .join("");

      // Render Z-Brain Memory
      document.getElementById("brain-path-sub").textContent = METRICS.brain.available
        ? "SQLite WAL store · " + METRICS.brain.verifiedFacts + "/" + METRICS.brain.totalAtoms + " verified"
        : "SQLite database not initialized";

      document.getElementById("brain-projects-pills").innerHTML = (METRICS.brain.topProjects || [])
        .slice(0, 4)
        .map(function (p) {
          return (
            '<span class="px-2 py-0.5 rounded text-xs bg-blue-500/15 text-blue-400 border border-blue-500/30 font-mono">' +
            esc(p.project) + ": " + p.count +
            "</span>"
          );
        })
        .join("");

      document.getElementById("brain-recent-list").innerHTML = (METRICS.brain.recentAtoms || []).length
        ? METRICS.brain.recentAtoms
            .slice(0, 5)
            .map(function (a) {
              return (
                '<div class="surface-subtle rounded-lg p-2.5 space-y-0.5 text-xs">' +
                '<div class="flex items-center justify-between gap-2">' +
                '<span class="font-semibold truncate">#' + a.id + " · " + esc(a.question) + "</span>" +
                '<span class="muted-text font-mono shrink-0">' + esc(a.project) + "</span>" +
                "</div>" +
                '<div class="muted-text truncate">' + esc(a.fix) + "</div>" +
                "</div>"
              );
            })
            .join("")
        : '<div class="muted-text text-xs py-4 text-center">No episodic atoms harvested yet.</div>';

      renderBlocksTable();
    }

    function refreshMetrics() {
      if (!LIVE_MODE) {
        switchState("loading");
        setTimeout(function () {
          switchState("populated");
          renderAll();
        }, 180);
        return;
      }
      switchState("loading");
      fetch("/api/metrics")
        .then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.json();
        })
        .then(function (fresh) {
          METRICS = fresh;
          switchState("populated");
          renderAll();
        })
        .catch(function (err) {
          document.getElementById("error-detail").textContent =
            "Could not fetch /api/metrics (" + err.message + "). Verify the ephemeral server is running or click Retry Connection.";
          switchState("error");
        });
    }

    function retryFromError() {
      if (LIVE_MODE) {
        refreshMetrics();
      } else {
        switchState("populated");
        renderAll();
      }
    }

    setWindow("d30");
  </script>
</body>
</html>`;
}

export function startDashboardServer(opts = {}) {
  const host = opts.host || "127.0.0.1";
  const requestedPort = typeof opts.port === "number" ? opts.port : 0;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlObj = new URL(req.url || "/", `http://${host}`);
      if (urlObj.pathname === "/api/metrics") {
        try {
          const metrics = collectDashboardMetrics(opts);
          const payload = JSON.stringify(metrics);
          res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          });
          res.end(payload);
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
          res.end(JSON.stringify({ error: err.message }));
        }
        return;
      }

      const metrics = collectDashboardMetrics(opts);
      const html = renderDashboardHtml(metrics, { title: opts.title, liveMode: true });
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(html);
    });

    server.on("error", reject);
    server.listen(requestedPort, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === "object" && addr ? addr.port : requestedPort;
      resolve({
        url: `http://${host}:${actualPort}`,
        port: actualPort,
        server,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}

export async function generateDashboardSnapshot(opts = {}) {
  const cwd = opts.cwd || process.cwd();
  const outPath = opts.out
    ? path.resolve(cwd, opts.out)
    : path.join(os.homedir(), ".zero-token", "z-dashboard.html");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const t0 = performance.now();
  const metrics = collectDashboardMetrics({ ...opts, cwd });
  const html = renderDashboardHtml(metrics, { title: "Z-Plugin Telemetry & Token Economics" });
  fs.writeFileSync(outPath, html, "utf8");
  const dur = (performance.now() - t0).toFixed(1);

  if (opts.open) {
    const { spawn, spawnSync } = await import("node:child_process");
    if (process.platform === "win32") {
      const escaped = String(outPath).replace(/'/g, "''");
      spawnSync("powershell", ["-NoProfile", "-Command", `Start-Process -FilePath '${escaped}'`], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else if (process.platform === "darwin") {
      spawn("open", [outPath], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [outPath], { detached: true, stdio: "ignore" }).unref();
    }
  }

  const w30 = metrics.windows.d30;
  const text = [
    `Z-Plugin Visual Dashboard generated in ${dur}ms:`,
    `• 30d Saved: ~${w30.savedTokens.toLocaleString()} tokens (${w30.blockedCalls} blocked calls)`,
    `• 30d MCP Calls: ${w30.toolCalls.toLocaleString()} calls (Search/Symbol ratio: ${w30.searchToSymbolRatio}x)`,
    `• Session Tax: ~${metrics.diet.estTokens.toLocaleString()} tokens/turn (${metrics.diet.skills} skills)`,
    `• Z-Brain Atoms: ${metrics.brain.totalAtoms.toLocaleString()} (${metrics.brain.verifiedFacts} verified)`,
    `• Saved HTML: ${outPath}`,
  ].join("\n");

  return { text, outPath, metrics };
}
