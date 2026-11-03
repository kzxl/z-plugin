import assert from "node:assert";
import { compactTestLog } from "../plugins/z-token/scripts/lib/test-runner.mjs";
import { smartDiff } from "../plugins/z-token/scripts/lib/diet.mjs";

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

console.log("\nall z-token v1.1.0 tests passed!");
