// Large Repository Benchmark & Accuracy Test for z-token Persistent Symbol Cache
//
// Tests:
// 1. Synthetic generation of 300 source files with 3,000+ symbols
// 2. Self-ignoring .z-plugin/.gitignore creation
// 3. Prefix-bucket sharding distribution (xx.json)
// 4. Cold indexing throughput (files/sec, symbols/sec)
// 5. Warm lookup response latency (<2ms SLA)
// 6. Invalidation accuracy upon file mutation (mtime mismatch auto-repair)
// 7. Deletion resilience

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import {
  indexWorkspace,
  lookupSymbol,
  getCacheStats,
  clearCache,
  getSymbolPrefix,
} from "../plugins/z-token/scripts/lib/symbol-cache.mjs";
import { readSymbol } from "../plugins/z-token/scripts/lib/scan.mjs";

console.log("=== z-token: Large Repo Symbol Cache Benchmark & Verification ===");

const TEST_DIR = path.join(os.tmpdir(), `ztoken-bench-${Date.now()}`);

try {
  fs.mkdirSync(TEST_DIR, { recursive: true });

  // 1. Generate Synthetic Large Repository
  console.log("\n[1/6] Generating synthetic large repository fixture (500 files, ~4,500 symbols)...");
  const subdirs = [
    "src/Services",
    "src/Controllers",
    "src/Models",
    "src/Repositories",
    "src/Common/Utils",
    "src/Modules/Accounting",
    "src/Modules/Inventory",
    "src/Modules/Sales",
    "src/Modules/Shipping",
    "src/Modules/Reporting",
  ];

  for (const dir of subdirs) {
    fs.mkdirSync(path.join(TEST_DIR, dir), { recursive: true });
  }

  let totalGeneratedFiles = 0;
  let totalGeneratedSymbols = 0;

  // Key target symbols for accuracy testing
  const targetSymbols = [
    { name: "ProcessOrderAsync", file: "src/Services/OrderProcessingService.cs" },
    { name: "CalculateVatDiscount", file: "src/Modules/Sales/TaxCalculator.cs" },
    { name: "AuthorizePaymentToken", file: "src/Controllers/PaymentGatewayController.cs" },
    { name: "ExportInvoiceToExcel", file: "src/Modules/Reporting/InvoiceReportExporter.cs" },
    { name: "ReserveWarehouseStock", file: "src/Modules/Inventory/StockAllocationService.cs" },
  ];

  // Helper to generate a realistic C# file
  function generateCsFile(index, dir, specialSymbol = null) {
    const className = `ServiceComponent_${index}`;
    const codeLines = [
      "using System;",
      "using System.Threading.Tasks;",
      "using System.Collections.Generic;",
      "",
      `namespace EnterpriseApp.${dir.replace(/\//g, ".")}`,
      "{",
      "    /// <summary>",
      `    /// Enterprise service component ${index} handling business workflows.`,
      "    /// </summary>",
      `    public class ${className}`,
      "    {",
      `        public int ComponentId => ${index};`,
      `        public string ComponentName { get; set; } = "${className}";`,
      "",
    ];

    let symCount = 3; // class + 2 props

    if (specialSymbol) {
      codeLines.push(
        "        /// <summary>",
        `        /// Special critical operation: ${specialSymbol}`,
        "        /// </summary>",
        "        [TransactionRequired]",
        "        [AuditLogged]",
        `        public async Task<bool> ${specialSymbol}(string contextId, decimal amount)`,
        "        {",
        "            if (amount <= 0) throw new ArgumentOutOfRangeException(nameof(amount));",
        "            await Task.Delay(1);",
        "            return true;",
        "        }",
        ""
      );
      symCount++;
    }

    // Add 8 standard methods to reach ~11 symbols per file
    for (let m = 1; m <= 8; m++) {
      codeLines.push(
        `        public void ExecuteAction_${m}(string paramA, int paramB)`,
        "        {",
        `            var log = $"Action {paramA} executed with {paramB}";`,
        "        }",
        ""
      );
      symCount++;
    }

    codeLines.push("    }", "}");
    return { code: codeLines.join("\n"), symCount };
  }

  // Helper to generate a realistic TypeScript file
  function generateTsFile(index, dir) {
    const moduleName = `ApiModule_${index}`;
    const codeLines = [
      "import { Request, Response } from 'express';",
      "",
      `export interface I${moduleName}Config {`,
      "  endpoint: string;",
      "  timeoutMs: number;",
      "}",
      "",
      `export class ${moduleName} {`,
      `  constructor(private readonly config: I${moduleName}Config) {}`,
      "",
      `  async handleRequest_${index}(req: Request, res: Response): Promise<void> {`,
      "    res.json({ ok: true, id: req.params.id });",
      "  }",
      "",
      `  validatePayload_${index}(payload: unknown): boolean {`,
      "    return Boolean(payload);",
      "  }",
      "}",
      "",
      `export const helperFunction_${index} = (x: number): number => {`,
      "  return x * 2;",
      "};",
    ];
    return { code: codeLines.join("\n"), symCount: 5 };
  }

  // Populate 500 files across directories
  for (let i = 1; i <= 500; i++) {
    const dir = subdirs[i % subdirs.length];
    const isSpecial = targetSymbols.find((s) => s.file.endsWith(`_${i}.cs`)) || null;

    if (i % 3 === 0) {
      // TypeScript file
      const filePath = path.join(TEST_DIR, dir, `module_${i}.ts`);
      const { code, symCount } = generateTsFile(i, dir);
      fs.writeFileSync(filePath, code, "utf8");
      totalGeneratedFiles++;
      totalGeneratedSymbols += symCount;
    } else {
      // C# file
      let specialSym = null;
      if (i === 1) specialSym = "ProcessOrderAsync";
      else if (i === 2) specialSym = "CalculateVatDiscount";
      else if (i === 4) specialSym = "AuthorizePaymentToken";
      else if (i === 5) specialSym = "ExportInvoiceToExcel";
      else if (i === 7) specialSym = "ReserveWarehouseStock";

      const filePath = path.join(TEST_DIR, dir, `Component_${i}.cs`);
      const { code, symCount } = generateCsFile(i, dir, specialSym);
      fs.writeFileSync(filePath, code, "utf8");
      totalGeneratedFiles++;
      totalGeneratedSymbols += symCount;
    }
  }

  console.log(`  Generated ${totalGeneratedFiles} files with ~${totalGeneratedSymbols} symbols.`);
  assert.strictEqual(totalGeneratedFiles, 500, "Must have generated 500 files");
  assert.ok(totalGeneratedSymbols >= 4000, "Must have generated >= 4000 symbols");

  // 2. Test Git Protection (.z-plugin/.gitignore)
  console.log("\n[2/6] Verifying Self-ignoring Git protection (.z-plugin/.gitignore)...");
  const indexStart = performance.now();
  const indexRes = indexWorkspace(TEST_DIR);
  const indexDuration = performance.now() - indexStart;

  const gitignorePath = path.join(TEST_DIR, ".z-plugin", ".gitignore");
  assert.ok(fs.existsSync(gitignorePath), ".z-plugin/.gitignore must exist");
  const gitignoreContent = fs.readFileSync(gitignorePath, "utf8").trim();
  assert.strictEqual(gitignoreContent, "*", ".gitignore must contain '*' to isolate cache from git");
  console.log("  ok   .z-plugin/.gitignore created with content '*'");

  // 3. Verify Indexing Throughput & Prefix Sharding Distribution
  console.log("\n[3/6] Verifying Indexing Throughput & Prefix Sharding Distribution...");
  console.log(`  Indexed ${indexRes.indexedFiles} files, ${indexRes.totalSymbols} symbols in ${indexDuration.toFixed(1)}ms`);
  console.log(`  Throughput: ${(indexRes.indexedFiles / (indexDuration / 1000)).toFixed(0)} files/sec, ${(indexRes.totalSymbols / (indexDuration / 1000)).toFixed(0)} symbols/sec`);
  assert.strictEqual(indexRes.indexedFiles, 500);
  assert.ok(indexRes.totalSymbols >= 4000);

  const stats = getCacheStats(TEST_DIR);
  console.log(`  Buckets created: ${stats.bucketCount} prefix files (e.g. ca.json, pr.json, se.json)`);
  console.log(`  Total cache size on disk: ${(stats.totalBytes / 1024).toFixed(1)} KB (avg ${(stats.totalBytes / stats.bucketCount / 1024).toFixed(1)} KB/bucket)`);
  assert.ok(stats.bucketCount >= 10, "Must create multiple prefix buckets");
  assert.ok(stats.totalBytes > 0, "Cache must contain data");

  // Verify prefix bucket sharding logic
  assert.strictEqual(getSymbolPrefix("ProcessOrderAsync"), "pr");
  assert.strictEqual(getSymbolPrefix("CalculateVatDiscount"), "ca");
  assert.strictEqual(getSymbolPrefix("ExecuteAction_1"), "ex");
  assert.strictEqual(getSymbolPrefix("a"), "a_");
  assert.strictEqual(getSymbolPrefix("$$"), "__");
  console.log("  ok   prefix sharding algorithm verified");

  // 4. Test Warm Lookup Response Time & Accuracy (<2ms SLA)
  console.log("\n[4/6] Measuring Warm Lookup Response Latency & Accuracy (<2ms SLA)...");
  const sampleQueries = [
    "ProcessOrderAsync",
    "CalculateVatDiscount",
    "AuthorizePaymentToken",
    "ExportInvoiceToExcel",
    "ReserveWarehouseStock",
    "ServiceComponent_1",
    "ServiceComponent_50",
    "ApiModule_150",
    "ExecuteAction_1",
    "ExecuteAction_5",
  ];

  const warmTimings = [];
  for (let iteration = 0; iteration < 5; iteration++) {
    for (const q of sampleQueries) {
      const t0 = performance.now();
      const res = readSymbol(TEST_DIR, q, { workspaceRoot: TEST_DIR });
      const elapsed = performance.now() - t0;
      warmTimings.push(elapsed);
      assert.strictEqual(res.found, true, `Symbol ${q} must be found`);
      assert.ok(res.text.includes(q), `Result text must include symbol ${q}`);
      assert.strictEqual(res.cached, true, `Lookup for ${q} must be a cache hit`);
    }
  }

  const avgLatency = warmTimings.reduce((a, b) => a + b, 0) / warmTimings.length;
  const maxLatency = Math.max(...warmTimings);
  const minLatency = Math.min(...warmTimings);
  console.log(`  Warm Lookups (50 iterations):`);
  console.log(`    Min latency : ${minLatency.toFixed(3)}ms`);
  console.log(`    Avg latency : ${avgLatency.toFixed(3)}ms (Target <2.0ms)`);
  console.log(`    Max latency : ${maxLatency.toFixed(3)}ms`);

  assert.ok(avgLatency < 2.0, `Average latency (${avgLatency.toFixed(3)}ms) must be under 2.0ms SLA`);
  console.log("  ok   warm lookup latency <2ms SLA achieved");

  // Verify accuracy on One-Shot Extraction: Doc comments + Attributes + Body
  const testProcOrder = readSymbol(TEST_DIR, "ProcessOrderAsync", { workspaceRoot: TEST_DIR });
  assert.ok(testProcOrder.text.includes("[TransactionRequired]"), "Must capture [TransactionRequired] attribute");
  assert.ok(testProcOrder.text.includes("[AuditLogged]"), "Must capture [AuditLogged] attribute");
  assert.ok(testProcOrder.text.includes("Special critical operation"), "Must capture doc comments");
  assert.ok(testProcOrder.text.includes("return true;"), "Must capture function body");
  console.log("  ok   One-Shot extraction captures docstrings, attributes, and full body");

  // 5. Freshness & Invalidation on File Mutation (mtime mismatch auto-repair)
  console.log("\n[5/6] Testing Cache Invalidation & Freshness on File Mutation...");
  const targetFile = path.resolve(TEST_DIR, testProcOrder.file);
  const originalContent = fs.readFileSync(targetFile, "utf8");

  // Prepend 10 new lines to shift line numbers and modify signature
  const modifiedContent = "// Shift line 1\n// Shift line 2\n// Shift line 3\n// Shift line 4\n// Shift line 5\n" +
    originalContent.replace("public async Task<bool> ProcessOrderAsync(string contextId, decimal amount)",
      "public async Task<bool> ProcessOrderAsync(string contextId, decimal amount, string extraParam = null)");

  // Ensure mtime is changed
  const newMtime = (Date.now() + 5000) / 1000;
  fs.writeFileSync(targetFile, modifiedContent, "utf8");
  fs.utimesSync(targetFile, newMtime, newMtime);

  const tMut0 = performance.now();
  const mutRes = readSymbol(TEST_DIR, "ProcessOrderAsync", { workspaceRoot: TEST_DIR });
  const mutDuration = performance.now() - tMut0;

  assert.strictEqual(mutRes.found, true);
  assert.ok(mutRes.text.includes("extraParam = null"), "Must reflect newly modified signature immediately");
  assert.ok(mutRes.startLine > testProcOrder.startLine, `Line number must shift from ${testProcOrder.startLine} to ${mutRes.startLine}`);
  console.log(`  Auto-detected file mutation in ${mutDuration.toFixed(2)}ms; updated line ${testProcOrder.startLine} -> ${mutRes.startLine}`);
  console.log("  ok   zero stale cache: mtime validation guarantees instant freshness");

  // 6. Resilience on File Deletion
  console.log("\n[6/6] Testing Resilience on File Deletion...");
  fs.unlinkSync(targetFile);

  const delRes = readSymbol(TEST_DIR, "ProcessOrderAsync", { workspaceRoot: TEST_DIR });
  assert.strictEqual(delRes.found, false, "Deleted symbol must not be returned");
  console.log("  ok   handles file deletion gracefully without throwing");

  console.log("\n=== ALL LARGE REPO SYMBOL CACHE TESTS PASSED SUCCESSFULLY! ===");
} finally {
  // Cleanup test fixture
  try {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  } catch {}
}
