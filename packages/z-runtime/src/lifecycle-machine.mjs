/**
 * 9-State Deterministic Lifecycle Machine for Z Core Runtime
 * Manages plugin lifecycle transitions with fault isolation.
 */

export const LifecycleState = {
  DISCOVER: 'DISCOVER',
  VALIDATE: 'VALIDATE',
  RESOLVE: 'RESOLVE',
  LOAD: 'LOAD',
  INITIALIZE: 'INITIALIZE',
  ACTIVATE: 'ACTIVATE',
  EXECUTE: 'EXECUTE',
  DEACTIVATE: 'DEACTIVATE',
  DISPOSE: 'DISPOSE',
  ERROR: 'ERROR'
};

const VALID_TRANSITIONS = {
  [LifecycleState.DISCOVER]: [LifecycleState.VALIDATE, LifecycleState.ERROR],
  [LifecycleState.VALIDATE]: [LifecycleState.RESOLVE, LifecycleState.ERROR],
  [LifecycleState.RESOLVE]: [LifecycleState.LOAD, LifecycleState.ERROR],
  [LifecycleState.LOAD]: [LifecycleState.INITIALIZE, LifecycleState.ERROR],
  [LifecycleState.INITIALIZE]: [LifecycleState.ACTIVATE, LifecycleState.ERROR],
  [LifecycleState.ACTIVATE]: [LifecycleState.EXECUTE, LifecycleState.ERROR],
  [LifecycleState.EXECUTE]: [LifecycleState.DEACTIVATE, LifecycleState.ERROR],
  [LifecycleState.DEACTIVATE]: [LifecycleState.DISPOSE, LifecycleState.ERROR],
  [LifecycleState.DISPOSE]: [],
  [LifecycleState.ERROR]: [LifecycleState.DISPOSE]
};

export class PluginInstance {
  constructor(manifest, entryModule = null) {
    this.manifest = manifest;
    this.id = manifest.id;
    this.version = manifest.version || '1.0.0';
    this.entryModule = entryModule;
    this.state = LifecycleState.DISCOVER;
    this.error = null;
    this.activatedAt = null;
  }

  transition(targetState, error = null) {
    const allowed = VALID_TRANSITIONS[this.state] || [];
    if (!allowed.includes(targetState)) {
      throw new Error(`Invalid lifecycle transition for plugin '${this.id}': ${this.state} -> ${targetState}`);
    }
    this.state = targetState;
    if (error) this.error = error;
    if (targetState === LifecycleState.ACTIVATE) this.activatedAt = Date.now();
  }
}

export class LifecycleManager {
  constructor(options = {}) {
    this.plugins = new Map(); // id -> PluginInstance
    this.eventBus = options.eventBus || null;
    this.serviceRegistry = options.serviceRegistry || null;
  }

  register(manifest, entryModule = null) {
    if (!manifest || !manifest.id) throw new TypeError('Valid manifest with ID is required.');
    const instance = new PluginInstance(manifest, entryModule);
    this.plugins.set(manifest.id, instance);
    return instance;
  }

  getPlugin(id) {
    return this.plugins.get(id) || null;
  }

  getAllPlugins() {
    return Array.from(this.plugins.values());
  }

  async bootPlugin(id) {
    const p = this.plugins.get(id);
    if (!p) throw new Error(`Plugin '${id}' not found.`);

    try {
      // 1. DISCOVER -> VALIDATE
      p.transition(LifecycleState.VALIDATE);
      if (!p.manifest.name || !p.manifest.version) {
        throw new Error(`Plugin '${id}' manifest missing required metadata.`);
      }

      // 2. VALIDATE -> RESOLVE
      p.transition(LifecycleState.RESOLVE);
      // Verify dependencies if any
      const deps = p.manifest.dependencies?.plugins || {};
      for (const depId of Object.keys(deps)) {
        if (!this.plugins.has(depId)) {
          // Check if optional
          const isOptional = p.manifest.capabilities?.requires?.find(r => r.id === depId)?.optional;
          if (!isOptional) {
            throw new Error(`Plugin '${id}' requires missing dependency '${depId}'.`);
          }
        }
      }

      // 3. RESOLVE -> LOAD
      p.transition(LifecycleState.LOAD);

      // 4. LOAD -> INITIALIZE
      p.transition(LifecycleState.INITIALIZE);
      const context = {
        manifest: p.manifest,
        eventBus: this.eventBus,
        services: this.serviceRegistry
      };
      if (p.entryModule && typeof p.entryModule.initialize === 'function') {
        await p.entryModule.initialize(context);
      }

      // 5. INITIALIZE -> ACTIVATE
      p.transition(LifecycleState.ACTIVATE);
      if (p.entryModule && typeof p.entryModule.activate === 'function') {
        await p.entryModule.activate(context);
      }

      // 6. ACTIVATE -> EXECUTE
      p.transition(LifecycleState.EXECUTE);
      return p;
    } catch (err) {
      p.transition(LifecycleState.ERROR, err);
      return p;
    }
  }

  async shutdownPlugin(id) {
    const p = this.plugins.get(id);
    if (!p) return;

    try {
      if (p.state === LifecycleState.EXECUTE) {
        p.transition(LifecycleState.DEACTIVATE);
        if (p.entryModule && typeof p.entryModule.deactivate === 'function') {
          await p.entryModule.deactivate();
        }
      }
      p.transition(LifecycleState.DISPOSE);
      if (p.entryModule && typeof p.entryModule.dispose === 'function') {
        await p.entryModule.dispose();
      }
    } catch (err) {
      p.transition(LifecycleState.ERROR, err);
    }
  }
}
