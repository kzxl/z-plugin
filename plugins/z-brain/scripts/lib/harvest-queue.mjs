/**
 * Asynchronous In-Memory Write Queue with Exponential Backoff & Retry
 * Protects SQLite WAL from SQLITE_BUSY lock contention under concurrent multi-agent workloads.
 */

import fs from 'node:fs';
import path from 'node:path';
import { harvestKnowledge } from './harvest.mjs';

export class AsyncHarvestQueue {
  constructor(options = {}) {
    this.queue = [];
    this.processing = false;
    this.maxRetries = options.maxRetries || 5;
    this.baseDelayMs = options.baseDelayMs || 15;
    this.fallbackLogPath = options.fallbackLogPath || null;
    this.onSuccess = options.onSuccess || null;
    this.onError = options.onError || null;
    this.stats = {
      enqueued: 0,
      processed: 0,
      retries: 0,
      failed: 0
    };
  }

  /**
   * Enqueue a harvest task.
   * Returns a Promise that resolves when the atom is successfully written.
   */
  enqueue(task) {
    this.stats.enqueued++;
    return new Promise((resolve, reject) => {
      this.queue.push({
        task,
        resolve,
        reject,
        attempts: 0,
        enqueuedAt: Date.now()
      });
      this.processNext();
    });
  }

  async processNext() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const item = this.queue.shift();
      let success = false;

      while (item.attempts < this.maxRetries) {
        try {
          item.attempts++;
          const result = harvestKnowledge(item.task);
          this.stats.processed++;
          success = true;
          if (this.onSuccess) this.onSuccess(result, item.task);
          item.resolve(result);
          break;
        } catch (err) {
          const isLockError = err?.message && (
            err.message.includes('locked') ||
            err.message.includes('busy') ||
            err.message.includes('SQLITE_BUSY')
          );

          if (isLockError && item.attempts < this.maxRetries) {
            this.stats.retries++;
            // Exponential backoff with jitter: baseDelay * 2^attempts + random(0, 15)ms
            const delay = (this.baseDelayMs * Math.pow(2, item.attempts)) + Math.floor(Math.random() * 15);
            await new Promise(r => setTimeout(r, delay));
          } else {
            // Non-lock error or exhausted retries
            break;
          }
        }
      }

      if (!success) {
        this.stats.failed++;
        const failureErr = new Error(`Harvest failed after ${item.attempts} attempts: lock contention or database error.`);
        if (this.fallbackLogPath) {
          try {
            fs.appendFileSync(
              this.fallbackLogPath,
              JSON.stringify({ task: item.task, error: failureErr.message, at: new Date().toISOString() }) + '\n'
            );
          } catch {}
        }
        if (this.onError) this.onError(failureErr, item.task);
        item.reject(failureErr);
      }
    }

    this.processing = false;
  }

  getQueueLength() {
    return this.queue.length;
  }

  isIdle() {
    return !this.processing && this.queue.length === 0;
  }

  getStats() {
    return { ...this.stats, currentQueueLength: this.queue.length };
  }

  clear() {
    this.queue = [];
    this.processing = false;
  }
}

export const defaultHarvestQueue = new AsyncHarvestQueue();

export function enqueueHarvest(task) {
  return defaultHarvestQueue.enqueue(task);
}
