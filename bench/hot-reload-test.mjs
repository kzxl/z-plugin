import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HotReloadManager, ZRuntime } from '../packages/z-runtime/src/index.mjs';
import { ENGINEERING_RULES, queryRules } from '../plugins/z-mind/scripts/lib/rules.mjs';
import { sanitizeFtsQuery } from '../plugins/z-brain/scripts/lib/search.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

let passedAssertions = 0;
function testAssert(condition, message) {
  assert.ok(condition, message);
  passedAssertions++;
}

console.log('🧪 Starting Hot-Reload & Dynamic Knowledge Invalidation Test Suite...\n');

async function runHotReloadTests() {
  // Test 1: Instantiation & Defaults
  const manager = new HotReloadManager();
  testAssert(manager !== null, 'HotReloadManager instantiated successfully');
  testAssert(typeof manager.reloadDlcs === 'function', 'reloadDlcs method exists');
  testAssert(typeof manager.reloadSynonyms === 'function', 'reloadSynonyms method exists');
  testAssert(typeof manager.hotReloadAll === 'function', 'hotReloadAll method exists');

  // Test 2: reloadDlcs loads dlc-erp
  const dlcRes = await manager.reloadDlcs(path.join(ROOT_DIR, 'extensions'));
  testAssert(dlcRes.success === true, 'reloadDlcs returns success');
  testAssert(dlcRes.reloaded >= 1, `reloadDlcs found and loaded at least 1 DLC (got: ${dlcRes.reloaded})`);
  testAssert(dlcRes.dlcs.some(d => d.id === 'dlc-erp'), 'dlc-erp is among loaded DLCs');

  // Verify DLC rules are active in z-mind
  const rulesCount = Object.keys(ENGINEERING_RULES).length;
  testAssert(rulesCount >= 56, `Rules count reflects registered DLC rules (got: ${rulesCount})`);
  const erpRules = queryRules('erp');
  testAssert(erpRules.length >= 1, 'queryRules returns contributed ERP rules');

  // Test 3: reloadSynonyms updates z-brain bilingual dictionary
  const synDict = await manager.reloadSynonyms();
  testAssert(typeof synDict === 'object' && Object.keys(synDict).length > 0, 'reloadSynonyms returns non-empty dictionary');
  testAssert(Array.isArray(synDict['ton kho']), 'ton kho key is present in synonyms');
  const sanitized = sanitizeFtsQuery('kiem tra ton kho');
  testAssert(sanitized.includes('inventory'), `sanitizeFtsQuery reflects reloaded synonyms (got: ${sanitized})`);

  // Test 4: hotReloadAll performance (<15ms) and atomic summary
  const t0 = Date.now();
  const summary = await manager.hotReloadAll();
  const duration = Date.now() - t0;
  testAssert(summary.success === true, 'hotReloadAll succeeds');
  testAssert(summary.dlcs >= 1, 'hotReloadAll reports reloaded DLCs');
  testAssert(summary.synonyms >= 5, 'hotReloadAll reports reloaded synonyms');
  testAssert(duration < 50, `hotReloadAll is sub-50ms fast (actual: ${duration}ms)`);

  // Test 5: Integration with ZRuntime and EventBus
  const runtime = new ZRuntime();
  let eventFired = false;
  let receivedPayload = null;

  runtime.eventBus.on('hotreload:complete', (payload) => {
    eventFired = true;
    receivedPayload = payload;
  });

  const rtSummary = await runtime.hotReload();
  testAssert(rtSummary.success === true, 'runtime.hotReload() returns success');
  testAssert(eventFired === true, 'hotreload:complete event was published to EventBus');
  testAssert(receivedPayload !== null && receivedPayload.dlcs >= 1, 'event payload contains reloaded DLC stats');

  console.log(`\n✅ Hot-Reload Test Suite PASSED (${passedAssertions} assertions verified).\n`);
}

runHotReloadTests().catch(err => {
  console.error('❌ Hot-Reload Test FAILED:', err);
  process.exit(1);
});
