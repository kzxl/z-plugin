/**
 * ERP & Financial Engineering DLC
 * @package @z-plugin/dlc-erp
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkDecimalPrecision, checkInventoryLock } from './linters/erp-gate-checks.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rulesPath = path.join(__dirname, 'rules', 'erp-rules.json');
export const synonymsPath = path.join(__dirname, 'synonyms', 'erp-synonyms.json');

export const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
export const synonyms = JSON.parse(fs.readFileSync(synonymsPath, 'utf8'));

export const gateChecks = {
  checkDecimalPrecision,
  checkInventoryLock
};

/**
 * Activates DLC-ERP into an active ZRuntime instance or registries
 */
export function activateDlc(zruntime) {
  if (!zruntime) return false;

  // Publish activation event
  if (zruntime.eventBus) {
    zruntime.eventBus.emit('dlc:activated', {
      id: 'dlc-erp',
      version: '1.5.0',
      ruleCount: Object.keys(rules).length,
      synonymCount: Object.keys(synonyms).length
    });
  }

  return true;
}

export default {
  id: 'dlc-erp',
  version: '1.5.0',
  rules,
  synonyms,
  gateChecks,
  activateDlc
};
