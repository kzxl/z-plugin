// Test suite for z-gate (Net Engineering Value, Security & Code Review Gate)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

function ok(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("  ok  ", msg);
}

const { parseDiff } = await import("../plugins/z-gate/scripts/lib/diff-parser.mjs");
const { findHelpers } = await import("../plugins/z-gate/scripts/lib/helper-discovery.mjs");
const { auditDiff } = await import("../plugins/z-gate/scripts/lib/nev-auditor.mjs");
const { reviewCode } = await import("../plugins/z-gate/scripts/lib/code-reviewer.mjs");
const { formatReviewReport } = await import("../plugins/z-gate/scripts/lib/review-formatter.mjs");

console.log("z-gate: diff parser metrics");
const sampleDiff = `
diff --git a/Services/OrderService.cs b/Services/OrderService.cs
index 1234567..89abcdef 100644
--- a/Services/OrderService.cs
+++ b/Services/OrderService.cs
@@ -10,6 +10,12 @@ namespace ERP.Services
-    public void OldMethod() {
-        DoSomething();
-    }
+    public async Task<int> CalculateTotalAsync(int orderId) {
+        var items = await _repo.GetItemsAsync(orderId);
+        return items.Sum(x => x.Price);
+    }
+    public interface IOrderExtraService {
+        void Extra();
+    }
+    public class OrderExtraService : IOrderExtraService {
+        public void Extra() {}
+    }
`;

const parsed = parseDiff(sampleDiff);
ok(parsed.files.length === 1, "extracts modified file");
ok(parsed.addedLines.length === 10, `counts added lines (got: ${parsed.addedLines.length})`);
ok(parsed.deletedLines.length === 3, `counts deleted lines (got: ${parsed.deletedLines.length})`);
ok(parsed.interfaces.includes("IOrderExtraService"), "detects new interface");
ok(parsed.classes.includes("OrderExtraService"), "detects new class");

console.log("z-gate: helper discovery (R_REUSE)");
// Create a temporary mock repository with Helpers/
const tempRepo = fs.mkdtempSync(path.join(os.tmpdir(), "zgate-helpers-"));
const helpersDir = path.join(tempRepo, "Helpers");
fs.mkdirSync(helpersDir, { recursive: true });

fs.writeFileSync(
  path.join(helpersDir, "DateTimeHelper.cs"),
  `namespace ERP.Helpers {
    public static class DateTimeHelper {
        /// <summary>Formats date to standard vn date string dd/MM/yyyy</summary>
        public static string FormatVnDate(DateTime dt) => dt.ToString("dd/MM/yyyy");
        public static DateTime? TryParseVnDate(string text) => null;
    }
}`
);

fs.writeFileSync(
  path.join(helpersDir, "StringHelper.cs"),
  `namespace ERP.Helpers {
    public static class StringHelper {
        public static bool IsNullOrEmpty(string val) => string.IsNullOrEmpty(val);
        public static string Truncate(string text, int max) => text?.Length > max ? text.Substring(0, max) : text;
    }
}`
);

const foundDate = findHelpers({ query: "format date", cwd: tempRepo });
ok(foundDate.length > 0, "finds DateTimeHelper by query 'format date'");
ok(foundDate[0].methodName === "FormatVnDate", `identified FormatVnDate method (got: ${foundDate[0].methodName})`);

// Verify caching
ok(fs.existsSync(path.join(tempRepo, ".zero-gate", "helpers-cache.json")), "helper cache created on disk");
const cachedFind = findHelpers({ query: "format date", cwd: tempRepo });
ok(cachedFind.length > 0, "retrieves helper from cache successfully");

// Test C# extension method detection
fs.writeFileSync(
  path.join(helpersDir, "GridExtensions.cs"),
  `namespace ERP.Extensions {
    public static class GridExtensions {
        public static void SetReadonly(this GridControl grid, bool val) {}
    }
}`
);
const foundExt = findHelpers({ query: "readonly", cwd: tempRepo });
ok(foundExt.length > 0, "finds extension method in GridExtensions");
ok(foundExt[0].isExtension === true, "identified C# extension method via 'this' parameter");

const foundTruncate = findHelpers({ query: "truncate", cwd: tempRepo });
ok(foundTruncate.length > 0, "finds Truncate in StringHelper");
ok(foundTruncate[0].file.includes("StringHelper.cs"), "correct file path returned");

console.log("z-gate: NEV auditor - wrapper hell & LOC inflation (R_NEV)");
// 1. Audit sampleDiff with single-implementation interface
const audit1 = auditDiff({
  diff: sampleDiff,
  commitMessage: "refactor(order): add extra service",
  cwd: tempRepo
});
ok(!audit1.passed, "audit fails on single-impl interface & LOC bloat");
ok(audit1.warnings.some(w => w.includes("wrapper hell") || w.includes("IOrderExtraService")), "cites wrapper hell warning");

// 2. Clean refactoring with negative LOC delta (code reduced) and Conventional Commit
const cleanDiff = `
diff --git a/Services/OrderService.cs b/Services/OrderService.cs
--- a/Services/OrderService.cs
+++ b/Services/OrderService.cs
@@ -10,15 +10,5 @@
-    public void RedundantOne() {
-        Log();
-    }
-    public void RedundantTwo() {
-        Log();
-    }
+    public void Unified() => Log();
`;

const audit2 = auditDiff({
  diff: cleanDiff,
  commitMessage: "refactor(order): inline and simplify redundant logging calls",
  cwd: tempRepo
});
ok(audit2.passed === true, "clean refactoring with negative LOC delta passes audit");
ok(audit2.metrics.netChange < 0, `net change is negative (got: ${audit2.metrics.netChange})`);

console.log("z-gate: invariant violations (R_WPF, R_DB, R_PROOF)");
const badDiff = `
diff --git a/UI/OrderForm.cs b/UI/OrderForm.cs
--- a/UI/OrderForm.cs
+++ b/UI/OrderForm.cs
@@ -5,2 +5,4 @@
+    private BindingSource _bs = new BindingSource();
+    var sql = "SELECT * FROM Orders WHERE Id = " + id;
`;

const audit3 = auditDiff({
  diff: badDiff,
  commitMessage: "feat(order): clean optimal fix",
  cwd: tempRepo
});
ok(!audit3.passed, "audit fails on BindingSource and SQL concatenation");
ok(audit3.warnings.some(w => w.includes("BindingSource")), "caught BindingSource violation (R_WPF)");
ok(audit3.warnings.some(w => w.includes("SQL concatenation") || w.includes("SQL injection")), "caught SQL concat (R_DB)");
ok(audit3.warnings.some(w => w.includes("self-praise") || w.includes("optimal")), "caught subjective word in commit (R_PROOF)");

console.log("z-gate: software craftsmanship & anti-slop audit (R_ANTI_SLOP)");
const slopUiDiff = `
diff --git a/src/components/Dashboard.tsx b/src/components/Dashboard.tsx
--- a/src/components/Dashboard.tsx
+++ b/src/components/Dashboard.tsx
@@ -5,2 +5,4 @@
+    <div className="bg-gradient-to-r from-purple-500 to-indigo-500">
+      <button onClick={() => {}}>Do nothing</button>
+    </div>
 `;
const auditSlop = auditDiff({
  diff: slopUiDiff,
  commitMessage: "feat(ui): add dashboard header",
  cwd: tempRepo
});
ok(!auditSlop.passed, "audit fails on UI anti-slop violations");
ok(auditSlop.warnings.some(w => w.includes("AI-Slop detected") && w.includes("neon gradient")), "caught neon gradient in UI diff (R_ANTI_SLOP)");
ok(auditSlop.checks.some(c => c.check.includes("R_ANTI_SLOP") && !c.passed), "anti-slop check marked as failed");

console.log("z-gate: unified code review engine (P0, P1, P2, P3)");
// 1. Critical P0 Security, Secrets & Concurrency violations
const severeDiff = `
diff --git a/Services/PaymentService.cs b/Services/PaymentService.cs
--- a/Services/PaymentService.cs
+++ b/Services/PaymentService.cs
@@ -10,3 +10,7 @@
+    string apiKey = "sk-live_99887766554433221100aa";
+    var query = "SELECT * FROM Transactions WHERE Id = " + txId;
+    var status = _client.GetStatusAsync().Result;
+    public async void ProcessBackground() {}
`;

const severeReview = await reviewCode({
  diff: severeDiff,
  commitMessage: "feat(payment): process transaction",
  cwd: tempRepo
});

ok(severeReview.status === "FAIL", "severe review fails overall status");
ok(severeReview.summary.p0Count >= 2, "flags at least 2 P0 critical issues");
ok(severeReview.findings.some(f => f.severity === "P0" && f.rule.includes("Secret Leak")), "caught hardcoded secret token");
ok(severeReview.findings.some(f => f.severity === "P0" && f.rule.includes("Parameterization")), "caught SQL injection");
ok(severeReview.findings.some(f => f.severity === "P1" && f.rule.includes("Deadlock")), "caught sync-over-async .Result deadlock hazard");
ok(severeReview.findings.some(f => f.severity === "P1" && f.rule.includes("Async Void")), "caught async void method");

// 2. Formatter checks
const tableReport = formatReviewReport(severeReview, "table");
ok(tableReport.includes("Z-GATE CODE REVIEW AUDIT REPORT"), "terminal table report includes header");
ok(tableReport.includes("FAIL"), "report shows failure badge");
ok(tableReport.includes("P0"), "report includes P0 badge");

const mdReport = formatReviewReport(severeReview, "markdown");
ok(mdReport.includes("Z-Gate Code Review Report"), "markdown report includes header");
ok(mdReport.includes("FAIL"), "markdown report includes fail badge");

// 3. Clean diff passes review
const pristineDiff = `
diff --git a/Services/PaymentService.cs b/Services/PaymentService.cs
--- a/Services/PaymentService.cs
+++ b/Services/PaymentService.cs
@@ -10,3 +10,5 @@
+    var status = await _client.GetStatusAsync();
+    return status.IsSuccess;
`;

const cleanReview = await reviewCode({
  diff: pristineDiff,
  commitMessage: "feat(payment): check status asynchronously",
  cwd: tempRepo
});
ok(cleanReview.status === "PASS", "clean review passes");
ok(cleanReview.score === 100, `clean score is 100 (got: ${cleanReview.score})`);

// Cleanup
fs.rmSync(tempRepo, { recursive: true, force: true });

console.log("\nall z-gate tests passed!");
