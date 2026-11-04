// Empirical Verification Suite for Graphify Call-Graph & Blast Radius in z-token
//
// Tests:
// 1. AST call extraction across C# and TypeScript services
// 2. BFS tracePath shortest-path traversal (<2ms SLA)
// 3. getCallers inverted lookup
// 4. getBlastRadius upstream & downstream impact calculation
// 5. God Node high-centrality detection

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  indexWorkspace,
  lookupSymbol,
  tracePath,
  getCallers,
  getBlastRadius,
} from "../plugins/z-token/scripts/lib/symbol-cache.mjs";

console.log("=== z-token: Graphify Call-Graph & Blast Radius Benchmark ===");

const TEST_DIR = path.join(os.tmpdir(), `ztoken-graphify-${Date.now()}`);

try {
  fs.mkdirSync(TEST_DIR, { recursive: true });

  const dirs = [
    "src/Controllers",
    "src/Services/Order",
    "src/Services/Inventory",
    "src/Services/Warehouse",
    "src/Services/Audit",
    "src/Core",
  ];

  for (const d of dirs) fs.mkdirSync(path.join(TEST_DIR, d), { recursive: true });

  // 1. Generate Multi-hop Call Pipeline:
  // OrderController.HandleCheckout -> ProcessOrder -> DeductStock -> UpdateWarehouseBin -> AuditLogEntry

  fs.writeFileSync(
    path.join(TEST_DIR, "src/Controllers", "OrderController.cs"),
    `
namespace App.Controllers {
    public class OrderController {
        public async Task<bool> HandleCheckout(string cartId) {
            var ok = await ProcessOrder(cartId, 100);
            return ok;
        }
    }
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(TEST_DIR, "src/Services/Order", "OrderService.cs"),
    `
namespace App.Services.Order {
    public class OrderService {
        public async Task<bool> ProcessOrder(string id, decimal amt) {
            ValidateCart(id);
            var deducted = await DeductStock(id);
            return deducted;
        }

        private void ValidateCart(string id) {}
    }
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(TEST_DIR, "src/Services/Inventory", "InventoryService.cs"),
    `
namespace App.Services.Inventory {
    public class InventoryService {
        public async Task<bool> DeductStock(string itemId) {
            var binOk = await UpdateWarehouseBin(itemId, 1);
            return binOk;
        }
    }
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(TEST_DIR, "src/Services/Warehouse", "WarehouseService.cs"),
    `
namespace App.Services.Warehouse {
    public class WarehouseService {
        public async Task<bool> UpdateWarehouseBin(string binId, int qty) {
            AuditLogEntry("WAREHOUSE", binId);
            return true;
        }
    }
}
`,
    "utf8"
  );

  fs.writeFileSync(
    path.join(TEST_DIR, "src/Services/Audit", "AuditService.cs"),
    `
namespace App.Services.Audit {
    public class AuditService {
        public void AuditLogEntry(string domain, string id) {
            // Persist audit record
        }
    }
}
`,
    "utf8"
  );

  // God Node Service: 10 connections
  fs.writeFileSync(
    path.join(TEST_DIR, "src/Core", "CentralHubService.cs"),
    `
namespace App.Core {
    public class CentralHubService {
        public void CentralDispatch() {
            ActionA(); ActionB(); ActionC(); ActionD(); ActionE();
            ActionF(); ActionG(); ActionH(); ActionI(); ActionJ();
        }
        public void ActionA() {} public void ActionB() {} public void ActionC() {}
        public void ActionD() {} public void ActionE() {} public void ActionF() {}
        public void ActionG() {} public void ActionH() {} public void ActionI() {}
        public void ActionJ() {}
    }
}
`,
    "utf8"
  );

  // 2. Index Workspace
  console.log("\n[1/5] Indexing call-graph topology into prefix buckets...");
  const tIndex0 = performance.now();
  const indexRes = indexWorkspace(TEST_DIR);
  const indexDur = performance.now() - tIndex0;

  console.log(`  Indexed ${indexRes.indexedFiles} files, ${indexRes.totalSymbols} symbols in ${indexDur.toFixed(1)}ms`);
  assert.strictEqual(indexRes.indexedFiles, 6);
  console.log("  ok   workspace indexed with calls metadata");

  // 3. Verify Calls Extraction
  console.log("\n[2/5] Verifying calls array extraction...");
  const procOrderHit = lookupSymbol(TEST_DIR, "ProcessOrder")[0];
  assert.ok(procOrderHit, "ProcessOrder must exist in cache");
  assert.ok(Array.isArray(procOrderHit.calls), "calls must be an array");
  assert.ok(procOrderHit.calls.includes("ValidateCart"), "ProcessOrder must call ValidateCart");
  assert.ok(procOrderHit.calls.includes("DeductStock"), "ProcessOrder must call DeductStock");
  console.log(`  ProcessOrder calls: [${procOrderHit.calls.join(", ")}]`);
  console.log("  ok   extracted calls accurately from function body");

  // 4. Test tracePath (BFS Graph Traversal)
  console.log("\n[3/5] Testing tracePath (BFS Shortest Path Traversal)...");
  const tTrace0 = performance.now();
  const trace = tracePath(TEST_DIR, "HandleCheckout", "AuditLogEntry");
  const traceDur = performance.now() - tTrace0;

  console.log(`  Trace Result: ${trace.path.join(" -> ")} (${trace.depth} hops, ${traceDur.toFixed(3)}ms)`);
  assert.strictEqual(trace.found, true, "Must find multi-hop path");
  assert.strictEqual(trace.depth, 4, "Must be exactly 4 hops");
  assert.strictEqual(trace.path[0], "HandleCheckout");
  assert.strictEqual(trace.path[1], "ProcessOrder");
  assert.strictEqual(trace.path[2], "DeductStock");
  assert.strictEqual(trace.path[3], "UpdateWarehouseBin");
  assert.strictEqual(trace.path[4], "AuditLogEntry");
  assert.ok(traceDur < 2.0, `tracePath latency (${traceDur.toFixed(3)}ms) must be under 2.0ms SLA`);
  console.log("  ok   tracePath verified with <2ms SLA");

  // Disconnected path test
  const discTrace = tracePath(TEST_DIR, "HandleCheckout", "NonExistentFunction");
  assert.strictEqual(discTrace.found, false);
  console.log("  ok   handles disconnected graph query cleanly");

  // 5. Test getCallers (Inverted Call Graph)
  console.log("\n[4/5] Testing getCallers (Inverted Callers)...");
  const deductCallers = getCallers(TEST_DIR, "DeductStock");
  assert.strictEqual(deductCallers.length, 1);
  assert.strictEqual(deductCallers[0].caller, "ProcessOrder");
  console.log(`  Callers of DeductStock: [${deductCallers.map((c) => c.caller).join(", ")}]`);
  console.log("  ok   getCallers identifies upstream dependents");

  // 6. Test getBlastRadius & God Node Detection
  console.log("\n[5/5] Testing getBlastRadius & God Node Detection...");
  const blast = getBlastRadius(TEST_DIR, "DeductStock");
  console.log(`  Blast Radius for DeductStock:`);
  console.log(`    In-degree: ${blast.inDegree}, Out-degree: ${blast.outDegree}`);
  console.log(`    Impacted Symbols: [${blast.impactedSymbols.join(", ")}]`);
  console.log(`    Impacted Files: [${blast.impactedFiles.join(", ")}]`);
  assert.ok(blast.impactedSymbols.includes("ProcessOrder"), "Must impact upstream ProcessOrder");
  assert.ok(blast.impactedSymbols.includes("HandleCheckout"), "Must transitively impact HandleCheckout");
  assert.ok(blast.directCallees.includes("UpdateWarehouseBin"), "Must include downstream UpdateWarehouseBin");
  assert.strictEqual(blast.isGodNode, false, "DeductStock should not be a God Node");

  // Test God Node detection
  const godBlast = getBlastRadius(TEST_DIR, "CentralDispatch");
  console.log(`  Blast Radius for CentralDispatch: total degree = ${godBlast.totalDegree}, isGodNode = ${godBlast.isGodNode}`);
  assert.strictEqual(godBlast.isGodNode, true, "CentralDispatch with 10 callees must be detected as God Node");
  console.log("  ok   God Node high-coupling detection verified");

  console.log("\n=== ALL GRAPHIFY CALL-GRAPH TESTS PASSED! ===");
} finally {
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}
