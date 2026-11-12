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

  // 2. Universal Rules Generation (Compact Diet & Full Unabridged)
  const compactRules = generateUniversalRules('compact');
  testAssert(compactRules.includes('# AEOS Universal Engineering Invariants'), 'Compact rules header generated');
  testAssert(compactRules.includes('[R_CORE]'), 'R_CORE invariant present in compact rules');
  testAssert(compactRules.includes('[R_TDD]'), 'R_TDD invariant present in compact rules');
  testAssert(compactRules.length < 2000, `Compact rules are <2000 chars for token diet (got: ${compactRules.length})`);

  const fullRules = generateUniversalRules('full');
  testAssert(fullRules.includes('# AEOS Universal Agent Engineering Rules'), 'Full rules header generated');
  testAssert(fullRules.length > 20000, 'Full rules contain complete specifications');

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

  // 3b. Codex: TOML MCP servers + hook file + AGENTS.md
  fs.mkdirSync(path.join(tempDir, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, '.codex', 'config.toml'), '[mcp_servers.custom]\ncommand = "node"\nargs = ["custom.mjs"]\n', 'utf8');

  const codexExport = exportAgentConfig('codex', tempDir);
  testAssert(fs.existsSync(codexExport.files[0]), 'codex AGENTS.md exists');
  const codexToml = fs.readFileSync(path.join(tempDir, '.codex', 'config.toml'), 'utf8');
  testAssert(codexToml.includes('[mcp_servers.custom]'), 'codex preserves existing MCP server');
  testAssert(codexToml.includes('[mcp_servers.z-brain]'), 'codex registers z-brain MCP server');
  const codexHooks = JSON.parse(fs.readFileSync(path.join(tempDir, '.codex', 'hooks.json'), 'utf8'));
  testAssert(codexHooks.hooks?.PostToolUse?.[0]?.hooks?.[0]?.command?.includes('observe.mjs'), 'codex hooks record edits');

  // 3c. Qoder: merge settings without clobbering user config
  fs.mkdirSync(path.join(tempDir, '.qoder'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, '.qoder', 'settings.json'), JSON.stringify({
    mcpServers: { custom: { command: 'node', args: ['custom.mjs'] } },
    hooks: { PostToolUse: [{ matcher: 'User', hooks: [{ type: 'command', command: 'echo user' }] }] },
  }), 'utf8');

  const qoderExport = exportAgentConfig('qoder', tempDir);
  testAssert(fs.existsSync(qoderExport.files[0]), 'qoder AGENTS.md exists');
  const qoderSettings = JSON.parse(fs.readFileSync(path.join(tempDir, '.qoder', 'settings.json'), 'utf8'));
  testAssert(qoderSettings.mcpServers.custom, 'qoder preserves existing MCP server');
  testAssert(qoderSettings.mcpServers['z-brain'], 'qoder registers z-brain MCP server');
  testAssert(qoderSettings.hooks.PostToolUse.length === 2, 'qoder appends observer hook group');
  exportAgentConfig('qoder', tempDir);
  const qoderAgain = JSON.parse(fs.readFileSync(path.join(tempDir, '.qoder', 'settings.json'), 'utf8'));
  testAssert(qoderAgain.hooks.PostToolUse.length === 2, 'qoder re-export does not duplicate hooks');

  // 3d. Antigravity: named hook group + MCP config
  fs.mkdirSync(path.join(tempDir, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(tempDir, '.agents', 'hooks.json'), JSON.stringify({
    other: { PostToolUse: [{ matcher: 'X', hooks: [{ type: 'command', command: 'echo other' }] }] },
  }), 'utf8');

  const antigravityExport = exportAgentConfig('antigravity', tempDir);
  testAssert(fs.existsSync(antigravityExport.files[0]), 'antigravity AGENTS.md exists');
  const agyHooks = JSON.parse(fs.readFileSync(path.join(tempDir, '.agents', 'hooks.json'), 'utf8'));
  testAssert(agyHooks.other && agyHooks['z-brain'], 'antigravity preserves existing groups and adds z-brain');
  testAssert(agyHooks['z-brain'].PostToolUse?.[0]?.hooks?.[0]?.command?.includes('observe.mjs'), 'antigravity hooks record edits');
  const agyMcp = JSON.parse(fs.readFileSync(path.join(tempDir, '.agents', 'mcp_config.json'), 'utf8'));
  testAssert(agyMcp.mcpServers['z-brain'], 'antigravity registers z-brain MCP server');

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
