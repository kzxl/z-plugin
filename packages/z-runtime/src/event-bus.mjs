/**
 * Asynchronous In-Memory EventBus for Z Core Runtime
 * High-performance, zero-external-dependency messaging substrate.
 */

export class EventBus {
  constructor(options = {}) {
    this.subscribers = new Map(); // topic -> Set<handler>
    this.wildcardSubscribers = new Set(); // { pattern, regex, handler }
    this.requestHandlers = new Map(); // address -> handler
    this.errorHandler = options.onError || ((err, topic) => {
      console.error(`[EventBus] Unhandled error in topic '${topic}':`, err?.message || err);
    });
  }

  /**
   * Subscribe to a topic. Supports wildcards e.g. "code.*" or "*"
   */
  subscribe(topic, handler) {
    if (typeof handler !== 'function') throw new TypeError('Event handler must be a function.');

    if (topic.includes('*')) {
      const escaped = topic.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
      const item = { pattern: topic, regex: new RegExp(`^${escaped}$`), handler };
      this.wildcardSubscribers.add(item);
      return () => this.wildcardSubscribers.delete(item);
    }

    if (!this.subscribers.has(topic)) {
      this.subscribers.set(topic, new Set());
    }
    const set = this.subscribers.get(topic);
    set.add(handler);
    return () => set.delete(handler);
  }

  /**
   * Publish an event asynchronously (fire-and-forget, non-blocking)
   */
  publish(topic, payload = {}) {
    const matchedHandlers = [];

    // Exact topic matches
    if (this.subscribers.has(topic)) {
      for (const h of this.subscribers.get(topic)) matchedHandlers.push(h);
    }

    // Wildcard matches
    for (const item of this.wildcardSubscribers) {
      if (item.regex.test(topic)) {
        matchedHandlers.push(item.handler);
      }
    }

    if (matchedHandlers.length === 0) return Promise.resolve(0);

    return new Promise((resolve) => {
      setImmediate(async () => {
        let delivered = 0;
        for (const handler of matchedHandlers) {
          try {
            await handler(payload, topic);
            delivered++;
          } catch (err) {
            this.errorHandler(err, topic);
          }
        }
        resolve(delivered);
      });
    });
  }

  /**
   * Register a point-to-point Request-Reply responder
   */
  reply(address, handler) {
    if (typeof handler !== 'function') throw new TypeError('Request handler must be a function.');
    if (this.requestHandlers.has(address)) {
      throw new Error(`Address '${address}' already has a registered request handler.`);
    }
    this.requestHandlers.set(address, handler);
    return () => this.requestHandlers.delete(address);
  }

  /**
   * Send a point-to-point Request and await Reply
   */
  async request(address, payload = {}, options = {}) {
    const handler = this.requestHandlers.get(address);
    if (!handler) {
      throw new Error(`No request handler registered for address '${address}'.`);
    }

    const timeoutMs = options.timeoutMs || 5000;
    return new Promise((resolve, reject) => {
      let timer = null;
      let settled = false;

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (!settled) {
            settled = true;
            reject(new Error(`Request to '${address}' timed out after ${timeoutMs}ms.`));
          }
        }, timeoutMs);
      }

      Promise.resolve()
        .then(() => handler(payload))
        .then((result) => {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            resolve(result);
          }
        })
        .catch((err) => {
          if (!settled) {
            settled = true;
            if (timer) clearTimeout(timer);
            reject(err);
          }
        });
    });
  }

  /**
   * Clear all subscriptions and handlers
   */
  clear() {
    this.subscribers.clear();
    this.wildcardSubscribers.clear();
    this.requestHandlers.clear();
  }
}
