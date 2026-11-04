import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { generateMcpServerConfigs, generateUniversalRules, exportAgentConfig } from '../tools/agent-bridge.mjs';
import { LocalIpcBridge } from '../packages/z-runtime/src/cross-process-ipc.mjs';
import { IntentClassifier, INTENT_CATEGORIES } from '../packages/z-runtime/src/cognitive-router.mjs';
import { calculateSemanticSimilarity, searchKnowledge } from '../plugins/z-brain/scripts/lib/search.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aeos-bridge-test-'));

let passed = 0;
function testAssert(cond, msg) {
  assert.ok(cond, msg);
  passed++;
}

console.log('🧪 Starting Universal Agent Bridge & Bottlenecks Test Suite...\n');

async function runTests() {
  // 1. Universal MCP Generation
  const mcp = generateMcpServerConfigs();
  testAssert(mcp['z-token'] && mcp['z-token'].command, 'z-token MCP entry generated');
  testAssert(mcp['z-brain'] && mcp['z-brain'].args.length > 0, 'z-brain MCP entry generated');
  testAssert(mcp['z-mind'] && mcp['z-mind'].command, 'z-mind MCP entry generated');
  testAssert(mcp['z-gate'] && mcp['z-gate'].command, 'z-gate MCP entry generated');
  testAssert(mcp['z-craft'] && mcp['z-craft'].command, 'z-craft MCP entry generated');

  // 2. Universal Rules Generation
  const rulesMd = generateUniversalRules();
  testAssert(rulesMd.includes('# AEOS Universal Agent Engineering Rules'), 'Rules header generated');
  testAssert(rulesMd.includes('[R_CORE]'), 'R_CORE invariant present in rules');
  testAssert(rulesMd.includes('[R_TDD]'), 'R_TDD invariant present in rules');

  // 3. Export Configurations for Cursor, Claude, Windsurf, Copilot
  const cursorExport = exportAgentConfig('cursor', tempDir);
  testAssert(fs.existsSync(cursorExport.files[0]), '.cursorrules exists');
  testAssert(fs.existsSync(cursorExport.files[1]), '.cursor/mcp.json exists');

  const claudeExport = exportAgentConfig('claude', tempDir);
  testAssert(fs.existsSync(claudeExport.files[0]), 'CLAUDE.md exists');
  testAssert(fs.existsSync(claudeExport.files[1]), '.claude_mcp.json exists');

  const windsurfExport = exportAgentConfig('windsurf', tempDir);
  testAssert(fs.existsSync(windsurfExport.files[0]), '.windsurfrules exists');

  const copilotExport = exportAgentConfig('copilot', tempDir);
  testAssert(fs.existsSync(copilotExport.files[0]), 'copilot-instructions.md exists');

  // 4. Cross-Process Local IPC & Lock
  const ipcDir = path.join(tempDir, 'ipc');
  const agent1 = new LocalIpcBridge({ ipcDir });
  const agent2 = new LocalIpcBridge({ ipcDir });

  let receivedTopic = null;
  let receivedPayload = null;

  agent2.startListening((topic, payload) => {
    receivedTopic = topic;
    receivedPayload = payload;
  });

  // Agent 1 broadcasts event
  agent1.broadcast('dlc:reload_requested', { dlcId: 'dlc-erp', triggeredBy: 'ClaudeCode' });

  // Allow watcher event loop to flush
  await new Promise(r => setTimeout(r, 80));

  testAssert(receivedTopic === 'dlc:reload_requested', `Cross-process IPC delivered event (got: ${receivedTopic})`);
  testAssert(receivedPayload && receivedPayload.dlcId === 'dlc-erp', 'Cross-process payload delivered intact');

  // Distributed File Lock
  let lockedExecution = false;
  await agent1.withLock('db_migration', async () => {
    lockedExecution = true;
  });
  testAssert(lockedExecution === true, 'withLock executed successfully');

  // Stream Rotation & Compaction check
  const rotatingBridge = new LocalIpcBridge({
    ipcDir: path.join(tempDir, 'rotate_ipc'),
    maxStreamSize: 200, // Very small byte ceiling for test
    keepLinesOnRotate: 2
  });
  for (let i = 0; i < 10; i++) {
    rotatingBridge.broadcast('test:ping', { seq: i });
  }
  const linesInStream = fs.readFileSync(rotatingBridge.eventStreamPath, 'utf8').split('\n').filter(Boolean);
  testAssert(linesInStream.length <= 4, `Stream rotated and kept bounded lines (got: ${linesInStream.length})`);

  agent2.stopListening();

  // 5. Semantic Trigram Similarity
  const sim1 = calculateSemanticSimilarity('ton kho', 'kiem tra ton kho');
  testAssert(sim1 > 0.4, `Semantic similarity is high for related Vietnamese phrases (got: ${sim1})`);
  const sim2 = calculateSemanticSimilarity('deadlock database query', 'async deadlock in sql query');
  testAssert(sim2 > 0.4, `Semantic similarity is high for related English technical phrases (got: ${sim2})`);

  // 6. Colloquial Intent Classification
  const bugRes = IntentClassifier.classify('chỗ này bị tạch test rồi sửa giùm');
  testAssert(bugRes.category === INTENT_CATEGORIES.BUGFIX, `Classified colloquial Vietnamese bugfix (got: ${bugRes.category})`);

  const refactorRes = IntentClassifier.classify('dọn dẹp bớt mấy cái code thừa thãi');
  testAssert(refactorRes.category === INTENT_CATEGORIES.REFACTOR, `Classified colloquial Vietnamese refactor (got: ${refactorRes.category})`);

  const reviewRes = IntentClassifier.classify('soát lại code xem có bị thủng bảo mật không');
  testAssert(reviewRes.category === INTENT_CATEGORIES.REVIEW, `Classified colloquial Vietnamese review (got: ${reviewRes.category})`);

  console.log(`\n✅ Universal Agent Bridge & Bottlenecks Test Suite PASSED (${passed} assertions verified).\n`);
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
}).finally(() => {
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
});
