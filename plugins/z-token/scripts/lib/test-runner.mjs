// Smart Test Runner Condenser: strips verbose passing test output,
// isolates failed tests, assertion messages, and stack traces.

import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";

export function compactTestLog(rawOutput, opts = {}) {
  const lines = rawOutput.split(/\r?\n/);
  const failures = [];
  let currentFailure = null;
  let summaryLine = "";
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let duration = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // dotnet test / vstest summary match:
    // e.g. "Passed!  - Failed:     0, Passed:    12, Skipped:     0, Total:    12, Duration: 350 ms"
    // or   "Failed!  - Failed:     2, Passed:    10, Skipped:     0, Total:    12, Duration: 1 s"
    const dotnetSummary = trimmed.match(/(?:Passed|Failed)!\s*-\s*Failed:\s*(\d+),\s*Passed:\s*(\d+)(?:,\s*Skipped:\s*(\d+))?.*Total:\s*(\d+)(?:,\s*Duration:\s*([^\]\r\n]+))?/i);
    if (dotnetSummary) {
      totalFailed = parseInt(dotnetSummary[1], 10);
      totalPassed = parseInt(dotnetSummary[2], 10);
      totalSkipped = parseInt(dotnetSummary[3] || "0", 10);
      duration = (dotnetSummary[5] || "").trim();
      continue;
    }

    // jest / npm test summary match:
    // "Tests:       2 failed, 28 passed, 30 total"
    const jestSummary = trimmed.match(/Tests:\s*(?:(\d+)\s*failed,)?\s*(?:(\d+)\s*passed,)?\s*(\d+)\s*total/i);
    if (jestSummary) {
      totalFailed = parseInt(jestSummary[1] || "0", 10);
      totalPassed = parseInt(jestSummary[2] || "0", 10);
      continue;
    }

    // dotnet test failure header:
    // "  Failed TestMethodName [32 ms]" or "[FAILED] TestMethodName"
    const failHeader = line.match(/^\s*(?:\[FAILED\]|Failed)\s+([A-Za-z0-9_.]+)(?:\s*\[.*\])?/);
    if (failHeader) {
      if (currentFailure) failures.push(currentFailure);
      currentFailure = {
        name: failHeader[1],
        errorLines: [],
        stackLines: []
      };
      continue;
    }

    // jest failure header:
    // "  ● TestSuite › TestName"
    const jestFail = line.match(/^\s*●\s+(.+)/);
    if (jestFail) {
      if (currentFailure) failures.push(currentFailure);
      currentFailure = {
        name: jestFail[1],
        errorLines: [],
        stackLines: []
      };
      continue;
    }

    // Error message / stack trace in active failure
    if (currentFailure) {
      if (/^\s*at\s+/.test(line) || /^\s*Stack Trace:/.test(line)) {
        if (currentFailure.stackLines.length < 5) {
          currentFailure.stackLines.push(trimmed);
        }
      } else if (/^\s*(Error:|Assert\.|Expected|Actual|Message:)/i.test(line)) {
        currentFailure.errorLines.push(trimmed);
      } else if (trimmed.length > 0 && currentFailure.errorLines.length < 3) {
        currentFailure.errorLines.push(trimmed);
      }
    }
  }

  if (currentFailure) {
    failures.push(currentFailure);
  }

  // Synthesize concise report
  const output = [];
  const total = totalPassed + totalFailed + totalSkipped;

  if (totalFailed === 0 && failures.length === 0) {
    output.push(`✅ ALL TESTS PASSED: ${totalPassed} passed, 0 failed${totalSkipped ? `, ${totalSkipped} skipped` : ""}${duration ? ` (${duration})` : ""}`);
    return {
      text: output.join("\n"),
      passed: true,
      totalPassed,
      totalFailed: 0,
      totalSkipped
    };
  }

  const failCount = totalFailed || failures.length;
  output.push(`❌ ${failCount} FAILED, ${totalPassed} PASSED (${total || failCount + totalPassed} total${duration ? `, ${duration}` : ""})\n`);

  for (const f of failures.slice(0, 10)) {
    output.push(`[FAILED] ${f.name}`);
    if (f.errorLines.length) {
      output.push(`  ${f.errorLines.join("\n  ")}`);
    }
    if (f.stackLines.length) {
      output.push(`  ${f.stackLines.slice(0, 2).join("\n  ")}`);
    }
    output.push("");
  }

  if (failures.length > 10) {
    output.push(`... and ${failures.length - 10} more failing tests (see full test.log)`);
  }

  return {
    text: output.join("\n").trim(),
    passed: false,
    totalPassed,
    totalFailed: failCount,
    totalSkipped,
    failures
  };
}

export function runTests(opts = {}) {
  const cwd = path.resolve(opts.project || opts.cwd || process.cwd());
  const logDir = path.join(cwd, ".zero-token");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, "test.log");

  // Detect runner
  let cmd = "dotnet";
  let args = ["test", "--no-restore", "-v:q", "--logger", "console;verbosity=normal"];

  const hasPackageJson = fs.existsSync(path.join(cwd, "package.json"));
  const hasDotnet = fs.readdirSync(cwd).some(f => /\.(sln|csproj|fsproj)$/i.test(f));

  if (hasPackageJson && !hasDotnet) {
    cmd = process.platform === "win32" ? "npm.cmd" : "npm";
    args = ["test", "--", "--silent"];
  }

  if (opts.filter) {
    args.push("--filter", opts.filter);
  }

  try {
    const res = cp.spawnSync(cmd, args, {
      cwd,
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
      stdio: ["pipe", "pipe", "pipe"]
    });

    const raw = (res.stdout || "") + "\n" + (res.stderr || "");
    fs.writeFileSync(logFile, raw, "utf8");

    const compacted = compactTestLog(raw);
    return {
      text: compacted.text,
      passed: compacted.passed,
      exitCode: res.status ?? 0,
      logFile: path.relative(process.cwd(), logFile)
    };
  } catch (err) {
    return {
      text: `Test runner failed to execute: ${err.message}`,
      passed: false,
      exitCode: 1,
      logFile
    };
  }
}
