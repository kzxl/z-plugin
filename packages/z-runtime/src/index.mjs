/**
 * Z Core Runtime (Kernel)
 * Agent Engineering Operating System (AEOS)
 */

export { EventBus } from './event-bus.mjs';
export { ServiceRegistry, defaultServiceRegistry, autoBootstrapCoreServices } from './service-registry.mjs';
export { LifecycleState, LifecycleManager, PluginInstance } from './lifecycle-machine.mjs';
export { CognitiveRouter, TokenBudgeter, AdaptiveTokenBudgeter, IntentClassifier, DAGPlanner, INTENT_CATEGORIES } from './cognitive-router.mjs';
export { HotReloadManager } from './hot-reload.mjs';
export { LocalIpcBridge } from './cross-process-ipc.mjs';

import { EventBus } from './event-bus.mjs';
import { defaultServiceRegistry, autoBootstrapCoreServices } from './service-registry.mjs';
import { LifecycleManager } from './lifecycle-machine.mjs';
import { CognitiveRouter } from './cognitive-router.mjs';
import { HotReloadManager } from './hot-reload.mjs';
import { LocalIpcBridge } from './cross-process-ipc.mjs';

export class ZRuntime {
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.services = options.serviceRegistry || defaultServiceRegistry;
    this.lifecycle = new LifecycleManager({
      eventBus: this.eventBus,
      serviceRegistry: this.services
    });
    this.router = new CognitiveRouter({
      eventBus: this.eventBus,
      serviceRegistry: this.services,
      defaultBudget: options.defaultBudget || 10000
    });
    this.hotReloadManager = new HotReloadManager({
      runtime: this,
      eventBus: this.eventBus
    });
    this.ipcBridge = options.enableIpc !== false ? new LocalIpcBridge({ eventBus: this.eventBus }) : null;
  }

  getRouter() {
    return this.router;
  }

  getIpcBridge() {
    return this.ipcBridge;
  }

  route(prompt, context = {}) {
    return this.router.route(prompt, context);
  }

  async hotReload() {
    return this.hotReloadManager.hotReloadAll();
  }

  registerPlugin(manifest, entryModule = null) {
    return this.lifecycle.register(manifest, entryModule);
  }

  async bootAll() {
    await autoBootstrapCoreServices(this.services);
    const plugins = this.lifecycle.getAllPlugins();
    for (const p of plugins) {
      await this.lifecycle.bootPlugin(p.id);
    }
  }

  async shutdownAll() {
    const plugins = this.lifecycle.getAllPlugins();
    for (const p of plugins) {
      await this.lifecycle.shutdownPlugin(p.id);
    }
    this.eventBus.clear();
    this.services.clear();
  }
}
