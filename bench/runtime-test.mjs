// Test suite for Z Core Runtime (EventBus, ServiceRegistry, LifecycleManager)
import { EventBus } from '../packages/z-runtime/src/event-bus.mjs';
import { ServiceRegistry } from '../packages/z-runtime/src/service-registry.mjs';
import { LifecycleManager, LifecycleState } from '../packages/z-runtime/src/lifecycle-machine.mjs';
import { ZRuntime } from '../packages/z-runtime/src/index.mjs';

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

console.log("z-runtime: in-memory asynchronous EventBus");
const bus = new EventBus();

// 1. Pub/sub exact match
let receivedExact = null;
bus.subscribe("code.modified", (payload) => {
  receivedExact = payload;
});
await bus.publish("code.modified", { file: "OrderService.cs", lines: 42 });
// Wait for setImmediate
await new Promise(r => setTimeout(r, 20));
ok(receivedExact !== null && receivedExact.file === "OrderService.cs", "exact topic subscription delivered");

// 2. Wildcard topic matching
let receivedWildcard = 0;
bus.subscribe("review.*", () => {
  receivedWildcard++;
});
await bus.publish("review.completed", { score: 100 });
await bus.publish("review.failed", { score: 40 });
await new Promise(r => setTimeout(r, 20));
ok(receivedWildcard === 2, `wildcard 'review.*' caught both events (got: ${receivedWildcard})`);

// 3. Error boundary isolation (listener error does not crash bus)
let errorCaught = false;
const safeBus = new EventBus({
  onError: (err, topic) => {
    errorCaught = true;
  }
});
safeBus.subscribe("fault.topic", () => {
  throw new Error("Simulated listener crash");
});
await safeBus.publish("fault.topic", {});
await new Promise(r => setTimeout(r, 20));
ok(errorCaught, "EventBus captured listener exception via error boundary");

// 4. Request-Reply IPC
bus.reply("knowledge.lookup", (req) => {
  return { found: true, query: req.query, answer: "Mock Answer" };
});
const reply = await bus.request("knowledge.lookup", { query: "deadlock" }, { timeoutMs: 1000 });
ok(reply && reply.found === true && reply.answer === "Mock Answer", "Request-Reply IPC succeeded");

// 5. Request-Reply timeout check
let timedOut = false;
try {
  await bus.request("nonexistent.address", {}, { timeoutMs: 50 });
} catch (err) {
  timedOut = true;
}
ok(timedOut, "Request to unhandled address threw appropriate error");

console.log("z-runtime: typed ServiceRegistry & Capability mapping");
const registry = new ServiceRegistry();

// 1. Register and retrieve service
const mockKnowledgeEngine = {
  query: async () => ({ results: [] })
};
registry.register("IKnowledgeEngine", mockKnowledgeEngine, {
  capabilities: ["capability:knowledge-query", "capability:episodic-memory"]
});

ok(registry.has("IKnowledgeEngine"), "Service registered successfully");
ok(registry.get("IKnowledgeEngine") === mockKnowledgeEngine, "Direct service retrieval matches");
ok(registry.get("capability:knowledge-query") === mockKnowledgeEngine, "Capability mapping retrieval matches");
ok(registry.get("capability:episodic-memory") === mockKnowledgeEngine, "Secondary capability retrieval matches");

// 2. Missing service handling
ok(registry.get("NonExistentService") === null, "Missing service returns null");
let throwMissing = false;
try {
  registry.getRequired("NonExistentService");
} catch {
  throwMissing = true;
}
ok(throwMissing, "getRequired on missing service threw error");

console.log("z-runtime: 9-state LifecycleManager");
const lifecycle = new LifecycleManager({
  eventBus: bus,
  serviceRegistry: registry
});

let initialized = false;
let activated = false;
let deactivated = false;
let disposed = false;

const mockPlugin = {
  async initialize(ctx) {
    initialized = true;
    ok(ctx.services === registry, "initialize received service registry");
  },
  async activate(ctx) {
    activated = true;
    ok(ctx.eventBus === bus, "activate received event bus");
  },
  async deactivate() {
    deactivated = true;
  },
  async dispose() {
    disposed = true;
  }
};

const instance = lifecycle.register({
  id: "test-plugin",
  name: "Test Plugin",
  version: "1.0.0"
}, mockPlugin);

ok(instance.state === LifecycleState.DISCOVER, "new plugin starts in DISCOVER state");

await lifecycle.bootPlugin("test-plugin");
ok(initialized, "plugin initialize() called");
ok(activated, "plugin activate() called");
ok(instance.state === LifecycleState.EXECUTE, `plugin booted to EXECUTE state (current: ${instance.state})`);

await lifecycle.shutdownPlugin("test-plugin");
ok(deactivated, "plugin deactivate() called");
ok(disposed, "plugin dispose() called");
ok(instance.state === LifecycleState.DISPOSE, `plugin reached DISPOSE state (current: ${instance.state})`);

console.log("z-runtime: integrated ZRuntime facade");
const runtime = new ZRuntime();
const facadeInstance = runtime.registerPlugin({
  id: "runtime-facade-test",
  name: "Facade Test",
  version: "1.0.0"
});
await runtime.bootAll();
ok(facadeInstance.state === LifecycleState.EXECUTE, "bootAll boots registered plugins");
await runtime.shutdownAll();
ok(facadeInstance.state === LifecycleState.DISPOSE, "shutdownAll disposes registered plugins");

console.log("\nall z-runtime tests passed!");
