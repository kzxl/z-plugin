#!/usr/bin/env node
import { searchKnowledge } from './lib/search.mjs';
import {
  formatL0Progressive,
  formatDeepView,
  formatTerminalTable,
  formatTimeline,
  formatFileKnowledge
} from './lib/format.mjs';
import { harvestKnowledge } from './lib/harvest.mjs';
import {
  getDb,
  getAtomById,
  countAtoms,
  getRecentAtoms,
  getRecentObservations,
  insertObservation,
  getKnowledgeByFile
} from './lib/db.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveWorkspace } from './lib/workspace.mjs';
import { buildPreflight } from './lib/preflight.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [,, command, ...args] = process.argv;

function printUsage() {
  console.log(`
🧠 Z-Brain CLI — Zero-Overhead Cognitive Engine

Usage:
  z-brain fetch "<task>" [--project=name] [--limit=5]
  z-brain view <id>
  z-brain harvest "<problem> | <cause> | <fix>" [--project=name] [--tags=t1,t2] [--trust=verified_fact] [--files=f1,f2]
  z-brain observe "<title> | <summary>" [--project=name] [--type=decision|milestone|discovery] [--files=f1,f2]
  z-brain recent [--project=name] [--limit=10]
  z-brain timeline [--project=name] [--limit=10]
  z-brain file <path> [--limit=5]
  z-brain preflight <path> [--budget=300] [--symbol=Name]
  z-brain query "<search keywords>"
  z-brain status
  z-brain export <file.json>
  z-brain import <file.json>
`);
}

if (!command || command === '--help' || command === '-h') {
  printUsage();
  process.exit(0);
}

const db = getDb();

function getArgValue(prefix) {
  const match = args.find(a => a.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

switch (command) {
  case 'fetch': {
    const task = args.find(a => !a.startsWith('--')) || '';
    const project = getArgValue('--project=');
    const limit = parseInt(getArgValue('--limit=') || '5', 10);
    const results = searchKnowledge({ query: task, project, limit });
    console.log(formatL0Progressive(results, task));
    break;
  }

  case 'view': {
    const id = parseInt(args[0], 10);
    if (!id) {
      console.error('Error: Atom ID is required. Example: z-brain view 4360');
      process.exit(1);
    }
    const atom = getAtomById(db, id);
    console.log(formatDeepView(atom));
    break;
  }

  case 'harvest': {
    const lesson = args.find(a => !a.startsWith('--'));
    if (!lesson) {
      console.error('Error: Lesson content is required.');
      process.exit(1);
    }
    const project = getArgValue('--project=') || 'global';
    const rawTags = getArgValue('--tags=');
    const tags = rawTags ? rawTags.split(',').map(t => t.trim()) : ['general'];
    const trust = getArgValue('--trust=') || 'observation';
    const evidence = getArgValue('--evidence=');
    const rawFiles = getArgValue('--files=');
    const files = rawFiles ? rawFiles.split(',').map(f => f.trim()) : [];

    const res = harvestKnowledge({
      input: lesson,
      project,
      tags,
      trust_level: trust,
      evidence,
      files_touched: files
    });
    console.log(`✅ [Z-BRAIN HARVEST] Atom #${res.id} saved in SQLite.`);
    break;
  }

  case 'observe': {
    const raw = args.find(a => !a.startsWith('--'));
    if (!raw) {
      console.error('Error: Observation text is required. Format: "<title> | <summary>"');
      process.exit(1);
    }
    const parts = raw.split('|').map(s => s.trim());
    const title = parts[0] || 'Observation';
    const summary = parts.slice(1).join(' | ') || title;
    const project = getArgValue('--project=') || 'global';
    const type = getArgValue('--type=') || 'decision';
    const rawFiles = getArgValue('--files=');
    const files = rawFiles ? rawFiles.split(',').map(f => f.trim()) : [];

    const id = insertObservation(db, {
      project_id: project,
      type,
      title,
      summary,
      files_touched: files
    });
    console.log(`✅ [Z-BRAIN OBSERVE] Observation #${id} recorded for project [${project}].`);
    break;
  }

  case 'recent': {
    const project = getArgValue('--project=');
    const limit = parseInt(getArgValue('--limit=') || '10', 10);
    const atoms = getRecentAtoms(db, { project, limit });
    console.log(formatTerminalTable(atoms));
    break;
  }

  case 'timeline': {
    const project = getArgValue('--project=');
    const limit = parseInt(getArgValue('--limit=') || '10', 10);
    const obs = getRecentObservations(db, { project, limit });
    console.log(formatTimeline(obs));
    break;
  }

  case 'file': {
    const filePath = args.find(a => !a.startsWith('--'));
    if (!filePath) {
      console.error('Error: File path is required. Example: z-brain file src/OrderService.cs');
      process.exit(1);
    }
    const limit = parseInt(getArgValue('--limit=') || '5', 10);
    const res = getKnowledgeByFile(db, filePath, { limit });
    console.log(formatFileKnowledge(filePath, res.atoms, res.observations));
    break;
  }

  case 'preflight': {
    const filePath = args.find(a => !a.startsWith('--'));
    if (!filePath) {
      console.error('Error: File path is required. Example: z-brain preflight src/OrderService.cs');
      process.exit(1);
    }
    const brief = await buildPreflight({
      db,
      workspace: resolveWorkspace(process.env.Z_PLUGIN_WORKSPACE || process.cwd()),
      file: filePath,
      symbol: getArgValue('--symbol='),
      budget: parseInt(getArgValue('--budget=') || '300', 10)
    });
    console.log(brief.text);
    break;
  }

  case 'query': {
    const query = args.find(a => !a.startsWith('--')) || '';
    const results = searchKnowledge({ query, limit: 5 });
    console.log(formatL0Progressive(results, query));
    break;
  }

  case 'status': {
    const count = countAtoms(db);
    const dbPath = path.resolve(__dirname, '..', 'data', 'zbrain.sqlite');
    const size = fs.existsSync(dbPath) ? fs.statSync(dbPath).size : 0;
    console.log(`
🧠 Z-Brain Engine Status:
  • Backend: Pure Local SQLite WAL (node:sqlite)
  • Architecture: Zero-Server, Zero-Network, Zero-AME
  • Storage Path: ${dbPath}
  • File Size: ${(size / (1024 * 1024)).toFixed(2)} MB
  • Total Knowledge Atoms: ${count}
  • FTS Engine: FTS5 BM25 Active
  • Concurrency: WAL mode (Zero read-write locks)
`);
    break;
  }

  case 'export': {
    const file = args[0] || 'zbrain-backup.json';
    import('./lib/migrate.mjs').then(m => {
      const n = m.exportToJson(file);
      console.log(`Exported ${n} atoms to ${file}`);
    });
    break;
  }

  case 'import': {
    const file = args[0];
    if (!file) {
      console.error('File required: z-brain import <file.json>');
      process.exit(1);
    }
    import('./lib/migrate.mjs').then(m => {
      const n = m.importFromJson(file);
      console.log(`Imported ${n} atoms from ${file}`);
    });
    break;
  }

  default:
    console.error(`Unknown command: ${command}`);
    printUsage();
    process.exit(1);
}
