/**
 * Z-Runtime Unified Cognitive Orchestrator
 * Bridges CognitiveRouter + ServiceRegistry + EventBus into real single-call
 * multi-plugin pre-flight execution with strict token budget clamping and
 * graceful degradation when individual plugins are absent.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { EventBus } from './event-bus.mjs';
import { CognitiveRouter, TokenBudgeter, INTENT_CATEGORIES } from './cognitive-router.mjs';
import { defaultServiceRegistry, autoBootstrapCoreServices } from './service-registry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_PLUGINS_DIR = path.resolve(__dirname, '..', '..', '..', 'plugins');

async function loadPluginModule(pluginName, relScriptPath) {
  const home = os.homedir();
  const candidates = [
    path.join(REPO_PLUGINS_DIR, pluginName, relScriptPath),
    path.join(home, '.gemini', 'config', 'plugins', pluginName, relScriptPath),
    path.join(home, '.zcode', 'plugins', pluginName, relScriptPath)
  ];
  for (const fullPath of candidates) {
    if (fs.existsSync(fullPath)) {
      try {
        return await import(pathToFileURL(fullPath).href);
      } catch {}
    }
  }
  return null;
}

/**
 * Execute deterministic routing + live read-only pre-flight orchestration across active plugins.
 */
export async function orchestrateTask(prompt, options = {}) {
  const t0 = performance.now();
  const cwd = options.cwd || process.cwd();
  const targetFile = options.targetFile || options.file || null;
  const targetSymbol = options.targetSymbol || options.symbol || null;
  const eventBus = options.eventBus || new EventBus();
  const serviceRegistry = options.serviceRegistry || defaultServiceRegistry;

  try {
    await autoBootstrapCoreServices(serviceRegistry);
  } catch {}

  const router = options.router || new CognitiveRouter({
    eventBus,
    serviceRegistry,
    defaultBudget: options.budget || 10000
  });

  eventBus.emit('orchestrator:started', { prompt, cwd, targetFile, targetSymbol });

  const routed = router.route(prompt, { cwd, targetFile, targetSymbol });
  const { intent, plan, batches } = routed;
  const budgeter = new TokenBudgeter(options.budget || router.defaultBudget || 10000, {
    prompt,
    category: intent.category
  });
  const budgets = budgeter.getBudgets(intent.category);

  const execution = {
    rules: [],
    brainGotchas: [],
    preflight: null,
    blastRadius: null,
    uiSpec: null,
    helpers: []
  };

  // 1. z-mind: resolve relevant engineering invariants for intent + domain tags
  try {
    const mindMod = await loadPluginModule('z-mind', path.join('scripts', 'lib', 'rules.mjs'));
    if (mindMod && typeof mindMod.queryRules === 'function') {
      const topics = [intent.category, ...(intent.domainTags || [])];
      const seen = new Set();
      for (const topic of topics) {
        const matched = mindMod.queryRules(topic) || [];
        for (const r of matched) {
          if (!seen.has(r.code) && execution.rules.length < 5) {
            seen.add(r.code);
            execution.rules.push({ code: r.code, title: r.title, summary: r.summary });
          }
        }
      }
      if (execution.rules.length === 0) {
        const core = (mindMod.queryRules('invariants') || []).slice(0, 3);
        execution.rules.push(...core.map((r) => ({ code: r.code, title: r.title, summary: r.summary })));
      }
    }
  } catch {}

  // 2. z-brain: fetch relevant gotchas and optional pre-flight brief for targetFile
  try {
    const searchMod = await loadPluginModule('z-brain', path.join('scripts', 'lib', 'search.mjs'));
    if (searchMod && typeof searchMod.searchKnowledge === 'function') {
      const atoms = searchMod.searchKnowledge({ query: prompt, limit: 3 }) || [];
      execution.brainGotchas = atoms.map((a) => ({
        id: a.id,
        question: a.question,
        fix: a.gotcha_fix || a.answer,
        trust: a.trust_level
      }));
    }
    if (targetFile) {
      const preflightMod = await loadPluginModule('z-brain', path.join('scripts', 'lib', 'preflight.mjs'));
      if (preflightMod && typeof preflightMod.buildPreflightBrief === 'function') {
        execution.preflight = await preflightMod.buildPreflightBrief({
          file: targetFile,
          cwd,
          budget: Math.min(400, Math.max(120, Math.floor(budgets.memory / 3)))
        });
      }
    }
  } catch {}

  // 3. z-token: symbol blast radius if targetSymbol is specified
  if (targetSymbol) {
    try {
      const tokenMod = await loadPluginModule('z-token', path.join('scripts', 'lib', 'symbol-cache.mjs'));
      if (tokenMod && typeof tokenMod.getBlastRadius === 'function') {
        const br = tokenMod.getBlastRadius(cwd, targetSymbol);
        if (br && !br.error) {
          execution.blastRadius = {
            symbol: targetSymbol,
            totalDegree: br.totalDegree,
            isGodNode: Boolean(br.isGodNode),
            riskScore: br.riskScore ?? 0,
            impactedFiles: (br.impactedFiles || []).slice(0, 6)
          };
        }
      }
    } catch {}
  }

  // 4. Intent-specific enrichment (UI -> z-craft micro-spec; Feature/Refactor -> z-gate helpers)
  if (intent.category === INTENT_CATEGORIES.UI) {
    try {
      const specMod = await loadPluginModule('z-craft', path.join('scripts', 'lib', 'spec-generator.mjs'));
      if (specMod && typeof specMod.generateMicroSpec === 'function') {
        const spec = specMod.generateMicroSpec(prompt, { cwd, format: 'json' });
        execution.uiSpec = {
          domain: spec.domain,
          states: Object.keys(spec.stateMatrix || {}),
          checklist: (spec.antiSlopChecklist || []).slice(0, 4)
        };
      }
    } catch {}
  } else if (intent.category === INTENT_CATEGORIES.FEATURE || intent.category === INTENT_CATEGORIES.REFACTOR) {
    try {
      const gateMod = await loadPluginModule('z-gate', path.join('scripts', 'lib', 'helper-discovery.mjs'));
      if (gateMod && typeof gateMod.findHelpers === 'function') {
        const helpers = gateMod.findHelpers({ query: prompt, directory: cwd, maxMatches: 3 }) || [];
        execution.helpers = helpers.map((h) => ({ method: h.method, class: h.class, file: h.file }));
      }
    } catch {}
  }

  const briefLines = [
    `# AEOS Cognitive Route Brief`,
    `- **Intent**: \`${intent.category}\` (confidence: ${Math.round(intent.confidence * 100)}%, destructive: ${intent.destructive})`,
    `- **Domains**: ${intent.domainTags.length > 0 ? intent.domainTags.join(', ') : 'general'}`,
    `- **Token Budget**: ${budgets.total.toLocaleString()} total (rules ${budgets.rules}, memory ${budgets.memory}, symbols ${budgets.symbols})`,
    `- **DAG Pipeline**: ${batches.map((b, i) => `L${i}[${b.map((s) => `${s.pluginId}:${s.action}`).join(', ')}]`).join(' -> ')}`
  ];

  if (execution.rules.length > 0) {
    briefLines.push('', '## Active Invariants (z-mind)');
    for (const r of execution.rules) {
      briefLines.push(`- **${r.code}** (${r.title}): ${String(r.summary || '').slice(0, 140)}`);
    }
  }

  if (execution.brainGotchas.length > 0) {
    briefLines.push('', '## Past Gotchas (z-brain)');
    for (const g of execution.brainGotchas) {
      briefLines.push(`- **[#${g.id}]** ${g.question} -> ${String(g.fix || '').slice(0, 140)}`);
    }
  }

  if (execution.blastRadius) {
    const b = execution.blastRadius;
    briefLines.push('', `## Blast Radius (z-token): \`${b.symbol}\``);
    briefLines.push(`- Degree: ${b.totalDegree} | God Node: ${b.isGodNode ? 'YES' : 'NO'} | Risk: ${b.riskScore}/100`);
    if (b.impactedFiles.length > 0) {
      briefLines.push(`- Impacted files: ${b.impactedFiles.join(', ')}`);
    }
  }

  if (execution.uiSpec) {
    briefLines.push('', `## UI Micro-Contract (z-craft: ${execution.uiSpec.domain})`);
    briefLines.push(`- Required states: ${execution.uiSpec.states.join(', ')}`);
    for (const item of execution.uiSpec.checklist) briefLines.push(`- ${item}`);
  }

  if (execution.helpers.length > 0) {
    briefLines.push('', '## Reusable Helpers (z-gate / R_REUSE)');
    for (const h of execution.helpers) {
      briefLines.push(`- \`${h.class}.${h.method}()\` in \`${h.file}\``);
    }
  }

  const rawBrief = briefLines.join('\n');
  const clamped = budgeter.clampPayload(rawBrief, 'memory');
  const durationMs = Math.round((performance.now() - t0) * 100) / 100;

  const result = {
    intent,
    budgets,
    plan,
    batches,
    execution,
    briefMarkdown: clamped.text,
    clamped: clamped.clamped,
    durationMs
  };

  eventBus.emit('orchestrator:completed', {
    category: intent.category,
    durationMs,
    gotchasCount: execution.brainGotchas.length,
    rulesCount: execution.rules.length
  });

  return result;
}
