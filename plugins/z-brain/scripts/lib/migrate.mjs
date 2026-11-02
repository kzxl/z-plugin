import { getDb, insertAtom } from './db.mjs';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Pure JSON export and import for offline backups. Zero database servers needed.
 */
export function exportToJson(filePath) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM knowledge_atoms ORDER BY id ASC').all();
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), 'utf8');
  return rows.length;
}

export function importFromJson(filePath) {
  const db = getDb();
  const raw = fs.readFileSync(filePath, 'utf8');
  const items = JSON.parse(raw);

  db.exec('BEGIN TRANSACTION;');
  let count = 0;
  for (const item of items) {
    insertAtom(db, item);
    count++;
  }
  db.exec('COMMIT;');
  return count;
}
