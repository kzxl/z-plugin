/**
 * Z-Gate Pre-Commit Hook Installer
 * Automatically installs or updates .git/hooks/pre-commit to enforce P0 invariant checks before commits.
 */

import fs from 'node:fs';
import path from 'node:path';

const PRE_COMMIT_SCRIPT = `#!/bin/sh
# Z-Gate Pre-Commit Invariant & Security Blocker
# Enforces R_NEV, R_DB (no SQLi), R_ASYNC (no .Result deadlocks), and Secret Protection.

echo "🛡️ [Z-GATE] Running pre-commit invariant audit on staged changes..."

# Check if node is available
if ! command -v node >/dev/null 2>&1; then
  echo "⚠️ node not found in PATH; skipping z-gate pre-commit audit."
  exit 0
fi

STAGED_DIFF=$(git diff --cached)
if [ -z "$STAGED_DIFF" ]; then
  exit 0
fi

# Run fast in-process check for P0 invariants
node -e '
import cp from "node:child_process";
const diff = cp.execSync("git diff --cached", { encoding: "utf8" });

const p0Checks = [
  { name: "SQL Injection", regex: /(\\bSELECT\\b|\\bINSERT\\b|\\bUPDATE\\b|\\bDELETE\\b).*\\+\\s*[$a-zA-Z0-9_]/i },
  { name: "Hardcoded Secret", regex: /\\b(api_key|secret|password)\\s*[:=]\\s*["\\x27][A-Za-z0-9_\\-\\.]{16,}["\\x27]/i },
  { name: "Sync-over-Async Deadlock (.Result)", regex: /\\.(Result|GetAwaiter\\(\\)\\.GetResult\\(\\)|Wait\\(\\))\\b/ },
  { name: "BindingSource Forbidden (R_WPF)", regex: /\\bBindingSource\\b/i }
];

const failures = [];
for (const line of diff.split(/\\r?\\n/)) {
  if (line.startsWith("+") && !line.startsWith("+++")) {
    for (const check of p0Checks) {
      if (check.regex.test(line)) {
        failures.push({ check: check.name, line: line.trim() });
      }
    }
  }
}

if (failures.length > 0) {
  console.error("\\n❌ [Z-GATE PRE-COMMIT BLOCKED] Found " + failures.length + " critical P0 violation(s):");
  for (const f of failures) {
    console.error("  • [" + f.check + "] " + f.line.slice(0, 100));
  }
  console.error("\\n💡 Fix the issues above before committing or use git commit --no-verify if explicitly intended.\\n");
  process.exit(1);
} else {
  console.log("✅ [Z-GATE] All pre-commit P0 invariant checks passed.");
  process.exit(0);
}
'
`

export function installPreCommitHook(targetDir = process.cwd()) {
  const gitDir = path.join(targetDir, '.git');
  if (!fs.existsSync(gitDir)) {
    return {
      success: false,
      message: `No .git repository found in ${targetDir}`
    };
  }

  const hooksDir = path.join(gitDir, 'hooks');
  fs.mkdirSync(hooksDir, { recursive: true });

  const hookFile = path.join(hooksDir, 'pre-commit');
  fs.writeFileSync(hookFile, PRE_COMMIT_SCRIPT, { encoding: 'utf8', mode: 0o755 });

  return {
    success: true,
    hookPath: hookFile,
    message: `Successfully installed Z-Gate pre-commit blocker at ${path.relative(process.cwd(), hookFile)}`
  };
}
