import { spawn } from 'node:child_process';
import { ensureNativeHost, defaultDataDir } from './native-builder.mjs';

export function createHostClient({ dataDir = defaultDataDir(), idleTimeoutMs = 300000 } = {}) {
  let child = null;
  let nextId = 1;
  let buffer = '';
  let idleTimer = null;
  const pending = new Map();

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    if (idleTimeoutMs > 0) {
      idleTimer = setTimeout(() => {
        close().catch(() => {});
      }, idleTimeoutMs);
      if (typeof idleTimer.unref === 'function') idleTimer.unref();
    }
  }

  function failAllPending(err) {
    for (const [id, entry] of pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(err);
      pending.delete(id);
    }
  }

  function ensureRunning() {
    if (child && !child.killed && child.exitCode === null) {
      resetIdleTimer();
      return child;
    }

    const { exePath } = ensureNativeHost({ dataDir });
    child = spawn(exePath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true
    });

    buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let msg;
        try {
          msg = JSON.parse(trimmed);
        } catch {
          continue;
        }
        if (msg.id != null && pending.has(msg.id)) {
          const entry = pending.get(msg.id);
          clearTimeout(entry.timer);
          pending.delete(msg.id);
          if (msg.ok) {
            entry.resolve(msg.result);
          } else {
            const err = new Error(msg.error?.message || 'Native host error');
            err.code = msg.error?.code || 'host_error';
            entry.reject(err);
          }
        }
      }
    });

    child.on('exit', (code) => {
      const err = new Error(`ZVisionHost exited with code ${code}`);
      err.code = 'host_exited';
      failAllPending(err);
      child = null;
    });

    child.on('error', (err) => {
      failAllPending(err);
      child = null;
    });

    resetIdleTimer();
    return child;
  }

  async function request(cmd, params = {}, { timeoutMs = 30000 } = {}) {
    if (process.platform !== 'win32') {
      const err = new Error('Native ZVisionHost is currently supported on Windows (win32) only.');
      err.code = 'unsupported_platform';
      throw err;
    }
    const proc = ensureRunning();
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        const err = new Error(`Native host timeout for '${cmd}' after ${timeoutMs}ms`);
        err.code = 'host_timeout';
        reject(err);
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      proc.stdin.write(JSON.stringify({ id, cmd, params }) + '\n', 'utf8');
    });
  }

  async function close() {
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    if (child) {
      const proc = child;
      child = null;
      await new Promise((resolve) => {
        if (proc.exitCode !== null) {
          resolve();
          return;
        }
        const timer = setTimeout(resolve, 1500);
        proc.once('exit', () => {
          clearTimeout(timer);
          resolve();
        });
        try {
          proc.stdin.end();
        } catch {}
        try {
          proc.kill();
        } catch {}
      });
    }
    failAllPending(Object.assign(new Error('Host client closed'), { code: 'host_closed' }));
  }

  return { request, close };
}
