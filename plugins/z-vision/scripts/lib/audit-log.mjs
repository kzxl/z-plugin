import fs from 'node:fs';
import path from 'node:path';
import { defaultDataDir } from './native-builder.mjs';

const ALLOWED_FIELDS = [
  'ts',
  'event',
  'hwnd',
  'process',
  'action',
  'mode',
  'resolved_mode',
  'ok',
  'error_code',
  'duration_ms',
  'completed_steps',
  'assertions_passed',
  'retries_used',
  'macro',
  'blocked_events'
];

function redactEntry(raw) {
  const out = { ts: new Date().toISOString() };
  if (!raw || typeof raw !== 'object') return out;
  for (const key of ALLOWED_FIELDS) {
    if (key === 'ts') continue;
    if (raw[key] !== undefined && raw[key] !== null) {
      out[key] = raw[key];
    }
  }
  return out;
}

export function createAuditLogger({ dataDir = defaultDataDir(), enabled = true } = {}) {
  const logDir = path.join(dataDir, 'logs');

  function getLogPath() {
    const day = new Date().toISOString().slice(0, 10);
    return path.join(logDir, `audit-${day}.jsonl`);
  }

  function log(entry) {
    if (!enabled) return;
    try {
      fs.mkdirSync(logDir, { recursive: true });
      const rec = redactEntry(entry);
      fs.appendFileSync(getLogPath(), JSON.stringify(rec) + '\n', 'utf8');
    } catch {}
  }

  return { log, getLogPath };
}
