#!/usr/bin/env node
import { searchKnowledge } from './lib/search.mjs';
import { formatL0Progressive, formatDeepView } from './lib/format.mjs';
import { harvestKnowledge } from './lib/harvest.mjs';
import { getDb, getAtomById, countAtoms } from './lib/db.mjs';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const [,, command, ...args] = process.argv;

function printUsage() {
  console.log(`
🧠 Z-Brain CLI — Zero-Overhead Cognitive Engine

Usage:
  z-brain fetch "<task>" [--project=name] [--limit=5]
  z-brain view <id>
  z-brain harvest "<problem> | <cause> | <fix>" [--project=name] [--tags=t1,t2] [--trust=verified_fact]
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

    const res = harvestKnowledge({ input: lesson, project, tags, trust_level: trust, evidence });
    console.log(`✅ [Z-BRAIN HARVEST] Atom #${res.id} saved in SQLite.`);
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
    const size = fs.statSync(dbPath).size;
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
