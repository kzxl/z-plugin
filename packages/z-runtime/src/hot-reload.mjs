/**
 * Hot-Reload & Dynamic Knowledge Invalidation Manager
 * Agent Engineering Operating System (AEOS)
 *
 * Provides instantaneous in-memory hot-reloading for:
 * 1. Extension DLCs (auto-register newly created DLC rules & gate checks)
 * 2. Synonyms dictionary (bilingual terminology cache invalidation)
 * 3. Engineering Invariant Rules (re-sync project rules without restarting sessions)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const EXTENSIONS_DIR = path.join(ROOT_DIR, 'extensions');

export class HotReloadManager {
  constructor(options = {}) {
    this.runtime = options.runtime || null;
    this.eventBus = options.eventBus || (this.runtime ? this.runtime.eventBus : null);
    this.watchers = new Map();
    this.debounceTimer = null;
    this.debounceMs = options.debounceMs || 100;
  }

  /**
   * Instantaneously reload all installed DLCs in extensions/
   */
  async reloadDlcs(extensionsDir = EXTENSIONS_DIR) {
    if (!fs.existsSync(extensionsDir)) {
      return { success: false, reloaded: 0, dlcs: [] };
    }

    const entries = fs.readdirSync(extensionsDir, { withFileTypes: true });
    const loadedDlcs = [];

    // Dynamically resolve z-mind rules and z-gate reviewer hooks
    let registerRulesPack = null;
    let registerLineReviewer = null;

    try {
      const mindModule = await import('../../../plugins/z-mind/scripts/lib/rules.mjs');
      registerRulesPack = mindModule.registerRulesPack;
    } catch {}

    try {
      const gateModule = await import('../../../plugins/z-gate/scripts/lib/code-reviewer.mjs');
      registerLineReviewer = gateModule.registerLineReviewer;
      if (typeof gateModule.clearCustomLineReviewers === 'function') {
        gateModule.clearCustomLineReviewers();
      }
    } catch {}

    for (const ent of entries) {
      if (ent.isDirectory() && ent.name.startsWith('dlc-')) {
        const dlcDir = path.join(extensionsDir, ent.name);
        const manifestPath = path.join(dlcDir, 'z-plugin.manifest.json');
        if (fs.existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

            // 1. Hot-reload contributed rules
            if (registerRulesPack && manifest.contributions?.rules) {
              for (const rRel of manifest.contributions.rules) {
                const rFull = path.resolve(dlcDir, rRel);
                if (fs.existsSync(rFull)) {
                  const ruleData = JSON.parse(fs.readFileSync(rFull, 'utf8'));
                  registerRulesPack(ruleData);
                }
              }
            }

            // 2. Hot-reload contributed gate checkers
            if (registerLineReviewer && manifest.contributions?.gateChecks) {
              const entryFile = path.resolve(dlcDir, manifest.main || 'index.mjs');
              if (fs.existsSync(entryFile)) {
                try {
                  const dlcModule = await import(`file://${entryFile}?t=${Date.now()}`);
                  if (dlcModule.gateChecks) {
                    for (const gc of manifest.contributions.gateChecks) {
                      const fn = dlcModule.gateChecks[gc.handler];
                      if (typeof fn === 'function') {
                        registerLineReviewer(fn);
                      }
                    }
                  }
                  if (typeof dlcModule.activateDlc === 'function' && this.runtime) {
                    dlcModule.activateDlc(this.runtime);
                  }
                } catch {}
              }
            }

            loadedDlcs.push({
              id: manifest.id,
              name: manifest.name,
              version: manifest.version,
              path: dlcDir
            });
          } catch {}
        }
      }
    }

    if (this.eventBus) {
      this.eventBus.emit('hotreload:dlcs_reloaded', {
        count: loadedDlcs.length,
        dlcs: loadedDlcs.map(d => d.id),
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      reloaded: loadedDlcs.length,
      dlcs: loadedDlcs
    };
  }

  /**
   * Reload bilingual synonyms dictionary in z-brain
   */
  async reloadSynonyms(customPath = null) {
    let reloadedDict = {};
    try {
      const searchModule = await import('../../../plugins/z-brain/scripts/lib/search.mjs');
      if (typeof searchModule.reloadSynonymsDictionary === 'function') {
        reloadedDict = searchModule.reloadSynonymsDictionary(customPath);
      }
    } catch {}

    if (this.eventBus) {
      this.eventBus.emit('hotreload:synonyms_reloaded', {
        keys: Object.keys(reloadedDict).length,
        timestamp: new Date().toISOString()
      });
    }

    return reloadedDict;
  }

  /**
   * Execute full hot-reload across all components in a single turn (<5ms)
   */
  async hotReloadAll() {
    const startTime = Date.now();
    const dlcRes = await this.reloadDlcs();
    const synRes = await this.reloadSynonyms();
    const durationMs = Date.now() - startTime;

    const summary = {
      success: true,
      dlcs: dlcRes.reloaded,
      synonyms: Object.keys(synRes).length,
      durationMs
    };

    if (this.eventBus) {
      this.eventBus.emit('hotreload:complete', summary);
    }

    return summary;
  }

  /**
   * Start debounced filesystem watching on target directories
   */
  startWatching(dirs = [EXTENSIONS_DIR]) {
    for (const d of dirs) {
      if (fs.existsSync(d) && !this.watchers.has(d)) {
        try {
          const watcher = fs.watch(d, { recursive: true }, (eventType, filename) => {
            if (this.debounceTimer) clearTimeout(this.debounceTimer);
            this.debounceTimer = setTimeout(() => {
              this.hotReloadAll();
            }, this.debounceMs);
          });
          this.watchers.set(d, watcher);
        } catch {}
      }
    }
  }

  /**
   * Stop all active filesystem watchers
   */
  stopWatching() {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    for (const watcher of this.watchers.values()) {
      try {
        watcher.close();
      } catch {}
    }
    this.watchers.clear();
  }
}
