#!/usr/bin/env node
/**
 * AEOS DLC Scaffolding & Validation CLI Tool
 * Command-line utility to create, validate, and list Extension DLC packages.
 *
 * Usage:
 *   node tools/dlc-cli.mjs create <name> [--slot=<slot>] [--desc=<desc>]
 *   node tools/dlc-cli.mjs validate <path>
 *   node tools/dlc-cli.mjs list
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const EXTENSIONS_DIR = path.join(ROOT_DIR, 'extensions');
const SCHEMA_PATH = path.join(ROOT_DIR, 'schemas', 'manifest-v2.schema.json');

/**
 * Scaffold a new Extension DLC
 */
export function scaffoldDlc(rawName, options = {}) {
  const cleanName = String(rawName || '')
    .trim()
    .toLowerCase()
    .replace(/^dlc-/, '')
    .replace(/[^a-z0-9-_]/g, '-');

  if (!cleanName) {
    throw new Error('A valid DLC name is required (e.g. "security", "database", "python").');
  }

  const dlcId = `dlc-${cleanName}`;
  const targetDir = options.targetDir || path.join(EXTENSIONS_DIR, dlcId);

  if (fs.existsSync(targetDir) && !options.force) {
    throw new Error(`DLC directory already exists: ${targetDir}. Use --force to overwrite.`);
  }

  fs.mkdirSync(path.join(targetDir, 'rules'), { recursive: true });
  fs.mkdirSync(path.join(targetDir, 'linters'), { recursive: true });

  const slot = options.slot || 'domain-rules';
  const dlcType = options.type || (slot === 'gate-checks' ? 'linter-pack' : (slot === 'synonyms' ? 'knowledge-pack' : 'domain-suite'));
  const desc = options.desc || `${cleanName.toUpperCase()} domain rules, linters, and invariants for AEOS.`;

  // 1. package.json
  const pkgJson = {
    name: `@z-plugin/${dlcId}`,
    version: '1.0.0',
    description: desc,
    type: 'module',
    main: 'index.mjs',
    license: 'MIT'
  };
  fs.writeFileSync(path.join(targetDir, 'package.json'), JSON.stringify(pkgJson, null, 2) + '\n');

  // 2. z-plugin.manifest.json
  const manifestJson = {
    $schema: '../../schemas/manifest-v2.schema.json',
    id: dlcId,
    name: `${cleanName.charAt(0).toUpperCase() + cleanName.slice(1)} Engineering DLC`,
    version: '1.0.0',
    kind: 'extension-dlc',
    dlcType: dlcType,
    description: desc,
    main: 'index.mjs',
    extends: {
      plugin: dlcType === 'linter-pack' ? 'z-gate' : (dlcType === 'knowledge-pack' ? 'z-brain' : 'z-mind'),
      slot: slot
    },
    dependencies: {
      plugins: {
        'z-mind': '>=1.1.0'
      }
    },
    contributions: {
      rules: [`./rules/${cleanName}-rules.json`]
    },
    runtime: {
      node: '>=22'
    }
  };
  fs.writeFileSync(path.join(targetDir, 'z-plugin.manifest.json'), JSON.stringify(manifestJson, null, 2) + '\n');

  // 3. rules/<name>-rules.json
  const ruleKey = `R_DOMAIN_${cleanName.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;
  const rulesJson = {
    [ruleKey]: {
      title: `${cleanName.toUpperCase()} Domain Invariants`,
      category: 'domain',
      tags: [cleanName, 'dlc', 'invariants'],
      summary: `Domain-specific engineering invariants and guardrails for ${cleanName}.`
    }
  };
  fs.writeFileSync(path.join(targetDir, 'rules', `${cleanName}-rules.json`), JSON.stringify(rulesJson, null, 2) + '\n');

  // 4. index.mjs
  const indexJs = `/**
 * ${cleanName.toUpperCase()} Engineering DLC
 * @package @z-plugin/${dlcId}
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const rulesPath = path.join(__dirname, 'rules', '${cleanName}-rules.json');
export const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));

export function activateDlc(zruntime) {
  if (!zruntime) return false;
  if (zruntime.eventBus) {
    zruntime.eventBus.emit('dlc:activated', {
      id: '${dlcId}',
      version: '1.0.0',
      ruleCount: Object.keys(rules).length
    });
  }
  return true;
}

export default {
  id: '${dlcId}',
  version: '1.0.0',
  rules,
  activateDlc
};
`;
  fs.writeFileSync(path.join(targetDir, 'index.mjs'), indexJs);

  return {
    success: true,
    dlcId,
    targetDir,
    ruleKey
  };
}

/**
 * Validate an Extension DLC
 */
export function validateDlc(dlcDirPath) {
  const fullPath = path.isAbsolute(dlcDirPath) ? dlcDirPath : path.resolve(process.cwd(), dlcDirPath);
  const errors = [];

  if (!fs.existsSync(fullPath)) {
    return { valid: false, errors: [`Target directory does not exist: ${fullPath}`] };
  }

  const manifestPath = path.join(fullPath, 'z-plugin.manifest.json');
  if (!fs.existsSync(manifestPath)) {
    errors.push('Missing z-plugin.manifest.json in DLC directory.');
    return { valid: false, errors };
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    return { valid: false, errors: [`Invalid JSON in manifest: ${err.message}`] };
  }

  // Schema checks
  if (manifest.kind !== 'extension-dlc') {
    errors.push(`Manifest kind must be 'extension-dlc', found: '${manifest.kind}'`);
  }
  if (!manifest.id || !manifest.id.startsWith('dlc-')) {
    errors.push(`DLC ID must start with 'dlc-', found: '${manifest.id}'`);
  }
  if (!manifest.extends || !manifest.extends.plugin || !manifest.extends.slot) {
    errors.push("DLC manifest must declare 'extends.plugin' and 'extends.slot'");
  }

  // File references checks
  const entryPath = path.join(fullPath, manifest.main || 'index.mjs');
  if (!fs.existsSync(entryPath)) {
    errors.push(`Main entrypoint file not found: ${manifest.main}`);
  }

  if (manifest.contributions && Array.isArray(manifest.contributions.rules)) {
    for (const rPath of manifest.contributions.rules) {
      const resolvedR = path.resolve(fullPath, rPath);
      if (!fs.existsSync(resolvedR)) {
        errors.push(`Contributed rule file not found: ${rPath}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    dlcId: manifest.id,
    errors
  };
}

/**
 * List all DLCs in extensions directory
 */
export function listDlcs(extensionsDir = EXTENSIONS_DIR) {
  if (!fs.existsSync(extensionsDir)) return [];
  const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
  const dlcs = [];

  for (const ent of entries) {
    if (ent.isDirectory() && ent.name.startsWith('dlc-')) {
      const dlcPath = path.join(extensionsDir, ent.name);
      const manifestPath = path.join(dlcPath, 'z-plugin.manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
          dlcs.push({
            id: m.id,
            name: m.name,
            version: m.version,
            extends: m.extends,
            path: dlcPath
          });
        } catch {}
      }
    }
  }

  return dlcs;
}

// -------------------------------------------------------------
// CLI Runner
// -------------------------------------------------------------
const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === 'help') {
    console.log(`
AEOS DLC CLI Tool

Commands:
  create <name> [--type=<type>] [--slot=<slot>] [--desc=<desc>]
                                                 Scaffold a new Extension DLC
                                                 Types: domain-suite, rule-pack, linter-pack, knowledge-pack
  validate <path>                                Validate DLC manifest and structure
  list                                           List installed DLCs in extensions/
`);
    process.exit(0);
  }

  try {
    if (command === 'create') {
      const name = args[1];
      if (!name) {
        console.error('Error: DLC name is required (e.g. node tools/dlc-cli.mjs create database)');
        process.exit(1);
      }
      const typeArg = args.find(a => a.startsWith('--type='));
      const slotArg = args.find(a => a.startsWith('--slot='));
      const descArg = args.find(a => a.startsWith('--desc='));
      const type = typeArg ? typeArg.split('=')[1] : 'domain-suite';
      const slot = slotArg ? slotArg.split('=')[1] : (type === 'linter-pack' ? 'gate-checks' : (type === 'knowledge-pack' ? 'synonyms' : 'domain-rules'));
      const desc = descArg ? descArg.split('=')[1] : undefined;

      const res = scaffoldDlc(name, { type, slot, desc });
      console.log(`\n[SUCCESS] Created Extension DLC: ${res.dlcId} (archetype: ${type})`);
      console.log(`Directory: ${res.targetDir}`);
      console.log(`Contributed Rule: ${res.ruleKey}\n`);
    } else if (command === 'validate') {
      const target = args[1] || '.';
      const res = validateDlc(target);
      if (res.valid) {
        console.log(`\n[VALID] DLC '${res.dlcId}' passes manifest v2 specification.\n`);
      } else {
        console.error(`\n[INVALID] DLC validation failed with ${res.errors.length} errors:`);
        for (const e of res.errors) console.error(` - ${e}`);
        console.log('');
        process.exit(1);
      }
    } else if (command === 'list') {
      const dlcs = listDlcs();
      console.log(`\nInstalled AEOS Extension DLCs (${dlcs.length}):`);
      for (const d of dlcs) {
        console.log(` • ${d.id} (v${d.version}) [type: ${d.dlcType || 'domain-suite'}] -> extends ${d.extends?.plugin} [${d.extends?.slot}]`);
      }
      console.log('');
    } else {
      console.error(`Unknown command: '${command}'. Run with --help for usage.`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`\n[ERROR] ${err.message}\n`);
    process.exit(1);
  }
}
