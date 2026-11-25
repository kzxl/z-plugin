#!/usr/bin/env node
/**
 * Z-Craft Benchmark & Automated Test Suite
 * Tests Canonical Anti-Slop Linter (AS-01..AS-12, AS-C1..AS-C3, AS-I1, AS-D1..AS-D4, AS-S1),
 * WCAG 2.1 Token Auditor, Diff Scoping, Inline Suppressions, Spec Generator, Generative Canvas,
 * Scaffolder Dogfooding, and Time-Machine.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import {
  lintUiContent,
  lintUiFiles,
  loadWorkspaceTokens,
  auditTokens,
  parseUnifiedDiff
} from '../plugins/z-craft/scripts/lib/anti-slop-linter.mjs';
import { generateMicroSpec } from '../plugins/z-craft/scripts/lib/spec-generator.mjs';
import { generateCanvasWidget, generateGraphCanvasWidget } from '../plugins/z-craft/scripts/lib/generative-canvas.mjs';
import { createCheckpoint, listCheckpoints, restoreCheckpoint } from '../plugins/z-craft/scripts/lib/time-machine.mjs';
import { scaffoldComponent } from '../plugins/z-craft/scripts/lib/scaffolder.mjs';

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  ok  ', msg);
}

console.log('1. z-craft: design token bridge & canonical anti-slop linter');

// Token Bridge test
const tokens = loadWorkspaceTokens();
ok(Array.isArray(tokens) && tokens.length > 10, `loaded workspace tokens (got: ${tokens.length})`);
ok(tokens.includes('--brand-primary'), 'contains canonical --brand-primary token');
ok(tokens.includes('--bg-surface'), 'contains canonical --bg-surface token');
ok(tokens.includes('bg-primary'), 'contains Tailwind bg-primary token');

// Sloppy AI snippet (canonical rule coverage)
const sloppySnippet = `
export function BadComponent() {
  // Added by Agent on 2026-11-25
  // var oldPrice = 100;
  // get the title
  return (
    <div className="bg-gradient-to-r from-purple-500 to-indigo-500 shadow-2xl backdrop-blur-md p-6">
      <Card>
        <Card>
          <span className="rounded-full animate-pulse">🔥</span>
          <h1 style={{ color: "#7c3aed", textShadow: "0 0 10px #7c3aed" }}>Lorem ipsum dolor sit amet</h1>
          <button className="outline-none" onClick={() => {}}>Click me</button>
        </Card>
      </Card>
    </div>
  );
}
`;

const report = lintUiContent(sloppySnippet, 'BadComponent.tsx');
ok(!report.passed, 'detects failure on sloppy AI snippet');
ok(report.violations.some((v) => v.ruleId === 'AS-01'), 'caught arbitrary hex color (AS-01)');
const hexViolation = report.violations.find((v) => v.ruleId === 'AS-01');
ok(hexViolation.fixHint.includes('bg-primary') || hexViolation.fixHint.includes('--brand-primary'), 'smart token bridge suggests primary token for #7c3aed');
ok(report.violations.some((v) => v.ruleId === 'AS-02'), 'caught text-shadow / floaty shadow (AS-02)');
ok(report.violations.some((v) => v.ruleId === 'AS-03'), 'caught idle animate-pulse (AS-03)');
ok(report.violations.some((v) => v.ruleId === 'AS-04'), 'caught pill radius outside avatar/counter (AS-04)');
ok(report.violations.some((v) => v.ruleId === 'AS-05'), 'caught emoji in UI chrome (AS-05)');
ok(report.violations.some((v) => v.ruleId === 'AS-06'), 'caught gradient surface (AS-06)');
ok(report.violations.some((v) => v.ruleId === 'AS-08'), 'caught backdrop-blur glassmorphism (AS-08)');
ok(report.violations.some((v) => v.ruleId === 'AS-09'), 'caught removed outline without :focus-visible (AS-09)');
ok(report.violations.some((v) => v.ruleId === 'AS-11'), 'caught placeholder text (AS-11)');
ok(report.violations.some((v) => v.ruleId === 'AS-I1'), 'caught dead click handler (AS-I1)');
ok(report.violations.some((v) => v.ruleId === 'AS-S1'), 'caught nested <Card><Card> (AS-S1)');
ok(report.violations.some((v) => v.ruleId === 'AS-C1'), 'caught trivial verb narrating comment (AS-C1)');
ok(report.violations.some((v) => v.ruleId === 'AS-C2'), 'caught commented-out dead code (AS-C2)');
ok(report.violations.some((v) => v.ruleId === 'AS-C3'), 'caught AI agent attribution comment (AS-C3)');
ok(report.score === 0, `degraded craftsmanship score hits 0 (got: ${report.score})`);

// Clean enterprise snippet
const cleanSnippet = `
export function CleanComponent({ title, onAction }: CleanProps) {
  return (
    <div className="bg-surface border border-border rounded-md p-4 text-foreground">
      <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
      <a href="#bad" className="text-xs underline">Jump to section</a>
      <button onClick={onAction} className="mt-3 px-3 py-1.5 bg-primary text-primary-foreground text-xs rounded hover:opacity-90 focus-visible:outline-2">
        Thực hiện
      </button>
    </div>
  );
}
`;
const cleanReport = lintUiContent(cleanSnippet, 'CleanComponent.tsx');
ok(cleanReport.passed, 'passes clean enterprise component (and ignores href="#bad" anchor)');
ok(cleanReport.violations.length === 0, `zero violations in clean component (got: ${JSON.stringify(cleanReport.violations)})`);
ok(cleanReport.score === 100, 'craftsmanship score is 100/100');

// Comment sanitization & inline suppression tests
const suppressionSnippet = `
export function SuppressedComponent({ onAction }: CleanProps) {
  /* Refactored away from #7c3aed and shadow-2xl */
  const hero = "bg-gradient-to-r from-slate-800 to-slate-900"; // anti-slop-ignore AS-06: brand marketing hero
  const badSuppress = "bg-gradient-to-r from-slate-800 to-slate-900"; // anti-slop-ignore AS-06
  return <button onClick={onAction} className={hero}>{badSuppress}</button>;
}
`;
const suppressReport = lintUiContent(suppressionSnippet, 'SuppressedComponent.tsx');
ok(suppressReport.suppressions.length === 1 && suppressReport.suppressions[0].suppressed.includes('AS-06'), 'honors anti-slop-ignore with mandatory reason');
ok(suppressReport.violations.some((v) => v.ruleId === 'AS-SUPPRESS'), 'rejects anti-slop-ignore without a reason (AS-SUPPRESS)');

console.log('2. z-craft: GSAP motion profiles & WCAG 2.1 token contrast audit');

const gsapSnippet = `
import gsap from 'gsap';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
export function MotionBox() {
  useEffect(() => {
    gsap.to('.box', { width: 200, repeat: -1 });
  }, []);
  return <div className="box" />;
}
`;
const gsapEnterprise = lintUiContent(gsapSnippet, 'MotionBox.tsx', { profile: 'enterprise' });
ok(gsapEnterprise.violations.some((v) => v.ruleId === 'AS-03a'), 'caught GSAP layout property animation (AS-03a)');
ok(gsapEnterprise.violations.some((v) => v.ruleId === 'AS-03b' && v.severity === 'error'), 'caught endless repeat:-1 as error in enterprise (AS-03b)');
ok(gsapEnterprise.violations.some((v) => v.ruleId === 'AS-03c'), 'caught missing reduced-motion gate for GSAP (AS-03c)');
ok(gsapEnterprise.violations.some((v) => v.ruleId === 'AS-03d'), 'caught missing useEffect cleanup for GSAP (AS-03d)');
ok(gsapEnterprise.violations.some((v) => v.ruleId === 'AS-03e'), 'caught forbidden ScrollSmoother in enterprise (AS-03e)');

const gsapExpressive = lintUiContent(gsapSnippet, 'MotionBox.tsx', { profile: 'expressive' });
ok(!gsapExpressive.violations.some((v) => v.ruleId === 'AS-03e'), 'allows ScrollSmoother in expressive profile');
ok(gsapExpressive.violations.some((v) => v.ruleId === 'AS-03b' && v.severity === 'warning'), 'downgrades repeat:-1 to warning in expressive profile');

// WCAG 2.1 contrast audit
const goodCssTokens = `
:root {
  --bg-canvas: #f4f6f9;
  --bg-surface: #ffffff;
  --border-input: #7f8ba0;
  --text-primary: #0f172a;
  --text-muted: #607085;
  --success-fg: #1f7a40;
  --success-bg: #e9f2ec;
}
[data-theme="dark"] {
  --bg-canvas: #0d0f13;
  --bg-surface: #151822;
  --border-input: #68728a;
  --text-primary: #e6e8ee;
  --text-muted: #868ea0;
  --success-fg: #5ba171;
  --success-bg: rgba(91, 161, 113, 0.12);
}
`;
const goodAudit = auditTokens(goodCssTokens);
ok(goodAudit.passed && goodAudit.checked.length >= 6, `WCAG 2.1 passes canonical tokens (${goodAudit.checked.length} pairs checked)`);

const badCssTokens = `
:root {
  --bg-surface: #ffffff;
  --text-muted: #a0aec0;
}
`;
const badAudit = auditTokens(badCssTokens);
ok(!badAudit.passed && badAudit.failures.length === 1, 'WCAG 2.1 catches low-contrast text token (< 4.5:1)');

// Diff parser test
const diffSample = `+++ b/src/App.tsx
@@ -10,0 +11,2 @@
+const x = 1;
+const y = 2;
`;
const diffMap = parseUnifiedDiff(diffSample);
ok(diffMap.get('src/App.tsx')?.has(11) && diffMap.get('src/App.tsx')?.has(12), 'parseUnifiedDiff extracts exact added line numbers');

console.log('3. z-craft: desktop ERP scoped rules (zero false positives)');

const sloppyDesktopSnippet = `
public class OrderForm : XtraForm {
    public async Task RefreshGrid() {
        foreach (var row in list) {
            gridView1.SetRowCellValue(row.Id, "Status", "Active");
        }
        await Task.Run(() => HeavyCalc());
        Dispatcher.Invoke(() => { lblCount.Text = "Done"; });
        var f = new Font("Segoe UI", 10);
    }
}
`;
const desktopReport = lintUiContent(sloppyDesktopSnippet, 'OrderForm.cs');
ok(desktopReport.violations.some((v) => v.ruleId === 'AS-D1'), 'caught DevExpress batch update without BeginUpdate (AS-D1)');
ok(desktopReport.violations.some((v) => v.ruleId === 'AS-D2'), 'caught WinForms Form Task.Run without SplashScreenManager (AS-D2)');
ok(desktopReport.violations.some((v) => v.ruleId === 'AS-D3'), 'caught WPF blocking Dispatcher.Invoke in async method (AS-D3)');
ok(desktopReport.violations.some((v) => v.ruleId === 'AS-D4'), 'caught hardcoded Font outside Theme file (AS-D4)');

const validDesktopSnippet = `
public class OrderForm : XtraForm {
    public async Task LoadAsync() {
        var rows = await FetchAsync();
        gridControl.BeginUpdate();
        try {
            foreach (var row in rows) {
                gridView1.SetRowCellValue(row.Id, "Status", "Active");
            }
        } finally {
            gridControl.EndUpdate();
        }
    }
    public void SyncUpdate() {
        Dispatcher.Invoke(() => { lblCount.Text = "Sync"; });
    }
}
`;
const validDesktopReport = lintUiContent(validDesktopSnippet, 'OrderForm.cs');
ok(validDesktopReport.passed && validDesktopReport.violations.length === 0,
  `zero false positives on wrapped BeginUpdate & sync Dispatcher.Invoke (got: ${JSON.stringify(validDesktopReport.violations)})`);

const themeFontReport = lintUiContent('public static readonly Font Primary = new Font("Segoe UI", 9.5f);', 'EnterpriseTheme.cs');
ok(themeFontReport.passed && themeFontReport.violations.length === 0, 'allows centralized Font instantiation inside *Theme.cs');

const beginAcrossAwait = `
public async Task BadAsync() {
    gridControl.BeginUpdate();
    var data = await FetchAsync();
    gridControl.DataSource = data;
    gridControl.EndUpdate();
}
`;
const beginAcrossAwaitReport = lintUiContent(beginAcrossAwait, 'BadForm.cs');
ok(beginAcrossAwaitReport.violations.some((v) => v.ruleId === 'AS-D1'), 'catches BeginUpdate() held across await (AS-D1)');

console.log('4. z-craft: UX micro-spec generator (inter-plugin mesh)');

const spec = generateMicroSpec('Màn hình kiểm kê kho vật tư thép có cảnh báo', { format: 'json' });
ok(spec.domain === 'Warehouse & Inventory', `correctly identified domain: ${spec.domain}`);
ok(Boolean(spec.stateMatrix.defaultState), 'contains default state');
ok(Boolean(spec.stateMatrix.loadingState), 'contains loading state (skeleton)');
ok(Boolean(spec.stateMatrix.emptyState), 'contains empty state');
ok(Boolean(spec.stateMatrix.errorState), 'contains error state with retry');
ok(!spec.stateMatrix.errorState.requirements.join(' ').includes('Thử lại (Retry)'), 'enforces single active language (no bilingual parenthetical)');
ok(spec.edgeCases.length >= 3, 'contains at least 3 edge case defenses');
ok(Array.isArray(spec.reusableAssets), 'mesh includes reusableAssets from z-gate');
ok(Array.isArray(spec.historicalGotchas), 'mesh includes historicalGotchas from z-brain');

const mdSpec = generateMicroSpec('Customer Billing Ledger with Excel export', { format: 'markdown' });
ok(typeof mdSpec === 'string' && mdSpec.includes('UX Micro-Contract'), 'generates markdown formatted spec');

console.log('5. z-craft: generative canvas preview & host CSP compliance');

const widget = generateCanvasWidget({ title: 'Warehouse Stock Grid', savePath: '/tmp/preview.html' });
ok(Boolean(widget.html), 'generates non-empty HTML canvas');
ok(widget.html.includes('Warehouse Stock Grid'), 'canvas contains safe title');
ok(widget.html.includes('gstatic.com/antigravity/web/dev/tailwindcss.min.js'), 'uses Antigravity CSP-allowlisted gstatic Tailwind');
ok(!widget.html.includes('cdn.tailwindcss.com'), 'does not reference blocked cdn.tailwindcss.com');
ok(widget.html.includes('var(--card)'), 'uses Antigravity host semantic tokens');
ok(widget.previewBlock.startsWith('<agent-embed src="file:///'), 'emits <agent-embed> when savePath is provided');
const previewLint = lintUiContent(widget.html, 'preview.html');
ok(previewLint.passed && previewLint.score === 100, `generated preview HTML passes canonical linter 100/100 (got: ${JSON.stringify(previewLint.violations)})`);

const graphWidget = generateGraphCanvasWidget({
  title: 'Enterprise Architecture Topology',
  nodes: [
    { id: 'OrderService', name: 'OrderService', kind: 'service', degree: 4, isGodNode: false },
    { id: 'CentralHub', name: 'CentralHub', kind: 'service', degree: 10, isGodNode: true }
  ],
  edges: [{ from: 'OrderService', to: 'CentralHub' }]
});
ok(Boolean(graphWidget.html), 'graph canvas generated non-empty HTML');
ok(graphWidget.nodeCount === 2, 'graph canvas contains 2 nodes');
ok(graphWidget.html.includes('God Node'), 'graph canvas highlights God Node');
ok(graphWidget.html.includes('gstatic.com/antigravity/web/dev/tailwindcss.min.js'), 'graph canvas uses allowlisted gstatic Tailwind');
ok(graphWidget.html.includes('DOMAINS:'), 'graph canvas includes domain community filter pills');
ok(graphWidget.html.includes('data-community='), 'graph canvas node cards have data-community attributes');
ok(graphWidget.html.includes('viewBtnForce'), 'graph canvas includes force graph view toggle');
ok(graphWidget.html.includes('id="forceSvg"'), 'graph canvas includes interactive SVG force canvas');
ok(graphWidget.html.includes('initForcePhysics'), 'graph canvas includes force physics simulation script');
const graphLint = lintUiContent(graphWidget.html, 'graph.html');
ok(graphLint.passed && graphLint.score === 100, `graph canvas HTML passes canonical linter 100/100 (got: ${JSON.stringify(graphLint.violations)})`);

console.log('6. z-craft: scaffolder dogfooding (all 3 frameworks pass 100/100)');

const reactScaffold = scaffoldComponent('InventoryReport', { framework: 'react' });
ok(reactScaffold.filename === 'InventoryReport.tsx', 'scaffolds React component filename');
ok(reactScaffold.states.length === 4, 'scaffold implements all 4 UX states');
const reactLint = lintUiContent(reactScaffold.code, reactScaffold.filename);
ok(reactLint.passed && reactLint.score === 100, `React scaffold passes canonical linter 100/100 (got: ${JSON.stringify(reactLint.violations)})`);

const wpfScaffold = scaffoldComponent('OrderViewer', { framework: 'wpf' });
ok(wpfScaffold.filename === 'OrderViewerView.xaml', 'scaffolds WPF XAML UserControl');
const wpfLint = lintUiContent(wpfScaffold.code, wpfScaffold.filename);
ok(wpfLint.passed && wpfLint.score === 100, `WPF scaffold passes canonical linter 100/100 (got: ${JSON.stringify(wpfLint.violations)})`);

const winformsScaffold = scaffoldComponent('StockLedger', { framework: 'winforms' });
ok(winformsScaffold.filename === 'StockLedgerControl.cs', 'scaffolds WinForms UserControl');
const winformsLint = lintUiContent(winformsScaffold.code, winformsScaffold.filename);
ok(winformsLint.passed && winformsLint.score === 100, `WinForms scaffold passes canonical linter 100/100 (got: ${JSON.stringify(winformsLint.violations)})`);

console.log('7. z-craft: directory linting & vibe time-machine');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcraft-test-'));
const testFile = path.join(tmpDir, 'Component.tsx');
fs.writeFileSync(testFile, cleanSnippet, 'utf8');

// Verify lintUiFiles handles directory paths cleanly (fixes EISDIR)
const dirReports = lintUiFiles([tmpDir], tmpDir);
ok(dirReports.length === 1 && dirReports[0].passed, 'lintUiFiles recursively expands directory paths without EISDIR');

fs.writeFileSync(testFile, 'export const V1 = 1;', 'utf8');
const snapshotRes = createCheckpoint(tmpDir, 'v1_initial', ['Component.tsx']);
ok(snapshotRes.success && snapshotRes.fileCount === 1, 'snapshot created successfully');

fs.writeFileSync(testFile, 'export const V2_BROKEN = 2;', 'utf8');
const list = listCheckpoints(tmpDir);
ok(list.length >= 1 && list[0].name === 'v1_initial', 'listed correct checkpoint name');

const restoreRes = restoreCheckpoint(tmpDir, 'v1_initial');
ok(restoreRes.success && fs.readFileSync(testFile, 'utf8') === 'export const V1 = 1;', 'file successfully reverted to V1');

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log('\nall z-craft canonical tests passed!');
