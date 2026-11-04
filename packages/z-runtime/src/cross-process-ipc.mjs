/**
 * Cross-Process Local IPC & Synchronization Bridge
 * Agent Engineering Operating System (AEOS)
 *
 * Enables seamless, sub-10ms event broadcasting and state synchronization
 * across multiple independent Agent processes (Claude Code, Cursor, Antigravity,
 * ZCode CLI, Aider, terminal tabs) using local file-based atomic streams and locks.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const DEFAULT_IPC_DIR = path.join(os.homedir(), '.zcode', 'ipc');
const EVENT_STREAM_FILE = 'event_stream.jsonl';
const LOCK_DIR = 'locks';

export class LocalIpcBridge {
  constructor(options = {}) {
    this.ipcDir = options.ipcDir || process.env.AEOS_IPC_DIR || DEFAULT_IPC_DIR;
    this.eventStreamPath = path.join(this.ipcDir, EVENT_STREAM_FILE);
    this.lockDir = path.join(this.ipcDir, LOCK_DIR);
    this.processId = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.eventBus = options.eventBus || null;
    this.watcher = null;
    this.lastReadOffset = 0;
    this.isWatching = false;

    this._ensureDirectories();
  }

  _ensureDirectories() {
    try {
      if (!fs.existsSync(this.ipcDir)) {
        fs.mkdirSync(this.ipcDir, { recursive: true });
      }
      if (!fs.existsSync(this.lockDir)) {
        fs.mkdirSync(this.lockDir, { recursive: true });
      }
      if (!fs.existsSync(this.eventStreamPath)) {
        fs.writeFileSync(this.eventStreamPath, '', 'utf8');
      }
    } catch {}
  }

  /**
   * Broadcast an event across all running Agent processes
   */
  broadcast(topic, payload = {}) {
    this._ensureDirectories();
    const envelope = {
      id: `${this.processId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      sourceProcess: this.processId,
      timestamp: new Date().toISOString(),
      topic,
      payload
    };

    const line = JSON.stringify(envelope) + '\n';
    try {
      fs.appendFileSync(this.eventStreamPath, line, 'utf8');
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start listening for cross-process events emitted by other processes
   */
  startListening(callback = null) {
    this._ensureDirectories();
    try {
      const stats = fs.statSync(this.eventStreamPath);
      this.lastReadOffset = stats.size;
    } catch {
      this.lastReadOffset = 0;
    }

    if (this.isWatching) return;

    try {
      this.watcher = fs.watch(this.eventStreamPath, (eventType) => {
        if (eventType === 'change') {
          this._readNewEvents(callback);
        }
      });
      this.isWatching = true;
    } catch {}
  }

  _readNewEvents(callback = null) {
    try {
      const stats = fs.statSync(this.eventStreamPath);
      if (stats.size < this.lastReadOffset) {
        // File was truncated or rotated
        this.lastReadOffset = 0;
      }
      if (stats.size === this.lastReadOffset) return;

      const fd = fs.openSync(this.eventStreamPath, 'r');
      const bytesToRead = stats.size - this.lastReadOffset;
      const buffer = Buffer.alloc(bytesToRead);

      fs.readSync(fd, buffer, 0, bytesToRead, this.lastReadOffset);
      fs.closeSync(fd);

      this.lastReadOffset = stats.size;
      const text = buffer.toString('utf8');
      const lines = text.split('\n').filter(Boolean);

      for (const line of lines) {
        try {
          const envelope = JSON.parse(line);
          // Ignore events from our own process to prevent feedback loops
          if (envelope.sourceProcess === this.processId) continue;

          // Dispatch to callback
          if (typeof callback === 'function') {
            callback(envelope.topic, envelope.payload, envelope);
          }

          // Dispatch to attached EventBus
          if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(envelope.topic, envelope.payload);
          }
        } catch {}
      }
    } catch {}
  }

  /**
   * Execute action under a distributed file lock with timeout and retry
   */
  async withLock(lockName, taskFn, timeoutMs = 3000) {
    this._ensureDirectories();
    const cleanName = lockName.replace(/[^a-zA-Z0-9_-]/g, '_');
    const lockFile = path.join(this.lockDir, `${cleanName}.lock`);
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      try {
        // Atomic lock acquisition using wx flag
        fs.writeFileSync(lockFile, JSON.stringify({
          pid: process.pid,
          processId: this.processId,
          acquiredAt: Date.now()
        }), { flag: 'wx' });

        try {
          return await taskFn();
        } finally {
          try {
            if (fs.existsSync(lockFile)) {
              fs.unlinkSync(lockFile);
            }
          } catch {}
        }
      } catch (err) {
        if (err.code === 'EEXIST') {
          // Check if lock is stale (>5000ms old)
          try {
            const data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
            if (Date.now() - data.acquiredAt > 5000) {
              fs.unlinkSync(lockFile);
              continue;
            }
          } catch {
            try { fs.unlinkSync(lockFile); } catch {}
          }
          await new Promise(r => setTimeout(r, 20 + Math.random() * 30));
        } else {
          throw err;
        }
      }
    }

    throw new Error(`Timeout acquiring cross-process lock '${lockName}' after ${timeoutMs}ms`);
  }

  stopListening() {
    if (this.watcher) {
      try {
        this.watcher.close();
      } catch {}
      this.watcher = null;
    }
    this.isWatching = false;
  }
}
