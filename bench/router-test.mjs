#!/usr/bin/env node
/**
 * Cognitive Router & Token Budgeter Automated Test Suite
 * Validates deterministic intent classification, token budget clamping, DAG plan synthesis, and execution layering.
 */

import {
  ZRuntime,
  CognitiveRouter,
  TokenBudgeter,
  IntentClassifier,
  DAGPlanner,
  INTENT_CATEGORIES
} from '../packages/z-runtime/src/index.mjs';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  ok  ', msg);
}

console.log('z-runtime: cognitive router - deterministic intent classification (<1ms)');

// 1. Bugfix classification with domain tagging
const bugIntent = IntentClassifier.classify('Fix deadlock in stock transfer batch processing');
ok(bugIntent.category === INTENT_CATEGORIES.BUGFIX, 'classified bugfix intent');
ok(bugIntent.confidence >= 0.90, `confidence is high (got: ${bugIntent.confidence})`);
ok(bugIntent.domainTags.includes('wms'), 'extracted wms domain tag');
ok(bugIntent.domainTags.includes('database'), 'extracted database domain tag');
ok(bugIntent.destructive === false, 'non-destructive action flagged correctly');

// 2. Refactor classification
const refactorIntent = IntentClassifier.classify('Refactor OrderService to eliminate single-impl interface');
ok(refactorIntent.category === INTENT_CATEGORIES.REFACTOR, 'classified refactor intent');
ok(refactorIntent.confidence >= 0.85, 'confidence >= 0.85 for refactor');

// 3. UI classification
const uiIntent = IntentClassifier.classify('Create stock transfer modal with approval status badge');
ok(uiIntent.category === INTENT_CATEGORIES.UI, 'classified UI intent');
ok(uiIntent.domainTags.includes('wms'), 'extracted wms domain tag from UI prompt');

// 4. Review classification
const reviewIntent = IntentClassifier.classify('Review git diff for SQL injection and security hazards');
ok(reviewIntent.category === INTENT_CATEGORIES.REVIEW, 'classified review intent');
ok(reviewIntent.domainTags.includes('database'), 'extracted database domain tag');

// 5. Destructive action detection (Human Approval Gate)
const destructiveIntent = IntentClassifier.classify('Drop table inventory_logs and delete file old_service.cs');
ok(destructiveIntent.destructive === true, 'flagged destructive action requiring human gate');

console.log('z-runtime: token budgeter - context allocation & clamping');

const budgeter = new TokenBudgeter(10000);
const budgets = budgeter.getBudgets();
ok(budgets.total === 10000, 'total allowance is 10,000 tokens');
ok(budgets.rules === 1000, 'rules allocated 1,000 tokens (10%)');
ok(budgets.memory === 1500, 'memory allocated 1,500 tokens (15%)');
ok(budgets.symbols === 2500, 'symbols allocated 2,500 tokens (25%)');
ok(budgets.history === 4000, 'history allocated 4,000 tokens (40%)');
ok(budgets.reserve === 1000, 'reserve allocated 1,000 tokens (10%)');

// Test payload clamping
const shortText = 'Small gotcha fix for deadlock';
const shortRes = budgeter.clampPayload(shortText, 'memory');
ok(shortRes.clamped === false, 'short payload not clamped');
ok(shortRes.text === shortText, 'short payload preserved intact');

const hugeText = 'A'.repeat(12000); // Exceeds memory budget of 1,500 tokens (~5,700 chars)
const hugeRes = budgeter.clampPayload(hugeText, 'memory');
ok(hugeRes.clamped === true, 'oversized payload clamped successfully');
ok(hugeRes.text.includes('[Context truncated by AEOS Token Budgeter]'), 'clamped text includes budgeter notice');
ok(hugeRes.tokens <= 1600, `clamped tokens within budget ceiling (got: ${hugeRes.tokens})`);

console.log('z-runtime: DAG execution planner & topological layering');

const bugPlan = DAGPlanner.buildPlan(bugIntent, {
  prompt: 'Fix deadlock in stock transfer',
  targetFile: 'src/StockService.cs'
});

ok(Boolean(bugPlan.id), 'generated unique plan ID');
ok(bugPlan.category === INTENT_CATEGORIES.BUGFIX, 'plan matches bugfix category');
ok(bugPlan.steps.length === 5, `bugfix plan contains 5 steps (got: ${bugPlan.steps.length})`);

const batches = DAGPlanner.getExecutionBatches(bugPlan);
ok(batches.length === 3, `DAG organized into 3 sequential batches (got: ${batches.length})`);

// Layer 0: independent parallel steps (z-brain, z-mind, z-token)
const layer0Plugins = batches[0].map(s => s.pluginId);
ok(layer0Plugins.includes('z-brain'), 'layer 0 includes z-brain');
ok(layer0Plugins.includes('z-mind'), 'layer 0 includes z-mind');
ok(layer0Plugins.includes('z-token'), 'layer 0 includes z-token');
ok(batches[0].length === 3, 'layer 0 executes 3 steps in parallel');

// Layer 1: z-gate audit (depends on 1, 2, 3)
ok(batches[1].length === 1 && batches[1][0].pluginId === 'z-gate', 'layer 1 executes z-gate after initial sweep');

// Layer 2: z-brain harvest (depends on 4)
ok(batches[2].length === 1 && batches[2][0].pluginId === 'z-brain', 'layer 2 harvests verified atom after gate audit');

console.log('z-runtime: cognitive router facade & EventBus integration');

const runtime = new ZRuntime();
let intentEventSeen = false;
let planEventSeen = false;

runtime.eventBus.on('router:intent_classified', (evt) => {
  if (evt.intent.category === INTENT_CATEGORIES.BUGFIX) intentEventSeen = true;
});

runtime.eventBus.on('router:plan_created', (evt) => {
  if (evt.category === INTENT_CATEGORIES.BUGFIX) planEventSeen = true;
});

const routeRes = runtime.route('Fix deadlock in stock transfer batch processing');
ok(intentEventSeen, 'emitted router:intent_classified on EventBus');
ok(planEventSeen, 'emitted router:plan_created on EventBus');
ok(routeRes.plan.steps.length === 5, 'runtime.route returned valid 5-step DAG plan');
ok(routeRes.durationMs < 10, `routing executed in <10ms (got: ${routeRes.durationMs}ms)`);

console.log('\nall cognitive router tests passed!');
