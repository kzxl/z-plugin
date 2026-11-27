#!/usr/bin/env node
// TDD & Integration Test Suite for plugins/z-vision
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0;
function ok(cond, msg) {
  assert.ok(cond, msg);
  console.log('  ok  ', msg);
  passed++;
}

console.log('z-vision: TDD safety policy, vision engine, MCP & native verification\n');

// ---------------------------------------------------------------------------
// 1. Safety Policy Unit Tests (Cross-Platform)
// ---------------------------------------------------------------------------
const {
  classifyProcessTier,
  checkActionSafety,
  ObservationStore,
  mapPixelToScreen,
  mapCoordsToScreen,
  validatePlanSteps,
  validateParallelLanes
} = await import('../plugins/z-vision/scripts/lib/safety-policy.mjs');

ok(classifyProcessTier('WindowsTerminal.exe') === 'click-only', 'WindowsTerminal classified as click-only');
ok(classifyProcessTier('pwsh') === 'click-only', 'pwsh classified as click-only');
ok(classifyProcessTier('Code.exe') === 'click-only', 'VS Code classified as click-only');
ok(classifyProcessTier('consent.exe') === 'blocked', 'UAC consent.exe classified as blocked');
ok(classifyProcessTier('CredentialUIBroker.exe') === 'blocked', 'CredentialUIBroker classified as blocked');
ok(classifyProcessTier('notepad.exe') === 'full', 'notepad.exe classified as full');

// Terminal click-only fence
{
  const clickRes = checkActionSafety({
    action: 'click',
    processName: 'WindowsTerminal.exe',
    targetNode: { name: 'Settings', role: 'Button' },
    reason: 'Open settings tab'
  });
  ok(clickRes.allowed === true, 'click allowed on click-only terminal');

  const typeRes = checkActionSafety({
    action: 'type',
    processName: 'WindowsTerminal.exe',
    text: 'rm -rf /',
    reason: 'Run command'
  });
  ok(typeRes.allowed === false && typeRes.code === 'restricted_process', 'type blocked on click-only terminal');

  const clearTypeRes = checkActionSafety({
    action: 'clear_and_type',
    processName: 'WindowsTerminal.exe',
    text: 'whoami',
    reason: 'Clear and type'
  });
  ok(clearTypeRes.allowed === false && clearTypeRes.code === 'restricted_process', 'clear_and_type blocked on click-only terminal');

  const keyOverride = checkActionSafety({
    action: 'key',
    processName: 'Code.exe',
    keys: 'ctrl+s',
    allowRestricted: true,
    reason: 'Explicitly authorized shortcut'
  });
  ok(keyOverride.allowed === true, 'allowRestricted overrides click-only fence when explicitly set');
}

// Blocked process fence
{
  const uacRes = checkActionSafety({
    action: 'click',
    processName: 'consent.exe',
    targetNode: { name: 'Yes' },
    reason: 'Approve UAC'
  });
  ok(uacRes.allowed === false && uacRes.code === 'blocked_process', 'UAC/credential process blocks all input');
}

// EN & VI sensitive label detection
{
  const delRes = checkActionSafety({
    action: 'click',
    processName: 'erp.exe',
    targetNode: { name: 'Delete Invoice', role: 'Button' },
    reason: 'Click delete'
  });
  ok(delRes.allowed === false && delRes.code === 'confirmation_required', 'English sensitive label requires confirmation');

  const viPayRes = checkActionSafety({
    action: 'click',
    processName: 'erp.exe',
    targetNode: { name: 'Thanh toán ngay', role: 'Button' },
    reason: 'Click pay'
  });
  ok(viPayRes.allowed === false && viPayRes.code === 'confirmation_required', 'Vietnamese sensitive label requires confirmation');

  const viConfirmed = checkActionSafety({
    action: 'click',
    processName: 'erp.exe',
    targetNode: { name: 'Xóa dòng', role: 'Button' },
    confirmSensitive: true,
    reason: 'User explicitly approved row deletion'
  });
  ok(viConfirmed.allowed === true, 'Sensitive action allowed with confirmSensitive=true and reason');
}

// Dangerous hotkeys
{
  const altF4 = checkActionSafety({
    action: 'key',
    processName: 'notepad.exe',
    keys: 'Alt+F4',
    reason: 'Close window'
  });
  ok(altF4.allowed === false && altF4.code === 'confirmation_required', 'Alt+F4 blocked without confirmSensitive');

  const winR = checkActionSafety({
    action: 'key',
    processName: 'explorer.exe',
    keys: 'win+r',
    reason: 'Open run dialog'
  });
  ok(winR.allowed === false && winR.code === 'confirmation_required', 'Win+R blocked without confirmSensitive');
}

// ObservationStore one-use, stop invalidation, and window drift
{
  const store = new ObservationStore({ driftTolerancePx: 4 });
  const obs1 = store.create({
    hwnd: 1001,
    process: 'notepad.exe',
    bounds: { x: 100, y: 200, w: 800, h: 600 },
    imageSize: { w: 400, h: 300 },
    nodes: [{ i: 0, role: 'Button', name: 'OK', cx: 200, cy: 250 }],
    dhash: '0000000000000000'
  });
  ok(typeof obs1.observationId === 'string' && obs1.observationId.length > 6, 'ObservationStore issues observationId');

  // Map screenshot pixel (200, 150) on 400x300 scaled image -> 800x600 window at (100, 200) => (500, 500)
  const pt = mapPixelToScreen(obs1, 200, 150);
  ok(pt.x === 500 && pt.y === 500, `mapPixelToScreen scales DPI/downscaled image accurately (${pt.x},${pt.y})`);

  // coord_space tests: screen, window, client, image
  const obsSpaces = store.create({
    hwnd: 1002,
    process: 'mspaint.exe',
    bounds: { x: 100, y: 200, w: 800, h: 600 },
    clientBounds: { x: 110, y: 340, w: 780, h: 450 },
    imageSize: { w: 400, h: 300 },
    nodes: [],
    dhash: '0000000000000000'
  });
  const pScreen = mapCoordsToScreen(obsSpaces, 500, 400, 'screen');
  ok(pScreen.x === 500 && pScreen.y === 400, 'coord_space=screen preserves physical pixels');
  const pWin = mapCoordsToScreen(obsSpaces, 50, 60, 'window');
  ok(pWin.x === 150 && pWin.y === 260, 'coord_space=window offsets by visible bounds');
  const pClient = mapCoordsToScreen(obsSpaces, 20, 30, 'client');
  ok(pClient.x === 130 && pClient.y === 370, 'coord_space=client offsets by client_bounds');
  const pImg = mapCoordsToScreen(obsSpaces, 200, 150, 'image');
  ok(pImg.x === 500 && pImg.y === 500, 'coord_space=image scales from imageSize to bounds');

  // Wrong hwnd fails
  assert.throws(
    () => store.consume(obs1.observationId, 9999, { x: 100, y: 200, w: 800, h: 600 }),
    (err) => err.code === 'stale_observation',
    'consume rejects mismatched hwnd'
  );

  // Moved window beyond tolerance fails
  assert.throws(
    () => store.consume(obs1.observationId, 1001, { x: 150, y: 200, w: 800, h: 600 }),
    (err) => err.code === 'stale_observation',
    'consume rejects drifted window bounds'
  );

  // Valid consume succeeds once, second consume fails
  const consumed = store.consume(obs1.observationId, 1001, { x: 102, y: 200, w: 800, h: 600 });
  ok(consumed.hwnd === 1001, 'consume succeeds within drift tolerance');
  assert.throws(
    () => store.consume(obs1.observationId, 1001, { x: 102, y: 200, w: 800, h: 600 }),
    (err) => err.code === 'stale_observation',
    'consume rejects replay of already-used observationId'
  );

  // Stop invalidates prior observations
  const obs2 = store.create({
    hwnd: 1001,
    process: 'notepad.exe',
    bounds: { x: 100, y: 200, w: 800, h: 600 },
    imageSize: { w: 800, h: 600 },
    nodes: [],
    dhash: '0000000000000000'
  });
  store.invalidateAll();
  assert.throws(
    () => store.consume(obs2.observationId, 1001, { x: 100, y: 200, w: 800, h: 600 }),
    (err) => err.code === 'stale_observation',
    'invalidateAll invalidates unconsumed observations after Stop'
  );
}

// Batch plan pre-validation
{
  const badPlan = validatePlanSteps([], { processName: 'notepad.exe' });
  ok(badPlan.valid === false, 'Empty plan rejected');

  const unsafePlan = validatePlanSteps(
    [
      { action: 'click', index: 0, reason: 'Focus box' },
      { action: 'type', text: 'echo pwned', reason: 'Type into terminal' }
    ],
    { processName: 'pwsh.exe' }
  );
  ok(unsafePlan.valid === false && unsafePlan.stepIndex === 1 && unsafePlan.code === 'restricted_process', 'Plan pre-validation rejects unsafe step before any execution');

  const goodPlan = validatePlanSteps(
    [
      { action: 'click', index: 0, reason: 'Focus input' },
      { action: 'type', text: 'hello', reason: 'Enter query' },
      { action: 'clear_and_type', text: 'world', reason: 'Replace query' },
      { action: 'refresh_uia' },
      { action: 'wait_control', name: 'OK' },
      { action: 'batch_strokes', strokes: [[[10, 10], [20, 20]]], reason: 'Draw batch' },
      { action: 'wait_settle', timeout_ms: 1000 }
    ],
    { processName: 'notepad.exe' }
  );
  ok(goodPlan.valid === true, 'Valid plan with upgraded primitives passes pre-validation');

  const largePlan = validatePlanSteps(
    new Array(150).fill({ action: 'drag', from: [10, 10], to: [20, 20], reason: 'stroke' }),
    { processName: 'mspaint.exe' }
  );
  ok(largePlan.valid === true, 'Plan up to 200 steps passes pre-validation');

  const overPlan = validatePlanSteps(
    new Array(201).fill({ action: 'sleep', ms: 10 }),
    { processName: 'mspaint.exe' }
  );
  ok(overPlan.valid === false, 'Plan >200 steps rejected');
}

// Parallel lanes pre-validation
{
  const emptyLanes = validateParallelLanes([], { processName: 'mspaint.exe' });
  ok(emptyLanes.valid === false, 'Empty parallel lanes rejected');

  const tooMany = validateParallelLanes(new Array(9).fill({ id: 'L', steps: [{ action: 'click', x: 10, y: 10, reason: 'p' }] }), { processName: 'mspaint.exe' });
  ok(tooMany.valid === false, 'Parallel >8 lanes rejected');

  const unsafeLane = validateParallelLanes([
    { id: 'lane1', steps: [{ action: 'click', x: 10, y: 10, reason: 'ok' }] },
    { id: 'lane2', steps: [{ action: 'type', text: 'rm -rf', reason: 'bad' }] }
  ], { processName: 'pwsh.exe' });
  ok(unsafeLane.valid === false && unsafeLane.code === 'restricted_process', 'Parallel pre-validation blocks unsafe lane before execution');

  const validLanes = validateParallelLanes([
    { id: 'sky', steps: [{ action: 'drag', from: [10, 10], to: [100, 10], reason: 'stroke' }] },
    { id: 'field', steps: [{ action: 'drag', from: [10, 50], to: [100, 50], reason: 'stroke' }] }
  ], { processName: 'mspaint.exe' });
  ok(validLanes.valid === true, 'Valid multi-lane parallel plan passes pre-validation');
}

// ---------------------------------------------------------------------------
// 2. Vision Engine Unit Tests (Mock Host Transport)
// ---------------------------------------------------------------------------
const {
  createVisionEngine,
  hammingDistanceHex,
  formatCompactNodes
} = await import('../plugins/z-vision/scripts/lib/vision-engine.mjs');

ok(hammingDistanceHex('0000000000000000', '000000000000000f') === 4, 'hammingDistanceHex counts bit diffs');

{
  const formatted = formatCompactNodes([
    { i: 0, role: 'Button', name: 'Save', aid: 'btnSave', rect: [10, 20, 80, 30], cx: 50, cy: 35, enabled: true, offscreen: false, patterns: ['Invoke'] }
  ]);
  ok(formatted.includes('[0] Button "Save"') && formatted.includes('aid=btnSave') && formatted.includes('[Invoke]'), 'formatCompactNodes produces compact one-line UIA summary');
}

{
  const calls = [];
  let frameSeq = 0;
  const mockBounds = { x: 0, y: 0, w: 1000, h: 700 };
  const mockNodes = [
    { i: 0, role: 'Edit', name: 'Search', aid: 'txtSearch', rect: [20, 20, 200, 30], cx: 120, cy: 35, enabled: true, offscreen: false, patterns: ['Value'] },
    { i: 1, role: 'Button', name: 'Duplicate', aid: 'btnDup1', rect: [230, 20, 60, 30], cx: 260, cy: 35, enabled: true, offscreen: false, patterns: ['Invoke'] },
    { i: 2, role: 'Button', name: 'Duplicate', aid: 'btnDup2', rect: [300, 20, 60, 30], cx: 330, cy: 35, enabled: true, offscreen: false, patterns: ['Invoke'] },
    { i: 3, role: 'Button', name: 'Apply', aid: 'btnApply', rect: [370, 20, 60, 30], cx: 400, cy: 35, enabled: true, offscreen: false, patterns: ['Invoke'] },
    { i: 4, role: 'Text', name: 'Ready', aid: 'lblReady', rect: [20, 60, 100, 20], cx: 70, cy: 70, enabled: true, offscreen: false, patterns: [] }
  ];

  const mockClient = {
    async request(cmd, params = {}) {
      calls.push({ cmd, params });
      if (cmd === 'status') {
        return { platform: 'win32', emergency_stopped: false, winrt_ocr_available: true, monitors: [{ device: 'DISPLAY1', bounds: [0, 0, 1920, 1080], dpi: 96 }] };
      }
      if (cmd === 'windows') {
        return { windows: [{ hwnd: 4242, pid: 100, process: 'demo.exe', title: 'Demo App', bounds: mockBounds, foreground: true }] };
      }
      if (cmd === 'window_info') {
        return { hwnd: 4242, pid: 100, process: 'demo.exe', title: 'Demo App', bounds: mockBounds };
      }
      if (cmd === 'observe') {
        frameSeq++;
        const downscale = params.with_image !== false && (params.max_width || 1280) < 1000;
        return {
          hwnd: params.hwnd,
          process: 'demo.exe',
          title: 'Demo App',
          bounds: mockBounds,
          client_bounds: { x: 8, y: 40, w: 984, h: 652 },
          image_size: downscale ? { w: 500, h: 350 } : { w: 1000, h: 700 },
          dhash: frameSeq <= 2 ? 'aaaaaaaaaaaaaaaa' : 'ffffffffffffffff',
          nodes: mockNodes,
          image_base64: params.with_image === false ? null : Buffer.from('fakejpeg').toString('base64'),
          image_mime: params.with_image === false ? null : 'image/jpeg'
        };
      }
      if (cmd === 'parallel') {
        return {
          mode: params.mode || 'virtual',
          lanes: (params.lanes || []).map((l) => ({ id: l.id, ok: true, completed_steps: l.steps.length }))
        };
      }
      if (cmd === 'act') {
        if (params.action === 'type' && params.text === '__FAIL__') {
          const err = new Error('Simulated input error');
          err.code = 'input_failed';
          throw err;
        }
        return { executed: true, action: params.action };
      }
      if (cmd === 'stop') {
        return { emergency_stopped: params.action !== 'reset', released_keys: 1 };
      }
      throw new Error(`Unexpected mock cmd: ${cmd}`);
    }
  };

  const engine = createVisionEngine({ client: mockClient });

  // First observe attaches image (simulate max_width=500 downscale)
  const o1 = await engine.observe({ hwnd: 4242, with_image: 'auto', max_width: 500 });
  ok(Boolean(o1.image_base64) && o1.image_suppressed === false && o1.image_size.w === 500, 'First observe(with_image=auto) attaches scaled screenshot');

  // Second observe with identical dhash + >=5 UIA nodes suppresses redundant image AND keeps image_size unscaled (=bounds)
  const o2 = await engine.observe({ hwnd: 4242, with_image: 'auto', max_width: 500 });
  ok(o2.image_base64 === null && o2.image_suppressed === true && o2.dhash_distance === 0, 'Unchanged dHash with UIA nodes suppresses duplicate screenshot to save tokens');
  ok(o2.image_size.w === 1000 && o2.image_size.h === 700, 'Suppressed auto-image resets image_size to window bounds (no phantom scaling)');

  // Ambiguous name selector refused before consuming observation
  await assert.rejects(
    () => engine.act({ hwnd: 4242, observation_id: o2.observation_id, action: 'click', name: 'Duplicate', reason: 'Test ambiguity' }),
    (err) => err.code === 'ambiguous_target',
    'Ambiguous exact name selector refuses safely'
  );

  // Unconsumed o2 should still work with unique index
  const actOk = await engine.act({
    hwnd: 4242,
    observation_id: o2.observation_id,
    action: 'click',
    index: 3,
    reason: 'Click Apply',
    observe_after: true
  });
  ok(actOk.ok === true && Boolean(actOk.observation), 'act executes by UIA index and returns fresh observation when observe_after=true');

  // Plan stops on first failure and returns fresh observation
  const o3 = await engine.observe({ hwnd: 4242, with_image: false });
  const planRes = await engine.plan({
    hwnd: 4242,
    observation_id: o3.observation_id,
    steps: [
      { action: 'click', index: 0, reason: 'Focus search' },
      { action: 'type', text: '__FAIL__', reason: 'Trigger simulated error' },
      { action: 'click', index: 3, reason: 'Should not run' }
    ]
  });
  ok(planRes.ok === false && planRes.completed_steps === 1 && planRes.failed_step === 1 && Boolean(planRes.observation), 'plan stops on first failure and returns post-failure observation');

  // Parallel lanes execution (mock)
  const o4 = await engine.observe({ hwnd: 4242, with_image: false });
  const parRes = await engine.parallel({
    hwnd: 4242,
    observation_id: o4.observation_id,
    mode: 'virtual',
    coord_space: 'screen',
    lanes: [
      { id: 'arrow1', steps: [{ action: 'drag', from: [100, 100], to: [300, 100], reason: 'lane 1' }] },
      { id: 'arrow2', steps: [{ action: 'drag', from: [100, 200], to: [300, 200], reason: 'lane 2' }] }
    ]
  });
  ok(parRes.ok === true && parRes.lanes.length === 2 && Boolean(parRes.observation), 'parallel executes multi-lane virtual strokes and returns fresh observation');

  // Single-RPC plan_batch + refresh_uia mock test
  const batchCalls = [];
  const batchEngine = createVisionEngine({
    client: {
      async request(cmd, params = {}) {
        batchCalls.push({ cmd, params });
        if (cmd === 'window_info') return { hwnd: 4242, bounds: mockBounds };
        if (cmd === 'observe') {
          return {
            hwnd: 4242,
            process: 'demo.exe',
            title: 'Demo App',
            bounds: mockBounds,
            image_size: { w: 1000, h: 700 },
            dhash: '0000000000000000',
            nodes: mockNodes,
            image_base64: null
          };
        }
        if (cmd === 'plan_batch') {
          return { ok: true, completed_steps: params.steps.length };
        }
        throw new Error(`Unexpected cmd: ${cmd}`);
      }
    }
  });
  const obBatch = await batchEngine.observe({ hwnd: 4242, with_image: false });
  batchCalls.length = 0;
  const batchRes = await batchEngine.plan({
    hwnd: 4242,
    observation_id: obBatch.observation_id,
    speed: 'fast',
    with_uia: 'off',
    steps: [
      { action: 'click', index: 3, reason: 'Click Apply' },
      { action: 'batch_strokes', strokes: [[[10, 10], [50, 50]], [[60, 10], [90, 50]]], reason: 'Draw 2 strokes' },
      { action: 'sleep', ms: 10 },
      { action: 'refresh_uia' },
      { action: 'clear_and_type', index: 0, text: 'updated', reason: 'Set search' }
    ]
  });
  const rpcNames = batchCalls.map((c) => c.cmd);
  const batchRpcCount = rpcNames.filter((n) => n === 'plan_batch').length;
  ok(batchRes.ok === true && batchRes.completed_steps === 5 && batchRpcCount === 2, `plan_batch batches contiguous native steps around refresh_uia (${rpcNames.join(' -> ')})`);
}

// ---------------------------------------------------------------------------
// 3. MCP Server JSON-RPC Stdio Smoke Test
// ---------------------------------------------------------------------------
{
  const mcpPath = path.join(root, 'plugins', 'z-vision', 'scripts', 'mcp-server.mjs');
  const tmpData = fs.mkdtempSync(path.join(os.tmpdir(), 'z-vision-mcp-smoke-'));
  const child = spawn(process.execPath, [mcpPath], {
    cwd: root,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, ZVISION_DATA_DIR: tmpData }
  });

  let buf = '';
  const pending = new Map();
  let nextId = 1;
  child.stdout.on('data', (chunk) => {
    buf += chunk.toString('utf8');
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    const timer = setTimeout(() => reject(new Error(`MCP timeout: ${method}`)), 25000);
    pending.set(id, (msg) => {
      clearTimeout(timer);
      resolve(msg);
    });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });

  try {
    const init = await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'vision-test', version: '1.0' } });
    ok(init.result?.serverInfo?.name === 'z-vision', 'MCP initialize returns serverInfo.name=z-vision');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');

    const list = await rpc('tools/list', {});
    const toolNames = (list.result?.tools || []).map((t) => t.name);
    for (const expected of ['zvision_status', 'zvision_windows', 'zvision_observe', 'zvision_act', 'zvision_plan', 'zvision_parallel', 'zvision_ocr', 'zvision_analyze', 'zvision_stop']) {
      ok(toolNames.includes(expected), `MCP tools/list exposes ${expected}`);
    }
    const schemaTokens = Math.round(JSON.stringify(list.result?.tools || []).length / 4);
    ok(schemaTokens < 2500, `MCP tool schema stays token-efficient (~${schemaTokens} tokens)`);

    const bad = await rpc('tools/call', { name: 'zvision_nonexistent', arguments: {} });
    ok(bad.result?.isError === true, 'MCP unknown tool returns isError=true');
  } finally {
    child.kill();
    fs.rmSync(tmpData, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// 4. Real Windows Native Compilation + Read-Only Observe / OCR / Stop Verification
// ---------------------------------------------------------------------------
if (process.platform === 'win32') {
  const { ensureNativeHost } = await import('../plugins/z-vision/scripts/lib/native-builder.mjs');
  const { createHostClient } = await import('../plugins/z-vision/scripts/lib/host-client.mjs');

  const tmpNativeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'z-vision-native-test-'));
  let client = null;
  let probeFormProc = null;
  try {
    const buildInfo = ensureNativeHost({ dataDir: tmpNativeDir, force: true });
    ok(fs.existsSync(buildInfo.exePath), `Stock csc.exe compiled native host: ${path.basename(buildInfo.exePath)} (winrtOcr=${buildInfo.winrtOcr})`);

    client = createHostClient({ dataDir: tmpNativeDir });
    const engine = createVisionEngine({ client });

    const st = await engine.status();
    ok(Array.isArray(st.monitors) && st.monitors.length >= 1, `Native status detected ${st.monitors.length} monitor(s)`);
    ok(st.emergency_stopped === false, 'Native status reports emergency_stopped=false initially');
    ok(st.virtual_mouse === true, 'Native status reports virtual_mouse=true');
    ok(typeof st.pen_injection_available === 'boolean', `Native status reports pen_injection_available=${st.pen_injection_available}`);

    // Always spawn an isolated WinForms probe window in this desktop for safe virtual click + parallel test
    const psScript = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      '$f = New-Object System.Windows.Forms.Form',
      "$f.Text = 'ZVisionProbeWindow'",
      '$f.Width = 420; $f.Height = 260',
      "$f.StartPosition = 'Manual'; $f.Location = New-Object System.Drawing.Point(40, 40)",
      '$f.BackColor = [System.Drawing.Color]::White',
      '$lbl = New-Object System.Windows.Forms.Label',
      "$lbl.Text = 'ZVision Probe Ready 2026'",
      "$lbl.Font = New-Object System.Drawing.Font('Segoe UI', 14)",
      '$lbl.SetBounds(20, 20, 360, 40)',
      '$btn = New-Object System.Windows.Forms.Button',
      "$btn.Text = 'ApplyProbe'",
      "$btn.Name = 'btnApplyProbe'",
      '$btn.SetBounds(20, 80, 140, 40)',
      "$btn.Add_Click({ $lbl.Text = 'CLICKED_VIRTUAL' })",
      '$f.Controls.Add($lbl); $f.Controls.Add($btn)',
      "$f.Add_Shown({ [Console]::Out.WriteLine('READY:' + $f.Handle.ToInt64()); [Console]::Out.Flush() })",
      '[System.Windows.Forms.Application]::Run($f)'
    ].join('\n');
    const encodedPs = Buffer.from(psScript, 'utf16le').toString('base64');
    probeFormProc = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encodedPs], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: false
    });
    let probeErr = '';
    probeFormProc.stderr.on('data', (d) => { probeErr += d.toString('utf8'); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Probe WinForms window timed out: ${probeErr}`)), 15000);
      probeFormProc.stdout.on('data', (d) => {
        if (d.toString('utf8').includes('READY:')) {
          clearTimeout(timer);
          resolve();
        }
      });
    });

    const winRes = await engine.windows({ include_hidden: false, filter: 'ZVisionProbeWindow' });
    ok(Array.isArray(winRes.windows) && winRes.windows.length >= 1, `Native windows enumerated ${winRes.windows.length} probe window(s)`);

    const candidate = winRes.windows[0];
    ok(candidate.client_bounds && candidate.client_bounds.w > 0, 'Native windows returns DWM client_bounds');
    const obs = await engine.observe({ hwnd: candidate.hwnd, with_image: true, max_width: 800, max_nodes: 60 });
    ok(/^[0-9a-f]{16}$/.test(obs.dhash), `Native observe computed 64-bit dHash (${obs.dhash})`);
    ok(Array.isArray(obs.nodes), `Native observe walked UIA tree (${obs.nodes.length} nodes)`);
    ok(typeof obs.image_base64 === 'string' && obs.image_base64.length > 100, `Native observe captured screenshot (${obs.image_base64.length} b64 chars)`);

    // Verify with_uia='off', with_uia='diff', and ROI capture
    const obsNoUia = await engine.observe({ hwnd: candidate.hwnd, with_image: false, with_uia: 'off' });
    ok(obsNoUia.uia_skipped === true && obsNoUia.nodes.length === 0, 'Native observe(with_uia=off) skips UIA traversal');

    const obsDiff1 = await engine.observe({ hwnd: candidate.hwnd, with_image: false, with_uia: 'diff' });
    const obsDiff2 = await engine.observe({ hwnd: candidate.hwnd, with_image: false, with_uia: 'diff' });
    ok(obsDiff2.uia_unchanged === true && obsDiff2.nodes.length === obsDiff1.nodes.length, 'Native observe(with_uia=diff) omits redundant UIA wire payload while preserving cached nodes');

    const cb = candidate.client_bounds;
    const obsRoi = await engine.observe({
      hwnd: candidate.hwnd,
      with_image: true,
      with_uia: 'off',
      roi: [cb.x + 10, cb.y + 10, 200, 120]
    });
    ok(obsRoi.roi && obsRoi.image_size.w === 200 && obsRoi.image_size.h === 120, `Native observe(roi) captures exact cropped dimensions (${obsRoi.image_size.w}x${obsRoi.image_size.h})`);

    // Verify native sample_pixels & find_color_bounds on white probe window
    const pxRes = await engine.samplePixels({ hwnd: candidate.hwnd, points: [[cb.x + 300, cb.y + 150]] });
    const pt0 = pxRes.pixels?.[0];
    ok(pt0 && pt0.in_bounds === true && pt0.r > 240 && pt0.g > 240 && pt0.b > 240, `Native samplePixels reads white probe pixel (${pt0?.hex})`);

    const boundsRes = await engine.findColorBounds({
      hwnd: candidate.hwnd,
      target_rgb: [255, 255, 255],
      tolerance: 15,
      roi: [cb.x, cb.y, cb.w, cb.h]
    });
    ok(boundsRes.found === true && boundsRes.w > 200 && boundsRes.h > 100, `Native findColorBounds locates white interior (${boundsRes.w}x${boundsRes.h})`);

    // Verify virtual mouse click triggers WinForms button without hijacking hardware cursor
    const btnNode = obs.nodes.find((n) => n.name === 'ApplyProbe' || n.aid === 'btnApplyProbe');
    ok(Boolean(btnNode), 'Probe UIA tree contains ApplyProbe button');
    const cursorBefore = (await engine.status()).cursor_pos;
    const vClick = await engine.act({
      hwnd: candidate.hwnd,
      observation_id: obs.observation_id,
      action: 'click',
      mode: 'virtual',
      show_arrows: false,
      index: btnNode.i,
      reason: 'Verify virtual mouse click without moving hardware cursor',
      observe_after: true
    });
    ok(vClick.ok === true, 'Virtual click succeeded');
    const cursorAfter = (await engine.status()).cursor_pos;
    ok(cursorBefore[0] === cursorAfter[0] && cursorBefore[1] === cursorAfter[1], 'Virtual click left hardware cursor untouched');
    const updatedLbl = (vClick.observation?.nodes || []).find((n) => n.name === 'CLICKED_VIRTUAL');
    ok(Boolean(updatedLbl), 'Virtual click triggered WinForms button Click event (label -> CLICKED_VIRTUAL)');
    ok(vClick.observation?.visual_changed === true && Array.isArray(vClick.observation?.dirty_rect), 'Post-click observation detects visual_changed and dirty_rect');

    // Verify native 1-RPC plan_batch with batch_strokes in virtual mode
    const planBatchRes = await engine.plan({
      hwnd: candidate.hwnd,
      observation_id: vClick.observation.observation_id,
      mode: 'virtual',
      coord_space: 'client',
      show_arrows: false,
      with_uia: 'off',
      steps: [
        { action: 'batch_strokes', strokes: [[[200, 40], [320, 40]], [[200, 60], [320, 60]]], steps: 2, reason: 'native batch strokes' }
      ]
    });
    ok(planBatchRes.ok === true && planBatchRes.completed_steps === 1, 'Native 1-RPC plan_batch with batch_strokes completed');

    // Verify native vectorizeImage & compareReference using generated synthetic PNG
    const testImgPath = path.join(tmpNativeDir, 'sample-landscape.png');
    const psImg = [
      'Add-Type -AssemblyName System.Drawing',
      '$bmp = New-Object System.Drawing.Bitmap(120, 90)',
      '$g = [System.Drawing.Graphics]::FromImage($bmp)',
      '$g.FillRectangle([System.Drawing.Brushes]::LightSkyBlue, 0, 0, 120, 45)',
      '$g.FillRectangle([System.Drawing.Brushes]::DarkGreen, 0, 45, 120, 45)',
      '$g.FillEllipse([System.Drawing.Brushes]::Gold, 20, 15, 24, 24)',
      "$bmp.Save('" + testImgPath.replace(/'/g, "''") + "', [System.Drawing.Imaging.ImageFormat]::Png)",
      '$g.Dispose(); $bmp.Dispose()'
    ].join('; ');
    const { spawnSync } = await import('node:child_process');
    spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', psImg], { encoding: 'utf8' });

    const vecRes = await engine.vectorizeImage({
      image_path: testImgPath,
      canvas_rect: [cb.x + 10, cb.y + 10, 300, 200],
      palette_size: 4,
      max_strokes: 80
    });
    ok(Array.isArray(vecRes.palette) && vecRes.palette.length === 4 && vecRes.stroke_count > 0 && Array.isArray(vecRes.layers), `Native vectorizeImage produced ${vecRes.palette?.length} CIELAB colors and ${vecRes.stroke_count} strokes`);

    const cmpRes = await engine.compareReference({
      hwnd: candidate.hwnd,
      image_path: testImgPath,
      roi: [cb.x, cb.y, cb.w, cb.h],
      grid_cols: 4,
      grid_rows: 3,
      top_n: 3
    });
    ok(typeof cmpRes.similarity_pct === 'number' && Array.isArray(cmpRes.high_error_tiles) && cmpRes.high_error_tiles.length === 3, `Native compareReference returned similarity=${cmpRes.similarity_pct}% and ${cmpRes.high_error_tiles?.length} top error tiles`);

    // Verify parallel virtual lanes
    const parNative = await engine.parallel({
      hwnd: candidate.hwnd,
      observation_id: planBatchRes.observation.observation_id,
      mode: 'virtual',
      coord_space: 'client',
      show_arrows: false,
      lanes: [
        { id: 'arrow1', steps: [{ action: 'drag', from: [200, 80], to: [320, 80], steps: 2, reason: 'virtual drag 1' }] },
        { id: 'arrow2', steps: [{ action: 'drag', from: [200, 120], to: [320, 120], steps: 2, reason: 'virtual drag 2' }] }
      ]
    });
    ok(parNative.ok === true && parNative.lanes.length === 2, 'Native parallel virtual lanes completed');

    const ocrRes = await engine.ocr({ hwnd: candidate.hwnd });
    ok(ocrRes && typeof ocrRes.available === 'boolean', `Native OCR returned structured result (available=${ocrRes.available})`);

    const stopRes = await engine.stop({ action: 'stop' });
    ok(stopRes.emergency_stopped === true, 'Native emergency stop latched');
    const resetRes = await engine.stop({ action: 'reset' });
    ok(resetRes.emergency_stopped === false, 'Native emergency stop reset cleanly');
  } finally {
    if (probeFormProc) {
      try { probeFormProc.kill(); } catch {}
    }
    if (client) await client.close();
    fs.rmSync(tmpNativeDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
} else {
  console.log('  skip  Windows native compilation & read-only integration (non-win32 host)');
}

console.log(`\nAll z-vision tests passed (${passed} assertions).`);
