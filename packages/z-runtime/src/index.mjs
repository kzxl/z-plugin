/**
 * Z Core Runtime (Kernel)
 * Agent Engineering Operating System (AEOS)
 */

export { EventBus } from './event-bus.mjs';
export { ServiceRegistry, defaultServiceRegistry } from './service-registry.mjs';
export { LifecycleState, LifecycleManager, PluginInstance } from './lifecycle-machine.mjs';

import { EventBus } from './event-bus.mjs';
import { defaultServiceRegistry } from './service-registry.mjs';
import { LifecycleManager } from './lifecycle-machine.mjs';

export class ZRuntime {
  constructor(options = {}) {
    this.eventBus = options.eventBus || new EventBus();
    this.services = options.serviceRegistry || defaultServiceRegistry;
    this.lifecycle = new LifecycleManager({
      eventBus: this.eventBus,
      serviceRegistry: this.services
    });
  }

  registerPlugin(manifest, entryModule = null) {
    return this.lifecycle.register(manifest, entryModule);
  }

  async bootAll() {
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
