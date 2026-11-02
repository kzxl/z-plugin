#!/usr/bin/env node
/**
 * Z-Craft Benchmark & Automated Test Suite
 * Tests Anti-Slop AST Linter, Design Token Bridge, Spec Generator (Inter-Plugin Mesh), Generative Canvas, and Time-Machine.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { lintUiContent, lintUiFiles, loadWorkspaceTokens } from '../plugins/z-craft/scripts/lib/anti-slop-linter.mjs';
import { generateMicroSpec } from '../plugins/z-craft/scripts/lib/spec-generator.mjs';
import { generateCanvasWidget } from '../plugins/z-craft/scripts/lib/generative-canvas.mjs';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../plugins/z-craft/scripts/lib/time-machine.mjs';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  ok  ', msg);
}

console.log('z-craft: anti-slop linter & design token bridge');

// 1. Token Bridge test
const tokens = loadWorkspaceTokens();
ok(Array.isArray(tokens) && tokens.length > 5, `loaded workspace tokens (got: ${tokens.length})`);
ok(tokens.includes('bg-primary'), 'contains bg-primary token');
ok(tokens.includes('border-border'), 'contains border-border token');

// 2. Anti-Slop Linter tests with Smart Token FixHints
const sloppysnippet = `
export function BadComponent() {
  return (
    <div className="bg-gradient-to-r from-purple-500 to-indigo-500 shadow-2xl p-6">
      <h1 style={{ color: "#7c3aed" }}>Lorem ipsum dolor sit amet</h1>
      <button onClick={() => {}}>Click me</button>
    </div>
  );
}
`;

const report = lintUiContent(sloppysnippet, 'BadComponent.tsx');
ok(!report.passed, 'detects failure on sloppy AI snippet');
ok(report.violations.some(v => v.ruleId === 'AS-1'), 'caught arbitrary hex color (AS-1)');

const hexViolation = report.violations.find(v => v.ruleId === 'AS-1');
ok(hexViolation.fixHint.includes('bg-primary') || hexViolation.fixHint.includes('primary'), 'smart token bridge suggests primary token for #7c3aed');

ok(report.violations.some(v => v.ruleId === 'AS-2'), 'caught neon gradient (AS-2)');
ok(report.violations.some(v => v.ruleId === 'AS-3'), 'caught floaty shadow (AS-3)');
ok(report.violations.some(v => v.ruleId === 'AS-4'), 'caught placeholder text (AS-4)');
ok(report.violations.some(v => v.ruleId === 'AS-5'), 'caught dead click handler (AS-5)');
ok(report.score < 50, `calculated degraded craftsmanship score (got: ${report.score})`);

// Clean snippet
const cleanSnippet = `
export function CleanComponent({ title, onAction }: CleanProps) {
  return (
    <div className="bg-surface border border-border rounded-md p-4 text-foreground">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <button onClick={onAction} className="mt-3 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:opacity-90">
        Thực hiện
      </button>
    </div>
  );
}
`;

const cleanReport = lintUiContent(cleanSnippet, 'CleanComponent.tsx');
ok(cleanReport.passed, 'passes clean enterprise component');
ok(cleanReport.violations.length === 0, 'zero violations found in clean component');
ok(cleanReport.score === 100, 'craftsmanship score is 100/100');

console.log('z-craft: UX micro-spec generator (inter-plugin mesh)');

// 3. Spec generator tests
const spec = generateMicroSpec('Màn hình kiểm kê kho vật tư thép có cảnh báo', { format: 'json' });
ok(spec.domain === 'Warehouse & Inventory', `correctly identified domain: ${spec.domain}`);
ok(Boolean(spec.stateMatrix.defaultState), 'contains default state');
ok(Boolean(spec.stateMatrix.loadingState), 'contains loading state (skeleton)');
ok(Boolean(spec.stateMatrix.emptyState), 'contains empty state');
ok(Boolean(spec.stateMatrix.errorState), 'contains error state with retry');
ok(spec.edgeCases.length >= 3, 'contains at least 3 edge case defenses');
ok(Array.isArray(spec.reusableAssets), 'mesh includes reusableAssets from z-gate');
ok(Array.isArray(spec.historicalGotchas), 'mesh includes historicalGotchas from z-brain');

const mdSpec = generateMicroSpec('Customer Billing Ledger with Excel export', { format: 'markdown' });
ok(typeof mdSpec === 'string' && mdSpec.includes('UX Micro-Contract'), 'generates markdown formatted spec');
ok(mdSpec.includes('Mandatory UI State Matrix'), 'markdown contains state matrix table');

console.log('z-craft: generative canvas preview checks');

// 4. Generative canvas tests
const widget = generateCanvasWidget({ title: 'Warehouse Stock Grid' });
ok(Boolean(widget.html), 'generates non-empty HTML canvas');
ok(widget.html.includes('Warehouse Stock Grid'), 'canvas contains safe title');
ok(widget.html.includes('tailwindcss'), 'canvas imports Tailwind CDN');
ok(widget.html.includes('switchState'), 'canvas includes state switcher script');
ok(widget.previewBlock.startsWith('<antigravity-ui'), 'generates Antigravity generative UI block');

console.log('z-craft: vibe time-machine checks');

// 5. Time machine tests
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcraft-test-'));
const testFile = path.join(tmpDir, 'Component.tsx');
fs.writeFileSync(testFile, 'export const V1 = 1;', 'utf8');

const snapshotRes = createCheckpoint(tmpDir, 'v1_initial', ['Component.tsx']);
ok(snapshotRes.success, 'snapshot created successfully');
ok(snapshotRes.fileCount === 1, `saved 1 file in snapshot`);

// Modify file
fs.writeFileSync(testFile, 'export const V2_BROKEN = 2;', 'utf8');
ok(fs.readFileSync(testFile, 'utf8') === 'export const V2_BROKEN = 2;', 'file modified to V2');

// List snapshots
const list = listCheckpoints(tmpDir);
ok(list.length >= 1, `found at least 1 checkpoint (got: ${list.length})`);
ok(list[0].name === 'v1_initial', 'listed correct checkpoint name');

// Restore snapshot
const restoreRes = restoreCheckpoint(tmpDir, 'v1_initial');
ok(restoreRes.success, 'snapshot restored successfully');
ok(fs.readFileSync(testFile, 'utf8') === 'export const V1 = 1;', 'file successfully reverted to V1');

// Clean up
fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\nall z-craft tests passed!');
