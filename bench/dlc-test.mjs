#!/usr/bin/env node
/**
 * Extension DLC-ERP Automated Test Suite
 * Validates manifest v2 schema compliance, domain rule packaging,
 * ERP synonyms, and dynamic quality gate hook integration.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { ZRuntime } from '../packages/z-runtime/src/index.mjs';
import { registerLineReviewer, reviewCode } from '../plugins/z-gate/scripts/lib/code-reviewer.mjs';
import { scaffoldDlc, validateDlc, listDlcs } from '../tools/dlc-cli.mjs';
import dlcErp, { rules, synonyms, gateChecks, activateDlc } from '../extensions/dlc-erp/index.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function ok(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  ok  ', msg);
}

console.log('dlc-erp: manifest v2 & packaging compliance');

const manifestPath = path.join(root, 'extensions', 'dlc-erp', 'z-plugin.manifest.json');
ok(fs.existsSync(manifestPath), 'extensions/dlc-erp/z-plugin.manifest.json exists');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const expectedVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
ok(manifest.id === 'dlc-erp', 'manifest id matches dlc-erp');
ok(manifest.version === expectedVersion, `manifest version matches release version (${expectedVersion})`);
ok(manifest.kind === 'extension-dlc', 'manifest kind is extension-dlc');
ok(manifest.extends && manifest.extends.plugin === 'z-mind', 'extends z-mind plugin');
ok(manifest.extends.slot === 'domain-rules', 'extends domain-rules slot');
ok(manifest.contributions && Array.isArray(manifest.contributions.rules), 'declares contributed rules');
ok(manifest.contributions.synonyms, 'declares contributed synonyms');
ok(manifest.contributions.gateChecks.length === 2, 'declares 2 contributed gate checks');

console.log('dlc-erp: domain rules and bilingual synonyms dictionary');

ok(Object.keys(rules).length === 6, `contains 6 canonical ERP rules (got: ${Object.keys(rules).length})`);
ok(Boolean(rules.R_DOMAIN_FIN), 'contains R_DOMAIN_FIN finance rule');
ok(Boolean(rules.R_DOMAIN_WMS), 'contains R_DOMAIN_WMS warehouse rule');
ok(Boolean(rules.R_DOMAIN_INV), 'contains R_DOMAIN_INV inventory rule');
ok(Boolean(rules.R_DOMAIN_PROD), 'contains R_DOMAIN_PROD production rule');
ok(Boolean(rules.R_DOMAIN_SALES), 'contains R_DOMAIN_SALES sales rule');
ok(Boolean(rules.R_DOMAIN_AUTH), 'contains R_DOMAIN_AUTH tenancy rule');

ok(Array.isArray(synonyms['tồn kho']) && synonyms['tồn kho'].includes('inventory'), 'synonyms maps tồn kho to inventory');
ok(Array.isArray(synonyms['công nợ']) && synonyms['công nợ'].includes('ar_ap'), 'synonyms maps công nợ to ar_ap');
ok(Array.isArray(synonyms['phiếu xuất']), 'synonyms contains phiếu xuất');

console.log('dlc-erp: domain gate checkers (ERP-DECIMAL & ERP-LOCK)');

const decimalFinding = gateChecks.checkDecimalPrecision('public double UnitPrice { get; set; }', 'OrderLine.cs', 12);
ok(decimalFinding !== null, 'caught double UnitPrice violation');
ok(decimalFinding.rule.includes('ERP Financial Precision'), 'finding references financial precision invariant');

const cleanDecimal = gateChecks.checkDecimalPrecision('public decimal UnitPrice { get; set; }', 'OrderLine.cs', 12);
ok(cleanDecimal === null, 'passes valid decimal currency field');

const lockFinding = gateChecks.checkInventoryLock('UPDATE Inventory SET Quantity = Quantity - 1 WHERE Id = 1', 'StockRepo.cs', 45);
ok(lockFinding !== null, 'caught UPDATE Inventory without UPDLOCK');
ok(lockFinding.rule.includes('Inventory Lock Protection'), 'finding references row-level lock invariant');

const cleanLock = gateChecks.checkInventoryLock('UPDATE Inventory WITH (UPDLOCK, ROWLOCK) SET Quantity = Quantity - 1', 'StockRepo.cs', 45);
ok(cleanLock === null, 'passes inventory update with UPDLOCK');

console.log('dlc-erp: dynamic runtime activation & z-gate hook integration');

const runtime = new ZRuntime();
let dlcActivatedEvent = false;

runtime.eventBus.on('dlc:activated', (evt) => {
  if (evt.id === 'dlc-erp') dlcActivatedEvent = true;
});

const activated = activateDlc(runtime);
ok(activated === true, 'activateDlc returned true');
ok(dlcActivatedEvent === true, 'emitted dlc:activated event on EventBus');

// Register DLC gate check into z-gate review engine
registerLineReviewer((code, file, line) => gateChecks.checkDecimalPrecision(code, file, line));

const testDiff = `
diff --git a/src/InvoiceItem.cs b/src/InvoiceItem.cs
index 1111111..2222222 100644
--- a/src/InvoiceItem.cs
+++ b/src/InvoiceItem.cs
@@ -10,3 +10,4 @@
+    public double SubTotal { get; set; }
`;

const reviewResult = await reviewCode({ diff: testDiff, commitMessage: 'feat: add subtotal' });
ok(reviewResult.findings.length > 0, 'reviewCode caught ERP decimal violation via DLC hook');
ok(reviewResult.findings.some(f => f.category === 'DOMAIN_ERP'), 'review findings include DOMAIN_ERP category');
ok(reviewResult.score < 100, `score was deducted due to ERP violation (got: ${reviewResult.score})`);

console.log('dlc-cli: scaffolding, validation, and listing tooling');

// 1. List installed DLCs
const installedDlcs = listDlcs();
ok(installedDlcs.length >= 1, `found at least 1 installed DLC (got: ${installedDlcs.length})`);
ok(installedDlcs.some(d => d.id === 'dlc-erp'), 'listDlcs includes dlc-erp');

// 2. Validate existing dlc-erp package
const erpValidation = validateDlc(path.join(root, 'extensions', 'dlc-erp'));
ok(erpValidation.valid === true, 'validateDlc passes on dlc-erp');
ok(erpValidation.dlcId === 'dlc-erp', 'validated DLC ID matches dlc-erp');

// 3. Test scaffolding new DLC in temporary folder
const tempDlcDir = path.join(os.tmpdir(), `test-dlc-sec-${Date.now()}`);
const scaffoldRes = scaffoldDlc('security', {
  targetDir: tempDlcDir,
  slot: 'security-linters',
  desc: 'Security auditing linters and secrets scanner.'
});

ok(scaffoldRes.success === true, 'scaffoldDlc created DLC successfully');
ok(scaffoldRes.dlcId === 'dlc-security', 'scaffoldDlc assigned dlc-security ID');
ok(fs.existsSync(path.join(tempDlcDir, 'z-plugin.manifest.json')), 'scaffolded manifest exists on disk');
ok(fs.existsSync(path.join(tempDlcDir, 'rules', 'security-rules.json')), 'scaffolded rules file exists');
ok(fs.existsSync(path.join(tempDlcDir, 'index.mjs')), 'scaffolded entrypoint index.mjs exists');

// Validate scaffolded DLC against schema
const scaffoldValidation = validateDlc(tempDlcDir);
ok(scaffoldValidation.valid === true, 'validateDlc passes on freshly scaffolded DLC');
ok(scaffoldValidation.dlcId === 'dlc-security', 'scaffolded DLC validated as dlc-security');

// Cleanup temporary folder
fs.rmSync(tempDlcDir, { recursive: true, force: true });

console.log('\nall dlc-erp and dlc-cli tests passed!');
