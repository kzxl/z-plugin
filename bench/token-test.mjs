import assert from "node:assert";
import { compactTestLog } from "../plugins/z-token/scripts/lib/test-runner.mjs";
import { smartDiff } from "../plugins/z-token/scripts/lib/diet.mjs";
import { DEFAULT_CONFIG } from "../plugins/z-token/scripts/lib/config.mjs";

console.log("z-token: test runner condenser (v1.1.0)");

// 1. All passing .NET test log
const passingDotnetLog = `
Microsoft (R) Test Execution Command Line Tool Version 17.11.0
Starting test execution, please wait...
A total of 1 test files matched the specified pattern.
Passed!  - Failed:     0, Passed:    45, Skipped:     0, Total:    45, Duration: 420 ms - App.Tests.dll (net8.0)
`;
const passRes = compactTestLog(passingDotnetLog);
assert.strictEqual(passRes.passed, true);
assert.strictEqual(passRes.totalPassed, 45);
assert.strictEqual(passRes.totalFailed, 0);
assert.ok(passRes.text.includes("ALL TESTS PASSED"));
assert.ok(passRes.text.includes("45 passed"));
console.log("  ok   passes all-passing .NET test log without noise");

// 2. Failing .NET test log with passing spam
const failingDotnetLog = `
Starting test execution, please wait...
Passed OrderTests.CreateOrder [10 ms]
Passed OrderTests.CancelOrder [5 ms]
  Failed OrderTests.CalculateDiscount [25 ms]
  Error Message:
   Assert.AreEqual failed. Expected:<90>. Actual:<100>.
  Stack Trace:
     at OrderTests.CalculateDiscount() in C:\\src\\OrderTests.cs:line 42
Passed OrderTests.ValidateVat [2 ms]
  Failed InventoryTests.DeductStock_Empty [12 ms]
  Error Message:
   System.InvalidOperationException : Stock cannot be negative.
  Stack Trace:
     at InventoryService.Deduct() in C:\\src\\InventoryService.cs:line 105
Failed!  - Failed:     2, Passed:    10, Skipped:     0, Total:    12, Duration: 800 ms - App.Tests.dll (net8.0)
`;
const failRes = compactTestLog(failingDotnetLog);
assert.strictEqual(failRes.passed, false);
assert.strictEqual(failRes.totalFailed, 2);
assert.strictEqual(failRes.totalPassed, 10);
assert.ok(failRes.text.includes("❌ 2 FAILED, 10 PASSED"));
assert.ok(failRes.text.includes("[FAILED] OrderTests.CalculateDiscount"));
assert.ok(failRes.text.includes("Assert.AreEqual failed"));
assert.ok(failRes.text.includes("[FAILED] InventoryTests.DeductStock_Empty"));
assert.ok(!failRes.text.includes("Passed OrderTests.CreateOrder"), "Spam passed lines must be stripped");
console.log("  ok   isolates failing tests and strips verbose passing test lines");

// 3. Smart Git Diff Slicer
const diffRes = smartDiff();
assert.ok(typeof diffRes.text === "string");
assert.ok(diffRes.text.includes("Smart Sliced Diff"));
console.log("  ok   smartDiff executes with noise-exclusion filters");

// 4. Prefix-Sharded Symbol Cache Unit Checks
import {
  getSymbolPrefix,
  extractFileSymbols,
  storeSymbolsForFile,
  lookupSymbol,
  getCacheStats,
  clearCache,
} from "../plugins/z-token/scripts/lib/symbol-cache.mjs";
import os from "node:os";
import fs from "node:fs";
import path from "node:path";

const tempWs = path.join(os.tmpdir(), `ztoken-unit-${Date.now()}`);
fs.mkdirSync(tempWs, { recursive: true });

try {
  // Test prefix sharding algorithm
  assert.strictEqual(getSymbolPrefix("CalculateTotal"), "ca");
  assert.strictEqual(getSymbolPrefix("processOrder"), "pr");
  assert.strictEqual(getSymbolPrefix("a"), "a_");
  assert.strictEqual(getSymbolPrefix("$$$"), "__");
  console.log("  ok   getSymbolPrefix produces 2-char sanitized prefixes");

  // Test symbol extraction
  const sampleCs = `
    namespace Demo {
      public class OrderManager {
        public int OrderCount { get; set; }
        public async Task<bool> ProcessPaymentAsync(string id, decimal amt) {
          return true;
        }
      }
    }
  `;
  const syms = extractFileSymbols(sampleCs);
  assert.strictEqual(syms.length, 3);
  assert.strictEqual(syms[0].name, "OrderManager");
  assert.strictEqual(syms[0].kind, "type");
  assert.strictEqual(syms[1].name, "OrderCount");
  assert.strictEqual(syms[1].kind, "prop");
  assert.strictEqual(syms[2].name, "ProcessPaymentAsync");
  assert.strictEqual(syms[2].kind, "method");
  console.log("  ok   extractFileSymbols extracts types, props, and methods accurately");

  // Test store & lookup
  const sampleFile = path.join(tempWs, "OrderManager.cs");
  fs.writeFileSync(sampleFile, sampleCs, "utf8");
  const stat = fs.statSync(sampleFile);

  storeSymbolsForFile(tempWs, "OrderManager.cs", syms, stat.mtimeMs);

  const found = lookupSymbol(tempWs, "ProcessPaymentAsync");
  assert.strictEqual(found.length, 1);
  assert.strictEqual(found[0].name, "ProcessPaymentAsync");
  assert.strictEqual(found[0].line, 5);
  assert.strictEqual(found[0].file, "OrderManager.cs");
  console.log("  ok   storeSymbolsForFile & lookupSymbol retrieve stored symbol");

  // Test stats & clear
  const stats = getCacheStats(tempWs);
  assert.ok(stats.bucketCount >= 2);
  assert.strictEqual(stats.totalSymbols, 3);

  clearCache(tempWs);
  const clearedStats = getCacheStats(tempWs);
  assert.strictEqual(clearedStats.totalSymbols, 0);
  console.log("  ok   getCacheStats and clearCache maintain cache hygiene");

  // 5. Algorithmic Upgrade Verification: Shadow Masking, Multi-line Signatures, Scope Stack, Receiver Resolution
  const { outline, readSymbol } = await import("../plugins/z-token/scripts/lib/scan.mjs");

  const complexCs = `
namespace Enterprise.Orders {
  /*
   * Multi-line comment block with fake code:
   * public class FakeCommentedClass {
   *   public void FakeCommentedMethod() { GhostCall(); }
   * }
   */
  public class OrderProcessor {
    private readonly IInventoryGateway _inventoryGateway;

    public OrderProcessor(IInventoryGateway inventoryGateway) {
      _inventoryGateway = inventoryGateway;
    }

    public async Task<bool> CreateComplexOrderAsync(
        string customerId,
        List<string> skuItems,
        decimal discountRate,
        CancellationToken cancellationToken = default)
    {
      var trickyBraces = "}} } fake closing braces inside string literal";
      // } another fake closing brace in single-line comment
      /* } fake brace in inline block comment */
      var ok = await _inventoryGateway.ReserveStockAsync(customerId);
      return ok;
    }
  }

  public class SiblingAuditService {
    public void RecordAudit(string msg) {
      var x = 1;
    }
  }
}
`;

  const complexFile = path.join(tempWs, "OrderProcessor.cs");
  fs.writeFileSync(complexFile, complexCs, "utf8");

  const extracted = extractFileSymbols(complexCs);
  const symNames = extracted.map((s) => s.name);

  // 5a. Shadow Masking: must ignore commented-out classes/methods
  assert.ok(!symNames.includes("FakeCommentedClass"), "Must not extract class inside block comment");
  assert.ok(!symNames.includes("FakeCommentedMethod"), "Must not extract method inside block comment");

  // 5b. Multi-line Signature Folding: must extract 5-line method signature and all 4 params
  const multiLineSym = extracted.find((s) => s.name === "CreateComplexOrderAsync");
  assert.ok(multiLineSym, "Must extract multi-line method CreateComplexOrderAsync");
  assert.deepStrictEqual(
    multiLineSym.params,
    ["customerId", "skuItems", "discountRate", "cancellationToken"],
    "Must extract all 4 parameters across multi-line signature"
  );
  assert.ok(multiLineSym.endLine > multiLineSym.line + 5, "Must compute accurate endLine past tricky braces");

  // 5c. Receiver Type Resolution: _inventoryGateway.ReserveStockAsync -> InventoryGateway.ReserveStockAsync
  assert.ok(
    multiLineSym.calls.includes("InventoryGateway.ReserveStockAsync") &&
      multiLineSym.calls.includes("ReserveStockAsync"),
    "Must resolve field receiver type _inventoryGateway -> InventoryGateway.ReserveStockAsync"
  );

  // 5d. Scope Stack: OrderProcessor.members must not leak SiblingAuditService methods
  const orderProcType = extracted.find((s) => s.name === "OrderProcessor");
  assert.ok(orderProcType.members.includes("CreateComplexOrderAsync"), "OrderProcessor must own CreateComplexOrderAsync");
  assert.ok(!orderProcType.members.includes("RecordAudit"), "OrderProcessor must not leak sibling class method RecordAudit");

  // 5e. readSymbol must not truncate early on string/comment closing braces
  const readRes = readSymbol(complexFile, "CreateComplexOrderAsync", { workspaceRoot: tempWs });
  assert.strictEqual(readRes.found, true);
  assert.ok(readRes.text.includes("return ok;"), "readSymbol must not stop at '}} }' inside string literal");

  // 5f. outline must also display multi-line method signature
  const outlineRes = outline(complexFile, { workspaceRoot: tempWs });
  assert.ok(outlineRes.text.includes("CreateComplexOrderAsync"), "outline must recognize multi-line method declaration");
  console.log("  ok   Shadow Masking, Multi-line Signatures, Scope Stack, and Receiver Type Resolution verified");

  // 6. Adaptive Sparse Search & Config Defaults
  assert.strictEqual(DEFAULT_CONFIG.search.contextSparse, 1);
  assert.strictEqual(DEFAULT_CONFIG.search.sparseThreshold, 10);
  assert.deepStrictEqual(DEFAULT_CONFIG.search.legacyEncodings, ["windows-1258"]);

  const { search } = await import("../plugins/z-token/scripts/lib/scan.mjs");
  const { clearCaches } = await import("../plugins/z-token/scripts/lib/fsindex.mjs");

  const sparseLines = [
    "// ctx-before-2",
    "// ctx-before-1",
    "const SparseNeedle = 1;",
    "// ctx-after-1",
    "// ctx-after-2",
    "// filler-6",
    "// filler-7",
    "// ctx2-before-2",
    "// ctx2-before-1",
    "const SparseNeedle = 2;",
    "// ctx2-after-1",
    "// ctx2-after-2",
  ];
  const sparseFile = path.join(tempWs, "sparse.ts");
  fs.writeFileSync(sparseFile, sparseLines.join("\n"), "utf8");

  clearCaches();
  const sparseSearch = search({ pattern: "SparseNeedle", path: sparseFile, cacheTtlMs: 0 });
  assert.strictEqual(sparseSearch.stats.matches, 2);
  assert.strictEqual(sparseSearch.stats.contextLines, 1, "matches <= 10 must default to contextSparse=1");
  assert.ok(sparseSearch.text.includes("ctx-before-1") && sparseSearch.text.includes("ctx-after-1"));
  assert.ok(!sparseSearch.text.includes("ctx-before-2") && !sparseSearch.text.includes("ctx-after-2"));

  const explicitCtxSearch = search({ pattern: "SparseNeedle", path: sparseFile, contextLines: 2, cacheTtlMs: 0 });
  assert.strictEqual(explicitCtxSearch.stats.contextLines, 2, "explicit contextLines must override sparse context");
  assert.ok(explicitCtxSearch.text.includes("ctx-before-2") && explicitCtxSearch.text.includes("ctx-after-2"));

  const denseLines = [];
  for (let idx = 1; idx <= 12; idx++) {
    denseLines.push(`// dense-${idx}-b2`, `// dense-${idx}-b1`, `const DenseNeedle_${idx} = ${idx};`, `// dense-${idx}-a1`, `// dense-${idx}-a2`);
  }
  const denseFile = path.join(tempWs, "dense.ts");
  fs.writeFileSync(denseFile, denseLines.join("\n"), "utf8");

  clearCaches();
  const denseSearch = search({ pattern: "DenseNeedle_", path: denseFile, cacheTtlMs: 0 });
  assert.strictEqual(denseSearch.stats.totalMatches, 12);
  assert.strictEqual(denseSearch.stats.contextLines, 2, "matches > 10 must use standard 2-line context");
  assert.ok(denseSearch.text.includes("dense-1-b2") && denseSearch.text.includes("dense-1-a2"));
  console.log("  ok   Adaptive sparse context (<= 10 -> 1 line, > 10 -> 2 lines, explicit override) verified");

  // 7. Multiline C# & TypeScript Outline Declarations
  const multiCsFile = path.join(tempWs, "MultiOutline.cs");
  fs.writeFileSync(
    multiCsFile,
    [
      "namespace Demo.Multi {",
      "  public class RepositoryBase<TEntity, TKey>",
      "      : IRepository<TEntity>,",
      "        IDisposable",
      "      where TEntity : class",
      "      where TKey : notnull",
      "  {",
      "    public async Task<TOutput> ExecutePipelineAsync<TInput, TOutput>(",
      "        TInput input,",
      "        CancellationToken ct = default)",
      "        where TInput : class",
      "        where TOutput : new()",
      "    {",
      "      return new TOutput();",
      "    }",
      "  }",
      "",
      "  public sealed record OrderCreatedEvent<TPayload>(",
      "      Guid EventId,",
      "      TPayload Payload)",
      "      where TPayload : class;",
      "}",
    ].join("\n"),
    "utf8"
  );

  const multiTsFile = path.join(tempWs, "MultiOutline.ts");
  fs.writeFileSync(
    multiTsFile,
    [
      "export interface IOrderStore {",
      "  findOrders(",
      "    customerId: string,",
      "    limit?: number",
      "  ): Promise<string[]>;",
      "}",
      "",
      "export async function mergeEntities<",
      "  TBase extends object,",
      "  TPatch extends Partial<TBase>",
      ">(",
      "  base: TBase,",
      "  patch: TPatch",
      "): Promise<TBase> {",
      "  return { ...base, ...patch };",
      "}",
      "",
      "export const buildReport = async (",
      "  reportId: string,",
      "  onProgress: (pct: number) => void",
      "): Promise<string> => {",
      "  return reportId;",
      "};",
      "",
      "export class OrderApi {",
      "  public async dispatchOrder(",
      "    orderId: string,",
      "    callback: (ok: boolean) => void",
      "  ): Promise<void> {",
      "    callback(true);",
      "  }",
      "}",
    ].join("\n"),
    "utf8"
  );

  const csOutline = outline(multiCsFile, { workspaceRoot: tempWs, cacheTtlMs: 0 }).text;
  assert.ok(/^\s*2\s+public class RepositoryBase<TEntity, TKey>/m.test(csOutline), "C# multiline class must start at line 2");
  assert.ok(/^\s*8\s+public async Task<TOutput> ExecutePipelineAsync<TInput, TOutput>\(/m.test(csOutline), "C# multiline method must start at line 8");
  assert.ok(/^\s*18\s+public sealed record OrderCreatedEvent<TPayload>\(/m.test(csOutline), "C# multiline record must start at line 18");
  assert.ok(!/^\s*9\s+/m.test(csOutline) && !/^\s*10\s+/m.test(csOutline), "C# parameter lines must not be emitted as standalone symbols");

  const tsOutline = outline(multiTsFile, { workspaceRoot: tempWs, cacheTtlMs: 0 }).text;
  assert.ok(/^\s*1\s+export interface IOrderStore/m.test(tsOutline), "TS interface must start at line 1");
  assert.ok(/^\s*2\s+findOrders\(/m.test(tsOutline), "TS multiline interface method must start at line 2");
  assert.ok(/^\s*8\s+export async function mergeEntities</m.test(tsOutline), "TS multiline generic export function must start at line 8");
  assert.ok(/^\s*18\s+export const buildReport = async \(/m.test(tsOutline), "TS multiline export const arrow must start at line 18");
  assert.ok(/^\s*26\s+public async dispatchOrder\(/m.test(tsOutline), "TS multiline class method must start at line 26");
  console.log("  ok   Multiline C# & TypeScript outline folding and line numbers verified");
} finally {
  try { fs.rmSync(tempWs, { recursive: true, force: true }); } catch {}
}

console.log("\nall z-token v1.2.0 tests passed!");
