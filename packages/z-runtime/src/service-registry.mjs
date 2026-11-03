/**
 * Typed Service Registry & Capability Locator for Z Core Runtime
 * Enables decoupled inter-plugin communication without relative filesystem imports.
 */

export class ServiceRegistry {
  constructor() {
    this.services = new Map(); // serviceId -> { instance, metadata }
    this.capabilities = new Map(); // capabilityId -> serviceId
  }

  /**
   * Register a service instance by contract interface or service identifier
   */
  register(serviceId, instance, options = {}) {
    if (!serviceId || typeof serviceId !== 'string') {
      throw new TypeError('Service ID must be a non-empty string.');
    }
    if (!instance) {
      throw new TypeError('Service instance cannot be null or undefined.');
    }
    if (this.services.has(serviceId) && !options.overwrite) {
      throw new Error(`Service '${serviceId}' is already registered.`);
    }

    this.services.set(serviceId, {
      instance,
      version: options.version || '1.0.0',
      pluginId: options.pluginId || 'unknown'
    });

    if (Array.isArray(options.capabilities)) {
      for (const cap of options.capabilities) {
        this.capabilities.set(cap, serviceId);
      }
    }
  }

  /**
   * Retrieve a service instance. Returns null if not found.
   */
  get(serviceId) {
    if (this.services.has(serviceId)) {
      return this.services.get(serviceId).instance;
    }
    // Check if queried by capability ID
    if (this.capabilities.has(serviceId)) {
      const targetId = this.capabilities.get(serviceId);
      return this.services.get(targetId)?.instance || null;
    }
    return null;
  }

  /**
   * Retrieve a service instance or throw an error if missing.
   */
  getRequired(serviceId) {
    const s = this.get(serviceId);
    if (!s) {
      throw new Error(`Required service or capability '${serviceId}' is not registered.`);
    }
    return s;
  }

  /**
   * Check if a service or capability is available.
   */
  has(serviceId) {
    return this.services.has(serviceId) || this.capabilities.has(serviceId);
  }

  /**
   * Unregister a service.
   */
  unregister(serviceId) {
    this.services.delete(serviceId);
    for (const [cap, target] of this.capabilities.entries()) {
      if (target === serviceId) {
        this.capabilities.delete(cap);
      }
    }
  }

  /**
   * Clear all services and capability registrations.
   */
  clear() {
    this.services.clear();
    this.capabilities.clear();
  }
}

// Global default singleton instance for in-process sharing
export const defaultServiceRegistry = new ServiceRegistry();
